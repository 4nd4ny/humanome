<?php

declare(strict_types=1);

namespace Humanome\Tests;

use Humanome\Bootstrap;
use Humanome\Db;
use Humanome\Maintenance\Maintenance;
use Humanome\MigrationRunner;
use PDO;
use PHPUnit\Framework\TestCase;
use Psr\Http\Message\ResponseInterface;
use Slim\Psr7\Factory\ServerRequestFactory;

require_once \dirname(__DIR__, 2) . '/scripts/maintenance.php';

/**
 * Periodic maintenance (P12.2/P13, cahier §6): dead share-link purge past the
 * 30-day grace window + demo-counter reset. Exercises BOTH entry points — the
 * canonical class scripts/maintenance.php::Maintenance::run() and the
 * production route POST /api/admin/maintenance — and asserts they leave the
 * database in the same state (the two must not drift).
 */
final class MaintenanceTest extends TestCase
{
    private const TOKEN = 'test_migrate_token_0123456789abcdef';

    private static PDO $pdo;

    public static function setUpBeforeClass(): void
    {
        self::$pdo = TestDb::fresh();
        (new MigrationRunner(self::$pdo, MigrationRunner::defaultMigrationsDir()))->run();
        TestDb::overrideEnv();
    }

    public static function tearDownAfterClass(): void
    {
        TestDb::restoreEnv();
    }

    protected function setUp(): void
    {
        TestDb::overrideEnv();
        self::$pdo->exec('DELETE FROM share_links');
        self::$pdo->exec('DELETE FROM cartographies');
        self::$pdo->exec('DELETE FROM users');
        self::$pdo->exec('DELETE FROM llm_usage_daily');
        self::$pdo->exec('DELETE FROM llm_pow_challenges');
    }

    private static function ago(int $days): string
    {
        return gmdate('Y-m-d H:i:s', time() - $days * 86400);
    }

    private static function inDays(int $days): string
    {
        return gmdate('Y-m-d H:i:s', time() + $days * 86400);
    }

    /**
     * Seeds the fixture and returns the ids of the share links that MUST
     * survive (fresh-expired, future, active) — the dead ones (expired 40d,
     * revoked 40d) must be gone.
     *
     * @return list<int> surviving share-link ids
     */
    private function seed(): array
    {
        self::$pdo->prepare('INSERT INTO users (email, password_hash, display_name) VALUES (?, ?, ?)')
            ->execute(['learner@example.org', 'x', 'Apprenant']);
        $uid = (int) self::$pdo->lastInsertId();
        self::$pdo->prepare(
            "INSERT INTO cartographies (user_id, type, titre, visibility) VALUES (?, 'jour', 'T', 'publique')"
        )->execute([$uid]);
        $cid = (int) self::$pdo->lastInsertId();

        $insert = self::$pdo->prepare(
            'INSERT INTO share_links (cartographie_id, token_hash, password_hash, expires_at, revoked_at)
             VALUES (?, ?, ?, ?, ?)'
        );
        $survivors = [];
        // Dead: expired 40 days ago -> purge.
        $insert->execute([$cid, hash('sha256', 'a'), 'h', self::ago(40), null]);
        // Dead: revoked 40 days ago -> purge.
        $insert->execute([$cid, hash('sha256', 'b'), 'h', null, self::ago(40)]);
        // Survive: expired only 10 days ago (inside the 30-day grace).
        $insert->execute([$cid, hash('sha256', 'c'), 'h', self::ago(10), null]);
        $survivors[] = (int) self::$pdo->lastInsertId();
        // Survive: expires in the future.
        $insert->execute([$cid, hash('sha256', 'd'), 'h', self::inDays(30), null]);
        $survivors[] = (int) self::$pdo->lastInsertId();
        // Survive: active, never expires.
        $insert->execute([$cid, hash('sha256', 'e'), 'h', null, null]);
        $survivors[] = (int) self::$pdo->lastInsertId();

        // Demo daily counters: a past UTC day (purge) + today's live row (keep).
        $demo = self::$pdo->prepare(
            'INSERT INTO llm_usage_daily (usage_date, requests, input_tokens, output_tokens, estimated_cost_usd)
             VALUES (?, 1, 10, 10, 0.01)'
        );
        $demo->execute([gmdate('Y-m-d', time() - 2 * 86400)]);
        $demo->execute([gmdate('Y-m-d')]); // today: kept (breaker integrity)

        // PoW challenges: one expired (purge), one future (keep).
        $pow = self::$pdo->prepare('INSERT INTO llm_pow_challenges (challenge_hash, expires_at) VALUES (?, ?)');
        $pow->execute([hash('sha256', 'old'), time() - 100]);
        $pow->execute([hash('sha256', 'new'), time() + 100]);

        return $survivors;
    }

    private static function rowsIn(string $table): int
    {
        return (int) self::$pdo->query("SELECT COUNT(*) FROM {$table}")->fetchColumn();
    }

    private function verifyPostConditions(array $survivors): void
    {
        // Exactly the three live links remain, by id.
        $ids = array_map(intval(...), self::$pdo->query('SELECT id FROM share_links ORDER BY id')->fetchAll(PDO::FETCH_COLUMN));
        sort($survivors);
        self::assertSame($survivors, $ids, 'seuls les liens vivants doivent subsister');

        // Only today's demo row remains; the expired PoW challenge is gone.
        self::assertSame(1, self::rowsIn('llm_usage_daily'));
        self::assertSame(gmdate('Y-m-d'), (string) self::$pdo->query('SELECT usage_date FROM llm_usage_daily')->fetchColumn());
        self::assertSame(1, self::rowsIn('llm_pow_challenges'));
    }

    public function testClassePurgeLiensMortsEtCompteursDemo(): void
    {
        $survivors = $this->seed();

        $counters = Maintenance::run(Db::get());

        self::assertSame(
            ['shareLinksPurged' => 2, 'demoDaysPruned' => 1, 'powChallengesPruned' => 1],
            $counters,
        );
        $this->verifyPostConditions($survivors);
    }

    public function testRoutePurgeAvecTokenEtProduitLesMemesEffets(): void
    {
        TestDb::setEnv('MIGRATE_TOKEN', self::TOKEN);
        $survivors = $this->seed();

        $response = $this->post(self::TOKEN);
        self::assertSame(200, $response->getStatusCode(), (string) $response->getBody());
        self::assertSame(
            ['shareLinksPurged' => 2, 'demoDaysPruned' => 1, 'powChallengesPruned' => 1],
            self::body($response),
        );
        $this->verifyPostConditions($survivors);
    }

    public function testRouteRefuseSansToken(): void
    {
        TestDb::setEnv('MIGRATE_TOKEN', self::TOKEN);

        self::assertSame(403, $this->post(null)->getStatusCode());
        self::assertSame(403, $this->post('mauvais')->getStatusCode());
    }

    public function testRouteInexistanteSansTokenConfigure(): void
    {
        TestDb::setEnv('MIGRATE_TOKEN', '');

        self::assertSame(404, $this->post(self::TOKEN)->getStatusCode());
    }

    private function post(?string $token): ResponseInterface
    {
        $request = (new ServerRequestFactory())->createServerRequest('POST', '/api/admin/maintenance');
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
}
