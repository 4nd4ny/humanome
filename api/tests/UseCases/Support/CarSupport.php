<?php

declare(strict_types=1);

namespace Humanome\Tests\UseCases\Support;

use Humanome\Auth\Users;
use Humanome\MigrationRunner;
use Humanome\Tests\TestDb;
use PDO;

/**
 * Outillage partagé des tests UNITAIRES du lot « Cartographe » (UC-CAR-01 à
 * UC-CAR-05) : base fraîche migrée, comptes + rôles, cartographies stockées
 * et liens apprenant <-> cartographe posés directement en SQL — sans couche
 * HTTP, pour appeler les classes du domaine (api/src/Cartographe/*) seules.
 *
 * Fiches : docs/cas-utilisation/cartographe/
 */
final class CarSupport
{
    /** Base de test (DB_TEST_NAME) recréée et migrée. */
    public static function freshPdo(): PDO
    {
        $pdo = TestDb::fresh();
        (new MigrationRunner($pdo, MigrationRunner::defaultMigrationsDir()))->run();

        return $pdo;
    }

    /** Vide les comptes (cascade sur tout le périmètre P9) et le journal. */
    public static function reset(PDO $pdo): void
    {
        $pdo->exec('DELETE FROM users');
        $pdo->exec('DELETE FROM audit_events');
    }

    /**
     * Compte avec ses rôles ; renvoie son id.
     *
     * @param list<string> $roles
     */
    public static function user(PDO $pdo, string $displayName, array $roles = ['apprenant']): int
    {
        $pdo->prepare('INSERT INTO users (email, password_hash, display_name) VALUES (?, ?, ?)')
            ->execute([uniqid('car', true) . '@example.org', Users::hashPassword('x-password'), $displayName]);
        $userId = (int) $pdo->lastInsertId();
        $bind = $pdo->prepare('INSERT INTO user_roles (user_id, role_id) SELECT ?, id FROM roles WHERE name = ?');
        foreach ($roles as $role) {
            $bind->execute([$userId, $role]);
        }

        return $userId;
    }

    /**
     * Cartographie stockée (opt-in) ; renvoie son id.
     *
     * @param array<string, mixed>|null $document null = fixture jour réelle
     */
    public static function carto(
        PDO $pdo,
        int $ownerId,
        string $visibility = 'cartographe',
        string $type = 'jour',
        ?array $document = null,
        string $titre = 'Feuille à relire',
    ): int {
        $document ??= $type === 'merge' ? self::mergeDocument() : self::jourDocument();
        $pdo->prepare(
            'INSERT INTO cartographies (user_id, type, titre, visibility, document, opt_in_at)
             VALUES (?, ?, ?, ?, ?, NOW())'
        )->execute([$ownerId, $type, $titre, $visibility, json_encode($document, JSON_THROW_ON_ERROR)]);

        return (int) $pdo->lastInsertId();
    }

    /** Lien apprenant <-> cartographe (ce que crée l'acceptation d'un code). */
    public static function link(PDO $pdo, int $apprenantId, int $cartographeId): void
    {
        $pdo->prepare('INSERT INTO cartographe_links (apprenant_id, cartographe_id) VALUES (?, ?)')
            ->execute([$apprenantId, $cartographeId]);
    }

    /** Code d'invitation posé en SQL ; $expiresInDays < 0 = déjà expiré. */
    public static function invitation(PDO $pdo, int $apprenantId, string $code, int $expiresInDays = 30): void
    {
        $pdo->prepare(
            'INSERT INTO cartographe_invitations (apprenant_id, code, expires_at)
             VALUES (?, ?, DATE_ADD(NOW(), INTERVAL ? DAY))'
        )->execute([$apprenantId, $code, $expiresInDays]);
    }

    /** @return array<string, mixed> document cartographie-jour réel, valide au schéma */
    public static function jourDocument(): array
    {
        return self::fixture('cartographie-jour-2026-01-05.json');
    }

    /** @return array<string, mixed> document cartographie-merge réel, valide au schéma */
    public static function mergeDocument(): array
    {
        return self::fixture('cartographie-merge-3-jours.json');
    }

    public static function count(PDO $pdo, string $sql): int
    {
        return (int) $pdo->query($sql)->fetchColumn();
    }

    /** @return array<string, mixed> */
    private static function fixture(string $name): array
    {
        $path = \dirname(__DIR__, 4) . '/schemas/fixtures/' . $name;

        return json_decode((string) file_get_contents($path), true, 512, JSON_THROW_ON_ERROR);
    }
}
