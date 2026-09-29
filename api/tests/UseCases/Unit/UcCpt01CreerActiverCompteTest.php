<?php

declare(strict_types=1);

namespace Humanome\Tests\UseCases\Unit;

use Humanome\Auth\Audit;
use Humanome\Auth\RateLimiter;
use Humanome\Auth\Users;
use Humanome\ClientIp;
use Humanome\DbSessionHandler;
use Humanome\Mail\MailerFactory;
use Humanome\Mail\MemoryMailer;
use Humanome\Mail\PhpMailMailer;
use Humanome\Middleware\CsrfMiddleware;
use Humanome\MigrationRunner;
use Humanome\Tests\TestDb;
use PDO;
use PHPUnit\Framework\Attributes\TestDox;
use PHPUnit\Framework\TestCase;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\RequestHandlerInterface;
use RuntimeException;
use Slim\Psr7\Factory\ResponseFactory;
use Slim\Psr7\Factory\ServerRequestFactory;

/**
 * UC-CPT-01 — Créer un compte et l'activer par code email : tests UNITAIRES.
 *
 * Fiche : docs/cas-utilisation/compte/UC-CPT-01-creer-activer-compte.md
 *
 * Les briques appelées par POST /api/auth/register, /activate et /resend sont
 * exercées directement (sans couche HTTP) : Users (création, attribution et
 * relecture de rôle, stockage de l'empreinte du code, compteur d'essais,
 * activation), Audit, le Mailer injectable (MailerFactory / MemoryMailer), le
 * RateLimiter, l'identité IP des seaux (ClientIp) et les exemptions CSRF des
 * routes visiteur.
 *
 * Ce que ces briques NE décident PAS — rôle « apprenant » par défaut, hachage
 * du code, absence de détail dans account_created, valeurs des quotas 10/20/3/10
 * — est fixé par la route (api/src/routes/auth.php) et vérifié par les tests
 * fonctionnels (F01, F07, F10, F11).
 */
final class UcCpt01CreerActiverCompteTest extends TestCase
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
        self::$pdo->exec('DELETE FROM users');
        self::$pdo->exec('DELETE FROM audit_events');
        self::$pdo->exec('DELETE FROM rate_limits');
    }

    protected function tearDown(): void
    {
        MailerFactory::setOverride(null);
        unset($_COOKIE[DbSessionHandler::SESSION_NAME]);
    }

    /** @return array<string, mixed> */
    private static function row(int $userId): array
    {
        $stmt = self::$pdo->prepare('SELECT * FROM users WHERE id = ?');
        $stmt->execute([$userId]);

        return $stmt->fetch();
    }

    #[TestDox('UC-CPT-01-U01 — Users::create, assignRole, rolesOf : compte créé non activé, rôle attribué puis relu, rôle inconnu refusé')]
    public function testU01CreateAndDefaultRole(): void
    {
        $id = Users::create(self::$pdo, 'ada@example.org', Users::hashPassword('correct horse battery'), 'Ada');
        self::assertSame([], Users::rolesOf(self::$pdo, $id), 'create n’attribue aucun rôle : c’est la route qui pose « apprenant » (F01)');
        Users::assignRole(self::$pdo, $id, 'apprenant');

        self::assertSame(['apprenant'], Users::rolesOf(self::$pdo, $id));
        $row = self::row($id);
        self::assertNull($row['email_verified_at'], 'un compte créé n’est PAS activé');
        self::assertSame(0, (int) $row['verification_attempts']);

        $this->expectException(RuntimeException::class);
        Users::assignRole(self::$pdo, $id, 'visiteur'); // le visiteur n'est pas un rôle (§2)
    }

    #[TestDox('UC-CPT-01-U02 — Users::hashPassword : empreinte Argon2id, jamais le mot de passe en clair')]
    public function testU02PasswordIsArgon2id(): void
    {
        $hash = Users::hashPassword('correct horse battery');

        self::assertSame('argon2id', password_get_info($hash)['algoName']);
        self::assertStringNotContainsString('correct horse battery', $hash);
        self::assertTrue(password_verify('correct horse battery', $hash));
        self::assertFalse(password_verify('Correct horse battery', $hash));
    }

    #[TestDox('UC-CPT-01-U03 — setVerificationCode stocke l’empreinte fournie et son expiration, remet les essais à 0 ; bumpVerificationAttempts compte')]
    public function testU03VerificationCodeAndAttempts(): void
    {
        $id = Users::create(self::$pdo, 'ada@example.org', Users::hashPassword('correct horse battery'), 'Ada');
        // L'empreinte est calculée par l'APPELANT (la route hache le code : F01) ;
        // setVerificationCode stocke telle quelle la chaîne reçue.
        $fingerprint = Users::hashPassword('0420');
        Users::setVerificationCode(self::$pdo, $id, $fingerprint, '2030-01-01 00:30:00');

        $row = self::row($id);
        self::assertSame($fingerprint, $row['verification_code_hash']);
        self::assertTrue(password_verify('0420', (string) $row['verification_code_hash']));
        self::assertSame('2030-01-01 00:30:00', $row['verification_expires_at']);

        self::assertSame(1, Users::bumpVerificationAttempts(self::$pdo, $id));
        self::assertSame(2, Users::bumpVerificationAttempts(self::$pdo, $id));

        // Renvoi (D5) : nouveau code ET cinq essais rouverts.
        Users::setVerificationCode(self::$pdo, $id, Users::hashPassword('9999'), '2030-01-01 01:00:00');
        self::assertSame(0, (int) self::row($id)['verification_attempts']);
    }

    #[TestDox('UC-CPT-01-U04 — markVerified active le compte et efface le code (usage unique) ; isVerified')]
    public function testU04MarkVerifiedIsSingleUse(): void
    {
        $id = Users::create(self::$pdo, 'ada@example.org', Users::hashPassword('correct horse battery'), 'Ada');
        Users::setVerificationCode(self::$pdo, $id, Users::hashPassword('0420'), '2030-01-01 00:30:00');
        Users::bumpVerificationAttempts(self::$pdo, $id);
        self::assertFalse(Users::isVerified(Users::findById(self::$pdo, $id)));

        Users::markVerified(self::$pdo, $id);

        $user = Users::findById(self::$pdo, $id);
        self::assertTrue(Users::isVerified($user));
        self::assertNull($user['verification_code_hash']);
        self::assertNull($user['verification_expires_at']);
        self::assertSame(0, (int) $user['verification_attempts']);
        self::assertFalse(Users::isVerified(null));
    }

    #[TestDox('UC-CPT-01-U05 — findByEmail : colonnes de vérification lues, casse indifférente (collation), ligne supprimée invisible')]
    public function testU05FindByEmail(): void
    {
        $id = Users::create(self::$pdo, 'ada@example.org', Users::hashPassword('correct horse battery'), 'Ada');

        $found = Users::findByEmail(self::$pdo, 'ada@example.org');
        self::assertNotNull($found);
        self::assertSame($id, (int) $found['id']);
        self::assertArrayHasKey('verification_code_hash', $found);
        self::assertArrayHasKey('email_verified_at', $found);
        self::assertNull(Users::findByEmail(self::$pdo, 'nobody@example.org'));
        // Collation utf8mb4_unicode_ci : la recherche (et l'index unique) ignorent la casse,
        // en plus de la normalisation en minuscules faite par les routes.
        self::assertSame($id, (int) Users::findByEmail(self::$pdo, 'ADA@Example.org')['id']);

        self::$pdo->exec('UPDATE users SET deleted_at = NOW() WHERE id = ' . $id);
        self::assertNull(Users::findByEmail(self::$pdo, 'ada@example.org'));
    }

    #[TestDox('UC-CPT-01-U06 — Mailer : override de test prioritaire, sinon mail() natif ; MemoryMailer extrait le code du lien')]
    public function testU06MailerSeamAndCodeExtraction(): void
    {
        self::assertInstanceOf(PhpMailMailer::class, MailerFactory::default());

        $memory = new MemoryMailer();
        MailerFactory::setOverride($memory);
        self::assertSame($memory, MailerFactory::default());

        MailerFactory::default()->send('ada@example.org', 'Sujet', "Code : 0420\nhttps://humanome.xyz/#/activer?email=ada%40example.org&code=0420");
        self::assertSame('ada@example.org', $memory->last()['to']);
        self::assertSame('0420', $memory->lastCode());

        $memory->send('ada@example.org', 'Sujet', 'aucun lien ici');
        self::assertSame('', $memory->lastCode());
        $memory->clear();
        self::assertNull($memory->last());
    }

    #[TestDox('UC-CPT-01-U07 — Audit::record sans détails : événement account_created daté, details NULL')]
    public function testU07AccountCreatedAudit(): void
    {
        $id = Users::create(self::$pdo, 'ada@example.org', Users::hashPassword('correct horse battery'), 'Ada');
        Audit::record(self::$pdo, $id, Audit::ACCOUNT_CREATED);

        $event = self::$pdo->query("SELECT user_id, details, created_at FROM audit_events WHERE type = 'account_created'")->fetch();
        self::assertSame($id, (int) $event['user_id']);
        self::assertNull($event['details']);
        self::assertNotEmpty($event['created_at']);
    }

    #[TestDox('UC-CPT-01-U08 — RateLimiter (fenêtre fixe) : blocage au-delà de la limite, fenêtre suivante libre, 30 s au premier refus puis doublé, plafonné à la fenêtre')]
    public function testU08RateLimitsOfTheUseCase(): void
    {
        // Les paramètres ci-dessous REPRODUISENT ceux de la route (auth.php) ;
        // ce test ne les lit pas : leur valeur réelle est vérifiée par F07
        // (inscription), F10 (activation) et F11 (renvoi par compte et par IP).
        $now = 1_800_000_000;
        foreach ([
            ['register:x', 10, 3600],
            ['activate:x', 20, 900],
            ['resend:acct:x', 3, 3600],
            ['resend:ip:x', 10, 3600],
        ] as [$bucket, $limit, $window]) {
            $limiter = new RateLimiter(self::$pdo, $limit, $window);
            for ($i = 1; $i <= $limit; $i++) {
                self::assertFalse($limiter->isBlocked($bucket, $now), "$bucket essai $i");
                $limiter->hit($bucket, $now);
            }
            self::assertTrue($limiter->isBlocked($bucket, $now), "$bucket bloqué après $limit");
            self::assertSame(30, $limiter->retryAfter($limit + 1), "$bucket : 30 s au premier refus");
            self::assertSame(60, $limiter->retryAfter($limit + 2), "$bucket : délai doublé");
            self::assertSame($window, $limiter->retryAfter($limit + 50), "$bucket : plafonné à la fenêtre");
            self::assertFalse($limiter->isBlocked($bucket, $now + $window), "$bucket : fenêtre suivante");
        }
    }

    #[TestDox('UC-CPT-01-U09 — CsrfMiddleware : register, activate et resend passent sans jeton même avec un cookie de session')]
    public function testU09VisitorRoutesAreCsrfExempt(): void
    {
        TestDb::overrideEnv();
        $_COOKIE[DbSessionHandler::SESSION_NAME] = 'cookie-quelconque';
        $handler = new class () implements RequestHandlerInterface {
            public int $calls = 0;

            public function handle(ServerRequestInterface $request): ResponseInterface
            {
                $this->calls++;

                return (new ResponseFactory())->createResponse(204);
            }
        };
        $middleware = new CsrfMiddleware();

        foreach (['/api/auth/register', '/api/auth/activate', '/api/auth/resend'] as $path) {
            $request = (new ServerRequestFactory())->createServerRequest('POST', $path);
            self::assertSame(204, $middleware->process($request, $handler)->getStatusCode(), $path);
        }
        self::assertSame(3, $handler->calls);
        self::assertNotSame(PHP_SESSION_ACTIVE, session_status(), 'aucune session ouverte pour un visiteur');
    }

    #[TestDox('UC-CPT-01-U16 — ClientIp::bucketIdentity : IPv6 regroupée par /64, IPv4 complète, IPv4 mappée = IPv4 ; le seau stocké est haché')]
    public function testU16BucketIdentityOfTheQuotas(): void
    {
        self::assertSame(
            ClientIp::bucketIdentity('2001:db8:1:2::1'),
            ClientIp::bucketIdentity('2001:db8:1:2::abcd'),
            'même /64 : même seau (rotation de l’identifiant d’interface inutile)',
        );
        self::assertNotSame(ClientIp::bucketIdentity('2001:db8:1:2::1'), ClientIp::bucketIdentity('2001:db8:1:3::1'));
        self::assertSame('v4:203.0.113.10', ClientIp::bucketIdentity('203.0.113.10'));
        self::assertSame('v4:203.0.113.10', ClientIp::bucketIdentity('::ffff:203.0.113.10'));
        self::assertNotSame(ClientIp::bucketIdentity('203.0.113.10'), ClientIp::bucketIdentity('203.0.113.11'), 'IPv4 : adresse complète');

        // Forme du seau d'inscription (auth.php) : jamais l'IP en clair… mais
        // un sha256 NON salé de « v4:a.b.c.d » (voir « Anomalies constatées », AN2).
        $bucket = 'register:' . hash('sha256', ClientIp::bucketIdentity('203.0.113.10'));
        self::assertStringNotContainsString('203.0.113.10', $bucket);
        self::assertSame('register:' . hash('sha256', 'v4:203.0.113.10'), $bucket);
    }
}
