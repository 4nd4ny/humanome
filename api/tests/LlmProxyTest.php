<?php

declare(strict_types=1);

namespace Humanome\Tests;

use Humanome\Llm\HttpClientException;
use Humanome\Llm\UsageCounters;

/**
 * POST /api/llm: proxy contract (engine 'proxy' transport), server-imposed
 * provider/model/maxTokens, key confidentiality, honeypot, quotas and the
 * daily circuit breaker; GET /api/llm/status.
 */
final class LlmProxyTest extends LlmTestCase
{
    public function testDisabledDemoAnswers503(): void
    {
        TestDb::setEnv('DEMO_ENABLED', '0');

        $response = $this->request('POST', '/api/llm', ['prompt' => 'Bonjour']);

        self::assertSame(503, $response->getStatusCode());
    }

    public function testHoneypotFieldAnswersBanal400(): void
    {
        // A filled hidden 'website' field marks a bot: banal 400, no PoW hint.
        $response = $this->request('POST', '/api/llm', [
            'prompt' => 'Bonjour',
            'website' => 'https://spam.example',
        ]);

        self::assertSame(400, $response->getStatusCode());
        self::assertSame(['error' => 'Requête invalide'], self::json($response));
    }

    public function testMissingPromptAnswers422(): void
    {
        $response = $this->request('POST', '/api/llm', ['challenge' => 'x', 'nonce' => 'y']);

        self::assertSame(422, $response->getStatusCode());
    }

    public function testOversizedInputAnswers413(): void
    {
        TestDb::setEnv('DEMO_MAX_INPUT_CHARS', '10');

        $response = $this->request('POST', '/api/llm', ['prompt' => str_repeat('a', 11)]);

        self::assertSame(413, $response->getStatusCode());
    }

    public function testMockProviderContract(): void
    {
        $response = $this->postLlm();

        self::assertSame(200, $response->getStatusCode());
        $data = self::json($response);
        self::assertIsString($data['text']);
        self::assertNotSame('', $data['text']);
        self::assertIsInt($data['usage']['inputTokens']);
        self::assertIsInt($data['usage']['outputTokens']);
        self::assertSame('mock', $data['model']);
        // Mock never touches the network.
        self::assertSame([], $this->http->requests);
    }

    public function testServerImposesProviderModelAndMaxTokens(): void
    {
        TestDb::setEnv('DEMO_PROVIDER', 'anthropic');
        $this->http->queueResponse(['status' => 200, 'body' => self::anthropicBody()]);

        // The client tries to pick an expensive model: everything is ignored.
        $response = $this->postLlm([
            'provider' => 'openai',
            'model' => 'gpt-4o',
            'maxTokens' => 999999,
            'system' => 'Tu es un assistant.',
        ]);

        self::assertSame(200, $response->getStatusCode());
        self::assertCount(1, $this->http->requests);
        $upstream = $this->http->requests[0];
        self::assertSame('https://api.anthropic.com/v1/messages', $upstream['url']);
        $payload = json_decode((string) $upstream['body'], true);
        self::assertSame('claude-haiku-4-5-20251001', $payload['model']);
        self::assertSame(512, $payload['max_tokens']);
        self::assertSame('Tu es un assistant.', $payload['system']);
        self::assertSame(self::API_KEY, $upstream['headers']['x-api-key']);

        $data = self::json($response);
        self::assertSame('Réponse du modèle.', $data['text']);
        self::assertSame(['inputTokens' => 100, 'outputTokens' => 50], $data['usage']);
        self::assertSame('claude-haiku-4-5-20251001', $data['model']);
    }

    public function testApiKeyNeverAppearsInResponses(): void
    {
        TestDb::setEnv('DEMO_PROVIDER', 'anthropic');

        $this->http->queueResponse(['status' => 200, 'body' => self::anthropicBody()]);
        $success = $this->postLlm();
        self::assertStringNotContainsString(self::API_KEY, (string) $success->getBody());

        $this->http->queueResponse([
            'status' => 500,
            'body' => json_encode(['error' => ['message' => 'internal upstream error']], JSON_THROW_ON_ERROR),
        ]);
        $failure = $this->postLlm();
        self::assertSame(502, $failure->getStatusCode());
        self::assertStringNotContainsString(self::API_KEY, (string) $failure->getBody());
    }

    public function testUpstream429IsRelayedWithRetryAfter(): void
    {
        TestDb::setEnv('DEMO_PROVIDER', 'anthropic');
        $this->http->queueResponse([
            'status' => 429,
            'headers' => ['retry-after' => '17'],
            'body' => json_encode(['error' => ['message' => 'rate limited']], JSON_THROW_ON_ERROR),
        ]);

        $response = $this->postLlm();

        self::assertSame(429, $response->getStatusCode());
        self::assertSame('17', $response->getHeaderLine('Retry-After'));
    }

    public function testUpstreamTimeoutAnswers504(): void
    {
        TestDb::setEnv('DEMO_PROVIDER', 'anthropic');
        $this->http->queueException(new HttpClientException('network error (curl 28)', timedOut: true));

        $response = $this->postLlm();

        self::assertSame(504, $response->getStatusCode());
    }

    public function testPerIpHourlyQuotaAnswers429WithRetryAfter(): void
    {
        TestDb::setEnv('DEMO_PER_IP_PER_HOUR', '2');

        self::assertSame(200, $this->postLlm()->getStatusCode());
        self::assertSame(200, $this->postLlm()->getStatusCode());

        $third = $this->postLlm();
        self::assertSame(429, $third->getStatusCode());
        self::assertGreaterThan(0, (int) $third->getHeaderLine('Retry-After'));

        // No raw IP anywhere in the rate_limits buckets (§6.5).
        $buckets = self::$pdo->query('SELECT bucket FROM rate_limits')->fetchAll(\PDO::FETCH_COLUMN);
        foreach ($buckets as $bucket) {
            self::assertStringNotContainsString($this->clientIp, (string) $bucket);
        }
    }

    public function testDailyTokenCapTripsTheCircuitBreaker(): void
    {
        TestDb::setEnv('DEMO_DAILY_GLOBAL_TOKENS', '100');
        (new UsageCounters(self::$pdo))->record(80, 30, 0.0);

        $response = $this->postLlm();

        self::assertSame(503, $response->getStatusCode());
        self::assertStringContainsString('épuisée', (string) self::json($response)['error']);
    }

    public function testDailyBudgetCapTripsTheCircuitBreaker(): void
    {
        TestDb::setEnv('DEMO_DAILY_BUDGET_USD', '0.01');
        (new UsageCounters(self::$pdo))->record(1000, 1000, 0.02);

        $response = $this->postLlm();

        self::assertSame(503, $response->getStatusCode());
    }

    public function testSuccessfulCallIncrementsCountersOnly(): void
    {
        TestDb::setEnv('DEMO_PROVIDER', 'anthropic');
        $this->http->queueResponse(['status' => 200, 'body' => self::anthropicBody(inputTokens: 120, outputTokens: 40)]);

        $prompt = 'Texte confidentiel du visiteur qui ne doit jamais être stocké.';
        self::assertSame(200, $this->postLlm(['prompt' => $prompt])->getStatusCode());

        $today = (new UsageCounters(self::$pdo))->today();
        self::assertSame(1, $today['requests']);
        self::assertSame(120, $today['inputTokens']);
        self::assertSame(40, $today['outputTokens']);
        self::assertGreaterThan(0.0, $today['estimatedCostUsd']);

        // §6: counters only — the prompt appears NOWHERE in the database.
        foreach (['llm_usage_daily', 'llm_pow_challenges', 'rate_limits'] as $table) {
            $rows = self::$pdo->query('SELECT * FROM ' . $table)->fetchAll();
            self::assertStringNotContainsString('confidentiel', json_encode($rows, JSON_THROW_ON_ERROR));
        }
    }

    public function testIpv6QuotaCannotBeBypassedByRotatingWithinA64(): void
    {
        // A routine IPv6 allocation is a whole /64 (2^64 addresses). The per-IP
        // quota MUST bucket v6 by /64, otherwise an abuser rotates the interface
        // id for a free quota per request (and gdoc-text — no daily breaker —
        // becomes an unbounded proxy). Quota of 2 per hour for a fast check.
        TestDb::setEnv('DEMO_PER_IP_PER_HOUR', '2');

        $this->clientIp = '2001:db8:0:1::1';
        self::assertSame(200, $this->postLlm()->getStatusCode());
        self::assertSame(200, $this->postLlm()->getStatusCode());
        self::assertSame(429, $this->postLlm()->getStatusCode(), 'quota reached for the /64');

        // Same /64, different interface id: the abuser's rotation trick. Must
        // stay blocked — all of 2001:db8:0:1::/64 shares one bucket.
        $this->clientIp = '2001:db8:0:1:ffff:ffff:ffff:ffff';
        self::assertSame(429, $this->postLlm()->getStatusCode(), 'sibling /64 address must share the bucket');

        // A genuinely different /64 is a different client: not blocked.
        $this->clientIp = '2001:db8:0:2::1';
        self::assertSame(200, $this->postLlm()->getStatusCode(), 'a different /64 is a different bucket');

        // RGPD §6.5: still no raw IP in any bucket (identity is hashed).
        $buckets = self::$pdo->query('SELECT bucket FROM rate_limits')->fetchAll(\PDO::FETCH_COLUMN);
        foreach ($buckets as $bucket) {
            self::assertStringNotContainsString('2001:db8', (string) $bucket);
        }
    }

    public function testStatusEndpointExposesBooleansOnly(): void
    {
        $response = $this->request('GET', '/api/llm/status');
        self::assertSame(200, $response->getStatusCode());
        self::assertSame(['enabled' => true, 'remainingToday' => true], self::json($response));

        TestDb::setEnv('DEMO_DAILY_GLOBAL_TOKENS', '10');
        (new UsageCounters(self::$pdo))->record(100, 100, 0.0);
        self::assertSame(
            ['enabled' => true, 'remainingToday' => false],
            self::json($this->request('GET', '/api/llm/status')),
        );

        TestDb::setEnv('DEMO_ENABLED', 'false');
        self::assertSame(
            ['enabled' => false, 'remainingToday' => false],
            self::json($this->request('GET', '/api/llm/status')),
        );
    }
}
