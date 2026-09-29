<?php

declare(strict_types=1);

namespace Humanome\Tests\UseCases\Unit;

use Humanome\Llm\MockProvider;
use Humanome\Llm\PowChallenge;
use Humanome\Llm\Pricing;
use Humanome\Llm\UsageCounters;
use Humanome\MigrationRunner;
use Humanome\Packages\PromptPackageRepository;
use Humanome\Packages\SettingsRepository;
use Humanome\Tests\TestDb;
use PDO;
use PHPUnit\Framework\Attributes\TestDox;
use PHPUnit\Framework\TestCase;

/**
 * UC-APP-02 — Lancer une cartographie standard : tests UNITAIRES (API).
 *
 * Fiche : docs/cas-utilisation/apprenant/UC-APP-02-lancer-cartographie-standard.md
 *
 * Le run s'exécute dans le navigateur (ADR-001) ; le serveur n'intervient
 * qu'à deux étapes, dont les classes sont appelées ici directement :
 * versions de prompt proposées (PromptPackageRepository, SettingsRepository)
 * et « Service humanome » (PowChallenge, MockProvider, UsageCounters, Pricing).
 */
final class UcApp02LancerCartographieStandardTest extends TestCase
{
    private static PDO $pdo;

    public static function setUpBeforeClass(): void
    {
        self::$pdo = TestDb::fresh();
        (new MigrationRunner(self::$pdo, MigrationRunner::defaultMigrationsDir()))->run();
    }

    protected function setUp(): void
    {
        self::$pdo->exec('DELETE FROM prompt_packages');
        self::$pdo->exec('DELETE FROM settings');
        self::$pdo->exec('DELETE FROM llm_usage_daily');
    }

    /** @return array<string, mixed> fixture prompt-package (aurora-demo 1.0.0) */
    private static function packageDoc(array $overrides = []): array
    {
        $path = \dirname(__DIR__, 4) . '/schemas/fixtures/prompt-package-exemple.json';

        return array_merge(json_decode((string) file_get_contents($path), true, 512, JSON_THROW_ON_ERROR), $overrides);
    }

    #[TestDox('UC-APP-02-U22 — PowChallenge : défi signé à usage unique, 5 min ; nonce faible, expiré ou falsifié refusé')]
    public function testU22ProofOfWorkChallenge(): void
    {
        $pow = new PowChallenge('secret-de-test', 8);
        $now = 1_800_000_000;
        $issued = $pow->issue($now);

        self::assertMatchesRegularExpression('/^v1\.1800000300\.[0-9a-f]{16}\.[0-9a-f]{64}$/', $issued['challenge']);
        self::assertSame(['difficultyBits' => 8, 'expiresAt' => $now + 300], array_slice($issued, 1));

        $good = $weak = null;
        for ($n = 0; $good === null || $weak === null; $n++) {
            $bits = PowChallenge::leadingZeroBits(hash('sha256', $issued['challenge'] . ':' . $n));
            if ($bits >= 8) {
                $good ??= (string) $n;
            } else {
                $weak ??= (string) $n;
            }
        }
        self::assertSame(PowChallenge::OK, $pow->verify($issued['challenge'], $good, $now));
        self::assertSame(PowChallenge::WEAK, $pow->verify($issued['challenge'], $weak, $now));
        self::assertSame(PowChallenge::EXPIRED, $pow->verify($issued['challenge'], $good, $now + 301));
        self::assertSame(PowChallenge::INVALID, (new PowChallenge('autre-secret', 8))->verify($issued['challenge'], $good, $now));
    }

    #[TestDox('UC-APP-02-U23 — MockProvider : prompt de pôle ou de kairos d’une journée → JSON de la fixture de ce jour')]
    public function testU23MockProviderAnswersEnginePrompts(): void
    {
        $mock = new MockProvider();
        $fixture = json_decode((string) file_get_contents(\dirname(__DIR__, 4) . '/schemas/fixtures/cartographie-jour-2026-01-06.json'), true);

        $pole = $mock->complete('demo', null, "# Pôle 3 — Communiquer\nJournée (2026-01-06) : atelier.", 8192);
        self::assertSame('mock', $pole['model']);
        self::assertEquals($fixture['poles'][2], json_decode($pole['text'], true));
        self::assertSame((int) ceil(mb_strlen("# Pôle 3 — Communiquer\nJournée (2026-01-06) : atelier.") / 3.6), $pole['usage']['inputTokens']);

        $kairos = $mock->complete('demo', null, "SYNTHÈSE KAIROS de la journée (2026-01-06)\n# Pôle 1 — …", 8192);
        self::assertEquals($fixture['kairos'], json_decode($kairos['text'], true));
    }

    #[TestDox('UC-APP-02-U24 — compteurs journaliers : requêtes, tokens et coût estimé seulement ; disjoncteur tokens ou budget')]
    public function testU24UsageCountersAndPricing(): void
    {
        self::assertSame(0.0, Pricing::estimateUsd('mock', 1000, 1000));
        self::assertEqualsWithDelta(0.006, Pricing::estimateUsd('claude-haiku-4-5-20251001', 1000, 1000), 1e-9);
        self::assertEqualsWithDelta(0.03, Pricing::estimateUsd('modele-inconnu', 1000, 1000), 1e-9, 'tarif par défaut prudent');

        $counters = new UsageCounters(self::$pdo);
        $now = 1_800_000_000;
        $counters->record(1200, 300, Pricing::estimateUsd('claude-haiku-4-5', 1200, 300), $now);
        $counters->record(800, 200, Pricing::estimateUsd('claude-haiku-4-5', 800, 200), $now);

        $today = $counters->today($now);
        self::assertSame(2, $today['requests']);
        self::assertSame(2000, $today['inputTokens']);
        self::assertSame(500, $today['outputTokens']);
        self::assertEqualsWithDelta(0.0045, $today['estimatedCostUsd'], 1e-6);
        self::assertFalse($counters->isExhausted(10000, 5.0, $now));
        self::assertTrue($counters->isExhausted(2500, 5.0, $now), 'plafond de tokens atteint');
        self::assertTrue($counters->isExhausted(10000, 0.004, $now), 'plafond de budget atteint');
        self::assertSame(0, $counters->today($now + 86400)['requests'], 'nouveau jour UTC');

        $columns = self::$pdo->query('SHOW COLUMNS FROM llm_usage_daily')->fetchAll(PDO::FETCH_COLUMN);
        self::assertEqualsCanonicalizing(
            ['usage_date', 'requests', 'input_tokens', 'output_tokens', 'estimated_cost_usd'],
            $columns,
            'aucune colonne de contenu (§6.5)',
        );
    }

    #[TestDox('UC-APP-02-U25 — dépôts : versions publiées et publiques seulement ; dernière publiée tous paquets confondus ; lecture/écriture du réglage par défaut')]
    public function testU25PublishedPackagesAndDefault(): void
    {
        $repo = new PromptPackageRepository(self::$pdo);
        $repo->importPublishedDocument(self::packageDoc());
        $repo->importPublishedDocument(self::packageDoc(['id' => 'aurora-lab', 'version' => '2.0.0']));
        $repo->importPublishedDocument(self::packageDoc(['id' => 'golden-prive', 'version' => '9.0.0']));
        self::$pdo->exec("UPDATE prompt_packages SET is_private = 1 WHERE slug = 'golden-prive'");

        self::assertSame(
            [['aurora-demo', '1.0.0'], ['aurora-lab', '2.0.0']],
            array_map(static fn (array $p): array => [$p['id'], $p['version']], $repo->listPublished()),
        );
        self::assertSame(['id' => 'aurora-lab', 'version' => '2.0.0'], $repo->latestPublishedAnyPackage());
        self::assertNull($repo->findPublished('golden-prive', '9.0.0'), 'Golden Prompt jamais servi');
        self::assertSame('prompt-package', $repo->findPublished('aurora-demo', '1.0.0')['kind']);

        $settings = new SettingsRepository(self::$pdo);
        self::assertNull($settings->get(SettingsRepository::DEFAULT_PACKAGE));
        $settings->set(SettingsRepository::DEFAULT_PACKAGE, ['id' => 'aurora-demo', 'version' => '1.0.0']);
        // Document JSON relu en base : l'ordre des clés n'est pas garanti.
        self::assertEquals(['id' => 'aurora-demo', 'version' => '1.0.0'], $settings->get(SettingsRepository::DEFAULT_PACKAGE));
        // La DÉCISION « réglage, sinon la plus récente » vit dans la route
        // GET /api/prompt-packages/default : elle est testée par F14.
    }
}
