<?php

declare(strict_types=1);

namespace Humanome\Tests\UseCases\Functional;

use Humanome\Packages\SettingsRepository;
use Humanome\Tests\AdminTestCase;
use Humanome\Tests\UseCases\Support\ProSupport;
use PHPUnit\Framework\Attributes\TestDox;
use Psr\Http\Message\ResponseInterface;

/**
 * UC-PRO-04 — Proposer une version par défaut : tests FONCTIONNELS (API).
 *
 * Fiche : docs/cas-utilisation/promptologue/UC-PRO-04-proposer-version-defaut.md
 *
 * Le promptologue (vrai navigateur simulé : session + CSRF) propose une
 * version publiée ; on observe l'effet par l'API publique (le défaut servi
 * ne change pas) et par l'instantané d'administration (la proposition attend
 * la validation de l'administrateur, UC-ADM-03).
 * Précondition commune : aurora-demo 1.0.0 et 2.0.0 publiées (2.0.0 est le
 * défaut effectif, faute de défaut validé).
 */
final class UcPro04ProposerVersionDefautTest extends AdminTestCase
{
    /** @var array{id: int, csrf: string, sid: string} */
    private array $pom;

    protected function setUp(): void
    {
        parent::setUp();
        ProSupport::publish(self::$pdo);
        ProSupport::publish(self::$pdo, ProSupport::packageDocV2());
        $this->pom = $this->registerAs('pom@example.org', 'Pom', ['promptologue']);
    }

    private function act(?array $user, string $method, string $path, bool $csrf = true): ResponseInterface
    {
        $this->cookieSid = $user['sid'] ?? null;
        $headers = $user !== null && $csrf && $method !== 'GET' ? ['X-CSRF-Token' => $user['csrf']] : [];

        return $this->request($method, '/api' . $path, null, $headers, ProSupport::webApp());
    }

    private function propose(string $id, string $version, ?array $user = null, bool $csrf = true): ResponseInterface
    {
        return $this->act($user ?? $this->pom, 'POST', '/prompt-packages/' . $id . '/' . $version . '/propose-default', $csrf);
    }

    private static function proposal(): ?array
    {
        return (new SettingsRepository(self::$pdo))->get(SettingsRepository::DEFAULT_PACKAGE_PROPOSAL);
    }

    /** Précondition : une proposition déjà en attente (celle d'un autre promptologue). */
    private const PENDING = ['id' => 'aurora-demo', 'version' => '2.0.0', 'proposedBy' => 1, 'proposedAt' => '2026-07-01T10:00:00+00:00'];

    private static function seedPendingProposal(): void
    {
        (new SettingsRepository(self::$pdo))->set(SettingsRepository::DEFAULT_PACKAGE_PROPOSAL, self::PENDING);
    }

    /** Garantie minimale : proposition en attente intacte, défaut servi inchangé. */
    private function assertNothingChanged(): void
    {
        // Colonne JSON MySQL : l'ordre des clés n'est pas conservé.
        self::assertEquals(self::PENDING, self::proposal(), 'la proposition en attente survit à l’échec');
        self::assertSame(['id' => 'aurora-demo', 'version' => '2.0.0'], self::json($this->act(null, 'GET', '/prompt-packages/default')));
    }

    #[TestDox('UC-PRO-04-F01 — nominal : proposer 1.0.0 → 200 « proposed », proposition enregistrée, défaut servi inchangé, visible de l’admin')]
    public function testF01ProposalIsStoredAndAwaitsTheAdmin(): void
    {
        $response = $this->propose('aurora-demo', '1.0.0');

        self::assertSame(200, $response->getStatusCode(), (string) $response->getBody());
        self::assertSame(['id' => 'aurora-demo', 'version' => '1.0.0', 'status' => 'proposed'], self::json($response));
        $proposal = self::proposal();
        self::assertSame(['aurora-demo', '1.0.0', $this->pom['id']], [$proposal['id'], $proposal['version'], $proposal['proposedBy']]);
        self::assertMatchesRegularExpression('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/', $proposal['proposedAt']);

        // Une proposition seule ne change RIEN pour les apprenants.
        self::assertSame(['id' => 'aurora-demo', 'version' => '2.0.0'], self::json($this->act(null, 'GET', '/prompt-packages/default')));
        // L'administrateur la voit en attente (UC-ADM-03).
        $admin = $this->registerAdmin();
        $snapshot = self::json($this->act($admin, 'GET', '/admin/settings'));
        self::assertSame('1.0.0', $snapshot['defaultPackage']['proposal']['version']);
        self::assertNull($snapshot['defaultPackage']['stored']);
    }

    #[TestDox('UC-PRO-04-F02 — A1 : une nouvelle proposition (même d’un autre promptologue) remplace la précédente')]
    public function testF02NewProposalReplacesThePreviousOne(): void
    {
        self::assertSame(200, $this->propose('aurora-demo', '1.0.0')->getStatusCode());
        $zoe = $this->registerAs('zoe@example.org', 'Zoé', ['promptologue']);

        self::assertSame(200, $this->propose('aurora-demo', '2.0.0', $zoe)->getStatusCode());

        $proposal = self::proposal();
        self::assertSame(['2.0.0', $zoe['id']], [$proposal['version'], $proposal['proposedBy']]);
    }

    #[TestDox('UC-PRO-04-F03 — A2 : proposer la version déjà par défaut, ou un paquet réservé, est accepté')]
    public function testF03CurrentDefaultOrReservedPackageCanBeProposed(): void
    {
        self::assertSame(200, $this->propose('aurora-demo', '2.0.0')->getStatusCode(), 'défaut effectif courant');

        ProSupport::publish(self::$pdo, ProSupport::reservedDoc());
        self::assertSame(200, $this->propose('twin6-ouverte', '1.0.0')->getStatusCode());
        self::assertSame('twin6-ouverte', self::proposal()['id']);
    }

    #[TestDox('UC-PRO-04-F04 — E1 : visiteur 401, apprenant ou admin sans rôle promptologue 403 (RoleGuard), sans jeton CSRF 403 ; la proposition en attente et le défaut sont intacts')]
    public function testF04Guards(): void
    {
        self::seedPendingProposal();
        $apprenant = $this->registerAs('eleve@example.org', 'Élève', ['apprenant']);
        $admin = $this->registerAdmin();

        $visitor = $this->act(null, 'POST', '/prompt-packages/aurora-demo/1.0.0/propose-default');
        self::assertSame(401, $visitor->getStatusCode());
        self::assertSame(['error' => 'Authentication required'], self::json($visitor));
        foreach (['apprenant' => $apprenant, 'admin (il valide, il ne propose pas)' => $admin] as $who => $user) {
            $refused = $this->propose('aurora-demo', '1.0.0', $user);
            self::assertSame(403, $refused->getStatusCode(), $who);
            self::assertSame(['error' => 'Forbidden'], self::json($refused), $who . ' : refus de RoleGuard, pas du CSRF');
        }
        $noCsrf = $this->propose('aurora-demo', '1.0.0', $this->pom, false);
        self::assertSame(403, $noCsrf->getStatusCode());
        self::assertSame(['error' => 'Jeton CSRF absent ou invalide'], self::json($noCsrf));
        // Le CSRF (middleware global) est vérifié AVANT le rôle : sans jeton, un
        // compte sans rôle reçoit le refus CSRF, pas celui de RoleGuard.
        self::assertSame(['error' => 'Jeton CSRF absent ou invalide'], self::json($this->propose('aurora-demo', '1.0.0', $apprenant, false)));

        $this->assertNothingChanged();
    }

    #[TestDox('UC-PRO-04-F05 — E2 : version inconnue, brouillon (même le sien) ou Golden privé → 404, aucune proposition')]
    public function testF05OnlyPublishedPublicVersionsCanBeProposed(): void
    {
        $this->cookieSid = $this->pom['sid'];
        $created = $this->request('POST', '/api/prompt-packages/drafts', ['fromId' => 'aurora-demo', 'fromVersion' => '2.0.0', 'version' => '2.1.0'], ['X-CSRF-Token' => $this->pom['csrf']], ProSupport::webApp());
        self::assertSame(201, $created->getStatusCode());
        ProSupport::importGolden(self::$pdo, $this->registerAdmin()['id']);
        // Préconditions ancrées : Golden publié mais privé, brouillon bien « draft ».
        self::assertSame(
            ['aurora-demo/2.1.0/draft/0', 'golden-reference/1.0.0/published/1'],
            self::$pdo->query(
                "SELECT CONCAT(pp.slug, '/', pv.semver, '/', pv.status, '/', pp.is_private) FROM prompt_versions pv JOIN prompt_packages pp ON pp.id = pv.package_id
                  WHERE pv.semver = '2.1.0' OR pp.slug = 'golden-reference' ORDER BY pp.slug"
            )->fetchAll(\PDO::FETCH_COLUMN),
        );
        self::seedPendingProposal();

        foreach ([['aurora-demo', '9.9.9'], ['aurora-demo', '2.1.0'], [ProSupport::GOLDEN, '1.0.0'], ['inconnu', '1.0.0']] as [$id, $version]) {
            $response = $this->propose($id, $version);
            self::assertSame(404, $response->getStatusCode(), $id . '@' . $version);
            self::assertSame(['error' => 'Version publiée introuvable'], self::json($response));
        }
        $this->assertNothingChanged();
    }

    #[TestDox('UC-PRO-04-F08 — limite (comportement figé) : la proposition survit à la suppression du compte de son auteur, proposedBy désigne un compte purgé')]
    public function testF08ProposalOutlivesItsAuthorAccount(): void
    {
        self::assertSame(200, $this->propose('aurora-demo', '1.0.0')->getStatusCode());

        self::assertSame(204, $this->act($this->pom, 'DELETE', '/auth/account')->getStatusCode());

        self::assertSame(0, (int) self::$pdo->query('SELECT COUNT(*) FROM users WHERE id = ' . (int) $this->pom['id'])->fetchColumn(), 'compte purgé');
        $admin = $this->registerAdmin();
        $proposal = self::json($this->act($admin, 'GET', '/admin/settings'))['defaultPackage']['proposal'];
        self::assertSame(['aurora-demo', '1.0.0', $this->pom['id']], [$proposal['id'], $proposal['version'], $proposal['proposedBy']]);
    }
}
