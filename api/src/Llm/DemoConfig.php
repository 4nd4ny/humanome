<?php

declare(strict_types=1);

namespace Humanome\Llm;

use Humanome\Db;
use Humanome\Env;
use Humanome\Packages\SettingsRepository;

/**
 * Admin configuration of the public demo (cahier §3.8).
 *
 * Precedence, highest first (see api/config/demo.php for the documentation
 * of every key):
 *
 *   1. base     — settings["demo_overrides"] (JSON), edited live from the
 *                 admin UI (#/admin/reglages, PUT /api/admin/demo-config).
 *                 Immediate effect, no redeploy. FAIL-SAFE: if the database
 *                 is not configured or unreachable, this layer is silently
 *                 skipped and the demo keeps running on env/file values.
 *   2. env      — DEMO_* environment variables (~/app/shared/.env in prod).
 *   3. fichier  — api/config/demo.php.
 *   4. defaut   — coded defaults below.
 *
 * `provider` is NEVER overridable from the database: the demo runs on the
 * platform Anthropic key (ANTHROPIC_API_KEY, env only — never stored in the
 * database, never exposed), and 'mock' is a dev-only mode that must not be
 * switchable from a web UI. The API key itself follows the same rule.
 */
final class DemoConfig
{
    /** settings table key holding the admin overrides (JSON object). */
    public const OVERRIDES_KEY = 'demo_overrides';

    /** Fields the admin UI may override in the database (NOT provider). */
    public const OVERRIDABLE_FIELDS = [
        'enabled',
        'model',
        'maxTokensPerRequest',
        'maxInputChars',
        'perIpPerHour',
        'dailyGlobalTokens',
        'dailyBudgetUsd',
        'powDifficultyBits',
        'upstreamTimeoutSeconds',
    ];

    /**
     * @param array<string, string> $sources per-field origin of the
     *   effective value: 'base' | 'env' | 'fichier' | 'defaut'
     */
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
        public readonly array $sources = [],
    ) {
    }

    public static function load(): self
    {
        $file = self::configFile();
        /** @var array<string, mixed> $raw */
        $raw = is_file($file) ? (require $file) : [];
        $base = self::databaseOverrides();

        $sources = [];
        $bool = function (string $field, string $env, bool $default) use ($raw, $base, &$sources): bool {
            if (\array_key_exists($field, $base) && \is_bool($base[$field])) {
                $sources[$field] = 'base';

                return $base[$field];
            }

            return self::envBool($env, $raw, $field, $default, $sources);
        };
        $string = function (string $field, string $env, string $default) use ($raw, $base, &$sources): string {
            if (\array_key_exists($field, $base) && \is_string($base[$field]) && $base[$field] !== '') {
                $sources[$field] = 'base';

                return $base[$field];
            }

            return self::envString($env, $raw, $field, $default, $sources);
        };
        $int = function (string $field, string $env, int $default) use ($raw, $base, &$sources): int {
            if (\array_key_exists($field, $base) && \is_int($base[$field])) {
                $sources[$field] = 'base';

                return $base[$field];
            }

            return self::envInt($env, $raw, $field, $default, $sources);
        };
        $float = function (string $field, string $env, float $default) use ($raw, $base, &$sources): float {
            if (\array_key_exists($field, $base) && (\is_float($base[$field]) || \is_int($base[$field]))) {
                $sources[$field] = 'base';

                return (float) $base[$field];
            }

            return self::envFloat($env, $raw, $field, $default, $sources);
        };

        return new self(
            enabled: $bool('enabled', 'DEMO_ENABLED', true),
            // provider: env > fichier > defaut ONLY (never from the database).
            provider: self::envString('DEMO_PROVIDER', $raw, 'provider', 'anthropic', $sources),
            model: $string('model', 'DEMO_MODEL', 'claude-haiku-4-5-20251001'),
            maxTokensPerRequest: $int('maxTokensPerRequest', 'DEMO_MAX_TOKENS_PER_REQUEST', 2048),
            maxInputChars: $int('maxInputChars', 'DEMO_MAX_INPUT_CHARS', 20000),
            perIpPerHour: $int('perIpPerHour', 'DEMO_PER_IP_PER_HOUR', 20),
            dailyGlobalTokens: $int('dailyGlobalTokens', 'DEMO_DAILY_GLOBAL_TOKENS', 2000000),
            dailyBudgetUsd: $float('dailyBudgetUsd', 'DEMO_DAILY_BUDGET_USD', 5.0),
            powDifficultyBits: $int('powDifficultyBits', 'DEMO_POW_DIFFICULTY_BITS', 20),
            upstreamTimeoutSeconds: $int('upstreamTimeoutSeconds', 'DEMO_UPSTREAM_TIMEOUT', 60),
            sources: $sources,
        );
    }

    /**
     * Admin overrides stored in settings["demo_overrides"]. Fail-safe by
     * design: any database problem (not configured, connection refused,
     * missing table mid-migration) silently degrades to env/file values so
     * the demo endpoint never 500s because of this layer.
     *
     * @return array<string, mixed>
     */
    private static function databaseOverrides(): array
    {
        if (!Db::isConfigured()) {
            return [];
        }
        try {
            $stored = (new SettingsRepository(Db::get()))->get(self::OVERRIDES_KEY);
        } catch (\Throwable $e) {
            error_log('[demo-config] overrides unavailable, falling back to env/file: ' . $e->getMessage());

            return [];
        }

        return \is_array($stored) ? $stored : [];
    }

    /** Repo layout: api/src/Llm -> api/config; release layout is identical. */
    private static function configFile(): string
    {
        return \dirname(__DIR__, 2) . '/config/demo.php';
    }

    /** @param array<string, mixed> $raw @param array<string, string> $sources */
    private static function envString(string $env, array $raw, string $field, string $default, array &$sources): string
    {
        $value = Env::get($env);
        if ($value !== '') {
            $sources[$field] = 'env';

            return $value;
        }
        if (\array_key_exists($field, $raw)) {
            $sources[$field] = 'fichier';

            return (string) $raw[$field];
        }
        $sources[$field] = 'defaut';

        return $default;
    }

    /** @param array<string, mixed> $raw @param array<string, string> $sources */
    private static function envInt(string $env, array $raw, string $field, int $default, array &$sources): int
    {
        $value = Env::get($env);
        if ($value !== '' && is_numeric($value)) {
            $sources[$field] = 'env';

            return (int) $value;
        }
        if (\array_key_exists($field, $raw)) {
            $sources[$field] = 'fichier';

            return (int) $raw[$field];
        }
        $sources[$field] = 'defaut';

        return $default;
    }

    /** @param array<string, mixed> $raw @param array<string, string> $sources */
    private static function envFloat(string $env, array $raw, string $field, float $default, array &$sources): float
    {
        $value = Env::get($env);
        if ($value !== '' && is_numeric($value)) {
            $sources[$field] = 'env';

            return (float) $value;
        }
        if (\array_key_exists($field, $raw)) {
            $sources[$field] = 'fichier';

            return (float) $raw[$field];
        }
        $sources[$field] = 'defaut';

        return $default;
    }

    /** @param array<string, mixed> $raw @param array<string, string> $sources */
    private static function envBool(string $env, array $raw, string $field, bool $default, array &$sources): bool
    {
        $value = strtolower(Env::get($env));
        if ($value !== '') {
            $sources[$field] = 'env';

            return !\in_array($value, ['0', 'false', 'off', 'no'], true);
        }
        if (\array_key_exists($field, $raw)) {
            $sources[$field] = 'fichier';

            return (bool) $raw[$field];
        }
        $sources[$field] = 'defaut';

        return $default;
    }
}
