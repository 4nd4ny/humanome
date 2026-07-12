<?php

declare(strict_types=1);

namespace Humanome\Tests;

use Humanome\Bootstrap;
use PHPUnit\Framework\TestCase;
use Slim\Psr7\Factory\ServerRequestFactory;

/**
 * SecurityHeaders middleware (P12.3): every /api/** response carries the
 * hardening headers — the public health check AND a response short-circuited
 * by an inner guard (RequireRole 401), which proves the middleware is truly
 * outermost (added after the route files in Bootstrap).
 */
final class SecurityHeadersTest extends TestCase
{
    /** @return array<string, string> expected header => value */
    private static function expected(): array
    {
        return [
            'Content-Security-Policy' => "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
            'X-Content-Type-Options' => 'nosniff',
            'X-Frame-Options' => 'DENY',
            'Referrer-Policy' => 'no-referrer',
            'Strict-Transport-Security' => 'max-age=31536000',
        ];
    }

    public function testHeadersPresentOnHealth(): void
    {
        $app = Bootstrap::createApp();
        $request = (new ServerRequestFactory())->createServerRequest('GET', '/api/health');

        $response = $app->handle($request);

        self::assertSame(200, $response->getStatusCode());
        foreach (self::expected() as $name => $value) {
            self::assertSame($value, $response->getHeaderLine($name), "header {$name} on /api/health");
        }
        self::assertNotSame('', $response->getHeaderLine('Permissions-Policy'));
        // The JSON content type set by the route is preserved, not clobbered.
        self::assertSame('application/json', $response->getHeaderLine('Content-Type'));
    }

    public function testHeadersPresentOnAuthGated401(): void
    {
        // GET /api/cartographies is RequireRole('apprenant'); with no session
        // cookie the guard short-circuits with 401 BEFORE the route runs. That
        // response must still carry the headers -> SecurityHeaders is outermost.
        $app = Bootstrap::createApp();
        $request = (new ServerRequestFactory())->createServerRequest('GET', '/api/cartographies');

        $response = $app->handle($request);

        self::assertSame(401, $response->getStatusCode());
        foreach (self::expected() as $name => $value) {
            self::assertSame($value, $response->getHeaderLine($name), "header {$name} on 401");
        }
    }

    public function testHeadersPresentOnNotFound(): void
    {
        // A route the router cannot match -> the error middleware synthesises a
        // 404. Being outermost, SecurityHeaders decorates that too.
        $app = Bootstrap::createApp();
        $request = (new ServerRequestFactory())->createServerRequest('GET', '/api/does-not-exist');

        $response = $app->handle($request);

        self::assertSame(404, $response->getStatusCode());
        self::assertSame('nosniff', $response->getHeaderLine('X-Content-Type-Options'));
        self::assertSame('DENY', $response->getHeaderLine('X-Frame-Options'));
    }
}
