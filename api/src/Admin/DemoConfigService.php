<?php

declare(strict_types=1);

namespace Humanome\Admin;

use Humanome\Auth\Audit;
use Humanome\Env;
use Humanome\Llm\DemoConfig;
use Humanome\Packages\SettingsRepository;
use PDO;

/**
 * Admin editing of the public-demo settings (chantier A, item 2): the
 * overrides live in settings["demo_overrides"] and win over env/file
 * (DemoConfig precedence: base > env > fichier > defaut), so a change made
 * from the admin UI — typically flipping `enabled` from a phone right before
 * or after a presentation — takes effect on the very next demo request,
 * without any redeploy.
 *
 * What is NOT editable here, on purpose:
 *   - provider: the demo always runs on the platform Anthropic key
 *     ('mock' is dev-only); switching providers from a web UI would be a
 *     budget/security foot-gun.
 *   - ANTHROPIC_API_KEY: env only, never stored in the database, never
 *     returned by any endpoint (read() only exposes a boolean).
 */
final class DemoConfigService
{
    /**
     * Known Anthropic model ids proposed by the UI (a dropdown). The UI also
     * offers a free-text "autre…" entry, so this list is a convenience, not
     * a hard whitelist — a new model id can be used the day it ships.
     */
    public const ALLOWED_MODELS = [
        'claude-haiku-4-5-20251001',
        'claude-haiku-4-5',
        'claude-sonnet-4-6',
        'claude-sonnet-5',
        'claude-opus-4-6',
        'claude-opus-4-7',
        'claude-opus-4-8',
    ];

    /** Integer fields: [min, max]. */
    private const INT_BOUNDS = [
        'maxTokensPerRequest' => [256, 16000],
        'maxInputChars' => [1000, 200000],
        'perIpPerHour' => [1, 1000],
        'dailyGlobalTokens' => [10000, 50000000],
        'powDifficultyBits' => [8, 24],
        'upstreamTimeoutSeconds' => [10, 300],
    ];

    /** Float fields: [min, max]. */
    private const FLOAT_BOUNDS = [
        'dailyBudgetUsd' => [0.0, 1000.0],
    ];

    /** Free-text model: sane shape, never empty (Anthropic ids). */
    private const MODEL_PATTERN = '/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/';

    public function __construct(private readonly PDO $pdo)
    {
    }

    /**
     * Effective values + per-field origin, for GET /api/admin/demo-config.
     *
     * @return array{effective: array<string, mixed>, sources: array<string, string>,
     *   allowedModels: list<string>, apiKeyConfigured: bool}
     */
    public function read(): array
    {
        $c = DemoConfig::load();

        return [
            'effective' => [
                'enabled' => $c->enabled,
                'provider' => $c->provider,
                'model' => $c->model,
                'maxTokensPerRequest' => $c->maxTokensPerRequest,
                'maxInputChars' => $c->maxInputChars,
                'perIpPerHour' => $c->perIpPerHour,
                'dailyGlobalTokens' => $c->dailyGlobalTokens,
                'dailyBudgetUsd' => $c->dailyBudgetUsd,
                'powDifficultyBits' => $c->powDifficultyBits,
                'upstreamTimeoutSeconds' => $c->upstreamTimeoutSeconds,
            ],
            'sources' => $c->sources,
            'allowedModels' => self::ALLOWED_MODELS,
            // Boolean only — the key value NEVER leaves the environment.
            'apiKeyConfigured' => Env::get('ANTHROPIC_API_KEY') !== '',
        ];
    }

    /**
     * Validate a partial patch and merge it into settings["demo_overrides"].
     *
     * @param array<string, mixed> $patch
     * @return array<string, mixed> the new read() payload
     */
    public function update(int $adminId, array $patch): array
    {
        if ($patch === []) {
            throw new AdminException('Aucun champ à modifier.', 422);
        }

        $clean = [];
        foreach ($patch as $field => $value) {
            $clean[(string) $field] = $this->validateField((string) $field, $value);
        }

        $settings = new SettingsRepository($this->pdo);
        $current = $settings->get(DemoConfig::OVERRIDES_KEY) ?? [];
        $settings->set(DemoConfig::OVERRIDES_KEY, array_merge($current, $clean));

        Audit::record($this->pdo, $adminId, 'demo_config_updated', ['fields' => array_keys($clean)]);

        return $this->read();
    }

    /**
     * Remove every override: back to env/file/defaults.
     *
     * @return array<string, mixed> the new read() payload
     */
    public function reset(int $adminId): array
    {
        (new SettingsRepository($this->pdo))->delete(DemoConfig::OVERRIDES_KEY);

        Audit::record($this->pdo, $adminId, 'demo_config_reset', []);

        return $this->read();
    }

    /** @return bool|int|float|string the normalised value */
    private function validateField(string $field, mixed $value): bool|int|float|string
    {
        if (!\in_array($field, DemoConfig::OVERRIDABLE_FIELDS, true)) {
            throw new AdminException(
                $field === 'provider'
                    ? 'Le fournisseur n’est pas modifiable : la démo utilise la clé plateforme Anthropic.'
                    : 'Champ inconnu : ' . $field,
                422,
            );
        }

        if ($field === 'enabled') {
            if (!\is_bool($value)) {
                throw new AdminException('enabled doit être un booléen.', 422);
            }

            return $value;
        }

        if ($field === 'model') {
            if (!\is_string($value) || trim($value) === '') {
                throw new AdminException('Le modèle ne peut pas être vide.', 422);
            }
            $model = trim($value);
            if (preg_match(self::MODEL_PATTERN, $model) !== 1) {
                throw new AdminException('Identifiant de modèle invalide (lettres, chiffres, points et tirets).', 422);
            }

            return $model;
        }

        if (isset(self::INT_BOUNDS[$field])) {
            [$min, $max] = self::INT_BOUNDS[$field];
            if (!\is_int($value)) {
                throw new AdminException(sprintf('%s doit être un entier.', $field), 422);
            }
            if ($value < $min || $value > $max) {
                throw new AdminException(sprintf('%s doit être compris entre %d et %d.', $field, $min, $max), 422);
            }

            return $value;
        }

        // dailyBudgetUsd (float bounds)
        [$min, $max] = self::FLOAT_BOUNDS[$field];
        if (!\is_float($value) && !\is_int($value)) {
            throw new AdminException(sprintf('%s doit être un nombre.', $field), 422);
        }
        $number = (float) $value;
        if (!is_finite($number) || $number < $min || $number > $max) {
            throw new AdminException(sprintf('%s doit être compris entre %.0f et %.0f.', $field, $min, $max), 422);
        }

        return $number;
    }
}
