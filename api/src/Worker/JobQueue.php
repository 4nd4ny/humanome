<?php

declare(strict_types=1);

namespace Humanome\Worker;

use PDO;

/**
 * MySQL job queue of the mass cartography (ADR-005, docs/plan-masse.md §1/§3).
 *
 * Invariants:
 * - one job = (member, day); per-pole checkpoint INSIDE the job row;
 * - reservation = transaction + FOR UPDATE SKIP LOCKED + 5-minute lease;
 *   a running job whose lease expired is reservable again (killed tick,
 *   disconnected runner), checkpoint intact — no LLM call is ever redone;
 * - every worker write is conditional on status='running': a concurrent
 *   cancellation (or budget mark) wins and the worker abandons silently;
 * - the PHP cron tick only serves establishments on the 'humanome' provider;
 *   'endpoint' jobs belong to the machine runner (/api/worker/*), whose
 *   local infrastructure OVH cannot reach (plan-masse §5).
 */
final class JobQueue
{
    public const LEASE_SECONDS = 300;
    public const MAX_ATTEMPTS = 3;

    public function __construct(private readonly PDO $pdo)
    {
    }

    // ------------------------------------------------------------- enqueue

    /**
     * Creates the run (frozen package + referentiel versions) and one queued
     * job per (deposited member × day of their deposit).
     *
     * @param list<array{id: int, userId: int, dates: list<string>}> $deposits
     * @return array{runId: int, jobs: int}
     */
    public function enqueueRun(
        int $etablissementId,
        int $cohorteId,
        string $packageSlug,
        string $packageSemver,
        string $referentielId,
        string $referentielSemver,
        array $deposits,
    ): array {
        $this->pdo->prepare(
            'INSERT INTO mass_runs (etablissement_id, cohorte_id, prompt_package_slug,
                prompt_package_semver, referentiel_id, referentiel_semver)
             VALUES (?, ?, ?, ?, ?, ?)'
        )->execute([$etablissementId, $cohorteId, $packageSlug, $packageSemver, $referentielId, $referentielSemver]);
        $runId = (int) $this->pdo->lastInsertId();

        $insert = $this->pdo->prepare(
            'INSERT IGNORE INTO mass_jobs (run_id, user_id, portfolio_id, day_date) VALUES (?, ?, ?, ?)'
        );
        $jobs = 0;
        foreach ($deposits as $deposit) {
            foreach ($deposit['dates'] as $date) {
                $insert->execute([$runId, $deposit['userId'], $deposit['id'], $date]);
                $jobs += $insert->rowCount();
            }
        }

        return ['runId' => $runId, 'jobs' => $jobs];
    }

    // --------------------------------------------------------- reservation

    /**
     * Atomically reserves up to $limit workable jobs: queued, or running with
     * an expired lease. $etablissementId scopes the machine-runner route;
     * null = the platform cron tick (provider 'humanome' only).
     *
     * @return list<array<string, mixed>> reserved job rows (run columns joined)
     */
    public function reserve(int $limit, ?int $etablissementId = null): array
    {
        $limit = max(1, min(20, $limit));
        $sql = 'SELECT j.id
                  FROM mass_jobs j
                  JOIN mass_runs r ON r.id = j.run_id
                  JOIN etablissement_config c ON c.user_id = r.etablissement_id
                 WHERE (j.status = "queued" OR (j.status = "running" AND j.lease_until < NOW()))';
        $params = [];
        if ($etablissementId === null) {
            $sql .= ' AND c.provider = "humanome"';
        } else {
            $sql .= ' AND r.etablissement_id = ?';
            $params[] = $etablissementId;
        }
        $sql .= ' ORDER BY j.priority DESC, j.id ASC LIMIT ' . $limit . ' FOR UPDATE SKIP LOCKED';

        $this->pdo->beginTransaction();
        try {
            $stmt = $this->pdo->prepare($sql);
            $stmt->execute($params);
            $ids = array_map(intval(...), $stmt->fetchAll(PDO::FETCH_COLUMN));
            if ($ids !== []) {
                $in = implode(',', $ids);
                $this->pdo->exec(
                    'UPDATE mass_jobs SET status = "running",
                        lease_until = DATE_ADD(NOW(), INTERVAL ' . self::LEASE_SECONDS . ' SECOND)
                      WHERE id IN (' . $in . ')'
                );
            }
            $this->pdo->commit();
        } catch (\Throwable $e) {
            $this->pdo->rollBack();
            throw $e;
        }

        if ($ids === []) {
            return [];
        }

        $stmt = $this->pdo->query(
            'SELECT j.*, r.etablissement_id, r.cohorte_id, r.prompt_package_slug,
                    r.prompt_package_semver, r.referentiel_id, r.referentiel_semver
               FROM mass_jobs j JOIN mass_runs r ON r.id = j.run_id
              WHERE j.id IN (' . implode(',', $ids) . ') ORDER BY j.priority DESC, j.id ASC'
        );

        return $stmt->fetchAll();
    }

    /** Puts a reserved job back in line (time budget spent) — checkpoint kept. */
    public function release(int $jobId): void
    {
        $this->pdo->prepare(
            'UPDATE mass_jobs SET status = "queued", lease_until = NULL
              WHERE id = ? AND status = "running"'
        )->execute([$jobId]);
    }

    // ------------------------------------------------------------ progress

    /**
     * Persists the per-pole checkpoint after EACH successful call and renews
     * the lease. False when the job is no longer running (cancelled under us,
     * lease reclaimed): the caller must abandon the job immediately.
     */
    public function saveCheckpoint(int $jobId, array $checkpoint, int $tokensIn, int $tokensOut, float $costUsd): bool
    {
        $stmt = $this->pdo->prepare(
            'UPDATE mass_jobs SET checkpoint = ?,
                tokens_input = tokens_input + ?, tokens_output = tokens_output + ?,
                cost_usd = cost_usd + ?,
                lease_until = DATE_ADD(NOW(), INTERVAL ' . self::LEASE_SECONDS . ' SECOND)
              WHERE id = ? AND status = "running"'
        );
        $stmt->execute([
            json_encode($checkpoint, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE),
            $tokensIn,
            $tokensOut,
            number_format($costUsd, 6, '.', ''),
            $jobId,
        ]);

        return $stmt->rowCount() > 0;
    }

    /**
     * Final validated document -> done. False when the job was not running.
     * $note: non-blocking degradation notice (e.g. kairos null after retries),
     * surfaced by runStats() — never portfolio content.
     */
    public function complete(int $jobId, array $document, int $tokensIn = 0, int $tokensOut = 0, float $costUsd = 0.0, ?string $note = null): bool
    {
        $stmt = $this->pdo->prepare(
            'UPDATE mass_jobs SET status = "done", document = ?, erreur = ?,
                tokens_input = tokens_input + ?, tokens_output = tokens_output + ?,
                cost_usd = cost_usd + ?, lease_until = NULL, finished_at = NOW()
              WHERE id = ? AND status = "running"'
        );
        $stmt->execute([
            json_encode($document, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE),
            $note === null ? null : mb_substr($note, 0, 2000),
            $tokensIn,
            $tokensOut,
            number_format($costUsd, 6, '.', ''),
            $jobId,
        ]);
        if ($stmt->rowCount() === 0) {
            return false;
        }
        $this->refreshRunStatus($this->runIdOf($jobId));

        return true;
    }

    /**
     * Records a call failure: attempts + 1, back in line — or failed for good
     * at MAX_ATTEMPTS. Error messages carry context, never portfolio content.
     */
    public function fail(int $jobId, string $erreur): void
    {
        $stmt = $this->pdo->prepare(
            'UPDATE mass_jobs SET attempts = attempts + 1, erreur = ?,
                status = IF(attempts >= ' . self::MAX_ATTEMPTS . ', "failed", "queued"),
                lease_until = NULL,
                finished_at = IF(attempts >= ' . self::MAX_ATTEMPTS . ', NOW(), finished_at)
              WHERE id = ? AND status = "running"'
        );
        $stmt->execute([mb_substr($erreur, 0, 2000), $jobId]);
        if ($stmt->rowCount() > 0) {
            $this->refreshRunStatus($this->runIdOf($jobId));
        }
    }

    /** Terminal failure regardless of attempts (source portfolio gone…). */
    public function failHard(int $jobId, string $erreur): void
    {
        $this->pdo->prepare(
            'UPDATE mass_jobs SET status = "failed", erreur = ?, lease_until = NULL, finished_at = NOW()
              WHERE id = ? AND status = "running"'
        )->execute([mb_substr($erreur, 0, 2000), $jobId]);
        $this->refreshRunStatus($this->runIdOf($jobId));
    }

    // -------------------------------------------------------------- budget

    /**
     * Budget circuit breaker tripped (plan-masse §4): the current job AND
     * every queued job of the establishment go budget_exceeded (checkpoints
     * kept — raising the cap resumes exactly where things stopped).
     */
    public function markBudgetExceeded(int $etablissementId, ?int $currentJobId = null): void
    {
        if ($currentJobId !== null) {
            $this->pdo->prepare(
                'UPDATE mass_jobs SET status = "budget_exceeded", lease_until = NULL
                  WHERE id = ? AND status = "running"'
            )->execute([$currentJobId]);
        }
        $this->pdo->prepare(
            'UPDATE mass_jobs j JOIN mass_runs r ON r.id = j.run_id
                SET j.status = "budget_exceeded", j.lease_until = NULL
              WHERE r.etablissement_id = ? AND j.status = "queued"'
        )->execute([$etablissementId]);
        $this->pdo->prepare(
            'UPDATE mass_runs r SET r.status = "budget_exceeded"
              WHERE r.etablissement_id = ? AND r.status = "active"
                AND EXISTS (SELECT 1 FROM mass_jobs j
                             WHERE j.run_id = r.id AND j.status = "budget_exceeded")'
        )->execute([$etablissementId]);
    }

    /** Raising the cap re-queues the establishment's blocked work (plan §4). */
    public function reactivateBudget(int $etablissementId): void
    {
        $this->pdo->prepare(
            'UPDATE mass_jobs j JOIN mass_runs r ON r.id = j.run_id
                SET j.status = "queued", j.lease_until = NULL
              WHERE r.etablissement_id = ? AND j.status = "budget_exceeded"'
        )->execute([$etablissementId]);
        $this->pdo->prepare(
            'UPDATE mass_runs SET status = "active", finished_at = NULL
              WHERE etablissement_id = ? AND status = "budget_exceeded"'
        )->execute([$etablissementId]);
    }

    // -------------------------------------------------------- cancellation

    /** Cancels a run: every non-terminal job, then the run itself (sticky). */
    public function cancelRun(int $runId): void
    {
        $this->pdo->prepare(
            'UPDATE mass_jobs SET status = "cancelled", lease_until = NULL, finished_at = NOW()
              WHERE run_id = ? AND status IN ("queued", "running", "budget_exceeded")'
        )->execute([$runId]);
        $this->pdo->prepare(
            'UPDATE mass_runs SET status = "cancelled", finished_at = NOW() WHERE id = ?'
        )->execute([$runId]);
    }

    // ------------------------------------------------------------- lookups

    /** Fresh job row (worker re-reads between poles). */
    public function jobRow(int $jobId): ?array
    {
        $stmt = $this->pdo->prepare(
            'SELECT j.*, r.etablissement_id, r.cohorte_id, r.prompt_package_slug,
                    r.prompt_package_semver, r.referentiel_id, r.referentiel_semver
               FROM mass_jobs j JOIN mass_runs r ON r.id = j.run_id WHERE j.id = ?'
        );
        $stmt->execute([$jobId]);
        $row = $stmt->fetch();

        return $row === false ? null : $row;
    }

    /** Owned run row or null (foreign id = missing id, no existence oracle). */
    public function runForEtablissement(int $runId, int $etablissementId): ?array
    {
        $stmt = $this->pdo->prepare(
            'SELECT * FROM mass_runs WHERE id = ? AND etablissement_id = ?'
        );
        $stmt->execute([$runId, $etablissementId]);
        $row = $stmt->fetch();

        return $row === false ? null : $row;
    }

    /**
     * Progress board of a run: jobs per status, cumulated cost, errors.
     *
     * @return array{jobs: array<string, int>, coutUsd: float, tokens: array{input: int, output: int}, erreurs: list<array<string, mixed>>}
     */
    public function runStats(int $runId): array
    {
        $stmt = $this->pdo->prepare(
            'SELECT status, COUNT(*) AS n, SUM(cost_usd) AS cost,
                    SUM(tokens_input) AS tin, SUM(tokens_output) AS tout
               FROM mass_jobs WHERE run_id = ? GROUP BY status'
        );
        $stmt->execute([$runId]);
        $jobs = ['queued' => 0, 'running' => 0, 'done' => 0, 'failed' => 0, 'budget_exceeded' => 0, 'cancelled' => 0];
        $cost = 0.0;
        $tin = 0;
        $tout = 0;
        foreach ($stmt->fetchAll() as $row) {
            $jobs[(string) $row['status']] = (int) $row['n'];
            $cost += (float) $row['cost'];
            $tin += (int) $row['tin'];
            $tout += (int) $row['tout'];
        }

        $errStmt = $this->pdo->prepare(
            'SELECT id, user_id, day_date, status, attempts, erreur
               FROM mass_jobs WHERE run_id = ? AND erreur IS NOT NULL ORDER BY id LIMIT 50'
        );
        $errStmt->execute([$runId]);
        $erreurs = array_map(static fn (array $row): array => [
            'jobId' => (int) $row['id'],
            'userId' => (int) $row['user_id'],
            'date' => (string) $row['day_date'],
            'status' => (string) $row['status'],
            'attempts' => (int) $row['attempts'],
            'erreur' => (string) $row['erreur'],
        ], $errStmt->fetchAll());

        return [
            'jobs' => $jobs,
            'coutUsd' => round($cost, 6),
            'tokens' => ['input' => $tin, 'output' => $tout],
            'erreurs' => $erreurs,
        ];
    }

    /**
     * Terminal-state bookkeeping of a run after a job settles: done when
     * everything succeeded, failed when at least one job failed for good.
     * cancelled and budget_exceeded are set by their own flows.
     */
    public function refreshRunStatus(int $runId): void
    {
        $this->pdo->prepare(
            'UPDATE mass_runs r SET
                r.status = CASE
                    WHEN NOT EXISTS (SELECT 1 FROM mass_jobs j WHERE j.run_id = r.id
                                      AND j.status IN ("queued", "running", "budget_exceeded"))
                    THEN IF(EXISTS (SELECT 1 FROM mass_jobs j WHERE j.run_id = r.id AND j.status = "failed"),
                            "failed", "done")
                    ELSE r.status END,
                r.finished_at = CASE
                    WHEN NOT EXISTS (SELECT 1 FROM mass_jobs j WHERE j.run_id = r.id
                                      AND j.status IN ("queued", "running", "budget_exceeded"))
                    THEN COALESCE(r.finished_at, NOW()) ELSE r.finished_at END
              WHERE r.id = ? AND r.status = "active"'
        )->execute([$runId]);
    }

    private function runIdOf(int $jobId): int
    {
        $stmt = $this->pdo->prepare('SELECT run_id FROM mass_jobs WHERE id = ?');
        $stmt->execute([$jobId]);

        return (int) $stmt->fetchColumn();
    }
}
