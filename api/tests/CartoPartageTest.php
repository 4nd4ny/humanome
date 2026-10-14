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
 * l'attestation EFFACE les versions partagées et leurs liens. La version
 * partagée est vérifiée par liste blanche de champs et de types (jamais de
 * portfolio, jamais de jury), elle est figée (ni titre modifiable, ni
 * relecture de cartographe), le lien peut se passer de mot de passe (jeton
 * dans un en-tête, jamais dans l'URL de l'API), n'est jamais indexé, et son
 * auteur voit le journal des consultations.
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
                    ['code' => 'C2.3', 'nom' => 'Coopérer', 'pole' => 2, 'description' => ''],
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

    /**
     * @param array<string, mixed> $document
     * @param array<string, mixed> $extra champs ajoutés au corps de la requête
     */
    private function publish(array $document, string $visibility = 'privee', array $extra = []): ResponseInterface
    {
        return $this->call('POST', '/api/cartographies', [
            'type' => 'partage',
            'titre' => (string) ($document['title'] ?? 'Version partagée'),
            'visibility' => $visibility,
            'document' => $document,
        ] + $extra);
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

    /**
     * Navigateur anonyme du destinataire (aucun cookie de session).
     *
     * @param array<string, string> $headers
     */
    private function anonymous(string $method, string $path, ?array $body = null, array $headers = []): ResponseInterface
    {
        [$sid, $ip] = [$this->cookieSid, $this->clientIp];
        $this->cookieSid = null;
        $this->clientIp = '198.51.100.23';
        try {
            return $this->request($method, $path, $body, $headers);
        } finally {
            [$this->cookieSid, $this->clientIp] = [$sid, $ip];
        }
    }

    /** Lecture d'un lien ouvert : le jeton dans l'en-tête, jamais dans l'URL. */
    private function open(string $token): ResponseInterface
    {
        return $this->anonymous('GET', '/api/share/open', null, ['X-Share-Token' => $token]);
    }

    private static function rows(string $sql): int
    {
        return (int) self::$pdo->query($sql)->fetchColumn();
    }

    private function jourCartography(): int
    {
        $jour = $this->call('POST', '/api/cartographies', ['type' => 'jour', 'titre' => 'Journée', 'document' => ['kind' => 'cartographie-jour', 'date' => '2026-01-05']]);
        self::assertSame(201, $jour->getStatusCode());

        return (int) self::json($jour)['id'];
    }

    public function testWithoutAttestationNothingIsStoredNorShared(): void
    {
        $refused = $this->publish(self::sharedDoc());
        self::assertSame(403, $refused->getStatusCode());
        self::assertSame('adult_required', self::json($refused)['code']);
        self::assertSame(0, self::rows("SELECT COUNT(*) FROM cartographies WHERE type = 'partage'"), 'rien n’est écrit');

        // La copie serveur d'une journée reste possible ; son ancien partage
        // par lien est retiré pour tous (question 17, journal D-43) : il n'y a
        // plus de chemin par lien qui échappe à l'attestation.
        $share = $this->call('POST', '/api/cartographies/' . $this->jourCartography() . '/share', ['password' => 'sesame-employeur']);
        self::assertSame(422, $share->getStatusCode());
        self::assertSame('share_retired', self::json($share)['code']);
        self::assertSame(0, self::rows('SELECT COUNT(*) FROM share_links'));
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

        // Sans jeton CSRF (session portée par le cookie) : refusé.
        self::assertSame(403, $this->request('PUT', '/api/auth/me/adult', ['adult' => false])->getStatusCode());

        // Un visiteur n'a ni attestation ni fonction.
        $this->cookieSid = null;
        self::assertSame(401, $this->request('GET', '/api/auth/me/adult')->getStatusCode());
        self::assertSame(401, $this->request('PUT', '/api/auth/me/adult', ['adult' => true])->getStatusCode());
    }

    public function testSharedVersionIsCheckedByWhitelistOfFieldsAndTypes(): void
    {
        $this->attest(true);
        $doc = self::sharedDoc();
        $state = $doc['state'];
        $ref = $doc['referential'];

        $cases = [
            'portfolio en tête' => $doc + ['portfolio' => ['2025-09-14' => 'texte intégral']],
            'traces de jury' => array_replace_recursive($doc, ['state' => ['competencies' => [0 => ['traces' => [['extract' => 'x']]]]]]),
            'champ manquant' => array_replace($doc, ['state' => array_replace($state, ['competencies' => [array_diff_key($state['competencies'][0], ['hints' => 0]), $state['competencies'][1]]])]),
            'référentiel augmenté d’un champ' => array_replace_recursive($doc, ['referential' => ['notes' => 'privé']]),
            'référentiel augmenté d’une compétence non retenue' => array_replace($doc, ['referential' => array_replace($ref, ['competences' => [...$ref['competences'], ['code' => 'C3.1', 'nom' => 'Texte libre', 'pole' => 1, 'description' => str_repeat('portfolio ', 300)]]])]),
            'couleur qui n’en est pas une' => array_replace_recursive($doc, ['referential' => ['poles' => [0 => ['couleur' => 'url(https://exemple.org/x.png)']]]]),
            'compétence inconnue du référentiel' => array_replace_recursive($doc, ['state' => ['competencies' => [0 => ['code' => 'C9.9']]]]),
            'compétence d’un autre pôle' => array_replace_recursive($doc, ['state' => ['competencies' => [0 => ['pole' => 2]]]]),
            'aucune compétence' => array_replace($doc, ['state' => array_replace($state, ['competencies' => []])]),
            'texte glissé dans needsReviewOnly' => array_replace_recursive($doc, ['state' => ['poles' => [0 => ['needsReviewOnly' => 'texte du portfolio']]]]),
            'code inconnu dans un pôle' => array_replace_recursive($doc, ['state' => ['poles' => [0 => ['codes' => ['C1.1', '2025-09-14']]]]]),
            'compteur de journées texte' => array_replace_recursive($doc, ['heatmap' => ['cells' => [0 => ['days' => 'deux']]]]),
            'angle hors bornes' => array_replace_recursive($doc, ['state' => ['competencies' => [0 => ['theta' => 9000]]]]),
            'extrait trop long' => array_replace($doc, ['extracts' => [['code' => 'C1.1', 'date' => '2025-09', 'role' => 'preuve', 'text' => str_repeat('a', 2001)]]]),
            'extrait d’une compétence retirée' => array_replace($doc, ['extracts' => [['code' => 'C3.1', 'date' => '2025-09', 'role' => 'preuve', 'text' => 'x']]]),
            'extrait daté au jour en précision mois' => array_replace($doc, ['extracts' => [['code' => 'C1.1', 'date' => '2025-09-14', 'role' => 'preuve', 'text' => 'x']]]),
            'journée plus fine que le mois' => array_replace_recursive($doc, ['state' => ['dates' => [0 => '2025-09-14']]]),
            'mois impossible' => array_replace_recursive($doc, ['state' => ['dates' => [0 => '2025-13']]]),
            'période à l’envers' => array_replace($doc, ['period' => ['from' => '2025-10', 'to' => '2025-09']]),
            'période avec dates masquées' => array_replace($doc, ['datePrecision' => 'none', 'heatmap' => null, 'state' => array_replace($state, ['dates' => []]), 'extracts' => []]),
            'heatmap de précision différente' => array_replace($doc, ['heatmap' => ['precision' => 'day', 'cells' => []]]),
            'date de publication libre' => array_replace($doc, ['publishedAt' => 'hier, chez Sam']),
            'mauvais kind' => array_replace($doc, ['kind' => 'competency-map-master']),
            'version de format inconnue' => array_replace($doc, ['schemaVersion' => '2.0.0']),
        ];
        foreach ($cases as $label => $document) {
            $response = $this->publish($document);
            self::assertSame(422, $response->getStatusCode(), $label);
            self::assertArrayHasKey('document', self::json($response)['fields'], $label);
        }
        self::assertStringContainsString('portfolio', self::json($this->publish($cases['portfolio en tête']))['fields']['document']);

        // Une version partagée ne porte que son document : ni métadonnées de
        // run, ni versions de paquet ou de référentiel.
        $withRunMeta = $this->publish($doc, 'privee', ['runMeta' => ['notes' => str_repeat('portfolio ', 100)]]);
        self::assertSame(422, $withRunMeta->getStatusCode());
        self::assertArrayHasKey('runMeta', self::json($withRunMeta)['fields']);
        // Une version partagée reste privée : seul un lien la montre.
        self::assertSame(422, $this->publish($doc, 'publique')->getStatusCode());
        self::assertSame(0, self::rows('SELECT COUNT(*) FROM cartographies'), 'aucun refus n’écrit quoi que ce soit');

        // Dates masquées : ni période, ni heatmap, ni date d'extrait.
        $hidden = array_replace($doc, [
            'datePrecision' => 'none',
            'period' => null,
            'heatmap' => null,
            'state' => array_replace($state, ['dates' => []]),
            'extracts' => [['code' => 'C1.1', 'date' => null, 'role' => 'indice', 'text' => 'Un passage choisi.']],
        ]);
        self::assertSame(201, $this->publish($hidden)->getStatusCode());
        // Précision au jour.
        $daily = array_replace($doc, [
            'datePrecision' => 'day',
            'period' => ['from' => '2025-09-14', 'to' => '2025-10-02'],
            'state' => array_replace($state, ['dates' => ['2025-09-14', '2025-09-20', '2025-10-02']]),
            'heatmap' => ['precision' => 'day', 'cells' => [['key' => '2025-09-14', 'level' => 5, 'days' => 1]]],
            'extracts' => [],
        ]);
        self::assertSame(201, $this->publish($daily)->getStatusCode());
        self::assertSame(422, $this->publish(array_replace($daily, ['period' => ['from' => '2025-02-30', 'to' => '2025-10-02']]))->getStatusCode(), 'jour impossible');
    }

    public function testTitleIsTheReviewedSnapshotTitle(): void
    {
        $this->attest(true);
        $response = $this->call('POST', '/api/cartographies', ['type' => 'partage', 'titre' => 'Autre chose, non relu', 'visibility' => 'privee', 'document' => self::sharedDoc()]);
        self::assertSame(201, $response->getStatusCode());
        self::assertSame('Mes compétences 2025-2026', self::$pdo->query('SELECT titre FROM cartographies WHERE id = ' . (int) self::json($response)['id'])->fetchColumn());
    }

    public function testPasswordlessLinkOpensDirectlyAndIsNeverIndexed(): void
    {
        $this->attest(true);
        $id = $this->publishedId();
        $share = $this->link($id);
        self::assertSame('/#/partage/' . $share['token'] . '/ouvert', $share['url']);
        self::assertNull(self::$pdo->query('SELECT password_hash FROM share_links WHERE id = ' . $share['shareId'])->fetchColumn());

        $open = $this->open($share['token']);
        self::assertSame(200, $open->getStatusCode());
        self::assertSame('noindex, nofollow, noarchive', $open->getHeaderLine('X-Robots-Tag'));
        self::assertSame('no-store', $open->getHeaderLine('Cache-Control'));
        $body = self::json($open);
        self::assertSame('partage', $body['type']);
        self::assertEquals(self::sharedDoc(), $body['document'], 'l’instantané figé, tel que publié');

        // Le jeton n'a jamais à passer dans l'URL de l'API : l'ancienne forme n'existe pas.
        self::assertNotSame(200, $this->anonymous('GET', '/api/share/' . $share['token'])->getStatusCode());
        // Le POST reste possible (le mot de passe est alors ignoré).
        self::assertSame(200, $this->anonymous('POST', '/api/share/' . $share['token'], ['password' => 'quelconque'])->getStatusCode());
        self::assertSame(2, self::rows("SELECT COUNT(*) FROM audit_events WHERE type = 'share_consulted'"));

        // Les échecs ne sont pas indexés non plus, et restent homogènes.
        foreach ([str_repeat('0', 32), 'pas-un-jeton', ''] as $token) {
            $missing = $this->open($token);
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
        // Un mot de passe qui n'est pas un texte n'est jamais lu comme « sans mot de passe ».
        $numeric = $this->call('POST', '/api/cartographies/' . $id . '/share', ['password' => 12345678]);
        self::assertSame(422, $numeric->getStatusCode());
        self::assertArrayHasKey('password', self::json($numeric)['fields']);
        self::assertSame(0, self::rows('SELECT COUNT(*) FROM share_links'));

        $share = $this->link($id, 'sesame-employeur');
        self::assertSame('/#/partage/' . $share['token'], $share['url']);
        // Audit : des identifiants et la durée, jamais le jeton ni le mot de passe.
        $raw = (string) self::$pdo->query("SELECT details FROM audit_events WHERE type = 'share_created' ORDER BY id DESC LIMIT 1")->fetchColumn();
        self::assertEquals(['cartographieId' => $id, 'shareId' => $share['shareId'], 'expiresInDays' => 90, 'withPassword' => true], json_decode($raw, true));
        self::assertStringNotContainsString($share['token'], $raw);
        self::assertStringNotContainsString('sesame-employeur', $raw);

        $locked = $this->open($share['token']);
        self::assertSame(401, $locked->getStatusCode());
        self::assertSame('password_required', self::json($locked)['code']);
        self::assertArrayNotHasKey('document', self::json($locked));
        self::assertSame(403, $this->anonymous('POST', '/api/share/' . $share['token'], ['password' => 'mauvais-mot'])->getStatusCode());
        self::assertSame(200, $this->anonymous('POST', '/api/share/' . $share['token'], ['password' => 'sesame-employeur'])->getStatusCode());
        self::assertSame(1, self::rows("SELECT COUNT(*) FROM audit_events WHERE type = 'share_consulted'"), 'seule la consultation réussie compte');

        // Les autres types ne se partagent plus par lien (D-43), avec ou sans mot de passe.
        $noPassword = $this->call('POST', '/api/cartographies/' . $this->jourCartography() . '/share', []);
        self::assertSame(422, $noPassword->getStatusCode());
        self::assertSame('share_retired', self::json($noPassword)['code']);
    }

    public function testConsultationJournalIsVisibleToItsAuthorOnly(): void
    {
        $this->attest(true);
        $id = $this->publishedId();
        $share = $this->link($id);
        $this->open($share['token']);
        $this->open($share['token']);

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

    public function testWithdrawingTheAttestationErasesTheSharedVersions(): void
    {
        $this->attest(true);
        $id = $this->publishedId();
        $open = $this->link($id);
        $protected = $this->link($id, 'sesame-employeur');
        // Un lien vers une journée du site, créé avant le retrait de l'ancien partage (D-43).
        $jourShare = self::legacyShareLink($this->jourCartography(), 'sesame-employeur');

        // Avant : l'export complet est possible (l'interface le propose).
        self::assertEquals(self::sharedDoc(), self::json($this->call('GET', '/api/cartographies/' . $id))['document']);

        $off = $this->attest(false);
        self::assertSame(['adult' => false, 'attestedAt' => null, 'required' => true, 'deletedVersions' => 1], self::json($off));
        $details = json_decode((string) self::$pdo->query("SELECT details FROM audit_events WHERE type = 'adult_attestation_withdrawn'")->fetchColumn(), true);
        self::assertSame(['deletedVersions' => 1], $details);

        // Plus aucune copie serveur, plus aucun lien…
        self::assertSame(0, self::rows("SELECT COUNT(*) FROM cartographies WHERE type = 'partage'"));
        self::assertSame(0, self::rows('SELECT COUNT(*) FROM share_links WHERE cartographie_id = ' . $id));
        self::assertSame(404, $this->open($open['token'])->getStatusCode());
        self::assertSame(404, $this->anonymous('POST', '/api/share/' . $protected['token'], ['password' => 'sesame-employeur'])->getStatusCode());
        self::assertSame(404, $this->call('GET', '/api/cartographies/' . $id)->getStatusCode());
        // … sauf ce qui ne relève pas de la version partagée.
        self::assertSame(200, $this->anonymous('POST', '/api/share/' . $jourShare['token'], ['password' => 'sesame-employeur'])->getStatusCode());

        // La fonction a disparu : ni nouvelle version, ni nouveau lien.
        self::assertSame(403, $this->publish(self::sharedDoc())->getStatusCode());
        self::assertSame(0, self::rows("SELECT COUNT(*) FROM cartographies WHERE type = 'partage'"));
    }

    public function testSnapshotStaysFrozenAndOutsideTheReviewModule(): void
    {
        $this->attest(true);
        $id = $this->publishedId();
        $share = $this->link($id);

        self::assertSame(422, $this->call('PATCH', '/api/cartographies/' . $id, ['visibility' => 'cartographe'])->getStatusCode());
        $renamed = $this->call('PATCH', '/api/cartographies/' . $id, ['titre' => 'Nouveau titre, non relu']);
        self::assertSame(422, $renamed->getStatusCode());
        self::assertArrayHasKey('titre', self::json($renamed)['fields']);

        // Ni annotation, ni révision, ni garantie : pas de cartographe tiers ici.
        self::assertSame(404, $this->call('POST', '/api/cartographies/' . $id . '/annotations', ['competenceCode' => '1.01', 'type' => 'commentaire', 'texte' => 'note'])->getStatusCode());
        self::assertSame(404, $this->call('GET', '/api/cartographies/' . $id . '/annotations')->getStatusCode());
        self::assertSame(404, $this->call('POST', '/api/cartographies/' . $id . '/revisions', ['document' => self::sharedDoc()])->getStatusCode());
        // La garantie est réservée aux cartographes (403 pour l'apprenant) ; aucun
        // cartographe n'atteint une version partagée (privée, hors du module).
        self::assertSame(403, $this->call('POST', '/api/cartographies/' . $id . '/garantie', [])->getStatusCode());

        $served = self::json($this->open($share['token']));
        self::assertSame('Mes compétences 2025-2026', $served['titre']);
        self::assertEquals(self::sharedDoc(), $served['document'], 'le document ne change qu’en publiant une nouvelle version');
    }

    /**
     * Décision du 2026-10-14 (journal D-33, question 15) : une nouvelle version
     * se publie À LA PLACE d'une autre — même lien, les destinataires voient la
     * nouvelle version ; l'ancien document est effacé ; mêmes gardes que la
     * publication (attestation sous verrou, liste blanche, propriétaire).
     */
    public function testANewVersionReplacesTheOldOneUnderTheSameLink(): void
    {
        $this->attest(true);
        $id = $this->publishedId();
        $share = $this->link($id);
        $consulted = $this->open($share['token']);
        self::assertSame(200, $consulted->getStatusCode());

        // Version B : une compétence et l'extrait en moins, un autre titre.
        $b = self::sharedDoc([
            'title' => 'Version allégée',
            'referential' => array_replace(self::sharedDoc()['referential'], [
                'competences' => [['code' => 'C2.3', 'nom' => 'Coopérer', 'pole' => 2, 'description' => '']],
            ]),
            'state' => [
                'dayCount' => 1,
                'dates' => ['2025-10'],
                'competencies' => [['code' => 'C2.3', 'pole' => 2, 'theta' => 360.0, 'intensity' => 0.5, 'confidence' => 0.5, 'status' => 'needs_review', 'days' => 1, 'proofs' => 0, 'hints' => 1]],
                'poles' => [['num' => 2, 'theta' => 360.0, 'intensity' => 0.5, 'confidence' => 0.5, 'codes' => ['C2.3'], 'needsReviewOnly' => true]],
            ],
            'period' => ['from' => '2025-10', 'to' => '2025-10'],
            'heatmap' => ['precision' => 'month', 'cells' => [['key' => '2025-10', 'level' => 1, 'days' => 1]]],
            'extracts' => [],
        ]);
        $replaced = $this->call('PUT', '/api/cartographies/' . $id . '/document', ['document' => $b]);
        self::assertSame(200, $replaced->getStatusCode(), (string) $replaced->getBody());
        self::assertSame('Version allégée', self::json($replaced)['titre']);
        self::assertArrayNotHasKey('document', self::json($replaced));

        // Même lien, nouvelle version ; l'ancien document n'existe plus.
        $served = self::json($this->open($share['token']));
        self::assertSame('Version allégée', $served['titre']);
        self::assertEquals($b, $served['document']);
        self::assertSame(1, self::rows("SELECT COUNT(*) FROM cartographies WHERE type = 'partage'"));
        self::assertStringNotContainsString('organisé la sortie', (string) self::$pdo->query('SELECT document FROM cartographies WHERE id = ' . $id)->fetchColumn());
        // Le journal des accès du lien continue : avant et après le remplacement.
        self::assertSame(2, self::json($this->call('GET', '/api/shares/' . $share['shareId'] . '/consultations'))['count']);
        $details = json_decode((string) self::$pdo->query("SELECT details FROM audit_events WHERE type = 'shared_version_replaced'")->fetchColumn(), true);
        self::assertSame(['cartographyId' => $id], $details);

        // Mêmes gardes que la publication.
        $smuggled = $this->call('PUT', '/api/cartographies/' . $id . '/document', ['document' => self::sharedDoc(['portfolio' => 'texte intégral'])]);
        self::assertSame(422, $smuggled->getStatusCode());
        self::assertSame(422, $this->call('PUT', '/api/cartographies/' . $this->jourCartography() . '/document', ['document' => $b])->getStatusCode());
        self::assertSame(404, $this->call('PUT', '/api/cartographies/999999/document', ['document' => $b])->getStatusCode());
        self::assertSame(403, $this->request('PUT', '/api/cartographies/' . $id . '/document', ['document' => $b])->getStatusCode(), 'CSRF');
        self::assertSame(401, $this->anonymous('PUT', '/api/cartographies/' . $id . '/document', ['document' => $b])->getStatusCode());
        self::$pdo->exec('UPDATE users SET adult_attested_at = NULL');
        self::assertSame(403, $this->call('PUT', '/api/cartographies/' . $id . '/document', ['document' => self::sharedDoc()])->getStatusCode());
        self::assertEquals($b, self::json($this->open($share['token']))['document'], 'rien n’a changé');

        // Une autre personne ne remplace pas la version de Maya.
        self::$pdo->exec('UPDATE users SET adult_attested_at = NOW()');
        $this->csrf = (string) self::json($this->register('noe@example.org', self::PASSWORD, 'Noé'))['csrfToken'];
        $this->attest(true);
        self::assertSame(404, $this->call('PUT', '/api/cartographies/' . $id . '/document', ['document' => self::sharedDoc()])->getStatusCode());
        self::assertEquals($b, self::json($this->open($share['token']))['document']);
    }

    /**
     * Contrat avec le client : la fixture partagée — EXACTEMENT la sortie de
     * buildSharedVersion (web/src/carto/core/share.test.js le vérifie) — est
     * acceptée telle quelle par la liste blanche.
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
            self::assertSame(404, $this->open(str_repeat('a', 32))->getStatusCode());
        }
        $blocked = $this->anonymous('POST', '/api/share/' . str_repeat('a', 32), ['password' => 'sesame-employeur']);
        self::assertSame(429, $blocked->getStatusCode(), 'même quota par IP pour la lecture ouverte et le formulaire');
        self::assertNotSame('', $blocked->getHeaderLine('Retry-After'));
    }
}
