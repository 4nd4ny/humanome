<?php

declare(strict_types=1);

namespace Humanome;

use PDO;
use SessionHandlerInterface;

/**
 * PHP session storage backed by the `sessions` table (shared-hosting friendly:
 * no dependence on local file sessions, survives multi-process Apache).
 *
 * Privacy: only a SHA-256 hash of the client IP is stored (journalisation
 * minimale, cahier §6). user_id is bound by the auth module at login via
 * bindUser(); the auth module MUST also call session_regenerate_id(true)
 * on login (fixation protection).
 */
final class DbSessionHandler implements SessionHandlerInterface
{
    public const SESSION_NAME = 'humanome_sid';

    public function __construct(private readonly PDO $pdo)
    {
    }

    /**
     * Reusable session bootstrap: registers this handler, hardens cookie
     * parameters (Secure outside dev, HttpOnly, SameSite=Lax, strict mode)
     * and starts the session. No-op when a session is already active.
     */
    public static function start(PDO $pdo): void
    {
        if (session_status() === PHP_SESSION_ACTIVE) {
            return;
        }

        session_set_save_handler(new self($pdo), true);
        session_name(self::SESSION_NAME);
        session_set_cookie_params([
            'lifetime' => 0,
            'path' => '/',
            'domain' => '',
            'secure' => Env::get('APP_ENV', 'production') !== 'dev',
            'httponly' => true,
            'samesite' => 'Lax',
        ]);
        ini_set('session.use_strict_mode', '1');
        ini_set('session.use_only_cookies', '1');
        session_start();
    }

    /** Attach (or detach with null) the authenticated user to a session row. */
    public function bindUser(string $sessionId, ?int $userId): void
    {
        $stmt = $this->pdo->prepare('UPDATE sessions SET user_id = ? WHERE id = ?');
        $stmt->execute([$userId, $sessionId]);
    }

    public function open(string $path, string $name): bool
    {
        return true;
    }

    public function close(): bool
    {
        return true;
    }

    public function read(string $id): string|false
    {
        $stmt = $this->pdo->prepare('SELECT data FROM sessions WHERE id = ?');
        $stmt->execute([$id]);
        $data = $stmt->fetchColumn();

        return $data === false ? '' : (string) $data;
    }

    public function write(string $id, string $data): bool
    {
        // user_id is intentionally left out of the UPDATE branch: it is
        // managed by bindUser() and must survive routine session writes.
        $stmt = $this->pdo->prepare(
            'INSERT INTO sessions (id, user_id, data, last_activity, ip_hash)
             VALUES (:id, NULL, :data, :now, :ip_hash) AS new
             ON DUPLICATE KEY UPDATE
                data = new.data,
                last_activity = new.last_activity,
                ip_hash = new.ip_hash'
        );

        return $stmt->execute([
            'id' => $id,
            'data' => $data,
            'now' => time(),
            'ip_hash' => self::ipHash(),
        ]);
    }

    public function destroy(string $id): bool
    {
        $stmt = $this->pdo->prepare('DELETE FROM sessions WHERE id = ?');

        return $stmt->execute([$id]);
    }

    public function gc(int $max_lifetime): int|false
    {
        $stmt = $this->pdo->prepare('DELETE FROM sessions WHERE last_activity < ?');
        $stmt->execute([time() - $max_lifetime]);

        return $stmt->rowCount();
    }

    private static function ipHash(): ?string
    {
        $ip = $_SERVER['REMOTE_ADDR'] ?? '';

        return $ip === '' ? null : hash('sha256', $ip);
    }
}
