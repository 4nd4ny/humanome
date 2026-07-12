<?php

declare(strict_types=1);

namespace Humanome\Admin;

use Humanome\Auth\Audit;
use Humanome\Packages\PromptPackageRepository;
use Humanome\Validation;
use PDO;

/**
 * Golden Prompt administration (P12.1, cahier §3.8/§4.10/§7).
 *
 * The Golden Prompt is imported HORS GIT (its content only lives in the
 * database, never in the repository) as a normal prompt_packages row flagged
 * is_private = 1. Because every public read path in PromptPackageRepository is
 * filtered by `is_private = 0`, a Golden package is never listed by
 * GET /api/prompt-packages, never served as the default, never proposable,
 * never runnable in a mass run, never forkable by a promptologue.
 *
 * Access is granted case by case by an administrator to a specific
 * promptologue (golden_grants). This class holds the admin-side operations;
 * consuming a granted Golden package (bench comparison, cahier §3.4) is a
 * separate, grant-checked read that a later promptologue increment can add on
 * top of the golden_grants table — the authorisation model lives here.
 */
final class GoldenRepository
{
    public function __construct(private readonly PDO $pdo)
    {
    }

    /**
     * Import a prompt-package document as a PRIVATE, published Golden version.
     * Idempotent by content hash (re-importing the exact document is a no-op);
     * a different content under an existing (id, version) is a 409, like every
     * published version (immutability). Refuses to shadow an existing PUBLIC
     * package sharing the slug.
     *
     * @param array<string, mixed> $doc decoded prompt-package document
     * @return array{status: 'imported'|'unchanged', id: string, version: string, contentHash: string}
     */
    public function import(int $adminId, array $doc): array
    {
        $result = Validation::validate('prompt-package', $doc);
        if (!$result['valid']) {
            throw new AdminException('Document prompt-package invalide', 422);
        }

        $slug = (string) $doc['id'];
        $semver = (string) $doc['version'];
        $hash = PromptPackageRepository::contentHash($doc);

        $pkg = $this->pdo->prepare('SELECT id, is_private FROM prompt_packages WHERE slug = ?');
        $pkg->execute([$slug]);
        $existingPkg = $pkg->fetch();
        if ($existingPkg !== false && (int) $existingPkg['is_private'] === 0) {
            throw new AdminException(
                sprintf('Un paquet public porte déjà l\'identifiant « %s » : le Golden Prompt doit avoir un identifiant distinct', $slug),
                409,
            );
        }

        // Existing (slug, semver): unchanged if identical content, else 409.
        if ($existingPkg !== false) {
            $verStmt = $this->pdo->prepare(
                'SELECT content FROM prompt_versions WHERE package_id = ? AND semver = ?'
            );
            $verStmt->execute([(int) $existingPkg['id'], $semver]);
            $content = $verStmt->fetchColumn();
            if (\is_string($content)) {
                $stored = json_decode($content, true);
                if (\is_array($stored) && PromptPackageRepository::contentHash($stored) === $hash) {
                    return ['status' => 'unchanged', 'id' => $slug, 'version' => $semver, 'contentHash' => $hash];
                }

                throw new AdminException(
                    sprintf('La version %s du Golden « %s » existe déjà avec un contenu différent (versions immuables)', $semver, $slug),
                    409,
                );
            }
        }

        $this->pdo->beginTransaction();
        try {
            $this->pdo->prepare(
                'INSERT INTO prompt_packages (slug, description, is_private) VALUES (?, ?, 1)
                 ON DUPLICATE KEY UPDATE description = VALUES(description), is_private = 1'
            )->execute([$slug, \is_string($doc['description'] ?? null) ? $doc['description'] : null]);

            $idStmt = $this->pdo->prepare('SELECT id FROM prompt_packages WHERE slug = ?');
            $idStmt->execute([$slug]);
            $packageId = (int) $idStmt->fetchColumn();

            $this->pdo->prepare(
                'INSERT INTO prompt_versions (package_id, semver, status, content, created_by, published_at)
                 VALUES (?, ?, "published", ?, ?, NOW())'
            )->execute([
                $packageId,
                $semver,
                json_encode($doc, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
                $adminId,
            ]);

            Audit::record($this->pdo, $adminId, 'golden_imported', [
                'packageId' => $packageId,
                'version' => $semver,
            ]);
            $this->pdo->commit();
        } catch (\Throwable $e) {
            if ($this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }
            throw $e;
        }

        return ['status' => 'imported', 'id' => $slug, 'version' => $semver, 'contentHash' => $hash];
    }

    /**
     * Private (Golden) packages with their published versions and the list of
     * promptologues currently granted access. Metadata only, never the prompt
     * content (that stays hors git / admin-only).
     *
     * @return list<array{id: string, packageId: int, description: string|null, versions: list<string>, grants: list<array{userId: int, displayName: string, email: string, createdAt: string}>}>
     */
    public function list(): array
    {
        $packages = $this->pdo->query(
            'SELECT id, slug, description FROM prompt_packages WHERE is_private = 1 ORDER BY slug'
        )->fetchAll();

        return array_map(function (array $pkg): array {
            $packageId = (int) $pkg['id'];
            $versions = $this->pdo->prepare(
                'SELECT semver FROM prompt_versions WHERE package_id = ? ORDER BY published_at, id'
            );
            $versions->execute([$packageId]);

            return [
                'id' => (string) $pkg['slug'],
                'packageId' => $packageId,
                'description' => $pkg['description'] === null ? null : (string) $pkg['description'],
                'versions' => array_map('strval', $versions->fetchAll(PDO::FETCH_COLUMN)),
                'grants' => $this->grantsOf($packageId),
            ];
        }, $packages);
    }

    /**
     * Authorise a promptologue to access a Golden package (case by case,
     * cahier §3.4/§7). The target account must hold the promptologue role.
     * Idempotent.
     *
     * @return array{status: 'granted'|'unchanged', id: string, userId: int}
     */
    public function grant(int $adminId, string $slug, int $targetUserId): array
    {
        $pkg = $this->pdo->prepare('SELECT id FROM prompt_packages WHERE slug = ? AND is_private = 1');
        $pkg->execute([$slug]);
        $packageId = $pkg->fetchColumn();
        if ($packageId === false) {
            throw new AdminException('Golden Prompt introuvable', 404);
        }

        $userStmt = $this->pdo->prepare('SELECT 1 FROM users WHERE id = ? AND deleted_at IS NULL');
        $userStmt->execute([$targetUserId]);
        if ($userStmt->fetchColumn() === false) {
            throw new AdminException('Compte introuvable', 404);
        }

        $roleStmt = $this->pdo->prepare(
            'SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id
              WHERE ur.user_id = ? AND r.name = "promptologue"'
        );
        $roleStmt->execute([$targetUserId]);
        if ($roleStmt->fetchColumn() === false) {
            throw new AdminException(
                'L\'accès au Golden Prompt ne peut être accordé qu\'à un compte promptologue',
                422,
            );
        }

        $insert = $this->pdo->prepare(
            'INSERT IGNORE INTO golden_grants (package_id, user_id, granted_by) VALUES (?, ?, ?)'
        );
        $insert->execute([(int) $packageId, $targetUserId, $adminId]);
        $status = $insert->rowCount() > 0 ? 'granted' : 'unchanged';

        if ($status === 'granted') {
            Audit::record($this->pdo, $adminId, 'golden_access_granted', [
                'packageId' => (int) $packageId,
                'targetUserId' => $targetUserId,
            ]);
        }

        return ['status' => $status, 'id' => $slug, 'userId' => $targetUserId];
    }

    /** True when a user holds an access grant to the given private package. */
    public function hasAccess(int $userId, string $slug): bool
    {
        $stmt = $this->pdo->prepare(
            'SELECT 1 FROM golden_grants g
               JOIN prompt_packages pp ON pp.id = g.package_id
              WHERE g.user_id = ? AND pp.slug = ? AND pp.is_private = 1'
        );
        $stmt->execute([$userId, $slug]);

        return $stmt->fetchColumn() !== false;
    }

    /**
     * @return list<array{userId: int, displayName: string, email: string, createdAt: string}>
     */
    private function grantsOf(int $packageId): array
    {
        $stmt = $this->pdo->prepare(
            'SELECT g.user_id, g.created_at, u.display_name, u.email
               FROM golden_grants g
               JOIN users u ON u.id = g.user_id
              WHERE g.package_id = ?
              ORDER BY u.display_name'
        );
        $stmt->execute([$packageId]);

        return array_map(static fn (array $r): array => [
            'userId' => (int) $r['user_id'],
            'displayName' => (string) $r['display_name'],
            'email' => (string) $r['email'],
            'createdAt' => str_replace(' ', 'T', (string) $r['created_at']),
        ], $stmt->fetchAll());
    }
}
