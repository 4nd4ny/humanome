<?php

declare(strict_types=1);

namespace Humanome\Referentiel;

/** Message lisible expliquant pourquoi une proposition ne peut pas être entérinée. */
final class MajorityMessage
{
    /** @param array{outcome:string, pour:int, threshold:int|null, electorateSize:int} $tally */
    public static function forTally(array $tally): string
    {
        return match ($tally['outcome']) {
            'blocked' => 'Aucun membre épistémiarque ne peut valider cette proposition '
                . '(aucun compte ne porte le rôle épistémiarque).',
            'rejected' => 'Cette proposition a été rejetée par la majorité des membres épistémiarques.',
            default => sprintf(
                'Majorité non atteinte : %d voix « pour » sur %d requises (%d membres).',
                $tally['pour'],
                $tally['threshold'] ?? 0,
                $tally['electorateSize'],
            ),
        };
    }
}
