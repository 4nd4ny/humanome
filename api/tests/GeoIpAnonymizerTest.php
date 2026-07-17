<?php

declare(strict_types=1);

namespace Humanome\Tests;

use Humanome\Geo\IpAnonymizer;
use PHPUnit\Framework\TestCase;

/**
 * Troncature réseau du journal des connexions (cahier §6.5 : jamais d'IP
 * brute en base) : v4 -> /24, v6 -> /48, mappée -> l'IPv4 embarquée.
 */
final class GeoIpAnonymizerTest extends TestCase
{
    public function testIpv4KeepsOnlyThe24Prefix(): void
    {
        self::assertSame('203.0.113.0/24', IpAnonymizer::network('203.0.113.57'));
        self::assertSame('10.0.0.0/24', IpAnonymizer::network('10.0.0.255'));
    }

    public function testIpv6KeepsOnlyThe48Prefix(): void
    {
        self::assertSame('2001:db8:abcd::/48', IpAnonymizer::network('2001:db8:abcd:1234:5678:9abc:def0:42'));
    }

    public function testV4MappedIpv6IsTreatedAsTheEmbeddedIpv4(): void
    {
        self::assertSame('203.0.113.0/24', IpAnonymizer::network('::ffff:203.0.113.57'));
    }

    public function testMalformedInputYieldsNull(): void
    {
        self::assertNull(IpAnonymizer::network(''));
        self::assertNull(IpAnonymizer::network('not-an-ip'));
    }
}
