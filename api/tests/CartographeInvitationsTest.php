<?php

declare(strict_types=1);

namespace Humanome\Tests;

/**
 * P9 — apprenant <-> cartographe attachment: invitation codes (10 chars
 * A-Z2-9, 30 days, single use), acceptance creating the link, homogeneous
 * 404 on every unusable code, audit invitation_accepted (ids only).
 */
final class CartographeInvitationsTest extends CartographeTestCase
{
    public function testApprenantMintsACode(): void
    {
        $maya = $this->registerAs('maya@example.org', 'Maya');

        $response = $this->as_($maya, 'POST', '/api/cartographe/invitations');
        self::assertSame(201, $response->getStatusCode());
        $body = self::json($response);
        self::assertMatchesRegularExpression('/^[A-Z2-9]{10}$/', $body['code']);
        self::assertArrayHasKey('expiresAt', $body);

        // 30-day validity, stamped server-side.
        $days = self::$pdo->query(
            'SELECT DATEDIFF(expires_at, created_at) FROM cartographe_invitations'
        )->fetchColumn();
        self::assertSame(30, (int) $days);

        $list = self::json($this->as_($maya, 'GET', '/api/cartographe/invitations'));
        self::assertCount(1, $list);
        self::assertSame($body['code'], $list[0]['code']);
        self::assertSame('en_attente', $list[0]['statut']);
        self::assertNull($list[0]['acceptedBy']);
    }

    public function testInvitationRoutesRequireTheRightRole(): void
    {
        // Visitor: 401.
        $this->cookieSid = null;
        self::assertSame(401, $this->request('POST', '/api/cartographe/invitations')->getStatusCode());
        self::assertSame(401, $this->request('GET', '/api/cartographe/invitations')->getStatusCode());

        // Pure cartographe (no apprenant role): 403 on minting.
        $carl = $this->registerAs('carl@example.org', 'Carl', ['cartographe']);
        self::assertSame(403, $this->as_($carl, 'POST', '/api/cartographe/invitations')->getStatusCode());

        // Pure apprenant: 403 on accepting.
        $maya = $this->registerAs('maya@example.org', 'Maya');
        $code = (string) self::json($this->as_($maya, 'POST', '/api/cartographe/invitations'))['code'];
        self::assertSame(
            403,
            $this->as_($maya, 'POST', '/api/cartographe/invitations/' . $code . '/accept')->getStatusCode(),
        );
    }

    public function testMutationRequiresCsrf(): void
    {
        $maya = $this->registerAs('maya@example.org', 'Maya');
        $this->cookieSid = $maya['sid'];

        $noToken = $this->request('POST', '/api/cartographe/invitations');
        self::assertSame(403, $noToken->getStatusCode());
        self::assertStringContainsString('CSRF', (string) $noToken->getBody());
    }

    public function testPendingCodesAreCapped(): void
    {
        $maya = $this->registerAs('maya@example.org', 'Maya');
        for ($i = 0; $i < 10; $i++) {
            self::assertSame(201, $this->as_($maya, 'POST', '/api/cartographe/invitations')->getStatusCode());
        }

        $overflow = $this->as_($maya, 'POST', '/api/cartographe/invitations');
        self::assertSame(429, $overflow->getStatusCode());
    }

    public function testAcceptCreatesTheLinkAndAuditsIdsOnly(): void
    {
        $maya = $this->registerAs('maya@example.org', 'Maya');
        $carl = $this->registerAs('carl@example.org', 'Carl', ['cartographe']);

        $code = (string) self::json($this->as_($maya, 'POST', '/api/cartographe/invitations'))['code'];
        $accepted = $this->as_($carl, 'POST', '/api/cartographe/invitations/' . $code . '/accept');
        self::assertSame(201, $accepted->getStatusCode());
        self::assertSame(
            ['id' => $maya['id'], 'displayName' => 'Maya'],
            self::json($accepted)['apprenant'],
        );

        // The link exists.
        self::assertSame(1, (int) self::$pdo->query(
            'SELECT COUNT(*) FROM cartographe_links
              WHERE apprenant_id = ' . $maya['id'] . ' AND cartographe_id = ' . $carl['id']
        )->fetchColumn());

        // Both sides observe it.
        $apprentis = self::json($this->as_($carl, 'GET', '/api/cartographe/apprentis'));
        self::assertCount(1, $apprentis);
        self::assertSame('Maya', $apprentis[0]['displayName']);

        $invitations = self::json($this->as_($maya, 'GET', '/api/cartographe/invitations'));
        self::assertSame('acceptee', $invitations[0]['statut']);
        self::assertSame('Carl', $invitations[0]['acceptedBy']);

        // Audit: ids only — never the code, never a name (§6.5).
        $audit = self::lastAudit('invitation_accepted');
        self::assertNotNull($audit);
        self::assertSame($carl['id'], $audit['userId']);
        self::assertSame(['apprenantId' => $maya['id']], $audit['details']);
        self::assertStringNotContainsString($code, json_encode($audit['details'], JSON_THROW_ON_ERROR));
    }

    public function testUnusableCodesCollapseIntoOneHomogeneous404(): void
    {
        $maya = $this->registerAs('maya@example.org', 'Maya');
        $carl = $this->registerAs('carl@example.org', 'Carl', ['cartographe']);
        $rita = $this->registerAs('rita@example.org', 'Rita', ['cartographe']);

        // Unknown (well-formed) and malformed codes.
        $unknown = $this->as_($carl, 'POST', '/api/cartographe/invitations/ZZZZZZZZZZ/accept');
        self::assertSame(404, $unknown->getStatusCode());
        $malformed = $this->as_($carl, 'POST', '/api/cartographe/invitations/abc/accept');
        self::assertSame(404, $malformed->getStatusCode());
        self::assertSame((string) $unknown->getBody(), (string) $malformed->getBody());

        // Expired code: same 404, same body.
        $code = (string) self::json($this->as_($maya, 'POST', '/api/cartographe/invitations'))['code'];
        self::$pdo->exec(
            "UPDATE cartographe_invitations SET expires_at = DATE_SUB(NOW(), INTERVAL 1 DAY)
              WHERE code = '{$code}'"
        );
        $expired = $this->as_($carl, 'POST', '/api/cartographe/invitations/' . $code . '/accept');
        self::assertSame(404, $expired->getStatusCode());
        self::assertSame((string) $unknown->getBody(), (string) $expired->getBody());
        $list = self::json($this->as_($maya, 'GET', '/api/cartographe/invitations'));
        self::assertSame('expiree', $list[0]['statut']);

        // Single use: an accepted code answers the same 404 to the next taker.
        $code2 = (string) self::json($this->as_($maya, 'POST', '/api/cartographe/invitations'))['code'];
        self::assertSame(201, $this->as_($carl, 'POST', '/api/cartographe/invitations/' . $code2 . '/accept')->getStatusCode());
        $reused = $this->as_($rita, 'POST', '/api/cartographe/invitations/' . $code2 . '/accept');
        self::assertSame(404, $reused->getStatusCode());
        self::assertSame((string) $unknown->getBody(), (string) $reused->getBody());
        self::assertSame(0, (int) self::$pdo->query(
            'SELECT COUNT(*) FROM cartographe_links WHERE cartographe_id = ' . $rita['id']
        )->fetchColumn());
    }

    public function testNoSelfLink(): void
    {
        // Maya wears both hats: she still cannot become her own safeguard.
        $maya = $this->registerAs('maya@example.org', 'Maya', ['apprenant', 'cartographe']);
        $code = (string) self::json($this->as_($maya, 'POST', '/api/cartographe/invitations'))['code'];

        $self = $this->as_($maya, 'POST', '/api/cartographe/invitations/' . $code . '/accept');
        self::assertSame(404, $self->getStatusCode());
        self::assertSame(0, (int) self::$pdo->query('SELECT COUNT(*) FROM cartographe_links')->fetchColumn());
    }

    public function testAcceptingASecondCodeFromTheSameLearnerIsIdempotent(): void
    {
        $maya = $this->registerAs('maya@example.org', 'Maya');
        $carl = $this->registerAs('carl@example.org', 'Carl', ['cartographe']);

        $this->link($maya, $carl);
        $this->link($maya, $carl); // second invitation, same pair

        self::assertSame(1, (int) self::$pdo->query('SELECT COUNT(*) FROM cartographe_links')->fetchColumn());
        self::assertCount(1, self::json($this->as_($carl, 'GET', '/api/cartographe/apprentis')));
    }
}
