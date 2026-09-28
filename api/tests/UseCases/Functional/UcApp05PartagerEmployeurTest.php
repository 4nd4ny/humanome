<?php

declare(strict_types=1);

namespace Humanome\Tests\UseCases\Functional;

use Humanome\Tests\CartographeTestCase;
use PHPUnit\Framework\Attributes\TestDox;
use Psr\Http\Message\ResponseInterface;

/**
 * UC-APP-05 — Partager une cartographie avec un employeur (côté apprenant) :
 * tests FONCTIONNELS (API).
 *
 * Fiche : docs/cas-utilisation/apprenant/UC-APP-05-partager-avec-employeur.md
 *
 * L'apprenant (session + CSRF) crée, liste et révoque ses liens à travers
 * l'API HTTP réelle. L'effet côté employeur n'est vérifié que par un appel
 * minimal à POST /api/share/{token} (navigateur neuf, autre IP) : le détail
 * de la consultation relève de UC-EMP-01.
 */
final class UcApp05PartagerEmployeurTest extends CartographeTestCase
{
    private const LINK_PASSWORD = 'sesame-employeur';

    /** @var array{id: int, csrf: string, sid: string} */
    private array $maya;

    private int $cartoId = 0;

    protected function setUp(): void
    {
        parent::setUp();
        $this->maya = $this->registerAs('maya@example.org', 'Maya');
        // Précondition UC-APP-04 : copie serveur (opt-in), rendue publique.
        $this->cartoId = $this->createCarto($this->maya, [
            'titre' => 'Journée du 5 janvier',
            'visibility' => 'publique',
            'document' => self::jourDocument(),
        ]);
    }

    /** @param array<string, mixed> $body */
    private function share(array $body = ['password' => self::LINK_PASSWORD], ?int $cartoId = null): ResponseInterface
    {
        return $this->as_($this->maya, 'POST', '/api/cartographies/' . ($cartoId ?? $this->cartoId) . '/share', $body);
    }

    /** @return list<array<string, mixed>> */
    private function links(): array
    {
        $response = $this->as_($this->maya, 'GET', '/api/cartographies/' . $this->cartoId . '/shares');
        self::assertSame(200, $response->getStatusCode());

        return self::json($response);
    }

    /** Effet côté employeur (UC-EMP-01) : navigateur neuf, autre IP. */
    private function employeurStatus(string $token): int
    {
        $sid = $this->cookieSid;
        $ip = $this->clientIp;
        $this->cookieSid = null;
        $this->clientIp = '198.51.100.7';
        $status = $this->request('POST', '/api/share/' . $token, ['password' => self::LINK_PASSWORD])->getStatusCode();
        $this->cookieSid = $sid;
        $this->clientIp = $ip;

        return $status;
    }

    private static function countLinks(): int
    {
        return (int) self::$pdo->query('SELECT COUNT(*) FROM share_links')->fetchColumn();
    }

    #[TestDox('UC-APP-05-F01 — nominal : lien + mot de passe → 201 {shareId, token, url}, haché en base, audité sans secret, listé sans jeton')]
    public function testF01NominalCreateAuditAndList(): void
    {
        $response = $this->share(['password' => self::LINK_PASSWORD, 'expiresInDays' => 30]);

        self::assertSame(201, $response->getStatusCode(), (string) $response->getBody());
        $body = self::json($response);
        self::assertSame(['shareId', 'token', 'url'], array_keys($body));
        self::assertMatchesRegularExpression('/^[0-9a-f]{32}$/', $body['token']);
        self::assertSame('/#/partage/' . $body['token'], $body['url']);

        $row = self::$pdo->query('SELECT token_hash, password_hash, DATEDIFF(expires_at, created_at) AS days FROM share_links')->fetch();
        self::assertSame(hash('sha256', $body['token']), $row['token_hash']);
        self::assertTrue(password_verify(self::LINK_PASSWORD, (string) $row['password_hash']));
        self::assertSame(30, (int) $row['days']);

        $audit = self::lastAudit('share_created');
        self::assertSame($this->maya['id'], $audit['userId']);
        self::assertEquals(['cartographieId' => $this->cartoId, 'shareId' => $body['shareId'], 'expiresInDays' => 30], $audit['details']);
        $raw = (string) self::$pdo->query("SELECT details FROM audit_events WHERE type = 'share_created'")->fetchColumn();
        self::assertStringNotContainsString($body['token'], $raw);
        self::assertStringNotContainsString(self::LINK_PASSWORD, $raw);

        $list = $this->as_($this->maya, 'GET', '/api/cartographies/' . $this->cartoId . '/shares');
        self::assertSame([['shareId', 'createdAt', 'expiresAt', 'revokedAt']], array_map('array_keys', self::json($list)));
        self::assertNull(self::json($list)[0]['revokedAt']);
        self::assertStringNotContainsString($body['token'], (string) $list->getBody(), 'le jeton n’est plus jamais réaffiché');
        self::assertSame(1, self::json($this->as_($this->maya, 'GET', '/api/cartographies'))[0]['shares']);

        self::assertSame(200, $this->employeurStatus($body['token']), 'le lien fonctionne (UC-EMP-01)');
    }

    #[TestDox('UC-APP-05-F02 — A1 : expiration non précisée (ou null) → 90 jours par défaut ; bornes 1 et 365 acceptées')]
    public function testF02DefaultAndBoundaryExpirations(): void
    {
        self::assertSame(201, $this->share(['password' => self::LINK_PASSWORD])->getStatusCode());
        self::assertSame(201, $this->share(['password' => self::LINK_PASSWORD, 'expiresInDays' => null])->getStatusCode());
        self::assertSame(201, $this->share(['password' => self::LINK_PASSWORD, 'expiresInDays' => 1])->getStatusCode());
        self::assertSame(201, $this->share(['password' => self::LINK_PASSWORD, 'expiresInDays' => 365])->getStatusCode());

        $days = self::$pdo->query('SELECT DATEDIFF(expires_at, created_at) FROM share_links ORDER BY id')->fetchAll(\PDO::FETCH_COLUMN);
        self::assertSame([90, 90, 1, 365], array_map('intval', $days));
    }

    #[TestDox('UC-APP-05-F03 — A2 : révocation → 204, datée et auditée ; le lien meurt pour l’employeur ; nouvelle révocation sans effet')]
    public function testF03RevokeLink(): void
    {
        $share = self::json($this->share());

        $revoked = $this->as_($this->maya, 'DELETE', '/api/shares/' . $share['shareId']);
        self::assertSame(204, $revoked->getStatusCode());
        $list = $this->links();
        self::assertNotNull($list[0]['revokedAt'], 'la ligne reste, datée (fait auditable)');
        self::assertSame(0, self::json($this->as_($this->maya, 'GET', '/api/cartographies'))[0]['shares']);
        self::assertEquals(
            ['cartographieId' => $this->cartoId, 'shareId' => $share['shareId']],
            self::lastAudit('share_revoked')['details'],
        );
        self::assertSame(404, $this->employeurStatus($share['token']));

        // Idempotent : 204, date de révocation d'origine conservée.
        self::assertSame(204, $this->as_($this->maya, 'DELETE', '/api/shares/' . $share['shareId'])->getStatusCode());
        self::assertSame($list[0]['revokedAt'], $this->links()[0]['revokedAt']);
        // Comportement actuel (fiche, « Limites ») : la re-révocation est de
        // nouveau journalisée.
        self::assertSame(2, (int) self::$pdo->query("SELECT COUNT(*) FROM audit_events WHERE type = 'share_revoked'")->fetchColumn());
    }

    #[TestDox('UC-APP-05-F04 — A3 : plusieurs liens par cartographie, révoqués indépendamment')]
    public function testF04SeveralIndependentLinks(): void
    {
        $recruteurA = self::json($this->share());
        $recruteurB = self::json($this->share(['password' => 'autre-mot-de-passe', 'expiresInDays' => 7]));

        self::assertSame(204, $this->as_($this->maya, 'DELETE', '/api/shares/' . $recruteurA['shareId'])->getStatusCode());

        self::assertSame([$recruteurA['shareId'], $recruteurB['shareId']], array_column($this->links(), 'shareId'));
        self::assertSame(404, $this->employeurStatus($recruteurA['token']));
        $this->cookieSid = null;
        $this->clientIp = '198.51.100.8';
        self::assertSame(
            200,
            $this->request('POST', '/api/share/' . $recruteurB['token'], ['password' => 'autre-mot-de-passe'])->getStatusCode(),
        );
    }

    #[TestDox('UC-APP-05-F05 — A4 : un lien expiré reste listé (non révoqué) mais ne compte plus et ne s’ouvre plus')]
    public function testF05ExpiredLinkStaysListedButDead(): void
    {
        $share = self::json($this->share(['password' => self::LINK_PASSWORD, 'expiresInDays' => 1]));
        self::$pdo->exec('UPDATE share_links SET expires_at = NOW() - INTERVAL 1 DAY');

        $list = $this->links();
        self::assertCount(1, $list);
        self::assertNull($list[0]['revokedAt']);
        self::assertLessThan(strtotime($list[0]['createdAt']), strtotime($list[0]['expiresAt']), 'date d’expiration passée');
        self::assertSame(0, self::json($this->as_($this->maya, 'GET', '/api/cartographies'))[0]['shares']);
        self::assertSame(404, $this->employeurStatus($share['token']));
    }

    #[TestDox('UC-APP-05-F06 — E1 : mot de passe absent, de moins de 8 caractères (comptés en Unicode) ou de plus de 1024 octets → 422')]
    public function testF06PasswordRules(): void
    {
        foreach ([
            [],
            ['password' => 12345678],
            ['password' => 'court77'],
            ['password' => 'ééééééé'], // 7 caractères, 14 octets
            ['password' => str_repeat('x', 1025)],
        ] as $i => $body) {
            $response = $this->share($body);
            self::assertSame(422, $response->getStatusCode(), 'cas #' . $i);
            self::assertArrayHasKey('password', self::json($response)['fields']);
        }
        self::assertSame('Mot de passe trop long', self::json($this->share(['password' => str_repeat('x', 1025)]))['fields']['password']);
        self::assertSame(0, self::countLinks());

        self::assertSame(201, $this->share(['password' => 'éééééééé'])->getStatusCode(), '8 caractères multi-octets suffisent');
    }

    #[TestDox('UC-APP-05-F07 — E2 : expiration hors 1..365 ou non entière → 422, aucun lien')]
    public function testF07ExpirationRules(): void
    {
        foreach ([0, 366, -5, '30', 1.5, true] as $days) {
            $response = $this->share(['password' => self::LINK_PASSWORD, 'expiresInDays' => $days]);
            self::assertSame(422, $response->getStatusCode(), var_export($days, true));
            self::assertSame("Durée d'expiration invalide (1 à 365 jours)", self::json($response)['fields']['expiresInDays']);
        }
        self::assertSame(0, self::countLinks());
    }

    #[TestDox('UC-APP-05-F08 — E3 : cartographie ou lien d’autrui (ou inconnu) → 404, rien n’est créé ni révoqué')]
    public function testF08ForeignResourcesAnswer404(): void
    {
        $share = self::json($this->share());
        $intrus = $this->registerAs('intrus@example.org', 'Intrus');

        foreach ([$this->cartoId, $this->cartoId + 1000] as $target) {
            $post = $this->as_($intrus, 'POST', '/api/cartographies/' . $target . '/share', ['password' => self::LINK_PASSWORD]);
            self::assertSame(404, $post->getStatusCode());
            self::assertSame('Cartographie introuvable', self::json($post)['error']);
            self::assertSame(404, $this->as_($intrus, 'GET', '/api/cartographies/' . $target . '/shares')->getStatusCode());
        }
        self::assertSame(1, self::countLinks());

        foreach ([$share['shareId'], $share['shareId'] + 1000] as $target) {
            $delete = $this->as_($intrus, 'DELETE', '/api/shares/' . $target);
            self::assertSame(404, $delete->getStatusCode());
            self::assertSame('Lien de partage introuvable', self::json($delete)['error']);
        }
        self::assertNull($this->links()[0]['revokedAt']);
        self::assertSame(200, $this->employeurStatus($share['token']), 'le lien de Maya fonctionne toujours');
    }

    #[TestDox('UC-APP-05-F09 — E4 : sans session → 401, sans jeton CSRF → 403, sans rôle apprenant → 403')]
    public function testF09AuthenticationCsrfAndRole(): void
    {
        $share = self::json($this->share());

        $this->cookieSid = null;
        foreach ([
            ['POST', '/api/cartographies/' . $this->cartoId . '/share', ['password' => self::LINK_PASSWORD]],
            ['GET', '/api/cartographies/' . $this->cartoId . '/shares', null],
            ['DELETE', '/api/shares/' . $share['shareId'], null],
        ] as [$method, $path, $body]) {
            self::assertSame(401, $this->request($method, $path, $body)->getStatusCode(), $method . ' ' . $path);
        }

        $this->cookieSid = $this->maya['sid'];
        foreach ([
            ['POST', '/api/cartographies/' . $this->cartoId . '/share', ['password' => self::LINK_PASSWORD]],
            ['DELETE', '/api/shares/' . $share['shareId'], null],
        ] as [$method, $path, $body]) {
            $response = $this->request($method, $path, $body);
            self::assertSame(403, $response->getStatusCode(), $method . ' ' . $path);
            self::assertSame('Jeton CSRF absent ou invalide', self::json($response)['error']);
        }

        self::setRoles($this->maya['id'], ['cartographe']);
        self::assertSame(403, $this->share()->getStatusCode(), 'rôle relu à chaque requête');

        self::assertSame(1, self::countLinks());
        self::assertNull(self::$pdo->query('SELECT revoked_at FROM share_links')->fetchColumn());
    }

    #[TestDox('UC-APP-05-F10 — anomalie figée : une cartographie « privée » se partage quand même (201) et s’ouvre chez l’employeur')]
    public function testF10PrivateCartographyCanBeShared(): void
    {
        // Comportement ACTUEL (fiche, « Anomalies constatées ») : la formation
        // apprenant présente « Publique (partageable) » comme l'état REQUIS pour
        // créer un lien, mais la route ne consulte pas la visibilité.
        $privee = $this->createCarto($this->maya, ['titre' => 'Privée', 'visibility' => 'privee']);

        $response = $this->share(['password' => self::LINK_PASSWORD], $privee);

        self::assertSame(201, $response->getStatusCode());
        self::assertSame(200, $this->employeurStatus(self::json($response)['token']));
    }
}
