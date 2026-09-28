<?php

declare(strict_types=1);

namespace Humanome\Tests\UseCases\Unit;

use Humanome\Etablissement\CohorteRepository;
use Humanome\MigrationRunner;
use Humanome\Tests\TestDb;
use Humanome\Tests\UseCases\Support\EtaSupport;
use PDO;
use PHPUnit\Framework\Attributes\TestDox;
use PHPUnit\Framework\TestCase;

/**
 * UC-ETA-01 — Créer et gérer une cohorte : tests UNITAIRES.
 *
 * Fiche : docs/cas-utilisation/etablissement/UC-ETA-01-gerer-cohorte.md
 *
 * CohorteRepository est appelé directement (sans couche HTTP) sur la base de
 * test : génération du code d'invitation (alphabet sans 0/1, reprise sur
 * collision), liste et détail cloisonnés par établissement, projection des
 * membres (consentement daté, détail du dépôt SANS contenu, avancement agrégé
 * sur les runs de LA cohorte) et purge en cascade.
 */
final class UcEta01GererCohorteTest extends TestCase
{
    use EtaSupport;

    private static PDO $pdo;

    public static function setUpBeforeClass(): void
    {
        self::$pdo = TestDb::fresh();
        (new MigrationRunner(self::$pdo, MigrationRunner::defaultMigrationsDir()))->run();
    }

    protected function setUp(): void
    {
        self::$pdo->exec('DELETE FROM users'); // cohortes, membres, dépôts, runs, jobs : CASCADE
    }

    #[TestDox('UC-ETA-01-U01 — create : code d’invitation de 10 caractères A-Z/2-9, unique, stocké tel quel')]
    public function testU01CreateGeneratesATenCharacterInvitationCode(): void
    {
        $etab = self::seedUser(self::$pdo, 'Lycée Astrolabe', ['etablissement']);
        $repo = new CohorteRepository(self::$pdo);

        $codes = [];
        for ($i = 0; $i < 25; $i++) {
            $created = $repo->create($etab, "Cohorte {$i}");
            self::assertSame(['id', 'codeInvitation'], array_keys($created));
            self::assertMatchesRegularExpression('/^[A-Z2-9]{10}$/', $created['codeInvitation'], 'ni 0 ni 1 (confusion avec O/I)');
            $codes[] = $created['codeInvitation'];
            self::assertSame(
                $created['codeInvitation'],
                self::scalar(self::$pdo, 'SELECT code_invitation FROM cohortes WHERE id = ?', [$created['id']]),
            );
        }
        self::assertCount(25, array_unique($codes));
    }

    #[TestDox('UC-ETA-01-U02 — create : une collision de code (1062) est retentée, 5 échecs ou une autre erreur remontent')]
    public function testU02CreateRetriesOnCodeCollision(): void
    {
        $etab = self::seedUser(self::$pdo, 'Lycée Astrolabe', ['etablissement']);
        // Connexion dédiée dont les requêtes préparées simulent des collisions
        // de la clé UNIQUE uq_cohortes_code (la probabilité réelle est ~0).
        $pdo = TestDb::pdo();
        $pdo->setAttribute(PDO::ATTR_STATEMENT_CLASS, [UcEta01CollidingStatement::class, []]);
        $repo = new CohorteRepository($pdo);

        UcEta01CollidingStatement::reset(collisions: 4);
        $created = $repo->create($etab, 'Quatre collisions puis succès');
        self::assertSame(5, UcEta01CollidingStatement::$inserts, '4 collisions + 1 insertion réussie');
        self::assertSame('Quatre collisions puis succès', self::scalar(self::$pdo, 'SELECT nom FROM cohortes WHERE id = ?', [$created['id']]));

        UcEta01CollidingStatement::reset(collisions: 5);
        try {
            $repo->create($etab, 'Cinq collisions');
            self::fail('5 collisions : l’exception doit remonter');
        } catch (\PDOException $e) {
            self::assertSame(1062, $e->errorInfo[1]);
            self::assertSame(5, UcEta01CollidingStatement::$inserts, 'au plus 5 tentatives');
        }

        UcEta01CollidingStatement::reset(collisions: 1, errorCode: 1406);
        try {
            $repo->create($etab, 'Autre erreur SQL');
            self::fail('une erreur autre que 1062 n’est pas retentée');
        } catch (\PDOException $e) {
            self::assertSame(1406, $e->errorInfo[1]);
            self::assertSame(1, UcEta01CollidingStatement::$inserts);
        }
        self::assertSame(1, (int) self::scalar(self::$pdo, 'SELECT COUNT(*) FROM cohortes'));
    }

    #[TestDox('UC-ETA-01-U03 — listForEtablissement : ses cohortes seulement, par id, avec le nombre de membres')]
    public function testU03ListIsScopedAndCountsMembers(): void
    {
        $etab = self::seedUser(self::$pdo, 'Lycée Astrolabe', ['etablissement']);
        $autre = self::seedUser(self::$pdo, 'Collège Voisin', ['etablissement']);
        $repo = new CohorteRepository(self::$pdo);
        $a = $repo->create($etab, 'Terminale B');
        $b = $repo->create($etab, 'BTS SIO 2026');
        $repo->create($autre, 'Cohorte étrangère');
        foreach (['Maya', 'Noé', 'Lila'] as $name) {
            $repo->join($a['id'], self::seedUser(self::$pdo, $name));
        }

        $list = $repo->listForEtablissement($etab);

        self::assertSame([$a['id'], $b['id']], array_column($list, 'id'));
        self::assertSame(['id', 'nom', 'codeInvitation', 'createdAt', 'membres'], array_keys($list[0]));
        self::assertSame(3, $list[0]['membres']);
        self::assertSame(0, $list[1]['membres']);
        self::assertSame($a['codeInvitation'], $list[0]['codeInvitation']);
        self::assertMatchesRegularExpression('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/', $list[0]['createdAt']);
        self::assertSame([], $repo->listForEtablissement(self::seedUser(self::$pdo, 'Sans cohorte', ['etablissement'])));
    }

    #[TestDox('UC-ETA-01-U04 — findForEtablissement : la cohorte d’un autre établissement répond null comme une inexistante')]
    public function testU04FindForEtablissementIsOwnerOnly(): void
    {
        $etab = self::seedUser(self::$pdo, 'Lycée Astrolabe', ['etablissement']);
        $autre = self::seedUser(self::$pdo, 'Collège Voisin', ['etablissement']);
        $repo = new CohorteRepository(self::$pdo);
        $cohorte = $repo->create($etab, 'Terminale B');

        $row = $repo->findForEtablissement($cohorte['id'], $etab);
        self::assertNotNull($row);
        self::assertSame('Terminale B', $row['nom']);
        self::assertSame($cohorte['codeInvitation'], $row['code_invitation']);

        self::assertNull($repo->findForEtablissement($cohorte['id'], $autre));
        self::assertNull($repo->findForEtablissement(999999, $etab));
    }

    #[TestDox('UC-ETA-01-U05 — membersOf : consentement daté, détail du dépôt sans contenu, avancement de CETTE cohorte')]
    public function testU05MembersOfProjectsConsentDepositAndProgress(): void
    {
        $etab = self::seedUser(self::$pdo, 'Lycée Astrolabe', ['etablissement']);
        $repo = new CohorteRepository(self::$pdo);
        $cohorte = $repo->create($etab, 'Terminale B');
        $autreCohorte = $repo->create($etab, 'Terminale C');

        $maya = self::seedUser(self::$pdo, 'Maya');
        $noe = self::seedUser(self::$pdo, 'Noé');
        $depotMaya = self::seedDepositor(self::$pdo, $cohorte['id'], $maya, ['2026-01-05', '2026-01-06'], 'Journal de Maya');
        $repo->join($cohorte['id'], $noe); // consenti, sans dépôt
        self::$pdo->exec("UPDATE cohorte_membres SET consent_at = '2026-02-01 09:00:00' WHERE user_id = {$maya}");
        self::$pdo->exec("UPDATE cohorte_membres SET consent_at = '2026-02-02 09:00:00' WHERE user_id = {$noe}");

        // Deux runs de la cohorte (3 jobs dont 2 done) + un run d'une AUTRE
        // cohorte pour Maya, qui ne doit pas compter.
        $depotAutre = self::seedDepositor(self::$pdo, $autreCohorte['id'], $maya, ['2026-01-07']);
        foreach ([[$cohorte['id'], $depotMaya, ['2026-01-05' => 'done', '2026-01-06' => 'queued']],
                  [$cohorte['id'], $depotMaya, ['2026-01-05' => 'done']],
                  [$autreCohorte['id'], $depotAutre, ['2026-01-07' => 'done']]] as [$cohorteId, $depot, $jobs]) {
            self::$pdo->prepare(
                'INSERT INTO mass_runs (etablissement_id, cohorte_id, prompt_package_slug, prompt_package_semver, referentiel_id, referentiel_semver)
                 VALUES (?, ?, "p", "1.0.0", "respire", "7.0.0")'
            )->execute([$etab, $cohorteId]);
            $runId = (int) self::$pdo->lastInsertId();
            foreach ($jobs as $date => $status) {
                self::$pdo->prepare('INSERT INTO mass_jobs (run_id, user_id, portfolio_id, day_date, status) VALUES (?, ?, ?, ?, ?)')
                    ->execute([$runId, $maya, $depot, $date, $status]);
            }
        }

        $membres = $repo->membersOf($cohorte['id']);

        self::assertSame([$maya, $noe], array_column($membres, 'userId'), 'ordre du consentement');
        self::assertSame(['userId', 'displayName', 'consentAt', 'portfolioDepose', 'portfolio', 'avancement'], array_keys($membres[0]));
        self::assertSame('2026-02-01T09:00:00', $membres[0]['consentAt']);
        self::assertTrue($membres[0]['portfolioDepose']);
        self::assertSame(['titre', 'journees', 'taille', 'deposeLe'], array_keys($membres[0]['portfolio']));
        self::assertSame('Journal de Maya', $membres[0]['portfolio']['titre']);
        self::assertSame(2, $membres[0]['portfolio']['journees']);
        self::assertGreaterThan(0, $membres[0]['portfolio']['taille']);
        self::assertSame(['jobsTotal' => 3, 'jobsDone' => 2], $membres[0]['avancement'], 'runs de CETTE cohorte seulement');
        self::assertStringNotContainsString('conseil de classe', json_encode($membres, JSON_UNESCAPED_UNICODE), 'jamais le texte déposé');

        self::assertFalse($membres[1]['portfolioDepose']);
        self::assertNull($membres[1]['portfolio']);
        self::assertSame(['jobsTotal' => 0, 'jobsDone' => 0], $membres[1]['avancement']);
    }

    #[TestDox('UC-ETA-01-U06 — deleteForEtablissement : refus hors propriétaire, sinon purge en cascade (membres, dépôts, runs, jobs)')]
    public function testU06DeleteIsOwnerOnlyAndCascades(): void
    {
        $etab = self::seedUser(self::$pdo, 'Lycée Astrolabe', ['etablissement']);
        $autre = self::seedUser(self::$pdo, 'Collège Voisin', ['etablissement']);
        $repo = new CohorteRepository(self::$pdo);
        $cohorte = $repo->create($etab, 'Terminale B');
        $maya = self::seedUser(self::$pdo, 'Maya');
        $depot = self::seedDepositor(self::$pdo, $cohorte['id'], $maya, ['2026-01-05']);
        self::$pdo->prepare(
            'INSERT INTO mass_runs (etablissement_id, cohorte_id, prompt_package_slug, prompt_package_semver, referentiel_id, referentiel_semver)
             VALUES (?, ?, "p", "1.0.0", "respire", "7.0.0")'
        )->execute([$etab, $cohorte['id']]);
        self::$pdo->prepare('INSERT INTO mass_jobs (run_id, user_id, portfolio_id, day_date, status, document) VALUES (?, ?, ?, ?, "done", ?)')
            ->execute([(int) self::$pdo->lastInsertId(), $maya, $depot, '2026-01-05', json_encode(self::dayDocument())]);

        self::assertFalse($repo->deleteForEtablissement($cohorte['id'], $autre));
        self::assertFalse($repo->deleteForEtablissement(999999, $etab));
        self::assertSame(1, (int) self::scalar(self::$pdo, 'SELECT COUNT(*) FROM cohortes'));

        self::assertTrue($repo->deleteForEtablissement($cohorte['id'], $etab));
        foreach (['cohortes', 'cohorte_membres', 'cohorte_portfolios', 'mass_runs', 'mass_jobs'] as $table) {
            self::assertSame(0, (int) self::scalar(self::$pdo, "SELECT COUNT(*) FROM {$table}"), $table);
        }
        // Le compte de l'apprenant, lui, subsiste.
        self::assertSame(1, (int) self::scalar(self::$pdo, 'SELECT COUNT(*) FROM users WHERE id = ?', [$maya]));
        self::assertFalse($repo->deleteForEtablissement($cohorte['id'], $etab), 'seconde suppression : plus rien');
    }
}

/**
 * Requête préparée de test : les N prochains INSERT INTO cohortes lèvent une
 * PDOException portant le code MySQL demandé (1062 = doublon de clé UNIQUE).
 */
class UcEta01CollidingStatement extends \PDOStatement
{
    public static int $collisionsLeft = 0;
    public static int $inserts = 0;
    public static int $errorCode = 1062;

    protected function __construct()
    {
    }

    public static function reset(int $collisions, int $errorCode = 1062): void
    {
        self::$collisionsLeft = $collisions;
        self::$inserts = 0;
        self::$errorCode = $errorCode;
    }

    public function execute(?array $params = null): bool
    {
        if (str_starts_with(ltrim($this->queryString), 'INSERT INTO cohortes')) {
            self::$inserts++;
            if (self::$collisionsLeft > 0) {
                self::$collisionsLeft--;
                $e = new \PDOException('SQLSTATE[23000]: simulated duplicate entry for uq_cohortes_code');
                $e->errorInfo = ['23000', self::$errorCode, 'simulated'];
                throw $e;
            }
        }

        return parent::execute($params);
    }
}
