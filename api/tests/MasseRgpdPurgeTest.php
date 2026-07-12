<?php

declare(strict_types=1);

namespace Humanome\Tests;

use Humanome\Db;

/**
 * P11 RGPD guarantees of the mass module (cahier §6, plan-masse §6-7) that the
 * pre-existing suites left uncovered:
 *
 * - account purge (DELETE /api/auth/account) cascades EVERY M8 table, for the
 *   learner AND for the establishment — locks the ON DELETE CASCADE graph of
 *   009_etablissements_masse.sql so a future migration dropping one goes red;
 * - quitting a cohorte takes the already-produced documents OUT of the
 *   establishment's reach (active-membership gate), while they survive for the
 *   learner (mass_jobs.user_id ownership);
 * - GET /api/etablissement/membres/{id}/documents is partitioned by
 *   establishment: a foreign establishment reads nothing (homogeneous 404).
 */
final class MasseRgpdPurgeTest extends MasseTestCase
{
    /** Establishment + one enrolled learner whose single day is run to `done`. */
    private function producedDayFixture(string $etabEmail = 'lycee@example.org'): array
    {
        $etab = $this->registerEtablissement($etabEmail);
        $this->configure($etab, 100.0); // provider 'humanome' (platform cron)
        $cohorte = $this->createCohorte($etab);
        $learner = $this->enrolLearner($cohorte['code'], $cohorte['id'], 1, ['2026-01-05']);
        $this->launchRun($etab, $cohorte['id']);
        $this->tickUntilDrained();

        self::assertSame(
            1,
            (int) Db::get()->query('SELECT COUNT(*) FROM mass_jobs WHERE status = "done" AND document IS NOT NULL')->fetchColumn(),
            'fixture: the day must have produced a done document',
        );

        return ['etab' => $etab, 'cohorte' => $cohorte, 'learner' => $learner];
    }

    private static function rows(string $sql): int
    {
        return (int) Db::get()->query($sql)->fetchColumn();
    }

    public function testPurgeDuCompteApprenantCascadeToutesLesTablesM8(): void
    {
        ['etab' => $etab, 'learner' => $learner] = $this->producedDayFixture();
        $uid = $learner['id'];

        // Real purge of the learner account (CSRF-protected DELETE).
        self::assertSame(204, $this->as_($learner, 'DELETE', '/api/auth/account')->getStatusCode());

        // Every learner-owned M8 row is gone: consent record, deposited
        // portfolio (content!), and the produced day-jobs (user_id CASCADE).
        self::assertSame(0, self::rows("SELECT COUNT(*) FROM cohorte_membres WHERE user_id = {$uid}"));
        self::assertSame(0, self::rows("SELECT COUNT(*) FROM cohorte_portfolios WHERE user_id = {$uid}"));
        self::assertSame(0, self::rows("SELECT COUNT(*) FROM mass_jobs WHERE user_id = {$uid}"));
        self::assertSame(0, self::rows("SELECT COUNT(*) FROM users WHERE id = {$uid}"));

        // The establishment's own operational records survive the learner's
        // erasure (the run belongs to the establishment; it is simply empty).
        self::assertSame(1, self::rows('SELECT COUNT(*) FROM cohortes'));
        self::assertSame(1, self::rows('SELECT COUNT(*) FROM mass_runs'));
        self::assertSame(1, self::rows("SELECT COUNT(*) FROM etablissement_config WHERE user_id = {$etab['id']}"));
    }

    public function testPurgeDuCompteEtablissementCascadeToutLArbre(): void
    {
        ['etab' => $etab, 'learner' => $learner] = $this->producedDayFixture();

        self::assertSame(204, $this->as_($etab, 'DELETE', '/api/auth/account')->getStatusCode());

        // cohortes -> membres/portfolios, config, mass_runs -> mass_jobs: the
        // whole B2B tree cascades on the establishment account (§6.3).
        foreach ([
            'cohortes', 'cohorte_membres', 'cohorte_portfolios',
            'etablissement_config', 'mass_runs', 'mass_jobs',
        ] as $table) {
            self::assertSame(0, self::rows("SELECT COUNT(*) FROM {$table}"), "{$table} not purged");
        }

        // The learner account itself is untouched (only their membership,
        // deposit and cohort jobs vanished with the establishment).
        self::assertSame(1, self::rows("SELECT COUNT(*) FROM users WHERE id = {$learner['id']}"));
    }

    public function testDepartRetireLAccesDeLEtablissementAuxDocumentsProduits(): void
    {
        ['etab' => $etab, 'cohorte' => $cohorte, 'learner' => $learner] = $this->producedDayFixture();
        $docs = '/api/etablissement/membres/' . $learner['id'] . '/documents';

        // Before: the establishment sees the produced day document.
        $before = $this->as_($etab, 'GET', $docs);
        self::assertSame(200, $before->getStatusCode(), (string) $before->getBody());
        self::assertSame('2026-01-05', self::json($before)['documents'][0]['date']);

        // The learner withdraws consent (quit): membership + deposit purged.
        self::assertSame(204, $this->as_($learner, 'DELETE', "/api/cohortes/{$cohorte['id']}/quitter")->getStatusCode());

        // After: the produced cartography leaves the establishment's reach
        // (active-membership gate) — homogeneous 404, no membership oracle.
        self::assertSame(404, $this->as_($etab, 'GET', $docs)->getStatusCode());

        // But it stays with the learner: the done job (and its document) is
        // untouched by the quit (only queued/running/budget jobs are cancelled).
        self::assertSame(1, self::rows('SELECT COUNT(*) FROM mass_jobs WHERE status = "done" AND document IS NOT NULL'));
    }

    public function testDocumentsCloisonnesParEtablissement(): void
    {
        ['etab' => $etabA, 'learner' => $learner] = $this->producedDayFixture('a@example.org');
        $docs = '/api/etablissement/membres/' . $learner['id'] . '/documents';

        // A second establishment sees nothing of A's members (no oracle).
        $etabB = $this->registerEtablissement('b@example.org');
        self::assertSame(404, $this->as_($etabB, 'GET', $docs)->getStatusCode());

        // The owning establishment still reads them.
        self::assertSame(200, $this->as_($etabA, 'GET', $docs)->getStatusCode());
    }
}
