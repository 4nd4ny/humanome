<?php

declare(strict_types=1);

namespace Humanome\Tests\UseCases\Functional;

use Humanome\Tests\AdminTestCase;
use Humanome\Tests\UseCases\Support\ProSupport;
use PHPUnit\Framework\Attributes\TestDox;
use Psr\Http\Message\ResponseInterface;

/**
 * UC-PRO-02 — Créer et éditer un brouillon de paquet de prompts : tests
 * FONCTIONNELS (API).
 *
 * Fiche : docs/cas-utilisation/promptologue/UC-PRO-02-editer-brouillon-paquet.md
 *
 * Le promptologue est un vrai navigateur simulé : inscription + activation,
 * rôle posé en base, cookie de session et jeton CSRF sur chaque mutation. Les
 * requêtes passent par l'application « SAPI web » de ProSupport (session
 * jointe comme hors CLI). Précondition commune : aurora-demo 1.0.0 publiée.
 */
final class UcPro02EditerBrouillonPaquetTest extends AdminTestCase
{
    /** @var array{id: int, csrf: string, sid: string} */
    private array $pom;

    protected function setUp(): void
    {
        parent::setUp();
        ProSupport::publish(self::$pdo);
        $this->pom = $this->registerAs('pom@example.org', 'Pom', ['promptologue']);
    }

    /**
     * Une requête du navigateur de $user (null = visiteur sans cookie) ;
     * jeton CSRF joint sur les mutations sauf si $csrf = false.
     */
    private function act(?array $user, string $method, string $path, ?array $body = null, bool $csrf = true, array $headers = []): ResponseInterface
    {
        $this->cookieSid = $user['sid'] ?? null;
        if ($user !== null && $csrf && $method !== 'GET') {
            $headers['X-CSRF-Token'] = $user['csrf'];
        }

        return $this->request($method, '/api' . $path, $body, $headers, ProSupport::webApp());
    }

    private function createDraft(array $user, string $version = '1.1.0', string $from = '1.0.0', string $fromId = ProSupport::PKG): int
    {
        $response = $this->act($user, 'POST', '/prompt-packages/drafts', ['fromId' => $fromId, 'fromVersion' => $from, 'version' => $version]);
        self::assertSame(201, $response->getStatusCode(), (string) $response->getBody());

        return (int) self::json($response)['draftId'];
    }

    #[TestDox('UC-PRO-02-F01 — nominal : créer un brouillon, le lister, l’ouvrir, l’enregistrer ; il reste invisible du public')]
    public function testF01CreateListOpenAndSaveADraft(): void
    {
        $created = $this->act($this->pom, 'POST', '/prompt-packages/drafts', ['fromId' => 'aurora-demo', 'fromVersion' => '1.0.0', 'version' => '1.1.0']);
        self::assertSame(201, $created->getStatusCode());
        $body = self::json($created);
        self::assertSame(['draftId', 'id', 'version'], array_keys($body));
        self::assertSame(['aurora-demo', '1.1.0'], [$body['id'], $body['version']]);
        $draftId = $body['draftId'];

        $list = self::json($this->act($this->pom, 'GET', '/prompt-packages/drafts'));
        self::assertSame([['draftId' => $draftId, 'id' => 'aurora-demo', 'version' => '1.1.0']], array_map(
            static fn (array $d): array => ['draftId' => $d['draftId'], 'id' => $d['id'], 'version' => $d['version']],
            $list,
        ));

        $draft = self::json($this->act($this->pom, 'GET', '/prompt-packages/drafts/' . $draftId));
        self::assertSame('draft', $draft['status']);
        $doc = $draft['document'];
        $doc['prompts'][0]['texte'] .= "\n\n# Note\nConsigne ajoutée en 1.1.0.";
        $doc['description'] = 'Version retravaillée dans l’atelier.';

        $saved = $this->act($this->pom, 'PUT', '/prompt-packages/drafts/' . $draftId, ['document' => $doc]);
        self::assertSame(200, $saved->getStatusCode(), (string) $saved->getBody());
        $reloaded = self::json($this->act($this->pom, 'GET', '/prompt-packages/drafts/' . $draftId))['document'];
        self::assertStringEndsWith('Consigne ajoutée en 1.1.0.', $reloaded['prompts'][0]['texte']);
        self::assertSame('Version retravaillée dans l’atelier.', $reloaded['description']);

        // Un brouillon ne tourne que chez son auteur : aucune lecture publique.
        $this->cookieSid = null;
        self::assertSame(['1.0.0'], array_column(self::json($this->request('GET', '/api/prompt-packages', null, [], ProSupport::webApp())), 'version'));
        self::assertSame(404, $this->act(null, 'GET', '/prompt-packages/aurora-demo/1.1.0')->getStatusCode());
    }

    #[TestDox('UC-PRO-02-F02 — A1 : dériver un brouillon depuis un de SES brouillons')]
    public function testF02ForkFromOwnDraft(): void
    {
        $first = $this->createDraft($this->pom, '1.1.0');
        $second = $this->createDraft($this->pom, '1.2.0', '1.1.0');

        self::assertNotSame($first, $second);
        self::assertSame(['1.1.0', '1.2.0'], array_column(self::json($this->act($this->pom, 'GET', '/prompt-packages/drafts')), 'version'));
    }

    #[TestDox('UC-PRO-02-F03 — A2 : forker un paquet réservé sous un nouveau nom, puis comparer le fork à son original')]
    public function testF03ReservedForkWithRenameAndDiffOrigin(): void
    {
        ProSupport::publish(self::$pdo, ProSupport::reservedDoc());

        $created = $this->act($this->pom, 'POST', '/prompt-packages/drafts', ['fromId' => 'twin6-ouverte', 'fromVersion' => '1.0.0', 'version' => '1.0.0', 'toId' => 'mon-twin6']);
        self::assertSame(201, $created->getStatusCode(), (string) $created->getBody());
        self::assertSame('mon-twin6', self::json($created)['id']);
        $draftId = self::json($created)['draftId'];

        $doc = self::json($this->act($this->pom, 'GET', '/prompt-packages/drafts/' . $draftId))['document'];
        self::assertSame(['id' => 'twin6-ouverte', 'version' => '1.0.0'], $doc['metadata']['forkedFrom']);
        $doc['prompts'][1]['texte'] .= "\nVariante du fork.";
        self::assertSame(200, $this->act($this->pom, 'PUT', '/prompt-packages/drafts/' . $draftId, ['document' => $doc])->getStatusCode());

        $diff = $this->act($this->pom, 'GET', '/prompt-packages/drafts/' . $draftId . '/diff-origin');
        self::assertSame(200, $diff->getStatusCode());
        $body = self::json($diff);
        self::assertSame('mon-twin6', $body['packageId']);
        self::assertSame('kairos', $body['prompts']['modified'][0]['role']);
        self::assertSame(['op' => 'add', 'text' => 'Variante du fork.'], array_intersect_key(end($body['prompts']['modified'][0]['texte']), ['op' => 1, 'text' => 1]));
        self::assertArrayHasKey('forkedFrom', $body['metadata']);
    }

    #[TestDox('UC-PRO-02-F04 — A3 : enregistrer le document NU (sans enveloppe) et changer la version du brouillon')]
    public function testF04SaveBareDocumentAndChangeVersion(): void
    {
        $draftId = $this->createDraft($this->pom, '1.1.0');
        $doc = self::json($this->act($this->pom, 'GET', '/prompt-packages/drafts/' . $draftId))['document'];
        $doc['version'] = '2.0.0';

        $saved = $this->act($this->pom, 'PUT', '/prompt-packages/drafts/' . $draftId, $doc);

        self::assertSame(200, $saved->getStatusCode(), (string) $saved->getBody());
        self::assertSame('2.0.0', self::json($saved)['version']);
        self::assertSame(['2.0.0'], array_column(self::json($this->act($this->pom, 'GET', '/prompt-packages/drafts')), 'version'));
    }

    #[TestDox('UC-PRO-02-F05 — E1 : visiteur 401, apprenant 403, admin 403 (pas de super-rôle)')]
    public function testF05PromptologueRoleIsRequired(): void
    {
        $body = ['fromId' => 'aurora-demo', 'fromVersion' => '1.0.0', 'version' => '1.1.0'];
        $apprenant = $this->registerAs('eleve@example.org', 'Élève', ['apprenant']);
        $admin = $this->registerAdmin();

        $visitor = $this->act(null, 'POST', '/prompt-packages/drafts', $body);
        self::assertSame(401, $visitor->getStatusCode());
        self::assertSame(['error' => 'Authentication required'], self::json($visitor));
        self::assertSame(['error' => 'Forbidden'], self::json($this->act($apprenant, 'GET', '/prompt-packages/drafts')));
        self::assertSame(401, $this->act(null, 'GET', '/prompt-packages/drafts')->getStatusCode());
        foreach ([$apprenant, $admin] as $user) {
            self::assertSame(403, $this->act($user, 'POST', '/prompt-packages/drafts', $body)->getStatusCode());
            self::assertSame(403, $this->act($user, 'GET', '/prompt-packages/drafts')->getStatusCode());
        }
        self::assertSame(0, (int) self::$pdo->query("SELECT COUNT(*) FROM prompt_versions WHERE status = 'draft'")->fetchColumn());
    }

    #[TestDox('UC-PRO-02-F06 — E2 : mutation sans jeton CSRF depuis une session → 403, rien n’est écrit')]
    public function testF06MutationsRequireTheCsrfToken(): void
    {
        $draftId = $this->createDraft($this->pom);
        $doc = self::json($this->act($this->pom, 'GET', '/prompt-packages/drafts/' . $draftId))['document'];
        $doc['description'] = 'Sans jeton';

        $post = $this->act($this->pom, 'POST', '/prompt-packages/drafts', ['fromId' => 'aurora-demo', 'fromVersion' => '1.0.0', 'version' => '1.2.0'], false);
        $put = $this->act($this->pom, 'PUT', '/prompt-packages/drafts/' . $draftId, ['document' => $doc], false);

        self::assertSame([403, 403], [$post->getStatusCode(), $put->getStatusCode()]);
        self::assertSame(['error' => 'Jeton CSRF absent ou invalide'], self::json($put));
        self::assertCount(1, self::json($this->act($this->pom, 'GET', '/prompt-packages/drafts')));
        self::assertNotSame('Sans jeton', self::json($this->act($this->pom, 'GET', '/prompt-packages/drafts/' . $draftId))['document']['description']);
    }

    #[TestDox('UC-PRO-02-F07 — E3 : corps de création invalide (JSON non objet 400, champs manquants 422, semver invalide 422)')]
    public function testF07CreationBodyValidation(): void
    {
        $raw = ProSupport::rawRequest($this->pom['sid'], $this->pom['csrf'], $this->clientIp, 'POST', '/api/prompt-packages/drafts', '"1.1.0"');
        self::assertSame(400, $raw->getStatusCode());
        self::assertSame(['error' => 'Corps JSON invalide'], self::json($raw));

        $missing = $this->act($this->pom, 'POST', '/prompt-packages/drafts', ['fromId' => 'aurora-demo', 'version' => '1.1.0']);
        self::assertSame(422, $missing->getStatusCode());
        self::assertSame('Champs requis : fromId, fromVersion (version source) et version (nouvelle version)', self::json($missing)['error']);

        $semver = $this->act($this->pom, 'POST', '/prompt-packages/drafts', ['fromId' => 'aurora-demo', 'fromVersion' => '1.0.0', 'version' => 'v2']);
        self::assertSame(422, $semver->getStatusCode());
        self::assertSame(['error' => 'Document invalide', 'details' => ['/version' => ['Version semver invalide']]], self::json($semver));
    }

    #[TestDox('UC-PRO-02-F08 — E4 : source inconnue, brouillon d’autrui ou Golden privé → même 404')]
    public function testF08UnknownForeignOrPrivateSourceIs404(): void
    {
        $zoe = $this->registerAs('zoe@example.org', 'Zoé', ['promptologue']);
        $this->createDraft($zoe, '1.5.0');
        ProSupport::importGolden(self::$pdo, $this->registerAdmin()['id']);

        $bodies = [];
        foreach ([['aurora-demo', '9.9.9'], ['aurora-demo', '1.5.0'], [ProSupport::GOLDEN, '1.0.0']] as [$fromId, $from]) {
            $response = $this->act($this->pom, 'POST', '/prompt-packages/drafts', ['fromId' => $fromId, 'fromVersion' => $from, 'version' => '3.0.0']);
            self::assertSame(404, $response->getStatusCode(), $fromId . '@' . $from);
            $bodies[] = (string) $response->getBody();
        }
        self::assertSame(['{"error":"Version source introuvable"}'], array_values(array_unique($bodies)));
    }

    #[TestDox('UC-PRO-02-F09 — E5 : version déjà prise dans le paquet → 409')]
    public function testF09ExistingVersionIsAConflict(): void
    {
        $this->createDraft($this->pom, '1.1.0');

        foreach (['1.0.0', '1.1.0'] as $taken) {
            $response = $this->act($this->pom, 'POST', '/prompt-packages/drafts', ['fromId' => 'aurora-demo', 'fromVersion' => '1.0.0', 'version' => $taken]);
            self::assertSame(409, $response->getStatusCode(), $taken);
            self::assertSame('Version ' . $taken . ' of prompt package "aurora-demo" already exists', self::json($response)['error']);
        }
    }

    #[TestDox('UC-PRO-02-F10 — E6 : fork d’un paquet réservé sans nouveau nom valide → 422 ; nom déjà pris → 409')]
    public function testF10ReservedForkRequiresAFreshValidName(): void
    {
        ProSupport::publish(self::$pdo, ProSupport::reservedDoc());
        $fork = fn (?string $toId): ResponseInterface => $this->act($this->pom, 'POST', '/prompt-packages/drafts', array_filter(
            ['fromId' => 'twin6-ouverte', 'fromVersion' => '1.0.0', 'version' => '1.1.0', 'toId' => $toId],
            static fn ($v) => $v !== null,
        ));

        foreach ([null, 'twin6-ouverte', 'Mon Twin6'] as $toId) {
            $response = $fork($toId);
            self::assertSame(422, $response->getStatusCode(), (string) $toId);
            self::assertArrayHasKey('/toId', self::json($response)['details']);
        }
        $taken = $fork('aurora-demo');
        self::assertSame(409, $taken->getStatusCode());
        self::assertStringContainsString('existe déjà', self::json($taken)['error']);
    }

    #[TestDox('UC-PRO-02-F11 — E7 : enregistrement refusé (schéma 422 avec détails, id changé 422, collision de version 409, corps vide 400)')]
    public function testF11SaveIsValidated(): void
    {
        $draftId = $this->createDraft($this->pom);
        $doc = self::json($this->act($this->pom, 'GET', '/prompt-packages/drafts/' . $draftId))['document'];
        $path = '/prompt-packages/drafts/' . $draftId;

        $invalid = $doc;
        $invalid['prompts'][0]['texte'] = '';
        $schema = $this->act($this->pom, 'PUT', $path, ['document' => $invalid]);
        self::assertSame(422, $schema->getStatusCode());
        self::assertSame('Document invalide', self::json($schema)['error']);
        self::assertArrayHasKey('/prompts/0/texte', self::json($schema)['details']);

        $renamed = $doc;
        $renamed['id'] = 'autre-paquet';
        self::assertSame(422, $this->act($this->pom, 'PUT', $path, ['document' => $renamed])->getStatusCode());

        $collision = $doc;
        $collision['version'] = '1.0.0';
        self::assertSame(409, $this->act($this->pom, 'PUT', $path, ['document' => $collision])->getStatusCode());

        $empty = $this->act($this->pom, 'PUT', $path, null);
        self::assertSame(400, $empty->getStatusCode());
        self::assertSame('Corps JSON invalide : document prompt-package complet attendu', self::json($empty)['error']);

        self::assertEquals($doc, self::json($this->act($this->pom, 'GET', $path))['document'], 'brouillon intact');
    }

    #[TestDox('UC-PRO-02-F12 — E8 : brouillon d’autrui ou inconnu → même 404 (lecture, écriture, diff)')]
    public function testF12ForeignOrUnknownDraftIs404(): void
    {
        $draftId = $this->createDraft($this->pom);
        $doc = self::json($this->act($this->pom, 'GET', '/prompt-packages/drafts/' . $draftId))['document'];
        $zoe = $this->registerAs('zoe@example.org', 'Zoé', ['promptologue']);

        self::assertSame([], self::json($this->act($zoe, 'GET', '/prompt-packages/drafts')));
        foreach ([$draftId, 999999] as $id) {
            foreach ([
                $this->act($zoe, 'GET', '/prompt-packages/drafts/' . $id),
                $this->act($zoe, 'PUT', '/prompt-packages/drafts/' . $id, ['document' => $doc]),
                $this->act($zoe, 'GET', '/prompt-packages/drafts/' . $id . '/diff-origin'),
            ] as $response) {
                self::assertSame(404, $response->getStatusCode());
                self::assertSame(['error' => 'Brouillon introuvable'], self::json($response));
            }
        }
    }

    #[TestDox('UC-PRO-02-F13 — E9 : enregistrer une version déjà publiée → 409 (immuable)')]
    public function testF13PublishedVersionCannotBeEdited(): void
    {
        $draftId = $this->createDraft($this->pom);
        $doc = self::json($this->act($this->pom, 'GET', '/prompt-packages/drafts/' . $draftId))['document'];
        self::assertSame(200, $this->act($this->pom, 'POST', '/prompt-packages/drafts/' . $draftId . '/publish', ['changelog' => 'Publication'])->getStatusCode());

        $response = $this->act($this->pom, 'PUT', '/prompt-packages/drafts/' . $draftId, ['document' => $doc]);

        self::assertSame(409, $response->getStatusCode());
        self::assertSame('Published versions are immutable: create a new draft instead', self::json($response)['error']);
        self::assertSame(404, $this->act($this->pom, 'GET', '/prompt-packages/drafts/' . $draftId)->getStatusCode(), 'n’est plus un brouillon');
    }

    #[TestDox('UC-PRO-02-F14 — E10 : diff-origin sur un brouillon non forké → 422 ; original introuvable → 409')]
    public function testF14DiffOriginErrors(): void
    {
        $plain = $this->createDraft($this->pom);
        $notFork = $this->act($this->pom, 'GET', '/prompt-packages/drafts/' . $plain . '/diff-origin');
        self::assertSame(422, $notFork->getStatusCode());
        self::assertStringContainsString('pas d’original de référence', self::json($notFork)['error']);

        // Un forkedFrom qui ne désigne aucune version publiée (édité à la main).
        $doc = self::json($this->act($this->pom, 'GET', '/prompt-packages/drafts/' . $plain))['document'];
        $doc['metadata']['forkedFrom'] = ['id' => 'aurora-demo', 'version' => '0.1.0'];
        self::assertSame(200, $this->act($this->pom, 'PUT', '/prompt-packages/drafts/' . $plain, ['document' => $doc])->getStatusCode());
        $gone = $this->act($this->pom, 'GET', '/prompt-packages/drafts/' . $plain . '/diff-origin');
        self::assertSame(409, $gone->getStatusCode());
        self::assertSame(['error' => 'Version d’origine introuvable (n’est plus publiée).'], self::json($gone));
    }

    #[TestDox('UC-PRO-02-F15 — limite : pas de concurrence optimiste, If-Match ignoré, le dernier enregistrement l’emporte')]
    public function testF15NoOptimisticConcurrency(): void
    {
        $draftId = $this->createDraft($this->pom);
        $loaded = self::json($this->act($this->pom, 'GET', '/prompt-packages/drafts/' . $draftId))['document'];
        $tabA = $loaded;
        $tabA['description'] = 'Onglet A';
        $tabB = $loaded;
        $tabB['description'] = 'Onglet B';

        self::assertSame(200, $this->act($this->pom, 'PUT', '/prompt-packages/drafts/' . $draftId, ['document' => $tabA])->getStatusCode());
        $stale = $this->act($this->pom, 'PUT', '/prompt-packages/drafts/' . $draftId, ['document' => $tabB], true, ['If-Match' => '"empreinte-perimee"']);

        self::assertSame(200, $stale->getStatusCode(), 'aucune précondition vérifiée');
        self::assertSame('Onglet B', self::json($this->act($this->pom, 'GET', '/prompt-packages/drafts/' . $draftId))['document']['description']);
    }

    #[TestDox('UC-PRO-02-F16 — anomalie : l’auteur supprime son compte → son brouillon orphelin bloque la version pour les autres (comportement figé)')]
    public function testF16OrphanDraftAfterAccountDeletion(): void
    {
        $this->createDraft($this->pom, '1.1.0');
        self::assertSame(204, $this->act($this->pom, 'DELETE', '/auth/account')->getStatusCode());
        $zoe = $this->registerAs('zoe@example.org', 'Zoé', ['promptologue']);

        $response = $this->act($zoe, 'POST', '/prompt-packages/drafts', ['fromId' => 'aurora-demo', 'fromVersion' => '1.0.0', 'version' => '1.1.0']);

        self::assertSame(409, $response->getStatusCode(), 'la version 1.1.0 reste occupée par un brouillon que personne ne voit');
        self::assertSame(1, (int) self::$pdo->query("SELECT COUNT(*) FROM prompt_versions WHERE status = 'draft' AND created_by IS NULL")->fetchColumn());
    }
}
