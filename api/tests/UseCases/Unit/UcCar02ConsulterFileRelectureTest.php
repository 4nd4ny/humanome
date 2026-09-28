<?php

declare(strict_types=1);

namespace Humanome\Tests\UseCases\Unit;

use Humanome\Cartographe\Annotations;
use Humanome\Cartographe\Garanties;
use Humanome\Cartographe\Links;
use Humanome\Cartographe\Revisions;
use Humanome\Tests\UseCases\Support\CarSupport;
use PDO;
use PHPUnit\Framework\Attributes\TestDox;
use PHPUnit\Framework\TestCase;

/**
 * UC-CAR-02 — Consulter sa file de relecture : tests UNITAIRES.
 *
 * Fiche : docs/cas-utilisation/cartographe/UC-CAR-02-consulter-file-relecture.md
 *
 * Les classes sollicitées par GET /api/cartographe/cartographies et
 * GET /api/cartographe/cartographies/{id} sont appelées directement : Links
 * (file = projection de métadonnées, détail = document si lien + visibilité)
 * et les trois listes qui composent la vue de relecture (Annotations,
 * Revisions, Garanties).
 */
final class UcCar02ConsulterFileRelectureTest extends TestCase
{
    private static PDO $pdo;

    private int $maya;
    private int $noe;
    private int $zoe;
    private int $carl;

    public static function setUpBeforeClass(): void
    {
        self::$pdo = CarSupport::freshPdo();
    }

    protected function setUp(): void
    {
        CarSupport::reset(self::$pdo);
        $this->maya = CarSupport::user(self::$pdo, 'Maya');
        $this->noe = CarSupport::user(self::$pdo, 'Noé');
        $this->zoe = CarSupport::user(self::$pdo, 'Zoé');
        $this->carl = CarSupport::user(self::$pdo, 'Carl', ['cartographe']);
        CarSupport::link(self::$pdo, $this->maya, $this->carl);
        CarSupport::link(self::$pdo, $this->noe, $this->carl);
    }

    #[TestDox('UC-CAR-02-U01 — queueFor : apprentis liés, visibilité cartographe|publique, plus récente d’abord')]
    public function testU01QueueScopeAndOrder(): void
    {
        $privee = CarSupport::carto(self::$pdo, $this->maya, 'privee');
        $pourMoi = CarSupport::carto(self::$pdo, $this->maya, 'cartographe', 'jour', null, 'Pour mon cartographe');
        $publique = CarSupport::carto(self::$pdo, $this->maya, 'publique', 'merge', null, 'Parcours public');
        $noeCarto = CarSupport::carto(self::$pdo, $this->noe, 'cartographe', 'jour', null, 'Feuille de Noé');
        CarSupport::carto(self::$pdo, $this->zoe, 'publique'); // apprenante non liée
        // Dates maîtrisées : l'ordre suit updated_at, puis l'id.
        self::$pdo->exec("UPDATE cartographies SET updated_at = '2026-07-01 10:00:00' WHERE id = {$publique}");
        self::$pdo->exec("UPDATE cartographies SET updated_at = '2026-07-03 10:00:00' WHERE id = {$pourMoi}");
        self::$pdo->exec("UPDATE cartographies SET updated_at = '2026-07-03 10:00:00' WHERE id = {$noeCarto}");

        $queue = (new Links(self::$pdo))->queueFor($this->carl);

        self::assertSame([$noeCarto, $pourMoi, $publique], array_column($queue, 'id'));
        self::assertNotContains($privee, array_column($queue, 'id'));
        self::assertSame(['cartographe', 'cartographe', 'publique'], array_column($queue, 'visibility'));
        self::assertSame(['Noé', 'Maya', 'Maya'], array_column(array_column($queue, 'apprenant'), 'displayName'));
        self::assertSame('2026-07-03T10:00:00', $queue[1]['updatedAt']);
        self::assertSame([], (new Links(self::$pdo))->queueFor($this->maya), 'hors lien, file vide');
    }

    #[TestDox('UC-CAR-02-U02 — queueFor : métadonnées seulement (jamais le document), compteurs et garantie')]
    public function testU02QueueProjectionCarriesCountersNeverTheDocument(): void
    {
        $cartoId = CarSupport::carto(self::$pdo, $this->maya);
        (new Annotations(self::$pdo))->create($cartoId, $this->carl, '1.01', 'hallucination', 'Pièce introuvable.');
        (new Annotations(self::$pdo))->create($cartoId, $this->maya, '1.03', 'commentaire', 'Je précise.');
        ['revisionId' => $revisionId] = (new Revisions(self::$pdo))->create($cartoId, $this->carl, CarSupport::jourDocument(), 'Corrigée');
        (new Garanties(self::$pdo))->pose($cartoId, $this->carl, 'Carl', $revisionId);

        [$entry] = (new Links(self::$pdo))->queueFor($this->carl);

        self::assertSame(
            ['id', 'type', 'titre', 'visibility', 'createdAt', 'updatedAt', 'apprenant', 'annotations', 'revisions', 'garantie'],
            array_keys($entry),
        );
        self::assertSame(2, $entry['annotations']);
        self::assertSame(1, $entry['revisions']);
        self::assertSame(['par', 'date'], array_keys($entry['garantie']));
        self::assertSame('Carl', $entry['garantie']['par']);
        self::assertStringNotContainsString('cartographie-jour', json_encode($entry, JSON_THROW_ON_ERROR));
    }

    #[TestDox('UC-CAR-02-U03 — findForCartographe : document décodé si lien ET visibilité, sinon null (cas indiscernables)')]
    public function testU03FindForCartographeRequiresLinkAndVisibility(): void
    {
        $visible = CarSupport::carto(self::$pdo, $this->maya, 'publique', 'jour', null, 'Visible');
        $privee = CarSupport::carto(self::$pdo, $this->maya, 'privee');
        $horsLien = CarSupport::carto(self::$pdo, $this->zoe, 'cartographe');
        $rita = CarSupport::user(self::$pdo, 'Rita', ['cartographe']);
        $links = new Links(self::$pdo);

        $carto = $links->findForCartographe($visible, $this->carl);
        self::assertNotNull($carto);
        self::assertSame('Visible', $carto['titre']);
        self::assertSame('publique', $carto['visibility']);
        self::assertSame(['id' => $this->maya, 'displayName' => 'Maya'], $carto['apprenant']);
        self::assertEquals(CarSupport::jourDocument(), $carto['document']); // colonne JSON : ordre des clés non garanti

        self::assertNull($links->findForCartographe($privee, $this->carl), 'privée');
        self::assertNull($links->findForCartographe($horsLien, $this->carl), 'apprenante non liée');
        self::assertNull($links->findForCartographe($visible, $rita), 'autre cartographe, non lié');
        self::assertNull($links->findForCartographe(999999, $this->carl), 'inconnue');
    }

    #[TestDox('UC-CAR-02-U04 — isLinked : lien orienté apprenant -> cartographe')]
    public function testU04IsLinkedIsDirectional(): void
    {
        $links = new Links(self::$pdo);

        self::assertTrue($links->isLinked($this->maya, $this->carl));
        self::assertFalse($links->isLinked($this->carl, $this->maya));
        self::assertFalse($links->isLinked($this->zoe, $this->carl));
    }

    #[TestDox('UC-CAR-02-U05 — vue de relecture : annotations (ordre de saisie), révisions (récentes d’abord, sans document), garantie')]
    public function testU05ReviewViewListsAndGarantieShape(): void
    {
        $cartoId = CarSupport::carto(self::$pdo, $this->maya);
        self::assertNull((new Garanties(self::$pdo))->findForCartography($cartoId));

        $a1 = (new Annotations(self::$pdo))->create($cartoId, $this->carl, '2.01', 'commentaire', 'Premier.');
        $a2 = (new Annotations(self::$pdo))->create($cartoId, $this->maya, '1.01', 'oubli', 'Second.');
        $revisions = new Revisions(self::$pdo);
        ['revisionId' => $r1] = $revisions->create($cartoId, $this->carl, CarSupport::jourDocument(), 'v1');
        ['revisionId' => $r2] = $revisions->create($cartoId, $this->carl, CarSupport::jourDocument(), null);
        (new Garanties(self::$pdo))->pose($cartoId, $this->carl, 'Carl', $r2);

        self::assertSame([$a1, $a2], array_column((new Annotations(self::$pdo))->listForCartography($cartoId), 'id'));
        $meta = $revisions->listForCartography($cartoId);
        self::assertSame([$r2, $r1], array_column($meta, 'id'));
        self::assertSame(['id', 'note', 'author', 'createdAt'], array_keys($meta[0]));
        self::assertNull($meta[0]['note']);
        self::assertSame('v1', $meta[1]['note']);

        $garantie = (new Garanties(self::$pdo))->findForCartography($cartoId);
        self::assertSame(['par', 'date', 'revisionId'], array_keys($garantie));
        self::assertSame($r2, $garantie['revisionId']);
        self::assertMatchesRegularExpression('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/', $garantie['date']);
    }
}
