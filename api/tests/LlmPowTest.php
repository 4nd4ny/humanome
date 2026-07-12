<?php

declare(strict_types=1);

namespace Humanome\Tests;

use Humanome\Llm\PowChallenge;

/**
 * Proof-of-work: challenge issuance, verification (valid / invalid /
 * replayed / expired), single-use redemption.
 */
final class LlmPowTest extends LlmTestCase
{
    public function testChallengeEndpointContract(): void
    {
        $issued = $this->fetchChallenge();

        self::assertSame(8, $issued['difficultyBits']);
        self::assertGreaterThan(time(), $issued['expiresAt']);
        self::assertLessThanOrEqual(time() + PowChallenge::TTL_SECONDS, $issued['expiresAt']);
        self::assertMatchesRegularExpression('/^v1\.\d+\.[0-9a-f]{16}\.[0-9a-f]{64}$/', $issued['challenge']);
    }

    public function testValidNonceIsAccepted(): void
    {
        $response = $this->postLlm();

        self::assertSame(200, $response->getStatusCode());
    }

    public function testMissingProofOfWorkIsRejected(): void
    {
        $response = $this->request('POST', '/api/llm', ['prompt' => 'Bonjour']);

        self::assertSame(400, $response->getStatusCode());
        self::assertSame('pow_required', self::json($response)['code']);
    }

    public function testWeakNonceIsRejected(): void
    {
        $issued = $this->fetchChallenge();
        $response = $this->request('POST', '/api/llm', [
            'prompt' => 'Bonjour',
            'challenge' => $issued['challenge'],
            'nonce' => $this->weakNonce($issued['challenge'], $issued['difficultyBits']),
        ]);

        self::assertSame(400, $response->getStatusCode());
        self::assertSame('pow_invalid', self::json($response)['code']);
    }

    public function testTamperedChallengeIsRejected(): void
    {
        $issued = $this->fetchChallenge();
        // Extend the expiry without knowing the secret: the HMAC breaks.
        $parts = explode('.', $issued['challenge']);
        $parts[1] = (string) (((int) $parts[1]) + 3600);
        $tampered = implode('.', $parts);

        $response = $this->request('POST', '/api/llm', [
            'prompt' => 'Bonjour',
            'challenge' => $tampered,
            'nonce' => $this->solve($tampered, 8),
        ]);

        self::assertSame(400, $response->getStatusCode());
        self::assertSame('pow_invalid', self::json($response)['code']);
    }

    public function testExpiredChallengeIsRejected(): void
    {
        // Stateless challenge: forge a valid but expired one with the secret.
        $pow = new PowChallenge(self::POW_SECRET, 8);
        $expired = $pow->issue(time() - PowChallenge::TTL_SECONDS - 60);

        $response = $this->request('POST', '/api/llm', [
            'prompt' => 'Bonjour',
            'challenge' => $expired['challenge'],
            'nonce' => $this->solve($expired['challenge'], 8),
        ]);

        self::assertSame(400, $response->getStatusCode());
        self::assertSame('pow_expired', self::json($response)['code']);
    }

    public function testReplayedChallengeIsRejectedWith429(): void
    {
        $issued = $this->fetchChallenge();
        $nonce = $this->solve($issued['challenge'], $issued['difficultyBits']);
        $body = ['prompt' => 'Bonjour', 'challenge' => $issued['challenge'], 'nonce' => $nonce];

        $first = $this->request('POST', '/api/llm', $body);
        self::assertSame(200, $first->getStatusCode());

        $second = $this->request('POST', '/api/llm', $body);
        self::assertSame(429, $second->getStatusCode());
        self::assertSame('pow_reused', self::json($second)['code']);
    }

    public function testChallengeUnavailableWithoutAnySecret(): void
    {
        TestDb::setEnv('POW_SECRET', '');
        TestDb::setEnv('MIGRATE_TOKEN', '');

        $response = $this->request('GET', '/api/llm/challenge');

        self::assertSame(503, $response->getStatusCode());
    }

    public function testSecretDerivedFromMigrateTokenWhenPowSecretAbsent(): void
    {
        TestDb::setEnv('POW_SECRET', '');
        TestDb::setEnv('MIGRATE_TOKEN', 'dev_migrate_token');

        self::assertSame(200, $this->request('GET', '/api/llm/challenge')->getStatusCode());
    }

    public function testLeadingZeroBits(): void
    {
        self::assertSame(0, PowChallenge::leadingZeroBits('ff00'));
        self::assertSame(4, PowChallenge::leadingZeroBits('0f00'));
        self::assertSame(7, PowChallenge::leadingZeroBits('01ff'));
        self::assertSame(9, PowChallenge::leadingZeroBits('007f'));
        self::assertSame(16, PowChallenge::leadingZeroBits('0000'));
    }
}
