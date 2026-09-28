<?php

declare(strict_types=1);

namespace Humanome\Tests\UseCases\Functional;

use Humanome\Tests\UseCases\Support\EpiSupport;
use PHPUnit\Framework\Attributes\TestDox;
use Psr\Http\Message\ResponseInterface;

/**
 * UC-EPI-04 — Éditer une version complète du référentiel : tests FONCTIONNELS (API).
 *
 * Fiche : docs/cas-utilisation/epistemiarque/UC-EPI-04-editer-version-referentiel.md
 *
 * Grain « version » (gouvernance document, migration 015) : le document
 * complet du référentiel est forké, édité, soumis au vote, voté et publié par
 * l'API HTTP — aucune vue ne l'expose. Comptes réels (session + CSRF) : Alix
 * et Bao, membres épistémiarques (seuil 2). État initial : RESPIRE 7.0.0 publié
 * (instantané versionné schemas/fixtures/referentiel-respire-v7.json).
 */
final class UcEpi04EditerVersionReferentielTest extends EpiSupport
{
    /** @var array{id: int, csrf: string, sid: string} */
    private array $alix;

    /** @var array{id: int, csrf: string, sid: string} */
    private array $bao;

    /** @var array{id: int, contentHash: string} */
    private array $v7;

    protected function setUp(): void
    {
        parent::setUp();
        $this->v7 = self::importRespire();
        $this->alix = $this->member('alix@example.org', 'Alix');
        $this->bao = $this->member('bao@example.org', 'Bao');
    }

    /** @return array<string, mixed> brouillon créé par Alix */
    private function fork(string $from = '7.0.0', string $semver = '7.1.0', ?string $label = null): array
    {
        $body = ['from' => $from, 'semver' => $semver];
        if ($label !== null) {
            $body['label'] = $label;
        }
        $response = $this->as_($this->alix, 'POST', '/api/referentiel/drafts', $body);
        self::assertSame(201, $response->getStatusCode(), (string) $response->getBody());

        return self::json($response);
    }

    /** @param array<string, mixed> $doc */
    private static function rename(array $doc, string $code, string $nom): array
    {
        foreach ($doc['competences'] as $i => $competence) {
            if ($competence['code'] === $code) {
                $doc['competences'][$i]['nom'] = $nom;
            }
        }

        return $doc;
    }

    /** Soumission + « pour » d'Alix et Bao (UC-EPI-02 A5). */
    private function adopt(int $id): void
    {
        self::assertSame(200, $this->as_($this->alix, 'POST', '/api/referentiel/drafts/' . $id . '/submit', [])->getStatusCode());
        foreach ([$this->alix, $this->bao] as $voter) {
            self::assertSame(200, $this->as_($voter, 'POST', '/api/referentiel/proposals/' . $id . '/votes', ['vote' => 'pour'])->getStatusCode());
        }
    }

    /** @param array{id: int, csrf: string, sid: string} $who */
    private function publish(array $who, int $id, ?array $body = ['releaseNote' => 'Entérinée par le vote des membres.']): ResponseInterface
    {
        return $this->as_($who, 'POST', '/api/referentiel/drafts/' . $id . '/publish', $body);
    }

    #[TestDox('UC-EPI-04-F01 — nominal : fork 7.0.0 → 7.1.0, édition du document, soumission, votes, publication, historique et diff')]
    public function testF01NominalVersionEdition(): void
    {
        // 1. Fork de la version publiée.
        $draft = $this->fork('7.0.0', '7.1.0', 'RESPIRE v7.1');
        self::assertSame(['draft', '7.1.0', 'RESPIRE v7.1', 'respire'], [$draft['status'], $draft['semver'], $draft['label'], $draft['referentielId']]);
        self::assertSame(['7.1.0', 'RESPIRE v7.1'], [$draft['content']['version'], $draft['content']['label']]);
        self::assertSame($this->alix['id'], (int) self::$pdo->query('SELECT created_by FROM referentiel_versions WHERE id = ' . (int) $draft['id'])->fetchColumn());

        // 2. L'atelier liste et recharge le brouillon.
        self::assertSame([$draft['id']], array_column(self::json($this->as_($this->alix, 'GET', '/api/referentiel/drafts')), 'id'));
        $loaded = self::json($this->as_($this->bao, 'GET', '/api/referentiel/drafts/' . $draft['id']));
        self::assertEquals($draft['content'], $loaded['content']);

        // 3. Édition du document complet : renommage, couleur de pôle, définition.
        $doc = self::rename($loaded['content'], '1.01', 'Pensée critique et vigilance face aux IA');
        $doc['poles'][0]['couleur'] = '#1d4ed8';
        $doc['competences'][1]['description'] = 'Définition ajoutée.';
        $saved = $this->as_($this->alix, 'PUT', '/api/referentiel/drafts/' . $draft['id'], $doc);
        self::assertSame(200, $saved->getStatusCode(), (string) $saved->getBody());
        self::assertNotSame($this->v7['contentHash'], self::json($saved)['contentHash']);

        // 4-5. Soumission avec fil Decidim, votes des membres.
        $submitted = self::json($this->as_($this->alix, 'POST', '/api/referentiel/drafts/' . $draft['id'] . '/submit', [
            'decidimUrl' => 'https://participer.harmonia.education/processes/referentiel/f/12/debates/9',
        ]));
        self::assertSame(['review', 'pending', 2], [$submitted['status'], $submitted['tally']['outcome'], $submitted['tally']['threshold']]);
        foreach ([$this->alix, $this->bao] as $voter) {
            $this->as_($voter, 'POST', '/api/referentiel/proposals/' . $draft['id'] . '/votes', ['vote' => 'pour']);
        }

        // 6. Publication.
        $published = $this->publish($this->bao, $draft['id'], ['releaseNote' => 'Renommage 1.01, couleur du pôle 1.']);
        self::assertSame(200, $published->getStatusCode(), (string) $published->getBody());
        self::assertSame(['published', 'Renommage 1.01, couleur du pôle 1.'], [self::json($published)['status'], self::json($published)['releaseNote']]);

        // 7. Lectures publiques : dernière version, historique immuable, diff.
        $latest = self::json($this->anonymous('GET', '/api/referentiel'));
        self::assertSame(['7.1.0', 'Pensée critique et vigilance face aux IA'], [$latest['version'], $latest['competences'][0]['nom']]);
        self::assertSame('Définition ajoutée.', $latest['competences'][1]['description']);
        self::assertSame(['7.1.0', '7.0.0'], array_column(self::json($this->anonymous('GET', '/api/referentiel/versions')), 'semver'));
        self::assertNotSame('Pensée critique et vigilance face aux IA', self::json($this->anonymous('GET', '/api/referentiel/versions/7.0.0'))['competences'][0]['nom']);
        $diff = self::json($this->anonymous('GET', '/api/referentiel/diff/7.0.0/7.1.0'));
        self::assertSame([1, 1, 0], [$diff['summary']['competencesRenamed'], $diff['summary']['polesModified'], $diff['summary']['competencesAdded']]);
        self::assertSame([], self::json($this->as_($this->alix, 'GET', '/api/referentiel/drafts')));
    }

    #[TestDox('UC-EPI-04-F02 — A1/A5 : fork depuis un brouillon ; sans libellé, celui de la source est conservé')]
    public function testF02ForkFromADraftKeepsTheSourceLabel(): void
    {
        $this->fork('7.0.0', '7.1.0', 'RESPIRE v7.1 (brouillon)');

        $second = $this->fork('7.1.0', '7.2.0');

        self::assertSame(['7.2.0', 'RESPIRE v7.1 (brouillon)'], [$second['semver'], $second['label']]);
        self::assertSame(['7.2.0', '7.1.0'], array_column(self::json($this->as_($this->alix, 'GET', '/api/referentiel/drafts')), 'semver'));
    }

    #[TestDox('UC-EPI-04-F03 — A2 : changer « version » dans le document renumérote le brouillon')]
    public function testF03VersionFieldRenumbersTheDraft(): void
    {
        $draft = $this->fork();
        $doc = $draft['content'];
        $doc['version'] = '8.0.0';

        $saved = self::json($this->as_($this->alix, 'PUT', '/api/referentiel/drafts/' . $draft['id'], $doc));

        self::assertSame('8.0.0', $saved['semver']);
        self::assertSame('8.0.0', self::json($this->as_($this->alix, 'GET', '/api/referentiel/drafts/' . $draft['id']))['content']['version']);
    }

    #[TestDox('UC-EPI-04-F04 — A3 : retrait → brouillon rééditable, bulletins effacés')]
    public function testF04WithdrawReopensEditing(): void
    {
        $draft = $this->fork();
        $this->adopt($draft['id']);
        self::assertSame(2, self::referentielBallots($draft['id']));

        $withdrawn = $this->as_($this->alix, 'POST', '/api/referentiel/drafts/' . $draft['id'] . '/withdraw');

        self::assertSame(200, $withdrawn->getStatusCode());
        self::assertSame(['draft', null], [self::json($withdrawn)['status'], self::json($withdrawn)['decidimUrl']]);
        self::assertSame(0, self::referentielBallots($draft['id']));
        self::assertSame(200, $this->as_($this->alix, 'PUT', '/api/referentiel/drafts/' . $draft['id'], self::rename($draft['content'], '2.01', 'Écoute active'))->getStatusCode());
    }

    #[TestDox('UC-EPI-04-F05 — A4 : un administrateur non membre forke, soumet et publie (les membres votent)')]
    public function testF05AdminDrivesTheVersion(): void
    {
        $admin = $this->member('admin@example.org', 'Admin', ['admin']);
        $created = $this->as_($admin, 'POST', '/api/referentiel/drafts', ['from' => '7.0.0', 'semver' => '7.1.0']);
        self::assertSame(201, $created->getStatusCode());
        $id = self::json($created)['id'];
        self::assertSame(200, $this->as_($admin, 'POST', '/api/referentiel/drafts/' . $id . '/submit', [])->getStatusCode());
        foreach ([$this->alix, $this->bao] as $voter) {
            $this->as_($voter, 'POST', '/api/referentiel/proposals/' . $id . '/votes', ['vote' => 'pour']);
        }

        self::assertSame(200, $this->publish($admin, $id)->getStatusCode());
    }

    #[TestDox('UC-EPI-04-F06 — E1 : sans session → 401, sans rôle → 403, sans jeton CSRF → 403 (lectures d’atelier et écritures)')]
    public function testF06Guards(): void
    {
        $draft = $this->fork();
        $maya = $this->member('maya@example.org', 'Maya', ['apprenant', 'cartographe']);
        $routes = [
            ['GET', '/api/referentiel/drafts', null],
            ['GET', '/api/referentiel/drafts/' . $draft['id'], null],
            ['POST', '/api/referentiel/drafts', ['from' => '7.0.0', 'semver' => '7.2.0']],
            ['PUT', '/api/referentiel/drafts/' . $draft['id'], $draft['content']],
            ['POST', '/api/referentiel/drafts/' . $draft['id'] . '/submit', []],
            ['POST', '/api/referentiel/drafts/' . $draft['id'] . '/withdraw', null],
            ['POST', '/api/referentiel/drafts/' . $draft['id'] . '/publish', []],
        ];
        foreach ($routes as [$method, $path, $body]) {
            self::assertSame(401, $this->anonymous($method, $path, $body)->getStatusCode(), 'anonyme ' . $method . ' ' . $path);
            self::assertSame(403, $this->as_($maya, $method, $path, $body)->getStatusCode(), 'sans rôle ' . $method . ' ' . $path);
            if ($method !== 'GET') {
                self::assertSame(403, $this->withoutCsrf($this->alix, $method, $path, $body)->getStatusCode(), 'CSRF ' . $method . ' ' . $path);
            }
        }
        self::assertSame(200, $this->anonymous('GET', '/api/referentiel/versions')->getStatusCode(), 'lectures publiques ouvertes');
        self::assertSame('draft', self::json($this->as_($this->alix, 'GET', '/api/referentiel/drafts/' . $draft['id']))['status']);
    }

    #[TestDox('UC-EPI-04-F07 — E2/E3 : corps non JSON ou vide → 400 ; « from »/« semver » manquants → 422 ; semver invalide → 422')]
    public function testF07MalformedRequests(): void
    {
        $draft = $this->fork();

        self::assertSame(400, $this->rawAs($this->alix, 'POST', '/api/referentiel/drafts', '{"from":')->getStatusCode());
        self::assertSame(400, $this->as_($this->alix, 'PUT', '/api/referentiel/drafts/' . $draft['id'], [])->getStatusCode());
        self::assertSame(400, $this->rawAs($this->alix, 'POST', '/api/referentiel/drafts/' . $draft['id'] . '/submit', 'x')->getStatusCode());
        self::assertSame(400, $this->rawAs($this->alix, 'POST', '/api/referentiel/drafts/' . $draft['id'] . '/publish', 'x')->getStatusCode());

        $missing = $this->as_($this->alix, 'POST', '/api/referentiel/drafts', ['semver' => '7.2.0']);
        self::assertSame(422, $missing->getStatusCode());
        self::assertStringContainsString('"from"', self::json($missing)['error']);
        $invalid = $this->as_($this->alix, 'POST', '/api/referentiel/drafts', ['from' => '7.0.0', 'semver' => 'sept']);
        self::assertSame(422, $invalid->getStatusCode());
        self::assertSame(['/semver' => ['Version semver invalide']], self::json($invalid)['errors']);
    }

    #[TestDox('UC-EPI-04-F08 — E4 : source inconnue, brouillon inconnu ou version publiée demandée comme brouillon → 404')]
    public function testF08UnknownVersions(): void
    {
        $unknownSource = $this->as_($this->alix, 'POST', '/api/referentiel/drafts', ['from' => '9.9.9', 'semver' => '10.0.0']);
        self::assertSame([404, 'Unknown source version 9.9.9'], [$unknownSource->getStatusCode(), self::json($unknownSource)['error']]);

        foreach ([
            ['GET', '/api/referentiel/drafts/999999', null],
            ['PUT', '/api/referentiel/drafts/999999', self::respireDocument()],
            ['POST', '/api/referentiel/drafts/999999/submit', []],
            ['POST', '/api/referentiel/drafts/999999/withdraw', null],
            ['POST', '/api/referentiel/drafts/999999/publish', []],
            ['GET', '/api/referentiel/drafts/' . $this->v7['id'], null],
        ] as [$method, $path, $body]) {
            $response = $this->as_($this->alix, $method, $path, $body);
            self::assertSame([404, 'Unknown draft'], [$response->getStatusCode(), self::json($response)['error']], $method . ' ' . $path);
        }
    }

    #[TestDox('UC-EPI-04-F09 — E5 : version déjà existante à la création ou par renumérotation → 409')]
    public function testF09DuplicateVersion(): void
    {
        $draft = $this->fork('7.0.0', '7.1.0');
        $this->fork('7.0.0', '7.2.0');

        self::assertSame(409, $this->as_($this->alix, 'POST', '/api/referentiel/drafts', ['from' => '7.0.0', 'semver' => '7.1.0'])->getStatusCode());
        $doc = $draft['content'];
        $doc['version'] = '7.2.0';
        $renumbered = $this->as_($this->alix, 'PUT', '/api/referentiel/drafts/' . $draft['id'], $doc);
        self::assertSame(409, $renumbered->getStatusCode());
        self::assertSame('Version 7.2.0 of referentiel "respire" already exists', self::json($renumbered)['error']);
    }

    #[TestDox('UC-EPI-04-F10 — E6 : document hors schéma, incohérent ou d’un autre référentiel → 422 avec pointeurs, rien d’écrit')]
    public function testF10InvalidDocuments(): void
    {
        $draft = $this->fork();
        $path = '/api/referentiel/drafts/' . $draft['id'];

        $short = $draft['content'];
        array_pop($short['competences']);
        $schema = $this->as_($this->alix, 'PUT', $path, $short);
        self::assertSame([422, 'Document does not conform to the referentiel schema'], [$schema->getStatusCode(), self::json($schema)['error']]);

        $duplicate = $draft['content'];
        $duplicate['competences'][1]['code'] = $duplicate['competences'][0]['code'];
        $integrity = $this->as_($this->alix, 'PUT', $path, $duplicate);
        self::assertSame(422, $integrity->getStatusCode());
        self::assertArrayHasKey('/competences/1/code', self::json($integrity)['errors']);

        $other = $draft['content'];
        $other['id'] = 'autre-referentiel';
        $identity = $this->as_($this->alix, 'PUT', $path, $other);
        self::assertSame(422, $identity->getStatusCode());
        self::assertArrayHasKey('/id', self::json($identity)['errors']);

        self::assertSame($draft['contentHash'], self::json($this->as_($this->alix, 'GET', $path))['contentHash']);
    }

    #[TestDox('UC-EPI-04-F11 — E7 : écritures sur version publiée ou gelée → 409 ; double soumission et retrait d’un brouillon → 409')]
    public function testF11ImmutableAndFrozenVersions(): void
    {
        $v7Path = '/api/referentiel/drafts/' . $this->v7['id'];
        self::assertSame(409, $this->as_($this->alix, 'PUT', $v7Path, self::respireDocument())->getStatusCode());
        self::assertSame(409, $this->as_($this->alix, 'POST', $v7Path . '/submit', [])->getStatusCode());
        self::assertSame(409, $this->publish($this->alix, $this->v7['id'])->getStatusCode());

        $draft = $this->fork();
        $withdrawDraft = $this->as_($this->alix, 'POST', '/api/referentiel/drafts/' . $draft['id'] . '/withdraw');
        self::assertSame([409, 'Only a proposal currently open for a vote can be withdrawn.'], [$withdrawDraft->getStatusCode(), self::json($withdrawDraft)['error']]);

        self::assertSame(200, $this->as_($this->alix, 'POST', '/api/referentiel/drafts/' . $draft['id'] . '/submit', [])->getStatusCode());
        self::assertSame(409, $this->as_($this->alix, 'POST', '/api/referentiel/drafts/' . $draft['id'] . '/submit', [])->getStatusCode());
        $frozen = $this->as_($this->alix, 'PUT', '/api/referentiel/drafts/' . $draft['id'], $draft['content']);
        self::assertSame(409, $frozen->getStatusCode());
        self::assertStringContainsString('withdraw it before editing', self::json($frozen)['error']);
    }

    #[TestDox('UC-EPI-04-F12 — E8 : publication sans vote, sans majorité ou dépassée par une autre version → 409 ; soumission d’une semver non croissante → 409')]
    public function testF12PublicationRefusals(): void
    {
        $draft = $this->fork('7.0.0', '7.1.0');
        $notSubmitted = $this->publish($this->alix, $draft['id']);
        self::assertSame([409, 'A proposal must be submitted for a vote before it can be published.'], [$notSubmitted->getStatusCode(), self::json($notSubmitted)['error']]);

        $this->as_($this->alix, 'POST', '/api/referentiel/drafts/' . $draft['id'] . '/submit', []);
        $this->as_($this->alix, 'POST', '/api/referentiel/proposals/' . $draft['id'] . '/votes', ['vote' => 'pour']);
        $noMajority = $this->publish($this->alix, $draft['id']);
        self::assertSame([409, 'Majorité non atteinte : 1 voix « pour » sur 2 requises (2 membres).'], [$noMajority->getStatusCode(), self::json($noMajority)['error']]);

        $newer = $this->fork('7.0.0', '7.2.0');
        $this->adopt($newer['id']);
        self::assertSame(200, $this->publish($this->alix, $newer['id'])->getStatusCode());
        $this->as_($this->bao, 'POST', '/api/referentiel/proposals/' . $draft['id'] . '/votes', ['vote' => 'pour']);
        $overtaken = $this->publish($this->alix, $draft['id']);
        self::assertSame(409, $overtaken->getStatusCode());
        self::assertStringContainsString('7.1.0 is not greater than published 7.2.0', self::json($overtaken)['error']);

        $lower = $this->fork('7.0.0', '7.1.5');
        $stale = $this->as_($this->alix, 'POST', '/api/referentiel/drafts/' . $lower['id'] . '/submit', []);
        self::assertSame(409, $stale->getStatusCode());
        self::assertStringContainsString('strictly increasing', self::json($stale)['error']);
    }

    #[TestDox('UC-EPI-04-F13 — E9 : diff ou version publiée inconnue (ou simple brouillon) → 404')]
    public function testF13UnknownPublishedVersionsInPublicReads(): void
    {
        $this->fork('7.0.0', '7.1.0');

        foreach (['/api/referentiel/diff/7.0.0/9.9.9', '/api/referentiel/diff/7.0.0/7.1.0', '/api/referentiel/versions/7.1.0'] as $path) {
            $response = $this->anonymous('GET', $path);
            self::assertSame([404, 'Unknown published version'], [$response->getStatusCode(), self::json($response)['error']], $path);
        }
    }

    #[TestDox('UC-EPI-04-F14 — E10 : soumission avec un lien Decidim invalide → 422, le brouillon reste éditable')]
    public function testF14InvalidDecidimLink(): void
    {
        $draft = $this->fork();

        $response = $this->as_($this->alix, 'POST', '/api/referentiel/drafts/' . $draft['id'] . '/submit', ['decidimUrl' => 'participer.harmonia.education/d/1']);

        self::assertSame(422, $response->getStatusCode());
        self::assertSame(['/decidimUrl' => ['URL invalide']], self::json($response)['errors']);
        self::assertSame('draft', self::json($this->as_($this->alix, 'GET', '/api/referentiel/drafts/' . $draft['id']))['status']);
    }

    #[TestDox('UC-EPI-04-F15 — Limite L2 (comportement actuel figé) : pas de concurrence optimiste au grain version, le dernier enregistrement l’emporte')]
    public function testF15LastWriteWinsAtVersionGrain(): void
    {
        $draft = $this->fork();
        // Alix et Bao ont chargé le même brouillon.
        $alixDoc = self::rename($draft['content'], '1.01', 'Version d’Alix');
        $baoDoc = self::rename($draft['content'], '2.01', 'Version de Bao');

        self::assertSame(200, $this->as_($this->alix, 'PUT', '/api/referentiel/drafts/' . $draft['id'], $alixDoc)->getStatusCode());
        self::assertSame(200, $this->as_($this->bao, 'PUT', '/api/referentiel/drafts/' . $draft['id'], $baoDoc)->getStatusCode());

        $stored = self::json($this->as_($this->alix, 'GET', '/api/referentiel/drafts/' . $draft['id']))['content'];
        $names = array_column($stored['competences'], 'nom', 'code');
        self::assertSame('Version de Bao', $names['2.01']);
        self::assertNotSame('Version d’Alix', $names['1.01'], 'le renommage d’Alix est perdu sans avertissement');
    }

    #[TestDox('UC-EPI-04-F16 — Anomalie AN1 (comportement actuel figé) : une version publiée au grain version n’atteint pas les compétences atomiques ; la release suivante l’annule')]
    public function testF16VersionGrainDivergesFromAtomicCompetences(): void
    {
        // État de production : compétences atomiques semées contre 7.0.0 (import idempotent).
        self::seedFullCorpus();
        $before = self::json($this->anonymous('GET', '/api/competences/1.01'))['nom'];

        $draft = $this->fork('7.0.0', '7.1.0');
        $this->as_($this->alix, 'PUT', '/api/referentiel/drafts/' . $draft['id'], self::rename($draft['content'], '1.01', 'Renommée au grain version'));
        $this->adopt($draft['id']);
        self::assertSame(200, $this->publish($this->alix, $draft['id'])->getStatusCode());
        self::assertSame('Renommée au grain version', self::json($this->anonymous('GET', '/api/referentiel'))['competences'][0]['nom']);

        // La compétence atomique ignore ce renommage, et la 7.1.0 n'a pas de lockfile.
        self::assertSame($before, self::json($this->anonymous('GET', '/api/competences/1.01'))['nom']);
        self::assertSame(0, (int) self::$pdo->query('SELECT COUNT(*) FROM referentiel_snapshot_competences WHERE snapshot_version_id = ' . (int) $draft['id'])->fetchColumn());

        // La coupe de release suivante (UC-EPI-03) repart des compétences atomiques : le renommage disparaît.
        self::assertSame(201, $this->as_($this->alix, 'POST', '/api/competences/release', ['semver' => '7.2.0'])->getStatusCode());
        $diff = self::json($this->anonymous('GET', '/api/referentiel/diff/7.1.0/7.2.0'));
        self::assertSame([['code' => '1.01', 'pole' => 1, 'from' => 'Renommée au grain version', 'to' => $before]], $diff['competences']['renamed']);
    }
}
