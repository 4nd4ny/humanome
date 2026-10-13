<?php

declare(strict_types=1);

namespace Humanome\Tests;

use Humanome\Share\SharedVersion;
use Psr\Http\Message\ResponseInterface;

/**
 * Interface ultime de cartographie, P6 (spécification §12) : copie serveur
 * d'une VERSION PARTAGÉE et lien de partage, RÉSERVÉS AUX ADULTES.
 *
 * Critère d'acceptation : « un mineur n'a jamais accès à la fonction ». Sans
 * auto-attestation de majorité, le serveur refuse de stocker une version
 * partagée et d'en créer un lien, quoi que fasse le client ; retirer
 * l'attestation révoque les liens actifs. La version partagée est vérifiée
 * par liste blanche de champs (jamais de portfolio, jamais de jury), le lien
 * peut se passer de mot de passe, n'est jamais indexé, et son auteur voit le
 * journal des consultations.
 */
final class CartoPartageTest extends AuthTestBase
{
    private string $csrf = '';

    protected function setUp(): void
    {
        parent::setUp();
        self::$pdo->exec('DELETE FROM users');
        self::$pdo->exec('DELETE FROM audit_events');

        $response = $this->register('maya@example.org', self::PASSWORD, 'Maya');
        $this->csrf = (string) self::json($response)['csrfToken'];
    }

    /** @param array<string, mixed>|null $body */
    private function call(string $method, string $path, ?array $body = null): ResponseInterface
    {
        return $this->request($method, $path, $body, $method === 'GET' ? [] : ['X-CSRF-Token' => $this->csrf]);
    }

    private function attest(bool $adult): ResponseInterface
    {
        return $this->call('PUT', '/api/auth/me/adult', ['adult' => $adult]);
    }

    /**
     * Version partagée minimale et valide (précision « mois »).
     *
     * @param array<string, mixed> $overrides
     * @return array<string, mixed>
     */
    private static function sharedDoc(array $overrides = []): array
    {
        return array_replace([
            'kind' => 'carto-partage',
            'schemaVersion' => '1.0.0',
            'title' => 'Mes compétences 2025-2026',
            'publishedAt' => '2026-10-14T10:00:00.000Z',
            'datePrecision' => 'month',
            'period' => ['from' => '2025-09', 'to' => '2025-10'],
            'referential' => [
                'id' => 'respire',
                'version' => '7.0.0',
                'label' => 'RESPIRE 7.0.0',
                'poles' => [
                    ['num' => 1, 'nom' => 'TETE — Penser', 'couleur' => '#3366cc'],
                    ['num' => 2, 'nom' => 'COEUR — Ressentir', 'couleur' => null],
                ],
                'competences' => [
                    ['code' => 'C1.1', 'nom' => 'Analyser', 'pole' => 1, 'description' => 'Décomposer une situation.'],
                    ['code' => 'C2.3', 'nom' => 'Coopérer', 'pole' => 2],
                ],
            ],
            'state' => [
                'dayCount' => 3,
                'dates' => ['2025-09', '2025-10'],
                'competencies' => [
                    ['code' => 'C1.1', 'pole' => 1, 'theta' => 216.0, 'intensity' => 0.9, 'confidence' => 0.8, 'status' => 'established', 'days' => 2, 'proofs' => 2, 'hints' => 1],
                    ['code' => 'C2.3', 'pole' => 2, 'theta' => 144.0, 'intensity' => 0.6, 'confidence' => 0.5, 'status' => 'needs_review', 'days' => 1, 'proofs' => 0, 'hints' => 1],
                ],
                'poles' => [
                    ['num' => 1, 'theta' => 216.0, 'intensity' => 0.9, 'confidence' => 0.8, 'codes' => ['C1.1'], 'needsReviewOnly' => false],
                    ['num' => 2, 'theta' => 144.0, 'intensity' => 0.6, 'confidence' => 0.5, 'codes' => ['C2.3'], 'needsReviewOnly' => true],
                ],
            ],
            'heatmap' => ['precision' => 'month', 'cells' => [['key' => '2025-09', 'level' => 3, 'days' => 2], ['key' => '2025-10', 'level' => 1, 'days' => 1]]],
            'extracts' => [['code' => 'C1.1', 'date' => '2025-09', 'role' => 'preuve', 'text' => 'J’ai organisé la sortie de la classe.']],
        ], $overrides);
    }

    /** @param array<string, mixed> $document */
    private function publish(array $document, string $visibility = 'privee'): ResponseInterface
    {
        return $this->call('POST', '/api/cartographies', [
            'type' => 'partage',
            'titre' => (string) ($document['title'] ?? 'Version partagée'),
            'visibility' => $visibility,
            'document' => $document,
        ]);
    }

    private function publishedId(): int
    {
        $response = $this->publish(self::sharedDoc());
        self::assertSame(201, $response->getStatusCode(), (string) $response->getBody());

        return (int) self::json($response)['id'];
    }

    /** @return array{shareId: int, token: string, url: string} */
    private function link(int $cartoId, ?string $password = null): array
    {
        $response = $this->call('POST', '/api/cartographies/' . $cartoId . '/share', $password === null ? ['expiresInDays' => 30] : ['password' => $password]);
        self::assertSame(201, $response->getStatusCode(), (string) $response->getBody());

        /** @var array{shareId: int, token: string, url: string} */
        return self::json($response);
    }

    /** Navigateur anonyme du destinataire (aucun cookie de session). */
    private function anonymous(string $method, string $path, ?array $body = null): ResponseInterface
    {
        [$sid, $ip] = [$this->cookieSid, $this->clientIp];
        $this->cookieSid = null;
        $this->clientIp = '198.51.100.23';
        try {
            return $this->request($method, $path, $body);
        } finally {
            [$this->cookieSid, $this->clientIp] = [$sid, $ip];
        }
    }

    private static function rows(string $sql): int
    {
        return (int) self::$pdo->query($sql)->fetchColumn();
    }

    public function testWithoutAttestationNothingIsStoredNorShared(): void
    {
        $refused = $this->publish(self::sharedDoc());
        self::assertSame(403, $refused->getStatusCode());
        self::assertSame('adult_required', self::json($refused)['code']);
        self::assertSame(0, self::rows("SELECT COUNT(*) FROM cartographies WHERE type = 'partage'"), 'rien n’est écrit');

        // Les autres usages du compte ne changent pas (copie serveur d'une
        // journée, lien employeur avec mot de passe).
        $jour = $this->call('POST', '/api/cartographies', ['type' => 'jour', 'titre' => 'Journée', 'document' => ['kind' => 'cartographie-jour', 'date' => '2026-01-05']]);
        self::assertSame(201, $jour->getStatusCode());
        $share = $this->call('POST', '/api/cartographies/' . self::json($jour)['id'] . '/share', ['password' => 'sesame-employeur']);
        self::assertSame(201, $share->getStatusCode());
    }

    public function testAttestationIsSelfDeclaredDatedAndAudited(): void
    {
        self::assertSame(['adult' => false, 'attestedAt' => null, 'required' => true], self::json($this->call('GET', '/api/auth/me/adult')));

        $on = $this->attest(true);
        self::assertSame(200, $on->getStatusCode());
        $state = self::json($on);
        self::assertTrue($state['adult']);
        self::assertMatchesRegularExpression('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/', (string) $state['attestedAt']);

        // Ré-attester conserve la date d'origine et ne journalise pas deux fois.
        self::$pdo->exec("UPDATE users SET adult_attested_at = '2026-01-02 03:04:05'");
        self::assertSame('2026-01-02T03:04:05', self::json($this->attest(true))['attestedAt']);
        self::assertSame(1, self::rows("SELECT COUNT(*) FROM audit_events WHERE type = 'adult_attested'"));

        self::assertSame(422, $this->call('PUT', '/api/auth/me/adult', ['adult' => 'oui'])->getStatusCode());
        self::assertSame(422, $this->call('PUT', '/api/auth/me/adult', [])->getStatusCode());

        // Un visiteur n'a ni attestation ni fonction.
        $this->cookieSid = null;
        self::assertSame(401, $this->request('GET', '/api/auth/me/adult')->getStatusCode());
        self::assertSame(401, $this->request('PUT', '/api/auth/me/adult', ['adult' => true])->getStatusCode());
    }

    public function testSharedVersionIsCheckedByWhitelist(): void
    {
        $this->attest(true);
        $doc = self::sharedDoc();

        $cases = [
            'portfolio en tête' => $doc + ['portfolio' => ['2025-09-14' => 'texte intégral']],
            'traces de jury' => array_replace_recursive($doc, ['state' => ['competencies' => [0 => ['traces' => [['extract' => 'x']]]]]]),
            'référentiel augmenté' => array_replace_recursive($doc, ['referential' => ['notes' => 'privé']]),
            'compétence inconnue du référentiel' => array_replace_recursive($doc, ['state' => ['competencies' => [0 => ['code' => 'C9.9']]]]),
            'aucune compétence' => array_replace($doc, ['state' => array_replace($doc['state'], ['competencies' => []])]),
            'extrait trop long' => array_replace($doc, ['extracts' => [['code' => 'C1.1', 'date' => '2025-09', 'role' => 'preuve', 'text' => str_repeat('a', 2001)]]]),
            'extrait d’une compétence retirée' => array_replace($doc, ['extracts' => [['code' => 'C3.1', 'date' => '2025-09', 'role' => 'preuve', 'text' => 'x']]]),
            'extrait daté au jour en précision mois' => array_replace($doc, ['extracts' => [['code' => 'C1.1', 'date' => '2025-09-14', 'role' => 'preuve', 'text' => 'x']]]),
            'journée plus fine que le mois' => array_replace_recursive($doc, ['state' => ['dates' => [0 => '2025-09-14']]]),
            'période avec dates masquées' => array_replace($doc, ['datePrecision' => 'none', 'heatmap' => null, 'state' => array_replace($doc['state'], ['dates' => []]), 'extracts' => []]),
            'heatmap de précision différente' => array_replace($doc, ['heatmap' => ['precision' => 'day', 'cells' => []]]),
            'mauvais kind' => array_replace($doc, ['kind' => 'competency-map-master']),
            'version de format inconnue' => array_replace($doc, ['schemaVersion' => '2.0.0']),
        ];
        foreach ($cases as $label => $document) {
            $response = $this->publish($document);
            self::assertSame(422, $response->getStatusCode(), $label);
            self::assertArrayHasKey('document', self::json($response)['fields'], $label);
        }
        self::assertStringContainsString('portfolio', self::json($this->publish($cases['portfolio en tête']))['fields']['document']);

        // Une version partagée reste privée : seul un lien la montre.
        self::assertSame(422, $this->publish($doc, 'publique')->getStatusCode());
        self::assertSame(0, self::rows('SELECT COUNT(*) FROM cartographies'), 'aucun refus n’écrit quoi que ce soit');

        // Dates masquées : ni période, ni heatmap, ni date d'extrait.
        $hidden = array_replace($doc, [
            'datePrecision' => 'none',
            'period' => null,
            'heatmap' => null,
            'state' => array_replace($doc['state'], ['dates' => []]),
            'extracts' => [['code' => 'C1.1', 'date' => null, 'role' => 'indice', 'text' => 'Un passage choisi.']],
        ]);
        self::assertSame(201, $this->publish($hidden)->getStatusCode());
        // Précision au jour.
        $daily = array_replace($doc, [
            'datePrecision' => 'day',
            'period' => ['from' => '2025-09-14', 'to' => '2025-10-02'],
            'state' => array_replace($doc['state'], ['dates' => ['2025-09-14', '2025-09-20', '2025-10-02']]),
            'heatmap' => ['precision' => 'day', 'cells' => [['key' => '2025-09-14', 'level' => 5, 'days' => 1]]],
            'extracts' => [],
        ]);
        self::assertSame(201, $this->publish($daily)->getStatusCode());
    }

    public function testPasswordlessLinkOpensDirectlyAndIsNeverIndexed(): void
    {
        $this->attest(true);
        $id = $this->publishedId();
        $share = $this->link($id);
        self::assertSame('/#/partage/' . $share['token'] . '/ouvert', $share['url']);
        self::assertNull(self::$pdo->query('SELECT password_hash FROM share_links WHERE id = ' . $share['shareId'])->fetchColumn());

        $open = $this->anonymous('GET', '/api/share/' . $share['token']);
        self::assertSame(200, $open->getStatusCode());
        self::assertSame('noindex, nofollow, noarchive', $open->getHeaderLine('X-Robots-Tag'));
        self::assertSame('no-store', $open->getHeaderLine('Cache-Control'));
        $body = self::json($open);
        self::assertSame('partage', $body['type']);
        self::assertEquals(self::sharedDoc(), $body['document'], 'l’instantané figé, tel que publié');

        // Le POST reste possible (le mot de passe est alors ignoré).
        self::assertSame(200, $this->anonymous('POST', '/api/share/' . $share['token'], ['password' => 'quelconque'])->getStatusCode());
        self::assertSame(2, self::rows("SELECT COUNT(*) FROM audit_events WHERE type = 'share_consulted'"));

        // Les échecs ne sont pas indexés non plus, et restent homogènes.
        foreach (['/api/share/' . str_repeat('0', 32), '/api/share/pas-un-jeton'] as $path) {
            $missing = $this->anonymous('GET', $path);
            self::assertSame(404, $missing->getStatusCode());
            self::assertSame('noindex, nofollow, noarchive', $missing->getHeaderLine('X-Robots-Tag'));
        }
        $details = json_decode((string) self::$pdo->query("SELECT details FROM audit_events WHERE type = 'share_created'")->fetchColumn(), true);
        self::assertEquals(['cartographieId' => $id, 'shareId' => $share['shareId'], 'expiresInDays' => 30, 'withPassword' => false], $details);
    }

    public function testProtectedSharedVersionLink(): void
    {
        $this->attest(true);
        $id = $this->publishedId();
        self::assertSame(422, $this->call('POST', '/api/cartographies/' . $id . '/share', ['password' => 'court'])->getStatusCode());

        $share = $this->link($id, 'sesame-employeur');
        self::assertSame('/#/partage/' . $share['token'], $share['url']);

        $locked = $this->anonymous('GET', '/api/share/' . $share['token']);
        self::assertSame(401, $locked->getStatusCode());
        self::assertSame('password_required', self::json($locked)['code']);
        self::assertArrayNotHasKey('document', self::json($locked));
        self::assertSame(403, $this->anonymous('POST', '/api/share/' . $share['token'], ['password' => 'mauvais-mot'])->getStatusCode());
        self::assertSame(200, $this->anonymous('POST', '/api/share/' . $share['token'], ['password' => 'sesame-employeur'])->getStatusCode());
        self::assertSame(1, self::rows("SELECT COUNT(*) FROM audit_events WHERE type = 'share_consulted'"), 'seule la consultation réussie compte');

        // Les autres types gardent leur mot de passe obligatoire.
        $jour = $this->call('POST', '/api/cartographies', ['type' => 'jour', 'titre' => 'Journée', 'document' => ['kind' => 'cartographie-jour', 'date' => '2026-01-05']]);
        $noPassword = $this->call('POST', '/api/cartographies/' . self::json($jour)['id'] . '/share', []);
        self::assertSame(422, $noPassword->getStatusCode());
        self::assertArrayHasKey('password', self::json($noPassword)['fields']);
    }

    public function testConsultationJournalIsVisibleToItsAuthorOnly(): void
    {
        $this->attest(true);
        $id = $this->publishedId();
        $share = $this->link($id);
        $this->anonymous('GET', '/api/share/' . $share['token']);
        $this->anonymous('GET', '/api/share/' . $share['token']);

        $journal = $this->call('GET', '/api/shares/' . $share['shareId'] . '/consultations');
        self::assertSame(200, $journal->getStatusCode());
        $log = self::json($journal);
        self::assertSame($share['shareId'], $log['shareId']);
        self::assertFalse($log['withPassword']);
        self::assertSame(2, $log['count']);
        self::assertCount(2, $log['items']);
        self::assertSame(['at'], array_keys($log['items'][0]), 'des dates, rien d’autre (ni IP, ni navigateur)');
        self::assertSame($log['lastAt'], $log['items'][0]['at']);

        // La liste des liens garde son contrat (UC-APP-05).
        self::assertSame([['shareId', 'createdAt', 'expiresAt', 'revokedAt']], array_map('array_keys', self::json($this->call('GET', '/api/cartographies/' . $id . '/shares'))));

        // Un autre compte ne voit rien (404 homogène).
        $this->cookieSid = null;
        $other = $this->register('leo@example.org', self::PASSWORD, 'Léo');
        $this->csrf = (string) self::json($other)['csrfToken'];
        self::assertSame(404, $this->call('GET', '/api/shares/' . $share['shareId'] . '/consultations')->getStatusCode());
        self::assertSame(404, $this->call('GET', '/api/shares/999999/consultations')->getStatusCode());
    }

    public function testWithdrawingTheAttestationRevokesEveryLinkButKeepsTheRights(): void
    {
        $this->attest(true);
        $id = $this->publishedId();
        $open = $this->link($id);
        $protected = $this->link($id, 'sesame-employeur');
        $jour = $this->call('POST', '/api/cartographies', ['type' => 'jour', 'titre' => 'Journée', 'document' => ['kind' => 'cartographie-jour', 'date' => '2026-01-05']]);
        $jourShare = self::json($this->call('POST', '/api/cartographies/' . self::json($jour)['id'] . '/share', ['password' => 'sesame-employeur']));

        $off = $this->attest(false);
        self::assertSame(['adult' => false, 'attestedAt' => null, 'required' => true], self::json($off));
        $details = json_decode((string) self::$pdo->query("SELECT details FROM audit_events WHERE type = 'adult_attestation_withdrawn'")->fetchColumn(), true);
        self::assertSame(['revokedLinks' => 2], $details);

        // Plus rien n'est visible par les destinataires…
        self::assertSame(404, $this->anonymous('GET', '/api/share/' . $open['token'])->getStatusCode());
        self::assertSame(404, $this->anonymous('POST', '/api/share/' . $protected['token'], ['password' => 'sesame-employeur'])->getStatusCode());
        // … sauf ce qui ne relève pas de la version partagée.
        self::assertSame(200, $this->anonymous('POST', '/api/share/' . $jourShare['token'], ['password' => 'sesame-employeur'])->getStatusCode());

        // La fonction a disparu : ni nouvelle version, ni nouveau lien.
        self::assertSame(403, $this->publish(self::sharedDoc())->getStatusCode());
        $relink = $this->call('POST', '/api/cartographies/' . $id . '/share', []);
        self::assertSame(403, $relink->getStatusCode());
        self::assertSame('adult_required', self::json($relink)['code']);

        // Les droits demeurent : export complet, puis effacement immédiat.
        $export = $this->call('GET', '/api/cartographies/' . $id);
        self::assertSame(200, $export->getStatusCode());
        self::assertEquals(self::sharedDoc(), self::json($export)['document']);
        self::assertSame(204, $this->call('DELETE', '/api/cartographies/' . $id)->getStatusCode());
        self::assertSame(0, self::rows('SELECT COUNT(*) FROM share_links WHERE cartographie_id = ' . $id), 'liens effacés avec la version');
    }

    public function testSnapshotStaysFrozen(): void
    {
        $this->attest(true);
        $id = $this->publishedId();
        $share = $this->link($id);

        self::assertSame(422, $this->call('PATCH', '/api/cartographies/' . $id, ['visibility' => 'cartographe'])->getStatusCode());
        $renamed = $this->call('PATCH', '/api/cartographies/' . $id, ['titre' => 'Nouveau titre', 'document' => ['kind' => 'autre']]);
        self::assertSame(200, $renamed->getStatusCode());

        $served = self::json($this->anonymous('GET', '/api/share/' . $share['token']));
        self::assertSame('Nouveau titre', $served['titre']);
        self::assertEquals(self::sharedDoc(), $served['document'], 'le document ne change qu’en publiant une nouvelle version');
    }

    /**
     * Contrat avec le client : la fixture partagée (que web/src/carto/core/
     * share.test.js compare à la sortie de buildSharedVersion) est acceptée
     * telle quelle par la liste blanche.
     */
    public function testSharedFixtureIsTheContractWithTheClient(): void
    {
        $path = \dirname(__DIR__, 2) . '/schemas/fixtures/partage/carto-partage-exemple.json';
        $fixture = json_decode((string) file_get_contents($path), true, 512, JSON_THROW_ON_ERROR);
        self::assertSame([], SharedVersion::validate($fixture));

        $this->attest(true);
        self::assertSame(201, $this->publish($fixture)->getStatusCode());
    }

    public function testOpenConsultationIsRateLimitedLikeThePasswordForm(): void
    {
        for ($i = 0; $i < 20; $i++) {
            self::assertSame(404, $this->anonymous('GET', '/api/share/' . str_repeat('a', 32))->getStatusCode());
        }
        $blocked = $this->anonymous('POST', '/api/share/' . str_repeat('a', 32), ['password' => 'sesame-employeur']);
        self::assertSame(429, $blocked->getStatusCode(), 'même quota par IP pour GET et POST');
        self::assertNotSame('', $blocked->getHeaderLine('Retry-After'));
    }
}
