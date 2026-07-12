<?php

declare(strict_types=1);

namespace Humanome\Middleware;

use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\MiddlewareInterface;
use Psr\Http\Server\RequestHandlerInterface;

/**
 * Security response headers on EVERY /api/** response (P12.3).
 *
 * Wired as the OUTERMOST middleware (Bootstrap adds it AFTER the route files,
 * so it is the last `$app->add()` — last added runs first in Slim). Being
 * outermost, it decorates every response on the way out, including the ones
 * short-circuited by inner middleware (CSRF 403, RequireRole 401) and the ones
 * synthesised by the error middleware (404, 500) — none of those escape it.
 *
 * The API answers JSON only; it never serves a document a browser renders and
 * never embeds a sub-resource. So its policy is the tightest possible:
 *
 *   - Content-Security-Policy: default-src 'none' — an API JSON body has no
 *     legitimate resource to load; if a bug ever made a response HTML, nothing
 *     in it could execute or phone home. frame-ancestors/base-uri 'none' on top.
 *   - X-Content-Type-Options: nosniff — never let a browser second-guess the
 *     declared application/json (defence against content-type confusion).
 *   - X-Frame-Options: DENY — an API response is never meant to be framed
 *     (stricter than the SAMEORIGIN the static front uses).
 *   - Referrer-Policy: no-referrer — an API response carries no navigation the
 *     Referer should leak.
 *   - Permissions-Policy — deny every powerful feature; the API needs none.
 *   - Strict-Transport-Security — HTTPS is forced by the front .htaccess; pin it
 *     here too. Ignored by browsers over plain HTTP (harmless in docker dev).
 *
 * These values are duplicated defensively in api/deploy/webroot/.htaccess: on
 * OVH the static-front www/.htaccess "Header always set" cascades into www/api/,
 * and would otherwise override PHP-set headers for the same names. The .htaccess
 * override keeps Apache and PHP agreeing on the SAME values. In dev/docker (no
 * front .htaccess in front of the API) this middleware is the sole source.
 *
 * The static front's own headers (including its wider CSP with the sandbox
 * directives) live in web/public/.htaccess — a DIFFERENT policy for a different
 * surface. Documented alongside in docs/securite-checklist.md (A05).
 */
final class SecurityHeaders implements MiddlewareInterface
{
    /** @var array<string, string> header name => value */
    private const HEADERS = [
        'Content-Security-Policy' => "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
        'X-Content-Type-Options' => 'nosniff',
        'X-Frame-Options' => 'DENY',
        'Referrer-Policy' => 'no-referrer',
        'Permissions-Policy' => 'accelerometer=(), autoplay=(), camera=(), display-capture=(), '
            . 'encrypted-media=(), fullscreen=(), geolocation=(), gyroscope=(), magnetometer=(), '
            . 'microphone=(), midi=(), payment=(), picture-in-picture=(), usb=(), xr-spatial-tracking=()',
        'Strict-Transport-Security' => 'max-age=31536000',
    ];

    public function process(ServerRequestInterface $request, RequestHandlerInterface $handler): ResponseInterface
    {
        $response = $handler->handle($request);
        foreach (self::HEADERS as $name => $value) {
            $response = $response->withHeader($name, $value);
        }

        return $response;
    }
}
