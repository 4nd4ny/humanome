<?php

declare(strict_types=1);

namespace Humanome\Tests\UseCases\Functional;

use Humanome\Cartographe\Links;
use Humanome\Tests\CartographeTestCase;
use Humanome\Tests\UseCases\Support\CarSupport;
use PHPUnit\Framework\Attributes\TestDox;
use Psr\Http\Message\ResponseInterface;

/**
 * UC-CAR-04 — Corriger une cartographie (révision) : tests FONCTIONNELS (API).
 *
 * Fiche : docs/cas-utilisation/cartographe/UC-CAR-04-corriger-cartographie.md
 *
 * Scénarios rejoués par l'API HTTP (Slim en processus, vraie base) : Maya a
 * rattaché Carl et lui expose une journée réelle (fixture valide au schéma) ;
 * Carl — ou Maya — propose des révisions, lit l'historique et les documents.
 */
final class UcCar04CorrigerCartographieTest extends CartographeTestCase
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
        $this->cartoId = $this->createCarto($this->maya, ['titre' => 'Journée du 5 janvier', 'document' => self::jourDocument()]);
    }

    /** @return array<string, mixed> la journée avec le renvoi 1.03 tranché par le cartographe */
    private static function corrected(): array
    {
        $doc = self::jourDocument();
        $verdict = &$doc['poles'][0]['competences'][1]['verdict'];
        $verdict['statut'] = 'présence établie';
        $verdict['confiance'] = 0.8;
        $verdict['motif'] = 'Note de synthèse retrouvée dans le portfolio.';
        $doc['poles'][0]['auditPole']['presencesEtablies'] = 1;
        $doc['poles'][0]['auditPole']['renvoisCartographe'] = 0;

        return $doc;
    }

    /** @param array<string, mixed> $body */
    private function revise(array $who, array $body, ?int $cartoId = null): ResponseInterface
    {
        return $this->as_($who, 'POST', '/api/cartographies/' . ($cartoId ?? $this->cartoId) . '/revisions', $body);
    }

    private function revisionCount(): int
    {
        return (int) self::$pdo->query('SELECT COUNT(*) FROM cartography_revisions')->fetchColumn();
    }

    #[TestDox('UC-CAR-04-F01 — nominal : révision validée et stockée, historique (méta) et document lisibles par les deux')]
    public function testF01NominalRevision(): void
    {
        $response = $this->revise($this->carl, ['document' => self::corrected(), 'note' => '  Renvoi 1.03 tranché : pièce retrouvée.  ']);

        self::assertSame(201, $response->getStatusCode(), (string) $response->getBody());
        $revisionId = self::json($response)['revisionId'];
        self::assertIsInt($revisionId);

        foreach ([$this->maya, $this->carl] as $reader) {
            $history = self::json($this->as_($reader, 'GET', '/api/cartographies/' . $this->cartoId . '/revisions'));
            self::assertCount(1, $history);
            self::assertSame(['id', 'note', 'author', 'createdAt'], array_keys($history[0]));
            self::assertSame('Renvoi 1.03 tranché : pièce retrouvée.', $history[0]['note'], 'note nettoyée');
            self::assertSame(['id' => $this->carl['id'], 'displayName' => 'Carl'], $history[0]['author']);

            $full = self::json($this->as_($reader, 'GET', '/api/revisions/' . $revisionId));
            self::assertSame($this->cartoId, $full['cartographieId']);
            self::assertEquals(self::corrected(), $full['document']);
        }
        // Le document de base reste celui du moteur ; la file compte la révision.
        $detail = self::json($this->as_($this->carl, 'GET', '/api/cartographe/cartographies/' . $this->cartoId));
        self::assertEquals(self::jourDocument(), $detail['document']);
        self::assertSame(1, self::json($this->as_($this->carl, 'GET', '/api/cartographe/cartographies'))[0]['revisions']);
        self::assertNull(self::lastAudit('garantie_retiree'), 'aucune garantie en place : rien à journaliser');
    }

    #[TestDox('UC-CAR-04-F02 — A2 : révision sur une cartographie garantie → garantie retirée + audit garantie_retiree')]
    public function testF02RevisionOnGuaranteedCartographyRemovesTheGarantie(): void
    {
        self::assertSame(201, $this->as_($this->carl, 'POST', '/api/cartographies/' . $this->cartoId . '/garantie')->getStatusCode());

        $revisionId = (int) self::json($this->revise($this->carl, ['document' => self::corrected(), 'note' => 'Erreur vue après coup']))['revisionId'];

        $detail = self::json($this->as_($this->carl, 'GET', '/api/cartographe/cartographies/' . $this->cartoId));
        self::assertNull($detail['garantie'], 'une cartographie modifiée n’est jamais présentée comme garantie');
        self::assertNull(self::json($this->as_($this->carl, 'GET', '/api/cartographe/cartographies'))[0]['garantie']);
        $audit = self::lastAudit('garantie_retiree');
        self::assertSame($this->carl['id'], $audit['userId']);
        self::assertEquals(
            ['cartographieId' => $this->cartoId, 'cause' => 'nouvelle_revision', 'revisionId' => $revisionId],
            $audit['details'],
        );
    }

    #[TestDox('UC-CAR-04-F03 — A3 : le propriétaire révise sa propre cartographie ; note facultative (absente → null)')]
    public function testF03OwnerRevisesWithoutNote(): void
    {
        self::assertSame(201, $this->revise($this->maya, ['document' => self::corrected()])->getStatusCode());
        self::assertSame(201, $this->revise($this->maya, ['document' => self::corrected(), 'note' => null])->getStatusCode());

        $history = self::json($this->as_($this->carl, 'GET', '/api/cartographies/' . $this->cartoId . '/revisions'));
        self::assertSame([null, null], array_column($history, 'note'));
        self::assertSame(['Maya', 'Maya'], array_column(array_column($history, 'author'), 'displayName'));
    }

    #[TestDox('UC-CAR-04-F04 — E4 : forme invalide → 422 (document absent/non-objet, note trop longue) ; 500 caractères admis')]
    public function testF04ShapeValidation(): void
    {
        foreach ([[], ['document' => 'texte'], ['document' => ['a', 'b']], ['document' => []]] as $i => $payload) {
            $response = $this->revise($this->carl, $payload);
            self::assertSame(422, $response->getStatusCode(), 'document #' . $i);
            self::assertSame(['document'], array_keys(self::json($response)['fields']));
        }

        $tooLong = $this->revise($this->carl, ['document' => self::corrected(), 'note' => str_repeat('n', 501)]);
        self::assertSame(422, $tooLong->getStatusCode());
        self::assertSame(['note' => 'Note invalide (500 caractères maximum)'], self::json($tooLong)['fields']);
        self::assertSame(0, $this->revisionCount());

        self::assertSame(201, $this->revise($this->carl, ['document' => self::corrected(), 'note' => str_repeat('é', 500)])->getStatusCode());
    }

    #[TestDox('UC-CAR-04-F05 — E4 : document hors schéma ou d’un autre type → 422 ; A6 : révision merge conforme → 201')]
    public function testF05SchemaValidationAndTypeEquality(): void
    {
        $broken = self::corrected();
        unset($broken['kairos']);
        $broken['poles'][0]['competences'][1]['verdict']['confiance'] = 2;
        $response = $this->revise($this->carl, ['document' => $broken]);
        self::assertSame(422, $response->getStatusCode());
        $body = self::json($response);
        self::assertSame('Document invalide au schéma cartographie-jour', $body['error']);
        foreach (array_keys($body['fields']) as $pointer) {
            self::assertStringStartsWith('/', (string) $pointer, 'erreurs indexées par pointeur JSON');
        }

        $merge = $this->createCarto($this->maya, ['type' => 'merge', 'titre' => 'Mon parcours', 'document' => CarSupport::mergeDocument()]);
        $mismatch = $this->revise($this->carl, ['document' => self::corrected()], $merge);
        self::assertSame(422, $mismatch->getStatusCode());
        self::assertSame('Document invalide au schéma cartographie-merge', self::json($mismatch)['error']);
        self::assertSame(0, $this->revisionCount());

        // A6 : l'IHM ne corrige pas un merge, mais l'API accepte une révision
        // merge conforme… à condition qu'elle ne contienne pas d'objet vide (AN3).
        $filled = CarSupport::mergeDocument();
        $filled['reserved']['piecesData'] = ['p1' => ['texte' => 'pièce agrégée']];
        self::assertSame(201, $this->revise($this->carl, ['document' => $filled, 'note' => 'Merge relu'], $merge)->getStatusCode());
    }

    #[TestDox('UC-CAR-04-F10 — AN3 (anomalie) : un merge RÉEL (objet vide reserved.piecesData) est refusé en 422')]
    public function testF10RealMergeDocumentIsRejectedBecauseOfEmptyObject(): void
    {
        $merge = $this->createCarto($this->maya, ['type' => 'merge', 'titre' => 'Mon parcours', 'document' => CarSupport::mergeDocument()]);

        // Comportement ACTUEL figé : le corps JSON est décodé en tableaux
        // associatifs, `{}` y devient `[]`, et le schéma exige un objet.
        $response = $this->revise($this->carl, ['document' => CarSupport::mergeDocument(), 'note' => 'Merge relu'], $merge);

        self::assertSame(422, $response->getStatusCode());
        $body = self::json($response);
        self::assertSame('Document invalide au schéma cartographie-merge', $body['error']);
        self::assertSame(['/reserved/piecesData'], array_keys($body['fields']));
        self::assertSame(0, $this->revisionCount());
    }

    #[TestDox('UC-CAR-04-F06 — E5 : accès refusé → 404 (écriture, historique, document) ; en privée le propriétaire garde tout')]
    public function testF06AccessRefusals(): void
    {
        $revisionId = (int) self::json($this->revise($this->carl, ['document' => self::corrected()]))['revisionId'];
        $zoe = $this->registerAs('zoe@example.org', 'Zoé');
        $rita = $this->registerAs('rita@example.org', 'Rita', ['cartographe']);

        foreach (['etrangere' => $zoe, 'non_lie' => $rita] as $case => $actor) {
            self::assertSame(404, $this->revise($actor, ['document' => self::corrected()])->getStatusCode(), $case);
            self::assertSame(404, $this->as_($actor, 'GET', '/api/cartographies/' . $this->cartoId . '/revisions')->getStatusCode(), $case);
            $doc = $this->as_($actor, 'GET', '/api/revisions/' . $revisionId);
            self::assertSame(404, $doc->getStatusCode(), $case);
            self::assertSame(['error' => 'Révision introuvable'], self::json($doc));
        }
        self::assertSame(['error' => 'Révision introuvable'], self::json($this->as_($this->carl, 'GET', '/api/revisions/999999')));
        self::assertSame(['error' => 'Cartographie introuvable'], self::json($this->revise($this->carl, ['document' => self::corrected()], 999999)));

        self::assertSame(200, $this->as_($this->maya, 'PATCH', '/api/cartographies/' . $this->cartoId, ['visibility' => 'privee'])->getStatusCode());
        self::assertSame(404, $this->revise($this->carl, ['document' => self::corrected()])->getStatusCode());
        self::assertSame(404, $this->as_($this->carl, 'GET', '/api/revisions/' . $revisionId)->getStatusCode());
        self::assertSame(200, $this->as_($this->maya, 'GET', '/api/revisions/' . $revisionId)->getStatusCode());
        self::assertSame(1, $this->revisionCount());
    }

    #[TestDox('UC-CAR-04-F07 — AN2 (anomalie) : une note vide "" — ce qu’envoie l’IHM sans note — est refusée en 422')]
    public function testF07EmptyNoteStringIsRejected(): void
    {
        // Comportement ACTUEL figé : la route refuse toute note chaîne vide
        // ou blanche, alors que l'IHM envoie note: '' quand le champ est vide.
        foreach (['', '   '] as $note) {
            $response = $this->revise($this->carl, ['document' => self::corrected(), 'note' => $note]);
            self::assertSame(422, $response->getStatusCode());
            self::assertSame(['note' => 'Note invalide (500 caractères maximum)'], self::json($response)['fields']);
        }
        self::assertSame(0, $this->revisionCount());
    }

    #[TestDox('UC-CAR-04-F08 — AN1 (anomalie) : révision d’une cartographie « twin9 » → 500 au lieu d’un refus propre')]
    public function testF08RevisionOfATwin9CartographyFailsWith500(): void
    {
        $twin9 = $this->createCarto($this->maya, ['type' => 'twin9', 'titre' => 'Analyse approfondie', 'document' => ['journal_id' => 'j-1', 'competences' => []]]);
        self::assertSame(['level' => 'cartographe', 'type' => 'twin9'], (new Links(self::$pdo))->access($twin9, $this->carl['id'], ['cartographe']));

        // Comportement ACTUEL figé : Validation::validate('cartographie-twin9')
        // lève une InvalidArgumentException non interceptée par la route.
        $previous = ini_set('error_log', '/dev/null');
        try {
            $response = $this->revise($this->carl, ['document' => ['journal_id' => 'j-1', 'competences' => []]], $twin9);
        } finally {
            ini_set('error_log', $previous === false ? '' : $previous);
        }
        self::assertSame(500, $response->getStatusCode());
        self::assertSame(0, $this->revisionCount());
    }

    #[TestDox('UC-CAR-04-F09 — E6 : sans jeton CSRF → 403, rien n’est stocké')]
    public function testF09MissingCsrf(): void
    {
        $this->cookieSid = $this->carl['sid'];
        $response = $this->request('POST', '/api/cartographies/' . $this->cartoId . '/revisions', ['document' => self::corrected()]);

        self::assertSame(403, $response->getStatusCode());
        self::assertSame(0, $this->revisionCount());
    }
}
