<?php

declare(strict_types=1);

namespace Humanome;

/**
 * Rate-limit bucketing identity derived from a client IP (REMOTE_ADDR).
 *
 * Shared by the auth limiter (routes/auth.php) and the public demo limiter
 * (routes/llm.php). Two properties matter for anti-abuse and RGPD:
 *
 *  - IPv6 collapses to its /64 network prefix. A single routine IPv6
 *    allocation is a WHOLE /64 (2^64 addresses) — often a /56 or /48. Keying
 *    on the full 128-bit address would let an abuser rotate the interface id
 *    for a fresh quota on every request, defeating any per-IP limit. Bucketing
 *    per /64 is the smallest unit an abuser cannot cheaply multiply.
 *    IPv4 keys on the full address (no such rotation surface).
 *
 *  - IPv4-mapped IPv6 (::ffff:a.b.c.d) is keyed as the underlying IPv4, NOT as
 *    an all-zero /64 — otherwise every mapped client would collapse into one
 *    shared bucket (a self-inflicted DoS on legitimate users).
 *
 * The return value is an OPAQUE identity string; callers still hash it before
 * it touches the database (cahier §6.5: never a raw IP in storage).
 */
final class ClientIp
{
    /** IPv4-mapped IPv6 prefix: 10 zero bytes then 0xffff. */
    private const V4_MAPPED_PREFIX = "\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\xff\xff";

    public static function bucketIdentity(string $ip): string
    {
        $packed = @inet_pton($ip);
        if ($packed === false) {
            // Empty REMOTE_ADDR or malformed input: key verbatim (deterministic).
            return 'raw:' . $ip;
        }
        if (\strlen($packed) === 4) {
            return 'v4:' . inet_ntop($packed);
        }
        // 16-byte IPv6. An IPv4-mapped address keys on the embedded IPv4.
        if (str_starts_with($packed, self::V4_MAPPED_PREFIX)) {
            return 'v4:' . inet_ntop(substr($packed, 12));
        }

        // Keep the high 64 bits (network prefix); drop the interface id.
        return 'v6:' . bin2hex(substr($packed, 0, 8)) . '::/64';
    }
}
