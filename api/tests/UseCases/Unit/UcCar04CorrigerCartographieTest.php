<?php

declare(strict_types=1);

namespace Humanome\Tests\UseCases\Unit;

use Humanome\Cartographe\Garanties;
use Humanome\Cartographe\Revisions;
use Humanome\Tests\UseCases\Support\CarSupport;
use Humanome\Validation;
use InvalidArgumentException;
use PDO;
use PHPUnit\Framework\Attributes\TestDox;
use PHPUnit\Framework\TestCase;

/**
 * UC-CAR-04 — Corriger une cartographie (révision) : tests UNITAIRES.
 *
 * Fiche : docs/cas-utilisation/cartographe/UC-CAR-04-corriger-cartographie.md
 *
 * Les classes sollicitées par POST/GET /api/cartographies/{id}/revisions et
 * GET /api/revisions/{revisionId} sont appelées directement : Revisions
 * (création transactionnelle qui retire la garantie, historique sans
 * document, lecture d'une révision) et Validation (schéma serveur par type).
 */
final class UcCar04CorrigerCartographieTest extends TestCase
{
    private static PDO $pdo;

    private int $maya;
    private int $carl;
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
        CarSupport::link(self::$pdo, $this->maya, $this->carl);
        $this->cartoId = CarSupport::carto(self::$pdo, $this->maya);
    }

    /** @return array<string, mixed> la fixture jour avec un verdict corrigé */
    private static function corrected(): array
    {
        $doc = CarSupport::jourDocument();
        $doc['poles'][0]['competences'][1]['verdict']['statut'] = 'présence établie';
        $doc['poles'][0]['competences'][1]['verdict']['confiance'] = 0.8;

        return $doc;
    }

    #[TestDox('UC-CAR-04-U01 — create : révision stockée (document, note, auteur), aucune garantie à retirer')]
    public function testU01CreateStoresTheRevision(): void
    {
        $result = (new Revisions(self::$pdo))->create($this->cartoId, $this->carl, self::corrected(), 'Pièce vérifiée');

        self::assertSame(['revisionId', 'garantieRemoved'], array_keys($result));
        self::assertFalse($result['garantieRemoved']);
        $row = self::$pdo->query('SELECT cartographie_id, author_id, note, document FROM cartography_revisions WHERE id = ' . $result['revisionId'])->fetch();
        self::assertSame($this->cartoId, (int) $row['cartographie_id']);
        self::assertSame($this->carl, (int) $row['author_id']);
        self::assertSame('Pièce vérifiée', $row['note']);
        self::assertEquals(self::corrected(), json_decode((string) $row['document'], true));
        // Le document de base n'est pas touché : « rien ne s'écrase ».
        $base = json_decode((string) self::$pdo->query('SELECT document FROM cartographies WHERE id = ' . $this->cartoId)->fetchColumn(), true);
        self::assertEquals(CarSupport::jourDocument(), $base);
    }

    #[TestDox('UC-CAR-04-U02 — create sur une cartographie garantie : la garantie tombe dans la même transaction')]
    public function testU02CreateRemovesTheStandingGarantie(): void
    {
        $revisions = new Revisions(self::$pdo);
        ['revisionId' => $signed] = $revisions->create($this->cartoId, $this->carl, CarSupport::jourDocument(), null);
        (new Garanties(self::$pdo))->pose($this->cartoId, $this->carl, 'Carl', $signed);

        $result = $revisions->create($this->cartoId, $this->maya, self::corrected(), 'Correction après garantie');

        self::assertTrue($result['garantieRemoved']);
        self::assertNull((new Garanties(self::$pdo))->findForCartography($this->cartoId));
        self::assertSame(2, CarSupport::count(self::$pdo, 'SELECT COUNT(*) FROM cartography_revisions'), 'la révision signée reste dans l’historique');
        self::assertFalse($revisions->create($this->cartoId, $this->maya, self::corrected(), null)['garantieRemoved']);
    }

    #[TestDox('UC-CAR-04-U03 — listForCartography : récentes d’abord, sans document ; auteur purgé → anonyme, révision conservée')]
    public function testU03HistoryIsMetadataOnlyAndSurvivesAuthorPurge(): void
    {
        $revisions = new Revisions(self::$pdo);
        ['revisionId' => $r1] = $revisions->create($this->cartoId, $this->carl, CarSupport::jourDocument(), 'v1');
        ['revisionId' => $r2] = $revisions->create($this->cartoId, $this->maya, self::corrected(), null);

        $history = $revisions->listForCartography($this->cartoId);
        self::assertSame([$r2, $r1], array_column($history, 'id'));
        self::assertSame(['id', 'note', 'author', 'createdAt'], array_keys($history[0]));
        self::assertSame(['id' => $this->carl, 'displayName' => 'Carl'], $history[1]['author']);

        self::$pdo->exec('DELETE FROM users WHERE id = ' . $this->carl);
        $after = $revisions->listForCartography($this->cartoId);
        self::assertSame([$r2, $r1], array_column($after, 'id'), 'donnée de l’apprenant : elle survit à son auteur');
        self::assertNull($after[1]['author']);
        self::assertSame('v1', $after[1]['note']);
    }

    #[TestDox('UC-CAR-04-U04 — find : une révision avec son document et sa cartographie parente ; inconnue → null')]
    public function testU04FindReturnsTheDocumentAndItsParent(): void
    {
        ['revisionId' => $id] = (new Revisions(self::$pdo))->create($this->cartoId, $this->carl, self::corrected(), 'Pièce vérifiée');

        $revision = (new Revisions(self::$pdo))->find($id);

        self::assertSame(['id', 'cartographieId', 'document', 'note', 'author', 'createdAt'], array_keys($revision));
        self::assertSame($this->cartoId, $revision['cartographieId']);
        self::assertEquals(self::corrected(), $revision['document']);
        self::assertSame('Carl', $revision['author']['displayName']);
        self::assertNull((new Revisions(self::$pdo))->find(999999));
    }

    #[TestDox('UC-CAR-04-U05 — Validation : document conforme accepté ; non conforme → erreurs indexées par pointeur JSON')]
    public function testU05SchemaValidationByType(): void
    {
        self::assertSame(['valid' => true, 'errors' => []], Validation::validate('cartographie-jour', self::corrected()));

        $broken = self::corrected();
        $broken['poles'][0]['competences'][1]['verdict']['statut'] = 'peut-être';
        $result = Validation::validate('cartographie-jour', $broken);
        self::assertFalse($result['valid']);
        self::assertNotEmpty($result['errors']);
        foreach (array_keys($result['errors']) as $pointer) {
            self::assertStringStartsWith('/', (string) $pointer);
        }

        // Le `kind` du schéma épingle le type : un merge réel (conforme une
        // fois décodé en objets) dont seul `kind` est changé est refusé, sur
        // le seul pointeur /kind.
        $raw = (string) file_get_contents(\dirname(__DIR__, 4) . '/schemas/fixtures/cartographie-merge-3-jours.json');
        $merge = json_decode($raw, false);
        self::assertTrue(Validation::validate('cartographie-merge', $merge)['valid']);
        $merge->kind = 'cartographie-jour';
        $pinned = Validation::validate('cartographie-merge', $merge);
        self::assertFalse($pinned['valid']);
        self::assertSame(['/kind'], array_keys($pinned['errors']));
    }

    #[TestDox('UC-CAR-04-U06 — Validation : type « twin9 » non supporté → exception (cause de l’anomalie AN1)')]
    public function testU06UnsupportedKindThrows(): void
    {
        $this->expectException(InvalidArgumentException::class);
        $this->expectExceptionMessage('Unsupported document kind "cartographie-twin9"');

        Validation::validate('cartographie-twin9', ['journal_id' => 'x']);
    }

    #[TestDox('UC-CAR-04-U07 — Validation : un merge décodé en tableau associatif perd ses objets vides (cause de l’anomalie AN3)')]
    public function testU07AssociativeDecodingBreaksEmptyObjectsOfAMerge(): void
    {
        $path = \dirname(__DIR__, 4) . '/schemas/fixtures/cartographie-merge-3-jours.json';
        $raw = (string) file_get_contents($path);

        // Décodé en objets (stdClass) : le document réel est conforme.
        self::assertTrue(Validation::validate('cartographie-merge', json_decode($raw, false))['valid']);

        // Décodé en tableaux associatifs — ce que reçoit une route Slim
        // (getParsedBody) — `reserved.piecesData: {}` devient `[]` : refusé.
        $result = Validation::validate('cartographie-merge', json_decode($raw, true));
        self::assertFalse($result['valid']);
        self::assertSame(['/reserved/piecesData'], array_keys($result['errors']));

        // Même document avec un piecesData non vide : conforme.
        $filled = json_decode($raw, true);
        $filled['reserved']['piecesData'] = ['p1' => ['texte' => 'x']];
        self::assertTrue(Validation::validate('cartographie-merge', $filled)['valid']);
    }

    #[TestDox('UC-CAR-04-U14 — contraintes SQL : les révisions disparaissent avec leur cartographie (CASCADE)')]
    public function testU14RevisionsAreDeletedWithTheirCartography(): void
    {
        $revisions = new Revisions(self::$pdo);
        ['revisionId' => $revisionId] = $revisions->create($this->cartoId, $this->carl, self::corrected(), 'À supprimer');
        self::assertCount(1, $revisions->listForCartography($this->cartoId));

        self::$pdo->exec('DELETE FROM cartographies WHERE id = ' . $this->cartoId);

        self::assertSame([], $revisions->listForCartography($this->cartoId));
        self::assertNull($revisions->find($revisionId));
        self::assertSame(0, CarSupport::count(self::$pdo, 'SELECT COUNT(*) FROM cartography_revisions'));
    }
}
