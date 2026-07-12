<?php

declare(strict_types=1);

namespace Humanome\Worker;

/**
 * Instantiates the extraction prompts of a prompt-package by substituting the
 * {{placeholders}} of its templates (roles 'extraction-pole' and 'kairos') —
 * the M8 architecture decision (docs/plan-masse.md §0): the PHP worker NEVER
 * re-implements the JS engine; the prompt text lives in the package (data),
 * PHP only reproduces the formatting of the injected variables.
 *
 * The formatting helpers are byte-for-byte twins of the engine, source cited:
 * - referentielBloc / poleBloc  -> engine/src/pipeline/extract.js referentielBloc()
 * - formatDateFr                -> engine/src/pipeline/narrative-prompts.js formatDateFr()
 * - the variable list matches scripts/build-default-prompt-package.mjs
 * Parity is asserted by tests against goldens generated THROUGH the engine
 * (api/tests/MasseGolden/).
 */
final class PromptRunner
{
    /** @var array<string, array<string, mixed>> templates by role */
    private array $templates = [];

    /**
     * @param array<string, mixed> $package decoded prompt-package document
     * @param array<string, mixed> $referentiel decoded referentiel document
     *                             (poles[], competences[])
     */
    public function __construct(array $package, private readonly array $referentiel)
    {
        foreach ((array) ($package['prompts'] ?? []) as $prompt) {
            if (\is_array($prompt) && \is_string($prompt['role'] ?? null)) {
                $this->templates[$prompt['role']] = $prompt;
            }
        }
        if (!\is_array($referentiel['poles'] ?? null) || !\is_array($referentiel['competences'] ?? null)) {
            throw new \InvalidArgumentException('PromptRunner: referentiel with poles[] and competences[] required');
        }
    }

    public function hasExtractionTemplates(): bool
    {
        return isset($this->templates['extraction-pole'], $this->templates['kairos']);
    }

    /** Pole numbers of the referentiel, ascending (the 8-call plan minus kairos). */
    public function poleNums(): array
    {
        $nums = array_map(static fn (array $p): int => (int) $p['num'], $this->referentiel['poles']);
        sort($nums);

        return $nums;
    }

    /** Prompt for one pole of one day (template role 'extraction-pole'). */
    public function polePrompt(int $poleNum, string $dayText, string $date): string
    {
        $pole = null;
        foreach ($this->referentiel['poles'] as $candidate) {
            if ((int) $candidate['num'] === $poleNum) {
                $pole = $candidate;
                break;
            }
        }
        if ($pole === null) {
            throw new \InvalidArgumentException("PromptRunner: pole {$poleNum} absent from the referentiel");
        }
        $codes = $this->poleCodes($poleNum);

        return $this->substitute('extraction-pole', [
            'date_fr' => self::formatDateFr($date),
            'date_iso' => $date,
            'portfolio_texte' => trim($dayText), // extractDay injects dayText.trim()
            'pole_num' => (string) $poleNum,
            'pole_nom' => (string) $pole['nom'],
            'referentiel_pole_bloc' => $this->referentielBloc($poleNum),
            'nb_competences_pole' => (string) \count($codes),
            'codes_liste' => implode(', ', $codes),
            'premier_code' => (string) ($codes[0] ?? ''),
        ]);
    }

    /** Prompt for the day's transversal kairos synthesis (template role 'kairos'). */
    public function kairosPrompt(string $dayText, string $date): string
    {
        return $this->substitute('kairos', [
            'date_fr' => self::formatDateFr($date),
            'date_iso' => $date,
            'portfolio_texte' => trim($dayText),
            'nb_poles' => (string) \count($this->referentiel['poles']),
            'nb_competences' => (string) \count($this->referentiel['competences']),
            'referentiel_bloc' => $this->referentielBloc(null),
        ]);
    }

    /** Sorted competence codes of a pole (extract.js: (a.code < b.code ? -1 : 1)). */
    private function poleCodes(int $poleNum): array
    {
        $codes = [];
        foreach ($this->referentiel['competences'] as $c) {
            if ((int) $c['pole'] === $poleNum) {
                $codes[] = (string) $c['code'];
            }
        }
        usort($codes, static fn (string $a, string $b): int => $a < $b ? -1 : 1);

        return $codes;
    }

    /**
     * Twin of referentielBloc() in engine/src/pipeline/extract.js:
     * « Pôle N — nom » lines followed by «   code — nom » competence lines,
     * poles ascending, codes string-sorted.
     */
    private function referentielBloc(?int $poleNum): string
    {
        $poles = $this->referentiel['poles'];
        usort($poles, static fn (array $a, array $b): int => (int) $a['num'] <=> (int) $b['num']);

        $lignes = [];
        foreach ($poles as $pole) {
            $num = (int) $pole['num'];
            if ($poleNum !== null && $num !== $poleNum) {
                continue;
            }
            $lignes[] = sprintf('Pôle %d — %s', $num, (string) $pole['nom']);
            $comps = array_values(array_filter(
                $this->referentiel['competences'],
                static fn (array $c): bool => (int) $c['pole'] === $num,
            ));
            usort($comps, static fn (array $a, array $b): int => ((string) $a['code']) < ((string) $b['code']) ? -1 : 1);
            foreach ($comps as $c) {
                $lignes[] = sprintf('  %s — %s', (string) $c['code'], (string) $c['nom']);
            }
        }

        return implode("\n", $lignes);
    }

    /** Twin of formatDateFr() in engine/src/pipeline/narrative-prompts.js. */
    public static function formatDateFr(string $iso): string
    {
        [$y, $m, $d] = explode('-', $iso);

        return "{$d}/{$m}/{$y}";
    }

    /**
     * Replace every declared {{variable}} of the template. Checks run on the
     * TEMPLATE (declared variables all valued, no undeclared placeholder),
     * then a SINGLE strtr() pass substitutes — replaced text is never
     * re-scanned, so a portfolio containing "{{date_iso}}" cannot inject
     * anything (nor trip the checks).
     *
     * @param array<string, string> $values
     */
    private function substitute(string $role, array $values): string
    {
        $template = $this->templates[$role] ?? null;
        if ($template === null) {
            throw new \RuntimeException("PromptRunner: template role \"{$role}\" absent from the package");
        }

        $text = (string) $template['texte'];
        $declared = [];
        foreach ((array) ($template['variables'] ?? []) as $variable) {
            $name = \is_array($variable) ? (string) ($variable['nom'] ?? '') : '';
            if ($name === '') {
                continue;
            }
            if (!\array_key_exists($name, $values)) {
                throw new \RuntimeException("PromptRunner: no value for declared variable \"{$name}\" ({$role})");
            }
            $declared['{{' . $name . '}}'] = $values[$name];
        }

        preg_match_all('/\{\{([a-z0-9_]+)\}\}/', $text, $found);
        foreach ($found[1] as $placeholder) {
            if (!isset($declared['{{' . $placeholder . '}}'])) {
                throw new \RuntimeException("PromptRunner: undeclared placeholder \"{{{$placeholder}}}\" in template \"{$role}\"");
            }
        }

        return strtr($text, $declared);
    }
}
