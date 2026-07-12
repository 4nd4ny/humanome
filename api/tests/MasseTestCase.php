<?php

declare(strict_types=1);

namespace Humanome\Tests;

use Humanome\Db;
use Humanome\Packages\PromptPackageRepository;
use Humanome\Referentiel\ReferentielRepository;
use Humanome\Worker\Tick;

/**
 * Shared plumbing for the P11 mass-cartography tests: real referentiel v7 +
 * REAL default prompt package (built from the engine templates) in base,
 * establishment/learner accounts through the API, cohort/deposit/run
 * helpers, and simulated ticks with an injected counting mock provider.
 */
abstract class MasseTestCase extends CartographeTestCase
{
    protected const PACKAGE_ID = 'aurora-v3-reconstruit';
    protected const PACKAGE_VERSION = '1.0.0';

    /** The three fixture days the MockProvider can answer for. */
    protected const DAYS = ['2026-01-05', '2026-01-06', '2026-01-07'];

    protected MasseCountingProvider $provider;

    protected function setUp(): void
    {
        parent::setUp(); // wipes users (cohortes/runs/jobs cascade) + audit
        $pdo = Db::get();
        $pdo->exec('DELETE FROM referentiel_versions');
        $pdo->exec('DELETE FROM prompt_packages');
        $pdo->exec('DELETE FROM settings');

        (new ReferentielRepository($pdo))->importPublishedDocument(self::respireDocument(), 'Import P11');
        (new PromptPackageRepository($pdo))->importPublishedDocument(self::defaultPackageDocument());

        $this->provider = new MasseCountingProvider();
    }

    /** @return array<string, mixed> the real extracted RESPIRE v7 document */
    protected static function respireDocument(): array
    {
        $path = dirname(__DIR__, 2) . '/web/public/data/referentiel/respire-v7.json';
        self::assertFileExists($path, 'run: node scripts/extract-referentiel.mjs');

        return json_decode((string) file_get_contents($path), true, 512, JSON_THROW_ON_ERROR);
    }

    /** @return array<string, mixed> the REAL default package (engine templates) */
    protected static function defaultPackageDocument(): array
    {
        $path = dirname(__DIR__, 2) . '/build/prompt-packages/aurora-v3-reconstruit-1.0.0.json';
        self::assertFileExists($path, 'run: node scripts/build-default-prompt-package.mjs');

        return json_decode((string) file_get_contents($path), true, 512, JSON_THROW_ON_ERROR);
    }

    // ------------------------------------------------------------ fixtures

    /**
     * The 20-learner fixture exceeds the per-IP register quota (10/h):
     * the quota is not the subject here, reset it between registrations.
     *
     * @param list<string> $roles
     * @return array{id: int, csrf: string, sid: string}
     */
    protected function registerAs(string $email, string $name, array $roles = ['apprenant']): array
    {
        self::$pdo->exec('DELETE FROM rate_limits');

        return parent::registerAs($email, $name, $roles);
    }

    /** @return array{id: int, csrf: string, sid: string} */
    protected function registerEtablissement(string $email = 'lycee@example.org'): array
    {
        return $this->registerAs($email, 'Lycée Astrolabe', ['etablissement']);
    }

    /**
     * Establishment LLM/budget config through the API (PUT /etablissement/config).
     *
     * @param array{id: int, csrf: string, sid: string} $etab
     */
    protected function configure(array $etab, float $budgetCapUsd, array $overrides = []): void
    {
        $response = $this->as_($etab, 'PUT', '/api/etablissement/config', array_merge([
            'provider' => 'humanome',
            'model' => 'claude-sonnet-4-5',
            'budgetCapUsd' => $budgetCapUsd,
        ], $overrides));
        self::assertSame(200, $response->getStatusCode(), (string) $response->getBody());
    }

    /**
     * @param array{id: int, csrf: string, sid: string} $etab
     * @return array{id: int, code: string}
     */
    protected function createCohorte(array $etab, string $nom = 'Terminale B'): array
    {
        $response = $this->as_($etab, 'POST', '/api/etablissement/cohortes', ['nom' => $nom]);
        self::assertSame(201, $response->getStatusCode(), (string) $response->getBody());
        $body = self::json($response);

        return ['id' => (int) $body['id'], 'code' => (string) $body['codeInvitation']];
    }

    /**
     * Registers a learner, joins the cohorte WITH explicit consent and
     * deposits a portfolio of short varied day texts (fixture days).
     *
     * @param list<string> $days
     * @return array{id: int, csrf: string, sid: string}
     */
    protected function enrolLearner(string $code, int $cohorteId, int $i, array $days = self::DAYS): array
    {
        $learner = $this->registerAs("apprenant{$i}@example.org", "Apprenant {$i}");

        $joined = $this->as_($learner, 'POST', "/api/cohortes/{$code}/rejoindre", ['consentement' => true]);
        self::assertSame(201, $joined->getStatusCode(), (string) $joined->getBody());

        $segments = [];
        foreach ($days as $d => $date) {
            $segments[] = [
                'date' => $date,
                'texte' => "Feuille {$d} de l'apprenant {$i} : aujourd'hui j'ai "
                    . ['réparé un vélo', 'animé le conseil', 'écrit un conte', 'mesuré le potager'][($i + $d) % 4]
                    . " avec les autres, puis noté ce que j'en retire.",
            ];
        }
        $deposited = $this->as_($learner, 'POST', "/api/cohortes/{$cohorteId}/portfolio", [
            'titre' => "Portfolio {$i}",
            'segments' => $segments,
        ]);
        self::assertSame(201, $deposited->getStatusCode(), (string) $deposited->getBody());

        return $learner;
    }

    /**
     * @param array{id: int, csrf: string, sid: string} $etab
     * @return array{runId: int, jobs: int}
     */
    protected function launchRun(array $etab, int $cohorteId, ?array $membres = null): array
    {
        $body = [
            'promptPackageId' => self::PACKAGE_ID,
            'promptPackageVersion' => self::PACKAGE_VERSION,
        ];
        if ($membres !== null) {
            $body['membres'] = $membres;
        }
        $response = $this->as_($etab, 'POST', "/api/etablissement/cohortes/{$cohorteId}/runs", $body);
        self::assertSame(201, $response->getStatusCode(), (string) $response->getBody());

        return self::json($response);
    }

    // --------------------------------------------------------------- ticks

    /** One simulated tick with the injected counting provider. */
    protected function tick(array $options = []): array
    {
        return (new Tick(Db::get(), $options + [
            'budgetSeconds' => 3600, // tests bound by maxCalls, not wall time
            'providerFactory' => fn (array $config): object => $this->provider,
        ]))->run();
    }

    /**
     * Tick loop until the queue drains (no workable job left) — the cron
     * simulation of the DoD. Returns the number of ticks.
     */
    protected function tickUntilDrained(array $options = [], int $maxTicks = 700): int
    {
        for ($ticks = 1; $ticks <= $maxTicks; $ticks++) {
            $counters = $this->tick($options);
            if ($counters['jobsTouched'] === 0) {
                return $ticks;
            }
        }
        self::fail("queue not drained after {$maxTicks} ticks");
    }

    // ------------------------------------------------------------- lookups

    /** @return array<string, int> jobs per status for a run */
    protected static function jobStatuses(int $runId): array
    {
        $stmt = Db::get()->prepare(
            'SELECT status, COUNT(*) FROM mass_jobs WHERE run_id = ? GROUP BY status'
        );
        $stmt->execute([$runId]);
        $statuses = array_map(intval(...), $stmt->fetchAll(\PDO::FETCH_KEY_PAIR));
        ksort($statuses); // deterministic expectations (alphabetical)

        return $statuses;
    }

    protected static function runStatus(int $runId): string
    {
        $stmt = Db::get()->prepare('SELECT status FROM mass_runs WHERE id = ?');
        $stmt->execute([$runId]);

        return (string) $stmt->fetchColumn();
    }

    protected static function spentUsd(int $etablissementId): float
    {
        $stmt = Db::get()->prepare('SELECT spent_usd FROM etablissement_config WHERE user_id = ?');
        $stmt->execute([$etablissementId]);

        return (float) $stmt->fetchColumn();
    }
}
