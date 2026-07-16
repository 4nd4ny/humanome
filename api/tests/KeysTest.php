<?php

declare(strict_types=1);

namespace Humanome\Tests;

use Humanome\Keys\KeyVault;

/**
 * P8 — encrypted per-user LLM API keys (AD-4): encryption round-trip through
 * the API, list without key material, owner-only reveal, real deletion,
 * explicit 503 when SODIUM_MASTER_KEY is absent or malformed.
 */
final class KeysTest extends AuthTestBase
{
    private const MASTER_KEY_HEX = '89b1b60f0a26f73b63f9df20a9c58ab24905b48b2bd45a01b344cee69d7e3a55';
    private const API_KEY = 'sk-ant-api03-EXEMPLE-jamais-en-clair-en-base';

    private string $csrf = '';

    protected function setUp(): void
    {
        parent::setUp();
        self::$pdo->exec('DELETE FROM users');
        TestDb::setEnv('SODIUM_MASTER_KEY', self::MASTER_KEY_HEX);

        $response = $this->register('maya@example.org', self::PASSWORD, 'Maya');
        $this->csrf = (string) self::json($response)['csrfToken'];
    }

    private function putKey(string $provider = 'anthropic', string $apiKey = self::API_KEY): \Psr\Http\Message\ResponseInterface
    {
        return $this->request('PUT', '/api/keys', [
            'provider' => $provider,
            'apiKey' => $apiKey,
        ], ['X-CSRF-Token' => $this->csrf]);
    }

    public function testEncryptionRoundTripThroughTheApi(): void
    {
        self::assertSame(204, $this->putKey()->getStatusCode());

        // At rest: ciphertext only — the clear key appears nowhere in the row.
        $blob = self::$pdo->query('SELECT encrypted_key FROM user_api_keys')->fetchColumn();
        self::assertIsString($blob);
        self::assertStringNotContainsString(self::API_KEY, $blob);
        self::assertGreaterThan(SODIUM_CRYPTO_SECRETBOX_NONCEBYTES, \strlen($blob));

        // AD-4 synchronization: the authenticated owner gets the clear key back.
        $response = $this->request('GET', '/api/keys/anthropic');
        self::assertSame(200, $response->getStatusCode());
        self::assertSame(self::API_KEY, self::json($response)['apiKey']);

        // The cleartext secret must never be cached (browser disk / shared proxy).
        self::assertStringContainsString('no-store', $response->getHeaderLine('Cache-Control'));
    }

    public function testEachEntryGetsItsOwnNonce(): void
    {
        $this->putKey('anthropic');
        $this->putKey('openai', 'sk-openai-EXEMPLE-0123456789');

        $blobs = self::$pdo->query('SELECT encrypted_key FROM user_api_keys ORDER BY provider')
            ->fetchAll(\PDO::FETCH_COLUMN);
        $nonces = array_map(
            static fn (string $blob): string => substr($blob, 0, SODIUM_CRYPTO_SECRETBOX_NONCEBYTES),
            $blobs,
        );
        self::assertNotSame($nonces[0], $nonces[1], 'nonce must be per entry');
    }

    public function testListNeverContainsKeyMaterial(): void
    {
        $this->putKey();

        $response = $this->request('GET', '/api/keys');
        self::assertSame(200, $response->getStatusCode());
        $list = self::json($response);
        self::assertSame('anthropic', $list[0]['provider']);
        self::assertSame(['provider', 'createdAt'], array_keys($list[0]));
        self::assertStringNotContainsString(self::API_KEY, (string) $response->getBody());
    }

    public function testRevealIsOwnerOnly(): void
    {
        $this->putKey();

        $this->cookieSid = null;
        $this->register('other@example.org', self::PASSWORD, 'Other');
        $response = $this->request('GET', '/api/keys/anthropic');
        self::assertSame(404, $response->getStatusCode(), 'another account must not see the key');
        self::assertStringNotContainsString(self::API_KEY, (string) $response->getBody());
    }

    public function testDeleteRemovesTheEntry(): void
    {
        $this->putKey();
        self::assertSame(204, $this->request('DELETE', '/api/keys/anthropic', null, ['X-CSRF-Token' => $this->csrf])->getStatusCode());
        self::assertSame(0, (int) self::$pdo->query('SELECT COUNT(*) FROM user_api_keys')->fetchColumn());
        self::assertSame(404, $this->request('DELETE', '/api/keys/anthropic', null, ['X-CSRF-Token' => $this->csrf])->getStatusCode());
        self::assertSame(404, $this->request('GET', '/api/keys/anthropic')->getStatusCode());
    }

    public function testValidation(): void
    {
        self::assertSame(422, $this->putKey('skynet')->getStatusCode(), 'unknown provider');
        self::assertSame(422, $this->putKey('anthropic', 'court')->getStatusCode(), 'key too short');
        self::assertSame(422, $this->putKey('anthropic', "avec\ncontrole")->getStatusCode(), 'control chars');
    }

    /**
     * Guard branch 401: every /api/keys route requires a session. The master
     * key IS configured here (setUp), so a failure cannot be confused with
     * the 503 « stockage non configuré » branch. Without a session cookie the
     * CSRF middleware passes through (no ambient credentials) — the guard
     * itself must answer 401.
     */
    public function testAuthenticationRequiredWithoutSession(): void
    {
        foreach ([
            ['GET', '/api/keys', null],
            ['PUT', '/api/keys', ['provider' => 'anthropic', 'apiKey' => self::API_KEY]],
            ['GET', '/api/keys/anthropic', null],
            ['DELETE', '/api/keys/anthropic', null],
        ] as [$method, $path, $body]) {
            $this->cookieSid = null; // anonymous browser: no session cookie

            $response = $this->request($method, $path, $body);
            self::assertSame(401, $response->getStatusCode(), $method . ' ' . $path);
            self::assertSame('Authentification requise', self::json($response)['error']);
        }
    }

    public function testMissingMasterKeyIsAnExplicit503EverywhereOnKeys(): void
    {
        $this->putKey(); // stored while configured

        TestDb::setEnv('SODIUM_MASTER_KEY', '');
        foreach ([
            ['PUT', '/api/keys', ['provider' => 'anthropic', 'apiKey' => self::API_KEY]],
            ['GET', '/api/keys', null],
            ['GET', '/api/keys/anthropic', null],
            ['DELETE', '/api/keys/anthropic', null],
        ] as [$method, $path, $body]) {
            $response = $this->request($method, $path, $body, ['X-CSRF-Token' => $this->csrf]);
            self::assertSame(503, $response->getStatusCode(), $method . ' ' . $path);
            self::assertSame('Stockage de clés non configuré', self::json($response)['error']);
        }

        // Malformed key (odd length / non-hex) behaves like absent.
        TestDb::setEnv('SODIUM_MASTER_KEY', 'zz' . substr(self::MASTER_KEY_HEX, 2));
        self::assertSame(503, $this->request('GET', '/api/keys')->getStatusCode());

        // And the REST of the API is unaffected.
        self::assertSame(200, $this->request('GET', '/api/auth/me')->getStatusCode());

        // Restored key: the stored entry decrypts again.
        TestDb::setEnv('SODIUM_MASTER_KEY', self::MASTER_KEY_HEX);
        self::assertSame(self::API_KEY, self::json($this->request('GET', '/api/keys/anthropic'))['apiKey']);
    }

    public function testRotatedMasterKeyFailsClosed(): void
    {
        $this->putKey();
        TestDb::setEnv('SODIUM_MASTER_KEY', strrev(self::MASTER_KEY_HEX));

        $response = $this->request('GET', '/api/keys/anthropic');
        self::assertSame(404, $response->getStatusCode(), 'undecryptable blob must not 500 nor leak');
    }

    public function testVaultUnitRoundTrip(): void
    {
        $master = (string) hex2bin(self::MASTER_KEY_HEX);
        $vault = new KeyVault(self::$pdo, $master);
        $userId = (int) self::$pdo->query('SELECT id FROM users LIMIT 1')->fetchColumn();

        $vault->store($userId, 'google', 'AIza-EXEMPLE-0123456789');
        self::assertSame('AIza-EXEMPLE-0123456789', $vault->reveal($userId, 'google'));
        self::assertNull($vault->reveal($userId, 'openai'));
        self::assertTrue($vault->delete($userId, 'google'));
        self::assertFalse($vault->delete($userId, 'google'));
    }
}
