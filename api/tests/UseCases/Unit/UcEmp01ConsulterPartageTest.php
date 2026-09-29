<?php

declare(strict_types=1);

namespace Humanome\Tests\UseCases\Unit;

use Humanome\Auth\Audit;
use Humanome\Auth\RateLimiter;
use Humanome\Auth\Users;
use Humanome\Cartographe\Garanties;
use Humanome\ClientIp;
use Humanome\MigrationRunner;
use Humanome\Share\ShareLinks;
use Humanome\Tests\TestDb;
use PDO;
use PHPUnit\Framework\Attributes\TestDox;
use PHPUnit\Framework\TestCase;

/**
 * UC-EMP-01 — Consulter une cartographie partagée : tests UNITAIRES.
 *
 * Fiche : docs/cas-utilisation/employeur/UC-EMP-01-consulter-cartographie-partagee.md
 *
 * Les classes sollicitées par la route publique POST /api/share/{token} sont
 * appelées directement (sans couche HTTP) : ShareLinks (recherche par jeton
 * haché, état consultable), Garanties::forShareLink (document garanti servi),
 * RateLimiter (fenêtre fixe + délai progressif), ClientIp (seau anti-rotation
 * IPv6), Users::dummyHash (vérification factice anti-chronométrage) et
 * Audit::record (journal share_consulted sans compte).
 */
final class UcEmp01ConsulterPartageTest extends TestCase
{
    private static PDO $pdo;

    public static function setUpBeforeClass(): void
    {
        self::$pdo = TestDb::fresh();
        (new MigrationRunner(self::$pdo, MigrationRunner::defaultMigrationsDir()))->run();
    }

    protected function setUp(): void
    {
        self::$pdo->exec('DELETE FROM users');
        self::$pdo->exec('DELETE FROM rate_limits');
        self::$pdo->exec('DELETE FROM audit_events');
    }

    /** Apprenant + cartographie stockée (opt-in) ; renvoie [userId, cartoId]. */
    private static function seedCartography(string $titre = 'Ma carto', string $type = 'merge'): array
    {
        self::$pdo->prepare('INSERT INTO users (email, password_hash, display_name) VALUES (?, ?, ?)')
            ->execute([uniqid('u', true) . '@example.org', Users::hashPassword('x-password'), 'Maya']);
        $userId = (int) self::$pdo->lastInsertId();
        self::$pdo->prepare(
            'INSERT INTO cartographies (user_id, type, titre, visibility, document, opt_in_at)
             VALUES (?, ?, ?, ?, ?, NOW())'
        )->execute([$userId, $type, $titre, 'publique', json_encode(['kind' => 'cartographie-' . $type, 'v' => 'base'])]);

        return [$userId, (int) self::$pdo->lastInsertId()];
    }

    #[TestDox('UC-EMP-01-U01 — le jeton clair n’est jamais stocké : la recherche passe par son sha256 ; mot de passe en Argon2id (RG1, RG2)')]
    public function testU01FindByTokenLooksUpTheSha256OfTheClearToken(): void
    {
        [, $cartoId] = self::seedCartography('Feuille');
        $links = new ShareLinks(self::$pdo);
        ['shareId' => $shareId, 'token' => $token] = $links->create($cartoId, 'sesame-employeur', 30);

        self::assertMatchesRegularExpression('/^[0-9a-f]{32}$/', $token);
        $stored = self::$pdo->query('SELECT token_hash FROM share_links WHERE id = ' . $shareId)->fetchColumn();
        self::assertSame(hash('sha256', $token), $stored);

        $row = $links->findByToken($token);
        self::assertNotNull($row);
        self::assertSame('Feuille', $row['titre']);
        self::assertSame('merge', $row['type']);
        self::assertTrue(password_verify('sesame-employeur', (string) $row['password_hash']));
        // RG2 : l'algorithme est bien Argon2id (une régression vers bcrypt
        // vérifierait encore le mot de passe, mais échouerait ici).
        self::assertSame('argon2id', password_get_info((string) $row['password_hash'])['algoName']);
    }

    #[TestDox('UC-EMP-01-U02 — un jeton inconnu (ou le hash lui-même) ne trouve rien')]
    public function testU02UnknownTokenOrStoredHashFindsNothing(): void
    {
        [, $cartoId] = self::seedCartography();
        $links = new ShareLinks(self::$pdo);
        ['token' => $token] = $links->create($cartoId, 'sesame-employeur', 30);

        self::assertNull($links->findByToken(str_repeat('0', 32)));
        // Qui aurait lu la base (token_hash) ne peut pas s'en servir comme jeton.
        self::assertNull($links->findByToken(hash('sha256', $token)));
    }

    #[TestDox('UC-EMP-01-U03 — isConsultable : vivant oui, révoqué non, expiré non (E3)')]
    public function testU03IsConsultableCoversLiveRevokedAndExpired(): void
    {
        [$userId, $cartoId] = self::seedCartography();
        $links = new ShareLinks(self::$pdo);

        ['token' => $live] = $links->create($cartoId, 'sesame-employeur', 30);
        self::assertTrue(ShareLinks::isConsultable($links->findByToken($live)));

        ['shareId' => $revokedId, 'token' => $revoked] = $links->create($cartoId, 'sesame-employeur', 30);
        self::assertNotNull($links->revokeForUser($revokedId, $userId));
        $row = $links->findByToken($revoked);
        self::assertNotNull($row, 'la ligne révoquée reste trouvable (fait daté auditable)');
        self::assertFalse(ShareLinks::isConsultable($row));

        ['shareId' => $expiredId, 'token' => $expired] = $links->create($cartoId, 'sesame-employeur', 30);
        self::$pdo->exec('UPDATE share_links SET expires_at = NOW() - INTERVAL 1 MINUTE WHERE id = ' . $expiredId);
        self::assertFalse(ShareLinks::isConsultable($links->findByToken($expired)));
    }

    #[TestDox('UC-EMP-01-U04 — sans garantie, forShareLink renvoie null (document de base servi)')]
    public function testU04ForShareLinkIsNullWithoutGarantie(): void
    {
        [, $cartoId] = self::seedCartography();
        ['shareId' => $shareId] = (new ShareLinks(self::$pdo))->create($cartoId, 'sesame-employeur', 30);

        self::assertNull((new Garanties(self::$pdo))->forShareLink($shareId));
    }

    #[TestDox('UC-EMP-01-U05 — garantie figée sur une révision : forShareLink renvoie CE document')]
    public function testU05ForShareLinkReturnsThePinnedRevisionDocument(): void
    {
        [, $cartoId] = self::seedCartography();
        self::$pdo->prepare('INSERT INTO users (email, password_hash, display_name) VALUES (?, ?, ?)')
            ->execute(['carto@example.org', Users::hashPassword('x-password'), 'Camille']);
        $cartographeId = (int) self::$pdo->lastInsertId();
        self::$pdo->prepare(
            'INSERT INTO cartography_revisions (cartographie_id, author_id, document) VALUES (?, ?, ?)'
        )->execute([$cartoId, $cartographeId, json_encode(['kind' => 'cartographie-merge', 'v' => 'revisee'])]);
        $revisionId = (int) self::$pdo->lastInsertId();

        (new Garanties(self::$pdo))->pose($cartoId, $cartographeId, 'Camille', $revisionId);
        ['shareId' => $shareId] = (new ShareLinks(self::$pdo))->create($cartoId, 'sesame-employeur', 30);

        $garanti = (new Garanties(self::$pdo))->forShareLink($shareId);
        self::assertNotNull($garanti);
        self::assertSame('Camille', $garanti['garantie']['par']);
        self::assertSame($revisionId, $garanti['garantie']['revisionId']);
        self::assertMatchesRegularExpression('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/', $garanti['garantie']['date']);
        // Colonne JSON MySQL : l'ordre des clés n'est pas conservé.
        self::assertEquals(['kind' => 'cartographie-merge', 'v' => 'revisee'], $garanti['revisionDocument']);
    }

    #[TestDox('UC-EMP-01-U06 — garantie sur le document de base : revisionDocument null')]
    public function testU06GarantieOnBaseDocumentHasNoRevisionDocument(): void
    {
        [, $cartoId] = self::seedCartography();
        self::$pdo->prepare('INSERT INTO users (email, password_hash, display_name) VALUES (?, ?, ?)')
            ->execute(['carto2@example.org', Users::hashPassword('x-password'), 'Noé']);
        $cartographeId = (int) self::$pdo->lastInsertId();
        (new Garanties(self::$pdo))->pose($cartoId, $cartographeId, 'Noé', null);
        ['shareId' => $shareId] = (new ShareLinks(self::$pdo))->create($cartoId, 'sesame-employeur', 30);

        $garanti = (new Garanties(self::$pdo))->forShareLink($shareId);
        self::assertNotNull($garanti);
        self::assertNull($garanti['garantie']['revisionId']);
        self::assertNull($garanti['revisionDocument']);
    }

    #[TestDox('UC-EMP-01-U07 — RateLimiter : 20 essais passent, le 21e dépasse, délai progressif borné')]
    public function testU07RateLimiterFixedWindowAndProgressiveBackoff(): void
    {
        $limiter = new RateLimiter(self::$pdo, 20, 3600);
        $now = 1_800_000_000;
        for ($i = 1; $i <= 20; $i++) {
            self::assertSame($i, $limiter->hit('share:test', $now));
        }
        self::assertTrue($limiter->isBlocked('share:test', $now));
        self::assertSame(21, $limiter->hit('share:test', $now));

        self::assertSame(30, $limiter->retryAfter(21));
        self::assertSame(60, $limiter->retryAfter(22));
        self::assertSame(3600, $limiter->retryAfter(500), 'plafonné à la fenêtre');

        // Fenêtre suivante : compteur remis à zéro.
        self::assertSame(1, $limiter->hit('share:test', $now + 3600));
    }

    #[TestDox('UC-EMP-01-U08 — ClientIp : une IPv6 est regroupée par /64, une IPv4 mappée redevient IPv4')]
    public function testU08BucketIdentityCollapsesIpv6ToSlash64(): void
    {
        self::assertSame('v4:198.51.100.7', ClientIp::bucketIdentity('198.51.100.7'));
        self::assertSame('v4:198.51.100.7', ClientIp::bucketIdentity('::ffff:198.51.100.7'));
        self::assertSame(
            ClientIp::bucketIdentity('2001:db8:1:2::1'),
            ClientIp::bucketIdentity('2001:db8:1:2:ffff:ffff:ffff:ffff'),
            'rotation de l’identifiant d’interface = même seau',
        );
        self::assertNotSame(
            ClientIp::bucketIdentity('2001:db8:1:2::1'),
            ClientIp::bucketIdentity('2001:db8:1:3::1'),
        );
        self::assertSame('raw:', ClientIp::bucketIdentity(''));
    }

    #[TestDox('UC-EMP-01-U09 — dummyHash : Argon2id aux mêmes paramètres que les liens, ne vérifie aucun mot de passe')]
    public function testU09DummyHashNeverVerifies(): void
    {
        $hash = Users::dummyHash();
        // password_get_info() renvoie algo = null (et non false) pour une chaîne
        // quelconque : c'est algoName qui prouve un vrai hash Argon2id.
        self::assertSame('argon2id', password_get_info($hash)['algoName']);
        self::assertFalse(password_verify('sesame-employeur', $hash));
        self::assertFalse(password_verify('', $hash));

        // Égalisation des temps (E3) : la vérification factice coûte ce que coûte
        // celle d'un vrai lien — même algorithme, mêmes paramètres de coût.
        [, $cartoId] = self::seedCartography();
        ['shareId' => $shareId] = (new ShareLinks(self::$pdo))->create($cartoId, 'sesame-employeur', 30);
        $shareHash = (string) self::$pdo->query('SELECT password_hash FROM share_links WHERE id = ' . $shareId)->fetchColumn();
        self::assertSame(password_get_info($shareHash)['algoName'], password_get_info($hash)['algoName']);
        self::assertEquals(password_get_info($shareHash)['options'], password_get_info($hash)['options']);
    }

    #[TestDox('UC-EMP-01-U15 — Audit::record : share_consulted sans compte (user_id NULL), identifiants seulement')]
    public function testU15AuditRecordsAnonymousConsultationWithIdsOnly(): void
    {
        Audit::record(self::$pdo, null, 'share_consulted', ['cartographieId' => 12, 'shareLinkId' => 34]);

        $rows = self::$pdo->query("SELECT user_id, type, details FROM audit_events WHERE type = 'share_consulted'")->fetchAll();
        self::assertCount(1, $rows);
        self::assertNull($rows[0]['user_id'], 'l’employeur consultant n’a pas de compte');
        self::assertSame('share_consulted', $rows[0]['type']);
        // Colonne JSON MySQL : l'ordre des clés n'est pas conservé.
        self::assertEquals(
            ['cartographieId' => 12, 'shareLinkId' => 34],
            json_decode((string) $rows[0]['details'], true, 512, JSON_THROW_ON_ERROR),
        );
    }
}
