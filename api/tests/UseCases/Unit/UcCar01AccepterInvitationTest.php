<?php

declare(strict_types=1);

namespace Humanome\Tests\UseCases\Unit;

use Humanome\Cartographe\Invitations;
use Humanome\Cartographe\Links;
use Humanome\Tests\TestDb;
use Humanome\Tests\UseCases\Support\CarSupport;
use PDO;
use PHPUnit\Framework\Attributes\TestDox;
use PHPUnit\Framework\TestCase;

/**
 * UC-CAR-01 — Accepter l'invitation d'un apprenant : tests UNITAIRES.
 *
 * Fiche : docs/cas-utilisation/cartographe/UC-CAR-01-accepter-invitation.md
 *
 * Les classes sollicitées par POST /api/cartographe/invitations/{code}/accept
 * et GET /api/cartographe/apprentis sont appelées directement (sans HTTP) :
 * Invitations (forme du code, acceptation transactionnelle, suivi côté
 * apprenant) et Links (apprentis rattachés ; `isLinked`, sans appelant en
 * production, ne sert ici que d'oracle de vérification).
 */
final class UcCar01AccepterInvitationTest extends TestCase
{
    private static PDO $pdo;

    public static function setUpBeforeClass(): void
    {
        self::$pdo = CarSupport::freshPdo();
    }

    protected function setUp(): void
    {
        CarSupport::reset(self::$pdo);
    }

    #[TestDox('UC-CAR-01-U01 — isWellFormedCode : 10 caractères de l’alphabet A-Z2-9, rien d’autre')]
    public function testU01WellFormedCodeFollowsTheM7Alphabet(): void
    {
        self::assertTrue(Invitations::isWellFormedCode('K7TQZ2M9RC'));
        self::assertTrue(Invitations::isWellFormedCode('ABCDEFGH23'));

        foreach ([
            'k7tqz2m9rc',   // minuscules : l'API ne normalise pas (seule l'IHM le fait)
            'K7TQZ2M9R',    // 9 caractères
            'K7TQZ2M9RCX',  // 11 caractères
            'K7TQZ2M9R0',   // 0 hors alphabet
            'K7TQZ2M9R1',   // 1 hors alphabet
            ' K7TQZ2M9R',   // espace
            '',
        ] as $code) {
            self::assertFalse(Invitations::isWellFormedCode($code), var_export($code, true));
        }
    }

    #[TestDox('UC-CAR-01-U02 — accept : code valide → apprenant renvoyé, code consommé, lien créé')]
    public function testU02AcceptConsumesTheCodeAndCreatesTheLink(): void
    {
        $maya = CarSupport::user(self::$pdo, 'Maya');
        $carl = CarSupport::user(self::$pdo, 'Carl', ['cartographe']);
        ['code' => $code] = (new Invitations(self::$pdo))->create($maya);

        $apprenti = (new Invitations(self::$pdo))->accept($code, $carl);

        self::assertSame(['id' => $maya, 'displayName' => 'Maya'], $apprenti);
        $row = self::$pdo->query("SELECT accepted_at, accepted_by FROM cartographe_invitations WHERE code = '{$code}'")->fetch();
        self::assertNotNull($row['accepted_at']);
        self::assertSame($carl, (int) $row['accepted_by']);
        self::assertTrue((new Links(self::$pdo))->isLinked($maya, $carl));
        self::assertFalse((new Links(self::$pdo))->isLinked($carl, $maya), 'le lien est orienté apprenant -> cartographe');
    }

    #[TestDox('UC-CAR-01-U03 — accept : code inconnu, expiré ou déjà utilisé → null, rien ne change')]
    public function testU03UnusableCodesReturnNullWithoutSideEffect(): void
    {
        $maya = CarSupport::user(self::$pdo, 'Maya');
        $carl = CarSupport::user(self::$pdo, 'Carl', ['cartographe']);
        $rita = CarSupport::user(self::$pdo, 'Rita', ['cartographe']);
        $invitations = new Invitations(self::$pdo);

        self::assertNull($invitations->accept('ZZZZZZZZZZ', $carl), 'inconnu');

        CarSupport::invitation(self::$pdo, $maya, 'EXPIRE2345', -1);
        self::assertNull($invitations->accept('EXPIRE2345', $carl), 'expiré');

        CarSupport::invitation(self::$pdo, $maya, 'UTILISE234');
        self::assertNotNull($invitations->accept('UTILISE234', $carl));
        self::assertNull($invitations->accept('UTILISE234', $rita), 'déjà utilisé (usage unique)');

        self::assertFalse((new Links(self::$pdo))->isLinked($maya, $rita));
        self::assertSame(
            $carl,
            (int) self::$pdo->query("SELECT accepted_by FROM cartographe_invitations WHERE code = 'UTILISE234'")->fetchColumn(),
            'le premier preneur reste l’accepteur',
        );
        self::assertNull(
            self::$pdo->query("SELECT accepted_at FROM cartographe_invitations WHERE code = 'EXPIRE2345'")->fetchColumn(),
        );
    }

    #[TestDox('UC-CAR-01-U04 — accept : auto-lien refusé, et le code n’est PAS consommé')]
    public function testU04SelfLinkIsRefusedAndTheCodeStaysUsable(): void
    {
        $maya = CarSupport::user(self::$pdo, 'Maya', ['apprenant', 'cartographe']);
        $carl = CarSupport::user(self::$pdo, 'Carl', ['cartographe']);
        ['code' => $code] = (new Invitations(self::$pdo))->create($maya);

        self::assertNull((new Invitations(self::$pdo))->accept($code, $maya));
        self::assertSame(0, CarSupport::count(self::$pdo, 'SELECT COUNT(*) FROM cartographe_links'));
        self::assertSame('en_attente', (new Invitations(self::$pdo))->listForApprenant($maya)[0]['statut']);

        // Le code, non consommé, reste utilisable par un vrai tiers.
        self::assertNotNull((new Invitations(self::$pdo))->accept($code, $carl));
    }

    #[TestDox('UC-CAR-01-U05 — accept : second code du même apprenant → idempotent (un seul lien, date d’origine)')]
    public function testU05SecondCodeFromTheSameLearnerIsIdempotent(): void
    {
        $maya = CarSupport::user(self::$pdo, 'Maya');
        $carl = CarSupport::user(self::$pdo, 'Carl', ['cartographe']);
        $invitations = new Invitations(self::$pdo);

        self::assertNotNull($invitations->accept($invitations->create($maya)['code'], $carl));
        self::$pdo->exec('UPDATE cartographe_links SET created_at = \'2026-01-01 08:00:00\'');
        self::assertSame(['id' => $maya, 'displayName' => 'Maya'], $invitations->accept($invitations->create($maya)['code'], $carl));

        self::assertSame(1, CarSupport::count(self::$pdo, 'SELECT COUNT(*) FROM cartographe_links'));
        self::assertSame('2026-01-01T08:00:00', (new Links(self::$pdo))->apprentisOf($carl)[0]['linkedAt'], 'INSERT IGNORE : le lien d’origine est conservé');
        self::assertSame(
            ['acceptee', 'acceptee'],
            array_column($invitations->listForApprenant($maya), 'statut'),
            'les deux codes sont consommés',
        );
    }

    #[TestDox('UC-CAR-01-U06 — apprentisOf : seulement MES apprentis, triés par nom, date ISO')]
    public function testU06ApprentisOfListsOnlyMyLinkedLearnersSorted(): void
    {
        $zoe = CarSupport::user(self::$pdo, 'Zoé');
        $maya = CarSupport::user(self::$pdo, 'Maya');
        $noe = CarSupport::user(self::$pdo, 'Noé');
        $carl = CarSupport::user(self::$pdo, 'Carl', ['cartographe']);
        $rita = CarSupport::user(self::$pdo, 'Rita', ['cartographe']);
        CarSupport::link(self::$pdo, $zoe, $carl);
        CarSupport::link(self::$pdo, $maya, $carl);
        CarSupport::link(self::$pdo, $noe, $rita);

        $apprentis = (new Links(self::$pdo))->apprentisOf($carl);

        self::assertSame(['Maya', 'Zoé'], array_column($apprentis, 'displayName'));
        self::assertSame([$maya, $zoe], array_column($apprentis, 'id'));
        self::assertSame(['id', 'displayName', 'linkedAt'], array_keys($apprentis[0]));
        self::assertMatchesRegularExpression('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/', $apprentis[0]['linkedAt']);
        self::assertSame([], (new Links(self::$pdo))->apprentisOf($maya), 'un apprenant n’a pas d’apprentis');
    }

    #[TestDox('UC-CAR-01-U07 — listForApprenant : après acceptation, l’apprenant voit « acceptee » et le nom du cartographe')]
    public function testU07LearnerSeesTheAcceptedStatusAndTheCartographeName(): void
    {
        $maya = CarSupport::user(self::$pdo, 'Maya');
        $carl = CarSupport::user(self::$pdo, 'Carl', ['cartographe']);
        $invitations = new Invitations(self::$pdo);
        ['code' => $accepted] = $invitations->create($maya);
        ['code' => $pending] = $invitations->create($maya);
        $invitations->accept($accepted, $carl);

        $byCode = array_column($invitations->listForApprenant($maya), null, 'code');

        self::assertSame('acceptee', $byCode[$accepted]['statut']);
        self::assertSame('Carl', $byCode[$accepted]['acceptedBy']);
        self::assertNotNull($byCode[$accepted]['acceptedAt']);
        self::assertSame('en_attente', $byCode[$pending]['statut']);
        self::assertNull($byCode[$pending]['acceptedBy']);
    }

    #[TestDox('UC-CAR-01-U13 — accept : verrou FOR UPDATE, un code pris par une transaction concurrente n’est pas consommé deux fois (RG5)')]
    public function testU13ConcurrentAcceptanceWaitsForTheRowLock(): void
    {
        $maya = CarSupport::user(self::$pdo, 'Maya');
        $carl = CarSupport::user(self::$pdo, 'Carl', ['cartographe']);
        $rita = CarSupport::user(self::$pdo, 'Rita', ['cartographe']);
        ['code' => $code] = (new Invitations(self::$pdo))->create($maya);

        // Un second processus (autre connexion MySQL) joue Rita qui accepte le
        // même code : il prend le verrou de la ligne, le garde 2 s, puis
        // valide. Pendant ce temps, Carl tente d'accepter.
        $child = <<<'PHP'
            require $argv[1];
            $pdo = \Humanome\Tests\TestDb::pdo();
            $pdo->beginTransaction();
            $pdo->prepare('UPDATE cartographe_invitations SET accepted_at = NOW(), accepted_by = ? WHERE code = ?')
                ->execute([(int) $argv[2], $argv[3]]);
            fwrite(STDOUT, "locked\n");
            fflush(STDOUT);
            sleep(2);
            $pdo->commit();
            fwrite(STDOUT, "committed\n");
            PHP;
        $env = getenv();
        $env['DB_TEST_NAME'] = TestDb::name();
        $process = proc_open(
            [PHP_BINARY, '-r', $child, \dirname(__DIR__, 3) . '/vendor/autoload.php', (string) $rita, $code],
            [1 => ['pipe', 'w'], 2 => ['pipe', 'w']],
            $pipes,
            null,
            $env,
        );
        self::assertIsResource($process);
        try {
            // (Pas de lecture de stderr ici : elle bloquerait jusqu'à la fin
            // du processus enfant, donc après son COMMIT.)
            self::assertSame("locked\n", fgets($pipes[1]));

            $started = microtime(true);
            $result = (new Invitations(self::$pdo))->accept($code, $carl);
            $waited = microtime(true) - $started;
        } finally {
            $rest = (string) stream_get_contents($pipes[1]);
            $errors = (string) stream_get_contents($pipes[2]);
            fclose($pipes[1]);
            fclose($pipes[2]);
            $exit = proc_close($process);
        }

        self::assertSame(0, $exit, $errors);
        self::assertSame("committed\n", $rest);
        self::assertGreaterThan(1.0, $waited, 'la lecture FOR UPDATE a attendu la fin de la transaction concurrente');
        self::assertNull($result, 'le code consommé entre-temps est refusé, pas réécrit');
        self::assertSame(
            $rita,
            (int) self::$pdo->query("SELECT accepted_by FROM cartographe_invitations WHERE code = '{$code}'")->fetchColumn(),
            'le premier preneur reste l’accepteur',
        );
        self::assertSame(0, CarSupport::count(self::$pdo, "SELECT COUNT(*) FROM cartographe_links WHERE cartographe_id = {$carl}"));
    }

    #[TestDox('UC-CAR-01-U14 — accept : recherche insensible à la casse (collation) ; c’est isWellFormedCode qui écarte les minuscules')]
    public function testU14AcceptIsCaseInsensitiveOnlyTheRouteShapeCheckRefusesLowercase(): void
    {
        $maya = CarSupport::user(self::$pdo, 'Maya');
        $carl = CarSupport::user(self::$pdo, 'Carl', ['cartographe']);
        ['code' => $code] = (new Invitations(self::$pdo))->create($maya);

        // Comportement actuel du domaine : la colonne `code` est en
        // utf8mb4_unicode_ci, le code en minuscules retrouve donc l'invitation.
        // La route teste la forme AVANT d'appeler accept() : c'est ce contrôle
        // qui fait répondre 404 à un code en minuscules (UC-CAR-01-F03).
        self::assertFalse(Invitations::isWellFormedCode(strtolower($code)));
        self::assertSame(['id' => $maya, 'displayName' => 'Maya'], (new Invitations(self::$pdo))->accept(strtolower($code), $carl));
        self::assertSame(1, CarSupport::count(self::$pdo, 'SELECT COUNT(*) FROM cartographe_links'));
    }
}
