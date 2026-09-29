<?php

declare(strict_types=1);

namespace Humanome\Tests\UseCases\Support;

/**
 * Lot « Établissement et traitement de masse » — classes FONCTIONNELLES
 * (MasseTestCase) : MasseTestCase::tick (et donc tickUntilDrained) relancé
 * tant qu'un AUTRE processus PHPUnit tient le verrou GET_LOCK global du
 * worker (UC-SYS-01, RG1 : verrou commun à tout le serveur MySQL, toutes
 * bases de test confondues). Sans cela, un tick concurrent d'un autre
 * processus ferait répondre {locked: true, jobsTouched: 0} et
 * tickUntilDrained conclurait à tort que la file est vide.
 *
 * S'utilise avec EtaSupport (untilUnlocked).
 */
trait EtaTickSupport
{
    /** @return array<string, mixed> */
    protected function tick(array $options = []): array
    {
        return self::untilUnlocked(fn (): array => parent::tick($options));
    }
}
