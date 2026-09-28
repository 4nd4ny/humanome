<?php

declare(strict_types=1);

namespace Humanome\Tests\UseCases\Functional;

use Humanome\Tests\CartographeTestCase;
use PHPUnit\Framework\Attributes\TestDox;
use Psr\Http\Message\ResponseInterface;

/**
 * UC-EMP-01 — Consulter une cartographie partagée : tests FONCTIONNELS (API).
 *
 * Fiche : docs/cas-utilisation/employeur/UC-EMP-01-consulter-cartographie-partagee.md
 *
 * Chaque test rejoue un scénario de la fiche à travers l'API HTTP (application
 * Slim en processus, vraie base MySQL) : l'apprenant prépare le lien avec les
 * routes réelles (préconditions), puis l'employeur — navigateur NEUF, sans
 * cookie de session, autre adresse IP — joue le scénario.
 */
final class UcEmp01ConsulterPartageTest extends CartographeTestCase
{
    private const LINK_PASSWORD = 'sesame-employeur';

    /** @var array{id: int, csrf: string, sid: string} */
    private array $apprenant;

    private int $cartoId = 0;

    protected function setUp(): void
    {
        parent::setUp();
        $this->apprenant = $this->registerAs('maya@example.org', 'Maya');
        $this->cartoId = $this->createCarto($this->apprenant, [
            'type' => 'jour',
            'titre' => 'Journée du 5 janvier',
            'visibility' => 'publique',
            'document' => self::jourDocument(),
        ]);
    }

    /** Précondition : l'apprenant a créé un lien (UC-APP-05). */
    private function shareLink(int $expiresInDays = 90): array
    {
        $response = $this->as_($this->apprenant, 'POST', '/api/cartographies/' . $this->cartoId . '/share', [
            'password' => self::LINK_PASSWORD,
            'expiresInDays' => $expiresInDays,
        ]);
        self::assertSame(201, $response->getStatusCode(), (string) $response->getBody());

        return self::json($response);
    }

    /** L'employeur : aucun cookie, aucun jeton CSRF, IP distincte. */
    private function employeurConsulte(string $token, ?string $password, string $ip = '198.51.100.7'): ResponseInterface
    {
        $this->cookieSid = null;
        $this->clientIp = $ip;

        return $this->request('POST', '/api/share/' . $token, $password === null ? [] : ['password' => $password]);
    }

    #[TestDox('UC-EMP-01-F01 — scénario nominal : bon mot de passe → cartographie en lecture seule, sans compte')]
    public function testF01NominalConsultationWithoutAccount(): void
    {
        $share = $this->shareLink();
        self::assertSame('/#/partage/' . $share['token'], $share['url'], 'lien transmis à l’employeur');

        $response = $this->employeurConsulte($share['token'], self::LINK_PASSWORD);

        self::assertSame(200, $response->getStatusCode());
        $body = self::json($response);
        self::assertSame(['titre', 'type', 'document', 'garantie'], array_keys($body));
        self::assertSame('Journée du 5 janvier', $body['titre']);
        self::assertSame('jour', $body['type']);
        // MySQL JSON normalise l'ordre des clés : égalité de contenu, pas d'ordre.
        self::assertEquals(self::jourDocument(), $body['document']);
        self::assertNull($body['garantie'], 'pas encore garantie par un cartographe');
        self::assertNull($this->cookieSid, 'la consultation n’ouvre aucune session');
    }

    #[TestDox('UC-EMP-01-F02 — la consultation est journalisée sans contenu ni IP (RGPD §6.5)')]
    public function testF02ConsultationIsAuditedWithIdsOnly(): void
    {
        $share = $this->shareLink();
        $this->employeurConsulte($share['token'], self::LINK_PASSWORD);

        $audit = self::lastAudit('share_consulted');
        self::assertNotNull($audit);
        self::assertNull($audit['userId'], 'l’employeur n’a pas de compte');
        self::assertEquals(['cartographieId' => $this->cartoId, 'shareLinkId' => $share['shareId']], $audit['details']);
        $raw = (string) self::$pdo->query("SELECT details FROM audit_events WHERE type = 'share_consulted'")->fetchColumn();
        self::assertStringNotContainsString($share['token'], $raw);
        self::assertStringNotContainsString(self::LINK_PASSWORD, $raw);
        self::assertStringNotContainsString('198.51.100.7', $raw);
    }

    #[TestDox('UC-EMP-01-F03 — A1 : cartographie garantie → mention du garant et document de la révision signée')]
    public function testF03GuaranteedRevisionIsServed(): void
    {
        $cartographe = $this->registerAs('camille@example.org', 'Camille', ['cartographe']);
        $this->link($this->apprenant, $cartographe);

        $revised = self::jourDocument();
        $revised['date'] = '2026-01-06';
        $revision = $this->as_($cartographe, 'POST', '/api/cartographies/' . $this->cartoId . '/revisions', [
            'document' => $revised,
            'note' => 'Correction de la date',
        ]);
        self::assertSame(201, $revision->getStatusCode(), (string) $revision->getBody());
        $revisionId = (int) self::json($revision)['revisionId'];
        $garantie = $this->as_($cartographe, 'POST', '/api/cartographies/' . $this->cartoId . '/garantie', [
            'revisionId' => $revisionId,
        ]);
        self::assertSame(201, $garantie->getStatusCode(), (string) $garantie->getBody());

        $share = $this->shareLink();
        $body = self::json($this->employeurConsulte($share['token'], self::LINK_PASSWORD));

        self::assertSame('Camille', $body['garantie']['par']);
        self::assertSame($revisionId, $body['garantie']['revisionId']);
        self::assertSame('2026-01-06', $body['document']['date'], 'document signé, pas la base');
    }

    #[TestDox('UC-EMP-01-F04 — A2 : garantie retirée après le partage → le lien sert de nouveau la base, sans mention')]
    public function testF04WithdrawnGarantieFallsBackToBaseDocument(): void
    {
        $cartographe = $this->registerAs('camille@example.org', 'Camille', ['cartographe']);
        $this->link($this->apprenant, $cartographe);
        self::assertSame(201, $this->as_($cartographe, 'POST', '/api/cartographies/' . $this->cartoId . '/garantie', [])->getStatusCode());
        $share = $this->shareLink();

        self::assertSame('Camille', self::json($this->employeurConsulte($share['token'], self::LINK_PASSWORD))['garantie']['par']);

        self::assertSame(204, $this->as_($cartographe, 'DELETE', '/api/cartographies/' . $this->cartoId . '/garantie')->getStatusCode());
        $after = self::json($this->employeurConsulte($share['token'], self::LINK_PASSWORD));
        self::assertNull($after['garantie']);
        self::assertEquals(self::jourDocument(), $after['document']);
    }

    #[TestDox('UC-EMP-01-F05 — E1 : mauvais mot de passe → 403, aucune donnée')]
    public function testF05WrongPasswordIsForbidden(): void
    {
        $share = $this->shareLink();
        $response = $this->employeurConsulte($share['token'], 'pas-le-bon-mdp');

        self::assertSame(403, $response->getStatusCode());
        $body = self::json($response);
        self::assertSame(['error'], array_keys($body));
        self::assertNull(self::lastAudit('share_consulted'), 'un échec n’est pas une consultation');
    }

    #[TestDox('UC-EMP-01-F06 — E2 : mot de passe absent → 422')]
    public function testF06MissingPasswordIsRejected(): void
    {
        $share = $this->shareLink();

        self::assertSame(422, $this->employeurConsulte($share['token'], null)->getStatusCode());
        self::assertSame(422, $this->employeurConsulte($share['token'], '')->getStatusCode());
    }

    #[TestDox('UC-EMP-01-F07 — E3 : inconnu, révoqué, expiré ou supprimé → même 404 (anti-énumération)')]
    public function testF07UnknownRevokedExpiredDeletedCollapseToOne404(): void
    {
        $answers = [];

        $answers['inconnu'] = $this->employeurConsulte(str_repeat('ab', 16), self::LINK_PASSWORD);
        $answers['malforme'] = $this->employeurConsulte('pas-un-jeton-hex', self::LINK_PASSWORD);

        $revoked = $this->shareLink();
        self::assertSame(204, $this->as_($this->apprenant, 'DELETE', '/api/shares/' . $revoked['shareId'])->getStatusCode());
        $answers['revoque'] = $this->employeurConsulte($revoked['token'], self::LINK_PASSWORD);

        $expired = $this->shareLink(1);
        self::$pdo->exec('UPDATE share_links SET expires_at = NOW() - INTERVAL 1 SECOND WHERE id = ' . (int) $expired['shareId']);
        $answers['expire'] = $this->employeurConsulte($expired['token'], self::LINK_PASSWORD);

        $deleted = $this->shareLink();
        self::assertSame(204, $this->as_($this->apprenant, 'DELETE', '/api/cartographies/' . $this->cartoId)->getStatusCode());
        $answers['supprime'] = $this->employeurConsulte($deleted['token'], self::LINK_PASSWORD);

        $bodies = [];
        foreach ($answers as $case => $response) {
            self::assertSame(404, $response->getStatusCode(), $case);
            $bodies[$case] = (string) $response->getBody();
        }
        self::assertCount(1, array_unique($bodies), 'corps strictement identiques : aucun oracle d’état');
    }

    #[TestDox('UC-EMP-01-F08 — E4 : plus de 20 essais par heure depuis une IP → 429 + Retry-After, même avec le bon mot de passe')]
    public function testF08RateLimitPerIp(): void
    {
        $share = $this->shareLink();
        for ($i = 1; $i <= 20; $i++) {
            self::assertSame(403, $this->employeurConsulte($share['token'], 'essai-' . $i, '192.0.2.50')->getStatusCode());
        }

        $blocked = $this->employeurConsulte($share['token'], self::LINK_PASSWORD, '192.0.2.50');
        self::assertSame(429, $blocked->getStatusCode());
        self::assertGreaterThanOrEqual(30, (int) $blocked->getHeaderLine('Retry-After'));

        // Une autre IP n'est pas pénalisée.
        self::assertSame(200, $this->employeurConsulte($share['token'], self::LINK_PASSWORD, '192.0.2.51')->getStatusCode());
    }

    #[TestDox('UC-EMP-01-F09 — A3 : un navigateur déjà connecté (autre compte) consulte comme un anonyme')]
    public function testF09LoggedInBrowserConsultsLikeAnonymous(): void
    {
        $share = $this->shareLink();
        $autre = $this->registerAs('recruteur@example.org', 'Recruteur', ['apprenant']);

        $response = $this->as_($autre, 'POST', '/api/share/' . $share['token'], ['password' => self::LINK_PASSWORD]);

        self::assertSame(200, $response->getStatusCode());
        self::assertSame('Journée du 5 janvier', self::json($response)['titre']);
    }
}
