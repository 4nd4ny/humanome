<?php

declare(strict_types=1);

namespace Humanome\Tests\UseCases\Functional;

use Humanome\Env;
use Humanome\MigrationRunner;
use Humanome\Packages\SettingsRepository;
use Humanome\Tests\AuthTestBase;
use Humanome\Tests\TestDb;
use Humanome\Tests\UseCases\Support\AdmSupport;
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

    /** La séquence HTTP de `deploy.mjs api` après l'upload FTP. */
    private function deploySequence(bool $forceFiches): array
    {
        return [
            'migrate' => $this->tool('POST', '/admin/migrate'),
            'import-referentiel' => $this->tool('POST', '/admin/import-referentiel', self::file(self::REFERENTIEL)),
            'seed-competences' => $this->tool('POST', '/admin/seed-competences'),
            'generate-fiches' => $this->tool('POST', '/admin/generate-fiches', json_encode(['force' => $forceFiches])),
            'import-prompt-package' => $this->tool('POST', '/admin/import-prompt-package', self::file(self::PACKAGE)),
            'health' => $this->tool('GET', '/health', null, null),
        ];
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

    #[TestDox('UC-SYS-02-F01 — nominal : premier déploiement sur base vide, dans l’ordre de deploy.mjs (fiches : refus 409 puis force), smoke health')]
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

        // Garde-fou : au premier déploiement, twin9_fiches est vide → 409, AUCUNE écriture.
        self::assertSame(409, $steps['generate-fiches']->getStatusCode());
        $diff = AdmSupport::body($steps['generate-fiches']);
        self::assertSame('diff', $diff['status']);
        self::assertCount(61, $diff['changed']);
        // deploy.mjs s'arrête là ; le mainteneur relance avec FICHES_FORCE=1.
        $forced = $this->tool('POST', '/admin/generate-fiches', json_encode(['force' => true]));
        self::assertSame(200, $forced->getStatusCode());
        self::assertSame(['applied', 7, 61], [AdmSupport::body($forced)['status'], AdmSupport::body($forced)['poles'], AdmSupport::body($forced)['competences']]);

        self::assertSame('imported', AdmSupport::body($steps['import-prompt-package'])['status']);

        self::assertSame(200, $steps['health']->getStatusCode());
        $health = AdmSupport::body($steps['health']);
        self::assertSame(['ok', 'ok'], [$health['status'], $health['db']]);
        self::assertStringContainsString('"ok"', (string) $steps['health']->getBody(), 'critère du smoke de deploy.mjs');
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
        self::assertSame(['role' => 'admin', 'status' => 'granted'], array_intersect_key($audit['details'], ['role' => 1, 'status' => 1]));
        self::assertStringNotContainsString('fondatrice@example.org', $audit['raw']);

        $again = $this->tool('POST', '/admin/grant-role', json_encode(['email' => 'fondatrice@example.org', 'role' => 'admin']));
        self::assertSame('unchanged', AdmSupport::body($again)['status']);
        self::assertSame(2, AdmSupport::countAudit(self::$pdo, 'role_granted'), 'cette route journalise aussi les « unchanged »');
    }

    #[TestDox('UC-SYS-02-F04 — A3 : l’opérateur valide le paquet par défaut ; il est servi aux apprenants et consomme la proposition correspondante')]
    public function testF04ValidateTheDefaultPromptPackage(): void
    {
        self::$pdo->exec('DELETE FROM prompt_packages');
        self::$pdo->exec('DELETE FROM settings');
        $v1 = json_decode(self::file(self::PACKAGE), true);
        $v2 = ['version' => '2.0.0', 'description' => 'Deuxième version publiée.'] + $v1;
        self::assertSame(200, $this->tool('POST', '/admin/import-prompt-package', json_encode($v1))->getStatusCode());
        self::assertSame(200, $this->tool('POST', '/admin/import-prompt-package', json_encode($v2))->getStatusCode());
        (new SettingsRepository(self::$pdo))->set(SettingsRepository::DEFAULT_PACKAGE_PROPOSAL, ['id' => $v1['id'], 'version' => '1.0.0']);

        self::assertSame('2.0.0', AdmSupport::body($this->tool('GET', '/prompt-packages/default', null, null))['version'], 'sans validation : dernier publié');

        $validate = $this->tool('POST', '/admin/default-package', json_encode(['id' => $v1['id'], 'version' => '1.0.0']));
        self::assertSame(200, $validate->getStatusCode());
        self::assertSame(['id' => $v1['id'], 'version' => '1.0.0', 'status' => 'default'], AdmSupport::body($validate));

        self::assertSame(['id' => $v1['id'], 'version' => '1.0.0'], AdmSupport::body($this->tool('GET', '/prompt-packages/default', null, null)));
        self::assertNull((new SettingsRepository(self::$pdo))->get(SettingsRepository::DEFAULT_PACKAGE_PROPOSAL), 'proposition consommée');
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

    #[TestDox('UC-SYS-02-F07 — E4/E5/E8 : corps illisible 400, document invalide 422 (+ détails), conflit 409, compte ou version inconnus 404')]
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

        self::assertSame(422, $this->tool('POST', '/admin/grant-role', '{"email":"x@example.org"}')->getStatusCode());
        self::assertSame(422, $this->tool('POST', '/admin/grant-role', '{"email":"x@example.org","role":"visiteur"}')->getStatusCode());
        $unknown = $this->tool('POST', '/admin/grant-role', '{"email":"inconnu@example.org","role":"admin"}');
        self::assertSame([404, ['error' => 'Unknown account']], [$unknown->getStatusCode(), AdmSupport::body($unknown)]);

        self::assertSame(422, $this->tool('POST', '/admin/default-package', '{"id":"aurora-demo"}')->getStatusCode());
        self::assertSame(404, $this->tool('POST', '/admin/default-package', '{"id":"aurora-demo","version":"9.9.9"}')->getStatusCode());
        self::$pdo->exec("UPDATE prompt_packages SET is_private = 1 WHERE slug = 'aurora-demo'");
        $private = $this->tool('POST', '/admin/default-package', json_encode(['id' => 'aurora-demo', 'version' => $package['version']]));
        self::assertSame([404, ['error' => 'Unknown published version']], [$private->getStatusCode(), AdmSupport::body($private)], 'un paquet privé (Golden) ne devient jamais le défaut');
    }

    #[TestDox('UC-SYS-02-F08 — E7 : base injoignable pendant la migration ou l’import → 500 générique, aucun détail SQL divulgué')]
    public function testF08FailuresDoNotLeakDetails(): void
    {
        $originalName = Env::get('DB_NAME');
        TestDb::setEnv('DB_NAME', 'humanome_absente_sys02');
        TestDb::overrideEnv();
        TestDb::setEnv('DB_NAME', 'humanome_absente_sys02'); // overrideEnv repose le nom de test
        try {
            $migrate = $this->tool('POST', '/admin/migrate');
            $import = $this->tool('POST', '/admin/import-referentiel', self::file(self::REFERENTIEL));
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

    #[TestDox('UC-SYS-02-F10 — A6/E9 : front-controller www/api — sert la release pointée par current.txt, rollback par réécriture, 503 si pointeur invalide ou release absente')]
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
        $serve = function (?string $pointer): string {
            $file = $this->tmpDir . '/app/current.txt';
            $pointer === null ? @unlink($file) : file_put_contents($file, $pointer);
            $run = AdmSupport::runPhp($this->tmpDir . '/www/api/index.php', [], AdmSupport::cliEnv(), $this->tmpDir);

            return $run['stdout'];
        };

        $v2 = $serve("releases/20260928-090000-v2\n");
        self::assertSame('release=20260928-090000-v2;shared=' . $this->tmpDir . '/app/shared', $v2, 'secrets hors webroot');

        // Rollback = réécrire le pointeur sur la release précédente (aucun transfert).
        self::assertStringStartsWith('release=20260901-120000-v1;', $serve("releases/20260901-120000-v1\n"));

        $noRelease = json_encode(['status' => 'error', 'message' => 'No release deployed']);
        self::assertSame($noRelease, $serve(null), 'current.txt absent');
        self::assertSame($noRelease, $serve("\n"), 'pointeur vide');
        self::assertSame($noRelease, $serve('releases/../../shared'), 'traversée refusée par le motif');
        self::assertSame($noRelease, $serve('/home/x/app/releases/v1'), 'chemin absolu refusé');
        self::assertSame(
            json_encode(['status' => 'error', 'message' => 'Release entry point missing']),
            $serve('releases/20250101-000000-purgee'),
        );
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
    }
}
