<?php

declare(strict_types=1);

namespace Humanome\Auth;

use Humanome\Geo\CountryResolver;
use Humanome\Geo\IpAnonymizer;
use PDO;

/**
 * Journal des connexions (monitoring admin, §6.5 : événements et compteurs,
 * jamais de contenu). Chaque ouverture de session (login OU activation) et
 * chaque échec d'identification laissent un audit_event portant seulement le
 * pays (résolu localement, CountryResolver) et le réseau tronqué
 * (IpAnonymizer) — jamais l'IP brute.
 *
 * Rétention bornée : purge opportuniste (1 connexion sur PRUNE_LOTTERY, pas
 * de cron sur l'hébergement) des événements plus vieux que RETENTION_DAYS.
 */
final class LoginJournal
{
    public const LOGIN = 'login';
    public const LOGIN_FAILED = 'login_failed';
    public const RETENTION_DAYS = 365;

    private const PRUNE_LOTTERY = 100;

    public static function success(PDO $pdo, int $userId, string $ip): void
    {
        self::record($pdo, $userId, self::LOGIN, $ip);
    }

    /** $userId nul quand l'email ne correspond à aucun compte. */
    public static function failure(PDO $pdo, ?int $userId, string $ip): void
    {
        self::record($pdo, $userId, self::LOGIN_FAILED, $ip);
    }

    public static function prune(PDO $pdo): void
    {
        $stmt = $pdo->prepare(
            'DELETE FROM audit_events
              WHERE type IN (?, ?)
                AND created_at < DATE_SUB(NOW(), INTERVAL ' . self::RETENTION_DAYS . ' DAY)'
        );
        $stmt->execute([self::LOGIN, self::LOGIN_FAILED]);
    }

    private static function record(PDO $pdo, ?int $userId, string $type, string $ip): void
    {
        Audit::record($pdo, $userId, $type, [
            'pays' => CountryResolver::resolve($ip),
            'reseau' => IpAnonymizer::network($ip),
        ]);
        if (random_int(1, self::PRUNE_LOTTERY) === 1) {
            self::prune($pdo);
        }
    }
}
