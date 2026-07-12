<?php

declare(strict_types=1);

namespace Humanome\Llm;

use Humanome\Env;

/**
 * Admin configuration of the public demo (cahier §3.8): api/config/demo.php
 * overridden by environment variables (DEMO_*). See that file for the full
 * documentation of every key.
 */
final class DemoConfig
{
    private function __construct(
        public readonly bool $enabled,
        public readonly string $provider,
        public readonly string $model,
        public readonly int $maxTokensPerRequest,
        public readonly int $maxInputChars,
        public readonly int $perIpPerHour,
        public readonly int $dailyGlobalTokens,
        public readonly float $dailyBudgetUsd,
        public readonly int $powDifficultyBits,
        public readonly int $upstreamTimeoutSeconds,
    ) {
    }

    public static function load(): self
    {
        $file = self::configFile();
        /** @var array<string, mixed> $raw */
        $raw = is_file($file) ? (require $file) : [];

        return new self(
            enabled: self::boolValue('DEMO_ENABLED', (bool) ($raw['enabled'] ?? true)),
            provider: self::stringValue('DEMO_PROVIDER', (string) ($raw['provider'] ?? 'anthropic')),
            model: self::stringValue('DEMO_MODEL', (string) ($raw['model'] ?? 'claude-haiku-4-5-20251001')),
            maxTokensPerRequest: self::intValue('DEMO_MAX_TOKENS_PER_REQUEST', (int) ($raw['maxTokensPerRequest'] ?? 2048)),
            maxInputChars: self::intValue('DEMO_MAX_INPUT_CHARS', (int) ($raw['maxInputChars'] ?? 20000)),
            perIpPerHour: self::intValue('DEMO_PER_IP_PER_HOUR', (int) ($raw['perIpPerHour'] ?? 20)),
            dailyGlobalTokens: self::intValue('DEMO_DAILY_GLOBAL_TOKENS', (int) ($raw['dailyGlobalTokens'] ?? 2000000)),
            dailyBudgetUsd: self::floatValue('DEMO_DAILY_BUDGET_USD', (float) ($raw['dailyBudgetUsd'] ?? 5.0)),
            powDifficultyBits: self::intValue('DEMO_POW_DIFFICULTY_BITS', (int) ($raw['powDifficultyBits'] ?? 20)),
            upstreamTimeoutSeconds: self::intValue('DEMO_UPSTREAM_TIMEOUT', (int) ($raw['upstreamTimeoutSeconds'] ?? 60)),
        );
    }

    /** Repo layout: api/src/Llm -> api/config; release layout is identical. */
    private static function configFile(): string
    {
        return \dirname(__DIR__, 2) . '/config/demo.php';
    }

    private static function stringValue(string $env, string $default): string
    {
        $value = Env::get($env);

        return $value !== '' ? $value : $default;
    }

    private static function intValue(string $env, int $default): int
    {
        $value = Env::get($env);

        return $value !== '' && is_numeric($value) ? (int) $value : $default;
    }

    private static function floatValue(string $env, float $default): float
    {
        $value = Env::get($env);

        return $value !== '' && is_numeric($value) ? (float) $value : $default;
    }

    private static function boolValue(string $env, bool $default): bool
    {
        $value = strtolower(Env::get($env));
        if ($value === '') {
            return $default;
        }

        return !\in_array($value, ['0', 'false', 'off', 'no'], true);
    }
}
