<?php

declare(strict_types=1);

namespace Humanome\Auth;

use PDO;
use RuntimeException;

/**
 * User queries — plain PDO with prepared statements, no ORM (P3 rule).
 */
final class Users
{
    private static ?string $dummyHash = null;

    /** Argon2id when the platform provides it (php:8.2 does), bcrypt fallback. */
    public static function hashPassword(string $password): string
    {
        $algo = \defined('PASSWORD_ARGON2ID') ? PASSWORD_ARGON2ID : PASSWORD_DEFAULT;

        return password_hash($password, $algo);
    }

    /**
     * Hash verified when the email is unknown, so a login attempt costs the
     * same time whether or not the account exists (user enumeration).
     */
    public static function dummyHash(): string
    {
        return self::$dummyHash ??= self::hashPassword('humanome-timing-equalizer');
    }

    /** @return array<string, mixed>|null */
    public static function findByEmail(PDO $pdo, string $email): ?array
    {
        $stmt = $pdo->prepare(
            'SELECT id, email, password_hash, display_name, created_at
             FROM users WHERE email = ? AND deleted_at IS NULL'
        );
        $stmt->execute([$email]);
        $row = $stmt->fetch();

        return $row === false ? null : $row;
    }

    /** @return array<string, mixed>|null */
    public static function findById(PDO $pdo, int $id): ?array
    {
        $stmt = $pdo->prepare(
            'SELECT id, email, password_hash, display_name, created_at
             FROM users WHERE id = ? AND deleted_at IS NULL'
        );
        $stmt->execute([$id]);
        $row = $stmt->fetch();

        return $row === false ? null : $row;
    }

    public static function create(PDO $pdo, string $email, string $passwordHash, string $displayName): int
    {
        $stmt = $pdo->prepare(
            'INSERT INTO users (email, password_hash, display_name) VALUES (?, ?, ?)'
        );
        $stmt->execute([$email, $passwordHash, $displayName]);

        return (int) $pdo->lastInsertId();
    }

    public static function assignRole(PDO $pdo, int $userId, string $role): void
    {
        $stmt = $pdo->prepare(
            'INSERT INTO user_roles (user_id, role_id)
             SELECT ?, id FROM roles WHERE name = ?'
        );
        $stmt->execute([$userId, $role]);
        if ($stmt->rowCount() === 0) {
            throw new RuntimeException('Unknown role: ' . $role);
        }
    }

    /** @return list<string> Role names of the user, alphabetical. */
    public static function rolesOf(PDO $pdo, int $userId): array
    {
        $stmt = $pdo->prepare(
            'SELECT r.name FROM roles r
             JOIN user_roles ur ON ur.role_id = r.id
             WHERE ur.user_id = ?
             ORDER BY r.name'
        );
        $stmt->execute([$userId]);

        return $stmt->fetchAll(PDO::FETCH_COLUMN);
    }

    /**
     * RGPD purge (cahier §6.3): a real DELETE. Every user-owned table
     * cascades (sessions, user_roles, cartographies, share_links,
     * training_progress, user_api_keys); audit_events keeps its rows with
     * user_id set to NULL (anonymized, dated trace of the deletion).
     */
    public static function purge(PDO $pdo, int $userId): void
    {
        $stmt = $pdo->prepare('DELETE FROM users WHERE id = ?');
        $stmt->execute([$userId]);
    }
}
