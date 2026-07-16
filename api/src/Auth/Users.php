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
            'SELECT id, email, password_hash, display_name, created_at, avatar_mime,
                    email_verified_at, verification_code_hash, verification_expires_at, verification_attempts
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
            'SELECT id, email, password_hash, display_name, created_at, avatar_mime,
                    email_verified_at, verification_code_hash, verification_expires_at, verification_attempts
             FROM users WHERE id = ? AND deleted_at IS NULL'
        );
        $stmt->execute([$id]);
        $row = $stmt->fetch();

        return $row === false ? null : $row;
    }

    /** True quand le compte a confirmé son email (email_verified_at non NULL). */
    public static function isVerified(?array $user): bool
    {
        return \is_array($user) && ($user['email_verified_at'] ?? null) !== null;
    }

    /**
     * Pose (ou renouvelle) le code de vérification : hash + expiration, et
     * REMET le compteur d'essais à 0 (D5 — chaque renvoi rouvre les 5 essais).
     */
    public static function setVerificationCode(PDO $pdo, int $userId, string $codeHash, string $expiresAt): void
    {
        $pdo->prepare(
            'UPDATE users
                SET verification_code_hash = ?, verification_expires_at = ?, verification_attempts = 0
              WHERE id = ?'
        )->execute([$codeHash, $expiresAt, $userId]);
    }

    /** +1 essai de code ; renvoie le nouveau total. */
    public static function bumpVerificationAttempts(PDO $pdo, int $userId): int
    {
        $pdo->prepare('UPDATE users SET verification_attempts = verification_attempts + 1 WHERE id = ?')
            ->execute([$userId]);
        $stmt = $pdo->prepare('SELECT verification_attempts FROM users WHERE id = ?');
        $stmt->execute([$userId]);

        return (int) $stmt->fetchColumn();
    }

    /**
     * Active le compte (premier login qui confirme) : pose email_verified_at et
     * efface le code (usage unique).
     */
    public static function markVerified(PDO $pdo, int $userId): void
    {
        $pdo->prepare(
            'UPDATE users
                SET email_verified_at = NOW(),
                    verification_code_hash = NULL, verification_expires_at = NULL, verification_attempts = 0
              WHERE id = ?'
        )->execute([$userId]);
    }

    public static function create(PDO $pdo, string $email, string $passwordHash, string $displayName): int
    {
        $stmt = $pdo->prepare(
            'INSERT INTO users (email, password_hash, display_name) VALUES (?, ?, ?)'
        );
        $stmt->execute([$email, $passwordHash, $displayName]);

        return (int) $pdo->lastInsertId();
    }

    /** Met à jour le nom affiché (identifiant en clair, D6). */
    public static function updateDisplayName(PDO $pdo, int $userId, string $displayName): void
    {
        $pdo->prepare('UPDATE users SET display_name = ? WHERE id = ? AND deleted_at IS NULL')
            ->execute([$displayName, $userId]);
    }

    /** Pose l'avatar (octets déjà validés) + son mime (D6). */
    public static function setAvatar(PDO $pdo, int $userId, string $bytes, string $mime): void
    {
        $stmt = $pdo->prepare('UPDATE users SET avatar = ?, avatar_mime = ? WHERE id = ? AND deleted_at IS NULL');
        $stmt->bindParam(1, $bytes, PDO::PARAM_LOB);
        $stmt->bindParam(2, $mime, PDO::PARAM_STR);
        $stmt->bindValue(3, $userId, PDO::PARAM_INT);
        $stmt->execute();
    }

    /** Efface l'avatar (suppression indépendante depuis le profil, D6/RGPD). */
    public static function deleteAvatar(PDO $pdo, int $userId): void
    {
        $pdo->prepare('UPDATE users SET avatar = NULL, avatar_mime = NULL WHERE id = ? AND deleted_at IS NULL')
            ->execute([$userId]);
    }

    /** @return array{bytes: string, mime: string}|null l'avatar servi par GET /users/{id}/avatar. */
    public static function getAvatar(PDO $pdo, int $userId): ?array
    {
        $stmt = $pdo->prepare('SELECT avatar, avatar_mime FROM users WHERE id = ? AND deleted_at IS NULL');
        $stmt->execute([$userId]);
        $row = $stmt->fetch();
        if ($row === false || $row['avatar'] === null || $row['avatar_mime'] === null) {
            return null;
        }

        return ['bytes' => (string) $row['avatar'], 'mime' => (string) $row['avatar_mime']];
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
