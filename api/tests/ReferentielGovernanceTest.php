<?php

declare(strict_types=1);

namespace Humanome\Tests;

use Humanome\Db;
use Humanome\Referentiel\ConflictException;
use Humanome\Referentiel\InvalidDocumentException;

/**
 * Collaborative governance of the referentiel (cahier §3.5, new requirement):
 * an épistémiarque edit is a proposal that must be VOTED and validated by a
 * MAJORITY of the épistémiarque members before it is entérinée (published).
 *
 * These tests pin the electorate rule (majority of MEMBERS, not of voters),
 * the frozen-while-voting invariant, withdrawal, the live-electorate recompute,
 * and the N=0 / majority-contre edge cases.
 */
final class ReferentielGovernanceTest extends ReferentielTestCase
{
    /** Fork a fresh draft off the imported 7.0.0 and return its id. */
    private function newDraft(string $semver = '7.1.0'): int
    {
        self::importRespire();

        return (int) self::repo()->createDraft(self::RESPIRE, '7.0.0', $semver, 'Proposition de test')['id'];
    }

    private static function dropEpistemiarqueRole(int $userId): void
    {
        Db::get()->prepare(
            "DELETE FROM user_roles WHERE user_id = ?
             AND role_id = (SELECT id FROM roles WHERE name = 'epistemiarque')"
        )->execute([$userId]);
    }

    // ------------------------------------------------------------ happy path

    public function testMajorityOfMembersEntérineTheProposal(): void
    {
        $draftId = $this->newDraft();
        [$a, $b, $c] = [
            self::createUser('epistemiarque'),
            self::createUser('epistemiarque'),
            self::createUser('epistemiarque'),
        ];
        self::governance()->submit($draftId, null, $a);

        // 3 members -> threshold is 2. One "pour" is not enough.
        self::governance()->castVote($draftId, $a, 'pour', 'Cohérent avec les débats Decidim.');
        $tally = self::governance()->tally($draftId);
        self::assertSame(3, $tally['electorateSize']);
        self::assertSame(2, $tally['threshold']);
        self::assertSame('pending', $tally['outcome']);
        self::assertFalse($tally['reached']);

        // Publishing before the majority is refused.
        try {
            self::repo()->publish($draftId, 'trop tôt');
            self::fail('Expected ConflictException (majority not reached)');
        } catch (ConflictException $e) {
            self::assertStringContainsString('Majorité non atteinte', $e->getMessage());
        }

        // Second "pour" reaches the majority; an abstention does not block it.
        self::governance()->castVote($draftId, $b, 'abstention', null);
        self::governance()->castVote($draftId, $c, 'pour', null);
        $tally = self::governance()->tally($draftId);
        self::assertSame('adopted', $tally['outcome']);
        self::assertTrue($tally['reached']);
        self::assertSame(2, $tally['pour']);
        self::assertSame(1, $tally['abstention']);

        $published = self::repo()->publish($draftId, 'Entérinée par le vote des membres');
        self::assertSame('published', $published['status']);
        self::assertSame('7.1.0', self::repo()->latestPublished(self::RESPIRE)['semver']);
    }

    // ------------------------------------------------------------- rejection

    public function testMajorityContreMarksTheProposalRejectedAndBlocksPublication(): void
    {
        $draftId = $this->newDraft();
        [$a, $b] = [self::createUser('epistemiarque'), self::createUser('epistemiarque')];
        self::createUser('epistemiarque'); // a third, silent member (threshold 2)
        self::governance()->submit($draftId, null, $a);

        self::governance()->castVote($draftId, $a, 'contre', 'Régression sur le pôle 6.');
        self::governance()->castVote($draftId, $b, 'contre', null);

        $tally = self::governance()->tally($draftId);
        self::assertSame('rejected', $tally['outcome']);
        self::assertFalse($tally['reached']);

        try {
            self::repo()->publish($draftId, 'malgré le rejet');
            self::fail('Expected ConflictException (rejected)');
        } catch (ConflictException $e) {
            self::assertStringContainsString('rejetée', $e->getMessage());
        }
    }

    // ----------------------------------------------------------- no electorate

    public function testWithoutEpistemiarqueMembersPublicationIsBlocked(): void
    {
        $draftId = $this->newDraft();
        // No user holds the epistemiarque role: the electorate is empty.
        self::governance()->submit($draftId, null, null);

        $tally = self::governance()->tally($draftId);
        self::assertSame(0, $tally['electorateSize']);
        self::assertNull($tally['threshold']);
        self::assertSame('blocked', $tally['outcome']);

        try {
            self::repo()->publish($draftId, 'sans électeurs');
            self::fail('Expected ConflictException (no electorate)');
        } catch (ConflictException $e) {
            self::assertStringContainsString('épistémiarque', $e->getMessage());
        }
    }

    // ---------------------------------------------------- frozen while voting

    public function testAProposalUnderVoteCannotBeEditedButCanBeWithdrawn(): void
    {
        $draftId = $this->newDraft();
        $member = self::createUser('epistemiarque');
        self::governance()->submit($draftId, null, $member);
        self::governance()->castVote($draftId, $member, 'pour', null);

        // Editing a frozen proposal is refused (it would invalidate the ballot).
        $content = self::repo()->findById($draftId)['content'];
        try {
            self::repo()->updateDraft($draftId, $content);
            self::fail('Expected ConflictException (proposal under vote)');
        } catch (ConflictException $e) {
            self::assertStringContainsString('open for a vote', $e->getMessage());
        }

        // Withdrawing reopens editing AND wipes the ballots.
        $withdrawn = self::governance()->withdraw($draftId);
        self::assertSame('draft', $withdrawn['status']);
        self::assertNull($withdrawn['submittedAt']);
        self::assertSame(0, self::governance()->tally($draftId)['pour']);

        // Editing is possible again.
        self::assertSame('draft', self::repo()->updateDraft($draftId, $content)['status']);
    }

    // ------------------------------------------------- live electorate recompute

    public function testABallotFromASinceRemovedMemberNoLongerCounts(): void
    {
        $draftId = $this->newDraft();
        [$a, $b, $c] = [
            self::createUser('epistemiarque'),
            self::createUser('epistemiarque'),
            self::createUser('epistemiarque'),
        ];
        self::governance()->submit($draftId, null, $a);
        self::governance()->castVote($draftId, $a, 'pour', null);
        self::governance()->castVote($draftId, $b, 'pour', null);
        self::assertTrue(self::governance()->tally($draftId)['reached']); // 2/3 -> adopted

        // A loses the role: electorate shrinks to {B, C}, only B voted "pour".
        self::dropEpistemiarqueRole($a);
        $tally = self::governance()->tally($draftId);
        self::assertSame(2, $tally['electorateSize']);
        self::assertSame(1, $tally['pour']);
        self::assertSame(2, $tally['threshold']);
        self::assertSame('pending', $tally['outcome']);
        self::assertFalse($tally['reached']);
    }

    // ------------------------------------------------------------- vote upsert

    public function testAMemberCanChangeTheirBallot(): void
    {
        $draftId = $this->newDraft();
        $member = self::createUser('epistemiarque');
        self::governance()->submit($draftId, null, $member);

        self::governance()->castVote($draftId, $member, 'contre', 'réserve initiale');
        self::assertSame(1, self::governance()->tally($draftId)['contre']);

        self::governance()->castVote($draftId, $member, 'pour', 'levée après discussion');
        $tally = self::governance()->tally($draftId);
        self::assertSame(0, $tally['contre']);
        self::assertSame(1, $tally['pour']);
        // One ballot per member, not two.
        self::assertCount(1, self::governance()->votes($draftId));
    }

    public function testResubmitStartsAFreshVoteRound(): void
    {
        $draftId = $this->newDraft();
        $member = self::createUser('epistemiarque');
        self::governance()->submit($draftId, null, $member);
        self::governance()->castVote($draftId, $member, 'pour', null);
        self::governance()->withdraw($draftId);

        self::governance()->submit($draftId, null, $member);
        self::assertSame(0, self::governance()->tally($draftId)['pour']);
    }

    // -------------------------------------------------------------- guardrails

    public function testVotingIsRefusedOutsideOfReview(): void
    {
        $draftId = $this->newDraft();
        $member = self::createUser('epistemiarque');

        try {
            self::governance()->castVote($draftId, $member, 'pour', null);
            self::fail('Expected ConflictException (not under vote)');
        } catch (ConflictException $e) {
            self::assertStringContainsString('submitted for a vote', $e->getMessage());
        }
    }

    public function testInvalidBallotValueIsRejected(): void
    {
        $draftId = $this->newDraft();
        $member = self::createUser('epistemiarque');
        self::governance()->submit($draftId, null, $member);

        $this->expectException(InvalidDocumentException::class);
        self::governance()->castVote($draftId, $member, 'peut-être', null);
    }

    public function testSubmitStoresAValidDecidimLinkAndRejectsAJunkOne(): void
    {
        $draftId = $this->newDraft();
        $member = self::createUser('epistemiarque');

        $submitted = self::governance()->submit(
            $draftId,
            'https://participer.harmonia.education/processes/referentiel',
            $member,
        );
        self::assertSame(
            'https://participer.harmonia.education/processes/referentiel',
            $submitted['decidimUrl'],
        );

        self::governance()->withdraw($draftId);
        $this->expectException(InvalidDocumentException::class);
        self::governance()->submit($draftId, 'javascript:alert(1)', $member);
    }
}
