<?php

declare(strict_types=1);

namespace Humanome\Tests\UseCases\Unit;

use Humanome\Auth\Users;
use Humanome\MigrationRunner;
use Humanome\Tests\TestDb;
use PDO;
use PDOException;
use PHPUnit\Framework\Attributes\TestDox;
use PHPUnit\Framework\TestCase;

/**
 * UC-CPT-05 — Suivre sa progression de formation : tests UNITAIRES.
 *
 * Fiche : docs/cas-utilisation/compte/UC-CPT-05-suivre-progression-formation.md
 *
 * Côté serveur, la logique de GET/PUT /api/training/progress est écrite dans
 * la route (pas de classe de domaine) ; elle repose sur un contrat de stockage
 * que ce test vérifie directement : clé primaire (compte, parcours, chapitre)
 * qui rend l'écriture idempotente, bornes de longueur alignées sur le motif
 * d'identifiant de la route, et effacement en cascade avec le compte.
 */
final class UcCpt05SuivreProgressionFormationTest extends TestCase
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

    #[TestDox('UC-CPT-05-U01 — table training_progress : un chapitre terminé = une ligne (compte, parcours, chapitre), jamais de doublon ; purge en cascade')]
    public function testU01StorageContract(): void
    {
        $userId = Users::create(self::$pdo, 'ada@example.org', Users::hashPassword('correct horse battery'), 'Ada');
        $insert = self::$pdo->prepare('INSERT INTO training_progress (user_id, parcours, chapitre) VALUES (?, ?, ?)');
        $insert->execute([$userId, 'apprenant', '01-pourquoi-un-portfolio-reflexif']);

        try {
            $insert->execute([$userId, 'apprenant', '01-pourquoi-un-portfolio-reflexif']);
            self::fail('la clé primaire doit refuser un doublon');
        } catch (PDOException $e) {
            self::assertSame('23000', $e->getCode());
        }
        // Même chapitre dans un autre parcours : ligne distincte.
        $insert->execute([$userId, 'cartographe', '01-pourquoi-un-portfolio-reflexif']);

        $columns = self::$pdo->query(
            "SELECT COLUMN_NAME, CHARACTER_MAXIMUM_LENGTH FROM information_schema.COLUMNS
              WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'training_progress'
                AND COLUMN_NAME IN ('parcours', 'chapitre') ORDER BY COLUMN_NAME"
        )->fetchAll(PDO::FETCH_KEY_PAIR);
        self::assertEquals(['chapitre' => 64, 'parcours' => 64], $columns, 'motif de la route : 64 caractères au plus');
        $pk = self::$pdo->query(
            "SELECT GROUP_CONCAT(COLUMN_NAME ORDER BY ORDINAL_POSITION) FROM information_schema.KEY_COLUMN_USAGE
              WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'training_progress' AND CONSTRAINT_NAME = 'PRIMARY'"
        )->fetchColumn();
        self::assertSame('user_id,parcours,chapitre', $pk);

        Users::purge(self::$pdo, $userId);
        self::assertSame(0, (int) self::$pdo->query('SELECT COUNT(*) FROM training_progress')->fetchColumn());
    }
}
