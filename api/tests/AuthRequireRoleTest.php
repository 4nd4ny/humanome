<?php

declare(strict_types=1);

namespace Humanome\Tests;

use Humanome\Middleware\RequireRole;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use Slim\App;
use Slim\Factory\AppFactory;

/**
 * RequireRole middleware (P3.3): 401 without session, 403 without role,
 * 200 with one of the required roles (visitor = no session, cahier §2).
 */
final class AuthRequireRoleTest extends AuthTestBase
{
    /** Minimal app exposing a route guarded like P4 will guard editing. */
    private function protectedApp(): App
    {
        $app = AppFactory::create();
        $app->setBasePath('/api');
        $app->addRoutingMiddleware();

        $app->get('/protected', function (Request $request, Response $response): Response {
            $response->getBody()->write(json_encode([
                'userId' => $request->getAttribute('userId'),
                'roles' => $request->getAttribute('roles'),
            ], JSON_THROW_ON_ERROR));

            return $response->withHeader('Content-Type', 'application/json');
        })->add(RequireRole::any('epistemiarque', 'admin'));

        return $app;
    }

    public function testWithoutSessionRespondsUnauthorized(): void
    {
        $response = $this->request('GET', '/api/protected', null, [], $this->protectedApp());

        self::assertSame(401, $response->getStatusCode());
        self::assertSame('Authentification requise', self::json($response)['error']);
    }

    public function testWithSessionButWrongRoleRespondsForbidden(): void
    {
        $this->register('only-apprenant@example.org'); // default role: apprenant

        $response = $this->request('GET', '/api/protected', null, [], $this->protectedApp());

        self::assertSame(403, $response->getStatusCode());
        self::assertSame('Rôle insuffisant', self::json($response)['error']);
    }

    public function testWithMatchingRoleRespondsOkAndExposesAttributes(): void
    {
        $register = $this->register('future-admin@example.org');
        $userId = self::json($register)['user']['id'];

        // Role granted after registration: read fresh from DB, effective
        // immediately, no re-login needed.
        self::$pdo->prepare(
            'INSERT INTO user_roles (user_id, role_id)
             SELECT ?, id FROM roles WHERE name = ?'
        )->execute([$userId, 'admin']);

        $response = $this->request('GET', '/api/protected', null, [], $this->protectedApp());

        self::assertSame(200, $response->getStatusCode());
        $body = self::json($response);
        self::assertSame($userId, $body['userId']);
        self::assertSame(['admin', 'apprenant'], $body['roles']);
    }

    public function testStaleSessionOfPurgedUserRespondsForbidden(): void
    {
        $register = $this->register('purged-role@example.org');
        $userId = self::json($register)['user']['id'];

        // Roles revoked: the very next request is already forbidden.
        self::$pdo->prepare('DELETE FROM user_roles WHERE user_id = ?')->execute([$userId]);

        $response = $this->request('GET', '/api/protected', null, [], $this->protectedApp());

        self::assertSame(403, $response->getStatusCode());
    }

    public function testAnyRequiresAtLeastOneRole(): void
    {
        $this->expectException(\InvalidArgumentException::class);

        RequireRole::any();
    }
}
