<?php

declare(strict_types=1);

namespace Humanome\Packages;

use Humanome\Referentiel\Semver;
use Humanome\Validation;
use PDO;

/**
 * Prompt packages (P8 + P10): published, immutable versions served to the run
 * launcher, plus the promptologue draft lifecycle (P10, cahier §3.4):
 * draft forked from an existing version -> edited (schema re-validated on
 * every write) -> published with a STRICTLY increasing semver per package id,
 * immutable afterwards. Same invariants as ReferentielRepository (P4).
 *
 * Ownership: a draft belongs to its author (prompt_versions.created_by) —
 * "un brouillon ne tourne que chez son auteur" (plan P10). Every draft lookup
 * is scoped by owner and answers null for a foreign or unknown id (the routes
 * turn that into a homogeneous 404, no existence oracle).
 *
 * Idempotence of imports is hash-based: MySQL JSON columns reorder object
 * keys, so both sides are canonicalized (recursive key sort on JSON objects,
 * arrays kept in order) before hashing — re-importing the same document is a
 * no-op, importing a DIFFERENT content under an existing (id, version) is a
 * 409 (published versions are immutable, same invariant as the referentiel).
 */
final class PromptPackageRepository
{
    public function __construct(private readonly PDO $pdo)
    {
    }

    /**
     * Validates against schemas/prompt-package.schema.json then inserts as a
     * PUBLISHED version. Idempotent by content hash.
     *
     * @param array<string, mixed> $doc decoded prompt-package document
     * @return array{status: 'imported'|'unchanged', id: string, version: string, contentHash: string}
     */
    public function importPublishedDocument(array $doc): array
    {
        $result = Validation::validate('prompt-package', $doc);
        if (!$result['valid']) {
            throw new InvalidPackageException($result['errors']);
        }

        $slug = (string) $doc['id'];
        $semver = (string) $doc['version'];
        $hash = self::contentHash($doc);

        $stmt = $this->pdo->prepare(
            'SELECT pv.id, pv.status, pv.content
               FROM prompt_versions pv
               JOIN prompt_packages pp ON pp.id = pv.package_id
              WHERE pp.slug = ? AND pv.semver = ?'
        );
        $stmt->execute([$slug, $semver]);
        $existing = $stmt->fetch();

        if ($existing !== false) {
            $stored = json_decode((string) $existing['content'], true);
            if (\is_array($stored)
                && self::contentHash($stored) === $hash
                && $existing['status'] === 'published') {
                return ['status' => 'unchanged', 'id' => $slug, 'version' => $semver, 'contentHash' => $hash];
            }

            throw new PackageConflictException(sprintf(
                'Version %s of prompt package "%s" already exists with a different content or status "%s" (published versions are immutable)',
                $semver,
                $slug,
                (string) $existing['status'],
            ));
        }

        $this->pdo->prepare(
            'INSERT INTO prompt_packages (slug, description) VALUES (?, ?)
             ON DUPLICATE KEY UPDATE description = VALUES(description)'
        )->execute([$slug, \is_string($doc['description'] ?? null) ? $doc['description'] : null]);

        $packageId = $this->packageIdOf($slug);
        $this->pdo->prepare(
            'INSERT INTO prompt_versions (package_id, semver, status, content, changelog, published_at)
             VALUES (?, ?, "published", ?, ?, NOW())'
        )->execute([
            $packageId,
            $semver,
            json_encode($doc, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
            self::lastChangelogEntry($doc),
        ]);

        return ['status' => 'imported', 'id' => $slug, 'version' => $semver, 'contentHash' => $hash];
    }

    /**
     * Published versions, for the run launcher (M6 contract: id = the stable
     * package slug, one entry per published version).
     *
     * @return list<array{id: string, version: string, description: string|null, publishedAt: string|null}>
     */
    public function listPublished(): array
    {
        $stmt = $this->pdo->query(
            'SELECT pp.slug, pv.semver, pp.description, pv.published_at
               FROM prompt_versions pv
               JOIN prompt_packages pp ON pp.id = pv.package_id
              WHERE pv.status = "published"
              ORDER BY pp.slug, pv.published_at, pv.id'
        );

        return array_map(static fn (array $row): array => [
            'id' => (string) $row['slug'],
            'version' => (string) $row['semver'],
            'description' => $row['description'] === null ? null : (string) $row['description'],
            'publishedAt' => $row['published_at'] === null
                ? null
                : str_replace(' ', 'T', (string) $row['published_at']),
        ], $stmt->fetchAll());
    }

    /**
     * Full document of one published version (prompt-package schema).
     *
     * @return array<string, mixed>|null
     */
    public function findPublished(string $slug, string $semver): ?array
    {
        $stmt = $this->pdo->prepare(
            'SELECT pv.content
               FROM prompt_versions pv
               JOIN prompt_packages pp ON pp.id = pv.package_id
              WHERE pp.slug = ? AND pv.semver = ? AND pv.status = "published"'
        );
        $stmt->execute([$slug, $semver]);
        $content = $stmt->fetchColumn();
        if (!\is_string($content)) {
            return null;
        }
        $doc = json_decode($content, true);

        return \is_array($doc) ? $doc : null;
    }

    /**
     * Latest published version across ALL packages (fallback for
     * GET /api/prompt-packages/default when no setting is stored).
     *
     * @return array{id: string, version: string}|null
     */
    public function latestPublishedAnyPackage(): ?array
    {
        $stmt = $this->pdo->query(
            'SELECT pp.slug, pv.semver
               FROM prompt_versions pv
               JOIN prompt_packages pp ON pp.id = pv.package_id
              WHERE pv.status = "published"
              ORDER BY pv.published_at DESC, pv.id DESC
              LIMIT 1'
        );
        $row = $stmt->fetch();

        return $row === false
            ? null
            : ['id' => (string) $row['slug'], 'version' => (string) $row['semver']];
    }

    /** True when (slug, semver) exists as a PUBLISHED version. */
    public function isPublished(string $slug, string $semver): bool
    {
        $stmt = $this->pdo->prepare(
            'SELECT 1
               FROM prompt_versions pv
               JOIN prompt_packages pp ON pp.id = pv.package_id
              WHERE pp.slug = ? AND pv.semver = ? AND pv.status = "published"'
        );
        $stmt->execute([$slug, $semver]);

        return $stmt->fetchColumn() !== false;
    }

    // ------------------------------------------------------------- drafts (P10)

    /**
     * New draft forked from an existing version: a PUBLISHED version of any
     * package, or one of the author's OWN drafts (a foreign draft answers
     * null exactly like an unknown version — no existence oracle).
     *
     * @return array<string, mixed>|null null when the source version is unknown
     */
    public function createDraft(string $slug, string $fromSemver, string $newSemver, int $userId): ?array
    {
        if (!Semver::isValid($newSemver)) {
            throw new InvalidPackageException(['/version' => ['Version semver invalide']]);
        }

        $stmt = $this->pdo->prepare(
            'SELECT pv.package_id, pv.status, pv.created_by, pv.content
               FROM prompt_versions pv
               JOIN prompt_packages pp ON pp.id = pv.package_id
              WHERE pp.slug = ? AND pv.semver = ?'
        );
        $stmt->execute([$slug, $fromSemver]);
        $source = $stmt->fetch();
        if ($source === false
            || ($source['status'] !== 'published' && (int) $source['created_by'] !== $userId)) {
            return null;
        }

        $exists = $this->pdo->prepare(
            'SELECT 1 FROM prompt_versions WHERE package_id = ? AND semver = ?'
        );
        $exists->execute([(int) $source['package_id'], $newSemver]);
        if ($exists->fetchColumn() !== false) {
            throw new PackageConflictException(sprintf(
                'Version %s of prompt package "%s" already exists',
                $newSemver,
                $slug,
            ));
        }

        $doc = json_decode((string) $source['content'], true, 512, JSON_THROW_ON_ERROR);
        $doc['version'] = $newSemver;
        if (isset($doc['metadata']) && \is_array($doc['metadata'])) {
            unset($doc['metadata']['publieLe']); // a draft is not published
            $doc['metadata']['modifieLe'] = date('c');
        }
        $this->assertValid($doc);

        try {
            $this->pdo->prepare(
                'INSERT INTO prompt_versions (package_id, semver, status, content, created_by)
                 VALUES (?, ?, "draft", ?, ?)'
            )->execute([(int) $source['package_id'], $newSemver, self::encode($doc), $userId]);
        } catch (\PDOException $e) {
            if ($e->getCode() === '23000') { // race on uq_prompt_versions
                throw new PackageConflictException(sprintf(
                    'Version %s of prompt package "%s" already exists',
                    $newSemver,
                    $slug,
                ));
            }
            throw $e;
        }

        return $this->findDraft((int) $this->pdo->lastInsertId(), $userId);
    }

    /**
     * The author's drafts, metadata only (no document).
     *
     * @return list<array<string, mixed>>
     */
    public function listDrafts(int $userId): array
    {
        $stmt = $this->pdo->prepare(
            'SELECT pv.id, pp.slug, pv.semver, pv.content, pv.created_at
               FROM prompt_versions pv
               JOIN prompt_packages pp ON pp.id = pv.package_id
              WHERE pv.status = "draft" AND pv.created_by = ?
              ORDER BY pv.id'
        );
        $stmt->execute([$userId]);

        return array_map(static function (array $row): array {
            $doc = json_decode((string) $row['content'], true);

            return [
                'draftId' => (int) $row['id'],
                'id' => (string) $row['slug'],
                'version' => (string) $row['semver'],
                'description' => \is_array($doc) && \is_string($doc['description'] ?? null)
                    ? $doc['description']
                    : null,
                'createdAt' => str_replace(' ', 'T', (string) $row['created_at']),
            ];
        }, $stmt->fetchAll());
    }

    /**
     * One draft WITH its document, owner-scoped: a foreign or unknown id
     * answers null (homogeneous 404 at the route level).
     *
     * @return array<string, mixed>|null
     */
    public function findDraft(int $draftId, int $userId): ?array
    {
        $stmt = $this->pdo->prepare(
            'SELECT pv.id, pp.slug, pv.semver, pv.status, pv.content, pv.created_at
               FROM prompt_versions pv
               JOIN prompt_packages pp ON pp.id = pv.package_id
              WHERE pv.id = ? AND pv.status = "draft" AND pv.created_by = ?'
        );
        $stmt->execute([$draftId, $userId]);
        $row = $stmt->fetch();
        if ($row === false) {
            return null;
        }

        return [
            'draftId' => (int) $row['id'],
            'id' => (string) $row['slug'],
            'version' => (string) $row['semver'],
            'status' => (string) $row['status'],
            'createdAt' => str_replace(' ', 'T', (string) $row['created_at']),
            'document' => json_decode((string) $row['content'], true, 512, JSON_THROW_ON_ERROR),
        ];
    }

    /**
     * Replace a draft's document. Schema re-validation on EVERY write; the
     * package id is invariant; the version may change (still a draft) as long
     * as it does not collide with another version of the package. Writing to
     * a published version is a conflict (immutability).
     *
     * @param array<string, mixed> $doc full prompt-package document
     * @return array<string, mixed>|null null when the draft is unknown or foreign
     */
    public function updateDraft(int $draftId, array $doc, int $userId): ?array
    {
        // Owner-scoped lookup INCLUDING published rows: a published version
        // owned by the author must answer 409, not 404.
        $stmt = $this->pdo->prepare(
            'SELECT pv.id, pv.package_id, pv.status, pp.slug
               FROM prompt_versions pv
               JOIN prompt_packages pp ON pp.id = pv.package_id
              WHERE pv.id = ? AND pv.created_by = ?'
        );
        $stmt->execute([$draftId, $userId]);
        $row = $stmt->fetch();
        if ($row === false) {
            return null;
        }
        if ($row['status'] === 'published') {
            throw new PackageConflictException(
                'Published versions are immutable: create a new draft instead'
            );
        }

        $this->assertValid($doc);
        if ((string) $doc['id'] !== (string) $row['slug']) {
            throw new InvalidPackageException([
                '/id' => [sprintf('L\'identifiant du paquet ne peut pas changer (attendu « %s »)', (string) $row['slug'])],
            ]);
        }

        $newSemver = (string) $doc['version'];
        $collision = $this->pdo->prepare(
            'SELECT 1 FROM prompt_versions WHERE package_id = ? AND semver = ? AND id <> ?'
        );
        $collision->execute([(int) $row['package_id'], $newSemver, $draftId]);
        if ($collision->fetchColumn() !== false) {
            throw new PackageConflictException(sprintf(
                'Version %s of prompt package "%s" already exists',
                $newSemver,
                (string) $row['slug'],
            ));
        }

        if (isset($doc['metadata']) && \is_array($doc['metadata'])) {
            $doc['metadata']['modifieLe'] = date('c');
        }

        $this->pdo->prepare(
            'UPDATE prompt_versions SET semver = ?, content = ? WHERE id = ?'
        )->execute([$newSemver, self::encode($doc), $draftId]);

        return $this->findDraft($draftId, $userId);
    }

    /**
     * Publish a draft: semver STRICTLY greater than every published version
     * of the package, changelog entry appended, then immutable.
     *
     * @return array<string, mixed>|null null when the draft is unknown or foreign
     */
    public function publishDraft(int $draftId, string $changelog, int $userId): ?array
    {
        $this->pdo->beginTransaction();
        try {
            $stmt = $this->pdo->prepare(
                'SELECT pv.id, pv.package_id, pv.semver, pv.status, pv.content, pp.slug
                   FROM prompt_versions pv
                   JOIN prompt_packages pp ON pp.id = pv.package_id
                  WHERE pv.id = ? AND pv.created_by = ?
                  FOR UPDATE'
            );
            $stmt->execute([$draftId, $userId]);
            $row = $stmt->fetch();
            if ($row === false) {
                $this->pdo->rollBack();

                return null;
            }
            if ($row['status'] === 'published') {
                throw new PackageConflictException(
                    'This version is already published (published versions are immutable)'
                );
            }

            $semver = (string) $row['semver'];
            $published = $this->pdo->prepare(
                'SELECT semver FROM prompt_versions
                  WHERE package_id = ? AND status = "published" FOR UPDATE'
            );
            $published->execute([(int) $row['package_id']]);
            foreach ($published->fetchAll(PDO::FETCH_COLUMN) as $existingSemver) {
                if (!Semver::greaterThan($semver, (string) $existingSemver)) {
                    throw new PackageConflictException(sprintf(
                        'Semver must be strictly increasing: %s is not greater than published %s',
                        $semver,
                        $existingSemver,
                    ));
                }
            }

            $doc = json_decode((string) $row['content'], true, 512, JSON_THROW_ON_ERROR);
            // Deterministic changelog: drop any pre-existing entry for this
            // version, then append the publication entry.
            $entries = array_values(array_filter(
                \is_array($doc['changelog'] ?? null) ? $doc['changelog'] : [],
                static fn (mixed $entry): bool => !(\is_array($entry) && ($entry['version'] ?? null) === $semver),
            ));
            $entries[] = ['version' => $semver, 'date' => date('Y-m-d'), 'description' => $changelog];
            $doc['changelog'] = $entries;
            if (isset($doc['metadata']) && \is_array($doc['metadata'])) {
                $doc['metadata']['publieLe'] = date('c');
            }
            $this->assertValid($doc);

            $this->pdo->prepare(
                'UPDATE prompt_versions
                    SET status = "published", content = ?, changelog = ?, published_at = NOW()
                  WHERE id = ?'
            )->execute([self::encode($doc), $changelog, $draftId]);
            $this->pdo->prepare(
                'UPDATE prompt_packages SET description = ? WHERE id = ?'
            )->execute([
                \is_string($doc['description'] ?? null) ? $doc['description'] : null,
                (int) $row['package_id'],
            ]);
            $this->pdo->commit();
        } catch (\Throwable $e) {
            if ($this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }
            throw $e;
        }

        return [
            'id' => (string) $row['slug'],
            'version' => (string) $row['semver'],
            'status' => 'published',
        ];
    }

    /** @param array<string, mixed> $doc @throws InvalidPackageException */
    private function assertValid(array $doc): void
    {
        $result = Validation::validate('prompt-package', $doc);
        if (!$result['valid']) {
            throw new InvalidPackageException($result['errors']);
        }
    }

    /** @param array<string, mixed> $doc */
    private static function encode(array $doc): string
    {
        return json_encode($doc, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    }

    /**
     * Canonical content hash: sha256 of the compact JSON encoding with every
     * JSON OBJECT's keys sorted recursively (arrays keep their order — prompt
     * order is meaningful). Stable across MySQL JSON key reordering.
     *
     * @param array<string, mixed> $doc
     */
    public static function contentHash(array $doc): string
    {
        return hash('sha256', json_encode(
            self::canonicalize($doc),
            JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES,
        ));
    }

    private static function canonicalize(mixed $value): mixed
    {
        if (!\is_array($value)) {
            return $value;
        }
        $canonical = array_map(self::canonicalize(...), $value);
        if (!array_is_list($canonical)) {
            ksort($canonical, SORT_STRING);
        }

        return $canonical;
    }

    private function packageIdOf(string $slug): int
    {
        $stmt = $this->pdo->prepare('SELECT id FROM prompt_packages WHERE slug = ?');
        $stmt->execute([$slug]);

        return (int) $stmt->fetchColumn();
    }

    /** @param array<string, mixed> $doc */
    private static function lastChangelogEntry(array $doc): ?string
    {
        $changelog = $doc['changelog'] ?? null;
        if (!\is_array($changelog) || $changelog === []) {
            return null;
        }
        $last = $changelog[array_key_last($changelog)];

        return \is_array($last) && \is_string($last['description'] ?? null)
            ? $last['description']
            : null;
    }
}
