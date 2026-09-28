<?php

declare(strict_types=1);

namespace Humanome\Tests\UseCases\Support;

use Humanome\Bootstrap;
use Humanome\DbSessionHandler;
use Humanome\Env;
use Humanome\Tests\TestDb;
use PDO;
use Psr\Http\Message\ResponseInterface;
use Slim\Psr7\Factory\ServerRequestFactory;

/**
 * Utilitaires partagés du lot « Administration et exploitation » (UC-ADM-01,
 * UC-ADM-04, UC-ADM-06, UC-SYS-02, UC-SYS-03) — fiches sous
 * docs/cas-utilisation/administration/ et docs/cas-utilisation/systeme/.
 *
 * - comptes créés directement en base (tests unitaires, sans couche HTTP) ;
 * - requêtes « outil de déploiement » : jeton X-Migrate-Token, AUCUN cookie
 *   de session, corps brut (le script deploy.mjs envoie le JSON tel quel) ;
 * - exécution des scripts CLI (scripts/*.php) dans un sous-processus PHP,
 *   pointés sur la base de test dédiée (jamais la base de développement).
 */
final class AdmSupport
{
    /** Racine du dépôt (api/tests/UseCases/Support -> <repo>). */
    public static function repoRoot(): string
    {
        return \dirname(__DIR__, 4);
    }

    /**
     * Crée un compte actif (e-mail vérifié) directement en base et lui pose ses rôles.
     *
     * @param list<string> $roles
     */
    public static function user(PDO $pdo, string $email, string $name = 'Compte', array $roles = []): int
    {
        $pdo->prepare('INSERT INTO users (email, password_hash, display_name, email_verified_at) VALUES (?, ?, ?, NOW())')
            ->execute([$email, password_hash('x-password', PASSWORD_DEFAULT), $name]);
        $userId = (int) $pdo->lastInsertId();
        $bind = $pdo->prepare('INSERT INTO user_roles (user_id, role_id) SELECT ?, id FROM roles WHERE name = ?');
        foreach ($roles as $role) {
            $bind->execute([$userId, $role]);
        }

        return $userId;
    }

    /** Dernier événement d'audit d'un type : [userId, details] ou null. */
    public static function lastAudit(PDO $pdo, string $type): ?array
    {
        $stmt = $pdo->prepare('SELECT user_id, details FROM audit_events WHERE type = ? ORDER BY id DESC LIMIT 1');
        $stmt->execute([$type]);
        $row = $stmt->fetch();
        if ($row === false) {
            return null;
        }

        return [
            'userId' => $row['user_id'] === null ? null : (int) $row['user_id'],
            'details' => $row['details'] === null ? null : json_decode((string) $row['details'], true),
            'raw' => (string) $row['details'],
        ];
    }

    public static function countAudit(PDO $pdo, string $type): int
    {
        $stmt = $pdo->prepare('SELECT COUNT(*) FROM audit_events WHERE type = ?');
        $stmt->execute([$type]);

        return (int) $stmt->fetchColumn();
    }

    /**
     * Une requête de l'outil de déploiement (deploy.mjs) : pas de cookie,
     * pas de jeton CSRF, en-tête X-Migrate-Token facultatif, corps brut.
     *
     * @param array<string, string> $headers
     */
    public static function toolRequest(
        string $method,
        string $path,
        ?string $token,
        ?string $rawBody = null,
        array $headers = [],
    ): ResponseInterface {
        // Client neuf : aucune session héritée du « navigateur » simulé par
        // AuthTestBase (les superglobales survivent entre requêtes en processus).
        if (session_status() === PHP_SESSION_ACTIVE) {
            session_write_close();
        }
        unset($_COOKIE[DbSessionHandler::SESSION_NAME]);
        session_id('');
        $request = (new ServerRequestFactory())->createServerRequest($method, '/api' . $path);
        if ($token !== null) {
            $request = $request->withHeader('X-Migrate-Token', $token);
        }
        if ($rawBody !== null) {
            $request->getBody()->write($rawBody);
            $request->getBody()->rewind();
            $request = $request->withHeader('Content-Type', 'application/json');
        }
        foreach ($headers as $name => $value) {
            $request = $request->withHeader($name, $value);
        }

        return Bootstrap::createApp()->handle($request);
    }

    /** @return array<string, mixed> */
    public static function body(ResponseInterface $response): array
    {
        return json_decode((string) $response->getBody(), true, 512, JSON_THROW_ON_ERROR);
    }

    /**
     * Environnement d'un sous-processus CLI pointé sur la base de test (root),
     * sans hériter de DB_NAME=humanome du conteneur de développement.
     *
     * @param array<string, string> $overrides
     * @return array<string, string>
     */
    public static function cliEnv(array $overrides = []): array
    {
        $env = [];
        foreach (['PATH', 'HOME'] as $key) {
            $value = getenv($key);
            if (\is_string($value)) {
                $env[$key] = $value;
            }
        }

        return array_merge($env, [
            'DB_HOST' => Env::get('DB_HOST', 'mysql'),
            'DB_PORT' => Env::get('DB_PORT', '3306'),
            'DB_NAME' => TestDb::name(),
            'DB_USER' => 'root',
            'DB_PASSWORD' => Env::get('DB_ROOT_PASSWORD', 'root_dev'),
            'APP_ENV' => 'dev',
        ], $overrides);
    }

    /**
     * Exécute `php <script> [args…]` (chemin relatif à la racine du dépôt).
     *
     * @param list<string> $args
     * @param array<string, string> $env environnement COMPLET du sous-processus
     * @return array{exit: int, stdout: string, stderr: string}
     */
    public static function runPhp(string $script, array $args, array $env, ?string $cwd = null): array
    {
        $command = array_merge([PHP_BINARY, $script], $args);
        $process = proc_open(
            $command,
            [1 => ['pipe', 'w'], 2 => ['pipe', 'w']],
            $pipes,
            $cwd ?? self::repoRoot(),
            $env,
        );
        if (!\is_resource($process)) {
            throw new \RuntimeException('proc_open a échoué pour ' . $script);
        }
        $stdout = (string) stream_get_contents($pipes[1]);
        $stderr = (string) stream_get_contents($pipes[2]);
        fclose($pipes[1]);
        fclose($pipes[2]);

        return ['exit' => proc_close($process), 'stdout' => $stdout, 'stderr' => $stderr];
    }
}
