<?php

declare(strict_types=1);

namespace Humanome\Tests;

/**
 * Login rate limiting (P3.2): 5 attempts / 15 min per IP+email, then 429
 * with a progressive Retry-After.
 */
final class AuthRateLimitTest extends AuthTestBase
{
    public function testSixthLoginAttemptIsRateLimitedWithProgressiveDelay(): void
    {
        $this->register('victim@example.org');
        $this->cookieSid = null;

        for ($i = 1; $i <= 5; $i++) {
            $response = $this->login('victim@example.org', 'wrong-password-' . $i);
            self::assertSame(401, $response->getStatusCode(), "attempt $i should still be 401");
        }

        // 6th attempt: blocked even with the RIGHT password.
        $blocked = $this->login('victim@example.org', self::PASSWORD);
        self::assertSame(429, $blocked->getStatusCode());
        $retryAfter1 = (int) $blocked->getHeaderLine('Retry-After');
        self::assertSame(30, $retryAfter1);

        // 7th attempt: the delay grows (progressive backoff).
        $blockedAgain = $this->login('victim@example.org', self::PASSWORD);
        self::assertSame(429, $blockedAgain->getStatusCode());
        $retryAfter2 = (int) $blockedAgain->getHeaderLine('Retry-After');
        self::assertGreaterThan($retryAfter1, $retryAfter2);
    }

    public function testRateLimitIsScopedToIpAndEmail(): void
    {
        $this->register('bucket-a@example.org');
        $this->cookieSid = null;
        $this->register('bucket-b@example.org');
        $this->cookieSid = null;

        for ($i = 1; $i <= 5; $i++) {
            $this->login('bucket-a@example.org', 'wrong');
        }
        self::assertSame(429, $this->login('bucket-a@example.org', 'wrong')->getStatusCode());

        // Same IP, other email: not blocked.
        self::assertSame(200, $this->login('bucket-b@example.org', self::PASSWORD)->getStatusCode());

        // Other IP, blocked email: not blocked either (bucket = IP+email).
        $this->cookieSid = null;
        $this->clientIp = '198.51.100.7';
        self::assertSame(200, $this->login('bucket-a@example.org', self::PASSWORD)->getStatusCode());
    }

    public function testSuccessfulLoginResetsTheCounter(): void
    {
        $this->register('resets@example.org');
        $this->cookieSid = null;

        for ($i = 1; $i <= 4; $i++) {
            $this->login('resets@example.org', 'wrong');
        }
        self::assertSame(200, $this->login('resets@example.org', self::PASSWORD)->getStatusCode());

        // Counter was reset: 4 fresh failures do not block yet.
        $this->cookieSid = null;
        for ($i = 1; $i <= 4; $i++) {
            self::assertSame(401, $this->login('resets@example.org', 'wrong')->getStatusCode());
        }
        self::assertSame(200, $this->login('resets@example.org', self::PASSWORD)->getStatusCode());
    }

    public function testRegisterIsRateLimitedPerIp(): void
    {
        // Invalid payloads count too (the limiter runs before validation).
        for ($i = 1; $i <= 10; $i++) {
            $response = $this->request('POST', '/api/auth/register', [
                'email' => 'not-an-email',
                'password' => 'x',
                'displayName' => '',
            ]);
            self::assertSame(422, $response->getStatusCode(), "attempt $i should be 422");
        }

        $blocked = $this->register('eleventh@example.org');
        self::assertSame(429, $blocked->getStatusCode());
        self::assertNotSame('', $blocked->getHeaderLine('Retry-After'));
    }
}
