<?php

declare(strict_types=1);

namespace Humanome\Tests;

/**
 * RGPD accès/portabilité (art. 15/20) : un apprenant peut récupérer LUI-MÊME
 * les cartographies produites pour lui dans une cohorte de masse — pas
 * seulement l'établissement (GET /api/mes-documents-masse).
 */
final class MasseLearnerAccessTest extends MasseTestCase
{
    public function testLearnerRetrievesTheirOwnMassDocuments(): void
    {
        $etab = $this->registerEtablissement();
        $this->configure($etab, 100.0);
        $cohorte = $this->createCohorte($etab);
        $learner = $this->enrolLearner($cohorte['code'], $cohorte['id'], 1);
        $run = $this->launchRun($etab, $cohorte['id']);
        $this->tickUntilDrained();
        self::assertSame('done', self::runStatus($run['runId']));

        $response = $this->as_($learner, 'GET', '/api/mes-documents-masse');
        self::assertSame(200, $response->getStatusCode(), (string) $response->getBody());
        $body = json_decode((string) $response->getBody(), true, 512, JSON_THROW_ON_ERROR);

        self::assertCount(\count(self::DAYS), $body['documents']);
        $first = $body['documents'][0];
        self::assertSame($cohorte['id'], $first['cohorteId']);
        self::assertArrayHasKey('document', $first);
        self::assertSame('cartographie-jour', $first['document']['kind']);
        self::assertArrayHasKey('promptPackage', $first);
        self::assertArrayHasKey('referentiel', $first);
    }

    public function testAccessSurvivesLeavingTheCohort(): void
    {
        // Art. 15 : quitter la cohorte retire l'accès de l'établissement, mais
        // l'apprenant garde accès à SES données déjà produites.
        $etab = $this->registerEtablissement();
        $this->configure($etab, 100.0);
        $cohorte = $this->createCohorte($etab);
        $learner = $this->enrolLearner($cohorte['code'], $cohorte['id'], 1);
        $run = $this->launchRun($etab, $cohorte['id']);
        $this->tickUntilDrained();

        $this->as_($learner, 'DELETE', "/api/cohortes/{$cohorte['id']}/quitter");

        // L'établissement ne voit plus rien (404 homogène).
        $etabView = $this->as_($etab, 'GET', "/api/etablissement/membres/{$learner['id']}/documents");
        self::assertSame(404, $etabView->getStatusCode());

        // L'apprenant garde ses documents (art. 15).
        $mine = $this->as_($learner, 'GET', '/api/mes-documents-masse');
        self::assertSame(200, $mine->getStatusCode());
        $body = json_decode((string) $mine->getBody(), true, 512, JSON_THROW_ON_ERROR);
        self::assertCount(\count(self::DAYS), $body['documents']);
    }

    public function testEmptyForALearnerWithNoMassRun(): void
    {
        $solo = $this->registerAs('solo@example.org', 'Solo');
        $response = $this->as_($solo, 'GET', '/api/mes-documents-masse');
        self::assertSame(200, $response->getStatusCode());
        $body = json_decode((string) $response->getBody(), true, 512, JSON_THROW_ON_ERROR);
        self::assertSame([], $body['documents']);
    }
}
