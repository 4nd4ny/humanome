<?php

declare(strict_types=1);

namespace Humanome\Tests\UseCases\Functional;

use Humanome\Tests\UseCases\Support\EpiSupport;
use PHPUnit\Framework\Attributes\TestDox;

/**
 * UC-EPI-01 — Proposer une modification de compétence : tests FONCTIONNELS (API).
 *
 * Fiche : docs/cas-utilisation/epistemiarque/UC-EPI-01-proposer-modification-competence.md
 *
 * Chaque test rejoue un scénario de la fiche par l'API HTTP (application Slim
 * en processus, vraie base MySQL), avec de VRAIS comptes : inscription +
 * activation, cookie de session et jeton CSRF sur chaque mutation. L'état
 * initial (compétences publiées) est posé comme au déploiement.
 */
final class UcEpi01ProposerModificationCompetenceTest extends EpiSupport
{
    private const DECIDIM = 'https://participer.harmonia.education/processes/referentiel/f/12/debates/7';

    /** @var array{id: int, csrf: string, sid: string} */
    private array $iris;

    protected function setUp(): void
    {
        parent::setUp();
        self::seedCompetence('1.01', 'Pensée Critique', 1);
        self::seedCompetence('2.01', 'Écoute', 2);
        $this->iris = $this->member('iris@example.org', 'Iris');
    }

    /** @return array<string, mixed> brouillon créé par Iris (étapes 3-4) */
    private function fork(string $code = '1.01', string $semver = '1.1.0'): array
    {
        $response = $this->as_($this->iris, 'POST', '/api/competences/' . $code . '/drafts', ['semver' => $semver]);
        self::assertSame(201, $response->getStatusCode(), (string) $response->getBody());

        return self::json($response);
    }

    #[TestDox('UC-EPI-01-F01 — nominal : liste, fork, édition If-Match, soumission au vote avec lien Decidim ; auteur et soumissionnaire pris dans la session, pôle inchangé, version en vigueur intacte')]
    public function testF01NominalProposal(): void
    {
        $inForce = self::json($this->anonymous('GET', '/api/competences/1.01'));
        // Compte existant dont l'id sera FORGÉ par le client (RG8) ; hors électorat.
        $maya = $this->member('maya@example.org', 'Maya', ['apprenant']);

        // 2. L'atelier liste les compétences publiées et les versions éditables.
        $list = self::json($this->as_($this->iris, 'GET', '/api/competences'));
        self::assertSame(['1.01', '2.01'], array_column($list, 'code'));
        self::assertSame([], self::json($this->as_($this->iris, 'GET', '/api/competences/drafts')));

        // 3-4. « Proposer une évolution » : fork de la dernière version publiée
        // (un « createdBy » glissé par le client est ignoré, RG8).
        $created = $this->as_($this->iris, 'POST', '/api/competences/1.01/drafts', ['semver' => '1.1.0', 'createdBy' => $maya['id']]);
        self::assertSame(201, $created->getStatusCode(), (string) $created->getBody());
        $draft = self::json($created);
        self::assertSame('draft', $draft['status']);
        self::assertSame('1.01', $draft['code']);
        self::assertSame(1, $draft['pole']);
        self::assertSame('Pensée Critique', $draft['content']['identite']['nom']);
        $row = self::competenceRow($draft['id']);
        self::assertSame($this->iris['id'], (int) $row['created_by'], 'auteur pris dans la session');

        // 5. L'éditeur recharge le brouillon (contenu + empreinte de base).
        $loaded = self::json($this->as_($this->iris, 'GET', '/api/competences/drafts/' . $draft['id']));
        self::assertSame($draft['contentHash'], $loaded['contentHash']);
        self::assertArrayNotHasKey('tally', $loaded, 'pas de décompte hors vote');

        // 6-7. Enregistrement avec If-Match = empreinte chargée.
        $content = $loaded['content'];
        $content['identite']['nom'] = 'Pensée Critique & Anti-Hallucination';
        $content['identite']['definition'] = 'Douter méthodiquement, y compris de soi.';
        $content['protocole']['passe_1']['signaux_declencheurs'][] = 'j’ai recoupé';
        $content['fiche'] = "## 1.01 — Pensée Critique\n\n**Essence** — Douter.\n\n---";
        $content['pole'] = 2; // tentative de déplacement : le pôle structurel ne suit pas le contenu (RG1)
        $saved = $this->asWith($this->iris, 'PUT', '/api/competences/drafts/' . $draft['id'], $content, [
            'If-Match' => '"' . $loaded['contentHash'] . '"',
        ]);
        self::assertSame(200, $saved->getStatusCode(), (string) $saved->getBody());
        $savedBody = self::json($saved);
        self::assertNotSame($loaded['contentHash'], $savedBody['contentHash'], 'nouvelle base pour le prochain enregistrement');
        self::assertSame('Pensée Critique & Anti-Hallucination', $savedBody['nom'], 'nom structurel = identite.nom');
        self::assertEquals($content, $savedBody['content']);
        self::assertSame(1, $savedBody['pole'], 'RG1 : le pôle n’est pas modifiable au grain compétence');
        self::assertSame(1, (int) self::competenceRow($draft['id'])['pole']);

        // 8-9. Soumission au vote avec le fil Decidim.
        $submitted = $this->as_($this->iris, 'POST', '/api/competences/drafts/' . $draft['id'] . '/submit', [
            'decidimUrl' => self::DECIDIM,
            'submittedBy' => $maya['id'], // forgé par le client : ignoré (RG8)
        ]);
        self::assertSame(200, $submitted->getStatusCode(), (string) $submitted->getBody());
        $proposal = self::json($submitted);
        self::assertSame('review', $proposal['status']);
        self::assertSame(self::DECIDIM, $proposal['decidimUrl']);
        self::assertNotNull($proposal['submittedAt']);
        self::assertSame(
            ['electorateSize' => 1, 'threshold' => 1, 'pour' => 0, 'contre' => 0, 'abstention' => 0, 'notVoted' => 1, 'outcome' => 'pending', 'reached' => false],
            $proposal['tally'],
        );
        self::assertSame($this->iris['id'], (int) self::competenceRow($draft['id'])['submitted_by']);

        // La liste de l'atelier montre la proposition au vote, avec son décompte.
        $drafts = self::json($this->as_($this->iris, 'GET', '/api/competences/drafts'));
        self::assertSame([['review', 'pending']], array_map(static fn (array $d): array => [$d['status'], $d['tally']['outcome']], $drafts));
        // Rien n'est publié tant que le vote n'a pas entériné (UC-EPI-03) : la
        // version en vigueur est servie À L'IDENTIQUE (semver, nom, empreinte, contenu).
        $after = self::json($this->anonymous('GET', '/api/competences/1.01'));
        self::assertSame(['1.0.0', 'Pensée Critique', $inForce['id']], [$after['semver'], $after['nom'], $after['id']]);
        self::assertSame($inForce['contentHash'], $after['contentHash']);
        self::assertEquals($inForce['content'], $after['content']);
    }

    #[TestDox('UC-EPI-01-F02 — A1 : retrait de la proposition → brouillon rééditable, bulletins effacés, nouveau tour vierge à la resoumission')]
    public function testF02WithdrawReopensEditingAndWipesBallots(): void
    {
        $id = $this->openCompetenceProposal($this->iris, '1.01', '1.1.0', null, self::DECIDIM);
        self::assertSame(200, $this->as_($this->iris, 'POST', '/api/competences/proposals/' . $id . '/votes', ['vote' => 'contre'])->getStatusCode());
        self::assertSame(1, self::competenceBallots($id));

        $withdrawn = $this->as_($this->iris, 'POST', '/api/competences/drafts/' . $id . '/withdraw');

        self::assertSame(200, $withdrawn->getStatusCode());
        $body = self::json($withdrawn);
        self::assertSame('draft', $body['status']);
        self::assertNull($body['decidimUrl']);
        self::assertNull($body['submittedAt']);
        self::assertArrayNotHasKey('tally', $body);
        self::assertSame(0, self::competenceBallots($id));

        // L'édition est rouverte…
        $loaded = self::json($this->as_($this->iris, 'GET', '/api/competences/drafts/' . $id));
        $content = $loaded['content'];
        $content['identite']['definition'] = 'Reformulée après le débat.';
        self::assertSame(200, $this->asWith($this->iris, 'PUT', '/api/competences/drafts/' . $id, $content, ['If-Match' => $loaded['contentHash']])->getStatusCode());
        // … et la resoumission ouvre un tour vierge.
        $resubmitted = self::json($this->as_($this->iris, 'POST', '/api/competences/drafts/' . $id . '/submit', []));
        self::assertSame(0, $resubmitted['tally']['contre']);
        self::assertNull($resubmitted['decidimUrl'], 'A3 : sans lien, aucun fil n’est joint');
    }

    #[TestDox('UC-EPI-01-F03 — A2 : réenregistrer un contenu identique n’est pas un conflit (empreinte inchangée)')]
    public function testF03IdenticalResaveIsANoOp(): void
    {
        $draft = $this->fork();
        $first = $this->asWith($this->iris, 'PUT', '/api/competences/drafts/' . $draft['id'], $draft['content'], ['If-Match' => $draft['contentHash']]);
        $second = $this->asWith($this->iris, 'PUT', '/api/competences/drafts/' . $draft['id'], $draft['content'], ['If-Match' => $draft['contentHash']]);

        self::assertSame(200, $first->getStatusCode());
        self::assertSame(200, $second->getStatusCode());
        self::assertSame($draft['contentHash'], self::json($second)['contentHash']);
    }

    #[TestDox('UC-EPI-01-F04 — A5 : un administrateur sans rôle épistémiarque peut proposer et soumettre')]
    public function testF04AdminCanProposeAndSubmit(): void
    {
        $admin = $this->member('admin@example.org', 'Admin', ['admin']);

        $created = $this->as_($admin, 'POST', '/api/competences/2.01/drafts', ['semver' => '1.1.0']);
        self::assertSame(201, $created->getStatusCode());
        $id = self::json($created)['id'];
        $submitted = $this->as_($admin, 'POST', '/api/competences/drafts/' . $id . '/submit', []);

        self::assertSame(200, $submitted->getStatusCode());
        // L'électorat reste celui des membres épistémiarques (Iris seule).
        self::assertSame(1, self::json($submitted)['tally']['electorateSize']);
        self::assertSame($admin['id'], (int) self::competenceRow($id)['submitted_by']);
    }

    #[TestDox('UC-EPI-01-F05 — E1/E2 : sans session → 401, sans rôle épistémiarque ni admin → 403 (lecture et écriture)')]
    public function testF05AuthenticationAndRoleGuard(): void
    {
        $draft = $this->fork();
        $apprenant = $this->member('maya@example.org', 'Maya', ['apprenant', 'cartographe', 'promptologue']);
        $routes = [
            ['GET', '/api/competences/drafts', null],
            ['GET', '/api/competences/drafts/' . $draft['id'], null],
            ['POST', '/api/competences/2.01/drafts', ['semver' => '1.1.0']],
            ['PUT', '/api/competences/drafts/' . $draft['id'], $draft['content']],
            ['POST', '/api/competences/drafts/' . $draft['id'] . '/submit', []],
            ['POST', '/api/competences/drafts/' . $draft['id'] . '/withdraw', null],
        ];

        foreach ($routes as [$method, $path, $body]) {
            self::assertSame(401, $this->anonymous($method, $path, $body)->getStatusCode(), 'anonyme ' . $method . ' ' . $path);
            self::assertSame(403, $this->as_($apprenant, $method, $path, $body)->getStatusCode(), 'apprenant ' . $method . ' ' . $path);
        }
        self::assertCount(1, self::json($this->as_($this->iris, 'GET', '/api/competences/drafts')), 'aucun brouillon créé par les refus');
        // Les lectures publiques restent ouvertes à tous.
        self::assertSame(200, $this->anonymous('GET', '/api/competences')->getStatusCode());
    }

    #[TestDox('UC-EPI-01-F06 — E3/E4/E5 : semver absente ou invalide → 422, corps non JSON → 400, compétence inconnue → 404, version existante → 409')]
    public function testF06ForkRefusals(): void
    {
        $missing = $this->as_($this->iris, 'POST', '/api/competences/1.01/drafts', []);
        self::assertSame(422, $missing->getStatusCode());
        self::assertSame('Champ "semver" requis', self::json($missing)['error']);

        $invalid = $this->as_($this->iris, 'POST', '/api/competences/1.01/drafts', ['semver' => 'v1.1']);
        self::assertSame(422, $invalid->getStatusCode());
        self::assertArrayHasKey('/semver', self::json($invalid)['errors']);

        // Corps non JSON ou scalaire JSON : 400 avant tout contrôle de la semver.
        foreach (['{pas du json', '42'] as $raw) {
            $notJson = $this->rawAs($this->iris, 'POST', '/api/competences/1.01/drafts', $raw);
            self::assertSame([400, 'Invalid JSON body'], [$notJson->getStatusCode(), self::json($notJson)['error']], $raw);
        }

        $unknown = $this->as_($this->iris, 'POST', '/api/competences/9.99/drafts', ['semver' => '1.1.0']);
        self::assertSame(404, $unknown->getStatusCode());
        self::assertSame('Compétence publiée introuvable : 9.99', self::json($unknown)['error']);
        // Code malformé : la route (motif P.NN) n'existe pas. Slim journalise
        // l'exception 404 via error_log : on la fait taire le temps de l'appel.
        $previousLog = ini_set('error_log', '/dev/null');
        try {
            $malformed = $this->as_($this->iris, 'POST', '/api/competences/101/drafts', ['semver' => '1.1.0']);
        } finally {
            ini_set('error_log', (string) $previousLog);
        }
        self::assertSame(404, $malformed->getStatusCode(), 'code malformé : route inconnue');

        $this->fork('1.01', '1.1.0');
        $duplicate = $this->as_($this->iris, 'POST', '/api/competences/1.01/drafts', ['semver' => '1.1.0']);
        self::assertSame(409, $duplicate->getStatusCode());
        self::assertSame(409, $this->as_($this->iris, 'POST', '/api/competences/1.01/drafts', ['semver' => '1.0.0'])->getStatusCode(), 'la version publiée existe déjà');
    }

    #[TestDox('UC-EPI-01-F07 — E6/E7 : If-Match absent → 428 ; édition concurrente (hash périmé) → 409 sans écrasement ; deux compétences ne se bloquent jamais')]
    public function testF07OptimisticConcurrency(): void
    {
        $noe = $this->member('noe@example.org', 'Noé');
        $draft = $this->fork();

        $noPrecondition = $this->as_($this->iris, 'PUT', '/api/competences/drafts/' . $draft['id'], $draft['content']);
        self::assertSame(428, $noPrecondition->getStatusCode());
        self::assertStringContainsString('If-Match', self::json($noPrecondition)['error']);

        // Iris et Noé ont chargé la même version ; Iris enregistre la première.
        $irisContent = $draft['content'];
        $irisContent['identite']['definition'] = 'Version d’Iris';
        self::assertSame(200, $this->asWith($this->iris, 'PUT', '/api/competences/drafts/' . $draft['id'], $irisContent, ['If-Match' => $draft['contentHash']])->getStatusCode());

        $noeContent = $draft['content'];
        $noeContent['identite']['definition'] = 'Version de Noé';
        $conflict = $this->asWith($noe, 'PUT', '/api/competences/drafts/' . $draft['id'], $noeContent, ['If-Match' => $draft['contentHash']]);
        self::assertSame(409, $conflict->getStatusCode());
        self::assertStringContainsString('modifiée par un autre épistémiarque', self::json($conflict)['error']);
        self::assertSame('Version d’Iris', self::json($this->as_($noe, 'GET', '/api/competences/drafts/' . $draft['id']))['content']['identite']['definition']);

        // RG9 : pendant ce temps, Noé édite une AUTRE compétence sans jamais être bloqué.
        $other = self::json($this->as_($noe, 'POST', '/api/competences/2.01/drafts', ['semver' => '1.1.0']));
        $otherContent = $other['content'];
        $otherContent['identite']['definition'] = 'Écouter vraiment';
        self::assertSame(200, $this->asWith($noe, 'PUT', '/api/competences/drafts/' . $other['id'], $otherContent, ['If-Match' => $other['contentHash']])->getStatusCode());
    }

    #[TestDox('UC-EPI-01-F08 — E8 : contenu hors schéma (tableau JSON compris) ou code modifié → 422 avec pointeurs d’erreur ; corps vide → 400 ; ordre 400 → 428 → 404')]
    public function testF08InvalidContent(): void
    {
        $draft = $this->fork();
        $path = '/api/competences/drafts/' . $draft['id'];
        $ifMatch = ['If-Match' => $draft['contentHash']];

        $noIdentity = $this->asWith($this->iris, 'PUT', $path, ['protocole' => ['passe_1' => []]], $ifMatch);
        self::assertSame(422, $noIdentity->getStatusCode());
        self::assertNotSame([], self::json($noIdentity)['errors']);

        $moved = $draft['content'];
        $moved['identite']['code'] = '1.02';
        $codeChanged = $this->asWith($this->iris, 'PUT', $path, $moved, $ifMatch);
        self::assertSame(422, $codeChanged->getStatusCode());
        self::assertSame(['/identite/code' => ['Le code de la compétence ne peut pas changer']], self::json($codeChanged)['errors']);

        self::assertSame(400, $this->asWith($this->iris, 'PUT', $path, [], $ifMatch)->getStatusCode());
        // Un tableau JSON non vide n'est pas refusé en 400 : il passe au schéma (type object) → 422.
        $list = $this->asWith($this->iris, 'PUT', $path, [1, 2], $ifMatch);
        self::assertSame(422, $list->getStatusCode());
        self::assertNotSame([], self::json($list)['errors']);
        // Ordre des contrôles du PUT : corps (400) → If-Match (428) → existence (404) / statut (409) → schéma (422).
        self::assertSame(428, $this->asWith($this->iris, 'PUT', '/api/competences/drafts/999999', $draft['content'], [])->getStatusCode(), 'id inconnu sans If-Match : 428 avant 404');
        self::assertSame(400, $this->asWith($this->iris, 'PUT', '/api/competences/drafts/999999', [], [])->getStatusCode(), 'corps vide : 400 avant tout');
        self::assertSame($draft['contentHash'], self::json($this->as_($this->iris, 'GET', $path))['contentHash'], 'rien n’a été écrit');
    }

    #[TestDox('UC-EPI-01-F09 — E9 : une proposition au vote est gelée, une version publiée est immuable (409) et n’est pas un brouillon (404)')]
    public function testF09FrozenAndImmutableVersions(): void
    {
        $id = $this->openCompetenceProposal($this->iris, '1.01', '1.1.0');
        $loaded = self::json($this->as_($this->iris, 'GET', '/api/competences/drafts/' . $id));
        self::assertArrayHasKey('tally', $loaded, 'au vote : décompte et bulletins joints');
        self::assertSame([], $loaded['votes']);

        $frozen = $this->asWith($this->iris, 'PUT', '/api/competences/drafts/' . $id, $loaded['content'], ['If-Match' => $loaded['contentHash']]);
        self::assertSame(409, $frozen->getStatusCode());
        // Message serveur en anglais, affiché tel quel par l'IHM : anomalie AN2 (comportement figé).
        self::assertStringContainsString('withdraw it before editing', self::json($frozen)['error']);

        $published = self::json($this->anonymous('GET', '/api/competences/2.01'));
        $immutable = $this->asWith($this->iris, 'PUT', '/api/competences/drafts/' . $published['id'], $published['content'], ['If-Match' => $published['contentHash']]);
        self::assertSame(409, $immutable->getStatusCode());
        self::assertStringContainsString('immutable', self::json($immutable)['error']);
        self::assertSame(404, $this->as_($this->iris, 'GET', '/api/competences/drafts/' . $published['id'])->getStatusCode());
    }

    #[TestDox('UC-EPI-01-F10 — E10 : soumission refusée — déjà au vote, publiée, semver non croissante (409), lien Decidim invalide (422), JSON invalide (400) ; lien non textuel ignoré (AN4, figé)')]
    public function testF10SubmitRefusals(): void
    {
        $id = $this->openCompetenceProposal($this->iris, '1.01', '1.1.0');
        $twice = $this->as_($this->iris, 'POST', '/api/competences/drafts/' . $id . '/submit', []);
        self::assertSame(409, $twice->getStatusCode());
        self::assertSame('Cette proposition est déjà ouverte au vote.', self::json($twice)['error']);

        $published = self::json($this->anonymous('GET', '/api/competences/2.01'));
        self::assertSame(409, $this->as_($this->iris, 'POST', '/api/competences/drafts/' . $published['id'] . '/submit', [])->getStatusCode());

        // RG2 : une semver non croissante passe la création mais pas la soumission.
        $lower = $this->fork('2.01', '0.9.0');
        $stale = $this->as_($this->iris, 'POST', '/api/competences/drafts/' . $lower['id'] . '/submit', []);
        self::assertSame(409, $stale->getStatusCode());
        self::assertStringContainsString('strictly increasing', self::json($stale)['error']);

        $junk = $this->fork('2.01', '1.1.0');
        $badLink = $this->as_($this->iris, 'POST', '/api/competences/drafts/' . $junk['id'] . '/submit', ['decidimUrl' => 'javascript:alert(1)']);
        self::assertSame(422, $badLink->getStatusCode());
        self::assertSame(['/decidimUrl' => ['URL invalide']], self::json($badLink)['errors']);
        self::assertSame('draft', self::competenceRow($junk['id'])['status']);

        $notJson = $this->rawAs($this->iris, 'POST', '/api/competences/drafts/' . $junk['id'] . '/submit', '{pas du json');
        self::assertSame(400, $notJson->getStatusCode());
        self::assertSame('Invalid JSON body', self::json($notJson)['error']);

        // Anomalie AN4 (comportement actuel figé) : un decidimUrl NON TEXTUEL
        // n'est pas refusé (422) mais ignoré en silence — la soumission réussit sans lien.
        $numeric = $this->as_($this->iris, 'POST', '/api/competences/drafts/' . $junk['id'] . '/submit', ['decidimUrl' => 42]);
        self::assertSame(200, $numeric->getStatusCode(), (string) $numeric->getBody());
        self::assertSame(['review', null], [self::json($numeric)['status'], self::json($numeric)['decidimUrl']]);
    }

    #[TestDox('UC-EPI-01-F11 — E11/E13 : retirer un brouillon non soumis → 409 ; brouillon inconnu → 404 partout')]
    public function testF11WithdrawDraftAndUnknownIds(): void
    {
        $draft = $this->fork();
        $withdraw = $this->as_($this->iris, 'POST', '/api/competences/drafts/' . $draft['id'] . '/withdraw');
        self::assertSame(409, $withdraw->getStatusCode());
        self::assertSame('Seule une proposition ouverte au vote peut être retirée.', self::json($withdraw)['error']);

        foreach ([
            ['GET', '/api/competences/drafts/999999', null, []],
            ['PUT', '/api/competences/drafts/999999', $draft['content'], ['If-Match' => $draft['contentHash']]],
            ['POST', '/api/competences/drafts/999999/submit', [], []],
            ['POST', '/api/competences/drafts/999999/withdraw', null, []],
        ] as [$method, $path, $body, $headers]) {
            $response = $this->asWith($this->iris, $method, $path, $body, $headers);
            self::assertSame(404, $response->getStatusCode(), $method . ' ' . $path);
            self::assertSame('Brouillon introuvable', self::json($response)['error']);
        }
    }

    #[TestDox('UC-EPI-01-F12 — E12 : fork, enregistrement (même avec If-Match) ou soumission avec cookie de session mais sans jeton CSRF → 403, rien n’est écrit')]
    public function testF12MutationWithoutCsrfToken(): void
    {
        $response = $this->withoutCsrf($this->iris, 'POST', '/api/competences/1.01/drafts', ['semver' => '1.1.0']);

        self::assertSame(403, $response->getStatusCode());
        self::assertSame('Jeton CSRF absent ou invalide', self::json($response)['error']);
        self::assertSame([], self::json($this->as_($this->iris, 'GET', '/api/competences/drafts')));

        // Étapes 6 et 8 : un brouillon existe ; PUT (If-Match valide) et soumission sans jeton.
        $draft = $this->fork();
        $path = '/api/competences/drafts/' . $draft['id'];
        $edited = $draft['content'];
        $edited['identite']['definition'] = 'Écrite sans jeton CSRF';
        $this->cookieSid = $this->iris['sid'];
        $put = $this->request('PUT', $path, $edited, ['If-Match' => $draft['contentHash']]);
        self::assertSame([403, 'Jeton CSRF absent ou invalide'], [$put->getStatusCode(), self::json($put)['error']]);
        self::assertSame(403, $this->withoutCsrf($this->iris, 'POST', $path . '/submit', [])->getStatusCode());

        $row = self::competenceRow($draft['id']);
        self::assertSame(['draft', $draft['contentHash'], null], [$row['status'], $row['content_hash'], $row['submitted_at']]);
    }

    #[TestDox('UC-EPI-01-F13 — Limite L1 et anomalie AN3 (comportement actuel figé) : deux brouillons d’une même compétence acceptés ; une fois l’un publié, l’autre reste bloqué (ni soumissible, ni retirable, ni supprimable)')]
    public function testF13TwoDraftsOfTheSameCompetenceAreAccepted(): void
    {
        // Seule l'IHM empêche un second brouillon (« déjà en cours d'édition ») ;
        // l'API ne le refuse pas. Figé ici : voir « Limites » dans la fiche.
        $stale = $this->fork('1.01', '1.1.0');
        $newer = $this->fork('1.01', '1.2.0');

        $drafts = self::json($this->as_($this->iris, 'GET', '/api/competences/drafts'));
        self::assertSame(['1.2.0', '1.1.0'], array_column($drafts, 'semver'));
        self::assertSame(['1.01', '1.01'], array_column($drafts, 'code'));

        // AN3 : 1.2.0 est soumise, votée (Iris seule membre : seuil 1) et entérinée…
        self::assertSame(200, $this->as_($this->iris, 'POST', '/api/competences/drafts/' . $newer['id'] . '/submit', [])->getStatusCode());
        self::assertSame(200, $this->as_($this->iris, 'POST', '/api/competences/proposals/' . $newer['id'] . '/votes', ['vote' => 'pour'])->getStatusCode());
        self::assertSame(200, $this->as_($this->iris, 'POST', '/api/competences/drafts/' . $newer['id'] . '/publish', [])->getStatusCode());
        // … le brouillon 1.1.0 ne peut plus être soumis (semver dépassée), ni
        // retiré (pas au vote), ni supprimé (aucune route), ni renuméroté (la
        // semver n'est pas éditable) : il reste listé, et l'IHM, qui masque
        // « Proposer une évolution » dès qu'un brouillon existe pour le code,
        // ne permet plus de proposer d'évolution de 1.01.
        $submit = $this->as_($this->iris, 'POST', '/api/competences/drafts/' . $stale['id'] . '/submit', []);
        self::assertSame(409, $submit->getStatusCode());
        self::assertStringContainsString('1.1.0 is not greater than published 1.2.0', self::json($submit)['error']);
        self::assertSame(409, $this->as_($this->iris, 'POST', '/api/competences/drafts/' . $stale['id'] . '/withdraw')->getStatusCode());
        $remaining = self::json($this->as_($this->iris, 'GET', '/api/competences/drafts'));
        self::assertSame([[$stale['id'], '1.01', '1.1.0', 'draft']], array_map(static fn (array $d): array => [$d['id'], $d['code'], $d['semver'], $d['status']], $remaining));
    }
}
