<?php

declare(strict_types=1);

namespace Humanome\Tests;

/**
 * Global CSRF middleware (P3.3): double-submit token on mutating methods,
 * delivered by /api/auth/me and at session opening.
 */
final class AuthCsrfTest extends AuthTestBase
{
    public function testMutatingRequestWithoutCsrfHeaderIsForbidden(): void
    {
        $this->register('csrf-missing@example.org');

        $response = $this->request('DELETE', '/api/auth/account'); // no header

        self::assertSame(403, $response->getStatusCode());
        self::assertSame('Jeton CSRF absent ou invalide', self::json($response)['error']);

        // The protected action did NOT run.
        $stmt = self::$pdo->prepare('SELECT COUNT(*) FROM users WHERE email = ?');
        $stmt->execute(['csrf-missing@example.org']);
        self::assertSame(1, (int) $stmt->fetchColumn());
    }

    public function testMutatingRequestWithWrongCsrfTokenIsForbidden(): void
    {
        $this->register('csrf-wrong@example.org');

        $response = $this->request('POST', '/api/auth/logout', null, [
            'X-CSRF-Token' => str_repeat('0', 64),
        ]);

        self::assertSame(403, $response->getStatusCode());
    }

    public function testMutatingRequestWithValidCsrfTokenPasses(): void
    {
        $register = $this->register('csrf-ok@example.org');
        $csrfToken = self::json($register)['csrfToken'];

        $response = $this->request('POST', '/api/auth/logout', null, [
            'X-CSRF-Token' => $csrfToken,
        ]);

        self::assertSame(204, $response->getStatusCode());
    }

    public function testTokenDeliveredByMeIsAccepted(): void
    {
        $this->register('csrf-me@example.org');

        $me = $this->request('GET', '/api/auth/me');
        $csrfToken = self::json($me)['csrfToken'];

        $response = $this->request('POST', '/api/auth/logout', null, [
            'X-CSRF-Token' => $csrfToken,
        ]);
        self::assertSame(204, $response->getStatusCode());
    }

    public function testVisitorWithoutSessionIsNotBlockedByCsrf(): void
    {
        // No cookie: the middleware lets the request through (no ambient
        // credentials to ride), the route itself answers 401.
        $response = $this->request('POST', '/api/auth/logout');

        self::assertSame(401, $response->getStatusCode());
    }

    public function testLoginAndRegisterAreExemptFromCsrf(): void
    {
        // A logged-in session exists, yet login needs no CSRF header.
        $this->register('csrf-exempt@example.org');

        $login = $this->login('csrf-exempt@example.org', self::PASSWORD);

        self::assertSame(200, $login->getStatusCode());
    }

    public function testCsrfTokenIsNotAcceptedAcrossSessions(): void
    {
        $register = $this->register('csrf-session-a@example.org');
        $tokenA = self::json($register)['csrfToken'];

        // Fresh login = new session = new token; the old one must die.
        $this->login('csrf-session-a@example.org', self::PASSWORD);

        $response = $this->request('POST', '/api/auth/logout', null, [
            'X-CSRF-Token' => $tokenA,
        ]);
        self::assertSame(403, $response->getStatusCode());
    }
}
