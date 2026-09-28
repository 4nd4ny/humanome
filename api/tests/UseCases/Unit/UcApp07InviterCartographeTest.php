<?php

declare(strict_types=1);

namespace Humanome\Tests\UseCases\Unit;

use Humanome\Auth\Users;
use Humanome\Cartographe\Invitations;
use Humanome\MigrationRunner;
use Humanome\Tests\TestDb;
use PDO;
use PHPUnit\Framework\Attributes\TestDox;
use PHPUnit\Framework\TestCase;

/**
 * UC-APP-07 — Inviter un cartographe (émission et suivi des codes) : tests
 * UNITAIRES.
 *
 * Fiche : docs/cas-utilisation/apprenant/UC-APP-07-inviter-cartographe.md
 *
 * La classe sollicitée par POST/GET /api/cartographe/invitations est appelée
 * directement : Invitations (format du code, validité de 30 jours, plafond
 * des codes en attente, statuts calculés). L'acceptation par le cartographe
 * (Invitations::accept) relève de UC-CAR-01 ; elle n'est utilisée ici que
 * pour préparer le statut « acceptee ».
 */
final class UcApp07InviterCartographeTest extends TestCase
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
    }

    private static function user(string $name): int
    {
        self::$pdo->prepare('INSERT INTO users (email, password_hash, display_name) VALUES (?, ?, ?)')
            ->execute([uniqid('u', true) . '@example.org', Users::hashPassword('x-password'), $name]);

        return (int) self::$pdo->lastInsertId();
    }

    private static function invitations(): Invitations
    {
        return new Invitations(self::$pdo);
    }

    #[TestDox('UC-APP-07-U01 — isWellFormedCode : exactement 10 caractères A-Z et 2-9 (ni 0, ni 1, ni minuscule)')]
    public function testU01IsWellFormedCode(): void
    {
        self::assertTrue(Invitations::isWellFormedCode('K7TQZ2M9RC'));
        self::assertTrue(Invitations::isWellFormedCode('OIOIOIOIOI'), 'les lettres O et I font partie de A-Z');
        foreach (['k7tqz2m9rc', 'K7TQZ2M9R0', 'K7TQZ2M9R1', 'K7TQZ2M9R', 'K7TQZ2M9RCX', 'K7TQ Z2M9R', ''] as $bad) {
            self::assertFalse(Invitations::isWellFormedCode($bad), $bad);
        }
    }

    #[TestDox('UC-APP-07-U02 — create : code bien formé, unique, valable 30 jours, rattaché à l’apprenant')]
    public function testU02CreateMintsA30DayCode(): void
    {
        $maya = self::user('Maya');

        $codes = [];
        for ($i = 0; $i < 12; $i++) {
            $created = self::invitations()->create($maya);
            self::assertSame(['code', 'expiresAt'], array_keys($created));
            self::assertTrue(Invitations::isWellFormedCode($created['code']), $created['code']);
            self::assertMatchesRegularExpression('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/', $created['expiresAt']);
            $codes[] = $created['code'];
        }
        self::assertCount(12, array_unique($codes));

        $rows = self::$pdo->query(
            'SELECT apprenant_id, DATEDIFF(expires_at, created_at) AS days, accepted_at, accepted_by
               FROM cartographe_invitations'
        )->fetchAll();
        foreach ($rows as $row) {
            self::assertSame($maya, (int) $row['apprenant_id']);
            self::assertSame(30, (int) $row['days']);
            self::assertNull($row['accepted_at']);
            self::assertNull($row['accepted_by']);
        }
    }

    #[TestDox('UC-APP-07-U03 — countPending : ni les codes acceptés, ni les expirés, ni ceux d’un autre apprenant')]
    public function testU03CountPendingCountsOnlyLiveUnacceptedOwnCodes(): void
    {
        $maya = self::user('Maya');
        $noe = self::user('Noé');
        $camille = self::user('Camille');
        $accepted = self::invitations()->create($maya)['code'];
        $expired = self::invitations()->create($maya)['code'];
        self::invitations()->create($maya);
        self::invitations()->create($noe);

        self::assertSame(3, self::invitations()->countPending($maya));
        self::invitations()->accept($accepted, $camille);
        self::$pdo->prepare('UPDATE cartographe_invitations SET expires_at = NOW() - INTERVAL 1 SECOND WHERE code = ?')
            ->execute([$expired]);

        self::assertSame(1, self::invitations()->countPending($maya));
        self::assertSame(1, self::invitations()->countPending($noe));
        self::assertSame(10, Invitations::MAX_PENDING, 'plafond anti-inondation');
    }

    #[TestDox('UC-APP-07-U04 — listForApprenant : statuts en_attente / acceptee / expiree, plus récent d’abord, nom du cartographe')]
    public function testU04ListForApprenantComputesStatuses(): void
    {
        $maya = self::user('Maya');
        $noe = self::user('Noé');
        $camille = self::user('Camille');
        $first = self::invitations()->create($maya)['code'];
        $second = self::invitations()->create($maya)['code'];
        $third = self::invitations()->create($maya)['code'];
        self::invitations()->create($noe);
        self::invitations()->accept($first, $camille);
        self::$pdo->prepare('UPDATE cartographe_invitations SET expires_at = NOW() - INTERVAL 1 SECOND WHERE code = ?')
            ->execute([$second]);

        $list = self::invitations()->listForApprenant($maya);

        self::assertSame([$third, $second, $first], array_column($list, 'code'), 'ORDER BY id DESC, codes de Noé exclus');
        self::assertSame(['en_attente', 'expiree', 'acceptee'], array_column($list, 'statut'));
        foreach ($list as $item) {
            self::assertSame(['code', 'statut', 'createdAt', 'expiresAt', 'acceptedAt', 'acceptedBy'], array_keys($item));
        }
        self::assertSame('Camille', $list[2]['acceptedBy']);
        self::assertNotNull($list[2]['acceptedAt']);
        self::assertNull($list[0]['acceptedBy']);
        self::assertNull($list[1]['acceptedAt']);
    }

    #[TestDox('UC-APP-07-U05 — un code accepté puis expiré reste « acceptee » ; cartographe purgé → acceptedBy anonymisé')]
    public function testU05AcceptedStatusWinsOverExpiryAndSurvivesCartographePurge(): void
    {
        $maya = self::user('Maya');
        $camille = self::user('Camille');
        $code = self::invitations()->create($maya)['code'];
        self::invitations()->accept($code, $camille);
        self::$pdo->exec('UPDATE cartographe_invitations SET expires_at = NOW() - INTERVAL 1 DAY');

        self::assertSame('acceptee', self::invitations()->listForApprenant($maya)[0]['statut']);

        self::$pdo->exec('DELETE FROM users WHERE id = ' . $camille);
        $item = self::invitations()->listForApprenant($maya)[0];
        self::assertSame('acceptee', $item['statut']);
        self::assertNull($item['acceptedBy'], 'accepted_by SET NULL (migration 008)');
    }
}
