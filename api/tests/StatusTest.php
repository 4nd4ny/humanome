<?php

declare(strict_types=1);

namespace Humanome\Tests;

use Humanome\Bootstrap;
use PHPUnit\Framework\TestCase;
use Slim\Psr7\Factory\ServerRequestFactory;

final class StatusTest extends TestCase
{
    private function get(string $path): \Psr\Http\Message\ResponseInterface
    {
        $app = Bootstrap::createApp();
        $request = (new ServerRequestFactory())->createServerRequest('GET', $path);

        return $app->handle($request);
    }

    public function testStatusReportsHealthWithoutSecrets(): void
    {
        $response = $this->get('/api/status');

        self::assertSame(200, $response->getStatusCode());
        self::assertStringContainsString('max-age=30', $response->getHeaderLine('Cache-Control'));

        $body = json_decode((string) $response->getBody(), true, 512, JSON_THROW_ON_ERROR);
        self::assertSame('ok', $body['status']);
        self::assertArrayHasKey('version', $body);
        self::assertContains($body['db'], ['ok', 'unconfigured', 'error']);
        self::assertArrayHasKey('enabled', $body['demo']);
        self::assertArrayHasKey('queued', $body['worker']);

        // No secret leaks into the public status payload.
        $raw = (string) $response->getBody();
        foreach (['api_key', 'apiKey', 'password', 'token', 'sk-ant', 'MIGRATE'] as $needle) {
            self::assertStringNotContainsStringIgnoringCase($needle, $raw);
        }
    }
}
