<?php

declare(strict_types=1);

namespace Humanome\Tests\UseCases\Functional;

use Humanome\Auth\Users;
use Humanome\Geo\CountryResolver;
use Humanome\Tests\CartographeTestCase;
use Humanome\Tests\UseCases\Support\CptSupport;
use PHPUnit\Framework\Attributes\TestDox;

/**
 * UC-CPT-02 — Se connecter et se déconnecter : tests FONCTIONNELS (API).
 *
 * Fiche : docs/cas-utilisation/compte/UC-CPT-02-se-connecter-deconnecter.md
 *
 * Précondition commune : un compte ACTIVÉ existe (inscription + activation
 * par les routes réelles, UC-CPT-01), puis le navigateur est « fermé »
 * (cookie oublié). Chaque test rejoue ensuite un scénario de la fiche par
 * POST /api/auth/login, GET /api/auth/me et POST /api/auth/logout.
 */
final class UcCpt02SeConnecterDeconnecterTest extends CartographeTestCase
{
    private int $userId = 0;

    protected function setUp(): void
    {
        parent::setUp();
        CountryResolver::setOverride(static fn (string $ip): ?string => 'FR');
        $account = $this->registerAs('ada@example.org', 'Ada', ['apprenant', 'cartographe']);
        $this->userId = $account['id'];
        $this->cookieSid = null; // navigateur refermé
        self::$pdo->exec('DELETE FROM audit_events');
    }

    protected function tearDown(): void
    {
        CountryResolver::setOverride(null);
        parent::tearDown();
    }

    private function sessionRow(?string $sid): array|false
    {
        $stmt = self::$pdo->prepare('SELECT user_id, ip_hash FROM sessions WHERE id = ?');
        $stmt->execute([(string) $sid]);

        return $stmt->fetch();
    }

    #[TestDox('UC-CPT-02-F01 — nominal : connexion (ID de session neuf, jeton CSRF, journal) puis déconnexion (session détruite)')]
    public function testF01NominalLoginThenLogout(): void
    {
        // Un cookie planté par un tiers (fixation) ne survit pas à la connexion.
        $this->cookieSid = 'fixationfixationfixation01';

        $login = $this->login(' ADA@example.org ', self::PASSWORD);

        self::assertSame(200, $login->getStatusCode(), (string) $login->getBody());
        $body = self::json($login);
        self::assertSame([
            'id' => $this->userId,
            'email' => 'ada@example.org',
            'displayName' => 'Ada',
            'roles' => ['apprenant', 'cartographe'],
            'hasAvatar' => false,
        ], $body['user']);
        self::assertMatchesRegularExpression('/^[0-9a-f]{64}$/', $body['csrfToken']);
        self::assertNotNull($this->cookieSid);
        self::assertNotSame('fixationfixationfixation01', $this->cookieSid);
        $row = $this->sessionRow($this->cookieSid);
        self::assertSame($this->userId, (int) $row['user_id']);
        self::assertSame(hash('sha256', $this->clientIp), $row['ip_hash'], 'IP hachée (sha256 non salé, AN5), jamais en clair');
        // Colonne JSON relue : MySQL ne conserve pas l'ordre des clés (assertEquals).
        self::assertEquals(
            ['userId' => $this->userId, 'details' => ['pays' => 'FR', 'reseau' => '203.0.113.0/24']],
            self::lastAudit('login'),
        );

        // Le jeton renvoyé par /me est celui de la session ; il autorise les mutations.
        self::assertSame($body['csrfToken'], self::json($this->request('GET', '/api/auth/me'))['csrfToken']);
        $sid = $this->cookieSid;
        $logout = $this->request('POST', '/api/auth/logout', null, ['X-CSRF-Token' => $body['csrfToken']]);
        self::assertSame(204, $logout->getStatusCode());
        self::assertFalse($this->sessionRow($sid), 'ligne de session supprimée');

        // Le cookie périmé que garde le navigateur ne vaut plus rien.
        $this->cookieSid = $sid;
        self::assertSame(401, $this->request('GET', '/api/auth/me')->getStatusCode());
    }

    #[TestDox('UC-CPT-02-F02 — A1 : session déjà ouverte → /me rend profil et jeton ; deux navigateurs = deux sessions indépendantes')]
    public function testF02ExistingSessionsAreIndependent(): void
    {
        $first = self::json($this->login('ada@example.org', self::PASSWORD));
        $sidA = $this->cookieSid;
        $this->cookieSid = null;
        $second = self::json($this->login('ada@example.org', self::PASSWORD));
        $sidB = $this->cookieSid;
        self::assertNotSame($sidA, $sidB);
        self::assertNotSame($first['csrfToken'], $second['csrfToken']);

        $this->cookieSid = $sidA;
        $me = $this->request('GET', '/api/auth/me');
        self::assertSame(200, $me->getStatusCode());
        self::assertSame($first['csrfToken'], self::json($me)['csrfToken']);
        self::assertSame(['apprenant', 'cartographe'], self::json($me)['user']['roles']);

        // Se déconnecter du navigateur A ne ferme pas le navigateur B.
        self::assertSame(204, $this->request('POST', '/api/auth/logout', null, ['X-CSRF-Token' => $first['csrfToken']])->getStatusCode());
        $this->cookieSid = $sidB;
        self::assertSame(200, $this->request('GET', '/api/auth/me')->getStatusCode());
    }

    #[TestDox('UC-CPT-02-F03 — A4 : cookie d’un compte purgé entre-temps → 401, comme un visiteur')]
    public function testF03SessionOfAPurgedAccount(): void
    {
        $this->login('ada@example.org', self::PASSWORD);
        $sid = $this->cookieSid;
        self::assertSame($this->userId, self::lastAudit('login')['userId']);
        Users::purge(self::$pdo, $this->userId);

        self::assertFalse($this->sessionRow($sid), 'session supprimée en cascade par la purge');
        self::assertNull(self::lastAudit('login')['userId'], 'journal de connexion anonymisé (SET NULL)');
        $me = $this->request('GET', '/api/auth/me');

        self::assertSame(401, $me->getStatusCode());
        self::assertSame(['error' => 'Authentification requise'], self::json($me));
    }

    #[TestDox('UC-CPT-02-F04 — E1 : email ou mot de passe vide → 422, sans consommer le quota')]
    public function testF04EmptyFields(): void
    {
        foreach ([['', self::PASSWORD], ['ada@example.org', ''], ['   ', 'x']] as [$email, $password]) {
            $response = $this->login($email, $password);
            self::assertSame(422, $response->getStatusCode());
            self::assertSame(['error' => 'Email et mot de passe requis'], self::json($response));
        }
        self::assertSame(0, (int) self::$pdo->query("SELECT COUNT(*) FROM rate_limits WHERE bucket LIKE 'login:%'")->fetchColumn());
        self::assertNull($this->cookieSid);
    }

    #[TestDox('UC-CPT-02-F05 — E2 : mauvais mot de passe ou compte inconnu → même 401, échec journalisé, aucune session')]
    public function testF05InvalidCredentials(): void
    {
        $wrong = $this->login('ada@example.org', 'pas le bon mot de passe');
        $unknown = $this->login('nobody@example.org', self::PASSWORD);

        self::assertSame(401, $wrong->getStatusCode());
        self::assertSame(401, $unknown->getStatusCode());
        self::assertSame((string) $wrong->getBody(), (string) $unknown->getBody(), 'aucun oracle d’existence');
        self::assertSame(['error' => 'Identifiants invalides'], self::json($wrong));
        self::assertNull($this->cookieSid);

        $failures = self::$pdo->query("SELECT user_id, details FROM audit_events WHERE type = 'login_failed' ORDER BY id")->fetchAll();
        self::assertCount(2, $failures);
        self::assertSame($this->userId, (int) $failures[0]['user_id'], 'compte visé identifié (attaque ciblée)');
        self::assertNull($failures[1]['user_id']);
        self::assertStringNotContainsString($this->clientIp, (string) $failures[1]['details']);
    }

    #[TestDox('UC-CPT-02-F06 — E3 : compte non activé → 403 email_not_verified, sans session ni consommation du quota')]
    public function testF06AccountNotActivated(): void
    {
        $this->registerPending('pending@example.org');
        for ($i = 1; $i <= 6; $i++) {
            $response = $this->login('pending@example.org', self::PASSWORD);
            self::assertSame(403, $response->getStatusCode(), "essai $i : jamais 429 avec le bon mot de passe");
        }
        self::assertSame('email_not_verified', self::json($response)['code']);
        self::assertSame('pending@example.org', self::json($response)['email']);
        self::assertNull($this->cookieSid);

        // Mauvais mot de passe sur un compte non activé : 401 classique (pas d'indice).
        self::assertSame(401, $this->login('pending@example.org', 'mauvais mot de passe')->getStatusCode());
    }

    #[TestDox('UC-CPT-02-F07 — E4 : 6e essai (IP + email) → 429 même avec le bon mot de passe, délai croissant ; autre IP ou autre email libres')]
    public function testF07LoginRateLimit(): void
    {
        CptSupport::awayFromWindowBoundary(900); // fenêtre fixe de 15 min
        $this->clientIp = '2001:db8:5:6::1';
        for ($i = 1; $i <= 5; $i++) {
            self::assertSame(401, $this->login('ada@example.org', 'mauvais-' . $i)->getStatusCode());
        }

        $blocked = $this->login('ada@example.org', self::PASSWORD);
        self::assertSame(429, $blocked->getStatusCode());
        self::assertSame(['error' => 'Trop de tentatives de connexion, réessayez plus tard'], self::json($blocked));
        self::assertSame('30', $blocked->getHeaderLine('Retry-After'));
        self::assertNull($this->cookieSid);

        $this->clientIp = '2001:db8:5:6::ffff'; // même /64 : même seau, délai doublé
        self::assertSame('60', $this->login('ada@example.org', self::PASSWORD)->getHeaderLine('Retry-After'));

        $this->clientIp = '2001:db8:5:7::1'; // autre /64
        self::assertSame(200, $this->login('ada@example.org', self::PASSWORD)->getStatusCode());
        $this->cookieSid = null;
        $this->clientIp = '2001:db8:5:6::1';
        $this->registerAs('bob@example.org', 'Bob');
        $this->cookieSid = null;
        self::assertSame(200, $this->login('bob@example.org', self::PASSWORD)->getStatusCode(), 'le seau est IP + email');
    }

    #[TestDox('UC-CPT-02-F08 — E5 : déconnexion sans session → 401 ; sans jeton CSRF valide → 403 et la session reste ouverte')]
    public function testF08LogoutGuards(): void
    {
        self::assertSame(401, $this->request('POST', '/api/auth/logout')->getStatusCode());

        $token = self::json($this->login('ada@example.org', self::PASSWORD))['csrfToken'];
        $sid = $this->cookieSid;

        foreach ([[], ['X-CSRF-Token' => 'forge'], ['X-CSRF-Token' => strrev($token)]] as $headers) {
            $refused = $this->request('POST', '/api/auth/logout', null, $headers);
            self::assertSame(403, $refused->getStatusCode());
            self::assertSame(['error' => 'Jeton CSRF absent ou invalide'], self::json($refused));
        }
        self::assertNotFalse($this->sessionRow($sid));
        self::assertSame(200, $this->request('GET', '/api/auth/me')->getStatusCode(), 'toujours connecté');
    }

    #[TestDox('UC-CPT-02-F18 — RG6 : une connexion réussie remet à zéro le quota du couple IP + email')]
    public function testF18SuccessfulLoginResetsTheQuota(): void
    {
        CptSupport::awayFromWindowBoundary(900);
        for ($i = 1; $i <= 4; $i++) {
            self::assertSame(401, $this->login('ada@example.org', 'mauvais-' . $i)->getStatusCode());
        }
        self::assertSame(200, $this->login('ada@example.org', self::PASSWORD)->getStatusCode());
        self::assertSame(0, (int) self::$pdo->query("SELECT COUNT(*) FROM rate_limits WHERE bucket LIKE 'login:%'")->fetchColumn(), 'seau effacé');

        // Sans remise à zéro, le 2e échec suivant serait déjà un 429 (4 + 2 > 5).
        $this->cookieSid = null;
        for ($i = 1; $i <= 5; $i++) {
            self::assertSame(401, $this->login('ada@example.org', 'encore-faux-' . $i)->getStatusCode(), "échec $i après le succès");
        }
        self::assertSame(429, $this->login('ada@example.org', self::PASSWORD)->getStatusCode(), 'nouveau quota plein');
    }

    #[TestDox('UC-CPT-02-F19 — ANOMALIE AN1 : déconnexion avec le cookie d’une session disparue (expirée, purgée) → 403 CSRF et non 401 ; /me → 401 ; ligne recréée vide (AN2)')]
    public function testF19LogoutWithAStaleSessionCookie(): void
    {
        $token = self::json($this->login('ada@example.org', self::PASSWORD))['csrfToken'];
        $sid = $this->cookieSid;
        // Le ramasse-miettes (ou une purge depuis un autre navigateur) a supprimé la ligne.
        self::$pdo->prepare('DELETE FROM sessions WHERE id = ?')->execute([$sid]);

        // Comportement ACTUEL figé (voir « Anomalies constatées ») : le cookie suffit
        // au middleware CSRF pour croire à une session ; la session neuve n'a pas de
        // jeton → 403 avant la route, même avec l'ancien jeton.
        $logout = $this->request('POST', '/api/auth/logout', null, ['X-CSRF-Token' => $token]);
        self::assertSame(403, $logout->getStatusCode());
        self::assertSame(['error' => 'Jeton CSRF absent ou invalide'], self::json($logout));
        $row = $this->sessionRow($sid);
        self::assertNotFalse($row, 'AN2 : la ligne supprimée est recréée sous le même identifiant…');
        self::assertNull($row['user_id'], '… vide (aucun compte lié)');

        $this->cookieSid = $sid;
        self::assertSame(401, $this->request('GET', '/api/auth/me')->getStatusCode(), 'GET /me : 401 comme un visiteur');
    }

    #[TestDox('UC-CPT-02-F20 — E6 : API sans base configurée → connexion 503 « Service indisponible » ; /me et déconnexion 401')]
    public function testF20DatabaseNotConfigured(): void
    {
        // Un navigateur déjà connecté (cookie + jeton) avant la panne de configuration.
        $token = self::json($this->login('ada@example.org', self::PASSWORD))['csrfToken'];
        $sid = $this->cookieSid;

        CptSupport::withoutDatabase(function () use ($token, $sid): void {
            $this->cookieSid = null;
            $login = $this->login('ada@example.org', self::PASSWORD);
            self::assertSame(503, $login->getStatusCode());
            self::assertSame(['error' => 'Service indisponible'], self::json($login));
            self::assertNull($this->cookieSid);

            // Même avec le cookie d'une session valide : 401, pas 503.
            $this->cookieSid = $sid;
            $me = $this->request('GET', '/api/auth/me');
            self::assertSame(401, $me->getStatusCode());
            self::assertSame(['error' => 'Authentification requise'], self::json($me));
            $this->cookieSid = $sid;
            self::assertSame(401, $this->request('POST', '/api/auth/logout', null, ['X-CSRF-Token' => $token])->getStatusCode());
        });
        self::assertNotFalse($this->sessionRow($sid), 'la session n’a pas été touchée');
    }
}
