<?php

declare(strict_types=1);

namespace Humanome\Tests\UseCases\Unit;

use Humanome\Auth\Users;
use Humanome\Bootstrap;
use Humanome\Maintenance\Maintenance;
use Humanome\Middleware\SecurityHeaders;
use Humanome\MigrationRunner;
use Humanome\Rgpd\RgpdAudit;
use Humanome\Llm\UsageCounters;
use Humanome\Tests\TestDb;
use Humanome\Tests\UseCases\Support\AdmSupport;
use PDO;
use PHPUnit\Framework\Attributes\TestDox;
use PHPUnit\Framework\TestCase;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\RequestHandlerInterface;
use Slim\Psr7\Factory\ResponseFactory;
use Slim\Psr7\Factory\ServerRequestFactory;

require_once \dirname(__DIR__, 4) . '/scripts/maintenance.php';
require_once \dirname(__DIR__, 4) . '/scripts/rgpd-audit.php';

/**
 * UC-SYS-03 — Maintenance et supervision technique : tests UNITAIRES.
 *
 * Fiche : docs/cas-utilisation/systeme/UC-SYS-03-maintenance-supervision.md
 *
 * Appels directs : Maintenance::run (scripts/maintenance.php — purge des
 * liens morts après 30 jours de grâce, remise à zéro des compteurs de démo),
 * UsageCounters (coupe-circuit journalier lu par /api/status),
 * Bootstrap::version (/api/health), le middleware SecurityHeaders sur un
 * gestionnaire factice, et RgpdAudit (scripts/rgpd-audit.php) sur le schéma
 * réel.
 */
final class UcSys03MaintenanceSupervisionTest extends TestCase
{
    private static PDO $pdo;

    public static function setUpBeforeClass(): void
    {
        self::$pdo = TestDb::fresh();
        (new MigrationRunner(self::$pdo, MigrationRunner::defaultMigrationsDir()))->run();
    }

    protected function setUp(): void
    {
        TestDb::overrideEnv();
        foreach (['users', 'llm_usage_daily', 'tuteur_usage_daily', 'llm_pow_challenges', 'audit_events'] as $table) {
            self::$pdo->exec("DELETE FROM {$table}");
        }
    }

    protected function tearDown(): void
    {
        TestDb::restoreEnv();
    }

    /** Un lien de partage sur une cartographie neuve ; renvoie son id. */
    private static function shareLink(?string $expiresAt, ?string $revokedAt): int
    {
        static $n = 0;
        $n++;
        $userId = AdmSupport::user(self::$pdo, "lien{$n}-" . uniqid() . '@example.org', 'Apprenant');
        self::$pdo->prepare("INSERT INTO cartographies (user_id, type, titre, visibility) VALUES (?, 'jour', 'T', 'publique')")
            ->execute([$userId]);
        self::$pdo->prepare('INSERT INTO share_links (cartographie_id, token_hash, password_hash, expires_at, revoked_at) VALUES (?, ?, ?, ?, ?)')
            ->execute([(int) self::$pdo->lastInsertId(), hash('sha256', uniqid('', true)), 'h', $expiresAt, $revokedAt]);

        return (int) self::$pdo->lastInsertId();
    }

    private static function ago(int $days, int $extraSeconds = 0): string
    {
        return gmdate('Y-m-d H:i:s', time() - $days * 86400 - $extraSeconds);
    }

    #[TestDox('UC-SYS-03-U01 — Maintenance::run : liens expirés ou révoqués depuis PLUS de 30 jours purgés, les autres gardés ; rejouer = 0')]
    public function testU01ShareLinkGraceWindow(): void
    {
        $keep = [
            self::shareLink(self::ago(29), null),          // expiré, encore dans la grâce
            self::shareLink(null, self::ago(29)),          // révoqué, encore dans la grâce
            self::shareLink(gmdate('Y-m-d H:i:s', time() + 86400), null), // vivant
            self::shareLink(null, null),                   // sans expiration
        ];
        self::shareLink(self::ago(31), null);
        self::shareLink(null, self::ago(31));
        self::shareLink(self::ago(10), self::ago(45));     // révoqué il y a longtemps : l'un OU l'autre suffit

        $counters = Maintenance::run(self::$pdo);

        self::assertSame(3, $counters['shareLinksPurged']);
        $left = array_map(intval(...), self::$pdo->query('SELECT id FROM share_links ORDER BY id')->fetchAll(PDO::FETCH_COLUMN));
        self::assertSame($keep, $left);
        self::assertSame(30, Maintenance::SHARE_LINK_GRACE_DAYS);
        self::assertSame(['shareLinksPurged' => 0, 'demoDaysPruned' => 0, 'powChallengesPruned' => 0], Maintenance::run(self::$pdo), 'idempotent');
    }

    #[TestDox('UC-SYS-03-U02 — Maintenance::run : compteurs démo des jours UTC passés supprimés (aujourd’hui gardé), défis PoW expirés supprimés, tuteur intact')]
    public function testU02DemoCountersAndPowChallenges(): void
    {
        $demo = self::$pdo->prepare('INSERT INTO llm_usage_daily (usage_date, requests, input_tokens, output_tokens, estimated_cost_usd) VALUES (?, 1, 10, 10, 0.01)');
        foreach ([0, 1, 30] as $daysAgo) {
            $demo->execute([gmdate('Y-m-d', time() - $daysAgo * 86400)]);
        }
        self::$pdo->exec("INSERT INTO tuteur_usage_daily (usage_date, requests) VALUES (UTC_DATE() - INTERVAL 5 DAY, 3)");
        $pow = self::$pdo->prepare('INSERT INTO llm_pow_challenges (challenge_hash, expires_at) VALUES (?, ?)');
        $pow->execute([hash('sha256', 'expire'), time() - 1]);
        $pow->execute([hash('sha256', 'vivant'), time() + 120]);

        $counters = Maintenance::run(self::$pdo);

        self::assertSame(['shareLinksPurged' => 0, 'demoDaysPruned' => 2, 'powChallengesPruned' => 1], $counters);
        self::assertSame([gmdate('Y-m-d')], self::$pdo->query('SELECT usage_date FROM llm_usage_daily')->fetchAll(PDO::FETCH_COLUMN));
        self::assertSame(1, (int) self::$pdo->query('SELECT COUNT(*) FROM tuteur_usage_daily')->fetchColumn(), 'le tuteur n’est pas purgé');
        self::assertSame(1, (int) self::$pdo->query('SELECT COUNT(*) FROM llm_pow_challenges')->fetchColumn());
    }

    #[TestDox('UC-SYS-03-U03 — UsageCounters : jour UTC, incrément atomique, coupe-circuit atteint par les tokens OU par le budget')]
    public function testU03UsageCountersBreaker(): void
    {
        $counters = new UsageCounters(self::$pdo);
        $now = time();
        self::assertSame(['requests' => 0, 'inputTokens' => 0, 'outputTokens' => 0, 'estimatedCostUsd' => 0.0], $counters->today($now));
        self::assertFalse($counters->isExhausted(1000, 1.0, $now));

        $counters->record(600, 300, 0.25, $now);
        $counters->record(50, 49, 0.25, $now);
        self::assertSame(['requests' => 2, 'inputTokens' => 650, 'outputTokens' => 349, 'estimatedCostUsd' => 0.5], $counters->today($now));
        self::assertFalse($counters->isExhausted(1000, 1.0, $now), '999 tokens < 1000');
        self::assertTrue($counters->isExhausted(999, 1.0, $now), 'plafond de tokens atteint');
        self::assertTrue($counters->isExhausted(1000, 0.5, $now), 'budget atteint');
        self::assertFalse($counters->isExhausted(1000, 1.0, $now + 86400), 'lendemain UTC : remis à zéro sans cron');

        $this->expectException(\InvalidArgumentException::class);
        new UsageCounters(self::$pdo, 'users');
    }

    #[TestDox('UC-SYS-03-U04 — Bootstrap::version : APP_VERSION prioritaire, sinon « dev » dans le dépôt (pas de fichier VERSION)')]
    public function testU04Version(): void
    {
        TestDb::setEnv('APP_VERSION', 'v2026.09.28-abc1234');
        self::assertSame('v2026.09.28-abc1234', Bootstrap::version());

        TestDb::setEnv('APP_VERSION', '');
        self::assertFileDoesNotExist(AdmSupport::repoRoot() . '/api/VERSION');
        self::assertFileDoesNotExist(AdmSupport::repoRoot() . '/VERSION');
        self::assertSame('dev', Bootstrap::version());
    }

    #[TestDox('UC-SYS-03-U05 — SecurityHeaders : six en-têtes durcis posés sur toute réponse, valeurs imposées, statut et type conservés')]
    public function testU05SecurityHeadersDecorateAnyResponse(): void
    {
        $handler = new class () implements RequestHandlerInterface {
            public function handle(ServerRequestInterface $request): ResponseInterface
            {
                return (new ResponseFactory())->createResponse(418)
                    ->withHeader('Content-Type', 'application/json')
                    ->withHeader('X-Frame-Options', 'SAMEORIGIN');
            }
        };

        $response = (new SecurityHeaders())->process((new ServerRequestFactory())->createServerRequest('GET', '/api/x'), $handler);

        self::assertSame(418, $response->getStatusCode());
        self::assertSame('application/json', $response->getHeaderLine('Content-Type'));
        self::assertSame("default-src 'none'; frame-ancestors 'none'; base-uri 'none'", $response->getHeaderLine('Content-Security-Policy'));
        self::assertSame('nosniff', $response->getHeaderLine('X-Content-Type-Options'));
        self::assertSame('DENY', $response->getHeaderLine('X-Frame-Options'), 'valeur imposée, pas ajoutée');
        self::assertSame('no-referrer', $response->getHeaderLine('Referrer-Policy'));
        self::assertSame('max-age=31536000', $response->getHeaderLine('Strict-Transport-Security'));
        self::assertStringContainsString('camera=()', $response->getHeaderLine('Permissions-Policy'));
        self::assertStringContainsString('geolocation=()', $response->getHeaderLine('Permissions-Policy'));
    }

    #[TestDox('UC-SYS-03-U06 — RgpdAudit : aucune colonne utilisateur sans clé étrangère ; empreinte d’un compte non vide avant purge, vide après')]
    public function testU06RgpdAuditOnTheLiveSchema(): void
    {
        self::assertSame([], RgpdAudit::unconstrainedUserColumns(self::$pdo));
        self::assertSame('CASCADE', RgpdAudit::deleteRuleOf(self::$pdo, ['table' => 'cartographies', 'column' => 'user_id']));
        self::assertSame('SET NULL', RgpdAudit::deleteRuleOf(self::$pdo, ['table' => 'audit_events', 'column' => 'user_id']));
        self::assertSame('NONE', RgpdAudit::deleteRuleOf(self::$pdo, ['table' => 'users', 'column' => 'email']));

        $linkId = self::shareLink(null, null);
        $userId = (int) self::$pdo->query("SELECT c.user_id FROM share_links s JOIN cartographies c ON c.id = s.cartographie_id WHERE s.id = {$linkId}")->fetchColumn();
        self::$pdo->prepare("INSERT INTO audit_events (user_id, type) VALUES (?, 'share_created')")->execute([$userId]);

        $before = RgpdAudit::footprint(self::$pdo, $userId);
        self::assertSame(['audit_events.user_id' => 1, 'cartographies.user_id' => 1, 'share_links' => 1], array_intersect_key($before, ['audit_events.user_id' => 1, 'cartographies.user_id' => 1, 'share_links' => 1]));

        Users::purge(self::$pdo, $userId);
        self::assertSame([], RgpdAudit::residualReferences(self::$pdo, $userId));
        self::assertSame(1, AdmSupport::countAudit(self::$pdo, 'share_created'), 'trace conservée, anonymisée');
    }
}
