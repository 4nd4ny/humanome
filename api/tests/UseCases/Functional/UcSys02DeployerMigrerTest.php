<?php

declare(strict_types=1);

namespace Humanome\Tests\UseCases\Functional;

use Humanome\Db;
use Humanome\Env;
use Humanome\MigrationRunner;
use Humanome\Packages\SettingsRepository;
use Humanome\Tests\AuthTestBase;
use Humanome\Tests\TestDb;
use Humanome\Tests\UseCases\Support\AdmSupport;
use Humanome\Twin9\FicheStore;
use PHPUnit\Framework\Attributes\TestDox;
use Psr\Http\Message\ResponseInterface;

/**
 * UC-SYS-02 — Déployer, migrer et importer : tests FONCTIONNELS (API + CLI).
 *
 * Fiche : docs/cas-utilisation/systeme/UC-SYS-02-deployer-migrer.md
 *
 * L'acteur est l'outil de déploiement (scripts/deploy/deploy.mjs) : requêtes
 * SANS cookie ni CSRF, authentifiées par l'en-tête X-Migrate-Token. La
 * séquence post-upload de `deploy.mjs api` est rejouée dans son ordre réel
 * (migrate → import-referentiel → seed-competences → generate-fiches →
 * import-prompt-package → health) sur une base VIDE, puis rejouée pour prouver
 * l'idempotence. Le front-controller www/api/index.php (pointeur current.txt,
 * rollback) et les scripts CLI sont exécutés dans des sous-processus PHP.
 * Aucun FTP, aucun appel au site de production.
 */
final class UcSys02DeployerMigrerTest extends AuthTestBase
{
    private const TOKEN = 'uc-sys02-migrate-token-0123456789abcdef';
    private const REFERENTIEL = 'schemas/fixtures/referentiel-respire-v7.json';
    private const PACKAGE = 'schemas/fixtures/prompt-package-exemple.json';

    private ?string $tmpDir = null;

    protected function setUp(): void
    {
        parent::setUp();
        TestDb::setEnv('MIGRATE_TOKEN', self::TOKEN);
    }

    protected function tearDown(): void
    {
        if ($this->tmpDir !== null) {
            exec('rm -rf ' . escapeshellarg($this->tmpDir));
        }
        parent::tearDown();
    }

    private static function file(string $relative): string
    {
        return (string) file_get_contents(AdmSupport::repoRoot() . '/' . $relative);
    }

    private function tool(string $method, string $path, ?string $body = null, ?string $token = self::TOKEN): ResponseInterface
    {
        return AdmSupport::toolRequest($method, $path, $token, $body);
    }

    /**
     * La séquence HTTP de `deploy.mjs api` après l'upload FTP. Comme le script
     * (`if (!res.ok) throw …`), elle S'ARRÊTE à la première réponse non 2xx :
     * seules les étapes réellement jouées figurent dans le résultat.
     *
     * @return array<string, ResponseInterface>
     */
    private function deploySequence(bool $forceFiches): array
    {
        $steps = [
            'migrate' => fn (): ResponseInterface => $this->tool('POST', '/admin/migrate'),
            'import-referentiel' => fn (): ResponseInterface => $this->tool('POST', '/admin/import-referentiel', self::file(self::REFERENTIEL)),
            'seed-competences' => fn (): ResponseInterface => $this->tool('POST', '/admin/seed-competences'),
            'generate-fiches' => fn (): ResponseInterface => $this->tool('POST', '/admin/generate-fiches', json_encode(['force' => $forceFiches])),
            'import-prompt-package' => fn (): ResponseInterface => $this->tool('POST', '/admin/import-prompt-package', self::file(self::PACKAGE)),
            'health' => fn (): ResponseInterface => $this->tool('GET', '/health', null, null),
        ];
        $played = [];
        foreach ($steps as $name => $call) {
            $played[$name] = $call();
            $status = $played[$name]->getStatusCode();
            if ($status < 200 || $status >= 300) {
                break; // deploy.mjs lève une exception : la suite n'est pas jouée
            }
        }

        return $played;
    }

    /** Journal d'erreurs PHP détourné vers un fichier jetable (les routes à jeton journalisent leurs échecs). */
    private function quietErrorLog(callable $run): mixed
    {
        $log = (string) tempnam(sys_get_temp_dir(), 'uc-sys02-');
        $previous = ini_set('error_log', $log);
        try {
            return $run();
        } finally {
            ini_set('error_log', $previous === false ? '' : $previous);
            @unlink($log);
        }
    }

    /** Base remise à VIDE (premier déploiement sur un hébergement neuf). */
    private function emptyDatabase(): void
    {
        self::$pdo = TestDb::fresh();
        TestDb::overrideEnv();
    }

    /** @return list<string> */
    private static function migrationFiles(): array
    {
        $files = array_map('basename', glob(MigrationRunner::defaultMigrationsDir() . '/*.sql') ?: []);
        sort($files, SORT_STRING);

        return $files;
    }

    #[TestDox('UC-SYS-02-F01 — nominal : premier déploiement sur base vide, dans l’ordre de deploy.mjs (fiches : refus 409 sans écriture, arrêt, relance complète avec force), smoke health')]
    public function testF01FirstDeploymentOnAnEmptyDatabase(): void
    {
        $this->emptyDatabase();

        $steps = $this->deploySequence(false);

        self::assertSame(200, $steps['migrate']->getStatusCode(), (string) $steps['migrate']->getBody());
        self::assertSame(['applied' => self::migrationFiles(), 'skipped' => 0], AdmSupport::body($steps['migrate']));

        $referentiel = AdmSupport::body($steps['import-referentiel']);
        self::assertSame(['imported', '7.0.0'], [$referentiel['status'], $referentiel['semver']]);

        $seed = AdmSupport::body($steps['seed-competences']);
        self::assertSame(200, $steps['seed-competences']->getStatusCode());
        self::assertSame([7, 61, 61], [$seed['poles'], $seed['imported'], $seed['fiches']]);

        // Garde-fou (E6) : au premier déploiement, twin9_fiches est vide → 409, AUCUNE écriture.
        self::assertSame(409, $steps['generate-fiches']->getStatusCode());
        $diff = AdmSupport::body($steps['generate-fiches']);
        self::assertSame('diff', $diff['status']);
        self::assertCount(61, $diff['changed']);
        self::assertNull((new SettingsRepository(self::$pdo))->get('twin9_fiches'), 'aucune écriture');
        // deploy.mjs s'arrête là : ni import de paquet ni smoke.
        self::assertSame(['migrate', 'import-referentiel', 'seed-competences', 'generate-fiches'], array_keys($steps));

        // Le mainteneur relance TOUTE la séquence avec FICHES_FORCE=1.
        $rerun = $this->deploySequence(true);
        self::assertSame(['migrate', 'import-referentiel', 'seed-competences', 'generate-fiches', 'import-prompt-package', 'health'], array_keys($rerun));
        self::assertSame(['applied' => [], 'skipped' => \count(self::migrationFiles())], AdmSupport::body($rerun['migrate']));
        self::assertSame('unchanged', AdmSupport::body($rerun['import-referentiel'])['status']);
        $forced = AdmSupport::body($rerun['generate-fiches']);
        self::assertSame(['applied', 7, 61], [$forced['status'], $forced['poles'], $forced['competences']]);
        self::assertSame('imported', AdmSupport::body($rerun['import-prompt-package'])['status']);

        self::assertSame(200, $rerun['health']->getStatusCode());
        $health = AdmSupport::body($rerun['health']);
        self::assertSame(['ok', 'ok'], [$health['status'], $health['db']]);
        self::assertStringContainsString('"ok"', (string) $rerun['health']->getBody());

        // Témoin : le critère du smoke de deploy.mjs (200 + « "ok" ») ne détecte
        // PAS une base en panne — /health répond 200 {"status":"ok"} avec db « error ».
        TestDb::setEnv('DB_NAME', 'humanome_absente_sys02');
        Db::reset();
        try {
            $broken = $this->tool('GET', '/health', null, null);
        } finally {
            TestDb::overrideEnv();
        }
        self::assertSame(200, $broken->getStatusCode());
        self::assertStringContainsString('"ok"', (string) $broken->getBody());
        self::assertSame('error', AdmSupport::body($broken)['db']);
    }

    #[TestDox('UC-SYS-02-F02 — A1 : redéployer la même version ne change rien (migrations sautées, imports « unchanged », seed et fiches inchangés)')]
    public function testF02RedeployIsIdempotent(): void
    {
        $this->emptyDatabase();
        $this->deploySequence(true);

        $again = $this->deploySequence(false);

        foreach ($again as $step => $response) {
            self::assertSame(200, $response->getStatusCode(), $step . ' : ' . (string) $response->getBody());
        }
        self::assertSame(['applied' => [], 'skipped' => \count(self::migrationFiles())], AdmSupport::body($again['migrate']));
        self::assertSame('unchanged', AdmSupport::body($again['import-referentiel'])['status']);
        self::assertSame([0, 61], [AdmSupport::body($again['seed-competences'])['imported'], AdmSupport::body($again['seed-competences'])['unchanged']]);
        self::assertSame(['unchanged', []], [AdmSupport::body($again['generate-fiches'])['status'], AdmSupport::body($again['generate-fiches'])['changed']]);
        self::assertSame('unchanged', AdmSupport::body($again['import-prompt-package'])['status']);
    }

    #[TestDox('UC-SYS-02-F03 — A2 : amorçage du premier administrateur par grant-role (sans session), effectif sans reconnexion, audit sans acteur ni e-mail')]
    public function testF03BootstrapTheFirstAdministrator(): void
    {
        self::$pdo->exec('DELETE FROM users');
        self::$pdo->exec('DELETE FROM audit_events');
        $registered = $this->register('fondatrice@example.org', self::PASSWORD, 'Fondatrice');
        self::assertSame(200, $registered->getStatusCode());
        $sid = (string) $this->cookieSid;
        self::assertSame(403, $this->request('GET', '/api/admin/users')->getStatusCode(), 'aucun admin par défaut');

        $grant = $this->tool('POST', '/admin/grant-role', json_encode(['email' => 'fondatrice@example.org', 'role' => 'admin']));
        self::assertSame(200, $grant->getStatusCode());
        self::assertSame(['email' => 'fondatrice@example.org', 'role' => 'admin', 'status' => 'granted'], AdmSupport::body($grant));

        $this->cookieSid = $sid; // même navigateur, même session
        self::assertSame(200, $this->request('GET', '/api/admin/users')->getStatusCode());

        $audit = AdmSupport::lastAudit(self::$pdo, 'role_granted');
        self::assertNull($audit['userId'], 'action système : pas d’acteur');
        $targetId = (int) self::$pdo->query("SELECT id FROM users WHERE email = 'fondatrice@example.org'")->fetchColumn();
        self::assertEquals(['targetUserId' => $targetId, 'role' => 'admin', 'status' => 'granted'], $audit['details']);
        self::assertStringNotContainsString('fondatrice@example.org', $audit['raw']);

        $again = $this->tool('POST', '/admin/grant-role', json_encode(['email' => 'fondatrice@example.org', 'role' => 'admin']));
        self::assertSame('unchanged', AdmSupport::body($again)['status']);
        self::assertSame(2, AdmSupport::countAudit(self::$pdo, 'role_granted'), 'cette route journalise aussi les « unchanged »');
    }

    #[TestDox('UC-SYS-02-F04 — A3 : l’opérateur valide le paquet par défaut ; il est servi aux apprenants ; une proposition différente est conservée, une identique consommée')]
    public function testF04ValidateTheDefaultPromptPackage(): void
    {
        self::$pdo->exec('DELETE FROM prompt_packages');
        self::$pdo->exec('DELETE FROM settings');
        $v1 = json_decode(self::file(self::PACKAGE), true);
        $v2 = ['version' => '2.0.0', 'description' => 'Deuxième version publiée.'] + $v1;
        self::assertSame(200, $this->tool('POST', '/admin/import-prompt-package', json_encode($v1))->getStatusCode());
        self::assertSame(200, $this->tool('POST', '/admin/import-prompt-package', json_encode($v2))->getStatusCode());
        $settings = new SettingsRepository(self::$pdo);
        $settings->set(SettingsRepository::DEFAULT_PACKAGE_PROPOSAL, ['id' => $v1['id'], 'version' => '2.0.0']);

        self::assertSame('2.0.0', AdmSupport::body($this->tool('GET', '/prompt-packages/default', null, null))['version'], 'sans validation : dernier publié');

        $validate = $this->tool('POST', '/admin/default-package', json_encode(['id' => $v1['id'], 'version' => '1.0.0']));
        self::assertSame(200, $validate->getStatusCode());
        self::assertSame(['id' => $v1['id'], 'version' => '1.0.0', 'status' => 'default'], AdmSupport::body($validate));
        self::assertSame(['id' => $v1['id'], 'version' => '1.0.0'], AdmSupport::body($this->tool('GET', '/prompt-packages/default', null, null)));
        self::assertEquals(['id' => $v1['id'], 'version' => '2.0.0'], $settings->get(SettingsRepository::DEFAULT_PACKAGE_PROPOSAL), 'proposition DIFFÉRENTE conservée');

        // Proposition identique à la version validée : consommée.
        $settings->set(SettingsRepository::DEFAULT_PACKAGE_PROPOSAL, ['id' => $v1['id'], 'version' => '1.0.0']);
        self::assertSame(200, $this->tool('POST', '/admin/default-package', json_encode(['id' => $v1['id'], 'version' => '1.0.0']))->getStatusCode());
        self::assertNull($settings->get(SettingsRepository::DEFAULT_PACKAGE_PROPOSAL), 'proposition identique consommée');
    }

    #[TestDox('UC-SYS-02-F05 — A5 : dump-fiches resert le corpus depuis la base (resynchronisation de scripts/data/fiches-v7.json)')]
    public function testF05DumpFichesReturnsTheCorpus(): void
    {
        $this->emptyDatabase();
        $this->deploySequence(true);
        $corpus = json_decode(self::file('scripts/data/fiches-v7.json'), true);

        $dump = $this->tool('GET', '/admin/dump-fiches');

        self::assertSame(200, $dump->getStatusCode());
        self::assertEquals(['poleHeaders' => $corpus['poleHeaders'], 'fiches' => $corpus['fiches']], AdmSupport::body($dump));
    }

    #[TestDox('UC-SYS-02-F06 — E1/E2/E3 : sur les 8 routes, jeton non configuré → 404, absent ou faux → 403, base non configurée → 503')]
    public function testF06TokenAndDatabaseGates(): void
    {
        $routes = [
            ['POST', '/admin/migrate'], ['POST', '/admin/import-referentiel'], ['POST', '/admin/import-prompt-package'],
            ['POST', '/admin/seed-competences'], ['POST', '/admin/generate-fiches'], ['GET', '/admin/dump-fiches'],
            ['POST', '/admin/grant-role'], ['POST', '/admin/default-package'],
        ];
        $originalHost = Env::get('DB_HOST');

        foreach ($routes as [$method, $path]) {
            TestDb::setEnv('MIGRATE_TOKEN', '');
            $absent = $this->tool($method, $path, '{}');
            self::assertSame([404, ['error' => 'Not found']], [$absent->getStatusCode(), AdmSupport::body($absent)], $path);

            TestDb::setEnv('MIGRATE_TOKEN', self::TOKEN);
            self::assertSame(403, $this->tool($method, $path, '{}', null)->getStatusCode(), $path . ' sans en-tête');
            $wrong = $this->tool($method, $path, '{}', 'mauvais-jeton');
            self::assertSame([403, ['error' => 'Forbidden']], [$wrong->getStatusCode(), AdmSupport::body($wrong)], $path);

            TestDb::setEnv('DB_HOST', '');
            $noDb = $this->tool($method, $path, '{}');
            TestDb::setEnv('DB_HOST', $originalHost);
            self::assertSame([503, ['error' => 'Database not configured']], [$noDb->getStatusCode(), AdmSupport::body($noDb)], $path);
        }
    }

    #[TestDox('UC-SYS-02-F07 — E4/E5/E8 : corps illisible 400 (imports) ou 422 (grant-role, default-package), document invalide 422 (+ détails), conflit 409, compte inconnu ou supprimé et version inconnue ou privée 404')]
    public function testF07InvalidPayloads(): void
    {
        self::$pdo->exec('DELETE FROM prompt_packages');
        self::$pdo->exec('DELETE FROM referentiel_versions');

        self::assertSame(400, $this->tool('POST', '/admin/import-referentiel', 'pas du json')->getStatusCode());
        $invalid = $this->tool('POST', '/admin/import-referentiel', '{"kind":"referentiel"}');
        self::assertSame(422, $invalid->getStatusCode());
        self::assertSame('Invalid document', AdmSupport::body($invalid)['error']);
        self::assertNotEmpty(AdmSupport::body($invalid)['details']);
        $tampered = json_decode(self::file(self::REFERENTIEL), true);
        $tampered['competences'][0]['nom'] = 'Nom altéré';
        self::assertSame(409, $this->tool('POST', '/admin/import-referentiel', json_encode($tampered))->getStatusCode(), 'contentHash incohérent');

        self::assertSame(400, $this->tool('POST', '/admin/import-prompt-package', '[')->getStatusCode());
        self::assertSame(422, $this->tool('POST', '/admin/import-prompt-package', '{"id":"x"}')->getStatusCode());
        $package = json_decode(self::file(self::PACKAGE), true);
        self::assertSame(200, $this->tool('POST', '/admin/import-prompt-package', json_encode($package))->getStatusCode());
        $conflict = $this->tool('POST', '/admin/import-prompt-package', json_encode(['description' => 'Réécriture'] + $package));
        self::assertSame(409, $conflict->getStatusCode(), 'version publiée immuable');

        // grant-role et default-package : un corps non JSON donne 422 (et non 400).
        self::assertSame(422, $this->tool('POST', '/admin/grant-role', 'pas du json')->getStatusCode());
        self::assertSame(422, $this->tool('POST', '/admin/default-package', 'pas du json')->getStatusCode());
        self::assertSame(422, $this->tool('POST', '/admin/grant-role', '{"email":"x@example.org"}')->getStatusCode());
        self::assertSame(422, $this->tool('POST', '/admin/grant-role', '{"email":"x@example.org","role":"visiteur"}')->getStatusCode());
        $unknown = $this->tool('POST', '/admin/grant-role', '{"email":"inconnu@example.org","role":"admin"}');
        self::assertSame([404, ['error' => 'Unknown account']], [$unknown->getStatusCode(), AdmSupport::body($unknown)]);
        $gone = AdmSupport::user(self::$pdo, 'parti-sys02@example.org', 'Parti');
        self::$pdo->exec('UPDATE users SET deleted_at = NOW() WHERE id = ' . $gone);
        $deleted = $this->tool('POST', '/admin/grant-role', '{"email":"parti-sys02@example.org","role":"admin"}');
        self::assertSame([404, ['error' => 'Unknown account']], [$deleted->getStatusCode(), AdmSupport::body($deleted)], 'compte supprimé = inconnu');

        self::assertSame(422, $this->tool('POST', '/admin/default-package', '{"id":"aurora-demo"}')->getStatusCode());
        self::assertSame(404, $this->tool('POST', '/admin/default-package', '{"id":"aurora-demo","version":"9.9.9"}')->getStatusCode());
        self::$pdo->exec("UPDATE prompt_packages SET is_private = 1 WHERE slug = 'aurora-demo'");
        $private = $this->tool('POST', '/admin/default-package', json_encode(['id' => 'aurora-demo', 'version' => $package['version']]));
        self::assertSame([404, ['error' => 'Unknown published version']], [$private->getStatusCode(), AdmSupport::body($private)], 'un paquet privé (Golden) ne devient jamais le défaut');
    }

    /**
     * E7 + anomalie AN-2 (COMPORTEMENT ACTUEL figé) : migrate et
     * import-referentiel répondent un 500 générique ; seed-competences et
     * generate-fiches renvoient en revanche le message brut de l'exception
     * (SQLSTATE et nom de base compris) au porteur du jeton.
     */
    #[TestDox('UC-SYS-02-F08 — E7 : base injoignable → 500 générique sur migrate et import ; (AN-2, comportement actuel) seed et generate-fiches divulguent le message SQL')]
    public function testF08FailuresDoNotLeakDetails(): void
    {
        $originalName = Env::get('DB_NAME');
        TestDb::setEnv('DB_NAME', 'humanome_absente_sys02');
        TestDb::overrideEnv();
        TestDb::setEnv('DB_NAME', 'humanome_absente_sys02'); // overrideEnv repose le nom de test
        try {
            [$migrate, $import, $seed, $fiches] = $this->quietErrorLog(fn (): array => [
                $this->tool('POST', '/admin/migrate'),
                $this->tool('POST', '/admin/import-referentiel', self::file(self::REFERENTIEL)),
                $this->tool('POST', '/admin/seed-competences'),
                $this->tool('POST', '/admin/generate-fiches', '{"force":false}'),
            ]);
        } finally {
            TestDb::setEnv('DB_NAME', $originalName);
            TestDb::overrideEnv();
        }

        self::assertSame([500, ['error' => 'Migration failed, see server log']], [$migrate->getStatusCode(), AdmSupport::body($migrate)]);
        self::assertSame([500, ['error' => 'Import failed, see server log']], [$import->getStatusCode(), AdmSupport::body($import)]);
        foreach ([$migrate, $import] as $response) {
            self::assertStringNotContainsString('SQLSTATE', (string) $response->getBody());
            self::assertStringNotContainsString('humanome_absente_sys02', (string) $response->getBody());
        }

        // AN-2 : fuite du message d'exception (à inverser une fois corrigé).
        self::assertSame(500, $seed->getStatusCode());
        self::assertStringStartsWith('Seed failed: SQLSTATE', AdmSupport::body($seed)['error']);
        self::assertStringContainsString('humanome_absente_sys02', AdmSupport::body($seed)['error']);
        self::assertSame(500, $fiches->getStatusCode());
        self::assertStringStartsWith('Generation failed: SQLSTATE', AdmSupport::body($fiches)['error']);
    }

    #[TestDox('UC-SYS-02-F09 — RG2 : navigateur connecté sans jeton CSRF — /admin/migrate passe (exemptée), les autres routes à jeton → 403 CSRF')]
    public function testF09CsrfExemptionIsLimitedToMigrate(): void
    {
        self::$pdo->exec('DELETE FROM users');
        self::assertSame(200, $this->register('mainteneur@example.org', self::PASSWORD, 'Mainteneur')->getStatusCode());

        $headers = ['X-Migrate-Token' => self::TOKEN];
        $migrate = $this->request('POST', '/api/admin/migrate', null, $headers);
        self::assertSame(200, $migrate->getStatusCode(), (string) $migrate->getBody());

        $import = $this->request('POST', '/api/admin/import-prompt-package', json_decode(self::file(self::PACKAGE), true), $headers);
        self::assertSame([403, ['error' => 'Jeton CSRF absent ou invalide']], [$import->getStatusCode(), self::json($import)]);
        self::assertSame(403, $this->request('POST', '/api/admin/grant-role', ['email' => 'mainteneur@example.org', 'role' => 'admin'], $headers)->getStatusCode());
    }

    #[TestDox('UC-SYS-02-F10 — A6/E9 : front-controller www/api — sert la release pointée par current.txt, rollback par réécriture, code HTTP 503 si pointeur invalide ou release absente ; (AN-4) « releases/.. » accepté par le motif')]
    public function testF10FrontControllerAndRollback(): void
    {
        $this->tmpDir = sys_get_temp_dir() . '/uc-sys02-ftp-' . bin2hex(random_bytes(4));
        mkdir($this->tmpDir . '/www/api', 0777, true);
        mkdir($this->tmpDir . '/app/shared', 0777, true);
        copy(AdmSupport::repoRoot() . '/api/deploy/webroot/index.php', $this->tmpDir . '/www/api/index.php');
        foreach (['20260901-120000-v1', '20260928-090000-v2'] as $release) {
            mkdir($this->tmpDir . "/app/releases/{$release}/public", 0777, true);
            file_put_contents(
                $this->tmpDir . "/app/releases/{$release}/public/index.php",
                "<?php echo 'release={$release};shared=' . getenv('HUMANOME_SHARED_DIR');",
            );
        }
        // Lanceur : exécute le front-controller puis écrit le code HTTP posé
        // (http_response_code() reste lisible en CLI) sur la sortie d'erreur.
        file_put_contents(
            $this->tmpDir . '/probe.php',
            "<?php\nregister_shutdown_function(static function (): void { fwrite(STDERR, 'HTTP ' . var_export(http_response_code(), true)); });\nrequire \$argv[1];\n",
        );
        /** @return array{0: string, 1: string} [corps, « HTTP <code> »] */
        $serve = function (?string $pointer): array {
            $file = $this->tmpDir . '/app/current.txt';
            $pointer === null ? @unlink($file) : file_put_contents($file, $pointer);
            $run = AdmSupport::runPhp($this->tmpDir . '/probe.php', [$this->tmpDir . '/www/api/index.php'], AdmSupport::cliEnv(), $this->tmpDir);

            return [$run['stdout'], $run['stderr']];
        };

        [$v2, $v2Code] = $serve("releases/20260928-090000-v2\n");
        self::assertSame('release=20260928-090000-v2;shared=' . $this->tmpDir . '/app/shared', $v2, 'secrets hors webroot');
        self::assertSame('HTTP false', $v2Code, 'aucun code imposé : la release répond elle-même');

        // Rollback = réécrire le pointeur sur la release précédente (aucun transfert).
        self::assertStringStartsWith('release=20260901-120000-v1;', $serve("releases/20260901-120000-v1\n")[0]);

        $noRelease = [json_encode(['status' => 'error', 'message' => 'No release deployed']), 'HTTP 503'];
        self::assertSame($noRelease, $serve(null), 'current.txt absent');
        self::assertSame($noRelease, $serve("\n"), 'pointeur vide');
        self::assertSame($noRelease, $serve('releases/../../shared'), 'traversée multi-segments refusée par le motif');
        self::assertSame($noRelease, $serve('/home/x/app/releases/v1'), 'chemin absolu refusé');
        $missing = [json_encode(['status' => 'error', 'message' => 'Release entry point missing']), 'HTTP 503'];
        self::assertSame($missing, $serve('releases/20250101-000000-purgee'));
        // COMPORTEMENT ACTUEL (anomalie AN-4) : « releases/.. » passe le motif et
        // vise app/public/index.php ; seul son absence le bloque.
        self::assertSame($missing, $serve('releases/..'), 'traversée d’un niveau : acceptée par le motif');
        self::assertSame($missing, $serve('releases/.'));
    }

    #[TestDox('UC-SYS-02-F11 — A7/E10 : équivalents CLI (migrate, import-referentiel, import-prompt-packages, seed-competences) ; base non configurée → code 1')]
    public function testF11CommandLineEquivalents(): void
    {
        $this->emptyDatabase();
        $env = AdmSupport::cliEnv();

        $migrate = AdmSupport::runPhp('scripts/migrate.php', [], $env);
        self::assertSame(0, $migrate['exit'], $migrate['stderr']);
        self::assertStringContainsString('applied: 001_users_roles.sql', $migrate['stdout']);
        self::assertStringContainsString(sprintf('done — %d applied, 0 already up to date.', \count(self::migrationFiles())), $migrate['stdout']);
        self::assertStringContainsString(sprintf('done — 0 applied, %d already up to date.', \count(self::migrationFiles())), AdmSupport::runPhp('scripts/migrate.php', [], $env)['stdout']);

        $referentiel = AdmSupport::runPhp('scripts/import-referentiel.php', [self::REFERENTIEL], $env);
        self::assertSame(0, $referentiel['exit'], $referentiel['stderr']);
        self::assertStringStartsWith('imported referentiel-respire-v7.json as published version 7.0.0 of referentiel "respire"', $referentiel['stdout']);
        self::assertStringStartsWith('already imported', AdmSupport::runPhp('scripts/import-referentiel.php', [self::REFERENTIEL], $env)['stdout']);

        $package = AdmSupport::runPhp('scripts/import-prompt-packages.php', [self::PACKAGE], $env);
        self::assertSame(0, $package['exit'], $package['stderr']);
        self::assertStringStartsWith('imported as published — aurora-demo@', $package['stdout']);

        $seed = AdmSupport::runPhp('scripts/seed-competences.php', [], $env);
        self::assertSame(0, $seed['exit'], $seed['stderr']);
        self::assertStringContainsString('compétences 61 importées', $seed['stdout']);
        self::assertStringContainsString('seed terminé.', $seed['stdout']);

        $noDb = AdmSupport::runPhp('scripts/migrate.php', [], AdmSupport::cliEnv(['DB_HOST' => '']));
        self::assertSame(1, $noDb['exit']);
        self::assertStringContainsString('DB_HOST is not set', $noDb['stderr']);
        $missing = AdmSupport::runPhp('scripts/import-referentiel.php', ['/nulle/part.json'], $env);
        self::assertSame(1, $missing['exit']);
        self::assertStringContainsString('referentiel file not found', $missing['stderr']);
        $missingPackage = AdmSupport::runPhp('scripts/import-prompt-packages.php', ['/nulle/part.json'], $env);
        self::assertSame(1, $missingPackage['exit']);
        self::assertStringContainsString('package file not found', $missingPackage['stderr']);
    }

    #[TestDox('UC-SYS-02-F12 — E6 : fiche modifiée en production (twin9_fiches ≠ base) → 409 {changed: [code]} sans force, réglage relu strictement inchangé')]
    public function testF12FicheDivergenceIsRefusedWithoutWriting(): void
    {
        $this->emptyDatabase();
        $this->deploySequence(true);
        $settings = new SettingsRepository(self::$pdo);
        $stored = $settings->get('twin9_fiches');
        $code = (string) $stored['poles'][0]['competences'][0]['code'];
        $stored['poles'][0]['competences'][0]['fiche_md'] .= "\n(retouche faite en production)";
        $settings->set('twin9_fiches', $stored);

        $response = $this->tool('POST', '/admin/generate-fiches', json_encode(['force' => false]));

        self::assertSame(409, $response->getStatusCode());
        $body = AdmSupport::body($response);
        self::assertSame(['diff', [$code]], [$body['status'], $body['changed']]);
        self::assertEquals($stored, $settings->get('twin9_fiches'), 'aucune écriture');
        // Un « force » non booléen vaut force:false (E4).
        self::assertSame(409, $this->tool('POST', '/admin/generate-fiches', '{"force":1}')->getStatusCode());
    }

    /**
     * COMPORTEMENT ACTUEL figé — anomalie AN-1 : le garde-fou ne compare que le
     * fiche_md des compétences GÉNÉRÉES. Un en-tête de pôle modifié ou un code
     * disparu de la génération (version publiée sans `fiche`) n'est pas vu, et
     * FicheStore::store réécrit le réglage à chaque réponse 200 : écrasement
     * silencieux sous un « unchanged ». À inverser (409) une fois corrigé.
     */
    #[TestDox('UC-SYS-02-F13 — (anomalie AN-1, comportement actuel) en-tête de pôle modifié ou fiche disparue de la génération → 200 « unchanged » et réglage twin9_fiches réécrit en silence')]
    public function testF13GuardMissesHeadersAndVanishedCodesCurrentBehaviour(): void
    {
        $this->emptyDatabase();
        $this->deploySequence(true);
        $settings = new SettingsRepository(self::$pdo);

        // (a) En-tête de pôle retouché en production.
        $stored = $settings->get('twin9_fiches');
        $stored['poles'][0]['header'] = 'EN-TÊTE PROD';
        $settings->set('twin9_fiches', $stored);
        $a = $this->tool('POST', '/admin/generate-fiches', json_encode(['force' => false]));
        self::assertSame(200, $a->getStatusCode());
        self::assertSame(['unchanged', []], [AdmSupport::body($a)['status'], AdmSupport::body($a)['changed']]);
        self::assertStringNotContainsString('EN-TÊTE PROD', (string) FicheStore::fromSettings($settings)->poleFiches(1), 'en-tête écrasé');

        // (b) Une version 1.1.0 publiée SANS fiche fait disparaître le code de la génération.
        $code = (string) $stored['poles'][0]['competences'][0]['code'];
        self::assertNotNull(FicheStore::fromSettings($settings)->competenceFiche($code));
        self::$pdo->prepare(
            "INSERT INTO competence_versions (competence_code, semver, pole, nom, status, content, content_hash, published_at)
             SELECT competence_code, '1.1.0', pole, nom, 'published', JSON_REMOVE(content, '$.fiche'), REPEAT('f', 64), NOW()
               FROM competence_versions WHERE competence_code = ? AND semver = '1.0.0'"
        )->execute([$code]);
        $b = $this->tool('POST', '/admin/generate-fiches', json_encode(['force' => false]));
        self::assertSame(200, $b->getStatusCode());
        self::assertSame('unchanged', AdmSupport::body($b)['status']);
        self::assertSame(60, AdmSupport::body($b)['competences']);
        self::assertNull(FicheStore::fromSettings($settings)->competenceFiche($code), 'fiche supprimée en silence');
    }

    #[TestDox('UC-SYS-02-F14 — E11 : seed avant tout référentiel publié → 500 « Seed failed: Aucune version publiée du référentiel… » (deploy.mjs s’arrête) ; étape 5 : 7.1.0 seule publiée → structure de référence, seed 200 (même empreinte)')]
    public function testF14SeedWithoutAPublishedReferentiel(): void
    {
        $this->emptyDatabase();
        self::assertSame(200, $this->tool('POST', '/admin/migrate')->getStatusCode());

        $seed = $this->quietErrorLog(fn (): ResponseInterface => $this->tool('POST', '/admin/seed-competences'));

        self::assertSame(500, $seed->getStatusCode());
        self::assertStringStartsWith('Seed failed: Aucune version publiée du référentiel', AdmSupport::body($seed)['error']);
        self::assertSame(0, (int) self::$pdo->query('SELECT COUNT(*) FROM competence_versions')->fetchColumn());

        // Étape 5 : seul respire-v7.1.0.json présent sur le poste (7.0.0 sautée).
        // La 7.1.0 (même structure + définitions, hors empreinte) est publiée
        // seule, sert de structure de référence et le seed réussit.
        $v71 = json_decode(self::file(self::REFERENTIEL), true);
        $v71['version'] = '7.1.0';
        foreach ($v71['competences'] as &$competence) {
            $competence['description'] = 'Définition de test de ' . $competence['code'] . '.';
        }
        unset($competence);
        $import = $this->tool('POST', '/admin/import-referentiel', (string) json_encode($v71));
        self::assertSame(200, $import->getStatusCode());
        self::assertSame(['imported', '7.1.0', $v71['contentHash']], [AdmSupport::body($import)['status'], AdmSupport::body($import)['semver'], AdmSupport::body($import)['contentHash']], 'même empreinte structurelle que la 7.0.0');
        $seeded = $this->tool('POST', '/admin/seed-competences');
        self::assertSame(200, $seeded->getStatusCode(), (string) $seeded->getBody());
        self::assertSame([7, 61, $v71['contentHash']], [AdmSupport::body($seeded)['poles'], AdmSupport::body($seeded)['imported'], AdmSupport::body($seeded)['parityHash']]);
    }

    // --- Scripts CLI : branches propres (sous-processus) ---------------------

    /** Base VIDE puis migrée par le CLI, comme un poste de développement neuf. */
    private function migratedEmptyDatabase(): void
    {
        $this->emptyDatabase();
        $migrate = AdmSupport::runPhp('scripts/migrate.php', [], AdmSupport::cliEnv());
        self::assertSame(0, $migrate['exit'], $migrate['stderr']);
    }

    private function scratchDir(): string
    {
        if ($this->tmpDir === null) {
            $this->tmpDir = sys_get_temp_dir() . '/uc-sys02-cli-' . bin2hex(random_bytes(4));
            mkdir($this->tmpDir, 0777, true);
        }

        return $this->tmpDir;
    }

    /**
     * Disposition jetable pour un script CLI : <racine>/scripts/<script> est une
     * copie octet à octet du script du dépôt — son `$root = dirname(__DIR__)`
     * vaut alors <racine> — et, si demandé, <racine>/api/vendor/autoload.php
     * délègue à l'autoload réel. Exerce les branches qui dépendent de fichiers
     * relatifs à la racine (build/prompt-packages, scripts/data) sans jamais
     * écrire dans le dépôt.
     */
    private function scriptLayout(string $script, bool $withAutoload = true): string
    {
        $root = $this->scratchDir() . '/layout-' . bin2hex(random_bytes(3));
        mkdir($root . '/scripts', 0777, true);
        copy(AdmSupport::repoRoot() . '/scripts/' . $script, $root . '/scripts/' . $script);
        self::assertFileEquals(AdmSupport::repoRoot() . '/scripts/' . $script, $root . '/scripts/' . $script);
        if ($withAutoload) {
            mkdir($root . '/api/vendor', 0777, true);
            file_put_contents(
                $root . '/api/vendor/autoload.php',
                "<?php\nreturn require " . var_export(AdmSupport::repoRoot() . '/api/vendor/autoload.php', true) . ";\n",
            );
        }

        return $root;
    }

    /** @return list<array{semver: string, status: string, hash: string}> versions stockées du paquet */
    private static function storedPackageVersions(string $slug): array
    {
        $stmt = self::$pdo->prepare(
            'SELECT pv.semver, pv.status, pv.content FROM prompt_versions pv
               JOIN prompt_packages pp ON pp.id = pv.package_id
              WHERE pp.slug = ? ORDER BY pv.semver'
        );
        $stmt->execute([$slug]);

        return array_map(static fn (array $row): array => [
            'semver' => (string) $row['semver'],
            'status' => (string) $row['status'],
            'hash' => \Humanome\Packages\PromptPackageRepository::contentHash(json_decode((string) $row['content'], true)),
        ], $stmt->fetchAll());
    }

    #[TestDox('UC-SYS-02-F15 — A1/A7/E5/E10 : CLI import-prompt-packages.php — relance sans changement → code 0 « already imported » ; document invalide ou tableau JSON (refus du schéma), JSON illisible ou scalaire (« Import failed »), conflit de version immuable → code 1, les fichiers suivants restent traités ; sans base → code 1')]
    public function testF15PromptPackageCliBranches(): void
    {
        $this->migratedEmptyDatabase();
        $env = AdmSupport::cliEnv();
        $dir = $this->scratchDir();
        $package = json_decode(self::file(self::PACKAGE), true);

        // Nominal puis relance à l'identique (A1) : code 0, aucune écriture.
        $first = AdmSupport::runPhp('scripts/import-prompt-packages.php', [self::PACKAGE], $env);
        self::assertSame(0, $first['exit'], $first['stderr']);
        $stored = self::storedPackageVersions('aurora-demo');
        self::assertSame([['semver' => '1.0.0', 'status' => 'published', 'hash' => $stored[0]['hash']]], $stored);
        $short = substr($stored[0]['hash'], 0, 12);
        self::assertSame("imported as published — aurora-demo@1.0.0 (hash {$short})\n", $first['stdout']);
        $again = AdmSupport::runPhp('scripts/import-prompt-packages.php', [self::PACKAGE], $env);
        self::assertSame([0, "already imported — aurora-demo@1.0.0 (hash {$short}), nothing to do\n", ''], [$again['exit'], $again['stdout'], $again['stderr']]);
        self::assertSame($stored, self::storedPackageVersions('aurora-demo'), 'relance sans effet');

        // Document non conforme au schéma (E4) : code 1, pointeurs d'erreur sur stderr.
        file_put_contents($dir . '/incomplet.json', '{"id":"aurora-demo"}');
        $invalid = AdmSupport::runPhp('scripts/import-prompt-packages.php', [$dir . '/incomplet.json'], $env);
        self::assertSame([1, ''], [$invalid['exit'], $invalid['stdout']]);
        self::assertMatchesRegularExpression('/^Invalid prompt-package document incomplet\.json:\n(  \S*: .+\n)+$/u', $invalid['stderr']);

        // Tableau JSON : décodé en tableau PHP, il passe la garde « non objet »
        // et c'est le SCHÉMA qui le refuse (pointeur racine « / »).
        file_put_contents($dir . '/liste.json', '[1,2]');
        $list = AdmSupport::runPhp('scripts/import-prompt-packages.php', [$dir . '/liste.json'], $env);
        self::assertSame(
            [1, '', "Invalid prompt-package document liste.json:\n  /: The data (array) must match the type: object\n"],
            [$list['exit'], $list['stdout'], $list['stderr']],
        );

        // JSON illisible ou valeur scalaire : code 1, « Import failed for … ».
        file_put_contents($dir . '/casse.json', '{"id": ');
        file_put_contents($dir . '/scalaire.json', '42');
        $broken = AdmSupport::runPhp('scripts/import-prompt-packages.php', [$dir . '/casse.json', $dir . '/scalaire.json'], $env);
        self::assertSame(1, $broken['exit']);
        self::assertSame(
            "Import failed for casse.json: Syntax error\nImport failed for scalaire.json: Top-level JSON value is not an object\n",
            $broken['stderr'],
        );

        // Conflit d'immuabilité (E5) : même (id, version), autre contenu → code 1,
        // version publiée intacte ; le fichier SUIVANT est tout de même importé.
        file_put_contents($dir . '/reecrit.json', json_encode(['description' => 'Réécriture interdite'] + $package));
        file_put_contents($dir . '/v2.json', json_encode(['version' => '2.0.0', 'description' => 'Deuxième version.'] + $package));
        $conflict = AdmSupport::runPhp('scripts/import-prompt-packages.php', [$dir . '/reecrit.json', $dir . '/v2.json'], $env);
        self::assertSame(1, $conflict['exit'], 'un échec suffit à rendre le code 1');
        self::assertSame(
            'Conflict on reecrit.json: Version 1.0.0 of prompt package "aurora-demo" already exists with a different content or status "published" (published versions are immutable)' . "\n",
            $conflict['stderr'],
        );
        self::assertStringStartsWith('imported as published — aurora-demo@2.0.0 (hash ', $conflict['stdout']);
        $versions = self::storedPackageVersions('aurora-demo');
        self::assertSame(['1.0.0', '2.0.0'], array_column($versions, 'semver'));
        self::assertSame($stored[0]['hash'], $versions[0]['hash'], '1.0.0 non réécrite');

        // Sans base (E10) : code 1, rien sur stdout ; vérifiée APRÈS la liste des fichiers.
        $noDb = AdmSupport::runPhp('scripts/import-prompt-packages.php', [self::PACKAGE], AdmSupport::cliEnv(['DB_HOST' => '']));
        self::assertSame(
            [1, '', "Error: DB_HOST is not set (expected DB_HOST/DB_NAME/DB_USER/DB_PASSWORD in env).\n"],
            [$noDb['exit'], $noDb['stdout'], $noDb['stderr']],
        );
    }

    #[TestDox('UC-SYS-02-F16 — A7/E10 : CLI import-prompt-packages.php sans argument — entrée par défaut build/prompt-packages/*.json (absente ou sans .json → code 1 avant tout accès base ; présente → chaque .json importé dans l’ordre des noms, relance « already imported ») ; autoload absent → code 1')]
    public function testF16PromptPackageCliDefaultInput(): void
    {
        $this->migratedEmptyDatabase();
        $env = AdmSupport::cliEnv();
        $root = $this->scriptLayout('import-prompt-packages.php');
        $script = $root . '/scripts/import-prompt-packages.php';
        $none = "Error: no package file found in build/prompt-packages/.\nGenerate the default package with: node scripts/build-default-prompt-package.mjs\n";

        // Dossier absent — même sans base : le contrôle des entrées passe avant.
        $absent = AdmSupport::runPhp($script, [], AdmSupport::cliEnv(['DB_HOST' => '']), $root);
        self::assertSame([1, '', $none], [$absent['exit'], $absent['stdout'], $absent['stderr']]);

        // Dossier présent mais sans fichier .json.
        mkdir($root . '/build/prompt-packages', 0777, true);
        file_put_contents($root . '/build/prompt-packages/LISEZMOI.txt', 'généré par build-default-prompt-package.mjs');
        $empty = AdmSupport::runPhp($script, [], $env, $root);
        self::assertSame([1, $none], [$empty['exit'], $empty['stderr']]);
        self::assertSame([], self::storedPackageVersions('aurora-demo'));

        // Paquets présents : tous importés, ordre alphabétique des noms de fichier.
        $package = json_decode(self::file(self::PACKAGE), true);
        file_put_contents($root . '/build/prompt-packages/b-aurora-2.0.0.json', json_encode(['version' => '2.0.0', 'description' => 'Deuxième version.'] + $package));
        file_put_contents($root . '/build/prompt-packages/a-aurora-1.0.0.json', json_encode($package));
        $run = AdmSupport::runPhp($script, [], $env, $root);
        self::assertSame(0, $run['exit'], $run['stderr']);
        $versions = self::storedPackageVersions('aurora-demo');
        self::assertSame([['1.0.0', 'published'], ['2.0.0', 'published']], array_map(static fn (array $v): array => [$v['semver'], $v['status']], $versions));
        self::assertSame(sprintf(
            "imported as published — aurora-demo@1.0.0 (hash %s)\nimported as published — aurora-demo@2.0.0 (hash %s)\n",
            substr($versions[0]['hash'], 0, 12),
            substr($versions[1]['hash'], 0, 12),
        ), $run['stdout']);

        $again = AdmSupport::runPhp($script, [], $env, $root);
        self::assertSame(0, $again['exit']);
        self::assertSame(2, substr_count($again['stdout'], ', nothing to do'));

        // Dépendances non installées : code 1, message explicite.
        $bare = $this->scriptLayout('import-prompt-packages.php', false);
        $noAutoload = AdmSupport::runPhp($bare . '/scripts/import-prompt-packages.php', [], $env, $bare);
        self::assertSame(
            [1, '', "Error: composer autoload not found — run: docker compose run --rm php composer install\n"],
            [$noAutoload['exit'], $noAutoload['stdout'], $noAutoload['stderr']],
        );
    }

    #[TestDox('UC-SYS-02-F17 — A1/A7/E10/E11 : CLI seed-competences.php — sans base → code 1 ; référentiel non publié → code 1 ; nominal 7/61 puis relance idempotente (code 0, 61 inchangées) ; porte de parité en échec → code 1 sans sortie standard')]
    public function testF17CompetenceSeedCliBranches(): void
    {
        $this->migratedEmptyDatabase();
        $env = AdmSupport::cliEnv();

        $noDb = AdmSupport::runPhp('scripts/seed-competences.php', [], AdmSupport::cliEnv(['DB_HOST' => '']));
        self::assertSame(
            [1, '', "Error: DB not configured (DB_HOST/DB_NAME/DB_USER/DB_PASSWORD)\n"],
            [$noDb['exit'], $noDb['stdout'], $noDb['stderr']],
        );

        $noReferentiel = AdmSupport::runPhp('scripts/seed-competences.php', [], $env);
        self::assertSame(
            [1, '', "Seed échoué : Aucune version publiée du référentiel — importer respire-v7 d'abord.\n"],
            [$noReferentiel['exit'], $noReferentiel['stdout'], $noReferentiel['stderr']],
        );
        self::assertSame(0, (int) self::$pdo->query('SELECT COUNT(*) FROM competence_versions')->fetchColumn());

        self::assertSame(0, AdmSupport::runPhp('scripts/import-referentiel.php', [self::REFERENTIEL], $env)['exit']);
        $published = (string) self::$pdo->query("SELECT content_hash FROM referentiel_versions WHERE semver = '7.0.0'")->fetchColumn();
        $short = substr($published, 0, 12);

        $first = AdmSupport::runPhp('scripts/seed-competences.php', [], $env);
        self::assertSame(0, $first['exit'], $first['stderr']);
        self::assertSame(
            "pôles 7 · compétences 61 importées / 0 inchangées / 0 backfillées · fiches 61 · gate parité OK ({$short}…) · lockfile 61 liens\nseed terminé.\n",
            $first['stdout'],
        );

        // Relance (A1) : sans effet, même empreinte de parité, aucune ligne en plus.
        $again = AdmSupport::runPhp('scripts/seed-competences.php', [], $env);
        self::assertSame(
            [0, "pôles 7 · compétences 0 importées / 61 inchangées / 0 backfillées · fiches 61 · gate parité OK ({$short}…) · lockfile 61 liens\nseed terminé.\n", ''],
            [$again['exit'], $again['stdout'], $again['stderr']],
        );
        self::assertSame(61, (int) self::$pdo->query('SELECT COUNT(*) FROM competence_versions')->fetchColumn());
        self::assertSame(61, (int) self::$pdo->query('SELECT COUNT(*) FROM referentiel_snapshot_competences')->fetchColumn());

        // Porte de parité (RG5, E11) : un nom structurel divergent en base → code 1.
        $code = (string) self::$pdo->query("SELECT competence_code FROM competence_versions ORDER BY competence_code LIMIT 1")->fetchColumn();
        $nom = (string) self::$pdo->query("SELECT nom FROM competence_versions WHERE competence_code = '{$code}'")->fetchColumn();
        self::$pdo->prepare("UPDATE competence_versions SET nom = 'Nom divergent' WHERE competence_code = ?")->execute([$code]);
        try {
            $gate = AdmSupport::runPhp('scripts/seed-competences.php', [], $env);
        } finally {
            self::$pdo->prepare('UPDATE competence_versions SET nom = ? WHERE competence_code = ?')->execute([$nom, $code]);
        }
        self::assertSame([1, ''], [$gate['exit'], $gate['stdout']]);
        self::assertMatchesRegularExpression(
            '/^Seed échoué : Gate de parité ÉCHOUÉ : corps assemblé ([0-9a-f]{64}) ≠ publié ' . $published . ' \(nom\/pôle structurel divergent\)\.\n$/u',
            $gate['stderr'],
        );
        self::assertSame(0, AdmSupport::runPhp('scripts/seed-competences.php', [], $env)['exit'], 'nom rétabli : la porte s’ouvre');
    }

    /**
     * Branches dépendant du corpus relatif au script (scripts/data), jouées
     * dans une disposition jetable. COMPORTEMENT ACTUEL figé — anomalie AN-6 :
     * sans fiches-v7.json (facultatif), le seed d'une base déjà amorcée
     * « backfille » les 61 versions 1.0.0 SANS leur fiche et remet les en-têtes
     * de pôle à NULL (code 0) : la source unique des fiches est effacée, et le
     * garde-fou de generate-fiches (AN-1) laisse ensuite vider twin9_fiches.
     */
    #[TestDox('UC-SYS-02-F18 — E11 : CLI seed-competences.php — autoload absent → code 1 ; competences-v7.json absent → code 1 ; (AN-6, comportement actuel) fiches-v7.json absent → code 0 mais 61 fiches et 7 en-têtes effacés de la base, puis generate-fiches « unchanged » vide twin9_fiches (AN-1) ; un seed complet rétablit la base')]
    public function testF18CompetenceSeedCliCorpusBranches(): void
    {
        $this->migratedEmptyDatabase();
        $env = AdmSupport::cliEnv();
        self::assertSame(0, AdmSupport::runPhp('scripts/import-referentiel.php', [self::REFERENTIEL], $env)['exit']);
        self::assertSame(0, AdmSupport::runPhp('scripts/seed-competences.php', [], $env)['exit']);
        $withFiche = "SELECT COUNT(*) FROM competence_versions WHERE semver = '1.0.0' AND JSON_CONTAINS_PATH(content, 'one', '$.fiche')";
        $withHeader = 'SELECT COUNT(*) FROM referentiel_poles WHERE header IS NOT NULL';
        self::assertSame([61, 7], [(int) self::$pdo->query($withFiche)->fetchColumn(), (int) self::$pdo->query($withHeader)->fetchColumn()]);

        $bare = $this->scriptLayout('seed-competences.php', false);
        $noAutoload = AdmSupport::runPhp($bare . '/scripts/seed-competences.php', [], $env, $bare);
        self::assertSame(
            [1, '', "Error: composer autoload not found — run composer install\n"],
            [$noAutoload['exit'], $noAutoload['stdout'], $noAutoload['stderr']],
        );

        $root = $this->scriptLayout('seed-competences.php');
        $script = $root . '/scripts/seed-competences.php';
        $noCorpus = AdmSupport::runPhp($script, [], $env, $root);
        self::assertSame(
            [1, '', "Error: {$root}/scripts/data/competences-v7.json introuvable (régénérer depuis les YAML)\n"],
            [$noCorpus['exit'], $noCorpus['stdout'], $noCorpus['stderr']],
        );

        // Réglage twin9_fiches en place (étape 7 d'un déploiement précédent).
        self::assertSame(200, $this->tool('POST', '/admin/generate-fiches', json_encode(['force' => true]))->getStatusCode());
        $settings = new SettingsRepository(self::$pdo);
        $code = (string) self::$pdo->query('SELECT competence_code FROM competence_versions ORDER BY competence_code LIMIT 1')->fetchColumn();
        self::assertNotNull(FicheStore::fromSettings($settings)->competenceFiche($code));

        // Corpus riche seul, sans fiches-v7.json.
        mkdir($root . '/scripts/data', 0777, true);
        copy(AdmSupport::repoRoot() . '/scripts/data/competences-v7.json', $root . '/scripts/data/competences-v7.json');
        $noFiches = AdmSupport::runPhp($script, [], $env, $root);
        self::assertSame(0, $noFiches['exit'], $noFiches['stderr']);
        self::assertStringContainsString('compétences 0 importées / 0 inchangées / 61 backfillées · fiches 0 · gate parité OK', $noFiches['stdout']);
        self::assertSame(
            [0, 0],
            [(int) self::$pdo->query($withFiche)->fetchColumn(), (int) self::$pdo->query($withHeader)->fetchColumn()],
            'fiches et en-têtes effacés sans alerte (AN-6)',
        );
        // Enchaînement avec AN-1 : le garde-fou ne voit rien et vide le réglage.
        $guard = $this->tool('POST', '/admin/generate-fiches', json_encode(['force' => false]));
        self::assertSame(200, $guard->getStatusCode());
        self::assertSame(['unchanged', 0, []], [AdmSupport::body($guard)['status'], AdmSupport::body($guard)['competences'], AdmSupport::body($guard)['changed']]);
        self::assertNull(FicheStore::fromSettings($settings)->competenceFiche($code), 'twin9_fiches vidé sous un « unchanged »');

        // Un seed avec le corpus complet (dépôt) rétablit tout.
        $restore = AdmSupport::runPhp('scripts/seed-competences.php', [], $env);
        self::assertStringContainsString('compétences 0 importées / 0 inchangées / 61 backfillées · fiches 61', $restore['stdout']);
        self::assertSame([61, 7], [(int) self::$pdo->query($withFiche)->fetchColumn(), (int) self::$pdo->query($withHeader)->fetchColumn()]);
    }
}
