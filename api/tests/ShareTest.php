<?php

declare(strict_types=1);

namespace Humanome\Tests;

use Psr\Http\Message\ResponseInterface;

/**
 * P8 — employer share links (cahier §3.6): creation, public consultation
 * with right/wrong password, homogeneous anti-enumeration answers, simulated
 * expiration, revocation, per-IP rate limit, audit counters without content.
 */
final class ShareTest extends AuthTestBase
{
    private string $csrf = '';
    private int $cartoId = 0;

    protected function setUp(): void
    {
        parent::setUp();
        self::$pdo->exec('DELETE FROM users');
        self::$pdo->exec('DELETE FROM audit_events');

        $response = $this->register('maya@example.org', self::PASSWORD, 'Maya');
        $this->csrf = (string) self::json($response)['csrfToken'];

        $created = $this->request('POST', '/api/cartographies', [
            'type' => 'jour',
            'titre' => 'Feuille partagée',
            'visibility' => 'publique',
            'document' => ['kind' => 'cartographie-jour', 'date' => '2026-01-05', 'secret' => 'contenu-opt-in'],
        ], ['X-CSRF-Token' => $this->csrf]);
        self::assertSame(201, $created->getStatusCode());
        $this->cartoId = (int) self::json($created)['id'];
    }

    /** @return array{shareId: int, token: string, url: string} */
    private function createShare(array $overrides = []): array
    {
        $response = $this->request(
            'POST',
            '/api/cartographies/' . $this->cartoId . '/share',
            array_merge(['password' => 'sesame-employeur'], $overrides),
            ['X-CSRF-Token' => $this->csrf],
        );
        self::assertSame(201, $response->getStatusCode());

        /** @var array{shareId: int, token: string, url: string} */
        return self::json($response);
    }

    /** Public consultation: a fresh anonymous browser (no session cookie). */
    private function consult(string $token, string $password, string $ip = '198.51.100.7'): ResponseInterface
    {
        $previousSid = $this->cookieSid;
        $previousIp = $this->clientIp;
        $this->cookieSid = null;
        $this->clientIp = $ip;
        try {
            return $this->request('POST', '/api/share/' . $token, ['password' => $password]);
        } finally {
            $this->cookieSid = $previousSid;
            $this->clientIp = $previousIp;
        }
    }

    public function testCreateShareStoresOnlyHashes(): void
    {
        $share = $this->createShare(['expiresInDays' => 30]);
        self::assertMatchesRegularExpression('/^[0-9a-f]{32}$/', $share['token']);
        self::assertSame('/#/partage/' . $share['token'], $share['url']);

        $row = self::$pdo->query('SELECT * FROM share_links WHERE id = ' . $share['shareId'])->fetch();
        self::assertNotFalse($row);
        self::assertSame(hash('sha256', $share['token']), $row['token_hash']);
        self::assertStringNotContainsString($share['token'], (string) $row['password_hash']);
        self::assertNotSame('sesame-employeur', $row['password_hash'], 'password must be hashed');
        self::assertTrue(password_verify('sesame-employeur', (string) $row['password_hash']));
        self::assertNotNull($row['expires_at']);

        // Audit: event with ids only — no token, no password (§6.5).
        $audit = self::$pdo->query(
            "SELECT details FROM audit_events WHERE type = 'share_created'"
        )->fetchAll();
        self::assertCount(1, $audit);
        self::assertStringNotContainsString($share['token'], (string) $audit[0]['details']);
        self::assertStringNotContainsString('sesame', (string) $audit[0]['details']);
    }

    public function testCreateShareValidatesInput(): void
    {
        $short = $this->request('POST', '/api/cartographies/' . $this->cartoId . '/share', [
            'password' => 'court',
        ], ['X-CSRF-Token' => $this->csrf]);
        self::assertSame(422, $short->getStatusCode());

        $badDays = $this->request('POST', '/api/cartographies/' . $this->cartoId . '/share', [
            'password' => 'sesame-employeur',
            'expiresInDays' => 400,
        ], ['X-CSRF-Token' => $this->csrf]);
        self::assertSame(422, $badDays->getStatusCode());
    }

    public function testPublicConsultationHappyPath(): void
    {
        $share = $this->createShare();

        $response = $this->consult($share['token'], 'sesame-employeur');
        self::assertSame(200, $response->getStatusCode());
        $payload = self::json($response);
        self::assertSame('Feuille partagée', $payload['titre']);
        self::assertSame('jour', $payload['type']);
        self::assertSame('contenu-opt-in', $payload['document']['secret']);
        self::assertArrayHasKey('garantie', $payload);
        self::assertNull($payload['garantie'], 'garantie arrives with P9, field must exist and be null');

        // Monitoring : la consultation réussie laisse une trace d'audit avec
        // les ids seulement — pas de token, pas d'IP, pas de session (§6.5).
        $audit = self::$pdo->query(
            "SELECT user_id, details FROM audit_events WHERE type = 'share_consulted'"
        )->fetchAll();
        self::assertCount(1, $audit);
        self::assertNull($audit[0]['user_id']);
        $details = json_decode((string) $audit[0]['details'], true);
        self::assertSame($this->cartoId, $details['cartographieId']);
        self::assertSame($share['shareId'], $details['shareLinkId']);
        self::assertStringNotContainsString($share['token'], (string) $audit[0]['details']);
        self::assertStringNotContainsString('198.51.100', (string) $audit[0]['details']);
    }

    public function testWrongPasswordIs403(): void
    {
        $share = $this->createShare();
        $response = $this->consult($share['token'], 'mauvais-mot-de-passe');
        self::assertSame(403, $response->getStatusCode());
        self::assertStringNotContainsString('contenu-opt-in', (string) $response->getBody());
    }

    public function testUnknownExpiredAndRevokedAreOneHomogeneous404(): void
    {
        $share = $this->createShare();

        // Unknown token.
        $unknown = $this->consult(str_repeat('ab', 16), 'sesame-employeur', '198.51.100.11');
        self::assertSame(404, $unknown->getStatusCode());

        // Simulated expiration.
        self::$pdo->exec(
            'UPDATE share_links SET expires_at = DATE_SUB(NOW(), INTERVAL 1 DAY) WHERE id = ' . $share['shareId']
        );
        $expired = $this->consult($share['token'], 'sesame-employeur', '198.51.100.12');
        self::assertSame(404, $expired->getStatusCode());

        // Revocation.
        self::$pdo->exec('UPDATE share_links SET expires_at = DATE_ADD(NOW(), INTERVAL 30 DAY), revoked_at = NOW() WHERE id = ' . $share['shareId']);
        $revoked = $this->consult($share['token'], 'sesame-employeur', '198.51.100.13');
        self::assertSame(404, $revoked->getStatusCode());

        // Anti-enumeration: the three bodies are byte-identical.
        self::assertSame((string) $unknown->getBody(), (string) $expired->getBody());
        self::assertSame((string) $expired->getBody(), (string) $revoked->getBody());
        // And identical to the wrong-token status: no oracle on WHY it failed.
        self::assertStringNotContainsString('revo', strtolower((string) $revoked->getBody()));
    }

    public function testRevocationEndpoint(): void
    {
        $share = $this->createShare();

        $response = $this->request('DELETE', '/api/shares/' . $share['shareId'], null, ['X-CSRF-Token' => $this->csrf]);
        self::assertSame(204, $response->getStatusCode());
        $revokedAt = self::$pdo->query(
            'SELECT revoked_at FROM share_links WHERE id = ' . $share['shareId']
        )->fetchColumn();
        self::assertNotNull($revokedAt);

        $denied = $this->consult($share['token'], 'sesame-employeur', '198.51.100.14');
        self::assertSame(404, $denied->getStatusCode());

        $audit = self::$pdo->query(
            "SELECT COUNT(*) FROM audit_events WHERE type = 'share_revoked'"
        )->fetchColumn();
        self::assertSame(1, (int) $audit);

        // Revoking a foreign share: 404, nothing changes.
        $this->cookieSid = null;
        $intruderCsrf = (string) self::json($this->register('intru@example.org', self::PASSWORD, 'Intru'))['csrfToken'];
        $foreign = $this->request('DELETE', '/api/shares/' . $share['shareId'], null, ['X-CSRF-Token' => $intruderCsrf]);
        self::assertSame(404, $foreign->getStatusCode());
    }

    public function testListSharesOfOwnedCartography(): void
    {
        $first = $this->createShare();
        $this->createShare(['expiresInDays' => 5]);
        $this->request('DELETE', '/api/shares/' . $first['shareId'], null, ['X-CSRF-Token' => $this->csrf]);

        $response = $this->request('GET', '/api/cartographies/' . $this->cartoId . '/shares');
        self::assertSame(200, $response->getStatusCode());
        $list = self::json($response);
        self::assertCount(2, $list);
        self::assertNotNull($list[0]['revokedAt']);
        self::assertNull($list[1]['revokedAt']);
        foreach ($list as $item) {
            self::assertArrayNotHasKey('token', $item, 'clear token exists only in the 201 of creation');
            self::assertSame(['shareId', 'createdAt', 'expiresAt', 'revokedAt'], array_keys($item));
        }

        // Active share count surfaces in the cartography list.
        $cartos = self::json($this->request('GET', '/api/cartographies'));
        self::assertSame(1, $cartos[0]['shares']);
    }

    public function testPublicConsultationIsRateLimitedPerIp(): void
    {
        $share = $this->createShare();

        $status = 0;
        for ($i = 0; $i < 25; $i++) {
            $status = $this->consult($share['token'], 'mauvais', '203.0.113.99')->getStatusCode();
            if ($status === 429) {
                break;
            }
        }
        self::assertSame(429, $status, 'brute force must hit the per-IP limit');

        // Another IP is unaffected.
        $other = $this->consult($share['token'], 'sesame-employeur', '203.0.113.100');
        self::assertSame(200, $other->getStatusCode());
    }
}
