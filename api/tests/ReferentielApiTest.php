<?php

declare(strict_types=1);

namespace Humanome\Tests;

use Humanome\Referentiel\ContentHash;

/**
 * HTTP tests of the referentiel module (P4.2/P4.3) against humanome_test:
 * public reads, epistemiarque draft lifecycle, immutability, semver rule.
 */
final class ReferentielApiTest extends ReferentielTestCase
{
    // ---------------------------------------------------------- public reads

    public function testGetReferentielIs404WithoutPublishedVersion(): void
    {
        $response = $this->request('GET', '/referentiel');

        self::assertSame(404, $response->getStatusCode());
    }

    public function testGetReferentielReturnsLatestPublishedDocument(): void
    {
        self::importRespire();

        $response = $this->request('GET', '/referentiel');

        self::assertSame(200, $response->getStatusCode());
        $doc = self::body($response);
        self::assertSame('referentiel', $doc['kind']);
        self::assertSame(self::RESPIRE, $doc['id']);
        self::assertSame('7.0.0', $doc['version']);
        self::assertCount(7, $doc['poles']);
        self::assertCount(61, $doc['competences']);
    }

    public function testVersionsListsMetadataWithoutContent(): void
    {
        self::importRespire();

        $response = $this->request('GET', '/referentiel/versions');

        self::assertSame(200, $response->getStatusCode());
        $versions = self::body($response);
        self::assertCount(1, $versions);
        $meta = $versions[0];
        self::assertSame(self::RESPIRE, $meta['referentielId']);
        self::assertSame('7.0.0', $meta['semver']);
        self::assertSame('RESPIRE v7', $meta['label']);
        self::assertSame('published', $meta['status']);
        self::assertSame(self::IMPORT_NOTE, $meta['releaseNote']);
        self::assertNotEmpty($meta['publishedAt']);
        self::assertMatchesRegularExpression('/^[0-9a-f]{64}$/', $meta['contentHash']);
        self::assertArrayNotHasKey('content', $meta);
        self::assertArrayNotHasKey('poles', $meta);
    }

    public function testGetVersionBySemver(): void
    {
        self::importRespire();

        $found = $this->request('GET', '/referentiel/versions/7.0.0');
        self::assertSame(200, $found->getStatusCode());
        self::assertSame('7.0.0', self::body($found)['version']);

        $missing = $this->request('GET', '/referentiel/versions/9.9.9');
        self::assertSame(404, $missing->getStatusCode());
    }

    public function testDiffIs404ForUnknownVersion(): void
    {
        self::importRespire();

        $response = $this->request('GET', '/referentiel/diff/7.0.0/9.9.9');

        self::assertSame(404, $response->getStatusCode());
    }

    // ------------------------------------------------------------------ auth

    public function testDraftRoutesRequireAuthentication(): void
    {
        self::importRespire();

        $response = $this->request('POST', '/referentiel/drafts', ['from' => '7.0.0', 'semver' => '7.1.0']);

        self::assertSame(401, $response->getStatusCode());
    }

    public function testDraftRoutesRequireEpistemiarqueRole(): void
    {
        self::importRespire();
        self::loginAs(self::createUser('apprenant'));

        $response = $this->request('POST', '/referentiel/drafts', ['from' => '7.0.0', 'semver' => '7.1.0']);

        self::assertSame(403, $response->getStatusCode());
    }

    // -------------------------------------------------- draft lifecycle (P4.3)

    public function testDraftEditPublishThenReadableDiff(): void
    {
        self::importRespire();
        self::loginAs(self::createUser('epistemiarque'));

        // 1. New draft forked from the published 7.0.0.
        $created = $this->request('POST', '/referentiel/drafts', [
            'from' => '7.0.0',
            'semver' => '7.1.0',
            'label' => 'RESPIRE v7.1 (test)',
        ]);
        self::assertSame(201, $created->getStatusCode());
        $draft = self::body($created);
        self::assertSame('draft', $draft['status']);
        self::assertSame('7.1.0', $draft['semver']);
        self::assertSame('7.1.0', $draft['content']['version']);
        $draftId = $draft['id'];

        // 2. Edit: rename 1.01, move 7.08 to pole 6, replace one competence
        //    of pole 2, rename pole 5 (61 competences stay 61).
        [$edited, $removedCode] = self::editedDocument($draft['content']);
        $updated = $this->request('PUT', "/referentiel/drafts/{$draftId}", $edited);
        self::assertSame(200, $updated->getStatusCode());
        $updatedBody = self::body($updated);
        self::assertSame('draft', $updatedBody['status']);
        // Content hash recomputed server-side on every write.
        self::assertSame(ContentHash::compute($edited), $updatedBody['contentHash']);

        // 2b. Open a vote and approve it. The single logged-in épistémiarque is
        //     the whole electorate (threshold 1), so one "pour" entérine.
        $submitted = $this->request('POST', "/referentiel/drafts/{$draftId}/submit", [
            'decidimUrl' => 'https://participer.harmonia.education/processes/referentiel',
        ]);
        self::assertSame(200, $submitted->getStatusCode());
        self::assertSame('review', self::body($submitted)['status']);

        // A frozen proposal can no longer be edited (votes would be invalidated).
        self::assertSame(409, $this->request('PUT', "/referentiel/drafts/{$draftId}", $edited)->getStatusCode());

        $voted = $this->request('POST', "/referentiel/proposals/{$draftId}/votes", ['vote' => 'pour']);
        self::assertSame(200, $voted->getStatusCode());
        self::assertTrue(self::body($voted)['tally']['reached']);

        // 3. Publish with a release note.
        $published = $this->request('POST', "/referentiel/drafts/{$draftId}/publish", [
            'releaseNote' => 'Version de test P4 : renommage, déplacement, remplacement',
        ]);
        self::assertSame(200, $published->getStatusCode());
        $publishedBody = self::body($published);
        self::assertSame('published', $publishedBody['status']);
        self::assertNotEmpty($publishedBody['publishedAt']);

        // 4. The latest published version is now 7.1.0.
        $latest = self::body($this->request('GET', '/referentiel'));
        self::assertSame('7.1.0', $latest['version']);
        $versions = self::body($this->request('GET', '/referentiel/versions'));
        self::assertSame(['7.1.0', '7.0.0'], array_column($versions, 'semver'));

        // 5. Readable structural diff 7.0.0 -> 7.1.0.
        $response = $this->request('GET', '/referentiel/diff/7.0.0/7.1.0');
        self::assertSame(200, $response->getStatusCode());
        $diff = self::body($response);

        self::assertFalse($diff['identical']);
        self::assertSame('7.0.0', $diff['from']['version']);
        self::assertSame('7.1.0', $diff['to']['version']);

        self::assertSame(['2.99'], array_column($diff['competences']['added'], 'code'));
        self::assertSame([$removedCode], array_column($diff['competences']['removed'], 'code'));
        self::assertSame(['1.01'], array_column($diff['competences']['renamed'], 'code'));
        self::assertSame('Pensée Critique Augmentée (test)', $diff['competences']['renamed'][0]['to']);
        self::assertSame([[
            'code' => '7.08',
            'nom' => 'Gestion de Crise en Temps Réel',
            'fromPole' => 7,
            'toPole' => 6,
        ]], $diff['competences']['moved']);
        self::assertSame([5], array_column($diff['poles']['modified'], 'num'));
        self::assertArrayHasKey('nom', $diff['poles']['modified'][0]['changes']);

        self::assertSame([
            'polesAdded' => 0,
            'polesRemoved' => 0,
            'polesModified' => 1,
            'competencesAdded' => 1,
            'competencesRemoved' => 1,
            'competencesRenamed' => 1,
            'competencesMoved' => 1,
        ], $diff['summary']);
    }

    public function testSubmitIsRefusedWhenSemverIsNotStrictlyIncreasing(): void
    {
        self::importRespire();
        self::loginAs(self::createUser('epistemiarque'));

        $created = $this->request('POST', '/referentiel/drafts', [
            'from' => '7.0.0',
            'semver' => '6.9.0',
        ]);
        self::assertSame(201, $created->getStatusCode());
        $draftId = self::body($created)['id'];

        // The semver rule is enforced up front: a stale proposal cannot even
        // open a vote, so members never deliberate on an unpublishable version.
        $response = $this->request('POST', "/referentiel/drafts/{$draftId}/submit");

        self::assertSame(409, $response->getStatusCode());
        self::assertStringContainsString('strictly increasing', self::body($response)['error']);
        self::assertSame('draft', self::repo()->findById($draftId)['status']);
    }

    public function testPublishIsRefusedForADraftNeverSubmittedForVote(): void
    {
        self::importRespire();
        self::loginAs(self::createUser('epistemiarque'));

        $draftId = self::body($this->request('POST', '/referentiel/drafts', [
            'from' => '7.0.0',
            'semver' => '7.1.0',
        ]))['id'];

        // No vote was opened: publication is gated on a majority decision.
        $response = $this->request('POST', "/referentiel/drafts/{$draftId}/publish");

        self::assertSame(409, $response->getStatusCode());
        self::assertStringContainsString('submitted for a vote', self::body($response)['error']);
        self::assertSame('draft', self::repo()->findById($draftId)['status']);
    }

    public function testAnyWriteOnPublishedVersionIsConflict(): void
    {
        $imported = self::importRespire();
        self::loginAs(self::createUser('epistemiarque'));

        $put = $this->request('PUT', "/referentiel/drafts/{$imported['id']}", self::respireDocument());
        self::assertSame(409, $put->getStatusCode());

        $publish = $this->request('POST', "/referentiel/drafts/{$imported['id']}/publish");
        self::assertSame(409, $publish->getStatusCode());

        // The published row is untouched.
        self::assertSame('published', self::repo()->findById($imported['id'])['status']);
    }

    public function testInvalidDraftContentIsRejectedWith422(): void
    {
        self::importRespire();
        self::loginAs(self::createUser('epistemiarque'));

        $created = self::body($this->request('POST', '/referentiel/drafts', [
            'from' => '7.0.0',
            'semver' => '7.1.0',
        ]));
        $draftId = $created['id'];

        // 60 competences instead of 61: schema violation.
        $invalid = $created['content'];
        array_pop($invalid['competences']);
        $response = $this->request('PUT', "/referentiel/drafts/{$draftId}", $invalid);
        self::assertSame(422, $response->getStatusCode());
        self::assertNotEmpty(self::body($response)['errors']);

        // Integrity violation the schema cannot express: duplicated code.
        $duplicated = $created['content'];
        $duplicated['competences'][1]['code'] = $duplicated['competences'][0]['code'];
        $response = $this->request('PUT', "/referentiel/drafts/{$draftId}", $duplicated);
        self::assertSame(422, $response->getStatusCode());

        // The draft was not modified by either rejected write.
        self::assertSame($created['contentHash'], self::repo()->findById($draftId)['contentHash']);
    }

    public function testDraftCreationConflictsAndUnknownSource(): void
    {
        self::importRespire();
        self::loginAs(self::createUser('epistemiarque'));

        $first = $this->request('POST', '/referentiel/drafts', ['from' => '7.0.0', 'semver' => '7.1.0']);
        self::assertSame(201, $first->getStatusCode());

        $duplicate = $this->request('POST', '/referentiel/drafts', ['from' => '7.0.0', 'semver' => '7.1.0']);
        self::assertSame(409, $duplicate->getStatusCode());

        $unknownSource = $this->request('POST', '/referentiel/drafts', ['from' => '5.0.0', 'semver' => '7.2.0']);
        self::assertSame(404, $unknownSource->getStatusCode());

        $badSemver = $this->request('POST', '/referentiel/drafts', ['from' => '7.0.0', 'semver' => 'v8']);
        self::assertSame(422, $badSemver->getStatusCode());
    }

    // ----------------------------------------------------------------- helper

    /**
     * @param array<string, mixed> $content valid v7-shaped document
     * @return array{0: array<string, mixed>, 1: string} edited document + removed code
     */
    private static function editedDocument(array $content): array
    {
        $content['label'] = 'RESPIRE v7.1 (test)';

        $removedCode = null;
        $competences = [];
        foreach ($content['competences'] as $competence) {
            if ($competence['code'] === '1.01') {
                $competence['nom'] = 'Pensée Critique Augmentée (test)';
            }
            if ($competence['code'] === '7.08') {
                $competence['pole'] = 6;
            }
            if ($removedCode === null && $competence['pole'] === 2) {
                $removedCode = $competence['code'];
                continue; // replaced below to keep the count at 61
            }
            $competences[] = $competence;
        }
        $competences[] = ['code' => '2.99', 'nom' => 'Compétence de test ajoutée', 'pole' => 2];
        $content['competences'] = $competences;

        foreach ($content['poles'] as $i => $pole) {
            if ($pole['num'] === 5) {
                $content['poles'][$i]['nom'] = $pole['nom'] . ' (édité)';
            }
        }

        self::assertNotNull($removedCode);
        self::assertCount(61, $content['competences']);

        return [$content, $removedCode];
    }
}
