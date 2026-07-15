<?php

declare(strict_types=1);

namespace Humanome\Referentiel;

use PDO;

/**
 * Collaborative governance of the referentiel (cahier §3.5): an épistémiarque
 * edit is a DRAFT; submitting it opens a vote (status 'review'); it is
 * ENTÉRINÉE (published) only once a MAJORITY of the current épistémiarque
 * members has approved it. Decidim threads back the discussion in case of doubt.
 *
 * "Majority of the members" (not of the voters): the threshold is
 * floor(N/2)+1 of every user currently holding the epistemiarque role, so
 * abstentions and non-voters make passage harder — a deliberate design choice
 * matching "validées par la majorité des membres épistémiarques".
 *
 * The electorate is recomputed on every read against the LIVE role table: a
 * member who loses the role (or is purged) stops counting immediately, and a
 * ballot cast by a since-removed member is excluded from the tally.
 */
final class ReferentielGovernance
{
    /** @var list<string> Ballot values accepted from a member. */
    public const VOTES = ['pour', 'contre', 'abstention'];

    public function __construct(private readonly PDO $pdo)
    {
    }

    // ------------------------------------------------------------- electorate

    /**
     * Ids of the users who currently hold the epistemiarque role (not deleted).
     * These, and only these, form the electorate for referentiel proposals.
     *
     * @return list<int>
     */
    public function electorateIds(): array
    {
        return Electorate::ids($this->pdo);
    }

    public function electorateSize(): int
    {
        return Electorate::size($this->pdo);
    }

    /**
     * Tally of a proposal against the CURRENT electorate.
     *
     * outcome: 'adopted' once "pour" reaches the majority threshold,
     * 'rejected' once "contre" reaches it (majority-contre makes a majority-pour
     * arithmetically impossible), 'pending' otherwise, 'blocked' when there is
     * no electorate at all (no épistémiarque member can validate anything).
     *
     * @return array{
     *     electorateSize:int, threshold:int|null,
     *     pour:int, contre:int, abstention:int, notVoted:int,
     *     outcome:'adopted'|'rejected'|'pending'|'blocked', reached:bool
     * }
     */
    public function tally(int $versionId): array
    {
        $electorate = $this->electorateIds();
        $size = \count($electorate);
        $counts = ['pour' => 0, 'contre' => 0, 'abstention' => 0];

        if ($size > 0) {
            $members = array_fill_keys($electorate, true);
            $stmt = $this->pdo->prepare(
                'SELECT user_id, vote FROM referentiel_votes WHERE version_id = ?'
            );
            $stmt->execute([$versionId]);
            foreach ($stmt->fetchAll() as $row) {
                // Only ballots from current members count.
                if (isset($members[(int) $row['user_id']]) && isset($counts[$row['vote']])) {
                    $counts[$row['vote']]++;
                }
            }
        }

        return MajorityTally::compute($size, $counts);
    }

    /**
     * Ballots on a proposal, restricted to current members, with voter names.
     *
     * @return list<array{userId:int, displayName:string, vote:string,
     *                     comment:string|null, updatedAt:string}>
     */
    public function votes(int $versionId): array
    {
        $stmt = $this->pdo->prepare(
            "SELECT v.user_id, v.vote, v.comment, v.updated_at, u.display_name
             FROM referentiel_votes v
             JOIN user_roles ur ON ur.user_id = v.user_id
             JOIN roles r ON r.id = ur.role_id AND r.name = 'epistemiarque'
             JOIN users u ON u.id = v.user_id AND u.deleted_at IS NULL
             WHERE v.version_id = ?
             ORDER BY v.updated_at ASC"
        );
        $stmt->execute([$versionId]);

        return array_map(static fn (array $row): array => [
            'userId' => (int) $row['user_id'],
            'displayName' => (string) $row['display_name'],
            'vote' => (string) $row['vote'],
            'comment' => $row['comment'] !== null ? (string) $row['comment'] : null,
            'updatedAt' => (string) $row['updated_at'],
        ], $stmt->fetchAll());
    }

    // ------------------------------------------------------------- lifecycle

    /**
     * Open a vote on a draft: draft -> review. The proposal content is frozen
     * (updateDraft refuses a review row) so members vote on a fixed document.
     * The semver is checked here too, so a stale proposal can't even be opened.
     *
     * @return array<string, mixed>|null the updated version, or null if unknown
     */
    public function submit(int $id, ?string $decidimUrl, ?int $submittedBy): ?array
    {
        $repo = new ReferentielRepository($this->pdo);
        $row = $repo->findById($id);
        if ($row === null) {
            return null;
        }
        if ($row['status'] === 'published') {
            throw new ConflictException('This version is already published — nothing to submit.');
        }
        if ($row['status'] === 'review') {
            throw new ConflictException('This proposal is already open for a vote.');
        }

        // Re-validate the content and the semver rule before opening the vote.
        $repo->validateDocument($row['content']);
        foreach ($repo->publishedVersions($row['referentielId']) as $published) {
            if (!Semver::greaterThan($row['semver'], $published['semver'])) {
                throw new ConflictException(sprintf(
                    'Semver must be strictly increasing: %s is not greater than published %s',
                    $row['semver'],
                    $published['semver'],
                ));
            }
        }

        $url = DecidimLink::normalize($decidimUrl);

        $this->pdo->beginTransaction();
        try {
            // Fresh vote round: drop any ballots left over from a previous one.
            $del = $this->pdo->prepare('DELETE FROM referentiel_votes WHERE version_id = ?');
            $del->execute([$id]);

            $update = $this->pdo->prepare(
                "UPDATE referentiel_versions
                 SET status = 'review', submitted_at = NOW(), submitted_by = ?, decidim_url = ?
                 WHERE id = ?"
            );
            $update->execute([$submittedBy, $url, $id]);
            $this->pdo->commit();
        } catch (\Throwable $e) {
            if ($this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }
            throw $e;
        }

        return $repo->findById($id);
    }

    /**
     * Close a vote and reopen editing: review -> draft. Every ballot is wiped
     * (the next submission starts a clean round).
     *
     * @return array<string, mixed>|null the updated version, or null if unknown
     */
    public function withdraw(int $id): ?array
    {
        $repo = new ReferentielRepository($this->pdo);
        $row = $repo->findById($id);
        if ($row === null) {
            return null;
        }
        if ($row['status'] !== 'review') {
            throw new ConflictException('Only a proposal currently open for a vote can be withdrawn.');
        }

        $this->pdo->beginTransaction();
        try {
            $del = $this->pdo->prepare('DELETE FROM referentiel_votes WHERE version_id = ?');
            $del->execute([$id]);
            $update = $this->pdo->prepare(
                "UPDATE referentiel_versions
                 SET status = 'draft', submitted_at = NULL, submitted_by = NULL, decidim_url = NULL
                 WHERE id = ?"
            );
            $update->execute([$id]);
            $this->pdo->commit();
        } catch (\Throwable $e) {
            if ($this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }
            throw $e;
        }

        return $repo->findById($id);
    }

    /**
     * Cast (or change) a member's ballot on a proposal open for a vote.
     * One ballot per member (upsert). Voting is only possible while the
     * proposal is in 'review'.
     *
     * @return array<string, mixed>|null the fresh tally, or null if unknown version
     */
    public function castVote(int $versionId, int $userId, string $vote, ?string $comment): ?array
    {
        if (!\in_array($vote, self::VOTES, true)) {
            throw new InvalidDocumentException(
                sprintf('Invalid vote "%s": expected one of %s', $vote, implode(', ', self::VOTES)),
                ['/vote' => ['Vote invalide']],
            );
        }

        $repo = new ReferentielRepository($this->pdo);
        $row = $repo->findById($versionId);
        if ($row === null) {
            return null;
        }
        if ($row['status'] !== 'review') {
            throw new ConflictException('Voting is only open on a proposal submitted for a vote.');
        }

        $normalizedComment = $comment !== null && trim($comment) !== '' ? trim($comment) : null;
        $stmt = $this->pdo->prepare(
            'INSERT INTO referentiel_votes (version_id, user_id, vote, comment)
             VALUES (?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE vote = VALUES(vote), comment = VALUES(comment)'
        );
        $stmt->execute([$versionId, $userId, $vote, $normalizedComment]);

        return $this->tally($versionId);
    }
}
