<?php

declare(strict_types=1);

namespace Humanome\Llm;

/**
 * Rough USD cost estimation for the daily budget circuit breaker
 * (api/config/demo.php: dailyBudgetUsd). Prices in USD per million tokens,
 * longest model-id prefix wins; unknown models fall back to a conservative
 * (expensive) default so the breaker errs on the safe side.
 *
 * Mirrors engine/src/providers/estimate.js (MODEL_PRICING_USD_PER_MTOK).
 */
final class Pricing
{
    /** @var array<string, array{0: float, 1: float}> [input, output] USD/MTok */
    private const USD_PER_MTOK = [
        'claude-haiku-4-5' => [1.0, 5.0],
        'claude-sonnet' => [3.0, 15.0],
        'claude-opus' => [5.0, 25.0],
        'mock' => [0.0, 0.0],
    ];

    private const DEFAULT_USD_PER_MTOK = [5.0, 25.0];

    public static function estimateUsd(string $model, int $inputTokens, int $outputTokens): float
    {
        [$in, $out] = self::rates($model);

        return ($inputTokens * $in + $outputTokens * $out) / 1_000_000;
    }

    /** @return array{0: float, 1: float} */
    private static function rates(string $model): array
    {
        $best = null;
        $bestLen = -1;
        foreach (self::USD_PER_MTOK as $prefix => $rates) {
            if (str_starts_with($model, $prefix) && \strlen($prefix) > $bestLen) {
                $best = $rates;
                $bestLen = \strlen($prefix);
            }
        }

        return $best ?? self::DEFAULT_USD_PER_MTOK;
    }
}
