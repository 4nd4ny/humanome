<?php

declare(strict_types=1);

namespace Humanome\Tests;

/**
 * P9 — the garantie (cahier §8: the mandatory human safeguard). Linked
 * cartographe ONLY (never the owner, never automatic), frozen state
 * {par, date, revisionId}, withdrawal by the same cartographe, and the
 * public share endpoint serving the garantie + the guaranteed revision's
 * document.
 */
final class CartographeGarantieTest extends CartographeTestCase
{
    /** @var array{id: int, csrf: string, sid: string} */
    private array $maya;
    /** @var array{id: int, csrf: string, sid: string} */
    private array $carl;
    private int $cartoId;

    protected function setUp(): void
    {
        parent::setUp();
        $this->maya = $this->registerAs('maya@example.org', 'Maya');
        $this->carl = $this->registerAs('carl@example.org', 'Carl', ['cartographe']);
        $this->link($this->maya, $this->carl);
        $this->cartoId = $this->createCarto($this->maya);
    }

    public function testLinkedCartographePosesTheGarantie(): void
    {
        $response = $this->as_($this->carl, 'POST', '/api/cartographies/' . $this->cartoId . '/garantie');
        self::assertSame(201, $response->getStatusCode());
        $garantie = self::json($response);
        self::assertSame('Carl', $garantie['par'], 'the display name is frozen at signature time');
        self::assertNull($garantie['revisionId'], 'no revision pinned: the base document is guaranteed');
        self::assertNotEmpty($garantie['date']);

        $audit = self::lastAudit('garantie_posee');
        self::assertNotNull($audit);
        self::assertSame($this->carl['id'], $audit['userId']);
        // assertEquals: the MySQL JSON type does not preserve key order.
        self::assertEquals(['cartographieId' => $this->cartoId, 'revisionId' => null], $audit['details']);

        // Visible in queue and review view.
        $queue = self::json($this->as_($this->carl, 'GET', '/api/cartographe/cartographies'));
        self::assertSame('Carl', $queue[0]['garantie']['par']);
        $detail = self::json($this->as_($this->carl, 'GET', '/api/cartographe/cartographies/' . $this->cartoId));
        self::assertSame('Carl', $detail['garantie']['par']);
    }

    public function testGarantiePinsARevisionOfThisCartographyOnly(): void
    {
        $revisionId = (int) self::json($this->as_($this->carl, 'POST', '/api/cartographies/' . $this->cartoId . '/revisions', [
            'document' => self::jourDocument(),
            'note' => 'Version corrigée',
        ]))['revisionId'];

        // A revision of ANOTHER cartography is refused.
        $otherCarto = $this->createCarto($this->maya, ['titre' => 'Autre feuille']);
        $foreign = $this->as_($this->carl, 'POST', '/api/cartographies/' . $otherCarto . '/garantie', [
            'revisionId' => $revisionId,
        ]);
        self::assertSame(422, $foreign->getStatusCode());

        $response = $this->as_($this->carl, 'POST', '/api/cartographies/' . $this->cartoId . '/garantie', [
            'revisionId' => $revisionId,
        ]);
        self::assertSame(201, $response->getStatusCode());
        self::assertSame($revisionId, self::json($response)['revisionId']);
        self::assertEquals( // MySQL JSON does not preserve key order
            ['cartographieId' => $this->cartoId, 'revisionId' => $revisionId],
            self::lastAudit('garantie_posee')['details'],
        );
    }

    public function testOwnerAndUnlinkedCartographeCannotGuarantee(): void
    {
        // The owner without the cartographe role: stopped by the role guard.
        self::assertSame(403, $this->as_($this->maya, 'POST', '/api/cartographies/' . $this->cartoId . '/garantie')->getStatusCode());

        // The owner WITH the cartographe role: still refused — one never
        // guarantees one's own cartography (cahier §8), homogeneous 404.
        self::setRoles($this->maya['id'], ['apprenant', 'cartographe']);
        self::assertSame(404, $this->as_($this->maya, 'POST', '/api/cartographies/' . $this->cartoId . '/garantie')->getStatusCode());

        // An UNLINKED cartographe: same 404 as a missing id.
        $rita = $this->registerAs('rita@example.org', 'Rita', ['cartographe']);
        self::assertSame(404, $this->as_($rita, 'POST', '/api/cartographies/' . $this->cartoId . '/garantie')->getStatusCode());
        self::assertSame(404, $this->as_($rita, 'POST', '/api/cartographies/999999/garantie')->getStatusCode());

        self::assertSame(0, (int) self::$pdo->query('SELECT COUNT(*) FROM cartography_garanties')->fetchColumn());
    }

    public function testOneStandingSignatureNotSilentlyReplacedByAnothers(): void
    {
        self::assertSame(201, $this->as_($this->carl, 'POST', '/api/cartographies/' . $this->cartoId . '/garantie')->getStatusCode());

        // A second linked cartographe cannot overwrite Carl's signature.
        $rita = $this->registerAs('rita@example.org', 'Rita', ['cartographe']);
        $this->link($this->maya, $rita);
        $conflict = $this->as_($rita, 'POST', '/api/cartographies/' . $this->cartoId . '/garantie');
        self::assertSame(409, $conflict->getStatusCode());

        // Carl re-posing replaces his own (e.g. onto a revision).
        $revisionId = (int) self::json($this->as_($this->carl, 'POST', '/api/cartographies/' . $this->cartoId . '/revisions', [
            'document' => self::jourDocument(),
        ]))['revisionId']; // note: this revision REMOVED the garantie
        $repose = $this->as_($this->carl, 'POST', '/api/cartographies/' . $this->cartoId . '/garantie', [
            'revisionId' => $revisionId,
        ]);
        self::assertSame(201, $repose->getStatusCode());
        self::assertSame(1, (int) self::$pdo->query('SELECT COUNT(*) FROM cartography_garanties')->fetchColumn());
    }

    public function testWithdrawalBelongsToTheSigningCartographe(): void
    {
        self::assertSame(201, $this->as_($this->carl, 'POST', '/api/cartographies/' . $this->cartoId . '/garantie')->getStatusCode());

        // Another linked cartographe cannot withdraw Carl's signature.
        $rita = $this->registerAs('rita@example.org', 'Rita', ['cartographe']);
        $this->link($this->maya, $rita);
        self::assertSame(404, $this->as_($rita, 'DELETE', '/api/cartographies/' . $this->cartoId . '/garantie')->getStatusCode());

        self::assertSame(204, $this->as_($this->carl, 'DELETE', '/api/cartographies/' . $this->cartoId . '/garantie')->getStatusCode());
        self::assertSame(0, (int) self::$pdo->query('SELECT COUNT(*) FROM cartography_garanties')->fetchColumn());

        $audit = self::lastAudit('garantie_retiree');
        self::assertSame($this->carl['id'], $audit['userId']);
        self::assertSame('retrait', $audit['details']['cause']);

        // Idempotence: nothing left to withdraw.
        self::assertSame(404, $this->as_($this->carl, 'DELETE', '/api/cartographies/' . $this->cartoId . '/garantie')->getStatusCode());
    }

    public function testPublicShareCarriesTheGarantieAndTheGuaranteedDocument(): void
    {
        // Employer share link on the cartography (owner action, M6).
        $share = $this->as_($this->maya, 'POST', '/api/cartographies/' . $this->cartoId . '/share', [
            'password' => 'sesame-employeur',
        ]);
        self::assertSame(201, $share->getStatusCode());
        $token = (string) self::json($share)['token'];

        $consult = function () use ($token): array {
            $this->cookieSid = null;
            $this->clientIp = '198.51.100.77';
            $response = $this->request('POST', '/api/share/' . $token, ['password' => 'sesame-employeur']);
            self::assertSame(200, $response->getStatusCode());

            return self::json($response);
        };

        // Before the garantie: field present and null (M6 behaviour kept).
        self::assertNull($consult()['garantie']);

        // Garantie on the BASE document: garantie served, base document kept.
        self::assertSame(201, $this->as_($this->carl, 'POST', '/api/cartographies/' . $this->cartoId . '/garantie')->getStatusCode());
        $base = $consult();
        self::assertSame('Carl', $base['garantie']['par']);
        self::assertNull($base['garantie']['revisionId']);
        self::assertSame([], $base['document']['poles'], 'base document still served (minimal fixture)');

        // Garantie pinned on a corrected REVISION: the share now serves THE
        // GUARANTEED revision's document (cahier §8), not the base one.
        $corrected = self::jourDocument();
        $revisionId = (int) self::json($this->as_($this->carl, 'POST', '/api/cartographies/' . $this->cartoId . '/revisions', [
            'document' => $corrected,
        ]))['revisionId'];
        self::assertSame(201, $this->as_($this->carl, 'POST', '/api/cartographies/' . $this->cartoId . '/garantie', [
            'revisionId' => $revisionId,
        ])->getStatusCode());

        $guaranteed = $consult();
        self::assertSame($revisionId, $guaranteed['garantie']['revisionId']);
        // assertEquals: the MySQL JSON type does not preserve key order.
        self::assertEquals($corrected, $guaranteed['document'], 'the SIGNED revision document is served');

        // Withdrawal: back to base document, garantie null again.
        self::assertSame(204, $this->as_($this->carl, 'DELETE', '/api/cartographies/' . $this->cartoId . '/garantie')->getStatusCode());
        $withdrawn = $consult();
        self::assertNull($withdrawn['garantie']);
        self::assertSame([], $withdrawn['document']['poles'], 'back to the base document');
    }
}
