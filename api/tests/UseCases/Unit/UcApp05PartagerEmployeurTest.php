<?php

declare(strict_types=1);

namespace Humanome\Tests\UseCases\Unit;

use Humanome\Auth\Audit;
use Humanome\Auth\Users;
use Humanome\Cartographies\CartographyRepository;
use Humanome\MigrationRunner;
use Humanome\Share\ShareLinks;
use Humanome\Tests\TestDb;
use PDO;
use PHPUnit\Framework\Attributes\TestDox;
use PHPUnit\Framework\TestCase;

/**
 * UC-APP-05 — Partager une cartographie avec un employeur (côté apprenant) :
 * tests UNITAIRES.
 *
 * Fiche : docs/cas-utilisation/apprenant/UC-APP-05-partager-avec-employeur.md
 *
 * Les classes sollicitées par POST /api/cartographies/{id}/share,
 * GET /api/cartographies/{id}/shares et DELETE /api/shares/{shareId} sont
 * appelées directement : ShareLinks (création hachée, liste sans jeton,
 * révocation datée et idempotente), CartographyRepository (garde de
 * propriété, compteur de liens actifs) et Audit (journal sans contenu).
 * La consultation par l'employeur est couverte par UC-EMP-01.
 */
final class UcApp05PartagerEmployeurTest extends TestCase
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
        self::$pdo->exec('DELETE FROM audit_events');
    }

    private static function user(string $name = 'Maya'): int
    {
        self::$pdo->prepare('INSERT INTO users (email, password_hash, display_name) VALUES (?, ?, ?)')
            ->execute([uniqid('u', true) . '@example.org', Users::hashPassword('x-password'), $name]);

        return (int) self::$pdo->lastInsertId();
    }

    private static function carto(int $userId): int
    {
        return (new CartographyRepository(self::$pdo))->create(
            $userId,
            'jour',
            'Journée du 5 janvier',
            'publique',
            ['kind' => 'cartographie-jour', 'date' => '2026-01-05'],
            null,
            null,
            null,
        );
    }

    #[TestDox('UC-APP-05-U01 — create : jeton clair de 32 hex rendu une fois, seuls sha256 et Argon2id sont stockés, expiration à N jours')]
    public function testU01CreateStoresHashesAndExpiry(): void
    {
        $cartoId = self::carto(self::user());

        ['shareId' => $shareId, 'token' => $token] = (new ShareLinks(self::$pdo))->create($cartoId, 'sesame-employeur', 30);

        self::assertMatchesRegularExpression('/^[0-9a-f]{32}$/', $token);
        $row = self::$pdo->query(
            'SELECT token_hash, password_hash, DATEDIFF(expires_at, created_at) AS days, revoked_at
               FROM share_links WHERE id = ' . $shareId
        )->fetch();
        self::assertSame(hash('sha256', $token), $row['token_hash']);
        self::assertStringNotContainsString($token, implode('|', array_map('strval', $row)));
        self::assertSame(PASSWORD_ARGON2ID, password_get_info((string) $row['password_hash'])['algo']);
        self::assertTrue(password_verify('sesame-employeur', (string) $row['password_hash']));
        self::assertSame(30, (int) $row['days']);
        self::assertNull($row['revoked_at']);
    }

    #[TestDox('UC-APP-05-U02 — create : chaque lien a son propre jeton, même mot de passe ou pas')]
    public function testU02EachLinkHasItsOwnToken(): void
    {
        $cartoId = self::carto(self::user());
        $links = new ShareLinks(self::$pdo);

        $a = $links->create($cartoId, 'sesame-employeur', 90);
        $b = $links->create($cartoId, 'sesame-employeur', 90);

        self::assertNotSame($a['token'], $b['token']);
        self::assertNotSame($a['shareId'], $b['shareId']);
        $hashes = self::$pdo->query('SELECT password_hash FROM share_links ORDER BY id')->fetchAll(PDO::FETCH_COLUMN);
        self::assertNotSame($hashes[0], $hashes[1], 'sel Argon2id distinct par lien');
    }

    #[TestDox('UC-APP-05-U03 — listForCartography : dates seulement (jamais jeton ni empreinte), dans l’ordre de création, révoqués et expirés compris')]
    public function testU03ListForCartographyExposesDatesOnly(): void
    {
        $userId = self::user();
        $cartoId = self::carto($userId);
        $links = new ShareLinks(self::$pdo);
        ['shareId' => $first] = $links->create($cartoId, 'sesame-employeur', 90);
        ['shareId' => $revoked] = $links->create($cartoId, 'sesame-employeur', 90);
        ['shareId' => $expired] = $links->create($cartoId, 'sesame-employeur', 1);
        $links->revokeForUser($revoked, $userId);
        self::$pdo->exec('UPDATE share_links SET expires_at = NOW() - INTERVAL 1 MINUTE WHERE id = ' . $expired);

        $list = $links->listForCartography($cartoId);

        self::assertSame([$first, $revoked, $expired], array_column($list, 'shareId'));
        foreach ($list as $link) {
            self::assertSame(['shareId', 'createdAt', 'expiresAt', 'revokedAt'], array_keys($link));
            self::assertMatchesRegularExpression('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/', $link['expiresAt']);
        }
        self::assertNull($list[0]['revokedAt']);
        self::assertNotNull($list[1]['revokedAt']);
        self::assertNull($list[2]['revokedAt'], 'un lien expiré n’est pas marqué révoqué');
        self::assertSame([], $links->listForCartography($cartoId + 1000));
    }

    #[TestDox('UC-APP-05-U04 — revokeForUser : date la révocation une seule fois (idempotent) ; lien d’autrui ou inconnu = null')]
    public function testU04RevokeForUserIsOwnerScopedAndIdempotent(): void
    {
        $maya = self::user();
        $intrus = self::user('Intrus');
        $cartoId = self::carto($maya);
        $links = new ShareLinks(self::$pdo);
        ['shareId' => $shareId] = $links->create($cartoId, 'sesame-employeur', 90);

        self::assertNull($links->revokeForUser($shareId, $intrus));
        self::assertNull(self::$pdo->query('SELECT revoked_at FROM share_links')->fetchColumn(), 'rien n’a bougé');
        self::assertNull($links->revokeForUser($shareId + 1000, $maya));

        self::assertSame(['shareId' => $shareId, 'cartographieId' => $cartoId], $links->revokeForUser($shareId, $maya));
        self::$pdo->exec("UPDATE share_links SET revoked_at = '2026-01-01 08:00:00'");
        self::assertSame(['shareId' => $shareId, 'cartographieId' => $cartoId], $links->revokeForUser($shareId, $maya));
        self::assertSame(
            '2026-01-01 08:00:00',
            self::$pdo->query('SELECT revoked_at FROM share_links')->fetchColumn(),
            'la première date de révocation est conservée',
        );
    }

    #[TestDox('UC-APP-05-U05 — garde de propriété et compteur « shares » : seuls les liens actifs (ni révoqués, ni expirés) du propriétaire comptent')]
    public function testU05OwnershipGuardAndActiveShareCounter(): void
    {
        $maya = self::user();
        $intrus = self::user('Intrus');
        $cartoId = self::carto($maya);
        $repo = new CartographyRepository(self::$pdo);
        $links = new ShareLinks(self::$pdo);

        self::assertTrue($repo->ownedBy($cartoId, $maya));
        self::assertFalse($repo->ownedBy($cartoId, $intrus), 'la route répond 404 avant toute création');

        ['shareId' => $a] = $links->create($cartoId, 'sesame-employeur', 90);
        $links->create($cartoId, 'sesame-employeur', 90);
        self::assertSame(2, $repo->listForUser($maya)[0]['shares']);
        $links->revokeForUser($a, $maya);
        self::assertSame(1, $repo->listForUser($maya)[0]['shares']);
        self::assertSame(1, $repo->findForUser($cartoId, $maya)['shares']);

        // Un lien expiré (ni révoqué) ne compte plus non plus.
        ['shareId' => $expired] = $links->create($cartoId, 'sesame-employeur', 90);
        self::assertSame(2, $repo->listForUser($maya)[0]['shares']);
        self::$pdo->exec('UPDATE share_links SET expires_at = NOW() - INTERVAL 1 MINUTE WHERE id = ' . $expired);
        self::assertSame(1, $repo->listForUser($maya)[0]['shares'], 'listForUser : expiré exclu');
        self::assertSame(1, $repo->findForUser($cartoId, $maya)['shares'], 'findForUser : expiré exclu');
    }

    #[TestDox('UC-APP-05-U06 — Audit::record : stocke les détails fournis tels quels (JSON), anonymisé à la purge du compte')]
    public function testU06AuditRecordsIdsOnlyAndIsAnonymizedOnPurge(): void
    {
        // Audit::record enregistre ce qu'on lui donne : la garantie « identifiants
        // seulement, jamais de jeton ni de mot de passe » est celle de la route,
        // vérifiée par UC-APP-05-F01.
        $maya = self::user();
        Audit::record(self::$pdo, $maya, 'share_created', ['cartographieId' => 3, 'shareId' => 9, 'expiresInDays' => 90]);

        $row = self::$pdo->query("SELECT user_id, details FROM audit_events WHERE type = 'share_created'")->fetch();
        self::assertSame($maya, (int) $row['user_id']);
        // Colonne JSON MySQL : ordre des clés non garanti.
        self::assertEquals(['cartographieId' => 3, 'shareId' => 9, 'expiresInDays' => 90], json_decode((string) $row['details'], true));

        self::$pdo->exec('DELETE FROM users WHERE id = ' . $maya);
        self::assertNull(
            self::$pdo->query("SELECT user_id FROM audit_events WHERE type = 'share_created'")->fetchColumn(),
            'FK SET NULL : la trace reste datée mais anonyme',
        );
    }
}
