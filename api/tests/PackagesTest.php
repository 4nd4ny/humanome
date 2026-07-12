<?php

declare(strict_types=1);

namespace Humanome\Tests;

use Humanome\Packages\PromptPackageRepository;

/**
 * P8 — prompt packages: published list/detail routes, hash-idempotent import
 * (script repository + admin endpoint), immutability of published versions,
 * and the generated default package build/prompt-packages/*.json.
 */
final class PackagesTest extends AuthTestBase
{
    protected function setUp(): void
    {
        parent::setUp();
        self::$pdo->exec('DELETE FROM prompt_packages');
        TestDb::setEnv('MIGRATE_TOKEN', 'test-migrate-token');
    }

    /** @return array<string, mixed> a minimal document valid against prompt-package.schema.json */
    private static function packageDoc(array $overrides = []): array
    {
        $fixture = dirname(__DIR__, 2) . '/schemas/fixtures/prompt-package-exemple.json';
        $doc = json_decode((string) file_get_contents($fixture), true, 512, JSON_THROW_ON_ERROR);

        return array_merge($doc, $overrides);
    }

    public function testImportIsIdempotentByHash(): void
    {
        $repo = new PromptPackageRepository(self::$pdo);
        $doc = self::packageDoc();

        $first = $repo->importPublishedDocument($doc);
        self::assertSame('imported', $first['status']);

        // Same content, key order shuffled: still a no-op (canonical hash).
        $shuffled = array_reverse($doc, true);
        $second = $repo->importPublishedDocument($shuffled);
        self::assertSame('unchanged', $second['status']);
        self::assertSame($first['contentHash'], $second['contentHash']);
        self::assertSame(1, (int) self::$pdo->query('SELECT COUNT(*) FROM prompt_versions')->fetchColumn());
    }

    public function testPublishedVersionsAreImmutable(): void
    {
        $repo = new PromptPackageRepository(self::$pdo);
        $repo->importPublishedDocument(self::packageDoc());

        $this->expectException(\Humanome\Packages\PackageConflictException::class);
        $repo->importPublishedDocument(self::packageDoc(['description' => 'Contenu modifié']));
    }

    public function testImportRejectsInvalidDocuments(): void
    {
        $repo = new PromptPackageRepository(self::$pdo);
        $invalid = self::packageDoc(['prompts' => []]); // minItems: 1

        try {
            $repo->importPublishedDocument($invalid);
            self::fail('expected InvalidPackageException');
        } catch (\Humanome\Packages\InvalidPackageException $e) {
            self::assertNotSame([], $e->getErrors());
        }
        self::assertSame(0, (int) self::$pdo->query('SELECT COUNT(*) FROM prompt_versions')->fetchColumn());
    }

    public function testListAndDetailRoutes(): void
    {
        (new PromptPackageRepository(self::$pdo))->importPublishedDocument(self::packageDoc());
        // A draft version must stay invisible.
        self::$pdo->exec(
            "INSERT INTO prompt_versions (package_id, semver, status, content)
             SELECT id, '2.0.0-draft', 'draft', '{}' FROM prompt_packages LIMIT 1"
        );

        $list = self::json($this->request('GET', '/api/prompt-packages'));
        self::assertCount(1, $list);
        self::assertSame('aurora-demo', $list[0]['id']);
        self::assertSame('1.0.0', $list[0]['version']);
        self::assertNotNull($list[0]['publishedAt']);
        self::assertArrayHasKey('description', $list[0]);

        $detail = $this->request('GET', '/api/prompt-packages/aurora-demo/1.0.0');
        self::assertSame(200, $detail->getStatusCode());
        $doc = self::json($detail);
        self::assertSame('prompt-package', $doc['kind']);
        self::assertSame('aurora-demo', $doc['id']);
        self::assertNotSame([], $doc['prompts']);

        self::assertSame(404, $this->request('GET', '/api/prompt-packages/aurora-demo/9.9.9')->getStatusCode());
        self::assertSame(404, $this->request('GET', '/api/prompt-packages/aurora-demo/2.0.0-draft')->getStatusCode());
    }

    public function testAdminImportEndpoint(): void
    {
        $doc = self::packageDoc();

        // No token header -> 403; wrong token -> 403.
        self::assertSame(403, $this->request('POST', '/api/admin/import-prompt-package', $doc)->getStatusCode());
        self::assertSame(403, $this->request('POST', '/api/admin/import-prompt-package', $doc, [
            'X-Migrate-Token' => 'wrong',
        ])->getStatusCode());

        $first = $this->request('POST', '/api/admin/import-prompt-package', $doc, [
            'X-Migrate-Token' => 'test-migrate-token',
        ]);
        self::assertSame(200, $first->getStatusCode());
        self::assertSame('imported', self::json($first)['status']);

        // Idempotent re-import.
        $second = $this->request('POST', '/api/admin/import-prompt-package', $doc, [
            'X-Migrate-Token' => 'test-migrate-token',
        ]);
        self::assertSame('unchanged', self::json($second)['status']);

        // Different content on the same version -> 409.
        $conflict = $this->request(
            'POST',
            '/api/admin/import-prompt-package',
            self::packageDoc(['description' => 'Autre contenu']),
            ['X-Migrate-Token' => 'test-migrate-token'],
        );
        self::assertSame(409, $conflict->getStatusCode());

        // Invalid document -> 422.
        $invalid = $this->request(
            'POST',
            '/api/admin/import-prompt-package',
            self::packageDoc(['id' => 'autre', 'prompts' => []]),
            ['X-Migrate-Token' => 'test-migrate-token'],
        );
        self::assertSame(422, $invalid->getStatusCode());

        // Unconfigured MIGRATE_TOKEN: the endpoint "does not exist".
        TestDb::setEnv('MIGRATE_TOKEN', '');
        self::assertSame(404, $this->request('POST', '/api/admin/import-prompt-package', $doc, [
            'X-Migrate-Token' => 'test-migrate-token',
        ])->getStatusCode());
    }

    public function testGeneratedDefaultPackageImportsCleanly(): void
    {
        $file = dirname(__DIR__, 2) . '/build/prompt-packages/aurora-v3-reconstruit-1.0.0.json';
        if (!is_file($file)) {
            self::markTestSkipped('default package not built — run: node scripts/build-default-prompt-package.mjs');
        }
        $doc = json_decode((string) file_get_contents($file), true, 512, JSON_THROW_ON_ERROR);

        $repo = new PromptPackageRepository(self::$pdo);
        $result = $repo->importPublishedDocument($doc);
        self::assertSame('imported', $result['status']);
        self::assertSame('aurora-v3-reconstruit', $result['id']);
        self::assertSame('unchanged', $repo->importPublishedDocument($doc)['status']);

        // Served back whole through the public route.
        $detail = self::json($this->request('GET', '/api/prompt-packages/aurora-v3-reconstruit/1.0.0'));
        $roles = array_column($detail['prompts'], 'role');
        self::assertSame(
            ['extraction-pole', 'kairos', 'narratif-competence', 'narratif-pole', 'narratif-kairos'],
            $roles,
        );
        self::assertStringContainsString('{{portfolio_texte}}', $detail['prompts'][0]['texte']);
        self::assertStringContainsString('engine://humanome-engine@', $detail['code']['orchestration']);
    }
}
