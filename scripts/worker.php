<?php

declare(strict_types=1);

/**
 * Mass-cartography worker — CLI entry point (P11, ADR-005,
 * docs/plan-masse.md). One BOUNDED tick per invocation, made for the OVH
 * cron (no long processes on shared hosting):
 *
 *     php scripts/worker.php
 *
 * The same tick is reachable without SSH through POST /api/admin/worker-tick
 * (X-Migrate-Token, api/src/routes/worker.php).
 *
 * Environment knobs (all optional): WORKER_TICK_BUDGET_SECONDS (default 40),
 * WORKER_TICK_MAX_CALLS (bound a tick by LLM calls — dev/rehearsal tool),
 * WORKER_MAX_TOKENS (8192), WORKER_MODEL (claude-sonnet-4-5),
 * WORKER_PROVIDER=mock (local dev without a key), ANTHROPIC_API_KEY
 * (provider 'humanome'), SODIUM_MASTER_KEY (endpoint keys at rest).
 *
 * Output: the tick counters as one JSON line — counters only, never any
 * portfolio or document content (cahier §6.5).
 */

$root = dirname(__DIR__);

// Repo layout (scripts/ next to api/) or release layout (ADR-008: the api
// contents live at the release root, scripts/ next to src/ and vendor/).
foreach ([$root . '/api/vendor/autoload.php', $root . '/vendor/autoload.php'] as $autoload) {
    if (is_file($autoload)) {
        require $autoload;
        break;
    }
}
if (!class_exists(\Humanome\Worker\Tick::class)) {
    fwrite(STDERR, "[worker] autoload introuvable (vendor/)\n");
    exit(1);
}

// Same secrets resolution as Bootstrap::envDir(): ~/app/shared on OVH
// (outside the webroot), api/.env in dev, plain env vars in Docker.
$envCandidates = [
    getenv('HUMANOME_SHARED_DIR') ?: null,
    $root . '/../shared', // OVH: ~/app/releases/<ts>/scripts -> ~/app/shared
    $root . '/api',
];
foreach ($envCandidates as $dir) {
    if ($dir !== null && $dir !== '' && is_file($dir . '/.env')) {
        \Dotenv\Dotenv::createImmutable($dir)->safeLoad();
        break;
    }
}

if (!\Humanome\Db::isConfigured()) {
    fwrite(STDERR, "[worker] base de données non configurée\n");
    exit(1);
}

try {
    $counters = (new \Humanome\Worker\Tick(\Humanome\Db::get()))->run();
} catch (\Throwable $e) {
    fwrite(STDERR, '[worker] tick en échec : ' . $e->getMessage() . "\n");
    exit(1);
}

echo json_encode($counters, JSON_THROW_ON_ERROR), "\n";
exit(0);
