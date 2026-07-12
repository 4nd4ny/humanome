<?php

declare(strict_types=1);

namespace Humanome\Tests;

/**
 * Register / login / logout / me — nominal flows and validation (P3.2).
 */
final class AuthRoutesTest extends AuthTestBase
{
    public function testRegisterCreatesAccountWithApprenantRoleAndOpensSession(): void
    {
        $response = $this->register('newuser@example.org', self::PASSWORD, 'New User');

        self::assertSame(201, $response->getStatusCode());
        $body = self::json($response);
        self::assertSame('newuser@example.org', $body['user']['email']);
        self::assertSame('New User', $body['user']['displayName']);
        self::assertSame(['apprenant'], $body['user']['roles']);
        self::assertIsString($body['csrfToken']);
        self::assertSame(64, \strlen($body['csrfToken']));

        // Password stored hashed (Argon2id in the php:8.2 container).
        $stmt = self::$pdo->prepare('SELECT password_hash FROM users WHERE email = ?');
        $stmt->execute(['newuser@example.org']);
        $hash = (string) $stmt->fetchColumn();
        self::assertStringStartsWith('$argon2id$', $hash);
        self::assertTrue(password_verify(self::PASSWORD, $hash));

        // Session opened and bound to the new user (RGPD cascade on purge).
        self::assertNotNull($this->cookieSid);
        $stmt = self::$pdo->prepare('SELECT user_id FROM sessions WHERE id = ?');
        $stmt->execute([$this->cookieSid]);
        self::assertSame($body['user']['id'], (int) $stmt->fetchColumn());

        // Audit event, no content (cahier §6.5).
        $stmt = self::$pdo->prepare(
            'SELECT COUNT(*) FROM audit_events WHERE type = ? AND user_id = ?'
        );
        $stmt->execute(['account_created', $body['user']['id']]);
        self::assertSame(1, (int) $stmt->fetchColumn());
    }

    public function testRegisterValidatesEmailPasswordAndDisplayName(): void
    {
        $response = $this->request('POST', '/api/auth/register', [
            'email' => 'not-an-email',
            'password' => 'short',
            'displayName' => '',
        ]);

        self::assertSame(422, $response->getStatusCode());
        $fields = self::json($response)['fields'];
        self::assertArrayHasKey('email', $fields);
        self::assertArrayHasKey('password', $fields);
        self::assertArrayHasKey('displayName', $fields);
        // No session for a failed registration: visitor = no session.
        self::assertNull($this->cookieSid);
    }

    public function testRegisterRejectsPasswordShorterThanTenChars(): void
    {
        $response = $this->register('short-pass@example.org', '123456789');

        self::assertSame(422, $response->getStatusCode());
        self::assertArrayHasKey('password', self::json($response)['fields']);
    }

    public function testRegisterRejectsDuplicateEmail(): void
    {
        $first = $this->register('twice@example.org');
        self::assertSame(201, $first->getStatusCode());

        $this->cookieSid = null; // another browser
        $duplicate = $this->register('twice@example.org');

        self::assertSame(409, $duplicate->getStatusCode());
    }

    public function testLoginSucceedsAndRegeneratesSessionId(): void
    {
        $this->register('login-ok@example.org');
        $sidAfterRegister = $this->cookieSid;

        $response = $this->login('login-ok@example.org', self::PASSWORD);

        self::assertSame(200, $response->getStatusCode());
        $body = self::json($response);
        self::assertSame('login-ok@example.org', $body['user']['email']);
        self::assertSame(['apprenant'], $body['user']['roles']);
        self::assertIsString($body['csrfToken']);

        // Fixation protection: fresh session id, old row destroyed.
        self::assertNotNull($this->cookieSid);
        self::assertNotSame($sidAfterRegister, $this->cookieSid);
        $stmt = self::$pdo->prepare('SELECT COUNT(*) FROM sessions WHERE id = ?');
        $stmt->execute([$sidAfterRegister]);
        self::assertSame(0, (int) $stmt->fetchColumn());
    }

    public function testLoginRejectsWrongPassword(): void
    {
        $this->register('wrong-pass@example.org');
        $this->cookieSid = null;

        $response = $this->login('wrong-pass@example.org', 'definitely-not-the-password');

        self::assertSame(401, $response->getStatusCode());
        self::assertSame('Identifiants invalides', self::json($response)['error']);
        self::assertNull($this->cookieSid);
    }

    public function testLoginRejectsUnknownEmailWithSameMessage(): void
    {
        $response = $this->login('nobody@example.org', self::PASSWORD);

        self::assertSame(401, $response->getStatusCode());
        self::assertSame('Identifiants invalides', self::json($response)['error']);
    }

    public function testMeReturnsProfileRolesAndCsrfToken(): void
    {
        $register = $this->register('me@example.org', self::PASSWORD, 'Moi');
        $csrfToken = self::json($register)['csrfToken'];

        $response = $this->request('GET', '/api/auth/me');

        self::assertSame(200, $response->getStatusCode());
        $body = self::json($response);
        self::assertSame('me@example.org', $body['user']['email']);
        self::assertSame('Moi', $body['user']['displayName']);
        self::assertSame(['apprenant'], $body['user']['roles']);
        // Same session -> same token as the one delivered at opening.
        self::assertSame($csrfToken, $body['csrfToken']);
    }

    public function testMeWithoutSessionIsUnauthorized(): void
    {
        $response = $this->request('GET', '/api/auth/me');

        self::assertSame(401, $response->getStatusCode());
    }

    public function testLogoutDestroysSession(): void
    {
        $register = $this->register('logout@example.org');
        $csrfToken = self::json($register)['csrfToken'];
        $sid = $this->cookieSid;

        $logout = $this->request('POST', '/api/auth/logout', null, ['X-CSRF-Token' => $csrfToken]);
        self::assertSame(204, $logout->getStatusCode());

        // Session row purged server-side; stale cookie is now worthless.
        $stmt = self::$pdo->prepare('SELECT COUNT(*) FROM sessions WHERE id = ?');
        $stmt->execute([$sid]);
        self::assertSame(0, (int) $stmt->fetchColumn());

        $me = $this->request('GET', '/api/auth/me');
        self::assertSame(401, $me->getStatusCode());
    }

    public function testLogoutWithoutSessionIsUnauthorized(): void
    {
        $response = $this->request('POST', '/api/auth/logout');

        self::assertSame(401, $response->getStatusCode());
    }
}
