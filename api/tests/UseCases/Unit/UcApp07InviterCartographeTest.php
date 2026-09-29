<?php

declare(strict_types=1);

namespace Humanome\Tests\UseCases\Unit;

use Humanome\Auth\Users;
use Humanome\Cartographe\Invitations;
use Humanome\MigrationRunner;
use Humanome\Tests\TestDb;
use PDO;
use PDOException;
use PDOStatement;
use PHPUnit\Framework\Attributes\TestDox;
use PHPUnit\Framework\TestCase;

/**
 * UC-APP-07 — Inviter un cartographe (émission et suivi des codes) : tests
 * UNITAIRES.
 *
 * Fiche : docs/cas-utilisation/apprenant/UC-APP-07-inviter-cartographe.md
 *
 * La classe sollicitée par POST/GET /api/cartographe/invitations est appelée
 * directement : Invitations (générateur et alphabet du code, nouvel essai sur
 * collision — PDO simulé —, validité de 30 jours, plafond des codes en
 * attente, statuts calculés, effets des purges de comptes). isWellFormedCode
 * et accept relèvent de la route d'acceptation (UC-CAR-01) : ils ne servent
 * ici que d'oracle ou à préparer le statut « acceptee ».
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

    #[TestDox('UC-APP-07-U01 — isWellFormedCode (validateur de la route d’acceptation, UC-CAR-01) : exactement 10 caractères A-Z et 2-9 (ni 0, ni 1, ni minuscule)')]
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

    #[TestDox('UC-APP-07-U06 — générateur : alphabet exact A-Z2-9 (O et I compris, ni 0 ni 1), 10 caractères')]
    public function testU06GeneratorUsesTheExactAlphabet(): void
    {
        self::assertSame(
            'ABCDEFGHIJKLMNOPQRSTUVWXYZ23456789',
            (new \ReflectionClassConstant(Invitations::class, 'ALPHABET'))->getValue(),
        );
        self::assertSame(10, (new \ReflectionClassConstant(Invitations::class, 'CODE_LENGTH'))->getValue());
        self::assertSame(30, (new \ReflectionClassConstant(Invitations::class, 'VALIDITY_DAYS'))->getValue());

        // Le tirage lui-même : 2 000 codes (20 000 caractères) couvrent les 34
        // symboles, et eux seuls. Probabilité d'un faux échec : 34 × (33/34)^20000,
        // négligeable.
        $generator = new \ReflectionMethod(Invitations::class, 'randomCode');
        $codes = [];
        for ($i = 0; $i < 2000; $i++) {
            $codes[] = (string) $generator->invoke(null);
        }
        self::assertSame([10], array_values(array_unique(array_map('strlen', $codes))));
        self::assertSame('23456789ABCDEFGHIJKLMNOPQRSTUVWXYZ', count_chars(implode('', $codes), 3));
    }

    /**
     * PDO simulé : l'INSERT échoue selon `$failures` (une exception par
     * tentative, dans l'ordre), puis réussit ; le SELECT relit l'expiration.
     *
     * @param list<PDOException> $failures
     * @param list<string> $attempted codes tentés, dans l'ordre
     */
    private function collidingPdo(array $failures, array &$attempted): PDO
    {
        $insert = $this->createMock(PDOStatement::class);
        $insert->method('execute')->willReturnCallback(static function (?array $params = null) use (&$failures, &$attempted): bool {
            $attempted[] = (string) $params[1];
            $failure = array_shift($failures);
            if ($failure !== null) {
                throw $failure;
            }

            return true;
        });
        $select = $this->createMock(PDOStatement::class);
        $select->method('execute')->willReturn(true);
        $select->method('fetchColumn')->willReturn('2026-10-29 10:00:00');
        $pdo = $this->createMock(PDO::class);
        $pdo->method('prepare')->willReturnCallback(
            static fn (string $sql): PDOStatement => str_contains($sql, 'INSERT') ? $insert : $select,
        );

        return $pdo;
    }

    private static function sqlError(int $code): PDOException
    {
        $e = new PDOException('SQLSTATE[23000]: erreur ' . $code);
        $e->errorInfo = ['23000', $code, 'erreur ' . $code];

        return $e;
    }

    #[TestDox('UC-APP-07-U07 — create : collision sur la clé unique (1062) → nouveau tirage, le code retenu est celui inséré')]
    public function testU07CreateRetriesOnDuplicateKey(): void
    {
        $attempted = [];
        $pdo = $this->collidingPdo([self::sqlError(1062)], $attempted);

        $created = (new Invitations($pdo))->create(7);

        self::assertCount(2, $attempted, 'une collision, puis un second tirage');
        self::assertSame($attempted[1], $created['code']);
        self::assertSame('2026-10-29T10:00:00', $created['expiresAt']);
        foreach ($attempted as $code) {
            self::assertMatchesRegularExpression('/^[A-Z2-9]{10}$/', $code);
        }
    }

    #[TestDox('UC-APP-07-U08 — create : abandon après 4 collisions ; toute autre erreur SQL remonte dès la première tentative (→ 500 côté route)')]
    public function testU08CreateGivesUpAfterFourCollisionsOrOnOtherErrors(): void
    {
        $attempted = [];
        $pdo = $this->collidingPdo(array_map(static fn (): PDOException => self::sqlError(1062), range(1, 5)), $attempted);
        try {
            (new Invitations($pdo))->create(7);
            self::fail('4 collisions : l’exception doit remonter');
        } catch (PDOException $e) {
            self::assertSame(1062, $e->errorInfo[1]);
        }
        self::assertCount(4, $attempted, 'tentatives 0 à 3, puis abandon');

        $attempted = [];
        $pdo = $this->collidingPdo([self::sqlError(1452)], $attempted);
        try {
            (new Invitations($pdo))->create(7);
            self::fail('erreur non 1062 : l’exception doit remonter');
        } catch (PDOException $e) {
            self::assertSame(1452, $e->errorInfo[1]);
        }
        self::assertCount(1, $attempted, 'aucun nouvel essai hors collision');
    }

    #[TestDox('UC-APP-07-U09 — purge du compte apprenant → ses codes et ses rattachements disparaissent (CASCADE)')]
    public function testU09LearnerPurgeCascadesToCodesAndLinks(): void
    {
        $maya = self::user('Maya');
        $noe = self::user('Noé');
        $camille = self::user('Camille');
        $accepted = self::invitations()->create($maya)['code'];
        self::invitations()->create($maya);
        self::invitations()->create($noe);
        self::invitations()->accept($accepted, $camille);

        self::$pdo->exec('DELETE FROM users WHERE id = ' . $maya);

        self::assertSame(0, (int) self::$pdo->query('SELECT COUNT(*) FROM cartographe_invitations WHERE apprenant_id = ' . $maya)->fetchColumn());
        self::assertSame(1, (int) self::$pdo->query('SELECT COUNT(*) FROM cartographe_invitations')->fetchColumn(), 'le code de Noé reste');
        self::assertSame(0, (int) self::$pdo->query('SELECT COUNT(*) FROM cartographe_links')->fetchColumn());
        self::assertSame([], self::invitations()->listForApprenant($maya));
    }
}
