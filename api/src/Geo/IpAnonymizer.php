<?php

declare(strict_types=1);

namespace Humanome\Geo;

/**
 * Réseau tronqué d'une IP cliente, pour le journal des connexions (monitoring
 * admin). RGPD cahier §6.5 (journalisation minimale) : jamais d'IP brute en
 * base — on ne conserve que le préfixe réseau, assez pour repérer une attaque
 * (même réseau qui martèle) sans identifier une machine précise :
 *
 *  - IPv4 -> /24 (dernier octet effacé), ex. « 203.0.113.0/24 » ;
 *  - IPv6 -> /48 (préfixe d'allocation FAI typique, plus grossier que le /64
 *    de ClientIp::bucketIdentity qui, lui, ne sort jamais en clair) ;
 *  - IPv6 mappée IPv4 (::ffff:a.b.c.d) -> traitée comme l'IPv4 embarquée.
 */
final class IpAnonymizer
{
    /** Préfixe IPv6 mappée IPv4 : 10 octets nuls puis 0xffff. */
    private const V4_MAPPED_PREFIX = "\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\xff\xff";

    public static function network(string $ip): ?string
    {
        $packed = @inet_pton($ip);
        if ($packed === false) {
            return null;
        }
        if (\strlen($packed) === 16) {
            if (str_starts_with($packed, self::V4_MAPPED_PREFIX)) {
                $packed = substr($packed, 12);
            } else {
                return inet_ntop(substr($packed, 0, 6) . str_repeat("\x00", 10)) . '/48';
            }
        }

        $packed[3] = "\x00";

        return inet_ntop($packed) . '/24';
    }
}
