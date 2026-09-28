<?php

declare(strict_types=1);

namespace Humanome\Tests\UseCases\Unit;

use Humanome\MigrationRunner;
use Humanome\Referentiel\CompetenceGovernance;
use Humanome\Referentiel\CompetenceRepository;
use Humanome\Referentiel\ConflictException;
use Humanome\Referentiel\Electorate;
use Humanome\Referentiel\InvalidDocumentException;
use Humanome\Referentiel\MajorityTally;
use Humanome\Referentiel\ReferentielGovernance;
use Humanome\Referentiel\ReferentielRepository;
use Humanome\Tests\TestDb;
use PDO;
use PHPUnit\Framework\Attributes\TestDox;
use PHPUnit\Framework\TestCase;

/**
 * UC-EPI-02 — Voter sur une proposition : tests UNITAIRES.
 *
 * Fiche : docs/cas-utilisation/epistemiarque/UC-EPI-02-voter-proposition.md
 *
 * Logique appelée directement : MajorityTally (règle de majorité des membres,
 * pure), Electorate (corps électoral courant), et le dépôt / décompte /
 * listing des bulletins aux deux grains — CompetenceGovernance (compétence
 * atomique) et ReferentielGovernance (version complète du référentiel).
 */
final class UcEpi02VoterPropositionTest extends TestCase
{
    private static PDO $pdo;

    public static function setUpBeforeClass(): void
    {
        self::$pdo = TestDb::fresh();
        (new MigrationRunner(self::$pdo, MigrationRunner::defaultMigrationsDir()))->run();
    }

    protected function setUp(): void
    {
        foreach ([
            'referentiel_snapshot_competences', 'competence_votes', 'competence_versions',
            'referentiel_votes', 'referentiel_versions', 'user_roles', 'users',
        ] as $table) {
            self::$pdo->exec('DELETE FROM ' . $table);
        }
    }

    private static function createUser(string $name, string ...$roles): int
    {
        self::$pdo->prepare('INSERT INTO users (email, password_hash, display_name) VALUES (?, ?, ?)')
            ->execute([uniqid('epi', true) . '@example.org', 'x', $name]);
        $userId = (int) self::$pdo->lastInsertId();
        $bind = self::$pdo->prepare('INSERT INTO user_roles (user_id, role_id) SELECT ?, id FROM roles WHERE name = ?');
        foreach ($roles as $role) {
            $bind->execute([$userId, $role]);
        }

        return $userId;
    }

    private static function revokeRole(int $userId, string $role): void
    {
        self::$pdo->prepare('DELETE ur FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = ? AND r.name = ?')
            ->execute([$userId, $role]);
    }

    /** Proposition de compétence au vote (1.01 : 1.0.0 publiée → 1.1.0 au vote). */
    private static function competenceProposal(): int
    {
        $repo = new CompetenceRepository(self::$pdo);
        $repo->importPublishedCompetence('1.01', 'Pensée Critique', 1, [
            'identite' => ['code' => '1.01', 'nom' => 'Pensée Critique', 'definition' => 'Douter.'],
        ]);
        $draft = $repo->createDraft('1.01', '1.1.0');
        (new CompetenceGovernance(self::$pdo))->submit($draft['id'], null, null);

        return $draft['id'];
    }

    /** Proposition de version du référentiel au vote (7.0.0 publiée → 7.1.0 au vote). */
    private static function referentielProposal(): int
    {
        $repo = new ReferentielRepository(self::$pdo);
        $doc = json_decode((string) file_get_contents(\dirname(__DIR__, 4) . '/schemas/fixtures/referentiel-respire-v7.json'), true, 512, JSON_THROW_ON_ERROR);
        $repo->importPublishedDocument($doc, 'Import initial');
        $draft = $repo->createDraft(ReferentielRepository::DEFAULT_REFERENTIEL_ID, '7.0.0', '7.1.0');
        (new ReferentielGovernance(self::$pdo))->submit($draft['id'], null, null);

        return $draft['id'];
    }

    #[TestDox('UC-EPI-02-U01 — MajorityTally : seuil = floor(N/2)+1 de TOUT l’électorat (1→1, 2→2, 3→2, 4→3, 5→3, 6→4)')]
    public function testU01ThresholdIsAMajorityOfMembers(): void
    {
        $zero = ['pour' => 0, 'contre' => 0, 'abstention' => 0];
        foreach ([1 => 1, 2 => 2, 3 => 2, 4 => 3, 5 => 3, 6 => 4, 61 => 31] as $members => $threshold) {
            $tally = MajorityTally::compute($members, $zero);
            self::assertSame($threshold, $tally['threshold'], $members . ' membres');
            self::assertSame($members, $tally['notVoted']);
            self::assertSame('pending', $tally['outcome']);
        }
        self::assertSame(
            ['electorateSize', 'threshold', 'pour', 'contre', 'abstention', 'notVoted', 'outcome', 'reached'],
            array_keys(MajorityTally::compute(3, $zero)),
        );
    }

    #[TestDox('UC-EPI-02-U02 — MajorityTally : adoptée / rejetée / en cours / bloquée ; abstentions et non-votants rendent le passage plus dur')]
    public function testU02Outcomes(): void
    {
        $t = static fn (int $n, int $pour, int $contre, int $abst): array => MajorityTally::compute($n, ['pour' => $pour, 'contre' => $contre, 'abstention' => $abst]);

        self::assertSame(['adopted', true], [$t(3, 2, 1, 0)['outcome'], $t(3, 2, 1, 0)['reached']]);
        self::assertSame(['rejected', false], [$t(3, 1, 2, 0)['outcome'], $t(3, 1, 2, 0)['reached']]);
        // 4 membres, 2 pour + 2 abstentions : majorité des VOTANTS mais pas des MEMBRES.
        self::assertSame('pending', $t(4, 2, 0, 2)['outcome']);
        self::assertSame(0, $t(4, 2, 0, 2)['notVoted']);
        // 5 membres, 2 pour, personne d'autre : en cours, 3 n'ont pas voté.
        self::assertSame(['pending', 3], [$t(5, 2, 0, 0)['outcome'], $t(5, 2, 0, 0)['notVoted']]);

        $blocked = $t(0, 0, 0, 0);
        self::assertSame(['blocked', null, false, 0], [$blocked['outcome'], $blocked['threshold'], $blocked['reached'], $blocked['notVoted']]);
    }

    #[TestDox('UC-EPI-02-U03 — Electorate : comptes portant le rôle épistémiarque, non supprimés (l’admin seul n’en fait pas partie)')]
    public function testU03ElectorateIsTheCurrentEpistemiarqueMembers(): void
    {
        $a = self::createUser('Alix', 'epistemiarque');
        $b = self::createUser('Bao', 'apprenant', 'epistemiarque');
        self::createUser('Admin', 'admin');
        self::createUser('Maya', 'apprenant', 'cartographe');
        $gone = self::createUser('Parti', 'epistemiarque');
        self::$pdo->exec('UPDATE users SET deleted_at = NOW() WHERE id = ' . $gone);

        self::assertSame([$a, $b], Electorate::ids(self::$pdo));
        self::assertSame(2, Electorate::size(self::$pdo));

        $governance = new ReferentielGovernance(self::$pdo);
        self::assertSame([$a, $b], $governance->electorateIds());
        self::assertSame(2, $governance->electorateSize());

        self::revokeRole($b, 'epistemiarque');
        self::assertSame([$a], Electorate::ids(self::$pdo), 'recalculé à chaque lecture');
    }

    #[TestDox('UC-EPI-02-U04 — CompetenceGovernance::castVote : valeur invalide → 422, inconnue → null, hors vote → 409, un bulletin par membre (upsert), commentaire rogné')]
    public function testU04CompetenceCastVote(): void
    {
        $id = self::competenceProposal();
        $alix = self::createUser('Alix', 'epistemiarque');
        self::createUser('Bao', 'epistemiarque');
        self::createUser('Chloé', 'epistemiarque');
        $governance = new CompetenceGovernance(self::$pdo);

        try {
            $governance->castVote($id, $alix, 'oui', null);
            self::fail('bulletin « oui » accepté');
        } catch (InvalidDocumentException $e) {
            self::assertSame(['/vote' => ['Vote invalide']], $e->getErrors());
        }
        self::assertNull($governance->castVote(999999, $alix, 'pour', null));

        $tally = $governance->castVote($id, $alix, 'pour', '  Bien instruit.  ');
        self::assertSame([1, 2, 'pending'], [$tally['pour'], $tally['threshold'], $tally['outcome']]);
        $tally = $governance->castVote($id, $alix, 'contre', '   ');
        self::assertSame([0, 1], [$tally['pour'], $tally['contre']], 'le vote est remplacé, pas ajouté');
        $row = self::$pdo->query('SELECT COUNT(*) AS n, MAX(comment) AS c FROM competence_votes WHERE competence_version_id = ' . $id)->fetch();
        self::assertSame([1, null], [(int) $row['n'], $row['c']], 'commentaire vide → NULL');

        $draft = (new CompetenceRepository(self::$pdo))->createDraft('1.01', '1.2.0');
        $this->expectException(ConflictException::class);
        $this->expectExceptionMessage('proposition soumise au vote');
        $governance->castVote($draft['id'], $alix, 'pour', null);
    }

    #[TestDox('UC-EPI-02-U05 — CompetenceGovernance::tally : seuls comptent les bulletins des membres COURANTS, contre l’électorat courant')]
    public function testU05CompetenceTallyUsesTheCurrentElectorate(): void
    {
        $id = self::competenceProposal();
        $alix = self::createUser('Alix', 'epistemiarque');
        $bao = self::createUser('Bao', 'epistemiarque');
        self::createUser('Chloé', 'epistemiarque');
        $governance = new CompetenceGovernance(self::$pdo);
        $governance->castVote($id, $alix, 'pour', null);
        $governance->castVote($id, $bao, 'pour', null);
        self::assertSame('adopted', $governance->tally($id)['outcome']);

        self::revokeRole($bao, 'epistemiarque');
        $tally = $governance->tally($id);
        self::assertSame([2, 2, 1, 'pending'], [$tally['electorateSize'], $tally['threshold'], $tally['pour'], $tally['outcome']]);

        self::createUser('Dan', 'epistemiarque');
        self::assertSame([3, 2], [$governance->tally($id)['electorateSize'], $governance->tally($id)['threshold']]);
    }

    #[TestDox('UC-EPI-02-U06 — CompetenceGovernance::votes : bulletins des membres courants, nom affiché, commentaire, ordre de dépôt')]
    public function testU06CompetenceVotesListing(): void
    {
        $id = self::competenceProposal();
        $alix = self::createUser('Alix', 'epistemiarque');
        $bao = self::createUser('Bao', 'epistemiarque');
        $chloe = self::createUser('Chloé', 'epistemiarque');
        $governance = new CompetenceGovernance(self::$pdo);
        $governance->castVote($id, $alix, 'pour', 'Bien instruit.');
        $governance->castVote($id, $bao, 'abstention', null);
        $governance->castVote($id, $chloe, 'contre', 'Recouvre 1.02');
        self::$pdo->exec("UPDATE competence_votes SET updated_at = '2026-09-01 10:00:00' WHERE user_id = {$bao}");
        self::$pdo->exec("UPDATE competence_votes SET updated_at = '2026-09-02 10:00:00' WHERE user_id = {$alix}");
        self::$pdo->exec("UPDATE competence_votes SET updated_at = '2026-09-03 10:00:00' WHERE user_id = {$chloe}");
        self::revokeRole($chloe, 'epistemiarque');

        $votes = $governance->votes($id);

        self::assertSame(
            [
                ['userId' => $bao, 'displayName' => 'Bao', 'vote' => 'abstention', 'comment' => null, 'updatedAt' => '2026-09-01 10:00:00'],
                ['userId' => $alix, 'displayName' => 'Alix', 'vote' => 'pour', 'comment' => 'Bien instruit.', 'updatedAt' => '2026-09-02 10:00:00'],
            ],
            $votes,
            'le bulletin d’un ancien membre n’est plus listé',
        );
    }

    #[TestDox('UC-EPI-02-U07 — ReferentielGovernance : mêmes règles au grain version (422 / null / 409 hors vote / upsert / membres courants)')]
    public function testU07ReferentielGovernanceSameRules(): void
    {
        $id = self::referentielProposal();
        $alix = self::createUser('Alix', 'epistemiarque');
        $bao = self::createUser('Bao', 'epistemiarque');
        self::createUser('Chloé', 'epistemiarque');
        $governance = new ReferentielGovernance(self::$pdo);

        try {
            $governance->castVote($id, $alix, 'POUR', null);
            self::fail('valeur hors énumération acceptée');
        } catch (InvalidDocumentException $e) {
            self::assertSame(['/vote' => ['Vote invalide']], $e->getErrors());
        }
        self::assertNull($governance->castVote(999999, $alix, 'pour', null));

        $governance->castVote($id, $alix, 'contre', ' Trop tôt ');
        $tally = $governance->castVote($id, $alix, 'pour', null);
        self::assertSame([1, 0, 2, 'pending'], [$tally['pour'], $tally['contre'], $tally['threshold'], $tally['outcome']]);
        self::assertSame('adopted', $governance->castVote($id, $bao, 'pour', null)['outcome']);
        $byName = array_column($governance->votes($id), null, 'displayName');
        $names = array_keys($byName);
        sort($names);
        self::assertSame(['Alix', 'Bao'], $names, 'un bulletin par membre');
        self::assertSame(['pour', null], [$byName['Alix']['vote'], $byName['Alix']['comment']], 'bulletin remplacé, commentaire compris');

        self::revokeRole($bao, 'epistemiarque');
        self::assertSame('pending', $governance->tally($id)['outcome'], 'bulletin d’un ancien membre écarté');

        $governance->withdraw($id);
        $this->expectException(ConflictException::class);
        $this->expectExceptionMessage('Voting is only open on a proposal submitted for a vote');
        $governance->castVote($id, $alix, 'pour', null);
    }
}
