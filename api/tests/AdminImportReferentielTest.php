<?php

declare(strict_types=1);

namespace Humanome\Tests;

use Humanome\Bootstrap;
use Humanome\Env;
use Psr\Http\Message\ResponseInterface;
use Slim\Psr7\Factory\ServerRequestFactory;

final class AdminImportReferentielTest extends ReferentielTestCase
{
    private function postImport(?string $token, mixed $body): ResponseInterface
    {
        $request = (new ServerRequestFactory())
            ->createServerRequest('POST', '/api/admin/import-referentiel');
        $request->getBody()->write(\is_string($body) ? $body : json_encode($body, JSON_THROW_ON_ERROR));
        $request->getBody()->rewind();
        if ($token !== null) {
            $request = $request->withHeader('X-Migrate-Token', $token);
        }

        return Bootstrap::createApp()->handle($request);
    }

    private static function token(): string
    {
        return Env::get('MIGRATE_TOKEN', 'dev_migrate_token');
    }

    public function testRejectsMissingOrWrongToken(): void
    {
        self::assertSame(403, $this->postImport(null, self::respireDocument())->getStatusCode());
        self::assertSame(403, $this->postImport('wrong', self::respireDocument())->getStatusCode());
    }

    public function testImportsThenIsIdempotent(): void
    {
        $first = $this->postImport(self::token(), self::respireDocument());
        self::assertSame(200, $first->getStatusCode());
        self::assertSame('imported', self::body($first)['status']);

        $second = $this->postImport(self::token(), self::respireDocument());
        self::assertSame(200, $second->getStatusCode());
        self::assertSame('unchanged', self::body($second)['status']);
    }

    public function testRejectsGarbageAndHashMismatch(): void
    {
        self::assertSame(400, $this->postImport(self::token(), 'not json')->getStatusCode());

        $doc = self::respireDocument();
        $doc['contentHash'] = str_repeat('0', 64);
        self::assertSame(409, $this->postImport(self::token(), $doc)->getStatusCode());
    }
}
