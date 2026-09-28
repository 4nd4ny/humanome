<?php

declare(strict_types=1);

namespace Humanome\Tests\UseCases\Unit;

use Humanome\Admin\AdminException;
use Humanome\Admin\DemoConfigService;
use Humanome\Admin\PlatformStatus;
use Humanome\Db;
use Humanome\Llm\DemoConfig;
use Humanome\MigrationRunner;
use Humanome\Packages\SettingsRepository;
use Humanome\Tests\TestDb;
use Humanome\Tests\UseCases\Support\AdmSupport;
use PDO;
use PHPUnit\Framework\Attributes\TestDox;
use PHPUnit\Framework\TestCase;

/**
 * UC-ADM-04 — Configurer la démo publique : tests UNITAIRES.
 *
 * Fiche : docs/cas-utilisation/administration/UC-ADM-04-configurer-demo.md
 *
 * Appels directs, sans HTTP : DemoConfigService (lecture, validation champ
 * par champ, fusion des surcharges, réinitialisation, audit) et
 * DemoConfig::load (précédence base > env > fichier, lecture des variables
 * DEMO_*, tolérance aux valeurs invalides en base, repli si la base manque).
 * L'environnement DEMO_* est vidé à chaque test : sans surcharge, chaque champ
 * vient donc de api/config/demo.php (« fichier »).
 */
final class UcAdm04ConfigurerDemoTest extends TestCase
{
    private const API_KEY = 'sk-ant-unit-secret-never-returned';

    private const DEMO_ENV = [
        'DEMO_ENABLED', 'DEMO_PROVIDER', 'DEMO_MODEL', 'DEMO_MAX_TOKENS_PER_REQUEST',
        'DEMO_MAX_INPUT_CHARS', 'DEMO_PER_IP_PER_HOUR', 'DEMO_DAILY_GLOBAL_TOKENS',
        'DEMO_DAILY_BUDGET_USD', 'DEMO_POW_DIFFICULTY_BITS', 'DEMO_UPSTREAM_TIMEOUT',
    ];

    private static PDO $pdo;

    private int $adminId = 0;

    public static function setUpBeforeClass(): void
    {
        self::$pdo = TestDb::fresh();
        (new MigrationRunner(self::$pdo, MigrationRunner::defaultMigrationsDir()))->run();
    }

    public static function tearDownAfterClass(): void
    {
        TestDb::restoreEnv();
    }

    protected function setUp(): void
    {
        TestDb::overrideEnv();
        foreach (self::DEMO_ENV as $key) {
            TestDb::setEnv($key, '');
        }
        TestDb::setEnv('ANTHROPIC_API_KEY', self::API_KEY);
        self::$pdo->exec('DELETE FROM settings');
        self::$pdo->exec('DELETE FROM users');
        self::$pdo->exec('DELETE FROM audit_events');
        $this->adminId = AdmSupport::user(self::$pdo, 'root@example.org', 'Root', ['admin']);
    }

    protected function tearDown(): void
    {
        TestDb::restoreEnv();
    }

    private static function service(): DemoConfigService
    {
        return new DemoConfigService(Db::get());
    }

    /** Asserts that update($patch) is refused with a 422 carrying $message. */
    private function assertRejected(array $patch, string $message): void
    {
        try {
            self::service()->update($this->adminId, $patch);
            self::fail('patch accepté : ' . json_encode($patch));
        } catch (AdminException $e) {
            self::assertSame(422, $e->getStatusCode(), json_encode($patch));
            self::assertSame($message, $e->getMessage());
        }
    }

    #[TestDox('UC-ADM-04-U01 — read : 10 valeurs effectives, origine par champ, liste de modèles, clé API en booléen seulement')]
    public function testU01ReadExposesEffectiveValuesAndNeverTheKey(): void
    {
        $data = self::service()->read();

        self::assertSame(['effective', 'sources', 'allowedModels', 'apiKeyConfigured'], array_keys($data));
        self::assertSame([
            'enabled' => true,
            'provider' => 'anthropic',
            'model' => 'claude-haiku-4-5-20251001',
            'maxTokensPerRequest' => 2048,
            'maxInputChars' => 20000,
            'perIpPerHour' => 20,
            'dailyGlobalTokens' => 2000000,
            'dailyBudgetUsd' => 5.0,
            'powDifficultyBits' => 20,
            'upstreamTimeoutSeconds' => 60,
        ], $data['effective']);
        self::assertSame(array_fill_keys(array_keys($data['effective']), 'fichier'), $data['sources']);
        self::assertSame(DemoConfigService::ALLOWED_MODELS, $data['allowedModels']);
        self::assertTrue($data['apiKeyConfigured']);
        self::assertStringNotContainsString(self::API_KEY, json_encode($data, JSON_THROW_ON_ERROR));

        TestDb::setEnv('ANTHROPIC_API_KEY', '');
        self::assertFalse(self::service()->read()['apiKeyConfigured']);
    }

    #[TestDox('UC-ADM-04-U02 — update : fusion des patchs partiels dans demo_overrides, origine « base », audit des NOMS de champs')]
    public function testU02UpdateMergesPartialPatchesAndAuditsFieldNames(): void
    {
        $first = self::service()->update($this->adminId, ['model' => '  claude-opus-4-8 ', 'maxTokensPerRequest' => 4096]);
        self::assertSame('claude-opus-4-8', $first['effective']['model'], 'modèle rogné');
        self::assertSame('base', $first['sources']['model']);
        self::assertSame('fichier', $first['sources']['perIpPerHour']);

        $second = self::service()->update($this->adminId, ['perIpPerHour' => 5, 'enabled' => false]);
        self::assertSame('claude-opus-4-8', $second['effective']['model'], 'le 2e patch ne remplace pas le 1er');
        self::assertSame(4096, $second['effective']['maxTokensPerRequest']);
        self::assertSame(5, $second['effective']['perIpPerHour']);
        self::assertFalse($second['effective']['enabled']);

        self::assertEquals(
            ['model' => 'claude-opus-4-8', 'maxTokensPerRequest' => 4096, 'perIpPerHour' => 5, 'enabled' => false],
            (new SettingsRepository(Db::get()))->get(DemoConfig::OVERRIDES_KEY),
        );
        self::assertSame(2, AdmSupport::countAudit(self::$pdo, 'demo_config_updated'));
        $audit = AdmSupport::lastAudit(self::$pdo, 'demo_config_updated');
        self::assertSame($this->adminId, $audit['userId']);
        self::assertEquals(['fields' => ['perIpPerHour', 'enabled']], $audit['details']);
        self::assertStringNotContainsString('claude-opus', $audit['raw']);
    }

    #[TestDox('UC-ADM-04-U03 — update : bornes entières inclusives, hors bornes et non-entiers refusés (422, message français)')]
    public function testU03IntegerBounds(): void
    {
        $bounds = [
            'maxTokensPerRequest' => [256, 16000],
            'maxInputChars' => [1000, 200000],
            'perIpPerHour' => [1, 1000],
            'dailyGlobalTokens' => [10000, 50000000],
            'powDifficultyBits' => [8, 24],
            'upstreamTimeoutSeconds' => [10, 300],
        ];
        foreach ($bounds as $field => [$min, $max]) {
            self::assertSame($min, self::service()->update($this->adminId, [$field => $min])['effective'][$field]);
            self::assertSame($max, self::service()->update($this->adminId, [$field => $max])['effective'][$field]);
            $message = sprintf('%s doit être compris entre %d et %d.', $field, $min, $max);
            $this->assertRejected([$field => $min - 1], $message);
            $this->assertRejected([$field => $max + 1], $message);
            $this->assertRejected([$field => (string) $min], sprintf('%s doit être un entier.', $field));
            $this->assertRejected([$field => $min + 0.5], sprintf('%s doit être un entier.', $field));
        }
    }

    #[TestDox('UC-ADM-04-U04 — update : budget quotidien réel 0–1000 (entier accepté, converti), sinon 422')]
    public function testU04BudgetIsAFloatBetweenZeroAndAThousand(): void
    {
        self::assertSame(0.0, self::service()->update($this->adminId, ['dailyBudgetUsd' => 0])['effective']['dailyBudgetUsd']);
        self::assertSame(2.5, self::service()->update($this->adminId, ['dailyBudgetUsd' => 2.5])['effective']['dailyBudgetUsd']);
        self::assertSame(1000.0, self::service()->update($this->adminId, ['dailyBudgetUsd' => 1000])['effective']['dailyBudgetUsd']);

        $message = 'dailyBudgetUsd doit être compris entre 0 et 1000.';
        $this->assertRejected(['dailyBudgetUsd' => -0.01], $message);
        $this->assertRejected(['dailyBudgetUsd' => 1000.5], $message);
        $this->assertRejected(['dailyBudgetUsd' => '5'], 'dailyBudgetUsd doit être un nombre.');
        $this->assertRejected(['dailyBudgetUsd' => true], 'dailyBudgetUsd doit être un nombre.');
    }

    #[TestDox('UC-ADM-04-U05 — update : modèle libre au-delà de la liste, motif [A-Za-z0-9][A-Za-z0-9._-]{0,99}, jamais vide')]
    public function testU05ModelIsFreeTextWithASaneShape(): void
    {
        self::assertSame('claude-fable-5', self::service()->update($this->adminId, ['model' => 'claude-fable-5'])['effective']['model']);
        $hundred = 'a' . str_repeat('b', 99);
        self::assertSame($hundred, self::service()->update($this->adminId, ['model' => $hundred])['effective']['model']);

        $invalid = 'Identifiant de modèle invalide (lettres, chiffres, points et tirets).';
        $this->assertRejected(['model' => $hundred . 'c'], $invalid);
        $this->assertRejected(['model' => '-claude'], $invalid);
        $this->assertRejected(['model' => 'claude haiku'], $invalid);
        $this->assertRejected(['model' => 'modèle'], $invalid);
        $this->assertRejected(['model' => '   '], 'Le modèle ne peut pas être vide.');
        $this->assertRejected(['model' => 42], 'Le modèle ne peut pas être vide.');
    }

    #[TestDox('UC-ADM-04-U06 — update : enabled booléen, champ inconnu, fournisseur non modifiable, patch vide ; un patch invalide n’écrit RIEN')]
    public function testU06RejectsAndIsAllOrNothing(): void
    {
        $this->assertRejected(['enabled' => 'false'], 'enabled doit être un booléen.');
        $this->assertRejected(['enabled' => 0], 'enabled doit être un booléen.');
        $this->assertRejected(['budget' => 3], 'Champ inconnu : budget');
        $this->assertRejected(['provider' => 'mock'], 'Le fournisseur n’est pas modifiable : la démo utilise la clé plateforme Anthropic.');
        $this->assertRejected([], 'Aucun champ à modifier.');

        // Un champ valide + un champ invalide : tout est refusé, rien n'est stocké.
        $this->assertRejected(['enabled' => false, 'maxTokensPerRequest' => 1], 'maxTokensPerRequest doit être compris entre 256 et 16000.');
        self::assertNull((new SettingsRepository(Db::get()))->get(DemoConfig::OVERRIDES_KEY));
        self::assertTrue(DemoConfig::load()->enabled);
        self::assertSame(0, AdmSupport::countAudit(self::$pdo, 'demo_config_updated'));
    }

    #[TestDox('UC-ADM-04-U07 — reset : supprime toutes les surcharges (retour env/fichier) et journalise demo_config_reset')]
    public function testU07ResetDropsEveryOverride(): void
    {
        TestDb::setEnv('DEMO_MODEL', 'claude-sonnet-5');
        self::service()->update($this->adminId, ['model' => 'claude-opus-4-8', 'enabled' => false]);

        $data = self::service()->reset($this->adminId);

        self::assertSame('claude-sonnet-5', $data['effective']['model']);
        self::assertSame('env', $data['sources']['model']);
        self::assertTrue($data['effective']['enabled']);
        self::assertSame('fichier', $data['sources']['enabled']);
        self::assertNotContains('base', $data['sources']);
        self::assertNull((new SettingsRepository(Db::get()))->get(DemoConfig::OVERRIDES_KEY));
        $audit = AdmSupport::lastAudit(self::$pdo, 'demo_config_reset');
        self::assertSame($this->adminId, $audit['userId']);
        self::assertSame([], $audit['details']);

        // Réinitialiser sans surcharge : sans erreur (idempotent), nouvel audit.
        self::service()->reset($this->adminId);
        self::assertSame(2, AdmSupport::countAudit(self::$pdo, 'demo_config_reset'));
    }

    #[TestDox('UC-ADM-04-U08 — DemoConfig::load : précédence base > env > fichier, champ par champ')]
    public function testU08LoadPrecedence(): void
    {
        TestDb::setEnv('DEMO_MODEL', 'claude-sonnet-5');
        TestDb::setEnv('DEMO_PER_IP_PER_HOUR', '7');
        TestDb::setEnv('DEMO_DAILY_BUDGET_USD', '1.25');
        (new SettingsRepository(Db::get()))->set(DemoConfig::OVERRIDES_KEY, ['model' => 'claude-opus-4-8']);

        $config = DemoConfig::load();

        self::assertSame('claude-opus-4-8', $config->model);
        self::assertSame('base', $config->sources['model'], 'la base gagne sur l’env');
        self::assertSame(7, $config->perIpPerHour);
        self::assertSame('env', $config->sources['perIpPerHour'], 'l’env gagne sur le fichier');
        self::assertSame(1.25, $config->dailyBudgetUsd);
        self::assertSame(2048, $config->maxTokensPerRequest);
        self::assertSame('fichier', $config->sources['maxTokensPerRequest']);
    }

    #[TestDox('UC-ADM-04-U09 — DemoConfig::load : DEMO_ENABLED 0/false/off/no = éteint, toute autre valeur = allumé ; entier non numérique ignoré')]
    public function testU09EnvironmentParsing(): void
    {
        foreach (['0', 'false', 'OFF', 'no'] as $off) {
            TestDb::setEnv('DEMO_ENABLED', $off);
            self::assertFalse(DemoConfig::load()->enabled, $off);
        }
        foreach (['1', 'true', 'on', 'oui'] as $on) {
            TestDb::setEnv('DEMO_ENABLED', $on);
            self::assertTrue(DemoConfig::load()->enabled, $on);
            self::assertSame('env', DemoConfig::load()->sources['enabled']);
        }

        TestDb::setEnv('DEMO_MAX_TOKENS_PER_REQUEST', 'beaucoup');
        $config = DemoConfig::load();
        self::assertSame(2048, $config->maxTokensPerRequest);
        self::assertSame('fichier', $config->sources['maxTokensPerRequest']);

        TestDb::setEnv('DEMO_PROVIDER', 'mock');
        self::assertSame('mock', DemoConfig::load()->provider);
        self::assertSame('env', DemoConfig::load()->sources['provider']);
    }

    #[TestDox('UC-ADM-04-U10 — DemoConfig::load : valeur de base au mauvais type ignorée champ par champ ; « provider » en base jamais lu')]
    public function testU10InvalidOrForbiddenDatabaseValuesAreIgnored(): void
    {
        (new SettingsRepository(Db::get()))->set(DemoConfig::OVERRIDES_KEY, [
            'provider' => 'mock',
            'enabled' => 'false',
            'model' => '',
            'maxTokensPerRequest' => '4096',
            'dailyBudgetUsd' => 3,
            'perIpPerHour' => 9,
        ]);

        $config = DemoConfig::load();

        self::assertSame('anthropic', $config->provider);
        self::assertSame('fichier', $config->sources['provider']);
        self::assertTrue($config->enabled, 'chaîne "false" ≠ booléen');
        self::assertSame('fichier', $config->sources['enabled']);
        self::assertSame('claude-haiku-4-5-20251001', $config->model, 'modèle vide ignoré');
        self::assertSame(2048, $config->maxTokensPerRequest, 'chaîne ≠ entier');
        self::assertSame(3.0, $config->dailyBudgetUsd, 'entier accepté pour un réel');
        self::assertSame('base', $config->sources['dailyBudgetUsd']);
        self::assertSame(9, $config->perIpPerHour);
    }

    #[TestDox('UC-ADM-04-U11 — DemoConfig::load : base non configurée → couche « base » ignorée sans erreur (fail-safe)')]
    public function testU11LoadFailsSafeWithoutDatabase(): void
    {
        self::service()->update($this->adminId, ['enabled' => false]);
        self::assertFalse(DemoConfig::load()->enabled);

        TestDb::setEnv('DB_HOST', '');
        Db::reset();
        $config = DemoConfig::load();

        self::assertTrue($config->enabled);
        self::assertNotContains('base', $config->sources);
    }

    /**
     * COMPORTEMENT ACTUEL figé (fiche, AN-1) : l'instantané des réglages
     * (GET /api/admin/settings) annonce encore `demo.editableInUi = false`,
     * vestige de la v1 « démo réglée par env », alors que la démo est éditable
     * depuis le chantier A (DemoConfigService). L'IHM n'utilise pas ce champ.
     */
    #[TestDox('UC-ADM-04-U12 — (anomalie AN-1, comportement actuel) PlatformStatus::snapshot annonce demo.editableInUi = false malgré l’édition possible')]
    public function testU12SnapshotStillSaysNotEditableCurrentBehaviour(): void
    {
        self::service()->update($this->adminId, ['model' => 'claude-opus-4-8']);

        $demo = (new PlatformStatus(Db::get()))->snapshot()['demo'];

        self::assertSame('claude-opus-4-8', $demo['model'], 'valeur effective, surcharge comprise');
        self::assertFalse($demo['editableInUi']);
        self::assertArrayNotHasKey('upstreamTimeoutSeconds', $demo, 'instantané incomplet par rapport à /demo-config');
    }
}
