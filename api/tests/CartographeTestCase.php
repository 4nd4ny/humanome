<?php

declare(strict_types=1);

namespace Humanome\Tests;

use Psr\Http\Message\ResponseInterface;

/**
 * Shared plumbing for the P9 cartographe tests: multi-account browser
 * simulation (each account keeps its session cookie + CSRF token), role
 * arrangement via SQL (pattern ReferentielTestCase::createUser), invitation
 * flow helper and real schema fixtures.
 */
abstract class CartographeTestCase extends AuthTestBase
{
    protected function setUp(): void
    {
        parent::setUp();
        self::$pdo->exec('DELETE FROM users');
        self::$pdo->exec('DELETE FROM audit_events');
    }

    /**
     * Registers an account through the API then arranges its roles via SQL.
     * Returns the acting identity {id, csrf, sid}.
     *
     * @param list<string> $roles final role set (register grants `apprenant`)
     * @return array{id: int, csrf: string, sid: string}
     */
    protected function registerAs(string $email, string $name, array $roles = ['apprenant']): array
    {
        $this->cookieSid = null;
        $response = $this->register($email, self::PASSWORD, $name);
        self::assertSame(201, $response->getStatusCode(), 'register ' . $email);
        $body = self::json($response);

        $userId = (int) $body['user']['id'];
        self::setRoles($userId, $roles);

        return [
            'id' => $userId,
            'csrf' => (string) $body['csrfToken'],
            'sid' => (string) $this->cookieSid,
        ];
    }

    /** @param list<string> $roles */
    protected static function setRoles(int $userId, array $roles): void
    {
        self::$pdo->prepare('DELETE FROM user_roles WHERE user_id = ?')->execute([$userId]);
        $bind = self::$pdo->prepare(
            'INSERT INTO user_roles (user_id, role_id) SELECT ?, id FROM roles WHERE name = ?'
        );
        foreach ($roles as $role) {
            $bind->execute([$userId, $role]);
        }
    }

    /**
     * One request AS the given account (session cookie + CSRF on mutations).
     *
     * @param array{id: int, csrf: string, sid: string} $user
     * @param array<string, mixed>|null $body
     */
    protected function as_(array $user, string $method, string $path, ?array $body = null): ResponseInterface
    {
        $this->cookieSid = $user['sid'];
        $headers = \in_array($method, ['POST', 'PUT', 'PATCH', 'DELETE'], true)
            ? ['X-CSRF-Token' => $user['csrf']]
            : [];

        return $this->request($method, $path, $body, $headers);
    }

    /**
     * Opt-in cartography for the account; 'cartographe' visibility default
     * (the P9 queue subject).
     *
     * @param array{id: int, csrf: string, sid: string} $owner
     * @param array<string, mixed> $overrides
     */
    protected function createCarto(array $owner, array $overrides = []): int
    {
        $response = $this->as_($owner, 'POST', '/api/cartographies', array_merge([
            'type' => 'jour',
            'titre' => 'Feuille à relire',
            'visibility' => 'cartographe',
            'document' => ['kind' => 'cartographie-jour', 'date' => '2026-01-05', 'poles' => []],
        ], $overrides));
        self::assertSame(201, $response->getStatusCode(), (string) $response->getBody());

        return (int) self::json($response)['id'];
    }

    /**
     * Full invitation flow through the API: the learner mints a code, the
     * cartographe accepts it.
     *
     * @param array{id: int, csrf: string, sid: string} $apprenant
     * @param array{id: int, csrf: string, sid: string} $cartographe
     */
    protected function link(array $apprenant, array $cartographe): void
    {
        $created = $this->as_($apprenant, 'POST', '/api/cartographe/invitations');
        self::assertSame(201, $created->getStatusCode());
        $code = (string) self::json($created)['code'];

        $accepted = $this->as_($cartographe, 'POST', '/api/cartographe/invitations/' . $code . '/accept');
        self::assertSame(201, $accepted->getStatusCode(), (string) $accepted->getBody());
    }

    /** @return array<string, mixed> real, schema-valid cartographie-jour document */
    protected static function jourDocument(): array
    {
        $path = dirname(__DIR__, 2) . '/schemas/fixtures/cartographie-jour-2026-01-05.json';
        self::assertFileExists($path);

        return json_decode((string) file_get_contents($path), true, 512, JSON_THROW_ON_ERROR);
    }

    /** Latest audit event of a type: [user_id, details] or null. */
    protected static function lastAudit(string $type): ?array
    {
        $stmt = self::$pdo->prepare(
            'SELECT user_id, details FROM audit_events WHERE type = ? ORDER BY id DESC LIMIT 1'
        );
        $stmt->execute([$type]);
        $row = $stmt->fetch();

        return $row === false
            ? null
            : [
                'userId' => $row['user_id'] === null ? null : (int) $row['user_id'],
                'details' => $row['details'] === null ? null : json_decode((string) $row['details'], true),
            ];
    }
}
