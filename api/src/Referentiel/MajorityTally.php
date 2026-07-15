<?php

declare(strict_types=1);

namespace Humanome\Referentiel;

/**
 * Décompte de la MAJORITÉ DES MEMBRES (cahier §3.5), logique pure, partagée par
 * la gouvernance document et compétence.
 *
 * Seuil = floor(N/2)+1 de TOUT l'électorat (pas des seuls votants) : les
 * abstentions et non-votants rendent le passage plus dur. Issue :
 *  - 'adopted'  dès que « pour » atteint le seuil (entérinable) ;
 *  - 'rejected' dès que « contre » atteint le seuil (« pour » ne peut plus
 *    l'atteindre — la majorité contre le rend arithmétiquement impossible) ;
 *  - 'pending'  sinon ; 'blocked' si l'électorat est vide (personne pour valider).
 */
final class MajorityTally
{
    /**
     * @param array{pour:int, contre:int, abstention:int} $counts voix des membres COURANTS
     * @return array{
     *     electorateSize:int, threshold:int|null,
     *     pour:int, contre:int, abstention:int, notVoted:int,
     *     outcome:'adopted'|'rejected'|'pending'|'blocked', reached:bool
     * }
     */
    public static function compute(int $electorateSize, array $counts): array
    {
        $pour = $counts['pour'];
        $contre = $counts['contre'];
        $abstention = $counts['abstention'];
        $threshold = $electorateSize > 0 ? intdiv($electorateSize, 2) + 1 : null;
        $voted = $pour + $contre + $abstention;

        $outcome = 'blocked';
        if ($threshold !== null) {
            if ($pour >= $threshold) {
                $outcome = 'adopted';
            } elseif ($contre >= $threshold) {
                $outcome = 'rejected';
            } else {
                $outcome = 'pending';
            }
        }

        return [
            'electorateSize' => $electorateSize,
            'threshold' => $threshold,
            'pour' => $pour,
            'contre' => $contre,
            'abstention' => $abstention,
            'notVoted' => max(0, $electorateSize - $voted),
            'outcome' => $outcome,
            'reached' => $outcome === 'adopted',
        ];
    }
}
