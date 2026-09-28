<?php

declare(strict_types=1);

namespace Humanome\Tests\UseCases\Functional;

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

    /** Liens morts (expiré / révoqué depuis 40 jours) et vivants. */
    private function seedShareLinks(): void
    {
        $owner = $this->registerAs('maya-' . uniqid() . '@example.org', 'Maya', ['apprenant']);
        $cartoId = $this->createCarto($owner, ['visibility' => 'publique']);
        $insert = self::$pdo->prepare('INSERT INTO share_links (cartographie_id, token_hash, password_hash, expires_at, revoked_at) VALUES (?, ?, ?, ?, ?)');
        $insert->execute([$cartoId, hash('sha256', 'mort-1'), 'h', gmdate('Y-m-d H:i:s', time() - 40 * 86400), null]);
        $insert->execute([$cartoId, hash('sha256', 'mort-2'), 'h', null, gmdate('Y-m-d H:i:s', time() - 40 * 86400)]);
        $insert->execute([$cartoId, hash('sha256', 'grace'), 'h', gmdate('Y-m-d H:i:s', time() - 5 * 86400), null]);
        $insert->execute([$cartoId, hash('sha256', 'vivant'), 'h', null, null]);
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

    #[TestDox('UC-SYS-03-F03 — E1 : base non configurée ou injoignable → /health et /status restent 200 avec un diagnostic, sans détail SQL')]
    public function testF03ProbesNeverFail(): void
    {
        $originalHost = Env::get('DB_HOST');
        try {
            TestDb::setEnv('DB_HOST', '');
            self::assertSame('unconfigured', AdmSupport::body($this->probe('/health'))['db']);
            $unconfigured = AdmSupport::body($this->probe('/status'));
            self::assertSame(['unconfigured', ['enabled' => false, 'remainingToday' => null]], [$unconfigured['db'], $unconfigured['demo']]);

            TestDb::setEnv('DB_HOST', 'mysql-injoignable.invalid');
            TestDb::overrideEnv();
            TestDb::setEnv('DB_HOST', 'mysql-injoignable.invalid');
            $health = $this->probe('/health');
            $status = $this->probe('/status');
        } finally {
            TestDb::setEnv('DB_HOST', $originalHost);
            TestDb::overrideEnv();
        }

        foreach ([$health, $status] as $response) {
            self::assertSame(200, $response->getStatusCode());
            self::assertSame('error', AdmSupport::body($response)['db']);
            self::assertStringNotContainsString('SQLSTATE', (string) $response->getBody());
            self::assertStringNotContainsString('injoignable', (string) $response->getBody());
        }
        self::assertSame(['lastActivityAt' => null, 'queued' => null], AdmSupport::body($status)['worker']);
    }

    #[TestDox('UC-SYS-03-F04 — nominal (maintenance) : le planificateur appelle la route à jeton → liens morts purgés, compteurs démo et défis nettoyés ; rejouable')]
    public function testF04MaintenanceRoute(): void
    {
        $this->seedShareLinks();

        $first = $this->maintenance();

        self::assertSame(200, $first->getStatusCode());
        self::assertSame(['shareLinksPurged' => 2, 'demoDaysPruned' => 1, 'powChallengesPruned' => 1], AdmSupport::body($first));
        self::assertSame(2, (int) self::$pdo->query('SELECT COUNT(*) FROM share_links')->fetchColumn(), 'lien en grâce + lien vivant');
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
            TestDb::setEnv('DB_HOST', 'mysql-injoignable.invalid');
            TestDb::overrideEnv();
            TestDb::setEnv('DB_HOST', 'mysql-injoignable.invalid');
            $failed = $this->maintenance();
        } finally {
            TestDb::setEnv('DB_HOST', $originalHost);
            TestDb::overrideEnv();
        }
        self::assertSame([500, ['error' => 'Maintenance failed, see server log']], [$failed->getStatusCode(), AdmSupport::body($failed)]);
    }

    #[TestDox('UC-SYS-03-F06 — A2 : équivalent CLI php scripts/maintenance.php → mêmes effets, compteurs en une ligne JSON ; sans base → code 1')]
    public function testF06MaintenanceCommandLine(): void
    {
        $this->seedShareLinks();

        $run = AdmSupport::runPhp('scripts/maintenance.php', [], AdmSupport::cliEnv());

        self::assertSame(0, $run['exit'], $run['stderr']);
        self::assertSame('{"shareLinksPurged":2,"demoDaysPruned":1,"powChallengesPruned":1}' . "\n", $run['stdout']);
        self::assertSame(2, (int) self::$pdo->query('SELECT COUNT(*) FROM share_links')->fetchColumn());

        $noDb = AdmSupport::runPhp('scripts/maintenance.php', [], AdmSupport::cliEnv(['DB_HOST' => '']));
        self::assertSame(1, $noDb['exit']);
        self::assertStringContainsString('base de données non configurée', $noDb['stderr']);
    }

    #[TestDox('UC-SYS-03-F07 — RG : en-têtes de sécurité sur toute réponse réelle — 200, 401, 403 (jeton), 404, 405, 500')]
    public function testF07SecurityHeadersOnEveryResponse(): void
    {
        $responses = [
            '200 /health' => $this->probe('/health'),
            '401 /admin/users' => $this->probe('/admin/users'),
            '403 /admin/maintenance' => $this->maintenance('faux'),
            '404 inconnue' => $this->probe('/nexiste-pas'),
            '405 DELETE /health' => AdmSupport::toolRequest('DELETE', '/health', null),
        ];
        $originalHost = Env::get('DB_HOST');
        try {
            TestDb::setEnv('DB_HOST', 'mysql-injoignable.invalid');
            TestDb::overrideEnv();
            TestDb::setEnv('DB_HOST', 'mysql-injoignable.invalid');
            $responses['500 /admin/maintenance'] = $this->maintenance();
        } finally {
            TestDb::setEnv('DB_HOST', $originalHost);
            TestDb::overrideEnv();
        }

        foreach ($responses as $label => $response) {
            self::assertSame((int) substr($label, 0, 3), $response->getStatusCode(), $label);
            foreach (self::SECURITY_HEADERS as $name => $value) {
                self::assertSame($value, $response->getHeaderLine($name), "{$name} sur {$label}");
            }
            self::assertNotSame('', $response->getHeaderLine('Permissions-Policy'), $label);
        }
    }

    #[TestDox('UC-SYS-03-F08 — A3 : audit RGPD en CLI (rgpd-audit.php) — aucune fuite de schéma, empreinte d’un compte, puis vide après suppression du compte')]
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
}
