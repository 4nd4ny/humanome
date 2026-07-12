<?php

declare(strict_types=1);

namespace Humanome\Tests;

use Humanome\Db;

/**
 * P11 run enqueueing: published-only versions frozen on the run, jobs for
 * consented members WHO DEPOSITED only, optional member scoping, progress
 * board, document access rules.
 */
final class EtablissementRunsTest extends MasseTestCase
{
    public function testEnfilementValide(): void
    {
        $etab = $this->registerEtablissement();
        $this->configure($etab, 10.0);
        $cohorte = $this->createCohorte($etab);

        // 2 depositors + 1 consented member WITHOUT deposit -> ignored.
        $a = $this->enrolLearner($cohorte['code'], $cohorte['id'], 1);
        $b = $this->enrolLearner($cohorte['code'], $cohorte['id'], 2, ['2026-01-05', '2026-01-06']);
        $sansDepot = $this->registerAs('sans-depot@example.org', 'Sans Dépôt');
        $this->as_($sansDepot, 'POST', "/api/cohortes/{$cohorte['code']}/rejoindre", ['consentement' => true]);

        $run = $this->launchRun($etab, $cohorte['id']);
        self::assertSame(5, $run['jobs'], '3 journées + 2 journées, rien pour le non-déposant');

        // Versions frozen on the run (reproducibility).
        $row = Db::get()->query('SELECT * FROM mass_runs')->fetch();
        self::assertSame(self::PACKAGE_ID, $row['prompt_package_slug']);
        self::assertSame(self::PACKAGE_VERSION, $row['prompt_package_semver']);
        self::assertSame('respire', $row['referentiel_id']);
        self::assertSame('7.0.0', $row['referentiel_semver']);

        // Progress board just after enqueue.
        $board = self::json($this->as_($etab, 'GET', '/api/etablissement/runs/' . $run['runId']));
        self::assertSame('active', $board['status']);
        self::assertSame(5, $board['jobs']['queued']);
        self::assertEquals(0.0, $board['coutUsd']); // json_encode drops the zero fraction
        self::assertSame(['id' => self::PACKAGE_ID, 'version' => self::PACKAGE_VERSION], $board['promptPackage']);

        // Member scoping: only the listed depositor is enqueued.
        $scoped = $this->launchRun($etab, $cohorte['id'], [$b['id']]);
        self::assertSame(2, $scoped['jobs']);
        self::assertNotSame($run['runId'], $scoped['runId']);
        self::assertIsInt($a['id']); // (both learners kept: fixture symmetry)

        // Audit: counters only (assertEquals: MySQL JSON reorders keys).
        $audit = self::lastAudit('mass_run_created');
        self::assertEquals(['runId' => $scoped['runId'], 'cohorteId' => $cohorte['id'], 'jobs' => 2], $audit['details']);
    }

    public function testRefusEnfilement(): void
    {
        $etab = $this->registerEtablissement();
        $this->configure($etab, 10.0);
        $cohorte = $this->createCohorte($etab);

        // No depositor yet.
        $refused = $this->as_($etab, 'POST', "/api/etablissement/cohortes/{$cohorte['id']}/runs", [
            'promptPackageId' => self::PACKAGE_ID,
            'promptPackageVersion' => self::PACKAGE_VERSION,
        ]);
        self::assertSame(422, $refused->getStatusCode());

        $this->enrolLearner($cohorte['code'], $cohorte['id'], 1);

        // Unpublished package version.
        $refused = $this->as_($etab, 'POST', "/api/etablissement/cohortes/{$cohorte['id']}/runs", [
            'promptPackageId' => self::PACKAGE_ID,
            'promptPackageVersion' => '9.9.9',
        ]);
        self::assertSame(422, $refused->getStatusCode());

        // Package without the extraction templates (fixture example package).
        $doc = json_decode(
            (string) file_get_contents(dirname(__DIR__, 2) . '/schemas/fixtures/prompt-package-exemple.json'),
            true,
            512,
            JSON_THROW_ON_ERROR,
        );
        $doc['prompts'] = array_values(array_filter($doc['prompts'], static fn (array $p): bool => $p['role'] !== 'kairos'));
        (new \Humanome\Packages\PromptPackageRepository(Db::get()))->importPublishedDocument($doc);
        $refused = $this->as_($etab, 'POST', "/api/etablissement/cohortes/{$cohorte['id']}/runs", [
            'promptPackageId' => (string) $doc['id'],
            'promptPackageVersion' => (string) $doc['version'],
        ]);
        self::assertSame(422, $refused->getStatusCode());
        self::assertStringContainsString('extraction', self::json($refused)['error']);

        // No published referentiel -> 409.
        Db::get()->exec('DELETE FROM referentiel_versions');
        $refused = $this->as_($etab, 'POST', "/api/etablissement/cohortes/{$cohorte['id']}/runs", [
            'promptPackageId' => self::PACKAGE_ID,
            'promptPackageVersion' => self::PACKAGE_VERSION,
        ]);
        self::assertSame(409, $refused->getStatusCode());

        // Foreign cohorte -> homogeneous 404.
        $autre = $this->registerEtablissement('autre@example.org');
        $refused = $this->as_($autre, 'POST', "/api/etablissement/cohortes/{$cohorte['id']}/runs", [
            'promptPackageId' => self::PACKAGE_ID,
            'promptPackageVersion' => self::PACKAGE_VERSION,
        ]);
        self::assertSame(404, $refused->getStatusCode());
    }

    public function testAccesAuxDocumentsBorneParCohorteEtConsentement(): void
    {
        $etab = $this->registerEtablissement();
        $this->configure($etab, 10.0);
        $cohorte = $this->createCohorte($etab);
        $learner = $this->enrolLearner($cohorte['code'], $cohorte['id'], 1, ['2026-01-05']);
        $this->launchRun($etab, $cohorte['id']);
        $this->tickUntilDrained();

        // The establishment reads the member's documents…
        $body = self::json($this->as_($etab, 'GET', '/api/etablissement/membres/' . $learner['id'] . '/documents'));
        self::assertCount(1, $body['documents']);
        self::assertSame($learner['id'], $body['membre']['userId']);

        // …another establishment gets a homogeneous 404 for the same member.
        $autre = $this->registerEtablissement('autre@example.org');
        self::assertSame(404, $this->as_($autre, 'GET', '/api/etablissement/membres/' . $learner['id'] . '/documents')->getStatusCode());

        // Unknown member: same 404 (no membership oracle).
        self::assertSame(404, $this->as_($etab, 'GET', '/api/etablissement/membres/999999/documents')->getStatusCode());
    }

    public function testAnnulerUnRunEtranger404(): void
    {
        $etab = $this->registerEtablissement();
        $this->configure($etab, 10.0);
        $cohorte = $this->createCohorte($etab);
        $this->enrolLearner($cohorte['code'], $cohorte['id'], 1, ['2026-01-05']);
        $run = $this->launchRun($etab, $cohorte['id']);

        $autre = $this->registerEtablissement('autre@example.org');
        self::assertSame(404, $this->as_($autre, 'POST', '/api/etablissement/runs/' . $run['runId'] . '/annuler')->getStatusCode());
        self::assertSame(404, $this->as_($autre, 'GET', '/api/etablissement/runs/' . $run['runId'])->getStatusCode());
    }
}
