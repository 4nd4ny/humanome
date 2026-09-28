<?php

declare(strict_types=1);

namespace Humanome\Tests\UseCases\Unit;

use Humanome\Admin\AdminException;
use Humanome\Admin\PlatformStatus;
use Humanome\Packages\PromptPackageRepository;
use Humanome\Packages\SettingsRepository;
use Humanome\Tests\TestDb;
use Humanome\Tests\UseCases\Support\ProSupport;
use PDO;
use PHPUnit\Framework\Attributes\TestDox;
use PHPUnit\Framework\TestCase;

/**
 * UC-ADM-03 — Valider le paquet par défaut et les réglages : tests UNITAIRES.
 *
 * Fiche : docs/cas-utilisation/administration/UC-ADM-03-valider-paquet-defaut-reglages.md
 *
 * Humanome\Admin\PlatformStatus appelé directement (sans couche HTTP) : la
 * seule écriture qu'il possède (setDefaultPackage — porte « publié et non
 * privé », consommation de la proposition, audit) et l'instantané affiché par
 * l'écran Réglages et l'écran Configuration serveur (snapshot : défaut
 * stocké / proposé / effectif, démo, worker de masse, configuration sans
 * secret).
 */
final class UcAdm03ValiderPaquetDefautReglagesTest extends TestCase
{
    private static PDO $pdo;

    private int $admin = 0;

    public static function setUpBeforeClass(): void
    {
        self::$pdo = ProSupport::freshPdo();
    }

    protected function setUp(): void
    {
        // PlatformStatus lit aussi la démo (DemoConfig, via Db) : base de test.
        TestDb::overrideEnv();
        ProSupport::reset(self::$pdo);
        $this->admin = ProSupport::user(self::$pdo, 'Root', ['admin']);
    }

    protected function tearDown(): void
    {
        TestDb::restoreEnv();
    }

    private static function platform(): PlatformStatus
    {
        return new PlatformStatus(self::$pdo);
    }

    private static function settings(): SettingsRepository
    {
        return new SettingsRepository(self::$pdo);
    }

    private static function lastAudit(string $type): ?array
    {
        $stmt = self::$pdo->prepare('SELECT user_id, details FROM audit_events WHERE type = ? ORDER BY id DESC LIMIT 1');
        $stmt->execute([$type]);
        $row = $stmt->fetch();

        return $row === false ? null : ['userId' => (int) $row['user_id'], 'details' => json_decode((string) $row['details'], true)];
    }

    private static function propose(string $version): void
    {
        self::settings()->set(SettingsRepository::DEFAULT_PACKAGE_PROPOSAL, [
            'id' => ProSupport::PKG, 'version' => $version, 'proposedBy' => 1, 'proposedAt' => '2026-07-01T10:00:00+00:00',
        ]);
    }

    #[TestDox('UC-ADM-03-U01 — setDefaultPackage : défaut stocké {id, version, validatedAt}, audit default_package_set (identifiants seulement)')]
    public function testU01SetDefaultPackageStoresAndAudits(): void
    {
        ProSupport::publish(self::$pdo);

        $result = self::platform()->setDefaultPackage($this->admin, ProSupport::PKG, '1.0.0');

        self::assertSame(['id' => 'aurora-demo', 'version' => '1.0.0', 'status' => 'default'], $result);
        $stored = self::settings()->get(SettingsRepository::DEFAULT_PACKAGE);
        self::assertSame(['aurora-demo', '1.0.0'], [$stored['id'], $stored['version']]);
        self::assertMatchesRegularExpression('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/', $stored['validatedAt']);
        self::assertEquals(['userId' => $this->admin, 'details' => ['id' => 'aurora-demo', 'version' => '1.0.0']], self::lastAudit('default_package_set'));
    }

    #[TestDox('UC-ADM-03-U02 — la proposition correspondante est consommée ; une proposition différente reste en attente')]
    public function testU02MatchingProposalIsConsumedOthersKept(): void
    {
        ProSupport::publish(self::$pdo);
        ProSupport::publish(self::$pdo, ProSupport::packageDocV2());

        self::propose('2.0.0');
        self::platform()->setDefaultPackage($this->admin, ProSupport::PKG, '1.0.0');
        self::assertSame('2.0.0', self::settings()->get(SettingsRepository::DEFAULT_PACKAGE_PROPOSAL)['version'], 'autre version : proposition conservée');

        self::platform()->setDefaultPackage($this->admin, ProSupport::PKG, '2.0.0');
        self::assertNull(self::settings()->get(SettingsRepository::DEFAULT_PACKAGE_PROPOSAL), 'même version : proposition consommée');
    }

    #[TestDox('UC-ADM-03-U03 — version inconnue, brouillon ou Golden privé → AdminException 404, rien n’est écrit ni journalisé')]
    public function testU03OnlyPublishedPublicVersionsCanBecomeTheDefault(): void
    {
        ProSupport::publish(self::$pdo);
        (new PromptPackageRepository(self::$pdo))->createDraft(ProSupport::PKG, '1.0.0', '1.1.0', ProSupport::user(self::$pdo));
        ProSupport::importGolden(self::$pdo, $this->admin);

        foreach ([[ProSupport::PKG, '9.9.9'], [ProSupport::PKG, '1.1.0'], [ProSupport::GOLDEN, '1.0.0']] as [$id, $version]) {
            try {
                self::platform()->setDefaultPackage($this->admin, $id, $version);
                self::fail('AdminException attendue pour ' . $id . '@' . $version);
            } catch (AdminException $e) {
                self::assertSame(404, $e->getStatusCode());
                self::assertSame('Version publiée introuvable', $e->getMessage());
            }
        }
        self::assertNull(self::settings()->get(SettingsRepository::DEFAULT_PACKAGE));
        self::assertNull(self::lastAudit('default_package_set'));
    }

    #[TestDox('UC-ADM-03-U04 — instantané defaultPackage : rien publié, repli sur la dernière publication, défaut validé prioritaire, proposition exposée')]
    public function testU04SnapshotResolvesTheDefaultPackage(): void
    {
        self::assertSame(['stored' => null, 'proposal' => null, 'effective' => null], self::platform()->snapshot()['defaultPackage']);

        ProSupport::publish(self::$pdo);
        ProSupport::publish(self::$pdo, ProSupport::packageDocV2());
        self::propose('1.0.0');
        $pending = self::platform()->snapshot()['defaultPackage'];
        self::assertNull($pending['stored']);
        self::assertSame('1.0.0', $pending['proposal']['version']);
        self::assertSame(['id' => 'aurora-demo', 'version' => '2.0.0'], $pending['effective']);

        self::platform()->setDefaultPackage($this->admin, ProSupport::PKG, '1.0.0');
        $validated = self::platform()->snapshot()['defaultPackage'];
        self::assertSame('1.0.0', $validated['stored']['version']);
        self::assertNull($validated['proposal']);
        self::assertSame(['id' => 'aurora-demo', 'version' => '1.0.0'], $validated['effective'], 'le validé l’emporte sur 2.0.0');
    }

    #[TestDox('UC-ADM-03-U05 — instantané worker : jobs en file (en attente + en cours), compte par statut, runs actifs, dernière activité')]
    public function testU05SnapshotWorkerState(): void
    {
        self::assertSame(
            ['jobsInQueue' => 0, 'byStatus' => ['queued' => 0, 'running' => 0, 'done' => 0, 'failed' => 0, 'budget_exceeded' => 0, 'cancelled' => 0], 'activeRuns' => 0, 'lastActivity' => null],
            self::platform()->snapshot()['worker'],
        );

        $etab = ProSupport::user(self::$pdo, 'Lycée', ['etablissement']);
        $eleve = ProSupport::user(self::$pdo, 'Élève', ['apprenant']);
        self::$pdo->prepare('INSERT INTO cohortes (etablissement_id, nom, code_invitation) VALUES (?, ?, ?)')->execute([$etab, 'Terminale', 'ABCDEFGH23']);
        $cohorte = (int) self::$pdo->lastInsertId();
        $insertRun = self::$pdo->prepare(
            'INSERT INTO mass_runs (etablissement_id, cohorte_id, prompt_package_slug, prompt_package_semver, referentiel_id, referentiel_semver, status)
             VALUES (?, ?, "aurora-demo", "1.0.0", "respire", "7.0.0", ?)'
        );
        $insertRun->execute([$etab, $cohorte, 'active']);
        $run = (int) self::$pdo->lastInsertId();
        $insertRun->execute([$etab, $cohorte, 'done']);
        $insertJob = self::$pdo->prepare('INSERT INTO mass_jobs (run_id, user_id, day_date, status, updated_at) VALUES (?, ?, ?, ?, ?)');
        foreach ([['2026-01-05', 'queued'], ['2026-01-06', 'running'], ['2026-01-07', 'done'], ['2026-01-08', 'failed'], ['2026-01-09', 'queued']] as $i => [$day, $status]) {
            $insertJob->execute([$run, $eleve, $day, $status, '2026-07-0' . ($i + 1) . ' 10:00:00']);
        }

        $worker = self::platform()->snapshot()['worker'];

        self::assertSame(3, $worker['jobsInQueue']);
        self::assertSame(['queued' => 2, 'running' => 1, 'done' => 1, 'failed' => 1, 'budget_exceeded' => 0, 'cancelled' => 0], $worker['byStatus']);
        self::assertSame(1, $worker['activeRuns']);
        self::assertSame('2026-07-05T10:00:00', $worker['lastActivity']);
    }

    #[TestDox('UC-ADM-03-U06 — instantané config : les secrets ne sont que des booléens « configuré », jamais une valeur ; démo en lecture seule')]
    public function testU06SnapshotConfigNeverRevealsSecrets(): void
    {
        TestDb::setEnv('MIGRATE_TOKEN', 'jeton-tres-secret-0123');
        TestDb::setEnv('POW_SECRET', '');

        $snapshot = self::platform()->snapshot();
        $secrets = $snapshot['config']['secrets'];

        self::assertSame(['env' => 'MIGRATE_TOKEN', 'description' => $secrets['MIGRATE_TOKEN']['description'], 'secret' => true, 'configured' => true], $secrets['MIGRATE_TOKEN']);
        self::assertFalse($secrets['POW_SECRET']['configured']);
        self::assertArrayNotHasKey('value', $snapshot['config']['database']['DB_PASSWORD']);
        self::assertSame(['env', 'description', 'secret', 'default', 'value'], array_keys($snapshot['config']['database']['DB_HOST']));
        self::assertStringNotContainsString('jeton-tres-secret-0123', json_encode($snapshot, JSON_THROW_ON_ERROR));
        self::assertSame(['application', 'database', 'secrets', 'llm'], array_keys($snapshot['config']));
        self::assertFalse($snapshot['demo']['editableInUi']);
        self::assertSame(['defaultPackage', 'demo', 'worker', 'config'], array_keys($snapshot));
    }
}
