<?php

declare(strict_types=1);

namespace Humanome\Tests;

/**
 * P9 — revisions: the correction history. Every stored document is
 * SERVER-VALIDATED against schemas/cartographie-<type> (422 with
 * pointer-keyed errors otherwise, type mismatch included), the metadata
 * list never carries documents, and a new revision on a guaranteed
 * cartography removes the garantie (cahier §8).
 */
final class CartographeRevisionsTest extends CartographeTestCase
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

    public function testLinkedCartographePostsASchemaValidRevision(): void
    {
        $document = self::jourDocument();
        $response = $this->as_($this->carl, 'POST', '/api/cartographies/' . $this->cartoId . '/revisions', [
            'document' => $document,
            'note' => 'Hallucination 1.03 retirée, verdict 7.04 ajouté.',
        ]);
        self::assertSame(201, $response->getStatusCode(), (string) $response->getBody());
        $revisionId = self::json($response)['revisionId'];
        self::assertIsInt($revisionId);

        // Metadata list: note + author, NEVER the document.
        $meta = self::json($this->as_($this->maya, 'GET', '/api/cartographies/' . $this->cartoId . '/revisions'));
        self::assertCount(1, $meta);
        self::assertSame($revisionId, $meta[0]['id']);
        self::assertSame('Hallucination 1.03 retirée, verdict 7.04 ajouté.', $meta[0]['note']);
        self::assertSame('Carl', $meta[0]['author']['displayName']);
        self::assertArrayNotHasKey('document', $meta[0]);

        // Single revision endpoint: the full stored document. assertEquals:
        // the MySQL JSON type does not preserve object key order.
        $full = self::json($this->as_($this->maya, 'GET', '/api/revisions/' . $revisionId));
        self::assertSame($this->cartoId, $full['cartographieId']);
        self::assertEquals($document, $full['document']);
    }

    public function testOwnerMayReviseTheirOwnCartography(): void
    {
        $response = $this->as_($this->maya, 'POST', '/api/cartographies/' . $this->cartoId . '/revisions', [
            'document' => self::jourDocument(),
        ]);
        self::assertSame(201, $response->getStatusCode());

        $meta = self::json($this->as_($this->carl, 'GET', '/api/cartographies/' . $this->cartoId . '/revisions'));
        self::assertSame('Maya', $meta[0]['author']['displayName']);
        self::assertNull($meta[0]['note']);
    }

    public function testSchemaInvalidDocumentIsRejected422(): void
    {
        $broken = self::jourDocument();
        unset($broken['poles']); // required by the schema
        $broken['date'] = 'pas-une-date';

        $response = $this->as_($this->carl, 'POST', '/api/cartographies/' . $this->cartoId . '/revisions', [
            'document' => $broken,
        ]);
        self::assertSame(422, $response->getStatusCode());
        $body = self::json($response);
        self::assertStringContainsString('cartographie-jour', $body['error']);
        self::assertNotEmpty($body['fields']);

        // Shape-level garbage is refused before schema validation.
        foreach ([['document' => 'texte'], ['document' => ['a', 'b']], []] as $i => $payload) {
            self::assertSame(
                422,
                $this->as_($this->carl, 'POST', '/api/cartographies/' . $this->cartoId . '/revisions', $payload)->getStatusCode(),
                'case #' . $i,
            );
        }
        self::assertSame(0, (int) self::$pdo->query('SELECT COUNT(*) FROM cartography_revisions')->fetchColumn());
    }

    public function testTypeMismatchIsRejected422(): void
    {
        // A merge cartography refuses a (valid) JOUR document: the revision
        // type must be identical to the cartography type (M7 contract) —
        // the schema's `kind` const enforces it.
        $mergeCarto = $this->createCarto($this->maya, ['type' => 'merge', 'titre' => 'Merge']);

        $response = $this->as_($this->carl, 'POST', '/api/cartographies/' . $mergeCarto . '/revisions', [
            'document' => self::jourDocument(),
        ]);
        self::assertSame(422, $response->getStatusCode());
        self::assertStringContainsString('cartographie-merge', self::json($response)['error']);
        self::assertSame(0, (int) self::$pdo->query('SELECT COUNT(*) FROM cartography_revisions')->fetchColumn());
    }

    public function testRevisionAccessMatrixCollapsesInto404(): void
    {
        $revisionId = (int) self::json($this->as_($this->carl, 'POST', '/api/cartographies/' . $this->cartoId . '/revisions', [
            'document' => self::jourDocument(),
        ]))['revisionId'];

        $zoe = $this->registerAs('zoe@example.org', 'Zoé');
        $rita = $this->registerAs('rita@example.org', 'Rita', ['cartographe']);

        foreach ([$zoe, $rita] as $i => $actor) {
            self::assertSame(404, $this->as_($actor, 'POST', '/api/cartographies/' . $this->cartoId . '/revisions', [
                'document' => self::jourDocument(),
            ])->getStatusCode(), 'POST case #' . $i);
            self::assertSame(
                404,
                $this->as_($actor, 'GET', '/api/cartographies/' . $this->cartoId . '/revisions')->getStatusCode(),
                'list case #' . $i,
            );
            self::assertSame(
                404,
                $this->as_($actor, 'GET', '/api/revisions/' . $revisionId)->getStatusCode(),
                'document case #' . $i,
            );
        }
        self::assertSame(404, $this->as_($this->carl, 'GET', '/api/revisions/999999')->getStatusCode());

        // Visibility back to privee: the revision document follows the
        // cartography — the linked cartographe loses it too.
        self::assertSame(200, $this->as_($this->maya, 'PATCH', '/api/cartographies/' . $this->cartoId, [
            'visibility' => 'privee',
        ])->getStatusCode());
        self::assertSame(404, $this->as_($this->carl, 'GET', '/api/revisions/' . $revisionId)->getStatusCode());
        // ... while the owner keeps the full history.
        self::assertSame(200, $this->as_($this->maya, 'GET', '/api/revisions/' . $revisionId)->getStatusCode());
    }

    public function testNewRevisionRemovesTheStandingGarantie(): void
    {
        // Garantie posed by the linked cartographe...
        self::assertSame(201, $this->as_($this->carl, 'POST', '/api/cartographies/' . $this->cartoId . '/garantie')->getStatusCode());
        self::assertSame(1, (int) self::$pdo->query('SELECT COUNT(*) FROM cartography_garanties')->fetchColumn());

        // ... then the OWNER posts a new revision: the guaranteed state no
        // longer reflects the document — the garantie must fall (cahier §8).
        $response = $this->as_($this->maya, 'POST', '/api/cartographies/' . $this->cartoId . '/revisions', [
            'document' => self::jourDocument(),
            'note' => 'Correction après garantie',
        ]);
        self::assertSame(201, $response->getStatusCode());

        self::assertSame(0, (int) self::$pdo->query('SELECT COUNT(*) FROM cartography_garanties')->fetchColumn());
        $audit = self::lastAudit('garantie_retiree');
        self::assertNotNull($audit);
        self::assertSame($this->maya['id'], $audit['userId']);
        self::assertSame('nouvelle_revision', $audit['details']['cause']);
        self::assertSame($this->cartoId, $audit['details']['cartographieId']);

        // The review view agrees.
        $detail = self::json($this->as_($this->carl, 'GET', '/api/cartographe/cartographies/' . $this->cartoId));
        self::assertNull($detail['garantie']);
        self::assertCount(1, $detail['revisions']);
    }
}
