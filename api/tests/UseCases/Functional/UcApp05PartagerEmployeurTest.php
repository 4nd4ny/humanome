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
 * RETIRÉ le 2026-10-14 (journal de la cartographie D-43, question 17) : on
 * ne crée plus de lien vers une cartographie du site (jour, merge, twin9) ;
 * le partage passe par une version partagée de l'interface de cartographie,
 * réservée aux adultes, éventuellement garantie par un cartographe (D-42).
 * Les liens créés AVANT restent servis jusqu'à leur expiration : l'apprenant
 * les liste et les révoque (AuthTestBase::legacyShareLink les écrit comme le
 * faisait la route). L'effet côté employeur n'est vérifié que par un appel
 * minimal à POST /api/share/{token} : le détail relève de UC-EMP-01.
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

    /** Un lien créé avant le retrait (D-43). @return array{shareId: int, token: string, url: string} */
    private function existing(string $password = self::LINK_PASSWORD, int $expiresInDays = 90): array
    {
        return self::legacyShareLink($this->cartoId, $password, $expiresInDays, $this->maya['id']);
    }

    /** @return list<array<string, mixed>> */
    private function links(): array
    {
        $response = $this->as_($this->maya, 'GET', '/api/cartographies/' . $this->cartoId . '/shares');
        self::assertSame(200, $response->getStatusCode());

        return self::json($response);
    }

    /** Effet côté employeur (UC-EMP-01) : navigateur neuf, autre IP. */
    private function employeurStatus(string $token, string $password = self::LINK_PASSWORD): int
    {
        $sid = $this->cookieSid;
        $ip = $this->clientIp;
        $this->cookieSid = null;
        $this->clientIp = '198.51.100.7';
        $status = $this->request('POST', '/api/share/' . $token, ['password' => $password])->getStatusCode();
        $this->cookieSid = $sid;
        $this->clientIp = $ip;

        return $status;
    }

    private static function countLinks(): int
    {
        return (int) self::$pdo->query('SELECT COUNT(*) FROM share_links')->fetchColumn();
    }

    #[TestDox('UC-APP-05-F01 — retrait : plus aucun lien vers une cartographie du site — 422 share_retired, quel que soit le corps, rien n’est écrit ni audité')]
    public function testF01CreationIsRetired(): void
    {
        // Les trois types de cartographie du site : journée, parcours, Twin9.
        $cartos = [
            'jour' => $this->cartoId,
            'merge' => $this->createCarto($this->maya, ['type' => 'merge', 'titre' => 'Parcours', 'visibility' => 'publique']),
            'twin9' => $this->createCarto($this->maya, [
                'type' => 'twin9',
                'titre' => 'Analyse approfondie',
                'visibility' => 'publique',
                'document' => ['journal_id' => 'j-1', 'competences' => []],
            ]),
        ];
        foreach ($cartos as $type => $id) {
            foreach ([
                ['password' => self::LINK_PASSWORD, 'expiresInDays' => 30],
                ['password' => self::LINK_PASSWORD],
                ['password' => 'court'],
                [],
            ] as $i => $body) {
                $response = $this->share($body, $id);
                self::assertSame(422, $response->getStatusCode(), $type . ' #' . $i);
                $data = self::json($response);
                self::assertSame('share_retired', $data['code']);
                // La phrase est aussi l'`error` : un onglet resté sur l'ancien front l'affiche.
                self::assertStringContainsString('publiez une version partagée', $data['error']);
                self::assertSame($data['error'], $data['fields']['type']);
            }
        }
        self::assertSame(0, self::countLinks());
        self::assertNull(self::lastAudit('share_created'));
    }

    #[TestDox('UC-APP-05-F03 — A2 : un lien existant se révoque → 204, daté et audité ; il meurt pour l’employeur ; nouvelle révocation sans effet')]
    public function testF03RevokeLink(): void
    {
        $share = $this->existing();
        self::assertSame(200, $this->employeurStatus($share['token']), 'il était servi');

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

        // Idempotent : 204, date de révocation d'origine conservée. La date est
        // d'abord reculée : deux appels dans la même seconde ne distingueraient
        // pas une conservation d'un re-datage.
        self::$pdo->exec("UPDATE share_links SET revoked_at = '2026-01-01 08:00:00'");
        self::assertSame(204, $this->as_($this->maya, 'DELETE', '/api/shares/' . $share['shareId'])->getStatusCode());
        self::assertSame('2026-01-01T08:00:00', $this->links()[0]['revokedAt']);
        // Comportement actuel (fiche, « Limites ») : la re-révocation est de
        // nouveau journalisée.
        self::assertSame(2, (int) self::$pdo->query("SELECT COUNT(*) FROM audit_events WHERE type = 'share_revoked'")->fetchColumn());
    }

    #[TestDox('UC-APP-05-F04 — A3 : plusieurs liens existants, listés sans jeton, révoqués indépendamment')]
    public function testF04SeveralIndependentLinks(): void
    {
        $recruteurA = $this->existing();
        $recruteurB = $this->existing('autre-mot-de-passe', 7);
        $list = $this->as_($this->maya, 'GET', '/api/cartographies/' . $this->cartoId . '/shares');
        self::assertSame([['shareId', 'createdAt', 'expiresAt', 'revokedAt'], ['shareId', 'createdAt', 'expiresAt', 'revokedAt']], array_map('array_keys', self::json($list)));
        self::assertStringNotContainsString($recruteurA['token'], (string) $list->getBody(), 'le jeton n’est jamais réaffiché');
        self::assertSame(2, self::json($this->as_($this->maya, 'GET', '/api/cartographies'))[0]['shares']);

        self::assertSame(204, $this->as_($this->maya, 'DELETE', '/api/shares/' . $recruteurA['shareId'])->getStatusCode());

        self::assertSame([$recruteurA['shareId'], $recruteurB['shareId']], array_column($this->links(), 'shareId'));
        self::assertSame(404, $this->employeurStatus($recruteurA['token']));
        self::assertSame(200, $this->employeurStatus($recruteurB['token'], 'autre-mot-de-passe'));
    }

    #[TestDox('UC-APP-05-F05 — A4 : un lien existant expiré reste listé (non révoqué) mais ne compte plus et ne s’ouvre plus')]
    public function testF05ExpiredLinkStaysListedButDead(): void
    {
        $share = $this->existing(self::LINK_PASSWORD, 1);
        self::$pdo->exec('UPDATE share_links SET expires_at = NOW() - INTERVAL 1 DAY');

        $list = $this->links();
        self::assertCount(1, $list);
        self::assertNull($list[0]['revokedAt']);
        self::assertLessThan(strtotime($list[0]['createdAt']), strtotime($list[0]['expiresAt']), 'date d’expiration passée');
        self::assertSame(0, self::json($this->as_($this->maya, 'GET', '/api/cartographies'))[0]['shares']);
        self::assertSame(404, $this->employeurStatus($share['token']));
    }

    #[TestDox('UC-APP-05-F08 — E4 : cartographie ou lien d’autrui (ou inconnu) → 404, rien n’est créé ni révoqué')]
    public function testF08ForeignResourcesAnswer404(): void
    {
        $share = $this->existing();
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

    #[TestDox('UC-APP-05-F09 — E3 : sans session → 401, sans jeton CSRF → 403, sans rôle apprenant → 403 « Rôle insuffisant » sur les trois routes')]
    public function testF09AuthenticationCsrfAndRole(): void
    {
        $share = $this->existing();

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
        foreach ([
            ['POST', '/api/cartographies/' . $this->cartoId . '/share', ['password' => self::LINK_PASSWORD]],
            ['GET', '/api/cartographies/' . $this->cartoId . '/shares', null],
            ['DELETE', '/api/shares/' . $share['shareId'], null],
        ] as [$method, $path, $body]) {
            $response = $this->as_($this->maya, $method, $path, $body);
            self::assertSame(403, $response->getStatusCode(), 'rôle relu à chaque requête : ' . $method . ' ' . $path);
            self::assertSame('Rôle insuffisant', self::json($response)['error'], $method . ' ' . $path);
        }
        // Ordre des gardes : le CSRF global passe AVANT RequireRole — sans jeton,
        // ce compte sans rôle reçoit le 403 CSRF, pas « Rôle insuffisant ».
        $this->cookieSid = $this->maya['sid'];
        self::assertSame('Jeton CSRF absent ou invalide', self::json($this->request('POST', '/api/cartographies/' . $this->cartoId . '/share', ['password' => self::LINK_PASSWORD]))['error']);

        self::assertSame(1, self::countLinks());
        self::assertNull(self::$pdo->query('SELECT revoked_at FROM share_links')->fetchColumn());
    }

    #[TestDox('UC-APP-05-F10 — anomalie levée par le retrait : une cartographie « privée » ne se partage pas plus qu’une autre (422 share_retired)')]
    public function testF10PrivateCartographyIsNotSharedEither(): void
    {
        // Avant le retrait (fiche, « Anomalies constatées ») : la route ne
        // consultait pas la visibilité, une cartographie « privée » se
        // partageait. Désormais plus aucune ne se partage par cette route.
        $privee = $this->createCarto($this->maya, ['titre' => 'Privée', 'visibility' => 'privee']);

        $response = $this->share(['password' => self::LINK_PASSWORD], $privee);

        self::assertSame(422, $response->getStatusCode());
        self::assertSame('share_retired', self::json($response)['code']);
        self::assertSame(0, self::countLinks());
    }
}
