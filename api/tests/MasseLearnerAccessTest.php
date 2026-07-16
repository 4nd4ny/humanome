<?php

declare(strict_types=1);

namespace Humanome\Tests;

use Humanome\Db;

/**
 * RGPD accès/portabilité (art. 15/20) : un apprenant peut récupérer LUI-MÊME
 * les cartographies produites pour lui dans une cohorte de masse — pas
 * seulement l'établissement (GET /api/mes-documents-masse).
 *
 * Exigence couverte : endpoint apprenant GET /api/mes-documents-masse
 * (RequireRole 'apprenant') renvoyant les documents status='done' de
 * l'utilisateur connecté avec run/cohorte/versions ; 401 sans session, 403
 * sans le rôle, isolation stricte par user (pas d'IDOR), seulement les jobs
 * done, et survie de l'accès au départ de la cohorte.
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

    public function testRequiresAuthentication(): void
    {
        // Verrouille le câblage ->add($apprenant) sur CETTE route : sans lui,
        // userId serait casté à 0 et la route répondrait 200 {documents: []}
        // à un visiteur anonyme, sans qu'aucun autre test ne passe au rouge.
        $this->cookieSid = null;
        $response = $this->request('GET', '/api/mes-documents-masse');

        self::assertSame(401, $response->getStatusCode(), (string) $response->getBody());
        self::assertSame('Authentification requise', self::json($response)['error']);
    }

    public function testEtablissementRoleIsForbidden(): void
    {
        // Garde de rôle sur cette route précise (pas seulement la route
        // synthétique d'AuthRequireRoleTest) : un compte etablissement seul
        // n'est pas un apprenant, il n'a pas de « mes documents » à lire.
        $etab = $this->registerEtablissement();
        $response = $this->as_($etab, 'GET', '/api/mes-documents-masse');

        self::assertSame(403, $response->getStatusCode(), (string) $response->getBody());
        self::assertSame('Rôle insuffisant', self::json($response)['error']);
    }

    public function testStrictIsolationBetweenLearners(): void
    {
        // Anti-IDOR : deux apprenants de la MÊME cohorte, run drainé — la
        // table contient 2 × count(DAYS) jobs done, mais chacun ne reçoit
        // QUE les siens (verrouille le WHERE j.user_id = ?).
        $etab = $this->registerEtablissement();
        $this->configure($etab, 100.0);
        $cohorte = $this->createCohorte($etab);
        $alice = $this->enrolLearner($cohorte['code'], $cohorte['id'], 1);
        $badia = $this->enrolLearner($cohorte['code'], $cohorte['id'], 2);
        $this->launchRun($etab, $cohorte['id']);
        $this->tickUntilDrained();

        self::assertSame(
            2 * \count(self::DAYS),
            (int) Db::get()->query('SELECT COUNT(*) FROM mass_jobs WHERE status = "done"')->fetchColumn(),
            'fixture : le run doit avoir produit les jours des DEUX apprenants',
        );

        $ownJobIds = function (int $userId): array {
            $stmt = Db::get()->prepare('SELECT id FROM mass_jobs WHERE user_id = ? ORDER BY id');
            $stmt->execute([$userId]);

            return array_map(intval(...), $stmt->fetchAll(\PDO::FETCH_COLUMN));
        };

        foreach ([[$alice, $badia], [$badia, $alice]] as [$learner, $other]) {
            $response = $this->as_($learner, 'GET', '/api/mes-documents-masse');
            self::assertSame(200, $response->getStatusCode(), (string) $response->getBody());
            $documents = self::json($response)['documents'];

            self::assertCount(\count(self::DAYS), $documents);
            $returned = array_column($documents, 'jobId');
            sort($returned);
            self::assertSame($ownJobIds($learner['id']), $returned, 'exactement SES jobs, tous ses jobs');
            self::assertSame([], array_intersect($returned, $ownJobIds($other['id'])), 'aucun job de l\'autre apprenant');
        }
    }

    public function testOnlyDoneDocumentsAreReturned(): void
    {
        // Verrouille le AND j.status = "done" : un jour retombé en échec
        // (document purgé) ne doit jamais réapparaître dans la réponse.
        $etab = $this->registerEtablissement();
        $this->configure($etab, 100.0);
        $cohorte = $this->createCohorte($etab);
        $learner = $this->enrolLearner($cohorte['code'], $cohorte['id'], 1);
        $this->launchRun($etab, $cohorte['id']);
        $this->tickUntilDrained();

        $failedDay = self::DAYS[0];
        $stmt = Db::get()->prepare(
            'UPDATE mass_jobs SET status = "failed", document = NULL WHERE user_id = ? AND day_date = ?'
        );
        $stmt->execute([$learner['id'], $failedDay]);
        self::assertSame(1, $stmt->rowCount(), 'fixture : un jour forcé en non-done');

        $response = $this->as_($learner, 'GET', '/api/mes-documents-masse');
        self::assertSame(200, $response->getStatusCode(), (string) $response->getBody());
        $documents = self::json($response)['documents'];

        self::assertCount(\count(self::DAYS) - 1, $documents);
        self::assertNotContains($failedDay, array_column($documents, 'date'));
        foreach ($documents as $document) {
            self::assertNotNull($document['document'], 'chaque entrée renvoyée porte un document produit');
        }
    }
}
