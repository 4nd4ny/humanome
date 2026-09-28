<?php

declare(strict_types=1);

namespace Humanome\Tests\UseCases\Functional;

use Humanome\Tests\CartographeTestCase;
use Humanome\Tests\UseCases\Support\CarSupport;
use PHPUnit\Framework\Attributes\TestDox;

/**
 * UC-CAR-02 — Consulter sa file de relecture : tests FONCTIONNELS (API).
 *
 * Fiche : docs/cas-utilisation/cartographe/UC-CAR-02-consulter-file-relecture.md
 *
 * Scénarios rejoués par l'API HTTP (Slim en processus, vraie base) : deux
 * apprenants liés à Carl par le vrai parcours d'invitation, une apprenante
 * non liée, des cartographies stockées par les apprenants eux-mêmes
 * (précondition UC-APP-04), puis Carl consulte sa file et ouvre une relecture.
 */
final class UcCar02ConsulterFileRelectureTest extends CartographeTestCase
{
    private const QUEUE_KEYS = ['id', 'type', 'titre', 'visibility', 'createdAt', 'updatedAt', 'apprenant', 'annotations', 'revisions', 'garantie'];

    /** @var array{id: int, csrf: string, sid: string} */
    private array $maya;

    /** @var array{id: int, csrf: string, sid: string} */
    private array $noe;

    /** @var array{id: int, csrf: string, sid: string} */
    private array $carl;

    protected function setUp(): void
    {
        parent::setUp();
        $this->maya = $this->registerAs('maya@example.org', 'Maya');
        $this->noe = $this->registerAs('noe@example.org', 'Noé');
        $this->carl = $this->registerAs('carl@example.org', 'Carl', ['cartographe']);
        $this->link($this->maya, $this->carl);
        $this->link($this->noe, $this->carl);
    }

    private function jourCarto(array $owner, string $titre, string $visibility = 'cartographe'): int
    {
        return $this->createCarto($owner, ['titre' => $titre, 'visibility' => $visibility, 'document' => self::jourDocument()]);
    }

    #[TestDox('UC-CAR-02-F01 — nominal : la file liste les cartographies exposées des apprentis, métadonnées seulement')]
    public function testF01QueueListsExposedCartographiesOfLinkedLearners(): void
    {
        $this->jourCarto($this->maya, 'Journal intime', 'privee');
        $mayaJour = $this->jourCarto($this->maya, 'Journée du 5 janvier');
        $mayaMerge = $this->createCarto($this->maya, [
            'type' => 'merge', 'titre' => 'Mon parcours', 'visibility' => 'publique',
            'document' => CarSupport::mergeDocument(),
        ]);
        $noeJour = $this->jourCarto($this->noe, 'Feuille de Noé');
        $zoe = $this->registerAs('zoe@example.org', 'Zoé');
        $this->jourCarto($zoe, 'Hors périmètre', 'publique');

        $response = $this->as_($this->carl, 'GET', '/api/cartographe/cartographies');

        self::assertSame(200, $response->getStatusCode());
        $queue = self::json($response);
        self::assertSame([$noeJour, $mayaMerge, $mayaJour], array_column($queue, 'id'), 'plus récente d’abord');
        foreach ($queue as $entry) {
            self::assertSame(self::QUEUE_KEYS, array_keys($entry));
        }
        self::assertSame(['jour', 'merge', 'jour'], array_column($queue, 'type'));
        self::assertSame(['Noé', 'Maya', 'Maya'], array_column(array_column($queue, 'apprenant'), 'displayName'));
        $raw = (string) $response->getBody();
        self::assertStringNotContainsString('poles', $raw, 'jamais de document dans la file');
        self::assertStringNotContainsString('domains', $raw);
    }

    #[TestDox('UC-CAR-02-F02 — nominal : « Relire » ouvre le détail complet (document, annotations, révisions, garantie)')]
    public function testF02DetailCarriesTheFullReviewView(): void
    {
        $cartoId = $this->jourCarto($this->maya, 'Journée du 5 janvier');

        $response = $this->as_($this->carl, 'GET', '/api/cartographe/cartographies/' . $cartoId);

        self::assertSame(200, $response->getStatusCode());
        $detail = self::json($response);
        self::assertSame(
            ['id', 'type', 'titre', 'visibility', 'document', 'createdAt', 'updatedAt', 'apprenant', 'annotations', 'revisions', 'garantie'],
            array_keys($detail),
            'objet plat : la cartographie et ses trois listes',
        );
        self::assertSame('Journée du 5 janvier', $detail['titre']);
        self::assertSame(['id' => $this->maya['id'], 'displayName' => 'Maya'], $detail['apprenant']);
        self::assertEquals(self::jourDocument(), $detail['document']);
        self::assertSame([], $detail['annotations']);
        self::assertSame([], $detail['revisions']);
        self::assertNull($detail['garantie']);
    }

    #[TestDox('UC-CAR-02-F03 — A3 : après annotation, révision et garantie, la file et le détail reflètent l’état de relecture')]
    public function testF03QueueAndDetailReflectTheReviewState(): void
    {
        $cartoId = $this->jourCarto($this->maya, 'Journée du 5 janvier');
        $base = '/api/cartographies/' . $cartoId;
        self::assertSame(201, $this->as_($this->maya, 'POST', $base . '/annotations', [
            'competenceCode' => '1.03', 'type' => 'commentaire', 'texte' => 'La note existe, je peux la joindre.',
        ])->getStatusCode());
        $revisionId = (int) self::json($this->as_($this->carl, 'POST', $base . '/revisions', [
            'document' => self::jourDocument(), 'note' => 'Relue',
        ]))['revisionId'];
        self::assertSame(201, $this->as_($this->carl, 'POST', $base . '/garantie', ['revisionId' => $revisionId])->getStatusCode());

        [$entry] = self::json($this->as_($this->carl, 'GET', '/api/cartographe/cartographies'));
        self::assertSame(1, $entry['annotations']);
        self::assertSame(1, $entry['revisions']);
        self::assertSame('Carl', $entry['garantie']['par']);
        self::assertArrayNotHasKey('revisionId', $entry['garantie'], 'la file ne porte que {par, date}');

        $detail = self::json($this->as_($this->carl, 'GET', '/api/cartographe/cartographies/' . $cartoId));
        self::assertSame('Maya', $detail['annotations'][0]['author']['displayName']);
        self::assertSame('Relue', $detail['revisions'][0]['note']);
        self::assertArrayNotHasKey('document', $detail['revisions'][0]);
        self::assertSame(['par' => 'Carl', 'date' => $detail['garantie']['date'], 'revisionId' => $revisionId], $detail['garantie']);
    }

    #[TestDox('UC-CAR-02-F04 — A2 : une cartographie de parcours (merge) est servie avec son document merge')]
    public function testF04MergeCartographyDetail(): void
    {
        $merge = CarSupport::mergeDocument();
        $cartoId = $this->createCarto($this->maya, ['type' => 'merge', 'titre' => 'Mon parcours', 'visibility' => 'publique', 'document' => $merge]);

        $detail = self::json($this->as_($this->carl, 'GET', '/api/cartographe/cartographies/' . $cartoId));

        self::assertSame('merge', $detail['type']);
        self::assertSame('cartographie-merge', $detail['document']['kind']);
        self::assertSame(count($merge['domains']), count($detail['document']['domains']));
    }

    #[TestDox('UC-CAR-02-F05 — E1 : inconnue, privée, apprenant non lié, apprenant d’un autre cartographe → même 404')]
    public function testF05InaccessibleCartographiesCollapseIntoOne404(): void
    {
        $privee = $this->jourCarto($this->maya, 'Journal intime', 'privee');
        $zoe = $this->registerAs('zoe@example.org', 'Zoé');
        $zoeCarto = $this->jourCarto($zoe, 'Carto de Zoé');
        $rita = $this->registerAs('rita@example.org', 'Rita', ['cartographe']);
        $this->link($zoe, $rita);
        $mayaCarto = $this->jourCarto($this->maya, 'Journée du 5 janvier');

        $answers = [
            'inconnue' => $this->as_($this->carl, 'GET', '/api/cartographe/cartographies/999999'),
            'privee' => $this->as_($this->carl, 'GET', '/api/cartographe/cartographies/' . $privee),
            'non_liee' => $this->as_($this->carl, 'GET', '/api/cartographe/cartographies/' . $zoeCarto),
            'autre_cartographe' => $this->as_($rita, 'GET', '/api/cartographe/cartographies/' . $mayaCarto),
        ];

        foreach ($answers as $case => $response) {
            self::assertSame(404, $response->getStatusCode(), $case);
            self::assertSame(['error' => 'Cartographie introuvable'], self::json($response), $case);
        }
        self::assertSame([$zoeCarto], array_column(self::json($this->as_($rita, 'GET', '/api/cartographe/cartographies')), 'id'));
    }

    #[TestDox('UC-CAR-02-F06 — E2 : retour à « privée » → accès coupé partout ; rouverte → accès et historique retrouvés')]
    public function testF06PrivateFlipCutsAccessAndReopeningRestoresIt(): void
    {
        $cartoId = $this->jourCarto($this->maya, 'Journée du 5 janvier');
        self::assertSame(201, $this->as_($this->carl, 'POST', '/api/cartographies/' . $cartoId . '/annotations', [
            'competenceCode' => '2.01', 'type' => 'commentaire', 'texte' => 'Très juste.',
        ])->getStatusCode());

        self::assertSame(200, $this->as_($this->maya, 'PATCH', '/api/cartographies/' . $cartoId, ['visibility' => 'privee'])->getStatusCode());

        self::assertSame([], self::json($this->as_($this->carl, 'GET', '/api/cartographe/cartographies')));
        foreach ([
            '/api/cartographe/cartographies/' . $cartoId,
            '/api/cartographies/' . $cartoId . '/annotations',
            '/api/cartographies/' . $cartoId . '/revisions',
        ] as $path) {
            self::assertSame(404, $this->as_($this->carl, 'GET', $path)->getStatusCode(), $path);
        }
        // L'apprenante, elle, garde tout.
        self::assertCount(1, self::json($this->as_($this->maya, 'GET', '/api/cartographies/' . $cartoId . '/annotations')));

        self::assertSame(200, $this->as_($this->maya, 'PATCH', '/api/cartographies/' . $cartoId, ['visibility' => 'cartographe'])->getStatusCode());
        $detail = self::json($this->as_($this->carl, 'GET', '/api/cartographe/cartographies/' . $cartoId));
        self::assertCount(1, $detail['annotations'], 'rien n’a été détruit pendant la fermeture');
    }

    #[TestDox('UC-CAR-02-F07 — E3 : visiteur → 401, apprenant sans rôle cartographe → 403 (file et détail)')]
    public function testF07RoleGuards(): void
    {
        $cartoId = $this->jourCarto($this->maya, 'Journée du 5 janvier');

        $this->cookieSid = null;
        self::assertSame(401, $this->request('GET', '/api/cartographe/cartographies')->getStatusCode());
        self::assertSame(401, $this->request('GET', '/api/cartographe/cartographies/' . $cartoId)->getStatusCode());

        self::assertSame(403, $this->as_($this->maya, 'GET', '/api/cartographe/cartographies')->getStatusCode());
        self::assertSame(403, $this->as_($this->maya, 'GET', '/api/cartographe/cartographies/' . $cartoId)->getStatusCode());
    }
}
