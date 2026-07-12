<?php

declare(strict_types=1);

namespace Humanome\Middleware;

use Humanome\Auth\Session;
use Humanome\Db;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\MiddlewareInterface;
use Psr\Http\Server\RequestHandlerInterface;
use Slim\Psr7\Factory\ResponseFactory;

/**
 * Global CSRF protection for mutating methods on /api/** (P3.3).
 *
 * Double-submit pattern: the token lives in the session, the client sends it
 * back in the X-CSRF-Token header, comparison uses hash_equals(). The token
 * is delivered by GET /api/auth/me and at session opening (login/register).
 *
 * A request without a session cookie passes through: CSRF rides ambient
 * credentials, and the visitor has none (visitor = no session, cahier §2) —
 * the route itself answers 401 when authentication is required.
 */
final class CsrfMiddleware implements MiddlewareInterface
{
    private const MUTATING_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'];

    /**
     * /api/admin/migrate carries its own bearer token (ADR-008); login and
     * register cannot hold a CSRF token yet (the token is delivered by the
     * session they open) and are rate-limited instead.
     *
     * /api/llm (M6): the demo proxy is a visitor route already fenced by its
     * own guards (single-use proof of work, honeypot, per-IP and daily
     * quotas — routes/llm.php). A logged-in user must be able to call it
     * exactly like a visitor, without a CSRF header; the exemption is safe
     * because the route grants nothing based on the session (no per-account
     * state read or written). Documented in docs/autorisations.md.
     */
    private const EXEMPT_PATHS = [
        '/api/admin/migrate',
        '/api/auth/login',
        '/api/auth/register',
        '/api/llm',
    ];

    public function process(ServerRequestInterface $request, RequestHandlerInterface $handler): ResponseInterface
    {
        if (!\in_array(strtoupper($request->getMethod()), self::MUTATING_METHODS, true)) {
            return $handler->handle($request);
        }
        $path = rtrim($request->getUri()->getPath(), '/');
        if (\in_array($path, self::EXEMPT_PATHS, true)) {
            return $handler->handle($request);
        }

        // No session cookie -> no ambient credentials to ride on.
        if (!Db::isConfigured() || !Session::exists()) {
            return $handler->handle($request);
        }

        try {
            Session::start();
        } catch (\Throwable $e) {
            // Added after the error middleware (Bootstrap loads route files
            // last), so failures here must be caught locally.
            error_log('[csrf] ' . $e->getMessage());

            return $this->json(500, 'Erreur interne');
        }

        $stored = Session::storedCsrfToken();
        $given = $request->getHeaderLine('X-CSRF-Token');
        if ($stored === null || $given === '' || !hash_equals($stored, $given)) {
            return $this->json(403, 'Jeton CSRF absent ou invalide');
        }

        return $handler->handle($request);
    }

    private function json(int $status, string $message): ResponseInterface
    {
        $response = (new ResponseFactory())->createResponse($status);
        $response->getBody()->write(json_encode(['error' => $message], JSON_THROW_ON_ERROR));

        return $response->withHeader('Content-Type', 'application/json');
    }
}
