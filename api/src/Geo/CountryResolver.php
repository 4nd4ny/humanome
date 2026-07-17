<?php

declare(strict_types=1);

namespace Humanome\Geo;

use Humanome\Env;
use MaxMind\Db\Reader;

/**
 * Pays (code ISO 3166-1 alpha-2) d'une IP, résolu LOCALEMENT au moment de la
 * connexion contre une base MMDB (format MaxMind DB ; ex. « IP to Country
 * Lite » de db-ip.com) pointée par la variable d'environnement GEOIP_DB.
 * L'IP n'est jamais envoyée à un service tiers, et seul le pays est stocké.
 *
 * Dégradation propre : fichier absent, illisible ou lecteur indisponible ->
 * null (le monitoring affiche « — »), jamais d'erreur au chemin de connexion.
 */
final class CountryResolver
{
    private static ?Reader $reader = null;

    /** Latch : n'essaie d'ouvrir la base qu'une fois par process. */
    private static bool $unavailable = false;

    /** @var (callable(string): ?string)|null couture de test */
    private static $override = null;

    public static function resolve(string $ip): ?string
    {
        if (self::$override !== null) {
            return (self::$override)($ip);
        }
        $reader = self::reader();
        if ($reader === null) {
            return null;
        }

        try {
            $record = $reader->get($ip);
        } catch (\Throwable) {
            return null;
        }
        $code = \is_array($record) ? ($record['country']['iso_code'] ?? null) : null;

        return \is_string($code) && $code !== '' ? $code : null;
    }

    /** @param (callable(string): ?string)|null $fn couture de test */
    public static function setOverride(?callable $fn): void
    {
        self::$override = $fn;
        self::$reader = null;
        self::$unavailable = false;
    }

    private static function reader(): ?Reader
    {
        if (self::$unavailable) {
            return null;
        }
        if (self::$reader !== null) {
            return self::$reader;
        }

        $path = Env::get('GEOIP_DB', '');
        if ($path === '' || !is_file($path) || !class_exists(Reader::class)) {
            self::$unavailable = true;

            return null;
        }

        try {
            self::$reader = new Reader($path);
        } catch (\Throwable) {
            self::$unavailable = true;

            return null;
        }

        return self::$reader;
    }
}
