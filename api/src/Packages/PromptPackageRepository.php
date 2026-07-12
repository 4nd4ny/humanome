<?php

declare(strict_types=1);

namespace Humanome\Packages;

use Humanome\Validation;
use PDO;

/**
 * Prompt packages (P8 slice of P10): published, immutable versions served to
 * the run launcher. The full editor/workshop arrives in P10 — this repository
 * only lists/serves published versions and imports documents built by
 * scripts/build-default-prompt-package.mjs.
 *
 * Idempotence is hash-based: MySQL JSON columns reorder object keys, so both
 * sides are canonicalized (recursive key sort on JSON objects, arrays kept in
 * order) before hashing — re-importing the same document is a no-op, importing
 * a DIFFERENT content under an existing (id, version) is a 409 (published
 * versions are immutable, same invariant as the referentiel).
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
