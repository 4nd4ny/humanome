<?php

declare(strict_types=1);

namespace Humanome\Tests;

use Humanome\Db;
use Humanome\Packages\SettingsRepository;
use Humanome\Twin9\ProtocoleRepository;
use Humanome\Twin9\Twin9Config;

/**
 * T3a (ADR-010) — twin9 template store, admin routes, config bounds and the
 * X-Migrate-Token import.
 *
 * SECRECY IMPERATIVE (ADR-010): every template used here is a MADE-UP test
 * fixture — no real Twin_v9 content may ever appear in tests, fixtures,
 * error messages or logs.
 */
final class Twin9ProtocoleTest extends CartographeTestCase
{
    private const TOKEN = 'test-migrate-token-twin9';

    /** Entirely fictional template, invented for the tests. */
    private const FAKE_GABARIT = "Gabarit FICTIF de test.\nBonjour {\$PRENOM}, examine {\$TEXTE_JOURNEE} pour le pôle {\$POLE_ID}.\nRappel: {\$PRENOM} n'est pas {\$POLE_ID}.";

    protected function setUp(): void
    {
        parent::setUp(); // wipes users (+ credit cascades) and audit_events
        TestDb::setEnv('MIGRATE_TOKEN', self::TOKEN);
        $pdo = Db::get();
        $pdo->exec('DELETE FROM twin9_protocole_versions');
        $pdo->exec('DELETE FROM twin9_protocole');
        $pdo->exec("DELETE FROM settings WHERE name = 'twin9_config'");
    }

    // ==================================================================
    // Import (X-Migrate-Token, pattern import-prompt-package)
    // ==================================================================

    public function testImportRequiresToken(): void
    {
        $body = ['files' => ['fictif/01-essai' => self::FAKE_GABARIT]];

        // Endpoint "does not exist" while MIGRATE_TOKEN is unconfigured.
        TestDb::setEnv('MIGRATE_TOKEN', '');
        $response = $this->request('POST', '/api/admin/twin9/import', $body);
        self::assertSame(404, $response->getStatusCode());

        // Wrong or missing header: forbidden.
        TestDb::setEnv('MIGRATE_TOKEN', self::TOKEN);
        $response = $this->request('POST', '/api/admin/twin9/import', $body);
        self::assertSame(403, $response->getStatusCode());
        $response = $this->request('POST', '/api/admin/twin9/import', $body, ['X-Migrate-Token' => 'wrong']);
        self::assertSame(403, $response->getStatusCode());

        // Nothing was written.
        self::assertSame(0, (int) Db::get()->query('SELECT COUNT(*) FROM twin9_protocole')->fetchColumn());
    }

    public function testImportUpsertsVersionsAndEnables(): void
    {
        $config = new Twin9Config(new SettingsRepository(Db::get()));
        self::assertFalse($config->isEnabled(), 'disabled until imported');

        $response = $this->request('POST', '/api/admin/twin9/import', [
            'files' => [
                'fictif/01-essai' => self::FAKE_GABARIT,
                'fictif/02-autre' => 'Deuxième gabarit FICTIF : {$SUJET}.',
            ],
            'config' => ['jury' => ['taille' => 5], 'seuils_consensus' => [0.5, 0.8]],
        ], ['X-Migrate-Token' => self::TOKEN]);
        self::assertSame(200, $response->getStatusCode(), (string) $response->getBody());
        self::assertSame(['imported' => 2], self::json($response));

        self::assertTrue($config->isEnabled(), 'import flips enabled=true');
        self::assertSame(['taille' => 5], $config->pipeline()['jury']);

        // Idempotent re-import: same content, no version archived.
        $response = $this->request('POST', '/api/admin/twin9/import', [
            'files' => ['fictif/01-essai' => self::FAKE_GABARIT],
        ], ['X-Migrate-Token' => self::TOKEN]);
        self::assertSame(200, $response->getStatusCode());
        self::assertSame(0, (int) Db::get()->query('SELECT COUNT(*) FROM twin9_protocole_versions')->fetchColumn());

        // Changed content: previous content archived as version 1.
        $response = $this->request('POST', '/api/admin/twin9/import', [
            'files' => ['fictif/01-essai' => 'Gabarit FICTIF modifié : {$PRENOM}.'],
        ], ['X-Migrate-Token' => self::TOKEN]);
        self::assertSame(200, $response->getStatusCode());
        $stmt = Db::get()->query("SELECT version, content FROM twin9_protocole_versions WHERE name = 'fictif/01-essai'");
        $versions = $stmt->fetchAll();
        self::assertCount(1, $versions);
        self::assertSame(1, (int) $versions[0]['version']);
        self::assertSame(self::FAKE_GABARIT, (string) $versions[0]['content']);
    }

    // ==================================================================
    // Admin routes: authz
    // ==================================================================

    public function testRoutesRequireAdminRole(): void
    {
        $admin = $this->registerAs('admin@example.org', 'Root Admin', ['admin']);
        $this->as_($admin, 'PUT', '/api/twin9/admin/protocole/fictif/01-essai', ['content' => self::FAKE_GABARIT]);

        // Visitor (no session): 401 everywhere.
        $this->cookieSid = null;
        self::assertSame(401, $this->request('GET', '/api/twin9/admin/protocole')->getStatusCode());
        self::assertSame(401, $this->request('GET', '/api/twin9/admin/config')->getStatusCode());

        // Promptologue: 403 — the Golden Twin_v9 templates are admin-only
        // (ADR-010 §2), including the content read.
        $promptologue = $this->registerAs('promptologue@example.org', 'Promteur', ['promptologue']);
        self::assertSame(403, $this->as_($promptologue, 'GET', '/api/twin9/admin/protocole')->getStatusCode());
        $read = $this->as_($promptologue, 'GET', '/api/twin9/admin/protocole/fictif/01-essai');
        self::assertSame(403, $read->getStatusCode());
        self::assertStringNotContainsString('FICTIF', (string) $read->getBody(), 'no template fragment in the refusal');
        self::assertSame(403, $this->as_($promptologue, 'PUT', '/api/twin9/admin/protocole/fictif/01-essai', ['content' => 'x {$A}'])->getStatusCode());
        self::assertSame(403, $this->as_($promptologue, 'GET', '/api/twin9/admin/config')->getStatusCode());
        self::assertSame(403, $this->as_($promptologue, 'POST', '/api/twin9/admin/tester', ['name' => 'fictif/01-essai'])->getStatusCode());
    }

    // ==================================================================
    // Admin CRUD: extraction, list without content, versions
    // ==================================================================

    public function testPutExtractsVariablesAndListsWithoutContent(): void
    {
        $admin = $this->registerAs('admin@example.org', 'Root Admin', ['admin']);

        $put = $this->as_($admin, 'PUT', '/api/twin9/admin/protocole/fictif/01-essai', ['content' => self::FAKE_GABARIT]);
        self::assertSame(200, $put->getStatusCode(), (string) $put->getBody());
        $body = self::json($put);
        self::assertSame('created', $body['status']);
        // Order of first appearance, duplicates collapsed ({$PRENOM} twice).
        self::assertSame(['PRENOM', 'TEXTE_JOURNEE', 'POLE_ID'], $body['variables']);

        // List: metadata only, never the content.
        $list = self::json($this->as_($admin, 'GET', '/api/twin9/admin/protocole'));
        self::assertCount(1, $list['protocole']);
        $entry = $list['protocole'][0];
        self::assertSame('fictif/01-essai', $entry['name']);
        self::assertSame(mb_strlen(self::FAKE_GABARIT), $entry['longueur']);
        self::assertSame(['PRENOM', 'TEXTE_JOURNEE', 'POLE_ID'], $entry['variables']);
        self::assertArrayHasKey('updated_at', $entry);
        self::assertArrayNotHasKey('content', $entry);

        // Detail (admin-only content read) returns the content.
        $detail = self::json($this->as_($admin, 'GET', '/api/twin9/admin/protocole/fictif/01-essai'));
        self::assertSame(self::FAKE_GABARIT, $detail['content']);

        // Unknown template: generic 404.
        self::assertSame(404, $this->as_($admin, 'GET', '/api/twin9/admin/protocole/fictif/inconnu')->getStatusCode());
    }

    public function testPutValidation(): void
    {
        $admin = $this->registerAs('admin@example.org', 'Root Admin', ['admin']);

        self::assertSame(422, $this->as_($admin, 'PUT', '/api/twin9/admin/protocole/fictif/01-essai', ['content' => ''])->getStatusCode());
        self::assertSame(422, $this->as_($admin, 'PUT', '/api/twin9/admin/protocole/fictif/01-essai', ['content' => '   '])->getStatusCode());
        $huge = str_repeat('a', 262144);
        self::assertSame(422, $this->as_($admin, 'PUT', '/api/twin9/admin/protocole/fictif/01-essai', ['content' => $huge])->getStatusCode());
        // Invalid hierarchical name.
        self::assertSame(422, $this->as_($admin, 'PUT', '/api/twin9/admin/protocole/fictif//double', ['content' => 'x {$A}'])->getStatusCode());
    }

    public function testEditArchivesVersions(): void
    {
        $admin = $this->registerAs('admin@example.org', 'Root Admin', ['admin']);
        $name = 'fictif/01-essai';

        $this->as_($admin, 'PUT', '/api/twin9/admin/protocole/' . $name, ['content' => 'V1 fictif {$A}']);
        $this->as_($admin, 'PUT', '/api/twin9/admin/protocole/' . $name, ['content' => 'V2 fictif {$A} {$B}']);
        $put3 = $this->as_($admin, 'PUT', '/api/twin9/admin/protocole/' . $name, ['content' => 'V3 fictif {$C}']);
        self::assertSame('updated', self::json($put3)['status']);

        $versions = self::json($this->as_($admin, 'GET', '/api/twin9/admin/protocole/' . $name . '/versions'));
        self::assertSame($name, $versions['name']);
        self::assertSame([2, 1], array_column($versions['versions'], 'version'), 'most recent first');
        self::assertSame([['A', 'B'], ['A']], array_column($versions['versions'], 'variables'));
        self::assertArrayNotHasKey('content', $versions['versions'][0], 'history list is metadata only');

        // Unchanged PUT: no-op, no new version.
        $again = $this->as_($admin, 'PUT', '/api/twin9/admin/protocole/' . $name, ['content' => 'V3 fictif {$C}']);
        self::assertSame('unchanged', self::json($again)['status']);
        self::assertSame(2, (int) Db::get()->query('SELECT COUNT(*) FROM twin9_protocole_versions')->fetchColumn());

        self::assertSame(404, $this->as_($admin, 'GET', '/api/twin9/admin/protocole/fictif/inconnu/versions')->getStatusCode());
    }

    // ==================================================================
    // Rendering (tester bench) — missing variables stay verbatim
    // ==================================================================

    public function testTesterRendersAndReportsUnresolved(): void
    {
        $admin = $this->registerAs('admin@example.org', 'Root Admin', ['admin']);
        $this->as_($admin, 'PUT', '/api/twin9/admin/protocole/fictif/01-essai', ['content' => self::FAKE_GABARIT]);

        $response = $this->as_($admin, 'POST', '/api/twin9/admin/tester', [
            'name' => 'fictif/01-essai',
            'variables' => ['PRENOM' => 'Ada', 'POLE_ID' => 'pole-7'],
        ]);
        self::assertSame(200, $response->getStatusCode(), (string) $response->getBody());
        $body = self::json($response);

        self::assertStringContainsString('Bonjour Ada', $body['rendu']);
        self::assertStringContainsString('pôle pole-7', $body['rendu']);
        // Non-strict like templates.py: the absent variable stays verbatim.
        self::assertStringContainsString('{$TEXTE_JOURNEE}', $body['rendu']);
        self::assertSame(['TEXTE_JOURNEE'], $body['non_resolues']);

        self::assertSame(404, $this->as_($admin, 'POST', '/api/twin9/admin/tester', ['name' => 'fictif/inconnu'])->getStatusCode());
        self::assertSame(422, $this->as_($admin, 'POST', '/api/twin9/admin/tester', ['variables' => []])->getStatusCode());
    }

    public function testExtractionRegexMatchesPythonTemplates(): void
    {
        // {$VAR} with VAR = [A-Z_][A-Z0-9_]* — lowercase/edge forms ignored.
        $content = 'a {$OK} b {$_AUSSI_OK2} c {$pas_ok} d {$2PAS} e {VAR} f {$OK}';
        self::assertSame(['OK', '_AUSSI_OK2'], ProtocoleRepository::extractVariables($content));
    }

    // ==================================================================
    // Config: defaults, bounds (422), public view with margin
    // ==================================================================

    public function testConfigDefaultsAndBoundedUpdate(): void
    {
        $admin = $this->registerAs('admin@example.org', 'Root Admin', ['admin']);

        $config = self::json($this->as_($admin, 'GET', '/api/twin9/admin/config'));
        // Margin default 1.1 (owner decision: +10 % covers PayPal fees +
        // hosting/domain/free-demo Haiku); packs start at 10 USD so the PayPal
        // FIXED fee stays well below the margin.
        self::assertSame(1.1, $config['marge']);
        self::assertFalse($config['enabled']);
        self::assertSame([10, 20, 50], array_column($config['packs'], 'montant_usd'));
        self::assertSame([1, 5], $config['modeles']['claude-haiku-4-5-20251001']['prix_usd_mtok']);
        self::assertSame(['taggers', 'rapide'], $config['modeles']['claude-haiku-4-5-20251001']['etages']);
        self::assertSame(['taggers', 'rapide', 'tribunal'], $config['modeles']['claude-sonnet-5']['etages']);
        self::assertSame(['tribunal'], $config['modeles']['claude-opus-4-8']['etages']);

        // Out-of-bounds updates: 422, nothing persisted.
        foreach ([
            ['marge' => 0.5],
            ['marge' => 5.1],
            ['marge' => 'deux'],
            ['packs' => []],
            ['packs' => [['montant_usd' => 0.5, 'libelle' => 'trop petit']]],
            ['packs' => [['montant_usd' => 150, 'libelle' => 'trop gros']]],
            ['packs' => [['montant_usd' => 5, 'libelle' => '']]],
            ['modeles' => []],
            ['modeles' => ['m' => ['prix_usd_mtok' => [0, 5], 'etages' => ['taggers']]]],
            ['modeles' => ['m' => ['prix_usd_mtok' => [1, 5], 'etages' => ['penthouse']]]],
            ['enabled' => 'oui'],
            ['inconnue' => true],
        ] as $invalid) {
            $response = $this->as_($admin, 'PUT', '/api/twin9/admin/config', $invalid);
            self::assertSame(422, $response->getStatusCode(), json_encode($invalid));
        }
        self::assertSame(1.1, self::json($this->as_($admin, 'GET', '/api/twin9/admin/config'))['marge']);

        // Valid partial update persists.
        $response = $this->as_($admin, 'PUT', '/api/twin9/admin/config', ['marge' => 2.5]);
        self::assertSame(200, $response->getStatusCode(), (string) $response->getBody());
        self::assertSame(2.5, self::json($this->as_($admin, 'GET', '/api/twin9/admin/config'))['marge']);
    }

    public function testPublicViewAppliesMarginAndPaypalFlag(): void
    {
        $config = new Twin9Config(new SettingsRepository(Db::get()));
        $config->update(['marge' => 2.0]);

        TestDb::setEnv('PAYPAL_CLIENT_ID', '');
        $view = $config->publicView();
        self::assertFalse($view['enabled']);
        self::assertFalse($view['paypalConfigured']);
        // List price [3, 15] × margin 2 — the raw price and the margin are absent.
        self::assertSame([6.0, 30.0], $view['modeles']['claude-sonnet-5']['prix_usd_mtok']);
        self::assertArrayNotHasKey('marge', $view);

        TestDb::setEnv('PAYPAL_CLIENT_ID', 'sandbox-client-id');
        self::assertTrue($config->publicView()['paypalConfigured']);

        // Per-token charged price for the debit path: micro-USD, ceil.
        self::assertSame([6, 30], $config->prixMicrousdParToken('claude-sonnet-5'));
        self::assertNull($config->prixMicrousdParToken('modele-inconnu'));
    }
}
