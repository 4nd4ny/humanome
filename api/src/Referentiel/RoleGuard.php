<?php

declare(strict_types=1);

namespace Humanome\Referentiel;

use Humanome\Db;
use Humanome\DbSessionHandler;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\MiddlewareInterface;
use Psr\Http\Server\RequestHandlerInterface;
use Slim\Psr7\Factory\ResponseFactory;

/**
 * Role-based route guard for the referentiel write routes (P4): 401 without an
 * authenticated session, 403 when the user holds none of the required roles.
 * Roles are read from the database on every request, so a role change or an
 * account purge takes effect on the very next call.
 *
 * This is the INTENTIONAL, load-bearing guard for routes/referentiel.php — not
 * a temporary shim. It is deliberately kept distinct from
 * Humanome\Middleware\RequireRole: both expose the same 401/403 contract, but
 * they read the session differently. RoleGuard reads $_SESSION['user_id']
 * directly (the contract shared with DbSessionHandler::bindUser()), which keeps
 * it usable both under a live web session and in CLI/test contexts that seed
 * $_SESSION without starting one; Middleware\RequireRole goes through the
 * Session object. Removing this guard (or its ->add() in routes/referentiel.php)
 * leaves every mutating referentiel endpoint reachable unauthenticated — the
 * regression suite (ReferentielAuthzTest) exists to catch exactly that.
 */
final class RoleGuard implements MiddlewareInterface
{
    /** @param list<string> $roles */
    private function __construct(private readonly array $roles)
    {
    }

    public static function any(string ...$roles): self
    {
        return new self(array_values($roles));
    }

    public function process(ServerRequestInterface $request, RequestHandlerInterface $handler): ResponseInterface
    {
        $userId = $this->currentUserId();
        if ($userId === null) {
            return $this->deny(401, 'Authentication required');
        }
        if (!$this->hasAnyRole($userId)) {
            return $this->deny(403, 'Forbidden');
        }

        return $handler->handle($request);
    }

    private function currentUserId(): ?int
    {
        // Web context: make sure the DB-backed session is started. In CLI
        // (tests), $_SESSION is used as-is without starting a session.
        if (\PHP_SAPI !== 'cli' && session_status() !== \PHP_SESSION_ACTIVE && Db::isConfigured()) {
            DbSessionHandler::start(Db::get());
        }

        $id = $_SESSION['user_id'] ?? null;
        if (\is_int($id) && $id > 0) {
            return $id;
        }
        if (\is_string($id) && ctype_digit($id) && (int) $id > 0) {
            return (int) $id;
        }

        return null;
    }

    private function hasAnyRole(int $userId): bool
    {
        if ($this->roles === [] || !Db::isConfigured()) {
            return false;
        }

        $placeholders = implode(', ', array_fill(0, \count($this->roles), '?'));
        $stmt = Db::get()->prepare(
            "SELECT COUNT(*)
             FROM user_roles ur
             JOIN roles r ON r.id = ur.role_id
             JOIN users u ON u.id = ur.user_id AND u.deleted_at IS NULL
             WHERE ur.user_id = ? AND r.name IN ({$placeholders})"
        );
        $stmt->execute([$userId, ...$this->roles]);

        return (int) $stmt->fetchColumn() > 0;
    }

    private function deny(int $status, string $message): ResponseInterface
    {
        $response = (new ResponseFactory())->createResponse($status);
        $response->getBody()->write(json_encode(['error' => $message], JSON_THROW_ON_ERROR));

        return $response->withHeader('Content-Type', 'application/json');
    }
}
