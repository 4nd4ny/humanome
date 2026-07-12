<?php

declare(strict_types=1);

namespace Humanome\Tests;

/**
 * P8 x RGPD (cahier §6.3): DELETE /api/auth/account must purge EVERYTHING
 * the P8 modules attached to the account — cartographies (and their
 * share_links transitively), training progress, encrypted API keys — through
 * the FK cascades of migrations 004/005, while audit_events survive
 * anonymized (user_id SET NULL). Cross-checks P3's purge against the M6 data.
 */
final class CartographiesPurgeTest extends AuthTestBase
{
    private const MASTER_KEY_HEX = '5c33e1adf102b31eecd94f4a2cbb02950a72c8b072b71c78a771b5c752769a26';

    protected function setUp(): void
    {
        parent::setUp();
        self::$pdo->exec('DELETE FROM users');
        self::$pdo->exec('DELETE FROM audit_events');
        TestDb::setEnv('SODIUM_MASTER_KEY', self::MASTER_KEY_HEX);
    }

    public function testAccountDeletionPurgesEveryP8Table(): void
    {
        $registered = $this->register('maya@example.org', self::PASSWORD, 'Maya');
        $csrf = (string) self::json($registered)['csrfToken'];
        $userId = (int) self::json($registered)['user']['id'];

        // Populate every P8 surface through the API itself.
        $carto = $this->request('POST', '/api/cartographies', [
            'type' => 'jour',
            'titre' => 'À purger',
            'visibility' => 'privee',
            'document' => ['kind' => 'cartographie-jour', 'date' => '2026-01-05'],
        ], ['X-CSRF-Token' => $csrf]);
        self::assertSame(201, $carto->getStatusCode());
        $cartoId = (int) self::json($carto)['id'];

        $share = $this->request('POST', '/api/cartographies/' . $cartoId . '/share', [
            'password' => 'sesame-employeur',
        ], ['X-CSRF-Token' => $csrf]);
        self::assertSame(201, $share->getStatusCode());
        $token = (string) self::json($share)['token'];

        self::assertSame(200, $this->request('PUT', '/api/training/progress', [
            'parcours' => 'apprenant', 'chapitre' => '01-bien-rediger', 'completed' => true,
        ], ['X-CSRF-Token' => $csrf])->getStatusCode());

        self::assertSame(204, $this->request('PUT', '/api/keys', [
            'provider' => 'anthropic', 'apiKey' => 'sk-ant-EXEMPLE-0123456789',
        ], ['X-CSRF-Token' => $csrf])->getStatusCode());

        // A second account proves the purge is scoped.
        $mayaSid = $this->cookieSid;
        $this->cookieSid = null;
        $otherCsrf = (string) self::json($this->register('other@example.org', self::PASSWORD, 'Other'))['csrfToken'];
        self::assertSame(201, $this->request('POST', '/api/cartographies', [
            'type' => 'merge',
            'titre' => 'Conservée',
            'visibility' => 'privee',
            'document' => ['kind' => 'cartographie-merge'],
        ], ['X-CSRF-Token' => $otherCsrf])->getStatusCode());

        // Purge Maya.
        $this->cookieSid = $mayaSid;
        $deleted = $this->request('DELETE', '/api/auth/account', null, ['X-CSRF-Token' => $csrf]);
        self::assertSame(204, $deleted->getStatusCode());

        $count = fn (string $sql): int => (int) self::$pdo->query($sql)->fetchColumn();
        self::assertSame(0, $count('SELECT COUNT(*) FROM cartographies WHERE user_id = ' . $userId));
        self::assertSame(0, $count(
            'SELECT COUNT(*) FROM share_links s JOIN cartographies c ON c.id = s.cartographie_id
              WHERE c.user_id = ' . $userId
        ));
        self::assertSame(0, $count('SELECT COUNT(*) FROM share_links')); // only Maya had links
        self::assertSame(0, $count('SELECT COUNT(*) FROM training_progress WHERE user_id = ' . $userId));
        self::assertSame(0, $count('SELECT COUNT(*) FROM user_api_keys WHERE user_id = ' . $userId));

        // The other account's data survives.
        self::assertSame(1, $count('SELECT COUNT(*) FROM cartographies'));

        // The share link is dead for the public too (homogeneous 404).
        $this->cookieSid = null;
        $this->clientIp = '198.51.100.42';
        $public = $this->request('POST', '/api/share/' . $token, ['password' => 'sesame-employeur']);
        self::assertSame(404, $public->getStatusCode());

        // Audit trail: dated, anonymized (user_id NULL), content-free.
        $audit = self::$pdo->query(
            "SELECT user_id, details FROM audit_events WHERE type = 'account_deleted'"
        )->fetch();
        self::assertNotFalse($audit);
        self::assertNull($audit['user_id'], 'purge must anonymize the audit event (FK SET NULL)');
        $shareCreated = self::$pdo->query(
            "SELECT user_id FROM audit_events WHERE type = 'share_created'"
        )->fetch();
        self::assertNotFalse($shareCreated);
        self::assertNull($shareCreated['user_id']);
    }
}
