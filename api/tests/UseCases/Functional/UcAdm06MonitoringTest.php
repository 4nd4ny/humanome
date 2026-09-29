<?php

declare(strict_types=1);

namespace Humanome\Tests\UseCases\Functional;

use Humanome\Geo\CountryResolver;
use Humanome\Tests\AdminTestCase;
use Humanome\Tests\TestDb;
use PHPUnit\Framework\Attributes\TestDox;

/**
 * UC-ADM-06 — Consulter le monitoring : tests FONCTIONNELS (API).
 *
 * Fiche : docs/cas-utilisation/administration/UC-ADM-06-monitoring.md
 *
 * L'activité mesurée est produite par les VRAIES routes (inscription +
 * activation, connexions réussies et échouées, cartographie stockée, lien de
 * partage créé puis consulté par un employeur), puis l'administrateur lit
 * GET /api/admin/monitoring. La base GeoIP est absente (GEOIP_DB vide) : le
 * pays vaut null, comme en production tant que le fichier MMDB n'est pas
 * déposé ; un test simule sa présence par la couture de CountryResolver.
 */
final class UcAdm06MonitoringTest extends AdminTestCase
{
    private const SECRET_TEXT = 'Portfolio très personnel de Maya — ne jamais journaliser';

    protected function setUp(): void
    {
        parent::setUp();
        TestDb::setEnv('GEOIP_DB', '');
        CountryResolver::setOverride(null);
        foreach (['sessions', 'llm_usage_daily', 'tuteur_usage_daily', 'competence_votes', 'competence_versions'] as $table) {
            self::$pdo->exec("DELETE FROM {$table}");
        }
    }

    protected function tearDown(): void
    {
        CountryResolver::setOverride(null);
        parent::tearDown();
    }

    /** Activité réelle : 2 comptes, 1 cartographie, 1 partage consulté, 2 échecs de connexion. */
    private function produceActivity(): array
    {
        $admin = $this->registerAdmin('root@example.org');
        $maya = $this->registerAs('maya@example.org', 'Maya', ['apprenant']);
        $cartoId = $this->createCarto($maya, [
            'visibility' => 'publique',
            'document' => ['kind' => 'cartographie-jour', 'date' => '2026-01-05', 'poles' => [], 'note' => self::SECRET_TEXT],
        ]);
        $share = $this->as_($maya, 'POST', "/api/cartographies/{$cartoId}/share", ['password' => 'sesame-employeur']);
        self::assertSame(201, $share->getStatusCode());
        $this->cookieSid = null;
        $this->clientIp = '198.51.100.7';
        self::assertSame(200, $this->request('POST', '/api/share/' . self::json($share)['token'], ['password' => 'sesame-employeur'])->getStatusCode());

        $this->clientIp = '203.0.113.10';
        $this->cookieSid = null;
        self::assertSame(401, $this->login('maya@example.org', 'mauvais mot de passe')->getStatusCode());
        $this->cookieSid = null;
        self::assertSame(401, $this->login('inconnu@example.org', 'peu importe')->getStatusCode());

        return [$admin, $maya];
    }

    #[TestDox('UC-ADM-06-F01 — nominal : l’admin lit le tableau de bord (utilisateurs, cartographies, partages, connexions) produit par l’activité réelle')]
    public function testF01NominalDashboard(): void
    {
        [$admin] = $this->produceActivity();

        $response = $this->as_($admin, 'GET', '/api/admin/monitoring?days=7');

        self::assertSame(200, $response->getStatusCode());
        $body = self::json($response);
        self::assertSame(['jours' => 7], $body['periode']);
        self::assertSame(2, $body['utilisateurs']['total']);
        self::assertSame(2, $body['utilisateurs']['nouveauxPeriode']);
        self::assertSame(0, $body['utilisateurs']['nonActives'], 'comptes activés par code');
        self::assertSame(2, $body['utilisateurs']['actifsMaintenant'], 'deux comptes DISTINCTS, sessions ouvertes à l’instant');
        self::assertSame(0, $body['utilisateurs']['sessionsAnonymes'], 'ni la consultation du partage ni les échecs de connexion n’ouvrent de session');
        self::assertEquals(['admin' => 1, 'apprenant' => 1], array_column($body['utilisateurs']['parRole'], 'n', 'role'));

        self::assertSame(1, $body['cartographies']['total']);
        self::assertSame(1, $body['cartographies']['avecDocument']);
        self::assertSame(1, $body['cartographies']['partages']['actifs']);
        self::assertSame(1, $body['cartographies']['partages']['creesPeriode']);
        self::assertSame(1, $body['cartographies']['partages']['consultationsPeriode']);

        self::assertSame(['reussies' => 2, 'echouees' => 2], $body['connexions']['periode'], 'activations = connexions');
        self::assertSame([['pays' => null, 'n' => 2]], $body['connexions']['parPays'], 'sans MMDB : pays inconnu');
        $latest = $body['connexions']['dernieres'][0];
        self::assertFalse($latest['reussie']);
        self::assertNull($latest['email'], 'e-mail inconnu : non rattaché');
        self::assertSame('203.0.113.0/24', $latest['reseau']);
        self::assertSame('maya@example.org', $body['connexions']['dernieres'][1]['email'], 'échec rattaché au compte visé');

        self::assertSame([], $body['votes']['competences']);
        self::assertSame(0, $body['tokens']['periode']['demo']['requetes']);
    }

    #[TestDox('UC-ADM-06-F02 — RGPD : ni IP complète, ni contenu de cartographie, ni secret dans la réponse ou le journal')]
    public function testF02NoContentNoRawIp(): void
    {
        [$admin] = $this->produceActivity();

        $raw = (string) $this->as_($admin, 'GET', '/api/admin/monitoring?days=365')->getBody();

        foreach (['203.0.113.10', '198.51.100.7', self::SECRET_TEXT, 'sesame-employeur', 'password'] as $needle) {
            self::assertStringNotContainsString($needle, $raw);
        }
        $journal = (string) json_encode(self::$pdo->query(
            "SELECT details FROM audit_events WHERE type IN ('login', 'login_failed')"
        )->fetchAll());
        self::assertStringNotContainsString('203.0.113.10', $journal);
        self::assertStringContainsString('203.0.113.0\\/24', $journal);
    }

    #[TestDox('UC-ADM-06-F03 — A1 : changer de période (days) ; absent → 30 ; converti par (int) (« 7abc » → 7, « abc » → 0) puis borné à 1..365')]
    public function testF03PeriodSelection(): void
    {
        $admin = $this->registerAdmin('root@example.org');
        self::$pdo->exec(
            "INSERT INTO llm_usage_daily (usage_date, requests, input_tokens, output_tokens, estimated_cost_usd) VALUES
             (CURDATE(), 4, 1000, 200, 0.01), (CURDATE() - INTERVAL 20 DAY, 6, 3000, 600, 0.03)"
        );

        $week = self::json($this->as_($admin, 'GET', '/api/admin/monitoring?days=7'));
        $month = self::json($this->as_($admin, 'GET', '/api/admin/monitoring?days=30'));
        self::assertSame(4, $week['tokens']['periode']['demo']['requetes']);
        self::assertSame(10, $month['tokens']['periode']['demo']['requetes']);
        self::assertSame(10, $week['tokens']['toutTemps']['demo']['requetes']);

        self::assertSame(30, self::json($this->as_($admin, 'GET', '/api/admin/monitoring'))['periode']['jours'], 'défaut 30');
        // (int) de PHP : préfixe numérique conservé (« 7abc » → 7), sans préfixe → 0 → 1.
        foreach (['0' => 1, 'abc' => 1, '' => 1, '-3' => 1, '1000' => 365, '90' => 90, '7abc' => 7] as $days => $expected) {
            $response = $this->as_($admin, 'GET', '/api/admin/monitoring?days=' . $days);
            self::assertSame(200, $response->getStatusCode());
            self::assertSame($expected, self::json($response)['periode']['jours'], (string) $days);
        }
    }

    #[TestDox('UC-ADM-06-F04 — A2 : comptes portant un rôle donné (bloc « Comptes par rôle ») via GET /api/admin/users?role=')]
    public function testF04AccountsByRole(): void
    {
        $admin = $this->registerAdmin('root@example.org');
        $this->registerAs('alice@example.org', 'Alice', ['epistemiarque', 'apprenant']);
        $this->registerAs('ada@example.org', 'Ada', ['apprenant']);

        $epi = self::json($this->as_($admin, 'GET', '/api/admin/users?role=epistemiarque'));
        self::assertSame(1, $epi['total']);
        self::assertSame(['apprenant', 'epistemiarque'], $epi['users'][0]['roles']);
        self::assertSame(2, self::json($this->as_($admin, 'GET', '/api/admin/users?role=apprenant'))['total']);
        self::assertSame(1, self::json($this->as_($admin, 'GET', '/api/admin/users?role=admin'))['total']);
    }

    #[TestDox('UC-ADM-06-F05 — A3 : votes en cours — décompte à la majorité de l’électorat courant (vote d’un ancien membre ignoré) et retardataires à relancer')]
    public function testF05PendingVotesAndLateVoters(): void
    {
        $admin = $this->registerAdmin('root@example.org');
        $alice = $this->registerAs('alice@example.org', 'Alice', ['epistemiarque']);
        $this->registerAs('bob@example.org', 'Bob', ['epistemiarque']);
        $this->registerAs('carol@example.org', 'Carol', ['epistemiarque']);
        $dave = $this->registerAs('dave@example.org', 'Dave', ['epistemiarque']);
        self::$pdo->exec(
            "INSERT INTO competence_versions (competence_code, semver, pole, nom, status, content, content_hash, submitted_at)
             VALUES ('R1', '7.1.1', 1, 'Respiration consciente', 'review', '{}', REPEAT('a', 64), NOW())"
        );
        $versionId = (int) self::$pdo->lastInsertId();
        self::$pdo->exec("INSERT INTO competence_votes (competence_version_id, user_id, vote) VALUES ({$versionId}, {$alice['id']}, 'pour'), ({$versionId}, {$dave['id']}, 'pour')");
        // Dave vote puis perd le rôle : il sort de l'électorat, son vote ne compte plus.
        self::setRoles($dave['id'], ['apprenant']);

        $votes = self::json($this->as_($admin, 'GET', '/api/admin/monitoring'))['votes'];

        self::assertCount(3, $votes['electorat']);
        self::assertNotContains('dave@example.org', array_column($votes['electorat'], 'email'));
        $prop = $votes['competences'][0];
        self::assertEquals(['pour' => 1, 'threshold' => 2, 'outcome' => 'pending', 'notVoted' => 2], array_intersect_key(
            $prop['decompte'],
            array_flip(['pour', 'threshold', 'outcome', 'notVoted']),
        ));
        self::assertSame(['bob@example.org', 'carol@example.org'], array_column($prop['manquants'], 'email'), 'l’ancien membre n’est pas un retardataire');
    }

    #[TestDox('UC-ADM-06-F06 — A4 : base GeoIP présente (simulée) → répartition des connexions par pays')]
    public function testF06CountryBreakdownWhenGeoIpIsAvailable(): void
    {
        CountryResolver::setOverride(static fn (string $ip): ?string => $ip === '198.51.100.7' ? 'BE' : 'FR');
        $admin = $this->registerAdmin('root@example.org'); // 203.0.113.10 -> FR
        $this->clientIp = '198.51.100.7';
        $this->cookieSid = null;
        self::assertSame(200, $this->login('root@example.org', self::PASSWORD)->getStatusCode());
        $this->cookieSid = null;
        self::assertSame(200, $this->login('root@example.org', self::PASSWORD)->getStatusCode());

        $body = self::json($this->as_($admin, 'GET', '/api/admin/monitoring?days=1'));

        self::assertSame([['pays' => 'BE', 'n' => 2], ['pays' => 'FR', 'n' => 1]], $body['connexions']['parPays']);
        self::assertSame('BE', $body['connexions']['dernieres'][0]['pays']);
        self::assertSame('198.51.100.0/24', $body['connexions']['dernieres'][0]['reseau']);
    }

    #[TestDox('UC-ADM-06-F07 — E1/E2 : visiteur → 401, compte non admin (même épistémiarque) → 403')]
    public function testF07GuardRefusesVisitorsAndNonAdmins(): void
    {
        $alice = $this->registerAs('alice@example.org', 'Alice', ['epistemiarque', 'etablissement', 'promptologue']);

        self::assertSame(403, $this->as_($alice, 'GET', '/api/admin/monitoring')->getStatusCode());
        self::assertSame(403, $this->as_($alice, 'GET', '/api/admin/users?role=epistemiarque')->getStatusCode());
        $this->cookieSid = null;
        $anonymous = $this->request('GET', '/api/admin/monitoring?days=7');
        self::assertSame(401, $anonymous->getStatusCode());
        self::assertSame(['error' => 'Authentification requise'], self::json($anonymous));
    }

    /**
     * RG5 tel qu'implémenté : seul l'échec d'identification de /auth/login
     * (mot de passe faux ou e-mail inconnu) journalise login_failed. Une
     * tentative refusée par le limiteur (429), un bon mot de passe sur un
     * compte non activé (403) et un code d'activation faux (401) ne laissent
     * aucune trace au monitoring.
     */
    #[TestDox('UC-ADM-06-F15 — RG5 : seuls les échecs d’identification sont journalisés ; tentatives bloquées (429), compte non activé (403) et code d’activation faux absents du monitoring')]
    public function testF15OnlyCredentialFailuresAreJournaled(): void
    {
        $admin = $this->registerAdmin('root@example.org');
        self::assertSame(201, $this->registerPending('pending@example.org', self::PASSWORD, 'Pending')->getStatusCode());
        $this->clientIp = '198.51.100.40';

        $statuses = [];
        for ($i = 0; $i < 6; $i++) {
            $this->cookieSid = null;
            $statuses[] = $this->login('root@example.org', 'mauvais mot de passe')->getStatusCode();
        }
        self::assertSame([401, 401, 401, 401, 401, 429], $statuses, '5 essais par IP et e-mail, puis limiteur');

        $this->cookieSid = null;
        self::assertSame(403, $this->login('pending@example.org', self::PASSWORD)->getStatusCode(), 'compte non activé');
        $this->cookieSid = null;
        self::assertSame(401, $this->activate('pending@example.org', '0000' === $this->lastCode() ? '1111' : '0000')->getStatusCode(), 'code d’activation faux');

        $cx = self::json($this->as_($admin, 'GET', '/api/admin/monitoring?days=1'))['connexions'];

        self::assertSame(['reussies' => 1, 'echouees' => 5], $cx['periode'], 'activation de l’admin = 1 réussite ; 5 échecs sur 8 refus');
        self::assertSame(5, \count(array_filter($cx['dernieres'], static fn (array $d): bool => !$d['reussie'])));
    }
}
