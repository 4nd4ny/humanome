<?php

declare(strict_types=1);

namespace Humanome\Tests;

use Humanome\Db;

/**
 * M7 — POST /api/admin/grant-role: pre-P12 operations tooling on the
 * X-Migrate-Token trust model (ADR-008). Only the seeded referentiel §2
 * roles are grantable; the grant is idempotent and effective immediately
 * (roles are re-read from the database on every request).
 */
final class AdminRolesTest extends PackagesTestCase
{
    private const TOKEN = 'test_migrate_token_0123456789abcdef';

    protected function setUp(): void
    {
        parent::setUp();
        TestDb::setEnv('MIGRATE_TOKEN', self::TOKEN);
    }

    private function grant(?array $body, ?string $token = self::TOKEN): \Psr\Http\Message\ResponseInterface
    {
        $headers = $token === null ? [] : ['X-Migrate-Token' => $token];

        return $this->requestWithHeaders('POST', '/admin/grant-role', $body, $headers);
    }

    /** @return array{0: int, 1: string} [userId, email] */
    private static function userWithEmail(): array
    {
        $userId = self::createUser(); // no role
        $email = (string) Db::get()
            ->query("SELECT email FROM users WHERE id = {$userId}")
            ->fetchColumn();

        return [$userId, $email];
    }

    public function testTokenGate(): void
    {
        [, $email] = self::userWithEmail();
        $body = ['email' => $email, 'role' => 'promptologue'];

        self::assertSame(403, $this->grant($body, null)->getStatusCode());
        self::assertSame(403, $this->grant($body, 'wrong_token')->getStatusCode());

        TestDb::setEnv('MIGRATE_TOKEN', '');
        self::assertSame(404, $this->grant($body)->getStatusCode());
    }

    public function testUnknownEmailIs404(): void
    {
        $response = $this->grant(['email' => 'inconnue@example.org', 'role' => 'promptologue']);
        self::assertSame(404, $response->getStatusCode());
    }

    public function testDeletedAccountIs404(): void
    {
        [$userId, $email] = self::userWithEmail();
        Db::get()->exec("UPDATE users SET deleted_at = NOW() WHERE id = {$userId}");

        self::assertSame(404, $this->grant(['email' => $email, 'role' => 'promptologue'])->getStatusCode());
    }

    public function testInvalidRoleIs422(): void
    {
        [, $email] = self::userWithEmail();

        // Unknown role, and "visiteur" (the absence of a session, cahier §2 —
        // deliberately NOT a grantable role).
        self::assertSame(422, $this->grant(['email' => $email, 'role' => 'superadmin'])->getStatusCode());
        self::assertSame(422, $this->grant(['email' => $email, 'role' => 'visiteur'])->getStatusCode());

        // Missing fields.
        self::assertSame(422, $this->grant(['email' => $email])->getStatusCode());
        self::assertSame(422, $this->grant(['role' => 'promptologue'])->getStatusCode());
        self::assertSame(422, $this->grant([])->getStatusCode());
    }

    public function testGrantIsEffectiveImmediatelyAndIdempotent(): void
    {
        self::importPackage();
        [$userId, $email] = self::userWithEmail();

        // Without the role, the promptologue workshop answers 403.
        self::loginAs($userId);
        self::assertSame(403, $this->request('GET', '/prompt-packages/drafts')->getStatusCode());

        $granted = $this->grant(['email' => $email, 'role' => 'promptologue']);
        self::assertSame(200, $granted->getStatusCode());
        self::assertSame(
            ['email' => $email, 'role' => 'promptologue', 'status' => 'granted'],
            self::body($granted),
        );

        // Effective on the very next request (roles re-read from the DB).
        self::assertSame(200, $this->request('GET', '/prompt-packages/drafts')->getStatusCode());

        // Idempotent re-grant.
        self::assertSame('unchanged', self::body(
            $this->grant(['email' => $email, 'role' => 'promptologue']),
        )['status']);
        $count = Db::get()->query(
            "SELECT COUNT(*) FROM user_roles WHERE user_id = {$userId}"
        )->fetchColumn();
        self::assertSame(1, (int) $count);
    }

    public function testGrantIsAudited(): void
    {
        [$userId, $email] = self::userWithEmail();

        self::assertSame(200, $this->grant(['email' => $email, 'role' => 'cartographe'])->getStatusCode());

        $row = Db::get()
            ->query("SELECT user_id, details FROM audit_events WHERE type = 'role_granted' ORDER BY id DESC LIMIT 1")
            ->fetch();
        self::assertNotFalse($row, 'a role grant must leave an audit_events row (§6.5)');

        // System action: no session actor, so user_id is NULL (like the other
        // X-Migrate-Token tooling).
        self::assertNull($row['user_id']);

        // assertEquals (not assertSame): MySQL JSON columns reorder object keys.
        $details = json_decode((string) $row['details'], true);
        self::assertEquals(
            ['targetUserId' => $userId, 'role' => 'cartographe', 'status' => 'granted'],
            $details,
        );

        // §6.5: ids and the whitelisted role name only — never the email.
        self::assertStringNotContainsStringIgnoringCase($email, (string) $row['details']);
    }
}
