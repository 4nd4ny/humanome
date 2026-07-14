<?php

declare(strict_types=1);

namespace Humanome\Twin9;

use Humanome\Packages\SettingsRepository;

/**
 * Secret fiche store (ADR-010, render-relocation fix) — the CONFIDENTIAL
 * competence/pole fiches the client engine must NOT hold. The client renders
 * every prompt SERVER-side and sends only run-state variables; two variables
 * are fiche-derived and injected HERE, authoritatively, from lookup keys the
 * engine provides:
 *   - COMPETENCE_FICHE  ← fiche_md of variables['CODE']
 *   - POLE_FICHES       ← pole header + the competence fiches of
 *                         variables['POLE_NUM'], reassembled in the order the
 *                         client sends in variables['POLE_FICHES_ORDRE']
 *                         (the anti-gaming permutation the engine computed).
 *
 * Stored under its own settings key, written by the import (X-Migrate-Token),
 * NEVER exposed by /api/twin9/meta. Assembly reproduces Python
 * Pole.fiche_complete: rtrim(header) + "\n\n" + fiches joined by "\n\n---\n\n"
 * + "\n", each fiche trimmed.
 */
final class FicheStore
{
    public const SETTING_KEY = 'twin9_fiches';

    /**
     * @param array<string, string> $competences code => fiche_md
     * @param array<int, string> $poleHeaders pole num => header
     * @param array<int, list<string>> $poleCodes pole num => codes (canonical order)
     */
    private function __construct(
        private readonly array $competences,
        private readonly array $poleHeaders,
        private readonly array $poleCodes,
    ) {
    }

    public static function fromSettings(SettingsRepository $settings): self
    {
        $raw = $settings->get(self::SETTING_KEY);

        return self::fromArray(\is_array($raw) ? $raw : []);
    }

    /** @param array<string, mixed> $raw the stored {poles: [...]} shape */
    public static function fromArray(array $raw): self
    {
        $competences = [];
        $poleHeaders = [];
        $poleCodes = [];
        foreach ((array) ($raw['poles'] ?? []) as $pole) {
            if (!\is_array($pole)) {
                continue;
            }
            $num = (int) ($pole['num'] ?? 0);
            $poleHeaders[$num] = (string) ($pole['header'] ?? '');
            $poleCodes[$num] = [];
            foreach ((array) ($pole['competences'] ?? []) as $comp) {
                if (\is_array($comp) && isset($comp['code'])) {
                    $code = (string) $comp['code'];
                    $competences[$code] = (string) ($comp['fiche_md'] ?? '');
                    $poleCodes[$num][] = $code;
                }
            }
        }

        return new self($competences, $poleHeaders, $poleCodes);
    }

    /**
     * Persist the parsed fiches (import only). Keeps num/header + code/fiche_md.
     *
     * @param list<array<string, mixed>> $poles
     */
    public static function store(SettingsRepository $settings, array $poles): void
    {
        $clean = [];
        foreach ($poles as $pole) {
            if (!\is_array($pole)) {
                continue;
            }
            $comps = [];
            foreach ((array) ($pole['competences'] ?? []) as $comp) {
                if (\is_array($comp) && isset($comp['code'])) {
                    $comps[] = [
                        'code' => (string) $comp['code'],
                        'fiche_md' => (string) ($comp['fiche_md'] ?? ''),
                    ];
                }
            }
            $clean[] = [
                'num' => (int) ($pole['num'] ?? 0),
                'header' => (string) ($pole['header'] ?? ''),
                'competences' => $comps,
            ];
        }
        $settings->set(self::SETTING_KEY, ['poles' => $clean]);
    }

    public function isEmpty(): bool
    {
        return $this->competences === [];
    }

    public function competenceFiche(string $code): ?string
    {
        return $this->competences[$code] ?? null;
    }

    /**
     * Reassemble a pole's fiches in the given code order (Python
     * Pole.fiche_complete). $ordreCode absent/empty → canonical order.
     *
     * @param list<string> $ordreCode
     */
    public function poleFiches(int $num, array $ordreCode = []): ?string
    {
        if (!isset($this->poleHeaders[$num])) {
            return null;
        }
        $codes = $ordreCode !== [] ? $ordreCode : ($this->poleCodes[$num] ?? []);
        $fiches = [];
        foreach ($codes as $code) {
            $f = $this->competences[(string) $code] ?? null;
            if ($f !== null) {
                $fiches[] = trim($f);
            }
        }

        return rtrim($this->poleHeaders[$num]) . "\n\n" . implode("\n\n---\n\n", $fiches) . "\n";
    }

    /**
     * The secret vars to inject for one render, computed from the client's
     * run-state variables. Only the two fiche vars; the caller merges these
     * OVER the client vars (authoritative), then resolves the template.
     *
     * @param array<string, mixed> $vars client-provided run-state variables
     * @return array<string, string>
     */
    public function injecter(array $vars): array
    {
        $out = [];
        if (isset($vars['CODE'])) {
            $fiche = $this->competenceFiche((string) $vars['CODE']);
            if ($fiche !== null) {
                $out['COMPETENCE_FICHE'] = $fiche;
            }
        }
        if (isset($vars['POLE_NUM'])) {
            $ordre = [];
            foreach ((array) ($vars['POLE_FICHES_ORDRE'] ?? []) as $c) {
                $ordre[] = (string) $c;
            }
            $pf = $this->poleFiches((int) $vars['POLE_NUM'], $ordre);
            if ($pf !== null) {
                $out['POLE_FICHES'] = $pf;
            }
        }

        return $out;
    }
}
