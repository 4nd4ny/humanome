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
 *     $app->put('/twin9/admin/protocole/{name}', $handler)
 *         ->add(RequireRole::all('admin', 'promptologue')); // les DEUX rôles
 *
 * 401 without a session (visitor = no session, cahier §2), 403 without the
 * required role(s): `any()` needs at least ONE of them, `all()` needs EVERY one
 * (conjunction — AD-D2, l'édition des gabarits Twin9 exige admin ∧ promptologue).
 * Roles are read from the database on every request so a role change applies
 * immediately. On success the request gains the `userId` (int) and `roles`
 * (list<string>) attributes.
 */
final class RequireRole implements MiddlewareInterface
{
    /**
     * @param non-empty-list<string> $roles
     * @param bool $requireAll true = the user must hold EVERY role (conjunction)
     */
    private function __construct(private readonly array $roles, private readonly bool $requireAll = false)
    {
    }

    public static function any(string ...$roles): self
    {
        if ($roles === []) {
            throw new \InvalidArgumentException('RequireRole::any() needs at least one role');
        }

        return new self(array_values($roles), false);
    }

    /** Conjunction: the session must hold ALL of these roles (AD-D2). */
    public static function all(string ...$roles): self
    {
        if ($roles === []) {
            throw new \InvalidArgumentException('RequireRole::all() needs at least one role');
        }

        return new self(array_values($roles), true);
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
        $ok = $this->requireAll
            ? array_diff($this->roles, $roles) === []
            : array_intersect($this->roles, $roles) !== [];
        if (!$ok) {
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
