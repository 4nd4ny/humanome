<?php

declare(strict_types=1);

namespace Humanome\Tests\UseCases\Functional;

use Humanome\Packages\SettingsRepository;
use Humanome\Tests\AdminTestCase;
use Humanome\Tests\UseCases\Support\ProSupport;
use PHPUnit\Framework\Attributes\TestDox;
use Psr\Http\Message\ResponseInterface;

/**
 * UC-PRO-03 — Publier une version de paquet (immuable) : tests FONCTIONNELS
 * (API).
 *
 * Fiche : docs/cas-utilisation/promptologue/UC-PRO-03-publier-version-paquet.md
 *
 * Le promptologue (vrai navigateur simulé : session + CSRF) prépare son
 * brouillon par les routes réelles (précondition UC-PRO-02), puis le publie ;
 * les effets sont observés par les lectures publiques (UC-PRO-01) comme les
 * verraient un visiteur, le lanceur de runs ou un autre promptologue.
 */
final class UcPro03PublierVersionPaquetTest extends AdminTestCase
{
    /** @var array{id: int, csrf: string, sid: string} */
    private array $pom;

    protected function setUp(): void
    {
        parent::setUp();
        ProSupport::publish(self::$pdo); // aurora-demo 1.0.0
        $this->pom = $this->registerAs('pom@example.org', 'Pom', ['promptologue']);
    }

    private function act(?array $user, string $method, string $path, ?array $body = null, bool $csrf = true, array $headers = []): ResponseInterface
    {
        $this->cookieSid = $user['sid'] ?? null;
        if ($user !== null && $csrf && $method !== 'GET') {
            $headers['X-CSRF-Token'] = $user['csrf'];
        }

        return $this->request($method, '/api' . $path, $body, $headers, ProSupport::webApp());
    }

    /** Précondition UC-PRO-02 : un brouillon (éventuellement retouché) de l'auteur. */
    private function draft(string $version, ?callable $edit = null, array $extra = []): int
    {
        $created = $this->act($this->pom, 'POST', '/prompt-packages/drafts', ['fromId' => 'aurora-demo', 'fromVersion' => '1.0.0', 'version' => $version] + $extra);
        self::assertSame(201, $created->getStatusCode(), (string) $created->getBody());
        $draftId = (int) self::json($created)['draftId'];
        if ($edit !== null) {
            $doc = self::json($this->act($this->pom, 'GET', '/prompt-packages/drafts/' . $draftId))['document'];
            $edit($doc);
            self::assertSame(200, $this->act($this->pom, 'PUT', '/prompt-packages/drafts/' . $draftId, ['document' => $doc])->getStatusCode());
        }

        return $draftId;
    }

    private function publish(int $draftId, ?array $body = ['changelog' => 'Consigne de citation renforcée.'], ?array $user = null, bool $csrf = true): ResponseInterface
    {
        return $this->act($user ?? $this->pom, 'POST', '/prompt-packages/drafts/' . $draftId . '/publish', $body, $csrf);
    }

    #[TestDox('UC-PRO-03-F01 — nominal : publier → 200, version publique, changelog et publieLe, plus un brouillon, dérivable par autrui')]
    public function testF01PublishMakesTheVersionPublicAndImmutable(): void
    {
        $draftId = $this->draft('1.1.0', static function (array &$doc): void {
            $doc['prompts'][0]['texte'] .= "\nConsigne de citation renforcée.";
            $doc['description'] = 'Extraction resserrée.';
        });

        $response = $this->publish($draftId, ['changelog' => '  Consigne de citation renforcée.  ']);

        self::assertSame(200, $response->getStatusCode(), (string) $response->getBody());
        self::assertSame(['id' => 'aurora-demo', 'version' => '1.1.0', 'status' => 'published'], self::json($response));

        $list = self::json($this->act(null, 'GET', '/prompt-packages'));
        self::assertSame(['1.0.0', '1.1.0'], array_column($list, 'version'));
        self::assertSame('Extraction resserrée.', $list[1]['description']);
        $doc = self::json($this->act(null, 'GET', '/prompt-packages/aurora-demo/1.1.0'));
        self::assertEquals(['version' => '1.1.0', 'date' => date('Y-m-d'), 'description' => 'Consigne de citation renforcée.'], end($doc['changelog']));
        // publieLe posé à la publication (date du jour), pas celui de la version source.
        self::assertStringStartsWith(date('Y-m-d') . 'T', $doc['metadata']['publieLe']);
        self::assertNotSame(ProSupport::packageDoc()['metadata']['publieLe'], $doc['metadata']['publieLe']);
        self::assertStringEndsWith('Consigne de citation renforcée.', $doc['prompts'][0]['texte']);
        self::assertSame([], self::json($this->act($this->pom, 'GET', '/prompt-packages/drafts')));

        // Exécutable (dérivable) par autrui dès sa publication.
        $zoe = $this->registerAs('zoe@example.org', 'Zoé', ['promptologue']);
        self::assertSame(201, $this->act($zoe, 'POST', '/prompt-packages/drafts', ['fromId' => 'aurora-demo', 'fromVersion' => '1.1.0', 'version' => '1.2.0'])->getStatusCode());
    }

    #[TestDox('UC-PRO-03-F02 — A1 : sans défaut validé, la nouvelle version devient le défaut servi ; un défaut validé, lui, ne bouge pas')]
    public function testF02PublicationMovesTheEffectiveDefaultOnlyWithoutAValidatedOne(): void
    {
        self::assertSame(200, $this->publish($this->draft('1.1.0'))->getStatusCode());
        self::assertSame(['id' => 'aurora-demo', 'version' => '1.1.0'], self::json($this->act(null, 'GET', '/prompt-packages/default')));

        (new SettingsRepository(self::$pdo))->set(SettingsRepository::DEFAULT_PACKAGE, ['id' => 'aurora-demo', 'version' => '1.0.0']);
        self::assertSame(200, $this->publish($this->draft('1.2.0'))->getStatusCode());
        self::assertSame(['id' => 'aurora-demo', 'version' => '1.0.0'], self::json($this->act(null, 'GET', '/prompt-packages/default')));
    }

    #[TestDox('UC-PRO-03-F03 — A2 : première publication d’un fork renommé, listé non réservé')]
    public function testF03FirstPublicationOfARenamedFork(): void
    {
        ProSupport::publish(self::$pdo, ProSupport::reservedDoc());
        $created = $this->act($this->pom, 'POST', '/prompt-packages/drafts', ['fromId' => 'twin6-ouverte', 'fromVersion' => '1.0.0', 'version' => '1.0.0', 'toId' => 'mon-twin6']);
        self::assertSame(201, $created->getStatusCode());

        $response = $this->publish((int) self::json($created)['draftId'], ['changelog' => 'Ma copie de travail.']);

        self::assertSame(['id' => 'mon-twin6', 'version' => '1.0.0', 'status' => 'published'], self::json($response));
        $reserved = array_column(self::json($this->act(null, 'GET', '/prompt-packages')), 'reserved', 'id');
        self::assertFalse($reserved['mon-twin6']);
        self::assertTrue($reserved['twin6-ouverte']);
    }

    #[TestDox('UC-PRO-03-F04 — A3 : une pré-version (1.1.0-rc.1) se publie, puis la version finale 1.1.0 qui la dépasse (un brouillon 2.0.0 ne compte pas, RG2)')]
    public function testF04PreReleaseThenFinal(): void
    {
        $this->draft('2.0.0'); // brouillon supérieur, non publié : hors comparaison (RG2)
        self::assertSame(200, $this->publish($this->draft('1.1.0-rc.1'))->getStatusCode());
        self::assertSame(200, $this->publish($this->draft('1.1.0'))->getStatusCode());

        self::assertSame(['1.0.0', '1.1.0-rc.1', '1.1.0'], array_column(self::json($this->act(null, 'GET', '/prompt-packages')), 'version'));
    }

    #[TestDox('UC-PRO-03-F05 — E1 : visiteur 401, sans rôle 403 (RoleGuard), jeton CSRF absent ou faux 403 ; le brouillon reste un brouillon')]
    public function testF05GuardsOnPublication(): void
    {
        $draftId = $this->draft('1.1.0');
        $apprenant = $this->registerAs('eleve@example.org', 'Élève', ['apprenant']);
        $path = '/prompt-packages/drafts/' . $draftId . '/publish';

        $visitor = $this->act(null, 'POST', $path, ['changelog' => 'x']);
        self::assertSame(401, $visitor->getStatusCode());
        self::assertSame(['error' => 'Authentication required'], self::json($visitor));
        $noRole = $this->publish($draftId, ['changelog' => 'x'], $apprenant);
        self::assertSame(403, $noRole->getStatusCode());
        self::assertSame(['error' => 'Forbidden'], self::json($noRole), 'refus de RoleGuard, pas du CSRF');
        $noCsrf = $this->publish($draftId, ['changelog' => 'x'], $this->pom, false);
        self::assertSame(403, $noCsrf->getStatusCode());
        self::assertSame(['error' => 'Jeton CSRF absent ou invalide'], self::json($noCsrf));
        $forged = $this->act($this->pom, 'POST', $path, ['changelog' => 'x'], false, ['X-CSRF-Token' => 'faux']);
        self::assertSame(403, $forged->getStatusCode());
        self::assertSame(['error' => 'Jeton CSRF absent ou invalide'], self::json($forged));

        self::assertSame(['1.1.0'], array_column(self::json($this->act($this->pom, 'GET', '/prompt-packages/drafts')), 'version'));
    }

    #[TestDox('UC-PRO-03-F06 — E2 : changelog absent, blanc ou non textuel (y compris corps vide ou tableau JSON) → 422 ; JSON invalide ou scalaire → 400')]
    public function testF06ChangelogIsRequired(): void
    {
        $draftId = $this->draft('1.1.0');
        $path = '/api/prompt-packages/drafts/' . $draftId . '/publish';

        // [] est encodé « [] » : un tableau JSON passe le décodage et vaut « sans changelog ».
        foreach ([[], ['changelog' => '   '], ['changelog' => 42]] as $body) {
            $response = $this->publish($draftId, $body);
            self::assertSame(422, $response->getStatusCode());
            self::assertSame(['error' => 'Champ requis : changelog (résumé des changements)'], self::json($response));
        }
        $empty = ProSupport::rawRequest($this->pom['sid'], $this->pom['csrf'], $this->clientIp, 'POST', $path, '');
        self::assertSame(422, $empty->getStatusCode(), 'corps vide');
        foreach (['pas du json', '"texte"'] as $raw) {
            $response = ProSupport::rawRequest($this->pom['sid'], $this->pom['csrf'], $this->clientIp, 'POST', $path, $raw);
            self::assertSame(400, $response->getStatusCode(), $raw);
            self::assertSame(['error' => 'Corps JSON invalide'], self::json($response));
        }
        self::assertSame(404, $this->act(null, 'GET', '/prompt-packages/aurora-demo/1.1.0')->getStatusCode());
    }

    #[TestDox('UC-PRO-03-F07 — E3 : brouillon d’autrui ou inconnu → 404 « Brouillon introuvable »')]
    public function testF07ForeignOrUnknownDraftIs404(): void
    {
        $draftId = $this->draft('1.1.0');
        $zoe = $this->registerAs('zoe@example.org', 'Zoé', ['promptologue']);

        foreach ([$this->publish($draftId, ['changelog' => 'x'], $zoe), $this->publish(999999)] as $response) {
            self::assertSame(404, $response->getStatusCode());
            self::assertSame(['error' => 'Brouillon introuvable'], self::json($response));
        }
        self::assertSame(404, $this->act(null, 'GET', '/prompt-packages/aurora-demo/1.1.0')->getStatusCode());
    }

    #[TestDox('UC-PRO-03-F08 — E4 : semver non strictement croissant → 409 ; corrigé par UC-PRO-02, la publication passe')]
    public function testF08SemverMustIncrease(): void
    {
        $draftId = $this->draft('0.9.0');

        $refused = $this->publish($draftId);
        self::assertSame(409, $refused->getStatusCode());
        self::assertSame(['error' => 'Semver must be strictly increasing: 0.9.0 is not greater than published 1.0.0'], self::json($refused));

        $doc = self::json($this->act($this->pom, 'GET', '/prompt-packages/drafts/' . $draftId))['document'];
        $doc['version'] = '1.0.1';
        self::assertSame(200, $this->act($this->pom, 'PUT', '/prompt-packages/drafts/' . $draftId, ['document' => $doc])->getStatusCode());
        self::assertSame(200, $this->publish($draftId)->getStatusCode());
        self::assertSame(['1.0.0', '1.0.1'], array_column(self::json($this->act(null, 'GET', '/prompt-packages')), 'version'));
    }

    #[TestDox('UC-PRO-03-F09 — E5 : une version publiée est immuable (republier 409, réenregistrer 409, contenu inchangé)')]
    public function testF09PublishedVersionIsImmutable(): void
    {
        $draftId = $this->draft('1.1.0');
        $doc = self::json($this->act($this->pom, 'GET', '/prompt-packages/drafts/' . $draftId))['document'];
        self::assertSame(200, $this->publish($draftId, ['changelog' => 'Première'])->getStatusCode());
        $before = self::json($this->act(null, 'GET', '/prompt-packages/aurora-demo/1.1.0'));

        $again = $this->publish($draftId, ['changelog' => 'Seconde']);
        self::assertSame(409, $again->getStatusCode());
        self::assertSame(['error' => 'This version is already published (published versions are immutable)'], self::json($again));
        $doc['description'] = 'Réécriture interdite';
        self::assertSame(409, $this->act($this->pom, 'PUT', '/prompt-packages/drafts/' . $draftId, ['document' => $doc])->getStatusCode());

        self::assertEquals($before, self::json($this->act(null, 'GET', '/prompt-packages/aurora-demo/1.1.0')));
    }

    #[TestDox('UC-PRO-03-F10 — E6 : brouillon marqué reserved (via l’éditeur) → 409, jamais publié')]
    public function testF10ReservedDraftIsRefused(): void
    {
        $draftId = $this->draft('1.1.0', static function (array &$doc): void {
            $doc['metadata']['reserved'] = true;
        });

        $response = $this->publish($draftId);

        self::assertSame(409, $response->getStatusCode());
        self::assertSame(['error' => 'Ce paquet est réservé au pipeline source-unique : forkez-le sous un nouveau nom.'], self::json($response));
        self::assertSame(['1.0.0'], array_column(self::json($this->act(null, 'GET', '/prompt-packages')), 'version'));
    }

    #[TestDox('UC-PRO-03-F16 — anomalie AN-4 (comportement actuel figé) : changelog de plus de 64 Kio → 500 « Erreur interne » au lieu de 422 ; le brouillon reste un brouillon')]
    public function testF16OverlongChangelogAnswers500(): void
    {
        $draftId = $this->draft('1.1.0');

        // La colonne prompt_versions.changelog est un TEXT (65 535 octets) ; MySQL strict refuse.
        $previousLog = ini_set('error_log', '/dev/null');
        try {
            $response = $this->publish($draftId, ['changelog' => str_repeat('a', 70000)]);
        } finally {
            ini_set('error_log', (string) $previousLog);
        }

        self::assertSame(500, $response->getStatusCode(), 'attendu 422, obtenu 500');
        self::assertSame(['error' => 'Erreur interne'], self::json($response));
        self::assertSame(['1.1.0'], array_column(self::json($this->act($this->pom, 'GET', '/prompt-packages/drafts')), 'version'));
        self::assertSame(404, $this->act(null, 'GET', '/prompt-packages/aurora-demo/1.1.0')->getStatusCode());
    }

    #[TestDox('UC-PRO-03-F17 — E7 : contenu devenu non conforme au schéma au moment de publier → 422 « Document invalide » avec détails, jamais publié')]
    public function testF17InvalidDocumentAtPublicationIs422(): void
    {
        $draftId = $this->draft('1.1.0');
        // Précondition posée en base : un contenu qui ne passerait plus le schéma.
        self::$pdo->prepare("UPDATE prompt_versions SET content = JSON_REMOVE(content, '$.prompts') WHERE id = ?")->execute([$draftId]);

        $response = $this->publish($draftId);

        self::assertSame(422, $response->getStatusCode());
        $body = self::json($response);
        self::assertSame('Document invalide', $body['error']);
        self::assertNotEmpty($body['details']);
        self::assertSame(['1.1.0'], array_column(self::json($this->act($this->pom, 'GET', '/prompt-packages/drafts')), 'version'));
        self::assertSame(['1.0.0'], array_column(self::json($this->act(null, 'GET', '/prompt-packages')), 'version'));
    }
}
