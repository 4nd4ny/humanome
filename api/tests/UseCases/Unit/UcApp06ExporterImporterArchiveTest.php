<?php

declare(strict_types=1);

namespace Humanome\Tests\UseCases\Unit;

use Humanome\MigrationRunner;
use Humanome\Packages\PromptPackageRepository;
use Humanome\Tests\TestDb;
use PDO;
use PHPUnit\Framework\Attributes\TestDox;
use PHPUnit\Framework\TestCase;

/**
 * UC-APP-06 — Exporter et importer son archive complète : tests UNITAIRES (API).
 *
 * Fiche : docs/cas-utilisation/apprenant/UC-APP-06-exporter-importer-archive.md
 *
 * L'archive est assemblée dans le navigateur ; côté serveur, seul
 * PromptPackageRepository décide du paquet de prompts qu'elle embarque :
 * le PREMIER élément de listPublished() (ordre slug puis date de
 * publication), puis findPublished() pour le document complet. Les paquets
 * privés (Golden Prompt) n'y figurent jamais.
 */
final class UcApp06ExporterImporterArchiveTest extends TestCase
{
    private static PDO $pdo;

    public static function setUpBeforeClass(): void
    {
        self::$pdo = TestDb::fresh();
        (new MigrationRunner(self::$pdo, MigrationRunner::defaultMigrationsDir()))->run();
    }

    protected function setUp(): void
    {
        self::$pdo->exec('DELETE FROM prompt_packages');
    }

    private static function publish(string $id, string $version, string $publishedAt): void
    {
        $path = \dirname(__DIR__, 4) . '/schemas/fixtures/prompt-package-exemple.json';
        $doc = json_decode((string) file_get_contents($path), true, 512, JSON_THROW_ON_ERROR);
        (new PromptPackageRepository(self::$pdo))->importPublishedDocument(array_merge($doc, ['id' => $id, 'version' => $version]));
        self::$pdo->prepare(
            'UPDATE prompt_versions pv JOIN prompt_packages pp ON pp.id = pv.package_id
                SET pv.published_at = ? WHERE pp.slug = ? AND pv.semver = ?'
        )->execute([$publishedAt, $id, $version]);
    }

    #[TestDox('UC-APP-06-U14 — paquet embarqué = 1er de listPublished : ordre alphabétique du paquet, puis plus ANCIENNE version')]
    public function testU14FirstPublishedPackageIsAlphabeticalThenOldest(): void
    {
        self::publish('aurora-v3-reconstruit', '1.0.0', '2026-07-01 10:00:00');
        self::publish('aurora-lab', '2.0.0', '2026-07-10 10:00:00');
        self::publish('aurora-lab', '1.0.0', '2026-07-05 10:00:00');
        self::publish('zz-golden', '1.0.0', '2026-06-01 10:00:00');
        self::$pdo->exec("UPDATE prompt_packages SET is_private = 1 WHERE slug = 'zz-golden'");

        $repo = new PromptPackageRepository(self::$pdo);
        $list = $repo->listPublished();

        self::assertSame(
            ['aurora-lab@1.0.0', 'aurora-lab@2.0.0', 'aurora-v3-reconstruit@1.0.0'],
            array_map(static fn (array $p): string => $p['id'] . '@' . $p['version'], $list),
        );
        // Ce que l'archive embarquerait : ni le paquet le plus récent, ni celui des runs.
        $embedded = $repo->findPublished($list[0]['id'], $list[0]['version']);
        self::assertSame(['aurora-lab', '1.0.0'], [$embedded['id'], $embedded['version']]);
        self::assertNull($repo->findPublished('zz-golden', '1.0.0'), 'paquet privé jamais exportable');
    }
}
