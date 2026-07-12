<?php

declare(strict_types=1);

namespace Humanome\Referentiel;

/**
 * Minimal semver 2.0.0 helper (validation + precedence). No dependency:
 * publication only needs "strictly greater than the latest published".
 */
final class Semver
{
    /** Same pattern as schemas/referentiel.schema.json `version`. */
    private const PATTERN = '/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)'
        . '(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?'
        . '(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/';

    public static function isValid(string $version): bool
    {
        return preg_match(self::PATTERN, $version) === 1;
    }

    /** Semver precedence: -1, 0 or 1. Build metadata is ignored. */
    public static function compare(string $a, string $b): int
    {
        [$coreA, $preA] = self::parse($a);
        [$coreB, $preB] = self::parse($b);

        for ($i = 0; $i < 3; $i++) {
            if ($coreA[$i] !== $coreB[$i]) {
                return $coreA[$i] <=> $coreB[$i];
            }
        }

        // A version without pre-release outranks the same version with one.
        if ($preA === null || $preB === null) {
            return ($preA === null ? 1 : 0) <=> ($preB === null ? 1 : 0);
        }

        $count = min(\count($preA), \count($preB));
        for ($i = 0; $i < $count; $i++) {
            $cmp = self::compareIdentifiers($preA[$i], $preB[$i]);
            if ($cmp !== 0) {
                return $cmp;
            }
        }

        return \count($preA) <=> \count($preB);
    }

    public static function greaterThan(string $a, string $b): bool
    {
        return self::compare($a, $b) > 0;
    }

    /** @return array{0: array{int, int, int}, 1: list<string>|null} */
    private static function parse(string $version): array
    {
        if (preg_match(self::PATTERN, $version, $m) !== 1) {
            throw new \InvalidArgumentException(sprintf('Invalid semver: "%s"', $version));
        }

        $core = [(int) $m[1], (int) $m[2], (int) $m[3]];
        $pre = ($m[4] ?? '') === '' ? null : explode('.', $m[4]);

        return [$core, $pre];
    }

    private static function compareIdentifiers(string $a, string $b): int
    {
        $aNumeric = ctype_digit($a);
        $bNumeric = ctype_digit($b);
        if ($aNumeric && $bNumeric) {
            return (int) $a <=> (int) $b;
        }
        if ($aNumeric !== $bNumeric) {
            return $aNumeric ? -1 : 1; // numeric identifiers rank lower
        }

        return strcmp($a, $b) <=> 0;
    }
}
