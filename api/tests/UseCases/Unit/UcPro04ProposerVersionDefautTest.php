<?php

declare(strict_types=1);

namespace Humanome\Tests\UseCases\Unit;

use Humanome\Packages\PromptPackageRepository;
use Humanome\Packages\SettingsRepository;
use Humanome\Referentiel\RoleGuard;
use Humanome\Tests\TestDb;
use Humanome\Tests\UseCases\Support\ProSupport;
use PDO;
use PHPUnit\Framework\Attributes\TestDox;
use PHPUnit\Framework\TestCase;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\RequestHandlerInterface;
use Slim\Psr7\Factory\ResponseFactory;
use Slim\Psr7\Factory\ServerRequestFactory;

/**
 * UC-PRO-04 — Proposer une version par défaut : tests UNITAIRES.
 *
 * Fiche : docs/cas-utilisation/promptologue/UC-PRO-04-proposer-version-defaut.md
 *
 * La route POST /api/prompt-packages/{id}/{version}/propose-default repose
 * sur trois éléments de logique, appelés ici directement : la garde
 * RoleGuard::any('promptologue') (admin exclu, pas de super-rôle), la porte
 * PromptPackageRepository::isPublished (seule une version publiée non privée
 * est proposable) et l'emplacement unique SettingsRepository
 * « default_prompt_package_proposal », distinct du défaut validé.
 */
final class UcPro04ProposerVersionDefautTest extends TestCase
{
    private static PDO $pdo;

    public static function setUpBeforeClass(): void
    {
        self::$pdo = ProSupport::freshPdo();
    }

    protected function setUp(): void
    {
        ProSupport::reset(self::$pdo);
    }

    protected function tearDown(): void
    {
        $_SESSION = [];
        TestDb::restoreEnv();
    }

    private static function settings(): SettingsRepository
    {
        return new SettingsRepository(self::$pdo);
    }

    #[TestDox('UC-PRO-04-U01 — porte isPublished : publiée (même réservée) oui ; brouillon, inconnue, Golden privé non')]
    public function testU01OnlyPublishedPublicVersionsAreProposable(): void
    {
        $repo = new PromptPackageRepository(self::$pdo);
        ProSupport::publish(self::$pdo);
        ProSupport::publish(self::$pdo, ProSupport::reservedDoc());
        self::assertNotNull($repo->createDraft(ProSupport::PKG, '1.0.0', '1.1.0', ProSupport::user(self::$pdo)), 'précondition : le brouillon existe');
        ProSupport::importGolden(self::$pdo, ProSupport::user(self::$pdo, 'Root', ['admin']));
        // Préconditions ancrées : le brouillon est bien « draft » et le Golden bien
        // « published » mais privé — seuls les filtres status et is_private les écartent.
        self::assertSame(
            [['aurora-demo', '1.1.0', 'draft', 0], ['golden-reference', '1.0.0', 'published', 1]],
            array_map(
                static fn (array $r): array => [$r['slug'], $r['semver'], $r['status'], (int) $r['is_private']],
                self::$pdo->query(
                    "SELECT pp.slug, pv.semver, pv.status, pp.is_private FROM prompt_versions pv JOIN prompt_packages pp ON pp.id = pv.package_id
                      WHERE (pp.slug = 'aurora-demo' AND pv.semver = '1.1.0') OR pp.slug = 'golden-reference' ORDER BY pp.slug"
                )->fetchAll(),
            ),
        );

        self::assertTrue($repo->isPublished(ProSupport::PKG, '1.0.0'));
        self::assertTrue($repo->isPublished(ProSupport::RESERVED, '1.0.0'), 'un paquet réservé reste proposable (RG4)');
        self::assertFalse($repo->isPublished(ProSupport::PKG, '1.1.0'), 'brouillon');
        self::assertFalse($repo->isPublished(ProSupport::PKG, '9.9.9'));
        self::assertFalse($repo->isPublished(ProSupport::GOLDEN, '1.0.0'), 'Golden privé');
    }

    #[TestDox('UC-PRO-04-U02 — la proposition occupe un emplacement UNIQUE : une nouvelle proposition remplace la précédente')]
    public function testU02ASingleProposalSlotLastOneWins(): void
    {
        self::settings()->set(SettingsRepository::DEFAULT_PACKAGE_PROPOSAL, ['id' => 'aurora-demo', 'version' => '1.0.0', 'proposedBy' => 1, 'proposedAt' => '2026-07-01T10:00:00+00:00']);
        self::settings()->set(SettingsRepository::DEFAULT_PACKAGE_PROPOSAL, ['id' => 'aurora-demo', 'version' => '2.0.0', 'proposedBy' => 2, 'proposedAt' => '2026-07-02T10:00:00+00:00']);

        self::assertEquals(
            ['id' => 'aurora-demo', 'version' => '2.0.0', 'proposedBy' => 2, 'proposedAt' => '2026-07-02T10:00:00+00:00'],
            self::settings()->get(SettingsRepository::DEFAULT_PACKAGE_PROPOSAL),
        );
        self::assertSame(1, (int) self::$pdo->query("SELECT COUNT(*) FROM settings WHERE name = 'default_prompt_package_proposal'")->fetchColumn());
    }

    #[TestDox('UC-PRO-04-U03 — proposition et défaut validé sont deux clés de réglage distinctes et indépendantes')]
    public function testU03ProposalAndValidatedDefaultAreDistinctSettings(): void
    {
        self::assertNotSame(SettingsRepository::DEFAULT_PACKAGE, SettingsRepository::DEFAULT_PACKAGE_PROPOSAL);
        self::settings()->set(SettingsRepository::DEFAULT_PACKAGE, ['id' => 'aurora-demo', 'version' => '1.0.0', 'validatedAt' => '2026-07-01T10:00:00+00:00']);

        self::settings()->set(SettingsRepository::DEFAULT_PACKAGE_PROPOSAL, ['id' => 'aurora-demo', 'version' => '2.0.0', 'proposedBy' => 1, 'proposedAt' => '2026-07-02T10:00:00+00:00']);

        self::assertSame('1.0.0', self::settings()->get(SettingsRepository::DEFAULT_PACKAGE)['version']);
    }

    #[TestDox('UC-PRO-04-U06 — garde RoleGuard::any(promptologue) : 401 sans session, 403 pour un apprenant ou un administrateur (pas de super-rôle), passage pour un promptologue')]
    public function testU06OnlyThePromptologueRolePasses(): void
    {
        TestDb::overrideEnv(); // RoleGuard relit les rôles par Db::get()
        $guard = RoleGuard::any('promptologue');
        $handler = new class implements RequestHandlerInterface {
            public function handle(ServerRequestInterface $request): ResponseInterface
            {
                return (new ResponseFactory())->createResponse(204);
            }
        };
        $request = (new ServerRequestFactory())->createServerRequest('POST', '/api/prompt-packages/aurora-demo/1.0.0/propose-default');
        $answer = static fn (): ResponseInterface => $guard->process($request, $handler);

        $_SESSION = [];
        self::assertSame([401, '{"error":"Authentication required"}'], [$answer()->getStatusCode(), (string) $answer()->getBody()]);

        foreach (['apprenant', 'admin'] as $role) {
            $_SESSION['user_id'] = ProSupport::user(self::$pdo, ucfirst($role), [$role]);
            self::assertSame([403, '{"error":"Forbidden"}'], [$answer()->getStatusCode(), (string) $answer()->getBody()], $role);
        }

        $_SESSION['user_id'] = ProSupport::user(self::$pdo, 'Pom', ['promptologue']);
        self::assertSame(204, $answer()->getStatusCode());
    }
}
