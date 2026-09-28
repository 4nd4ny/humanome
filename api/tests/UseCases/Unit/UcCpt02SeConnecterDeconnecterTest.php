<?php

declare(strict_types=1);

namespace Humanome\Tests\UseCases\Unit;

use Humanome\Auth\LoginJournal;
use Humanome\Auth\RateLimiter;
use Humanome\Auth\Session;
use Humanome\Auth\Users;
use Humanome\DbSessionHandler;
use Humanome\Geo\CountryResolver;
use Humanome\Geo\IpAnonymizer;
use Humanome\Middleware\CsrfMiddleware;
use Humanome\MigrationRunner;
use Humanome\Tests\TestDb;
use PDO;
use PHPUnit\Framework\Attributes\TestDox;
use PHPUnit\Framework\TestCase;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\RequestHandlerInterface;
use Slim\Psr7\Factory\ResponseFactory;
use Slim\Psr7\Factory\ServerRequestFactory;

/**
 * UC-CPT-02 — Se connecter et se déconnecter : tests UNITAIRES.
 *
 * Fiche : docs/cas-utilisation/compte/UC-CPT-02-se-connecter-deconnecter.md
 *
 * Briques de POST /api/auth/login, /logout et GET /api/auth/me appelées
 * directement : journal des connexions (LoginJournal + IpAnonymizer +
 * CountryResolver), stockage des sessions (DbSessionHandler), ouverture et
 * destruction de session (Session), garde CSRF (CsrfMiddleware) et quota de
 * connexion (RateLimiter 5 / 15 min).
 */
final class UcCpt02SeConnecterDeconnecterTest extends TestCase
{
    private static PDO $pdo;

    public static function setUpBeforeClass(): void
    {
        self::$pdo = TestDb::fresh();
        (new MigrationRunner(self::$pdo, MigrationRunner::defaultMigrationsDir()))->run();
    }

    public static function tearDownAfterClass(): void
    {
        TestDb::restoreEnv();
    }

    protected function setUp(): void
    {
        TestDb::overrideEnv();
        self::$pdo->exec('DELETE FROM users');
        self::$pdo->exec('DELETE FROM audit_events');
        self::$pdo->exec('DELETE FROM sessions');
        self::$pdo->exec('DELETE FROM rate_limits');
    }

    protected function tearDown(): void
    {
        CountryResolver::setOverride(null);
        if (session_status() === PHP_SESSION_ACTIVE) {
            session_abort();
        }
        session_id('');
        $_SESSION = [];
        unset($_COOKIE[DbSessionHandler::SESSION_NAME], $_SERVER['REMOTE_ADDR']);
    }

    private static function newUser(string $email = 'ada@example.org'): int
    {
        $id = Users::create(self::$pdo, $email, Users::hashPassword('correct horse battery'), 'Ada');
        Users::markVerified(self::$pdo, $id);

        return $id;
    }

    /** @return list<array{type: string, user_id: ?string, details: ?string}> */
    private static function events(): array
    {
        return self::$pdo->query('SELECT type, user_id, details FROM audit_events ORDER BY id')->fetchAll();
    }

    #[TestDox('UC-CPT-02-U01 — LoginJournal : succès et échec journalisés avec pays + réseau tronqué, jamais l’IP brute')]
    public function testU01LoginJournalRecordsCountryAndNetworkOnly(): void
    {
        CountryResolver::setOverride(static fn (string $ip): ?string => str_starts_with($ip, '203.') ? 'FR' : null);
        $id = self::newUser();

        LoginJournal::success(self::$pdo, $id, '203.0.113.10');
        LoginJournal::failure(self::$pdo, $id, '203.0.113.99');
        LoginJournal::failure(self::$pdo, null, '2001:db8:abcd:12::1'); // email inconnu

        $events = self::events();
        self::assertSame([LoginJournal::LOGIN, LoginJournal::LOGIN_FAILED, LoginJournal::LOGIN_FAILED], array_column($events, 'type'));
        self::assertEquals(['pays' => 'FR', 'reseau' => '203.0.113.0/24'], json_decode((string) $events[0]['details'], true));
        self::assertSame((string) $id, (string) $events[1]['user_id']);
        self::assertNull($events[2]['user_id']);
        self::assertEquals(['pays' => null, 'reseau' => '2001:db8:abcd::/48'], json_decode((string) $events[2]['details'], true));
        foreach ($events as $event) {
            self::assertStringNotContainsString('203.0.113.10', (string) $event['details']);
            self::assertStringNotContainsString('2001:db8:abcd:12::1', (string) $event['details']);
        }
    }

    #[TestDox('UC-CPT-02-U02 — LoginJournal::prune : seules les connexions de plus de 365 jours disparaissent')]
    public function testU02PruneKeepsRetentionWindowAndOtherEvents(): void
    {
        $id = self::newUser();
        self::$pdo->prepare(
            "INSERT INTO audit_events (user_id, type, created_at) VALUES
                (?, 'login', DATE_SUB(NOW(), INTERVAL 400 DAY)),
                (?, 'login_failed', DATE_SUB(NOW(), INTERVAL 400 DAY)),
                (?, 'login', DATE_SUB(NOW(), INTERVAL 10 DAY)),
                (?, 'account_created', DATE_SUB(NOW(), INTERVAL 400 DAY))"
        )->execute([$id, $id, $id, $id]);

        LoginJournal::prune(self::$pdo);

        self::assertSame(['login', 'account_created'], array_column(self::events(), 'type'));
        self::assertSame(365, LoginJournal::RETENTION_DAYS);
    }

    #[TestDox('UC-CPT-02-U03 — IpAnonymizer : IPv4 → /24, IPv6 → /48, IPv4 mappée → /24, invalide → null')]
    public function testU03IpAnonymizerTruncatesNetworks(): void
    {
        self::assertSame('198.51.100.0/24', IpAnonymizer::network('198.51.100.77'));
        self::assertSame('2001:db8:1::/48', IpAnonymizer::network('2001:db8:1:2:3:4:5:6'));
        self::assertSame('198.51.100.0/24', IpAnonymizer::network('::ffff:198.51.100.77'));
        self::assertNull(IpAnonymizer::network('pas-une-ip'));
        self::assertNull(IpAnonymizer::network(''));
    }

    #[TestDox('UC-CPT-02-U04 — CountryResolver : base locale absente ou introuvable → null, sans erreur sur le chemin de connexion')]
    public function testU04CountryResolverDegradesCleanly(): void
    {
        TestDb::setEnv('GEOIP_DB', '');
        CountryResolver::setOverride(null);
        self::assertNull(CountryResolver::resolve('203.0.113.10'));

        TestDb::setEnv('GEOIP_DB', '/nulle/part/dbip-country.mmdb');
        CountryResolver::setOverride(null); // relâche le verrou « indisponible »
        self::assertNull(CountryResolver::resolve('203.0.113.10'));

        CountryResolver::setOverride(static fn (string $ip): ?string => 'BE');
        self::assertSame('BE', CountryResolver::resolve('203.0.113.10'));
    }

    #[TestDox('UC-CPT-02-U05 — DbSessionHandler : la ligne de session porte sha256(IP), jamais l’IP ; bindUser/destroy')]
    public function testU05SessionRowStoresOnlyAnIpHash(): void
    {
        $userId = self::newUser();
        $_SERVER['REMOTE_ADDR'] = '203.0.113.10';
        $handler = new DbSessionHandler(self::$pdo);

        self::assertTrue($handler->write('sid-u05', 'user_id|i:1;'));
        $handler->bindUser('sid-u05', $userId);

        $row = self::$pdo->query("SELECT * FROM sessions WHERE id = 'sid-u05'")->fetch();
        self::assertSame(hash('sha256', '203.0.113.10'), $row['ip_hash']);
        self::assertSame($userId, (int) $row['user_id']);
        self::assertStringNotContainsString('203.0.113.10', implode('|', array_map('strval', $row)));

        // Une écriture de routine ne détache pas l'utilisateur.
        $handler->write('sid-u05', 'autre');
        self::assertSame($userId, (int) self::$pdo->query("SELECT user_id FROM sessions WHERE id = 'sid-u05'")->fetchColumn());

        self::assertTrue($handler->destroy('sid-u05'));
        self::assertSame('', $handler->read('sid-u05'));
    }

    #[TestDox('UC-CPT-02-U06 — Session::openForUser régénère l’identifiant (fixation), pose un jeton CSRF 64 hex ; destroy supprime la ligne')]
    public function testU06OpenForUserRegeneratesAndDestroyPurges(): void
    {
        $userId = self::newUser();
        $_SERVER['REMOTE_ADDR'] = '203.0.113.10';
        Session::start();
        $before = session_id();

        $token = Session::openForUser($userId);

        $after = session_id();
        self::assertNotSame($before, $after, 'identifiant régénéré à l’ouverture');
        self::assertMatchesRegularExpression('/^[0-9a-f]{64}$/', $token);
        self::assertSame($userId, Session::userId());
        self::assertSame($token, Session::storedCsrfToken());
        self::assertSame($token, Session::csrfToken(), 'GET /auth/me redélivre le même jeton');
        $stmt = self::$pdo->prepare('SELECT user_id FROM sessions WHERE id = ?');
        $stmt->execute([$after]);
        self::assertSame($userId, (int) $stmt->fetchColumn(), 'ligne persistée immédiatement et liée au compte');

        Session::destroy();

        self::assertNotSame(PHP_SESSION_ACTIVE, session_status());
        $stmt->execute([$after]);
        self::assertFalse($stmt->fetchColumn(), 'ligne de session supprimée');
    }

    #[TestDox('UC-CPT-02-U07 — CsrfMiddleware : déconnexion sans jeton ou avec un mauvais jeton → 403 ; bon jeton ou GET → passe')]
    public function testU07CsrfGuardsLogout(): void
    {
        $userId = self::newUser();
        Session::start();
        $token = Session::openForUser($userId);
        $_COOKIE[DbSessionHandler::SESSION_NAME] = session_id();

        $handler = new class () implements RequestHandlerInterface {
            public int $calls = 0;

            public function handle(ServerRequestInterface $request): ResponseInterface
            {
                $this->calls++;

                return (new ResponseFactory())->createResponse(204);
            }
        };
        $middleware = new CsrfMiddleware();
        $logout = (new ServerRequestFactory())->createServerRequest('POST', '/api/auth/logout');

        $missing = $middleware->process($logout, $handler);
        self::assertSame(403, $missing->getStatusCode());
        self::assertSame('{"error":"Jeton CSRF absent ou invalide"}', (string) $missing->getBody());
        self::assertSame(403, $middleware->process($logout->withHeader('X-CSRF-Token', str_repeat('0', 64)), $handler)->getStatusCode());
        self::assertSame(0, $handler->calls);

        self::assertSame(204, $middleware->process($logout->withHeader('X-CSRF-Token', $token), $handler)->getStatusCode());
        self::assertSame(204, $middleware->process((new ServerRequestFactory())->createServerRequest('GET', '/api/auth/me'), $handler)->getStatusCode());
        self::assertSame(204, $middleware->process((new ServerRequestFactory())->createServerRequest('POST', '/api/auth/login'), $handler)->getStatusCode(), 'login exempté');
        self::assertSame(3, $handler->calls);
    }

    #[TestDox('UC-CPT-02-U08 — RateLimiter de connexion : 5 échecs puis blocage, délai 30 → 60 → 120 s, reset après succès')]
    public function testU08LoginRateLimiter(): void
    {
        $limiter = new RateLimiter(self::$pdo, 5, 900);
        $bucket = 'login:' . hash('sha256', 'v4:203.0.113.10|ada@example.org');
        for ($i = 1; $i <= 5; $i++) {
            self::assertFalse($limiter->isBlocked($bucket));
            $limiter->hit($bucket);
        }
        self::assertTrue($limiter->isBlocked($bucket));
        self::assertSame([30, 60, 120], [$limiter->retryAfter(6), $limiter->retryAfter(7), $limiter->retryAfter(8)]);
        self::assertSame(900, $limiter->retryAfter(40), 'plafonné à la fenêtre de 15 min');

        $limiter->reset($bucket);
        self::assertSame(0, $limiter->attempts($bucket));
        self::assertStringNotContainsString('ada@example.org', $bucket, 'seau haché : ni email ni IP en clair');
    }

    #[TestDox('UC-CPT-02-U15 — Users : l’email inconnu coûte une vraie vérification Argon2id (dummyHash) ; un compte non activé est reconnu')]
    public function testU15CredentialChecksBehindLogin(): void
    {
        $id = Users::create(self::$pdo, 'ada@example.org', Users::hashPassword('correct horse battery'), 'Ada');

        // Anti-chronométrage : même algorithme et mêmes paramètres de coût que les vrais comptes.
        $real = password_get_info((string) Users::findByEmail(self::$pdo, 'ada@example.org')['password_hash']);
        $dummy = password_get_info(Users::dummyHash());
        self::assertSame($real['algoName'], $dummy['algoName']);
        self::assertSame($real['options'], $dummy['options']);
        self::assertSame(Users::dummyHash(), Users::dummyHash(), 'calculé une fois par processus');

        self::assertFalse(Users::isVerified(Users::findById(self::$pdo, $id)), 'login → 403 email_not_verified');
        Users::markVerified(self::$pdo, $id);
        self::assertTrue(Users::isVerified(Users::findById(self::$pdo, $id)));
    }
}
