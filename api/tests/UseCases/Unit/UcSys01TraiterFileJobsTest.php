<?php

declare(strict_types=1);

namespace Humanome\Tests\UseCases\Unit;

use Humanome\Etablissement\CohorteRepository;
use Humanome\Llm\MockProvider;
use Humanome\Llm\UpstreamException;
use Humanome\MigrationRunner;
use Humanome\Tests\LlmFakeHttpClient;
use Humanome\Tests\TestDb;
use Humanome\Tests\UseCases\Support\EtaSupport;
use Humanome\Validation;
use Humanome\Worker\JobQueue;
use Humanome\Worker\OpenAiCompatibleProvider;
use Humanome\Worker\PoleAssembler;
use Humanome\Worker\PromptRunner;
use Humanome\Worker\Tick;
use PDO;
use PHPUnit\Framework\Attributes\TestDox;
use PHPUnit\Framework\TestCase;

/**
 * UC-SYS-01 — Traiter la file de jobs de masse : tests UNITAIRES.
 *
 * Fiche : docs/cas-utilisation/systeme/UC-SYS-01-traiter-file-jobs.md
 *
 * Les pièces du traitement sont appelées directement : la file MySQL
 * (JobQueue : réservation avec bail, points de reprise, fin, échecs,
 * coupe-circuit budgétaire), le tick borné (Tick, avec un fournisseur
 * injecté — jamais de réseau), la substitution des gabarits (PromptRunner),
 * l'assemblage/validation des réponses (PoleAssembler) et le fournisseur
 * compatible OpenAI des établissements (faux client HTTP).
 */
final class UcSys01TraiterFileJobsTest extends TestCase
{
    use EtaSupport;

    private static PDO $pdo;

    public static function setUpBeforeClass(): void
    {
        self::$pdo = TestDb::fresh();
        (new MigrationRunner(self::$pdo, MigrationRunner::defaultMigrationsDir()))->run();
        self::seedPublishedVersions(self::$pdo);
    }

    protected function setUp(): void
    {
        self::$pdo->exec('DELETE FROM users');
    }

    /**
     * Établissement configuré + cohorte + déposants + run enfilé.
     *
     * @param list<list<string>> $datesByLearner
     * @return array{etab: int, runId: int, learners: list<int>}
     */
    private static function seedRun(array $datesByLearner, string $provider = 'humanome', float $cap = 50.0): array
    {
        $etab = self::seedUser(self::$pdo, 'Lycée ' . uniqid(), ['etablissement']);
        self::seedConfig(self::$pdo, $etab, $cap, $provider, $provider === 'endpoint' ? 'llama3' : 'claude-sonnet-4-5', 0.0,
            $provider === 'endpoint' ? 'http://10.0.0.12:11434' : null);
        $cohortes = new CohorteRepository(self::$pdo);
        $cohorteId = $cohortes->create($etab, 'Terminale B')['id'];
        $learners = [];
        foreach ($datesByLearner as $i => $dates) {
            $learners[] = $learner = self::seedUser(self::$pdo, "Apprenant {$i}");
            self::seedDepositor(self::$pdo, $cohorteId, $learner, $dates);
        }
        $runId = (new JobQueue(self::$pdo))->enqueueRun(
            $etab, $cohorteId, 'aurora-v3-reconstruit', '1.0.0', 'respire', '7.0.0',
            $cohortes->depositsForRun($cohorteId, null),
        )['runId'];

        return ['etab' => $etab, 'runId' => $runId, 'learners' => $learners];
    }

    private static function job(int $jobId): array
    {
        return self::$pdo->query('SELECT * FROM mass_jobs WHERE id = ' . $jobId)->fetch();
    }

    private static function jobIds(int $runId): array
    {
        return array_map(intval(...), self::$pdo->query("SELECT id FROM mass_jobs WHERE run_id = {$runId} ORDER BY id")->fetchAll(PDO::FETCH_COLUMN));
    }

    private static function tick(object $provider, array $options = []): array
    {
        return (new Tick(self::$pdo, $options + [
            'budgetSeconds' => 3600,
            'providerFactory' => static fn (array $config): object => $provider,
        ]))->run();
    }

    /** Fournisseur mock qui répond « pas de JSON » aux N premiers appels (ou aux prompts kairos). */
    private static function flakyProvider(int $garbageFirst = 0, bool $garbageKairos = false): object
    {
        return new class ($garbageFirst, $garbageKairos) {
            public int $calls = 0;
            private MockProvider $inner;

            public function __construct(private int $garbageFirst, private bool $garbageKairos)
            {
                $this->inner = new MockProvider();
            }

            public function complete(string $model, ?string $system, string $prompt, int $maxTokens): array
            {
                $this->calls++;
                if ($this->garbageFirst > 0 || ($this->garbageKairos && str_contains($prompt, 'SYNTHÈSE KAIROS'))) {
                    $this->garbageFirst = max(0, $this->garbageFirst - 1);

                    return ['text' => 'Désolé, pas de JSON ici.', 'usage' => ['inputTokens' => 1000, 'outputTokens' => 500], 'model' => 'mock'];
                }

                return $this->inner->complete($model, $system, $prompt, $maxTokens);
            }
        };
    }

    // ------------------------------------------------------------ JobQueue

    #[TestDox('UC-SYS-01-U01 — reserve : priorité puis ancienneté, bail 5 min, cron = fournisseur humanome seul, runner = son établissement, bail expiré repris')]
    public function testU01ReserveScopesLeasesAndPriorities(): void
    {
        $a = self::seedRun([['2026-01-05', '2026-01-06', '2026-01-07']]);
        $b = self::seedRun([['2026-01-05', '2026-01-06']], 'endpoint');
        [$a1, $a2, $a3] = self::jobIds($a['runId']);
        self::$pdo->exec("UPDATE mass_jobs SET priority = 5 WHERE id = {$a3}");
        $queue = new JobQueue(self::$pdo);

        $first = $queue->reserve(1);
        self::assertSame([$a3], array_map(static fn (array $j): int => (int) $j['id'], $first), 'priorité d’abord');
        self::assertSame([$a['etab'], 'aurora-v3-reconstruit', '7.0.0'], [(int) $first[0]['etablissement_id'], $first[0]['prompt_package_slug'], $first[0]['referentiel_semver']]);
        $lease = (int) self::scalar(self::$pdo, 'SELECT TIMESTAMPDIFF(SECOND, NOW(), lease_until) FROM mass_jobs WHERE id = ?', [$a3]);
        self::assertGreaterThanOrEqual(295, $lease);
        self::assertLessThanOrEqual(300, $lease);
        self::assertSame('running', self::job($a3)['status']);

        $cron = array_map(static fn (array $j): int => (int) $j['id'], $queue->reserve(10));
        self::assertSame([$a1, $a2], $cron, 'le cron ne sert pas l’établissement en « endpoint »');
        self::assertSame(self::jobIds($b['runId']), array_map(static fn (array $j): int => (int) $j['id'], $queue->reserve(10, $b['etab'])));
        self::assertSame([], $queue->reserve(10, $a['etab']), 'baux en cours : rien à reprendre');

        self::$pdo->exec("UPDATE mass_jobs SET lease_until = NOW() - INTERVAL 1 SECOND WHERE id = {$a1}");
        self::assertSame([$a1], array_map(static fn (array $j): int => (int) $j['id'], $queue->reserve(10)), 'bail expiré : de nouveau réservable');
    }

    #[TestDox('UC-SYS-01-U02 — reserve : limite bornée à [1, 20] ; établissement sans configuration jamais servi')]
    public function testU02ReserveLimitIsClampedAndUnconfiguredIsNeverServed(): void
    {
        $dates = [];
        for ($d = 0; $d < 25; $d++) {
            $dates[] = date('Y-m-d', strtotime('2026-02-01 +' . $d . ' days'));
        }
        $run = self::seedRun([$dates]);
        $queue = new JobQueue(self::$pdo);

        self::assertCount(1, $queue->reserve(0, $run['etab']));
        self::assertCount(20, $queue->reserve(100, $run['etab']));

        $orphan = self::seedRun([['2026-01-05']]);
        self::$pdo->exec("DELETE FROM etablissement_config WHERE user_id = {$orphan['etab']}");
        self::assertSame([], $queue->reserve(20, $orphan['etab']));
        self::assertCount(4, $queue->reserve(20), 'le cron ne sert que les 4 jobs restants du premier établissement');
    }

    #[TestDox('UC-SYS-01-U03 — saveCheckpoint / release / complete : écritures conditionnelles au statut running')]
    public function testU03CheckpointReleaseCompleteAreConditional(): void
    {
        $run = self::seedRun([['2026-01-05']]);
        [$jobId] = self::jobIds($run['runId']);
        $queue = new JobQueue(self::$pdo);
        self::assertFalse($queue->saveCheckpoint($jobId, ['poles' => []], 1, 1, 0.1), 'job en file : refus');

        $queue->reserve(1);
        self::$pdo->exec("UPDATE mass_jobs SET lease_until = NOW() + INTERVAL 5 SECOND WHERE id = {$jobId}");
        self::assertTrue($queue->saveCheckpoint($jobId, ['poles' => ['1' => ['stub' => true]]], 100, 40, 0.01));
        self::assertGreaterThan(290, (int) self::scalar(self::$pdo, 'SELECT TIMESTAMPDIFF(SECOND, NOW(), lease_until) FROM mass_jobs WHERE id = ?', [$jobId]), 'bail renouvelé');

        $queue->release($jobId);
        $released = self::job($jobId);
        self::assertSame(['queued', null], [$released['status'], $released['lease_until']]);
        self::assertEquals(['poles' => ['1' => ['stub' => true]]], json_decode((string) $released['checkpoint'], true), 'checkpoint conservé');

        $queue->reserve(1);
        $document = self::dayDocument('2026-01-05');
        self::assertTrue($queue->complete($jobId, $document, 10, 5, 0.002, 'kairos dégradé à null (2026-01-05) — test'));
        $done = self::job($jobId);
        self::assertSame(['done', 110, 45], [$done['status'], (int) $done['tokens_input'], (int) $done['tokens_output']]);
        self::assertEqualsWithDelta(0.012, (float) $done['cost_usd'], 1e-9);
        self::assertEquals($document, json_decode((string) $done['document'], true));
        self::assertSame('kairos dégradé à null (2026-01-05) — test', $done['erreur']);
        self::assertNotNull($done['finished_at']);
        self::assertSame('done', self::scalar(self::$pdo, 'SELECT status FROM mass_runs WHERE id = ?', [$run['runId']]));

        self::assertFalse($queue->complete($jobId, $document), 'rejeu : refus');
        self::assertFalse($queue->saveCheckpoint($jobId, ['poles' => []], 0, 0, 0.0));
    }

    #[TestDox('UC-SYS-01-U04 — fail : tentatives + 1 et retour en file, échec définitif à la 3e ; failHard immédiat')]
    public function testU04FailCountsAttemptsAndFailHardIsTerminal(): void
    {
        $run = self::seedRun([['2026-01-05', '2026-01-06']]);
        [$soft, $hard] = self::jobIds($run['runId']);
        $queue = new JobQueue(self::$pdo);

        foreach ([1 => 'queued', 2 => 'queued', 3 => 'failed'] as $attempt => $expected) {
            self::$pdo->exec("UPDATE mass_jobs SET status = 'running' WHERE id = {$soft}");
            $queue->fail($soft, "panne {$attempt}");
            $row = self::job($soft);
            self::assertSame([$expected, $attempt, "panne {$attempt}"], [$row['status'], (int) $row['attempts'], $row['erreur']]);
        }
        self::assertNotNull(self::job($soft)['finished_at']);
        $queue->fail($soft, 'hors running');
        self::assertSame(3, (int) self::job($soft)['attempts'], 'aucun effet hors running');

        self::$pdo->exec("UPDATE mass_jobs SET status = 'running' WHERE id = {$hard}");
        $queue->failHard($hard, 'portfolio retiré (consentement révoqué)');
        self::assertSame(['failed', 0], [self::job($hard)['status'], (int) self::job($hard)['attempts']]);
        self::assertSame('failed', self::scalar(self::$pdo, 'SELECT status FROM mass_runs WHERE id = ?', [$run['runId']]));
    }

    #[TestDox('UC-SYS-01-U05 — markBudgetExceeded : job courant + jobs en file de l’établissement, runs actifs marqués, autres intacts')]
    public function testU05MarkBudgetExceeded(): void
    {
        $a = self::seedRun([['2026-01-05', '2026-01-06', '2026-01-07']]);
        $b = self::seedRun([['2026-01-05']]);
        [$current, $otherRunning, $queued] = self::jobIds($a['runId']);
        self::$pdo->exec("UPDATE mass_jobs SET status = 'running' WHERE id IN ({$current}, {$otherRunning})");

        (new JobQueue(self::$pdo))->markBudgetExceeded($a['etab'], $current);

        self::assertSame('budget_exceeded', self::job($current)['status']);
        self::assertSame('running', self::job($otherRunning)['status'], 'un autre job en cours (runner) n’est pas touché');
        self::assertSame('budget_exceeded', self::job($queued)['status']);
        self::assertSame('budget_exceeded', self::scalar(self::$pdo, 'SELECT status FROM mass_runs WHERE id = ?', [$a['runId']]));
        self::assertSame('queued', self::scalar(self::$pdo, 'SELECT status FROM mass_jobs WHERE run_id = ?', [$b['runId']]));
        self::assertSame('active', self::scalar(self::$pdo, 'SELECT status FROM mass_runs WHERE id = ?', [$b['runId']]));
    }

    // ---------------------------------------------------------------- Tick

    #[TestDox('UC-SYS-01-U06 — Tick : verrou GET_LOCK déjà tenu → locked, aucun job touché')]
    public function testU06TickSkipsWhenLockIsHeld(): void
    {
        $run = self::seedRun([['2026-01-05']]);
        $other = TestDb::pdo();
        self::assertSame(1, (int) $other->query("SELECT GET_LOCK('" . Tick::LOCK_NAME . "', 0)")->fetchColumn());
        try {
            $provider = self::flakyProvider();
            $counters = self::tick($provider);
        } finally {
            $other->query("SELECT RELEASE_LOCK('" . Tick::LOCK_NAME . "')")->fetchColumn();
        }

        self::assertTrue($counters['locked']);
        self::assertSame(0, $counters['jobsTouched']);
        self::assertSame(0, $provider->calls);
        self::assertSame('queued', self::scalar(self::$pdo, 'SELECT status FROM mass_jobs WHERE run_id = ?', [$run['runId']]));
    }

    #[TestDox('UC-SYS-01-U07 — Tick : budget d’appels épuisé → job reposé avec checkpoint, reprise sans rappeler un pôle')]
    public function testU07TickReleasesThenResumesFromCheckpoint(): void
    {
        $run = self::seedRun([['2026-01-05']]);
        [$jobId] = self::jobIds($run['runId']);
        $provider = self::flakyProvider();

        $first = self::tick($provider, ['maxCalls' => 3]);
        self::assertSame(['jobsTouched' => 1, 'jobsCompleted' => 0, 'jobsReleased' => 1, 'calls' => 3],
            array_intersect_key($first, array_flip(['jobsTouched', 'jobsReleased', 'calls', 'jobsCompleted'])));
        $job = self::job($jobId);
        self::assertSame('queued', $job['status']);
        self::assertSame(['1', '2', '3'], array_map('strval', array_keys(json_decode((string) $job['checkpoint'], true)['poles'])));

        $second = self::tick($provider, ['maxCalls' => 8]);
        self::assertSame(5, $second['calls'], '4 pôles restants + kairos, aucun pôle rappelé');
        self::assertSame(1, $second['jobsCompleted']);
        self::assertSame(8, $provider->calls);
        $document = json_decode((string) self::job($jobId)['document'], true);
        self::assertTrue(Validation::validate('cartographie-jour', $document)['valid']);
        self::assertGreaterThan(0.0, (float) self::scalar(self::$pdo, 'SELECT spent_usd FROM etablissement_config WHERE user_id = ?', [$run['etab']]));
    }

    #[TestDox('UC-SYS-01-U08 — Tick : kairos en échec après reprise → document gardé avec kairos null et note de dégradation')]
    public function testU08KairosFailureDegradesToNull(): void
    {
        $run = self::seedRun([['2026-01-06']]);
        [$jobId] = self::jobIds($run['runId']);
        $provider = self::flakyProvider(garbageKairos: true);

        $counters = self::tick($provider);

        self::assertSame(9, $provider->calls, '7 pôles + kairos + 1 nouvel essai');
        self::assertSame(1, $counters['jobsCompleted']);
        self::assertSame(1, $counters['callErrors']);
        $job = self::job($jobId);
        self::assertSame('done', $job['status']);
        self::assertNull(json_decode((string) $job['document'], true)['kairos']);
        self::assertStringStartsWith('kairos dégradé à null (2026-01-06) — ', (string) $job['erreur']);
    }

    #[TestDox('UC-SYS-01-U09 — Tick : source introuvable (segment, portfolio, paquet) → échec définitif sans appel LLM')]
    public function testU09MissingSourcesFailHardWithoutCalls(): void
    {
        $run = self::seedRun([['2026-01-05'], ['2026-01-06']]);
        [$segment, $portfolio] = self::jobIds($run['runId']);
        // Journée retirée du dépôt (re-dépôt avec d'autres dates).
        self::$pdo->prepare('UPDATE cohorte_portfolios SET segments = ? WHERE user_id = ?')
            ->execute([json_encode([['date' => '2026-03-01', 'texte' => 'autre']]), $run['learners'][0]]);
        // Dépôt détaché (portfolio supprimé : FK SET NULL).
        self::$pdo->exec("UPDATE mass_jobs SET portfolio_id = NULL WHERE id = {$portfolio}");

        $provider = self::flakyProvider();
        $counters = self::tick($provider);

        self::assertSame(0, $provider->calls);
        self::assertSame(2, $counters['jobsFailed']);
        self::assertSame(['failed', 'segment du 2026-01-05 introuvable dans le portfolio déposé'], [self::job($segment)['status'], self::job($segment)['erreur']]);
        self::assertSame(['failed', 'portfolio retiré (consentement révoqué)'], [self::job($portfolio)['status'], self::job($portfolio)['erreur']]);

        // Version de paquet figée devenue introuvable (retirée de la base).
        $unpublished = self::seedRun([['2026-01-05']]);
        self::$pdo->exec("UPDATE mass_runs SET prompt_package_semver = '9.9.9' WHERE id = {$unpublished['runId']}");
        self::tick($provider);
        self::assertSame(0, $provider->calls);
        self::assertSame(
            'paquet aurora-v3-reconstruit@9.9.9 ou référentiel respire@7.0.0 indisponible/incomplet',
            self::scalar(self::$pdo, 'SELECT erreur FROM mass_jobs WHERE run_id = ?', [$unpublished['runId']]),
        );
    }

    #[TestDox('UC-SYS-01-U10 — Tick : coupe-circuit AVANT l’appel — plafond insuffisant → budget_exceeded, zéro appel')]
    public function testU10BudgetCircuitBreakerBeforeTheCall(): void
    {
        $run = self::seedRun([['2026-01-05', '2026-01-06']], cap: 0.01);
        $provider = self::flakyProvider();

        $counters = self::tick($provider);

        self::assertSame(0, $provider->calls);
        self::assertSame(1, $counters['budgetBlocked']);
        self::assertSame(['budget_exceeded'], array_values(array_unique(self::$pdo
            ->query("SELECT status FROM mass_jobs WHERE run_id = {$run['runId']}")->fetchAll(PDO::FETCH_COLUMN))));
        self::assertSame('budget_exceeded', self::scalar(self::$pdo, 'SELECT status FROM mass_runs WHERE id = ?', [$run['runId']]));
    }

    #[TestDox('UC-SYS-01-U11 — Tick : un pôle en échec après nouvel essai compte une tentative ; son coût n’est PAS imputé (comportement actuel)')]
    public function testU11FailedCallCostIsNotBilled(): void
    {
        $run = self::seedRun([['2026-01-05']]);
        [$jobId] = self::jobIds($run['runId']);
        $provider = self::flakyProvider(garbageFirst: 2);

        $counters = self::tick($provider, ['maxCalls' => 2]);

        self::assertSame(2, $provider->calls, 'deux appels réellement consommés (1 000 + 500 tokens chacun)');
        self::assertSame(1, $counters['callErrors']);
        $job = self::job($jobId);
        self::assertSame(['queued', 1], [$job['status'], (int) $job['attempts']]);
        self::assertStringStartsWith('pôle 1 (2026-01-05) — aucun JSON valide trouvé', (string) $job['erreur']);
        // Voir « Anomalies constatées » : ni le job ni la dépense ne portent ces appels.
        self::assertSame(0.0, (float) $job['cost_usd']);
        self::assertSame(0.0, (float) self::scalar(self::$pdo, 'SELECT spent_usd FROM etablissement_config WHERE user_id = ?', [$run['etab']]));
    }

    // ------------------------------------------------ PromptRunner, PoleAssembler

    #[TestDox('UC-SYS-01-U12 — PromptRunner : substitution exacte (bloc référentiel trié, date FR, texte du jour nettoyé) et erreurs de gabarit')]
    public function testU12PromptRunnerSubstitution(): void
    {
        $package = ['prompts' => [
            ['role' => 'extraction-pole', 'texte' => "Pôle {{pole_num}} — {{pole_nom}} ({{nb_competences_pole}}) : {{codes_liste}} / {{premier_code}}\n{{referentiel_pole_bloc}}\n{{date_fr}} {{date_iso}} :: {{portfolio_texte}}",
                'variables' => array_map(static fn (string $n): array => ['nom' => $n], ['pole_num', 'pole_nom', 'nb_competences_pole', 'codes_liste', 'premier_code', 'referentiel_pole_bloc', 'date_fr', 'date_iso', 'portfolio_texte'])],
            ['role' => 'kairos', 'texte' => "{{nb_poles}}/{{nb_competences}} {{date_fr}}\n{{referentiel_bloc}}\n{{portfolio_texte}}",
                'variables' => array_map(static fn (string $n): array => ['nom' => $n], ['nb_poles', 'nb_competences', 'date_fr', 'referentiel_bloc', 'portfolio_texte'])],
        ]];
        $referentiel = [
            'poles' => [['num' => 2, 'nom' => 'Deux'], ['num' => 1, 'nom' => 'Un']],
            'competences' => [['code' => '1.02', 'nom' => 'B', 'pole' => 1], ['code' => '2.01', 'nom' => 'C', 'pole' => 2], ['code' => '1.01', 'nom' => 'A', 'pole' => 1]],
        ];
        $runner = new PromptRunner($package, $referentiel);

        self::assertTrue($runner->hasExtractionTemplates());
        self::assertSame([1, 2], $runner->poleNums());
        self::assertSame(
            "Pôle 1 — Un (2) : 1.01, 1.02 / 1.01\nPôle 1 — Un\n  1.01 — A\n  1.02 — B\n05/01/2026 2026-01-05 :: texte du jour",
            $runner->polePrompt(1, "  texte du jour \n", '2026-01-05'),
        );
        self::assertSame(
            "2/3 05/01/2026\nPôle 1 — Un\n  1.01 — A\n  1.02 — B\nPôle 2 — Deux\n  2.01 — C\ntexte",
            $runner->kairosPrompt(' texte ', '2026-01-05'),
        );
        self::assertSame('31/12/2026', PromptRunner::formatDateFr('2026-12-31'));

        $package['prompts'][1]['texte'] .= ' {{inconnue}}';
        try {
            (new PromptRunner($package, $referentiel))->kairosPrompt('x', '2026-01-05');
            self::fail('placeholder non déclaré');
        } catch (\RuntimeException $e) {
            self::assertStringContainsString('undeclared placeholder "{{inconnue}}"', $e->getMessage());
        }
        $package['prompts'][1]['variables'][] = ['nom' => 'inconnue'];
        try {
            (new PromptRunner($package, $referentiel))->kairosPrompt('x', '2026-01-05');
            self::fail('variable déclarée sans valeur');
        } catch (\RuntimeException $e) {
            self::assertStringContainsString('no value for declared variable "inconnue"', $e->getMessage());
        }
        $this->expectException(\InvalidArgumentException::class);
        new PromptRunner($package, ['poles' => []]);
    }

    #[TestDox('UC-SYS-01-U13 — PoleAssembler : poleNum incohérent refusé, champs manquants réparés, kairos invalide refusé')]
    public function testU13PoleAssemblerRepairsAndRejects(): void
    {
        $fixture = self::dayDocument('2026-01-06');
        $pole = $fixture['poles'][2];
        unset($pole['poleNum'], $pole['rapport']);
        $pole['passagesSaillants'] = 'pas une liste';

        $assembled = PoleAssembler::assemblePole($pole, 3, '2026-01-06');
        self::assertSame('3', $assembled['poleNum']);
        self::assertSame([], $assembled['passagesSaillants']);
        self::assertNull($assembled['rapport']);

        try {
            PoleAssembler::assemblePole(['poleNum' => '4'] + $pole, 3, '2026-01-06');
            self::fail('poleNum incohérent');
        } catch (\RuntimeException $e) {
            self::assertStringContainsString('poleNum incohérent', $e->getMessage());
        }

        $polesByNum = [];
        foreach ($fixture['poles'] as $p) {
            $polesByNum[(int) $p['poleNum']] = $p;
        }
        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessage('kairos invalide au schéma');
        PoleAssembler::validateKairos(['intrus' => true], $polesByNum, '2026-01-06');
    }

    // ------------------------------------------------ OpenAiCompatibleProvider

    #[TestDox('UC-SYS-01-U14 — OpenAiCompatibleProvider : /v1/chat/completions, clé en en-tête seulement, usage et troncature mappés')]
    public function testU14OpenAiCompatibleProviderRequestAndMapping(): void
    {
        $http = new LlmFakeHttpClient();
        $http->queueResponse(['status' => 200, 'body' => json_encode([
            'model' => 'llama3:70b',
            'choices' => [['message' => ['content' => '{"poleNum": "1"}'], 'finish_reason' => 'length']],
            'usage' => ['prompt_tokens' => 1200, 'completion_tokens' => 300],
        ])]);
        $http->queueResponse(['status' => 200, 'body' => json_encode(['choices' => [['message' => ['content' => 'ok'], 'finish_reason' => 'stop']]])]);

        $withKey = new OpenAiCompatibleProvider($http, 'http://10.0.0.12:11434/', 'sk-local', 12);
        $result = $withKey->complete('llama3:70b', 'Tu es un greffier.', 'Prompt du pôle', 4096);

        self::assertSame(['text' => '{"poleNum": "1"}', 'usage' => ['inputTokens' => 1200, 'outputTokens' => 300], 'model' => 'llama3:70b', 'stopReason' => 'max_tokens'], $result);
        $request = $http->requests[0];
        self::assertSame(['POST', 'http://10.0.0.12:11434/v1/chat/completions', 12], [$request['method'], $request['url'], $request['timeout']]);
        self::assertSame(['content-type' => 'application/json', 'authorization' => 'Bearer sk-local'], $request['headers']);
        self::assertSame([
            'model' => 'llama3:70b',
            'max_tokens' => 4096,
            'temperature' => 0,
            'messages' => [['role' => 'system', 'content' => 'Tu es un greffier.'], ['role' => 'user', 'content' => 'Prompt du pôle']],
        ], json_decode((string) $request['body'], true));
        self::assertStringNotContainsString('sk-local', $request['url'] . $request['body']);

        $withoutKey = new OpenAiCompatibleProvider($http, 'http://10.0.0.12:11434');
        $plain = $withoutKey->complete('llama3', null, 'P', 10);
        self::assertSame(['text' => 'ok', 'usage' => ['inputTokens' => 0, 'outputTokens' => 0], 'model' => 'llama3', 'stopReason' => 'stop'], $plain);
        self::assertArrayNotHasKey('authorization', $http->requests[1]['headers']);
        self::assertCount(1, json_decode((string) $http->requests[1]['body'], true)['messages'], 'pas de message système vide');
    }

    #[TestDox('UC-SYS-01-U15 — OpenAiCompatibleProvider : statut amont non 2xx ou corps non JSON → UpstreamException')]
    public function testU15OpenAiCompatibleProviderErrors(): void
    {
        $http = new LlmFakeHttpClient();
        $http->queueResponse(['status' => 503, 'body' => json_encode(['error' => ['message' => 'GPU saturé']])]);
        $http->queueResponse(['status' => 500, 'body' => '<html>panne</html>']);
        $http->queueResponse(['status' => 200, 'body' => 'pas du JSON']);
        $provider = new OpenAiCompatibleProvider($http, 'http://10.0.0.12:11434', 'sk-local');

        foreach ([[503, 'GPU saturé'], [500, 'erreur du fournisseur amont'], [502, 'réponse amont non-JSON']] as [$status, $message]) {
            try {
                $provider->complete('llama3', null, 'P', 10);
                self::fail("statut {$status} attendu");
            } catch (UpstreamException $e) {
                self::assertSame([$status, $message], [$e->status, $e->getMessage()]);
                self::assertStringNotContainsString('sk-local', $e->getMessage());
            }
        }
    }
}
