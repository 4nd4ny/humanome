<?php

declare(strict_types=1);

namespace Humanome\Tests\UseCases\Unit;

use Humanome\Llm\AnthropicProvider;
use Humanome\Llm\Pricing;
use Humanome\Llm\UsageCounters;
use Humanome\MigrationRunner;
use Humanome\Tests\LlmFakeHttpClient;
use Humanome\Tests\TestDb;
use PDO;
use PHPUnit\Framework\Attributes\TestDox;
use PHPUnit\Framework\TestCase;

/**
 * UC-VIS-05 — Interroger l'assistant tuteur : tests UNITAIRES.
 *
 * Fiche : docs/cas-utilisation/visiteur/UC-VIS-05-interroger-assistant-tuteur.md
 *
 * Services sollicités par POST /api/tuteur, appelés directement : compteurs
 * journaliers DÉDIÉS (table tuteur_usage_daily, migration 020), fournisseur
 * Anthropic en mode PROSE (pas d'outil JSON forcé), tarification du modèle du
 * tuteur (le plafond en dollars doit pouvoir se déclencher).
 */
final class UcVis05InterrogerTuteurTest extends TestCase
{
    private static PDO $pdo;

    public static function setUpBeforeClass(): void
    {
        self::$pdo = TestDb::fresh();
        (new MigrationRunner(self::$pdo, MigrationRunner::defaultMigrationsDir()))->run();
    }

    protected function setUp(): void
    {
        self::$pdo->exec('DELETE FROM tuteur_usage_daily');
        self::$pdo->exec('DELETE FROM llm_usage_daily');
    }

    #[TestDox('UC-VIS-05-U01 — migration 020 : table tuteur_usage_daily de COMPTEURS seuls, une ligne par jour')]
    public function testU01Migration020CreatesCounterOnlyTable(): void
    {
        $columns = self::$pdo->query(
            "SELECT COLUMN_NAME FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tuteur_usage_daily' ORDER BY ORDINAL_POSITION"
        )->fetchAll(PDO::FETCH_COLUMN);
        self::assertSame(['usage_date', 'requests', 'input_tokens', 'output_tokens', 'estimated_cost_usd'], $columns);
        $key = self::$pdo->query(
            "SELECT COLUMN_NAME FROM information_schema.KEY_COLUMN_USAGE
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tuteur_usage_daily' AND CONSTRAINT_NAME = 'PRIMARY'"
        )->fetchAll(PDO::FETCH_COLUMN);
        self::assertSame(['usage_date'], $key, 'aucune colonne utilisateur, IP ou contenu');
    }

    #[TestDox('UC-VIS-05-U02 — compteurs du tuteur : budget propre (1 $/jour par défaut), sans effet sur ceux de la démo')]
    public function testU02DedicatedCountersAndBudget(): void
    {
        $tuteur = new UsageCounters(self::$pdo, 'tuteur_usage_daily');
        $demo = new UsageCounters(self::$pdo);
        $day = gmmktime(10, 0, 0, 5, 4, 2026);

        $tuteur->record(1200, 300, 0.6, $day);
        self::assertFalse($tuteur->isExhausted(2_000_000, 1.0, $day));
        $tuteur->record(1200, 300, 0.6, $day);
        self::assertTrue($tuteur->isExhausted(2_000_000, 1.0, $day), '1,2 $ ≥ 1 $');
        self::assertSame(2, $tuteur->today($day)['requests']);
        self::assertSame(0, $demo->today($day)['requests']);
        self::assertFalse($demo->isExhausted(2_000_000, 5.0, $day), 'la démo n’est pas coupée par le tuteur');
    }

    #[TestDox('UC-VIS-05-U03 — AnthropicProvider en mode prose : aucun outil JSON forcé, texte des blocs concaténé')]
    public function testU03ProviderInProseMode(): void
    {
        $http = new LlmFakeHttpClient();
        $http->queueResponse(['status' => 200, 'body' => json_encode([
            'model' => 'claude-haiku-4-5-20251001',
            'content' => [['type' => 'text', 'text' => 'Ouvrez #/essayer '], ['type' => 'text', 'text' => 'pour commencer.']],
            'usage' => ['input_tokens' => 800, 'output_tokens' => 40],
            'stop_reason' => 'end_turn',
        ])]);

        $result = (new AnthropicProvider($http, 'sk-test'))->complete('claude-haiku-4-5-20251001', 'Consigne tuteur', 'Par où commencer ?', 600, false);

        self::assertSame('Ouvrez #/essayer pour commencer.', $result['text']);
        $payload = json_decode((string) $http->requests[0]['body'], true);
        self::assertArrayNotHasKey('tools', $payload);
        self::assertArrayNotHasKey('tool_choice', $payload);
        self::assertSame(600, $payload['max_tokens']);
        self::assertSame('Consigne tuteur', $payload['system']);
        self::assertSame([['role' => 'user', 'content' => 'Par où commencer ?']], $payload['messages']);
    }

    #[TestDox('UC-VIS-05-U04 — le modèle par défaut du tuteur est tarifé : le plafond en dollars peut réellement couper')]
    public function testU04DefaultTutorModelIsPriced(): void
    {
        // Réponse courte typique : ~3 000 tokens d'entrée (consigne + digest), 600 de sortie.
        $perAnswer = Pricing::estimateUsd('claude-haiku-4-5-20251001', 3000, 600);
        self::assertEqualsWithDelta(0.006, $perAnswer, 1e-9);
        self::assertLessThan(200, (int) ceil(1.0 / $perAnswer), 'moins de 200 réponses de ce gabarit par jour à 1 $');
        self::assertSame(0.0, Pricing::estimateUsd('mock', 3000, 600), 'le mock ne consomme pas le budget');
    }
}
