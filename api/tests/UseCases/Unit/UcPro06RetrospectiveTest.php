<?php

declare(strict_types=1);

namespace Humanome\Tests\UseCases\Unit;

use Humanome\Auth\Users;
use Humanome\Cartographies\CartographyRepository;
use Humanome\MigrationRunner;
use Humanome\Referentiel\ReferentielRepository;
use Humanome\Tests\TestDb;
use Humanome\Tests\UseCases\Support\BancSupport;
use PDO;
use PHPUnit\Framework\Attributes\TestDox;
use PHPUnit\Framework\TestCase;

/**
 * UC-PRO-06 — Régénérer rétrospectivement des cartographies : tests
 * UNITAIRES (API).
 *
 * Fiche : docs/cas-utilisation/promptologue/UC-PRO-06-retrospective.md
 *
 * La régénération tourne dans le navigateur ; le serveur fournit la
 * cartographie d'origine (métadonnées puis document, avec la version du
 * référentiel qui l'a produite) et la version plus récente du référentiel.
 * CartographyRepository et ReferentielRepository sont appelés directement.
 */
final class UcPro06RetrospectiveTest extends TestCase
{
    use BancSupport;

    private static PDO $pdo;

    public static function setUpBeforeClass(): void
    {
        self::$pdo = TestDb::fresh();
        (new MigrationRunner(self::$pdo, MigrationRunner::defaultMigrationsDir()))->run();
    }

    protected function setUp(): void
    {
        self::$pdo->exec('DELETE FROM users');
        self::wipeReferentiel(self::$pdo);
        self::publishReferentiel(self::$pdo, '7.0.0');
    }

    private static function user(string $name): int
    {
        self::$pdo->prepare('INSERT INTO users (email, password_hash, display_name) VALUES (?, ?, ?)')
            ->execute([uniqid($name, true) . '@example.org', Users::hashPassword('x-password'), $name]);

        return (int) self::$pdo->lastInsertId();
    }

    private static function repo(): CartographyRepository
    {
        return new CartographyRepository(self::$pdo);
    }

    /** Cartographie jour stockée (opt-in) produite avec le référentiel 7.0.0. */
    private static function storeJour(int $userId, string $titre = 'Journée du 5 janvier'): int
    {
        $refVersionId = self::repo()->resolveReferentielVersion('respire', '7.0.0');

        return self::repo()->create(
            $userId,
            'jour',
            $titre,
            'privee',
            self::fixture('cartographie-jour-2026-01-05.json'),
            null,
            $refVersionId,
            null,
        );
    }

    #[TestDox('UC-PRO-06-U01 — listForUser : mes cartographies en métadonnées (type, titre), jamais le document')]
    public function testU01ListForUserIsOwnerScopedMetadata(): void
    {
        $pom = self::user('Pom');
        $id = self::storeJour($pom);
        self::storeJour(self::user('Autre'), 'Journée d’un autre');

        $list = self::repo()->listForUser($pom);

        self::assertSame([$id], array_column($list, 'id'));
        self::assertSame('jour', $list[0]['type']);
        self::assertSame('Journée du 5 janvier', $list[0]['titre']);
        self::assertArrayNotHasKey('document', $list[0]);
        self::assertArrayNotHasKey('kind', $list[0], 'le type est porté par « type » (voir Limites de la fiche)');
    }

    #[TestDox('UC-PRO-06-U02 — findForUser : document jour d’origine ET version du référentiel qui l’a produit ; null pour autrui')]
    public function testU02FindForUserReturnsTheOriginalWithItsReferentielVersion(): void
    {
        $pom = self::user('Pom');
        $id = self::storeJour($pom);

        $carto = self::repo()->findForUser($id, $pom);
        self::assertNotNull($carto);
        self::assertSame('cartographie-jour', $carto['document']['kind']);
        self::assertSame('2026-01-05', $carto['document']['date']);
        // La base de comparaison « plus récent » est connue du serveur (AN-2).
        self::assertSame(['id' => 'respire', 'version' => '7.0.0'], $carto['referentiel']);

        self::assertNull(self::repo()->findForUser($id, self::user('Autre')));
    }

    #[TestDox('UC-PRO-06-U03 — resolveReferentielVersion : seule une version PUBLIÉE peut être la base d’une cartographie')]
    public function testU03OnlyPublishedReferentielVersionsResolve(): void
    {
        self::assertNotNull(self::repo()->resolveReferentielVersion('respire', '7.0.0'));
        self::assertNull(self::repo()->resolveReferentielVersion('respire', '9.9.9'));
        self::assertNull(self::repo()->resolveReferentielVersion('autre', '7.0.0'));
    }

    #[TestDox('UC-PRO-06-U04 — référentiel plus récent : 61 compétences, définition révisée servie telle quelle')]
    public function testU04NewerReferentielVersionCarriesTheRevisedCompetence(): void
    {
        self::publishReferentiel(self::$pdo, '7.1.0', ['1.03' => 'Synthèse intégrative (définition élargie)']);
        $repo = new ReferentielRepository(self::$pdo);

        self::assertSame(['7.1.0', '7.0.0'], array_column($repo->publishedVersions('respire'), 'semver'));
        $content = $repo->findPublished('respire', '7.1.0')['content'];
        self::assertCount(61, $content['competences'], 'le schéma fixe 61 compétences : « nouvelle » = redéfinie');
        $noms = array_column($content['competences'], 'nom', 'code');
        self::assertSame('Synthèse intégrative (définition élargie)', $noms['1.03']);
        self::assertNotSame(
            $content['contentHash'],
            $repo->findPublished('respire', '7.0.0')['content']['contentHash'],
        );
    }
}
