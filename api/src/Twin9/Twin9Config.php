<?php

declare(strict_types=1);

namespace Humanome\Twin9;

use Humanome\Env;
use Humanome\Packages\SettingsRepository;

/**
 * Twin9 platform configuration, persisted as JSON in the `settings` table
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
 *   pipeline  free-form Twin9 protocol settings imported from config.json
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

    /**
     * Referentiel STRUCTURE (pole num/nom + competence code/nom) the client
     * engine needs to assemble artefacts — NOT secret (codes and names are the
     * public RESPIRE referentiel; only the accented pole names differ from the
     * static respire-v7.json, which is why we serve the exact structure the
     * imported templates were parsed from). Stored under its own settings key,
     * written by the import (X-Migrate-Token), never by the admin PUT.
     */
    public const REFERENTIEL_KEY = 'twin9_referentiel';

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
            // Owner decision (2026-07-15): CONTRIBUTION per protocole. Twin9 is
            // the proprietary Golden Prompt (R&D) → +20 %; Twin6 is open source
            // → +10 % (operational cost recovery: PayPal fee + OVH/domain +
            // Haiku demo). `marge` is the Twin9 rate (the /appel path is Twin9);
            // `marge_twin6` the open-cartography rate. Both « contribution »,
            // never « surtaxe ». The PayPal FIXED fee (≈ 0.30-0.49 USD/capture)
            // is why packs start at 10 USD (see 'packs').
            'marge' => 1.2,
            'marge_twin6' => 1.1,
            // PROMO (owner idea 2026-07-15): when true, a run with the user's
            // OWN API key may use Twin9 for FREE (no contribution) — a
            // promotional window to let people feel the quality before buying
            // tokens. Off by default: Twin9 own-key is otherwise refused (the
            // proprietary prompt only travels via our metered/credited path).
            'twin9_cle_perso_ouverte' => false,
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

    /**
     * The stored referentiel structure the client engine consumes, or [] if
     * none imported yet. Shape: [{num:int, nom:string, competences:[{code, nom}]}].
     *
     * @return list<array<string, mixed>>
     */
    public function referentiel(): array
    {
        $stored = $this->settings->get(self::REFERENTIEL_KEY);

        return \is_array($stored) && isset($stored['poles']) && \is_array($stored['poles'])
            ? $stored['poles']
            : [];
    }

    /**
     * Store the referentiel structure (import only). Keeps ONLY the non-secret
     * structure — num/nom of poles, code/nom of competences — dropping anything
     * else (a fiche's body would be confidential and is never needed here).
     *
     * @param list<array<string, mixed>> $poles
     */
    public function setReferentiel(array $poles): void
    {
        $clean = [];
        foreach ($poles as $p) {
            if (!\is_array($p)) {
                continue;
            }
            $comps = [];
            foreach ((array) ($p['competences'] ?? []) as $c) {
                if (\is_array($c) && isset($c['code'], $c['nom'])) {
                    $comps[] = ['code' => (string) $c['code'], 'nom' => (string) $c['nom']];
                }
            }
            $clean[] = [
                'num' => (int) ($p['num'] ?? 0),
                'nom' => (string) ($p['nom'] ?? ''),
                'competences' => $comps,
            ];
        }
        $this->settings->set(self::REFERENTIEL_KEY, ['poles' => $clean]);
    }

    public function isEnabled(): bool
    {
        return (bool) $this->read()['enabled'];
    }

    public function setEnabled(bool $enabled): void
    {
        $this->update(['enabled' => $enabled]);
    }

    /** Contribution margin for a protocole: twin6 → marge_twin6, else twin9 marge. */
    public function marge(string $protocole = 'twin9'): float
    {
        $config = $this->read();

        return $protocole === 'twin6'
            ? (float) $config['marge_twin6']
            : (float) $config['marge'];
    }

    /**
     * PROMO flag: may a run with the user's OWN API key use Twin9 for free?
     * Off by default (Twin9 own-key refused); an admin opens it for a window.
     */
    public function clePersoOuverte(): bool
    {
        return (bool) $this->read()['twin9_cle_perso_ouverte'];
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
    public function coutMicrousd(string $modelId, int $tokensIn, int $tokensOut, string $protocole = 'twin9'): ?int
    {
        $config = $this->read();
        $modele = $config['modeles'][$modelId] ?? null;
        if (!\is_array($modele)) {
            return null;
        }
        [$in, $out] = $modele['prix_usd_mtok'];
        $marge = $protocole === 'twin6' ? (float) $config['marge_twin6'] : (float) $config['marge'];

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
     * overdraft). Over-estimates BOTH sides so the real cost can ONLY be lower,
     * which makes the post-call reconciliation a pure REFUND (never a further
     * debit that could drive the balance negative — 2026-07-15 review):
     *   - input tokens = prompt BYTE length. A BPE tokenizer never emits more
     *     tokens than there are UTF-8 bytes (worst case = 1-token-per-byte
     *     fallback), so bytes is a HARD upper bound on real input_tokens —
     *     unlike the former ceil(chars/3), which dense/multibyte prompts could
     *     exceed and thus overdraw on reconciliation.
     *   - output tokens = max_tokens (the full ceiling the model may emit).
     * The route debits this conditionally (no overdraft → 402 if the balance
     * can't cover it), then reconciles down to the real cost after the call.
     * Null: unknown model.
     */
    public function reserveMicrousd(string $modelId, int $promptBytes, int $maxTokens, string $protocole = 'twin9'): ?int
    {
        return $this->coutMicrousd($modelId, max(0, $promptBytes), max(0, $maxTokens), $protocole);
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

        $margeTwin6 = (float) $config['marge_twin6'];
        $modeles = [];
        $modelesTwin6 = [];
        foreach ($config['modeles'] as $modelId => $modele) {
            [$in, $out] = $modele['prix_usd_mtok'];
            $modeles[$modelId] = [
                'etages' => $modele['etages'],
                'prix_usd_mtok' => [round((float) $in * $marge, 4), round((float) $out * $marge, 4)],
            ];
            // Twin6 (open cartography) prices at its own +10 % contribution.
            $modelesTwin6[$modelId] = [round((float) $in * $margeTwin6, 4), round((float) $out * $margeTwin6, 4)];
        }

        return [
            'enabled' => (bool) $config['enabled'],
            'paypalConfigured' => Env::get('PAYPAL_CLIENT_ID') !== '',
            'packs' => $config['packs'],
            'modeles' => $modeles,
            'modeles_twin6' => $modelesTwin6,
            // Promo state: when true, Twin9 is usable free with one's own key.
            'twin9_cle_perso_ouverte' => (bool) $config['twin9_cle_perso_ouverte'],
            'pipeline' => $config['pipeline'],
        ];
    }

    /** @param array<string, mixed> $config */
    private static function validate(array $config): void
    {
        foreach (['marge' => 'Marge', 'marge_twin6' => 'Marge Twin6'] as $key => $label) {
            $m = $config[$key];
            if (!\is_int($m) && !\is_float($m)) {
                throw new Twin9Exception($label . ' invalide : nombre attendu', 422);
            }
            if ((float) $m < self::MARGE_MIN || (float) $m > self::MARGE_MAX) {
                throw new Twin9Exception($label . ' hors bornes (entre 1 et 5)', 422);
            }
        }
        if (!\is_bool($config['twin9_cle_perso_ouverte'])) {
            throw new Twin9Exception('Champ twin9_cle_perso_ouverte invalide : booléen attendu', 422);
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
