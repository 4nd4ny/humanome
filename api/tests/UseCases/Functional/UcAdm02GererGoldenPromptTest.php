<?php

declare(strict_types=1);

namespace Humanome\Tests\UseCases\Functional;

use Humanome\Packages\PromptPackageRepository;
use Humanome\Tests\CartographeTestCase;
use Humanome\Tests\TestDb;
use Humanome\Tests\UseCases\Support\BancSupport;
use Humanome\Tests\UseCases\Support\ProSupport;
use PHPUnit\Framework\Attributes\TestDox;

/**
 * UC-ADM-02 — Gérer le Golden Prompt et ses accès : tests FONCTIONNELS (API).
 *
 * Fiche : docs/cas-utilisation/administration/UC-ADM-02-gerer-golden-prompt.md
 *
 * Chaque test rejoue un scénario de la fiche à travers l'API HTTP réelle
 * (Slim en processus, MySQL) : l'administrateur — session + jeton CSRF —
 * importe un Golden privé, le liste, autorise un promptologue ; les refus
 * (rôle, CSRF, document, immutabilité, cible) et l'invisibilité publique du
 * Golden sont vérifiés du point de vue des autres comptes.
 */
final class UcAdm02GererGoldenPromptTest extends CartographeTestCase
{
    use BancSupport;

    private const GOLDEN = 'golden-reference';

    /** @var array{id: int, csrf: string, sid: string} */
    private array $admin;

    protected function setUp(): void
    {
        parent::setUp(); // comptes (+ cascades) et audit vidés
        self::$pdo->exec('DELETE FROM prompt_packages'); // versions + golden_grants en cascade
        self::$pdo->exec('DELETE FROM settings');
        $this->admin = $this->registerAs('root@example.org', 'Root Admin', ['admin']);
    }

    /** @return array<string, mixed> */
    private static function golden(array $overrides = []): array
    {
        return self::bancPackage(array_merge(['id' => self::GOLDEN, 'description' => 'Golden de référence (privé).'], $overrides));
    }

    private function import(array $document): \Psr\Http\Message\ResponseInterface
    {
        return $this->as_($this->admin, 'POST', '/api/admin/golden', ['document' => $document]);
    }

    private function grant(int|string|null $userId, string $slug = self::GOLDEN): \Psr\Http\Message\ResponseInterface
    {
        return $this->as_($this->admin, 'POST', '/api/admin/golden/' . $slug . '/grant', $userId === null ? [] : ['userId' => $userId]);
    }

    #[TestDox('UC-ADM-02-F01 — nominal : liste vide, import privé (201), liste sans contenu, autorisation d’un promptologue, audits')]
    public function testF01ImportListAndGrant(): void
    {
        $pom = $this->registerAs('pom@example.org', 'Pom', ['promptologue']);

        // 2. État initial.
        self::assertSame([], self::json($this->as_($this->admin, 'GET', '/api/admin/golden')));

        // 3-5. Import (document encapsulé, comme le front).
        $created = $this->import(self::golden());
        self::assertSame(201, $created->getStatusCode(), (string) $created->getBody());
        self::assertSame(['imported', self::GOLDEN, '1.0.0'], [self::json($created)['status'], self::json($created)['id'], self::json($created)['version']]);
        $listed = $this->as_($this->admin, 'GET', '/api/admin/golden');
        $list = self::json($listed);
        self::assertSame([self::GOLDEN], array_column($list, 'id'));
        self::assertSame(['1.0.0'], $list[0]['versions']);
        self::assertSame([], $list[0]['grants']);
        self::assertStringNotContainsString('Tu es le Greffier', (string) $listed->getBody(), 'jamais le contenu du Golden');

        // 6-8. Autorisation.
        $granted = $this->grant($pom['id']);
        self::assertSame(200, $granted->getStatusCode(), (string) $granted->getBody());
        self::assertSame(['status' => 'granted', 'id' => self::GOLDEN, 'userId' => $pom['id']], self::json($granted));
        $grants = self::json($this->as_($this->admin, 'GET', '/api/admin/golden'))[0]['grants'];
        self::assertSame([[$pom['id'], 'Pom', 'pom@example.org']], array_map(
            static fn (array $g): array => [$g['userId'], $g['displayName'], $g['email']],
            $grants,
        ));

        // Journal : identifiants seulement.
        self::assertSame($this->admin['id'], self::lastAudit('golden_imported')['userId']);
        self::assertEquals(['version' => '1.0.0', 'packageId' => $list[0]['packageId']], self::lastAudit('golden_imported')['details']);
        self::assertEquals(['packageId' => $list[0]['packageId'], 'targetUserId' => $pom['id']], self::lastAudit('golden_access_granted')['details']);
    }

    #[TestDox('UC-ADM-02-F02 — A1 + A2 : ré-import identique = 200 inchangé ; nouvelle version = 201, deux versions listées')]
    public function testF02ReimportAndNewVersion(): void
    {
        self::assertSame(201, $this->import(self::golden())->getStatusCode());

        $again = $this->import(self::golden());
        self::assertSame(200, $again->getStatusCode());
        self::assertSame('unchanged', self::json($again)['status']);

        self::assertSame(201, $this->import(self::golden(['version' => '1.1.0']))->getStatusCode());
        self::assertSame(['1.0.0', '1.1.0'], self::json($this->as_($this->admin, 'GET', '/api/admin/golden'))[0]['versions']);
    }

    #[TestDox('UC-ADM-02-F03 — A3 : autoriser deux fois = « unchanged », un seul événement d’audit')]
    public function testF03GrantIsIdempotent(): void
    {
        $pom = $this->registerAs('pom@example.org', 'Pom', ['promptologue']);
        $this->import(self::golden());

        self::assertSame('granted', self::json($this->grant($pom['id']))['status']);
        self::assertSame('unchanged', self::json($this->grant($pom['id']))['status']);
        self::assertSame(1, (int) self::$pdo->query("SELECT COUNT(*) FROM audit_events WHERE type = 'golden_access_granted'")->fetchColumn());
    }

    #[TestDox('UC-ADM-02-F04 — A4 : document « nu » (sans enveloppe {document}) accepté, comme par un script d’import')]
    public function testF04BareDocumentBodyIsAccepted(): void
    {
        $response = $this->as_($this->admin, 'POST', '/api/admin/golden', self::golden());
        self::assertSame(201, $response->getStatusCode(), (string) $response->getBody());
    }

    #[TestDox('UC-ADM-02-F05 — E1 + E9 : anonyme 401, promptologue 403 « Rôle insuffisant » sur les trois routes ; admin sans jeton CSRF 403 sur l’import ET l’autorisation')]
    public function testF05RoleAndCsrfGuards(): void
    {
        $pom = $this->registerAs('pom@example.org', 'Pom', ['promptologue']);
        $this->cookieSid = null;
        $_SESSION = [];
        self::assertSame(401, $this->request('GET', '/api/admin/golden')->getStatusCode());

        // Jeton CSRF VALIDE du promptologue : c'est bien la garde de rôle qui refuse.
        foreach ([
            $this->as_($pom, 'GET', '/api/admin/golden'),
            $this->as_($pom, 'POST', '/api/admin/golden', ['document' => self::golden()]),
            $this->as_($pom, 'POST', '/api/admin/golden/' . self::GOLDEN . '/grant', ['userId' => $pom['id']]),
        ] as $refus) {
            self::assertSame(403, $refus->getStatusCode());
            self::assertSame(['error' => 'Rôle insuffisant'], self::json($refus));
        }

        // Admin sans X-CSRF-Token : import (étape 3) refusé, rien d'écrit.
        $this->cookieSid = $this->admin['sid'];
        $sansJeton = $this->request('POST', '/api/admin/golden', ['document' => self::golden()]);
        self::assertSame(403, $sansJeton->getStatusCode(), 'sans X-CSRF-Token');
        self::assertSame(['error' => 'Jeton CSRF absent ou invalide'], self::json($sansJeton));
        self::assertSame(0, (int) self::$pdo->query('SELECT COUNT(*) FROM prompt_packages')->fetchColumn());

        // Autorisation (étape 6) sans X-CSRF-Token : refusée, aucune autorisation ni audit.
        self::assertSame(201, $this->import(self::golden())->getStatusCode());
        $this->cookieSid = $this->admin['sid'];
        $grantSansJeton = $this->request('POST', '/api/admin/golden/' . self::GOLDEN . '/grant', ['userId' => $pom['id']]);
        self::assertSame(403, $grantSansJeton->getStatusCode());
        self::assertSame(['error' => 'Jeton CSRF absent ou invalide'], self::json($grantSansJeton));
        self::assertSame(0, (int) self::$pdo->query('SELECT COUNT(*) FROM golden_grants')->fetchColumn());
        self::assertSame(0, (int) self::$pdo->query("SELECT COUNT(*) FROM audit_events WHERE type = 'golden_access_granted'")->fetchColumn());
    }

    #[TestDox('UC-ADM-02-F06 — E3 + E10 : document invalide au schéma 422, corps vide 400 (message)')]
    public function testF06InvalidDocumentOrEmptyBody(): void
    {
        $invalid = $this->import(self::golden(['prompts' => []]));
        self::assertSame(422, $invalid->getStatusCode());
        self::assertSame(['error' => 'Document prompt-package invalide'], self::json($invalid));

        // Corps réellement ABSENT, puis objet JSON vide (« [] ») : même 400.
        foreach ([null, []] as $corps) {
            $vide = $this->as_($this->admin, 'POST', '/api/admin/golden', $corps);
            self::assertSame(400, $vide->getStatusCode());
            self::assertSame(['error' => 'Corps JSON invalide : document prompt-package attendu'], self::json($vide));
        }
        // Une enveloppe dont « document » n'est pas un objet est lue comme un
        // document nu (A4)… donc refusée au schéma.
        self::assertSame(422, $this->as_($this->admin, 'POST', '/api/admin/golden', ['document' => 'pas un objet'])->getStatusCode());
    }

    #[TestDox('UC-ADM-02-F07 — E4 + E5 : même version au contenu différent 409 (immuable) ; identifiant d’un paquet public 409')]
    public function testF07ImmutabilityAndPublicSlugCollision(): void
    {
        $this->import(self::golden());
        $mutated = $this->import(self::golden(['description' => 'Contenu modifié']));
        self::assertSame(409, $mutated->getStatusCode());
        self::assertStringContainsString('versions immuables', self::json($mutated)['error']);

        (new PromptPackageRepository(self::$pdo))->importPublishedDocument(self::bancPackage());
        $collide = $this->import(self::golden(['id' => 'aurora-demo']));
        self::assertSame(409, $collide->getStatusCode());
        self::assertStringContainsString('identifiant distinct', self::json($collide)['error']);
    }

    #[TestDox('UC-ADM-02-F08 — E6 : accès refusé à un compte non promptologue (apprenant, établissement) — 422')]
    public function testF08GrantOnlyToPromptologues(): void
    {
        $this->import(self::golden());
        $maya = $this->registerAs('maya@example.org', 'Maya', ['apprenant']);
        $lycee = $this->registerAs('lycee@example.org', 'Lycée', ['etablissement']);

        foreach ([$maya, $lycee] as $target) {
            $response = $this->grant($target['id']);
            self::assertSame(422, $response->getStatusCode());
            self::assertSame(
                'L\'accès au Golden Prompt ne peut être accordé qu\'à un compte promptologue',
                self::json($response)['error'],
            );
        }
        self::assertSame([], self::json($this->as_($this->admin, 'GET', '/api/admin/golden'))[0]['grants']);
        // Garanties minimales : aucun audit d'autorisation.
        self::assertSame(0, (int) self::$pdo->query("SELECT COUNT(*) FROM audit_events WHERE type = 'golden_access_granted'")->fetchColumn());
    }

    #[TestDox('UC-ADM-02-F09 — E7 + E8 : Golden ou compte inconnu 404 ; userId absent ou non entier 422')]
    public function testF09UnknownTargetsAndMissingUserId(): void
    {
        $pom = $this->registerAs('pom@example.org', 'Pom', ['promptologue']);
        $this->import(self::golden());

        // Un paquet PUBLIC n'est pas un Golden : même réponse qu'un inconnu.
        (new PromptPackageRepository(self::$pdo))->importPublishedDocument(self::bancPackage());
        foreach ([
            [$this->grant($pom['id'], 'inconnu'), 'Golden Prompt introuvable'],
            [$this->grant($pom['id'], 'aurora-demo'), 'Golden Prompt introuvable'],
            [$this->grant(999999), 'Compte introuvable'],
        ] as [$response, $message]) {
            self::assertSame(404, $response->getStatusCode());
            self::assertSame(['error' => $message], self::json($response));
        }
        foreach ([null, (string) $pom['id'], 0] as $bad) {
            $response = $this->grant($bad);
            self::assertSame(422, $response->getStatusCode());
            self::assertSame('Champ requis : userId (entier)', self::json($response)['error']);
        }
    }

    #[TestDox('UC-ADM-02-F10 — RG1 + Limite : même AUTORISÉ, un promptologue ne voit le Golden sur aucune route (liste, document, diff, fork)')]
    public function testF10GrantedPromptologueStillSeesNothing(): void
    {
        $pom = $this->registerAs('pom@example.org', 'Pom', ['promptologue']);
        $this->import(self::golden());
        $this->import(self::golden(['version' => '1.1.0']));
        $this->grant($pom['id']);

        self::assertNotContains(self::GOLDEN, array_column(self::json($this->as_($pom, 'GET', '/api/prompt-packages')), 'id'));
        self::assertSame(404, $this->as_($pom, 'GET', '/api/prompt-packages/' . self::GOLDEN . '/1.0.0')->getStatusCode());
        self::assertSame(404, $this->as_($pom, 'GET', '/api/prompt-packages/' . self::GOLDEN . '/diff/1.0.0/1.1.0')->getStatusCode());
        self::assertSame(404, $this->as_($pom, 'GET', '/api/prompt-packages/default')->getStatusCode(), 'aucun paquet public : pas de défaut');
        $fork = $this->as_($pom, 'POST', '/api/prompt-packages/drafts', ['fromId' => self::GOLDEN, 'fromVersion' => '1.1.0', 'version' => '2.0.0']);
        self::assertSame(404, $fork->getStatusCode());
    }

    #[TestDox('UC-ADM-02-F11 — RG5 : le promptologue supprime son compte — son autorisation disparaît de la liste admin')]
    public function testF11AccountPurgeRemovesTheGrant(): void
    {
        $pom = $this->registerAs('pom@example.org', 'Pom', ['promptologue']);
        $noe = $this->registerAs('noe@example.org', 'Noé', ['promptologue']);
        $this->import(self::golden());
        $this->grant($pom['id']);
        $this->grant($noe['id']);

        self::assertSame(204, $this->as_($pom, 'DELETE', '/api/auth/account')->getStatusCode());

        $grants = self::json($this->as_($this->admin, 'GET', '/api/admin/golden'))[0]['grants'];
        self::assertSame([$noe['id']], array_column($grants, 'userId'));
    }

    #[TestDox('UC-ADM-02-F20 — anomalie AN-1 : l’import de DÉPLOIEMENT accepte l’identifiant d’un Golden — description écrasée, version « publiée » invisible (comportement actuel figé)')]
    public function testF20DeploymentImportDoesNotGuardGoldenSlugs(): void
    {
        // COMPORTEMENT ACTUEL, documenté comme anomalie (fiche, AN-1) : la garde
        // de E5 n'est pas symétrique — POST /api/admin/import-prompt-package
        // (outillage de déploiement, X-Migrate-Token) ne filtre pas is_private.
        self::assertSame(201, $this->import(self::golden())->getStatusCode());
        TestDb::setEnv('MIGRATE_TOKEN', 'jeton-deploiement-banc');
        $this->cookieSid = null; // script de déploiement : aucun cookie de session
        $deploy = fn (array $doc) => $this->request('POST', '/api/admin/import-prompt-package', $doc, ['X-Migrate-Token' => 'jeton-deploiement-banc']);

        $nouvelle = $deploy(self::golden(['version' => '2.0.0', 'description' => 'Description écrasée par le déploiement']));
        self::assertSame(200, $nouvelle->getStatusCode(), (string) $nouvelle->getBody());
        self::assertSame('imported', self::json($nouvelle)['status']); // ANOMALIE : devrait refuser (409)

        $liste = self::json($this->as_($this->admin, 'GET', '/api/admin/golden'));
        self::assertSame('Description écrasée par le déploiement', $liste[0]['description']); // ANOMALIE
        self::assertSame(['1.0.0', '2.0.0'], $liste[0]['versions']);
        // La version « publiée » reste invisible du public (paquet toujours privé).
        $this->cookieSid = null;
        self::assertNotContains(self::GOLDEN, array_column(self::json($this->request('GET', '/api/prompt-packages')), 'id'));

        // Sur une version existante, la réponse confirme l'existence du Golden.
        $this->cookieSid = null;
        self::assertSame('unchanged', self::json($deploy(self::golden()))['status']);
        $this->cookieSid = null;
        self::assertSame(409, $deploy(self::golden(['description' => 'autre contenu']))->getStatusCode());
    }

    #[TestDox('UC-ADM-02-F21 — anomalie AN-2 : le fork renommé d’un paquet réservé révèle l’existence d’un slug Golden (409 nommé) (comportement actuel figé)')]
    public function testF21ReservedForkRenameRevealsGoldenSlugs(): void
    {
        // COMPORTEMENT ACTUEL, documenté comme anomalie (fiche, AN-2) :
        // packageForReservedFork cherche le slug cible sans filtrer is_private.
        $reserve = self::bancPackage(['id' => 'twin6-ouverte', 'description' => 'Cartographie ouverte Twin6 (réservée).']);
        $reserve['metadata']['reserved'] = true;
        (new PromptPackageRepository(self::$pdo))->importPublishedDocument($reserve);
        self::assertSame(201, $this->import(self::golden())->getStatusCode());
        $pom = $this->registerAs('pom@example.org', 'Pom', ['promptologue']);
        $fork = fn (string $toId) => $this->request(
            'POST',
            '/api/prompt-packages/drafts',
            ['fromId' => 'twin6-ouverte', 'fromVersion' => '1.0.0', 'version' => '1.1.0', 'toId' => $toId],
            ['X-CSRF-Token' => $pom['csrf']],
            ProSupport::webApp(),
        );

        $this->cookieSid = $pom['sid'];
        $sonde = $fork(self::GOLDEN);
        self::assertSame(409, $sonde->getStatusCode()); // ANOMALIE : révèle le slug privé
        self::assertStringContainsString('« ' . self::GOLDEN . ' » existe déjà', self::json($sonde)['error']);
        // Contre-épreuve : un nom réellement libre est accepté.
        $this->cookieSid = $pom['sid'];
        self::assertSame(201, $fork('mon-twin6')->getStatusCode());
        // Le contenu du Golden, lui, reste protégé.
        self::assertStringNotContainsString('Golden de référence', (string) $sonde->getBody());
    }
}
