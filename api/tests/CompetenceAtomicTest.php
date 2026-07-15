<?php

declare(strict_types=1);

namespace Humanome\Tests;

use Humanome\Db;
use Humanome\Referentiel\CompetenceHash;
use Humanome\Referentiel\ConflictException;
use Humanome\Referentiel\InvalidDocumentException;
use Humanome\Referentiel\SnapshotAssembler;

/**
 * Modèle de compétence ATOMIQUE (migration 016) : chaque compétence évolue
 * INDÉPENDAMMENT (édition/versionnage/gouvernance/concurrence par compétence).
 * Verrouille : concurrence optimiste (CAS) contre le lost update, indépendance
 * des compétences, gouvernance par compétence, et le GATE DE PARITÉ (le corps
 * assemblé reste byte-identique au snapshot publié — aucun oracle ne bouge).
 */
final class CompetenceAtomicTest extends CompetenceTestCase
{
    // ------------------------------------------------------- import / seed

    public function testImportIsIdempotent(): void
    {
        $first = self::compRepo()->importPublishedCompetence('1.01', 'Pensée Critique', 1, self::content('1.01', 'Pensée Critique'));
        self::assertSame('imported', $first['status']);
        $second = self::compRepo()->importPublishedCompetence('1.01', 'Pensée Critique', 1, self::content('1.01', 'Pensée Critique'));
        self::assertSame('unchanged', $second['status']);
        self::assertSame($first['id'], $second['id']);
    }

    public function testContentCodeMustMatchTheCompetence(): void
    {
        $this->expectException(InvalidDocumentException::class);
        self::compRepo()->importPublishedCompetence('1.01', 'X', 1, self::content('9.99', 'X'));
    }

    // -------------------------------------------- concurrence optimiste (CAS)

    public function testConcurrentEditsOfTheSameCompetenceCannotLostUpdate(): void
    {
        self::seedCompetence('1.01', 'Pensée Critique', 1);
        $draft = self::compRepo()->createDraft('1.01', '1.1.0', self::createUser('epistemiarque'));
        $baseHash = $draft['contentHash'];

        // Éditeur A enregistre avec le bon hash de base -> OK, le hash change.
        $contentA = $draft['content'];
        $contentA['identite']['definition'] = 'Version de A';
        $savedA = self::compRepo()->updateDraft($draft['id'], $contentA, $baseHash);
        self::assertNotSame($baseHash, $savedA['contentHash']);

        // Éditeur B enregistre en partant du MÊME hash de base périmé -> conflit
        // (son écriture n'écrase pas silencieusement celle de A).
        $contentB = $draft['content'];
        $contentB['identite']['definition'] = 'Version de B';
        try {
            self::compRepo()->updateDraft($draft['id'], $contentB, $baseHash);
            self::fail('Expected ConflictException (stale hash)');
        } catch (ConflictException $e) {
            self::assertStringContainsString('modifiée par un autre', $e->getMessage());
        }
        self::assertSame('Version de A', self::compRepo()->findById($draft['id'])['content']['identite']['definition']);
    }

    public function testMissingIfMatchIsRefused(): void
    {
        self::seedCompetence('1.01', 'Pensée Critique', 1);
        $draft = self::compRepo()->createDraft('1.01', '1.1.0');
        $this->expectException(ConflictException::class);
        self::compRepo()->updateDraft($draft['id'], $draft['content'], null);
    }

    public function testReSavingIdenticalContentIsANoOpNotAConflict(): void
    {
        self::seedCompetence('1.01', 'Pensée Critique', 1);
        $draft = self::compRepo()->createDraft('1.01', '1.1.0');
        // Même contenu, même hash -> 0 ligne changée mais PAS un conflit.
        $again = self::compRepo()->updateDraft($draft['id'], $draft['content'], $draft['contentHash']);
        self::assertSame($draft['contentHash'], $again['contentHash']);
    }

    public function testTwoDifferentCompetencesNeverConflict(): void
    {
        self::seedCompetence('1.01', 'Pensée Critique', 1);
        self::seedCompetence('2.01', 'Écoute', 2);
        $d1 = self::compRepo()->createDraft('1.01', '1.1.0');
        $d2 = self::compRepo()->createDraft('2.01', '1.1.0');

        // Éditer l'une n'affecte JAMAIS l'autre (entités atomiques indépendantes).
        $c1 = $d1['content'];
        $c1['identite']['definition'] = 'édit 1.01';
        self::compRepo()->updateDraft($d1['id'], $c1, $d1['contentHash']);

        $c2 = $d2['content'];
        $c2['identite']['definition'] = 'édit 2.01';
        $saved2 = self::compRepo()->updateDraft($d2['id'], $c2, $d2['contentHash']);
        self::assertSame('édit 2.01', $saved2['content']['identite']['definition']);
        self::assertSame('édit 1.01', self::compRepo()->findById($d1['id'])['content']['identite']['definition']);
    }

    // ------------------------------------------- gouvernance par compétence

    public function testOneCompetenceIsEntérinéeWhileAnotherStaysInDebate(): void
    {
        self::seedCompetence('1.01', 'Pensée Critique', 1);
        self::seedCompetence('2.01', 'Écoute', 2);
        [$a, $b, $c] = [
            self::createUser('epistemiarque'),
            self::createUser('epistemiarque'),
            self::createUser('epistemiarque'),
        ];

        // Proposition sur 1.01 : majorité (2/3) -> entérinable.
        $p1 = self::compRepo()->createDraft('1.01', '1.1.0', $a);
        self::compGovernance()->submit($p1['id'], null, $a);
        self::compGovernance()->castVote($p1['id'], $a, 'pour', null);
        self::compGovernance()->castVote($p1['id'], $b, 'pour', null);
        self::assertTrue(self::compGovernance()->tally($p1['id'])['reached']);

        // Proposition sur 2.01 : encore en débat (1 pour sur seuil 2).
        $p2 = self::compRepo()->createDraft('2.01', '1.1.0', $a);
        self::compGovernance()->submit($p2['id'], null, $a);
        self::compGovernance()->castVote($p2['id'], $a, 'pour', null);
        self::assertSame('pending', self::compGovernance()->tally($p2['id'])['outcome']);

        // On publie 1.01 pendant que 2.01 reste en débat.
        $published = self::compRepo()->publish($p1['id'], 'ok');
        self::assertSame('published', $published['status']);
        self::assertSame('1.1.0', self::compRepo()->latestPublished('1.01')['semver']);
        self::assertSame('review', self::compRepo()->findById($p2['id'])['status']);
        // 2.01 reste sur sa 1.0.0.
        self::assertSame('1.0.0', self::compRepo()->latestPublished('2.01')['semver']);
    }

    public function testPublishRefusedWithoutMajority(): void
    {
        self::seedCompetence('1.01', 'Pensée Critique', 1);
        self::createUser('epistemiarque');
        self::createUser('epistemiarque');
        self::createUser('epistemiarque'); // seuil 2
        $p = self::compRepo()->createDraft('1.01', '1.1.0');
        self::compGovernance()->submit($p['id'], null, null);

        $this->expectException(ConflictException::class);
        self::compRepo()->publish($p['id'], 'trop tôt');
    }

    public function testFrozenWhileVotingThenWithdrawReopens(): void
    {
        self::seedCompetence('1.01', 'Pensée Critique', 1);
        $member = self::createUser('epistemiarque');
        $p = self::compRepo()->createDraft('1.01', '1.1.0');
        self::compGovernance()->submit($p['id'], null, $member);
        self::compGovernance()->castVote($p['id'], $member, 'pour', null);

        // Gelé : édition refusée pendant le vote.
        try {
            self::compRepo()->updateDraft($p['id'], $p['content'], $p['contentHash']);
            self::fail('Expected ConflictException (under vote)');
        } catch (ConflictException $e) {
            self::assertStringContainsString('open for a vote', $e->getMessage());
        }
        $withdrawn = self::compGovernance()->withdraw($p['id']);
        self::assertSame('draft', $withdrawn['status']);
        self::assertSame(0, self::compGovernance()->tally($p['id'])['pour']);
    }

    // ---------------------------------------------------- gate de parité

    public function testAssembledSnapshotIsByteIdenticalToThePublishedReferentiel(): void
    {
        $publishedHash = self::seedFullCorpus();
        $assembled = (new SnapshotAssembler(Db::get()))->structuralHash();
        self::assertSame(
            $publishedHash,
            $assembled,
            'Le corps assemblé depuis les 61 compétences atomiques doit être byte-identique au snapshot publié (parité moteur/Twin9)',
        );
    }

    public function testCutReleaseAssemblesPublishedCompetencesIntoAnImmutableSnapshot(): void
    {
        $publishedHash = self::seedFullCorpus();
        $pdo = Db::get();
        $doc = (new SnapshotAssembler($pdo))->assembleDocument('7.2.0', 'RESPIRE v7.2', 'test');
        $result = self::repo()->cutReleaseFromDocument($doc);

        self::assertSame('imported', $result['status']);
        // Structure inchangée -> même hash que le publié (aucun oracle ne bouge).
        self::assertSame($publishedHash, $result['contentHash']);
        // La 7.2.0 est désormais la dernière publiée, et le lockfile la relie aux 61 compétences.
        self::assertSame('7.2.0', self::repo()->latestPublished(self::RESPIRE)['semver']);
        $links = (int) $pdo->query(
            'SELECT COUNT(*) FROM referentiel_snapshot_competences WHERE snapshot_version_id = ' . (int) $result['id']
        )->fetchColumn();
        self::assertSame(61, $links);

        // Semver non strictement croissant -> refus.
        $stale = (new SnapshotAssembler($pdo))->assembleDocument('7.2.0', 'x', 'x');
        $this->expectException(ConflictException::class);
        self::repo()->cutReleaseFromDocument($stale);
    }

    public function testRichHashIgnoresKeyOrderButChangesWithContent(): void
    {
        $a = self::content('1.01', 'X');
        $b = ['protocole' => $a['protocole'], 'identite' => $a['identite']]; // clés inversées
        self::assertSame(CompetenceHash::compute($a), CompetenceHash::compute($b));
        $c = $a;
        $c['identite']['definition'] = 'autre';
        self::assertNotSame(CompetenceHash::compute($a), CompetenceHash::compute($c));
    }
}
