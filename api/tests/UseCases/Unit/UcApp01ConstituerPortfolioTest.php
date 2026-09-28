<?php

declare(strict_types=1);

namespace Humanome\Tests\UseCases\Unit;

use Humanome\Auth\RateLimiter;
use Humanome\ClientIp;
use Humanome\Db;
use Humanome\Llm\CurlHttpClient;
use Humanome\Llm\DemoConfig;
use Humanome\Llm\LlmRuntime;
use Humanome\MigrationRunner;
use Humanome\Packages\SettingsRepository;
use Humanome\Tests\LlmFakeHttpClient;
use Humanome\Tests\TestDb;
use PDO;
use PHPUnit\Framework\Attributes\TestDox;
use PHPUnit\Framework\TestCase;

/**
 * UC-APP-01 — Constituer son portfolio local : tests UNITAIRES (API).
 *
 * Fiche : docs/cas-utilisation/apprenant/UC-APP-01-constituer-portfolio.md
 *
 * Le portfolio ne quitte jamais le navigateur ; la SEULE brique serveur du
 * cas est le relais d'import Google Docs (GET /api/gdoc-text). Ses règles
 * sont portées par des classes appelées ici directement : DemoConfig (quota
 * horaire par IP, partagé avec le proxy LLM), le seau haché ClientIp +
 * RateLimiter, et la couture LlmRuntime (client HTTP sortant remplaçable).
 */
final class UcApp01ConstituerPortfolioTest extends TestCase
{
    private static PDO $pdo;

    public static function setUpBeforeClass(): void
    {
        self::$pdo = TestDb::fresh();
        (new MigrationRunner(self::$pdo, MigrationRunner::defaultMigrationsDir()))->run();
        TestDb::overrideEnv();
    }

    public static function tearDownAfterClass(): void
    {
        LlmRuntime::setHttpClient(null);
        TestDb::restoreEnv();
    }

    protected function setUp(): void
    {
        TestDb::overrideEnv();
        TestDb::setEnv('DEMO_PER_IP_PER_HOUR', '');
        self::$pdo->exec('DELETE FROM rate_limits');
        self::$pdo->exec('DELETE FROM settings');
    }

    /** Seau de quota exactement comme routes/llm.php le calcule. */
    private static function gdocBucket(string $ip): string
    {
        return 'llm:' . hash('sha256', ClientIp::bucketIdentity($ip));
    }

    #[TestDox('UC-APP-01-U18 — DemoConfig : quota horaire par IP du relais = base > env > fichier (20)')]
    public function testU18PerIpQuotaPrecedence(): void
    {
        $fromFile = DemoConfig::load();
        self::assertSame(20, $fromFile->perIpPerHour);
        self::assertSame('fichier', $fromFile->sources['perIpPerHour']);

        TestDb::setEnv('DEMO_PER_IP_PER_HOUR', '7');
        $fromEnv = DemoConfig::load();
        self::assertSame(7, $fromEnv->perIpPerHour);
        self::assertSame('env', $fromEnv->sources['perIpPerHour']);

        // Réglage administrateur en base (effet immédiat, sans redéploiement).
        (new SettingsRepository(Db::get()))->set(DemoConfig::OVERRIDES_KEY, ['perIpPerHour' => 3]);
        $fromBase = DemoConfig::load();
        self::assertSame(3, $fromBase->perIpPerHour);
        self::assertSame('base', $fromBase->sources['perIpPerHour']);
    }

    #[TestDox('UC-APP-01-U19 — seau haché « llm: » : une même /64 IPv6 partage le quota, jamais d’IP en clair')]
    public function testU19HashedBucketSharedWithinASlash64(): void
    {
        $limiter = new RateLimiter(self::$pdo, 2, 3600);
        $now = 1_800_000_000;

        self::assertSame(1, $limiter->hit(self::gdocBucket('2001:db8:5:6::1'), $now));
        self::assertSame(2, $limiter->hit(self::gdocBucket('2001:db8:5:6:aaaa::9'), $now));
        self::assertSame(3, $limiter->hit(self::gdocBucket('2001:db8:5:6:ffff::2'), $now));
        self::assertSame(30, $limiter->retryAfter(3), 'premier dépassement : 30 s');
        self::assertSame(1, $limiter->hit(self::gdocBucket('2001:db8:5:7::1'), $now), 'autre /64');

        $buckets = self::$pdo->query('SELECT bucket FROM rate_limits')->fetchAll(PDO::FETCH_COLUMN);
        foreach ($buckets as $bucket) {
            self::assertMatchesRegularExpression('/^llm:[0-9a-f]{64}$/', (string) $bucket);
            self::assertStringNotContainsString('2001:db8', (string) $bucket);
        }
    }

    #[TestDox('UC-APP-01-U20 — LlmRuntime : le client HTTP sortant est injectable, null restaure cURL')]
    public function testU20HttpClientSeam(): void
    {
        $fake = new LlmFakeHttpClient();
        LlmRuntime::setHttpClient($fake);
        self::assertSame($fake, LlmRuntime::httpClient());

        LlmRuntime::setHttpClient(null);
        self::assertInstanceOf(CurlHttpClient::class, LlmRuntime::httpClient());
    }
}
