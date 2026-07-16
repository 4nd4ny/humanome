<?php

declare(strict_types=1);

namespace Humanome\Tests;

use Humanome\Bootstrap;
use Humanome\DbSessionHandler;
use Humanome\Mail\MailerFactory;
use Humanome\Mail\MemoryMailer;
use Humanome\MigrationRunner;
use PDO;
use PHPUnit\Framework\TestCase;
use Psr\Http\Message\ResponseInterface;
use Slim\App;
use Slim\Psr7\Factory\ServerRequestFactory;

/**
 * Base class for auth/authz tests. Simulates a browser talking to the app
 * in-process: $cookieSid plays the session cookie, and the native PHP
 * session is opened/closed around each request exactly like a web SAPI
 * would (session persisted at end of request, cookie kept by the client).
 */
abstract class AuthTestBase extends TestCase
{
    protected const PASSWORD = 'correct horse battery staple';

    protected static PDO $pdo;

    /** Session cookie the simulated browser would send, null = no cookie. */
    protected ?string $cookieSid = null;

    protected string $clientIp = '203.0.113.10';

    /** Mailer de test (capture les codes de vérification, D5). */
    protected MemoryMailer $mailer;

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
        $this->cookieSid = null;
        self::$pdo->exec('DELETE FROM rate_limits');
        // Mailer de test injecté (D5) : les envois sont capturés, pas expédiés.
        $this->mailer = new MemoryMailer();
        MailerFactory::setOverride($this->mailer);
    }

    protected function tearDown(): void
    {
        MailerFactory::setOverride(null);
        if (session_status() === PHP_SESSION_ACTIVE) {
            session_abort();
        }
        session_id('');
        unset($_COOKIE[DbSessionHandler::SESSION_NAME], $_SERVER['REMOTE_ADDR']);
    }

    /**
     * @param array<string, mixed>|null $body JSON body
     * @param array<string, string> $headers
     */
    protected function request(
        string $method,
        string $path,
        ?array $body = null,
        array $headers = [],
        ?App $app = null,
    ): ResponseInterface {
        // Previous request fully over before the next one starts.
        if (session_status() === PHP_SESSION_ACTIVE) {
            session_write_close();
        }
        if ($this->cookieSid !== null) {
            $_COOKIE[DbSessionHandler::SESSION_NAME] = $this->cookieSid;
            session_id($this->cookieSid);
        } else {
            unset($_COOKIE[DbSessionHandler::SESSION_NAME]);
            session_id('');
        }
        $_SERVER['REMOTE_ADDR'] = $this->clientIp;

        $request = (new ServerRequestFactory())
            ->createServerRequest($method, $path, ['REMOTE_ADDR' => $this->clientIp]);
        if ($body !== null) {
            $request->getBody()->write(json_encode($body, JSON_THROW_ON_ERROR));
            $request = $request->withHeader('Content-Type', 'application/json');
        }
        foreach ($headers as $name => $value) {
            $request = $request->withHeader($name, $value);
        }

        $response = ($app ?? Bootstrap::createApp())->handle($request);

        // End of request: PHP persists the session; the browser keeps the
        // cookie (even a stale one after logout — that is realistic).
        if (session_status() === PHP_SESSION_ACTIVE) {
            $this->cookieSid = session_id();
            session_write_close();
        }

        return $response;
    }

    /** @return array<string, mixed> */
    protected static function json(ResponseInterface $response): array
    {
        return json_decode((string) $response->getBody(), true, 512, JSON_THROW_ON_ERROR);
    }

    /**
     * Inscription BRUTE (D5) : appelle uniquement /auth/register (compte NON
     * activé, pas de session). Renvoie la réponse « pending » (201) ou l'erreur.
     * La double saisie email est satisfaite par défaut (emailConfirm = email).
     */
    protected function registerPending(
        string $email = 'ada@example.org',
        string $password = self::PASSWORD,
        string $displayName = 'Ada',
        ?string $emailConfirm = null,
    ): ResponseInterface {
        $this->cookieSid = null;

        return $this->request('POST', '/api/auth/register', [
            'email' => $email,
            'emailConfirm' => $emailConfirm ?? $email,
            'password' => $password,
            'displayName' => $displayName,
        ]);
    }

    protected function activate(string $email, string $code): ResponseInterface
    {
        return $this->request('POST', '/api/auth/activate', ['email' => $email, 'code' => $code]);
    }

    /** Le dernier code à 4 chiffres capturé par le Mailer de test. */
    protected function lastCode(): string
    {
        return $this->mailer->lastCode();
    }

    /**
     * Inscription + activation (D5) : rend un compte UTILISABLE (session
     * ouverte), comme l'ancien /auth/register. Renvoie la réponse d'activation
     * ({user, csrfToken}, session posée) ; si l'inscription échoue (validation,
     * doublon…), renvoie la réponse d'inscription telle quelle.
     */
    protected function register(
        string $email = 'ada@example.org',
        string $password = self::PASSWORD,
        string $displayName = 'Ada',
    ): ResponseInterface {
        $registered = $this->registerPending($email, $password, $displayName);
        if ($registered->getStatusCode() !== 201) {
            return $registered;
        }

        return $this->activate($email, $this->lastCode());
    }

    protected function login(string $email, string $password): ResponseInterface
    {
        return $this->request('POST', '/api/auth/login', [
            'email' => $email,
            'password' => $password,
        ]);
    }
}
