<?php

declare(strict_types=1);

/**
 * Seed du modèle de compétence ATOMIQUE (migration 016) depuis le corpus.
 * Logique dans Humanome\Referentiel\CompetenceSeeder (partagée avec l'endpoint
 * POST /api/admin/seed-competences). Idempotent, applique le gate de parité.
 *
 * Usage (dev) : docker compose run --rm -w /var/www/html php php scripts/seed-competences.php
 */

$root = dirname(__DIR__);
$autoload = $root . '/api/vendor/autoload.php';
if (!is_file($autoload)) {
    fwrite(STDERR, "Error: composer autoload not found — run composer install\n");
    exit(1);
}
require $autoload;

use Humanome\Db;
use Humanome\Referentiel\CompetenceSeeder;

if (!Db::isConfigured()) {
    fwrite(STDERR, "Error: DB not configured (DB_HOST/DB_NAME/DB_USER/DB_PASSWORD)\n");
    exit(1);
}
$richPath = $root . '/scripts/data/competences-v7.json';
if (!is_file($richPath)) {
    fwrite(STDERR, "Error: {$richPath} introuvable (régénérer depuis les YAML)\n");
    exit(1);
}
$rich = json_decode((string) file_get_contents($richPath), true, 512, JSON_THROW_ON_ERROR)['competences'] ?? [];

$fiches = [];
$fichesPath = $root . '/scripts/data/fiches-v7.json';
if (is_file($fichesPath)) {
    $fiches = json_decode((string) file_get_contents($fichesPath), true, 512, JSON_THROW_ON_ERROR);
}

try {
    $r = (new CompetenceSeeder(Db::get()))->seed($rich, $fiches);
} catch (Throwable $e) {
    fwrite(STDERR, 'Seed échoué : ' . $e->getMessage() . "\n");
    exit(1);
}

printf(
    "pôles %d · compétences %d importées / %d inchangées / %d backfillées · fiches %d · gate parité OK (%s) · lockfile %d liens\nseed terminé.\n",
    $r['poles'],
    $r['imported'],
    $r['unchanged'],
    $r['backfilled'],
    $r['fiches'],
    substr($r['parityHash'], 0, 12) . '…',
    $r['lockLinks'],
);
exit(0);
