<?php

declare(strict_types=1);

namespace Humanome\Tests;

use Humanome\Bootstrap;
use Humanome\Db;
use Humanome\MigrationRunner;
use Humanome\Referentiel\ReferentielGovernance;
use Humanome\Referentiel\ReferentielRepository;
use PHPUnit\Framework\TestCase;
use Psr\Http\Message\ResponseInterface;
use Slim\Psr7\Factory\ServerRequestFactory;

/**
 * Shared plumbing for referentiel module tests: migrated humanome_test
 * schema, table cleanup between tests, HTTP helpers and fixtures.
 */
abstract class ReferentielTestCase extends TestCase
{
    protected const RESPIRE = ReferentielRepository::DEFAULT_REFERENTIEL_ID;
    protected const IMPORT_NOTE = 'Import initial RESPIRE v7';

    public static function setUpBeforeClass(): void
    {
        $pdo = TestDb::fresh();
        (new MigrationRunner($pdo, MigrationRunner::defaultMigrationsDir()))->run();
    }

    protected function setUp(): void
    {
        TestDb::overrideEnv();
        $pdo = Db::get();
        $pdo->exec('DELETE FROM referentiel_votes');
        $pdo->exec('DELETE FROM referentiel_versions');
        $pdo->exec('DELETE FROM user_roles');
        $pdo->exec('DELETE FROM users');
        $_SESSION = [];
    }

    protected function tearDown(): void
    {
        $_SESSION = [];
        TestDb::restoreEnv();
    }

    protected static function repo(): ReferentielRepository
    {
        return new ReferentielRepository(Db::get());
    }

    protected static function governance(): ReferentielGovernance
    {
        return new ReferentielGovernance(Db::get());
    }

    /**
     * Drive a draft through the full governance flow to publication: ensure an
     * épistémiarque member exists, open a vote, approve it (single-member
     * majority), then publish. Mirrors what the UI does across several clicks.
     *
     * @return array<string, mixed> the published version
     */
    protected static function adoptAndPublish(int $draftId, string $releaseNote, ?int $memberId = null): array
    {
        $memberId ??= self::createUser('epistemiarque');
        self::governance()->submit($draftId, null, $memberId);
        self::governance()->castVote($draftId, $memberId, 'pour', null);

        return self::repo()->publish($draftId, $releaseNote);
    }

    /** @return array<string, mixed> the real extracted RESPIRE v7 document */
    protected static function respireDocument(): array
    {
        $path = dirname(__DIR__, 2) . '/web/public/data/referentiel/respire-v7.json';
        self::assertFileExists($path, 'run: node scripts/extract-referentiel.mjs');

        return json_decode((string) file_get_contents($path), true, 512, JSON_THROW_ON_ERROR);
    }

    /** Import the real v7 document as the initial published version. */
    protected static function importRespire(): array
    {
        return self::repo()->importPublishedDocument(self::respireDocument(), self::IMPORT_NOTE);
    }

    protected static function createUser(string ...$roles): int
    {
        $pdo = Db::get();
        $stmt = $pdo->prepare(
            'INSERT INTO users (email, password_hash, display_name) VALUES (?, ?, ?)'
        );
        $stmt->execute([uniqid('user', true) . '@test.invalid', 'x', 'Test User']);
        $userId = (int) $pdo->lastInsertId();

        $bind = $pdo->prepare(
            'INSERT INTO user_roles (user_id, role_id) SELECT ?, id FROM roles WHERE name = ?'
        );
        foreach ($roles as $role) {
            $bind->execute([$userId, $role]);
        }

        return $userId;
    }

    /** Simulate an authenticated session (contract: $_SESSION['user_id']). */
    protected static function loginAs(int $userId): void
    {
        $_SESSION['user_id'] = $userId;
    }

    /** @param array<string, mixed>|null $body JSON body */
    protected function request(string $method, string $path, ?array $body = null): ResponseInterface
    {
        $request = (new ServerRequestFactory())->createServerRequest($method, '/api' . $path);
        if ($body !== null) {
            $request->getBody()->write(json_encode($body, JSON_THROW_ON_ERROR));
            $request->getBody()->rewind();
            $request = $request->withHeader('Content-Type', 'application/json');
        }

        return Bootstrap::createApp()->handle($request);
    }

    /** @return array<string, mixed> */
    protected static function body(ResponseInterface $response): array
    {
        return json_decode((string) $response->getBody(), true, 512, JSON_THROW_ON_ERROR);
    }
}
