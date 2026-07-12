<?php

declare(strict_types=1);

namespace Humanome;

use PDO;
use RuntimeException;

/**
 * Idempotent SQL migration runner (ADR-008), shared by the CLI
 * (scripts/migrate.php) and POST /api/admin/migrate.
 *
 * - schema_migrations tracks applied files (filename PK);
 * - GET_LOCK('humanome_migrate', 30) serializes concurrent runs;
 * - forward-only, expand/contract discipline (no down migrations);
 * - each file runs inside a transaction; MySQL DDL still auto-commits,
 *   so migrations should stay small and mostly-DDL per file.
 */
final class MigrationRunner
{
    public const LOCK_NAME = 'humanome_migrate';
    public const LOCK_TIMEOUT = 30;

    public function __construct(
        private readonly PDO $pdo,
        private readonly string $migrationsDir,
    ) {
    }

    /**
     * Layouts differ by one level: repo (api/src -> <repo>/scripts/migrations)
     * vs deployed release (<release>/src -> <release>/scripts/migrations, ADR-008).
     */
    public static function defaultMigrationsDir(): string
    {
        $candidates = [
            dirname(__DIR__) . '/scripts/migrations',    // release layout
            dirname(__DIR__, 2) . '/scripts/migrations', // dev repo layout
        ];
        foreach ($candidates as $dir) {
            if (is_dir($dir)) {
                return $dir;
            }
        }

        return $candidates[1];
    }

    /**
     * Apply every pending .sql file in lexicographic order.
     *
     * @return array{applied: list<string>, skipped: int}
     */
    public function run(): array
    {
        if (!is_dir($this->migrationsDir)) {
            throw new RuntimeException('Migrations directory not found: ' . $this->migrationsDir);
        }

        $files = glob($this->migrationsDir . '/*.sql') ?: [];
        sort($files, SORT_STRING);

        $this->acquireLock();
        try {
            $this->pdo->exec(
                'CREATE TABLE IF NOT EXISTS schema_migrations (
                    filename VARCHAR(191) NOT NULL,
                    applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (filename)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
            );

            $done = $this->pdo->query('SELECT filename FROM schema_migrations')
                ->fetchAll(PDO::FETCH_COLUMN);
            $applied = [];
            $skipped = 0;

            foreach ($files as $path) {
                $filename = basename($path);
                if (\in_array($filename, $done, true)) {
                    $skipped++;
                    continue;
                }
                $this->applyFile($path, $filename);
                $applied[] = $filename;
            }

            return ['applied' => $applied, 'skipped' => $skipped];
        } finally {
            $this->releaseLock();
        }
    }

    private function applyFile(string $path, string $filename): void
    {
        $sql = file_get_contents($path);
        if ($sql === false) {
            throw new RuntimeException('Cannot read migration file: ' . $filename);
        }

        $this->pdo->beginTransaction();
        try {
            foreach (self::splitStatements($sql) as $statement) {
                $this->pdo->exec($statement);
            }
            $insert = $this->pdo->prepare('INSERT INTO schema_migrations (filename) VALUES (?)');
            $insert->execute([$filename]);
            if ($this->pdo->inTransaction()) {
                $this->pdo->commit();
            }
        } catch (\Throwable $e) {
            if ($this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }
            throw new RuntimeException(
                sprintf('Migration %s failed: %s', $filename, $e->getMessage()),
                0,
                $e,
            );
        }
    }

    /**
     * Split a .sql file into individual statements: PDO::exec runs one
     * statement at a time so every error is reported at its statement.
     * Quote-aware (' " `) and strips -- / # line comments outside quotes.
     *
     * @return list<string>
     */
    public static function splitStatements(string $sql): array
    {
        $statements = [];
        $current = '';
        $quote = null;
        $length = \strlen($sql);

        for ($i = 0; $i < $length; $i++) {
            $char = $sql[$i];

            if ($quote !== null) {
                $current .= $char;
                if ($char === '\\' && $quote !== '`') {
                    if ($i + 1 < $length) {
                        $current .= $sql[++$i];
                    }
                } elseif ($char === $quote) {
                    $quote = null;
                }
                continue;
            }

            if ($char === "'" || $char === '"' || $char === '`') {
                $quote = $char;
                $current .= $char;
                continue;
            }

            // Line comments: "-- " (or -- at EOL) and "#".
            if ($char === '#' || ($char === '-' && ($sql[$i + 1] ?? '') === '-')) {
                while ($i < $length && $sql[$i] !== "\n") {
                    $i++;
                }
                $current .= "\n";
                continue;
            }

            if ($char === ';') {
                $trimmed = trim($current);
                if ($trimmed !== '') {
                    $statements[] = $trimmed;
                }
                $current = '';
                continue;
            }

            $current .= $char;
        }

        $trimmed = trim($current);
        if ($trimmed !== '') {
            $statements[] = $trimmed;
        }

        return $statements;
    }

    private function acquireLock(): void
    {
        $stmt = $this->pdo->prepare('SELECT GET_LOCK(?, ?)');
        $stmt->execute([self::LOCK_NAME, self::LOCK_TIMEOUT]);
        if ((int) $stmt->fetchColumn() !== 1) {
            throw new RuntimeException('Could not acquire migration lock (another run in progress?)');
        }
    }

    private function releaseLock(): void
    {
        $stmt = $this->pdo->prepare('SELECT RELEASE_LOCK(?)');
        $stmt->execute([self::LOCK_NAME]);
    }
}
