<?php

declare(strict_types=1);

namespace Humanome\Tests\UseCases\Functional;

use Humanome\Tests\CartographeTestCase;
use PHPUnit\Framework\Attributes\TestDox;
use Psr\Http\Message\ResponseInterface;

/**
 * UC-CAR-03 — Annoter une cartographie : tests FONCTIONNELS (API).
 *
 * Fiche : docs/cas-utilisation/cartographe/UC-CAR-03-annoter-cartographie.md
 *
 * Scénarios rejoués par l'API HTTP (Slim en processus, vraie base) : Maya a
 * rattaché Carl (vrai parcours d'invitation) et lui expose une journée ; Carl
 * — et Maya elle-même — annotent, lisent le fil et suppriment leurs notes.
 */
final class UcCar03AnnoterCartographieTest extends CartographeTestCase
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

    /** @param array<string, mixed> $body */
    private function annotate(array $who, array $body, ?int $cartoId = null): ResponseInterface
    {
        return $this->as_($who, 'POST', '/api/cartographies/' . ($cartoId ?? $this->cartoId) . '/annotations', $body);
    }

    private function trail(array $who): array
    {
        $response = $this->as_($who, 'GET', '/api/cartographies/' . $this->cartoId . '/annotations');
        self::assertSame(200, $response->getStatusCode());

        return self::json($response);
    }

    #[TestDox('UC-CAR-03-F01 — nominal : le cartographe lié annote (3 types), texte nettoyé, fil lisible par les deux')]
    public function testF01LinkedCartographeAnnotates(): void
    {
        $auditsBefore = (int) self::$pdo->query('SELECT COUNT(*) FROM audit_events')->fetchColumn();
        $ids = [];
        foreach ([
            ['1.03', 'hallucination', "  L'extrait cité ne figure pas dans la feuille.  "],
            ['7.03', 'oubli', 'La feuille montre aussi 7.03 (outil de visite).'],
            ['2.01', 'commentaire', 'Belle pièce, bien choisie.'],
        ] as [$code, $type, $texte]) {
            $response = $this->annotate($this->carl, ['competenceCode' => $code, 'type' => $type, 'texte' => $texte]);
            self::assertSame(201, $response->getStatusCode(), (string) $response->getBody());
            self::assertSame(['id'], array_keys(self::json($response)));
            $ids[] = self::json($response)['id'];
        }

        foreach ([$this->carl, $this->maya] as $reader) {
            $trail = $this->trail($reader);
            self::assertSame($ids, array_column($trail, 'id'));
            self::assertSame(['hallucination', 'oubli', 'commentaire'], array_column($trail, 'type'));
            self::assertSame("L'extrait cité ne figure pas dans la feuille.", $trail[0]['texte'], 'texte nettoyé (trim)');
            self::assertSame(['id' => $this->carl['id'], 'displayName' => 'Carl'], $trail[0]['author']);
        }
        [$entry] = self::json($this->as_($this->carl, 'GET', '/api/cartographe/cartographies'));
        self::assertSame(3, $entry['annotations']);
        self::assertSame(
            $auditsBefore,
            (int) self::$pdo->query('SELECT COUNT(*) FROM audit_events')->fetchColumn(),
            'l’annotation n’est pas journalisée (pas de contenu dans le journal)',
        );
    }

    #[TestDox('UC-CAR-03-F02 — A1 : l’apprenante annote sa propre cartographie, même en privée')]
    public function testF02OwnerAnnotatesOwnCartography(): void
    {
        self::assertSame(201, $this->annotate($this->maya, ['competenceCode' => '1.03', 'type' => 'commentaire', 'texte' => 'Je joins la note.'])->getStatusCode());
        self::assertSame(201, $this->annotate($this->carl, ['competenceCode' => '1.03', 'type' => 'commentaire', 'texte' => 'Merci, vu.'])->getStatusCode());
        self::assertSame(['Maya', 'Carl'], array_column(array_column($this->trail($this->carl), 'author'), 'displayName'));

        $privee = $this->createCarto($this->maya, ['titre' => 'Journal intime', 'visibility' => 'privee']);
        self::assertSame(201, $this->annotate($this->maya, ['competenceCode' => '5.03', 'type' => 'oubli', 'texte' => 'À reprendre.'], $privee)->getStatusCode());
    }

    #[TestDox('UC-CAR-03-F03 — A2 : l’auteur supprime son annotation → 204, elle disparaît du fil')]
    public function testF03AuthorDeletesOwnAnnotation(): void
    {
        $keep = (int) self::json($this->annotate($this->maya, ['competenceCode' => '1.01', 'type' => 'commentaire', 'texte' => 'De Maya.']))['id'];
        $drop = (int) self::json($this->annotate($this->carl, ['competenceCode' => '1.01', 'type' => 'oubli', 'texte' => 'Erreur de ma part.']))['id'];

        self::assertSame(204, $this->as_($this->carl, 'DELETE', '/api/annotations/' . $drop)->getStatusCode());

        self::assertSame([$keep], array_column($this->trail($this->maya), 'id'));
    }

    #[TestDox('UC-CAR-03-F04 — E2 : validation serveur → 422 avec les champs fautifs ; bornes du texte')]
    public function testF04ServerValidation(): void
    {
        $response = $this->annotate($this->carl, ['competenceCode' => '8.01', 'type' => 'bravo', 'texte' => '   ']);
        self::assertSame(422, $response->getStatusCode());
        $body = self::json($response);
        self::assertSame('Validation échouée', $body['error']);
        self::assertSame(['competenceCode', 'type', 'texte'], array_keys($body['fields']));

        foreach ([['competenceCode' => '1.1'], ['competenceCode' => 'x'], ['competenceCode' => null], ['texte' => str_repeat('é', 5001)], ['type' => null]] as $i => $override) {
            $bad = array_merge(['competenceCode' => '1.01', 'type' => 'commentaire', 'texte' => 'ok'], $override);
            self::assertSame(422, $this->annotate($this->carl, $bad)->getStatusCode(), 'cas #' . $i);
        }
        self::assertSame(0, (int) self::$pdo->query('SELECT COUNT(*) FROM cartography_annotations')->fetchColumn());

        // Bornes admises : 5 000 caractères (multioctets compris), code entouré d'espaces.
        self::assertSame(201, $this->annotate($this->carl, ['competenceCode' => ' 1.01 ', 'type' => 'commentaire', 'texte' => str_repeat('é', 5000)])->getStatusCode());
        self::assertSame('1.01', $this->trail($this->carl)[0]['competenceCode']);
    }

    #[TestDox('UC-CAR-03-F05 — RG5 : le code n’est contrôlé que sur sa FORME (un code absent du référentiel passe)')]
    public function testF05CompetenceCodeIsFormatCheckedOnly(): void
    {
        // Comportement ACTUEL figé : « <pôle 1-7>.<2 chiffres> », sans consulter le référentiel.
        self::assertSame(201, $this->annotate($this->carl, ['competenceCode' => '7.99', 'type' => 'commentaire', 'texte' => 'Code hors référentiel.'])->getStatusCode());
        self::assertSame(201, $this->annotate($this->carl, ['competenceCode' => '1.00', 'type' => 'commentaire', 'texte' => 'Idem.'])->getStatusCode());
    }

    #[TestDox('UC-CAR-03-F06 — E3 : étranger, cartographe non lié, privée, inconnue → même 404 en écriture et en lecture')]
    public function testF06AccessRefusalsCollapseInto404(): void
    {
        $zoe = $this->registerAs('zoe@example.org', 'Zoé');
        $rita = $this->registerAs('rita@example.org', 'Rita', ['cartographe']);
        $privee = $this->createCarto($this->maya, ['titre' => 'Journal intime', 'visibility' => 'privee']);
        $body = ['competenceCode' => '1.01', 'type' => 'commentaire', 'texte' => 'Intrusion ?'];

        $bodies = [];
        foreach ([
            'etrangere' => [$zoe, $this->cartoId],
            'non_lie' => [$rita, $this->cartoId],
            'privee' => [$this->carl, $privee],
            'inconnue' => [$this->carl, 999999],
        ] as $case => [$actor, $cartoId]) {
            $post = $this->annotate($actor, $body, $cartoId);
            $get = $this->as_($actor, 'GET', '/api/cartographies/' . $cartoId . '/annotations');
            self::assertSame(404, $post->getStatusCode(), 'POST ' . $case);
            self::assertSame(404, $get->getStatusCode(), 'GET ' . $case);
            $bodies[] = (string) $post->getBody();
            $bodies[] = (string) $get->getBody();
        }
        self::assertSame(['{"error":"Cartographie introuvable"}'], array_values(array_unique($bodies)));
        self::assertSame(0, (int) self::$pdo->query('SELECT COUNT(*) FROM cartography_annotations')->fetchColumn());
    }

    #[TestDox('UC-CAR-03-F07 — E4 : supprimer l’annotation d’autrui ou inexistante → 404 ; l’auteur garde la main même privé d’accès')]
    public function testF07DeletionRefusalsAndAuthorKeepsHisHand(): void
    {
        $hers = (int) self::json($this->annotate($this->maya, ['competenceCode' => '1.01', 'type' => 'commentaire', 'texte' => 'De Maya.']))['id'];
        $his = (int) self::json($this->annotate($this->carl, ['competenceCode' => '1.01', 'type' => 'oubli', 'texte' => 'De Carl.']))['id'];

        foreach ([[$this->carl, $hers], [$this->maya, $his], [$this->carl, 999999]] as $i => [$actor, $id]) {
            $response = $this->as_($actor, 'DELETE', '/api/annotations/' . $id);
            self::assertSame(404, $response->getStatusCode(), 'cas #' . $i);
            self::assertSame(['error' => 'Annotation introuvable'], self::json($response));
        }

        // La cartographie repasse en privée : Carl ne la lit plus, mais son
        // annotation reste SON expression — il peut toujours la retirer.
        self::assertSame(200, $this->as_($this->maya, 'PATCH', '/api/cartographies/' . $this->cartoId, ['visibility' => 'privee'])->getStatusCode());
        self::assertSame(404, $this->as_($this->carl, 'GET', '/api/cartographies/' . $this->cartoId . '/annotations')->getStatusCode());
        self::assertSame(204, $this->as_($this->carl, 'DELETE', '/api/annotations/' . $his)->getStatusCode());
        self::assertSame([$hers], array_column($this->trail($this->maya), 'id'));
    }

    #[TestDox('UC-CAR-03-F08 — E5 : sans jeton CSRF → 403 en création comme en suppression')]
    public function testF08MutationsRequireCsrf(): void
    {
        $id = (int) self::json($this->annotate($this->carl, ['competenceCode' => '1.01', 'type' => 'commentaire', 'texte' => 'Note.']))['id'];

        $this->cookieSid = $this->carl['sid'];
        $post = $this->request('POST', '/api/cartographies/' . $this->cartoId . '/annotations', ['competenceCode' => '1.01', 'type' => 'commentaire', 'texte' => 'Sans jeton.']);
        $delete = $this->request('DELETE', '/api/annotations/' . $id);

        self::assertSame(403, $post->getStatusCode());
        self::assertSame(403, $delete->getStatusCode());
        self::assertSame([$id], array_column($this->trail($this->carl), 'id'));
    }
}
