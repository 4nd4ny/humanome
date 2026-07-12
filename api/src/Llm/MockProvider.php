<?php

declare(strict_types=1);

namespace Humanome\Llm;

/**
 * 'mock' provider: canned answers from schemas/fixtures/ for local dev and
 * integration WITHOUT any API key (DEMO_PROVIDER=mock).
 *
 * When the prompt carries a pole marker (the extraction prompts built by
 * engine/src/pipeline/extract.js contain both `Pôle <n> —` and
 * `"poleNum": "<n>"`), the matching pole object of an existing
 * cartographie-jour fixture is returned as JSON — enough for the engine
 * pipeline to run end-to-end. A kairos synthesis prompt (marker
 * `SYNTHÈSE KAIROS`, buildKairosExtractionPrompt) gets the fixture's kairos
 * field as JSON (`null` or object — both valid per the schema). If a fixture
 * day date (2026-01-05..07) appears in the prompt, that day's fixture is
 * used; otherwise the first one. Otherwise, a generic text is returned.
 *
 * Usage tokens are estimated with the engine heuristic (~3.6 chars/token
 * for French, engine/src/providers/estimate.js).
 */
final class MockProvider
{
    private const CHARS_PER_TOKEN = 3.6;
    private const FIXTURE_DAYS = ['2026-01-05', '2026-01-06', '2026-01-07'];

    public function __construct(private readonly ?string $fixturesDir = null)
    {
    }

    /** @return array{text: string, usage: array{inputTokens: int, outputTokens: int}, model: string} */
    public function complete(string $model, ?string $system, string $prompt, int $maxTokens): array
    {
        $input = ($system ?? '') . $prompt;
        // Kairos FIRST: the kairos prompt embeds the whole referentiel block
        // (« Pôle 1 — … », « Pôle 2 — … ») and would match the pole marker.
        $text = $this->kairosAnswer($prompt)
            ?? $this->poleAnswer($prompt)
            ?? 'Réponse simulée du fournisseur mock (aucun marqueur de pôle détecté dans le prompt).';

        return [
            'text' => $text,
            'usage' => [
                'inputTokens' => (int) ceil(mb_strlen($input) / self::CHARS_PER_TOKEN),
                'outputTokens' => (int) ceil(mb_strlen($text) / self::CHARS_PER_TOKEN),
            ],
            'model' => 'mock',
        ];
    }

    /** JSON of the requested pole from a cartographie-jour fixture, or null. */
    private function poleAnswer(string $prompt): ?string
    {
        if (preg_match('/"poleNum":\s*"?([1-7])"?/u', $prompt, $m) !== 1
            && preg_match('/P[ôo]le\s+([1-7])\b/u', $prompt, $m) !== 1) {
            return null;
        }
        $poleNum = $m[1];

        $document = $this->fixtureDocument($prompt);
        if ($document === null) {
            return null;
        }
        foreach ((array) ($document['poles'] ?? []) as $pole) {
            if (\is_array($pole) && (string) ($pole['poleNum'] ?? '') === $poleNum) {
                return json_encode($pole, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
            }
        }

        return null;
    }

    /**
     * JSON of the day's kairos synthesis (engine buildKairosExtractionPrompt,
     * marker `SYNTHÈSE KAIROS`), or null when the prompt is not a kairos one.
     * The fixture's kairos may be JSON `null` — valid per the schema and
     * understood by the engine's parseExtractionResponse.
     */
    private function kairosAnswer(string $prompt): ?string
    {
        if (!str_contains($prompt, 'SYNTHÈSE KAIROS') && !str_contains($prompt, 'kairos.apprenant')) {
            return null;
        }
        $document = $this->fixtureDocument($prompt);
        if ($document === null || !\array_key_exists('kairos', $document)) {
            return null;
        }

        return json_encode($document['kairos'], JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    }

    /** Fixture document whose date appears in the prompt (default: first day). */
    private function fixtureDocument(string $prompt): ?array
    {
        $day = self::FIXTURE_DAYS[0];
        foreach (self::FIXTURE_DAYS as $candidate) {
            if (str_contains($prompt, $candidate)) {
                $day = $candidate;
                break;
            }
        }

        $file = $this->fixturesDirectory() . '/cartographie-jour-' . $day . '.json';
        if (!is_file($file)) {
            return null;
        }
        $document = json_decode((string) file_get_contents($file), true);

        return \is_array($document) ? $document : null;
    }

    private function fixturesDirectory(): string
    {
        // Repo layout: api/src/Llm -> <repo>/schemas/fixtures.
        return $this->fixturesDir ?? \dirname(__DIR__, 3) . '/schemas/fixtures';
    }
}
