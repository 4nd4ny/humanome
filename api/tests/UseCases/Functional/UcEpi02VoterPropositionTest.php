<?php

declare(strict_types=1);

namespace Humanome\Tests\UseCases\Functional;

use Humanome\Tests\UseCases\Support\EpiSupport;
use PHPUnit\Framework\Attributes\TestDox;

/**
 * UC-EPI-02 — Voter sur une proposition : tests FONCTIONNELS (API).
 *
 * Fiche : docs/cas-utilisation/epistemiarque/UC-EPI-02-voter-proposition.md
 *
 * Trois membres épistémiarques réels (inscription + activation, session,
 * jeton CSRF) : Alix ouvre la proposition (UC-EPI-01), Bao et Chloé votent.
 * Électorat = 3 membres, seuil de majorité = 2. Les scénarios passent par les
 * routes HTTP des deux grains : compétence atomique (/api/competences/…) et
 * version complète du référentiel (/api/referentiel/…).
 */
final class UcEpi02VoterPropositionTest extends EpiSupport
{
    /** @var array{id: int, csrf: string, sid: string} */
    private array $alix;

    /** @var array{id: int, csrf: string, sid: string} */
    private array $bao;

    /** @var array{id: int, csrf: string, sid: string} */
    private array $chloe;

    protected function setUp(): void
    {
        parent::setUp();
        self::seedCompetence('1.01', 'Pensée Critique', 1, '1.0.0', self::competenceContent('1.01', 'Pensée Critique', 'Douter méthodiquement.'));
        $this->alix = $this->member('alix@example.org', 'Alix');
        $this->bao = $this->member('bao@example.org', 'Bao');
        $this->chloe = $this->member('chloe@example.org', 'Chloé');
    }

    /** Proposition ouverte par Alix : nouvelle définition de 1.01. */
    private function proposal(): int
    {
        return $this->openCompetenceProposal($this->alix, '1.01', '1.1.0', static function (array $content): array {
            $content['identite']['definition'] = 'Douter méthodiquement, y compris de soi.';

            return $content;
        }, 'https://participer.harmonia.education/processes/referentiel/f/12/debates/7');
    }

    /** @param array{id: int, csrf: string, sid: string} $who */
    private function vote(array $who, int $id, mixed $vote, ?string $comment = null, string $grain = 'competences'): \Psr\Http\Message\ResponseInterface
    {
        $body = ['vote' => $vote];
        if ($comment !== null) {
            $body['comment'] = $comment;
        }

        return $this->as_($who, 'POST', '/api/' . $grain . '/proposals/' . $id . '/votes', $body);
    }

    #[TestDox('UC-EPI-02-F01 — nominal : consulter la proposition (contenu, version en vigueur, décompte), voter pour avec commentaire, majorité atteinte')]
    public function testF01NominalVote(): void
    {
        $id = $this->proposal();

        // 1. La liste des propositions au vote, avec leur décompte.
        $list = self::json($this->as_($this->bao, 'GET', '/api/competences/proposals'));
        self::assertSame([$id], array_column($list, 'id'));
        self::assertSame(['electorateSize' => 3, 'threshold' => 2, 'pour' => 0, 'contre' => 0, 'abstention' => 0, 'notVoted' => 3, 'outcome' => 'pending', 'reached' => false], $list[0]['tally']);

        // 2-3. Le détail : contenu proposé face à la version en vigueur.
        $detail = self::json($this->as_($this->bao, 'GET', '/api/competences/proposals/' . $id));
        self::assertSame('review', $detail['status']);
        self::assertSame('1.0.0', $detail['baseVersion']);
        self::assertSame('Douter méthodiquement.', $detail['baseContent']['identite']['definition']);
        self::assertSame('Douter méthodiquement, y compris de soi.', $detail['content']['identite']['definition']);
        self::assertSame('https://participer.harmonia.education/processes/referentiel/f/12/debates/7', $detail['decidimUrl']);
        self::assertSame([], $detail['votes']);

        // 4-5. Bao vote « pour » avec un commentaire ; le décompte revient aussitôt.
        $first = $this->vote($this->bao, $id, 'pour', '  Bien instruit, recouvrement avec 1.02 écarté.  ');
        self::assertSame(200, $first->getStatusCode(), (string) $first->getBody());
        self::assertSame(['tally'], array_keys(self::json($first)));
        self::assertSame([1, 'pending', false], [self::json($first)['tally']['pour'], self::json($first)['tally']['outcome'], self::json($first)['tally']['reached']]);

        // Chloé vote « pour » : 2 voix sur 3 membres = majorité.
        $second = self::json($this->vote($this->chloe, $id, 'pour'))['tally'];
        self::assertSame(['pour' => 2, 'notVoted' => 1, 'outcome' => 'adopted', 'reached' => true], array_intersect_key($second, ['pour' => 0, 'notVoted' => 0, 'outcome' => 0, 'reached' => 0]));

        // 6. Le détail rechargé liste les bulletins nominatifs.
        $votes = self::json($this->as_($this->alix, 'GET', '/api/competences/proposals/' . $id))['votes'];
        $byName = array_column($votes, null, 'displayName');
        self::assertSame(['pour', 'Bien instruit, recouvrement avec 1.02 écarté.'], [$byName['Bao']['vote'], $byName['Bao']['comment']]);
        self::assertSame(['pour', null], [$byName['Chloé']['vote'], $byName['Chloé']['comment']]);
        self::assertSame($this->bao['id'], $byName['Bao']['userId']);
        self::assertSame(2, self::competenceBallots($id));
    }

    #[TestDox('UC-EPI-02-F02 — A1 : un membre change son vote → son bulletin est remplacé, jamais doublé')]
    public function testF02MemberChangesTheirVote(): void
    {
        $id = $this->proposal();
        $this->vote($this->bao, $id, 'pour', 'd’accord');

        $changed = self::json($this->vote($this->bao, $id, 'contre', 'finalement non'))['tally'];

        self::assertSame([0, 1, 2], [$changed['pour'], $changed['contre'], $changed['notVoted']]);
        self::assertSame(1, self::competenceBallots($id));
        $votes = self::json($this->as_($this->bao, 'GET', '/api/competences/proposals/' . $id))['votes'];
        self::assertSame([['Bao', 'contre', 'finalement non']], array_map(static fn (array $v): array => [$v['displayName'], $v['vote'], $v['comment']], $votes));
    }

    #[TestDox('UC-EPI-02-F03 — A2 : majorité « contre » → proposition rejetée, l’entérinement est refusé')]
    public function testF03MajorityAgainstRejects(): void
    {
        $id = $this->proposal();
        $this->vote($this->bao, $id, 'contre');
        $tally = self::json($this->vote($this->chloe, $id, 'contre', 'Recouvre 4.02'))['tally'];
        self::assertSame(['rejected', false], [$tally['outcome'], $tally['reached']]);

        $publish = $this->as_($this->alix, 'POST', '/api/competences/drafts/' . $id . '/publish', ['releaseNote' => 'tentative']);
        self::assertSame(409, $publish->getStatusCode());
        self::assertSame('Cette proposition a été rejetée par la majorité des membres épistémiarques.', self::json($publish)['error']);
        // La proposition reste ouverte : un membre peut encore changer d'avis.
        self::assertSame('pending', self::json($this->vote($this->chloe, $id, 'abstention'))['tally']['outcome']);
    }

    #[TestDox('UC-EPI-02-F04 — A3 : l’électorat change pendant le vote → un nouveau membre relève le seuil (3→4 : 2→3), le bulletin d’un ex-membre est écarté et le seuil recalculé')]
    public function testF04ElectorateChangesDuringTheVote(): void
    {
        $id = $this->proposal();
        $this->vote($this->bao, $id, 'pour');
        $adopted = self::json($this->vote($this->chloe, $id, 'pour'))['tally'];
        self::assertSame([3, 2, 'adopted'], [$adopted['electorateSize'], $adopted['threshold'], $adopted['outcome']]);

        // Dan rejoint l'électorat : 4 membres, N pair → le seuil MONTE à 3 et
        // l'adoption acquise à 2 voix est perdue (seuil recalculé, pas mémorisé).
        $dan = $this->member('dan@example.org', 'Dan');
        $detail = self::json($this->as_($this->alix, 'GET', '/api/competences/proposals/' . $id));
        self::assertSame([4, 3, 2, 'pending'], [$detail['tally']['electorateSize'], $detail['tally']['threshold'], $detail['tally']['pour'], $detail['tally']['outcome']]);

        // L'administration retire le rôle à Chloé (UC-ADM-01) : 3 membres, seuil 2,
        // son bulletin est écarté du décompte et de la liste.
        self::setRoles($this->chloe['id'], ['apprenant']);
        $detail = self::json($this->as_($this->alix, 'GET', '/api/competences/proposals/' . $id));
        self::assertSame([3, 2, 1, 'pending'], [$detail['tally']['electorateSize'], $detail['tally']['threshold'], $detail['tally']['pour'], $detail['tally']['outcome']]);
        self::assertSame(['Bao'], array_column($detail['votes'], 'displayName'));
        self::assertSame(403, $this->vote($this->chloe, $id, 'pour')->getStatusCode(), 'plus membre, plus de vote');

        // Le nouveau membre vote : son bulletin compte aussitôt.
        $tally = self::json($this->vote($dan, $id, 'pour'))['tally'];
        self::assertSame([3, 2, 2, 'adopted'], [$tally['electorateSize'], $tally['threshold'], $tally['pour'], $tally['outcome']]);
    }

    #[TestDox('UC-EPI-02-F05 — A4 : un administrateur non membre consulte le vote mais ne vote pas (403) ; admin ET membre vote')]
    public function testF05AdminFollowsButDoesNotVote(): void
    {
        $id = $this->proposal();
        $admin = $this->member('admin@example.org', 'Admin', ['admin']);

        self::assertSame(200, $this->as_($admin, 'GET', '/api/competences/proposals')->getStatusCode());
        self::assertSame(200, $this->as_($admin, 'GET', '/api/competences/proposals/' . $id)->getStatusCode());
        $denied = $this->vote($admin, $id, 'pour');
        self::assertSame(403, $denied->getStatusCode());
        self::assertSame(0, self::competenceBallots($id));

        $adminMember = $this->member('admin2@example.org', 'Admin membre', ['admin', 'epistemiarque']);
        $tally = self::json($this->vote($adminMember, $id, 'pour'))['tally'];
        self::assertSame([4, 3, 1], [$tally['electorateSize'], $tally['threshold'], $tally['pour']]);
    }

    #[TestDox('UC-EPI-02-F06 — A5 : grain version — liste, détail avec diff contre la dernière publiée, votes jusqu’à la majorité')]
    public function testF06VoteOnAFullReferentielVersion(): void
    {
        self::importRespire();
        $created = $this->as_($this->alix, 'POST', '/api/referentiel/drafts', ['from' => '7.0.0', 'semver' => '7.1.0']);
        self::assertSame(201, $created->getStatusCode(), (string) $created->getBody());
        $draft = self::json($created);
        $doc = $draft['content'];
        foreach ($doc['competences'] as $i => $competence) {
            if ($competence['code'] === '1.01') {
                $doc['competences'][$i]['nom'] = 'Pensée Critique renommée';
            }
        }
        self::assertSame(200, $this->as_($this->alix, 'PUT', '/api/referentiel/drafts/' . $draft['id'], $doc)->getStatusCode());
        self::assertSame(200, $this->as_($this->alix, 'POST', '/api/referentiel/drafts/' . $draft['id'] . '/submit', [])->getStatusCode());

        $list = self::json($this->as_($this->bao, 'GET', '/api/referentiel/proposals'));
        self::assertSame([[$draft['id'], '7.1.0', 'pending']], array_map(static fn (array $p): array => [$p['id'], $p['semver'], $p['tally']['outcome']], $list));

        $detail = self::json($this->as_($this->bao, 'GET', '/api/referentiel/proposals/' . $draft['id']));
        self::assertSame('7.0.0', $detail['baseVersion']);
        self::assertSame(1, $detail['diff']['summary']['competencesRenamed']);
        self::assertSame('Pensée Critique renommée', $detail['diff']['competences']['renamed'][0]['to']);
        self::assertSame([], $detail['votes']);

        $this->vote($this->bao, $draft['id'], 'pour', 'Plus clair', 'referentiel');
        $tally = self::json($this->vote($this->chloe, $draft['id'], 'pour', null, 'referentiel'))['tally'];
        self::assertSame(['adopted', true], [$tally['outcome'], $tally['reached']]);
        self::assertSame(2, self::referentielBallots($draft['id']));
        self::assertSame('Plus clair', array_column(self::json($this->as_($this->bao, 'GET', '/api/referentiel/proposals/' . $draft['id']))['votes'], 'comment', 'displayName')['Bao']);
    }

    #[TestDox('UC-EPI-02-F07 — E1 : sans session → 401 sur la consultation et le vote, aux deux grains')]
    public function testF07AnonymousIsRejected(): void
    {
        $id = $this->proposal();
        foreach ([
            ['GET', '/api/competences/proposals', null],
            ['GET', '/api/competences/proposals/' . $id, null],
            ['POST', '/api/competences/proposals/' . $id . '/votes', ['vote' => 'pour']],
            ['GET', '/api/referentiel/proposals', null],
            ['GET', '/api/referentiel/proposals/1', null],
            ['POST', '/api/referentiel/proposals/1/votes', ['vote' => 'pour']],
        ] as [$method, $path, $body]) {
            self::assertSame(401, $this->anonymous($method, $path, $body)->getStatusCode(), $method . ' ' . $path);
        }
        self::assertSame(0, self::competenceBallots($id));
    }

    #[TestDox('UC-EPI-02-F08 — E2 : compte sans rôle épistémiarque → 403 sur la consultation (liste et détail) et le vote, aux deux grains, aucun bulletin')]
    public function testF08NonMemberIsForbidden(): void
    {
        $id = $this->proposal();
        $maya = $this->member('maya@example.org', 'Maya', ['apprenant', 'cartographe', 'promptologue']);
        foreach ([
            ['GET', '/api/competences/proposals', null],
            ['GET', '/api/competences/proposals/' . $id, null],
            ['POST', '/api/competences/proposals/' . $id . '/votes', ['vote' => 'pour']],
            ['GET', '/api/referentiel/proposals', null],
            ['GET', '/api/referentiel/proposals/1', null],
            ['POST', '/api/referentiel/proposals/1/votes', ['vote' => 'pour']],
        ] as [$method, $path, $body]) {
            self::assertSame(403, $this->as_($maya, $method, $path, $body)->getStatusCode(), $method . ' ' . $path);
        }
        self::assertSame(0, self::competenceBallots($id), 'aucun bulletin pour un non-membre');
    }

    #[TestDox('UC-EPI-02-F09 — E3/E6 : bulletin absent, non textuel ou hors {pour, contre, abstention} → 422 ; corps non JSON → 400 ; aux deux grains, aucun bulletin')]
    public function testF09InvalidBallots(): void
    {
        $id = $this->proposal();
        $path = '/api/competences/proposals/' . $id . '/votes';

        $missing = $this->as_($this->bao, 'POST', $path, ['comment' => 'sans vote']);
        self::assertSame([422, 'Champ "vote" requis'], [$missing->getStatusCode(), self::json($missing)['error']]);
        self::assertSame(422, $this->vote($this->bao, $id, 1)->getStatusCode(), 'valeur non textuelle');
        $unknown = $this->vote($this->bao, $id, 'oui');
        self::assertSame(422, $unknown->getStatusCode());
        self::assertSame(['/vote' => ['Vote invalide']], self::json($unknown)['errors']);
        self::assertSame(400, $this->rawAs($this->bao, 'POST', $path, 'vote=pour')->getStatusCode());
        self::assertSame(0, self::competenceBallots($id));

        self::importRespire();
        $version = self::json($this->as_($this->alix, 'POST', '/api/referentiel/drafts', ['from' => '7.0.0', 'semver' => '7.1.0']));
        $submitted = $this->as_($this->alix, 'POST', '/api/referentiel/drafts/' . $version['id'] . '/submit', []);
        self::assertSame(200, $submitted->getStatusCode(), 'la version est bien au vote : les refus suivants portent sur le bulletin');
        $refPath = '/api/referentiel/proposals/' . $version['id'] . '/votes';
        $refMissing = $this->as_($this->bao, 'POST', $refPath, []);
        self::assertSame([422, 'Field "vote" is required'], [$refMissing->getStatusCode(), self::json($refMissing)['error']]);
        self::assertSame(422, $this->vote($this->bao, $version['id'], 1, null, 'referentiel')->getStatusCode(), 'valeur non textuelle');
        $refUnknown = $this->vote($this->bao, $version['id'], 'Pour', null, 'referentiel');
        self::assertSame(422, $refUnknown->getStatusCode(), 'casse comprise');
        self::assertSame(['/vote' => ['Vote invalide']], self::json($refUnknown)['errors']);
        self::assertSame(400, $this->rawAs($this->bao, 'POST', $refPath, 'vote=pour')->getStatusCode());
        self::assertSame(0, self::referentielBallots($version['id']));
    }

    #[TestDox('UC-EPI-02-F10 — E4 : proposition inconnue ou pas au vote → 404 en consultation ; vote → 404 (inconnue) ou 409 (brouillon, publiée), aux deux grains, aucun bulletin')]
    public function testF10UnknownOrClosedProposal(): void
    {
        $draft = self::json($this->as_($this->alix, 'POST', '/api/competences/1.01/drafts', ['semver' => '1.1.0']));
        $published = self::json($this->anonymous('GET', '/api/competences/1.01'));

        foreach ([$draft['id'], $published['id'], 999999] as $notUnderVote) {
            $response = $this->as_($this->bao, 'GET', '/api/competences/proposals/' . $notUnderVote);
            self::assertSame([404, 'Proposition introuvable'], [$response->getStatusCode(), self::json($response)['error']]);
        }
        self::assertSame(404, $this->vote($this->bao, 999999, 'pour')->getStatusCode());
        $closed = $this->vote($this->bao, $draft['id'], 'pour');
        self::assertSame(409, $closed->getStatusCode());
        self::assertSame('Le vote n\'est ouvert que sur une proposition soumise au vote.', self::json($closed)['error']);
        self::assertSame(409, $this->vote($this->bao, $published['id'], 'pour')->getStatusCode());

        self::assertSame(0, self::competenceBallots($draft['id']) + self::competenceBallots($published['id']), 'aucun bulletin hors vote');

        // Grain version : publiée, brouillon jamais soumis, inconnue.
        $imported = self::importRespire();
        $refDraft = self::json($this->as_($this->alix, 'POST', '/api/referentiel/drafts', ['from' => '7.0.0', 'semver' => '7.1.0']));
        foreach ([$imported['id'], $refDraft['id'], 999999] as $notUnderVote) {
            $response = $this->as_($this->bao, 'GET', '/api/referentiel/proposals/' . $notUnderVote);
            self::assertSame([404, 'Unknown proposal'], [$response->getStatusCode(), self::json($response)['error']], (string) $notUnderVote);
        }
        self::assertSame(409, $this->vote($this->bao, $imported['id'], 'pour', null, 'referentiel')->getStatusCode());
        $refClosed = $this->vote($this->bao, $refDraft['id'], 'pour', null, 'referentiel');
        self::assertSame(409, $refClosed->getStatusCode());
        self::assertStringContainsString('Voting is only open on a proposal submitted for a vote', self::json($refClosed)['error']);
        $refUnknown = $this->vote($this->bao, 999999, 'pour', null, 'referentiel');
        self::assertSame([404, 'Unknown proposal'], [$refUnknown->getStatusCode(), self::json($refUnknown)['error']]);
        self::assertSame(0, self::referentielBallots($imported['id']) + self::referentielBallots($refDraft['id']), 'aucun bulletin hors vote');
    }

    #[TestDox('UC-EPI-02-F11 — E7 : vote avec cookie de session mais sans jeton CSRF → 403, aucun bulletin')]
    public function testF11VoteWithoutCsrfToken(): void
    {
        $id = $this->proposal();

        $response = $this->withoutCsrf($this->bao, 'POST', '/api/competences/proposals/' . $id . '/votes', ['vote' => 'pour']);

        self::assertSame(403, $response->getStatusCode());
        self::assertSame(0, self::competenceBallots($id));
    }

    #[TestDox('UC-EPI-02-F12 — E5 : aucun membre épistémiarque → décompte « bloqué » (seuil nul), personne ne peut voter')]
    public function testF12EmptyElectorateBlocksTheVote(): void
    {
        foreach ([$this->alix, $this->bao, $this->chloe] as $who) {
            self::setRoles($who['id'], ['apprenant']);
        }
        $admin = $this->member('admin@example.org', 'Admin', ['admin']);
        $id = $this->openCompetenceProposal($admin, '1.01', '1.1.0');

        $detail = self::json($this->as_($admin, 'GET', '/api/competences/proposals/' . $id));

        self::assertSame(
            ['electorateSize' => 0, 'threshold' => null, 'pour' => 0, 'contre' => 0, 'abstention' => 0, 'notVoted' => 0, 'outcome' => 'blocked', 'reached' => false],
            $detail['tally'],
        );
        self::assertSame(403, $this->vote($admin, $id, 'pour')->getStatusCode());
        self::assertSame(403, $this->vote($this->bao, $id, 'pour')->getStatusCode());
    }

    #[TestDox('UC-EPI-02-F20 — A3 : un membre supprime son compte (purge réelle) → son bulletin disparaît en cascade, l’électorat se réduit, son ancienne session n’est plus authentifiée (401, CSRF 403)')]
    public function testF20AccountPurgeRemovesTheBallot(): void
    {
        $id = $this->proposal();
        $this->vote($this->bao, $id, 'pour');
        self::assertSame('adopted', self::json($this->vote($this->chloe, $id, 'pour', 'Je pars bientôt'))['tally']['outcome']);

        // UC-CPT : suppression de compte = DELETE réel (FK ON DELETE CASCADE),
        // jamais un marquage deleted_at.
        $purge = $this->as_($this->chloe, 'DELETE', '/api/auth/account');
        self::assertSame(204, $purge->getStatusCode(), (string) $purge->getBody());

        self::assertSame(1, self::competenceBallots($id), 'bulletin de Chloé supprimé en cascade');
        $detail = self::json($this->as_($this->alix, 'GET', '/api/competences/proposals/' . $id));
        self::assertSame([2, 2, 1, 'pending'], [$detail['tally']['electorateSize'], $detail['tally']['threshold'], $detail['tally']['pour'], $detail['tally']['outcome']]);
        self::assertSame(['Bao'], array_column($detail['votes'], 'displayName'));
        // Sessions purgées avec le compte : le navigateur de Chloé n'est plus
        // authentifié (401 en consultation) ; sur une mutation, son jeton CSRF
        // (attaché à la session disparue) est refusé d'abord (403).
        self::assertSame(401, $this->as_($this->chloe, 'GET', '/api/competences/proposals/' . $id)->getStatusCode());
        $late = $this->vote($this->chloe, $id, 'pour');
        self::assertSame([403, 'Jeton CSRF absent ou invalide'], [$late->getStatusCode(), self::json($late)['error']]);
        self::assertSame(1, self::competenceBallots($id));
    }

    #[TestDox('UC-EPI-02-F21 — Anomalie AN1 (comportement actuel figé) : un commentaire de vote de plus de 64 Ko → 500 « Internal error » (MySQL strict), aucun bulletin, aux deux grains')]
    public function testF21OversizedCommentIsAServerError(): void
    {
        $id = $this->proposal();
        self::importRespire();
        $version = self::json($this->as_($this->alix, 'POST', '/api/referentiel/drafts', ['from' => '7.0.0', 'semver' => '7.1.0']));
        self::assertSame(200, $this->as_($this->alix, 'POST', '/api/referentiel/drafts/' . $version['id'] . '/submit', [])->getStatusCode());
        // Colonne `comment TEXT` (65 535 octets) et aucune borne côté API : le
        // dépassement lève une PDOException (sql_mode strict par défaut de
        // MySQL 8), journalisée puis rendue en 500 — on fait taire error_log.
        $tooLong = str_repeat('a', 70000);

        $previousLog = ini_set('error_log', '/dev/null');
        try {
            $competence = $this->vote($this->bao, $id, 'pour', $tooLong);
            $referentiel = $this->vote($this->bao, $version['id'], 'pour', $tooLong, 'referentiel');
        } finally {
            ini_set('error_log', (string) $previousLog);
        }

        foreach ([$competence, $referentiel] as $response) {
            self::assertSame([500, 'Internal error'], [$response->getStatusCode(), self::json($response)['error']], 'à inverser en 422 quand une borne sera ajoutée');
        }
        self::assertSame(0, self::competenceBallots($id));
        self::assertSame(0, self::referentielBallots($version['id']));
    }
}
