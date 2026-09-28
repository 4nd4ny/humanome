<?php

declare(strict_types=1);

namespace Humanome\Tests\UseCases\Unit;

use Humanome\Cartographe\Garanties;
use Humanome\Cartographe\Links;
use Humanome\Cartographe\Revisions;
use Humanome\Tests\UseCases\Support\CarSupport;
use PDO;
use PHPUnit\Framework\Attributes\TestDox;
use PHPUnit\Framework\TestCase;

/**
 * UC-CAR-05 — Garantir une cartographie ou retirer sa garantie : tests UNITAIRES.
 *
 * Fiche : docs/cas-utilisation/cartographe/UC-CAR-05-garantir-cartographie.md
 *
 * Les classes sollicitées par POST/DELETE /api/cartographies/{id}/garantie
 * sont appelées directement : Garanties (pose transactionnelle, conflit entre
 * signataires, remplacement, retrait par le signataire), Revisions::belongsTo
 * (révision figée de CETTE cartographie) et Links::access (le propriétaire
 * n'est jamais « cartographe » de sa propre cartographie).
 */
final class UcCar05GarantirCartographieTest extends TestCase
{
    private static PDO $pdo;

    private int $maya;
    private int $carl;
    private int $rita;
    private int $cartoId;

    public static function setUpBeforeClass(): void
    {
        self::$pdo = CarSupport::freshPdo();
    }

    protected function setUp(): void
    {
        CarSupport::reset(self::$pdo);
        $this->maya = CarSupport::user(self::$pdo, 'Maya');
        $this->carl = CarSupport::user(self::$pdo, 'Carl', ['cartographe']);
        $this->rita = CarSupport::user(self::$pdo, 'Rita', ['cartographe']);
        CarSupport::link(self::$pdo, $this->maya, $this->carl);
        CarSupport::link(self::$pdo, $this->maya, $this->rita);
        $this->cartoId = CarSupport::carto(self::$pdo, $this->maya);
    }

    private function revision(?int $cartoId = null): int
    {
        return (new Revisions(self::$pdo))->create($cartoId ?? $this->cartoId, $this->carl, CarSupport::jourDocument(), null)['revisionId'];
    }

    #[TestDox('UC-CAR-05-U01 — pose : état figé {par, date, revisionId}, relu à l’identique')]
    public function testU01PoseFreezesTheSignature(): void
    {
        $garanties = new Garanties(self::$pdo);

        $base = $garanties->pose($this->cartoId, $this->carl, 'Carl', null);
        self::assertSame(['par', 'date', 'revisionId'], array_keys($base));
        self::assertSame('Carl', $base['par']);
        self::assertNull($base['revisionId'], 'document d’origine garanti');
        self::assertMatchesRegularExpression('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/', $base['date']);
        self::assertSame($base, $garanties->findForCartography($this->cartoId));

        $revisionId = $this->revision();
        $pinned = $garanties->pose($this->cartoId, $this->carl, 'Carl', $revisionId);
        self::assertSame($revisionId, $pinned['revisionId']);
    }

    #[TestDox('UC-CAR-05-U02 — pose par un AUTRE cartographe alors qu’une garantie tient → null, signature intacte')]
    public function testU02AnotherCartographeCannotOverwrite(): void
    {
        $garanties = new Garanties(self::$pdo);
        $revisionId = $this->revision(); // avant la pose : une révision postée après retirerait la garantie
        $garanties->pose($this->cartoId, $this->carl, 'Carl', null);

        self::assertNull($garanties->pose($this->cartoId, $this->rita, 'Rita', $revisionId));

        $row = self::$pdo->query('SELECT cartographe_id, par, revision_id FROM cartography_garanties')->fetchAll();
        self::assertCount(1, $row);
        self::assertSame($this->carl, (int) $row[0]['cartographe_id']);
        self::assertSame('Carl', $row[0]['par']);
        self::assertNull($row[0]['revision_id']);
    }

    #[TestDox('UC-CAR-05-U03 — re-pose par le MÊME cartographe → remplacement (une seule ligne, nouvelle cible, nouveau nom)')]
    public function testU03SameCartographeReplacesHisSignature(): void
    {
        $garanties = new Garanties(self::$pdo);
        $revisionId = $this->revision();
        $garanties->pose($this->cartoId, $this->carl, 'Carl', null);

        $replaced = $garanties->pose($this->cartoId, $this->carl, 'Carl D.', $revisionId);

        self::assertSame('Carl D.', $replaced['par']);
        self::assertSame($revisionId, $replaced['revisionId']);
        self::assertSame(1, CarSupport::count(self::$pdo, 'SELECT COUNT(*) FROM cartography_garanties'));
    }

    #[TestDox('UC-CAR-05-U04 — withdraw : le signataire seul ; autre ou rien à retirer → false')]
    public function testU04WithdrawBySignatoryOnly(): void
    {
        $garanties = new Garanties(self::$pdo);
        self::assertFalse($garanties->withdraw($this->cartoId, $this->carl), 'aucune garantie');
        $garanties->pose($this->cartoId, $this->carl, 'Carl', null);

        self::assertFalse($garanties->withdraw($this->cartoId, $this->rita));
        self::assertNotNull($garanties->findForCartography($this->cartoId));
        self::assertTrue($garanties->withdraw($this->cartoId, $this->carl));
        self::assertNull($garanties->findForCartography($this->cartoId));
        self::assertFalse($garanties->withdraw($this->cartoId, $this->carl));
    }

    #[TestDox('UC-CAR-05-U05 — Revisions::belongsTo : la révision figée doit appartenir à CETTE cartographie')]
    public function testU05RevisionMustBelongToTheCartography(): void
    {
        $autre = CarSupport::carto(self::$pdo, $this->maya);
        $mine = $this->revision();
        $foreign = $this->revision($autre);
        $revisions = new Revisions(self::$pdo);

        self::assertTrue($revisions->belongsTo($mine, $this->cartoId));
        self::assertFalse($revisions->belongsTo($foreign, $this->cartoId));
        self::assertFalse($revisions->belongsTo(999999, $this->cartoId));
    }

    #[TestDox('UC-CAR-05-U06 — Links::access : le propriétaire, même cartographe, reste « owner » (jamais garant de soi)')]
    public function testU06OwnerIsNeverCartographeOfHisOwnCartography(): void
    {
        $both = CarSupport::user(self::$pdo, 'Bea', ['apprenant', 'cartographe']);
        $own = CarSupport::carto(self::$pdo, $both);
        $links = new Links(self::$pdo);

        self::assertSame('owner', $links->access($own, $both, ['apprenant', 'cartographe'])['level']);
        self::assertSame('cartographe', $links->access($this->cartoId, $this->carl, ['cartographe'])['level']);
        self::assertNull($links->access($this->cartoId, $both, ['apprenant', 'cartographe']), 'non liée à Maya');
    }

    #[TestDox('UC-CAR-05-U07 — la garantie tombe avec la révision figée, la cartographie ou le compte du signataire (CASCADE)')]
    public function testU07GarantieCascades(): void
    {
        $garanties = new Garanties(self::$pdo);
        $revisionId = $this->revision();
        $garanties->pose($this->cartoId, $this->carl, 'Carl', $revisionId);
        self::$pdo->exec('DELETE FROM cartography_revisions WHERE id = ' . $revisionId);
        self::assertNull($garanties->findForCartography($this->cartoId), 'révision figée supprimée');

        $garanties->pose($this->cartoId, $this->carl, 'Carl', null);
        self::$pdo->exec('DELETE FROM users WHERE id = ' . $this->carl);
        self::assertNull($garanties->findForCartography($this->cartoId), 'signataire purgé');

        $garanties->pose($this->cartoId, $this->rita, 'Rita', null);
        self::$pdo->exec('DELETE FROM cartographies WHERE id = ' . $this->cartoId);
        self::assertSame(0, CarSupport::count(self::$pdo, 'SELECT COUNT(*) FROM cartography_garanties'), 'cartographie supprimée');
    }
}
