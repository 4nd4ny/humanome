<?php

declare(strict_types=1);

namespace Humanome\Tests\UseCases\Functional;

use Humanome\Db;
use Humanome\Env;
use Humanome\Llm\DemoConfig;
use Humanome\Packages\SettingsRepository;
use Humanome\Tests\AdminTestCase;
use Humanome\Tests\TestDb;
use Humanome\Tests\UseCases\Support\AdmSupport;
use PHPUnit\Framework\Attributes\TestDox;
use Psr\Http\Message\ResponseInterface;

/**
 * UC-SYS-03 — Maintenance et supervision technique : tests FONCTIONNELS (API + CLI).
 *
 * Fiche : docs/cas-utilisation/systeme/UC-SYS-03-maintenance-supervision.md
 *
 * Acteurs techniques : une sonde de supervision (GET /api/health,
 * GET /api/status, sans session), le planificateur externe qui appelle
 * POST /api/admin/maintenance avec le jeton X-Migrate-Token (pas de cron sur
 * l'offre OVH), le mainteneur qui lance les scripts CLI (maintenance.php,
 * rgpd-audit.php). Les en-têtes de sécurité sont vérifiés sur des réponses
 * réelles de l'application, y compris les erreurs.
 */
final class UcSys03MaintenanceSupervisionTest extends AdminTestCase
{
    private const TOKEN = 'uc-sys03-migrate-token-0123456789abcdef';

    private const SECURITY_HEADERS = [
        'Content-Security-Policy' => "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
        'X-Content-Type-Options' => 'nosniff',
        'X-Frame-Options' => 'DENY',
        'Referrer-Policy' => 'no-referrer',
        'Strict-Transport-Security' => 'max-age=31536000',
    ];

    protected function setUp(): void
    {
        parent::setUp(); // comptes, audit, settings, paquets
        TestDb::setEnv('MIGRATE_TOKEN', self::TOKEN);
        foreach (['DEMO_ENABLED', 'DEMO_DAILY_GLOBAL_TOKENS', 'DEMO_DAILY_BUDGET_USD'] as $key) {
            TestDb::setEnv($key, '');
        }
        foreach (['share_links', 'llm_usage_daily', 'llm_pow_challenges', 'mass_jobs', 'mass_runs'] as $table) {
            self::$pdo->exec("DELETE FROM {$table}");
        }
    }

    private function probe(string $path): ResponseInterface
    {
        return AdmSupport::toolRequest('GET', $path, null);
    }

    /**
     * Exécute $run avec une base « injoignable » : connexion refusée localement
     * (127.0.0.1, port 1) — aucune résolution DNS, aucun appel réseau — et le
     * journal d'erreurs PHP détourné vers un fichier jetable.
     */
    private function withUnreachableDatabase(callable $run): mixed
    {
        $originalHost = Env::get('DB_HOST');
        $originalPort = Env::get('DB_PORT', '3306');
        $log = (string) tempnam(sys_get_temp_dir(), 'uc-sys03-');
        $previousLog = ini_set('error_log', $log);
        TestDb::setEnv('DB_HOST', '127.0.0.1');
        TestDb::setEnv('DB_PORT', '1');
        Db::reset();
        try {
            return $run();
        } finally {
            ini_set('error_log', $previousLog === false ? '' : $previousLog);
            @unlink($log);
            TestDb::setEnv('DB_HOST', $originalHost);
            TestDb::setEnv('DB_PORT', $originalPort);
            TestDb::overrideEnv();
        }
    }

    private function maintenance(?string $token = self::TOKEN): ResponseInterface
    {
        return AdmSupport::toolRequest('POST', '/admin/maintenance', $token);
    }

    /** Établissement + cohorte + run + jobs : file de masse observable par /status. */
    private function seedWorkerQueue(): void
    {
        $etab = AdmSupport::user(self::$pdo, 'etab-' . uniqid() . '@example.org', 'Lycée', ['etablissement']);
        $member = AdmSupport::user(self::$pdo, 'eleve-' . uniqid() . '@example.org', 'Élève', ['apprenant']);
        self::$pdo->exec("INSERT INTO cohortes (etablissement_id, nom, code_invitation) VALUES ({$etab}, 'Terminale', 'ABCDEFGH23')");
        $cohorte = (int) self::$pdo->lastInsertId();
        self::$pdo->exec(
            "INSERT INTO mass_runs (etablissement_id, cohorte_id, prompt_package_slug, prompt_package_semver, referentiel_id, referentiel_semver)
             VALUES ({$etab}, {$cohorte}, 'aurora-demo', '1.0.0', 'respire', '7.0.0')"
        );
        $run = (int) self::$pdo->lastInsertId();
        self::$pdo->exec(
            "INSERT INTO mass_jobs (run_id, user_id, day_date, status, updated_at) VALUES
             ({$run}, {$member}, '2026-01-05', 'queued', '2026-09-28 08:00:00'),
             ({$run}, {$member}, '2026-01-06', 'queued', '2026-09-28 08:05:00'),
             ({$run}, {$member}, '2026-01-07', 'done', '2026-09-28 09:30:00')"
        );
    }

    /**
     * Liens de partage autour de la grâce de 30 jours (mêmes cas que
     * UC-SYS-03-U01, pour que la route soit testée aussi finement que la
     * classe) + compteurs de démo et défis de preuve de travail.
     *
     * @return list<int> ids des liens qui doivent SURVIVRE à la maintenance
     */
    private function seedShareLinks(): array
    {
        $owner = $this->registerAs('maya-' . uniqid() . '@example.org', 'Maya', ['apprenant']);
        $cartoId = $this->createCarto($owner, ['visibility' => 'publique']);
        $ago = static fn (int $days): string => gmdate('Y-m-d H:i:s', time() - $days * 86400);
        $insert = self::$pdo->prepare('INSERT INTO share_links (cartographie_id, token_hash, password_hash, expires_at, revoked_at) VALUES (?, ?, ?, ?, ?)');
        $keep = [];
        foreach ([
            ['expire-29', $ago(29), null, true],     // expiré, encore dans la grâce
            ['revoque-29', null, $ago(29), true],    // révoqué, encore dans la grâce
            ['expire-31', $ago(31), null, false],
            ['revoque-31', null, $ago(31), false],
            ['mixte', $ago(10), $ago(45), false],    // expiré récemment MAIS révoqué depuis longtemps
            ['futur', gmdate('Y-m-d H:i:s', time() + 86400), null, true],
            ['sans-expiration', null, null, true],
        ] as [$name, $expires, $revoked, $survives]) {
            $insert->execute([$cartoId, hash('sha256', $name), 'h', $expires, $revoked]);
            if ($survives) {
                $keep[] = (int) self::$pdo->lastInsertId();
            }
        }
        self::$pdo->exec(
            "INSERT INTO llm_usage_daily (usage_date, requests, input_tokens, output_tokens, estimated_cost_usd)
             VALUES (UTC_DATE(), 3, 300, 100, 0.01), (UTC_DATE() - INTERVAL 1 DAY, 9, 900, 300, 0.03)"
        );
        self::$pdo->exec(sprintf(
            "INSERT INTO llm_pow_challenges (challenge_hash, expires_at) VALUES ('%s', %d), ('%s', %d)",
            hash('sha256', 'ancien'),
            time() - 60,
            hash('sha256', 'frais'),
            time() + 60,
        ));

        return $keep;
    }

    /** @return list<int> */
    private static function shareLinkIds(): array
    {
        return array_map(intval(...), self::$pdo->query('SELECT id FROM share_links ORDER BY id')->fetchAll(\PDO::FETCH_COLUMN));
    }

    #[TestDox('UC-SYS-03-F01 — nominal (supervision) : /health et /status répondent sans session — version, base, démo, file du worker, cache 30 s')]
    public function testF01HealthAndStatusProbes(): void
    {
        TestDb::setEnv('APP_VERSION', '2026.09.28-abc1234');
        $this->seedWorkerQueue();

        $health = $this->probe('/health');
        self::assertSame(200, $health->getStatusCode());
        self::assertSame('application/json', $health->getHeaderLine('Content-Type'));
        self::assertSame(['status' => 'ok', 'version' => '2026.09.28-abc1234', 'db' => 'ok'], AdmSupport::body($health));

        $status = $this->probe('/status');
        self::assertSame(200, $status->getStatusCode());
        self::assertSame('public, max-age=30', $status->getHeaderLine('Cache-Control'));
        self::assertSame([
            'status' => 'ok',
            'version' => '2026.09.28-abc1234',
            'db' => 'ok',
            'demo' => ['enabled' => true, 'remainingToday' => true],
            'worker' => ['lastActivityAt' => '2026-09-28 09:30:00', 'queued' => 2],
        ], AdmSupport::body($status));
    }

    #[TestDox('UC-SYS-03-F02 — A1 : /status suit la démo — plafond du jour atteint → remainingToday faux ; démo éteinte → enabled faux, remainingToday null')]
    public function testF02StatusFollowsTheDemo(): void
    {
        self::$pdo->exec(
            "INSERT INTO llm_usage_daily (usage_date, requests, input_tokens, output_tokens, estimated_cost_usd)
             VALUES (UTC_DATE(), 900, 1500000, 600000, 1.20)"
        );
        self::assertSame(['enabled' => true, 'remainingToday' => false], AdmSupport::body($this->probe('/status'))['demo']);

        (new SettingsRepository(self::$pdo))->set(DemoConfig::OVERRIDES_KEY, ['enabled' => false]);
        self::assertSame(['enabled' => false, 'remainingToday' => null], AdmSupport::body($this->probe('/status'))['demo']);
    }

    #[TestDox('UC-SYS-03-F03 — E1 : base non configurée ou injoignable → /health et /status restent 200 avec un diagnostic, sans détail SQL ; échec partiel : champs déjà calculés conservés')]
    public function testF03ProbesNeverFail(): void
    {
        $originalHost = Env::get('DB_HOST');
        try {
            TestDb::setEnv('DB_HOST', '');
            self::assertSame('unconfigured', AdmSupport::body($this->probe('/health'))['db']);
            $unconfigured = AdmSupport::body($this->probe('/status'));
            self::assertSame(['unconfigured', ['enabled' => false, 'remainingToday' => null]], [$unconfigured['db'], $unconfigured['demo']]);
        } finally {
            TestDb::setEnv('DB_HOST', $originalHost);
            TestDb::overrideEnv();
        }

        TestDb::setEnv('APP_VERSION', 'v-uc-sys03');
        [$health, $status] = $this->withUnreachableDatabase(fn (): array => [$this->probe('/health'), $this->probe('/status')]);

        foreach ([$health, $status] as $response) {
            self::assertSame(200, $response->getStatusCode());
            self::assertSame('error', AdmSupport::body($response)['db']);
            self::assertStringNotContainsString('SQLSTATE', (string) $response->getBody());
            self::assertStringNotContainsString('127.0.0.1', (string) $response->getBody());
        }
        // Corps complet : un /status qui lirait la démo AVANT la base (DemoConfig
        // tolérant aux pannes, fichier « activée ») ne passerait pas.
        self::assertSame([
            'status' => 'ok',
            'version' => 'v-uc-sys03',
            'db' => 'error',
            'demo' => ['enabled' => false, 'remainingToday' => null],
            'worker' => ['lastActivityAt' => null, 'queued' => null],
        ], AdmSupport::body($status));

        // Échec PARTIEL (ex. table absente entre la bascule de release et
        // /admin/migrate) : SELECT 1 passe, la démo est déjà lue, la file non.
        self::$pdo->exec('RENAME TABLE mass_jobs TO mass_jobs_uc_sys03');
        try {
            $partial = $this->probe('/status');
        } finally {
            self::$pdo->exec('RENAME TABLE mass_jobs_uc_sys03 TO mass_jobs');
        }
        self::assertSame(200, $partial->getStatusCode());
        self::assertSame([
            'status' => 'ok',
            'version' => 'v-uc-sys03',
            'db' => 'error',
            'demo' => ['enabled' => true, 'remainingToday' => true],
            'worker' => ['lastActivityAt' => null, 'queued' => null],
        ], AdmSupport::body($partial), 'db « error » mais démo déjà renseignée');
    }

    #[TestDox('UC-SYS-03-F04 — nominal (maintenance) : le planificateur appelle la route à jeton → liens morts depuis plus de 30 jours purgés (J-29 gardé, J-31 et cas mixte purgés), compteurs démo et défis nettoyés ; rejouable')]
    public function testF04MaintenanceRoute(): void
    {
        $keep = $this->seedShareLinks();

        $first = $this->maintenance();

        self::assertSame(200, $first->getStatusCode());
        self::assertSame(['shareLinksPurged' => 3, 'demoDaysPruned' => 1, 'powChallengesPruned' => 1], AdmSupport::body($first));
        self::assertSame($keep, self::shareLinkIds(), 'J-29 (expiré, révoqué), futur et sans expiration survivent ; J-31 et le cas mixte sont purgés');
        self::assertSame(1, (int) self::$pdo->query('SELECT COUNT(*) FROM llm_usage_daily WHERE usage_date = UTC_DATE()')->fetchColumn());
        self::assertSame(['shareLinksPurged' => 0, 'demoDaysPruned' => 0, 'powChallengesPruned' => 0], AdmSupport::body($this->maintenance()));
    }

    #[TestDox('UC-SYS-03-F05 — E2/E3 : maintenance — jeton non configuré 404, absent ou faux 403, base non configurée 503, base injoignable 500 générique')]
    public function testF05MaintenanceGates(): void
    {
        TestDb::setEnv('MIGRATE_TOKEN', '');
        self::assertSame(404, $this->maintenance()->getStatusCode());
        TestDb::setEnv('MIGRATE_TOKEN', self::TOKEN);
        self::assertSame(403, $this->maintenance(null)->getStatusCode());
        self::assertSame(403, $this->maintenance('faux')->getStatusCode());

        $originalHost = Env::get('DB_HOST');
        try {
            TestDb::setEnv('DB_HOST', '');
            self::assertSame([503, ['error' => 'Database not configured']], [$this->maintenance()->getStatusCode(), AdmSupport::body($this->maintenance())]);
        } finally {
            TestDb::setEnv('DB_HOST', $originalHost);
            TestDb::overrideEnv();
        }
        $failed = $this->withUnreachableDatabase(fn (): ResponseInterface => $this->maintenance());
        self::assertSame([500, ['error' => 'Maintenance failed, see server log']], [$failed->getStatusCode(), AdmSupport::body($failed)]);
    }

    #[TestDox('UC-SYS-03-F06 — A2/E4 : équivalent CLI php scripts/maintenance.php → mêmes effets, compteurs en une ligne JSON ; sans base → code 1 ; base injoignable → message SQL sur stderr, code 1')]
    public function testF06MaintenanceCommandLine(): void
    {
        $keep = $this->seedShareLinks();

        $run = AdmSupport::runPhp('scripts/maintenance.php', [], AdmSupport::cliEnv());

        self::assertSame(0, $run['exit'], $run['stderr']);
        self::assertSame('{"shareLinksPurged":3,"demoDaysPruned":1,"powChallengesPruned":1}' . "\n", $run['stdout']);
        self::assertSame($keep, self::shareLinkIds(), 'mêmes survivants que par la route (F04)');

        $noDb = AdmSupport::runPhp('scripts/maintenance.php', [], AdmSupport::cliEnv(['DB_HOST' => '']));
        self::assertSame(1, $noDb['exit']);
        self::assertStringContainsString('base de données non configurée', $noDb['stderr']);

        // COMPORTEMENT ACTUEL (E4) : base configurée mais injoignable → le
        // message de l'exception (SQLSTATE) part sur la sortie d'erreur, code 1.
        $unreachable = AdmSupport::runPhp('scripts/maintenance.php', [], AdmSupport::cliEnv(['DB_HOST' => '127.0.0.1', 'DB_PORT' => '1']));
        self::assertSame(1, $unreachable['exit']);
        self::assertStringStartsWith('[maintenance] échec : SQLSTATE', $unreachable['stderr']);
    }

    #[TestDox('UC-SYS-03-F07 — RG5 : en-têtes de sécurité sur toute réponse réelle — 200, 401 et 403 des gardes (rôle, CSRF), 403 et 500 de la route, 404/405 du routeur, 500 de l’ErrorMiddleware')]
    public function testF07SecurityHeadersOnEveryResponse(): void
    {
        $eleve = $this->registerAs('eleve-' . uniqid() . '@example.org', 'Élève', ['apprenant']);
        $responses = [
            '200 /health' => $this->probe('/health'),
            '401 /admin/users (garde RequireRole, sans session)' => $this->probe('/admin/users'),
            '403 /admin/users (garde RequireRole, rôle)' => $this->as_($eleve, 'GET', '/api/admin/users'),
        ];
        $this->cookieSid = $eleve['sid'];
        $responses['403 POST sans X-CSRF-Token (CsrfMiddleware)'] = $this->request('POST', '/api/admin/users/1/roles', ['role' => 'admin']);
        $responses['403 /admin/maintenance (jeton, dans la route)'] = $this->maintenance('faux');
        $responses['404 inconnue (routeur)'] = $this->probe('/nexiste-pas');
        $responses['405 DELETE /health (routeur)'] = AdmSupport::toolRequest('DELETE', '/health', null);

        $this->withUnreachableDatabase(function () use (&$responses): void {
            $responses['500 /admin/maintenance (catch de la route)'] = $this->maintenance();
            // Session::start() → Db::get() lève dans RequireRole : l'exception
            // n'est rattrapée que par l'ErrorMiddleware, qui synthétise le 500.
            $this->cookieSid = 'uc-sys03-session';
            $responses['500 /admin/users (ErrorMiddleware)'] = $this->request('GET', '/api/admin/users');
        });

        self::assertSame(['error' => 'Rôle insuffisant'], AdmSupport::body($responses['403 /admin/users (garde RequireRole, rôle)']));
        self::assertSame(['error' => 'Jeton CSRF absent ou invalide'], AdmSupport::body($responses['403 POST sans X-CSRF-Token (CsrfMiddleware)']));
        foreach ($responses as $label => $response) {
            self::assertSame((int) substr($label, 0, 3), $response->getStatusCode(), $label);
            foreach (self::SECURITY_HEADERS as $name => $value) {
                self::assertSame($value, $response->getHeaderLine($name), "{$name} sur {$label}");
            }
            self::assertNotSame('', $response->getHeaderLine('Permissions-Policy'), $label);
        }
    }

    #[TestDox('UC-SYS-03-F08 — A3/E4 : audit RGPD en CLI (rgpd-audit.php) — schéma sain, empreinte d’un compte, vide après suppression ; colonne non gouvernée → « ⚠ BUG RGPD », code 2 ; sans base → code 1')]
    public function testF08RgpdAuditCommandLine(): void
    {
        $maya = $this->registerAs('maya@example.org', 'Maya', ['apprenant']);
        $this->createCarto($maya);

        $report = AdmSupport::runPhp('scripts/rgpd-audit.php', [(string) $maya['id']], AdmSupport::cliEnv());

        self::assertSame(0, $report['exit'], $report['stderr']);
        self::assertStringContainsString('aucune — toute référence utilisateur est régie par une FK (CASCADE/SET NULL).', $report['stdout']);
        self::assertMatchesRegularExpression('/cartographies\.user_id\s+1 lignes \| suppression: CASCADE\s+\| export: local/', $report['stdout']);
        self::assertMatchesRegularExpression('/audit_events\.user_id\s+\d+ lignes \| suppression: SET NULL/', $report['stdout']);
        self::assertStringNotContainsString('maya@example.org', $report['stdout'], 'le rapport ne liste que des comptages');

        self::assertSame(204, $this->as_($maya, 'DELETE', '/api/auth/account')->getStatusCode());
        $after = AdmSupport::runPhp('scripts/rgpd-audit.php', [(string) $maya['id']], AdmSupport::cliEnv());
        self::assertSame(0, $after['exit']);
        self::assertStringContainsString('aucune donnée rattachée à cet identifiant.', $after['stdout']);

        $noArg = AdmSupport::runPhp('scripts/rgpd-audit.php', [], AdmSupport::cliEnv());
        self::assertStringContainsString('Passez un user_id en argument', $noArg['stdout']);

        // La détection de fuite : une colonne user_id SANS clé étrangère → code 2.
        try {
            self::$pdo->exec('CREATE TABLE uc_sys03_orphan (id INT PRIMARY KEY, user_id INT NULL)');
            $leak = AdmSupport::runPhp('scripts/rgpd-audit.php', [], AdmSupport::cliEnv());
        } finally {
            self::$pdo->exec('DROP TABLE IF EXISTS uc_sys03_orphan');
        }
        self::assertSame(2, $leak['exit']);
        self::assertStringContainsString('⚠ BUG RGPD', $leak['stdout']);
        self::assertStringContainsString('- uc_sys03_orphan.user_id', $leak['stdout']);

        // E4 : sans base → code 1 ; base injoignable → COMPORTEMENT ACTUEL :
        // Db::get() hors de tout try, exception non rattrapée (code 255).
        $noDb = AdmSupport::runPhp('scripts/rgpd-audit.php', [], AdmSupport::cliEnv(['DB_HOST' => '']));
        self::assertSame(1, $noDb['exit']);
        self::assertStringContainsString('base de données non configurée', $noDb['stderr']);
        $unreachable = AdmSupport::runPhp('scripts/rgpd-audit.php', [], AdmSupport::cliEnv(['DB_HOST' => '127.0.0.1', 'DB_PORT' => '1']));
        self::assertSame(255, $unreachable['exit']);
        self::assertStringContainsString('PDOException', $unreachable['stdout'] . $unreachable['stderr']);
    }

    /**
     * COMPORTEMENT ACTUEL figé — anomalie AN-1 de la fiche : la maintenance
     * quotidienne supprime les compteurs de démo des jours passés
     * (llm_usage_daily), alors que le monitoring (UC-ADM-06) s'en sert pour la
     * série quotidienne des tokens (détecteur d'anomalies) et le coût « tout
     * temps » de la démo. Après chaque passage, cet historique disparaît.
     */
    #[TestDox('UC-SYS-03-F09 — (anomalie AN-1, comportement actuel) la maintenance efface l’historique des tokens de démo affiché par le monitoring')]
    public function testF09MaintenanceErasesDemoHistoryCurrentBehaviour(): void
    {
        $admin = $this->registerAdmin('root@example.org');
        self::$pdo->exec(
            "INSERT INTO llm_usage_daily (usage_date, requests, input_tokens, output_tokens, estimated_cost_usd)
             VALUES (UTC_DATE(), 2, 200, 100, 0.01), (UTC_DATE() - INTERVAL 3 DAY, 40, 90000, 30000, 1.50)"
        );
        $before = self::json($this->as_($admin, 'GET', '/api/admin/monitoring?days=30'))['tokens'];
        self::assertSame(42, $before['toutTemps']['demo']['requetes']);
        self::assertCount(2, array_filter($before['parJour'], static fn (array $j): bool => $j['demo'] !== null));

        self::assertSame(200, $this->maintenance()->getStatusCode());

        $after = self::json($this->as_($admin, 'GET', '/api/admin/monitoring?days=30'))['tokens'];
        self::assertSame(2, $after['toutTemps']['demo']['requetes'], 'l’historique de démo a disparu');
        self::assertCount(1, array_filter($after['parJour'], static fn (array $j): bool => $j['demo'] !== null));
    }

    #[TestDox('UC-SYS-03-F10 — E2 : appel de maintenance porteur d’un cookie de session (même périmé) sans X-CSRF-Token → 403 CSRF avant le contrôle du jeton, rien n’est purgé')]
    public function testF10MaintenanceWithASessionCookieHitsTheCsrfGuard(): void
    {
        $keep = $this->seedShareLinks();
        $before = self::shareLinkIds();

        $this->cookieSid = 'uc-sys03-perime';
        $response = $this->request('POST', '/api/admin/maintenance', null, ['X-Migrate-Token' => self::TOKEN]);

        self::assertSame(403, $response->getStatusCode());
        self::assertSame(['error' => 'Jeton CSRF absent ou invalide'], self::json($response));
        self::assertSame($before, self::shareLinkIds(), 'aucune purge');
        self::assertNotSame($keep, $before);
        // Le même appel SANS cookie (planificateur) passe.
        self::assertSame(200, $this->maintenance()->getStatusCode());
        self::assertSame($keep, self::shareLinkIds());
    }
}
