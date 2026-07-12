<?php

declare(strict_types=1);

namespace Humanome\Tests;

use Humanome\ClientIp;
use PHPUnit\Framework\TestCase;

/**
 * Rate-limit bucketing identity (anti-abuse): IPv6 collapses to /64 so an
 * abuser cannot rotate the interface id of one allocation to defeat the
 * per-IP quota, while IPv4 (and IPv4-mapped IPv6) stay per-address.
 */
final class ClientIpTest extends TestCase
{
    public function testIpv4KeysOnTheFullAddress(): void
    {
        self::assertSame('v4:203.0.113.10', ClientIp::bucketIdentity('203.0.113.10'));
        self::assertNotSame(
            ClientIp::bucketIdentity('203.0.113.10'),
            ClientIp::bucketIdentity('203.0.113.11'),
        );
    }

    public function testIpv6AddressesInTheSame64ShareOneIdentity(): void
    {
        $low = ClientIp::bucketIdentity('2001:db8:0:1::1');
        $high = ClientIp::bucketIdentity('2001:db8:0:1:ffff:ffff:ffff:ffff');
        $mid = ClientIp::bucketIdentity('2001:db8:0:1:dead:beef:cafe:0001');

        self::assertSame($low, $high);
        self::assertSame($low, $mid);
        self::assertStringEndsWith('::/64', $low);
    }

    public function testDifferent64PrefixesGetDifferentIdentities(): void
    {
        self::assertNotSame(
            ClientIp::bucketIdentity('2001:db8:0:1::1'),
            ClientIp::bucketIdentity('2001:db8:0:2::1'),
        );
        // Adjacent /64s differing only in the last prefix bit are still distinct.
        self::assertNotSame(
            ClientIp::bucketIdentity('2001:db8:0:0::1'),
            ClientIp::bucketIdentity('2001:db8:0:1::1'),
        );
    }

    public function testIpv4MappedIpv6IsKeyedAsTheUnderlyingIpv4(): void
    {
        // Must NOT collapse every mapped client into a single all-zero /64
        // bucket (that would be a self-DoS on legitimate users).
        self::assertSame(
            ClientIp::bucketIdentity('203.0.113.10'),
            ClientIp::bucketIdentity('::ffff:203.0.113.10'),
        );
        self::assertNotSame(
            ClientIp::bucketIdentity('::ffff:203.0.113.10'),
            ClientIp::bucketIdentity('::ffff:203.0.113.11'),
        );
    }

    public function testMalformedOrEmptyInputIsKeyedVerbatim(): void
    {
        self::assertSame('raw:', ClientIp::bucketIdentity(''));
        self::assertSame('raw:not-an-ip', ClientIp::bucketIdentity('not-an-ip'));
        // Distinct malformed inputs stay distinct (no accidental collapse).
        self::assertNotSame(
            ClientIp::bucketIdentity('garbage-a'),
            ClientIp::bucketIdentity('garbage-b'),
        );
    }
}
