<?php

declare(strict_types=1);

namespace Humanome\Llm;

use Humanome\Env;

/**
 * Stateless proof-of-work challenge (anti-bot, cahier §3.1 — no third-party
 * service).
 *
 * Challenge format (opaque for the client, versioned for us):
 *
 *     v1.<expiresEpoch>.<randomHex16>.<hmacHex>
 *
 * where hmac = HMAC-SHA256("v1.<expiresEpoch>.<randomHex16>", secret).
 * Nothing is stored at issuance (stateless); single-use is enforced at
 * REDEMPTION time by inserting sha256(challenge) into llm_pow_challenges
 * (duplicate key -> replay, HTTP 429 — handled by the route).
 *
 * The client must find a nonce (any string) such that
 * sha256(challenge . ':' . nonce), as a hex digest, has at least
 * `difficultyBits` leading zero BITS.
 *
 * Secret: POW_SECRET env var; if absent, derived from MIGRATE_TOKEN
 * (sha256('pow:' + MIGRATE_TOKEN)) so no extra secret is required in v1.
 * If neither exists the feature is unavailable (routes answer 503).
 */
final class PowChallenge
{
    public const TTL_SECONDS = 120;

    public const OK = 'ok';
    public const INVALID = 'invalid';   // malformed or bad HMAC
    public const EXPIRED = 'expired';
    public const WEAK = 'weak';         // nonce does not meet the difficulty

    public function __construct(
        private readonly string $secret,
        private readonly int $difficultyBits,
        private readonly int $ttlSeconds = self::TTL_SECONDS,
    ) {
    }

    /** Secret from env, '' when unavailable (feature then disabled). */
    public static function secretFromEnv(): string
    {
        $secret = Env::get('POW_SECRET');
        if ($secret !== '') {
            return $secret;
        }
        $migrateToken = Env::get('MIGRATE_TOKEN');

        return $migrateToken !== '' ? hash('sha256', 'pow:' . $migrateToken) : '';
    }

    /** @return array{challenge: string, difficultyBits: int, expiresAt: int} */
    public function issue(?int $now = null): array
    {
        $expires = ($now ?? time()) + $this->ttlSeconds;
        $payload = 'v1.' . $expires . '.' . bin2hex(random_bytes(8));
        $challenge = $payload . '.' . hash_hmac('sha256', $payload, $this->secret);

        return [
            'challenge' => $challenge,
            'difficultyBits' => $this->difficultyBits,
            'expiresAt' => $expires,
        ];
    }

    /** @return self::OK|self::INVALID|self::EXPIRED|self::WEAK */
    public function verify(string $challenge, string $nonce, ?int $now = null): string
    {
        $parts = explode('.', $challenge);
        if (\count($parts) !== 4 || $parts[0] !== 'v1' || !ctype_digit($parts[1])) {
            return self::INVALID;
        }
        [$version, $expires, $random, $mac] = $parts;
        $payload = $version . '.' . $expires . '.' . $random;
        if (!hash_equals(hash_hmac('sha256', $payload, $this->secret), $mac)) {
            return self::INVALID;
        }
        if ((int) $expires < ($now ?? time())) {
            return self::EXPIRED;
        }
        if (self::leadingZeroBits(hash('sha256', $challenge . ':' . $nonce)) < $this->difficultyBits) {
            return self::WEAK;
        }

        return self::OK;
    }

    /** Leading zero bits of a hex sha256 digest. */
    public static function leadingZeroBits(string $hashHex): int
    {
        $bits = 0;
        $length = \strlen($hashHex);
        for ($i = 0; $i < $length; $i++) {
            $nibble = hexdec($hashHex[$i]);
            if ($nibble === 0) {
                $bits += 4;
                continue;
            }
            // 1-7 -> partial zero bits within the nibble
            if ($nibble < 2) {
                $bits += 3;
            } elseif ($nibble < 4) {
                $bits += 2;
            } elseif ($nibble < 8) {
                $bits += 1;
            }

            return $bits;
        }

        return $bits;
    }
}
