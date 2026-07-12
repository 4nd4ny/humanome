<?php

declare(strict_types=1);

namespace Humanome\Tests;

use Humanome\Db;
use Humanome\Etablissement\ConfigRepository;
use Psr\Http\Message\ResponseInterface;

/**
 * P11 machine-runner API (/api/worker/*, ADR-005 alternative): bearer
 * X-Worker-Token, scoped reservation with lease, checkpoint renewal,
 * server-side re-validation of results, budget refusal — plus the
 * POST /api/admin/worker-tick trigger (X-Migrate-Token).
 */
final class WorkerRouteTest extends MasseTestCase
{
    /** @var array{id: int, csrf: string, sid: string} */
    private array $etab;
    private string $token;
    private int $runId;
    /** @var array{id: int, csrf: string, sid: string} */
    private array $learner;

    protected function setUp(): void
    {
        parent::setUp();
        $this->etab = $this->registerEtablissement();
        // Machine runner scenario: the establishment's own infrastructure.
        $this->configure($this->etab, 100.0, [
            'provider' => 'endpoint',
            'endpointUrl' => 'http://192.168.1.50:11434',
            'model' => 'llama3:70b',
        ]);
        $this->token = self::json($this->as_($this->etab, 'POST', '/api/etablissement/worker-token'))['workerToken'];
        $cohorte = $this->createCohorte($this->etab);
        $this->learner = $this->enrolLearner($cohorte['code'], $cohorte['id'], 1, ['2026-01-05', '2026-01-06']);
        $this->runId = (int) $this->launchRun($this->etab, $cohorte['id'])['runId'];
    }

    /** Machine request: NO session cookie (outside CSRF by construction). */
    private function worker(string $method, string $path, ?array $body = null, ?string $token = null): ResponseInterface
    {
        $this->cookieSid = null;

        return $this->request($method, $path, $body, ['X-Worker-Token' => $token ?? $this->token]);
    }

    public function testJetonInvalide401(): void
    {
        $this->cookieSid = null;
        self::assertSame(401, $this->request('GET', '/api/worker/jobs')->getStatusCode());
        self::assertSame(401, $this->worker('GET', '/api/worker/jobs', null, 'hwk_' . str_repeat('0', 32))->getStatusCode());
        self::assertSame(401, $this->worker('POST', '/api/worker/jobs/1/result', ['erreur' => 'x'], 'mauvais')->getStatusCode());
    }

    public function testReservationAvecBailEtChargeUtileComplete(): void
    {
        $body = self::json($this->worker('GET', '/api/worker/jobs?limit=5'));
        self::assertCount(2, $body['jobs']);
        $job = $body['jobs'][0];
        self::assertSame('2026-01-05', $job['date']);
        self::assertStringContainsString("de l'apprenant 1", $job['dayText'] ?? '');
        self::assertStringContainsString("j'ai", $job['dayText']);
        self::assertNull($job['checkpoint']);
        self::assertSame(['id' => self::PACKAGE_ID, 'version' => self::PACKAGE_VERSION], $job['promptPackage']);
        self::assertSame(['id' => 'respire', 'version' => '7.0.0'], $job['referentielVersion']);
        self::assertSame('llama3:70b', $job['model']);
        self::assertSame(300, $job['leaseSeconds']);

        // The runner runs the ENGINE on its own machine: the batch shares the
        // FULL frozen referentiel document (poles + competences) at response
        // level; same-version jobs do not repeat it (docs/runner-node.md).
        self::assertArrayNotHasKey('referentiel', $job);
        self::assertCount(7, $body['referentiel']['poles']);
        self::assertNotEmpty($body['referentiel']['competences']);

        // The job carries the establishment's LLM config (never its key):
        // the runner is autonomous without --provider/--endpoint/--model.
        self::assertSame([
            'provider' => 'endpoint',
            'endpointUrl' => 'http://192.168.1.50:11434',
            'model' => 'llama3:70b',
        ], $job['provider']);

        // Reserved: a second poll gets nothing while the lease holds.
        self::assertSame([], self::json($this->worker('GET', '/api/worker/jobs?limit=5'))['jobs']);

        // Lease expiry puts the job back on the market, checkpoint intact.
        Db::get()->exec('UPDATE mass_jobs SET lease_until = DATE_SUB(NOW(), INTERVAL 1 SECOND)');
        self::assertCount(2, self::json($this->worker('GET', '/api/worker/jobs?limit=5'))['jobs']);
    }

    public function testCheckpointRenouvelleLeBail(): void
    {
        $job = self::json($this->worker('GET', '/api/worker/jobs'))['jobs'][0];

        self::assertSame(422, $this->worker('POST', "/api/worker/jobs/{$job['id']}/checkpoint", ['checkpoint' => [1, 2]])->getStatusCode());

        // Shrink the lease to +5 s: the checkpoint must push it back to +300 s.
        Db::get()->exec('UPDATE mass_jobs SET lease_until = DATE_ADD(NOW(), INTERVAL 5 SECOND) WHERE id = ' . $job['id']);
        $before = Db::get()->query('SELECT lease_until FROM mass_jobs WHERE id = ' . $job['id'])->fetchColumn();
        $ok = $this->worker('POST', "/api/worker/jobs/{$job['id']}/checkpoint", ['checkpoint' => ['poles' => ['1' => ['stub' => true]]]]);
        self::assertSame(200, $ok->getStatusCode());
        $after = Db::get()->query('SELECT lease_until, checkpoint FROM mass_jobs WHERE id = ' . $job['id'])->fetch();
        self::assertGreaterThan($before, $after['lease_until']);
        self::assertStringContainsString('stub', (string) $after['checkpoint']);

        // A queued job (not running) answers 409 — no blind writes.
        Db::get()->exec('UPDATE mass_jobs SET status = "queued", lease_until = NULL WHERE id = ' . $job['id']);
        self::assertSame(409, $this->worker('POST', "/api/worker/jobs/{$job['id']}/checkpoint", ['checkpoint' => ['poles' => []]])->getStatusCode());
    }

    public function testResultatValideCoteServeur(): void
    {
        $job = self::json($this->worker('GET', '/api/worker/jobs'))['jobs'][0];
        $document = json_decode(
            (string) file_get_contents(dirname(__DIR__, 2) . '/schemas/fixtures/cartographie-jour-2026-01-05.json'),
            true,
            512,
            JSON_THROW_ON_ERROR,
        );

        // document XOR erreur.
        self::assertSame(422, $this->worker('POST', "/api/worker/jobs/{$job['id']}/result", ['tokens' => []])->getStatusCode());
        self::assertSame(422, $this->worker('POST', "/api/worker/jobs/{$job['id']}/result", ['document' => $document, 'erreur' => 'x'])->getStatusCode());

        // Wrong date for the job -> 422.
        $wrongDay = array_merge($document, ['date' => '2026-03-01']);
        self::assertSame(422, $this->worker('POST', "/api/worker/jobs/{$job['id']}/result", ['document' => $wrongDay])->getStatusCode());

        // Schema-invalid document -> 422 with details.
        $broken = $document;
        unset($broken['poles']);
        $refused = $this->worker('POST', "/api/worker/jobs/{$job['id']}/result", ['document' => $broken]);
        self::assertSame(422, $refused->getStatusCode());

        // Valid -> done + usage accounted (bounded declared cost).
        $ok = $this->worker('POST', "/api/worker/jobs/{$job['id']}/result", [
            'document' => $document,
            'tokens' => ['input' => 12000, 'output' => 8000],
            'coutUsd' => 0.42,
        ]);
        self::assertSame(200, $ok->getStatusCode(), (string) $ok->getBody());
        $row = Db::get()->query('SELECT status, tokens_input, tokens_output, cost_usd FROM mass_jobs WHERE id = ' . $job['id'])->fetch();
        self::assertSame('done', $row['status']);
        self::assertSame(12000, (int) $row['tokens_input']);
        self::assertSame(8000, (int) $row['tokens_output']);
        self::assertEqualsWithDelta(0.42, (float) $row['cost_usd'], 1e-9);
        self::assertEqualsWithDelta(0.42, self::spentUsd($this->etab['id']), 1e-9);

        // Replay after completion: 409, no double accounting.
        self::assertSame(409, $this->worker('POST', "/api/worker/jobs/{$job['id']}/result", ['document' => $document])->getStatusCode());
        self::assertEqualsWithDelta(0.42, self::spentUsd($this->etab['id']), 1e-9);

        // The establishment sees the day document (envelope {membre, documents}).
        $body = self::json($this->as_($this->etab, 'GET', '/api/etablissement/membres/' . $this->learner['id'] . '/documents'));
        self::assertSame('Apprenant 1', $body['membre']['displayName']);
        self::assertNotEmpty($body['membre']['consentAt']);
        self::assertSame('2026-01-05', $body['documents'][0]['date']);
    }

    public function testErreursRunnerPuisEchecDefinitif(): void
    {
        $job = self::json($this->worker('GET', '/api/worker/jobs'))['jobs'][0];

        for ($i = 1; $i <= 3; $i++) {
            $recorded = $this->worker('POST', "/api/worker/jobs/{$job['id']}/result", ['erreur' => "GPU saturé ({$i})"]);
            self::assertSame(200, $recorded->getStatusCode());
            $status = Db::get()->query('SELECT status FROM mass_jobs WHERE id = ' . $job['id'])->fetchColumn();
            if ($i < 3) {
                self::assertSame('queued', $status, "tentative {$i}: retour en file");
                // The runner re-reserves for the next attempt.
                $jobs = self::json($this->worker('GET', '/api/worker/jobs?limit=5'))['jobs'];
                self::assertContains($job['id'], array_column($jobs, 'id'));
            } else {
                self::assertSame('failed', $status, 'MAX_ATTEMPTS: échec définitif');
            }
        }

        $board = self::json($this->as_($this->etab, 'GET', '/api/etablissement/runs/' . $this->runId));
        self::assertSame(1, $board['jobs']['failed']);
        self::assertStringContainsString('GPU saturé', $board['erreurs'][0]['erreur']);
    }

    public function testJobEtrangerInvisible(): void
    {
        // A second establishment with its own token sees NOTHING of ours.
        $autre = $this->registerEtablissement('autre@example.org');
        $this->configure($autre, 10.0, ['provider' => 'endpoint', 'endpointUrl' => 'http://10.0.0.9:8000']);
        $tokenAutre = self::json($this->as_($autre, 'POST', '/api/etablissement/worker-token'))['workerToken'];

        self::assertSame([], self::json($this->worker('GET', '/api/worker/jobs?limit=5', null, $tokenAutre))['jobs']);

        $job = self::json($this->worker('GET', '/api/worker/jobs'))['jobs'][0];
        self::assertSame(404, $this->worker('POST', "/api/worker/jobs/{$job['id']}/result", ['erreur' => 'x'], $tokenAutre)->getStatusCode());
        self::assertSame(404, $this->worker('POST', "/api/worker/jobs/{$job['id']}/checkpoint", ['checkpoint' => ['poles' => []]], $tokenAutre)->getStatusCode());
    }

    public function testBudgetConsommeRefuseLaReservation(): void
    {
        (new ConfigRepository(Db::get()))->addSpentUsd($this->etab['id'], 200.0); // cap = 100

        $body = self::json($this->worker('GET', '/api/worker/jobs?limit=5'));
        self::assertSame([], $body['jobs']);
        self::assertSame('exceeded', $body['budget']);
        $statuses = self::jobStatuses($this->runId);
        self::assertSame(2, $statuses['budget_exceeded'] ?? 0);
        self::assertSame('budget_exceeded', self::runStatus($this->runId));

        // Raising the cap through the API reactivates (plan-masse §4).
        $this->configure($this->etab, 500.0, ['provider' => 'endpoint', 'endpointUrl' => 'http://192.168.1.50:11434']);
        self::assertSame('active', self::runStatus($this->runId));
        self::assertCount(2, self::json($this->worker('GET', '/api/worker/jobs?limit=5'))['jobs']);
    }

    public function testLeTickCronIgnoreLesJobsEndpoint(): void
    {
        // Establishment on 'endpoint': the platform cron must NOT reach for
        // its jobs (unreachable local infra, plan-masse §5) — the machine
        // runner keeps them.
        $counters = $this->tick();
        self::assertSame(0, $counters['jobsTouched']);
        self::assertSame(['queued' => 2], self::jobStatuses($this->runId));
    }

    public function testAdminWorkerTick(): void
    {
        $this->cookieSid = null;
        self::assertSame(403, $this->request('POST', '/api/admin/worker-tick', [], ['X-Migrate-Token' => 'mauvais'])->getStatusCode());

        $response = $this->request('POST', '/api/admin/worker-tick', ['maxCalls' => 1], [
            'X-Migrate-Token' => \Humanome\Env::get('MIGRATE_TOKEN'),
        ]);
        self::assertSame(200, $response->getStatusCode(), (string) $response->getBody());
        $counters = self::json($response);
        self::assertFalse($counters['locked']);
        self::assertSame(0, $counters['jobsTouched'], 'jobs endpoint: rien à faire pour le cron');
        self::assertArrayHasKey('elapsedMs', $counters);
    }
}
