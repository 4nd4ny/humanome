<?php

declare(strict_types=1);

namespace Humanome\Tests;

/**
 * P9 — per-competence annotations: owner and linked cartographe may write
 * and read; deletion is author-only; every unauthorized access answers the
 * same 404 (IDOR matrix).
 */
final class AnnotationsTest extends CartographeTestCase
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

    /** @param array<string, mixed> $overrides */
    private static function annotation(array $overrides = []): array
    {
        return array_merge([
            'competenceCode' => '1.01',
            'type' => 'commentaire',
            'texte' => 'Belle progression sur cette compétence.',
        ], $overrides);
    }

    public function testOwnerAndLinkedCartographeAnnotateAndRead(): void
    {
        $mine = $this->as_($this->maya, 'POST', '/api/cartographies/' . $this->cartoId . '/annotations', self::annotation());
        self::assertSame(201, $mine->getStatusCode());

        $his = $this->as_($this->carl, 'POST', '/api/cartographies/' . $this->cartoId . '/annotations', self::annotation([
            'competenceCode' => '7.04',
            'type' => 'oubli',
            'texte' => 'Le passage du 5 janvier montre aussi 7.04, non cartographiée.',
        ]));
        self::assertSame(201, $his->getStatusCode());

        foreach ([$this->maya, $this->carl] as $reader) {
            $list = self::json($this->as_($reader, 'GET', '/api/cartographies/' . $this->cartoId . '/annotations'));
            self::assertCount(2, $list);
            self::assertSame('Maya', $list[0]['author']['displayName']);
            self::assertSame('commentaire', $list[0]['type']);
            self::assertSame('Carl', $list[1]['author']['displayName']);
            self::assertSame('oubli', $list[1]['type']);
            self::assertSame('7.04', $list[1]['competenceCode']);
        }
    }

    public function testValidationRejectsMalformedAnnotations(): void
    {
        $bad = [
            self::annotation(['competenceCode' => '8.01']), // pole out of range
            self::annotation(['competenceCode' => '1.1']),
            self::annotation(['competenceCode' => 'x']),
            self::annotation(['type' => 'bravo']),
            self::annotation(['texte' => '']),
            self::annotation(['texte' => str_repeat('a', 5001)]),
        ];
        foreach ($bad as $i => $body) {
            $response = $this->as_($this->carl, 'POST', '/api/cartographies/' . $this->cartoId . '/annotations', $body);
            self::assertSame(422, $response->getStatusCode(), 'case #' . $i);
        }
        self::assertSame(0, (int) self::$pdo->query('SELECT COUNT(*) FROM cartography_annotations')->fetchColumn());
    }

    public function testAccessMatrixCollapsesInto404(): void
    {
        // A stranger learner, an UNLINKED cartographe, and the linked
        // cartographe on a privee cartography: same 404 as a missing id.
        $zoe = $this->registerAs('zoe@example.org', 'Zoé');
        $rita = $this->registerAs('rita@example.org', 'Rita', ['cartographe']);
        $privee = $this->createCarto($this->maya, ['visibility' => 'privee']);

        $cases = [
            [$zoe, $this->cartoId],
            [$rita, $this->cartoId],
            [$this->carl, $privee],
            [$this->carl, 999999],
        ];
        foreach ($cases as $i => [$actor, $cartoId]) {
            $post = $this->as_($actor, 'POST', '/api/cartographies/' . $cartoId . '/annotations', self::annotation());
            self::assertSame(404, $post->getStatusCode(), 'POST case #' . $i);
            $get = $this->as_($actor, 'GET', '/api/cartographies/' . $cartoId . '/annotations');
            self::assertSame(404, $get->getStatusCode(), 'GET case #' . $i);
        }
        self::assertSame(0, (int) self::$pdo->query('SELECT COUNT(*) FROM cartography_annotations')->fetchColumn());

        // Visitor: 401 (no session at all).
        $this->cookieSid = null;
        self::assertSame(401, $this->request('GET', '/api/cartographies/' . $this->cartoId . '/annotations')->getStatusCode());
    }

    public function testDeletionIsAuthorOnly(): void
    {
        $id = (int) self::json(
            $this->as_($this->maya, 'POST', '/api/cartographies/' . $this->cartoId . '/annotations', self::annotation()),
        )['id'];

        // The linked cartographe reads it but cannot delete it.
        $foreign = $this->as_($this->carl, 'DELETE', '/api/annotations/' . $id);
        self::assertSame(404, $foreign->getStatusCode());
        self::assertSame(1, (int) self::$pdo->query('SELECT COUNT(*) FROM cartography_annotations')->fetchColumn());

        $own = $this->as_($this->maya, 'DELETE', '/api/annotations/' . $id);
        self::assertSame(204, $own->getStatusCode());
        self::assertSame(0, (int) self::$pdo->query('SELECT COUNT(*) FROM cartography_annotations')->fetchColumn());

        $again = $this->as_($this->maya, 'DELETE', '/api/annotations/' . $id);
        self::assertSame(404, $again->getStatusCode());
    }

    public function testAnnotationMutationsRequireCsrf(): void
    {
        $this->cookieSid = $this->carl['sid'];
        $noToken = $this->request('POST', '/api/cartographies/' . $this->cartoId . '/annotations', self::annotation());
        self::assertSame(403, $noToken->getStatusCode());
        self::assertStringContainsString('CSRF', (string) $noToken->getBody());
    }
}
