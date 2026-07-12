<?php

declare(strict_types=1);

namespace Humanome\Tests;

use Humanome\MigrationRunner;
use PDO;
use PHPUnit\Framework\TestCase;

final class MigrationRunnerTest extends TestCase
{
    private static function migrationsDir(): string
    {
        return MigrationRunner::defaultMigrationsDir();
    }

    /** @return list<string> */
    private static function migrationFiles(): array
    {
        $files = array_map('basename', glob(self::migrationsDir() . '/*.sql') ?: []);
        sort($files, SORT_STRING);

        return $files;
    }

    public function testAppliesAllMigrationsOnFreshDatabase(): PDO
    {
        $pdo = TestDb::fresh();
        $runner = new MigrationRunner($pdo, self::migrationsDir());

        $result = $runner->run();

        self::assertSame(self::migrationFiles(), $result['applied']);
        self::assertSame(0, $result['skipped']);

        $tables = $pdo->query('SHOW TABLES')->fetchAll(PDO::FETCH_COLUMN);
        foreach ([
            'schema_migrations', 'users', 'roles', 'user_roles', 'sessions',
            'rate_limits', 'referentiel_versions', 'prompt_packages',
            'prompt_versions', 'cartographies', 'share_links',
            'training_progress', 'user_api_keys', 'audit_events',
        ] as $table) {
            self::assertContains($table, $tables, "table {$table} must exist");
        }

        $roles = $pdo->query('SELECT name FROM roles ORDER BY id')->fetchAll(PDO::FETCH_COLUMN);
        self::assertSame(
            ['apprenant', 'cartographe', 'promptologue', 'epistemiarque', 'employeur', 'etablissement', 'admin'],
            $roles,
        );

        return $pdo;
    }

    /** @depends testAppliesAllMigrationsOnFreshDatabase */
    public function testSecondRunIsANoOp(PDO $pdo): void
    {
        $runner = new MigrationRunner($pdo, self::migrationsDir());

        $result = $runner->run();

        self::assertSame([], $result['applied']);
        self::assertSame(\count(self::migrationFiles()), $result['skipped']);
    }

    public function testRateLimitCounterIncrementsAtomically(): void
    {
        $pdo = TestDb::pdo();
        (new MigrationRunner($pdo, self::migrationsDir()))->run();
        $pdo->exec("DELETE FROM rate_limits WHERE bucket = 'test:bucket'");

        $sql = "INSERT INTO rate_limits (bucket, window_start, counter) VALUES ('test:bucket', 100, 1)
                ON DUPLICATE KEY UPDATE counter = counter + 1";
        $pdo->exec($sql);
        $pdo->exec($sql);
        $pdo->exec($sql);

        $counter = $pdo->query(
            "SELECT counter FROM rate_limits WHERE bucket = 'test:bucket' AND window_start = 100"
        )->fetchColumn();
        self::assertSame(3, (int) $counter);
    }

    public function testSplitStatementsIgnoresQuotedSemicolonsAndComments(): void
    {
        $sql = <<<'SQL'
        -- leading comment; with semicolon
        INSERT INTO t (a) VALUES ('x;y');
        # another comment
        UPDATE t SET a = "z;" WHERE a = 'x;y';
        SQL;

        $statements = MigrationRunner::splitStatements($sql);

        self::assertCount(2, $statements);
        self::assertSame("INSERT INTO t (a) VALUES ('x;y')", $statements[0]);
        self::assertSame('UPDATE t SET a = "z;" WHERE a = \'x;y\'', $statements[1]);
    }
}
