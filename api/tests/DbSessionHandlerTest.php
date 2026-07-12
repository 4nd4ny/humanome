<?php

declare(strict_types=1);

namespace Humanome\Tests;

use Humanome\DbSessionHandler;
use Humanome\MigrationRunner;
use PDO;
use PHPUnit\Framework\TestCase;

final class DbSessionHandlerTest extends TestCase
{
    private static PDO $pdo;

    public static function setUpBeforeClass(): void
    {
        self::$pdo = TestDb::fresh();
        (new MigrationRunner(self::$pdo, MigrationRunner::defaultMigrationsDir()))->run();
    }

    public function testWriteThenReadRoundTrip(): void
    {
        $handler = new DbSessionHandler(self::$pdo);

        self::assertTrue($handler->open('', DbSessionHandler::SESSION_NAME));
        self::assertTrue($handler->write('phpunit_sid_1', 'user_pref|s:4:"dark";'));
        self::assertSame('user_pref|s:4:"dark";', $handler->read('phpunit_sid_1'));

        // Overwrite (ON DUPLICATE KEY path).
        self::assertTrue($handler->write('phpunit_sid_1', 'user_pref|s:5:"light";'));
        self::assertSame('user_pref|s:5:"light";', $handler->read('phpunit_sid_1'));
        self::assertTrue($handler->close());
    }

    public function testReadUnknownSessionReturnsEmptyString(): void
    {
        $handler = new DbSessionHandler(self::$pdo);

        self::assertSame('', $handler->read('phpunit_sid_unknown'));
    }

    public function testDestroyDeletesTheRow(): void
    {
        $handler = new DbSessionHandler(self::$pdo);
        $handler->write('phpunit_sid_2', 'a|i:1;');

        self::assertTrue($handler->destroy('phpunit_sid_2'));
        self::assertSame('', $handler->read('phpunit_sid_2'));
    }

    public function testGcRemovesExpiredSessionsOnly(): void
    {
        $handler = new DbSessionHandler(self::$pdo);
        $handler->write('phpunit_sid_old', 'a|i:1;');
        $handler->write('phpunit_sid_new', 'a|i:2;');
        $stmt = self::$pdo->prepare('UPDATE sessions SET last_activity = ? WHERE id = ?');
        $stmt->execute([time() - 10_000, 'phpunit_sid_old']);

        $deleted = $handler->gc(3600);

        self::assertGreaterThanOrEqual(1, $deleted);
        self::assertSame('', $handler->read('phpunit_sid_old'));
        self::assertSame('a|i:2;', $handler->read('phpunit_sid_new'));
    }

    public function testBindUserAndRgpdCascadeOnUserPurge(): void
    {
        $handler = new DbSessionHandler(self::$pdo);
        $handler->write('phpunit_sid_3', 'logged|b:1;');

        self::$pdo->exec("DELETE FROM users WHERE email = 'session-test@example.org'");
        self::$pdo->prepare('INSERT INTO users (email, password_hash, display_name) VALUES (?, ?, ?)')
            ->execute(['session-test@example.org', password_hash('x', PASSWORD_DEFAULT), 'Session Test']);
        $userId = (int) self::$pdo->lastInsertId();

        $handler->bindUser('phpunit_sid_3', $userId);
        $bound = self::$pdo->query(
            "SELECT user_id FROM sessions WHERE id = 'phpunit_sid_3'"
        )->fetchColumn();
        self::assertSame($userId, (int) $bound);

        // A routine session write must not detach the user.
        $handler->write('phpunit_sid_3', 'logged|b:1;seen|i:2;');
        $stillBound = self::$pdo->query(
            "SELECT user_id FROM sessions WHERE id = 'phpunit_sid_3'"
        )->fetchColumn();
        self::assertSame($userId, (int) $stillBound);

        // RGPD purge: deleting the account deletes its sessions (FK cascade).
        self::$pdo->prepare('DELETE FROM users WHERE id = ?')->execute([$userId]);
        self::assertSame('', $handler->read('phpunit_sid_3'));
    }
}
