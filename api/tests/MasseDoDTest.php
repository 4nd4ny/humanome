<?php

declare(strict_types=1);

namespace Humanome\Tests;

use Humanome\Db;
use Humanome\Validation;

/**
 * THE P11 DoD (plan-prompts P11, docs/plan-masse.md §8): a 20-portfolio
 * fixture cohort (3 days each) fully cartographied by SIMULATED CRON TICKS,
 * with a mid-run interruption and a resume WITHOUT any duplicated LLM call
 * (mock call counter as referee); budget cap lowered mid-run -> clean stop,
 * reactivation by raising it; expired lease resumed from its checkpoint;
 * cancellation mid-run.
 */
final class MasseDoDTest extends MasseTestCase
{
    public function testCohorteDeVingtPortfoliosAvecInterruptionEtReprise(): void
    {
        $etab = $this->registerEtablissement();
        $this->configure($etab, 50.0);
        $cohorte = $this->createCohorte($etab, 'Promotion 2026');
        for ($i = 1; $i <= 20; $i++) {
            $this->enrolLearner($cohorte['code'], $cohorte['id'], $i);
        }

        $run = $this->launchRun($etab, $cohorte['id']);
        self::assertSame(60, $run['jobs'], '20 membres déposants × 3 journées');

        // --- phase 1: cron ticks, then INTERRUPTION (the loop stops dead).
        // 5 calls per tick (not a multiple of 8): ticks stop MID-day, so the
        // resume proof also covers partially checkpointed jobs.
        for ($t = 0; $t < 25; $t++) {
            $this->tick(['maxCalls' => 5]);
        }
        $mid = self::jobStatuses((int) $run['runId']);
        self::assertGreaterThan(0, $mid['done'] ?? 0, 'des journées entières ont abouti');
        self::assertGreaterThan(0, $mid['queued'] ?? 0, 'du travail reste en file');
        $checkpointed = (int) Db::get()->query(
            'SELECT COUNT(*) FROM mass_jobs WHERE status = "queued" AND checkpoint IS NOT NULL'
        )->fetchColumn();
        self::assertGreaterThan(0, $checkpointed, 'au moins un job repose en file AVEC checkpoint partiel');

        // --- phase 2: RESUME (a fresh tick loop, as the cron would) --------
        $this->tickUntilDrained(['maxCalls' => 5]);

        self::assertSame(['done' => 60], self::jobStatuses((int) $run['runId']));
        self::assertSame('done', self::runStatus((int) $run['runId']));

        // The referee: 60 jobs × (7 pôles + 1 kairos) EXACTLY — resuming
        // re-called no checkpointed pole (plan-masse §3).
        self::assertSame(480, $this->provider->calls);

        // Every produced document is a schema-valid cartographie-jour.
        $stmt = Db::get()->prepare('SELECT day_date, document FROM mass_jobs WHERE run_id = ?');
        $stmt->execute([(int) $run['runId']]);
        $rows = $stmt->fetchAll();
        self::assertCount(60, $rows);
        foreach ($rows as $row) {
            $document = json_decode((string) $row['document'], true);
            self::assertIsArray($document);
            self::assertSame('cartographie-jour', $document['kind']);
            self::assertSame((string) $row['day_date'], $document['date']);
            self::assertCount(7, $document['poles']);
            self::assertTrue(Validation::validate('cartographie-jour', $document)['valid']);
        }

        // Usage was billed (§7): platform provider at Sonnet pricing.
        self::assertGreaterThan(0.0, self::spentUsd($etab['id']));

        // Progress board coherent through the API.
        $board = self::json($this->as_($etab, 'GET', '/api/etablissement/runs/' . $run['runId']));
        self::assertSame('done', $board['status']);
        self::assertSame(60, $board['jobs']['done']);
        self::assertSame([], $board['erreurs']);
        self::assertEqualsWithDelta(self::spentUsd($etab['id']), $board['coutUsd'], 0.000001);

        // The establishment reads a member's day documents (front merges
        // client-side through the engine — M8 decision).
        $membre = self::json($this->as_($etab, 'GET', '/api/etablissement/cohortes/' . $cohorte['id']))['membres'][0];
        $body = self::json($this->as_($etab, 'GET', '/api/etablissement/membres/' . $membre['userId'] . '/documents'));
        self::assertSame($membre['displayName'], $body['membre']['displayName']);
        $documents = $body['documents'];
        self::assertCount(3, $documents);
        self::assertSame(self::DAYS, array_column($documents, 'date'));
        self::assertSame('cartographie-jour', $documents[0]['document']['kind']);
    }

    public function testPlafondAbaisseEnCoursDeRunPuisReactive(): void
    {
        $etab = $this->registerEtablissement();
        $this->configure($etab, 50.0);
        $cohorte = $this->createCohorte($etab);
        for ($i = 1; $i <= 2; $i++) {
            $this->enrolLearner($cohorte['code'], $cohorte['id'], $i);
        }
        $run = $this->launchRun($etab, $cohorte['id']);
        self::assertSame(6, $run['jobs']);

        // A few calls land, then the cap drops UNDER what the next call costs.
        $this->tick(['maxCalls' => 3]);
        $callsBeforeBlock = $this->provider->calls;
        self::assertSame(3, $callsBeforeBlock);
        $this->configure($etab, 0.000001);

        // The worker REFUSES to call the LLM (pre-call check): clean stop.
        $counters = $this->tick();
        self::assertSame(0, $this->provider->calls - $callsBeforeBlock, 'aucun appel LLM au-delà du plafond');
        self::assertGreaterThan(0, $counters['budgetBlocked']);
        $statuses = self::jobStatuses((int) $run['runId']);
        self::assertSame(6, $statuses['budget_exceeded'] ?? 0);
        self::assertSame('budget_exceeded', self::runStatus((int) $run['runId']));

        // Another tick: nothing to do, still zero calls.
        $this->tick();
        self::assertSame($callsBeforeBlock, $this->provider->calls);

        // Raising the cap reactivates (plan-masse §4) and the run completes —
        // checkpointed poles are NOT re-called.
        $this->configure($etab, 50.0);
        self::assertSame('active', self::runStatus((int) $run['runId']));
        $this->tickUntilDrained(['maxCalls' => 8]);
        self::assertSame(['done' => 6], self::jobStatuses((int) $run['runId']));
        self::assertSame(48, $this->provider->calls, '6 jobs × 8 appels, sans double appel');
    }

    public function testBailExpireReprisAuCheckpointSansDoubleAppel(): void
    {
        $etab = $this->registerEtablissement();
        $this->configure($etab, 50.0);
        $cohorte = $this->createCohorte($etab);
        $this->enrolLearner($cohorte['code'], $cohorte['id'], 1, ['2026-01-05']);
        $run = $this->launchRun($etab, $cohorte['id']);
        self::assertSame(1, $run['jobs']);

        // 3 poles done, job back in line — then a "killed tick" is simulated:
        // the job is running with an expired lease and a partial checkpoint.
        $this->tick(['maxCalls' => 3]);
        Db::get()->exec(
            'UPDATE mass_jobs SET status = "running",
                lease_until = DATE_SUB(NOW(), INTERVAL 10 SECOND)'
        );

        // The next tick reclaims the expired lease and resumes mid-day.
        $this->tickUntilDrained();
        self::assertSame(['done' => 1], self::jobStatuses((int) $run['runId']));
        self::assertSame(8, $this->provider->calls, 'reprise au checkpoint : 8 appels en tout');
    }

    public function testAnnulationEnCoursDeRun(): void
    {
        $etab = $this->registerEtablissement();
        $this->configure($etab, 50.0);
        $cohorte = $this->createCohorte($etab);
        for ($i = 1; $i <= 2; $i++) {
            $this->enrolLearner($cohorte['code'], $cohorte['id'], $i);
        }
        $run = $this->launchRun($etab, $cohorte['id']);

        $this->tick(['maxCalls' => 10]);
        $callsAtCancel = $this->provider->calls;

        $cancelled = $this->as_($etab, 'POST', '/api/etablissement/runs/' . $run['runId'] . '/annuler');
        self::assertSame(200, $cancelled->getStatusCode());

        $this->tick();
        self::assertSame($callsAtCancel, $this->provider->calls, 'plus aucun appel après annulation');
        $statuses = self::jobStatuses((int) $run['runId']);
        self::assertSame(6, ($statuses['cancelled'] ?? 0) + ($statuses['done'] ?? 0));
        self::assertGreaterThan(0, $statuses['cancelled'] ?? 0);
        self::assertSame('cancelled', self::runStatus((int) $run['runId']));

        // Cancellation is sticky: draining changes nothing.
        $this->tickUntilDrained();
        self::assertSame('cancelled', self::runStatus((int) $run['runId']));
    }

    public function testEchecsStochastiquesPuisEchecFranc(): void
    {
        $etab = $this->registerEtablissement();
        $this->configure($etab, 50.0);
        $cohorte = $this->createCohorte($etab);
        $this->enrolLearner($cohorte['code'], $cohorte['id'], 1, ['2026-01-05']);
        $run = $this->launchRun($etab, $cohorte['id']);

        // One malformed answer: the in-tick retry (M5 lesson) absorbs it.
        $this->provider->garbageNextCalls = 1;
        $this->tickUntilDrained();
        self::assertSame(['done' => 1], self::jobStatuses((int) $run['runId']));
        self::assertSame(9, $this->provider->calls, '8 utiles + 1 retry payé');

        // Persistent failure: attempts accumulate, the job fails for good.
        $run2 = $this->launchRun($etab, $cohorte['id']);
        $this->provider->failNextCalls = PHP_INT_MAX;
        $this->tickUntilDrained();
        self::assertSame(['failed' => 1], self::jobStatuses((int) $run2['runId']));
        self::assertSame('failed', self::runStatus((int) $run2['runId']));
        $board = self::json($this->as_($etab, 'GET', '/api/etablissement/runs/' . $run2['runId']));
        self::assertSame(3, $board['erreurs'][0]['attempts']);
        self::assertStringContainsString('panne simulée', $board['erreurs'][0]['erreur']);
    }

    public function testQuitterLaCohorteAnnuleLesJobsEtRetireLAccesEtablissement(): void
    {
        $etab = $this->registerEtablissement();
        $this->configure($etab, 50.0);
        $cohorte = $this->createCohorte($etab);
        $partant = $this->enrolLearner($cohorte['code'], $cohorte['id'], 1);
        $this->enrolLearner($cohorte['code'], $cohorte['id'], 2);
        $run = $this->launchRun($etab, $cohorte['id']);

        // The first learner's first day completes, then they QUIT (consent
        // withdrawal, plan-masse §6).
        $this->tick(['maxCalls' => 8]);
        $done = self::json($this->as_($etab, 'GET', '/api/etablissement/membres/' . $partant['id'] . '/documents'));
        self::assertCount(1, $done['documents']);

        $quit = $this->as_($partant, 'DELETE', "/api/cohortes/{$cohorte['id']}/quitter");
        self::assertSame(204, $quit->getStatusCode());

        // Establishment access is gone (homogeneous 404), pending jobs are
        // cancelled, the deposit is purged — but the PRODUCED document
        // survives, owned by the learner (portfolio_id detached).
        $refused = $this->as_($etab, 'GET', '/api/etablissement/membres/' . $partant['id'] . '/documents');
        self::assertSame(404, $refused->getStatusCode());
        $stmt = Db::get()->prepare(
            'SELECT status, COUNT(*) FROM mass_jobs WHERE user_id = ? GROUP BY status'
        );
        $stmt->execute([$partant['id']]);
        $statuses = array_map(intval(...), $stmt->fetchAll(\PDO::FETCH_KEY_PAIR));
        ksort($statuses);
        self::assertSame(['cancelled' => 2, 'done' => 1], $statuses);
        $orphan = Db::get()->query(
            'SELECT COUNT(*) FROM mass_jobs WHERE status = "done" AND portfolio_id IS NULL'
        )->fetchColumn();
        self::assertSame(1, (int) $orphan);
        $deposits = Db::get()->prepare('SELECT COUNT(*) FROM cohorte_portfolios WHERE user_id = ?');
        $deposits->execute([$partant['id']]);
        self::assertSame(0, (int) $deposits->fetchColumn());

        // The other member's run completes untouched.
        $this->tickUntilDrained(['maxCalls' => 8]);
        $statuses = self::jobStatuses((int) $run['runId']);
        self::assertSame(2, $statuses['cancelled'] ?? 0, 'les 2 journées restantes du partant');
        self::assertSame(4, $statuses['done'] ?? 0, 'le 2e membre (3) + la journée déjà produite du partant (1)');
    }

    public function testLeTickCliEstBornableParEnvMaxCalls(): void
    {
        // WORKER_TICK_MAX_CALLS bounds a CLI tick (php scripts/worker.php)
        // by LLM calls, like the HTTP tick's maxCalls — the operational DoD
        // rehearsal interrupts/resumes through it (a mock call costs ~0.2 ms,
        // a purely time-bounded tick would drain the queue in one go).
        $etab = $this->registerEtablissement();
        $this->configure($etab, 50.0);
        $cohorte = $this->createCohorte($etab);
        $this->enrolLearner($cohorte['code'], $cohorte['id'], 1, ['2026-01-05']);
        $this->launchRun($etab, $cohorte['id']);

        $_ENV['WORKER_TICK_MAX_CALLS'] = '5';
        try {
            $counters = (new \Humanome\Worker\Tick(Db::get(), [
                'budgetSeconds' => 3600,
                'providerFactory' => fn (array $config): object => $this->provider,
            ]))->run();
        } finally {
            unset($_ENV['WORKER_TICK_MAX_CALLS']);
        }

        self::assertSame(5, $counters['calls'], 'tick borné par l\'environnement');
        self::assertSame(5, $this->provider->calls);
        self::assertSame(1, $counters['jobsReleased'], 'le job repart en file, checkpoint conservé');
    }

    public function testPurgeRgpdParSuppressionDeCompte(): void
    {
        $etab = $this->registerEtablissement();
        $this->configure($etab, 50.0);
        $cohorte = $this->createCohorte($etab);
        $learner = $this->enrolLearner($cohorte['code'], $cohorte['id'], 1);
        $run = $this->launchRun($etab, $cohorte['id']);
        $this->tickUntilDrained(['maxCalls' => 8]);
        self::assertSame(['done' => 3], self::jobStatuses((int) $run['runId']));

        // Learner account purge -> membership, deposit and JOBS (documents
        // included) die by FK (migration 009 contract).
        Db::get()->prepare('DELETE FROM users WHERE id = ?')->execute([$learner['id']]);
        foreach (['cohorte_membres', 'cohorte_portfolios', 'mass_jobs'] as $table) {
            $stmt = Db::get()->prepare("SELECT COUNT(*) FROM {$table} WHERE user_id = ?");
            $stmt->execute([$learner['id']]);
            self::assertSame(0, (int) $stmt->fetchColumn(), $table);
        }

        // Establishment account purge -> the whole tree.
        Db::get()->prepare('DELETE FROM users WHERE id = ?')->execute([$etab['id']]);
        foreach (['cohortes', 'etablissement_config', 'mass_runs'] as $table) {
            self::assertSame(0, (int) Db::get()->query("SELECT COUNT(*) FROM {$table}")->fetchColumn(), $table);
        }
        self::assertSame(0, (int) Db::get()->query('SELECT COUNT(*) FROM mass_jobs')->fetchColumn());
    }
}
