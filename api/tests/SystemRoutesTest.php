<?php

declare(strict_types=1);

namespace Humanome\Tests;

use Humanome\Bootstrap;
use Humanome\Db;
use PHPUnit\Framework\TestCase;
use Psr\Http\Message\ResponseInterface;
use Slim\Psr7\Factory\ServerRequestFactory;

final class SystemRoutesTest extends TestCase
{
    private const TOKEN = 'test_migrate_token_0123456789abcdef';

    protected function tearDown(): void
    {
        TestDb::restoreEnv();
    }

    private function post(?string $token): ResponseInterface
    {
        $request = (new ServerRequestFactory())->createServerRequest('POST', '/api/admin/migrate');
        if ($token !== null) {
            $request = $request->withHeader('X-Migrate-Token', $token);
        }

        return Bootstrap::createApp()->handle($request);
    }

    /** @return array<string, mixed> */
    private static function body(ResponseInterface $response): array
    {
        return json_decode((string) $response->getBody(), true, 512, JSON_THROW_ON_ERROR);
    }

    public function testMigrateRespondsNotFoundWhenTokenNotConfigured(): void
    {
        TestDb::setEnv('MIGRATE_TOKEN', '');

        $response = $this->post(self::TOKEN);

        self::assertSame(404, $response->getStatusCode());
    }

    public function testMigrateRespondsForbiddenWithoutHeader(): void
    {
        TestDb::setEnv('MIGRATE_TOKEN', self::TOKEN);

        $response = $this->post(null);

        self::assertSame(403, $response->getStatusCode());
    }

    public function testMigrateRespondsForbiddenWithWrongToken(): void
    {
        TestDb::setEnv('MIGRATE_TOKEN', self::TOKEN);

        $response = $this->post('wrong_token');

        self::assertSame(403, $response->getStatusCode());
    }

    public function testMigrateAppliesMigrationsThenIsIdempotent(): void
    {
        TestDb::fresh();
        TestDb::overrideEnv();
        TestDb::setEnv('MIGRATE_TOKEN', self::TOKEN);

        $first = $this->post(self::TOKEN);
        self::assertSame(200, $first->getStatusCode());
        $firstBody = self::body($first);
        self::assertNotEmpty($firstBody['applied']);
        self::assertSame(0, $firstBody['skipped']);

        $second = $this->post(self::TOKEN);
        self::assertSame(200, $second->getStatusCode());
        $secondBody = self::body($second);
        self::assertSame([], $secondBody['applied']);
        self::assertSame(\count($firstBody['applied']), $secondBody['skipped']);
    }

    public function testMigrateErrorDoesNotLeakSqlDetails(): void
    {
        TestDb::overrideEnv();
        TestDb::setEnv('DB_HOST', 'no-such-host.invalid');
        TestDb::setEnv('MIGRATE_TOKEN', self::TOKEN);
        Db::reset();

        $response = $this->post(self::TOKEN);

        self::assertSame(500, $response->getStatusCode());
        $body = (string) $response->getBody();
        self::assertStringNotContainsString('SQLSTATE', $body);
        self::assertStringNotContainsString('no-such-host', $body);
    }

    public function testHealthReportsDbOk(): void
    {
        TestDb::pdo();
        TestDb::overrideEnv();

        $request = (new ServerRequestFactory())->createServerRequest('GET', '/api/health');
        $response = Bootstrap::createApp()->handle($request);

        self::assertSame(200, $response->getStatusCode());
        $body = self::body($response);
        self::assertSame('ok', $body['status']);
        self::assertSame('ok', $body['db']);
    }

    public function testHealthReportsDbUnconfiguredWithoutDbHost(): void
    {
        TestDb::setEnv('DB_HOST', '');
        Db::reset();

        $request = (new ServerRequestFactory())->createServerRequest('GET', '/api/health');
        $response = Bootstrap::createApp()->handle($request);

        self::assertSame(200, $response->getStatusCode());
        self::assertSame('unconfigured', self::body($response)['db']);
    }

    public function testHealthReportsDbErrorWithoutLeakingDetails(): void
    {
        TestDb::setEnv('DB_HOST', 'no-such-host.invalid');
        Db::reset();

        $request = (new ServerRequestFactory())->createServerRequest('GET', '/api/health');
        $response = Bootstrap::createApp()->handle($request);

        self::assertSame(200, $response->getStatusCode());
        $body = self::body($response);
        self::assertSame('error', $body['db']);
        self::assertStringNotContainsString('SQLSTATE', (string) $response->getBody());
    }
}
