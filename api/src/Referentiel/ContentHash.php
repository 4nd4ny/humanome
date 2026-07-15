<?php

declare(strict_types=1);

namespace Humanome\Referentiel;

use InvalidArgumentException;

/**
 * Canonical form and content hash of a referentiel document.
 *
 * The hash MUST stay byte-identical to scripts/extract-referentiel.mjs:
 * sha256 of JSON.stringify({poles, competences}) with poles sorted by num
 * (keys num, nom, couleur) and competences sorted by code (keys code, nom,
 * pole), compact separators, unescaped unicode and slashes.
 *
 * The hash covers only the STRUCTURAL core (which poles/competences exist and
 * how they are named/placed). OPTIONAL annotation fields — notably a
 * competence's `description` (the épistémiarque-edited definition, RESPIRE
 * v7.1+) — are PRESERVED by normalize() in the stored document but DELIBERATELY
 * excluded from the hash: two versions with the same structure but different
 * definitions share one contentHash, the semver carrying the editorial change.
 * This keeps the hash byte-identical to the Node extractor and the pinned
 * fixtures, so no engine oracle or Twin9 vector moves.
 *
 * MySQL JSON columns reorder object keys, so documents are re-normalized
 * on every read/write instead of trusting stored key order.
 */
final class ContentHash
{
    /** Top-level key order of a canonical referentiel document. */
    private const DOCUMENT_KEYS = [
        'schemaVersion', 'kind', 'id', 'version', 'label',
        'contentHash', 'source', 'poles', 'competences',
    ];

    /**
     * @param array<string, mixed> $doc decoded referentiel document
     * @throws InvalidArgumentException when poles/competences are not hashable
     */
    public static function compute(array $doc): string
    {
        return hash('sha256', self::encode(self::canonicalBody($doc)));
    }

    /**
     * Canonical document: fixed key order, poles sorted by num, competences
     * sorted by code, contentHash recomputed. Keys absent from the input stay
     * absent (schema validation reports them). Throws when the body is not
     * hashable — callers fall back to validating the raw document.
     *
     * @param array<string, mixed> $doc
     * @return array<string, mixed>
     * @throws InvalidArgumentException
     */
    public static function normalize(array $doc): array
    {
        // The hash is computed from the STRUCTURAL body only (canonicalBody
        // strips each entry to its core keys), so it is unaffected by optional
        // annotation fields such as competence descriptions.
        $body = self::canonicalBody($doc);
        $doc['contentHash'] = hash('sha256', self::encode($body));
        // The STORED document, however, preserves those optional fields with a
        // deterministic key order (core keys first, then extras sorted).
        $doc['poles'] = self::canonicalEntries($doc['poles'], ['num', 'nom', 'couleur'], 'num');
        $doc['competences'] = self::canonicalEntries($doc['competences'], ['code', 'nom', 'pole'], 'code');

        $normalized = [];
        foreach (self::DOCUMENT_KEYS as $key) {
            if (\array_key_exists($key, $doc)) {
                $normalized[$key] = $doc[$key];
            }
        }

        return $normalized;
    }

    /**
     * Canonical, order-insensitive form of a pole/competence list that PRESERVES
     * optional extra keys (e.g. competence `description`) while keeping the core
     * keys first in a fixed order. Deterministic regardless of input key order,
     * so a stored document round-trips through MySQL's JSON key reordering.
     *
     * @param list<array<string, mixed>> $entries
     * @param list<string> $coreKeys core keys, in canonical order
     * @param 'num'|'code' $sortKey key the list is sorted by
     * @return list<array<string, mixed>>
     */
    private static function canonicalEntries(array $entries, array $coreKeys, string $sortKey): array
    {
        $out = [];
        foreach ($entries as $entry) {
            if (!\is_array($entry)) {
                // canonicalBody already validated hashable entries; be defensive.
                $out[] = $entry;
                continue;
            }
            $canonical = [];
            foreach ($coreKeys as $key) {
                if (\array_key_exists($key, $entry)) {
                    $canonical[$key] = $entry[$key];
                }
            }
            $extras = array_diff_key($entry, array_flip($coreKeys));
            ksort($extras);
            foreach ($extras as $key => $value) {
                $canonical[$key] = $value;
            }
            $out[] = $canonical;
        }

        if ($sortKey === 'num') {
            usort($out, static fn (array $a, array $b): int => ($a['num'] ?? 0) <=> ($b['num'] ?? 0));
        } else {
            usort($out, static fn (array $a, array $b): int => strcmp(
                \is_string($a['code'] ?? null) ? $a['code'] : '',
                \is_string($b['code'] ?? null) ? $b['code'] : '',
            ));
        }

        return $out;
    }

    /**
     * @param array<string, mixed> $doc
     * @return array{poles: list<array{num: int, nom: string, couleur: mixed}>,
     *               competences: list<array{code: string, nom: string, pole: int}>}
     * @throws InvalidArgumentException
     */
    private static function canonicalBody(array $doc): array
    {
        $poles = $doc['poles'] ?? null;
        $competences = $doc['competences'] ?? null;
        if (!\is_array($poles) || !\is_array($competences)
            || !array_is_list($poles) || !array_is_list($competences)) {
            throw new InvalidArgumentException('poles/competences are not lists');
        }

        $canonicalPoles = [];
        foreach ($poles as $pole) {
            if (!\is_array($pole)
                || !\array_key_exists('num', $pole)
                || !\array_key_exists('nom', $pole)
                || !\array_key_exists('couleur', $pole)) {
                throw new InvalidArgumentException('malformed pole entry');
            }
            $canonicalPoles[] = ['num' => $pole['num'], 'nom' => $pole['nom'], 'couleur' => $pole['couleur']];
        }
        usort($canonicalPoles, static fn (array $a, array $b): int => $a['num'] <=> $b['num']);

        $canonicalCompetences = [];
        foreach ($competences as $competence) {
            if (!\is_array($competence)
                || !\array_key_exists('code', $competence)
                || !\array_key_exists('nom', $competence)
                || !\array_key_exists('pole', $competence)) {
                throw new InvalidArgumentException('malformed competence entry');
            }
            $canonicalCompetences[] = [
                'code' => $competence['code'],
                'nom' => $competence['nom'],
                'pole' => $competence['pole'],
            ];
        }
        usort($canonicalCompetences, static fn (array $a, array $b): int => strcmp(
            \is_string($a['code']) ? $a['code'] : '',
            \is_string($b['code']) ? $b['code'] : '',
        ));

        return ['poles' => $canonicalPoles, 'competences' => $canonicalCompetences];
    }

    /** Compact JSON, byte-identical to JSON.stringify for these documents. */
    public static function encode(mixed $value): string
    {
        return json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
    }
}
