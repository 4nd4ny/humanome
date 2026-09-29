<?php

declare(strict_types=1);

namespace Humanome\Tests\UseCases\Unit;

use Humanome\Admin\Monitoring;
use Humanome\Auth\LoginJournal;
use Humanome\Geo\CountryResolver;
use Humanome\Geo\IpAnonymizer;
use Humanome\MigrationRunner;
use Humanome\Tests\TestDb;
use Humanome\Tests\UseCases\Support\AdmSupport;
use PDO;
use PHPUnit\Framework\Attributes\TestDox;
use PHPUnit\Framework\TestCase;

/**
 * UC-ADM-06 — Consulter le monitoring : tests UNITAIRES.
 *
 * Fiche : docs/cas-utilisation/administration/UC-ADM-06-monitoring.md
 *
 * Monitoring::overview est appelé directement sur une base peuplée à la main
 * (SQL), bloc par bloc : bornes de la fenêtre, utilisateurs, cartographies et
 * partages, finances, tokens, connexions, votes. Le journal des connexions
 * (LoginJournal) et ses deux briques RGPD (CountryResolver, IpAnonymizer)
 * sont testés isolément ; la base GeoIP (MMDB) est ABSENTE ici — c'est le
 * chemin « fichier absent → pays null » prévu par le code.
 */
final class UcAdm06MonitoringTest extends TestCase
{
    private static PDO $pdo;

    public static function setUpBeforeClass(): void
    {
        self::$pdo = TestDb::fresh();
        (new MigrationRunner(self::$pdo, MigrationRunner::defaultMigrationsDir()))->run();
    }

    public static function tearDownAfterClass(): void
    {
        TestDb::restoreEnv();
        CountryResolver::setOverride(null);
    }

    protected function setUp(): void
    {
        TestDb::overrideEnv();
        CountryResolver::setOverride(null);
        foreach ([
            'competence_votes', 'competence_versions', 'referentiel_votes', 'referentiel_versions',
            'sessions', 'users', 'audit_events', 'llm_usage_daily', 'tuteur_usage_daily',
        ] as $table) {
            self::$pdo->exec("DELETE FROM {$table}");
        }
    }

    protected function tearDown(): void
    {
        CountryResolver::setOverride(null);
        TestDb::restoreEnv();
    }

    private static function overview(int $days = 30): array
    {
        return (new Monitoring(self::$pdo))->overview($days);
    }

    /** Cartographie minimale, avec ou sans document ; renvoie son id. */
    private static function carto(int $userId, string $type = 'jour', ?string $createdAgo = null, bool $withDocument = true): int
    {
        self::$pdo->prepare(
            'INSERT INTO cartographies (user_id, type, titre, visibility, document, created_at)
             VALUES (?, ?, ?, ?, ?, ' . ($createdAgo === null ? 'NOW()' : 'NOW() - INTERVAL ' . $createdAgo) . ')'
        )->execute([$userId, $type, 'T', 'privee', $withDocument ? json_encode(['kind' => 'cartographie-' . $type]) : null]);

        return (int) self::$pdo->lastInsertId();
    }

    #[TestDox('UC-ADM-06-U01 — overview : fenêtre bornée à 1..365 jours, sept blocs dans un ordre fixe')]
    public function testU01WindowIsClampedAndBlocksAreFixed(): void
    {
        self::assertSame(['jours' => 1], self::overview(0)['periode']);
        self::assertSame(['jours' => 1], self::overview(-12)['periode']);
        self::assertSame(['jours' => 365], self::overview(1000)['periode']);
        self::assertSame(['jours' => 90], self::overview(90)['periode']);
        self::assertSame(
            ['periode', 'utilisateurs', 'cartographies', 'finances', 'tokens', 'connexions', 'votes'],
            array_keys(self::overview()),
        );
    }

    #[TestDox('UC-ADM-06-U02 — utilisateurs : total hors supprimés, non activés, connectés < 15 min, sessions anonymes, par rôle')]
    public function testU02Users(): void
    {
        $ada = AdmSupport::user(self::$pdo, 'ada@example.org', 'Ada', ['apprenant']);
        $bob = AdmSupport::user(self::$pdo, 'bob@example.org', 'Bob', ['apprenant', 'cartographe']);
        $gone = AdmSupport::user(self::$pdo, 'gone@example.org', 'Parti', ['apprenant']);
        self::$pdo->exec("UPDATE users SET deleted_at = NOW() WHERE id = {$gone}");
        self::$pdo->exec("UPDATE users SET email_verified_at = NULL WHERE id = {$bob}");

        $now = time();
        $insert = self::$pdo->prepare('INSERT INTO sessions (id, user_id, data, last_activity) VALUES (?, ?, ?, ?)');
        $insert->execute(['s1', $ada, '', $now - 60]);
        $insert->execute(['s2', $ada, '', $now - 120]); // même compte, deux onglets
        $insert->execute(['s3', $bob, '', $now - Monitoring::ACTIVE_WINDOW_SECONDS - 60]); // trop ancienne
        $insert->execute(['s4', null, '', $now - 30]);
        $insert->execute(['s5', null, '', $now - 10]);

        $u = self::overview()['utilisateurs'];

        self::assertSame(2, $u['total']);
        self::assertSame(1, $u['nonActives']);
        self::assertSame(1, $u['actifsMaintenant'], 'comptes DISTINCTS actifs dans les 15 dernières minutes');
        self::assertSame(2, $u['sessionsAnonymes']);
        self::assertSame(2, $u['nouveauxPeriode']);
        self::assertSame([['role' => 'apprenant', 'n' => 2], ['role' => 'cartographe', 'n' => 1]], $u['parRole']);
        self::assertSame([['date' => gmdate('Y-m-d'), 'n' => 2]], $u['parJour']);
    }

    #[TestDox('UC-ADM-06-U03 — fenêtre de N jours = depuis minuit il y a N-1 jours (aujourd’hui inclus)')]
    public function testU03WindowBoundary(): void
    {
        $id = AdmSupport::user(self::$pdo, 'hier@example.org', 'Hier');
        self::$pdo->exec("UPDATE users SET created_at = NOW() - INTERVAL 1 DAY WHERE id = {$id}");

        self::assertSame(0, self::overview(1)['utilisateurs']['nouveauxPeriode'], 'days=1 : aujourd’hui seulement');
        self::assertSame(1, self::overview(2)['utilisateurs']['nouveauxPeriode'], 'days=2 : hier inclus');
        self::assertSame(1, self::overview(1)['utilisateurs']['total'], 'le total ignore la fenêtre');
    }

    #[TestDox('UC-ADM-06-U04 — cartographies : par type, stockées, nouvelles ; partages actifs et consultations période / total')]
    public function testU04CartographiesAndShares(): void
    {
        $ada = AdmSupport::user(self::$pdo, 'ada@example.org', 'Ada', ['apprenant']);
        $jour = self::carto($ada, 'jour');
        self::carto($ada, 'merge', '40 DAY');
        self::carto($ada, 'jour', null, false);

        $share = self::$pdo->prepare(
            'INSERT INTO share_links (cartographie_id, token_hash, password_hash, expires_at, revoked_at) VALUES (?, ?, ?, ?, ?)'
        );
        $share->execute([$jour, hash('sha256', 'a'), 'h', null, null]); // actif
        $share->execute([$jour, hash('sha256', 'b'), 'h', gmdate('Y-m-d H:i:s', time() + 86400), null]); // actif
        $share->execute([$jour, hash('sha256', 'c'), 'h', gmdate('Y-m-d H:i:s', time() - 86400), null]); // expiré
        $share->execute([$jour, hash('sha256', 'd'), 'h', null, gmdate('Y-m-d H:i:s')]); // révoqué

        self::$pdo->exec(
            "INSERT INTO audit_events (user_id, type, details, created_at) VALUES
             (NULL, 'share_consulted', '{}', NOW()),
             (NULL, 'share_consulted', '{}', NOW()),
             (NULL, 'share_consulted', '{}', NOW() - INTERVAL 60 DAY),
             ({$ada}, 'share_created', '{}', NOW())"
        );

        $c = self::overview(30)['cartographies'];

        self::assertSame(3, $c['total']);
        self::assertSame(['jour' => 2, 'merge' => 1], $c['parType']);
        self::assertSame(2, $c['avecDocument']);
        self::assertSame(2, $c['nouvellesPeriode'], 'la fusion de J-40 est hors fenêtre');
        self::assertSame(2, $c['partages']['actifs']);
        self::assertSame(1, $c['partages']['creesPeriode']);
        self::assertSame(2, $c['partages']['consultationsPeriode']);
        self::assertSame(3, $c['partages']['consultationsTotal']);
        self::assertSame([['date' => gmdate('Y-m-d'), 'n' => 2]], $c['partages']['consultationsParJour']);
    }

    #[TestDox('UC-ADM-06-U05 — finances : soldes, mouvements signés par nature (période / tout temps), série quotidienne, PayPal')]
    public function testU05Finances(): void
    {
        $ada = AdmSupport::user(self::$pdo, 'ada@example.org', 'Ada', ['apprenant']);
        $bob = AdmSupport::user(self::$pdo, 'bob@example.org', 'Bob', ['apprenant']);
        self::$pdo->exec("INSERT INTO twin9_credits (user_id, balance_microusd) VALUES ({$ada}, 7000000), ({$bob}, 0)");
        self::$pdo->exec(
            "INSERT INTO twin9_credit_events (user_id, kind, amount_microusd, label, created_at) VALUES
             ({$ada}, 'topup', 10000000, 'ORD-1', NOW()),
             ({$ada}, 'debit', -2000000, 'lourd/20-greffier', NOW()),
             ({$ada}, 'refund', -1000000, 'remboursement', NOW()),
             ({$ada}, 'adjust', 500000, 'ajustement admin', NOW() - INTERVAL 50 DAY)"
        );
        self::$pdo->exec(
            "INSERT INTO twin9_paypal_captures (capture_id, user_id, paypal_order_id, montant_microusd, rembourse_microusd, created_at) VALUES
             ('CAP-1', {$ada}, 'ORD-1', 10000000, 1000000, NOW()),
             ('CAP-0', {$ada}, 'ORD-0', 5000000, 0, NOW() - INTERVAL 50 DAY)"
        );

        $f = self::overview(30)['finances'];

        self::assertSame(['totalMicrousd' => 7000000, 'comptesCredites' => 1], $f['soldes']);
        self::assertSame(['n' => 1, 'microusd' => 10000000], $f['periode']['topup']);
        self::assertSame(['n' => 1, 'microusd' => -2000000], $f['periode']['debit']);
        self::assertSame(['n' => 1, 'microusd' => -1000000], $f['periode']['refund']);
        self::assertArrayNotHasKey('adjust', $f['periode']);
        self::assertSame(['n' => 1, 'microusd' => 500000], $f['toutTemps']['adjust']);
        self::assertSame(
            [['date' => gmdate('Y-m-d'), 'topup' => 10000000, 'debit' => -2000000, 'refund' => -1000000, 'adjust' => 0]],
            $f['parJour'],
        );
        self::assertSame(['captures' => 1, 'brutMicrousd' => 10000000, 'rembourseMicrousd' => 1000000], $f['paypal']['periode']);
        self::assertSame(['captures' => 2, 'brutMicrousd' => 15000000, 'rembourseMicrousd' => 1000000], $f['paypal']['toutTemps']);
    }

    #[TestDox('UC-ADM-06-U06 — tokens : démo + tuteur + Twin9 fusionnés par jour (null si source muette), totaux, Twin9 par modèle')]
    public function testU06Tokens(): void
    {
        $ada = AdmSupport::user(self::$pdo, 'ada@example.org', 'Ada', ['apprenant']);
        self::$pdo->exec(
            "INSERT INTO llm_usage_daily (usage_date, requests, input_tokens, output_tokens, estimated_cost_usd) VALUES
             (CURDATE(), 12, 30000, 8000, 0.42), (CURDATE() - INTERVAL 1 DAY, 2, 1000, 500, 0.01),
             (CURDATE() - INTERVAL 100 DAY, 5, 10000, 2000, 0.10)"
        );
        self::$pdo->exec(
            "INSERT INTO tuteur_usage_daily (usage_date, requests, input_tokens, output_tokens, estimated_cost_usd)
             VALUES (CURDATE(), 3, 900, 300, 0.002)"
        );
        self::$pdo->exec(
            "INSERT INTO twin9_credit_events (user_id, kind, amount_microusd, label, model, tokens_in, tokens_out, created_at) VALUES
             ({$ada}, 'debit', -2500000, 'lourd', 'claude-sonnet-5', 400000, 200000, NOW()),
             ({$ada}, 'debit', -100000, 'leger', NULL, 1000, 500, NOW()),
             ({$ada}, 'topup', 9000000, 'ORD-9', NULL, NULL, NULL, NOW())"
        );

        $t = self::overview(7)['tokens'];

        $today = gmdate('Y-m-d');
        $yesterday = gmdate('Y-m-d', time() - 86400);
        self::assertSame([$yesterday, $today], array_column($t['parJour'], 'date'), 'dates triées, J-100 hors fenêtre');
        self::assertSame(['requetes' => 2, 'entree' => 1000, 'sortie' => 500, 'coutUsd' => 0.01], $t['parJour'][0]['demo']);
        self::assertNull($t['parJour'][0]['tuteur']);
        self::assertNull($t['parJour'][0]['twin9']);
        self::assertSame(['appels' => 2, 'entree' => 401000, 'sortie' => 200500, 'depenseMicrousd' => 2600000], $t['parJour'][1]['twin9']);
        self::assertSame(3, $t['parJour'][1]['tuteur']['requetes']);

        self::assertSame(14, $t['periode']['demo']['requetes']);
        self::assertSame(19, $t['toutTemps']['demo']['requetes']);
        self::assertSame(2, $t['periode']['twin9']['appels'], 'seuls les débits comptent');
        self::assertSame(['claude-sonnet-5', '?'], array_column($t['twin9ParModele'], 'modele'), 'tri par dépense, modèle inconnu = « ? »');
    }

    #[TestDox('UC-ADM-06-U07 — connexions : réussies / échouées, pays (null si inconnu), 50 dernières avec compte et réseau tronqué')]
    public function testU07Connections(): void
    {
        $ada = AdmSupport::user(self::$pdo, 'ada@example.org', 'Ada', ['apprenant']);
        CountryResolver::setOverride(static fn (string $ip): ?string => str_starts_with($ip, '203.0.113.') ? 'FR' : null);

        LoginJournal::success(self::$pdo, $ada, '203.0.113.10');
        LoginJournal::success(self::$pdo, $ada, '198.51.100.7');
        LoginJournal::failure(self::$pdo, $ada, '203.0.113.99');
        LoginJournal::failure(self::$pdo, null, '2001:db8:abcd:12::1');

        $cx = self::overview(7)['connexions'];

        self::assertSame(['reussies' => 2, 'echouees' => 2], $cx['periode']);
        self::assertSame([['date' => gmdate('Y-m-d'), 'reussies' => 2, 'echouees' => 2]], $cx['parJour']);
        $parPays = array_column($cx['parPays'], 'n', 'pays');
        // assertEquals : FR et null sont ex aequo (n = 1), l'ORDER BY n DESC ne
        // fixe pas leur ordre relatif.
        self::assertEquals(['FR' => 1, '' => 1], $parPays, 'réussies seulement ; pays inconnu = null');
        self::assertContains(null, array_column($cx['parPays'], 'pays'));

        $latest = $cx['dernieres'][0];
        self::assertFalse($latest['reussie']);
        self::assertNull($latest['userId'], 'e-mail inconnu : échec anonyme');
        self::assertNull($latest['email']);
        self::assertSame('2001:db8:abcd::/48', $latest['reseau']);
        self::assertSame('ada@example.org', $cx['dernieres'][1]['email']);
        self::assertSame('203.0.113.0/24', $cx['dernieres'][1]['reseau']);
        self::assertStringNotContainsString('203.0.113.99', json_encode($cx));

        for ($i = 0; $i < 55; $i++) {
            LoginJournal::success(self::$pdo, $ada, '203.0.113.10');
        }
        self::assertCount(Monitoring::RECENT_LOGINS, self::overview(7)['connexions']['dernieres']);
    }

    #[TestDox('UC-ADM-06-U08 — votes : propositions « review » des deux grains, électorat courant seulement, retardataires à relancer')]
    public function testU08Votes(): void
    {
        $alice = AdmSupport::user(self::$pdo, 'alice@example.org', 'Alice', ['epistemiarque']);
        $bob = AdmSupport::user(self::$pdo, 'bob@example.org', 'Bob', ['epistemiarque']);
        $ex = AdmSupport::user(self::$pdo, 'ex@example.org', 'Ancien', ['apprenant']); // a perdu le rôle

        self::$pdo->exec(
            "INSERT INTO competence_versions (competence_code, semver, pole, nom, status, content, content_hash, submitted_at)
             VALUES ('R1', '7.1.1', 1, 'Respiration consciente', 'review', '{}', REPEAT('a', 64), NOW()),
                    ('E2', '7.1.1', 2, 'Écoute active', 'draft', '{}', REPEAT('b', 64), NULL)"
        );
        $r1 = (int) self::$pdo->query("SELECT id FROM competence_versions WHERE competence_code = 'R1'")->fetchColumn();
        self::$pdo->exec("INSERT INTO competence_votes (competence_version_id, user_id, vote) VALUES ({$r1}, {$alice}, 'contre'), ({$r1}, {$ex}, 'pour')");
        self::$pdo->exec(
            "INSERT INTO referentiel_versions (referentiel_id, semver, label, status, content, content_hash)
             VALUES ('respire', '8.0.0', 'RESPIRE v8', 'review', '{}', REPEAT('c', 64))"
        );

        $v = self::overview()['votes'];

        self::assertSame([$alice, $bob], array_column($v['electorat'], 'id'));
        self::assertCount(1, $v['competences'], 'seule la version en « review »');
        $prop = $v['competences'][0];
        self::assertSame('R1 — Respiration consciente', $prop['label']);
        self::assertSame(0, $prop['decompte']['pour'], 'le vote d’un non-membre ne compte pas');
        self::assertSame(1, $prop['decompte']['contre']);
        self::assertSame(1, $prop['decompte']['notVoted']);
        self::assertSame('pending', $prop['decompte']['outcome']);
        self::assertSame(['bob@example.org'], array_column($prop['manquants'], 'email'));
        self::assertMatchesRegularExpression('/^\d{4}-\d{2}-\d{2}T/', (string) $prop['soumiseLe']);

        self::assertCount(1, $v['referentiel']);
        self::assertSame('respire — RESPIRE v8', $v['referentiel'][0]['label']);
        self::assertNull($v['referentiel'][0]['soumiseLe']);
        self::assertCount(2, $v['referentiel'][0]['manquants']);
    }

    #[TestDox('UC-ADM-06-U09 — LoginJournal : pays + réseau tronqué seulement, jamais l’IP ; purge au-delà de 365 jours')]
    public function testU09LoginJournal(): void
    {
        $ada = AdmSupport::user(self::$pdo, 'ada@example.org', 'Ada');
        CountryResolver::setOverride(static fn (string $ip): ?string => 'BE');

        LoginJournal::success(self::$pdo, $ada, '192.0.2.77');
        $audit = AdmSupport::lastAudit(self::$pdo, LoginJournal::LOGIN);
        self::assertSame($ada, $audit['userId']);
        self::assertEquals(['pays' => 'BE', 'reseau' => '192.0.2.0/24'], $audit['details'], 'colonne JSON : ordre des clés non garanti');
        self::assertStringNotContainsString('192.0.2.77', $audit['raw']);

        LoginJournal::failure(self::$pdo, null, 'pas-une-ip');
        self::assertEquals(['pays' => 'BE', 'reseau' => null], AdmSupport::lastAudit(self::$pdo, LoginJournal::LOGIN_FAILED)['details']);

        self::$pdo->exec(
            "INSERT INTO audit_events (user_id, type, details, created_at) VALUES
             (NULL, 'login', '{}', NOW() - INTERVAL 366 DAY),
             (NULL, 'login', '{}', NOW() - INTERVAL 364 DAY),
             (NULL, 'login_failed', '{}', NOW() - INTERVAL 400 DAY),
             (NULL, 'share_consulted', '{}', NOW() - INTERVAL 400 DAY)"
        );
        LoginJournal::prune(self::$pdo);
        self::assertSame(2, (int) self::$pdo->query("SELECT COUNT(*) FROM audit_events WHERE type = 'login'")->fetchColumn(), 'l’événement du jour et celui de J-364 survivent');
        self::assertSame(1, (int) self::$pdo->query("SELECT COUNT(*) FROM audit_events WHERE type = 'login' AND created_at < NOW() - INTERVAL 300 DAY")->fetchColumn(), 'seuil à 365 jours, pas en deçà');
        self::assertSame(1, (int) self::$pdo->query("SELECT COUNT(*) FROM audit_events WHERE type = 'login_failed'")->fetchColumn());
        self::assertSame(1, AdmSupport::countAudit(self::$pdo, 'share_consulted'), 'les autres traces ne sont pas purgées');
    }

    #[TestDox('UC-ADM-06-U10 — CountryResolver : base MMDB absente (chemin vide, inexistant, relatif) → pays null ; couture de test')]
    public function testU10CountryResolverDegradesToNull(): void
    {
        foreach (['', '/nulle/part/dbip-country-lite.mmdb', 'geo/absent.mmdb'] as $path) {
            TestDb::setEnv('GEOIP_DB', $path);
            CountryResolver::setOverride(null); // réarme le verrou « indisponible »
            self::assertNull(CountryResolver::resolve('203.0.113.10'), var_export($path, true));
            self::assertNull(CountryResolver::resolve('2001:db8::1'));
        }

        CountryResolver::setOverride(static fn (string $ip): ?string => $ip === '203.0.113.10' ? 'FR' : null);
        self::assertSame('FR', CountryResolver::resolve('203.0.113.10'));
        self::assertNull(CountryResolver::resolve('198.51.100.1'));
    }

    #[TestDox('UC-ADM-06-U11 — IpAnonymizer : IPv4 → /24, IPv6 → /48, IPv4 mappée → /24 de l’IPv4, invalide → null')]
    public function testU11IpAnonymizer(): void
    {
        self::assertSame('192.0.2.0/24', IpAnonymizer::network('192.0.2.255'));
        self::assertSame('0.0.0.0/24', IpAnonymizer::network('0.0.0.1'));
        self::assertSame('::/48', IpAnonymizer::network('::1'));
        self::assertSame('2001:db8:1::/48', IpAnonymizer::network('2001:db8:1:ffff::abcd'));
        self::assertSame('198.51.100.0/24', IpAnonymizer::network('::ffff:198.51.100.200'));
        self::assertNull(IpAnonymizer::network('999.1.1.1'));
        self::assertNull(IpAnonymizer::network('203.0.113.0/24'));
    }

    /**
     * COMPORTEMENT ACTUEL figé (fiche, « Anomalies constatées », AN-2) : depuis
     * la migration 021, cartographies.type accepte « twin9 », mais overview()
     * calcule total = jour + merge. Une cartographie Twin9 stockée compte dans
     * parType, avecDocument et nouvellesPeriode, pas dans total. À inverser
     * (total = 2) une fois le total calculé sur tous les types.
     */
    #[TestDox('UC-ADM-06-U19 — (anomalie AN-2, comportement actuel) cartographie « twin9 » : comptée par type et sur la période, mais exclue du total')]
    public function testU19Twin9CartographiesAreLeftOutOfTheTotalCurrentBehaviour(): void
    {
        $ada = AdmSupport::user(self::$pdo, 'ada@example.org', 'Ada', ['apprenant']);
        self::carto($ada, 'twin9');
        self::carto($ada, 'jour');

        $c = self::overview(30)['cartographies'];

        self::assertSame(['jour' => 1, 'merge' => 0, 'twin9' => 1], $c['parType']);
        self::assertSame(2, $c['avecDocument']);
        self::assertSame(2, $c['nouvellesPeriode']);
        self::assertSame(1, $c['total'], 'twin9 exclu du total : nouvellesPeriode > total');
    }
}
