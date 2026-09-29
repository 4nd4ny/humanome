<?php

declare(strict_types=1);

namespace Humanome\Tests\UseCases\Functional;

use Humanome\Db;
use Humanome\Env;
use Humanome\Tests\CompetenceTestCase;
use Humanome\Tests\TestDb;
use Humanome\Tests\UseCases\Support\VisSupport;
use PHPUnit\Framework\Attributes\TestDox;

/**
 * UC-VIS-02 — Consulter le référentiel public : tests FONCTIONNELS (API).
 *
 * Fiche : docs/cas-utilisation/visiteur/UC-VIS-02-consulter-referentiel-public.md
 *
 * Le visiteur (ou l'application, ou un tiers) lit le référentiel par l'API
 * HTTP publique, sans session : application Slim en processus, vraie base
 * MySQL. Préconditions posées par le domaine : v7.0.0 importée, release 7.1.0
 * coupée, brouillon 7.2.0 non publié ; quelques compétences atomiques publiées.
 */
final class UcVis02ConsulterReferentielTest extends CompetenceTestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        $_SESSION = []; // visiteur : aucune session
    }

    /** @return array{v700: int, v710: int, draft: int} */
    private function publishReferentiel(): array
    {
        return VisSupport::publishTwoVersionsAndADraft(Db::get());
    }

    /** Précondition « version soumise au vote » : le brouillon 7.2.0 passe en statut review. */
    private function submitDraftToVote(int $draftId): void
    {
        self::governance()->submit($draftId, null, self::createUser('epistemiarque'));
        self::assertSame('review', self::repo()->findById($draftId)['status']);
    }

    /** Aucune session PHP ouverte, aucun cookie posé par la réponse. */
    private static function assertNoSessionOpened(\Psr\Http\Message\ResponseInterface $response): void
    {
        self::assertNotSame(PHP_SESSION_ACTIVE, session_status(), 'la lecture n’ouvre aucune session');
        self::assertSame('', $response->getHeaderLine('Set-Cookie'));
    }

    #[TestDox('UC-VIS-02-F01 — nominal API : GET /api/referentiel sert la dernière version PUBLIÉE (7.1.0), sans session')]
    public function testF01LatestPublishedReferentielWithoutSession(): void
    {
        $this->publishReferentiel();
        self::assertNotSame(PHP_SESSION_ACTIVE, session_status());

        $response = $this->request('GET', '/referentiel');

        self::assertSame(200, $response->getStatusCode());
        self::assertStringStartsWith('application/json', $response->getHeaderLine('Content-Type'));
        $doc = self::body($response);
        self::assertSame('7.1.0', $doc['version'], 'pas le brouillon 7.2.0');
        self::assertSame('respire', $doc['id']);
        self::assertCount(7, $doc['poles']);
        self::assertCount(61, $doc['competences']);
        $c101 = array_values(array_filter($doc['competences'], static fn (array $c): bool => $c['code'] === '1.01'))[0];
        self::assertSame('Douter des réponses trop lisses, vérifier les sources.', $c101['description']);
        self::assertNoSessionOpened($response);
    }

    #[TestDox('UC-VIS-02-F02 — nominal API : GET /api/referentiel/versions liste les versions publiées (métadonnées seules, plus récente d’abord)')]
    public function testF02VersionsListIsMetadataOnly(): void
    {
        $this->publishReferentiel();

        $response = $this->request('GET', '/referentiel/versions');
        self::assertNoSessionOpened($response);
        $versions = self::body($response);

        self::assertSame(['7.1.0', '7.0.0'], array_column($versions, 'semver'));
        foreach ($versions as $version) {
            self::assertArrayNotHasKey('content', $version);
            self::assertSame('published', $version['status']);
            self::assertMatchesRegularExpression('/^[0-9a-f]{64}$/', $version['contentHash']);
        }
        self::assertSame('Import initial RESPIRE v7', $versions[1]['releaseNote']);
    }

    #[TestDox('UC-VIS-02-F03 — A1 : GET /api/referentiel/versions/{semver} sert une version antérieure ; version soumise au vote ou inconnue → 404')]
    public function testF03SpecificVersionAndHiddenDraft(): void
    {
        $ids = $this->publishReferentiel();
        $this->submitDraftToVote($ids['draft']); // 7.2.0 au vote : toujours invisible

        $old = $this->request('GET', '/referentiel/versions/7.0.0');
        self::assertSame(200, $old->getStatusCode());
        self::assertEquals(VisSupport::respireV7(), self::body($old));

        foreach (['7.2.0', '9.9.9'] as $semver) {
            $response = $this->request('GET', '/referentiel/versions/' . $semver);
            self::assertSame(404, $response->getStatusCode(), $semver);
            self::assertSame(['error' => 'Unknown published version'], self::body($response));
        }
        self::assertSame('7.1.0', self::body($this->request('GET', '/referentiel'))['version'], 'la version au vote n’est pas la dernière publiée');
    }

    #[TestDox('UC-VIS-02-F04 — A2 : GET /api/referentiel/diff/7.0.0/7.1.0 → différence structurelle lisible ; version au vote ou inconnue → 404')]
    public function testF04DiffBetweenPublishedVersions(): void
    {
        $ids = $this->publishReferentiel();
        $this->submitDraftToVote($ids['draft']);

        $diff = self::body($this->request('GET', '/referentiel/diff/7.0.0/7.1.0'));
        self::assertFalse($diff['identical']);
        self::assertSame('7.0.0', $diff['from']['version']);
        self::assertSame('7.1.0', $diff['to']['version']);
        self::assertSame('Mentorat renommé', $diff['competences']['renamed'][0]['to']);
        self::assertSame(1, $diff['summary']['competencesRenamed']);

        foreach (['/referentiel/diff/7.0.0/7.2.0', '/referentiel/diff/6.0.0/7.1.0'] as $path) {
            $response = $this->request('GET', $path);
            self::assertSame(404, $response->getStatusCode(), $path);
            self::assertSame(['error' => 'Unknown published version'], self::body($response), $path);
        }
    }

    #[TestDox('UC-VIS-02-F05 — A3 : GET /api/competences liste la dernière version publiée de chaque compétence (sans contenu)')]
    public function testF05CompetenceListIsLatestPublishedMetadata(): void
    {
        self::seedCompetence('2.01', 'Intelligence Émotionnelle & Sollicitude Active', 2);
        self::seedCompetence('1.01', 'Pensée Critique & Anti-Hallucination', 1);
        self::compRepo()->createDraft('1.01', '1.1.0'); // brouillon : invisible

        $response = $this->request('GET', '/competences');
        self::assertNoSessionOpened($response);
        $list = self::body($response);

        self::assertSame(['1.01', '2.01'], array_column($list, 'code'));
        self::assertSame(['1.0.0', '1.0.0'], array_column($list, 'semver'));
        self::assertArrayNotHasKey('content', $list[0]);
        self::assertSame(1, $list[0]['pole']);
    }

    #[TestDox('UC-VIS-02-F06 — A3 : GET /api/competences/{code} sert la fiche riche ; /versions liste l’historique publié')]
    public function testF06CompetenceDetailAndHistory(): void
    {
        $id = self::seedCompetence('1.01', 'Pensée Critique & Anti-Hallucination', 1);
        // Une seconde version publiée (préconditions UC-EPI) : l'historique s'allonge.
        $draft = self::compRepo()->createDraft('1.01', '1.1.0');
        $content = self::content('1.01', 'Pensée Critique & Anti-Hallucination', 'Définition révisée.');
        self::compRepo()->updateDraft($draft['id'], $content, $draft['contentHash']);
        self::adoptAndPublishCompetence($draft['id']);

        $detail = self::body($this->request('GET', '/competences/1.01'));
        self::assertSame('1.1.0', $detail['semver']);
        self::assertSame('Définition révisée.', $detail['content']['identite']['definition']);
        self::assertNotSame($id, $detail['id']);

        $history = self::body($this->request('GET', '/competences/1.01/versions'));
        self::assertSame(['1.1.0', '1.0.0'], array_column($history, 'semver'));
        self::assertArrayNotHasKey('content', $history[0]);
    }

    #[TestDox('UC-VIS-02-F07 — E1 : compétence inconnue → 404 ; code mal formé → route inexistante (404) ; historique inconnu → liste vide')]
    public function testF07UnknownOrMalformedCompetence(): void
    {
        self::seedCompetence('1.01', 'Pensée Critique & Anti-Hallucination', 1);

        $unknown = $this->request('GET', '/competences/9.99');
        self::assertSame(404, $unknown->getStatusCode());
        self::assertSame(['error' => 'Compétence introuvable'], self::body($unknown));
        self::assertSame(404, $this->request('GET', '/competences/1.1')->getStatusCode());
        self::assertSame(404, $this->request('GET', '/competences/abc')->getStatusCode());
        $history = $this->request('GET', '/competences/9.99/versions');
        self::assertSame(200, $history->getStatusCode());
        self::assertSame([], self::body($history));
    }

    #[TestDox('UC-VIS-02-F08 — E2 : aucune version publiée → GET /api/referentiel 404, liste des versions vide')]
    public function testF08NoPublishedVersion(): void
    {
        $response = $this->request('GET', '/referentiel');
        self::assertSame(404, $response->getStatusCode());
        self::assertSame(['error' => 'No published referentiel version'], self::body($response));
        self::assertSame([], self::body($this->request('GET', '/referentiel/versions')));
    }

    #[TestDox('UC-VIS-02-F09 — E3 : base non configurée → 503 sur toutes les lectures publiques')]
    public function testF09DatabaseNotConfigured(): void
    {
        TestDb::setEnv('DB_HOST', '');
        try {
            foreach (['/referentiel', '/referentiel/versions', '/referentiel/versions/7.0.0', '/referentiel/diff/7.0.0/7.1.0', '/competences', '/competences/1.01', '/competences/1.01/versions'] as $path) {
                $response = $this->request('GET', $path);
                self::assertSame(503, $response->getStatusCode(), $path);
                self::assertSame(['error' => 'Database not configured'], self::body($response));
            }
        } finally {
            TestDb::restoreEnv();
            TestDb::overrideEnv();
        }
    }

    #[TestDox('UC-VIS-02-F10 — A4 : l’export statique (script CLI d’exploitation) sert le même contenu que l’API au moment de l’export (contrat index.json)')]
    public function testF10StaticExportMatchesApi(): void
    {
        $this->publishReferentiel();
        $dir = sys_get_temp_dir() . '/uc-vis-02-f10-' . bin2hex(random_bytes(4));
        // Interface publique de l'export : le script CLI lancé À LA MAIN contre la
        // base (ici la base de test), comme en exploitation (aucun déploiement ne le fait).
        $script = \dirname(__DIR__, 4) . '/scripts/export-referentiel-static.php';
        $env = [
            'DB_HOST' => Env::get('DB_HOST', 'mysql'),
            'DB_PORT' => Env::get('DB_PORT', '3306'),
            'DB_NAME' => TestDb::name(),
            'DB_USER' => 'root',
            'DB_PASSWORD' => Env::get('DB_ROOT_PASSWORD', 'root_dev'),
        ];
        try {
            $process = proc_open([PHP_BINARY, $script, $dir], [1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes, null, $env);
            self::assertIsResource($process);
            stream_get_contents($pipes[1]);
            $stderr = (string) stream_get_contents($pipes[2]);
            fclose($pipes[1]);
            fclose($pipes[2]);
            self::assertSame(0, proc_close($process), $stderr);

            $index = json_decode((string) file_get_contents($dir . '/index.json'), true, 512, JSON_THROW_ON_ERROR);
            $entry = $index[0];
            self::assertSame('respire', $entry['referentielId']);
            self::assertSame('7.1.0', $entry['semver']);
            // Même garde que web/src/data/referentiel.js (SAFE_FILE_RE) : pas de traversée.
            self::assertMatchesRegularExpression('/^[A-Za-z0-9._-]+\.json$/', $entry['fichier']);
            $static = json_decode((string) file_get_contents($dir . '/' . $entry['fichier']), true, 512, JSON_THROW_ON_ERROR);
            self::assertEquals(self::body($this->request('GET', '/referentiel')), $static);
        } finally {
            array_map('unlink', glob($dir . '/*') ?: []);
            if (is_dir($dir)) {
                rmdir($dir);
            }
        }
    }

    #[TestDox('UC-VIS-02-F11 — garantie minimale : le visiteur ne peut rien écrire (brouillons référentiel et compétence → 401)')]
    public function testF11VisitorCannotWrite(): void
    {
        $this->publishReferentiel();
        self::seedCompetence('1.01', 'Pensée Critique & Anti-Hallucination', 1);

        self::assertSame(401, $this->request('POST', '/referentiel/drafts', ['from' => '7.1.0', 'semver' => '7.3.0'])->getStatusCode());
        self::assertSame(401, $this->request('POST', '/competences/1.01/drafts', ['semver' => '1.1.0'])->getStatusCode());
        self::assertSame(401, $this->request('GET', '/competences/drafts')->getStatusCode(), 'l’atelier n’est pas public');
        self::assertSame(['7.1.0', '7.0.0'], array_column(self::body($this->request('GET', '/referentiel/versions')), 'semver'));
    }
}
