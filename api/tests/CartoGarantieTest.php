<?php

declare(strict_types=1);

namespace Humanome\Tests;

use Psr\Http\Message\ResponseInterface;

/**
 * Interface ultime de cartographie — version partagée PUBLIÉE PAR UN
 * CARTOGRAPHE, à la demande de l'apprenant, avec sa garantie (décision de
 * Christian du 2026-10-14, journal D-42 ; migration 023).
 *
 * L'apprenant adulte crée un code de demande à usage unique et le remet au
 * cartographe de son choix ; le cartographe publie, DANS LE COMPTE DE
 * L'APPRENANT, la version qu'il a vérifiée (privée, sans lien) et s'en porte
 * garant ; l'apprenant décide seul de la partager. Le destinataire lit la
 * garantie. Remplacer soi-même une version garantie lui retire sa garantie.
 * Jamais sans attestation de majorité de l'apprenant, jamais par
 * l'apprenant lui-même, jamais deux fois avec le même code.
 */
final class CartoGarantieTest extends CartographeTestCase
{
    /** @var array{id: int, csrf: string, sid: string} */
    private array $maya;
    /** @var array{id: int, csrf: string, sid: string} */
    private array $carl;

    protected function setUp(): void
    {
        parent::setUp();
        $this->maya = $this->registerAs('maya@example.org', 'Maya');
        $this->carl = $this->registerAs('carl@example.org', 'Carl', ['cartographe']);
        $this->attest($this->maya, true);
    }

    /** @param array{id: int, csrf: string, sid: string} $user */
    private function attest(array $user, bool $adult): void
    {
        self::assertSame(200, $this->as_($user, 'PUT', '/api/auth/me/adult', ['adult' => $adult])->getStatusCode());
    }

    /** @return array<string, mixed> la sortie exacte du client (fixture partagée, D-30) */
    private static function doc(string $title = 'Mes compétences, relues avec Carl'): array
    {
        $path = \dirname(__DIR__, 2) . '/schemas/fixtures/partage/carto-partage-exemple.json';
        $doc = json_decode((string) file_get_contents($path), true, 512, JSON_THROW_ON_ERROR);
        $doc['title'] = $title;

        return $doc;
    }

    /**
     * @param array{id: int, csrf: string, sid: string} $user
     * @param array<string, mixed> $extra
     */
    private function ask(array $user, ?int $replacesId = null, array $extra = []): ResponseInterface
    {
        return $this->as_($user, 'POST', '/api/partage/demandes', ['adult' => true] + ($replacesId === null ? [] : ['replacesId' => $replacesId]) + $extra);
    }

    /** @param array{id: int, csrf: string, sid: string} $user */
    private function code(array $user, ?int $replacesId = null): string
    {
        $response = $this->ask($user, $replacesId);
        self::assertSame(201, $response->getStatusCode(), (string) $response->getBody());

        return (string) self::json($response)['code'];
    }

    /**
     * @param array{id: int, csrf: string, sid: string} $cartographe
     * @param array<string, mixed>|null $doc
     */
    private function publishFor(array $cartographe, string $code, ?array $doc = null, mixed $garant = true): ResponseInterface
    {
        return $this->as_($cartographe, 'POST', '/api/cartographe/demandes/' . $code . '/publier', ['document' => $doc ?? self::doc(), 'garant' => $garant]);
    }

    /** @param array{id: int, csrf: string, sid: string} $owner */
    private function selfPublish(array $owner, string $title = 'Publiée par Maya'): int
    {
        $response = $this->as_($owner, 'POST', '/api/cartographies', ['type' => 'partage', 'titre' => $title, 'visibility' => 'privee', 'document' => self::doc($title)]);
        self::assertSame(201, $response->getStatusCode(), (string) $response->getBody());

        return (int) self::json($response)['id'];
    }

    /**
     * Lien sans mot de passe vers une version de l'apprenant.
     *
     * @param array{id: int, csrf: string, sid: string} $owner
     */
    private function linkTo(array $owner, int $cartoId): string
    {
        $response = $this->as_($owner, 'POST', '/api/cartographies/' . $cartoId . '/share', ['expiresInDays' => 30]);
        self::assertSame(201, $response->getStatusCode(), (string) $response->getBody());

        return (string) self::json($response)['token'];
    }

    /** Le destinataire, sans compte ni cookie, ouvre le lien. @return array<string, mixed> */
    private function recipientOpens(string $token): array
    {
        [$sid, $ip] = [$this->cookieSid, $this->clientIp];
        $this->cookieSid = null;
        $this->clientIp = '198.51.100.77';
        try {
            $response = $this->request('GET', '/api/share/open', null, ['X-Share-Token' => $token]);
        } finally {
            [$this->cookieSid, $this->clientIp] = [$sid, $ip];
        }
        self::assertSame(200, $response->getStatusCode(), (string) $response->getBody());

        return self::json($response);
    }

    private static function rows(string $sql): int
    {
        return (int) self::$pdo->query($sql)->fetchColumn();
    }

    public function testTheCartographePublishesInTheLearnersAccountAndVouchesForIt(): void
    {
        $created = self::json($this->ask($this->maya));
        self::assertMatchesRegularExpression('/^[A-Z2-9]{10}$/', $created['code']);
        self::assertNull($created['replaces']);
        self::assertSame([$created], self::json($this->as_($this->maya, 'GET', '/api/partage/demandes')));
        self::assertEquals(['replacesId' => null], self::lastAudit('publication_request_created')['details']);

        // Le cartographe ouvre la demande qu'on lui a remise.
        $opened = $this->as_($this->carl, 'GET', '/api/cartographe/demandes/' . $created['code']);
        self::assertSame(200, $opened->getStatusCode());
        $request = self::json($opened);
        self::assertSame(['displayName' => 'Maya'], $request['apprenant']);
        self::assertSame(['displayName' => 'Carl'], $request['garant']);
        self::assertNull($request['replaces']);

        // Il publie la version qu'il a vérifiée, avec sa garantie.
        $published = $this->publishFor($this->carl, $created['code']);
        self::assertSame(201, $published->getStatusCode(), (string) $published->getBody());
        $body = self::json($published);
        self::assertFalse($body['replaced']);
        self::assertSame('Carl', $body['garantie']['par']);
        self::assertArrayNotHasKey('id', $body, 'le cartographe ne reçoit pas de prise sur la version');

        // Dans le compte de Maya : privée, sans lien, garantie par Carl.
        $row = self::$pdo->query("SELECT id, user_id, visibility, titre FROM cartographies WHERE type = 'partage'")->fetch();
        self::assertSame($this->maya['id'], (int) $row['user_id']);
        self::assertSame('privee', $row['visibility']);
        self::assertSame('Mes compétences, relues avec Carl', $row['titre']);
        self::assertSame(0, self::rows('SELECT COUNT(*) FROM share_links'));
        self::assertSame($this->carl['id'], self::rows('SELECT cartographe_id FROM cartography_garanties WHERE cartographie_id = ' . (int) $row['id']));
        self::assertSame(0, self::rows('SELECT COUNT(*) FROM carto_publication_requests'), 'demande consommée');
        $audit = self::lastAudit('shared_version_guaranteed');
        self::assertSame($this->carl['id'], $audit['userId']);
        self::assertEquals(['cartographyId' => (int) $row['id'], 'apprenantId' => $this->maya['id'], 'replaced' => false], $audit['details']);

        // Maya la voit, garantie ; elle seule crée le lien.
        $versions = self::json($this->as_($this->maya, 'GET', '/api/partage/versions'));
        self::assertCount(1, $versions);
        self::assertSame('Carl', $versions[0]['garantie']['par']);
        self::assertNotEmpty($versions[0]['garantie']['date']);
        // Le cartographe n'a ensuite aucune prise sur elle : ni lecture, ni lien
        // (sans rôle apprenant, puis avec : elle n'est pas à lui).
        self::assertSame(403, $this->as_($this->carl, 'GET', '/api/cartographies/' . (int) $row['id'])->getStatusCode());
        self::setRoles($this->carl['id'], ['apprenant', 'cartographe']);
        self::assertSame(404, $this->as_($this->carl, 'GET', '/api/cartographies/' . (int) $row['id'])->getStatusCode());
        self::assertSame(404, $this->as_($this->carl, 'POST', '/api/cartographies/' . (int) $row['id'] . '/share', ['expiresInDays' => 30])->getStatusCode());
        $served = $this->recipientOpens($this->linkTo($this->maya, (int) $row['id']));
        self::assertSame('Carl', $served['garantie']['par']);
        self::assertNull($served['garantie']['revisionId']);
        self::assertEquals(self::doc(), $served['document']);

        // Un code ne sert qu'une fois.
        self::assertSame(404, $this->publishFor($this->carl, $created['code'])->getStatusCode());
        self::assertSame(1, self::rows("SELECT COUNT(*) FROM cartographies WHERE type = 'partage'"));
    }

    public function testOnlyAnAdultLearnerCanAskAndOnlyForTheirOwnVersions(): void
    {
        // Sans attestation : rien.
        $this->attest($this->maya, false);
        $refused = $this->ask($this->maya);
        self::assertSame(403, $refused->getStatusCode());
        self::assertSame('adult_required', self::json($refused)['code']);
        $this->attest($this->maya, true);

        // La case de la demande est exigée en plus de l'attestation du compte.
        self::assertSame(422, $this->as_($this->maya, 'POST', '/api/partage/demandes', [])->getStatusCode());
        self::assertSame(422, $this->as_($this->maya, 'POST', '/api/partage/demandes', ['adult' => 'oui'])->getStatusCode());

        // « À la place de » : seulement une de SES versions partagées.
        $bob = $this->registerAs('bob@example.org', 'Bob');
        $this->attest($bob, true);
        $bobs = $this->selfPublish($bob, 'Version de Bob');
        $jour = $this->createCarto($this->maya);
        foreach ([$bobs, $jour, 999999, '12'] as $target) {
            $response = $this->as_($this->maya, 'POST', '/api/partage/demandes', ['adult' => true, 'replacesId' => $target]);
            self::assertSame(422, $response->getStatusCode(), json_encode($target));
            self::assertArrayHasKey('replacesId', self::json($response)['fields']);
        }

        // Un compte sans rôle apprenant, une requête sans CSRF : refusés.
        self::assertSame(403, $this->as_($this->carl, 'POST', '/api/partage/demandes', ['adult' => true])->getStatusCode());
        $this->cookieSid = $this->maya['sid'];
        self::assertSame(403, $this->request('POST', '/api/partage/demandes', ['adult' => true])->getStatusCode());

        // Au plus cinq demandes en attente.
        for ($i = 0; $i < 5; $i++) {
            $this->code($this->maya);
        }
        self::assertSame(429, $this->ask($this->maya)->getStatusCode());
        self::assertSame(5, self::rows('SELECT COUNT(*) FROM carto_publication_requests'));
    }

    public function testAnUnknownExpiredOrOwnCodeOpensNothing(): void
    {
        $code = $this->code($this->maya);

        // Rôle cartographe exigé ; l'apprenant ne publie jamais pour lui-même.
        self::assertSame(403, $this->as_($this->maya, 'GET', '/api/cartographe/demandes/' . $code)->getStatusCode());
        self::setRoles($this->maya['id'], ['apprenant', 'cartographe']);
        self::assertSame(404, $this->as_($this->maya, 'GET', '/api/cartographe/demandes/' . $code)->getStatusCode());
        self::assertSame(404, $this->publishFor($this->maya, $code)->getStatusCode());

        // Inconnu, mal formé : la même réponse.
        self::assertSame(404, $this->as_($this->carl, 'GET', '/api/cartographe/demandes/ZZZZZZZZZZ')->getStatusCode());
        self::assertSame(404, $this->as_($this->carl, 'GET', '/api/cartographe/demandes/abc')->getStatusCode());

        // Expiré.
        self::$pdo->exec('UPDATE carto_publication_requests SET expires_at = DATE_SUB(NOW(), INTERVAL 1 MINUTE)');
        self::assertSame(404, $this->as_($this->carl, 'GET', '/api/cartographe/demandes/' . $code)->getStatusCode());
        self::assertSame(404, $this->publishFor($this->carl, $code)->getStatusCode());
        self::assertSame([], self::json($this->as_($this->maya, 'GET', '/api/partage/demandes')), 'les demandes expirées disparaissent');
        self::assertSame(0, self::rows("SELECT COUNT(*) FROM cartographies WHERE type = 'partage'"));
    }

    public function testNothingIsWrittenWithoutTheGarantieAValidVersionAndTheLearnersAttestation(): void
    {
        $code = $this->code($this->maya);

        // La garantie se confirme explicitement.
        foreach ([null, false, 'oui', 1] as $garant) {
            $response = $this->publishFor($this->carl, $code, null, $garant);
            self::assertSame(422, $response->getStatusCode());
            self::assertArrayHasKey('garant', self::json($response)['fields']);
        }
        // La liste blanche de la version partagée vaut aussi pour le cartographe.
        $smuggled = self::doc();
        $smuggled['portfolio'] = 'le texte intégral du journal';
        self::assertSame(422, $this->publishFor($this->carl, $code, $smuggled)->getStatusCode());
        self::assertSame(422, $this->as_($this->carl, 'POST', '/api/cartographe/demandes/' . $code . '/publier', ['garant' => true])->getStatusCode());
        // CSRF.
        $this->cookieSid = $this->carl['sid'];
        self::assertSame(403, $this->request('POST', '/api/cartographe/demandes/' . $code . '/publier', ['document' => self::doc(), 'garant' => true])->getStatusCode());

        // L'attestation de l'apprenant est relue au moment de publier.
        self::$pdo->prepare('UPDATE users SET adult_attested_at = NULL WHERE id = ?')->execute([$this->maya['id']]);
        $refused = $this->publishFor($this->carl, $code);
        self::assertSame(403, $refused->getStatusCode());
        self::assertSame('adult_required', self::json($refused)['code']);

        self::assertSame(0, self::rows("SELECT COUNT(*) FROM cartographies WHERE type = 'partage'"));
        self::assertSame(0, self::rows('SELECT COUNT(*) FROM cartography_garanties'));
        self::assertSame(1, self::rows('SELECT COUNT(*) FROM carto_publication_requests'), 'la demande reste à honorer');
    }

    public function testInPlaceOfAVersionSameLinkNewGarantieAndReplacingItYourselfDropsIt(): void
    {
        // Maya avait publié elle-même une version, et donné un lien.
        $id = $this->selfPublish($this->maya);
        $token = $this->linkTo($this->maya, $id);
        self::assertNull($this->recipientOpens($token)['garantie']);
        self::assertNull(self::json($this->as_($this->maya, 'GET', '/api/partage/versions'))[0]['garantie']);

        // Elle demande à Carl de la publier À SA PLACE.
        $created = self::json($this->ask($this->maya, $id));
        self::assertSame(['id' => $id, 'titre' => 'Publiée par Maya'], $created['replaces']);
        self::assertSame(['titre' => 'Publiée par Maya'], self::json($this->as_($this->carl, 'GET', '/api/cartographe/demandes/' . $created['code']))['replaces']);
        $published = self::json($this->publishFor($this->carl, $created['code'], self::doc('Relue avec Carl')));
        self::assertTrue($published['replaced']);

        // Même lien : le destinataire voit la version de Carl, garantie.
        $served = $this->recipientOpens($token);
        self::assertSame('Relue avec Carl', $served['titre']);
        self::assertSame('Carl', $served['garantie']['par']);
        self::assertSame(1, self::rows("SELECT COUNT(*) FROM cartographies WHERE type = 'partage'"));
        self::assertEquals(['cartographyId' => $id, 'apprenantId' => $this->maya['id'], 'replaced' => true], self::lastAudit('shared_version_guaranteed')['details']);

        // Maya la remplace elle-même : la garantie de Carl tombe.
        $replaced = $this->as_($this->maya, 'PUT', '/api/cartographies/' . $id . '/document', ['document' => self::doc('Retouchée par Maya')]);
        self::assertSame(200, $replaced->getStatusCode(), (string) $replaced->getBody());
        $served = $this->recipientOpens($token);
        self::assertSame('Retouchée par Maya', $served['titre']);
        self::assertNull($served['garantie'], 'ce qui est présenté comme garanti est exactement ce qui a été vérifié');
        self::assertSame(0, self::rows('SELECT COUNT(*) FROM cartography_garanties'));
        self::assertEquals(['cartographyId' => $id, 'garantieRemoved' => true], self::lastAudit('shared_version_replaced')['details']);

        // Une demande « à la place de » disparaît avec la version visée.
        $pending = $this->code($this->maya, $id);
        self::assertSame(204, $this->as_($this->maya, 'DELETE', '/api/cartographies/' . $id)->getStatusCode());
        self::assertSame(404, $this->as_($this->carl, 'GET', '/api/cartographe/demandes/' . $pending)->getStatusCode());
    }

    public function testTheLearnerCancelsAndWithdrawingTheAttestationErasesEverything(): void
    {
        $code = $this->code($this->maya);
        $bob = $this->registerAs('bob@example.org', 'Bob');
        self::assertSame(404, $this->as_($bob, 'DELETE', '/api/partage/demandes/' . $code)->getStatusCode(), 'pas la sienne');
        self::assertSame(204, $this->as_($this->maya, 'DELETE', '/api/partage/demandes/' . $code)->getStatusCode());
        self::assertSame(404, $this->as_($this->maya, 'DELETE', '/api/partage/demandes/' . $code)->getStatusCode());
        self::assertSame(404, $this->as_($this->carl, 'GET', '/api/cartographe/demandes/' . $code)->getStatusCode());
        self::assertNotNull(self::lastAudit('publication_request_cancelled'));

        // Une version garantie et une demande en attente, puis retrait de l'attestation.
        self::assertSame(201, $this->publishFor($this->carl, $this->code($this->maya))->getStatusCode());
        $pending = $this->code($this->maya);
        $this->attest($this->maya, false);
        self::assertSame(0, self::rows("SELECT COUNT(*) FROM cartographies WHERE type = 'partage'"));
        self::assertSame(0, self::rows('SELECT COUNT(*) FROM cartography_garanties'));
        self::assertSame(0, self::rows('SELECT COUNT(*) FROM carto_publication_requests'));
        self::assertSame(404, $this->publishFor($this->carl, $pending)->getStatusCode());
    }

    public function testWhenTheCartographeLeavesHisGarantieGoesTheVersionStays(): void
    {
        self::assertSame(201, $this->publishFor($this->carl, $this->code($this->maya))->getStatusCode());
        $id = self::rows("SELECT id FROM cartographies WHERE type = 'partage'");
        $token = $this->linkTo($this->maya, $id);

        self::assertSame(204, $this->as_($this->carl, 'DELETE', '/api/auth/account')->getStatusCode());
        self::assertNull($this->recipientOpens($token)['garantie'], 'sa signature part avec lui');
        self::assertNull(self::json($this->as_($this->maya, 'GET', '/api/partage/versions'))[0]['garantie']);

        // L'apprenant parti, ses demandes partent aussi.
        $this->code($this->maya);
        self::assertSame(204, $this->as_($this->maya, 'DELETE', '/api/auth/account')->getStatusCode());
        self::assertSame(0, self::rows('SELECT COUNT(*) FROM carto_publication_requests'));
    }

    public function testCodeAttemptsAreRateLimitedPerCartographe(): void
    {
        for ($i = 0; $i < 30; $i++) {
            self::assertSame(404, $this->as_($this->carl, 'GET', '/api/cartographe/demandes/ZZZZZZZZZ' . ($i % 8 + 2))->getStatusCode());
        }
        $limited = $this->as_($this->carl, 'GET', '/api/cartographe/demandes/' . $this->code($this->maya));
        self::assertSame(429, $limited->getStatusCode());
        self::assertNotSame('', $limited->getHeaderLine('Retry-After'));
    }
}
