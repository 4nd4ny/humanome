<?php

declare(strict_types=1);

namespace Humanome\Tests\UseCases\Unit;

use Humanome\Cartographe\Garanties;
use Humanome\Cartographe\Links;
use Humanome\Cartographe\Revisions;
use Humanome\Tests\TestDb;
use Humanome\Tests\UseCases\Support\CarSupport;
use PDO;
use PHPUnit\Framework\Attributes\TestDox;
use PHPUnit\Framework\TestCase;

/**
 * UC-CAR-05 — Garantir une cartographie ou retirer sa garantie : tests UNITAIRES.
 *
 * Fiche : docs/cas-utilisation/cartographe/UC-CAR-05-garantir-cartographie.md
 *
 * Les classes sollicitées par POST/DELETE /api/cartographies/{id}/garantie
 * sont appelées directement : Garanties (pose transactionnelle, conflit entre
 * signataires, remplacement, retrait par le signataire), Revisions::belongsTo
 * (révision figée de CETTE cartographie) et Links::access (le propriétaire
 * n'est jamais « cartographe » de sa propre cartographie).
 */
final class UcCar05GarantirCartographieTest extends TestCase
{
    private static PDO $pdo;

    private int $maya;
    private int $carl;
    private int $rita;
    private int $cartoId;

    public static function setUpBeforeClass(): void
    {
        self::$pdo = CarSupport::freshPdo();
    }

    protected function setUp(): void
    {
        CarSupport::reset(self::$pdo);
        $this->maya = CarSupport::user(self::$pdo, 'Maya');
        $this->carl = CarSupport::user(self::$pdo, 'Carl', ['cartographe']);
        $this->rita = CarSupport::user(self::$pdo, 'Rita', ['cartographe']);
        CarSupport::link(self::$pdo, $this->maya, $this->carl);
        CarSupport::link(self::$pdo, $this->maya, $this->rita);
        $this->cartoId = CarSupport::carto(self::$pdo, $this->maya);
    }

    private function revision(?int $cartoId = null): int
    {
        return (new Revisions(self::$pdo))->create($cartoId ?? $this->cartoId, $this->carl, CarSupport::jourDocument(), null)['revisionId'];
    }

    #[TestDox('UC-CAR-05-U01 — pose : état figé {par, date, revisionId}, relu à l’identique')]
    public function testU01PoseFreezesTheSignature(): void
    {
        $garanties = new Garanties(self::$pdo);

        $base = $garanties->pose($this->cartoId, $this->carl, 'Carl', null);
        self::assertSame(['par', 'date', 'revisionId'], array_keys($base));
        self::assertSame('Carl', $base['par']);
        self::assertNull($base['revisionId'], 'document d’origine garanti');
        self::assertMatchesRegularExpression('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/', $base['date']);
        self::assertSame($base, $garanties->findForCartography($this->cartoId));

        $revisionId = $this->revision();
        $pinned = $garanties->pose($this->cartoId, $this->carl, 'Carl', $revisionId);
        self::assertSame($revisionId, $pinned['revisionId']);
    }

    #[TestDox('UC-CAR-05-U02 — pose par un AUTRE cartographe alors qu’une garantie tient → null, signature intacte')]
    public function testU02AnotherCartographeCannotOverwrite(): void
    {
        $garanties = new Garanties(self::$pdo);
        $revisionId = $this->revision(); // avant la pose : une révision postée après retirerait la garantie
        $garanties->pose($this->cartoId, $this->carl, 'Carl', null);

        self::assertNull($garanties->pose($this->cartoId, $this->rita, 'Rita', $revisionId));

        $row = self::$pdo->query('SELECT cartographe_id, par, revision_id FROM cartography_garanties')->fetchAll();
        self::assertCount(1, $row);
        self::assertSame($this->carl, (int) $row[0]['cartographe_id']);
        self::assertSame('Carl', $row[0]['par']);
        self::assertNull($row[0]['revision_id']);
    }

    #[TestDox('UC-CAR-05-U03 — re-pose par le MÊME cartographe → remplacement (une seule ligne, nouvelle cible, nouveau nom)')]
    public function testU03SameCartographeReplacesHisSignature(): void
    {
        $garanties = new Garanties(self::$pdo);
        $revisionId = $this->revision();
        $garanties->pose($this->cartoId, $this->carl, 'Carl', null);
        // Signature vieillie : le remplacement doit porter un NOUVEL horodatage.
        self::$pdo->exec("UPDATE cartography_garanties SET created_at = '2020-01-01 00:00:00'");

        $replaced = $garanties->pose($this->cartoId, $this->carl, 'Carl D.', $revisionId);

        self::assertSame('Carl D.', $replaced['par']);
        self::assertSame($revisionId, $replaced['revisionId']);
        self::assertNotSame('2020-01-01T00:00:00', $replaced['date'], 'nouvel horodatage');
        self::assertSame(1, CarSupport::count(self::$pdo, 'SELECT COUNT(*) FROM cartography_garanties'));
    }

    #[TestDox('UC-CAR-05-U04 — withdraw : le signataire seul ; autre ou rien à retirer → false')]
    public function testU04WithdrawBySignatoryOnly(): void
    {
        $garanties = new Garanties(self::$pdo);
        self::assertFalse($garanties->withdraw($this->cartoId, $this->carl), 'aucune garantie');
        $garanties->pose($this->cartoId, $this->carl, 'Carl', null);

        self::assertFalse($garanties->withdraw($this->cartoId, $this->rita));
        self::assertNotNull($garanties->findForCartography($this->cartoId));
        self::assertTrue($garanties->withdraw($this->cartoId, $this->carl));
        self::assertNull($garanties->findForCartography($this->cartoId));
        self::assertFalse($garanties->withdraw($this->cartoId, $this->carl));
    }

    #[TestDox('UC-CAR-05-U05 — Revisions::belongsTo : la révision figée doit appartenir à CETTE cartographie')]
    public function testU05RevisionMustBelongToTheCartography(): void
    {
        $autre = CarSupport::carto(self::$pdo, $this->maya);
        $mine = $this->revision();
        $foreign = $this->revision($autre);
        $revisions = new Revisions(self::$pdo);

        self::assertTrue($revisions->belongsTo($mine, $this->cartoId));
        self::assertFalse($revisions->belongsTo($foreign, $this->cartoId));
        self::assertFalse($revisions->belongsTo(999999, $this->cartoId));
    }

    #[TestDox('UC-CAR-05-U06 — Links::access : le propriétaire, même cartographe, reste « owner » (jamais garant de soi)')]
    public function testU06OwnerIsNeverCartographeOfHisOwnCartography(): void
    {
        $both = CarSupport::user(self::$pdo, 'Bea', ['apprenant', 'cartographe']);
        $own = CarSupport::carto(self::$pdo, $both);
        // Auto-lien posé en SQL (l'API le refuse, UC-CAR-01 RG3) : le niveau
        // « cartographe » devient possible, la propriété doit quand même primer.
        CarSupport::link(self::$pdo, $both, $both);
        $links = new Links(self::$pdo);

        self::assertSame('owner', $links->access($own, $both, ['apprenant', 'cartographe'])['level']);
        self::assertSame('cartographe', $links->access($this->cartoId, $this->carl, ['cartographe'])['level']);
        self::assertNull($links->access($this->cartoId, $both, ['apprenant', 'cartographe']), 'non liée à Maya');
    }

    #[TestDox('UC-CAR-05-U07 — la garantie tombe avec la révision figée, la cartographie ou le compte du signataire (CASCADE)')]
    public function testU07GarantieCascades(): void
    {
        $garanties = new Garanties(self::$pdo);
        $revisionId = $this->revision();
        $garanties->pose($this->cartoId, $this->carl, 'Carl', $revisionId);
        self::$pdo->exec('DELETE FROM cartography_revisions WHERE id = ' . $revisionId);
        self::assertNull($garanties->findForCartography($this->cartoId), 'révision figée supprimée');

        $garanties->pose($this->cartoId, $this->carl, 'Carl', null);
        self::$pdo->exec('DELETE FROM users WHERE id = ' . $this->carl);
        self::assertNull($garanties->findForCartography($this->cartoId), 'signataire purgé');

        $garanties->pose($this->cartoId, $this->rita, 'Rita', null);
        self::$pdo->exec('DELETE FROM cartographies WHERE id = ' . $this->cartoId);
        self::assertSame(0, CarSupport::count(self::$pdo, 'SELECT COUNT(*) FROM cartography_garanties'), 'cartographie supprimée');
    }

    #[TestDox('UC-CAR-05-U12 — pose concurrente de deux PREMIÈRES signatures : l’une passe, l’autre échoue en interblocage (1213), jamais le refus propre null → 409 (comportement actuel)')]
    public function testU12ConcurrentFirstSignaturesDeadlockInsteadOfConflict(): void
    {
        // Un second processus (autre connexion MySQL) joue Rita qui garantit
        // au même moment, avec la même séquence que Garanties::pose : SELECT
        // … FOR UPDATE sur une ligne absente (verrou d'intervalle, compatible
        // avec celui de Carl), pause, puis INSERT.
        $child = <<<'PHP'
            require $argv[1];
            $pdo = \Humanome\Tests\TestDb::pdo();
            $pdo->beginTransaction();
            $pdo->prepare('SELECT id, cartographe_id FROM cartography_garanties WHERE cartographie_id = ? FOR UPDATE')
                ->execute([(int) $argv[2]]);
            fwrite(STDOUT, "locked\n");
            fflush(STDOUT);
            sleep(2);
            try {
                $pdo->prepare('INSERT INTO cartography_garanties (cartographie_id, cartographe_id, revision_id, par) VALUES (?, ?, NULL, ?)')
                    ->execute([(int) $argv[2], (int) $argv[3], 'Rita']);
                $pdo->commit();
                fwrite(STDOUT, "ok\n");
            } catch (\PDOException $e) {
                $pdo->rollBack();
                fwrite(STDOUT, 'error ' . ($e->errorInfo[1] ?? '?') . "\n");
            }
            PHP;
        $env = getenv();
        $env['DB_TEST_NAME'] = TestDb::name();
        $process = proc_open(
            [PHP_BINARY, '-r', $child, \dirname(__DIR__, 3) . '/vendor/autoload.php', (string) $this->cartoId, (string) $this->rita],
            [1 => ['pipe', 'w'], 2 => ['pipe', 'w']],
            $pipes,
            null,
            $env,
        );
        self::assertIsResource($process);
        $carlResult = null;
        $carlError = null;
        try {
            // (Pas de lecture de stderr avant la fin : elle bloquerait.)
            self::assertSame("locked\n", fgets($pipes[1]));
            try {
                $carlResult = (new Garanties(self::$pdo))->pose($this->cartoId, $this->carl, 'Carl', null);
            } catch (\PDOException $e) {
                $carlError = (int) ($e->errorInfo[1] ?? 0);
            }
        } finally {
            $ritaOutcome = trim((string) stream_get_contents($pipes[1]));
            $errors = (string) stream_get_contents($pipes[2]);
            fclose($pipes[1]);
            fclose($pipes[2]);
            $exit = proc_close($process);
        }
        self::assertSame(0, $exit, $errors);

        // Exactement une signature passe…
        $winners = ($carlResult !== null ? 1 : 0) + ($ritaOutcome === 'ok' ? 1 : 0);
        self::assertSame(1, $winners, 'Carl : ' . var_export($carlResult, true) . ' / Rita : ' . $ritaOutcome);
        self::assertSame(1, CarSupport::count(self::$pdo, 'SELECT COUNT(*) FROM cartography_garanties'));
        // … et le perdant reçoit une exception d'interblocage (→ 500 « Erreur
        // interne » par la route), pas le null qui produirait le 409 documenté.
        if ($carlResult === null) {
            self::assertSame(1213, $carlError);
        } else {
            self::assertSame('error 1213', $ritaOutcome);
        }
    }
}
