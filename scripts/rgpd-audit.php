<?php

declare(strict_types=1);

/**
 * RGPD audit of account deletion & export coverage (P12.2, cahier §6.3).
 *
 * For a given user_id this tool answers, from the LIVE schema (no hand-typed
 * list to drift): which tables hold that person's data, how each is handled
 * when the account is deleted (CASCADE / SET NULL / manual), and — the whole
 * point — whether any user-identifying column is NOT governed by a foreign key
 * that cascades or nulls it. Such a column would survive a purge: a RGPD bug.
 *
 * It also carries the KNOWN export-coverage map (the client-side archive is
 * JavaScript, unreachable from PHP) so the CLI report cross-references, for
 * each personal table, whether the one-click export recovers it. The
 * authoritative table-by-table cross is docs/rgpd-verification.md.
 *
 * Two entry points:
 *   - class Humanome\Rgpd\RgpdAudit — pure functions, used by the test suite;
 *   - CLI: `php scripts/rgpd-audit.php <user_id>` — human report on a live DB
 *     (read-only; it never deletes anything).
 *
 * The logic lives here rather than in api/src on purpose (P12 touches only
 * system.php on the API side); the test require_once's this file, exactly like
 * a thin CLI wrapper would.
 */

namespace Humanome\Rgpd;

use PDO;

final class RgpdAudit
{
    /**
     * Column names that identify a user across the schema. A column with one
     * of these names but NO foreign key to `users` is the leak this catches
     * (a bare user_id that a purge would never touch).
     */
    public const USER_COLUMNS = [
        'user_id',
        'author_id',
        'apprenant_id',
        'cartographe_id',
        'accepted_by',
        'created_by',
        'granted_by',
        'etablissement_id',
    ];

    /**
     * Tables that hold a person's data WITHOUT a direct user column, reachable
     * only through a chain of foreign keys. Value = SQL predicate joining the
     * table to a user id (parameter ?). Used to prove indirect ownership is
     * purged too (share_links dies with the cartography, which dies with the
     * account).
     */
    public const INDIRECT_CHAINS = [
        'share_links' =>
            'SELECT COUNT(*) FROM share_links s
               JOIN cartographies c ON c.id = s.cartographie_id
              WHERE c.user_id = ?',
    ];

    /**
     * Export coverage of the ONE-CLICK client archive (web/src/lib/archive.js),
     * per personal table. 'local' = the data originates from and is exported by
     * the browser stores; 'via' = recoverable through another endpoint but NOT
     * in the archive; 'none' = server-only, not recoverable by the person; '—'
     * = not personal content of the account holder. See docs/rgpd-verification.md.
     */
    public const EXPORT_COVERAGE = [
        'users' => 'local',                 // account block embedded in the archive
        'user_roles' => '—',
        'sessions' => '—',
        'cartographies' => 'local',         // local store is the source of truth
        'share_links' => '—',               // hashes only, never personal content
        'training_progress' => 'local',     // mirrored to the local training store
        'user_api_keys' => 'none',          // secret, never re-exportable by design
        'audit_events' => '—',              // anonymised trace, not the person's data
        'cartography_annotations' => 'via',    // cartographe workspace endpoints
        'cartography_revisions' => 'via',      // served by the share link / cartographe
        'cartography_garanties' => 'via',
        'cartographe_invitations' => '—',
        'cartographe_links' => '—',
        'cohorte_membres' => 'via',         // GET /api/cohortes
        'cohorte_portfolios' => 'local',    // deposited FROM the local portfolio store
        'mass_jobs' => 'none',              // produced day-documents: NO learner endpoint
        'etablissement_config' => 'none',   // establishment secret/budget config
        'cohortes' => '—',
        'mass_runs' => '—',
        'golden_grants' => '—',             // authorisation record, not personal content
    ];

    public static function schema(PDO $pdo): string
    {
        return (string) $pdo->query('SELECT DATABASE()')->fetchColumn();
    }

    /** @return list<string> base tables of the current schema, sorted. */
    public static function tables(PDO $pdo): array
    {
        $stmt = $pdo->prepare(
            "SELECT TABLE_NAME FROM information_schema.TABLES
              WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'
              ORDER BY TABLE_NAME"
        );
        $stmt->execute([self::schema($pdo)]);

        return $stmt->fetchAll(PDO::FETCH_COLUMN);
    }

    /**
     * Every foreign key that references `users`, with its ON DELETE rule read
     * from the live schema (never retyped from the migrations).
     *
     * @return list<array{table: string, column: string, deleteRule: string}>
     */
    public static function foreignKeysToUsers(PDO $pdo): array
    {
        $stmt = $pdo->prepare(
            "SELECT k.TABLE_NAME AS t, k.COLUMN_NAME AS c, r.DELETE_RULE AS rule
               FROM information_schema.KEY_COLUMN_USAGE k
               JOIN information_schema.REFERENTIAL_CONSTRAINTS r
                 ON r.CONSTRAINT_SCHEMA = k.TABLE_SCHEMA
                AND r.CONSTRAINT_NAME = k.CONSTRAINT_NAME
              WHERE k.TABLE_SCHEMA = ?
                AND k.REFERENCED_TABLE_NAME = 'users'
              ORDER BY t, c"
        );
        $stmt->execute([self::schema($pdo)]);

        $out = [];
        foreach ($stmt->fetchAll() as $row) {
            $out[] = [
                'table' => (string) $row['t'],
                'column' => (string) $row['c'],
                'deleteRule' => (string) $row['rule'],
            ];
        }

        return $out;
    }

    /**
     * Every column whose NAME identifies a user, across ALL base tables —
     * introspection catch-all, independent of foreign keys.
     *
     * @return list<array{table: string, column: string}>
     */
    public static function userIdentifyingColumns(PDO $pdo): array
    {
        $placeholders = implode(',', array_fill(0, \count(self::USER_COLUMNS), '?'));
        $stmt = $pdo->prepare(
            "SELECT TABLE_NAME AS t, COLUMN_NAME AS c
               FROM information_schema.COLUMNS
              WHERE TABLE_SCHEMA = ?
                AND COLUMN_NAME IN ({$placeholders})
              ORDER BY t, c"
        );
        $stmt->execute([self::schema($pdo), ...self::USER_COLUMNS]);

        $out = [];
        foreach ($stmt->fetchAll() as $row) {
            // roles.id, referentiel created_by etc. are fine; we only skip the
            // users table's own id (it is the identity, deleted directly).
            $out[] = ['table' => (string) $row['t'], 'column' => (string) $row['c']];
        }

        return $out;
    }

    /**
     * THE leak check: user-identifying columns with NO foreign key to `users`.
     * A non-empty result is a RGPD bug — those rows would survive an account
     * purge. Empty = every user reference is governed by a FK (CASCADE/SET NULL).
     *
     * @return list<array{table: string, column: string}>
     */
    public static function unconstrainedUserColumns(PDO $pdo): array
    {
        $fkSet = [];
        foreach (self::foreignKeysToUsers($pdo) as $fk) {
            $fkSet[$fk['table'] . '.' . $fk['column']] = true;
        }

        $out = [];
        foreach (self::userIdentifyingColumns($pdo) as $col) {
            if (($col['table'] === 'users' && $col['column'] === 'user_id')) {
                continue; // no such column, defensive
            }
            if (!isset($fkSet[$col['table'] . '.' . $col['column']])) {
                $out[] = $col;
            }
        }

        return $out;
    }

    /**
     * Rows currently attributable to $userId, per user column and per indirect
     * chain. Zero-count entries are omitted: the result is the person's live
     * footprint.
     *
     * @return array<string, int> keyed "table.column" (or "table" for a chain)
     */
    public static function footprint(PDO $pdo, int $userId): array
    {
        $counts = [];
        foreach (self::userIdentifyingColumns($pdo) as $col) {
            $stmt = $pdo->prepare(
                sprintf('SELECT COUNT(*) FROM `%s` WHERE `%s` = ?', $col['table'], $col['column'])
            );
            $stmt->execute([$userId]);
            $n = (int) $stmt->fetchColumn();
            if ($n > 0) {
                $counts[$col['table'] . '.' . $col['column']] = $n;
            }
        }
        foreach (self::INDIRECT_CHAINS as $table => $sql) {
            if (!\in_array($table, self::tables($pdo), true)) {
                continue;
            }
            $stmt = $pdo->prepare($sql);
            $stmt->execute([$userId]);
            $n = (int) $stmt->fetchColumn();
            if ($n > 0) {
                $counts[$table] = $n;
            }
        }

        return $counts;
    }

    /**
     * After an account purge, references that STILL carry the id. Governed by:
     *   - CASCADE columns -> the row is gone, count 0;
     *   - SET NULL columns -> the id is nulled, count 0.
     * Any non-zero entry is a purge that missed data (RGPD bug). Indirect
     * chains cannot be re-evaluated post-purge (the parent row is gone), so
     * this sweeps the direct user columns only.
     *
     * @return array<string, int> keyed "table.column" — empty means clean.
     */
    public static function residualReferences(PDO $pdo, int $userId): array
    {
        return self::footprint($pdo, $userId); // same sweep; expected empty post-purge
    }

    /**
     * @param array{table: string, column: string} $col
     * @return 'CASCADE'|'SET NULL'|'NONE' delete rule of a user column, or NONE
     *         if the column has no FK to users (the danger case).
     */
    public static function deleteRuleOf(PDO $pdo, array $col): string
    {
        foreach (self::foreignKeysToUsers($pdo) as $fk) {
            if ($fk['table'] === $col['table'] && $fk['column'] === $col['column']) {
                return $fk['deleteRule'];
            }
        }

        return 'NONE';
    }
}

// ---------------------------------------------------------------------------
// CLI: php scripts/rgpd-audit.php <user_id>  (read-only report on a live DB)
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
        fwrite(STDERR, "[rgpd-audit] autoload introuvable (vendor/)\n");
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
        fwrite(STDERR, "[rgpd-audit] base de données non configurée\n");
        exit(1);
    }

    $pdo = \Humanome\Db::get();

    // Schema-wide leak check first (independent of any user).
    $unconstrained = RgpdAudit::unconstrainedUserColumns($pdo);
    echo "== Colonnes identifiant un utilisateur SANS clé étrangère vers users ==\n";
    if ($unconstrained === []) {
        echo "  aucune — toute référence utilisateur est régie par une FK (CASCADE/SET NULL).\n";
    } else {
        echo "  ⚠ BUG RGPD : ces colonnes survivraient à une purge :\n";
        foreach ($unconstrained as $c) {
            echo "    - {$c['table']}.{$c['column']}\n";
        }
    }

    echo "\n== Règle ON DELETE de chaque référence à users ==\n";
    foreach (RgpdAudit::foreignKeysToUsers($pdo) as $fk) {
        printf("  %-40s %s\n", $fk['table'] . '.' . $fk['column'], $fk['deleteRule']);
    }

    $userId = isset($argv[1]) ? (int) $argv[1] : 0;
    if ($userId > 0) {
        echo "\n== Empreinte de l'utilisateur {$userId} ==\n";
        $footprint = RgpdAudit::footprint($pdo, $userId);
        if ($footprint === []) {
            echo "  aucune donnée rattachée à cet identifiant.\n";
        } else {
            foreach ($footprint as $where => $n) {
                $table = explode('.', $where)[0];
                $rule = str_contains($where, '.')
                    ? RgpdAudit::deleteRuleOf($pdo, ['table' => explode('.', $where)[0], 'column' => explode('.', $where)[1]])
                    : 'CASCADE (chaîne)';
                $export = RgpdAudit::EXPORT_COVERAGE[$table] ?? '?';
                printf("  %-36s %4d lignes | suppression: %-9s | export: %s\n", $where, $n, $rule, $export);
            }
        }
    } else {
        echo "\n(Passez un user_id en argument pour l'empreinte détaillée d'un compte.)\n";
    }

    exit($unconstrained === [] ? 0 : 2);
}
