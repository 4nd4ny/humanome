<?php

declare(strict_types=1);

namespace Humanome\Tests\UseCases\Unit;

use Humanome\Auth\Users;
use Humanome\Cartographies\CartographyRepository;
use Humanome\MigrationRunner;
use Humanome\Packages\PromptPackageRepository;
use Humanome\Share\ShareLinks;
use Humanome\Tests\TestDb;
use PDO;
use PHPUnit\Framework\Attributes\TestDox;
use PHPUnit\Framework\TestCase;

/**
 * UC-APP-03 — Consulter ses cartographies : tests UNITAIRES (API).
 *
 * Fiche : docs/cas-utilisation/apprenant/UC-APP-03-consulter-ses-cartographies.md
 *
 * Les copies serveur (opt-in, UC-APP-04) se consultent par
 * CartographyRepository, appelé ici directement : projection de liste SANS
 * document, compteur de liens de partage actifs, lecture complète réservée
 * au propriétaire, résolution des versions (prompt, référentiel) liées.
 */
final class UcApp03ConsulterSesCartographiesTest extends TestCase
{
    private static PDO $pdo;

    public static function setUpBeforeClass(): void
    {
        self::$pdo = TestDb::fresh();
        (new MigrationRunner(self::$pdo, MigrationRunner::defaultMigrationsDir()))->run();
    }

    protected function setUp(): void
    {
        self::$pdo->exec('DELETE FROM users');
        self::$pdo->exec('DELETE FROM prompt_packages');
    }

    private static function user(string $email): int
    {
        self::$pdo->prepare('INSERT INTO users (email, password_hash, display_name) VALUES (?, ?, ?)')
            ->execute([$email, Users::hashPassword('x-password'), 'Maya']);

        return (int) self::$pdo->lastInsertId();
    }

    /** @return array<string, mixed> */
    private static function fixture(string $name): array
    {
        return json_decode((string) file_get_contents(\dirname(__DIR__, 4) . '/schemas/fixtures/' . $name), true, 512, JSON_THROW_ON_ERROR);
    }

    #[TestDox('UC-APP-03-U08 — listForUser : métadonnées seules, plus récente d’abord, liens de partage ACTIFS comptés')]
    public function testU08ListProjectionNeverCarriesTheDocument(): void
    {
        $maya = self::user('maya@example.org');
        $autre = self::user('autre@example.org');
        $repo = new CartographyRepository(self::$pdo);
        $jour = $repo->create($maya, 'jour', 'Journée du 5', 'privee', self::fixture('cartographie-jour-2026-01-05.json'), null, null, null);
        $merge = $repo->create($maya, 'merge', 'Parcours', 'publique', self::fixture('cartographie-merge-3-jours.json'), null, null, ['jours' => 3]);
        $repo->create($autre, 'jour', 'Pas à moi', 'privee', ['kind' => 'cartographie-jour'], null, null, null);
        // Tri DISCRIMINANT : la plus récemment MODIFIÉE est la première CRÉÉE
        // (un tri par id ou par created_at donnerait l'ordre inverse).
        self::$pdo->exec("UPDATE cartographies SET updated_at = '2026-01-09 10:00:00' WHERE id = {$jour}");
        self::$pdo->exec("UPDATE cartographies SET updated_at = '2026-01-08 10:00:00' WHERE id = {$merge}");

        $links = new ShareLinks(self::$pdo);
        $links->create($merge, 'sesame-employeur', 30);
        ['shareId' => $revoked] = $links->create($merge, 'sesame-employeur', 30);
        $links->revokeForUser($revoked, $maya);
        ['shareId' => $expired] = $links->create($merge, 'sesame-employeur', 30);
        self::$pdo->exec('UPDATE share_links SET expires_at = NOW() - INTERVAL 1 MINUTE WHERE id = ' . $expired);

        $list = $repo->listForUser($maya);

        self::assertSame([$jour, $merge], array_column($list, 'id'));
        $byId = array_column($list, null, 'id');
        self::assertSame(['id', 'type', 'titre', 'visibility', 'createdAt', 'updatedAt', 'hasDocument', 'shares'], array_keys($byId[$merge]));
        self::assertSame(['merge', 'Parcours', 'publique', true, 1], [$byId[$merge]['type'], $byId[$merge]['titre'], $byId[$merge]['visibility'], $byId[$merge]['hasDocument'], $byId[$merge]['shares']]);
        self::assertSame('2026-01-09T10:00:00', $byId[$jour]['updatedAt']);
        self::assertSame(0, $byId[$jour]['shares']);
    }

    #[TestDox('UC-APP-03-U09 — findForUser : document complet pour le propriétaire seul ; versions liées résolues')]
    public function testU09FindForUserIsOwnerScopedAndResolvesVersions(): void
    {
        $maya = self::user('maya@example.org');
        $autre = self::user('autre@example.org');
        (new PromptPackageRepository(self::$pdo))->importPublishedDocument(self::fixture('prompt-package-exemple.json'));
        $repo = new CartographyRepository(self::$pdo);
        $promptVersionId = $repo->resolvePromptVersion('aurora-demo', '1.0.0');
        self::assertNotNull($promptVersionId);
        self::assertNull($repo->resolvePromptVersion('aurora-demo', '9.9.9'));

        $document = self::fixture('cartographie-jour-2026-01-05.json');
        $id = $repo->create($maya, 'jour', 'Journée du 5', 'cartographe', $document, $promptVersionId, null, ['mode' => 'humanome', 'jours' => 1]);

        $carto = $repo->findForUser($id, $maya);
        self::assertNotNull($carto);
        self::assertEquals($document, $carto['document']); // colonne JSON : ordre des clés non garanti
        self::assertSame(['id' => 'aurora-demo', 'version' => '1.0.0'], $carto['promptPackage']);
        self::assertNull($carto['referentiel']);
        self::assertEquals(['mode' => 'humanome', 'jours' => 1], $carto['runMeta']);
        self::assertMatchesRegularExpression('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/', (string) $carto['optInAt']);
        self::assertSame(0, $carto['shares']);

        // RG4 : seuls les liens ACTIFS comptent (un actif, un révoqué, un expiré).
        $links = new ShareLinks(self::$pdo);
        $links->create($id, 'sesame-employeur', 30);
        ['shareId' => $revoked] = $links->create($id, 'sesame-employeur', 30);
        $links->revokeForUser($revoked, $maya);
        ['shareId' => $expired] = $links->create($id, 'sesame-employeur', 30);
        self::$pdo->exec('UPDATE share_links SET expires_at = NOW() - INTERVAL 1 MINUTE WHERE id = ' . $expired);
        self::assertSame(1, $repo->findForUser($id, $maya)['shares']);

        self::assertNull($repo->findForUser($id, $autre), 'pas d’oracle : autrui = inexistant');
        self::assertNull($repo->findForUser($id + 999, $maya));
        self::assertTrue($repo->ownedBy($id, $maya));
        self::assertFalse($repo->ownedBy($id, $autre));
    }
}
