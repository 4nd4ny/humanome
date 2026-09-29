<?php

declare(strict_types=1);

namespace Humanome\Tests\UseCases\Unit;

use Humanome\Auth\Users;
use Humanome\Etablissement\CohorteRepository;
use Humanome\MigrationRunner;
use Humanome\Tests\TestDb;
use PDO;
use PHPUnit\Framework\Attributes\TestDox;
use PHPUnit\Framework\TestCase;

/**
 * UC-APP-08 — Rejoindre une cohorte, déposer son portfolio, quitter : tests
 * UNITAIRES.
 *
 * Fiche : docs/cas-utilisation/apprenant/UC-APP-08-rejoindre-cohorte.md
 *
 * CohorteRepository est appelé directement pour tout ce que sollicitent les
 * routes apprenant (/api/cohortes…) : résolution du code, adhésion
 * consentie idempotente, liste « Mes cohortes », dépôt (remplacement),
 * retrait du consentement (jobs annulés, documents produits conservés) et
 * son effet sur l'enfilement des runs. Les runs et jobs de masse sont posés
 * en SQL (ils sont produits par UC-ETA-03 / UC-SYS-01).
 */
final class UcApp08RejoindreCohorteTest extends TestCase
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

    private static function repo(): CohorteRepository
    {
        return new CohorteRepository(self::$pdo);
    }

    private static function user(string $name): int
    {
        self::$pdo->prepare('INSERT INTO users (email, password_hash, display_name) VALUES (?, ?, ?)')
            ->execute([uniqid('u', true) . '@example.org', Users::hashPassword('x-password'), $name]);

        return (int) self::$pdo->lastInsertId();
    }

    /** @return array{id: int, codeInvitation: string} */
    private static function cohorte(int $etablissementId, string $nom = 'Terminale B'): array
    {
        return self::repo()->create($etablissementId, $nom);
    }

    /** @return list<array{date: string, texte: string}> */
    private static function segments(string ...$dates): array
    {
        return array_map(static fn (string $d): array => ['date' => $d, 'texte' => 'Feuille du ' . $d], $dates);
    }

    /** Run de masse et un job par statut (production simulée, UC-ETA-03 / UC-SYS-01). */
    private static function jobs(int $etabId, int $cohorteId, int $userId, ?int $portfolioId, array $statusByDay): int
    {
        self::$pdo->prepare(
            "INSERT INTO mass_runs (etablissement_id, cohorte_id, prompt_package_slug, prompt_package_semver,
                referentiel_id, referentiel_semver) VALUES (?, ?, 'aurora-v3-reconstruit', '1.0.0', 'respire', '7.0.0')"
        )->execute([$etabId, $cohorteId]);
        $runId = (int) self::$pdo->lastInsertId();
        $insert = self::$pdo->prepare(
            'INSERT INTO mass_jobs (run_id, user_id, portfolio_id, day_date, status, document) VALUES (?, ?, ?, ?, ?, ?)'
        );
        foreach ($statusByDay as $day => $status) {
            $insert->execute([
                $runId, $userId, $portfolioId, $day, $status,
                $status === 'done' ? json_encode(['kind' => 'cartographie-jour', 'date' => $day]) : null,
            ]);
        }

        return $runId;
    }

    #[TestDox('UC-APP-08-U01 — findByCode : code rogné et mis en majuscules ; inconnu → null ; ne renvoie que {id, nom}')]
    public function testU01FindByCodeNormalizes(): void
    {
        $cohorte = self::cohorte(self::user('Lycée Astrolabe'));
        self::assertMatchesRegularExpression('/^[A-Z2-9]{10}$/', $cohorte['codeInvitation']);

        $found = self::repo()->findByCode('  ' . strtolower($cohorte['codeInvitation']) . ' ');
        self::assertSame(['id' => $cohorte['id'], 'nom' => 'Terminale B'], $found);
        self::assertNull(self::repo()->findByCode('ZZZZZZZZZZ'));
    }

    #[TestDox('UC-APP-08-U02 — join : l’adhésion horodate le consentement ; re-jointure idempotente, consentement d’origine conservé')]
    public function testU02JoinIsIdempotentAndKeepsTheOriginalConsent(): void
    {
        $cohorte = self::cohorte(self::user('Lycée'));
        $eleve = self::user('Élève');

        self::assertTrue(self::repo()->join($cohorte['id'], $eleve));
        self::assertNotNull(self::$pdo->query('SELECT consent_at FROM cohorte_membres')->fetchColumn());
        self::$pdo->exec("UPDATE cohorte_membres SET consent_at = '2026-01-01 08:00:00'");

        self::assertFalse(self::repo()->join($cohorte['id'], $eleve), 'déjà membre');
        self::assertSame('2026-01-01 08:00:00', self::$pdo->query('SELECT consent_at FROM cohorte_membres')->fetchColumn());
        self::assertSame(1, (int) self::$pdo->query('SELECT COUNT(*) FROM cohorte_membres')->fetchColumn());
    }

    #[TestDox('UC-APP-08-U03 — isMember : seulement pour la cohorte rejointe')]
    public function testU03IsMember(): void
    {
        $etab = self::user('Lycée');
        $a = self::cohorte($etab, 'A');
        $b = self::cohorte($etab, 'B');
        $eleve = self::user('Élève');
        self::repo()->join($a['id'], $eleve);

        self::assertTrue(self::repo()->isMember($a['id'], $eleve));
        self::assertFalse(self::repo()->isMember($b['id'], $eleve));
        self::assertFalse(self::repo()->isMember($a['id'], self::user('Autre')));
    }

    #[TestDox('UC-APP-08-U04 — listForLearner : ses adhésions seulement, établissement nommé, état du dépôt, jamais le code')]
    public function testU04ListForLearner(): void
    {
        $etab = self::user('Lycée Astrolabe');
        $a = self::cohorte($etab, 'BTS SIO 2026');
        $b = self::cohorte($etab, 'Terminale B');
        $eleve = self::user('Élève');
        $autre = self::user('Autre');
        self::repo()->join($a['id'], $eleve);
        self::repo()->join($b['id'], $eleve);
        self::repo()->join($a['id'], $autre);
        self::repo()->depositPortfolio($b['id'], $eleve, 'Journal', null, self::segments('2026-01-05', '2026-01-06'));

        $list = self::repo()->listForLearner($eleve);

        self::assertSame([$a['id'], $b['id']], array_column($list, 'id'));
        foreach ($list as $item) {
            self::assertSame(['id', 'nom', 'etablissement', 'joinedAt', 'portfolioDepose', 'portfolio'], array_keys($item));
            self::assertSame('Lycée Astrolabe', $item['etablissement']);
            self::assertMatchesRegularExpression('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/', $item['joinedAt']);
        }
        self::assertFalse($list[0]['portfolioDepose']);
        self::assertNull($list[0]['portfolio']);
        self::assertTrue($list[1]['portfolioDepose']);
        self::assertSame(['titre', 'journees', 'deposeLe'], array_keys($list[1]['portfolio']));
        self::assertSame(['Journal', 2], [$list[1]['portfolio']['titre'], $list[1]['portfolio']['journees']]);
        self::assertStringNotContainsString($a['codeInvitation'], json_encode($list, JSON_THROW_ON_ERROR));
        self::assertSame([], self::repo()->listForLearner(self::user('Personne')));
    }

    #[TestDox('UC-APP-08-U05 — depositPortfolio : un dépôt par (cohorte, membre), le re-dépôt remplace tout')]
    public function testU05DepositReplaces(): void
    {
        $cohorte = self::cohorte(self::user('Lycée'));
        $eleve = self::user('Élève');
        self::repo()->join($cohorte['id'], $eleve);

        $first = self::repo()->depositPortfolio($cohorte['id'], $eleve, 'Premier', 'Texte complet', self::segments('2026-01-05', '2026-01-06'));
        $second = self::repo()->depositPortfolio($cohorte['id'], $eleve, 'Corrigé', null, self::segments('2026-01-07'));

        self::assertSame($first, $second, 'même ligne');
        $row = self::$pdo->query('SELECT titre, texte, segments FROM cohorte_portfolios')->fetch();
        self::assertSame('Corrigé', $row['titre']);
        self::assertNull($row['texte'], 'le texte précédent ne survit pas');
        self::assertEquals(self::segments('2026-01-07'), json_decode((string) $row['segments'], true));
        self::assertSame('Feuille du 2026-01-07', self::repo()->segmentText($second, '2026-01-07'));
        self::assertNull(self::repo()->segmentText($second, '2026-01-05'));
    }

    #[TestDox('UC-APP-08-U06 — quit : jobs en attente annulés, dépôt et adhésion purgés, documents produits conservés ; non-membre → false')]
    public function testU06QuitWithdrawsConsent(): void
    {
        $etab = self::user('Lycée');
        $cohorte = self::cohorte($etab);
        $ailleurs = self::cohorte($etab, 'Autre cohorte');
        $eleve = self::user('Élève');
        $camarade = self::user('Camarade');
        foreach ([$eleve, $camarade] as $u) {
            self::repo()->join($cohorte['id'], $u);
        }
        self::repo()->join($ailleurs['id'], $eleve);
        $portfolioId = self::repo()->depositPortfolio($cohorte['id'], $eleve, 'Journal', null, self::segments('2026-01-05'));
        self::jobs($etab, $cohorte['id'], $eleve, $portfolioId, [
            '2026-01-05' => 'done', '2026-01-06' => 'queued', '2026-01-07' => 'running', '2026-01-08' => 'budget_exceeded', '2026-01-09' => 'failed',
        ]);
        self::jobs($etab, $cohorte['id'], $camarade, null, ['2026-01-05' => 'queued']);
        self::jobs($etab, $ailleurs['id'], $eleve, null, ['2026-01-05' => 'queued']);

        self::assertFalse(self::repo()->quit($cohorte['id'], self::user('Inconnu')));
        self::assertTrue(self::repo()->quit($cohorte['id'], $eleve));

        $statuses = self::$pdo->query(
            'SELECT j.day_date, j.status, j.portfolio_id, j.document IS NOT NULL AS has_doc
               FROM mass_jobs j JOIN mass_runs r ON r.id = j.run_id
              WHERE j.user_id = ' . $eleve . ' AND r.cohorte_id = ' . $cohorte['id'] . ' ORDER BY j.day_date'
        )->fetchAll();
        self::assertSame(['done', 'cancelled', 'cancelled', 'cancelled', 'failed'], array_column($statuses, 'status'));
        self::assertSame(1, (int) $statuses[0]['has_doc'], 'le document produit reste à l’apprenant');
        self::assertNull($statuses[0]['portfolio_id'], 'FK SET NULL : la source est purgée');
        self::assertFalse(self::repo()->isMember($cohorte['id'], $eleve));
        self::assertSame(0, (int) self::$pdo->query('SELECT COUNT(*) FROM cohorte_portfolios')->fetchColumn());
        // Rien d'autre n'est touché : l'autre cohorte, le camarade.
        self::assertTrue(self::repo()->isMember($ailleurs['id'], $eleve));
        self::assertSame(2, (int) self::$pdo->query("SELECT COUNT(*) FROM mass_jobs WHERE status = 'queued'")->fetchColumn());
    }

    #[TestDox('UC-APP-08-U07 — depositsForRun : seuls les membres AYANT déposé sont enfilés ; après départ, plus rien')]
    public function testU07OnlyDepositingMembersAreEnqueued(): void
    {
        $cohorte = self::cohorte(self::user('Lycée'));
        $deposant = self::user('Déposant');
        $silencieux = self::user('Silencieux');
        self::repo()->join($cohorte['id'], $deposant);
        self::repo()->join($cohorte['id'], $silencieux);
        self::repo()->depositPortfolio($cohorte['id'], $deposant, 'Journal', null, self::segments('2026-01-05', '2026-01-06'));

        $deposits = self::repo()->depositsForRun($cohorte['id'], null);
        self::assertCount(1, $deposits);
        self::assertSame($deposant, $deposits[0]['userId']);
        self::assertSame(['2026-01-05', '2026-01-06'], $deposits[0]['dates']);

        self::repo()->quit($cohorte['id'], $deposant);
        self::assertSame([], self::repo()->depositsForRun($cohorte['id'], null));
    }
}
