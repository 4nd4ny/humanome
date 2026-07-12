<?php

declare(strict_types=1);

namespace Humanome\Referentiel;

use Humanome\Validation;
use PDO;

/**
 * referentiel_versions access + business invariants (cahier §4.1, P4):
 * published versions are IMMUTABLE, publication requires a STRICTLY
 * increasing semver, every write re-validates against the JSON Schema.
 * Plain PDO, prepared statements — no ORM.
 */
final class ReferentielRepository
{
    public const DEFAULT_REFERENTIEL_ID = 'respire';

    public function __construct(private readonly PDO $pdo)
    {
    }

    // ------------------------------------------------------------------ reads

    /** Latest published version (semver precedence), or null. */
    public function latestPublished(string $referentielId): ?array
    {
        $versions = $this->publishedVersions($referentielId);

        return $versions[0] ?? null;
    }

    /**
     * Published versions, newest first (semver precedence), content included.
     *
     * @return list<array<string, mixed>>
     */
    public function publishedVersions(string $referentielId): array
    {
        $stmt = $this->pdo->prepare(
            'SELECT * FROM referentiel_versions WHERE referentiel_id = ? AND status = ?'
        );
        $stmt->execute([$referentielId, 'published']);
        $rows = array_map($this->mapRow(...), $stmt->fetchAll());
        usort($rows, static fn (array $a, array $b): int => Semver::compare($b['semver'], $a['semver']));

        return $rows;
    }

    public function findPublished(string $referentielId, string $semver): ?array
    {
        $stmt = $this->pdo->prepare(
            'SELECT * FROM referentiel_versions
             WHERE referentiel_id = ? AND semver = ? AND status = ?'
        );
        $stmt->execute([$referentielId, $semver, 'published']);
        $row = $stmt->fetch();

        return $row === false ? null : $this->mapRow($row);
    }

    public function findById(int $id): ?array
    {
        $stmt = $this->pdo->prepare('SELECT * FROM referentiel_versions WHERE id = ?');
        $stmt->execute([$id]);
        $row = $stmt->fetch();

        return $row === false ? null : $this->mapRow($row);
    }

    // ----------------------------------------------------------------- import

    /**
     * Import an already-published document (initial RESPIRE v7 load).
     * Idempotent: same (id, version) with the same content hash is a no-op;
     * a different hash for an existing version is a conflict (immutability).
     *
     * @param array<string, mixed> $doc validated by the caller or here
     * @return array{status: 'imported'|'unchanged', id: int, semver: string, contentHash: string}
     */
    public function importPublishedDocument(array $doc, string $releaseNote, ?int $createdBy = null): array
    {
        $normalized = $this->validateDocument($doc);

        $declared = $doc['contentHash'] ?? null;
        if ($declared !== $normalized['contentHash']) {
            throw new ConflictException(sprintf(
                'contentHash mismatch: document declares %s but canonical content hashes to %s',
                \is_string($declared) ? $declared : '(missing)',
                $normalized['contentHash'],
            ));
        }

        $referentielId = $normalized['id'];
        $semver = $normalized['version'];
        $stmt = $this->pdo->prepare(
            'SELECT id, status, content_hash FROM referentiel_versions WHERE referentiel_id = ? AND semver = ?'
        );
        $stmt->execute([$referentielId, $semver]);
        $existing = $stmt->fetch();

        if ($existing !== false) {
            if ($existing['content_hash'] === $normalized['contentHash'] && $existing['status'] === 'published') {
                return [
                    'status' => 'unchanged',
                    'id' => (int) $existing['id'],
                    'semver' => $semver,
                    'contentHash' => $normalized['contentHash'],
                ];
            }
            throw new ConflictException(sprintf(
                'Version %s of referentiel "%s" already exists with status "%s" and a different content (published versions are immutable)',
                $semver,
                $referentielId,
                $existing['status'],
            ));
        }

        $insert = $this->pdo->prepare(
            'INSERT INTO referentiel_versions
                (referentiel_id, semver, label, status, content, content_hash, release_note, created_by, published_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())'
        );
        $insert->execute([
            $referentielId,
            $semver,
            $normalized['label'],
            'published',
            ContentHash::encode($normalized),
            $normalized['contentHash'],
            $releaseNote,
            $createdBy,
        ]);

        return [
            'status' => 'imported',
            'id' => (int) $this->pdo->lastInsertId(),
            'semver' => $semver,
            'contentHash' => $normalized['contentHash'],
        ];
    }

    // ----------------------------------------------------------------- drafts

    /**
     * New draft forked from an existing version (any status).
     *
     * @return array<string, mixed>|null null when the source version is unknown
     */
    public function createDraft(
        string $referentielId,
        string $fromSemver,
        string $newSemver,
        ?string $label = null,
        ?int $createdBy = null,
    ): ?array {
        if (!Semver::isValid($newSemver)) {
            throw new InvalidDocumentException(
                sprintf('"%s" is not a valid semver version', $newSemver),
                ['/semver' => ['Version semver invalide']],
            );
        }

        $stmt = $this->pdo->prepare(
            'SELECT * FROM referentiel_versions WHERE referentiel_id = ? AND semver = ?'
        );
        $stmt->execute([$referentielId, $fromSemver]);
        $source = $stmt->fetch();
        if ($source === false) {
            return null;
        }

        $stmt->execute([$referentielId, $newSemver]);
        if ($stmt->fetch() !== false) {
            throw new ConflictException(sprintf(
                'Version %s of referentiel "%s" already exists',
                $newSemver,
                $referentielId,
            ));
        }

        $content = json_decode((string) $source['content'], true, 512, JSON_THROW_ON_ERROR);
        $content['version'] = $newSemver;
        if ($label !== null && $label !== '') {
            $content['label'] = $label;
        }
        $normalized = $this->validateDocument($content);

        $insert = $this->pdo->prepare(
            'INSERT INTO referentiel_versions
                (referentiel_id, semver, label, status, content, content_hash, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?)'
        );
        $insert->execute([
            $referentielId,
            $newSemver,
            $normalized['label'],
            'draft',
            ContentHash::encode($normalized),
            $normalized['contentHash'],
            $createdBy,
        ]);

        return $this->findById((int) $this->pdo->lastInsertId());
    }

    /**
     * Replace a draft's content. Schema re-validation on EVERY write; a
     * published version is immutable (conflict).
     *
     * @param array<string, mixed> $content full referentiel document
     * @return array<string, mixed>|null null when the draft is unknown
     */
    public function updateDraft(int $id, array $content): ?array
    {
        $row = $this->findById($id);
        if ($row === null) {
            return null;
        }
        if ($row['status'] === 'published') {
            throw new ConflictException(
                'Published versions are immutable: create a new draft instead'
            );
        }

        $normalized = $this->validateDocument($content);

        if ($normalized['id'] !== $row['referentielId']) {
            throw new InvalidDocumentException(
                sprintf('Document id "%s" does not match referentiel "%s"', $normalized['id'], $row['referentielId']),
                ['/id' => ['L\'identifiant du référentiel ne peut pas changer']],
            );
        }

        $newSemver = $normalized['version'];
        if ($newSemver !== $row['semver']) {
            $stmt = $this->pdo->prepare(
                'SELECT id FROM referentiel_versions WHERE referentiel_id = ? AND semver = ? AND id <> ?'
            );
            $stmt->execute([$row['referentielId'], $newSemver, $id]);
            if ($stmt->fetch() !== false) {
                throw new ConflictException(sprintf(
                    'Version %s of referentiel "%s" already exists',
                    $newSemver,
                    $row['referentielId'],
                ));
            }
        }

        $update = $this->pdo->prepare(
            'UPDATE referentiel_versions
             SET semver = ?, label = ?, content = ?, content_hash = ?
             WHERE id = ?'
        );
        $update->execute([
            $newSemver,
            $normalized['label'],
            ContentHash::encode($normalized),
            $normalized['contentHash'],
            $id,
        ]);

        return $this->findById($id);
    }

    /**
     * Publish a draft: semver STRICTLY greater than the latest published
     * version of the referentiel, content hash recomputed, then immutable.
     *
     * @return array<string, mixed>|null null when the draft is unknown
     */
    public function publish(int $id, ?string $releaseNote = null): ?array
    {
        $this->pdo->beginTransaction();
        try {
            $stmt = $this->pdo->prepare('SELECT * FROM referentiel_versions WHERE id = ? FOR UPDATE');
            $stmt->execute([$id]);
            $raw = $stmt->fetch();
            if ($raw === false) {
                $this->pdo->rollBack();

                return null;
            }
            $row = $this->mapRow($raw);
            if ($row['status'] === 'published') {
                throw new ConflictException('This version is already published (published versions are immutable)');
            }

            $normalized = $this->validateDocument($row['content']);

            $published = $this->pdo->prepare(
                'SELECT semver FROM referentiel_versions
                 WHERE referentiel_id = ? AND status = ? FOR UPDATE'
            );
            $published->execute([$row['referentielId'], 'published']);
            foreach ($published->fetchAll(PDO::FETCH_COLUMN) as $existingSemver) {
                if (!Semver::greaterThan($row['semver'], (string) $existingSemver)) {
                    throw new ConflictException(sprintf(
                        'Semver must be strictly increasing: %s is not greater than published %s',
                        $row['semver'],
                        $existingSemver,
                    ));
                }
            }

            $update = $this->pdo->prepare(
                'UPDATE referentiel_versions
                 SET status = ?, content = ?, content_hash = ?, release_note = ?, published_at = NOW()
                 WHERE id = ?'
            );
            $update->execute([
                'published',
                ContentHash::encode($normalized),
                $normalized['contentHash'],
                $releaseNote,
                $id,
            ]);
            $this->pdo->commit();
        } catch (\Throwable $e) {
            if ($this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }
            throw $e;
        }

        return $this->findById($id);
    }

    // ---------------------------------------------------------------- helpers

    /**
     * Normalize then validate a document: JSON Schema (schemas/referentiel)
     * + integrity checks the schema cannot express (unique pole nums, unique
     * competence codes, competence.pole referencing an existing pole).
     *
     * @param array<string, mixed> $doc
     * @return array<string, mixed> normalized document (canonical order + recomputed contentHash)
     */
    public function validateDocument(array $doc): array
    {
        try {
            $normalized = ContentHash::normalize($doc);
        } catch (\InvalidArgumentException) {
            // Not even hashable: let the schema report precise errors.
            $result = Validation::validate('referentiel', $doc);
            throw new InvalidDocumentException(
                'Document does not conform to the referentiel schema',
                $result['errors'] !== [] ? $result['errors'] : ['/' => ['Document malformé']],
            );
        }

        $result = Validation::validate('referentiel', $normalized);
        if (!$result['valid']) {
            throw new InvalidDocumentException(
                'Document does not conform to the referentiel schema',
                $result['errors'],
            );
        }

        $errors = [];
        $poleNums = [];
        foreach ($normalized['poles'] as $i => $pole) {
            if (isset($poleNums[$pole['num']])) {
                $errors["/poles/{$i}/num"][] = sprintf('Numéro de pôle dupliqué : %d', $pole['num']);
            }
            $poleNums[$pole['num']] = true;
        }
        $codes = [];
        foreach ($normalized['competences'] as $i => $competence) {
            if (isset($codes[$competence['code']])) {
                $errors["/competences/{$i}/code"][] = sprintf('Code de compétence dupliqué : %s', $competence['code']);
            }
            $codes[$competence['code']] = true;
            if (!isset($poleNums[$competence['pole']])) {
                $errors["/competences/{$i}/pole"][] = sprintf(
                    'La compétence %s référence un pôle inexistant (%d)',
                    $competence['code'],
                    $competence['pole'],
                );
            }
        }
        if ($errors !== []) {
            throw new InvalidDocumentException('Document fails referentiel integrity checks', $errors);
        }

        return $normalized;
    }

    /**
     * @param array<string, mixed> $row
     * @return array<string, mixed> camelCase metadata + decoded, re-normalized content
     */
    private function mapRow(array $row): array
    {
        $content = json_decode((string) $row['content'], true, 512, JSON_THROW_ON_ERROR);
        try {
            // MySQL JSON columns reorder object keys: restore canonical order.
            $content = ContentHash::normalize($content);
        } catch (\InvalidArgumentException) {
            // Keep raw content readable even if a legacy row is malformed.
        }

        return [
            'id' => (int) $row['id'],
            'referentielId' => $row['referentiel_id'],
            'semver' => $row['semver'],
            'label' => $row['label'],
            'status' => $row['status'],
            'contentHash' => $row['content_hash'],
            'releaseNote' => $row['release_note'],
            'createdAt' => $row['created_at'],
            'publishedAt' => $row['published_at'],
            'content' => $content,
        ];
    }

    /**
     * @param array<string, mixed> $version as returned by mapRow
     * @return array<string, mixed> metadata only (no content — list endpoints)
     */
    public static function metadata(array $version): array
    {
        return [
            'referentielId' => $version['referentielId'],
            'semver' => $version['semver'],
            'label' => $version['label'],
            'status' => $version['status'],
            'contentHash' => $version['contentHash'],
            'releaseNote' => $version['releaseNote'],
            'publishedAt' => $version['publishedAt'],
        ];
    }
}
