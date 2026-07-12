<?php

declare(strict_types=1);

namespace Humanome\Packages;

/**
 * Structural diff between two prompt-package documents (P10, cahier §3.4:
 * "comparer une version de prompt à une autre").
 *
 * Prompts are identified by (role, nom) — the M7 contract key. For a modified
 * prompt the diff reports a compact line-by-line text diff of `texte` and the
 * added/removed/modified declared variables (by nom). Top-level fields, the
 * orchestration code (line diff + entrypoint) and metadata changes are
 * reported too, plus a count summary.
 *
 * The line diff is an LCS diff on lines, with common prefix/suffix trimmed
 * first; beyond a size cap the middle block is reported as a full
 * delete/insert (still correct, just less minimal). Ops are
 * {op: 'del'|'add', line, text} — 'del' lines are numbered in the FROM
 * document, 'add' lines in the TO document.
 */
final class PackageDiff
{
    /** Cap on the LCS DP table (lines_from × lines_to) after trimming. */
    private const LCS_CELL_CAP = 250000;

    private const SCALAR_FIELDS = ['schemaVersion', 'auteur', 'description', 'modeleCible'];

    /**
     * @param array<string, mixed> $from older document
     * @param array<string, mixed> $to newer document
     * @return array<string, mixed>
     */
    public static function compute(array $from, array $to): array
    {
        // ------------------------------------------------------ top-level fields
        $fields = [];
        foreach (self::SCALAR_FIELDS as $field) {
            if (($from[$field] ?? null) !== ($to[$field] ?? null)) {
                $fields[$field] = ['from' => $from[$field] ?? null, 'to' => $to[$field] ?? null];
            }
        }
        if (($from['referentielCompatible'] ?? null) !== ($to['referentielCompatible'] ?? null)) {
            $fields['referentielCompatible'] = [
                'from' => $from['referentielCompatible'] ?? null,
                'to' => $to['referentielCompatible'] ?? null,
            ];
        }

        // ------------------------------------------------------------- prompts
        $promptsFrom = self::indexPrompts($from['prompts'] ?? []);
        $promptsTo = self::indexPrompts($to['prompts'] ?? []);

        $added = [];
        $removed = [];
        $modified = [];
        foreach ($promptsTo as $key => $prompt) {
            if (!isset($promptsFrom[$key])) {
                $added[] = ['role' => $prompt['role'], 'nom' => $prompt['nom']];
                continue;
            }
            $before = $promptsFrom[$key];
            $texteDiff = self::lineDiff((string) ($before['texte'] ?? ''), (string) ($prompt['texte'] ?? ''));
            $variablesDiff = self::variablesDiff($before['variables'] ?? [], $prompt['variables'] ?? []);
            if ($texteDiff !== null || $variablesDiff !== null) {
                $modified[] = [
                    'role' => $prompt['role'],
                    'nom' => $prompt['nom'],
                    'texte' => $texteDiff,
                    'variables' => $variablesDiff,
                ];
            }
        }
        foreach ($promptsFrom as $key => $prompt) {
            if (!isset($promptsTo[$key])) {
                $removed[] = ['role' => $prompt['role'], 'nom' => $prompt['nom']];
            }
        }

        // ---------------------------------------------------------------- code
        $codeFrom = \is_array($from['code'] ?? null) ? $from['code'] : [];
        $codeTo = \is_array($to['code'] ?? null) ? $to['code'] : [];
        $entrypoint = ($codeFrom['entrypoint'] ?? null) !== ($codeTo['entrypoint'] ?? null)
            ? ['from' => $codeFrom['entrypoint'] ?? null, 'to' => $codeTo['entrypoint'] ?? null]
            : null;
        $orchestration = self::lineDiff(
            (string) ($codeFrom['orchestration'] ?? ''),
            (string) ($codeTo['orchestration'] ?? ''),
        );

        // ------------------------------------------------------------ metadata
        $metaFrom = \is_array($from['metadata'] ?? null) ? $from['metadata'] : [];
        $metaTo = \is_array($to['metadata'] ?? null) ? $to['metadata'] : [];
        $metadata = [];
        foreach (array_unique([...array_keys($metaFrom), ...array_keys($metaTo)]) as $key) {
            if (($metaFrom[$key] ?? null) !== ($metaTo[$key] ?? null)) {
                $metadata[$key] = ['from' => $metaFrom[$key] ?? null, 'to' => $metaTo[$key] ?? null];
            }
        }

        $summary = [
            'fieldsChanged' => \count($fields),
            'promptsAdded' => \count($added),
            'promptsRemoved' => \count($removed),
            'promptsModified' => \count($modified),
            'codeChanged' => $entrypoint !== null || $orchestration !== null,
            'metadataChanged' => $metadata !== [],
        ];

        return [
            'packageId' => $to['id'] ?? ($from['id'] ?? null),
            'from' => ['version' => $from['version'] ?? null],
            'to' => ['version' => $to['version'] ?? null],
            'identical' => $fields === [] && $added === [] && $removed === [] && $modified === []
                && $entrypoint === null && $orchestration === null && $metadata === [],
            'fields' => $fields,
            'prompts' => [
                'added' => $added,
                'removed' => $removed,
                'modified' => $modified,
            ],
            'code' => [
                'entrypoint' => $entrypoint,
                'orchestration' => $orchestration,
            ],
            'metadata' => $metadata,
            'summary' => $summary,
        ];
    }

    /**
     * @param mixed $prompts
     * @return array<string, array<string, mixed>> keyed by role \x00 nom
     */
    private static function indexPrompts(mixed $prompts): array
    {
        $indexed = [];
        if (!\is_array($prompts)) {
            return $indexed;
        }
        foreach ($prompts as $prompt) {
            if (\is_array($prompt) && \is_string($prompt['role'] ?? null) && \is_string($prompt['nom'] ?? null)) {
                $indexed[$prompt['role'] . "\x00" . $prompt['nom']] = $prompt;
            }
        }

        return $indexed;
    }

    /**
     * Declared-variables diff, keyed by variable nom.
     *
     * @param mixed $from
     * @param mixed $to
     * @return array<string, mixed>|null null when identical
     */
    private static function variablesDiff(mixed $from, mixed $to): ?array
    {
        $varsFrom = self::indexVariables($from);
        $varsTo = self::indexVariables($to);

        $added = [];
        $removed = [];
        $modified = [];
        foreach ($varsTo as $nom => $variable) {
            if (!isset($varsFrom[$nom])) {
                $added[] = $nom;
                continue;
            }
            $changes = [];
            foreach (['description', 'exemple'] as $field) {
                if (($varsFrom[$nom][$field] ?? null) !== ($variable[$field] ?? null)) {
                    $changes[$field] = [
                        'from' => $varsFrom[$nom][$field] ?? null,
                        'to' => $variable[$field] ?? null,
                    ];
                }
            }
            if ($changes !== []) {
                $modified[] = ['nom' => $nom, 'changes' => $changes];
            }
        }
        foreach (array_keys($varsFrom) as $nom) {
            if (!isset($varsTo[$nom])) {
                $removed[] = $nom;
            }
        }

        if ($added === [] && $removed === [] && $modified === []) {
            return null;
        }

        return ['added' => $added, 'removed' => $removed, 'modified' => $modified];
    }

    /**
     * @param mixed $variables
     * @return array<string, array<string, mixed>>
     */
    private static function indexVariables(mixed $variables): array
    {
        $indexed = [];
        if (!\is_array($variables)) {
            return $indexed;
        }
        foreach ($variables as $variable) {
            if (\is_array($variable) && \is_string($variable['nom'] ?? null)) {
                $indexed[$variable['nom']] = $variable;
            }
        }

        return $indexed;
    }

    /**
     * Compact line diff: null when identical, otherwise a list of
     * {op: 'del'|'add', line: int, text: string} ops (no context lines).
     *
     * @return list<array{op: string, line: int, text: string}>|null
     */
    public static function lineDiff(string $from, string $to): ?array
    {
        if ($from === $to) {
            return null;
        }
        $a = explode("\n", $from);
        $b = explode("\n", $to);

        // Trim common prefix and suffix — typical edits touch few lines.
        $start = 0;
        $na = \count($a);
        $nb = \count($b);
        while ($start < $na && $start < $nb && $a[$start] === $b[$start]) {
            $start++;
        }
        $endA = $na;
        $endB = $nb;
        while ($endA > $start && $endB > $start && $a[$endA - 1] === $b[$endB - 1]) {
            $endA--;
            $endB--;
        }
        $midA = \array_slice($a, $start, $endA - $start);
        $midB = \array_slice($b, $start, $endB - $start);
        $m = \count($midA);
        $n = \count($midB);

        $ops = [];
        if ($m * $n > self::LCS_CELL_CAP) {
            // Degenerate but correct: full replacement of the middle block.
            foreach ($midA as $i => $text) {
                $ops[] = ['op' => 'del', 'line' => $start + $i + 1, 'text' => $text];
            }
            foreach ($midB as $j => $text) {
                $ops[] = ['op' => 'add', 'line' => $start + $j + 1, 'text' => $text];
            }

            return $ops;
        }

        // LCS lengths, flat table (suffix lengths).
        $width = $n + 1;
        $dp = array_fill(0, ($m + 1) * $width, 0);
        for ($i = $m - 1; $i >= 0; $i--) {
            for ($j = $n - 1; $j >= 0; $j--) {
                $dp[$i * $width + $j] = $midA[$i] === $midB[$j]
                    ? $dp[($i + 1) * $width + $j + 1] + 1
                    : max($dp[($i + 1) * $width + $j], $dp[$i * $width + $j + 1]);
            }
        }

        $i = 0;
        $j = 0;
        while ($i < $m && $j < $n) {
            if ($midA[$i] === $midB[$j]) {
                $i++;
                $j++;
                continue;
            }
            if ($dp[($i + 1) * $width + $j] >= $dp[$i * $width + $j + 1]) {
                $ops[] = ['op' => 'del', 'line' => $start + $i + 1, 'text' => $midA[$i]];
                $i++;
            } else {
                $ops[] = ['op' => 'add', 'line' => $start + $j + 1, 'text' => $midB[$j]];
                $j++;
            }
        }
        for (; $i < $m; $i++) {
            $ops[] = ['op' => 'del', 'line' => $start + $i + 1, 'text' => $midA[$i]];
        }
        for (; $j < $n; $j++) {
            $ops[] = ['op' => 'add', 'line' => $start + $j + 1, 'text' => $midB[$j]];
        }

        return $ops;
    }
}
