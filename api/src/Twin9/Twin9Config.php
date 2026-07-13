<?php

declare(strict_types=1);

namespace Humanome\Twin9;

use Humanome\Env;
use Humanome\Packages\SettingsRepository;

/**
 * Twin_v9 platform configuration, persisted as JSON in the `settings` table
 * (key 'twin9_config', SettingsRepository) — ADR-010 §3/§6.
 *
 * Shape (all keys optional in storage, defaults below):
 *   marge     float, margin multiplier applied to Anthropic list prices (1..5)
 *   packs     list of {montant_usd (1..100), libelle} PayPal top-up offers
 *   modeles   map model_id => {prix_usd_mtok: [in, out] (>0), etages: subset
 *             of {taggers, rapide, tribunal}}
 *   enabled   bool — false until the templates have been imported
 *   appels_par_minute  int, per-user rate limit of POST /api/twin9/appel
 *             (1..600, default 30 — T3b)
 *   pipeline  free-form Twin_v9 protocol settings imported from config.json
 *             (seuils_consensus, jury, juge_leger, merge, scan_global) — the
 *             ALGORITHM's knobs, not secret (ADR-010 §2 residual), consumed
 *             by the JS engine.
 *
 * publicView() is the ONLY shape the front ever sees: prices WITH margin
 * applied (the raw list price and the margin stay admin-only).
 */
final class Twin9Config
{
    public const SETTING_KEY = 'twin9_config';

    public const ETAGES = ['taggers', 'rapide', 'tribunal'];

    private const MARGE_MIN = 1.0;
    private const MARGE_MAX = 5.0;
    private const PACK_MIN_USD = 1.0;
    private const PACK_MAX_USD = 100.0;

    public function __construct(private readonly SettingsRepository $settings)
    {
    }

    /** @return array<string, mixed> */
    public static function defaults(): array
    {
        return [
            // Owner decision (2026-07-13): +10 % over Anthropic list prices —
            // covers the PayPal fees and contributes to the OVH hosting, the
            // domain, and the Haiku budget of the free public demo. NOTE the
            // PayPal FIXED fee (≈ 0.30-0.49 USD per capture) weighs ~9 % of a
            // 5 USD pack on its own: small packs barely break even, which is
            // why the default packs start at 10 USD (see 'packs' below).
            'marge' => 1.1,
            'packs' => [
                ['montant_usd' => 10, 'libelle' => 'Pack découverte — 10 $'],
                ['montant_usd' => 20, 'libelle' => 'Pack standard — 20 $'],
                ['montant_usd' => 50, 'libelle' => 'Pack intensif — 50 $'],
            ],
            'modeles' => [
                'claude-haiku-4-5-20251001' => [
                    'prix_usd_mtok' => [1, 5],
                    'etages' => ['taggers', 'rapide'],
                ],
                'claude-sonnet-5' => [
                    'prix_usd_mtok' => [3, 15],
                    'etages' => ['taggers', 'rapide', 'tribunal'],
                ],
                'claude-opus-4-8' => [
                    'prix_usd_mtok' => [5, 25],
                    'etages' => ['tribunal'],
                ],
            ],
            'enabled' => false,
            'appels_par_minute' => 30,
            'pipeline' => [],
        ];
    }

    /**
     * Effective configuration: stored values over defaults (admin view).
     *
     * @return array<string, mixed>
     */
    public function read(): array
    {
        $stored = $this->settings->get(self::SETTING_KEY) ?? [];

        return array_merge(self::defaults(), array_intersect_key(
            $stored,
            self::defaults(),
        ));
    }

    /**
     * Validate and persist a partial update (unknown keys rejected, bounds
     * enforced — Twin9Exception 422 in French on any violation).
     *
     * @param array<string, mixed> $partial
     * @return array<string, mixed> the new effective configuration
     */
    public function update(array $partial): array
    {
        $known = self::defaults();
        foreach (array_keys($partial) as $key) {
            if (!\array_key_exists($key, $known)) {
                throw new Twin9Exception('Clé de configuration inconnue : ' . (string) $key, 422);
            }
        }

        $next = array_merge($this->read(), $partial);
        self::validate($next);
        $this->settings->set(self::SETTING_KEY, $next);

        return $next;
    }

    public function isEnabled(): bool
    {
        return (bool) $this->read()['enabled'];
    }

    public function setEnabled(bool $enabled): void
    {
        $this->update(['enabled' => $enabled]);
    }

    public function marge(): float
    {
        return (float) $this->read()['marge'];
    }

    public function appelsParMinute(): int
    {
        return (int) $this->read()['appels_par_minute'];
    }

    /** @return list<array{montant_usd: float|int, libelle: string}> */
    public function packs(): array
    {
        return $this->read()['packs'];
    }

    /** @return array<string, array{prix_usd_mtok: array{float|int, float|int}, etages: list<string>}> */
    public function modeles(): array
    {
        return $this->read()['modeles'];
    }

    /** @return array<string, mixed> */
    public function pipeline(): array
    {
        return $this->read()['pipeline'];
    }

    /**
     * Charged price of one model in MICRO-USD per token [in, out] — list
     * price × margin, the number the CreditService debits with (T3b).
     * Null for a model absent from the offer.
     *
     * @return array{int, int}|null
     */
    public function prixMicrousdParToken(string $modelId): ?array
    {
        $config = $this->read();
        $modele = $config['modeles'][$modelId] ?? null;
        if (!\is_array($modele)) {
            return null;
        }
        [$in, $out] = $modele['prix_usd_mtok'];
        $marge = (float) $config['marge'];

        // USD per Mtok -> micro-USD per token: ×1e6 (micro) / 1e6 (Mtok) = ×1.
        return [
            (int) ceil((float) $in * $marge),
            (int) ceil((float) $out * $marge),
        ];
    }

    /**
     * REAL charged cost of one call in micro-USD (ADR-010 §3): real token
     * counts × list price × margin, each component rounded UP to the
     * micro-USD (never in the user's favour, never more than 2 micro-USD
     * above the exact figure — unlike prixMicrousdParToken(), which rounds
     * per token and would overbill fractional prices by up to 33 %).
     * USD/Mtok × tokens = micro-USD exactly (1e6/1e6). Null: unknown model.
     */
    public function coutMicrousd(string $modelId, int $tokensIn, int $tokensOut): ?int
    {
        $config = $this->read();
        $modele = $config['modeles'][$modelId] ?? null;
        if (!\is_array($modele)) {
            return null;
        }
        [$in, $out] = $modele['prix_usd_mtok'];
        $marge = (float) $config['marge'];

        return (int) ceil($tokensIn * (float) $in * $marge)
            + (int) ceil($tokensOut * (float) $out * $marge);
    }

    /**
     * LOW pre-call estimate in micro-USD for the balance pre-check (T3b):
     * prompt tokens estimated at chars/4 × input price × margin, rounded
     * DOWN (a low bound by design — the REAL debit happens after the call,
     * this figure only refuses obviously unfunded calls). Null: unknown model.
     */
    public function estimationBasseMicrousd(string $modelId, int $promptChars): ?int
    {
        $config = $this->read();
        $modele = $config['modeles'][$modelId] ?? null;
        if (!\is_array($modele)) {
            return null;
        }
        [$in] = $modele['prix_usd_mtok'];

        return (int) floor(intdiv($promptChars, 4) * (float) $in * (float) $config['marge']);
    }

    /**
     * WORST-CASE reservation in micro-USD, held atomically BEFORE the call
     * (security review finding A — closes the balance race + unbounded
     * overdraft). Over-estimates BOTH sides so the real cost can only be lower:
     *   - input tokens ≈ ceil(chars / 3) (denser than the chars/4 rule of
     *     thumb, to cover French/multibyte tokenization),
     *   - output tokens = max_tokens (the full ceiling the model may emit).
     * The route debits this conditionally (no overdraft → 402 if the balance
     * can't cover it), then reconciles down to the real cost after the call.
     * Null: unknown model.
     */
    public function reserveMicrousd(string $modelId, int $promptChars, int $maxTokens): ?int
    {
        $tokensIn = (int) ceil(max(0, $promptChars) / 3);

        return $this->coutMicrousd($modelId, $tokensIn, max(0, $maxTokens));
    }

    /**
     * The PUBLIC shape for the front (ADR-010 §3): model offer and prices
     * WITH margin applied, packs, enabled flag, PayPal availability. Neither
     * the raw list prices nor the margin itself ever leave the admin view.
     *
     * @return array<string, mixed>
     */
    public function publicView(): array
    {
        $config = $this->read();
        $marge = (float) $config['marge'];

        $modeles = [];
        foreach ($config['modeles'] as $modelId => $modele) {
            [$in, $out] = $modele['prix_usd_mtok'];
            $modeles[$modelId] = [
                'etages' => $modele['etages'],
                'prix_usd_mtok' => [
                    round((float) $in * $marge, 4),
                    round((float) $out * $marge, 4),
                ],
            ];
        }

        return [
            'enabled' => (bool) $config['enabled'],
            'paypalConfigured' => Env::get('PAYPAL_CLIENT_ID') !== '',
            'packs' => $config['packs'],
            'modeles' => $modeles,
            'pipeline' => $config['pipeline'],
        ];
    }

    /** @param array<string, mixed> $config */
    private static function validate(array $config): void
    {
        $marge = $config['marge'];
        if (!\is_int($marge) && !\is_float($marge)) {
            throw new Twin9Exception('Marge invalide : nombre attendu', 422);
        }
        if ((float) $marge < self::MARGE_MIN || (float) $marge > self::MARGE_MAX) {
            throw new Twin9Exception('Marge hors bornes (entre 1 et 5)', 422);
        }

        if (!\is_array($config['packs']) || $config['packs'] === [] || !array_is_list($config['packs'])) {
            throw new Twin9Exception('Packs invalides : liste non vide attendue', 422);
        }
        foreach ($config['packs'] as $pack) {
            $montant = \is_array($pack) ? ($pack['montant_usd'] ?? null) : null;
            $libelle = \is_array($pack) ? ($pack['libelle'] ?? null) : null;
            if ((!\is_int($montant) && !\is_float($montant))
                || (float) $montant < self::PACK_MIN_USD || (float) $montant > self::PACK_MAX_USD) {
                throw new Twin9Exception('Pack hors bornes : montant entre 1 et 100 USD', 422);
            }
            if (!\is_string($libelle) || trim($libelle) === '') {
                throw new Twin9Exception('Pack invalide : libellé requis', 422);
            }
        }

        if (!\is_array($config['modeles']) || $config['modeles'] === []) {
            throw new Twin9Exception('Modèles invalides : au moins un modèle requis', 422);
        }
        foreach ($config['modeles'] as $modelId => $modele) {
            if (!\is_string($modelId) || trim($modelId) === '' || !\is_array($modele)) {
                throw new Twin9Exception('Modèle invalide', 422);
            }
            $prix = $modele['prix_usd_mtok'] ?? null;
            if (!\is_array($prix) || \count($prix) !== 2 || !array_is_list($prix)) {
                throw new Twin9Exception('Prix invalide : [entrée, sortie] attendu', 422);
            }
            foreach ($prix as $p) {
                if ((!\is_int($p) && !\is_float($p)) || (float) $p <= 0) {
                    throw new Twin9Exception('Prix invalide : nombre strictement positif attendu', 422);
                }
            }
            $etages = $modele['etages'] ?? null;
            if (!\is_array($etages) || $etages === [] || !array_is_list($etages)
                || array_diff($etages, self::ETAGES) !== []) {
                throw new Twin9Exception('Étages invalides (taggers, rapide, tribunal)', 422);
            }
        }

        if (!\is_bool($config['enabled'])) {
            throw new Twin9Exception('Champ enabled invalide : booléen attendu', 422);
        }
        $rythme = $config['appels_par_minute'];
        if (!\is_int($rythme) || $rythme < 1 || $rythme > 600) {
            throw new Twin9Exception('Rythme d’appels hors bornes (1 à 600 par minute)', 422);
        }
        if (!\is_array($config['pipeline'])) {
            throw new Twin9Exception('Configuration pipeline invalide : objet attendu', 422);
        }
    }
}
