<?php

declare(strict_types=1);

namespace Humanome\Middleware;

use Humanome\Auth\Session;
use Humanome\Auth\Users;
use Humanome\Db;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\MiddlewareInterface;
use Psr\Http\Server\RequestHandlerInterface;
use Slim\Psr7\Factory\ResponseFactory;

/**
 * Role-based route guard (P3.3), matrix in docs/autorisations.md.
 *
 *     $app->get('/referentiel/drafts', $handler)
 *         ->add(RequireRole::any('epistemiarque', 'admin'));
 *
 * 401 without a session (visitor = no session, cahier §2), 403 without one of
 * the required roles. Roles are read from the database on every request so a
 * role change applies immediately. On success the request gains the
 * `userId` (int) and `roles` (list<string>) attributes.
 */
final class RequireRole implements MiddlewareInterface
{
    /** @param non-empty-list<string> $roles */
    private function __construct(private readonly array $roles)
    {
    }

    public static function any(string ...$roles): self
    {
        if ($roles === []) {
            throw new \InvalidArgumentException('RequireRole::any() needs at least one role');
        }

        return new self(array_values($roles));
    }

    public function process(ServerRequestInterface $request, RequestHandlerInterface $handler): ResponseInterface
    {
        if (!Db::isConfigured() || !Session::exists()) {
            return $this->json(401, 'Authentification requise');
        }

        Session::start();
        $userId = Session::userId();
        if ($userId === null) {
            return $this->json(401, 'Authentification requise');
        }

        $roles = Users::rolesOf(Db::get(), $userId);
        if (array_intersect($this->roles, $roles) === []) {
            return $this->json(403, 'Rôle insuffisant');
        }

        return $handler->handle(
            $request->withAttribute('userId', $userId)->withAttribute('roles', $roles)
        );
    }

    private function json(int $status, string $message): ResponseInterface
    {
        $response = (new ResponseFactory())->createResponse($status);
        $response->getBody()->write(json_encode(['error' => $message], JSON_THROW_ON_ERROR));

        return $response->withHeader('Content-Type', 'application/json');
    }
}
