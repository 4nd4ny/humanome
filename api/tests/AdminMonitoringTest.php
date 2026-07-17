<?php

declare(strict_types=1);

namespace Humanome\Tests;

use Humanome\Auth\LoginJournal;
use Humanome\Db;
use Humanome\Geo\CountryResolver;

/**
 * Section admin « Monitoring » : GET /api/admin/monitoring (agrégats lecture
 * seule), journal des connexions (pays + réseau tronqué, jamais d'IP brute),
 * filtre par rôle de GET /admin/users. La simulation navigateur (session +
 * CSRF) vient d'AdminTestCase.
 */
final class AdminMonitoringTest extends AdminTestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        // Résolution pays déterministe (pas de base MMDB dans la CI).
        CountryResolver::setOverride(static fn (string $ip): ?string => 'FR');
    }

    protected function tearDown(): void
    {
        CountryResolver::setOverride(null);
        parent::tearDown();
    }

    // ------------------------------------------------------------------
    // Accès
    // ------------------------------------------------------------------

    public function testMonitoringRequiresTheAdminRole(): void
    {
        $user = $this->registerAs('membre@example.org', 'Membre', ['apprenant']);
        $denied = $this->as_($user, 'GET', '/api/admin/monitoring');
        self::assertSame(403, $denied->getStatusCode());

        $this->cookieSid = null; // navigateur anonyme
        self::assertSame(401, $this->request('GET', '/api/admin/monitoring')->getStatusCode());
    }

    // ------------------------------------------------------------------
    // Connexions (LoginJournal)
    // ------------------------------------------------------------------

    public function testLoginsAreJournaledWithCountryAndTruncatedNetworkOnly(): void
    {
        $admin = $this->registerAdmin(); // activation = première connexion journalisée

        // Une connexion classique réussie + un échec (mauvais mot de passe).
        $this->cookieSid = null;
        self::assertSame(200, $this->login('admin@example.org', self::PASSWORD)->getStatusCode());
        $this->cookieSid = null;
        self::assertSame(401, $this->login('admin@example.org', 'mauvais')->getStatusCode());

        $rows = Db::get()->query(
            "SELECT type, user_id, details FROM audit_events
              WHERE type IN ('login', 'login_failed') ORDER BY id"
        )->fetchAll();
        self::assertCount(3, $rows); // activation + login + échec
        self::assertSame([LoginJournal::LOGIN, LoginJournal::LOGIN, LoginJournal::LOGIN_FAILED],
            array_column($rows, 'type'));

        foreach ($rows as $row) {
            $details = json_decode((string) $row['details'], true);
            self::assertSame('FR', $details['pays']);
            // AuthTestBase émet depuis 203.0.113.10 : seul le /24 est stocké.
            self::assertSame('203.0.113.0/24', $details['reseau']);
            self::assertStringNotContainsString('203.0.113.10', (string) $row['details']);
        }

        // L'échec reste rattaché au compte visé (détection d'attaque ciblée).
        self::assertSame($admin['id'], (int) $rows[2]['user_id']);

        $body = self::json($this->as_($admin, 'GET', '/api/admin/monitoring?days=7'));
        self::assertSame(2, $body['connexions']['periode']['reussies']);
        self::assertSame(1, $body['connexions']['periode']['echouees']);
        self::assertSame('FR', $body['connexions']['parPays'][0]['pays']);
        self::assertSame(2, $body['connexions']['parPays'][0]['n']);

        $derniere = $body['connexions']['dernieres'][0];
        self::assertFalse($derniere['reussie']);
        self::assertSame('admin@example.org', $derniere['email']);
        self::assertSame('203.0.113.0/24', $derniere['reseau']);
    }

    public function testFailedLoginOnUnknownAccountIsJournaledAnonymously(): void
    {
        $this->registerAdmin();
        $this->cookieSid = null;
        self::assertSame(401, $this->login('inconnu@example.org', 'peu-importe')->getStatusCode());

        $row = Db::get()->query(
            "SELECT user_id FROM audit_events WHERE type = 'login_failed' ORDER BY id DESC LIMIT 1"
        )->fetch();
        self::assertNotFalse($row);
        self::assertNull($row['user_id']);
    }

    public function testPruneDropsLoginEventsPastRetention(): void
    {
        $admin = $this->registerAdmin();
        $pdo = Db::get();
        $pdo->prepare(
            "INSERT INTO audit_events (user_id, type, created_at, details)
             VALUES (?, 'login', DATE_SUB(NOW(), INTERVAL 400 DAY), '{}'),
                    (?, 'login', DATE_SUB(NOW(), INTERVAL 10 DAY), '{}')"
        )->execute([$admin['id'], $admin['id']]);

        LoginJournal::prune($pdo);

        $left = (int) $pdo->query(
            "SELECT COUNT(*) FROM audit_events
              WHERE type = 'login' AND created_at < DATE_SUB(NOW(), INTERVAL 366 DAY)"
        )->fetchColumn();
        self::assertSame(0, $left);
        // Les événements récents et les autres types d'audit survivent.
        $recent = (int) $pdo->query("SELECT COUNT(*) FROM audit_events WHERE type = 'login'")->fetchColumn();
        self::assertGreaterThanOrEqual(2, $recent); // activation + ligne à J-10
    }

    // ------------------------------------------------------------------
    // Agrégats : utilisateurs, cartographies, finances, tokens
    // ------------------------------------------------------------------

    public function testOverviewAggregatesSeededActivity(): void
    {
        $admin = $this->registerAdmin();
        $apprenant = $this->registerAs('ada@example.org', 'Ada', ['apprenant']);
        $this->createCarto($apprenant, ['type' => 'merge', 'titre' => 'Ma carto']);

        $pdo = Db::get();
        // Finances : recharge 10 $, débit Twin9 (600k tokens), vieux débit hors fenêtre.
        $pdo->prepare(
            "INSERT INTO twin9_credit_events (user_id, kind, amount_microusd, label, model, tokens_in, tokens_out, created_at)
             VALUES (?, 'topup', 10000000, 'PayPal', NULL, NULL, NULL, NOW()),
                    (?, 'debit', -2500000, 'lourd/20-greffier', 'claude-sonnet-5', 400000, 200000, NOW()),
                    (?, 'debit', -1000000, 'lourd/20-greffier', 'claude-sonnet-5', 100000, 50000, DATE_SUB(NOW(), INTERVAL 40 DAY))"
        )->execute([$apprenant['id'], $apprenant['id'], $apprenant['id']]);
        $pdo->prepare(
            'INSERT INTO twin9_credits (user_id, balance_microusd) VALUES (?, 6500000)'
        )->execute([$apprenant['id']]);
        $pdo->prepare(
            "INSERT INTO twin9_paypal_captures (capture_id, user_id, paypal_order_id, montant_microusd)
             VALUES ('CAP-1', ?, 'ORD-1', 10000000)"
        )->execute([$apprenant['id']]);
        // Tokens démo : aujourd'hui + un jour hors fenêtre de 7 jours.
        $pdo->exec(
            "INSERT INTO llm_usage_daily (usage_date, requests, input_tokens, output_tokens, estimated_cost_usd)
             VALUES (CURDATE(), 12, 30000, 8000, 0.42),
                    (DATE_SUB(CURDATE(), INTERVAL 20 DAY), 5, 10000, 2000, 0.10)"
        );
        // Consultations de partage : deux traces d'audit.
        $pdo->exec(
            "INSERT INTO audit_events (user_id, type, details)
             VALUES (NULL, 'share_consulted', '{\"cartographieId\":1,\"shareLinkId\":1}'),
                    (NULL, 'share_consulted', '{\"cartographieId\":1,\"shareLinkId\":1}')"
        );

        $body = self::json($this->as_($admin, 'GET', '/api/admin/monitoring?days=7'));

        self::assertSame(2, $body['utilisateurs']['total']);
        self::assertSame(2, $body['utilisateurs']['nouveauxPeriode']);
        self::assertGreaterThanOrEqual(1, $body['utilisateurs']['actifsMaintenant']);
        $parRole = array_column($body['utilisateurs']['parRole'], 'n', 'role');
        self::assertSame(1, $parRole['admin']);
        self::assertSame(1, $parRole['apprenant']);

        self::assertSame(1, $body['cartographies']['total']);
        self::assertSame(1, $body['cartographies']['parType']['merge']);
        self::assertSame(2, $body['cartographies']['partages']['consultationsPeriode']);
        self::assertSame(2, $body['cartographies']['partages']['consultationsTotal']);

        self::assertSame(6500000, $body['finances']['soldes']['totalMicrousd']);
        self::assertSame(1, $body['finances']['soldes']['comptesCredites']);
        self::assertSame(10000000, $body['finances']['periode']['topup']['microusd']);
        self::assertSame(-2500000, $body['finances']['periode']['debit']['microusd']);
        self::assertSame(-3500000, $body['finances']['toutTemps']['debit']['microusd']);
        self::assertSame(10000000, $body['finances']['paypal']['toutTemps']['brutMicrousd']);

        self::assertSame(12, $body['tokens']['periode']['demo']['requetes']);
        self::assertSame(17, $body['tokens']['toutTemps']['demo']['requetes']);
        self::assertSame(400000, $body['tokens']['periode']['twin9']['entree']);
        self::assertSame(500000, $body['tokens']['toutTemps']['twin9']['entree']);
        self::assertSame(2500000, $body['tokens']['periode']['twin9']['depenseMicrousd']);
        self::assertSame('claude-sonnet-5', $body['tokens']['twin9ParModele'][0]['modele']);

        // La série quotidienne mêle les trois sources par date.
        $today = array_values(array_filter(
            $body['tokens']['parJour'],
            static fn (array $j): bool => $j['demo'] !== null && $j['twin9'] !== null
        ));
        self::assertNotEmpty($today);
        self::assertSame(30000, $today[0]['demo']['entree']);
        self::assertSame(400000, $today[0]['twin9']['entree']);
    }

    // ------------------------------------------------------------------
    // Votes (gouvernance)
    // ------------------------------------------------------------------

    public function testVotesSummaryListsPendingProposalsAndLateVoters(): void
    {
        $admin = $this->registerAdmin();
        $alice = $this->registerAs('alice@example.org', 'Alice', ['epistemiarque']);
        $bob = $this->registerAs('bob@example.org', 'Bob', ['epistemiarque']);
        $carol = $this->registerAs('carol@example.org', 'Carol', ['epistemiarque']);

        $pdo = Db::get();
        $pdo->exec(
            "INSERT INTO competence_versions (competence_code, semver, pole, nom, status, content, content_hash)
             VALUES ('R1', '7.1.1', 1, 'Respiration consciente', 'review', '{}', REPEAT('a', 64)),
                    ('E2', '7.1.1', 2, 'Écoute active', 'draft', '{}', REPEAT('b', 64))"
        );
        $versionId = (int) $pdo->query(
            "SELECT id FROM competence_versions WHERE competence_code = 'R1'"
        )->fetchColumn();
        $pdo->prepare(
            "INSERT INTO competence_votes (competence_version_id, user_id, vote)
             VALUES (?, ?, 'pour'), (?, ?, 'pour')"
        )->execute([$versionId, $alice['id'], $versionId, $bob['id']]);

        $body = self::json($this->as_($admin, 'GET', '/api/admin/monitoring'));
        $votes = $body['votes'];

        self::assertCount(3, $votes['electorat']);
        self::assertCount(1, $votes['competences']); // seule la version 'review'
        $prop = $votes['competences'][0];
        self::assertSame('R1 — Respiration consciente', $prop['label']);
        self::assertSame(2, $prop['decompte']['pour']);
        self::assertSame(3, $prop['decompte']['electorateSize']);
        self::assertSame(2, $prop['decompte']['threshold']);
        self::assertSame('adopted', $prop['decompte']['outcome']);
        // Carol n'a pas voté : c'est elle qu'il faut relancer.
        self::assertCount(1, $prop['manquants']);
        self::assertSame('carol@example.org', $prop['manquants'][0]['email']);

        self::assertSame([], $votes['referentiel']);
    }

    // ------------------------------------------------------------------
    // Filtre par rôle de la liste des comptes
    // ------------------------------------------------------------------

    public function testUsersListCanBeFilteredByRole(): void
    {
        $admin = $this->registerAdmin();
        $this->registerAs('alice@example.org', 'Alice', ['epistemiarque']);
        $this->registerAs('ada@example.org', 'Ada', ['apprenant']);

        $body = self::json($this->as_($admin, 'GET', '/api/admin/users?role=epistemiarque'));
        self::assertSame(1, $body['total']);
        self::assertSame('alice@example.org', $body['users'][0]['email']);
        self::assertContains('epistemiarque', $body['users'][0]['roles']);

        // Rôle inconnu (hors menu) : liste vide, pas d'erreur.
        $none = self::json($this->as_($admin, 'GET', '/api/admin/users?role=inexistant'));
        self::assertSame(0, $none['total']);
    }
}
