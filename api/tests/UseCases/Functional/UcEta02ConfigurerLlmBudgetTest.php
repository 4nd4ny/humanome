<?php

declare(strict_types=1);

namespace Humanome\Tests\UseCases\Functional;

use Humanome\Db;
use Humanome\Etablissement\ConfigRepository;
use Humanome\Keys\KeyVault;
use Humanome\Tests\MasseTestCase;
use Humanome\Tests\UseCases\Support\EtaSupport;
use PHPUnit\Framework\Attributes\TestDox;

/**
 * UC-ETA-02 — Configurer le moteur LLM, le budget et le jeton worker :
 * tests FONCTIONNELS (API).
 *
 * Fiche : docs/cas-utilisation/etablissement/UC-ETA-02-configurer-llm-budget.md
 *
 * L'établissement règle sa configuration par PUT/GET /api/etablissement/config
 * et génère son jeton de runner par POST /api/etablissement/worker-token ; les
 * effets sont observés par l'interface publique (projection, route worker,
 * tableau de run) et, pour les garanties de stockage, par une lecture de
 * contrôle en base. Les ticks du worker sont simulés (fournisseur mock).
 */
final class UcEta02ConfigurerLlmBudgetTest extends MasseTestCase
{
    use EtaSupport;

    private const ENDPOINT = 'http://10.0.0.12:11434';

    #[TestDox('UC-ETA-02-F01 — nominal : service humanome + plafond → projection renvoyée, audit sans secret')]
    public function testF01NominalHumanomeServiceWithBudgetCap(): void
    {
        $etab = $this->registerEtablissement();

        // 1. Projection par défaut (aucune configuration encore).
        $initial = self::json($this->as_($etab, 'GET', '/api/etablissement/config'));
        self::assertSame('humanome', $initial['provider']);
        self::assertEquals(0.0, $initial['budgetCapUsd']);

        // 2-4. Enregistrement : service humanome, plafond 50 $.
        $put = $this->as_($etab, 'PUT', '/api/etablissement/config', ['provider' => 'humanome', 'budgetCapUsd' => 50]);
        self::assertSame(200, $put->getStatusCode(), (string) $put->getBody());
        $expected = [
            'provider' => 'humanome',
            'endpointUrl' => null,
            'model' => null,
            'budgetCapUsd' => 50.0,
            'spentUsd' => 0.0,
            'hasApiKey' => false,
            'hasWorkerToken' => false,
        ];
        self::assertEquals($expected, self::json($put));
        self::assertEquals($expected, self::json($this->as_($etab, 'GET', '/api/etablissement/config')));

        // 5. Audit : fournisseur et plafond seulement.
        $audit = self::lastAudit('etablissement_config_updated');
        self::assertSame($etab['id'], $audit['userId']);
        self::assertEquals(['provider' => 'humanome', 'budgetCapUsd' => 50], $audit['details']);
    }

    #[TestDox('UC-ETA-02-F02 — A1 : infrastructure propre (URL, modèle, clé) → clé chiffrée, jamais relue, déchiffrable par le worker')]
    public function testF02OwnEndpointKeyIsEncryptedAndNeverReturned(): void
    {
        $etab = $this->registerEtablissement();

        $put = $this->as_($etab, 'PUT', '/api/etablissement/config', [
            'provider' => 'endpoint',
            'endpointUrl' => self::ENDPOINT,
            'apiKey' => 'sk-etab-tres-secrete',
            'model' => '  llama3:70b  ',
            'budgetCapUsd' => 20.5,
        ]);

        self::assertSame(200, $put->getStatusCode(), (string) $put->getBody());
        $config = self::json($put);
        self::assertSame('endpoint', $config['provider']);
        self::assertSame(self::ENDPOINT, $config['endpointUrl']);
        self::assertSame('llama3:70b', $config['model'], 'modèle nettoyé');
        self::assertTrue($config['hasApiKey']);
        $get = $this->as_($etab, 'GET', '/api/etablissement/config');
        foreach ([$put, $get] as $response) {
            self::assertStringNotContainsString('sk-etab-tres-secrete', (string) $response->getBody());
        }
        $rawAudit = (string) Db::get()->query("SELECT details FROM audit_events WHERE type = 'etablissement_config_updated'")->fetchColumn();
        self::assertStringNotContainsString('sk-etab', $rawAudit);
        self::assertStringNotContainsString('sk-etab', (string) Db::get()->query('SELECT encrypted_key FROM etablissement_config')->fetchColumn());
        self::assertSame('sk-etab-tres-secrete', (new ConfigRepository(Db::get(), KeyVault::masterKeyFromEnv()))->revealApiKey($etab['id']));
    }

    #[TestDox('UC-ETA-02-F03 — A2 : clé conservée si absente, retour au service humanome (URL/modèle effacés, clé gardée), effacement par ""')]
    public function testF03KeyLifecycleAcrossProviderSwitch(): void
    {
        $etab = $this->registerEtablissement();
        $repo = new ConfigRepository(Db::get(), KeyVault::masterKeyFromEnv());
        $this->configure($etab, 10.0, ['provider' => 'endpoint', 'endpointUrl' => self::ENDPOINT, 'apiKey' => 'sk-a', 'model' => 'llama3']);

        // Corps envoyé par le site en mode humanome : ni URL, ni modèle, ni clé.
        $back = self::json($this->as_($etab, 'PUT', '/api/etablissement/config', ['provider' => 'humanome', 'budgetCapUsd' => 10]));
        self::assertNull($back['endpointUrl']);
        self::assertNull($back['model']);
        self::assertTrue($back['hasApiKey'], 'la clé chiffrée reste stockée tant qu’elle n’est pas effacée');
        self::assertSame('sk-a', $repo->revealApiKey($etab['id']));

        $erased = self::json($this->as_($etab, 'PUT', '/api/etablissement/config', ['provider' => 'humanome', 'apiKey' => '', 'budgetCapUsd' => 10]));
        self::assertFalse($erased['hasApiKey']);
        self::assertNull(Db::get()->query('SELECT encrypted_key FROM etablissement_config')->fetchColumn());
    }

    #[TestDox('UC-ETA-02-F04 — A3 : seule une HAUSSE du plafond réactive les jobs « budget dépassé » (run de nouveau actif)')]
    public function testF04RaisingTheCapReactivatesBudgetExceededWork(): void
    {
        $etab = $this->registerEtablissement();
        $this->configure($etab, 0.01); // sous le coût estimé d'un seul appel
        $cohorte = $this->createCohorte($etab);
        $this->enrolLearner($cohorte['code'], $cohorte['id'], 1, ['2026-01-05', '2026-01-06']);
        $run = $this->launchRun($etab, $cohorte['id']);

        $counters = $this->tick();
        self::assertSame(0, $this->provider->calls, 'aucun appel au-delà du plafond');
        self::assertGreaterThan(0, $counters['budgetBlocked']);
        $board = self::json($this->as_($etab, 'GET', '/api/etablissement/runs/' . $run['runId']));
        self::assertSame('budget_exceeded', $board['status']);
        self::assertSame(2, $board['jobs']['budget_exceeded']);

        // Même plafond ré-enregistré : pas de réactivation.
        $this->configure($etab, 0.01);
        self::assertSame('budget_exceeded', self::json($this->as_($etab, 'GET', '/api/etablissement/runs/' . $run['runId']))['status']);

        // Hausse : les jobs repartent en file, le run redevient actif, puis aboutit.
        $this->configure($etab, 50.0);
        $board = self::json($this->as_($etab, 'GET', '/api/etablissement/runs/' . $run['runId']));
        self::assertSame('active', $board['status']);
        self::assertSame(2, $board['jobs']['queued']);
        $this->tickUntilDrained();
        self::assertSame('done', self::json($this->as_($etab, 'GET', '/api/etablissement/runs/' . $run['runId']))['status']);
    }

    #[TestDox('UC-ETA-02-F05 — A4 : jeton worker en clair une seule fois (no-store), haché, utilisable, rotation qui invalide l’ancien')]
    public function testF05WorkerTokenShownOnceThenRotated(): void
    {
        $etab = $this->registerEtablissement();
        $this->configure($etab, 10.0, ['provider' => 'endpoint', 'endpointUrl' => self::ENDPOINT, 'model' => 'llama3']);

        $response = $this->as_($etab, 'POST', '/api/etablissement/worker-token');
        self::assertSame(201, $response->getStatusCode());
        self::assertSame('no-store', $response->getHeaderLine('Cache-Control'));
        self::assertSame(['workerToken'], array_keys(self::json($response)));
        $token = self::json($response)['workerToken'];
        self::assertMatchesRegularExpression('/^hwk_[0-9a-f]{32}$/', $token);

        $config = $this->as_($etab, 'GET', '/api/etablissement/config');
        self::assertTrue(self::json($config)['hasWorkerToken']);
        self::assertStringNotContainsString($token, (string) $config->getBody(), 'jamais relu');
        self::assertSame(hash('sha256', $token), Db::get()->query('SELECT worker_token_hash FROM etablissement_config')->fetchColumn());
        self::assertSame([], self::lastAudit('worker_token_generated')['details']);

        $this->cookieSid = null;
        self::assertSame(200, $this->request('GET', '/api/worker/jobs', null, ['X-Worker-Token' => $token])->getStatusCode());

        $rotated = self::json($this->as_($etab, 'POST', '/api/etablissement/worker-token'))['workerToken'];
        $this->cookieSid = null;
        self::assertSame(401, $this->request('GET', '/api/worker/jobs', null, ['X-Worker-Token' => $token])->getStatusCode());
        self::assertSame(200, $this->request('GET', '/api/worker/jobs', null, ['X-Worker-Token' => $rotated])->getStatusCode());
    }

    #[TestDox('UC-ETA-02-F06 — E1 : corps invalides → 422 avec le champ en cause, configuration inchangée')]
    public function testF06ValidationErrors(): void
    {
        $etab = $this->registerEtablissement();
        $this->configure($etab, 10.0);

        $cases = [
            'provider' => ['provider' => 'openai', 'budgetCapUsd' => 1],
            'endpointUrl' => ['provider' => 'endpoint', 'budgetCapUsd' => 1],
            'endpointUrl ftp' => ['provider' => 'endpoint', 'endpointUrl' => 'ftp://llm.lycee.fr', 'budgetCapUsd' => 1],
            'endpointUrl long' => ['provider' => 'endpoint', 'endpointUrl' => 'https://' . str_repeat('a', 250) . '.fr', 'budgetCapUsd' => 1],
            'apiKey' => ['provider' => 'humanome', 'apiKey' => str_repeat('k', 401), 'budgetCapUsd' => 1],
            'model' => ['provider' => 'humanome', 'model' => str_repeat('m', 121), 'budgetCapUsd' => 1],
            'budgetCapUsd absent' => ['provider' => 'humanome'],
            'budgetCapUsd négatif' => ['provider' => 'humanome', 'budgetCapUsd' => -1],
            'budgetCapUsd texte' => ['provider' => 'humanome', 'budgetCapUsd' => '10'],
            'budgetCapUsd énorme' => ['provider' => 'humanome', 'budgetCapUsd' => 100000000],
        ];
        foreach ($cases as $label => $bodyIn) {
            $response = $this->as_($etab, 'PUT', '/api/etablissement/config', $bodyIn);
            self::assertSame(422, $response->getStatusCode(), $label);
            $body = self::json($response);
            self::assertSame('Validation échouée', $body['error']);
            self::assertArrayHasKey(explode(' ', $label)[0], $body['fields'], $label);
        }
        self::assertEquals(10.0, self::json($this->as_($etab, 'GET', '/api/etablissement/config'))['budgetCapUsd']);
    }

    #[TestDox('UC-ETA-02-F07 — E2 : clé fournie sans SODIUM_MASTER_KEY → 503, rien n’est enregistré ; sans clé → 200')]
    public function testF07NoMasterKeyRefusesKeyStorage(): void
    {
        $etab = $this->registerEtablissement();

        self::withEnv(['SODIUM_MASTER_KEY' => ''], function () use ($etab): void {
            $refused = $this->as_($etab, 'PUT', '/api/etablissement/config', [
                'provider' => 'endpoint', 'endpointUrl' => self::ENDPOINT, 'apiKey' => 'sk-x', 'budgetCapUsd' => 5,
            ]);
            self::assertSame(503, $refused->getStatusCode());
            self::assertSame(['error' => 'Chiffrement des clés non configuré sur ce serveur'], self::json($refused));
            self::assertSame(0, (int) Db::get()->query('SELECT COUNT(*) FROM etablissement_config')->fetchColumn());

            $withoutKey = $this->as_($etab, 'PUT', '/api/etablissement/config', ['provider' => 'humanome', 'budgetCapUsd' => 5]);
            self::assertSame(200, $withoutKey->getStatusCode());
        });
    }

    #[TestDox('UC-ETA-02-F08 — E3 : visiteur 401, apprenant 403, mutation sans CSRF 403 (config et jeton worker)')]
    public function testF08GuardsAndCsrf(): void
    {
        $etab = $this->registerEtablissement();
        $learner = $this->registerAs('eleve@example.org', 'Élève');
        $routes = [
            ['GET', '/api/etablissement/config', null],
            ['PUT', '/api/etablissement/config', ['provider' => 'humanome', 'budgetCapUsd' => 1]],
            ['POST', '/api/etablissement/worker-token', null],
        ];
        foreach ($routes as [$method, $path, $body]) {
            $this->cookieSid = null;
            self::assertSame(401, $this->request($method, $path, $body)->getStatusCode(), "visiteur {$method} {$path}");
            self::assertSame(403, $this->as_($learner, $method, $path, $body)->getStatusCode(), "apprenant {$method} {$path}");
        }

        foreach ([['PUT', '/api/etablissement/config', ['provider' => 'humanome', 'budgetCapUsd' => 1]], ['POST', '/api/etablissement/worker-token', null]] as [$method, $path, $body]) {
            $this->cookieSid = $etab['sid'];
            $response = $this->request($method, $path, $body);
            self::assertSame(403, $response->getStatusCode());
            self::assertSame('Jeton CSRF absent ou invalide', self::json($response)['error']);
        }
        self::assertSame(0, (int) Db::get()->query('SELECT COUNT(*) FROM etablissement_config')->fetchColumn());
    }
}
