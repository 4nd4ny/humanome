<?php

declare(strict_types=1);

namespace Humanome\Worker;

use Humanome\Validation;

/**
 * Deterministic post-processing of one LLM extraction answer, PHP port of the
 * corpus invariants of engine/src/pipeline/extract.js (M8 decision: the shape
 * repairs are deterministic and cheap — THEY are ported; the engine itself is
 * not re-implemented, docs/plan-masse.md §0). Cited sources:
 *
 * - parse()                 -> extract.js parseExtractionResponse()
 *                              (+ stripTrailingCommas, balancedObjects)
 * - normalizeCompetences()  -> extract.js normalizeCompetences()
 *                              (+ pedagogueComplet)
 * - computeAuditPole()      -> extract.js computeAuditPole()
 * - assemblePole()/probe    -> extract.js extractDay() attemptPole()
 *                              (7-clone probe validated by Validation.php,
 *                              the Opis twin of the engine's ajv)
 */
final class PoleAssembler
{
    /** extract.js RAISON_COURT_CIRCUIT — unique value observed on the corpus. */
    public const RAISON_COURT_CIRCUIT = 'aucune pièce extraite par le Greffier';

    // ------------------------------------------------------------- parsing

    /**
     * Tolerant JSON extraction from an LLM answer (port of
     * parseExtractionResponse): code fences, prose around the object,
     * trailing commas. Returns the decoded object (assoc array), or null for
     * the JSON literal `null` (kairos absent).
     *
     * @throws \RuntimeException when no usable JSON object is found
     */
    public static function parse(string $text): ?array
    {
        $trimmed = trim(preg_replace('/^\x{FEFF}/u', '', $text) ?? $text);

        $candidates = [$trimmed];
        if (preg_match('/```(?:json)?\s*([\s\S]*?)```/', $trimmed, $m) === 1) {
            $candidates[] = trim($m[1]);
        }
        foreach (self::balancedObjects($trimmed) as $object) {
            $candidates[] = $object;
        }
        $first = strpos($trimmed, '{');
        $last = strrpos($trimmed, '}');
        if ($first !== false && $last !== false && $last > $first) {
            $candidates[] = substr($trimmed, $first, $last - $first + 1);
        }

        foreach ($candidates as $candidate) {
            if ($candidate === '') {
                continue;
            }
            foreach ([$candidate, self::stripTrailingCommas($candidate)] as $variant) {
                $decoded = json_decode($variant, true);
                if ($decoded === null && trim($variant) === 'null') {
                    return null; // literal null — kairos absent
                }
                if (\is_array($decoded) && !array_is_list($decoded)) {
                    return $decoded;
                }
            }
        }

        $extrait = mb_substr(preg_replace('/\s+/', ' ', $trimmed) ?? '', 0, 160);
        throw new \RuntimeException("aucun JSON valide trouvé dans la réponse (début : « {$extrait} »)");
    }

    /** Port of extract.js balancedObjects(): brace-balanced spans, longest first. */
    private static function balancedObjects(string $s, int $limit = 8): array
    {
        $found = [];
        $len = \strlen($s);
        for ($i = 0; $i < $len && \count($found) < $limit; $i++) {
            if ($s[$i] !== '{') {
                continue;
            }
            $depth = 0;
            $inString = false;
            for ($j = $i; $j < $len; $j++) {
                $ch = $s[$j];
                if ($inString) {
                    if ($ch === '\\') {
                        $j++;
                    } elseif ($ch === '"') {
                        $inString = false;
                    }
                    continue;
                }
                if ($ch === '"') {
                    $inString = true;
                } elseif ($ch === '{') {
                    $depth++;
                } elseif ($ch === '}') {
                    $depth--;
                    if ($depth === 0) {
                        $found[] = substr($s, $i, $j - $i + 1);
                        $i = $j;
                        break;
                    }
                }
            }
        }
        usort($found, static fn (string $a, string $b): int => \strlen($b) <=> \strlen($a));

        return $found;
    }

    /**
     * Port of extract.js stripTrailingCommas(): removes «, }» / «, ]» commas
     * OUTSIDE strings only (a naive regex silently corrupts values like
     * "x, ]" — bug caught in the engine's adversarial review).
     */
    private static function stripTrailingCommas(string $s): string
    {
        $out = '';
        $len = \strlen($s);
        $inString = false;
        for ($i = 0; $i < $len; $i++) {
            $ch = $s[$i];
            if ($inString) {
                $out .= $ch;
                if ($ch === '\\') {
                    $out .= $s[$i + 1] ?? '';
                    $i++;
                } elseif ($ch === '"') {
                    $inString = false;
                }
                continue;
            }
            if ($ch === '"') {
                $inString = true;
                $out .= $ch;
                continue;
            }
            if ($ch === ',') {
                $j = $i + 1;
                while ($j < $len && ctype_space($s[$j])) {
                    $j++;
                }
                if ($j < $len && ($s[$j] === '}' || $s[$j] === ']')) {
                    continue; // trailing comma: dropped
                }
            }
            $out .= $ch;
        }

        return $out;
    }

    // --------------------------------------------------- corpus invariants

    /**
     * Port of extract.js normalizeCompetences(): courtCircuit ⇔ no piece
     * (the data decides, not the model's flag); court-circuit forces the CC
     * verdict shape; an INCOMPLETE pedagogue block goes null.
     */
    public static function normalizeCompetences(array $competences): array
    {
        foreach ($competences as &$c) {
            if (!\is_array($c)) {
                continue;
            }
            if (!\is_array($c['pieces'] ?? null) || !array_is_list($c['pieces'] ?? [])) {
                $c['pieces'] = [];
            }
            if (!\is_array($c['tracesRetenues'] ?? null) || !array_is_list($c['tracesRetenues'] ?? [])) {
                $c['tracesRetenues'] = [];
            }
            $c['courtCircuit'] = $c['pieces'] === [];
            if ($c['courtCircuit']) {
                $c['pedagogue'] = null;
                $c['tracesRetenues'] = [];
                $verdict = \is_array($c['verdict'] ?? null) ? $c['verdict'] : [];
                $c['verdict'] = [
                    'statut' => 'présence non établie',
                    'nombrePreuves' => 0,
                    'nombreIndices' => 0,
                    'confiance' => 1,
                    'raison' => self::RAISON_COURT_CIRCUIT,
                    'prescriptionMinimale' => $verdict['prescriptionMinimale']
                        ?? $verdict['prescription']
                        ?? 'Documenter cette compétence dans une prochaine feuille.',
                ];
            } elseif (($c['pedagogue'] ?? null) !== null && !self::pedagogueComplet($c['pedagogue'])) {
                $c['pedagogue'] = null;
            }
        }

        return $competences;
    }

    /** Port of extract.js pedagogueComplet(): the three required stages present. */
    private static function pedagogueComplet(mixed $p): bool
    {
        return \is_array($p)
            && \is_string($p['presomptionAbsence']['raisonnement'] ?? null)
            && \is_array($p['presomptionAbsence']['piecesQuiResistent'] ?? null)
            && \is_string($p['presomptionSycophantie']['raisonnement'] ?? null)
            && \is_array($p['presomptionSycophantie']['examenPieces'] ?? null)
            && \is_string($p['conclusionAdversariale']['raisonnement'] ?? null)
            && (\is_int($p['conclusionAdversariale']['confianceFinale'] ?? null)
                || \is_float($p['conclusionAdversariale']['confianceFinale'] ?? null));
    }

    /**
     * Port of extract.js computeAuditPole(): counters recomputed from the
     * verdicts themselves (LLM-emitted counters drift easily).
     */
    public static function computeAuditPole(array $competences): array
    {
        $statut = static fn (array $c): string => (string) ($c['verdict']['statut'] ?? '');
        $courtCircuits = \count(array_filter($competences, static fn ($c): bool => ($c['courtCircuit'] ?? false) === true));

        return [
            'competencesTotales' => \count($competences),
            'competencesNonCourtCircuit' => \count($competences) - $courtCircuits,
            'presencesEtablies' => \count(array_filter($competences, static fn ($c): bool => $statut($c) === 'présence établie')),
            'renvoisCartographe' => \count(array_filter($competences, static fn ($c): bool => $statut($c) === 'renvoi au cartographe')),
            'nonEtablies' => \count(array_filter($competences, static fn ($c): bool => $statut($c) === 'présence non établie')),
            'courtCircuits' => $courtCircuits,
        ];
    }

    // ------------------------------------------------------------ assembly

    /**
     * Repairs and validates one pole answer, port of the attemptPole()
     * pipeline in extract.js extractDay(): poleNum coercion, invariants,
     * recomputed audit, then STRUCTURAL validation of the pole through a
     * 7-clone probe document (Validation.php, the schema validates whole
     * cartographie-jour documents only).
     *
     * @throws \RuntimeException on any repairable-by-retry defect
     */
    public static function assemblePole(array $pole, int $poleNum, string $date): array
    {
        if (!\is_array($pole['competences'] ?? null)) {
            $keys = implode('/', \array_slice(array_keys($pole), 0, 5));
            throw new \RuntimeException("réponse sans tableau competences (objet {$keys})");
        }
        $pole['poleNum'] = \array_key_exists('poleNum', $pole) ? (string) $pole['poleNum'] : (string) $poleNum;
        if ($pole['poleNum'] !== (string) $poleNum) {
            throw new \RuntimeException("poleNum incohérent dans la réponse (« {$pole['poleNum']} »)");
        }
        $pole['competences'] = self::normalizeCompetences($pole['competences']);
        if (!\is_array($pole['passagesSaillants'] ?? null) || !array_is_list($pole['passagesSaillants'])) {
            $pole['passagesSaillants'] = [];
        }
        if (!\array_key_exists('rapport', $pole)) {
            $pole['rapport'] = null;
        }
        $pole['auditPole'] = self::computeAuditPole($pole['competences']);

        $probePoles = [];
        for ($i = 1; $i <= 7; $i++) {
            $clone = $pole;
            $clone['poleNum'] = (string) $i;
            $probePoles[] = $clone;
        }
        $result = Validation::validate('cartographie-jour', [
            'schemaVersion' => '1.0.0',
            'kind' => 'cartographie-jour',
            'date' => $date,
            'poles' => $probePoles,
            'kairos' => null,
        ]);
        if (!$result['valid']) {
            throw new \RuntimeException('objet pôle invalide au schéma : ' . self::formatErrors($result['errors']));
        }

        return $pole;
    }

    /**
     * Final cartographie-jour document (extract.js extractDay() assembly).
     *
     * @param array<int, array> $polesByNum validated poles keyed by pole number
     * @throws \RuntimeException when the final document does not validate
     */
    public static function assembleDay(array $polesByNum, mixed $kairos, string $date): array
    {
        ksort($polesByNum);
        $document = [
            'schemaVersion' => '1.0.0',
            'kind' => 'cartographie-jour',
            'date' => $date,
            'poles' => array_values($polesByNum),
            'kairos' => $kairos,
        ];
        $result = Validation::validate('cartographie-jour', $document);
        if (!$result['valid']) {
            throw new \RuntimeException(
                "document du {$date} invalide au schéma cartographie-jour : " . self::formatErrors($result['errors']),
            );
        }

        return $document;
    }

    /**
     * Validates a kairos answer against already-validated poles (extract.js
     * attemptKairos(): fail HERE, retry, then degrade to null — the 7 pole
     * documents carry the value, the schema accepts kairos null).
     */
    public static function validateKairos(mixed $kairos, array $polesByNum, string $date): void
    {
        ksort($polesByNum);
        $result = Validation::validate('cartographie-jour', [
            'schemaVersion' => '1.0.0',
            'kind' => 'cartographie-jour',
            'date' => $date,
            'poles' => array_values($polesByNum),
            'kairos' => $kairos,
        ]);
        if (!$result['valid']) {
            throw new \RuntimeException('kairos invalide au schéma : ' . self::formatErrors($result['errors']));
        }
    }

    /** @param array<string, string[]> $errors Opis pointer => messages */
    private static function formatErrors(array $errors): string
    {
        $parts = [];
        foreach (\array_slice($errors, 0, 3, true) as $pointer => $messages) {
            $parts[] = $pointer . ' ' . implode(' ; ', \array_slice((array) $messages, 0, 2));
        }

        return \count($errors) . ' erreur(s) : ' . implode(' | ', $parts);
    }
}
