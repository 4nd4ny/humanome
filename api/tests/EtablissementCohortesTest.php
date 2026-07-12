<?php

declare(strict_types=1);

namespace Humanome\Tests;

use Humanome\Db;

/**
 * P11 cohort lifecycle: role guards, creation, EXPLICIT consent at join
 * (422 without), idempotent re-join, segmented portfolio deposit
 * (validation + replacement), quit, cascade purge.
 */
final class EtablissementCohortesTest extends MasseTestCase
{
    public function testRoleGuards(): void
    {
        // Visitor: 401 (no session).
        $this->cookieSid = null;
        self::assertSame(401, $this->request('GET', '/api/etablissement/cohortes')->getStatusCode());

        // Learner: 403 on the establishment surface.
        $learner = $this->registerAs('eleve@example.org', 'Élève');
        self::assertSame(403, $this->as_($learner, 'POST', '/api/etablissement/cohortes', ['nom' => 'X'])->getStatusCode());

        // Establishment: 403 on the learner surface (join needs apprenant).
        $etab = $this->registerEtablissement();
        self::assertSame(403, $this->as_($etab, 'POST', '/api/cohortes/ABCDEFGHJK/rejoindre', ['consentement' => true])->getStatusCode());
    }

    public function testCycleCohorte(): void
    {
        $etab = $this->registerEtablissement();

        // Validation.
        self::assertSame(422, $this->as_($etab, 'POST', '/api/etablissement/cohortes', ['nom' => ''])->getStatusCode());

        // Creation -> {id, codeInvitation}.
        $cohorte = $this->createCohorte($etab, 'Terminale B');
        self::assertMatchesRegularExpression('/^[A-Z2-9]{10}$/', $cohorte['code']);

        // List + detail (consent text served for the front).
        $list = self::json($this->as_($etab, 'GET', '/api/etablissement/cohortes'));
        self::assertCount(1, $list);
        self::assertSame('Terminale B', $list[0]['nom']);
        self::assertSame(0, $list[0]['membres']);

        $detail = self::json($this->as_($etab, 'GET', '/api/etablissement/cohortes/' . $cohorte['id']));
        self::assertSame([], $detail['membres']);
        self::assertStringContainsString('l\'établissement', $detail['consentement']);

        // Another establishment sees nothing (no existence oracle).
        $autre = $this->registerEtablissement('autre@example.org');
        self::assertSame(404, $this->as_($autre, 'GET', '/api/etablissement/cohortes/' . $cohorte['id'])->getStatusCode());
        self::assertSame(404, $this->as_($autre, 'DELETE', '/api/etablissement/cohortes/' . $cohorte['id'])->getStatusCode());
    }

    public function testConsentementExpliciteAuJoin(): void
    {
        $etab = $this->registerEtablissement();
        $cohorte = $this->createCohorte($etab);
        $learner = $this->registerAs('eleve@example.org', 'Élève');

        // No consent (absent or false or truthy-but-not-true): 422 + the text.
        foreach ([[], ['consentement' => false], ['consentement' => 'oui']] as $body) {
            $refused = $this->as_($learner, 'POST', "/api/cohortes/{$cohorte['code']}/rejoindre", $body);
            self::assertSame(422, $refused->getStatusCode());
            self::assertStringContainsString('cartographies produites', self::json($refused)['consentement']);
        }
        self::assertSame(0, (int) Db::get()->query('SELECT COUNT(*) FROM cohorte_membres')->fetchColumn());

        // Unknown code: 404.
        self::assertSame(404, $this->as_($learner, 'POST', '/api/cohortes/AAAAAAAAAA/rejoindre', ['consentement' => true])->getStatusCode());

        // Join: 201, consent stamped; re-join: 200, ORIGINAL consent kept.
        $joined = $this->as_($learner, 'POST', "/api/cohortes/{$cohorte['code']}/rejoindre", ['consentement' => true]);
        self::assertSame(201, $joined->getStatusCode());
        $consentAt = Db::get()->query('SELECT consent_at FROM cohorte_membres')->fetchColumn();

        Db::get()->exec("UPDATE cohorte_membres SET consent_at = '2026-01-01 08:00:00'");
        $again = $this->as_($learner, 'POST', "/api/cohortes/{$cohorte['code']}/rejoindre", ['consentement' => true]);
        self::assertSame(200, $again->getStatusCode());
        self::assertSame('2026-01-01 08:00:00', Db::get()->query('SELECT consent_at FROM cohorte_membres')->fetchColumn());

        // Member visible to the establishment, consent dated.
        $detail = self::json($this->as_($etab, 'GET', '/api/etablissement/cohortes/' . $cohorte['id']));
        self::assertCount(1, $detail['membres']);
        self::assertSame('2026-01-01T08:00:00', $detail['membres'][0]['consentAt']);
        self::assertFalse($detail['membres'][0]['portfolioDepose']);
        self::assertNull($detail['membres'][0]['portfolio']);

        // Audit: ids only.
        $audit = self::lastAudit('cohorte_joined');
        self::assertSame($learner['id'], $audit['userId']);
        self::assertSame(['cohorteId' => $cohorte['id']], $audit['details']);

        // GET /api/cohortes — the learner's own list (espace « Mes
        // cohortes ») : consent date, establishment, deposit state —
        // never the invitation code.
        $mes = self::json($this->as_($learner, 'GET', '/api/cohortes'));
        self::assertCount(1, $mes);
        self::assertSame($cohorte['id'], $mes[0]['id']);
        self::assertSame('Lycée Astrolabe', $mes[0]['etablissement']);
        self::assertSame('2026-01-01T08:00:00', $mes[0]['joinedAt']);
        self::assertFalse($mes[0]['portfolioDepose']);
        self::assertArrayNotHasKey('codeInvitation', $mes[0]);

        // Another learner has an empty list (no membership oracle).
        $autre = $this->registerAs('autre-eleve@example.org', 'Autre');
        self::assertSame([], self::json($this->as_($autre, 'GET', '/api/cohortes')));
    }

    public function testDepotDePortfolioSegmente(): void
    {
        $etab = $this->registerEtablissement();
        $cohorte = $this->createCohorte($etab);
        $learner = $this->registerAs('eleve@example.org', 'Élève');

        // Not a member yet: homogeneous 404.
        $refused = $this->as_($learner, 'POST', "/api/cohortes/{$cohorte['id']}/portfolio", [
            'titre' => 'Mon portfolio',
            'segments' => [['date' => '2026-01-05', 'texte' => 'x']],
        ]);
        self::assertSame(404, $refused->getStatusCode());

        $this->as_($learner, 'POST', "/api/cohortes/{$cohorte['code']}/rejoindre", ['consentement' => true]);

        // Validation: titre, segments shape, duplicate dates.
        foreach ([
            ['titre' => '', 'segments' => [['date' => '2026-01-05', 'texte' => 'x']]],
            ['titre' => 'T', 'segments' => []],
            ['titre' => 'T', 'segments' => [['date' => '5 janvier', 'texte' => 'x']]],
            ['titre' => 'T', 'segments' => [['date' => '2026-01-05', 'texte' => '  ']]],
            ['titre' => 'T', 'segments' => [
                ['date' => '2026-01-05', 'texte' => 'a'],
                ['date' => '2026-01-05', 'texte' => 'b'],
            ]],
        ] as $body) {
            self::assertSame(422, $this->as_($learner, 'POST', "/api/cohortes/{$cohorte['id']}/portfolio", $body)->getStatusCode());
        }

        // Deposit, then re-deposit REPLACES (same row).
        $first = self::json($this->as_($learner, 'POST', "/api/cohortes/{$cohorte['id']}/portfolio", [
            'titre' => 'Mon portfolio',
            'texte' => 'Texte complet…',
            'segments' => [
                ['date' => '2026-01-05', 'texte' => 'Jour 1'],
                ['date' => '2026-01-06', 'texte' => 'Jour 2'],
            ],
        ]));
        $second = self::json($this->as_($learner, 'POST', "/api/cohortes/{$cohorte['id']}/portfolio", [
            'titre' => 'Portfolio corrigé',
            'segments' => [['date' => '2026-01-07', 'texte' => 'Jour 3']],
        ]));
        self::assertSame($first['id'], $second['id']);
        self::assertSame(1, $second['segments']);
        self::assertSame(1, (int) Db::get()->query('SELECT COUNT(*) FROM cohorte_portfolios')->fetchColumn());

        $detail = self::json($this->as_($etab, 'GET', '/api/etablissement/cohortes/' . $cohorte['id']));
        self::assertTrue($detail['membres'][0]['portfolioDepose']);
        // Deposit DETAIL for the establishment front (member selection, run
        // estimation): titre, day count, size, date — never the text itself.
        $portfolio = $detail['membres'][0]['portfolio'];
        self::assertSame('Portfolio corrigé', $portfolio['titre']);
        self::assertSame(1, $portfolio['journees']);
        self::assertGreaterThan(0, $portfolio['taille']);
        self::assertNotEmpty($portfolio['deposeLe']);
        self::assertArrayNotHasKey('texte', $portfolio);
        self::assertArrayNotHasKey('segments', $portfolio);

        // Audit carries counters only, never text (§6.5). assertEquals: the
        // MySQL JSON column reorders object keys.
        $audit = self::lastAudit('cohorte_portfolio_deposited');
        self::assertEquals(['cohorteId' => $cohorte['id'], 'segments' => 1], $audit['details']);
    }

    public function testQuitterEtPurgeCascade(): void
    {
        $etab = $this->registerEtablissement();
        $cohorte = $this->createCohorte($etab);
        $learner = $this->enrolLearner($cohorte['code'], $cohorte['id'], 1);

        // Quit: 204 then homogeneous 404 (membership + deposit purged).
        self::assertSame(204, $this->as_($learner, 'DELETE', "/api/cohortes/{$cohorte['id']}/quitter")->getStatusCode());
        self::assertSame(404, $this->as_($learner, 'DELETE', "/api/cohortes/{$cohorte['id']}/quitter")->getStatusCode());
        self::assertSame(0, (int) Db::get()->query('SELECT COUNT(*) FROM cohorte_membres')->fetchColumn());
        self::assertSame(0, (int) Db::get()->query('SELECT COUNT(*) FROM cohorte_portfolios')->fetchColumn());

        // Deleting a cohorte purges its tree (FK cascade).
        $this->enrolLearner($cohorte['code'], $cohorte['id'], 2);
        self::assertSame(204, $this->as_($etab, 'DELETE', '/api/etablissement/cohortes/' . $cohorte['id'])->getStatusCode());
        foreach (['cohortes', 'cohorte_membres', 'cohorte_portfolios'] as $table) {
            self::assertSame(0, (int) Db::get()->query("SELECT COUNT(*) FROM {$table}")->fetchColumn(), $table);
        }
    }
}
