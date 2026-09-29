<?php

declare(strict_types=1);

namespace Humanome\Tests\UseCases\Support;

use Humanome\Admin\GoldenRepository;
use Humanome\Auth\Session;
use Humanome\Bootstrap;
use Humanome\DbSessionHandler;
use Humanome\MigrationRunner;
use Humanome\Packages\PromptPackageRepository;
use Humanome\Tests\TestDb;
use PDO;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\RequestHandlerInterface;
use Slim\App;
use Slim\Psr7\Factory\ServerRequestFactory;

/**
 * Outillage partagé du lot « Promptologue : cycle de vie des paquets de
 * prompts » (UC-PRO-01 à UC-PRO-04, UC-ADM-03).
 *
 * Fiches : docs/cas-utilisation/promptologue/ et
 * docs/cas-utilisation/administration/UC-ADM-03-valider-paquet-defaut-reglages.md
 *
 * - base fraîche migrée, comptes + rôles, documents prompt-package de
 *   référence (fixture versionnée schemas/fixtures/prompt-package-exemple.json
 *   et ses variantes) pour les tests UNITAIRES ;
 * - une application Slim « SAPI web » pour les tests FONCTIONNELS : la garde
 *   des routes promptologue (Humanome\Referentiel\RoleGuard) ne démarre la
 *   session qu'hors CLI ; en PHPUnit (CLI) elle lirait sinon le $_SESSION
 *   resté en mémoire de la requête précédente. webApp() reproduit ce que fait
 *   un vrai processus PHP par requête : $_SESSION vierge, puis session jointe
 *   dès que le navigateur envoie son cookie.
 */
final class ProSupport
{
    public const PKG = 'aurora-demo';
    public const RESERVED = 'twin6-ouverte';
    public const GOLDEN = 'golden-reference';

    /** Base de test (DB_TEST_NAME) recréée et migrée. */
    public static function freshPdo(): PDO
    {
        $pdo = TestDb::fresh();
        (new MigrationRunner($pdo, MigrationRunner::defaultMigrationsDir()))->run();

        return $pdo;
    }

    /** Vide le périmètre du lot (comptes en cascade, paquets, réglages, audit). */
    public static function reset(PDO $pdo): void
    {
        $pdo->exec('DELETE FROM users');
        $pdo->exec('DELETE FROM prompt_packages');
        $pdo->exec('DELETE FROM settings');
        $pdo->exec('DELETE FROM audit_events');
    }

    /**
     * Compte avec ses rôles, créé directement en base ; renvoie son id.
     *
     * @param list<string> $roles
     */
    public static function user(PDO $pdo, string $name = 'Pom', array $roles = ['promptologue']): int
    {
        $pdo->prepare('INSERT INTO users (email, password_hash, display_name) VALUES (?, ?, ?)')
            ->execute([uniqid('pro', true) . '@example.org', 'x', $name]);
        $userId = (int) $pdo->lastInsertId();
        $bind = $pdo->prepare('INSERT INTO user_roles (user_id, role_id) SELECT ?, id FROM roles WHERE name = ?');
        foreach ($roles as $role) {
            $bind->execute([$userId, $role]);
        }

        return $userId;
    }

    /** @return array<string, mixed> la fixture versionnée (aurora-demo 1.0.0), avec surcharges */
    public static function packageDoc(array $overrides = []): array
    {
        $path = \dirname(__DIR__, 4) . '/schemas/fixtures/prompt-package-exemple.json';
        $doc = json_decode((string) file_get_contents($path), true, 512, JSON_THROW_ON_ERROR);

        return array_merge($doc, $overrides);
    }

    /**
     * Une évolution réaliste de la fixture (2.0.0) : un prompt modifié (texte
     * + variable ajoutée), le prompt kairos retiré, un prompt merge ajouté,
     * orchestration et description changées.
     *
     * @return array<string, mixed>
     */
    public static function packageDocV2(): array
    {
        $doc = self::packageDoc([
            'version' => '2.0.0',
            'description' => 'Deuxième itération : extraction affinée, prompt merge.',
        ]);
        $doc['prompts'][0]['texte'] .= "\n- Signale la position du passage dans la feuille.";
        $doc['prompts'][0]['variables'][] = [
            'nom' => 'consignes_additionnelles',
            'description' => 'Consignes du cartographe injectées en fin de cadre.',
        ];
        $doc['prompts'] = [$doc['prompts'][0], [
            'role' => 'merge',
            'nom' => 'Fusion chronologique multi-jours',
            'texte' => "# Cadre\nFusionne {{jours_json}}.",
            'variables' => [['nom' => 'jours_json', 'description' => 'Cartographies journalières.']],
        ]];
        $doc['code']['orchestration'] .= "\n// v2 : passe de fusion.\n";
        $doc['changelog'][] = ['version' => '2.0.0', 'date' => '2026-02-01', 'description' => 'Extraction affinée, prompt merge.'];

        return $doc;
    }

    /** @return array<string, mixed> un paquet RÉSERVÉ au pipeline source-unique (D1/AD-D1) */
    public static function reservedDoc(string $id = self::RESERVED): array
    {
        $doc = self::packageDoc(['id' => $id, 'description' => 'Cartographie ouverte Twin6 (réservée).']);
        $doc['metadata']['reserved'] = true;

        return $doc;
    }

    /** Publie un document par le chemin d'import (précondition « déjà publié »). */
    public static function publish(PDO $pdo, ?array $doc = null): void
    {
        (new PromptPackageRepository($pdo))->importPublishedDocument($doc ?? self::packageDoc());
    }

    /** Importe un Golden Prompt PRIVÉ (UC-ADM-02) : invisible de toute lecture publique. */
    public static function importGolden(PDO $pdo, int $adminId, string $version = '1.0.0'): void
    {
        (new GoldenRepository($pdo))->import($adminId, self::packageDoc([
            'id' => self::GOLDEN,
            'version' => $version,
            'description' => 'Golden Prompt de référence (privé).',
        ]));
    }

    /**
     * Application Slim « SAPI web » : chaque requête démarre comme dans un
     * processus PHP neuf ($_SESSION vierge), la session est jointe si le
     * navigateur envoie son cookie (ce que RoleGuard fait lui-même hors CLI).
     */
    public static function webApp(): App
    {
        $app = Bootstrap::createApp();
        $app->add(static function (ServerRequestInterface $request, RequestHandlerInterface $handler): ResponseInterface {
            if (session_status() !== PHP_SESSION_ACTIVE) {
                $_SESSION = [];
                if (Session::exists()) {
                    Session::start();
                }
            }

            return $handler->handle($request);
        });

        return $app;
    }

    /**
     * Requête à corps BRUT (JSON invalide, scalaire…) depuis un navigateur
     * porteur de session : cookie + jeton CSRF, comme AuthTestBase::request.
     */
    public static function rawRequest(string $sid, string $csrf, string $ip, string $method, string $path, string $raw): ResponseInterface
    {
        if (session_status() === PHP_SESSION_ACTIVE) {
            session_write_close();
        }
        $_COOKIE[DbSessionHandler::SESSION_NAME] = $sid;
        session_id($sid);
        $_SERVER['REMOTE_ADDR'] = $ip;

        $request = (new ServerRequestFactory())
            ->createServerRequest($method, $path, ['REMOTE_ADDR' => $ip])
            ->withHeader('Content-Type', 'application/json')
            ->withHeader('X-CSRF-Token', $csrf);
        $request->getBody()->write($raw);

        $response = self::webApp()->handle($request);
        if (session_status() === PHP_SESSION_ACTIVE) {
            session_write_close();
        }

        return $response;
    }
}
