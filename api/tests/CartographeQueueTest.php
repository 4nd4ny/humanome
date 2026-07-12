<?php

declare(strict_types=1);

namespace Humanome\Tests;

/**
 * P9 — the cartographe's reading queue and review view. ACCESS INVARIANT:
 * only the cartographies of HIS linked learners, only in visibility
 * 'cartographe'/'publique'; everything else answers the same 404 (IDOR).
 */
final class CartographeQueueTest extends CartographeTestCase
{
    /** @var array{id: int, csrf: string, sid: string} */
    private array $maya;
    /** @var array{id: int, csrf: string, sid: string} */
    private array $carl;

    protected function setUp(): void
    {
        parent::setUp();
        $this->maya = $this->registerAs('maya@example.org', 'Maya');
        $this->carl = $this->registerAs('carl@example.org', 'Carl', ['cartographe']);
        $this->link($this->maya, $this->carl);
    }

    public function testQueueListsOnlyConsultableCartosOfLinkedLearners(): void
    {
        $this->createCarto($this->maya, ['titre' => 'Privée', 'visibility' => 'privee']);
        $forCartographe = $this->createCarto($this->maya, ['titre' => 'Pour mon cartographe']);
        $publique = $this->createCarto($this->maya, ['titre' => 'Publique', 'visibility' => 'publique', 'type' => 'merge']);

        // An UNLINKED learner with an exposed cartography must never surface.
        $zoe = $this->registerAs('zoe@example.org', 'Zoé');
        $this->createCarto($zoe, ['titre' => 'Hors périmètre']);

        $response = $this->as_($this->carl, 'GET', '/api/cartographe/cartographies');
        self::assertSame(200, $response->getStatusCode());
        $queue = self::json($response);

        self::assertSame(
            [$publique, $forCartographe],
            array_column($queue, 'id'),
            'newest first, privee and unlinked learners excluded',
        );
        foreach ($queue as $item) {
            self::assertArrayNotHasKey('document', $item, 'the queue projection must NEVER carry a document');
            self::assertSame(['id' => $this->maya['id'], 'displayName' => 'Maya'], $item['apprenant']);
            self::assertSame(0, $item['annotations']);
            self::assertSame(0, $item['revisions']);
            self::assertNull($item['garantie']);
        }
        self::assertStringNotContainsString('cartographie-jour', (string) $response->getBody());
    }

    public function testQueueRoutesRequireTheCartographeRole(): void
    {
        $this->cookieSid = null;
        self::assertSame(401, $this->request('GET', '/api/cartographe/cartographies')->getStatusCode());
        self::assertSame(401, $this->request('GET', '/api/cartographe/apprentis')->getStatusCode());

        // A pure apprenant is refused even on his own cartography's id.
        $id = $this->createCarto($this->maya);
        self::assertSame(403, $this->as_($this->maya, 'GET', '/api/cartographe/cartographies')->getStatusCode());
        self::assertSame(403, $this->as_($this->maya, 'GET', '/api/cartographe/cartographies/' . $id)->getStatusCode());
    }

    public function testDetailCarriesDocumentAnnotationsRevisionsGarantie(): void
    {
        $id = $this->createCarto($this->maya);
        self::assertSame(201, $this->as_($this->carl, 'POST', '/api/cartographies/' . $id . '/annotations', [
            'competenceCode' => '1.01',
            'type' => 'hallucination',
            'texte' => 'Ce passage ne mentionne pas cette compétence.',
        ])->getStatusCode());

        $response = $this->as_($this->carl, 'GET', '/api/cartographe/cartographies/' . $id);
        self::assertSame(200, $response->getStatusCode());
        $carto = self::json($response);

        self::assertSame('cartographie-jour', $carto['document']['kind']);
        self::assertSame(['id' => $this->maya['id'], 'displayName' => 'Maya'], $carto['apprenant']);
        self::assertCount(1, $carto['annotations']);
        self::assertSame('hallucination', $carto['annotations'][0]['type']);
        self::assertSame([], $carto['revisions']);
        self::assertNull($carto['garantie']);
    }

    public function testDetailIdorMatrix(): void
    {
        // Unknown id, privee cartography, and an unlinked learner's
        // cartography: three identical 404s for the linked cartographe.
        $privee = $this->createCarto($this->maya, ['visibility' => 'privee']);
        $zoe = $this->registerAs('zoe@example.org', 'Zoé');
        $zoeCarto = $this->createCarto($zoe);

        $unknown = $this->as_($this->carl, 'GET', '/api/cartographe/cartographies/999999');
        self::assertSame(404, $unknown->getStatusCode());
        foreach ([$privee, $zoeCarto] as $id) {
            $response = $this->as_($this->carl, 'GET', '/api/cartographe/cartographies/' . $id);
            self::assertSame(404, $response->getStatusCode());
            self::assertSame((string) $unknown->getBody(), (string) $response->getBody());
        }
    }

    public function testVisibilityFlipRevokesAccessImmediately(): void
    {
        $id = $this->createCarto($this->maya);
        self::assertSame(200, $this->as_($this->carl, 'GET', '/api/cartographe/cartographies/' . $id)->getStatusCode());

        // The learner stays in control (§6): back to privee, access is gone.
        self::assertSame(200, $this->as_($this->maya, 'PATCH', '/api/cartographies/' . $id, [
            'visibility' => 'privee',
        ])->getStatusCode());

        self::assertSame(404, $this->as_($this->carl, 'GET', '/api/cartographe/cartographies/' . $id)->getStatusCode());
        self::assertCount(0, self::json($this->as_($this->carl, 'GET', '/api/cartographe/cartographies')));
    }
}
