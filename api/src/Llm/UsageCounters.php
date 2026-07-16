<?php

declare(strict_types=1);

namespace Humanome\Llm;

use PDO;

/**
 * Global daily usage counters over `llm_usage_daily` (migration 006).
 * COUNTERS ONLY — never any content, never any per-user data (cahier §6.5).
 * The day boundary is UTC (matches the "revenez demain" message semantics
 * regardless of server locale).
 */
final class UsageCounters
{
    /**
     * @param string $table compteurs de la démo publique (défaut, inchangé) ou
     *   d'un autre proxy à budget propre — ex. `tuteur_usage_daily` (D9). Valeur
     *   d'une allowlist codée en dur : jamais une entrée client.
     */
    public function __construct(
        private readonly PDO $pdo,
        private readonly string $table = 'llm_usage_daily',
    ) {
        if (!\in_array($this->table, ['llm_usage_daily', 'tuteur_usage_daily'], true)) {
            throw new \InvalidArgumentException('UsageCounters: table inconnue');
        }
    }

    /** @return array{requests: int, inputTokens: int, outputTokens: int, estimatedCostUsd: float} */
    public function today(?int $now = null): array
    {
        $stmt = $this->pdo->prepare(
            "SELECT requests, input_tokens, output_tokens, estimated_cost_usd
             FROM {$this->table} WHERE usage_date = ?"
        );
        $stmt->execute([self::day($now)]);
        $row = $stmt->fetch();

        return [
            'requests' => (int) ($row['requests'] ?? 0),
            'inputTokens' => (int) ($row['input_tokens'] ?? 0),
            'outputTokens' => (int) ($row['output_tokens'] ?? 0),
            'estimatedCostUsd' => (float) ($row['estimated_cost_usd'] ?? 0.0),
        ];
    }

    /** Atomic increment (INSERT ... ON DUPLICATE KEY UPDATE). */
    public function record(int $inputTokens, int $outputTokens, float $estimatedCostUsd, ?int $now = null): void
    {
        $this->pdo->prepare(
            "INSERT INTO {$this->table} (usage_date, requests, input_tokens, output_tokens, estimated_cost_usd)
             VALUES (?, 1, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
                requests = requests + 1,
                input_tokens = input_tokens + VALUES(input_tokens),
                output_tokens = output_tokens + VALUES(output_tokens),
                estimated_cost_usd = estimated_cost_usd + VALUES(estimated_cost_usd)"
        )->execute([self::day($now), $inputTokens, $outputTokens, $estimatedCostUsd]);
    }

    /** True when a daily cap (tokens or budget) is already reached. */
    public function isExhausted(int $dailyGlobalTokens, float $dailyBudgetUsd, ?int $now = null): bool
    {
        $today = $this->today($now);

        return ($today['inputTokens'] + $today['outputTokens']) >= $dailyGlobalTokens
            || $today['estimatedCostUsd'] >= $dailyBudgetUsd;
    }

    private static function day(?int $now): string
    {
        return gmdate('Y-m-d', $now ?? time());
    }
}
