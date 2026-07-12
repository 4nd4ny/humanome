<?php

declare(strict_types=1);

/**
 * Periodic maintenance — cron entry point (P12.2/P13, cahier §6).
 *
 * Two housekeeping duties, both counters-only (never any content, §6.5):
 *   1. purge share links whose expiry (or revocation) is older than 30 days —
 *      the "application de la politique d'expiration des liens de partage"
 *      (P12) and the dormant-link cleanup;
 *   2. reset the public-demo daily counters by pruning past-day rows of
 *      llm_usage_daily (the breaker keys on the UTC day, so a new day already
 *      starts at zero — TODAY's live row is deliberately kept intact) and
 *      dropping expired proof-of-work challenges.
 *
 * FREQUENCY: run DAILY (OVH cron). Idempotent — running it more often is
 * harmless. Production runs it through POST /api/admin/maintenance
 * (X-Migrate-Token, api/src/routes/system.php) exactly like the worker tick
 * (no shell scripts ship to the OVH release, ADR-008); this CLI is the
 * local/dev equivalent:
 *
 *     php scripts/maintenance.php
 *
 * The SQL below is the single source of truth; the system.php route keeps an
 * inline copy of the SAME statements (the route file is the only api/src file
 * P12 may touch, and it must stay self-contained for the release). Both are
 * covered by tests asserting identical post-conditions, so drift goes red.
 *
 * Output: the operation counters as one JSON line.
 */

namespace Humanome\Maintenance;

use PDO;

final class Maintenance
{
    /** Grace window (days) before an expired/revoked share link is purged. */
    public const SHARE_LINK_GRACE_DAYS = 30;

    /**
     * @return array{shareLinksPurged: int, demoDaysPruned: int, powChallengesPruned: int}
     */
    public static function run(PDO $pdo): array
    {
        // 1. Dead share links past the 30-day grace window (expired OR revoked).
        $links = $pdo->prepare(
            'DELETE FROM share_links
              WHERE (expires_at IS NOT NULL AND expires_at < (NOW() - INTERVAL ' . self::SHARE_LINK_GRACE_DAYS . ' DAY))
                 OR (revoked_at IS NOT NULL AND revoked_at < (NOW() - INTERVAL ' . self::SHARE_LINK_GRACE_DAYS . ' DAY))'
        );
        $links->execute();
        $shareLinksPurged = $links->rowCount();

        // 2a. Demo daily counters: drop past UTC days; keep today's live row so
        // the daily budget breaker (UsageCounters, gmdate UTC) stays intact.
        $demo = $pdo->prepare('DELETE FROM llm_usage_daily WHERE usage_date < UTC_DATE()');
        $demo->execute();
        $demoDaysPruned = $demo->rowCount();

        // 2b. Expired one-time PoW challenges (TTL 2 min; pruned opportunistically
        // by the proxy, swept here as well).
        $pow = $pdo->prepare('DELETE FROM llm_pow_challenges WHERE expires_at < UNIX_TIMESTAMP()');
        $pow->execute();
        $powChallengesPruned = $pow->rowCount();

        return [
            'shareLinksPurged' => $shareLinksPurged,
            'demoDaysPruned' => $demoDaysPruned,
            'powChallengesPruned' => $powChallengesPruned,
        ];
    }
}

// ---------------------------------------------------------------------------
// CLI: php scripts/maintenance.php  (local/dev cron; prod uses the API route)
// ---------------------------------------------------------------------------

if (PHP_SAPI === 'cli' && isset($argv[0]) && realpath($argv[0]) === realpath(__FILE__)) {
    $root = \dirname(__DIR__);
    foreach ([$root . '/api/vendor/autoload.php', $root . '/vendor/autoload.php'] as $autoload) {
        if (is_file($autoload)) {
            require $autoload;
            break;
        }
    }
    if (!class_exists(\Humanome\Db::class)) {
        fwrite(STDERR, "[maintenance] autoload introuvable (vendor/)\n");
        exit(1);
    }

    // Same secrets resolution as scripts/worker.php.
    foreach ([
        getenv('HUMANOME_SHARED_DIR') ?: null,
        $root . '/../shared',
        $root . '/api',
    ] as $dir) {
        if ($dir !== null && $dir !== '' && is_file($dir . '/.env')) {
            \Dotenv\Dotenv::createImmutable($dir)->safeLoad();
            break;
        }
    }
    if (!\Humanome\Db::isConfigured()) {
        fwrite(STDERR, "[maintenance] base de données non configurée\n");
        exit(1);
    }

    try {
        $counters = Maintenance::run(\Humanome\Db::get());
    } catch (\Throwable $e) {
        fwrite(STDERR, '[maintenance] échec : ' . $e->getMessage() . "\n");
        exit(1);
    }

    echo json_encode($counters, JSON_THROW_ON_ERROR), "\n";
    exit(0);
}
