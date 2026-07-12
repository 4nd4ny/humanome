<?php

declare(strict_types=1);

namespace Humanome\Tests;

/**
 * M6 CSRF matrix: the P8 mutating routes REQUIRE the X-CSRF-Token header,
 * while POST /api/llm is EXEMPT — a logged-in user calls the demo proxy
 * exactly like a visitor, protected by the PoW/quota/honeypot guards
 * instead (docs/autorisations.md). Built on LlmTestCase to run a real
 * proxied call (mock provider) through the exemption.
 */
final class CartographiesCsrfTest extends LlmTestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        self::$pdo->exec('DELETE FROM users');
    }

    public function testMutatingP8RoutesRequireCsrf(): void
    {
        $this->register('maya@example.org', self::PASSWORD, 'Maya');

        // Same session, NO X-CSRF-Token header: every P8 mutation is refused.
        $cases = [
            ['POST', '/api/cartographies', ['type' => 'jour', 'titre' => 'x', 'document' => ['k' => 'v']]],
            ['PATCH', '/api/cartographies/1', ['titre' => 'y']],
            ['DELETE', '/api/cartographies/1', null],
            ['POST', '/api/cartographies/1/share', ['password' => 'sesame-employeur']],
            ['DELETE', '/api/shares/1', null],
            ['PUT', '/api/training/progress', ['parcours' => 'apprenant', 'chapitre' => '01-a', 'completed' => true]],
            ['PUT', '/api/keys', ['provider' => 'anthropic', 'apiKey' => 'sk-ant-EXEMPLE-012345']],
            ['DELETE', '/api/keys/anthropic', null],
        ];
        foreach ($cases as [$method, $path, $body]) {
            $response = $this->request($method, $path, $body);
            self::assertSame(403, $response->getStatusCode(), $method . ' ' . $path);
            self::assertSame('Jeton CSRF absent ou invalide', self::json($response)['error']);
        }
    }

    public function testPostLlmIsExemptFromCsrfForLoggedInUsers(): void
    {
        $this->register('maya@example.org', self::PASSWORD, 'Maya');
        self::assertNotNull($this->cookieSid, 'the session cookie must ride the request');

        // postLlm() sends NO X-CSRF-Token: with the session cookie present it
        // would be a 403 without the exemption. The PoW guard still runs —
        // the call only succeeds because postLlm solves a fresh challenge.
        $response = $this->postLlm();
        self::assertSame(200, $response->getStatusCode(), (string) $response->getBody());
        self::assertArrayHasKey('text', self::json($response));
    }

    public function testPostLlmExemptionDoesNotDisableThePowGuard(): void
    {
        $this->register('maya@example.org', self::PASSWORD, 'Maya');

        $issued = $this->fetchChallenge();
        $response = $this->request('POST', '/api/llm', [
            'prompt' => 'Bonjour',
            'challenge' => $issued['challenge'],
            'nonce' => $this->weakNonce($issued['challenge'], $issued['difficultyBits']),
        ]);
        self::assertSame(400, $response->getStatusCode(), (string) $response->getBody());
        self::assertSame('pow_invalid', self::json($response)['code']);
    }
}
