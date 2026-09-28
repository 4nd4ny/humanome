<?php

declare(strict_types=1);

namespace Humanome\Tests\UseCases\Unit;

use Humanome\Auth\Users;
use Humanome\MigrationRunner;
use Humanome\Tests\TestDb;
use PDO;
use PHPUnit\Framework\Attributes\TestDox;
use PHPUnit\Framework\TestCase;

/**
 * UC-VIS-04 — Se repérer (accueil, navigation, guides, aide, confidentialité) : tests UNITAIRES (API).
 *
 * Fiche : docs/cas-utilisation/visiteur/UC-VIS-04-se-reperer-guides-aide.md
 *
 * Côté serveur, la seule donnée qui façonne la navigation est la liste des
 * rôles de la session (GET /api/auth/me → user.roles). Users::rolesOf est
 * appelé directement : c'est lui qui décide des familles d'intention affichées.
 */
final class UcVis04SeRepererTest extends TestCase
{
    private static PDO $pdo;

    public static function setUpBeforeClass(): void
    {
        self::$pdo = TestDb::fresh();
        (new MigrationRunner(self::$pdo, MigrationRunner::defaultMigrationsDir()))->run();
    }

    protected function setUp(): void
    {
        self::$pdo->exec('DELETE FROM users');
    }

    private static function user(string ...$roles): int
    {
        self::$pdo->prepare('INSERT INTO users (email, password_hash, display_name) VALUES (?, ?, ?)')
            ->execute([uniqid('nav', true) . '@example.org', Users::hashPassword('x-password'), 'Nav']);
        $id = (int) self::$pdo->lastInsertId();
        foreach ($roles as $role) {
            Users::assignRole(self::$pdo, $id, $role);
        }

        return $id;
    }

    #[TestDox('UC-VIS-04-U01 — rolesOf : les rôles de la session, triés par nom (source de la navigation par familles)')]
    public function testU01RolesOfIsSortedAndComplete(): void
    {
        $id = self::user('etablissement', 'apprenant', 'cartographe');

        self::assertSame(['apprenant', 'cartographe', 'etablissement'], Users::rolesOf(self::$pdo, $id));
    }

    #[TestDox('UC-VIS-04-U02 — rolesOf : compte sans rôle ou inconnu → liste vide (navigation « visiteur » : Découvrir + Compte)')]
    public function testU02NoRoleMeansVisitorNavigation(): void
    {
        self::assertSame([], Users::rolesOf(self::$pdo, self::user()));
        self::assertSame([], Users::rolesOf(self::$pdo, 999_999));
        $this->expectException(\RuntimeException::class);
        Users::assignRole(self::$pdo, self::user(), 'role-inexistant');
    }
}
