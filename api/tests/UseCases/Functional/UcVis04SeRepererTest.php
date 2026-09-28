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

    #[TestDox('UC-VIS-04-F04 — E1 : compte purgé pendant la session → 401, la navigation redevient celle d’un visiteur')]
    public function testF04PurgedAccountFallsBackToVisitor(): void
    {
        $user = $this->registerAs('temp@example.org', 'Temp', ['apprenant', 'cartographe']);
        Users::purge(self::$pdo, $user['id']);

        $response = $this->as_($user, 'GET', '/api/auth/me');

        self::assertSame(401, $response->getStatusCode());
        self::assertSame(401, $this->as_($user, 'GET', '/api/auth/me')->getStatusCode(), 'session détruite');
    }
}
