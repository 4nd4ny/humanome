<?php

declare(strict_types=1);

namespace Humanome\Tests;

use Humanome\Db;
use Humanome\Etablissement\ConfigRepository;
use Humanome\Keys\KeyVault;

/**
 * P11 establishment configuration: provider choice (humanome | endpoint),
 * sodium-encrypted endpoint key (NEVER readable through the API), budget
 * cap, worker token (clear once, stored hashed).
 */
final class EtablissementConfigTest extends MasseTestCase
{
    public function testProjectionParDefaut(): void
    {
        $etab = $this->registerEtablissement();
        $config = self::json($this->as_($etab, 'GET', '/api/etablissement/config'));

        // assertEquals: json_encode drops the zero fraction (0.0 -> 0).
        self::assertEquals([
            'provider' => 'humanome',
            'endpointUrl' => null,
            'model' => null,
            'budgetCapUsd' => 0.0,
            'spentUsd' => 0.0,
            'hasApiKey' => false,
            'hasWorkerToken' => false,
        ], $config);
    }

    public function testValidationDuPut(): void
    {
        $etab = $this->registerEtablissement();
        foreach ([
            ['provider' => 'openai', 'budgetCapUsd' => 1],           // unknown provider
            ['provider' => 'endpoint', 'budgetCapUsd' => 1],         // endpoint without URL
            ['provider' => 'endpoint', 'endpointUrl' => 'ftp://x', 'budgetCapUsd' => 1],
            ['provider' => 'humanome'],                              // missing cap
            ['provider' => 'humanome', 'budgetCapUsd' => -1],
            ['provider' => 'humanome', 'budgetCapUsd' => '10'],      // string cap
        ] as $body) {
            $response = $this->as_($etab, 'PUT', '/api/etablissement/config', $body);
            self::assertSame(422, $response->getStatusCode(), json_encode($body));
        }
    }

    public function testCleEndpointChiffreeJamaisRelue(): void
    {
        $etab = $this->registerEtablissement();
        $put = $this->as_($etab, 'PUT', '/api/etablissement/config', [
            'provider' => 'endpoint',
            'endpointUrl' => 'http://10.0.0.12:11434',
            'apiKey' => 'sk-etablissement-secret',
            'model' => 'llama3:70b',
            'budgetCapUsd' => 25.5,
        ]);
        self::assertSame(200, $put->getStatusCode(), (string) $put->getBody());
        $config = self::json($put);
        self::assertTrue($config['hasApiKey']);
        self::assertSame('http://10.0.0.12:11434', $config['endpointUrl']);
        self::assertSame(25.5, $config['budgetCapUsd']);
        self::assertArrayNotHasKey('apiKey', $config);
        self::assertStringNotContainsString('sk-etablissement-secret', (string) $put->getBody());

        // At rest: sodium blob (nonce ‖ secretbox), decryptable by the worker.
        $blob = Db::get()->query('SELECT encrypted_key FROM etablissement_config')->fetchColumn();
        self::assertIsString($blob);
        self::assertStringNotContainsString('sk-etablissement-secret', $blob);
        $repo = new ConfigRepository(Db::get(), KeyVault::masterKeyFromEnv());
        self::assertSame('sk-etablissement-secret', $repo->revealApiKey($etab['id']));

        // PUT without apiKey keeps it; apiKey "" erases it.
        $this->as_($etab, 'PUT', '/api/etablissement/config', [
            'provider' => 'endpoint', 'endpointUrl' => 'http://10.0.0.12:11434', 'budgetCapUsd' => 30,
        ]);
        self::assertSame('sk-etablissement-secret', $repo->revealApiKey($etab['id']));
        $this->as_($etab, 'PUT', '/api/etablissement/config', [
            'provider' => 'endpoint', 'endpointUrl' => 'http://10.0.0.12:11434', 'apiKey' => '', 'budgetCapUsd' => 30,
        ]);
        self::assertNull($repo->revealApiKey($etab['id']));
        self::assertFalse(self::json($this->as_($etab, 'GET', '/api/etablissement/config'))['hasApiKey']);
    }

    public function testJetonWorkerEnClairUneSeuleFois(): void
    {
        $etab = $this->registerEtablissement();
        $response = $this->as_($etab, 'POST', '/api/etablissement/worker-token');
        self::assertSame(201, $response->getStatusCode());
        self::assertSame('no-store', $response->getHeaderLine('Cache-Control'));
        $token = self::json($response)['workerToken'];
        self::assertMatchesRegularExpression('/^hwk_[0-9a-f]{32}$/', $token);

        // Stored hashed only; resolvable by the worker gate.
        $hash = Db::get()->query('SELECT worker_token_hash FROM etablissement_config')->fetchColumn();
        self::assertSame(hash('sha256', $token), $hash);
        $repo = new ConfigRepository(Db::get());
        self::assertSame($etab['id'], $repo->etablissementIdForWorkerToken($token));

        // Regeneration rotates: the old token dies.
        $token2 = self::json($this->as_($etab, 'POST', '/api/etablissement/worker-token'))['workerToken'];
        self::assertNotSame($token, $token2);
        self::assertNull($repo->etablissementIdForWorkerToken($token));
        self::assertSame($etab['id'], $repo->etablissementIdForWorkerToken($token2));
        self::assertTrue(self::json($this->as_($etab, 'GET', '/api/etablissement/config'))['hasWorkerToken']);
    }

    public function testGardeDeRole(): void
    {
        $learner = $this->registerAs('eleve@example.org', 'Élève');
        self::assertSame(403, $this->as_($learner, 'GET', '/api/etablissement/config')->getStatusCode());
        self::assertSame(403, $this->as_($learner, 'POST', '/api/etablissement/worker-token')->getStatusCode());
    }
}
