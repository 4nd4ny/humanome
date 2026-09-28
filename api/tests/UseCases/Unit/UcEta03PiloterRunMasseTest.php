<?php

declare(strict_types=1);

namespace Humanome\Tests\UseCases\Unit;

use Humanome\Etablissement\CohorteRepository;
use Humanome\MigrationRunner;
use Humanome\Packages\PromptPackageRepository;
use Humanome\Referentiel\ReferentielRepository;
use Humanome\Tests\TestDb;
use Humanome\Tests\UseCases\Support\EtaSupport;
use Humanome\Worker\JobQueue;
use PDO;
use PHPUnit\Framework\Attributes\TestDox;
use PHPUnit\Framework\TestCase;

/**
 * UC-ETA-03 — Lancer, suivre et annuler un run de masse : tests UNITAIRES.
 *
 * Fiche : docs/cas-utilisation/etablissement/UC-ETA-03-piloter-run-masse.md
 *
 * Les classes sollicitées par POST /api/etablissement/cohortes/{id}/runs,
 * GET /api/etablissement/runs/{runId} et POST …/annuler sont appelées
 * directement : sélection des dépôts (CohorteRepository::depositsForRun),
 * enfilage à versions figées (JobQueue::enqueueRun), tableau d'avancement
 * (runStats), annulation et bilan terminal du run, versions publiées
 * résolues par les dépôts de référentiel et de paquets.
 */
final class UcEta03PiloterRunMasseTest extends TestCase
{
    use EtaSupport;

    private static PDO $pdo;

    public static function setUpBeforeClass(): void
    {
        self::$pdo = TestDb::fresh();
        (new MigrationRunner(self::$pdo, MigrationRunner::defaultMigrationsDir()))->run();
    }

    protected function setUp(): void
    {
        self::$pdo->exec('DELETE FROM users');
    }

    /** Établissement + cohorte ; renvoie [etabId, cohorteId]. */
    private static function seedCohorte(): array
    {
        $etab = self::seedUser(self::$pdo, 'Lycée Astrolabe', ['etablissement']);

        return [$etab, (new CohorteRepository(self::$pdo))->create($etab, 'Terminale B')['id']];
    }

    /** Run + jobs aux statuts donnés (date => [status, cost, tin, tout, erreur]). */
    private static function seedRun(int $etab, int $cohorteId, int $userId, array $jobs): int
    {
        $runId = (new JobQueue(self::$pdo))->enqueueRun($etab, $cohorteId, 'p', '1.0.0', 'respire', '7.0.0', [])['runId'];
        $insert = self::$pdo->prepare(
            'INSERT INTO mass_jobs (run_id, user_id, day_date, status, cost_usd, tokens_input, tokens_output, erreur, attempts)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
        );
        foreach ($jobs as $date => [$status, $cost, $tin, $tout, $erreur]) {
            $insert->execute([$runId, $userId, $date, $status, $cost, $tin, $tout, $erreur, $erreur === null ? 0 : 3]);
        }

        return $runId;
    }

    #[TestDox('UC-ETA-03-U01 — depositsForRun : membres consentis AYANT déposé ; sélection optionnelle ; [] vaut « tous »')]
    public function testU01DepositsForRunSelectsConsentedDepositors(): void
    {
        [, $cohorteId] = self::seedCohorte();
        $repo = new CohorteRepository(self::$pdo);
        $maya = self::seedUser(self::$pdo, 'Maya');
        $noe = self::seedUser(self::$pdo, 'Noé');
        $lila = self::seedUser(self::$pdo, 'Lila');
        $depotMaya = self::seedDepositor(self::$pdo, $cohorteId, $maya, ['2026-01-05', '2026-01-06']);
        $depotLila = self::seedDepositor(self::$pdo, $cohorteId, $lila, ['2026-01-07']);
        $repo->join($cohorteId, $noe); // consenti sans dépôt
        // Adhésion retirée hors API : le dépôt orphelin n'est plus éligible.
        self::$pdo->exec("DELETE FROM cohorte_membres WHERE user_id = {$lila}");

        $all = $repo->depositsForRun($cohorteId, null);
        self::assertSame([['id' => $depotMaya, 'userId' => $maya, 'dates' => ['2026-01-05', '2026-01-06']]], $all);
        self::assertSame($all, $repo->depositsForRun($cohorteId, []), 'liste vide = tous les déposants (comportement actuel)');
        self::assertSame($all, $repo->depositsForRun($cohorteId, [$maya, 999999]));
        self::assertSame([], $repo->depositsForRun($cohorteId, [$noe]));
        self::assertSame([], $repo->depositsForRun($cohorteId, [$lila]));
        self::assertNotSame(0, $depotLila);
    }

    #[TestDox('UC-ETA-03-U02 — enqueueRun : run à versions figées, un job queued par (membre × journée), doublons ignorés')]
    public function testU02EnqueueRunFreezesVersionsAndCreatesOneJobPerDay(): void
    {
        [$etab, $cohorteId] = self::seedCohorte();
        $maya = self::seedUser(self::$pdo, 'Maya');
        $noe = self::seedUser(self::$pdo, 'Noé');
        $depotMaya = self::seedDepositor(self::$pdo, $cohorteId, $maya, ['2026-01-05', '2026-01-06']);
        $depotNoe = self::seedDepositor(self::$pdo, $cohorteId, $noe, ['2026-01-07']);

        $result = (new JobQueue(self::$pdo))->enqueueRun($etab, $cohorteId, 'aurora-v3-reconstruit', '1.0.0', 'respire', '7.0.0', [
            ['id' => $depotMaya, 'userId' => $maya, 'dates' => ['2026-01-05', '2026-01-06', '2026-01-05']],
            ['id' => $depotNoe, 'userId' => $noe, 'dates' => ['2026-01-07']],
        ]);

        self::assertSame(['runId', 'jobs'], array_keys($result));
        self::assertSame(3, $result['jobs'], 'la date en double est ignorée (clé unique run × membre × jour)');
        $run = self::$pdo->query('SELECT * FROM mass_runs WHERE id = ' . $result['runId'])->fetch();
        self::assertSame(
            [$etab, $cohorteId, 'aurora-v3-reconstruit', '1.0.0', 'respire', '7.0.0', 'active'],
            [(int) $run['etablissement_id'], (int) $run['cohorte_id'], $run['prompt_package_slug'],
                $run['prompt_package_semver'], $run['referentiel_id'], $run['referentiel_semver'], $run['status']],
        );
        self::assertNull($run['finished_at']);
        $jobs = self::$pdo->query('SELECT user_id, portfolio_id, day_date, status, attempts, priority, checkpoint FROM mass_jobs ORDER BY id')->fetchAll();
        self::assertSame([[$maya, $depotMaya, '2026-01-05'], [$maya, $depotMaya, '2026-01-06'], [$noe, $depotNoe, '2026-01-07']],
            array_map(static fn (array $j): array => [(int) $j['user_id'], (int) $j['portfolio_id'], $j['day_date']], $jobs));
        foreach ($jobs as $job) {
            self::assertSame(['queued', 0, 0, null], [$job['status'], (int) $job['attempts'], (int) $job['priority'], $job['checkpoint']]);
        }
    }

    #[TestDox('UC-ETA-03-U03 — runForEtablissement : le run d’un autre établissement répond null comme un inexistant')]
    public function testU03RunForEtablissementIsOwnerOnly(): void
    {
        [$etab, $cohorteId] = self::seedCohorte();
        $autre = self::seedUser(self::$pdo, 'Collège Voisin', ['etablissement']);
        $runId = (new JobQueue(self::$pdo))->enqueueRun($etab, $cohorteId, 'p', '1.0.0', 'respire', '7.0.0', [])['runId'];
        $queue = new JobQueue(self::$pdo);

        self::assertSame($runId, (int) $queue->runForEtablissement($runId, $etab)['id']);
        self::assertNull($queue->runForEtablissement($runId, $autre));
        self::assertNull($queue->runForEtablissement(999999, $etab));
    }

    #[TestDox('UC-ETA-03-U04 — runStats : 6 statuts toujours présents, coût et tokens cumulés, erreurs sans contenu (50 max)')]
    public function testU04RunStatsBoard(): void
    {
        [$etab, $cohorteId] = self::seedCohorte();
        $maya = self::seedUser(self::$pdo, 'Maya');
        $queue = new JobQueue(self::$pdo);

        $empty = $queue->runStats(self::seedRun($etab, $cohorteId, $maya, []));
        self::assertSame(['queued' => 0, 'running' => 0, 'done' => 0, 'failed' => 0, 'budget_exceeded' => 0, 'cancelled' => 0], $empty['jobs']);
        self::assertSame(0.0, $empty['coutUsd']);
        self::assertSame(['input' => 0, 'output' => 0], $empty['tokens']);
        self::assertSame([], $empty['erreurs']);

        $runId = self::seedRun($etab, $cohorteId, $maya, [
            '2026-01-05' => ['done', 0.1234564, 1000, 200, null],
            '2026-01-06' => ['done', 0.2, 1500, 300, 'kairos dégradé à null (2026-01-06) — réponse tronquée'],
            '2026-01-07' => ['failed', 0.0, 0, 0, 'pôle 3 (2026-01-07) — panne simulée'],
            '2026-01-08' => ['queued', 0.0, 0, 0, null],
        ]);
        $stats = $queue->runStats($runId);

        self::assertSame(['queued' => 1, 'running' => 0, 'done' => 2, 'failed' => 1, 'budget_exceeded' => 0, 'cancelled' => 0], $stats['jobs']);
        self::assertSame(0.323456, $stats['coutUsd'], 'arrondi à 6 décimales');
        self::assertSame(['input' => 2500, 'output' => 500], $stats['tokens']);
        self::assertSame(['2026-01-06', '2026-01-07'], array_column($stats['erreurs'], 'date'));
        self::assertSame(['jobId', 'userId', 'date', 'status', 'attempts', 'erreur'], array_keys($stats['erreurs'][1]));
        self::assertSame(['failed', 3, $maya], [$stats['erreurs'][1]['status'], $stats['erreurs'][1]['attempts'], $stats['erreurs'][1]['userId']]);

        $bulk = self::seedRun($etab, $cohorteId, $maya, []);
        $insert = self::$pdo->prepare('INSERT INTO mass_jobs (run_id, user_id, day_date, status, erreur) VALUES (?, ?, ?, "failed", "x")');
        for ($d = 0; $d < 55; $d++) {
            $insert->execute([$bulk, $maya, date('Y-m-d', strtotime('2027-01-01 +' . $d . ' days'))]);
        }
        self::assertCount(50, $queue->runStats($bulk)['erreurs']);
        self::assertSame(55, $queue->runStats($bulk)['jobs']['failed']);
    }

    #[TestDox('UC-ETA-03-U05 — cancelRun : jobs non terminaux → cancelled, terminés intacts ; le run passe cancelled (même s’il était fini)')]
    public function testU05CancelRun(): void
    {
        [$etab, $cohorteId] = self::seedCohorte();
        $maya = self::seedUser(self::$pdo, 'Maya');
        $queue = new JobQueue(self::$pdo);
        $runId = self::seedRun($etab, $cohorteId, $maya, [
            '2026-01-01' => ['queued', 0, 0, 0, null],
            '2026-01-02' => ['running', 0, 0, 0, null],
            '2026-01-03' => ['budget_exceeded', 0, 0, 0, null],
            '2026-01-04' => ['done', 0.1, 1, 1, null],
            '2026-01-05' => ['failed', 0, 0, 0, 'x'],
        ]);

        $queue->cancelRun($runId);

        $statuses = self::$pdo->query("SELECT day_date, status FROM mass_jobs WHERE run_id = {$runId} ORDER BY day_date")->fetchAll(PDO::FETCH_KEY_PAIR);
        self::assertSame(['2026-01-01' => 'cancelled', '2026-01-02' => 'cancelled', '2026-01-03' => 'cancelled',
            '2026-01-04' => 'done', '2026-01-05' => 'failed'], $statuses);
        self::assertSame(3, (int) self::scalar(self::$pdo, 'SELECT COUNT(*) FROM mass_jobs WHERE run_id = ? AND finished_at IS NOT NULL AND status = "cancelled"', [$runId]));
        self::assertSame('cancelled', self::scalar(self::$pdo, 'SELECT status FROM mass_runs WHERE id = ?', [$runId]));

        // Comportement ACTUEL (fiche, « Anomalies constatées ») : un run déjà
        // terminé « done » bascule lui aussi en « cancelled ».
        $doneRun = self::seedRun($etab, $cohorteId, $maya, ['2026-02-01' => ['done', 0, 0, 0, null]]);
        self::$pdo->exec("UPDATE mass_runs SET status = 'done', finished_at = '2026-02-01 10:00:00' WHERE id = {$doneRun}");
        $queue->cancelRun($doneRun);
        self::assertSame('cancelled', self::scalar(self::$pdo, 'SELECT status FROM mass_runs WHERE id = ?', [$doneRun]));
        self::assertNotSame('2026-02-01 10:00:00', self::scalar(self::$pdo, 'SELECT finished_at FROM mass_runs WHERE id = ?', [$doneRun]));
    }

    #[TestDox('UC-ETA-03-U06 — refreshRunStatus : actif tant qu’il reste du travail, puis done, ou failed si un job a échoué')]
    public function testU06RefreshRunStatus(): void
    {
        [$etab, $cohorteId] = self::seedCohorte();
        $maya = self::seedUser(self::$pdo, 'Maya');
        $queue = new JobQueue(self::$pdo);
        $status = static fn (int $runId): array => self::$pdo->query("SELECT status, finished_at FROM mass_runs WHERE id = {$runId}")->fetch();

        $pending = self::seedRun($etab, $cohorteId, $maya, ['2026-01-05' => ['done', 0, 0, 0, null], '2026-01-06' => ['budget_exceeded', 0, 0, 0, null]]);
        $queue->refreshRunStatus($pending);
        self::assertSame(['status' => 'active', 'finished_at' => null], $status($pending));

        $done = self::seedRun($etab, $cohorteId, $maya, ['2026-01-05' => ['done', 0, 0, 0, null], '2026-01-06' => ['cancelled', 0, 0, 0, null]]);
        $queue->refreshRunStatus($done);
        self::assertSame('done', $status($done)['status']);
        self::assertNotNull($status($done)['finished_at']);

        $failed = self::seedRun($etab, $cohorteId, $maya, ['2026-01-05' => ['done', 0, 0, 0, null], '2026-01-06' => ['failed', 0, 0, 0, 'x']]);
        $queue->refreshRunStatus($failed);
        self::assertSame('failed', $status($failed)['status']);

        $cancelled = self::seedRun($etab, $cohorteId, $maya, ['2026-01-05' => ['done', 0, 0, 0, null]]);
        self::$pdo->exec("UPDATE mass_runs SET status = 'cancelled' WHERE id = {$cancelled}");
        $queue->refreshRunStatus($cancelled);
        self::assertSame('cancelled', $status($cancelled)['status'], 'l’annulation est définitive');
    }

    #[TestDox('UC-ETA-03-U07 — versions publiées : dernier référentiel respire, paquet publié avec gabarits extraction-pole + kairos')]
    public function testU07PublishedVersionsResolvedForTheRun(): void
    {
        self::seedPublishedVersions(self::$pdo);

        $referentiel = (new ReferentielRepository(self::$pdo))->latestPublished('respire');
        self::assertSame(['respire', '7.0.0'], [$referentiel['referentielId'], $referentiel['semver']]);
        self::assertNull((new ReferentielRepository(self::$pdo))->latestPublished('inconnu'));

        $packages = new PromptPackageRepository(self::$pdo);
        $package = $packages->findPublished('aurora-v3-reconstruit', '1.0.0');
        self::assertIsArray($package);
        $roles = array_column($package['prompts'], 'role');
        self::assertContains('extraction-pole', $roles);
        self::assertContains('kairos', $roles);
        self::assertNull($packages->findPublished('aurora-v3-reconstruit', '9.9.9'), 'version non publiée');
    }
}
