<?php

declare(strict_types=1);

namespace Humanome\Tests;

/**
 * Register / login / logout / me — nominal flows and validation (P3.2).
 */
final class AuthRoutesTest extends AuthTestBase
{
    public function testRegisterCreatesPendingAccountWithoutSession(): void
    {
        // D5 : l'inscription crée un compte NON activé et n'ouvre PAS de session.
        $response = $this->registerPending('newuser@example.org', self::PASSWORD, 'New User');

        self::assertSame(201, $response->getStatusCode());
        $body = self::json($response);
        self::assertSame('pending_activation', $body['status']);
        self::assertSame('newuser@example.org', $body['email']);
        self::assertArrayNotHasKey('user', $body); // pas de session à l'inscription
        self::assertNull($this->cookieSid);

        // Compte en base, apprenant, NON activé, mot de passe hashé (Argon2id).
        $stmt = self::$pdo->prepare(
            'SELECT id, password_hash, email_verified_at FROM users WHERE email = ?'
        );
        $stmt->execute(['newuser@example.org']);
        $row = $stmt->fetch();
        self::assertNull($row['email_verified_at'], 'compte non activé tant que non confirmé');
        self::assertStringStartsWith('$argon2id$', (string) $row['password_hash']);
        self::assertSame(['apprenant'], \Humanome\Auth\Users::rolesOf(self::$pdo, (int) $row['id']));

        // Audit account_created, et un mail contenant le lien + le code en clair.
        $stmt = self::$pdo->prepare('SELECT COUNT(*) FROM audit_events WHERE type = ? AND user_id = ?');
        $stmt->execute(['account_created', (int) $row['id']]);
        self::assertSame(1, (int) $stmt->fetchColumn());
        self::assertStringContainsString('#/activer?email=', $this->mailer->lastBody());
        self::assertMatchesRegularExpression('/\b\d{4}\b/', $this->mailer->lastBody(), 'code en clair');
    }

    public function testActivateConfirmsEmailAndOpensSession(): void
    {
        self::assertSame(201, $this->registerPending('activate-me@example.org', self::PASSWORD, 'A')->getStatusCode());
        $code = $this->lastCode();
        self::assertMatchesRegularExpression('/^\d{4}$/', $code);

        $response = $this->activate('activate-me@example.org', $code);
        self::assertSame(200, $response->getStatusCode(), (string) $response->getBody());
        $body = self::json($response);
        self::assertSame('activate-me@example.org', $body['user']['email']);
        self::assertSame(['apprenant'], $body['user']['roles']);
        self::assertSame(64, \strlen($body['csrfToken']));

        // Session ouverte et liée au compte ; compte désormais activé.
        self::assertNotNull($this->cookieSid);
        $stmt = self::$pdo->prepare('SELECT user_id FROM sessions WHERE id = ?');
        $stmt->execute([$this->cookieSid]);
        self::assertSame($body['user']['id'], (int) $stmt->fetchColumn());
        $stmt = self::$pdo->prepare('SELECT email_verified_at, verification_code_hash FROM users WHERE email = ?');
        $stmt->execute(['activate-me@example.org']);
        $row = $stmt->fetch();
        self::assertNotNull($row['email_verified_at']);
        self::assertNull($row['verification_code_hash'], 'code effacé (usage unique)');
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
        $first = $this->registerPending('twice@example.org');
        self::assertSame(201, $first->getStatusCode());

        $duplicate = $this->registerPending('twice@example.org');
        self::assertSame(409, $duplicate->getStatusCode());
    }

    public function testRegisterRequiresMatchingDoubleEmail(): void
    {
        // D5 : double saisie divergente -> 422 sur emailConfirm, aucun compte créé.
        $response = $this->request('POST', '/api/auth/register', [
            'email' => 'mismatch@example.org',
            'emailConfirm' => 'autre@example.org',
            'password' => self::PASSWORD,
            'displayName' => 'Miss Match',
        ]);
        self::assertSame(422, $response->getStatusCode());
        self::assertArrayHasKey('emailConfirm', self::json($response)['fields']);
        $stmt = self::$pdo->prepare('SELECT COUNT(*) FROM users WHERE email = ?');
        $stmt->execute(['mismatch@example.org']);
        self::assertSame(0, (int) $stmt->fetchColumn());
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
