<?php

declare(strict_types=1);

/**
 * CLI migration runner (idempotent, forward-only — ADR-008).
 *
 * Usage (dev): docker compose run --rm php php ../scripts/migrate.php
 *         or : docker compose exec php php /var/www/html/scripts/migrate.php
 *
 * Config via env: DB_HOST, DB_NAME, DB_USER, DB_PASSWORD (optional DB_PORT).
 * Exit code 0 on success, 1 on failure.
 */

$root = dirname(__DIR__);
$autoload = $root . '/api/vendor/autoload.php';
if (is_file($autoload)) {
    require $autoload;
} else {
    // Composer not installed (bare clone): load the few classes we need.
    require $root . '/api/src/Env.php';
    require $root . '/api/src/Db.php';
    require $root . '/api/src/MigrationRunner.php';
}

use Humanome\Db;
use Humanome\MigrationRunner;

if (!Db::isConfigured()) {
    fwrite(STDERR, "Error: DB_HOST is not set (expected DB_HOST/DB_NAME/DB_USER/DB_PASSWORD in env).\n");
    exit(1);
}

try {
    $runner = new MigrationRunner(Db::get(), $root . '/scripts/migrations');
    $result = $runner->run();
} catch (Throwable $e) {
    fwrite(STDERR, 'Migration failed: ' . $e->getMessage() . "\n");
    exit(1);
}

foreach ($result['applied'] as $filename) {
    echo "applied: {$filename}\n";
}
printf("done — %d applied, %d already up to date.\n", count($result['applied']), $result['skipped']);
exit(0);
