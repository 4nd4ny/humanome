<?php

declare(strict_types=1);

namespace Humanome\Tests\UseCases\Functional;

use Humanome\Db;
use Humanome\Env;
use Humanome\Llm\MockProvider;
use Humanome\Tests\MasseTestCase;
use Humanome\Tests\TestDb;
use Humanome\Tests\UseCases\Support\EtaSupport;
use Humanome\Validation;
use Humanome\Worker\Tick;
use PHPUnit\Framework\Attributes\TestDox;
use Psr\Http\Message\ResponseInterface;

/**
 * UC-SYS-01 — Traiter la file de jobs de masse : tests FONCTIONNELS (CLI + API).
 *
 * Fiche : docs/cas-utilisation/systeme/UC-SYS-01-traiter-file-jobs.md
 *
 * Les trois exécutants sont joués par leur interface publique :
 * - le cron de la plateforme : `php scripts/worker.php` lancé en SOUS-PROCESSUS
 *   (WORKER_PROVIDER=mock, base de test du lot) ;
 * - le déclenchement sans SSH : POST /api/admin/worker-tick (X-Migrate-Token) ;
 * - le runner machine de l'établissement : /api/worker/* (X-Worker-Token, sans
 *   session ni CSRF), le runner étant simulé par des requêtes HTTP.
 * Les préconditions (cohorte, dépôts, run) passent par les routes réelles ;
 * aucun appel réseau n'est fait (fournisseur mock).
 */
final class UcSys01TraiterFileJobsTest extends MasseTestCase
{
    use EtaSupport;

    private const ENDPOINT = 'http://192.168.1.50:11434';

    /** Établissement + cohorte + déposants + run lancé ; renvoie [etab, cohorte, runId, learners]. */
    private function preparedRun(array $daysByLearner, float $cap = 50.0, array $config = []): array
    {
        $etab = $this->registerEtablissement();
        $this->configure($etab, $cap, $config);
        $cohorte = $this->createCohorte($etab);
        $learners = [];
        foreach ($daysByLearner as $i => $days) {
            $learners[] = $this->enrolLearner($cohorte['code'], $cohorte['id'], $i + 1, $days);
        }

        return [$etab, $cohorte, (int) $this->launchRun($etab, $cohorte['id'])['runId'], $learners];
    }

    private function endpointRun(array $daysByLearner = [['2026-01-05', '2026-01-06']]): array
    {
        $prepared = $this->preparedRun($daysByLearner, 100.0, [
            'provider' => 'endpoint', 'endpointUrl' => self::ENDPOINT, 'model' => 'llama3:70b',
        ]);
        $token = self::json($this->as_($prepared[0], 'POST', '/api/etablissement/worker-token'))['workerToken'];

        return [...$prepared, $token];
    }

    /** Requête machine du runner : aucun cookie, jeton en en-tête. */
    private function worker(string $method, string $path, ?array $body, string $token): ResponseInterface
    {
        $this->cookieSid = null;

        return $this->request($method, $path, $body, ['X-Worker-Token' => $token]);
    }

    /** Lignes écrites dans le journal serveur (error_log) par le dernier tick HTTP. */
    private array $serverLog = [];

    private function adminTick(?array $body = [], ?string $token = null): ResponseInterface
    {
        $this->cookieSid = null;
        $headers = $token === '' ? [] : ['X-Migrate-Token' => $token ?? Env::get('MIGRATE_TOKEN')];
        // Journal serveur capturé (au lieu de stderr) pour vérifier ce qu'il contient.
        $logFile = (string) tempnam(sys_get_temp_dir(), 'uc-sys-01-log');
        $previous = ini_set('error_log', $logFile);
        try {
            return self::withEnv(['WORKER_PROVIDER' => 'mock'], fn (): ResponseInterface => $this->request('POST', '/api/admin/worker-tick', $body, $headers));
        } finally {
            ini_set('error_log', $previous === false ? '' : $previous);
            $this->serverLog = array_values(array_filter(explode("\n", (string) file_get_contents($logFile))));
            unlink($logFile);
        }
    }

    private function board(array $etab, int $runId): array
    {
        return self::json($this->as_($etab, 'GET', '/api/etablissement/runs/' . $runId));
    }

    /** `php scripts/worker.php` en sous-processus ; renvoie [code, stdout, stderr]. */
    private static function runCli(array $env): array
    {
        $process = proc_open(
            [PHP_BINARY, self::repoRoot() . '/scripts/worker.php'],
            [1 => ['pipe', 'w'], 2 => ['pipe', 'w']],
            $pipes,
            self::repoRoot(),
            $env,
        );
        self::assertIsResource($process);
        $stdout = (string) stream_get_contents($pipes[1]);
        $stderr = (string) stream_get_contents($pipes[2]);
        fclose($pipes[1]);
        fclose($pipes[2]);

        return [proc_close($process), $stdout, $stderr];
    }

    private static function cliDbEnv(): array
    {
        return [
            'DB_HOST' => Env::get('DB_HOST', 'mysql'),
            'DB_PORT' => Env::get('DB_PORT', '3306'),
            'DB_NAME' => TestDb::name(),
            'DB_USER' => 'root',
            'DB_PASSWORD' => Env::get('DB_ROOT_PASSWORD', 'root_dev'),
        ];
    }

    // ------------------------------------------------------------ cron CLI

    #[TestDox('UC-SYS-01-F01 — nominal cron : php scripts/worker.php traite une journée (8 appels), document validé, dépense imputée, sortie = compteurs')]
    public function testF01NominalCronCliTick(): void
    {
        [$etab, , $runId, [$learner]] = $this->preparedRun([['2026-01-05']]);

        [$code, $stdout, $stderr] = self::runCli(self::cliDbEnv() + [
            'WORKER_PROVIDER' => 'mock',
            'WORKER_TICK_MAX_CALLS' => '8',
            'WORKER_TICK_BUDGET_SECONDS' => '30',
        ]);

        self::assertSame(0, $code, $stderr);
        self::assertSame('', $stderr);
        $counters = json_decode(trim($stdout), true, 512, JSON_THROW_ON_ERROR);
        self::assertSame(
            ['locked' => false, 'jobsTouched' => 1, 'jobsCompleted' => 1, 'jobsFailed' => 0, 'jobsReleased' => 0, 'calls' => 8, 'callErrors' => 0, 'budgetBlocked' => 0],
            array_diff_key($counters, ['elapsedMs' => true]),
        );
        self::assertStringNotContainsString("aujourd'hui", $stdout, 'compteurs seulement, jamais de contenu');

        $board = $this->board($etab, $runId);
        self::assertSame('done', $board['status']);
        self::assertGreaterThan(0.0, self::spentUsd($etab['id']));
        $document = self::json($this->as_($etab, 'GET', '/api/etablissement/membres/' . $learner['id'] . '/documents'))['documents'][0]['document'];
        self::assertTrue(Validation::validate('cartographie-jour', $document)['valid']);
    }

    #[TestDox('UC-SYS-01-F02 — E5 : CLI sans base configurée → code 1, message sur stderr, rien sur stdout')]
    public function testF02CronCliWithoutDatabase(): void
    {
        [$code, $stdout, $stderr] = self::runCli(['WORKER_PROVIDER' => 'mock']);

        self::assertSame(1, $code);
        self::assertSame('', $stdout);
        self::assertSame("[worker] base de données non configurée\n", $stderr);
    }

    // ------------------------------------------------- POST /api/admin/worker-tick

    #[TestDox('UC-SYS-01-F03 — A1 + A3 : tick HTTP borné (maxCalls ≤ 50), interruption avec checkpoint puis reprise ; journal = compteurs')]
    public function testF03HttpTickIsBoundedAndResumes(): void
    {
        [$etab, , $runId] = $this->preparedRun([self::DAYS, self::DAYS, self::DAYS]); // 9 journées = 72 appels

        $first = $this->adminTick(['maxCalls' => 3]);
        self::assertSame(200, $first->getStatusCode(), (string) $first->getBody());
        $counters = self::json($first);
        self::assertSame([false, 1, 3, 1, 0], [$counters['locked'], $counters['jobsTouched'], $counters['calls'], $counters['jobsReleased'], $counters['jobsCompleted']]);
        $checkpoint = json_decode((string) Db::get()->query("SELECT checkpoint FROM mass_jobs WHERE run_id = {$runId} ORDER BY id LIMIT 1")->fetchColumn(), true);
        self::assertCount(3, $checkpoint['poles'], '3 pôles gardés en point de reprise');

        $second = self::json($this->adminTick(['maxCalls' => 999, 'budgetSeconds' => 999]));
        self::assertSame(50, $second['calls'], 'borné à 50 appels par tick HTTP');
        self::assertSame(6, $second['jobsCompleted'], '5 appels pour finir la 1re journée + 5 journées entières + 5 pôles');

        $third = self::json($this->adminTick(['maxCalls' => 50]));
        self::assertSame(19, $third['calls'], '72 − 3 − 50 : aucun pôle rappelé');
        self::assertSame('done', $this->board($etab, $runId)['status']);

        // Journalisation minimale (§6.5) : une ligne de compteurs, rien d'autre.
        self::assertCount(1, $this->serverLog);
        self::assertMatchesRegularExpression('/\[worker-tick\] (\{.*\})$/', $this->serverLog[0]);
        preg_match('/(\{.*\})$/', $this->serverLog[0], $logged);
        self::assertEquals($third, json_decode($logged[1], true));
        self::assertStringNotContainsString("aujourd'hui", $this->serverLog[0]);
    }

    #[TestDox('UC-SYS-01-F04 — E4 : jeton de migration absent/faux → 403 ; MIGRATE_TOKEN non configuré → 404')]
    public function testF04AdminTickGuards(): void
    {
        foreach (['', 'mauvais-jeton'] as $token) {
            $response = $this->adminTick([], $token);
            self::assertSame(403, $response->getStatusCode());
            self::assertSame(['error' => 'Forbidden'], self::json($response));
        }

        $disabled = self::withEnv(['MIGRATE_TOKEN' => ''], fn (): ResponseInterface => $this->adminTick([], 'dev_migrate_token'));
        self::assertSame(404, $disabled->getStatusCode());
        self::assertSame(['error' => 'Not found'], self::json($disabled));
    }

    #[TestDox('UC-SYS-01-F05 — A6 : un tick déjà en cours (verrou tenu) → réponse locked, file intacte')]
    public function testF05ConcurrentTickIsLocked(): void
    {
        [, , $runId] = $this->preparedRun([['2026-01-05']]);
        $holder = TestDb::pdo();
        $holder->query("SELECT GET_LOCK('" . Tick::LOCK_NAME . "', 0)")->fetchColumn();
        try {
            $counters = self::json($this->adminTick(['maxCalls' => 8]));
        } finally {
            $holder->query("SELECT RELEASE_LOCK('" . Tick::LOCK_NAME . "')")->fetchColumn();
        }

        self::assertTrue($counters['locked']);
        self::assertSame([0, 0], [$counters['jobsTouched'], $counters['calls']]);
        self::assertSame(['queued' => 1], self::jobStatuses($runId));
    }

    #[TestDox('UC-SYS-01-F06 — A7 : plafond insuffisant → le tick refuse l’appel (budgetBlocked), jobs « budget_exceeded »')]
    public function testF06CronRespectsTheBudgetCap(): void
    {
        [$etab, , $runId] = $this->preparedRun([['2026-01-05', '2026-01-06']], 0.01);

        $counters = self::json($this->adminTick(['maxCalls' => 8]));

        self::assertSame([0, 1], [$counters['calls'], $counters['budgetBlocked']]);
        self::assertSame(['budget_exceeded' => 2], self::jobStatuses($runId));
        self::assertSame('budget_exceeded', $this->board($etab, $runId)['status']);
    }

    #[TestDox('UC-SYS-01-F07 — A5 : kairos en échec → journée terminée avec kairos null, note visible au tableau')]
    public function testF07KairosDegradedToNull(): void
    {
        [$etab, , $runId, [$learner]] = $this->preparedRun([['2026-01-07']]);
        $provider = new class () {
            private MockProvider $inner;

            public function __construct()
            {
                $this->inner = new MockProvider();
            }

            public function complete(string $model, ?string $system, string $prompt, int $maxTokens): array
            {
                return str_contains($prompt, 'SYNTHÈSE KAIROS')
                    ? ['text' => '{"tronqué": ', 'usage' => ['inputTokens' => 10, 'outputTokens' => 5], 'model' => 'mock', 'stopReason' => 'max_tokens']
                    : $this->inner->complete($model, $system, $prompt, $maxTokens);
            }
        };

        (new Tick(Db::get(), ['budgetSeconds' => 3600, 'providerFactory' => static fn (array $c): object => $provider]))->run();

        $board = $this->board($etab, $runId);
        self::assertSame('done', $board['status']);
        self::assertSame('done', $board['erreurs'][0]['status']);
        self::assertSame('kairos dégradé à null (2026-01-07) — réponse tronquée (budget de sortie atteint)', $board['erreurs'][0]['erreur']);
        $document = self::json($this->as_($etab, 'GET', '/api/etablissement/membres/' . $learner['id'] . '/documents'))['documents'][0]['document'];
        self::assertNull($document['kairos']);
        self::assertCount(7, $document['poles']);
    }

    // ----------------------------------------------------------- runner /api/worker/*

    #[TestDox('UC-SYS-01-F08 — A2 : runner — réservation (bail, charge utile), checkpoint, résultat validé → run terminé, dépense imputée')]
    public function testF08RunnerNominal(): void
    {
        [$etab, , $runId, [$learner], $token] = $this->endpointRun();

        $reserved = $this->worker('GET', '/api/worker/jobs?limit=5', null, $token);
        self::assertSame(200, $reserved->getStatusCode());
        $batch = self::json($reserved);
        self::assertSame(['jobs', 'referentiel'], array_keys($batch));
        self::assertCount(2, $batch['jobs']);
        $job = $batch['jobs'][0];
        self::assertSame(
            ['id', 'runId', 'cohorteId', 'userId', 'date', 'dayText', 'checkpoint', 'promptPackage', 'referentielVersion', 'provider', 'model', 'leaseSeconds'],
            array_keys($job),
        );
        self::assertSame([$runId, $learner['id'], '2026-01-05', 300], [$job['runId'], $job['userId'], $job['date'], $job['leaseSeconds']]);
        self::assertSame(['provider' => 'endpoint', 'endpointUrl' => self::ENDPOINT, 'model' => 'llama3:70b'], $job['provider'], 'jamais la clé');
        self::assertCount(61, $batch['referentiel']['competences']);

        self::assertSame(200, $this->worker('POST', "/api/worker/jobs/{$job['id']}/checkpoint", ['checkpoint' => ['poles' => ['1' => ['stub' => true]]]], $token)->getStatusCode());
        foreach ($batch['jobs'] as $i => $each) {
            $result = $this->worker('POST', "/api/worker/jobs/{$each['id']}/result", [
                'document' => self::dayDocument($each['date']),
                'tokens' => ['input' => 12000, 'output' => 3000],
                'coutUsd' => 0.05,
            ], $token);
            self::assertSame(200, $result->getStatusCode(), (string) $result->getBody());
            self::assertSame(['id' => $each['id'], 'status' => 'done'], self::json($result));
        }

        $board = $this->board($etab, $runId);
        self::assertSame('done', $board['status']);
        self::assertSame(['input' => 24000, 'output' => 6000], $board['tokens']);
        self::assertEqualsWithDelta(0.1, $board['coutUsd'], 1e-9);
        self::assertEqualsWithDelta(0.1, self::spentUsd($etab['id']), 1e-9);
        self::assertSame([], self::json($this->worker('GET', '/api/worker/jobs', null, $token))['jobs']);
    }

    #[TestDox('UC-SYS-01-F09 — A4 : runner disparu — bail expiré, le job est re-servi AVEC son dernier checkpoint')]
    public function testF09ExpiredLeaseReservesWithCheckpoint(): void
    {
        [, , , , $token] = $this->endpointRun([['2026-01-05']]);
        $job = self::json($this->worker('GET', '/api/worker/jobs', null, $token))['jobs'][0];
        $progress = ['poles' => ['1' => ['poleNum' => '1', 'competences' => []], '2' => ['poleNum' => '2', 'competences' => []]]];
        $this->worker('POST', "/api/worker/jobs/{$job['id']}/checkpoint", ['checkpoint' => $progress], $token);

        self::assertSame([], self::json($this->worker('GET', '/api/worker/jobs', null, $token))['jobs'], 'bail en cours');
        Db::get()->exec("UPDATE mass_jobs SET lease_until = NOW() - INTERVAL 1 SECOND WHERE id = {$job['id']}");

        $again = self::json($this->worker('GET', '/api/worker/jobs', null, $token))['jobs'];
        self::assertSame([$job['id']], array_column($again, 'id'));
        self::assertEquals($progress, $again[0]['checkpoint']);
    }

    #[TestDox('UC-SYS-01-F10 — A8 : journée retirée du dépôt pendant le run → job non servi, échec définitif expliqué')]
    public function testF10MissingSegmentIsFailedNotServed(): void
    {
        [$etab, $cohorte, $runId, [$learner], $token] = $this->endpointRun();
        $redeposit = $this->as_($learner, 'POST', "/api/cohortes/{$cohorte['id']}/portfolio", [
            'titre' => 'Portfolio refait',
            'segments' => [['date' => '2026-01-07', 'texte' => 'Une seule journée désormais.']],
        ]);
        self::assertSame(201, $redeposit->getStatusCode());

        self::assertSame([], self::json($this->worker('GET', '/api/worker/jobs?limit=5', null, $token))['jobs']);

        $board = $this->board($etab, $runId);
        self::assertSame('failed', $board['status']);
        self::assertSame(
            ['segment du 2026-01-05 introuvable dans le portfolio déposé', 'segment du 2026-01-06 introuvable dans le portfolio déposé'],
            array_column($board['erreurs'], 'erreur'),
        );
    }

    #[TestDox('UC-SYS-01-F11 — A9 : jobs d’un établissement « endpoint » — ignorés par le cron, servis au runner')]
    public function testF11EndpointJobsBelongToTheRunner(): void
    {
        [, , $runId, , $token] = $this->endpointRun();

        self::assertSame(0, self::json($this->adminTick(['maxCalls' => 8]))['jobsTouched']);
        self::assertSame(['queued' => 2], self::jobStatuses($runId));
        self::assertCount(2, self::json($this->worker('GET', '/api/worker/jobs?limit=5', null, $token))['jobs']);
    }

    #[TestDox('UC-SYS-01-F12 — E1 : jeton absent ou inconnu → 401 ; job d’un autre établissement → 404 (réservation vide)')]
    public function testF12TokenAndOwnershipGuards(): void
    {
        [, , , , $token] = $this->endpointRun([['2026-01-05']]);
        $job = self::json($this->worker('GET', '/api/worker/jobs', null, $token))['jobs'][0];
        $routes = [
            ['GET', '/api/worker/jobs', null],
            ['POST', "/api/worker/jobs/{$job['id']}/checkpoint", ['checkpoint' => ['poles' => []]]],
            ['POST', "/api/worker/jobs/{$job['id']}/result", ['erreur' => 'x']],
        ];
        foreach ($routes as [$method, $path, $body]) {
            $this->cookieSid = null;
            self::assertSame(401, $this->request($method, $path, $body)->getStatusCode(), "sans jeton {$path}");
            $unknown = $this->worker($method, $path, $body, 'hwk_' . str_repeat('0', 32));
            self::assertSame(401, $unknown->getStatusCode());
            self::assertSame(['error' => 'Jeton worker invalide'], self::json($unknown));
        }

        $autre = $this->registerEtablissement('autre@example.org');
        $this->configure($autre, 10.0, ['provider' => 'endpoint', 'endpointUrl' => 'http://10.0.0.9:8000']);
        $foreignToken = self::json($this->as_($autre, 'POST', '/api/etablissement/worker-token'))['workerToken'];
        self::assertSame([], self::json($this->worker('GET', '/api/worker/jobs', null, $foreignToken))['jobs']);
        foreach (array_slice($routes, 1) as [$method, $path, $body]) {
            $response = $this->worker($method, $path, $body, $foreignToken);
            self::assertSame(404, $response->getStatusCode());
            self::assertSame(['error' => 'Job introuvable'], self::json($response));
        }
    }

    #[TestDox('UC-SYS-01-F13 — E2 : checkpoint qui n’est pas un objet JSON (ou > 2 Mo) → 422 ; job plus en cours → 409')]
    public function testF13CheckpointValidationAndConflict(): void
    {
        [, , , , $token] = $this->endpointRun([['2026-01-05']]);
        $job = self::json($this->worker('GET', '/api/worker/jobs', null, $token))['jobs'][0];
        $path = "/api/worker/jobs/{$job['id']}/checkpoint";

        foreach ([[], ['checkpoint' => [1, 2]], ['checkpoint' => 'poles'], ['checkpoint' => ['blob' => str_repeat('x', 2 * 1024 * 1024)]]] as $body) {
            $response = $this->worker('POST', $path, $body, $token);
            self::assertSame(422, $response->getStatusCode());
            self::assertSame('checkpoint requis (objet JSON, 2 Mo maximum)', self::json($response)['error']);
        }

        Db::get()->exec("UPDATE mass_jobs SET status = 'cancelled' WHERE id = {$job['id']}");
        $conflict = $this->worker('POST', $path, ['checkpoint' => ['poles' => []]], $token);
        self::assertSame(409, $conflict->getStatusCode());
        self::assertSame('Job plus en cours (annulé ou bail repris)', self::json($conflict)['error']);
    }

    #[TestDox('UC-SYS-01-F14 — E3 : résultat invalide → 422 ; rejeu → 409 sans double comptage ; coût déclaré borné à [0, 1000] $')]
    public function testF14ResultValidationReplayAndCostBounds(): void
    {
        [$etab, , , , $token] = $this->endpointRun([['2026-01-05', '2026-01-06', '2026-01-07']]);
        $jobs = self::json($this->worker('GET', '/api/worker/jobs?limit=5', null, $token))['jobs'];
        $path = "/api/worker/jobs/{$jobs[0]['id']}/result";
        $document = self::dayDocument('2026-01-05');
        $broken = $document;
        unset($broken['poles']);

        $invalid = [
            'ni document ni erreur' => [['tokens' => []], 'Fournir soit document, soit erreur'],
            'les deux' => [['document' => $document, 'erreur' => 'x'], 'Fournir soit document, soit erreur'],
            'erreur vide' => [['erreur' => '  '], 'erreur doit être une chaîne non vide'],
            'document liste' => [['document' => [1, 2]], 'document doit être un objet JSON cartographie-jour'],
            'autre journée' => [['document' => self::dayDocument('2026-01-06')], 'document.date doit valoir 2026-01-05'],
            'hors schéma' => [['document' => $broken], 'Document invalide au schéma cartographie-jour'],
        ];
        foreach ($invalid as $case => [$body, $message]) {
            $response = $this->worker('POST', $path, $body, $token);
            self::assertSame(422, $response->getStatusCode(), $case);
            self::assertSame($message, self::json($response)['error'], $case);
        }
        self::assertLessThanOrEqual(5, \count(self::json($this->worker('POST', $path, ['document' => $broken], $token))['details']));

        self::assertSame(200, $this->worker('POST', $path, ['document' => $document, 'coutUsd' => 5000], $token)->getStatusCode());
        self::assertEqualsWithDelta(1000.0, self::spentUsd($etab['id']), 1e-9, 'coût borné à 1 000 $');
        $replay = $this->worker('POST', $path, ['document' => $document, 'coutUsd' => 1], $token);
        self::assertSame(409, $replay->getStatusCode());
        self::assertEqualsWithDelta(1000.0, self::spentUsd($etab['id']), 1e-9, 'rejeu : aucun double comptage');

        foreach ([[$jobs[1], -3], [$jobs[2], '0.5']] as [$job, $cost]) {
            $this->worker('POST', "/api/worker/jobs/{$job['id']}/result", ['document' => self::dayDocument($job['date']), 'coutUsd' => $cost], $token);
        }
        self::assertEqualsWithDelta(1000.0, self::spentUsd($etab['id']), 1e-9, 'négatif ou texte → 0');
    }

    #[TestDox('UC-SYS-01-F15 — E6 : le runner signale trois échecs → job « failed », tentatives et dernier message au tableau')]
    public function testF15RunnerErrorsUntilFailure(): void
    {
        [$etab, , $runId, , $token] = $this->endpointRun([['2026-01-05']]);

        for ($attempt = 1; $attempt <= 3; $attempt++) {
            $jobs = self::json($this->worker('GET', '/api/worker/jobs', null, $token))['jobs'];
            self::assertCount(1, $jobs, "tentative {$attempt} : job re-servi");
            $recorded = $this->worker('POST', "/api/worker/jobs/{$jobs[0]['id']}/result", ['erreur' => "extractDay : GPU saturé ({$attempt})"], $token);
            self::assertSame(['id' => $jobs[0]['id'], 'status' => 'recorded'], self::json($recorded));
        }

        $board = $this->board($etab, $runId);
        self::assertSame('failed', $board['status']);
        self::assertSame([3, 'runner : extractDay : GPU saturé (3)'], [$board['erreurs'][0]['attempts'], $board['erreurs'][0]['erreur']]);
        self::assertSame([], self::json($this->worker('GET', '/api/worker/jobs', null, $token))['jobs']);
    }

    #[TestDox('UC-SYS-01-F16 — comportements ACTUELS figés : tokens au format du runner ignorés ; erreur après « done » acceptée et facturée')]
    public function testF16CurrentContractFrictionsAreFrozen(): void
    {
        [$etab, , $runId, , $token] = $this->endpointRun([['2026-01-05']]);
        $job = self::json($this->worker('GET', '/api/worker/jobs', null, $token))['jobs'][0];

        // Le runner Node poste tokens {inputTokens, outputTokens} ; la route lit {input, output}.
        $this->worker('POST', "/api/worker/jobs/{$job['id']}/result", [
            'document' => self::dayDocument('2026-01-05'),
            'tokens' => ['inputTokens' => 41200, 'outputTokens' => 7900],
            'coutUsd' => 0.24,
        ], $token);
        self::assertSame(['input' => 0, 'output' => 0], $this->board($etab, $runId)['tokens']);

        // Une erreur postée APRÈS le succès (ex. runner qui reçoit 409 puis
        // signale l'échec) répond 200 « recorded » et refacture le coût.
        $late = $this->worker('POST', "/api/worker/jobs/{$job['id']}/result", ['erreur' => 'HTTP 409', 'coutUsd' => 0.24], $token);
        self::assertSame(200, $late->getStatusCode());
        self::assertSame('recorded', self::json($late)['status']);
        self::assertSame('done', $this->board($etab, $runId)['status']);
        self::assertEqualsWithDelta(0.48, self::spentUsd($etab['id']), 1e-9);
    }

    #[TestDox('UC-SYS-01-F17 — A7 (runner) : plafond dépassé par les coûts déclarés → réservation refusée {jobs: [], budget: "exceeded"}')]
    public function testF17RunnerReservationRefusedOverBudget(): void
    {
        [$etab, , $runId, , $token] = $this->endpointRun(); // plafond 100 $
        $first = self::json($this->worker('GET', '/api/worker/jobs?limit=1', null, $token))['jobs'][0];
        $this->worker('POST', "/api/worker/jobs/{$first['id']}/result", ['document' => self::dayDocument('2026-01-05'), 'coutUsd' => 150], $token);

        $refused = self::json($this->worker('GET', '/api/worker/jobs?limit=5', null, $token));

        self::assertSame(['jobs' => [], 'budget' => 'exceeded'], $refused);
        self::assertSame(['budget_exceeded' => 1, 'done' => 1], self::jobStatuses($runId));
        self::assertSame('budget_exceeded', $this->board($etab, $runId)['status']);
    }
}
