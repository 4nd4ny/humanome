<?php

declare(strict_types=1);

namespace Humanome\Tests\UseCases\Functional;

use Humanome\Auth\Users;
use Humanome\Db;
use Humanome\Env;
use Humanome\Tests\CartographeTestCase;
use Humanome\Tests\TestDb;
use PHPUnit\Framework\Attributes\TestDox;
use Psr\Http\Message\ResponseInterface;
use ReflectionProperty;

/**
 * UC-EMP-01 — Consulter une cartographie partagée : tests FONCTIONNELS (API).
 *
 * Fiche : docs/cas-utilisation/employeur/UC-EMP-01-consulter-cartographie-partagee.md
 *
 * Chaque test rejoue un scénario de la fiche à travers l'API HTTP (application
 * Slim en processus, vraie base MySQL) : l'apprenant prépare le lien avec les
 * routes réelles (préconditions), puis l'employeur — navigateur NEUF, sans
 * cookie de session, autre adresse IP — joue le scénario. Les variantes A3,
 * AN2 (F09, F21, F22) jouent au contraire un navigateur porteur d'un cookie.
 *
 * La route POST /api/share/{token} n'utilise pas RoleGuard : le piège du
 * $_SESSION hérité de la requête précédente ne la concerne pas (le middleware
 * CSRF démarre explicitement la session quand un cookie est présent).
 */
final class UcEmp01ConsulterPartageTest extends CartographeTestCase
{
    private const LINK_PASSWORD = 'sesame-employeur';

    private const CSRF_ERROR = ['error' => 'Jeton CSRF absent ou invalide'];

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
    private function shareLink(int $expiresInDays = 90, ?int $cartoId = null): array
    {
        $response = $this->as_($this->apprenant, 'POST', '/api/cartographies/' . ($cartoId ?? $this->cartoId) . '/share', [
            'password' => self::LINK_PASSWORD,
            'expiresInDays' => $expiresInDays,
        ]);
        self::assertSame(201, $response->getStatusCode(), (string) $response->getBody());

        return self::json($response);
    }

    /** L'employeur : aucun cookie, aucun jeton CSRF, IP distincte. */
    private function employeurConsulte(string $token, mixed $password, string $ip = '198.51.100.7'): ResponseInterface
    {
        $this->cookieSid = null;
        $this->clientIp = $ip;

        return $this->request('POST', '/api/share/' . $token, $password === null ? [] : ['password' => $password]);
    }

    /**
     * La fenêtre du quota est FIXE et alignée sur l'heure (RateLimiter) : une
     * série d'essais qui chevaucherait le changement d'heure repartirait de
     * zéro. On attend la fenêtre suivante si la fin est trop proche.
     */
    private static function awaitFreshRateWindow(int $margin = 30): void
    {
        $left = 3600 - time() % 3600;
        if ($left < $margin) {
            sleep($left + 1);
        }
    }

    /** @return list<string> seaux de limitation de la route publique */
    private static function shareBuckets(): array
    {
        return array_map(
            'strval',
            self::$pdo->query("SELECT bucket FROM rate_limits WHERE bucket LIKE 'share:%' ORDER BY bucket")->fetchAll(\PDO::FETCH_COLUMN),
        );
    }

    /** carto_evolutive Twin9 minimal (même forme que CartographyViewer.test.jsx). */
    private static function twin9Document(): array
    {
        return [
            'journal_id' => 'demo',
            'date' => '2026-03-10',
            'periode' => ['debut' => '2026-03-02', 'fin' => '2026-03-02', 'n_journees' => 1],
            'competences' => [
                '1.01' => [
                    'code' => '1.01',
                    'nom' => 'Pensée critique',
                    'pole' => 1,
                    'attestations' => [[
                        'jour_index' => 0,
                        'journee' => 'J01',
                        'date' => '2026-03-02',
                        'confiance' => 0.8,
                        'score_preuves' => 2,
                        'score_indices' => 1,
                    ]],
                ],
            ],
            'histoires' => ['1.01' => 'Une histoire attestée.'],
            'kairos_evolutif' => 'Synthèse évolutive.',
        ];
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

    #[TestDox('UC-EMP-01-F02 — la consultation est journalisée sans contenu ni IP (journalisation minimale, CLAUDE.md principe RGPD 5)')]
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

    #[TestDox('UC-EMP-01-F04 — A2 : garantie (révision signée) retirée après le partage → le lien sert de nouveau la base, sans mention')]
    public function testF04WithdrawnGarantieFallsBackToBaseDocument(): void
    {
        $cartographe = $this->registerAs('camille@example.org', 'Camille', ['cartographe']);
        $this->link($this->apprenant, $cartographe);

        // La garantie fige une RÉVISION distincte de la base : avant le retrait,
        // le lien sert la révision ; après, la base — la bascule est observable.
        $revised = self::jourDocument();
        $revised['date'] = '2026-01-06';
        $revision = $this->as_($cartographe, 'POST', '/api/cartographies/' . $this->cartoId . '/revisions', [
            'document' => $revised,
            'note' => 'Correction de la date',
        ]);
        self::assertSame(201, $revision->getStatusCode(), (string) $revision->getBody());
        $revisionId = (int) self::json($revision)['revisionId'];
        self::assertSame(201, $this->as_($cartographe, 'POST', '/api/cartographies/' . $this->cartoId . '/garantie', [
            'revisionId' => $revisionId,
        ])->getStatusCode());
        $share = $this->shareLink();

        $before = self::json($this->employeurConsulte($share['token'], self::LINK_PASSWORD));
        self::assertSame('Camille', $before['garantie']['par']);
        self::assertSame($revisionId, $before['garantie']['revisionId']);
        self::assertSame('2026-01-06', $before['document']['date'], 'révision signée servie tant que la garantie tient');

        self::assertSame(204, $this->as_($cartographe, 'DELETE', '/api/cartographies/' . $this->cartoId . '/garantie')->getStatusCode());
        $after = self::json($this->employeurConsulte($share['token'], self::LINK_PASSWORD));
        self::assertNull($after['garantie']);
        self::assertSame('2026-01-05', $after['document']['date'], 'plus de garantie : la base est de nouveau servie');
        // Colonne JSON MySQL : l'ordre des clés n'est pas conservé.
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

    #[TestDox('UC-EMP-01-F06 — E2 : mot de passe absent, vide, non textuel ou > 1024 octets → 422, avant toute recherche du jeton')]
    public function testF06MissingPasswordIsRejected(): void
    {
        $share = $this->shareLink();

        self::assertSame(422, $this->employeurConsulte($share['token'], null)->getStatusCode());
        self::assertSame(422, $this->employeurConsulte($share['token'], '')->getStatusCode());
        self::assertSame(422, $this->employeurConsulte($share['token'], 12345678)->getStatusCode(), 'non textuel');
        self::assertSame(422, $this->employeurConsulte($share['token'], str_repeat('a', 1025))->getStatusCode(), '> 1024 octets');
        // Le contrôle du corps précède la recherche : même un jeton inconnu répond 422.
        $unknown = $this->employeurConsulte(str_repeat('ab', 16), null);
        self::assertSame(422, $unknown->getStatusCode());
        self::assertSame(['error' => 'Mot de passe requis'], self::json($unknown));
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

    #[TestDox('UC-EMP-01-F08 — E4 : plus de 20 essais par heure depuis une IP → 429 + Retry-After 30 s puis 60 s, même avec le bon mot de passe')]
    public function testF08RateLimitPerIp(): void
    {
        self::awaitFreshRateWindow();
        $share = $this->shareLink();
        for ($i = 1; $i <= 20; $i++) {
            self::assertSame(403, $this->employeurConsulte($share['token'], 'essai-' . $i, '192.0.2.50')->getStatusCode());
        }

        $blocked = $this->employeurConsulte($share['token'], self::LINK_PASSWORD, '192.0.2.50');
        self::assertSame(429, $blocked->getStatusCode());
        self::assertSame(['error' => 'Trop de tentatives, réessayez plus tard'], self::json($blocked));
        self::assertSame('30', $blocked->getHeaderLine('Retry-After'), 'premier blocage : 30 s');
        self::assertSame('60', $this->employeurConsulte($share['token'], self::LINK_PASSWORD, '192.0.2.50')->getHeaderLine('Retry-After'), 'doublé à l’essai suivant');

        // Une autre IP n'est pas pénalisée.
        self::assertSame(200, $this->employeurConsulte($share['token'], self::LINK_PASSWORD, '192.0.2.51')->getStatusCode());
    }

    #[TestDox('UC-EMP-01-F09 — A3 : un navigateur connecté (autre compte, avec X-CSRF-Token) reçoit le même corps qu’un anonyme ; audit sans user_id')]
    public function testF09LoggedInBrowserConsultsLikeAnonymous(): void
    {
        $share = $this->shareLink();
        $anonyme = self::json($this->employeurConsulte($share['token'], self::LINK_PASSWORD));
        $autre = $this->registerAs('recruteur@example.org', 'Recruteur', ['apprenant']);

        // Le navigateur porte un cookie de session : le middleware CSRF global
        // exige l'en-tête X-CSRF-Token (sans lui : F21). as_() l'envoie, comme
        // le front qui le tient de GET api/auth/me au démarrage du shell (F23).
        $response = $this->as_($autre, 'POST', '/api/share/' . $share['token'], ['password' => self::LINK_PASSWORD]);

        self::assertSame(200, $response->getStatusCode());
        self::assertEquals($anonyme, self::json($response), 'la session ne confère rien sur cette route');

        // La route n'utilise pas la session : les deux consultations sont
        // journalisées sans user_id, avec les mêmes identifiants.
        $audits = self::$pdo->query(
            "SELECT user_id, details FROM audit_events WHERE type = 'share_consulted' ORDER BY id"
        )->fetchAll();
        self::assertCount(2, $audits);
        foreach ($audits as $audit) {
            self::assertNull($audit['user_id']);
            self::assertEquals(
                ['cartographieId' => $this->cartoId, 'shareLinkId' => $share['shareId']],
                json_decode((string) $audit['details'], true),
            );
        }
    }

    #[TestDox('UC-EMP-01-F17 — RG3 : jetons inconnus (404) et requêtes invalides (422) consomment le même quota que la force brute')]
    public function testF17UnknownTokensAndInvalidRequestsBurnTheSameBudget(): void
    {
        self::awaitFreshRateWindow();
        $share = $this->shareLink();

        // Énumération de jetons : 20 jetons bien formés mais inconnus.
        for ($i = 0; $i < 20; $i++) {
            $unknown = str_pad(dechex($i), 32, 'c', STR_PAD_LEFT);
            self::assertSame(404, $this->employeurConsulte($unknown, self::LINK_PASSWORD, '192.0.2.60')->getStatusCode());
        }
        $blocked = $this->employeurConsulte($share['token'], self::LINK_PASSWORD, '192.0.2.60');
        self::assertSame(429, $blocked->getStatusCode(), 'le bon lien et le bon mot de passe sont refusés : budget épuisé');
        self::assertSame('30', $blocked->getHeaderLine('Retry-After'));

        // Variante : 20 requêtes sans mot de passe — comptées avant la validation du corps.
        for ($i = 0; $i < 20; $i++) {
            self::assertSame(422, $this->employeurConsulte($share['token'], null, '192.0.2.61')->getStatusCode());
        }
        self::assertSame(429, $this->employeurConsulte($share['token'], self::LINK_PASSWORD, '192.0.2.61')->getStatusCode());

        // Contre-épreuve : une IP neuve consulte normalement.
        self::assertSame(200, $this->employeurConsulte($share['token'], self::LINK_PASSWORD, '192.0.2.62')->getStatusCode());
    }

    #[TestDox('UC-EMP-01-F18 — E3 : le 404 est précédé d’une vérification factice du mot de passe (Users::dummyHash), pas le 403')]
    public function testF18NotFoundRunsTheDummyPasswordVerification(): void
    {
        $share = $this->shareLink();
        $revoked = $this->shareLink();
        self::assertSame(204, $this->as_($this->apprenant, 'DELETE', '/api/shares/' . $revoked['shareId'])->getStatusCode());

        // Users::dummyHash() mémorise paresseusement son hash : une valeur non
        // nulle après la requête prouve que la route l'a calculé et vérifié.
        $memo = new ReflectionProperty(Users::class, 'dummyHash');

        // Contre-épreuve : un lien vivant (403 comme 200) n'y touche pas.
        $memo->setValue(null, null);
        self::assertSame(403, $this->employeurConsulte($share['token'], 'pas-le-bon-mdp')->getStatusCode());
        self::assertSame(200, $this->employeurConsulte($share['token'], self::LINK_PASSWORD)->getStatusCode());
        self::assertNull($memo->getValue(), 'lien vivant : vérification réelle, pas factice');

        foreach ([
            'inconnu' => str_repeat('ab', 16),
            'malforme' => 'pas-un-jeton-hex',
            'revoque' => $revoked['token'],
        ] as $case => $token) {
            $memo->setValue(null, null);
            self::assertSame(404, $this->employeurConsulte($token, self::LINK_PASSWORD)->getStatusCode(), $case);
            self::assertNotNull($memo->getValue(), $case . ' : vérification factice exécutée');
        }
    }

    #[TestDox('UC-EMP-01-F19 — E4 : les IPv6 d’un même /64 partagent le quota ; le seau est haché, sans IP en clair')]
    public function testF19Ipv6SameSlash64SharesTheBudgetAndBucketIsHashed(): void
    {
        self::awaitFreshRateWindow();
        $share = $this->shareLink();

        for ($i = 1; $i <= 20; $i++) {
            self::assertSame(403, $this->employeurConsulte($share['token'], 'essai-' . $i, '2001:db8:1:2::1')->getStatusCode());
        }
        // Rotation de l'identifiant d'interface dans le même /64 : toujours bloqué.
        self::assertSame(429, $this->employeurConsulte($share['token'], self::LINK_PASSWORD, '2001:db8:1:2:ffff:ffff:ffff:ffff')->getStatusCode());
        // Un autre /64 n'est pas pénalisé.
        self::assertSame(200, $this->employeurConsulte($share['token'], self::LINK_PASSWORD, '2001:db8:1:3::1')->getStatusCode());

        $buckets = self::shareBuckets();
        self::assertContains('share:' . hash('sha256', 'v6:20010db800010002::/64'), $buckets);
        self::assertContains('share:' . hash('sha256', 'v6:20010db800010003::/64'), $buckets);
        self::assertCount(2, $buckets, 'un seau par /64, pas par adresse');
        foreach ($buckets as $bucket) {
            self::assertMatchesRegularExpression('/^share:[0-9a-f]{64}$/', $bucket);
            self::assertStringNotContainsString('2001', $bucket);
            self::assertStringNotContainsString('db8', $bucket);
        }

        // AN3 (comportement ACTUEL figé) : pour une IPv4, le seau est le sha256
        // NON SALÉ de l'adresse complète — pseudonyme, réversible par énumération.
        $this->employeurConsulte($share['token'], self::LINK_PASSWORD, '198.51.100.7');
        self::assertContains('share:' . hash('sha256', 'v4:198.51.100.7'), self::shareBuckets());
    }

    #[TestDox('UC-EMP-01-F20 — AN1 (API) : une analyse Twin9 partagée est servie telle quelle, type « twin9 », sans tableau poles')]
    public function testF20Twin9CartographyIsServedAsIs(): void
    {
        $twin9Id = $this->createCarto($this->apprenant, [
            'type' => 'twin9',
            'titre' => 'Analyse Twin9',
            'visibility' => 'publique',
            'document' => self::twin9Document(),
        ]);
        $share = $this->shareLink(90, $twin9Id);

        $response = $this->employeurConsulte($share['token'], self::LINK_PASSWORD);

        self::assertSame(200, $response->getStatusCode());
        $body = self::json($response);
        self::assertSame('twin9', $body['type']);
        self::assertSame('Analyse Twin9', $body['titre']);
        self::assertEquals(self::twin9Document(), $body['document']);
        // Ce carto_evolutive natif n'a pas la forme « journée » ({poles: [...]}) :
        // l'IHM le passe pourtant à DayView (AN1, figé côté IHM par F16).
        self::assertArrayNotHasKey('poles', $body['document']);
        self::assertSame('2026-03-10', $body['document']['date']);
    }

    #[TestDox('UC-EMP-01-F21 — A3 : cookie de session sans en-tête X-CSRF-Token → 403 CSRF, ni audit ni essai compté')]
    public function testF21SessionCookieWithoutCsrfHeaderIsRejectedByTheGlobalMiddleware(): void
    {
        $share = $this->shareLink();
        $autre = $this->registerAs('recruteur@example.org', 'Recruteur', ['apprenant']);

        $this->cookieSid = $autre['sid'];
        $this->clientIp = '198.51.100.8';
        $response = $this->request('POST', '/api/share/' . $share['token'], ['password' => self::LINK_PASSWORD]);

        self::assertSame(403, $response->getStatusCode());
        self::assertSame(self::CSRF_ERROR, self::json($response));
        self::assertNull(self::lastAudit('share_consulted'));
        self::assertSame([], self::shareBuckets(), 'le middleware répond avant la route : aucun essai compté');
    }

    #[TestDox('UC-EMP-01-F22 — AN2 (API) : cookie de session périmé + bon mot de passe → 403 CSRF (comportement actuel)')]
    public function testF22StaleSessionCookieGetsACsrf403EvenWithTheRightPassword(): void
    {
        $share = $this->shareLink();

        // Navigateur de l'employeur : un vieux cookie humanome_sid que le
        // serveur ne connaît plus (session supprimée par le GC).
        $this->cookieSid = 'stale' . bin2hex(random_bytes(12));
        $this->clientIp = '198.51.100.9';

        // Démarrage du shell : GET api/auth/me → 401, sans csrfToken.
        $me = $this->request('GET', '/api/auth/me');
        self::assertSame(401, $me->getStatusCode());
        self::assertArrayNotHasKey('csrfToken', self::json($me));
        self::assertNotNull($this->cookieSid, 'le navigateur garde un cookie de session');

        // Le POST part avec le cookie mais sans en-tête : le middleware CSRF
        // répond 403 — que l'IHM affiche « Mot de passe incorrect. » (F24).
        $response = $this->request('POST', '/api/share/' . $share['token'], ['password' => self::LINK_PASSWORD]);
        self::assertSame(403, $response->getStatusCode());
        self::assertSame(self::CSRF_ERROR, self::json($response));
        self::assertNull(self::lastAudit('share_consulted'));
    }

    #[TestDox('UC-EMP-01-F25 — E5 : base non configurée → 503 « Service indisponible », rien n’est révélé')]
    public function testF25UnconfiguredDatabaseAnswers503(): void
    {
        $share = $this->shareLink();

        $host = Env::get('DB_HOST');
        TestDb::setEnv('DB_HOST', '');
        try {
            $response = $this->employeurConsulte($share['token'], self::LINK_PASSWORD);
        } finally {
            TestDb::setEnv('DB_HOST', $host);
            Db::reset();
        }

        self::assertSame(503, $response->getStatusCode());
        self::assertSame(['error' => 'Service indisponible'], self::json($response));
        self::assertNull(self::lastAudit('share_consulted'));
        // La base revient : le même lien est de nouveau consultable.
        self::assertSame(200, $this->employeurConsulte($share['token'], self::LINK_PASSWORD)->getStatusCode());
    }
}
