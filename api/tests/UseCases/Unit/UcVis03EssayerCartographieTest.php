<?php

declare(strict_types=1);

namespace Humanome\Tests\UseCases\Unit;

use Humanome\Db;
use Humanome\Llm\AnthropicProvider;
use Humanome\Llm\DemoConfig;
use Humanome\Llm\HttpClientException;
use Humanome\Llm\MockProvider;
use Humanome\Llm\PowChallenge;
use Humanome\Llm\Pricing;
use Humanome\Llm\UpstreamException;
use Humanome\Llm\UsageCounters;
use Humanome\MigrationRunner;
use Humanome\Packages\SettingsRepository;
use Humanome\Tests\LlmFakeHttpClient;
use Humanome\Tests\TestDb;
use PDO;
use PHPUnit\Framework\Attributes\TestDox;
use PHPUnit\Framework\TestCase;

/**
 * UC-VIS-03 — Essayer la cartographie en direct, sans compte : tests UNITAIRES.
 *
 * Fiche : docs/cas-utilisation/visiteur/UC-VIS-03-essayer-cartographie-en-direct.md
 *
 * Les garde-fous et services du proxy POST /api/llm sont appelés directement :
 * preuve de travail sans état (PowChallenge), compteurs journaliers
 * (UsageCounters), estimation de coût (Pricing), configuration à précédence
 * (DemoConfig), fournisseurs mock et Anthropic (ce dernier sur un faux client
 * HTTP : aucun appel réseau réel).
 */
final class UcVis03EssayerCartographieTest extends TestCase
{
    private const SECRET = 'uc-vis-03-secret';

    private static PDO $pdo;

    public static function setUpBeforeClass(): void
    {
        self::$pdo = TestDb::fresh();
        (new MigrationRunner(self::$pdo, MigrationRunner::defaultMigrationsDir()))->run();
    }

    protected function setUp(): void
    {
        TestDb::overrideEnv();
        self::$pdo->exec('DELETE FROM llm_usage_daily');
        self::$pdo->exec('DELETE FROM tuteur_usage_daily');
        self::$pdo->exec("DELETE FROM settings WHERE name = 'demo_overrides'");
    }

    protected function tearDown(): void
    {
        TestDb::restoreEnv();
    }

    /** Premier nonce satisfaisant (ou non) la difficulté. */
    private static function nonce(string $challenge, int $bits, bool $strong = true): string
    {
        for ($n = 0; $n < 1_000_000; $n++) {
            $ok = PowChallenge::leadingZeroBits(hash('sha256', $challenge . ':' . $n)) >= $bits;
            if ($ok === $strong) {
                return (string) $n;
            }
        }
        throw new \LogicException('aucun nonce');
    }

    #[TestDox('UC-VIS-03-U01 — PowChallenge::issue : défi v1.<expiration>.<aléa>.<hmac>, valable 5 minutes, aucun état stocké')]
    public function testU01IssueProducesSignedExpiringChallenge(): void
    {
        $now = 1_800_000_000;
        $issued = (new PowChallenge(self::SECRET, 8))->issue($now);

        self::assertSame(8, $issued['difficultyBits']);
        self::assertSame($now + 300, $issued['expiresAt']);
        self::assertMatchesRegularExpression('/^v1\.' . ($now + 300) . '\.[0-9a-f]{16}\.[0-9a-f]{64}$/', $issued['challenge']);
        [$v, $exp, $rand, $mac] = explode('.', $issued['challenge']);
        self::assertSame(hash_hmac('sha256', "{$v}.{$exp}.{$rand}", self::SECRET), $mac);
        self::assertNotSame($issued['challenge'], (new PowChallenge(self::SECRET, 8))->issue($now)['challenge']);
    }

    #[TestDox('UC-VIS-03-U02 — PowChallenge::verify : OK, falsifié, autre secret, expiré, preuve trop faible')]
    public function testU02VerifyCoversEveryVerdict(): void
    {
        $pow = new PowChallenge(self::SECRET, 8);
        $now = 1_800_000_000;
        $challenge = $pow->issue($now)['challenge'];

        self::assertSame(PowChallenge::OK, $pow->verify($challenge, self::nonce($challenge, 8), $now + 10));
        self::assertSame(PowChallenge::WEAK, $pow->verify($challenge, self::nonce($challenge, 8, false), $now + 10));
        self::assertSame(PowChallenge::EXPIRED, $pow->verify($challenge, self::nonce($challenge, 8), $now + 301));
        $forged = preg_replace('/^v1\.(\d+)\./', 'v1.' . ($now + 99999) . '.', $challenge);
        self::assertSame(PowChallenge::INVALID, $pow->verify($forged, '0', $now));
        self::assertSame(PowChallenge::INVALID, (new PowChallenge('autre-secret', 8))->verify($challenge, self::nonce($challenge, 8), $now));
        self::assertSame(PowChallenge::INVALID, $pow->verify('pas-un-defi', '0', $now));
        self::assertSame(PowChallenge::INVALID, $pow->verify('v2.1.a.b', '0', $now));
    }

    #[TestDox('UC-VIS-03-U03 — secret de la preuve : POW_SECRET, sinon dérivé de MIGRATE_TOKEN, sinon indisponible ; bits à zéro comptés')]
    public function testU03SecretPrecedenceAndLeadingZeroBits(): void
    {
        TestDb::setEnv('POW_SECRET', 'explicite');
        TestDb::setEnv('MIGRATE_TOKEN', 'jeton-migration');
        self::assertSame('explicite', PowChallenge::secretFromEnv());
        TestDb::setEnv('POW_SECRET', '');
        self::assertSame(hash('sha256', 'pow:jeton-migration'), PowChallenge::secretFromEnv());
        TestDb::setEnv('MIGRATE_TOKEN', '');
        self::assertSame('', PowChallenge::secretFromEnv());

        self::assertSame(0, PowChallenge::leadingZeroBits('f' . str_repeat('0', 63)));
        self::assertSame(3, PowChallenge::leadingZeroBits('1abc'));
        self::assertSame(6, PowChallenge::leadingZeroBits('03ff'));
        self::assertSame(9, PowChallenge::leadingZeroBits('004f'));
        self::assertSame(256, PowChallenge::leadingZeroBits(str_repeat('0', 64)));
    }

    #[TestDox('UC-VIS-03-U04 — UsageCounters : incrément atomique par jour UTC, coupe-circuit tokens OU budget, table sur liste blanche')]
    public function testU04UsageCountersDailyBreaker(): void
    {
        // Jour UTC, quel que soit le fuseau du serveur : à Kiritimati (UTC+14),
        // 23 h 30 UTC le 10 mars est déjà le 11 mars en heure locale.
        $timezone = date_default_timezone_get();
        date_default_timezone_set('Pacific/Kiritimati');
        try {
            $lateUtc = gmmktime(23, 30, 0, 3, 10, 2026);
            self::assertSame('2026-03-11', date('Y-m-d', $lateUtc));
            (new UsageCounters(self::$pdo))->record(1, 1, 0.0, $lateUtc);
            self::assertSame('2026-03-10', (string) self::$pdo->query('SELECT usage_date FROM llm_usage_daily')->fetchColumn());
        } finally {
            date_default_timezone_set($timezone);
        }
        self::$pdo->exec('DELETE FROM llm_usage_daily');

        $counters = new UsageCounters(self::$pdo);
        $day = gmmktime(12, 0, 0, 3, 10, 2026);
        $counters->record(100, 50, 0.25, $day);
        $counters->record(10, 5, 0.25, $day + 3600);

        self::assertSame(
            ['requests' => 2, 'inputTokens' => 110, 'outputTokens' => 55, 'estimatedCostUsd' => 0.5],
            $counters->today($day),
        );
        self::assertSame(0, $counters->today($day + 86400)['requests'], 'nouveau jour UTC');
        self::assertFalse($counters->isExhausted(1000, 1.0, $day));
        self::assertTrue($counters->isExhausted(165, 1.0, $day), 'plafond de tokens atteint');
        self::assertTrue($counters->isExhausted(1000, 0.5, $day), 'plafond budgétaire atteint');
        // Le compteur de la démo ignore celui du tuteur (budgets séparés).
        (new UsageCounters(self::$pdo, 'tuteur_usage_daily'))->record(1, 1, 9.0, $day);
        self::assertFalse($counters->isExhausted(1000, 1.0, $day));

        $this->expectException(\InvalidArgumentException::class);
        new UsageCounters(self::$pdo, 'users');
    }

    #[TestDox('UC-VIS-03-U05 — Pricing : tarif du préfixe le plus long, mock gratuit, modèle inconnu au tarif prudent')]
    public function testU05PricingEstimate(): void
    {
        self::assertEqualsWithDelta(0.0006, Pricing::estimateUsd('claude-haiku-4-5-20251001', 100, 100), 1e-12);
        self::assertEqualsWithDelta(0.018, Pricing::estimateUsd('claude-sonnet-4-5', 1000, 1000), 1e-12);
        self::assertSame(0.0, Pricing::estimateUsd('mock', 5000, 5000));
        self::assertEqualsWithDelta(0.03, Pricing::estimateUsd('modele-inconnu', 1000, 1000), 1e-12);
    }

    #[TestDox('UC-VIS-03-U06 — DemoConfig : base > env > fichier > défaut ; le fournisseur ne vient jamais de la base')]
    public function testU06DemoConfigPrecedence(): void
    {
        foreach (['DEMO_ENABLED', 'DEMO_PROVIDER', 'DEMO_MODEL', 'DEMO_PER_IP_PER_HOUR', 'DEMO_POW_DIFFICULTY_BITS'] as $env) {
            TestDb::setEnv($env, '');
        }
        $file = DemoConfig::load();
        self::assertSame('fichier', $file->sources['perIpPerHour']);
        self::assertSame(20, $file->perIpPerHour);
        self::assertSame('anthropic', $file->provider);

        TestDb::setEnv('DEMO_PER_IP_PER_HOUR', '7');
        TestDb::setEnv('DEMO_PROVIDER', 'mock');
        $env = DemoConfig::load();
        self::assertSame(7, $env->perIpPerHour);
        self::assertSame('env', $env->sources['perIpPerHour']);

        (new SettingsRepository(Db::get()))->set(DemoConfig::OVERRIDES_KEY, [
            'perIpPerHour' => 3, 'enabled' => false, 'provider' => 'anthropic', 'model' => 'claude-haiku-4-5-x',
        ]);
        $base = DemoConfig::load();
        self::assertSame(3, $base->perIpPerHour);
        self::assertFalse($base->enabled);
        self::assertSame('claude-haiku-4-5-x', $base->model);
        self::assertSame('base', $base->sources['enabled']);
        self::assertSame('mock', $base->provider, 'provider : env/fichier seulement');
        self::assertNotContains('provider', DemoConfig::OVERRIDABLE_FIELDS);

        // Base configurée mais injoignable (connexion refusée) : la branche
        // catch(\Throwable) ignore la couche « base » en silence (fail-safe).
        TestDb::setEnv('DB_NAME', 'uc_vis_03_base_inexistante');
        Db::reset();
        $previousLog = ini_set('error_log', '/dev/null');
        try {
            $down = DemoConfig::load();
            self::assertSame(7, $down->perIpPerHour);
            self::assertSame('env', $down->sources['perIpPerHour']);
            self::assertTrue($down->enabled, 'le « enabled: false » de la base n’est plus lu');
        } finally {
            ini_set('error_log', (string) $previousLog);
            TestDb::setEnv('DB_NAME', TestDb::name());
            Db::reset();
        }
        // Base non configurée (DB_HOST vide) : couche ignorée aussi.
        TestDb::setEnv('DB_HOST', '');
        self::assertSame(7, DemoConfig::load()->perIpPerHour);
    }

    #[TestDox('UC-VIS-03-U07 — MockProvider : pôle demandé de la journée de fixture, kairos, texte générique ; tokens estimés')]
    public function testU07MockProviderAnswers(): void
    {
        $mock = new MockProvider();
        $pole = $mock->complete('ignoré', 'Système', 'Journée du 2026-01-06. Pôle 2 — COEUR. "poleNum": "2"', 100);
        $decoded = json_decode($pole['text'], true, 512, JSON_THROW_ON_ERROR);
        self::assertSame('2', $decoded['poleNum']);
        self::assertSame('mock', $pole['model']);
        self::assertSame((int) ceil(mb_strlen('Système' . 'Journée du 2026-01-06. Pôle 2 — COEUR. "poleNum": "2"') / 3.6), $pole['usage']['inputTokens']);
        self::assertSame((int) ceil(mb_strlen($pole['text']) / 3.6), $pole['usage']['outputTokens']);
        $fixture = json_decode((string) file_get_contents(\dirname(__DIR__, 4) . '/schemas/fixtures/cartographie-jour-2026-01-06.json'), true);
        self::assertEquals($fixture['poles'][1], $decoded);

        $kairos = $mock->complete('m', null, 'SYNTHÈSE KAIROS — Pôle 1 — … 2026-01-05', 100);
        self::assertEquals(
            json_decode((string) file_get_contents(\dirname(__DIR__, 4) . '/schemas/fixtures/cartographie-jour-2026-01-05.json'), true)['kairos'],
            json_decode($kairos['text'], true),
        );
        self::assertStringStartsWith('Réponse simulée du fournisseur mock', $mock->complete('m', null, 'Bonjour', 10)['text']);
    }

    #[TestDox('UC-VIS-03-U08 — AnthropicProvider : modèle et plafond imposés, clé en en-tête seulement, erreurs amont typées')]
    public function testU08AnthropicProviderContract(): void
    {
        $http = new LlmFakeHttpClient();
        $http->queueResponse(['status' => 200, 'body' => json_encode([
            'model' => 'claude-haiku-4-5-20251001',
            'content' => [['type' => 'tool_use', 'input' => ['poleNum' => '1']]],
            'usage' => ['input_tokens' => 120, 'output_tokens' => 30],
            'stop_reason' => 'tool_use',
        ])]);
        $provider = new AnthropicProvider($http, 'sk-ant-secret', 5);

        $result = $provider->complete('claude-haiku-4-5-20251001', 'Consigne', 'Texte', 512);
        self::assertSame('{"poleNum":"1"}', $result['text']);
        self::assertSame(['inputTokens' => 120, 'outputTokens' => 30], $result['usage']);
        $sent = $http->requests[0];
        self::assertSame('https://api.anthropic.com/v1/messages', $sent['url']);
        self::assertSame('sk-ant-secret', $sent['headers']['x-api-key']);
        self::assertSame(5, $sent['timeout']);
        $payload = json_decode((string) $sent['body'], true);
        self::assertSame('claude-haiku-4-5-20251001', $payload['model']);
        self::assertSame(['type' => 'disabled'], $payload['thinking']);
        self::assertSame(512, $payload['max_tokens']);
        self::assertSame('Consigne', $payload['system']);
        self::assertSame('emettre_document', $payload['tool_choice']['name']);
        self::assertStringNotContainsString('sk-ant-secret', (string) $sent['body']);

        $http->queueResponse(['status' => 429, 'headers' => ['retry-after' => '40'], 'body' => '{"error":{"message":"rate limited"}}']);
        try {
            $provider->complete('m', null, 'p', 10);
            self::fail('429 attendu');
        } catch (UpstreamException $e) {
            self::assertSame(429, $e->status);
            self::assertSame('40', $e->retryAfter);
            self::assertStringNotContainsString('sk-ant-secret', $e->getMessage());
        }
        $http->queueException(new HttpClientException('timeout', true));
        $this->expectException(HttpClientException::class);
        $provider->complete('m', null, 'p', 10);
    }
}
