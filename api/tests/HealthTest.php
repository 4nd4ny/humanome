<?php

declare(strict_types=1);

namespace Humanome\Tests;

use Humanome\Bootstrap;
use PHPUnit\Framework\TestCase;
use Slim\Psr7\Factory\ServerRequestFactory;

final class HealthTest extends TestCase
{
    public function testHealthEndpointRespondsOk(): void
    {
        $app = Bootstrap::createApp();
        $request = (new ServerRequestFactory())->createServerRequest('GET', '/api/health');

        $response = $app->handle($request);

        self::assertSame(200, $response->getStatusCode());
        self::assertSame('application/json', $response->getHeaderLine('Content-Type'));

        $body = json_decode((string) $response->getBody(), true, 512, JSON_THROW_ON_ERROR);
        self::assertSame('ok', $body['status']);
        self::assertArrayHasKey('version', $body);
        self::assertContains($body['db'], ['ok', 'unconfigured', 'error']);
    }
}
