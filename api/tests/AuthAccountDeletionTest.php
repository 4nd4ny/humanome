<?php

declare(strict_types=1);

namespace Humanome\Tests;

/**
 * DELETE /api/auth/account — RGPD purge (P3.4, cahier §6.3): real deletion
 * across every user-owned table, anonymized audit trace kept.
 */
final class AuthAccountDeletionTest extends AuthTestBase
{
    public function testAccountDeletionPurgesEverythingAndKeepsAnonymizedAudit(): void
    {
        $register = $this->register('purge-me@example.org', self::PASSWORD, 'Purge Me');
        $body = self::json($register);
        $userId = (int) $body['user']['id'];
        $csrfToken = $body['csrfToken'];
        $sid = $this->cookieSid;

        // Give the account data in every user-owned table.
        self::$pdo->prepare(
            "INSERT INTO cartographies (user_id, type, titre) VALUES (?, 'jour', 'Test')"
        )->execute([$userId]);
        $cartoId = (int) self::$pdo->lastInsertId();
        self::$pdo->prepare(
            'INSERT INTO share_links (cartographie_id, token_hash, password_hash) VALUES (?, ?, ?)'
        )->execute([$cartoId, str_repeat('a', 64), password_hash('x', PASSWORD_DEFAULT)]);
        self::$pdo->prepare(
            "INSERT INTO training_progress (user_id, parcours, chapitre) VALUES (?, 'apprenant', 'intro')"
        )->execute([$userId]);
        self::$pdo->prepare(
            "INSERT INTO user_api_keys (user_id, provider, encrypted_key) VALUES (?, 'anthropic', 'blob')"
        )->execute([$userId]);

        $response = $this->request('DELETE', '/api/auth/account', null, [
            'X-CSRF-Token' => $csrfToken,
        ]);
        self::assertSame(204, $response->getStatusCode());

        // Real purge: SELECTs come back empty everywhere (cahier §6.3).
        $counts = [
            'users' => 'SELECT COUNT(*) FROM users WHERE id = ' . $userId,
            'user_roles' => 'SELECT COUNT(*) FROM user_roles WHERE user_id = ' . $userId,
            'sessions' => 'SELECT COUNT(*) FROM sessions WHERE user_id = ' . $userId,
            'cartographies' => 'SELECT COUNT(*) FROM cartographies WHERE user_id = ' . $userId,
            'share_links' => 'SELECT COUNT(*) FROM share_links WHERE cartographie_id = ' . $cartoId,
            'training_progress' => 'SELECT COUNT(*) FROM training_progress WHERE user_id = ' . $userId,
            'user_api_keys' => 'SELECT COUNT(*) FROM user_api_keys WHERE user_id = ' . $userId,
        ];
        foreach ($counts as $table => $sql) {
            self::assertSame(0, (int) self::$pdo->query($sql)->fetchColumn(), "$table not purged");
        }
        $stmt = self::$pdo->prepare('SELECT COUNT(*) FROM users WHERE email = ?');
        $stmt->execute(['purge-me@example.org']);
        self::assertSame(0, (int) $stmt->fetchColumn());

        // The session row itself is gone; the stale cookie is worthless.
        $stmt = self::$pdo->prepare('SELECT COUNT(*) FROM sessions WHERE id = ?');
        $stmt->execute([$sid]);
        self::assertSame(0, (int) $stmt->fetchColumn());
        self::assertSame(401, $this->request('GET', '/api/auth/me')->getStatusCode());

        // Audit trail preserved, anonymized: both events exist, user_id NULL
        // (FK SET NULL), and details carry no personal data.
        $events = self::$pdo->query(
            "SELECT type, user_id, details FROM audit_events
             WHERE type IN ('account_created', 'account_deleted') ORDER BY id"
        )->fetchAll();
        self::assertCount(2, $events);
        self::assertSame('account_created', $events[0]['type']);
        self::assertSame('account_deleted', $events[1]['type']);
        foreach ($events as $event) {
            self::assertNull($event['user_id']);
            self::assertStringNotContainsString(
                'purge-me@example.org',
                (string) ($event['details'] ?? '')
            );
        }
    }

    public function testAccountDeletionRequiresASession(): void
    {
        $response = $this->request('DELETE', '/api/auth/account');

        self::assertSame(401, $response->getStatusCode());
    }

    public function testDeletedAccountCanNoLongerLogIn(): void
    {
        $register = $this->register('gone@example.org');
        $csrfToken = self::json($register)['csrfToken'];

        $this->request('DELETE', '/api/auth/account', null, ['X-CSRF-Token' => $csrfToken]);

        $this->cookieSid = null;
        $login = $this->login('gone@example.org', self::PASSWORD);
        self::assertSame(401, $login->getStatusCode());
    }
}
