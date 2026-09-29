<?php

declare(strict_types=1);

namespace Humanome\Tests\UseCases\Functional;

use Humanome\Tests\CartographeTestCase;
use PHPUnit\Framework\Attributes\TestDox;
use Psr\Http\Message\ResponseInterface;

/**
 * UC-CAR-05 — Garantir une cartographie ou retirer sa garantie : tests FONCTIONNELS (API).
 *
 * Fiche : docs/cas-utilisation/cartographe/UC-CAR-05-garantir-cartographie.md
 *
 * Scénarios rejoués par l'API HTTP (Slim en processus, vraie base) : Maya a
 * rattaché Carl (vrai parcours d'invitation) et lui expose une journée ; Carl
 * signe, re-signe, retire ; les refus (propriétaire, non lié, conflit, révision
 * étrangère, retrait par un tiers) sont joués tels qu'un client les verrait.
 * La mention côté employeur est couverte par UC-EMP-01 (F03, F04, F11).
 */
final class UcCar05GarantirCartographieTest extends CartographeTestCase
{
    /** @var array{id: int, csrf: string, sid: string} */
    private array $maya;

    /** @var array{id: int, csrf: string, sid: string} */
    private array $carl;

    private int $cartoId;

    protected function setUp(): void
    {
        parent::setUp();
        $this->maya = $this->registerAs('maya@example.org', 'Maya');
        $this->carl = $this->registerAs('carl@example.org', 'Carl', ['cartographe']);
        $this->link($this->maya, $this->carl);
        $this->cartoId = $this->createCarto($this->maya, ['titre' => 'Journée du 5 janvier', 'document' => self::jourDocument()]);
    }

    /** @param array<string, mixed>|null $body */
    private function guarantee(array $who, ?array $body = null, ?int $cartoId = null): ResponseInterface
    {
        return $this->as_($who, 'POST', '/api/cartographies/' . ($cartoId ?? $this->cartoId) . '/garantie', $body);
    }

    private function withdraw(array $who): ResponseInterface
    {
        return $this->as_($who, 'DELETE', '/api/cartographies/' . $this->cartoId . '/garantie');
    }

    private function revision(array $who, ?int $cartoId = null): int
    {
        $response = $this->as_($who, 'POST', '/api/cartographies/' . ($cartoId ?? $this->cartoId) . '/revisions', [
            'document' => self::jourDocument(),
            'note' => 'Relue',
        ]);
        self::assertSame(201, $response->getStatusCode(), (string) $response->getBody());

        return (int) self::json($response)['revisionId'];
    }

    private function countRows(string $table): int
    {
        return (int) self::$pdo->query('SELECT COUNT(*) FROM ' . $table)->fetchColumn();
    }

    private function countAudits(string $type): int
    {
        $stmt = self::$pdo->prepare('SELECT COUNT(*) FROM audit_events WHERE type = ?');
        $stmt->execute([$type]);

        return (int) $stmt->fetchColumn();
    }

    #[TestDox('UC-CAR-05-F01 — nominal : le cartographe lié garantit le document d’origine → 201 état figé, audit, file et relecture')]
    public function testF01NominalGarantieOnTheBaseDocument(): void
    {
        $response = $this->guarantee($this->carl);

        self::assertSame(201, $response->getStatusCode(), (string) $response->getBody());
        $garantie = self::json($response);
        self::assertSame(['par', 'date', 'revisionId'], array_keys($garantie));
        self::assertSame('Carl', $garantie['par']);
        self::assertNull($garantie['revisionId']);

        $audit = self::lastAudit('garantie_posee');
        self::assertSame($this->carl['id'], $audit['userId']);
        self::assertEquals(['cartographieId' => $this->cartoId, 'revisionId' => null], $audit['details']);

        self::assertSame($garantie, self::json($this->as_($this->carl, 'GET', '/api/cartographe/cartographies/' . $this->cartoId))['garantie']);
        self::assertSame(
            ['par' => 'Carl', 'date' => $garantie['date']],
            self::json($this->as_($this->carl, 'GET', '/api/cartographe/cartographies'))[0]['garantie'],
        );
    }

    #[TestDox('UC-CAR-05-F02 — A1 : garantie figée sur une révision de la cartographie')]
    public function testF02GarantiePinsARevision(): void
    {
        $revisionId = $this->revision($this->carl);

        $response = $this->guarantee($this->carl, ['revisionId' => $revisionId]);

        self::assertSame(201, $response->getStatusCode());
        self::assertSame($revisionId, self::json($response)['revisionId']);
        self::assertEquals(['cartographieId' => $this->cartoId, 'revisionId' => $revisionId], self::lastAudit('garantie_posee')['details']);
        self::assertSame($revisionId, self::json($this->as_($this->carl, 'GET', '/api/cartographe/cartographies/' . $this->cartoId))['garantie']['revisionId']);
    }

    #[TestDox('UC-CAR-05-F03 — A2 : le même cartographe re-garantit sur une révision → remplacement, une seule garantie')]
    public function testF03SameCartographeReplacesHisGarantie(): void
    {
        // La révision est posée d'abord : postée APRÈS, elle retirerait la garantie (UC-CAR-04 A2).
        $r1 = $this->revision($this->carl);
        self::assertSame(201, $this->guarantee($this->carl)->getStatusCode()); // document d'origine
        self::$pdo->exec("UPDATE cartography_garanties SET created_at = '2020-01-01 00:00:00'");

        $again = $this->guarantee($this->carl, ['revisionId' => $r1]);

        self::assertSame(201, $again->getStatusCode());
        self::assertSame($r1, self::json($again)['revisionId']);
        self::assertNotSame('2020-01-01T00:00:00', self::json($again)['date'], 'nouvel horodatage');
        self::assertSame(1, $this->countRows('cartography_garanties'));
        self::assertSame(2, $this->countAudits('garantie_posee'), 'chaque signature est un fait daté');
        self::assertSame($r1, self::json($this->as_($this->carl, 'GET', '/api/cartographe/cartographies/' . $this->cartoId))['garantie']['revisionId']);
    }

    #[TestDox('UC-CAR-05-F04 — A4 : retrait par le signataire → 204, audit « retrait », même si l’apprenant a fermé la cartographie (par l’API ; AN15 : lien employeur toujours garanti entre-temps)')]
    public function testF04WithdrawalBySignatory(): void
    {
        self::assertSame(201, $this->guarantee($this->carl)->getStatusCode());
        $response = $this->withdraw($this->carl);
        self::assertSame(204, $response->getStatusCode());
        self::assertNull(self::json($this->as_($this->carl, 'GET', '/api/cartographe/cartographies/' . $this->cartoId))['garantie']);
        $audit = self::lastAudit('garantie_retiree');
        self::assertSame($this->carl['id'], $audit['userId']);
        self::assertEquals(['cartographieId' => $this->cartoId, 'cause' => 'retrait'], $audit['details']);

        // RG : c'est SON nom — il peut le retirer même après fermeture en privée.
        $share = $this->as_($this->maya, 'POST', '/api/cartographies/' . $this->cartoId . '/share', ['password' => 'mot-de-passe-du-lien']);
        self::assertSame(201, $share->getStatusCode(), (string) $share->getBody());
        $token = (string) self::json($share)['token'];
        self::assertSame(201, $this->guarantee($this->carl)->getStatusCode());
        self::assertSame(200, $this->as_($this->maya, 'PATCH', '/api/cartographies/' . $this->cartoId, ['visibility' => 'privee'])->getStatusCode());
        self::assertSame(404, $this->guarantee($this->carl)->getStatusCode(), 'plus de pose possible');
        self::assertSame(404, $this->as_($this->carl, 'GET', '/api/cartographe/cartographies/' . $this->cartoId)->getStatusCode(), 'relecture fermée (AN15)');
        // AN15 : pendant ce temps, le lien employeur présente toujours la garantie.
        self::assertSame('Carl', $this->employeurConsulte($token)['garantie']['par']);
        self::assertSame(204, $this->withdraw($this->carl)->getStatusCode(), 'mais le retrait reste possible (par l’API)');
        self::assertSame(0, $this->countRows('cartography_garanties'));
        self::assertNull($this->employeurConsulte($token)['garantie']);
    }

    /** L'employeur consulte le lien de partage (aucun cookie, autre IP). */
    private function employeurConsulte(string $token): array
    {
        $this->cookieSid = null;
        $this->clientIp = '198.51.100.7';
        $response = $this->request('POST', '/api/share/' . $token, ['password' => 'mot-de-passe-du-lien']);
        self::assertSame(200, $response->getStatusCode(), (string) $response->getBody());

        return self::json($response);
    }

    #[TestDox('UC-CAR-05-F05 — RG : le nom signé est figé — renommer son compte ne réécrit pas la garantie')]
    public function testF05SignatureNameIsFrozen(): void
    {
        self::assertSame(201, $this->guarantee($this->carl)->getStatusCode());

        self::assertSame(200, $this->as_($this->carl, 'PATCH', '/api/auth/me', ['displayName' => 'Carl Dupont'])->getStatusCode());

        self::assertSame('Carl', self::json($this->as_($this->carl, 'GET', '/api/cartographe/cartographies/' . $this->cartoId))['garantie']['par']);
        self::assertSame('Carl Dupont', self::json($this->guarantee($this->carl))['par'], 'une nouvelle signature prend le nom courant');
    }

    #[TestDox('UC-CAR-05-F06 — E1 : le propriétaire ne garantit jamais sa cartographie (403 sans le rôle, 404 avec)')]
    public function testF06OwnerCannotGuarantee(): void
    {
        $forbidden = $this->guarantee($this->maya);
        self::assertSame(403, $forbidden->getStatusCode());
        self::assertSame(['error' => 'Rôle insuffisant'], self::json($forbidden));

        self::setRoles($this->maya['id'], ['apprenant', 'cartographe']);
        $notFound = $this->guarantee($this->maya);
        self::assertSame(404, $notFound->getStatusCode());
        self::assertSame(['error' => 'Cartographie introuvable'], self::json($notFound));
        self::assertSame(0, $this->countRows('cartography_garanties'));
    }

    #[TestDox('UC-CAR-05-F07 — E2 : cartographe non lié, cartographie privée ou inconnue → même 404')]
    public function testF07InaccessibleCartographiesCollapseInto404(): void
    {
        $rita = $this->registerAs('rita@example.org', 'Rita', ['cartographe']);
        $privee = $this->createCarto($this->maya, ['titre' => 'Journal intime', 'visibility' => 'privee']);

        $bodies = [];
        foreach ([
            'non_lie' => $this->guarantee($rita),
            'privee' => $this->guarantee($this->carl, null, $privee),
            'inconnue' => $this->guarantee($this->carl, null, 999999),
        ] as $case => $response) {
            self::assertSame(404, $response->getStatusCode(), $case);
            $bodies[] = (string) $response->getBody();
        }
        self::assertCount(1, array_unique($bodies));
        self::assertSame(0, $this->countRows('cartography_garanties'));
    }

    #[TestDox('UC-CAR-05-F08 — E3 : déjà garantie par un AUTRE cartographe lié → 409, la signature en place ne bouge pas')]
    public function testF08ConflictWithAnotherSignatory(): void
    {
        $rita = $this->registerAs('rita@example.org', 'Rita', ['cartographe']);
        $this->link($this->maya, $rita);
        self::assertSame(201, $this->guarantee($this->carl)->getStatusCode());

        $conflict = $this->guarantee($rita);

        self::assertSame(409, $conflict->getStatusCode());
        self::assertSame(['error' => 'Cartographie déjà garantie par un autre cartographe'], self::json($conflict));
        self::assertSame('Carl', self::json($this->as_($rita, 'GET', '/api/cartographe/cartographies/' . $this->cartoId))['garantie']['par']);
        self::assertSame(1, $this->countAudits('garantie_posee'));
    }

    #[TestDox('UC-CAR-05-F09 — E4 : revisionId d’une autre cartographie, inconnu ou non entier → 422')]
    public function testF09InvalidRevisionId(): void
    {
        $autre = $this->createCarto($this->maya, ['titre' => 'Autre journée', 'document' => self::jourDocument()]);
        $foreign = $this->revision($this->carl, $autre);
        $mine = $this->revision($this->carl);

        foreach (['etrangere' => $foreign, 'inconnue' => 999999, 'chaine' => (string) $mine, 'decimal' => 1.5] as $case => $revisionId) {
            $response = $this->guarantee($this->carl, ['revisionId' => $revisionId]);
            self::assertSame(422, $response->getStatusCode(), $case);
            self::assertSame(['revisionId' => 'Révision inconnue pour cette cartographie'], self::json($response)['fields'], $case);
        }
        self::assertSame(0, $this->countRows('cartography_garanties'));
        self::assertSame(201, $this->guarantee($this->carl, ['revisionId' => null])->getStatusCode(), 'null = document d’origine');
    }

    #[TestDox('UC-CAR-05-F10 — E5 : retrait par un autre cartographe ou sans garantie → 404 « Garantie introuvable » ; sans le rôle cartographe (propriétaire, signataire déchu) → 403')]
    public function testF10WithdrawalRefusals(): void
    {
        $rita = $this->registerAs('rita@example.org', 'Rita', ['cartographe']);
        $this->link($this->maya, $rita);

        $none = $this->withdraw($this->carl);
        self::assertSame(404, $none->getStatusCode());
        self::assertSame(['error' => 'Garantie introuvable'], self::json($none));

        self::assertSame(201, $this->guarantee($this->carl)->getStatusCode());
        self::assertSame(404, $this->withdraw($rita)->getStatusCode());
        $owner = $this->withdraw($this->maya);
        self::assertSame(403, $owner->getStatusCode(), 'propriétaire sans le rôle');
        self::assertSame(['error' => 'Rôle insuffisant'], self::json($owner));

        // Le signataire à qui l'on retire le rôle cartographe ne peut plus
        // retirer sa propre garantie, qui reste servie à son nom.
        self::setRoles($this->carl['id'], ['apprenant']);
        $lost = $this->withdraw($this->carl);
        self::assertSame(403, $lost->getStatusCode());
        self::assertSame(['error' => 'Rôle insuffisant'], self::json($lost));
        self::assertSame(1, $this->countRows('cartography_garanties'));
        self::assertSame(0, $this->countAudits('garantie_retiree'));
    }

    #[TestDox('UC-CAR-05-F11 — E6 : sans jeton CSRF → 403 à la pose comme au retrait')]
    public function testF11MissingCsrf(): void
    {
        $this->cookieSid = $this->carl['sid'];
        self::assertSame(403, $this->request('POST', '/api/cartographies/' . $this->cartoId . '/garantie')->getStatusCode());
        self::assertSame(0, $this->countRows('cartography_garanties'));

        self::assertSame(201, $this->guarantee($this->carl)->getStatusCode());
        $this->cookieSid = $this->carl['sid'];
        self::assertSame(403, $this->request('DELETE', '/api/cartographies/' . $this->cartoId . '/garantie')->getStatusCode());
        self::assertSame(1, $this->countRows('cartography_garanties'));
    }
}
