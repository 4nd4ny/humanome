<?php

declare(strict_types=1);

namespace Humanome\Referentiel;

/**
 * Structural diff between two referentiel documents (P4: readable JSON).
 *
 * Competences are identified by their code, poles by their num. A competence
 * whose nom AND pole both change appears in both `renamed` and `moved`.
 */
final class ReferentielDiff
{
    /**
     * @param array<string, mixed> $from older document
     * @param array<string, mixed> $to newer document
     * @return array<string, mixed>
     */
    public static function compute(array $from, array $to): array
    {
        $polesFrom = self::indexBy($from['poles'] ?? [], 'num');
        $polesTo = self::indexBy($to['poles'] ?? [], 'num');
        $compFrom = self::indexBy($from['competences'] ?? [], 'code');
        $compTo = self::indexBy($to['competences'] ?? [], 'code');

        $polesAdded = [];
        $polesRemoved = [];
        $polesModified = [];
        foreach ($polesTo as $num => $pole) {
            if (!isset($polesFrom[$num])) {
                $polesAdded[] = ['num' => $pole['num'], 'nom' => $pole['nom']];
                continue;
            }
            $changes = [];
            foreach (['nom', 'couleur'] as $field) {
                if (($polesFrom[$num][$field] ?? null) !== ($pole[$field] ?? null)) {
                    $changes[$field] = ['from' => $polesFrom[$num][$field] ?? null, 'to' => $pole[$field] ?? null];
                }
            }
            if ($changes !== []) {
                $polesModified[] = ['num' => $pole['num'], 'changes' => $changes];
            }
        }
        foreach ($polesFrom as $num => $pole) {
            if (!isset($polesTo[$num])) {
                $polesRemoved[] = ['num' => $pole['num'], 'nom' => $pole['nom']];
            }
        }

        $added = [];
        $removed = [];
        $renamed = [];
        $moved = [];
        foreach ($compTo as $code => $competence) {
            if (!isset($compFrom[$code])) {
                $added[] = $competence;
                continue;
            }
            $before = $compFrom[$code];
            if ($before['nom'] !== $competence['nom']) {
                $renamed[] = [
                    'code' => $competence['code'],
                    'pole' => $competence['pole'],
                    'from' => $before['nom'],
                    'to' => $competence['nom'],
                ];
            }
            if ($before['pole'] !== $competence['pole']) {
                $moved[] = [
                    'code' => $competence['code'],
                    'nom' => $competence['nom'],
                    'fromPole' => $before['pole'],
                    'toPole' => $competence['pole'],
                ];
            }
        }
        foreach ($compFrom as $code => $competence) {
            if (!isset($compTo[$code])) {
                $removed[] = $competence;
            }
        }

        $summary = [
            'polesAdded' => \count($polesAdded),
            'polesRemoved' => \count($polesRemoved),
            'polesModified' => \count($polesModified),
            'competencesAdded' => \count($added),
            'competencesRemoved' => \count($removed),
            'competencesRenamed' => \count($renamed),
            'competencesMoved' => \count($moved),
        ];

        return [
            'referentielId' => $to['id'] ?? ($from['id'] ?? null),
            'from' => ['version' => $from['version'] ?? null, 'label' => $from['label'] ?? null],
            'to' => ['version' => $to['version'] ?? null, 'label' => $to['label'] ?? null],
            'identical' => array_sum($summary) === 0,
            'poles' => [
                'added' => $polesAdded,
                'removed' => $polesRemoved,
                'modified' => $polesModified,
            ],
            'competences' => [
                'added' => array_values($added),
                'removed' => array_values($removed),
                'renamed' => $renamed,
                'moved' => $moved,
            ],
            'summary' => $summary,
        ];
    }

    /**
     * @param mixed $items
     * @return array<int|string, array<string, mixed>>
     */
    private static function indexBy(mixed $items, string $key): array
    {
        $indexed = [];
        if (!\is_array($items)) {
            return $indexed;
        }
        foreach ($items as $item) {
            if (\is_array($item) && isset($item[$key]) && \is_scalar($item[$key])) {
                $indexed[$item[$key]] = $item;
            }
        }

        return $indexed;
    }
}
