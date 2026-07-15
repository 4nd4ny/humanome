<?php

declare(strict_types=1);

namespace Humanome\Referentiel;

use PDO;

/**
 * L'électorat de la gouvernance du référentiel (cahier §3.5) : les comptes
 * portant actuellement le rôle « epistemiarque » (non supprimés). Partagé par
 * la gouvernance au grain DOCUMENT (ReferentielGovernance) et au grain
 * COMPÉTENCE (CompetenceGovernance) : la majorité se calcule toujours contre le
 * MÊME corps électoral, recalculé à chaque lecture (un membre qui perd le rôle
 * ou est purgé cesse de compter immédiatement).
 */
final class Electorate
{
    /** @return list<int> ids des membres épistémiarques courants */
    public static function ids(PDO $pdo): array
    {
        $stmt = $pdo->query(
            "SELECT ur.user_id
             FROM user_roles ur
             JOIN roles r ON r.id = ur.role_id
             JOIN users u ON u.id = ur.user_id AND u.deleted_at IS NULL
             WHERE r.name = 'epistemiarque'
             ORDER BY ur.user_id"
        );

        return array_map(intval(...), $stmt->fetchAll(PDO::FETCH_COLUMN));
    }

    public static function size(PDO $pdo): int
    {
        return \count(self::ids($pdo));
    }
}
