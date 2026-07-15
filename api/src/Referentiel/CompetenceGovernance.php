<?php

declare(strict_types=1);

namespace Humanome\Referentiel;

use PDO;

/**
 * Gouvernance PAR COMPÉTENCE (cahier §3.5, correction d'architecture) : une
 * proposition cible UNE compétence ; elle est entérinée à la MAJORITÉ des
 * membres épistémiarques. Une compétence peut être adoptée pendant qu'une
 * autre reste en débat — l'unité de gouvernance est la version de compétence.
 *
 * Parallèle à ReferentielGovernance mais sur competence_votes /
 * competence_versions ; réutilise les helpers partagés Electorate + MajorityTally
 * (même corps électoral, même règle de majorité floor(N/2)+1).
 */
final class CompetenceGovernance
{
    public const VOTES = ['pour', 'contre', 'abstention'];

    public function __construct(private readonly PDO $pdo)
    {
    }

    /**
     * Décompte d'une proposition de compétence contre l'électorat COURANT.
     *
     * @return array{electorateSize:int, threshold:int|null, pour:int, contre:int,
     *     abstention:int, notVoted:int, outcome:string, reached:bool}
     */
    public function tally(int $competenceVersionId): array
    {
        $electorate = Electorate::ids($this->pdo);
        $counts = ['pour' => 0, 'contre' => 0, 'abstention' => 0];
        if ($electorate !== []) {
            $members = array_fill_keys($electorate, true);
            $stmt = $this->pdo->prepare('SELECT user_id, vote FROM competence_votes WHERE competence_version_id = ?');
            $stmt->execute([$competenceVersionId]);
            foreach ($stmt->fetchAll() as $row) {
                if (isset($members[(int) $row['user_id']], $counts[$row['vote']])) {
                    $counts[$row['vote']]++;
                }
            }
        }

        return MajorityTally::compute(\count($electorate), $counts);
    }

    /**
     * @return list<array{userId:int, displayName:string, vote:string, comment:string|null, updatedAt:string}>
     */
    public function votes(int $competenceVersionId): array
    {
        $stmt = $this->pdo->prepare(
            "SELECT v.user_id, v.vote, v.comment, v.updated_at, u.display_name
             FROM competence_votes v
             JOIN user_roles ur ON ur.user_id = v.user_id
             JOIN roles r ON r.id = ur.role_id AND r.name = 'epistemiarque'
             JOIN users u ON u.id = v.user_id AND u.deleted_at IS NULL
             WHERE v.competence_version_id = ?
             ORDER BY v.updated_at ASC"
        );
        $stmt->execute([$competenceVersionId]);

        return array_map(static fn (array $row): array => [
            'userId' => (int) $row['user_id'],
            'displayName' => (string) $row['display_name'],
            'vote' => (string) $row['vote'],
            'comment' => $row['comment'] !== null ? (string) $row['comment'] : null,
            'updatedAt' => (string) $row['updated_at'],
        ], $stmt->fetchAll());
    }

    /**
     * Open a vote on a competence draft: draft -> review (content frozen).
     * The semver is checked here so a stale proposal can't open a vote.
     *
     * @return array<string, mixed>|null updated version, or null if unknown
     */
    public function submit(int $id, ?string $decidimUrl, ?int $submittedBy): ?array
    {
        $repo = new CompetenceRepository($this->pdo);
        $row = $repo->findById($id);
        if ($row === null) {
            return null;
        }
        if ($row['status'] === 'published') {
            throw new ConflictException('Cette version de compétence est déjà publiée.');
        }
        if ($row['status'] === 'review') {
            throw new ConflictException('Cette proposition est déjà ouverte au vote.');
        }
        $repo->validateContent($row['code'], $row['content']);
        foreach ($repo->publishedVersions($row['code']) as $published) {
            if (!Semver::greaterThan($row['semver'], $published['semver'])) {
                throw new ConflictException(sprintf(
                    'Semver must be strictly increasing: %s is not greater than published %s (competence %s)',
                    $row['semver'],
                    $published['semver'],
                    $row['code'],
                ));
            }
        }
        $url = DecidimLink::normalize($decidimUrl);

        $this->pdo->beginTransaction();
        try {
            $this->pdo->prepare('DELETE FROM competence_votes WHERE competence_version_id = ?')->execute([$id]);
            $this->pdo->prepare(
                "UPDATE competence_versions
                 SET status = 'review', submitted_at = NOW(), submitted_by = ?, decidim_url = ?
                 WHERE id = ?"
            )->execute([$submittedBy, $url, $id]);
            $this->pdo->commit();
        } catch (\Throwable $e) {
            if ($this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }
            throw $e;
        }

        return $repo->findById($id);
    }

    /** Close a vote and reopen editing: review -> draft (ballots wiped). */
    public function withdraw(int $id): ?array
    {
        $repo = new CompetenceRepository($this->pdo);
        $row = $repo->findById($id);
        if ($row === null) {
            return null;
        }
        if ($row['status'] !== 'review') {
            throw new ConflictException('Seule une proposition ouverte au vote peut être retirée.');
        }

        $this->pdo->beginTransaction();
        try {
            $this->pdo->prepare('DELETE FROM competence_votes WHERE competence_version_id = ?')->execute([$id]);
            $this->pdo->prepare(
                "UPDATE competence_versions
                 SET status = 'draft', submitted_at = NULL, submitted_by = NULL, decidim_url = NULL
                 WHERE id = ?"
            )->execute([$id]);
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
     * Cast (or change) a member's ballot. One ballot per member (upsert), only
     * while the competence proposal is under vote.
     *
     * @return array<string, mixed>|null fresh tally, or null if unknown version
     */
    public function castVote(int $competenceVersionId, int $userId, string $vote, ?string $comment): ?array
    {
        if (!\in_array($vote, self::VOTES, true)) {
            throw new InvalidDocumentException(
                sprintf('Invalid vote "%s": expected one of %s', $vote, implode(', ', self::VOTES)),
                ['/vote' => ['Vote invalide']],
            );
        }
        $repo = new CompetenceRepository($this->pdo);
        $row = $repo->findById($competenceVersionId);
        if ($row === null) {
            return null;
        }
        if ($row['status'] !== 'review') {
            throw new ConflictException('Le vote n\'est ouvert que sur une proposition soumise au vote.');
        }
        $normalizedComment = $comment !== null && trim($comment) !== '' ? trim($comment) : null;
        $this->pdo->prepare(
            'INSERT INTO competence_votes (competence_version_id, user_id, vote, comment)
             VALUES (?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE vote = VALUES(vote), comment = VALUES(comment)'
        )->execute([$competenceVersionId, $userId, $vote, $normalizedComment]);

        return $this->tally($competenceVersionId);
    }
}
