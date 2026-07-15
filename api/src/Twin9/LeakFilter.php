<?php

declare(strict_types=1);

namespace Humanome\Twin9;

/**
 * Anti-leak backstop (ADR-010 §2, threat « le faire réciter par le modèle ») —
 * the LAST line of defence before a model output leaves the server. The PRIMARY
 * defence is the anti-injection instructions inside the templates themselves;
 * this filter catches a recitation that slips through.
 *
 * Matching is done on a NORMALIZED CHARACTER stream, not on words, to defeat
 * the practical bypasses found in security review (finding B):
 *   - each code point is NFKC-folded (fullwidth / compatibility homoglyphs
 *     collapse) then lower-cased;
 *   - only letters and digits are kept — punctuation, whitespace and combining
 *     marks are dropped, so « m-o-t-.-m-o-t » interpolation and zero-width /
 *     combining-mark tricks no longer break the run.
 * Any shared run of >= MIN_CARS normalized characters between the CONFIDENTIAL
 * material and the output is redacted. The caller builds the index from the
 * template rendered with the learner's variables EMPTY but the confidential
 * FICHES INJECTED (routes/twin9.php, 2026-07-15 review) — so the fiche bodies
 * are backstopped, while the learner's own payload (journal text the model
 * legitimately quotes back) never enters the index and is never redacted.
 *
 * Residuals (documented, ADR-010 §2 — this is a backstop, NOT the control):
 *   - cross-SCRIPT homoglyphs (e.g. Cyrillic « а » for Latin « a ») are not
 *     folded by NFKC and could slip a character past the run matcher;
 *   - any CONTENT-PRESERVING TRANSFORM (Base64, ROT13, reversal, spelling-out,
 *     translation) changes the character stream and thus evades a substring
 *     matcher entirely (2026-07-15 adversarial review). Defeating arbitrary
 *     encodings is not achievable with a verbatim filter — which is precisely
 *     why the in-template anti-injection instructions are the PRIMARY control,
 *     and the leak COUNT is never returned (it would be a tuning oracle).
 * The OPEN Twin6 protocole carries no secret, so it runs WITHOUT this filter;
 * only the confidential Twin9 path is filtered.
 *
 * Redaction splices the ORIGINAL output by byte offsets: everything outside a
 * redacted run (formatting, JSON syntax, the user's quotes) survives untouched.
 */
final class LeakFilter
{
    /** Minimal shared run of normalized characters considered a leak (~10-12 words). */
    public const MIN_CARS = 48;

    public const MARQUEUR = '[expurgé]';

    /**
     * @param string $gabaritSansVariables template rendered with every variable EMPTY
     * @param string $sortie               raw model output
     *
     * @return array{sortie: string, fuites: int} filtered output + number of
     *   redacted runs (0 = clean). The count is for SERVER-SIDE audit only and
     *   MUST NOT be echoed to the client (finding B: it is a tuning oracle).
     */
    public static function redact(string $gabaritSansVariables, string $sortie): array
    {
        $index = self::index($gabaritSansVariables);
        if ($index === [] || $sortie === '') {
            return ['sortie' => $sortie, 'fuites' => 0];
        }

        // Normalized output: the kept-char stream + each char's raw byte span.
        [$chars, $spans] = self::normalize($sortie);
        $len = \count($chars);
        if ($len < self::MIN_CARS) {
            return ['sortie' => $sortie, 'fuites' => 0];
        }

        // Mark every raw byte covered by a matching MIN_CARS window; overlapping
        // windows merge into one maximal redacted zone.
        $zones = [];
        for ($i = 0; $i + self::MIN_CARS <= $len; $i++) {
            $window = implode('', \array_slice($chars, $i, self::MIN_CARS));
            if (!isset($index[$window])) {
                continue;
            }
            $from = $spans[$i][0];
            $to = $spans[$i + self::MIN_CARS - 1][1];
            $last = \count($zones) - 1;
            if ($last >= 0 && $from <= $zones[$last][1]) {
                $zones[$last][1] = max($zones[$last][1], $to); // extend
            } else {
                $zones[] = [$from, $to];
            }
        }
        if ($zones === []) {
            return ['sortie' => $sortie, 'fuites' => 0];
        }

        $result = '';
        $cursor = 0;
        foreach ($zones as [$from, $to]) {
            $result .= substr($sortie, $cursor, $from - $cursor) . self::MARQUEUR;
            $cursor = $to;
        }
        $result .= substr($sortie, $cursor);

        return ['sortie' => $result, 'fuites' => \count($zones)];
    }

    /**
     * Set of every MIN_CARS-character window of the normalized template.
     *
     * @return array<string, true>
     */
    private static function index(string $gabarit): array
    {
        [$chars] = self::normalize($gabarit);
        $len = \count($chars);
        $index = [];
        for ($i = 0; $i + self::MIN_CARS <= $len; $i++) {
            $index[implode('', \array_slice($chars, $i, self::MIN_CARS))] = true;
        }

        return $index;
    }

    /**
     * Folds and lower-cases each code point, keeps only letters/digits, and
     * returns the kept characters with their [byteStart, byteEnd) span in the
     * ORIGINAL string (a folding that yields several chars maps them all to the
     * same raw span, e.g. a ligature).
     *
     * Folding order: (1) the fullwidth block U+FF01..U+FF5E → ASCII — a MANUAL
     * fold so the most common homoglyph bypass is defeated even where the intl
     * extension is absent (docker image, some shared hosts); (2) NFKC via intl
     * WHEN available, for the broader compatibility set. Combining marks and
     * punctuation are dropped by the alnum filter.
     *
     * @return array{0: list<string>, 1: list<array{int, int}>}
     */
    private static function normalize(string $text): array
    {
        $hasIntl = \class_exists(\Normalizer::class);
        $chars = [];
        $spans = [];
        if (!preg_match_all('/./us', $text, $m, PREG_OFFSET_CAPTURE)) {
            return [[], []];
        }
        foreach ($m[0] as [$char, $byteStart]) {
            $byteLen = \strlen($char);
            $cp = mb_ord($char, 'UTF-8');
            if ($cp !== false && $cp >= 0xFF01 && $cp <= 0xFF5E) {
                $char = mb_chr($cp - 0xFEE0, 'UTF-8'); // fullwidth → ASCII
            } elseif ($hasIntl) {
                $char = \Normalizer::normalize($char, \Normalizer::FORM_KC) ?: $char;
            }
            $lower = mb_strtolower($char, 'UTF-8');
            $kept = preg_replace('/[^\p{L}\p{N}]/u', '', $lower);
            if ($kept === null || $kept === '') {
                continue;
            }
            foreach (preg_split('//u', $kept, -1, PREG_SPLIT_NO_EMPTY) ?: [] as $c) {
                $chars[] = $c;
                $spans[] = [$byteStart, $byteStart + $byteLen];
            }
        }

        return [$chars, $spans];
    }
}
