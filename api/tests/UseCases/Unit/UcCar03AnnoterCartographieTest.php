<?php

declare(strict_types=1);

namespace Humanome\Tests\UseCases\Unit;

use Humanome\Cartographe\Annotations;
use Humanome\Cartographe\Links;
use Humanome\Tests\UseCases\Support\CarSupport;
use PDO;
use PHPUnit\Framework\Attributes\TestDox;
use PHPUnit\Framework\TestCase;

/**
 * UC-CAR-03 — Annoter une cartographie : tests UNITAIRES.
 *
 * Fiche : docs/cas-utilisation/cartographe/UC-CAR-03-annoter-cartographie.md
 *
 * Les classes sollicitées par POST/GET /api/cartographies/{id}/annotations et
 * DELETE /api/annotations/{annotationId} sont appelées directement :
 * Annotations (types admis, création, fil de relecture, suppression par
 * l'auteur) et Links::access (propriétaire OU cartographe lié).
 */
final class UcCar03AnnoterCartographieTest extends TestCase
{
    private static PDO $pdo;

    private int $maya;
    private int $carl;

    public static function setUpBeforeClass(): void
    {
        self::$pdo = CarSupport::freshPdo();
    }

    protected function setUp(): void
    {
        CarSupport::reset(self::$pdo);
        $this->maya = CarSupport::user(self::$pdo, 'Maya');
        $this->carl = CarSupport::user(self::$pdo, 'Carl', ['cartographe']);
        CarSupport::link(self::$pdo, $this->maya, $this->carl);
    }

    #[TestDox('UC-CAR-03-U01 — Annotations::TYPES : commentaire, hallucination, oubli (et rien d’autre)')]
    public function testU01AnnotationTypes(): void
    {
        self::assertSame(['commentaire', 'hallucination', 'oubli'], Annotations::TYPES);
    }

    #[TestDox('UC-CAR-03-U02 — create + listForCartography : fil dans l’ordre de saisie, auteur nommé, date ISO')]
    public function testU02CreateAndListTheReviewTrail(): void
    {
        $cartoId = CarSupport::carto(self::$pdo, $this->maya);
        $autre = CarSupport::carto(self::$pdo, $this->maya);
        $annotations = new Annotations(self::$pdo);

        $first = $annotations->create($cartoId, $this->carl, '1.03', 'hallucination', 'Extrait absent de la feuille.');
        $second = $annotations->create($cartoId, $this->maya, '1.03', 'commentaire', 'La note existe, je la joins.');
        $annotations->create($autre, $this->carl, '2.01', 'oubli', 'Sur une autre cartographie.');

        $trail = $annotations->listForCartography($cartoId);

        self::assertSame([$first, $second], array_column($trail, 'id'));
        self::assertSame(['id', 'competenceCode', 'type', 'texte', 'author', 'createdAt'], array_keys($trail[0]));
        self::assertSame('1.03', $trail[0]['competenceCode']);
        self::assertSame('hallucination', $trail[0]['type']);
        self::assertSame(['id' => $this->carl, 'displayName' => 'Carl'], $trail[0]['author']);
        self::assertSame(['id' => $this->maya, 'displayName' => 'Maya'], $trail[1]['author']);
        self::assertMatchesRegularExpression('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/', $trail[0]['createdAt']);
        self::assertSame([], $annotations->listForCartography(999999));
    }

    #[TestDox('UC-CAR-03-U03 — deleteForAuthor : l’auteur seul ; autrui ou inexistante → false, rien ne bouge')]
    public function testU03DeleteForAuthorOnly(): void
    {
        $cartoId = CarSupport::carto(self::$pdo, $this->maya);
        $annotations = new Annotations(self::$pdo);
        $his = $annotations->create($cartoId, $this->carl, '2.01', 'commentaire', 'Très juste.');
        $hers = $annotations->create($cartoId, $this->maya, '2.01', 'commentaire', 'Merci.');

        self::assertFalse($annotations->deleteForAuthor($his, $this->maya), 'la propriétaire ne supprime pas l’annotation du cartographe');
        self::assertFalse($annotations->deleteForAuthor(999999, $this->carl));
        self::assertCount(2, $annotations->listForCartography($cartoId));

        self::assertTrue($annotations->deleteForAuthor($his, $this->carl));
        self::assertFalse($annotations->deleteForAuthor($his, $this->carl), 'déjà supprimée');
        self::assertSame([$hers], array_column($annotations->listForCartography($cartoId), 'id'));
    }

    #[TestDox('UC-CAR-03-U04 — Links::access : propriétaire toujours ; cartographe lié + rôle + visibilité ouverte ; sinon null')]
    public function testU04AccessMatrix(): void
    {
        $jour = CarSupport::carto(self::$pdo, $this->maya, 'cartographe');
        $merge = CarSupport::carto(self::$pdo, $this->maya, 'publique', 'merge');
        $privee = CarSupport::carto(self::$pdo, $this->maya, 'privee');
        $rita = CarSupport::user(self::$pdo, 'Rita', ['cartographe']);
        $zoe = CarSupport::user(self::$pdo, 'Zoé');
        $links = new Links(self::$pdo);
        $asCartographe = ['cartographe'];

        self::assertSame(['level' => 'owner', 'type' => 'jour'], $links->access($jour, $this->maya, ['apprenant']));
        self::assertSame(['level' => 'owner', 'type' => 'jour'], $links->access($privee, $this->maya, ['apprenant']), 'le propriétaire garde l’accès en privée');
        self::assertSame(['level' => 'cartographe', 'type' => 'jour'], $links->access($jour, $this->carl, $asCartographe));
        self::assertSame(['level' => 'cartographe', 'type' => 'merge'], $links->access($merge, $this->carl, $asCartographe));

        self::assertNull($links->access($privee, $this->carl, $asCartographe), 'privée');
        self::assertNull($links->access($jour, $rita, $asCartographe), 'cartographe non lié');
        self::assertNull($links->access($jour, $this->carl, ['apprenant']), 'lien sans le rôle (rôle retiré)');
        self::assertNull($links->access($jour, $zoe, ['apprenant']), 'autre apprenante');
        self::assertNull($links->access(999999, $this->carl, $asCartographe), 'inconnue');
    }

    #[TestDox('UC-CAR-03-U05 — les annotations suivent la cartographie et leur auteur (CASCADE, RGPD)')]
    public function testU05AnnotationsCascadeWithCartographyAndAuthor(): void
    {
        $cartoId = CarSupport::carto(self::$pdo, $this->maya);
        $autre = CarSupport::carto(self::$pdo, $this->maya);
        $annotations = new Annotations(self::$pdo);
        $annotations->create($cartoId, $this->carl, '1.01', 'oubli', 'A.');
        $annotations->create($autre, $this->carl, '1.01', 'oubli', 'B.');
        $annotations->create($autre, $this->maya, '1.01', 'commentaire', 'C.');

        self::$pdo->exec('DELETE FROM cartographies WHERE id = ' . $cartoId);
        self::assertSame(2, CarSupport::count(self::$pdo, 'SELECT COUNT(*) FROM cartography_annotations'));

        self::$pdo->exec('DELETE FROM users WHERE id = ' . $this->carl);
        self::assertSame(['C.'], array_column($annotations->listForCartography($autre), 'texte'));
    }
}
