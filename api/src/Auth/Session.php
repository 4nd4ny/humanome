<?php

declare(strict_types=1);

namespace Humanome\Auth;

use Humanome\Db;
use Humanome\DbSessionHandler;

/**
 * Thin wrapper around the native PHP session, backed by DbSessionHandler.
 *
 * Visitor = no session (cahier §2): nothing here creates a session unless a
 * route or middleware explicitly starts one. The CSRF token lives in the
 * session and is delivered by GET /api/auth/me and at session opening
 * (login/register) — double-submit via the X-CSRF-Token header.
 */
final class Session
{
    private const KEY_USER = 'user_id';
    private const KEY_CSRF = 'csrf_token';

    /** Start (or join) the DB-backed session. Idempotent. */
    public static function start(): void
    {
        DbSessionHandler::start(Db::get());
    }

    /** True when the request carries a session (active, or cookie present). */
    public static function exists(): bool
    {
        return session_status() === PHP_SESSION_ACTIVE
            || isset($_COOKIE[DbSessionHandler::SESSION_NAME]);
    }

    /**
     * Open an authenticated session: fresh session id (fixation protection),
     * fresh CSRF token, session row bound to the user. Returns the CSRF token.
     */
    public static function openForUser(int $userId): string
    {
        self::start();
        session_regenerate_id(true);
        $_SESSION[self::KEY_USER] = $userId;
        $token = bin2hex(random_bytes(32));
        $_SESSION[self::KEY_CSRF] = $token;

        // Persist the fresh session row immediately: PHP only writes it at
        // shutdown, and bindUser() is an UPDATE that needs an existing row.
        $handler = new DbSessionHandler(Db::get());
        $handler->write(session_id(), (string) session_encode());
        $handler->bindUser(session_id(), $userId);

        return $token;
    }

    public static function userId(): ?int
    {
        if (session_status() !== PHP_SESSION_ACTIVE) {
            return null;
        }
        $id = $_SESSION[self::KEY_USER] ?? null;

        return \is_int($id) ? $id : null;
    }

    /** CSRF token of the active session, created on first access. */
    public static function csrfToken(): string
    {
        $token = self::storedCsrfToken();
        if ($token === null) {
            $token = bin2hex(random_bytes(32));
            $_SESSION[self::KEY_CSRF] = $token;
        }

        return $token;
    }

    /** CSRF token already stored in the session, without creating one. */
    public static function storedCsrfToken(): ?string
    {
        if (session_status() !== PHP_SESSION_ACTIVE) {
            return null;
        }
        $token = $_SESSION[self::KEY_CSRF] ?? null;

        return \is_string($token) && $token !== '' ? $token : null;
    }

    /** Destroy the session (logout, account purge) and expire its cookie. */
    public static function destroy(): void
    {
        if (session_status() !== PHP_SESSION_ACTIVE) {
            if (!self::exists()) {
                return;
            }
            self::start();
        }

        $_SESSION = [];
        session_destroy();

        if (!headers_sent()) {
            $params = session_get_cookie_params();
            setcookie(DbSessionHandler::SESSION_NAME, '', [
                'expires' => time() - 86400,
                'path' => $params['path'],
                'domain' => $params['domain'],
                'secure' => $params['secure'],
                'httponly' => $params['httponly'],
                'samesite' => $params['samesite'],
            ]);
        }
    }
}
