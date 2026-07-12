<?php

declare(strict_types=1);

/**
 * Exports every PUBLISHED referentiel version to static JSON files (P4 /
 * plan M3): the public consultation page reads these files directly —
 * zero PHP involved at consultation time.
 *
 * Usage (dev): docker compose run --rm php php scripts/export-referentiel-static.php [outDir]
 * Default output: web/public/data/referentiel/
 *   - <referentielId>-v<semver>.json  (one schema-valid document per version)
 *   - index.json                      (list {referentielId, semver, label, publishedAt, fichier})
 *
 * Config via env: DB_HOST, DB_NAME, DB_USER, DB_PASSWORD (optional DB_PORT).
 * Exit code 0 on success, 1 on failure.
 */

$root = dirname(__DIR__);
$autoload = $root . '/api/vendor/autoload.php';
if (!is_file($autoload)) {
    fwrite(STDERR, "Error: composer autoload not found — run: docker compose run --rm php composer install\n");
    exit(1);
}
require $autoload;

use Humanome\Db;
use Humanome\Referentiel\StaticExporter;

$outDir = $argv[1] ?? $root . '/web/public/data/referentiel';

if (!Db::isConfigured()) {
    fwrite(STDERR, "Error: DB_HOST is not set (expected DB_HOST/DB_NAME/DB_USER/DB_PASSWORD in env).\n");
    exit(1);
}

try {
    $result = StaticExporter::export(Db::get(), $outDir);
} catch (Throwable $e) {
    fwrite(STDERR, 'Export failed: ' . $e->getMessage() . "\n");
    exit(1);
}

foreach ($result['files'] as $file) {
    echo "wrote: {$file}\n";
}
printf("done — %d published version(s) exported to %s\n", $result['count'], $outDir);
exit(0);
