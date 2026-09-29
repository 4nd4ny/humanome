<?php

declare(strict_types=1);

namespace Humanome\Tests\UseCases\Functional;

use Humanome\Env;
use Humanome\Packages\SettingsRepository;
use Humanome\Tests\TestDb;
use Humanome\Twin9\FicheStore;
use Humanome\Tests\UseCases\Support\EpiSupport;
use PHPUnit\Framework\Attributes\TestDox;
use Psr\Http\Message\ResponseInterface;

/**
 * UC-EPI-03 — Entériner et publier (compétence, release du référentiel) :
 * tests FONCTIONNELS (API + CLI).
 *
 * Fiche : docs/cas-utilisation/epistemiarque/UC-EPI-03-enteriner-publier.md
 *
 * État initial = production : référentiel 7.0.0 publié, 7 pôles et 61
 * compétences 1.0.0 (corpus versionné, seeder du déploiement). Deux membres
 * réels (Alix, Bao : seuil 2) mènent une proposition jusqu'à la majorité, puis
 * l'entérinent et coupent une release par l'API HTTP. La propagation est
 * rejouée par ses interfaces publiques : le script CLI d'export statique
 * (sortie dans un dossier TEMPORAIRE, jamais web/public/data) et les
 * endpoints d'exploitation /api/admin/dump-fiches (resynchronisation manuelle
 * du corpus), /api/admin/generate-fiches et /api/admin/seed-competences
 * (appelés par deploy.mjs), avec le jeton de migration et sans session.
 */
final class UcEpi03EnterinerPublierTest extends EpiSupport
{
    private const MIGRATE_TOKEN = 'uc-epi-03-migrate-token-0123456789';

    /** @var array{id: int, csrf: string, sid: string} */
    private array $alix;

    /** @var array{id: int, csrf: string, sid: string} */
    private array $bao;

    protected function setUp(): void
    {
        parent::setUp();
        $this->alix = $this->member('alix@example.org', 'Alix');
        $this->bao = $this->member('bao@example.org', 'Bao');
    }

    /**
     * UC-EPI-01 + UC-EPI-02 par l'API : proposition sur $code, votée par les
     * comptes donnés. Renvoie l'id de la proposition.
     *
     * @param list<array{id: int, csrf: string, sid: string}> $pour
     */
    private function adoptedProposal(string $code, string $semver, callable $edit, array $pour): int
    {
        $id = $this->openCompetenceProposal($this->alix, $code, $semver, $edit);
        foreach ($pour as $voter) {
            self::assertSame(200, $this->as_($voter, 'POST', '/api/competences/proposals/' . $id . '/votes', ['vote' => 'pour'])->getStatusCode());
        }

        return $id;
    }

    private static function newDefinition(string $definition): callable
    {
        return static function (array $content) use ($definition): array {
            $content['identite']['definition'] = $definition;

            return $content;
        };
    }

    /** Appel d'exploitation (deploy.mjs, scripts/dump-fiches.mjs) : jeton de migration, aucune session. */
    private function tool(string $method, string $path, ?array $body = null): ResponseInterface
    {
        TestDb::setEnv('MIGRATE_TOKEN', self::MIGRATE_TOKEN);
        $this->cookieSid = null;

        return $this->request($method, $path, $body, ['X-Migrate-Token' => self::MIGRATE_TOKEN]);
    }

    /** @param array{id: int, csrf: string, sid: string} $who */
    private function publish(array $who, int $id, ?array $body = ['releaseNote' => 'Entérinée par le vote des membres.']): ResponseInterface
    {
        return $this->as_($who, 'POST', '/api/competences/drafts/' . $id . '/publish', $body);
    }

    /** @param array{id: int, csrf: string, sid: string} $who */
    private function release(array $who, ?array $body): ResponseInterface
    {
        return $this->as_($who, 'POST', '/api/competences/release', $body);
    }

    #[TestDox('UC-EPI-03-F01 — nominal : entériner la proposition adoptée, puis couper la release 7.1.0 (servie, lockfile, diff)')]
    public function testF01EnterineThenCutRelease(): void
    {
        $initial = self::seedFullCorpus();
        $id = $this->adoptedProposal('1.01', '1.1.0', self::newDefinition('Douter méthodiquement, y compris de soi.'), [$this->alix, $this->bao]);

        // 2-3. Entérinement.
        $published = $this->publish($this->alix, $id, ['releaseNote' => 'Définition précisée (débat Decidim n° 7).']);
        self::assertSame(200, $published->getStatusCode(), (string) $published->getBody());
        $body = self::json($published);
        self::assertSame(['published', 'Définition précisée (débat Decidim n° 7).'], [$body['status'], $body['releaseNote']]);
        self::assertNotNull($body['publishedAt']);
        self::assertArrayNotHasKey('content', $body);

        // 4. La nouvelle version est en vigueur, l'ancienne reste consultable.
        $current = self::json($this->anonymous('GET', '/api/competences/1.01'));
        self::assertSame(['1.1.0', 'Douter méthodiquement, y compris de soi.'], [$current['semver'], $current['content']['identite']['definition']]);
        self::assertSame(['1.1.0', '1.0.0'], array_column(self::json($this->anonymous('GET', '/api/competences/1.01/versions')), 'semver'));
        $all = self::json($this->anonymous('GET', '/api/competences'));
        self::assertCount(61, $all);
        self::assertSame('1.1.0', array_column($all, 'semver', 'code')['1.01']);
        self::assertSame([], self::json($this->as_($this->alix, 'GET', '/api/competences/drafts')));

        // 5-6. Coupe de release.
        $cut = $this->release($this->alix, ['semver' => '7.1.0', 'label' => 'RESPIRE v7.1.0']);
        self::assertSame(201, $cut->getStatusCode(), (string) $cut->getBody());
        $release = self::json($cut);
        self::assertSame(['status', 'id', 'semver', 'contentHash'], array_keys($release));
        self::assertSame(['imported', '7.1.0', $initial['contentHash']], [$release['status'], $release['semver'], $release['contentHash']]);

        // 7. La release est servie comme dernière version, avec la définition entérinée.
        $latest = self::json($this->anonymous('GET', '/api/referentiel'));
        self::assertSame(['7.1.0', 'RESPIRE v7.1.0'], [$latest['version'], $latest['label']]);
        self::assertSame('Douter méthodiquement, y compris de soi.', array_column($latest['competences'], 'description', 'code')['1.01']);
        self::assertSame(['7.1.0', '7.0.0'], array_column(self::json($this->anonymous('GET', '/api/referentiel/versions')), 'semver'));
        self::assertTrue(self::json($this->anonymous('GET', '/api/referentiel/diff/7.0.0/7.1.0'))['identical'], 'définition seule : aucun changement structurel');
        $lock = self::$pdo->query('SELECT competence_code, competence_version_id FROM referentiel_snapshot_competences WHERE snapshot_version_id = ' . (int) $release['id'])->fetchAll(\PDO::FETCH_KEY_PAIR);
        self::assertCount(61, $lock);
        self::assertSame($id, (int) $lock['1.01']);
    }

    #[TestDox('UC-EPI-03-F02 — A1 : un administrateur non membre entérine une proposition adoptée et coupe la release')]
    public function testF02AdminEnterinesAndCuts(): void
    {
        self::seedFullCorpus();
        $admin = $this->member('admin@example.org', 'Admin', ['admin']);
        $id = $this->adoptedProposal('2.01', '1.1.0', self::newDefinition('Écouter activement.'), [$this->alix, $this->bao]);

        self::assertSame(200, $this->publish($admin, $id)->getStatusCode());
        self::assertSame(201, $this->release($admin, ['semver' => '7.1.0'])->getStatusCode());
    }

    #[TestDox('UC-EPI-03-F03 — A2/A3 : entérinement sans note ou avec une note non textuelle (NULL), release sans libellé (« RESPIRE v<semver> » par défaut)')]
    public function testF03DefaultNoteAndLabel(): void
    {
        self::seedFullCorpus();
        $id = $this->adoptedProposal('1.01', '1.1.0', self::newDefinition('Autre définition.'), [$this->alix, $this->bao]);

        $published = $this->publish($this->alix, $id, null);
        self::assertSame(200, $published->getStatusCode());
        self::assertNull(self::json($published)['releaseNote']);
        // Une note NON textuelle est ignorée en silence (NULL), comme le corps non JSON (AN1).
        $other = $this->adoptedProposal('2.01', '1.1.0', self::newDefinition('Écouter activement.'), [$this->alix, $this->bao]);
        $numeric = $this->publish($this->alix, $other, ['releaseNote' => 42]);
        self::assertSame([200, 'published', null], [$numeric->getStatusCode(), self::json($numeric)['status'], self::json($numeric)['releaseNote']]);

        self::assertSame(201, $this->release($this->alix, ['semver' => '7.1.0'])->getStatusCode());
        $versions = self::json($this->anonymous('GET', '/api/referentiel/versions'));
        self::assertSame('RESPIRE v7.1.0', $versions[0]['label']);
        self::assertSame('Coupe de release depuis les compétences atomiques publiées', $versions[0]['releaseNote']);
    }

    #[TestDox('UC-EPI-03-F04 — A4 : un renommage entériné change le hash structurel de la release et apparaît dans le diff')]
    public function testF04RenameChangesTheStructuralHash(): void
    {
        $initial = self::seedFullCorpus();
        $before = self::json($this->anonymous('GET', '/api/competences/1.01'))['nom'];
        $id = $this->adoptedProposal('1.01', '1.1.0', static function (array $content): array {
            $content['identite']['nom'] = 'Pensée critique et vigilance face aux IA';

            return $content;
        }, [$this->alix, $this->bao]);
        $this->publish($this->alix, $id);

        $release = self::json($this->release($this->alix, ['semver' => '7.1.0']));

        self::assertNotSame($initial['contentHash'], $release['contentHash']);
        $diff = self::json($this->anonymous('GET', '/api/referentiel/diff/7.0.0/7.1.0'));
        self::assertFalse($diff['identical']);
        self::assertSame([['code' => '1.01', 'pole' => 1, 'from' => $before, 'to' => 'Pensée critique et vigilance face aux IA']], $diff['competences']['renamed']);
    }

    #[TestDox('UC-EPI-03-F05 — E1 : majorité non atteinte, proposition rejetée ou électorat vide → 409 avec le message du décompte, la proposition reste au vote')]
    public function testF05MajorityNotReached(): void
    {
        self::seedCompetence('1.01', 'Pensée Critique', 1);
        self::seedCompetence('2.01', 'Écoute', 2);
        self::seedCompetence('3.01', 'Créativité', 3);
        $id = $this->adoptedProposal('1.01', '1.1.0', self::newDefinition('x'), [$this->alix]);

        $response = $this->publish($this->alix, $id);

        self::assertSame(409, $response->getStatusCode());
        self::assertSame('Majorité non atteinte : 1 voix « pour » sur 2 requises (2 membres).', self::json($response)['error']);
        self::assertSame('review', self::competenceRow($id)['status']);
        self::assertSame('1.0.0', self::json($this->anonymous('GET', '/api/competences/1.01'))['semver']);

        // Rejetée : les deux membres votent « contre ».
        $rejected = $this->openCompetenceProposal($this->alix, '2.01', '1.1.0', self::newDefinition('y'));
        foreach ([$this->alix, $this->bao] as $voter) {
            $this->as_($voter, 'POST', '/api/competences/proposals/' . $rejected . '/votes', ['vote' => 'contre']);
        }
        $refused = $this->publish($this->alix, $rejected);
        self::assertSame([409, 'Cette proposition a été rejetée par la majorité des membres épistémiarques.'], [$refused->getStatusCode(), self::json($refused)['error']]);

        // Électorat vide : proposition adoptée, puis plus aucun membre (Alix
        // devient admin non membre et entérine, Bao perd le rôle).
        $orphan = $this->adoptedProposal('3.01', '1.1.0', self::newDefinition('z'), [$this->alix, $this->bao]);
        self::setRoles($this->alix['id'], ['admin']);
        self::setRoles($this->bao['id'], ['apprenant']);
        $blocked = $this->publish($this->alix, $orphan);
        self::assertSame(409, $blocked->getStatusCode());
        self::assertStringStartsWith('Aucun membre épistémiarque ne peut valider', self::json($blocked)['error']);

        self::assertSame(['review', 'review', 'review'], array_map(static fn (int $v): string => self::competenceRow($v)['status'], [$id, $rejected, $orphan]));
    }

    #[TestDox('UC-EPI-03-F06 — E2 : brouillon jamais soumis ou version déjà publiée → 409 ; brouillon inconnu → 404')]
    public function testF06NotEnterinable(): void
    {
        $publishedId = self::seedCompetence('1.01', 'Pensée Critique', 1);
        $draft = self::json($this->as_($this->alix, 'POST', '/api/competences/1.01/drafts', ['semver' => '1.1.0']));

        $notSubmitted = $this->publish($this->alix, $draft['id']);
        self::assertSame([409, 'A competence proposal must be submitted for a vote before it can be published.'], [$notSubmitted->getStatusCode(), self::json($notSubmitted)['error']]);
        $again = $this->publish($this->alix, $publishedId);
        self::assertSame(409, $again->getStatusCode());
        self::assertStringContainsString('already published', self::json($again)['error']);
        $unknown = $this->publish($this->alix, 999999);
        self::assertSame([404, 'Brouillon introuvable'], [$unknown->getStatusCode(), self::json($unknown)['error']]);
    }

    #[TestDox('UC-EPI-03-F07 — E3 : une version plus récente de la même compétence a été entérinée entre-temps → 409 (semver)')]
    public function testF07SemverOvertakenByAnotherPublication(): void
    {
        self::seedCompetence('1.01', 'Pensée Critique', 1);
        $minor = $this->adoptedProposal('1.01', '1.1.0', self::newDefinition('mineure'), [$this->alix, $this->bao]);
        $major = $this->adoptedProposal('1.01', '2.0.0', self::newDefinition('majeure'), [$this->alix, $this->bao]);
        self::assertSame(200, $this->publish($this->alix, $major)->getStatusCode());

        $response = $this->publish($this->alix, $minor);

        self::assertSame(409, $response->getStatusCode());
        self::assertStringContainsString('1.1.0 is not greater than published 2.0.0', self::json($response)['error']);
        self::assertSame('majeure', self::json($this->anonymous('GET', '/api/competences/1.01'))['content']['identite']['definition']);
    }

    #[TestDox('UC-EPI-03-F08 — E4 : l’électorat a changé depuis le vote → décompte recalculé à la publication → 409')]
    public function testF08ElectorateChangedSinceTheVote(): void
    {
        self::seedCompetence('1.01', 'Pensée Critique', 1);
        $chloe = $this->member('chloe@example.org', 'Chloé');
        $id = $this->adoptedProposal('1.01', '1.1.0', self::newDefinition('x'), [$this->alix, $this->bao]);
        self::assertSame('adopted', self::json($this->as_($chloe, 'GET', '/api/competences/proposals/' . $id))['tally']['outcome']);

        self::setRoles($this->bao['id'], ['apprenant']);
        $response = $this->publish($this->alix, $id);

        self::assertSame(409, $response->getStatusCode());
        self::assertSame('Majorité non atteinte : 1 voix « pour » sur 2 requises (2 membres).', self::json($response)['error']);
    }

    #[TestDox('UC-EPI-03-F09 — E5/E7 : release — semver absente ou invalide (422), corps non JSON (400), libellé vide (422 /label), version existante ou non croissante (409)')]
    public function testF09ReleaseRefusals(): void
    {
        self::seedFullCorpus();

        $missing = $this->release($this->alix, ['label' => 'sans version']);
        self::assertSame([422, 'Champ "semver" requis'], [$missing->getStatusCode(), self::json($missing)['error']]);
        $invalid = $this->release($this->alix, ['semver' => 'v7.1']);
        self::assertSame(422, $invalid->getStatusCode());
        self::assertArrayHasKey('/version', self::json($invalid)['errors']);
        self::assertSame(400, $this->rawAs($this->alix, 'POST', '/api/competences/release', 'semver=7.1.0')->getStatusCode());
        // Libellé vide : transmis tel quel et refusé par le schéma (label minLength 1).
        $emptyLabel = $this->release($this->alix, ['semver' => '7.1.0', 'label' => '']);
        self::assertSame(422, $emptyLabel->getStatusCode());
        self::assertArrayHasKey('/label', self::json($emptyLabel)['errors']);

        $existing = $this->release($this->alix, ['semver' => '7.0.0']);
        self::assertSame(409, $existing->getStatusCode());
        self::assertStringContainsString('already exists', self::json($existing)['error']);
        $lower = $this->release($this->alix, ['semver' => '6.9.0']);
        self::assertSame(409, $lower->getStatusCode());
        self::assertStringContainsString('not greater than published 7.0.0', self::json($lower)['error']);
        self::assertSame(['7.0.0'], array_column(self::json($this->anonymous('GET', '/api/referentiel/versions')), 'semver'));
    }

    #[TestDox('UC-EPI-03-F10 — E6 : corpus incomplet (moins de 61 compétences / 7 pôles) → 422, aucune release')]
    public function testF10IncompleteCorpusIsRefused(): void
    {
        self::seedCompetence('1.01', 'Pensée Critique', 1);
        self::seedCompetence('2.01', 'Écoute', 2);

        $response = $this->release($this->alix, ['semver' => '7.1.0']);

        self::assertSame(422, $response->getStatusCode());
        self::assertSame('Document does not conform to the referentiel schema', self::json($response)['error']);
        self::assertNotSame([], self::json($response)['errors']);
        self::assertSame(404, $this->anonymous('GET', '/api/referentiel')->getStatusCode(), 'aucune version publiée');
    }

    #[TestDox('UC-EPI-03-F11 — E8 : sans session → 401, sans rôle → 403, sans jeton CSRF → 403 (entérinement et release)')]
    public function testF11Guards(): void
    {
        self::seedCompetence('1.01', 'Pensée Critique', 1);
        $id = $this->adoptedProposal('1.01', '1.1.0', self::newDefinition('x'), [$this->alix, $this->bao]);
        $maya = $this->member('maya@example.org', 'Maya', ['apprenant', 'promptologue']);

        foreach ([['/api/competences/drafts/' . $id . '/publish', []], ['/api/competences/release', ['semver' => '7.1.0']]] as [$path, $body]) {
            self::assertSame(401, $this->anonymous('POST', $path, $body)->getStatusCode(), $path);
            self::assertSame(403, $this->as_($maya, 'POST', $path, $body)->getStatusCode(), $path);
            self::assertSame(403, $this->withoutCsrf($this->alix, 'POST', $path, $body)->getStatusCode(), $path);
        }
        self::assertSame('review', self::competenceRow($id)['status']);
    }

    #[TestDox('UC-EPI-03-F12 — propagation : le script CLI d’export statique publie la nouvelle release (dossier temporaire)')]
    public function testF12StaticExportScript(): void
    {
        self::seedFullCorpus();
        $id = $this->adoptedProposal('1.01', '1.1.0', self::newDefinition('Définition exportée.'), [$this->alix, $this->bao]);
        $this->publish($this->alix, $id);
        self::assertSame(201, $this->release($this->alix, ['semver' => '7.1.0'])->getStatusCode());

        $outDir = sys_get_temp_dir() . '/humanome-uc-epi-03-cli-' . bin2hex(random_bytes(6));
        $script = \dirname(__DIR__, 4) . '/scripts/export-referentiel-static.php';
        $env = [
            'DB_HOST' => Env::get('DB_HOST', 'mysql'),
            'DB_PORT' => Env::get('DB_PORT', '3306'),
            'DB_NAME' => TestDb::name(),
            'DB_USER' => 'root',
            'DB_PASSWORD' => Env::get('DB_ROOT_PASSWORD', 'root_dev'),
        ];
        try {
            $process = proc_open([PHP_BINARY, $script, $outDir], [1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes, null, $env);
            self::assertIsResource($process);
            $stdout = stream_get_contents($pipes[1]);
            $stderr = stream_get_contents($pipes[2]);
            fclose($pipes[1]);
            fclose($pipes[2]);
            $exit = proc_close($process);

            self::assertSame(0, $exit, $stderr);
            self::assertStringContainsString('wrote: respire-v7.1.0.json', $stdout);
            self::assertStringContainsString('done — 2 published version(s) exported to ' . $outDir, $stdout);
            $index = json_decode((string) file_get_contents($outDir . '/index.json'), true, 512, JSON_THROW_ON_ERROR);
            self::assertSame(['7.1.0', '7.0.0'], array_column($index, 'semver'));
            $exported = json_decode((string) file_get_contents($outDir . '/respire-v7.1.0.json'), true, 512, JSON_THROW_ON_ERROR);
            self::assertSame('Définition exportée.', array_column($exported['competences'], 'description', 'code')['1.01']);
        } finally {
            foreach (glob($outDir . '/*.json') ?: [] as $file) {
                unlink($file);
            }
            if (is_dir($outDir)) {
                rmdir($outDir);
            }
        }
    }

    #[TestDox('UC-EPI-03-F13 — propagation : après entérinement, la fiche servie par dump-fiches (resynchronisation MANUELLE du corpus, scripts/dump-fiches.mjs) est la nouvelle')]
    public function testF13EnterinedFicheReachesTheManualDump(): void
    {
        self::seedFullCorpus();
        $newFiche = "## 1.01 — Pensée Critique\n\n**Essence** — Douter, y compris de soi.\n\n---";
        $id = $this->adoptedProposal('1.01', '1.1.0', static function (array $content) use ($newFiche): array {
            $content['fiche'] = $newFiche;

            return $content;
        }, [$this->alix, $this->bao]);

        // Appel de scripts/dump-fiches.mjs (lancé à la main, pas par deploy.mjs) :
        // jeton de migration, aucune session.
        $dump = fn (): array => self::json($this->tool('GET', '/api/admin/dump-fiches'));
        self::assertNotSame($newFiche, $dump()['fiches']['1.01'], 'une proposition au vote ne se propage pas');

        self::assertSame(200, $this->publish($this->alix, $id)->getStatusCode());

        $after = $dump();
        self::assertSame($newFiche, $after['fiches']['1.01']);
        self::assertCount(61, $after['fiches']);
    }

    #[TestDox('UC-EPI-03-F14 — Anomalie AN1 (comportement actuel figé) : un corps non JSON à l’entérinement est ignoré (200, note NULL), là où le grain version répond 400')]
    public function testF14NonJsonPublishBodyIsSilentlyIgnored(): void
    {
        self::seedCompetence('1.01', 'Pensée Critique', 1);
        $id = $this->adoptedProposal('1.01', '1.1.0', self::newDefinition('x'), [$this->alix, $this->bao]);

        // routes/competences.php ne teste pas le null renvoyé par $parseBody sur
        // /publish (contrairement à /submit, /votes, /release et au grain version).
        $response = $this->rawAs($this->alix, 'POST', '/api/competences/drafts/' . $id . '/publish', 'releaseNote=Note perdue');

        self::assertSame(200, $response->getStatusCode());
        self::assertSame(['published', null], [self::json($response)['status'], self::json($response)['releaseNote']]);
    }

    #[TestDox('UC-EPI-03-F19 — Anomalie AN2 (comportement actuel figé) : après un renommage entériné, POST /api/admin/seed-competences du déploiement suivant échoue (500, gate de parité)')]
    public function testF19SeedCompetencesFailsAfterAnEnterinedRename(): void
    {
        self::seedFullCorpus();
        // Avant tout renommage, le seed du déploiement est idempotent.
        self::assertSame(200, $this->tool('POST', '/api/admin/seed-competences')->getStatusCode());

        // Scénario A4 : renommage entériné (puis release coupée, comme en production).
        $id = $this->adoptedProposal('1.01', '1.1.0', static function (array $content): array {
            $content['identite']['nom'] = 'Pensée critique et vigilance face aux IA';

            return $content;
        }, [$this->alix, $this->bao]);
        self::assertSame(200, $this->publish($this->alix, $id)->getStatusCode());
        self::assertSame(201, $this->release($this->alix, ['semver' => '7.1.0'])->getStatusCode());

        // deploy.mjs rejoue seed-competences à chaque déploiement, APRÈS la
        // bascule de current.txt : le gate compare le corps assemblé (nouveau
        // nom) au contentHash de la 7.0.0 et échoue ; deploy.mjs s'arrête.
        $previousLog = ini_set('error_log', '/dev/null');
        try {
            $seed = $this->tool('POST', '/api/admin/seed-competences');
        } finally {
            ini_set('error_log', (string) $previousLog);
        }
        self::assertSame(500, $seed->getStatusCode(), 'comportement corrigé : inverser ce test et retirer AN2');
        self::assertStringContainsString('Gate de parité ÉCHOUÉ', self::json($seed)['error']);
    }

    #[TestDox('UC-EPI-03-F20 — propagation Twin9 : après entérinement d’une fiche, generate-fiches refuse l’écrasement (409 diff) sans force, puis l’applique avec force')]
    public function testF20GenerateFichesAfterAnEnterinedFiche(): void
    {
        self::seedFullCorpus();
        $settings = new SettingsRepository(self::$pdo);
        $settings->delete(FicheStore::SETTING_KEY);
        // Alignement initial (premier déploiement : FICHES_FORCE=1), puis idempotence.
        self::assertSame(200, $this->tool('POST', '/api/admin/generate-fiches', ['force' => true])->getStatusCode());
        $aligned = $this->tool('POST', '/api/admin/generate-fiches', ['force' => false]);
        self::assertSame([200, 'unchanged', []], [$aligned->getStatusCode(), self::json($aligned)['status'], self::json($aligned)['changed']]);

        $newFiche = "## 1.01 — Pensée Critique\n\n**Essence** — Douter, y compris de soi.\n\n---";
        $id = $this->adoptedProposal('1.01', '1.1.0', static function (array $content) use ($newFiche): array {
            $content['fiche'] = $newFiche;

            return $content;
        }, [$this->alix, $this->bao]);
        self::assertSame(200, $this->publish($this->alix, $id)->getStatusCode());

        // Étape 8 : le déploiement suivant (sans FICHES_FORCE) est arrêté par le garde-fou.
        $guarded = $this->tool('POST', '/api/admin/generate-fiches', ['force' => false]);
        self::assertSame(409, $guarded->getStatusCode());
        self::assertSame(['diff', ['1.01']], [self::json($guarded)['status'], self::json($guarded)['changed']]);
        self::assertNotSame($newFiche, FicheStore::fromSettings($settings)->competenceFiche('1.01'), 'rien n’est écrit sans force');

        // Relance assumée (FICHES_FORCE=1) : la fiche entérinée atteint Twin9.
        $forced = $this->tool('POST', '/api/admin/generate-fiches', ['force' => true]);
        self::assertSame([200, 'applied', ['1.01']], [$forced->getStatusCode(), self::json($forced)['status'], self::json($forced)['changed']]);
        self::assertSame($newFiche, FicheStore::fromSettings($settings)->competenceFiche('1.01'));
    }
}
