<?php

declare(strict_types=1);

namespace Humanome\Tests;

use Humanome\Db;
use Humanome\Referentiel\ConflictException;
use Humanome\Referentiel\InvalidDocumentException;

/**
 * Exigence (cahier §3.5, éditeur collaboratif des épistémiarques) : une édition
 * soumise ouvre un VOTE et n'est entérinée qu'à la MAJORITÉ des membres
 * (floor(N/2)+1 de l'électorat courant) ; majorité contre → rejet ; N=0 →
 * publication bloquée ; re-soumission = tour de vote frais ; lien Decidim en
 * renfort de la discussion — le tout AU GRAIN COMPÉTENCE (granularité atomique).
 *
 * Ces cas limites n'étaient couverts qu'au grain document
 * (ReferentielGovernanceTest) alors que CompetenceGovernance::tally duplique la
 * logique de filtrage des bulletins : ce fichier verrouille le grain compétence.
 */
final class CompetenceGovernanceTest extends CompetenceTestCase
{
    /** Seed 1.01 publiée et forke une proposition 1.1.0 ; renvoie son id. */
    private static function newProposal(?int $submittedBy = null, ?string $decidimUrl = null): int
    {
        self::seedCompetence('1.01', 'Pensée Critique', 1);
        $draft = self::compRepo()->createDraft('1.01', '1.1.0', $submittedBy);
        self::compGovernance()->submit($draft['id'], $decidimUrl, $submittedBy);

        return $draft['id'];
    }

    private static function dropEpistemiarqueRole(int $userId): void
    {
        Db::get()->prepare(
            "DELETE FROM user_roles WHERE user_id = ?
             AND role_id = (SELECT id FROM roles WHERE name = 'epistemiarque')"
        )->execute([$userId]);
    }

    private static function ballotCount(int $competenceVersionId): int
    {
        $stmt = Db::get()->prepare(
            'SELECT COUNT(*) FROM competence_votes WHERE competence_version_id = ?'
        );
        $stmt->execute([$competenceVersionId]);

        return (int) $stmt->fetchColumn();
    }

    // --------------------------------------------------------------- rejet

    public function testMajorityContreRejectsTheCompetenceProposalAndBlocksPublication(): void
    {
        [$a, $b] = [self::createUser('epistemiarque'), self::createUser('epistemiarque')];
        self::createUser('epistemiarque'); // 3e membre silencieux (seuil 2)
        $id = self::newProposal($a);

        self::compGovernance()->castVote($id, $a, 'contre', 'Régression sur le protocole.');
        self::compGovernance()->castVote($id, $b, 'contre', null);

        $tally = self::compGovernance()->tally($id);
        self::assertSame('rejected', $tally['outcome']);
        self::assertFalse($tally['reached']);
        self::assertSame(2, $tally['contre']);

        try {
            self::compRepo()->publish($id, 'malgré le rejet');
            self::fail('Expected ConflictException (rejected)');
        } catch (ConflictException $e) {
            self::assertStringContainsString('rejetée', $e->getMessage());
        }
        // La compétence en vigueur reste la 1.0.0 : rien n'a été entériné.
        self::assertSame('1.0.0', self::compRepo()->latestPublished('1.01')['semver']);
    }

    // ------------------------------------------------------ électorat vide

    public function testEmptyElectorateBlocksCompetencePublication(): void
    {
        // Aucun compte ne porte le rôle épistémiarque : électorat N=0.
        $id = self::newProposal(null);

        $tally = self::compGovernance()->tally($id);
        self::assertSame(0, $tally['electorateSize']);
        self::assertNull($tally['threshold']);
        self::assertSame('blocked', $tally['outcome']);
        self::assertFalse($tally['reached']);

        try {
            self::compRepo()->publish($id, 'sans électeurs');
            self::fail('Expected ConflictException (no electorate)');
        } catch (ConflictException $e) {
            self::assertStringContainsString('aucun compte ne porte le rôle épistémiarque', $e->getMessage());
        }

        // Au niveau HTTP : un admin passe la garde de rôle mais la publication
        // reste bloquée (409) — la majorité se calcule sur les seuls membres.
        self::loginAs(self::createUser('admin'));
        $response = $this->request('POST', "/competences/drafts/{$id}/publish", ['releaseNote' => 'x']);
        self::assertSame(409, $response->getStatusCode());
        self::assertStringContainsString('épistémiarque', self::body($response)['error']);
    }

    // ------------------------------------- électorat recalculé à la lecture

    public function testBallotFromASinceRemovedMemberNoLongerCountsAtCompetenceGrain(): void
    {
        [$a, $b] = [self::createUser('epistemiarque'), self::createUser('epistemiarque')];
        self::createUser('epistemiarque'); // 3e membre (seuil 2)
        $id = self::newProposal($a);
        self::compGovernance()->castVote($id, $a, 'pour', null);
        self::compGovernance()->castVote($id, $b, 'pour', null);
        self::assertTrue(self::compGovernance()->tally($id)['reached']); // 2/3 -> adopted

        // A perd le rôle : l'électorat se réduit à {B, C}, seul B a voté « pour ».
        self::dropEpistemiarqueRole($a);
        $tally = self::compGovernance()->tally($id);
        self::assertSame(2, $tally['electorateSize']);
        self::assertSame(1, $tally['pour']);
        self::assertSame(2, $tally['threshold']);
        self::assertSame('pending', $tally['outcome']);
        self::assertFalse($tally['reached']);
    }

    // ------------------------------------------------- re-soumission fraîche

    public function testResubmitStartsAFreshVoteRoundOnCompetenceVotes(): void
    {
        $member = self::createUser('epistemiarque');
        $id = self::newProposal($member);
        self::compGovernance()->castVote($id, $member, 'pour', null);
        self::assertSame(1, self::ballotCount($id));

        self::compGovernance()->withdraw($id);
        self::assertSame(0, self::ballotCount($id)); // bulletins effacés au retrait

        self::compGovernance()->submit($id, null, $member);
        $tally = self::compGovernance()->tally($id);
        self::assertSame(0, $tally['pour']);
        self::assertSame(0, self::ballotCount($id)); // le nouveau tour part de zéro
    }

    // ---------------------------------------------------------- lien Decidim

    public function testSubmitStoresAValidDecidimLinkAndRejectsAJunkOne(): void
    {
        $member = self::createUser('epistemiarque');
        self::seedCompetence('1.01', 'Pensée Critique', 1);
        $draft = self::compRepo()->createDraft('1.01', '1.1.0', $member);

        $submitted = self::compGovernance()->submit(
            $draft['id'],
            'https://participer.harmonia.education/processes/referentiel',
            $member,
        );
        self::assertSame(
            'https://participer.harmonia.education/processes/referentiel',
            $submitted['decidimUrl'],
        );

        self::compGovernance()->withdraw($draft['id']);
        $this->expectException(InvalidDocumentException::class);
        self::compGovernance()->submit($draft['id'], 'javascript:alert(1)', $member);
    }

    public function testSubmitWithAJunkDecidimUrlIs422OverHttp(): void
    {
        $member = self::createUser('epistemiarque');
        self::seedCompetence('1.01', 'Pensée Critique', 1);
        $draft = self::compRepo()->createDraft('1.01', '1.1.0', $member);
        self::loginAs($member);

        $response = $this->request(
            'POST',
            "/competences/drafts/{$draft['id']}/submit",
            ['decidimUrl' => 'pas-une-url'],
        );
        self::assertSame(422, $response->getStatusCode());
        // Le brouillon n'a pas été gelé : la soumission invalide n'ouvre pas de vote.
        self::assertSame('draft', self::compRepo()->findById($draft['id'])['status']);
    }

    // -------------------------------------------- vote réservé aux membres

    public function testVoteIsReservedToEpistemiarqueMembersAdminGets403(): void
    {
        $member = self::createUser('epistemiarque');
        $id = self::newProposal($member);

        // Un admin non-membre passe les autres gardes mais PAS celle du vote.
        self::loginAs(self::createUser('admin'));
        $denied = $this->request('POST', "/competences/proposals/{$id}/votes", ['vote' => 'pour']);
        self::assertSame(403, $denied->getStatusCode());
        self::assertSame(0, self::ballotCount($id));

        // Un membre épistémiarque, lui, vote.
        self::loginAs($member);
        $accepted = $this->request('POST', "/competences/proposals/{$id}/votes", ['vote' => 'pour']);
        self::assertSame(200, $accepted->getStatusCode());
        self::assertSame(1, self::body($accepted)['tally']['pour']);
    }
}
