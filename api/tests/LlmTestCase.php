<?php

declare(strict_types=1);

namespace Humanome\Tests;

use Humanome\Llm\LlmRuntime;
use Humanome\Llm\PowChallenge;
use Psr\Http\Message\ResponseInterface;

/**
 * Base class for the P6 LLM proxy tests. Builds on AuthTestBase (in-process
 * requests over the humanome_test database) and adds: a fake HttpClient
 * (never any real network), deterministic DEMO_* env defaults (low PoW
 * difficulty so tests solve challenges in microseconds), and PoW helpers.
 */
abstract class LlmTestCase extends AuthTestBase
{
    protected const POW_SECRET = 'test-pow-secret';
    protected const API_KEY = 'sk-ant-test-key-never-leaked';

    protected LlmFakeHttpClient $http;

    protected function setUp(): void
    {
        parent::setUp();

        // Reset every override each test (values set via TestDb::setEnv are
        // restored after the class, but leak between tests otherwise).
        TestDb::setEnv('POW_SECRET', self::POW_SECRET);
        TestDb::setEnv('ANTHROPIC_API_KEY', self::API_KEY);
        TestDb::setEnv('DEMO_ENABLED', '1');
        TestDb::setEnv('DEMO_PROVIDER', 'mock');
        TestDb::setEnv('DEMO_MODEL', 'claude-haiku-4-5-20251001');
        TestDb::setEnv('DEMO_MAX_TOKENS_PER_REQUEST', '512');
        TestDb::setEnv('DEMO_MAX_INPUT_CHARS', '20000');
        TestDb::setEnv('DEMO_PER_IP_PER_HOUR', '50');
        TestDb::setEnv('DEMO_DAILY_GLOBAL_TOKENS', '1000000');
        TestDb::setEnv('DEMO_DAILY_BUDGET_USD', '5');
        TestDb::setEnv('DEMO_POW_DIFFICULTY_BITS', '8');
        TestDb::setEnv('DEMO_UPSTREAM_TIMEOUT', '5');

        self::$pdo->exec('DELETE FROM llm_pow_challenges');
        self::$pdo->exec('DELETE FROM llm_usage_daily');

        $this->http = new LlmFakeHttpClient();
        LlmRuntime::setHttpClient($this->http);
    }

    protected function tearDown(): void
    {
        LlmRuntime::setHttpClient(null);
        parent::tearDown();
    }

    /** @return array{challenge: string, difficultyBits: int, expiresAt: int} */
    protected function fetchChallenge(): array
    {
        $response = $this->request('GET', '/api/llm/challenge');
        self::assertSame(200, $response->getStatusCode());

        /** @var array{challenge: string, difficultyBits: int, expiresAt: int} */
        return self::json($response);
    }

    /** Brute-force a nonce meeting the difficulty (8 bits in tests). */
    protected function solve(string $challenge, int $difficultyBits): string
    {
        for ($nonce = 0; $nonce < 1000000; $nonce++) {
            if (PowChallenge::leadingZeroBits(hash('sha256', $challenge . ':' . $nonce)) >= $difficultyBits) {
                return (string) $nonce;
            }
        }

        throw new \LogicException('unsolvable challenge (difficulty too high for tests?)');
    }

    /** A nonce that does NOT meet the difficulty (deterministic weak nonce). */
    protected function weakNonce(string $challenge, int $difficultyBits): string
    {
        for ($nonce = 0; $nonce < 1000000; $nonce++) {
            if (PowChallenge::leadingZeroBits(hash('sha256', $challenge . ':' . $nonce)) < $difficultyBits) {
                return (string) $nonce;
            }
        }

        throw new \LogicException('no weak nonce found');
    }

    /**
     * POST /api/llm with a freshly solved proof of work.
     *
     * @param array<string, mixed> $body extra/overriding body fields
     */
    protected function postLlm(array $body = []): ResponseInterface
    {
        $issued = $this->fetchChallenge();

        return $this->request('POST', '/api/llm', array_merge([
            'prompt' => 'Bonjour, ceci est un essai.',
            'challenge' => $issued['challenge'],
            'nonce' => $this->solve($issued['challenge'], $issued['difficultyBits']),
        ], $body));
    }

    /** A queueable Anthropic Messages API success body. */
    protected static function anthropicBody(
        string $text = 'Réponse du modèle.',
        int $inputTokens = 100,
        int $outputTokens = 50,
        string $model = 'claude-haiku-4-5-20251001',
    ): string {
        return json_encode([
            'id' => 'msg_test',
            'type' => 'message',
            'model' => $model,
            'content' => [['type' => 'text', 'text' => $text]],
            'usage' => ['input_tokens' => $inputTokens, 'output_tokens' => $outputTokens],
            'stop_reason' => 'end_turn',
        ], JSON_THROW_ON_ERROR);
    }
}
