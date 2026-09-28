<?php

declare(strict_types=1);

namespace Humanome\Tests\UseCases\Functional;

use Humanome\Tests\CartographeTestCase;
use PHPUnit\Framework\Attributes\TestDox;

/**
 * UC-APP-04 — Stocker une cartographie sur le serveur et régler sa
 * confidentialité : tests FONCTIONNELS (API).
 *
 * Fiche : docs/cas-utilisation/apprenant/UC-APP-04-stocker-regler-confidentialite.md
 *
 * Chaque test rejoue un scénario de la fiche à travers l'API HTTP
 * (application Slim en processus, vraie base MySQL) : l'apprenant connecté
 * (session + jeton CSRF) confie une copie de sa cartographie au serveur,
 * la consulte, en règle la confidentialité, puis la retire ; le cartographe
 * lié (effet de la visibilité) et l'employeur (lien purgé) sont joués avec
 * leurs propres navigateurs simulés.
 */
final class UcApp04StockerConfidentialiteTest extends CartographeTestCase
{
    /** @var array{id: int, csrf: string, sid: string} */
    private array $maya;

    protected function setUp(): void
    {
        parent::setUp();
        self::$pdo->exec('DELETE FROM prompt_packages');
        self::$pdo->exec('DELETE FROM referentiel_versions');
        $this->maya = $this->registerAs('maya@example.org', 'Maya');
    }

    /** Une version publiée du paquet et du référentiel (références rejouables). */
    private static function publishVersions(): void
    {
        self::$pdo->exec("INSERT INTO prompt_packages (slug, description) VALUES ('aurora-demo', 'Paquet de démonstration')");
        $packageId = (int) self::$pdo->lastInsertId();
        self::$pdo->prepare(
            "INSERT INTO prompt_versions (package_id, semver, status, content, published_at)
             VALUES (?, '1.0.0', 'published', '{\"id\": \"aurora-demo\"}', NOW())"
        )->execute([$packageId]);
        self::$pdo->prepare(
            "INSERT INTO prompt_versions (package_id, semver, status, content)
             VALUES (?, '2.0.0', 'draft', '{\"id\": \"aurora-demo\"}')"
        )->execute([$packageId]);
        self::$pdo->exec(
            "INSERT INTO referentiel_versions (referentiel_id, semver, label, status, content, content_hash, published_at)
             VALUES ('respire', '7.0.0', 'RESPIRE v7', 'published', '{}', REPEAT('0', 64), NOW())"
        );
    }

    /** @return array<string, mixed> corps POST complet, tel que l'envoie « Mes cartographies » */
    private static function optInBody(array $overrides = []): array
    {
        return array_merge([
            'type' => 'jour',
            'titre' => 'Journée du 05/01/2026',
            'visibility' => 'privee',
            'document' => self::jourDocument(),
        ], $overrides);
    }

    private static function countCartographies(): int
    {
        return (int) self::$pdo->query('SELECT COUNT(*) FROM cartographies')->fetchColumn();
    }

    #[TestDox('UC-APP-04-F01 — nominal : copie serveur (opt-in daté), consultation, puis réglage de la confidentialité')]
    public function testF01NominalOptInConsultAndSetVisibility(): void
    {
        self::publishVersions();

        // 3-4. Le POST EST l'opt-in : document + références de versions publiées + runMeta.
        $created = $this->as_($this->maya, 'POST', '/api/cartographies', self::optInBody([
            'promptPackageId' => 'aurora-demo',
            'promptPackageVersion' => '1.0.0',
            'referentielId' => 'respire',
            'referentielVersion' => '7.0.0',
            'runMeta' => ['modele' => 'mock', 'dateRun' => '2026-07-01T10:00:00Z'],
        ]));
        self::assertSame(201, $created->getStatusCode(), (string) $created->getBody());
        $id = self::json($created)['id'];
        self::assertIsInt($id);
        self::assertSame(['id'], array_keys(self::json($created)));
        self::assertNotNull(
            self::$pdo->query('SELECT opt_in_at FROM cartographies WHERE id = ' . $id)->fetchColumn(),
            'opt_in_at posé par l’INSERT (§6.2)',
        );

        // 5. La liste : métadonnées seulement, jamais le document.
        $list = $this->as_($this->maya, 'GET', '/api/cartographies');
        self::assertSame(200, $list->getStatusCode());
        self::assertCount(1, self::json($list));
        self::assertSame('privee', self::json($list)[0]['visibility']);
        self::assertArrayNotHasKey('document', self::json($list)[0]);
        self::assertStringNotContainsString('cartographie-jour', (string) $list->getBody());

        // 5. Le détail : document intégral, date d'opt-in, versions rejouables.
        $detail = self::json($this->as_($this->maya, 'GET', '/api/cartographies/' . $id));
        self::assertEquals(self::jourDocument(), $detail['document']);
        self::assertMatchesRegularExpression('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/', $detail['optInAt']);
        self::assertSame(['id' => 'aurora-demo', 'version' => '1.0.0'], $detail['promptPackage']);
        self::assertSame(['id' => 'respire', 'version' => '7.0.0'], $detail['referentiel']);
        self::assertEquals(['modele' => 'mock', 'dateRun' => '2026-07-01T10:00:00Z'], $detail['runMeta']);

        // 6-7. Confidentialité : PATCH {visibility} → métadonnées sans document.
        $patched = $this->as_($this->maya, 'PATCH', '/api/cartographies/' . $id, ['visibility' => 'cartographe']);
        self::assertSame(200, $patched->getStatusCode(), (string) $patched->getBody());
        self::assertSame('cartographe', self::json($patched)['visibility']);
        self::assertArrayNotHasKey('document', self::json($patched));
        self::assertSame('cartographe', self::json($this->as_($this->maya, 'GET', '/api/cartographies'))[0]['visibility']);
    }

    #[TestDox('UC-APP-04-F02 — A6 : visibilité omise → la copie serveur est « privée » par défaut')]
    public function testF02DefaultVisibilityIsPrivate(): void
    {
        $body = self::optInBody();
        unset($body['visibility']);

        $id = self::json($this->as_($this->maya, 'POST', '/api/cartographies', $body))['id'];

        self::assertSame('privee', self::json($this->as_($this->maya, 'GET', '/api/cartographies/' . $id))['visibility']);
    }

    #[TestDox('UC-APP-04-F03 — A2 : « partagée avec mon cartographe » ouvre la relecture au cartographe lié ; « privée » la coupe aussitôt')]
    public function testF03CartographeVisibilityOpensThenPrivateCutsTheLinkedCartographe(): void
    {
        $camille = $this->registerAs('camille@example.org', 'Camille', ['cartographe']);
        $this->link($this->maya, $camille);
        $id = $this->createCarto($this->maya, ['visibility' => 'privee', 'document' => self::jourDocument()]);

        // Privée : invisible pour le cartographe, pourtant lié.
        self::assertSame([], self::json($this->as_($camille, 'GET', '/api/cartographe/cartographies')));
        self::assertSame(404, $this->as_($camille, 'GET', '/api/cartographe/cartographies/' . $id)->getStatusCode());

        self::assertSame(200, $this->as_($this->maya, 'PATCH', '/api/cartographies/' . $id, ['visibility' => 'cartographe'])->getStatusCode());
        $queue = self::json($this->as_($camille, 'GET', '/api/cartographe/cartographies'));
        self::assertSame([$id], array_column($queue, 'id'));
        self::assertSame(200, $this->as_($camille, 'GET', '/api/cartographe/cartographies/' . $id)->getStatusCode());

        // Retour à « privée » : l'apprenant reste maître, l'accès tombe immédiatement.
        self::assertSame(200, $this->as_($this->maya, 'PATCH', '/api/cartographies/' . $id, ['visibility' => 'privee'])->getStatusCode());
        self::assertSame([], self::json($this->as_($camille, 'GET', '/api/cartographe/cartographies')));
        self::assertSame(404, $this->as_($camille, 'GET', '/api/cartographe/cartographies/' . $id)->getStatusCode());
    }

    #[TestDox('UC-APP-04-F04 — A2 : « publique » est consultable par le cartographe lié, jamais par un cartographe non lié')]
    public function testF04PublicVisibilityStaysScopedToLinkedCartographes(): void
    {
        $camille = $this->registerAs('camille@example.org', 'Camille', ['cartographe']);
        $noe = $this->registerAs('noe@example.org', 'Noé', ['cartographe']);
        $this->link($this->maya, $camille);
        $id = $this->createCarto($this->maya, ['visibility' => 'publique']);

        self::assertSame([$id], array_column(self::json($this->as_($camille, 'GET', '/api/cartographe/cartographies')), 'id'));
        self::assertSame([], self::json($this->as_($noe, 'GET', '/api/cartographe/cartographies')));
        self::assertSame(404, $this->as_($noe, 'GET', '/api/cartographe/cartographies/' . $id)->getStatusCode());
    }

    #[TestDox('UC-APP-04-F05 — A3 : renommer par PATCH {titre} (espaces rognés) ; un PATCH vide est un succès sans effet')]
    public function testF05RenameAndEmptyPatch(): void
    {
        $id = $this->createCarto($this->maya, ['titre' => 'Brouillon', 'visibility' => 'privee']);

        $renamed = $this->as_($this->maya, 'PATCH', '/api/cartographies/' . $id, ['titre' => '  Journée clé  ']);
        self::assertSame(200, $renamed->getStatusCode());
        self::assertSame('Journée clé', self::json($renamed)['titre']);
        self::assertSame('privee', self::json($renamed)['visibility'], 'la visibilité n’est pas touchée');

        $noop = $this->as_($this->maya, 'PATCH', '/api/cartographies/' . $id, []);
        self::assertSame(200, $noop->getStatusCode());
        self::assertSame('Journée clé', self::json($noop)['titre']);
    }

    #[TestDox('UC-APP-04-F06 — A4 : retirer du serveur → purge réelle (ligne + liens), le lien employeur meurt, 404 ensuite')]
    public function testF06RemoveFromServerPurgesRowAndLinks(): void
    {
        $id = $this->createCarto($this->maya, ['visibility' => 'publique']);
        $share = $this->as_($this->maya, 'POST', '/api/cartographies/' . $id . '/share', ['password' => 'sesame-employeur']);
        self::assertSame(201, $share->getStatusCode());
        $token = (string) self::json($share)['token'];

        $deleted = $this->as_($this->maya, 'DELETE', '/api/cartographies/' . $id);
        self::assertSame(204, $deleted->getStatusCode());
        self::assertSame('', (string) $deleted->getBody());

        self::assertSame(0, self::countCartographies());
        self::assertSame(0, (int) self::$pdo->query('SELECT COUNT(*) FROM share_links')->fetchColumn());
        self::assertSame([], self::json($this->as_($this->maya, 'GET', '/api/cartographies')));
        self::assertSame(404, $this->as_($this->maya, 'GET', '/api/cartographies/' . $id)->getStatusCode());
        self::assertSame(404, $this->as_($this->maya, 'DELETE', '/api/cartographies/' . $id)->getStatusCode());

        // Le lien transmis à un employeur ne sert plus rien (même 404 que UC-EMP-01 E3).
        $this->cookieSid = null;
        $this->clientIp = '198.51.100.7';
        self::assertSame(404, $this->request('POST', '/api/share/' . $token, ['password' => 'sesame-employeur'])->getStatusCode());
    }

    #[TestDox('UC-APP-04-F07 — E1 : sans session → 401 sur chaque route, rien n’est stocké')]
    public function testF07AnonymousIsRejected(): void
    {
        $id = $this->createCarto($this->maya);
        $this->cookieSid = null;

        foreach ([
            ['POST', '/api/cartographies', self::optInBody()],
            ['GET', '/api/cartographies', null],
            ['GET', '/api/cartographies/' . $id, null],
            ['PATCH', '/api/cartographies/' . $id, ['visibility' => 'publique']],
            ['DELETE', '/api/cartographies/' . $id, null],
        ] as [$method, $path, $body]) {
            $response = $this->request($method, $path, $body);
            self::assertSame(401, $response->getStatusCode(), $method . ' ' . $path);
            self::assertSame('Authentification requise', self::json($response)['error']);
        }
        self::assertSame(1, self::countCartographies());
        self::assertSame('cartographe', self::$pdo->query('SELECT visibility FROM cartographies')->fetchColumn());
    }

    #[TestDox('UC-APP-04-F08 — E2 : un compte sans le rôle apprenant → 403')]
    public function testF08RoleApprenantRequired(): void
    {
        $camille = $this->registerAs('camille@example.org', 'Camille', ['cartographe']);

        $response = $this->as_($camille, 'POST', '/api/cartographies', self::optInBody());
        self::assertSame(403, $response->getStatusCode());
        self::assertSame('Rôle insuffisant', self::json($response)['error']);
        self::assertSame(403, $this->as_($camille, 'GET', '/api/cartographies')->getStatusCode());
        self::assertSame(0, self::countCartographies());
    }

    #[TestDox('UC-APP-04-F09 — E3 : mutation sans jeton CSRF → 403, rien ne change')]
    public function testF09MutationsWithoutCsrfAreRefused(): void
    {
        $id = $this->createCarto($this->maya, ['visibility' => 'privee']);
        $this->cookieSid = $this->maya['sid'];

        foreach ([
            ['POST', '/api/cartographies', self::optInBody()],
            ['PATCH', '/api/cartographies/' . $id, ['visibility' => 'publique']],
            ['DELETE', '/api/cartographies/' . $id, null],
        ] as [$method, $path, $body]) {
            $response = $this->request($method, $path, $body);
            self::assertSame(403, $response->getStatusCode(), $method . ' ' . $path);
            self::assertSame('Jeton CSRF absent ou invalide', self::json($response)['error']);
        }
        self::assertSame(1, self::countCartographies());
        self::assertSame('privee', self::$pdo->query('SELECT visibility FROM cartographies')->fetchColumn());
    }

    #[TestDox('UC-APP-04-F10 — E4 : corps de copie invalide → 422 avec le champ fautif, aucune ligne créée')]
    public function testF10InvalidOptInBodyIsRejectedFieldByField(): void
    {
        self::publishVersions();
        $cases = [
            'type' => ['type' => 'hebdo'],
            'titre' => ['titre' => '   '],
            'titre ' => ['titre' => str_repeat('é', 191)],
            'visibility' => ['visibility' => 'amis'],
            'document' => ['document' => ['liste', 'pas objet']],
            'document ' => ['document' => []],
            'runMeta' => ['runMeta' => 'texte'],
            'runMeta ' => ['runMeta' => ['blob' => str_repeat('x', 64 * 1024)]],
            'promptPackageId' => ['promptPackageId' => 'aurora-demo'],
            'promptPackageId ' => ['promptPackageId' => 'aurora-demo', 'promptPackageVersion' => '2.0.0'],
            'referentielId' => ['referentielId' => 'respire', 'referentielVersion' => '9.9.9'],
        ];
        foreach ($cases as $field => $overrides) {
            $response = $this->as_($this->maya, 'POST', '/api/cartographies', self::optInBody($overrides));
            self::assertSame(422, $response->getStatusCode(), 'cas ' . $field);
            $body = self::json($response);
            self::assertSame('Validation échouée', $body['error']);
            self::assertArrayHasKey(trim($field), $body['fields'], 'cas ' . $field);
        }
        self::assertStringContainsString(
            'aurora-demo@2.0.0',
            self::json($this->as_($this->maya, 'POST', '/api/cartographies', self::optInBody($cases['promptPackageId '])))['fields']['promptPackageId'],
            'une version brouillon n’est pas rejouable',
        );
        self::assertSame(0, self::countCartographies());
    }

    #[TestDox('UC-APP-04-F11 — E4 : document de plus de 8 Mo → 422 « Document trop volumineux »')]
    public function testF11OversizedDocumentIsRejected(): void
    {
        $response = $this->as_($this->maya, 'POST', '/api/cartographies', self::optInBody([
            'document' => ['kind' => 'cartographie-jour', 'blob' => str_repeat('x', 8 * 1024 * 1024)],
        ]));

        self::assertSame(422, $response->getStatusCode());
        self::assertSame('Document trop volumineux (8 Mo maximum)', self::json($response)['fields']['document']);
        self::assertSame(0, self::countCartographies());
    }

    #[TestDox('UC-APP-04-F12 — E5 : PATCH invalide (titre vide ou trop long, visibilité inconnue) → 422, rien ne change')]
    public function testF12InvalidPatchIsRejected(): void
    {
        $id = $this->createCarto($this->maya, ['titre' => 'Intact', 'visibility' => 'privee']);

        foreach ([
            'titre' => ['titre' => ''],
            'titre ' => ['titre' => 42],
            'titre  ' => ['titre' => str_repeat('a', 191)],
            'visibility' => ['visibility' => 'tout-le-monde'],
        ] as $field => $body) {
            $response = $this->as_($this->maya, 'PATCH', '/api/cartographies/' . $id, $body + ['visibility' => 'publique']);
            self::assertSame(422, $response->getStatusCode(), 'cas ' . $field);
            self::assertArrayHasKey(trim($field), self::json($response)['fields']);
        }
        $row = self::$pdo->query('SELECT titre, visibility FROM cartographies WHERE id = ' . $id)->fetch();
        self::assertSame(['titre' => 'Intact', 'visibility' => 'privee'], $row, 'tout ou rien : la visibilité valide n’est pas appliquée non plus');
    }

    #[TestDox('UC-APP-04-F13 — E6 : id inconnu ou d’un autre apprenant → même 404 sur GET, PATCH et DELETE')]
    public function testF13ForeignOrUnknownIdCollapseIntoOne404(): void
    {
        $id = $this->createCarto($this->maya, ['titre' => 'À Maya', 'visibility' => 'privee']);
        $intrus = $this->registerAs('intrus@example.org', 'Intrus');

        $bodies = [];
        foreach ([$id, $id + 1000] as $target) {
            foreach ([
                ['GET', null],
                ['PATCH', ['titre' => 'Volée', 'visibility' => 'publique']],
                ['DELETE', null],
            ] as [$method, $body]) {
                $response = $this->as_($intrus, $method, '/api/cartographies/' . $target, $body);
                self::assertSame(404, $response->getStatusCode(), $method . ' ' . $target);
                $bodies[] = (string) $response->getBody();
            }
        }
        self::assertSame(['{"error":"Cartographie introuvable"}'], array_values(array_unique($bodies)), 'aucun oracle d’existence');
        $row = self::$pdo->query('SELECT titre, visibility FROM cartographies WHERE id = ' . $id)->fetch();
        self::assertSame(['titre' => 'À Maya', 'visibility' => 'privee'], $row);
        self::assertSame([], self::json($this->as_($intrus, 'GET', '/api/cartographies')));
    }

    #[TestDox('UC-APP-04-F14 — écart figé : un document non conforme au schéma, ou d’un autre type, est stocké (201)')]
    public function testF14DocumentIsNotSchemaValidatedAtOptIn(): void
    {
        // Comportement ACTUEL (voir fiche, « Anomalies constatées ») : seul
        // « objet JSON non vide ≤ 8 Mo » est vérifié ; le schéma n'est appliqué
        // qu'aux révisions (UC-CAR-04), et le type n'est pas croisé avec le document.
        $free = $this->as_($this->maya, 'POST', '/api/cartographies', self::optInBody(['document' => ['k' => 'v']]));
        self::assertSame(201, $free->getStatusCode());

        $mismatch = $this->as_($this->maya, 'POST', '/api/cartographies', self::optInBody(['type' => 'merge']));
        self::assertSame(201, $mismatch->getStatusCode());
        $stored = self::json($this->as_($this->maya, 'GET', '/api/cartographies/' . self::json($mismatch)['id']));
        self::assertSame('merge', $stored['type']);
        self::assertSame('cartographie-jour', $stored['document']['kind']);
    }
}
