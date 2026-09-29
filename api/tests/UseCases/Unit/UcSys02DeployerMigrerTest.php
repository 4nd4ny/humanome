<?php

declare(strict_types=1);

namespace Humanome\Tests\UseCases\Unit;

use Humanome\Auth\Session;
use Humanome\DbSessionHandler;
use Humanome\Middleware\CsrfMiddleware;
use Humanome\MigrationRunner;
use Humanome\Packages\InvalidPackageException;
use Humanome\Packages\PackageConflictException;
use Humanome\Packages\PromptPackageRepository;
use Humanome\Packages\SettingsRepository;
use Humanome\Referentiel\CompetenceSeeder;
use Humanome\Referentiel\ConflictException;
use Humanome\Referentiel\ContentHash;
use Humanome\Referentiel\FicheGenerator;
use Humanome\Referentiel\InvalidDocumentException;
use Humanome\Referentiel\ReferentielRepository;
use Humanome\Tests\TestDb;
use Humanome\Tests\UseCases\Support\AdmSupport;
use Humanome\Twin9\FicheStore;
use PDO;
use PHPUnit\Framework\Attributes\TestDox;
use PHPUnit\Framework\TestCase;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\RequestHandlerInterface;
use RuntimeException;
use Slim\Psr7\Factory\ResponseFactory;
use Slim\Psr7\Factory\ServerRequestFactory;

/**
 * UC-SYS-02 — Déployer, migrer et importer : tests UNITAIRES.
 *
 * Fiche : docs/cas-utilisation/systeme/UC-SYS-02-deployer-migrer.md
 *
 * Les briques appelées par les routes à jeton X-Migrate-Token (et par les
 * scripts CLI équivalents) sont exercées directement : MigrationRunner (ordre,
 * idempotence, fichier en échec, découpage SQL), imports idempotents du
 * référentiel et des paquets de prompts, seed des compétences atomiques avec
 * son gate de parité, génération des fiches Twin9 depuis la base et stockage
 * du paquet par défaut, et l'exemption CSRF propre à /api/admin/migrate
 * (CsrfMiddleware::process avec un handler factice). Seules des fixtures
 * VERSIONNÉES sont lues (schemas/fixtures/, scripts/data/).
 */
final class UcSys02DeployerMigrerTest extends TestCase
{
    private static PDO $pdo;

    private ?string $tmpDir = null;

    public static function setUpBeforeClass(): void
    {
        self::$pdo = TestDb::fresh();
        (new MigrationRunner(self::$pdo, MigrationRunner::defaultMigrationsDir()))->run();
    }

    protected function setUp(): void
    {
        TestDb::overrideEnv();
    }

    protected function tearDown(): void
    {
        if ($this->tmpDir !== null) {
            array_map('unlink', glob($this->tmpDir . '/*') ?: []);
            @rmdir($this->tmpDir);
        }
        foreach (['t_sys02_a', 't_sys02_b', 't_sys02_c', 't_sys02_lock'] as $table) {
            self::$pdo->exec("DROP TABLE IF EXISTS {$table}");
        }
        self::$pdo->exec("DELETE FROM schema_migrations WHERE filename LIKE '%_sys02_%'");
        TestDb::restoreEnv();
    }

    /** Dossier de migrations jetable : [nom de fichier => SQL]. */
    private function migrationsDir(array $files): string
    {
        $this->tmpDir = sys_get_temp_dir() . '/uc-sys02-' . bin2hex(random_bytes(4));
        mkdir($this->tmpDir);
        foreach ($files as $name => $sql) {
            file_put_contents($this->tmpDir . '/' . $name, $sql);
        }

        return $this->tmpDir;
    }

    /** @return list<string> */
    private static function recorded(): array
    {
        return self::$pdo->query("SELECT filename FROM schema_migrations WHERE filename LIKE '%_sys02_%' ORDER BY filename")
            ->fetchAll(PDO::FETCH_COLUMN);
    }

    private static function fixture(string $relative): array
    {
        return json_decode((string) file_get_contents(AdmSupport::repoRoot() . '/' . $relative), true, 512, JSON_THROW_ON_ERROR);
    }

    #[TestDox('UC-SYS-02-U01 — MigrationRunner : ordre lexicographique, suivi dans schema_migrations, verrou tenu pendant l’exécution puis relâché, second passage sans effet')]
    public function testU01RunsPendingFilesInOrderThenIsANoOp(): void
    {
        $dir = $this->migrationsDir([
            '010_sys02_c.sql' => 'CREATE TABLE t_sys02_c (id INT);',
            '002_sys02_b.sql' => "CREATE TABLE t_sys02_b (id INT);\nINSERT INTO t_sys02_b VALUES (2);",
            '001_sys02_a.sql' => '-- première ; migration' . "\nCREATE TABLE t_sys02_a (id INT);",
            // Sonde RG3 : le verrou GET_LOCK est tenu par la connexion du runner PENDANT l'exécution.
            '005_sys02_lock.sql' => "CREATE TABLE t_sys02_lock AS SELECT IS_USED_LOCK('humanome_migrate') = CONNECTION_ID() AS held;",
            'LISEZMOI.txt' => 'ignoré : pas un .sql',
        ]);
        $runner = new MigrationRunner(self::$pdo, $dir);

        $all = ['001_sys02_a.sql', '002_sys02_b.sql', '005_sys02_lock.sql', '010_sys02_c.sql'];
        self::assertSame(['applied' => $all, 'skipped' => 0], $runner->run());
        self::assertSame($all, self::recorded());
        self::assertSame(2, (int) self::$pdo->query('SELECT id FROM t_sys02_b')->fetchColumn());
        self::assertSame(1, (int) self::$pdo->query('SELECT held FROM t_sys02_lock')->fetchColumn(), 'verrou tenu pendant la migration');
        self::assertSame(0, self::holdsMigrationLock(), 'verrou relâché après le passage');

        self::assertSame(['applied' => [], 'skipped' => 4], $runner->run());
    }

    /** 1 si CETTE connexion tient le verrou humanome_migrate (indépendant des autres processus). */
    private static function holdsMigrationLock(): int
    {
        return (int) self::$pdo->query("SELECT COALESCE(IS_USED_LOCK('humanome_migrate') = CONNECTION_ID(), 0)")->fetchColumn();
    }

    #[TestDox('UC-SYS-02-U02 — MigrationRunner : un fichier en échec lève « Migration X failed », n’est pas enregistré, verrou relâché ; son DDL partiel persiste (rejeu sûr seulement si idempotent)')]
    public function testU02FailingFileIsNotRecordedAndCanBeRetried(): void
    {
        $dir = $this->migrationsDir([
            '001_sys02_a.sql' => 'CREATE TABLE t_sys02_a (id INT);',
            '002_sys02_b.sql' => 'CREATE TABLE t_sys02_b (id INT); INSERT INTO table_inexistante_sys02 VALUES (1);',
        ]);

        try {
            (new MigrationRunner(self::$pdo, $dir))->run();
            self::fail('la migration défectueuse est passée');
        } catch (RuntimeException $e) {
            self::assertStringStartsWith('Migration 002_sys02_b.sql failed: ', $e->getMessage());
        }
        self::assertSame(['001_sys02_a.sql'], self::recorded(), 'le fichier en échec n’est pas marqué appliqué');
        // GET_LOCK est réentrant pour une même session MySQL : on vérifie donc
        // que CETTE connexion ne tient plus le verrou (le finally l'a relâché).
        self::assertSame(0, self::holdsMigrationLock(), 'verrou relâché malgré l’échec');

        // Le DDL exécuté avant l'erreur est auto-validé par MySQL (pas de
        // rollback) : t_sys02_b EXISTE. Rejouer un correctif non idempotent échoue.
        self::assertSame(1, (int) self::$pdo->query("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 't_sys02_b'")->fetchColumn());
        file_put_contents($dir . '/002_sys02_b.sql', 'CREATE TABLE t_sys02_b (id INT);');
        try {
            (new MigrationRunner(self::$pdo, $dir))->run();
            self::fail('un correctif non idempotent a été rejoué sur un DDL partiel');
        } catch (RuntimeException $e) {
            self::assertStringStartsWith('Migration 002_sys02_b.sql failed: ', $e->getMessage());
            self::assertStringContainsString('already exists', $e->getMessage());
        }

        // Reprise sans intervention manuelle : seulement avec un correctif idempotent.
        file_put_contents($dir . '/002_sys02_b.sql', 'CREATE TABLE IF NOT EXISTS t_sys02_b (id INT);');
        self::assertSame(['applied' => ['002_sys02_b.sql'], 'skipped' => 1], (new MigrationRunner(self::$pdo, $dir))->run());
    }

    #[TestDox('UC-SYS-02-U03 — MigrationRunner : dossier absent → erreur explicite ; dossier par défaut = scripts/migrations du dépôt')]
    public function testU03MissingDirectoryAndDefaultLayout(): void
    {
        $this->expectException(RuntimeException::class);
        $this->expectExceptionMessage('Migrations directory not found: /nulle/part/migrations');

        self::assertSame(realpath(AdmSupport::repoRoot() . '/scripts/migrations'), realpath(MigrationRunner::defaultMigrationsDir()));
        (new MigrationRunner(self::$pdo, '/nulle/part/migrations'))->run();
    }

    #[TestDox('UC-SYS-02-U04 — splitStatements : points-virgules protégés dans les chaînes et identifiants, commentaires retirés, dernière instruction sans « ; » ; (AN-3) « 5--2 » pris pour un commentaire')]
    public function testU04SplitStatements(): void
    {
        $sql = <<<'SQL'
        # en-tête ; commentaire dièse
        INSERT INTO t (a) VALUES ('l\'apostrophe ; échappée');;
        CREATE TABLE `nom;bizarre` (id INT); -- fin de ligne ; ignorée
        UPDATE t SET a = "x;y" WHERE b = 1
        SQL;

        self::assertSame([
            "INSERT INTO t (a) VALUES ('l\\'apostrophe ; échappée')",
            'CREATE TABLE `nom;bizarre` (id INT)',
            'UPDATE t SET a = "x;y" WHERE b = 1',
        ], MigrationRunner::splitStatements($sql));
        self::assertSame([], MigrationRunner::splitStatements("-- rien\n  ;\n"));

        // COMPORTEMENT ACTUEL figé (anomalie AN-3) : tout « -- » est pris pour un
        // commentaire, alors que MySQL exige « -- » suivi d'un blanc. « 5--2 »
        // (= 5 - (-2)) avale la fin de la ligne, point-virgule compris : deux
        // instructions fusionnent en une seule, invalide.
        self::assertSame(["SELECT 5\nSELECT 1"], MigrationRunner::splitStatements("SELECT 5--2;\nSELECT 1;"));
    }

    #[TestDox('UC-SYS-02-U05 — import du référentiel : « imported » puis « unchanged » ; hash déclaré faux → conflit ; même version autre structure → conflit « immutable » ; document invalide refusé')]
    public function testU05ReferentielImportIsIdempotentAndChecked(): void
    {
        self::$pdo->exec('DELETE FROM referentiel_versions');
        $doc = self::fixture('schemas/fixtures/referentiel-respire-v7.json');
        $repo = new ReferentielRepository(self::$pdo);

        $first = $repo->importPublishedDocument($doc, 'Import via deploy script');
        self::assertSame('imported', $first['status']);
        self::assertSame('7.0.0', $first['semver']);
        self::assertSame($doc['contentHash'], $first['contentHash']);
        self::assertSame('unchanged', $repo->importPublishedDocument($doc, 'Import via deploy script')['status']);

        $tampered = $doc;
        $tampered['competences'][0]['nom'] = 'Nom altéré';
        try {
            $repo->importPublishedDocument($tampered, 'x');
            self::fail('hash incohérent accepté');
        } catch (ConflictException $e) {
            self::assertStringContainsString('contentHash mismatch', $e->getMessage());
        }

        // Même version, structure différente, hash recalculé (cohérent) :
        // une version publiée est immuable (E5).
        $tampered['contentHash'] = ContentHash::compute($tampered);
        try {
            $repo->importPublishedDocument($tampered, 'x');
            self::fail('version publiée réécrite');
        } catch (ConflictException $e) {
            self::assertStringContainsString('immutable', $e->getMessage());
        }

        $this->expectException(InvalidDocumentException::class);
        $repo->importPublishedDocument(['kind' => 'referentiel'], 'x');
    }

    #[TestDox('UC-SYS-02-U06 — import d’un paquet de prompts : « imported » puis « unchanged » ; version publiée immuable ; isPublished exclut version inconnue et paquet privé ; schéma invalide refusé')]
    public function testU06PromptPackageImportIsIdempotentAndImmutable(): void
    {
        self::$pdo->exec('DELETE FROM prompt_packages');
        $doc = self::fixture('schemas/fixtures/prompt-package-exemple.json');
        $repo = new PromptPackageRepository(self::$pdo);

        $first = $repo->importPublishedDocument($doc);
        self::assertSame(['status' => 'imported', 'id' => $doc['id'], 'version' => $doc['version']], array_slice($first, 0, 3, true));
        self::assertSame(PromptPackageRepository::contentHash($doc), $first['contentHash']);
        self::assertSame('unchanged', $repo->importPublishedDocument($doc)['status']);
        self::assertTrue($repo->isPublished($doc['id'], $doc['version']));
        self::assertFalse($repo->isPublished($doc['id'], '9.9.9'), 'version inconnue');

        try {
            $repo->importPublishedDocument(['description' => 'Autre contenu, même version'] + $doc);
            self::fail('version publiée réécrite');
        } catch (PackageConflictException $e) {
            self::assertStringContainsString('immutable', $e->getMessage());
        }

        // Un paquet privé (Golden) n'est jamais « publié » au sens du défaut.
        self::$pdo->prepare('UPDATE prompt_packages SET is_private = 1 WHERE slug = ?')->execute([$doc['id']]);
        self::assertFalse($repo->isPublished($doc['id'], $doc['version']), 'paquet privé exclu');

        $this->expectException(InvalidPackageException::class);
        $repo->importPublishedDocument(['id' => 'x']);
    }

    #[TestDox('UC-SYS-02-U07 — seed des compétences : exige un référentiel publié ; 7 pôles / 61 compétences + fiches, puis idempotent (gate de parité OK)')]
    public function testU07CompetenceSeedIsIdempotentBehindTheParityGate(): void
    {
        foreach (['referentiel_snapshot_competences', 'competence_votes', 'competence_versions', 'referentiel_poles', 'referentiel_versions'] as $table) {
            self::$pdo->exec("DELETE FROM {$table}");
        }
        $rich = self::fixture('scripts/data/competences-v7.json')['competences'];
        $fiches = self::fixture('scripts/data/fiches-v7.json');
        $seeder = new CompetenceSeeder(self::$pdo);

        try {
            $seeder->seed($rich, $fiches);
            self::fail('seed sans référentiel publié');
        } catch (RuntimeException $e) {
            self::assertStringContainsString('Aucune version publiée du référentiel', $e->getMessage());
        }

        (new ReferentielRepository(self::$pdo))->importPublishedDocument(self::fixture('schemas/fixtures/referentiel-respire-v7.json'), 'seed');
        $first = $seeder->seed($rich, $fiches);
        self::assertSame(7, $first['poles']);
        self::assertSame(61, $first['imported']);
        self::assertSame(61, $first['fiches']);
        self::assertSame(61, $first['lockLinks']);
        self::assertMatchesRegularExpression('/^[0-9a-f]{64}$/', $first['parityHash']);

        $second = $seeder->seed($rich, $fiches);
        self::assertSame([0, 61, 0], [$second['imported'], $second['unchanged'], $second['backfilled']]);
        self::assertSame($first['parityHash'], $second['parityHash']);
    }

    #[TestDox('UC-SYS-02-U08 — fiches Twin9 depuis la base : structure 7 pôles / 61 fiches, forme corpus = fiches-v7.json, stockage lisible par FicheStore')]
    public function testU08FichesAreGeneratedFromTheDatabase(): void
    {
        // Base semée par U07 (même classe) : si ce test tourne seul, on la sème.
        if ((int) self::$pdo->query('SELECT COUNT(*) FROM competence_versions')->fetchColumn() === 0) {
            $this->testU07CompetenceSeedIsIdempotentBehindTheParityGate();
        }
        $corpus = self::fixture('scripts/data/fiches-v7.json');
        $generator = new FicheGenerator(self::$pdo);

        $structure = $generator->fichesStructure();
        self::assertCount(7, $structure);
        self::assertSame(61, array_sum(array_map(static fn (array $p): int => \count($p['competences']), $structure)));
        self::assertEquals(
            ['poleHeaders' => $corpus['poleHeaders'], 'fiches' => $corpus['fiches']],
            $generator->corpus(),
            'aller-retour corpus → base → corpus sans perte (hors clé de commentaire)',
        );

        $settings = new SettingsRepository(self::$pdo);
        $settings->delete(FicheStore::SETTING_KEY);
        self::assertTrue(FicheStore::fromSettings($settings)->isEmpty());
        FicheStore::store($settings, $structure);
        $store = FicheStore::fromSettings($settings);
        $code = $structure[0]['competences'][0]['code'];
        self::assertSame($corpus['fiches'][$code], $store->competenceFiche($code));
        // Relecture de l'en-tête de pôle : réassemblage exact (Pole.fiche_complete).
        self::assertSame(
            rtrim($corpus['poleHeaders']['1']) . "\n\n"
                . implode("\n\n---\n\n", array_map('trim', array_column($structure[0]['competences'], 'fiche_md'))) . "\n",
            $store->poleFiches(1),
        );
    }

    #[TestDox('UC-SYS-02-U09 — paquet par défaut : le réglage default_prompt_package se pose, se relit et se retire (JSON)')]
    public function testU09DefaultPackageSetting(): void
    {
        $settings = new SettingsRepository(self::$pdo);
        $settings->delete(SettingsRepository::DEFAULT_PACKAGE);
        self::assertNull($settings->get(SettingsRepository::DEFAULT_PACKAGE));

        $settings->set(SettingsRepository::DEFAULT_PACKAGE, ['id' => 'aurora-demo', 'version' => '1.0.0', 'validatedAt' => '2026-09-28T10:00:00+00:00']);
        $settings->set(SettingsRepository::DEFAULT_PACKAGE, ['id' => 'aurora-demo', 'version' => '2.0.0', 'validatedAt' => '2026-09-28T11:00:00+00:00']);

        self::assertEquals(
            ['id' => 'aurora-demo', 'version' => '2.0.0', 'validatedAt' => '2026-09-28T11:00:00+00:00'],
            $settings->get(SettingsRepository::DEFAULT_PACKAGE),
            'upsert : une seule valeur',
        );
        $settings->delete(SettingsRepository::DEFAULT_PACKAGE);
        self::assertNull($settings->get(SettingsRepository::DEFAULT_PACKAGE));
    }

    #[TestDox('UC-SYS-02-U10 — seed : gate de parité en échec, contenu riche manquant ; backfill d’une 1.0.0 périmée ; lockfile écrit une fois (INSERT IGNORE : lien 1.0.0 conservé), lockLinks = tentatives')]
    public function testU10SeedFailuresAndWriteOnceLockfile(): void
    {
        if ((int) self::$pdo->query('SELECT COUNT(*) FROM competence_versions')->fetchColumn() === 0) {
            $this->testU07CompetenceSeedIsIdempotentBehindTheParityGate();
        }
        $rich = self::fixture('scripts/data/competences-v7.json')['competences'];
        $fiches = self::fixture('scripts/data/fiches-v7.json');
        $seeder = new CompetenceSeeder(self::$pdo);
        $code = (string) self::$pdo->query("SELECT competence_code FROM competence_versions WHERE semver = '1.0.0' ORDER BY competence_code LIMIT 1")->fetchColumn();
        $nom = (string) self::$pdo->query("SELECT nom FROM competence_versions WHERE competence_code = '{$code}' AND semver = '1.0.0'")->fetchColumn();

        // (a) Contenu riche manquant pour un code du référentiel publié.
        $partial = $rich;
        unset($partial[$code]);
        try {
            $seeder->seed($partial, $fiches);
            self::fail('seed sans contenu riche');
        } catch (RuntimeException $e) {
            self::assertSame('Contenu riche manquant pour ' . $code, $e->getMessage());
        }

        // (b) Gate de parité : le nom structurel en base diverge du publié.
        self::$pdo->prepare("UPDATE competence_versions SET nom = 'Nom divergent' WHERE competence_code = ? AND semver = '1.0.0'")->execute([$code]);
        try {
            $seeder->seed($rich, $fiches);
            self::fail('gate de parité franchi malgré la divergence');
        } catch (RuntimeException $e) {
            self::assertStringStartsWith('Gate de parité ÉCHOUÉ', $e->getMessage());
        } finally {
            self::$pdo->prepare("UPDATE competence_versions SET nom = ? WHERE competence_code = ? AND semver = '1.0.0'")->execute([$nom, $code]);
        }

        // (c) Backfill : une 1.0.0 au contenu périmé (sans fiche), encore la
        // dernière publiée, est réconciliée avec le corpus (reconcileSeed).
        $v100 = (int) self::$pdo->query("SELECT id FROM competence_versions WHERE competence_code = '{$code}' AND semver = '1.0.0'")->fetchColumn();
        $hash = (string) self::$pdo->query("SELECT content_hash FROM competence_versions WHERE id = {$v100}")->fetchColumn();
        self::$pdo->exec("UPDATE competence_versions SET content = JSON_REMOVE(content, '$.fiche'), content_hash = REPEAT('0', 64) WHERE id = {$v100}");
        $backfill = $seeder->seed($rich, $fiches);
        self::assertSame([1, 60], [$backfill['backfilled'], $backfill['unchanged']]);
        self::assertSame($hash, (string) self::$pdo->query("SELECT content_hash FROM competence_versions WHERE id = {$v100}")->fetchColumn(), 'contenu du corpus rétabli');
        self::assertSame($fiches['fiches'][$code], (string) self::$pdo->query("SELECT JSON_UNQUOTE(JSON_EXTRACT(content, '$.fiche')) FROM competence_versions WHERE id = {$v100}")->fetchColumn());

        // (d) Lockfile write-once : une 1.1.0 publiée ne remplace pas le lien 1.0.0.
        self::$pdo->prepare(
            "INSERT INTO competence_versions (competence_code, semver, pole, nom, status, content, content_hash, published_at)
             SELECT competence_code, '1.1.0', pole, nom, 'published', content, content_hash, NOW()
               FROM competence_versions WHERE id = ?"
        )->execute([$v100]);
        try {
            $again = $seeder->seed($rich, $fiches);
            self::assertSame(61, $again['lockLinks'], 'lockLinks compte les INSERT IGNORE tentés, pas les lignes écrites');
            self::assertSame(61, (int) self::$pdo->query('SELECT COUNT(*) FROM referentiel_snapshot_competences')->fetchColumn(), 'une ligne par (release, compétence)');
            self::assertSame($v100, (int) self::$pdo->query("SELECT competence_version_id FROM referentiel_snapshot_competences WHERE competence_code = '{$code}'")->fetchColumn(), 'provenance figée sur 1.0.0');
        } finally {
            self::$pdo->prepare("DELETE FROM competence_versions WHERE competence_code = ? AND semver = '1.1.0'")->execute([$code]);
        }
    }

    #[TestDox('UC-SYS-02-U11 — CsrfMiddleware : seule /api/admin/migrate est exemptée ; une autre route à jeton appelée avec une session sans X-CSRF-Token → 403')]
    public function testU11CsrfExemptionIsLimitedToMigrate(): void
    {
        $csrf = new CsrfMiddleware();
        $handler = new class () implements RequestHandlerInterface {
            public int $calls = 0;

            public function handle(ServerRequestInterface $request): ResponseInterface
            {
                $this->calls++;

                return (new ResponseFactory())->createResponse(200);
            }
        };
        $factory = new ServerRequestFactory();
        Session::openForUser(AdmSupport::user(self::$pdo, 'mainteneur-' . bin2hex(random_bytes(3)) . '@example.org', 'Mainteneur'));
        try {
            self::assertSame(200, $csrf->process($factory->createServerRequest('POST', '/api/admin/migrate'), $handler)->getStatusCode());
            self::assertSame(200, $csrf->process($factory->createServerRequest('POST', '/api/admin/migrate/'), $handler)->getStatusCode(), 'barre finale rognée');
            foreach (['/api/admin/grant-role', '/api/admin/import-prompt-package', '/api/admin/seed-competences'] as $path) {
                $refused = $csrf->process($factory->createServerRequest('POST', $path), $handler);
                self::assertSame(403, $refused->getStatusCode(), $path);
                self::assertSame(['error' => 'Jeton CSRF absent ou invalide'], json_decode((string) $refused->getBody(), true));
            }
            self::assertSame(2, $handler->calls);
        } finally {
            if (session_status() === PHP_SESSION_ACTIVE) {
                session_abort();
            }
            session_id('');
            unset($_COOKIE[DbSessionHandler::SESSION_NAME]);
        }
    }
}
