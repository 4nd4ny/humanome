<?php

declare(strict_types=1);

namespace Humanome\Tests;

use Humanome\Db;
use Humanome\Env;
use PDO;

/**
 * Test database helpers: everything runs against a dedicated humanome_test
 * database (created as MySQL root) so the humanome dev database is never
 * polluted by the test suite.
 */
final class TestDb
{
    public const NAME = 'humanome_test';

    /** @var array<string, string|null> */
    private static array $savedEnv = [];

    public static function rootPdo(): PDO
    {
        $dsn = sprintf(
            'mysql:host=%s;port=%s;charset=utf8mb4',
            Env::get('DB_HOST', 'mysql'),
            Env::get('DB_PORT', '3306'),
        );

        return new PDO($dsn, 'root', Env::get('DB_ROOT_PASSWORD', 'root_dev'), [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]);
    }

    /** Drop and recreate humanome_test, return a connection using it. */
    public static function fresh(): PDO
    {
        $pdo = self::rootPdo();
        $pdo->exec('DROP DATABASE IF EXISTS ' . self::NAME);
        $pdo->exec('CREATE DATABASE ' . self::NAME
            . ' CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
        $pdo->exec('USE ' . self::NAME);

        return $pdo;
    }

    /** Connection on humanome_test, creating the database if needed. */
    public static function pdo(): PDO
    {
        $pdo = self::rootPdo();
        $pdo->exec('CREATE DATABASE IF NOT EXISTS ' . self::NAME
            . ' CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
        $pdo->exec('USE ' . self::NAME);

        return $pdo;
    }

    /** Point the app's Db singleton (env-config) at humanome_test. */
    public static function overrideEnv(): void
    {
        self::setEnv('DB_NAME', self::NAME);
        self::setEnv('DB_USER', 'root');
        self::setEnv('DB_PASSWORD', Env::get('DB_ROOT_PASSWORD', 'root_dev'));
        Db::reset();
    }

    public static function setEnv(string $key, string $value): void
    {
        if (!\array_key_exists($key, self::$savedEnv)) {
            self::$savedEnv[$key] = \array_key_exists($key, $_ENV) && \is_string($_ENV[$key])
                ? $_ENV[$key]
                : null;
        }
        $_ENV[$key] = $value;
    }

    public static function restoreEnv(): void
    {
        foreach (self::$savedEnv as $key => $value) {
            if ($value === null) {
                unset($_ENV[$key]);
            } else {
                $_ENV[$key] = $value;
            }
        }
        self::$savedEnv = [];
        Db::reset();
    }
}
