<?php

declare(strict_types=1);

namespace Humanome\Tests\UseCases\Unit;

use Humanome\Packages\PromptPackageRepository;
use Humanome\Packages\SettingsRepository;
use Humanome\Tests\UseCases\Support\ProSupport;
use PDO;
use PHPUnit\Framework\Attributes\TestDox;
use PHPUnit\Framework\TestCase;

/**
 * UC-PRO-04 — Proposer une version par défaut : tests UNITAIRES.
 *
 * Fiche : docs/cas-utilisation/promptologue/UC-PRO-04-proposer-version-defaut.md
 *
 * La route POST /api/prompt-packages/{id}/{version}/propose-default n'a que
 * deux éléments de logique, appelés ici directement : la porte
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
        $repo->createDraft(ProSupport::PKG, '1.0.0', '1.1.0', ProSupport::user(self::$pdo));
        ProSupport::importGolden(self::$pdo, ProSupport::user(self::$pdo, 'Root', ['admin']));

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

    #[TestDox('UC-PRO-04-U03 — proposition et défaut validé sont deux réglages distincts : proposer ne touche pas au défaut')]
    public function testU03ProposalAndValidatedDefaultAreDistinctSettings(): void
    {
        self::assertNotSame(SettingsRepository::DEFAULT_PACKAGE, SettingsRepository::DEFAULT_PACKAGE_PROPOSAL);
        self::settings()->set(SettingsRepository::DEFAULT_PACKAGE, ['id' => 'aurora-demo', 'version' => '1.0.0', 'validatedAt' => '2026-07-01T10:00:00+00:00']);

        self::settings()->set(SettingsRepository::DEFAULT_PACKAGE_PROPOSAL, ['id' => 'aurora-demo', 'version' => '2.0.0', 'proposedBy' => 1, 'proposedAt' => '2026-07-02T10:00:00+00:00']);

        self::assertSame('1.0.0', self::settings()->get(SettingsRepository::DEFAULT_PACKAGE)['version']);
    }
}
