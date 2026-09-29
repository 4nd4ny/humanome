<?php

declare(strict_types=1);

namespace Humanome\Tests\UseCases\Functional;

use Humanome\Db;
use Humanome\Tests\MasseTestCase;
use Humanome\Tests\UseCases\Support\EtaSupport;
use Humanome\Tests\UseCases\Support\EtaTickSupport;
use PHPUnit\Framework\Attributes\TestDox;

/**
 * UC-ETA-01 — Créer et gérer une cohorte : tests FONCTIONNELS (API).
 *
 * Fiche : docs/cas-utilisation/etablissement/UC-ETA-01-gerer-cohorte.md
 *
 * Chaque test rejoue un scénario de la fiche à travers l'API HTTP (application
 * Slim en processus, vraie base MySQL) : le compte établissement agit avec sa
 * session et son jeton CSRF ; les apprenants rejoignent et déposent par les
 * routes réelles (préconditions, UC-APP-08) ; les runs avancent par ticks
 * simulés (fournisseur mock injecté, aucun appel réseau).
 */
final class UcEta01GererCohorteTest extends MasseTestCase
{
    use EtaSupport;
    use EtaTickSupport;

    #[TestDox('UC-ETA-01-F01 — nominal : création, code transmis, liste puis détail des membres (consentement, dépôt, avancement) sans contenu')]
    public function testF01NominalCreateListAndFollowMembers(): void
    {
        $etab = $this->registerEtablissement();
        $this->configure($etab, 50.0);

        // 1-4. Création : 201 {id, codeInvitation}.
        $created = $this->as_($etab, 'POST', '/api/etablissement/cohortes', ['nom' => '  Terminale B  ']);
        self::assertSame(201, $created->getStatusCode(), (string) $created->getBody());
        $body = self::json($created);
        self::assertSame(['id', 'codeInvitation'], array_keys($body));
        self::assertMatchesRegularExpression('/^[A-Z2-9]{10}$/', $body['codeInvitation']);
        $cohorteId = (int) $body['id'];

        // 5. Liste : nom nettoyé, code, 0 membre.
        $list = self::json($this->as_($etab, 'GET', '/api/etablissement/cohortes'));
        self::assertCount(1, $list);
        self::assertSame('Terminale B', $list[0]['nom']);
        self::assertSame($body['codeInvitation'], $list[0]['codeInvitation']);
        self::assertSame(0, $list[0]['membres']);

        // 6. Les apprenants rejoignent avec le code et déposent (UC-APP-08).
        $maya = $this->enrolLearner($body['codeInvitation'], $cohorteId, 1, ['2026-01-05', '2026-01-06']);
        $noe = $this->registerAs('noe@example.org', 'Noé');
        $joined = $this->as_($noe, 'POST', "/api/cohortes/{$body['codeInvitation']}/rejoindre", ['consentement' => true]);
        self::assertSame(201, $joined->getStatusCode());
        $this->launchRun($etab, $cohorteId);
        $this->tick(['maxCalls' => 8]); // une journée sur deux extraite

        // 7. Détail : consentement daté, dépôt décrit sans contenu, avancement.
        $detailResponse = $this->as_($etab, 'GET', '/api/etablissement/cohortes/' . $cohorteId);
        self::assertSame(200, $detailResponse->getStatusCode());
        $detail = self::json($detailResponse);
        self::assertSame(['id', 'nom', 'codeInvitation', 'createdAt', 'consentement', 'membres'], array_keys($detail));
        self::assertStringContainsString('cartographies produites dans ce cadre', $detail['consentement']);
        self::assertMatchesRegularExpression('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/', $detail['createdAt']);
        self::assertSame([$maya['id'], $noe['id']], array_column($detail['membres'], 'userId'));

        $membreMaya = $detail['membres'][0];
        self::assertSame('Apprenant 1', $membreMaya['displayName']);
        self::assertMatchesRegularExpression('/^\d{4}-\d{2}-\d{2}T/', $membreMaya['consentAt']);
        self::assertSame('Portfolio 1', $membreMaya['portfolio']['titre']);
        self::assertSame(2, $membreMaya['portfolio']['journees']);
        self::assertGreaterThan(0, $membreMaya['portfolio']['taille']);
        self::assertSame(['jobsTotal' => 2, 'jobsDone' => 1], $membreMaya['avancement']);
        self::assertFalse($detail['membres'][1]['portfolioDepose'], 'Noé a consenti sans déposer');
        self::assertStringNotContainsString("aujourd'hui j'ai", (string) $detailResponse->getBody(), 'jamais le texte déposé');

        self::assertSame(2, self::json($this->as_($etab, 'GET', '/api/etablissement/cohortes'))[0]['membres']);
    }

    #[TestDox('UC-ETA-01-F02 — A1 : suppression → 204, purge réelle de l’arbre (adhésions, dépôts, runs, jobs)')]
    public function testF02DeleteCohortePurgesTheTree(): void
    {
        $etab = $this->registerEtablissement();
        $this->configure($etab, 50.0);
        $cohorte = $this->createCohorte($etab);
        $learner = $this->enrolLearner($cohorte['code'], $cohorte['id'], 1, ['2026-01-05']);
        $this->launchRun($etab, $cohorte['id']);
        $this->tickUntilDrained();
        self::assertCount(1, self::json($this->as_($learner, 'GET', '/api/mes-documents-masse'))['documents']);

        $deleted = $this->as_($etab, 'DELETE', '/api/etablissement/cohortes/' . $cohorte['id']);

        self::assertSame(204, $deleted->getStatusCode());
        self::assertSame('', (string) $deleted->getBody());
        self::assertSame(404, $this->as_($etab, 'GET', '/api/etablissement/cohortes/' . $cohorte['id'])->getStatusCode());
        self::assertSame([], self::json($this->as_($etab, 'GET', '/api/etablissement/cohortes')));
        foreach (['cohortes', 'cohorte_membres', 'cohorte_portfolios', 'mass_runs', 'mass_jobs'] as $table) {
            self::assertSame(0, (int) Db::get()->query("SELECT COUNT(*) FROM {$table}")->fetchColumn(), $table);
        }
        // L'apprenant n'est plus membre de rien…
        self::assertSame([], self::json($this->as_($learner, 'GET', '/api/cohortes')));
        // …et (comportement ACTUEL, voir « Anomalies constatées » de la fiche)
        // les documents déjà produits pour lui disparaissent avec la cohorte.
        self::assertSame([], self::json($this->as_($learner, 'GET', '/api/mes-documents-masse'))['documents']);
    }

    #[TestDox('UC-ETA-01-F03 — E1 : nom absent, vide, non textuel ou > 190 caractères → 422 {fields.nom}')]
    public function testF03InvalidNameIsRejected(): void
    {
        $etab = $this->registerEtablissement();

        foreach ([[], ['nom' => ''], ['nom' => '   '], ['nom' => 42], ['nom' => str_repeat('é', 191)]] as $bodyIn) {
            $response = $this->as_($etab, 'POST', '/api/etablissement/cohortes', $bodyIn);
            self::assertSame(422, $response->getStatusCode(), json_encode($bodyIn));
            $body = self::json($response);
            self::assertSame('Validation échouée', $body['error']);
            self::assertArrayHasKey('nom', $body['fields']);
        }
        self::assertSame(0, (int) Db::get()->query('SELECT COUNT(*) FROM cohortes')->fetchColumn());

        // Borne : 190 caractères (multi-octets) acceptés.
        self::assertSame(201, $this->as_($etab, 'POST', '/api/etablissement/cohortes', ['nom' => str_repeat('é', 190)])->getStatusCode());
    }

    #[TestDox('UC-ETA-01-F04 — E2 : cohorte d’un autre établissement ou inexistante → même 404, rien n’est supprimé')]
    public function testF04ForeignOrUnknownCohorteIs404(): void
    {
        $etab = $this->registerEtablissement();
        $cohorte = $this->createCohorte($etab);
        $autre = $this->registerEtablissement('autre@example.org');

        $foreignGet = $this->as_($autre, 'GET', '/api/etablissement/cohortes/' . $cohorte['id']);
        $unknownGet = $this->as_($autre, 'GET', '/api/etablissement/cohortes/999999');
        $foreignDelete = $this->as_($autre, 'DELETE', '/api/etablissement/cohortes/' . $cohorte['id']);

        foreach ([$foreignGet, $unknownGet, $foreignDelete] as $response) {
            self::assertSame(404, $response->getStatusCode());
            self::assertSame(['error' => 'Cohorte introuvable'], self::json($response));
        }
        self::assertSame([], self::json($this->as_($autre, 'GET', '/api/etablissement/cohortes')), 'liste cloisonnée');
        self::assertSame(200, $this->as_($etab, 'GET', '/api/etablissement/cohortes/' . $cohorte['id'])->getStatusCode());
    }

    #[TestDox('UC-ETA-01-F05 — E3 : visiteur → 401, compte sans rôle établissement → 403, sur chaque route')]
    public function testF05RoleGuards(): void
    {
        $etab = $this->registerEtablissement();
        $cohorte = $this->createCohorte($etab);
        $learner = $this->registerAs('eleve@example.org', 'Élève');
        $routes = [
            ['POST', '/api/etablissement/cohortes', ['nom' => 'X']],
            ['GET', '/api/etablissement/cohortes', null],
            ['GET', '/api/etablissement/cohortes/' . $cohorte['id'], null],
            ['DELETE', '/api/etablissement/cohortes/' . $cohorte['id'], null],
        ];

        foreach ($routes as [$method, $path, $body]) {
            $this->cookieSid = null;
            self::assertSame(401, $this->request($method, $path, $body)->getStatusCode(), "visiteur {$method} {$path}");
            self::assertSame(403, $this->as_($learner, $method, $path, $body)->getStatusCode(), "apprenant {$method} {$path}");
        }
        self::assertSame(1, (int) Db::get()->query('SELECT COUNT(*) FROM cohortes')->fetchColumn());
    }

    #[TestDox('UC-ETA-01-F06 — E4 : mutation sans jeton CSRF (session ouverte) → 403, aucun effet')]
    public function testF06MutationsRequireCsrf(): void
    {
        $etab = $this->registerEtablissement();
        $cohorte = $this->createCohorte($etab);

        $this->cookieSid = $etab['sid'];
        $create = $this->request('POST', '/api/etablissement/cohortes', ['nom' => 'Sans CSRF']);
        $this->cookieSid = $etab['sid'];
        $delete = $this->request('DELETE', '/api/etablissement/cohortes/' . $cohorte['id'], null, ['X-CSRF-Token' => 'faux-jeton']);

        foreach ([$create, $delete] as $response) {
            self::assertSame(403, $response->getStatusCode());
            self::assertSame('Jeton CSRF absent ou invalide', self::json($response)['error']);
        }
        self::assertSame(1, (int) Db::get()->query('SELECT COUNT(*) FROM cohortes')->fetchColumn());
    }

    #[TestDox('UC-ETA-01-F07 — A2 : plusieurs cohortes, codes distincts ; l’apprenant rejoint la bonne cohorte par son code ; liste triée par identifiant')]
    public function testF07SeveralCohortesEachWithItsOwnCode(): void
    {
        $etab = $this->registerEtablissement();
        // Créées dans l'ordre inverse de l'ordre alphabétique : la liste doit
        // suivre l'identifiant (ordre de création), pas le nom.
        $c = $this->createCohorte($etab, 'Terminale C');
        $b = $this->createCohorte($etab, 'Terminale B');
        self::assertNotSame($b['code'], $c['code']);

        $learner = $this->registerAs('eleve@example.org', 'Élève');
        // Le code est accepté en minuscules (strtoupper côté serveur ; la
        // colonne utf8mb4_unicode_ci est de toute façon insensible à la casse).
        $joined = $this->as_($learner, 'POST', '/api/cohortes/' . strtolower($c['code']) . '/rejoindre', ['consentement' => true]);
        self::assertSame(201, $joined->getStatusCode());
        self::assertSame($c['id'], self::json($joined)['cohorteId']);

        $list = self::json($this->as_($etab, 'GET', '/api/etablissement/cohortes'));
        self::assertSame(['Terminale C', 'Terminale B'], array_column($list, 'nom'));
        self::assertSame([$c['id'], $b['id']], array_column($list, 'id'));
        self::assertSame([1, 0], array_column($list, 'membres'));
    }
}
