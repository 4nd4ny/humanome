<?php

declare(strict_types=1);

namespace Humanome\Admin;

use Humanome\Auth\Audit;
use PDO;

/**
 * Admin roles section (P12.1, cahier §3.8/§4.10): list accounts with their
 * roles, grant and revoke the cahier §2 roles through an admin SESSION API
 * (RequireRole::any('admin') in routes/admin.php) — NOT the deploy
 * X-Migrate-Token used by the pre-P12 grant-role tooling (routes/system.php).
 *
 * Anti-lockout invariant: an administrator may not revoke their OWN admin
 * role, so the platform always keeps at least the acting admin. Every grant
 * and revoke leaves a minimal audit trail (cahier §6.5): ids and the
 * whitelisted role name only, never the email or display name.
 */
final class UserDirectory
{
    /** Page size for GET /api/admin/users (search is cheap, keep it small). */
    public const PAGE_SIZE = 20;

    public function __construct(private readonly PDO $pdo)
    {
    }

    /**
     * Paginated account list with roles, optional case-insensitive search on
     * email or display name, optional filter on a carried role (monitoring :
     * « tous les comptes ayant tel rôle »). Deleted accounts are excluded.
     *
     * @return array{users: list<array{id: int, email: string, displayName: string, createdAt: string, roles: list<string>}>, total: int, page: int, pageSize: int}
     */
    public function list(string $query = '', int $page = 1, string $role = ''): array
    {
        $page = max(1, $page);
        $offset = ($page - 1) * self::PAGE_SIZE;

        $where = 'u.deleted_at IS NULL';
        $params = [];
        $query = trim($query);
        if ($query !== '') {
            $where .= ' AND (u.email LIKE ? OR u.display_name LIKE ?)';
            $like = '%' . self::escapeLike($query) . '%';
            $params[] = $like;
            $params[] = $like;
        }
        $role = trim($role);
        if ($role !== '') {
            // Rôle inconnu -> liste vide (le filtre vient d'un menu fermé).
            $where .= ' AND EXISTS (SELECT 1 FROM user_roles ur
                                     JOIN roles r ON r.id = ur.role_id
                                    WHERE ur.user_id = u.id AND r.name = ?)';
            $params[] = $role;
        }

        $countStmt = $this->pdo->prepare("SELECT COUNT(*) FROM users u WHERE {$where}");
        $countStmt->execute($params);
        $total = (int) $countStmt->fetchColumn();

        // LIMIT/OFFSET are integers we control (never user strings): inlined
        // because MySQL rejects bound parameters in LIMIT under some drivers.
        $listStmt = $this->pdo->prepare(
            "SELECT u.id, u.email, u.display_name, u.created_at
               FROM users u
              WHERE {$where}
              ORDER BY u.id
              LIMIT " . self::PAGE_SIZE . ' OFFSET ' . $offset
        );
        $listStmt->execute($params);
        $rows = $listStmt->fetchAll();
        if ($rows === []) {
            return ['users' => [], 'total' => $total, 'page' => $page, 'pageSize' => self::PAGE_SIZE];
        }

        $rolesByUser = $this->rolesByUser(array_map(static fn (array $r): int => (int) $r['id'], $rows));

        $users = array_map(static fn (array $r): array => [
            'id' => (int) $r['id'],
            'email' => (string) $r['email'],
            'displayName' => (string) $r['display_name'],
            'createdAt' => str_replace(' ', 'T', (string) $r['created_at']),
            'roles' => $rolesByUser[(int) $r['id']] ?? [],
        ], $rows);

        return ['users' => $users, 'total' => $total, 'page' => $page, 'pageSize' => self::PAGE_SIZE];
    }

    /**
     * Grant a cahier §2 role to an account. Idempotent (re-grant = unchanged).
     *
     * @return array{status: 'granted'|'unchanged'} outcome
     */
    public function grant(int $adminId, int $targetUserId, string $role): array
    {
        $roleId = $this->roleId($role);
        if ($roleId === null) {
            throw new AdminException(sprintf('Rôle inconnu « %s » (rôles du référentiel §2 uniquement)', $role), 422);
        }
        if (!$this->userExists($targetUserId)) {
            throw new AdminException('Compte introuvable', 404);
        }

        $insert = $this->pdo->prepare('INSERT IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)');
        $insert->execute([$targetUserId, $roleId]);
        $status = $insert->rowCount() > 0 ? 'granted' : 'unchanged';

        if ($status === 'granted') {
            Audit::record($this->pdo, $adminId, 'role_granted', [
                'targetUserId' => $targetUserId,
                'role' => $role,
                'status' => $status,
            ]);
        }

        return ['status' => $status];
    }

    /**
     * Revoke a role from an account.
     *
     * Anti-lockout: an admin cannot revoke their OWN admin role (409). Any
     * admin can revoke another admin, and any admin can revoke a non-admin
     * role from themselves.
     *
     * @return array{status: 'revoked'|'unchanged'} outcome
     */
    public function revoke(int $adminId, int $targetUserId, string $role): array
    {
        $roleId = $this->roleId($role);
        if ($roleId === null) {
            throw new AdminException(sprintf('Rôle inconnu « %s » (rôles du référentiel §2 uniquement)', $role), 422);
        }
        if (!$this->userExists($targetUserId)) {
            throw new AdminException('Compte introuvable', 404);
        }
        if ($role === 'admin' && $targetUserId === $adminId) {
            throw new AdminException(
                'Un administrateur ne peut pas retirer son propre rôle admin (anti-verrouillage)',
                409,
            );
        }

        $delete = $this->pdo->prepare('DELETE FROM user_roles WHERE user_id = ? AND role_id = ?');
        $delete->execute([$targetUserId, $roleId]);
        $status = $delete->rowCount() > 0 ? 'revoked' : 'unchanged';

        if ($status === 'revoked') {
            Audit::record($this->pdo, $adminId, 'role_revoked', [
                'targetUserId' => $targetUserId,
                'role' => $role,
                'status' => $status,
            ]);
        }

        return ['status' => $status];
    }

    private function roleId(string $role): ?int
    {
        $stmt = $this->pdo->prepare('SELECT id FROM roles WHERE name = ?');
        $stmt->execute([$role]);
        $id = $stmt->fetchColumn();

        return $id === false ? null : (int) $id;
    }

    private function userExists(int $userId): bool
    {
        $stmt = $this->pdo->prepare('SELECT 1 FROM users WHERE id = ? AND deleted_at IS NULL');
        $stmt->execute([$userId]);

        return $stmt->fetchColumn() !== false;
    }

    /**
     * @param list<int> $userIds
     * @return array<int, list<string>> role names per user id, alphabetical
     */
    private function rolesByUser(array $userIds): array
    {
        if ($userIds === []) {
            return [];
        }
        $placeholders = implode(',', array_fill(0, \count($userIds), '?'));
        $stmt = $this->pdo->prepare(
            "SELECT ur.user_id, r.name
               FROM user_roles ur
               JOIN roles r ON r.id = ur.role_id
              WHERE ur.user_id IN ({$placeholders})
              ORDER BY r.name"
        );
        $stmt->execute($userIds);

        $out = [];
        foreach ($stmt->fetchAll() as $row) {
            $out[(int) $row['user_id']][] = (string) $row['name'];
        }

        return $out;
    }

    /** Escape LIKE wildcards in a user-supplied search term (\ % _). */
    private static function escapeLike(string $term): string
    {
        return str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], $term);
    }
}
