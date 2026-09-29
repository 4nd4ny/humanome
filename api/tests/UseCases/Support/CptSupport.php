<?php

declare(strict_types=1);

namespace Humanome\Tests\UseCases\Support;

use Humanome\Env;
use Humanome\Tests\TestDb;

/**
 * Outillage partagé du lot « Compte » (UC-CPT-01 à UC-CPT-06,
 * docs/cas-utilisation/compte/).
 *
 * - awayFromWindowBoundary() : les quotas (RateLimiter) utilisent une fenêtre
 *   FIXE alignée sur l'horloge (intdiv(time(), fenêtre) × fenêtre). Un test qui
 *   enchaîne plusieurs essais puis attend un 429 échouerait si une frontière de
 *   fenêtre tombait au milieu : on attend donc la fenêtre suivante quand la
 *   fenêtre courante se termine dans moins de $margin secondes.
 * - withoutDatabase() : rejoue une requête avec une base « non configurée »
 *   (DB_HOST vide, Db::isConfigured() faux), puis restaure l'environnement.
 */
final class CptSupport
{
    public static function awayFromWindowBoundary(int $windowSeconds, int $margin = 20): void
    {
        $remaining = $windowSeconds - (time() % $windowSeconds);
        if ($remaining < $margin) {
            sleep($remaining + 1);
        }
    }

    /**
     * @template T
     * @param callable(): T $fn
     * @return T
     */
    public static function withoutDatabase(callable $fn): mixed
    {
        $host = Env::get('DB_HOST');
        TestDb::setEnv('DB_HOST', '');
        try {
            return $fn();
        } finally {
            TestDb::setEnv('DB_HOST', $host);
        }
    }
}
