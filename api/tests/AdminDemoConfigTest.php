<?php

declare(strict_types=1);

namespace Humanome\Tests;

use Humanome\Db;
use Humanome\Env;
use Humanome\Llm\DemoConfig;
use Humanome\Packages\SettingsRepository;

/**
 * Chantier A — public-demo settings editable from the admin session API
 * (GET/PUT/DELETE /api/admin/demo-config). Precedence: base (settings
 * demo_overrides) > env (DEMO_*) > fichier (config/demo.php) > defaut.
 * The Anthropic API key is never exposed (boolean only).
 */
final class AdminDemoConfigTest extends AdminTestCase
{
    private const API_KEY = 'sk-ant-secret-key-never-in-a-response';

    protected function setUp(): void
    {
        parent::setUp(); // wipes users, settings (demo_overrides included)

        // Deterministic environment: explicit empty strings win over any
        // lower env layer, so every field resolves from config/demo.php.
        foreach ([
            'DEMO_ENABLED', 'DEMO_PROVIDER', 'DEMO_MODEL',
            'DEMO_MAX_TOKENS_PER_REQUEST', 'DEMO_MAX_INPUT_CHARS',
            'DEMO_PER_IP_PER_HOUR', 'DEMO_DAILY_GLOBAL_TOKENS',
            'DEMO_DAILY_BUDGET_USD', 'DEMO_POW_DIFFICULTY_BITS',
            'DEMO_UPSTREAM_TIMEOUT',
        ] as $key) {
            TestDb::setEnv($key, '');
        }
        TestDb::setEnv('ANTHROPIC_API_KEY', self::API_KEY);
    }

    public function testRoleGuard(): void
    {
        $this->cookieSid = null;
        self::assertSame(401, $this->request('GET', '/api/admin/demo-config')->getStatusCode());

        $learner = $this->registerAs('eleve@example.org', 'Élève', ['apprenant']);
        self::assertSame(403, $this->as_($learner, 'GET', '/api/admin/demo-config')->getStatusCode());
        self::assertSame(403, $this->as_($learner, 'PUT', '/api/admin/demo-config', ['enabled' => false])->getStatusCode());
        self::assertSame(403, $this->as_($learner, 'DELETE', '/api/admin/demo-config')->getStatusCode());
    }

    public function testGetEffectiveValuesAndSources(): void
    {
        $admin = $this->registerAdmin();

        $response = $this->as_($admin, 'GET', '/api/admin/demo-config');
        self::assertSame(200, $response->getStatusCode(), (string) $response->getBody());
        $data = self::json($response);

        // Effective values come from config/demo.php (env cleared in setUp).
        self::assertTrue($data['effective']['enabled']);
        self::assertSame('anthropic', $data['effective']['provider']);
        self::assertSame('claude-haiku-4-5-20251001', $data['effective']['model']);
        self::assertSame(2048, $data['effective']['maxTokensPerRequest']);
        self::assertSame('fichier', $data['sources']['model']);
        self::assertSame('fichier', $data['sources']['enabled']);

        // Model whitelist for the UI dropdown + free-text option.
        self::assertContains('claude-haiku-4-5-20251001', $data['allowedModels']);

        // The API key is a boolean, never a value.
        self::assertTrue($data['apiKeyConfigured']);
        self::assertStringNotContainsString(self::API_KEY, (string) $response->getBody());
    }

    public function testEnvironmentWinsOverFileWhenNoOverride(): void
    {
        $admin = $this->registerAdmin();
        TestDb::setEnv('DEMO_MODEL', 'claude-sonnet-5');
        TestDb::setEnv('DEMO_ENABLED', '0');

        $data = self::json($this->as_($admin, 'GET', '/api/admin/demo-config'));
        self::assertSame('claude-sonnet-5', $data['effective']['model']);
        self::assertSame('env', $data['sources']['model']);
        self::assertFalse($data['effective']['enabled']);
        self::assertSame('env', $data['sources']['enabled']);

        // Untouched fields still come from the file.
        self::assertSame('fichier', $data['sources']['perIpPerHour']);
    }

    public function testPutMergesOverridesAndBaseWinsOverEnv(): void
    {
        $admin = $this->registerAdmin();
        TestDb::setEnv('DEMO_MODEL', 'claude-sonnet-5'); // env says sonnet…

        $put = $this->as_($admin, 'PUT', '/api/admin/demo-config', [
            'model' => 'claude-opus-4-8',
            'maxTokensPerRequest' => 4096,
        ]);
        self::assertSame(200, $put->getStatusCode(), (string) $put->getBody());
        $data = self::json($put);

        // …but the database override wins (base > env > fichier > defaut).
        self::assertSame('claude-opus-4-8', $data['effective']['model']);
        self::assertSame('base', $data['sources']['model']);
        self::assertSame(4096, $data['effective']['maxTokensPerRequest']);
        self::assertSame('base', $data['sources']['maxTokensPerRequest']);

        // Immediate effect on what the demo proxy actually loads.
        $config = DemoConfig::load();
        self::assertSame('claude-opus-4-8', $config->model);
        self::assertSame(4096, $config->maxTokensPerRequest);

        // Partial PUT: a second call merges, it does not erase prior fields.
        $this->as_($admin, 'PUT', '/api/admin/demo-config', ['perIpPerHour' => 5]);
        $config = DemoConfig::load();
        self::assertSame('claude-opus-4-8', $config->model);
        self::assertSame(5, $config->perIpPerHour);

        // Audit trail (§6.5): field names only, never values.
        $audit = self::lastAudit('demo_config_updated');
        self::assertNotNull($audit);
        self::assertSame(['perIpPerHour'], $audit['details']['fields']);
    }

    public function testToggleEnabledFromTheAdminUi(): void
    {
        $admin = $this->registerAdmin();
        self::assertTrue(DemoConfig::load()->enabled);

        // One tap on the phone: off…
        $off = $this->as_($admin, 'PUT', '/api/admin/demo-config', ['enabled' => false]);
        self::assertSame(200, $off->getStatusCode());
        self::assertFalse(self::json($off)['effective']['enabled']);
        self::assertFalse(DemoConfig::load()->enabled);

        // …and on again before the presentation.
        $on = $this->as_($admin, 'PUT', '/api/admin/demo-config', ['enabled' => true]);
        self::assertTrue(self::json($on)['effective']['enabled']);
        self::assertTrue(DemoConfig::load()->enabled);
    }

    public function testPutRejectsInvalidValues(): void
    {
        $admin = $this->registerAdmin();

        $invalid = [
            'out-of-bounds maxTokens (low)' => ['maxTokensPerRequest' => 100],
            'out-of-bounds maxTokens (high)' => ['maxTokensPerRequest' => 32000],
            'out-of-bounds budget' => ['dailyBudgetUsd' => 5000],
            'negative budget' => ['dailyBudgetUsd' => -1],
            'out-of-bounds powBits' => ['powDifficultyBits' => 30],
            'out-of-bounds perIpPerHour' => ['perIpPerHour' => 0],
            'out-of-bounds dailyGlobalTokens' => ['dailyGlobalTokens' => 5000],
            'out-of-bounds timeout' => ['upstreamTimeoutSeconds' => 999],
            'empty model' => ['model' => '  '],
            'weird model' => ['model' => 'pas un modèle !'],
            'wrong type enabled' => ['enabled' => 'oui'],
            'wrong type int' => ['maxTokensPerRequest' => '2048'],
            'unknown field' => ['budget' => 3],
            'provider not editable' => ['provider' => 'mock'],
            'empty body' => [],
        ];
        foreach ($invalid as $label => $body) {
            $response = $this->as_($admin, 'PUT', '/api/admin/demo-config', $body);
            self::assertSame(422, $response->getStatusCode(), $label . ': ' . (string) $response->getBody());
        }

        // Nothing was stored: the demo still runs on the file values.
        self::assertSame('claude-haiku-4-5-20251001', DemoConfig::load()->model);
        self::assertSame(2048, DemoConfig::load()->maxTokensPerRequest);
    }

    public function testFreeTextModelIsAcceptedBeyondTheWhitelist(): void
    {
        $admin = $this->registerAdmin();

        // A model id that is NOT in allowedModels must pass (« autre… »).
        $response = $this->as_($admin, 'PUT', '/api/admin/demo-config', [
            'model' => 'claude-fable-5',
        ]);
        self::assertSame(200, $response->getStatusCode(), (string) $response->getBody());
        self::assertSame('claude-fable-5', DemoConfig::load()->model);
    }

    public function testDeleteResetsToEnvAndFile(): void
    {
        $admin = $this->registerAdmin();
        TestDb::setEnv('DEMO_MODEL', 'claude-sonnet-5');

        $this->as_($admin, 'PUT', '/api/admin/demo-config', ['model' => 'claude-opus-4-8', 'enabled' => false]);
        self::assertSame('claude-opus-4-8', DemoConfig::load()->model);

        $reset = $this->as_($admin, 'DELETE', '/api/admin/demo-config');
        self::assertSame(200, $reset->getStatusCode(), (string) $reset->getBody());
        $data = self::json($reset);

        // Back to env for model, file for the rest.
        self::assertSame('claude-sonnet-5', $data['effective']['model']);
        self::assertSame('env', $data['sources']['model']);
        self::assertTrue($data['effective']['enabled']);
        self::assertSame('fichier', $data['sources']['enabled']);
        self::assertSame('claude-sonnet-5', DemoConfig::load()->model);

        self::assertNotNull(self::lastAudit('demo_config_reset'));
    }

    public function testApiKeyConfiguredBooleanFollowsEnv(): void
    {
        $admin = $this->registerAdmin();

        TestDb::setEnv('ANTHROPIC_API_KEY', '');
        $data = self::json($this->as_($admin, 'GET', '/api/admin/demo-config'));
        self::assertFalse($data['apiKeyConfigured']);

        TestDb::setEnv('ANTHROPIC_API_KEY', self::API_KEY);
        $data = self::json($this->as_($admin, 'GET', '/api/admin/demo-config'));
        self::assertTrue($data['apiKeyConfigured']);
    }

    /**
     * Fail-safe : si la base est absente (non configurée) ou injoignable,
     * DemoConfig::load() ne lève rien et retombe en silence sur env/fichier —
     * la démo publique ne répond jamais 500 à cause de la couche « base ».
     */
    public function testLoadFailsSafeWhenDatabaseIsGone(): void
    {
        $admin = $this->registerAdmin();
        $this->as_($admin, 'PUT', '/api/admin/demo-config', ['model' => 'claude-opus-4-8']);
        self::assertSame('base', DemoConfig::load()->sources['model']);

        $originalHost = Env::get('DB_HOST');

        // 1. Base non configurée (DB_HOST vide) : couche base ignorée,
        //    retour aux valeurs fichier (env DEMO_* vidé dans setUp).
        TestDb::setEnv('DB_HOST', '');
        $config = DemoConfig::load(); // ne doit lever aucune exception
        self::assertSame('claude-haiku-4-5-20251001', $config->model);
        self::assertSame('fichier', $config->sources['model']);
        self::assertNotContains('base', $config->sources);

        // 2. Base configurée mais injoignable (hôte inexistant) : même
        //    dégradation silencieuse (catch \Throwable dans databaseOverrides).
        TestDb::setEnv('DB_HOST', 'mysql-injoignable.invalid');
        Db::reset(); // force une vraie tentative de connexion au prochain get()
        $config = DemoConfig::load(); // ne doit lever aucune exception
        self::assertSame('claude-haiku-4-5-20251001', $config->model);
        self::assertSame('fichier', $config->sources['model']);
        self::assertNotContains('base', $config->sources);

        // 3. Base de retour : l'override réapparaît, rien n'a été perdu.
        TestDb::setEnv('DB_HOST', $originalHost);
        TestDb::overrideEnv();
        $config = DemoConfig::load();
        self::assertSame('claude-opus-4-8', $config->model);
        self::assertSame('base', $config->sources['model']);
    }

    /**
     * CSRF sur CES routes précisément : une session admin valide mais sans
     * X-CSRF-Token -> 403 et AUCUNE mutation (le harnais as_() envoie
     * toujours le jeton, d'où ce test direct sans en-tête).
     */
    public function testMutationWithoutCsrfTokenIsForbidden(): void
    {
        $admin = $this->registerAdmin();

        // Un override légitime posé avec le jeton, comme état préalable.
        $this->as_($admin, 'PUT', '/api/admin/demo-config', ['model' => 'claude-opus-4-8']);
        self::assertSame('claude-opus-4-8', DemoConfig::load()->model);

        // PUT avec le cookie de session admin mais SANS X-CSRF-Token.
        $this->cookieSid = $admin['sid'];
        $put = $this->request('PUT', '/api/admin/demo-config', ['enabled' => false]);
        self::assertSame(403, $put->getStatusCode(), (string) $put->getBody());

        // La mutation n'a pas eu lieu : enabled inchangé (jamais « base »).
        $config = DemoConfig::load();
        self::assertTrue($config->enabled);
        self::assertNotSame('base', $config->sources['enabled']);

        // DELETE sans jeton : 403 et l'override posé avant reste en place.
        $this->cookieSid = $admin['sid'];
        $delete = $this->request('DELETE', '/api/admin/demo-config');
        self::assertSame(403, $delete->getStatusCode());
        self::assertSame('claude-opus-4-8', DemoConfig::load()->model);
    }

    /**
     * Défense en profondeur : une clé 'provider' insérée DIRECTEMENT dans
     * settings.demo_overrides (tampering, ancien client) est ignorée par
     * DemoConfig::load() — le fournisseur ne se pilote jamais depuis la base,
     * tandis que les overrides légitimes voisins restent pris en compte.
     */
    public function testProviderInjectedInDatabaseIsIgnored(): void
    {
        (new SettingsRepository(self::$pdo))->set(DemoConfig::OVERRIDES_KEY, [
            'provider' => 'mock',
            'enabled' => false,
        ]);

        $config = DemoConfig::load();
        self::assertSame('anthropic', $config->provider); // fichier, pas la base
        self::assertSame('fichier', $config->sources['provider']);
        // …le champ légitime du même override est, lui, bien honoré.
        self::assertFalse($config->enabled);
        self::assertSame('base', $config->sources['enabled']);

        // Le GET admin raconte la même vérité.
        $admin = $this->registerAdmin();
        $data = self::json($this->as_($admin, 'GET', '/api/admin/demo-config'));
        self::assertSame('anthropic', $data['effective']['provider']);
        self::assertSame('fichier', $data['sources']['provider']);
    }

    /**
     * Audit sans valeurs (§6.5) : le JSON `details` brut de l'événement
     * demo_config_updated contient les NOMS de champs, jamais les valeurs
     * soumises (ni l'identifiant de modèle, ni un plafond numérique).
     */
    public function testAuditNeverContainsValues(): void
    {
        $admin = $this->registerAdmin();

        $put = $this->as_($admin, 'PUT', '/api/admin/demo-config', [
            'model' => 'claude-opus-4-8',
            'maxTokensPerRequest' => 4096,
        ]);
        self::assertSame(200, $put->getStatusCode(), (string) $put->getBody());

        $stmt = self::$pdo->prepare(
            "SELECT details FROM audit_events WHERE type = 'demo_config_updated' ORDER BY id DESC LIMIT 1"
        );
        $stmt->execute();
        $raw = (string) $stmt->fetchColumn();
        self::assertNotSame('', $raw);

        // Les noms de champs, oui…
        self::assertStringContainsString('model', $raw);
        self::assertStringContainsString('maxTokensPerRequest', $raw);
        // …les valeurs soumises, jamais.
        self::assertStringNotContainsString('claude-opus-4-8', $raw);
        self::assertStringNotContainsString('4096', $raw);
    }
}
