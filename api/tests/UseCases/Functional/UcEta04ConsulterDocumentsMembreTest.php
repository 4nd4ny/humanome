<?php

declare(strict_types=1);

namespace Humanome\Tests\UseCases\Functional;

use Humanome\Db;
use Humanome\Tests\MasseTestCase;
use Humanome\Validation;
use PHPUnit\Framework\Attributes\TestDox;

/**
 * UC-ETA-04 — Consulter les documents produits pour un membre : tests
 * FONCTIONNELS (API).
 *
 * Fiche : docs/cas-utilisation/etablissement/UC-ETA-04-consulter-documents-membre.md
 *
 * Les documents sont produits par un vrai run (routes réelles, ticks du worker
 * simulés avec le fournisseur mock) puis lus par
 * GET /api/etablissement/membres/{membreId}/documents : enveloppe
 * {membre, documents}, documents jour « done » des cohortes de CET
 * établissement, adhésion active exigée, 404 homogène sinon.
 */
final class UcEta04ConsulterDocumentsMembreTest extends MasseTestCase
{
    private function documents(array $etab, int $memberId): \Psr\Http\Message\ResponseInterface
    {
        return $this->as_($etab, 'GET', '/api/etablissement/membres/' . $memberId . '/documents');
    }

    #[TestDox('UC-ETA-04-F01 — nominal : enveloppe {membre, documents}, journées « done » triées, documents valides au schéma')]
    public function testF01NominalMemberDocuments(): void
    {
        $etab = $this->registerEtablissement();
        $this->configure($etab, 50.0);
        $cohorte = $this->createCohorte($etab, 'Terminale B');
        $learner = $this->enrolLearner($cohorte['code'], $cohorte['id'], 1, ['2026-01-07', '2026-01-05', '2026-01-06']);
        $run = $this->launchRun($etab, $cohorte['id']);
        $this->tickUntilDrained();

        $response = $this->documents($etab, $learner['id']);

        self::assertSame(200, $response->getStatusCode(), (string) $response->getBody());
        $body = self::json($response);
        self::assertSame(['membre', 'documents'], array_keys($body));
        self::assertSame(['userId', 'displayName', 'consentAt'], array_keys($body['membre']));
        self::assertSame($learner['id'], $body['membre']['userId']);
        self::assertSame('Apprenant 1', $body['membre']['displayName']);
        self::assertMatchesRegularExpression('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/', $body['membre']['consentAt']);

        self::assertSame(self::DAYS, array_column($body['documents'], 'date'), 'triées par journée');
        $first = $body['documents'][0];
        self::assertSame(['jobId', 'runId', 'cohorteId', 'cohorte', 'date', 'promptPackage', 'referentiel', 'document'], array_keys($first));
        self::assertSame([$run['runId'], $cohorte['id'], 'Terminale B'], [$first['runId'], $first['cohorteId'], $first['cohorte']]);
        self::assertSame(['id' => self::PACKAGE_ID, 'version' => self::PACKAGE_VERSION], $first['promptPackage']);
        self::assertSame(['id' => 'respire', 'version' => '7.0.0'], $first['referentiel']);
        foreach ($body['documents'] as $entry) {
            self::assertSame($entry['date'], $entry['document']['date']);
            self::assertTrue(Validation::validate('cartographie-jour', $entry['document'])['valid']);
        }
        self::assertStringNotContainsString("aujourd'hui j'ai", (string) $response->getBody(), 'jamais le texte du dépôt');
    }

    #[TestDox('UC-ETA-04-F02 — A1 : run en cours → seules les journées terminées sont servies')]
    public function testF02OnlyFinishedDaysDuringARun(): void
    {
        $etab = $this->registerEtablissement();
        $this->configure($etab, 50.0);
        $cohorte = $this->createCohorte($etab);
        $learner = $this->enrolLearner($cohorte['code'], $cohorte['id'], 1);
        $this->launchRun($etab, $cohorte['id']);

        self::assertSame(404, $this->documents($etab, $learner['id'])->getStatusCode(), 'rien de produit encore');
        $this->tick(['maxCalls' => 10]); // 1 journée finie, la 2e à moitié

        $documents = self::json($this->documents($etab, $learner['id']))['documents'];
        self::assertSame(['2026-01-05'], array_column($documents, 'date'));
    }

    #[TestDox('UC-ETA-04-F03 — A2 : même journée produite par deux runs → deux entrées dans l’ordre des jobs (dédoublonnage côté site)')]
    public function testF03SameDayFromTwoRuns(): void
    {
        $etab = $this->registerEtablissement();
        $this->configure($etab, 50.0);
        $cohorte = $this->createCohorte($etab);
        $learner = $this->enrolLearner($cohorte['code'], $cohorte['id'], 1, ['2026-01-05']);
        $first = $this->launchRun($etab, $cohorte['id']);
        $second = $this->launchRun($etab, $cohorte['id']);
        $this->tickUntilDrained();

        $documents = self::json($this->documents($etab, $learner['id']))['documents'];

        self::assertSame(['2026-01-05', '2026-01-05'], array_column($documents, 'date'));
        self::assertSame([$first['runId'], $second['runId']], array_column($documents, 'runId'));
        self::assertLessThan($documents[1]['jobId'], $documents[0]['jobId']);
    }

    #[TestDox('UC-ETA-04-F04 — A3 : membre de deux cohortes du même établissement ; après départ de l’une, seule l’autre reste visible')]
    public function testF04MemberOfTwoCohortes(): void
    {
        $etab = $this->registerEtablissement();
        $this->configure($etab, 50.0);
        $b = $this->createCohorte($etab, 'Terminale B');
        $c = $this->createCohorte($etab, 'Option théâtre');
        $learner = $this->enrolLearner($b['code'], $b['id'], 1, ['2026-01-05']);
        $this->as_($learner, 'POST', "/api/cohortes/{$c['code']}/rejoindre", ['consentement' => true]);
        $this->as_($learner, 'POST', "/api/cohortes/{$c['id']}/portfolio", [
            'titre' => 'Carnet de théâtre',
            'segments' => [['date' => '2026-01-06', 'texte' => 'Répétition : j’ai mené l’échauffement du groupe.']],
        ]);
        $this->launchRun($etab, $b['id']);
        $this->launchRun($etab, $c['id']);
        $this->tickUntilDrained();

        $both = self::json($this->documents($etab, $learner['id']))['documents'];
        self::assertSame(['Terminale B', 'Option théâtre'], array_column($both, 'cohorte'));

        self::assertSame(204, $this->as_($learner, 'DELETE', "/api/cohortes/{$b['id']}/quitter")->getStatusCode());
        $remaining = self::json($this->documents($etab, $learner['id']))['documents'];
        self::assertSame(['Option théâtre'], array_column($remaining, 'cohorte'));
        self::assertSame(['2026-01-06'], array_column($remaining, 'date'));
    }

    #[TestDox('UC-ETA-04-F05 — E1 : membre inconnu, étranger, parti, sans document ou seulement en échec → même 404')]
    public function testF05HomogeneousNotFound(): void
    {
        $etab = $this->registerEtablissement();
        $this->configure($etab, 50.0);
        $cohorte = $this->createCohorte($etab);
        $produit = $this->enrolLearner($cohorte['code'], $cohorte['id'], 1, ['2026-01-05']);
        $partant = $this->enrolLearner($cohorte['code'], $cohorte['id'], 2, ['2026-01-05']);
        $this->launchRun($etab, $cohorte['id']);
        $this->tickUntilDrained();
        $this->as_($partant, 'DELETE', "/api/cohortes/{$cohorte['id']}/quitter");

        $enAttente = $this->enrolLearner($cohorte['code'], $cohorte['id'], 3, ['2026-01-05']);
        $enEchec = $this->enrolLearner($cohorte['code'], $cohorte['id'], 4, ['2026-01-06']);
        $this->launchRun($etab, $cohorte['id'], [$enAttente['id'], $enEchec['id']]);
        Db::get()->prepare('UPDATE mass_jobs SET status = "failed", erreur = "x" WHERE user_id = ?')->execute([$enEchec['id']]);

        $autre = $this->registerEtablissement('autre@example.org');
        $answers = [
            'inconnu' => $this->documents($etab, 999999),
            'étranger' => $this->documents($autre, $produit['id']),
            'parti' => $this->documents($etab, $partant['id']),
            'en attente' => $this->documents($etab, $enAttente['id']),
            'en échec' => $this->documents($etab, $enEchec['id']),
        ];
        foreach ($answers as $case => $response) {
            self::assertSame(404, $response->getStatusCode(), $case);
            self::assertSame(['error' => 'Aucun document pour ce membre'], self::json($response), $case);
        }
        self::assertSame(200, $this->documents($etab, $produit['id'])->getStatusCode(), 'témoin');
    }

    #[TestDox('UC-ETA-04-F06 — E2 : visiteur 401 ; apprenant 403, même pour ses propres documents (voie dédiée /api/mes-documents-masse)')]
    public function testF06Guards(): void
    {
        $etab = $this->registerEtablissement();
        $this->configure($etab, 50.0);
        $cohorte = $this->createCohorte($etab);
        $learner = $this->enrolLearner($cohorte['code'], $cohorte['id'], 1, ['2026-01-05']);
        $this->launchRun($etab, $cohorte['id']);
        $this->tickUntilDrained();
        $path = '/api/etablissement/membres/' . $learner['id'] . '/documents';

        $this->cookieSid = null;
        self::assertSame(401, $this->request('GET', $path)->getStatusCode());
        self::assertSame(403, $this->as_($learner, 'GET', $path)->getStatusCode());
        self::assertCount(1, self::json($this->as_($learner, 'GET', '/api/mes-documents-masse'))['documents']);
    }
}
