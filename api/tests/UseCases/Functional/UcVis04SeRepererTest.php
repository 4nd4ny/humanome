<?php

declare(strict_types=1);

namespace Humanome\Tests\UseCases\Functional;

use Humanome\Auth\Users;
use Humanome\Tests\CartographeTestCase;
use PHPUnit\Framework\Attributes\TestDox;

/**
 * UC-VIS-04 — Se repérer (accueil, navigation, guides, aide, confidentialité) : tests FONCTIONNELS (API).
 *
 * Fiche : docs/cas-utilisation/visiteur/UC-VIS-04-se-reperer-guides-aide.md
 *
 * Au montage et à chaque changement de session, le shell de l'application
 * appelle GET /api/auth/me ; la navigation n'utilise que `user.roles` (et
 * l'identité minimale de l'avatar). Ces tests rejouent ce contrat par l'API
 * HTTP en processus : visiteur, compte multi-rôles, changement de rôle,
 * compte purgé.
 */
final class UcVis04SeRepererTest extends CartographeTestCase
{
    #[TestDox('UC-VIS-04-F01 — nominal visiteur : GET /api/auth/me sans session → 401 (le front en déduit roles = [], navigation « Découvrir » + « Compte »)')]
    public function testF01VisitorHasNoSession(): void
    {
        $this->cookieSid = null;

        $response = $this->request('GET', '/api/auth/me');

        self::assertSame(401, $response->getStatusCode());
        self::assertSame(['error' => 'Authentification requise'], self::json($response));
        self::assertNull($this->cookieSid, 'aucune session créée pour un visiteur');
    }

    #[TestDox('UC-VIS-04-F02 — A1 : compte connecté multi-rôles → roles triés + identité minimale de l’avatar')]
    public function testF02ConnectedAccountExposesRolesForNavigation(): void
    {
        $user = $this->registerAs('ada@example.org', 'Ada', ['apprenant', 'cartographe', 'etablissement']);

        $body = self::json($this->as_($user, 'GET', '/api/auth/me'));

        self::assertSame(['apprenant', 'cartographe', 'etablissement'], $body['user']['roles']);
        self::assertSame('Ada', $body['user']['displayName']);
        self::assertFalse($body['user']['hasAvatar']);
        self::assertSame(['id', 'email', 'displayName', 'roles', 'hasAvatar'], array_keys($body['user']));
        self::assertMatchesRegularExpression('/^[0-9a-f]{64}$/', $body['csrfToken']);
    }

    #[TestDox('UC-VIS-04-F03 — A1 : un rôle attribué par l’administration apparaît au prochain rafraîchissement, sans reconnexion')]
    public function testF03RoleChangeIsReflectedAtNextRefresh(): void
    {
        $user = $this->registerAs('noe@example.org', 'Noé', ['apprenant']);
        self::assertSame(['apprenant'], self::json($this->as_($user, 'GET', '/api/auth/me'))['user']['roles']);

        Users::assignRole(self::$pdo, $user['id'], 'promptologue');

        self::assertSame(['apprenant', 'promptologue'], self::json($this->as_($user, 'GET', '/api/auth/me'))['user']['roles']);
    }

    #[TestDox('UC-VIS-04-F04 — E3 : compte purgé pendant la session → sa session disparaît avec lui (cascade SQL), 401, navigation de visiteur')]
    public function testF04PurgedAccountFallsBackToVisitor(): void
    {
        $user = $this->registerAs('temp@example.org', 'Temp', ['apprenant', 'cartographe']);
        $sessionRows = self::$pdo->prepare('SELECT COUNT(*) FROM sessions WHERE id = ?');
        $sessionRows->execute([$user['sid']]);
        self::assertSame(1, (int) $sessionRows->fetchColumn());

        Users::purge(self::$pdo, $user['id']);

        // Le vrai mécanisme : la ligne de session est supprimée par la clé
        // étrangère ON DELETE CASCADE (migration 002), pas par la route.
        $sessionRows->execute([$user['sid']]);
        self::assertSame(0, (int) $sessionRows->fetchColumn(), 'session supprimée avec le compte');

        $response = $this->as_($user, 'GET', '/api/auth/me');

        self::assertSame(401, $response->getStatusCode());
        self::assertSame(['error' => 'Authentification requise'], self::json($response));
        self::assertSame(401, $this->as_($user, 'GET', '/api/auth/me')->getStatusCode(), 'toujours 401');
    }

    #[TestDox('UC-VIS-04-F15 — E3 : session RÉSIDUELLE d’un compte purgé (réécrite par une requête concurrente) → la route la détruit, 401')]
    public function testF15StaleSessionOfPurgedAccountIsDestroyed(): void
    {
        $user = $this->registerAs('fantome@example.org', 'Fantôme', ['apprenant']);
        Users::purge(self::$pdo, $user['id']);
        // Une requête concurrente réécrit sa session après la purge :
        // DbSessionHandler::write n'écrit jamais user_id (NULL), la cascade ne
        // la couvre donc pas ; les données portent encore l'identifiant purgé.
        self::$pdo->prepare('INSERT INTO sessions (id, user_id, data, last_activity) VALUES (?, NULL, ?, UNIX_TIMESTAMP())')
            ->execute([$user['sid'], 'user_id|i:' . $user['id'] . ';']);

        $response = $this->as_($user, 'GET', '/api/auth/me');

        self::assertSame(401, $response->getStatusCode());
        self::assertSame(['error' => 'Authentification requise'], self::json($response));
        $rows = self::$pdo->prepare('SELECT COUNT(*) FROM sessions WHERE id = ?');
        $rows->execute([$user['sid']]);
        self::assertSame(0, (int) $rows->fetchColumn(), 'session résiduelle détruite par la route (Session::destroy)');
    }
}
