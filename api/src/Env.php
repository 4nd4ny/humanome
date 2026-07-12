<?php

declare(strict_types=1);

namespace Humanome;

/**
 * Environment access with a deterministic precedence: $_ENV (test overrides,
 * dotenv), then $_SERVER, then getenv(). An explicitly set empty string wins
 * over a lower layer, which lets tests simulate "not configured".
 */
final class Env
{
    public static function get(string $key, string $default = ''): string
    {
        if (\array_key_exists($key, $_ENV) && \is_string($_ENV[$key])) {
            return $_ENV[$key];
        }
        if (\array_key_exists($key, $_SERVER) && \is_string($_SERVER[$key])) {
            return $_SERVER[$key];
        }
        $value = getenv($key);

        return $value === false ? $default : $value;
    }
}
