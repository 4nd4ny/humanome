<?php

declare(strict_types=1);

namespace Humanome\Referentiel;

use Humanome\Validation;
use PDO;

/**
 * competence_versions : chaque COMPÉTENCE est une entité ATOMIQUE, versionnée,
 * gouvernée et concurrente INDÉPENDAMMENT (migration 016, correction
 * d'architecture 2026-07-15). Deux épistémiarques éditant deux compétences
 * différentes ne se bloquent jamais ; sur une MÊME compétence, la concurrence
 * optimiste (compare-and-swap sur content_hash) empêche le lost update.
 *
 * Le nom/pôle sont des colonnes STRUCTURELLES (le corps assemblé d'un snapshot
 * les hache — parité moteur) ; le contenu riche (identite/protocole/
 * enrichissements) vit dans `content` et n'entre QUE dans content_hash (jeton
 * CAS interne PHP, CompetenceHash). PDO nu, requêtes préparées.
 */
final class CompetenceRepository
{
    public const CODE_RE = '/^\d\.\d{2}$/';

    public function __construct(private readonly PDO $pdo)
    {
    }

    // ------------------------------------------------------------------ reads

    public function findById(int $id): ?array
    {
        $stmt = $this->pdo->prepare('SELECT * FROM competence_versions WHERE id = ?');
        $stmt->execute([$id]);
        $row = $stmt->fetch();

        return $row === false ? null : $this->mapRow($row);
    }

    /** Latest published version of one competence (semver precedence), or null. */
    public function latestPublished(string $code): ?array
    {
        $rows = $this->publishedVersions($code);

        return $rows[0] ?? null;
    }

    /** @return list<array<string, mixed>> published versions of one code, newest first */
    public function publishedVersions(string $code): array
    {
        $stmt = $this->pdo->prepare(
            "SELECT * FROM competence_versions WHERE competence_code = ? AND status = 'published'"
        );
        $stmt->execute([$code]);
        $rows = array_map($this->mapRow(...), $stmt->fetchAll());
        usort($rows, static fn (array $a, array $b): int => Semver::compare($b['semver'], $a['semver']));

        return $rows;
    }

    /**
     * Latest published version of EVERY competence, keyed by code (newest each).
     *
     * @return array<string, array<string, mixed>>
     */
    public function latestPublishedByCode(): array
    {
        $rows = array_map(
            $this->mapRow(...),
            $this->pdo->query("SELECT * FROM competence_versions WHERE status = 'published'")->fetchAll(),
        );
        $byCode = [];
        foreach ($rows as $row) {
            $code = $row['code'];
            if (!isset($byCode[$code]) || Semver::greaterThan($row['semver'], $byCode[$code]['semver'])) {
                $byCode[$code] = $row;
            }
        }
        ksort($byCode);

        return $byCode;
    }

    /**
     * Editable versions (drafts + proposals under vote) across all competences,
     * newest first — the workbench list.
     *
     * @return list<array<string, mixed>>
     */
    public function editableVersions(): array
    {
        return array_map(
            $this->mapRow(...),
            $this->pdo->query(
                "SELECT * FROM competence_versions WHERE status IN ('draft','review') ORDER BY id DESC"
            )->fetchAll(),
        );
    }

    // ----------------------------------------------------------------- import

    /**
     * Idempotent seed of an already-published competence version (bootstrap from
     * the YAML corpus). Same (code, semver) with the same content_hash is a
     * no-op; a different hash on an existing published version is a conflict.
     *
     * @param array<string, mixed> $content rich content {identite, protocole, ...}
     * @return array{status:'imported'|'unchanged', id:int, code:string, semver:string}
     */
    public function importPublishedCompetence(
        string $code,
        string $nom,
        int $pole,
        array $content,
        string $semver = '1.0.0',
        ?string $releaseNote = null,
    ): array {
        $this->validateContent($code, $content);
        $hash = CompetenceHash::compute($content);

        $stmt = $this->pdo->prepare(
            'SELECT id, status, content_hash FROM competence_versions WHERE competence_code = ? AND semver = ?'
        );
        $stmt->execute([$code, $semver]);
        $existing = $stmt->fetch();
        if ($existing !== false) {
            if ($existing['content_hash'] === $hash && $existing['status'] === 'published') {
                return ['status' => 'unchanged', 'id' => (int) $existing['id'], 'code' => $code, 'semver' => $semver];
            }
            throw new ConflictException(sprintf(
                'Competence %s@%s already exists with status "%s" and a different content (published versions are immutable)',
                $code,
                $semver,
                $existing['status'],
            ));
        }

        $insert = $this->pdo->prepare(
            'INSERT INTO competence_versions
                (competence_code, semver, pole, nom, status, content, content_hash, release_note, published_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())'
        );
        $insert->execute([
            $code, $semver, $pole, $nom, 'published',
            CompetenceHash::encode(CompetenceHash::canonical($content)),
            $hash, $releaseNote,
        ]);

        return ['status' => 'imported', 'id' => (int) $this->pdo->lastInsertId(), 'code' => $code, 'semver' => $semver];
    }

    // ----------------------------------------------------------------- drafts

    /**
     * New draft of ONE competence, forked from its latest published version.
     *
     * @return array<string, mixed>|null null when the competence code is unknown
     */
    public function createDraft(string $code, string $newSemver, ?int $createdBy = null): ?array
    {
        if (!Semver::isValid($newSemver)) {
            throw new InvalidDocumentException(
                sprintf('"%s" is not a valid semver version', $newSemver),
                ['/semver' => ['Version semver invalide']],
            );
        }
        $source = $this->latestPublished($code);
        if ($source === null) {
            return null;
        }
        $stmt = $this->pdo->prepare('SELECT id FROM competence_versions WHERE competence_code = ? AND semver = ?');
        $stmt->execute([$code, $newSemver]);
        if ($stmt->fetch() !== false) {
            throw new ConflictException(sprintf('Competence %s@%s already exists', $code, $newSemver));
        }

        $content = $source['content'];
        $insert = $this->pdo->prepare(
            'INSERT INTO competence_versions
                (competence_code, semver, pole, nom, status, content, content_hash, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        );
        $insert->execute([
            $code, $newSemver, $source['pole'], $source['nom'], 'draft',
            CompetenceHash::encode(CompetenceHash::canonical($content)),
            CompetenceHash::compute($content), $createdBy,
        ]);

        return $this->findById((int) $this->pdo->lastInsertId());
    }

    /**
     * Replace a draft's rich content — optimistic concurrency (compare-and-swap
     * on content_hash). The precondition lives in the UPDATE's WHERE so it is
     * atomic (InnoDB row lock), closing the read-modify-write lost-update window
     * WITHOUT a transaction. A stale/absent expectedHash → ConflictException.
     * The structural `nom` tracks content.identite.nom (a rename moves the
     * structural hash — visible only once a new release snapshot is cut).
     *
     * @param array<string, mixed> $content full rich content
     * @param string|null $expectedHash the content_hash the client loaded (If-Match)
     * @return array<string, mixed>|null null when the draft is unknown
     */
    public function updateDraft(int $id, array $content, ?string $expectedHash): ?array
    {
        $row = $this->findById($id);
        if ($row === null) {
            return null;
        }
        if ($row['status'] === 'published') {
            throw new ConflictException('Published competence versions are immutable: create a new draft instead');
        }
        if ($row['status'] === 'review') {
            throw new ConflictException('This proposal is open for a vote: withdraw it before editing.');
        }
        if ($expectedHash === null || $expectedHash === '') {
            throw new ConflictException('Précondition requise (If-Match) : rechargez la compétence avant d\'enregistrer.');
        }
        $this->validateContent($row['code'], $content);

        $nom = (string) $content['identite']['nom'];
        $newHash = CompetenceHash::compute($content);
        $update = $this->pdo->prepare(
            "UPDATE competence_versions
                SET nom = ?, content = ?, content_hash = ?
              WHERE id = ? AND status = 'draft' AND content_hash = ?"
        );
        $update->execute([
            $nom,
            CompetenceHash::encode(CompetenceHash::canonical($content)),
            $newHash,
            $id,
            $expectedHash,
        ]);

        if ($update->rowCount() === 0) {
            // MySQL rowCount = CHANGED rows: distinguish a real conflict from an
            // idempotent no-op (identical content re-saved) by re-reading.
            $fresh = $this->findById($id);
            if ($fresh === null) {
                return null;
            }
            if ($fresh['status'] !== 'draft' || $fresh['contentHash'] !== $expectedHash) {
                throw new ConflictException(
                    'Cette compétence a été modifiée par un autre épistémiarque ; rechargez avant d\'enregistrer.'
                );
            }
            // hash courant == attendu, 0 ligne changée => re-save identique (no-op)
        }

        return $this->findById($id);
    }

    /**
     * Publish an adopted competence proposal: majority reached + semver strictly
     * greater than the latest published version of THIS competence, then immutable.
     *
     * @return array<string, mixed>|null null when the draft is unknown
     */
    public function publish(int $id, ?string $releaseNote = null): ?array
    {
        $this->pdo->beginTransaction();
        try {
            $stmt = $this->pdo->prepare('SELECT * FROM competence_versions WHERE id = ? FOR UPDATE');
            $stmt->execute([$id]);
            $raw = $stmt->fetch();
            if ($raw === false) {
                $this->pdo->rollBack();

                return null;
            }
            $row = $this->mapRow($raw);
            if ($row['status'] === 'published') {
                throw new ConflictException('This competence version is already published (immutable)');
            }
            if ($row['status'] !== 'review') {
                throw new ConflictException('A competence proposal must be submitted for a vote before it can be published.');
            }
            $tally = (new CompetenceGovernance($this->pdo))->tally($id);
            if (!$tally['reached']) {
                throw new ConflictException(MajorityMessage::forTally($tally));
            }

            foreach ($this->publishedVersions($row['code']) as $published) {
                if (!Semver::greaterThan($row['semver'], $published['semver'])) {
                    throw new ConflictException(sprintf(
                        'Semver must be strictly increasing: %s is not greater than published %s (competence %s)',
                        $row['semver'],
                        $published['semver'],
                        $row['code'],
                    ));
                }
            }

            $update = $this->pdo->prepare(
                "UPDATE competence_versions
                    SET status = 'published', release_note = ?, published_at = NOW()
                  WHERE id = ?"
            );
            $update->execute([$releaseNote, $id]);
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
     * Validate rich content against schemas/competence.schema.json and enforce
     * the identity: content.identite.code MUST match the competence code.
     *
     * @param array<string, mixed> $content
     */
    public function validateContent(string $code, array $content): void
    {
        $result = Validation::validate('competence', $content);
        if (!$result['valid']) {
            throw new InvalidDocumentException(
                'La compétence ne se conforme pas au schéma competence',
                $result['errors'],
            );
        }
        $contentCode = $content['identite']['code'] ?? null;
        if ($contentCode !== $code) {
            throw new InvalidDocumentException(
                sprintf('Le code du contenu "%s" ne correspond pas à la compétence "%s"', (string) $contentCode, $code),
                ['/identite/code' => ['Le code de la compétence ne peut pas changer']],
            );
        }
    }

    /**
     * @param array<string, mixed> $row
     * @return array<string, mixed>
     */
    private function mapRow(array $row): array
    {
        return [
            'id' => (int) $row['id'],
            'code' => $row['competence_code'],
            'semver' => $row['semver'],
            'pole' => (int) $row['pole'],
            'nom' => $row['nom'],
            'status' => $row['status'],
            'contentHash' => $row['content_hash'],
            'releaseNote' => $row['release_note'],
            'createdAt' => $row['created_at'],
            'publishedAt' => $row['published_at'],
            'submittedAt' => $row['submitted_at'] ?? null,
            'submittedBy' => isset($row['submitted_by']) && $row['submitted_by'] !== null ? (int) $row['submitted_by'] : null,
            'decidimUrl' => $row['decidim_url'] ?? null,
            'content' => json_decode((string) $row['content'], true, 512, JSON_THROW_ON_ERROR),
        ];
    }

    /**
     * @param array<string, mixed> $version as returned by mapRow
     * @return array<string, mixed> metadata only (no content)
     */
    public static function metadata(array $version): array
    {
        return [
            'id' => $version['id'] ?? null,
            'code' => $version['code'],
            'semver' => $version['semver'],
            'pole' => $version['pole'],
            'nom' => $version['nom'],
            'status' => $version['status'],
            'contentHash' => $version['contentHash'],
            'releaseNote' => $version['releaseNote'],
            'publishedAt' => $version['publishedAt'],
            'submittedAt' => $version['submittedAt'] ?? null,
            'decidimUrl' => $version['decidimUrl'] ?? null,
        ];
    }
}
