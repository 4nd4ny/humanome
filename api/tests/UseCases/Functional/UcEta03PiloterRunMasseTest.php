<?php

declare(strict_types=1);

namespace Humanome\Tests\UseCases\Functional;

use Humanome\Db;
use Humanome\Packages\PromptPackageRepository;
use Humanome\Referentiel\ReferentielRepository;
use Humanome\Tests\MasseTestCase;
use Humanome\Tests\UseCases\Support\EtaSupport;
use PHPUnit\Framework\Attributes\TestDox;

/**
 * UC-ETA-03 — Lancer, suivre et annuler un run de masse : tests FONCTIONNELS (API).
 *
 * Fiche : docs/cas-utilisation/etablissement/UC-ETA-03-piloter-run-masse.md
 *
 * L'établissement lance le run, suit le tableau d'avancement et annule par les
 * routes réelles ; la file progresse par ticks du worker simulés avec le
 * fournisseur mock injecté (MasseTestCase::tick — aucun appel réseau). Les
 * apprenants rejoignent et déposent par l'API (préconditions, UC-APP-08).
 */
final class UcEta03PiloterRunMasseTest extends MasseTestCase
{
    use EtaSupport;

    private function board(array $etab, int $runId): array
    {
        $response = $this->as_($etab, 'GET', '/api/etablissement/runs/' . $runId);
        self::assertSame(200, $response->getStatusCode(), (string) $response->getBody());

        return self::json($response);
    }

    private function launch(array $etab, int $cohorteId, array $body): \Psr\Http\Message\ResponseInterface
    {
        return $this->as_($etab, 'POST', "/api/etablissement/cohortes/{$cohorteId}/runs", $body + [
            'promptPackageId' => self::PACKAGE_ID,
            'promptPackageVersion' => self::PACKAGE_VERSION,
        ]);
    }

    #[TestDox('UC-ETA-03-F01 — nominal : lancement (versions figées, audit), suivi en direct jusqu’au run terminé')]
    public function testF01NominalLaunchFollowUntilDone(): void
    {
        $etab = $this->registerEtablissement();
        $this->configure($etab, 50.0);
        $cohorte = $this->createCohorte($etab);
        $this->enrolLearner($cohorte['code'], $cohorte['id'], 1, ['2026-01-05', '2026-01-06']);
        $this->enrolLearner($cohorte['code'], $cohorte['id'], 2, ['2026-01-07']);

        // 3-6. Lancement : 201 {runId, jobs}.
        $response = $this->launch($etab, $cohorte['id'], []);
        self::assertSame(201, $response->getStatusCode(), (string) $response->getBody());
        $run = self::json($response);
        self::assertSame(['runId', 'jobs'], array_keys($run));
        self::assertSame(3, $run['jobs']);
        self::assertEquals(['runId' => $run['runId'], 'cohorteId' => $cohorte['id'], 'jobs' => 3], self::lastAudit('mass_run_created')['details']);

        // 7. Tableau d'avancement juste après l'enfilage.
        $board = $this->board($etab, $run['runId']);
        self::assertSame(
            ['id', 'cohorteId', 'status', 'promptPackage', 'referentiel', 'createdAt', 'finishedAt', 'jobs', 'coutUsd', 'tokens', 'erreurs'],
            array_keys($board),
        );
        self::assertSame('active', $board['status']);
        self::assertSame(['id' => self::PACKAGE_ID, 'version' => self::PACKAGE_VERSION], $board['promptPackage']);
        self::assertSame(['id' => 'respire', 'version' => '7.0.0'], $board['referentiel']);
        self::assertSame(3, $board['jobs']['queued']);
        self::assertNull($board['finishedAt']);

        // 8. Le worker avance ; le tableau suit.
        $this->tick(['maxCalls' => 8]);
        $mid = $this->board($etab, $run['runId']);
        self::assertSame(1, $mid['jobs']['done']);
        self::assertSame(2, $mid['jobs']['queued']);
        self::assertGreaterThan(0.0, $mid['coutUsd']);

        $this->tickUntilDrained();
        $end = $this->board($etab, $run['runId']);
        self::assertSame('done', $end['status']);
        self::assertSame(['queued' => 0, 'running' => 0, 'done' => 3, 'failed' => 0, 'budget_exceeded' => 0, 'cancelled' => 0], $end['jobs']);
        self::assertMatchesRegularExpression('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/', (string) $end['finishedAt']);
        self::assertEqualsWithDelta(self::spentUsd($etab['id']), $end['coutUsd'], 1e-6);
        self::assertGreaterThan(0, $end['tokens']['input']);
        self::assertSame([], $end['erreurs']);
    }

    #[TestDox('UC-ETA-03-F02 — A1 : sélection de membres → seuls les déposants choisis sont enfilés')]
    public function testF02MemberSelection(): void
    {
        $etab = $this->registerEtablissement();
        $this->configure($etab, 50.0);
        $cohorte = $this->createCohorte($etab);
        $this->enrolLearner($cohorte['code'], $cohorte['id'], 1, ['2026-01-05']);
        $b = $this->enrolLearner($cohorte['code'], $cohorte['id'], 2, ['2026-01-05', '2026-01-06']);

        $response = $this->launch($etab, $cohorte['id'], ['membres' => [$b['id']]]);

        self::assertSame(201, $response->getStatusCode());
        self::assertSame(2, self::json($response)['jobs']);
        self::assertSame([$b['id']], array_map(intval(...), Db::get()->query('SELECT DISTINCT user_id FROM mass_jobs')->fetchAll(\PDO::FETCH_COLUMN)));
    }

    #[TestDox('UC-ETA-03-F03 — A2 : membre consenti sans dépôt ou parti avant le lancement → aucun job pour lui')]
    public function testF03NonDepositorsAndLeaversAreNotEnqueued(): void
    {
        $etab = $this->registerEtablissement();
        $this->configure($etab, 50.0);
        $cohorte = $this->createCohorte($etab);
        $this->enrolLearner($cohorte['code'], $cohorte['id'], 1, ['2026-01-05']);
        $partant = $this->enrolLearner($cohorte['code'], $cohorte['id'], 2, ['2026-01-05', '2026-01-06']);
        $sansDepot = $this->registerAs('sans-depot@example.org', 'Sans Dépôt');
        $this->as_($sansDepot, 'POST', "/api/cohortes/{$cohorte['code']}/rejoindre", ['consentement' => true]);
        self::assertSame(204, $this->as_($partant, 'DELETE', "/api/cohortes/{$cohorte['id']}/quitter")->getStatusCode());

        self::assertSame(1, self::json($this->launch($etab, $cohorte['id'], []))['jobs']);

        $refused = $this->launch($etab, $cohorte['id'], ['membres' => [$sansDepot['id'], $partant['id']]]);
        self::assertSame(422, $refused->getStatusCode());
        self::assertSame('Aucun membre consenti n\'a déposé de portfolio dans cette cohorte', self::json($refused)['error']);
    }

    #[TestDox('UC-ETA-03-F04 — A3 : plafond atteint en cours de run → tableau « budget_exceeded », reprise après hausse')]
    public function testF04BudgetStopVisibleOnTheBoard(): void
    {
        $etab = $this->registerEtablissement();
        $this->configure($etab, 50.0);
        $cohorte = $this->createCohorte($etab);
        $this->enrolLearner($cohorte['code'], $cohorte['id'], 1, ['2026-01-05', '2026-01-06']);
        $run = $this->launchRun($etab, $cohorte['id']);
        $this->tick(['maxCalls' => 8]);

        $this->configure($etab, 0.01);
        $this->tick();
        $blocked = $this->board($etab, $run['runId']);
        self::assertSame('budget_exceeded', $blocked['status']);
        self::assertSame(1, $blocked['jobs']['done'], 'le déjà-produit reste acquis');
        self::assertSame(1, $blocked['jobs']['budget_exceeded']);

        $this->configure($etab, 50.0);
        $this->tickUntilDrained();
        self::assertSame('done', $this->board($etab, $run['runId'])['status']);
    }

    #[TestDox('UC-ETA-03-F05 — A4 : annulation en cours → 200, jobs restants annulés, produit conservé, plus aucun appel, audit')]
    public function testF05CancelMidRun(): void
    {
        $etab = $this->registerEtablissement();
        $this->configure($etab, 50.0);
        $cohorte = $this->createCohorte($etab);
        $this->enrolLearner($cohorte['code'], $cohorte['id'], 1, ['2026-01-05', '2026-01-06', '2026-01-07']);
        $run = $this->launchRun($etab, $cohorte['id']);
        $this->tick(['maxCalls' => 10]); // 1 journée finie + 2 pôles de la suivante
        $calls = $this->provider->calls;

        $cancelled = $this->as_($etab, 'POST', '/api/etablissement/runs/' . $run['runId'] . '/annuler');

        self::assertSame(200, $cancelled->getStatusCode());
        self::assertSame(['id' => $run['runId'], 'status' => 'cancelled'], self::json($cancelled));
        self::assertEquals(['runId' => $run['runId']], self::lastAudit('mass_run_cancelled')['details']);
        $board = $this->board($etab, $run['runId']);
        self::assertSame('cancelled', $board['status']);
        self::assertSame(1, $board['jobs']['done']);
        self::assertSame(2, $board['jobs']['cancelled']);
        self::assertNotNull($board['finishedAt']);

        $this->tickUntilDrained();
        self::assertSame($calls, $this->provider->calls, 'plus aucun appel LLM');
        self::assertSame('cancelled', $this->board($etab, $run['runId'])['status']);
    }

    #[TestDox('UC-ETA-03-F06 — A5 : échecs répétés → run « failed », erreurs par job (tentatives, message sans contenu)')]
    public function testF06FailuresAreReportedOnTheBoard(): void
    {
        $etab = $this->registerEtablissement();
        $this->configure($etab, 50.0);
        $cohorte = $this->createCohorte($etab);
        $learner = $this->enrolLearner($cohorte['code'], $cohorte['id'], 1, ['2026-01-05']);
        $run = $this->launchRun($etab, $cohorte['id']);
        $this->provider->failNextCalls = PHP_INT_MAX;

        $this->tickUntilDrained();

        $board = $this->board($etab, $run['runId']);
        self::assertSame('failed', $board['status']);
        self::assertSame(1, $board['jobs']['failed']);
        self::assertCount(1, $board['erreurs']);
        $erreur = $board['erreurs'][0];
        self::assertSame([$learner['id'], '2026-01-05', 'failed', 3], [$erreur['userId'], $erreur['date'], $erreur['status'], $erreur['attempts']]);
        self::assertStringContainsString('pôle 1 (2026-01-05)', $erreur['erreur']);
        self::assertStringContainsString('panne simulée', $erreur['erreur']);
        self::assertStringNotContainsString("aujourd'hui", $erreur['erreur']);
    }

    #[TestDox('UC-ETA-03-F07 — A6 : run lancé sans configuration → jobs en attente, aucun exécutant ; traités dès la configuration')]
    public function testF07RunWithoutConfigurationWaits(): void
    {
        $etab = $this->registerEtablissement();
        $cohorte = $this->createCohorte($etab);
        $this->enrolLearner($cohorte['code'], $cohorte['id'], 1, ['2026-01-05']);
        $run = $this->launchRun($etab, $cohorte['id']);

        self::assertSame(0, $this->tick()['jobsTouched'], 'le cron ne réserve que les jobs d’un établissement configuré');
        self::assertSame(1, $this->board($etab, $run['runId'])['jobs']['queued']);

        $this->configure($etab, 50.0);
        $this->tickUntilDrained();
        self::assertSame('done', $this->board($etab, $run['runId'])['status']);
    }

    #[TestDox('UC-ETA-03-F08 — E1 : paquet non précisé ou membres mal formés → 422 {fields}')]
    public function testF08ValidationErrors(): void
    {
        $etab = $this->registerEtablissement();
        $cohorte = $this->createCohorte($etab);
        $this->enrolLearner($cohorte['code'], $cohorte['id'], 1, ['2026-01-05']);
        $path = "/api/etablissement/cohortes/{$cohorte['id']}/runs";

        foreach ([
            'promptPackageId' => [[], ['promptPackageId' => self::PACKAGE_ID], ['promptPackageId' => ' ', 'promptPackageVersion' => '1.0.0']],
            'membres' => [
                ['promptPackageId' => self::PACKAGE_ID, 'promptPackageVersion' => self::PACKAGE_VERSION, 'membres' => '1'],
                ['promptPackageId' => self::PACKAGE_ID, 'promptPackageVersion' => self::PACKAGE_VERSION, 'membres' => [1, '2']],
                ['promptPackageId' => self::PACKAGE_ID, 'promptPackageVersion' => self::PACKAGE_VERSION, 'membres' => ['a' => 1]],
            ],
        ] as $field => $bodies) {
            foreach ($bodies as $bodyIn) {
                $response = $this->as_($etab, 'POST', $path, $bodyIn);
                self::assertSame(422, $response->getStatusCode(), json_encode($bodyIn));
                self::assertArrayHasKey($field, self::json($response)['fields']);
            }
        }
        self::assertSame(0, (int) Db::get()->query('SELECT COUNT(*) FROM mass_runs')->fetchColumn());
    }

    #[TestDox('UC-ETA-03-F09 — E2 : paquet non publié ou sans gabarits d’extraction → 422 explicite')]
    public function testF09UnpublishedOrIncompletePackage(): void
    {
        $etab = $this->registerEtablissement();
        $cohorte = $this->createCohorte($etab);
        $this->enrolLearner($cohorte['code'], $cohorte['id'], 1, ['2026-01-05']);

        $unpublished = $this->launch($etab, $cohorte['id'], ['promptPackageVersion' => '9.9.9']);
        self::assertSame(422, $unpublished->getStatusCode());
        self::assertSame('Paquet de prompts publié introuvable : aurora-v3-reconstruit@9.9.9', self::json($unpublished)['error']);

        $doc = self::defaultPackage();
        $doc['id'] = 'sans-kairos';
        $doc['prompts'] = array_values(array_filter($doc['prompts'], static fn (array $p): bool => $p['role'] !== 'kairos'));
        (new PromptPackageRepository(Db::get()))->importPublishedDocument($doc);
        $incomplete = $this->launch($etab, $cohorte['id'], ['promptPackageId' => 'sans-kairos', 'promptPackageVersion' => (string) $doc['version']]);
        self::assertSame(422, $incomplete->getStatusCode());
        self::assertSame('Ce paquet ne contient pas les gabarits d\'extraction (extraction-pole + kairos)', self::json($incomplete)['error']);
        self::assertSame(0, (int) Db::get()->query('SELECT COUNT(*) FROM mass_runs')->fetchColumn());
    }

    #[TestDox('UC-ETA-03-F10 — E3 : aucun référentiel publié → 409')]
    public function testF10NoPublishedReferentiel(): void
    {
        $etab = $this->registerEtablissement();
        $cohorte = $this->createCohorte($etab);
        $this->enrolLearner($cohorte['code'], $cohorte['id'], 1, ['2026-01-05']);
        Db::get()->exec('DELETE FROM referentiel_versions');

        $response = $this->launch($etab, $cohorte['id'], []);

        self::assertSame(409, $response->getStatusCode());
        self::assertSame(['error' => 'Aucun référentiel publié'], self::json($response));
    }

    #[TestDox('UC-ETA-03-F11 — E4 : aucun membre n’a déposé → 422, aucun run créé')]
    public function testF11NoDepositor(): void
    {
        $etab = $this->registerEtablissement();
        $cohorte = $this->createCohorte($etab);
        $learner = $this->registerAs('eleve@example.org', 'Élève');
        $this->as_($learner, 'POST', "/api/cohortes/{$cohorte['code']}/rejoindre", ['consentement' => true]);

        $response = $this->launch($etab, $cohorte['id'], []);

        self::assertSame(422, $response->getStatusCode());
        self::assertSame(0, (int) Db::get()->query('SELECT COUNT(*) FROM mass_runs')->fetchColumn());
    }

    #[TestDox('UC-ETA-03-F12 — E5 : cohorte ou run d’un autre établissement (ou inexistant) → 404 homogène, rien n’est annulé')]
    public function testF12ForeignCohorteOrRun(): void
    {
        $etab = $this->registerEtablissement();
        $this->configure($etab, 50.0);
        $cohorte = $this->createCohorte($etab);
        $this->enrolLearner($cohorte['code'], $cohorte['id'], 1, ['2026-01-05']);
        $run = $this->launchRun($etab, $cohorte['id']);
        $autre = $this->registerEtablissement('autre@example.org');

        self::assertSame(['error' => 'Cohorte introuvable'], self::json($this->launch($autre, $cohorte['id'], [])));
        foreach ([$run['runId'], 999999] as $runId) {
            foreach ([['GET', "/api/etablissement/runs/{$runId}"], ['POST', "/api/etablissement/runs/{$runId}/annuler"]] as [$method, $path]) {
                $response = $this->as_($autre, $method, $path);
                self::assertSame(404, $response->getStatusCode(), "{$method} {$path}");
                self::assertSame(['error' => 'Run introuvable'], self::json($response));
            }
        }
        self::assertSame('active', $this->board($etab, $run['runId'])['status']);
    }

    #[TestDox('UC-ETA-03-F13 — E6 : visiteur 401, apprenant 403, mutations sans CSRF 403')]
    public function testF13GuardsAndCsrf(): void
    {
        $etab = $this->registerEtablissement();
        $cohorte = $this->createCohorte($etab);
        $this->enrolLearner($cohorte['code'], $cohorte['id'], 1, ['2026-01-05']);
        $run = $this->launchRun($etab, $cohorte['id']);
        $learner = $this->registerAs('eleve@example.org', 'Élève');
        $body = ['promptPackageId' => self::PACKAGE_ID, 'promptPackageVersion' => self::PACKAGE_VERSION];
        $routes = [
            ['POST', "/api/etablissement/cohortes/{$cohorte['id']}/runs", $body],
            ['GET', "/api/etablissement/runs/{$run['runId']}", null],
            ['POST', "/api/etablissement/runs/{$run['runId']}/annuler", null],
        ];
        foreach ($routes as [$method, $path, $payload]) {
            $this->cookieSid = null;
            self::assertSame(401, $this->request($method, $path, $payload)->getStatusCode(), "visiteur {$method} {$path}");
            self::assertSame(403, $this->as_($learner, $method, $path, $payload)->getStatusCode(), "apprenant {$method} {$path}");
            if ($method === 'POST') {
                $this->cookieSid = $etab['sid'];
                self::assertSame(403, $this->request($method, $path, $payload)->getStatusCode(), "sans CSRF {$path}");
            }
        }
        self::assertSame(1, (int) Db::get()->query('SELECT COUNT(*) FROM mass_runs')->fetchColumn());
        self::assertSame('active', $this->board($etab, $run['runId'])['status']);
    }

    #[TestDox('UC-ETA-03-F14 — RG : les versions sont figées au lancement ; un run ultérieur prend le nouveau référentiel publié')]
    public function testF14VersionsAreFrozenPerRun(): void
    {
        $etab = $this->registerEtablissement();
        $this->configure($etab, 50.0);
        $cohorte = $this->createCohorte($etab);
        $this->enrolLearner($cohorte['code'], $cohorte['id'], 1, ['2026-01-05']);
        $first = $this->launchRun($etab, $cohorte['id']);

        $next = self::respireReferentiel();
        $next['version'] = '7.1.0';
        $next['label'] = 'RESPIRE v7.1';
        $repo = new ReferentielRepository(Db::get());
        $next['contentHash'] = $repo->validateDocument($next)['contentHash'];
        $repo->importPublishedDocument($next, 'Version suivante');
        $second = $this->launchRun($etab, $cohorte['id']);

        self::assertSame('7.0.0', $this->board($etab, $first['runId'])['referentiel']['version']);
        self::assertSame('7.1.0', $this->board($etab, $second['runId'])['referentiel']['version']);
        $this->tickUntilDrained();
        self::assertSame('done', $this->board($etab, $first['runId'])['status'], 'le worker sert la version figée du run');
        self::assertSame('done', $this->board($etab, $second['runId'])['status']);
    }

    #[TestDox('UC-ETA-03-F15 — comportements ACTUELS figés : membres [] = tous les déposants ; annuler un run terminé le marque « cancelled »')]
    public function testF15CurrentQuirksAreFrozen(): void
    {
        $etab = $this->registerEtablissement();
        $this->configure($etab, 50.0);
        $cohorte = $this->createCohorte($etab);
        $this->enrolLearner($cohorte['code'], $cohorte['id'], 1, ['2026-01-05']);
        $this->enrolLearner($cohorte['code'], $cohorte['id'], 2, ['2026-01-05']);

        // Liste vide : traitée comme « membres absent » (voir Anomalies).
        $all = $this->launch($etab, $cohorte['id'], ['membres' => []]);
        self::assertSame(201, $all->getStatusCode());
        self::assertSame(2, self::json($all)['jobs']);
        $runId = self::json($all)['runId'];

        // Run terminé puis « annulé » : le statut bascule malgré 2 jobs done.
        $this->tickUntilDrained();
        self::assertSame('done', $this->board($etab, $runId)['status']);
        self::assertSame(200, $this->as_($etab, 'POST', "/api/etablissement/runs/{$runId}/annuler")->getStatusCode());
        $board = $this->board($etab, $runId);
        self::assertSame('cancelled', $board['status']);
        self::assertSame(2, $board['jobs']['done']);
        self::assertSame(0, $board['jobs']['cancelled']);
    }
}
