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
 * référentiel qui l'a produite — jointure de findForUser) et la version plus
 * récente du référentiel. CartographyRepository et ReferentielRepository sont
 * appelés directement. resolveReferentielVersion n'est pas appelé par la
 * rétrospective : il épingle la base au stockage (précondition, UC-APP-04).
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

    #[TestDox('UC-PRO-06-U03 — précondition (UC-APP-04) : resolveReferentielVersion n’épingle comme base qu’une version PUBLIÉE (ni brouillon, ni inconnue)')]
    public function testU03OnlyPublishedReferentielVersionsResolve(): void
    {
        self::assertNotNull(self::repo()->resolveReferentielVersion('respire', '7.0.0'));
        // Une version en BROUILLON (édition épistémiarque) n'est jamais une base.
        self::assertNotNull((new ReferentielRepository(self::$pdo))->createDraft('respire', '7.0.0', '7.2.0'));
        self::assertNull(self::repo()->resolveReferentielVersion('respire', '7.2.0'), 'un brouillon ne résout pas');
        self::assertNull(self::repo()->resolveReferentielVersion('respire', '9.9.9'));
        self::assertNull(self::repo()->resolveReferentielVersion('autre', '7.0.0'));
    }

    #[TestDox('UC-PRO-06-U04 — référentiel plus récent : 61 compétences ; une redéfinition (description) garde le contentHash, un nom révisé (cas fictif) le change')]
    public function testU04NewerReferentielVersionCarriesTheRevisedCompetence(): void
    {
        // Forme RÉELLE d'une version plus récente (7.1.0 en production) : mêmes
        // noms, définitions ajoutées dans `description`, même contentHash.
        self::publishReferentiel(self::$pdo, '7.1.0', [], ['1.03' => 'Capacité à relier des savoirs épars en une vue d’ensemble argumentée.']);
        // Cas FICTIF (tests IHM, U10, U11) : le NOM de 1.03 est révisé.
        self::publishReferentiel(self::$pdo, '7.2.0', ['1.03' => 'Synthèse intégrative (nom révisé)']);
        $repo = new ReferentielRepository(self::$pdo);

        self::assertSame(['7.2.0', '7.1.0', '7.0.0'], array_column($repo->publishedVersions('respire'), 'semver'));
        $base = $repo->findPublished('respire', '7.0.0')['content'];
        $redefinie = $repo->findPublished('respire', '7.1.0')['content'];
        $renommee = $repo->findPublished('respire', '7.2.0')['content'];
        self::assertCount(61, $redefinie['competences'], 'le schéma fixe 61 compétences : « nouvelle » = redéfinie');

        $avant = array_column($base['competences'], null, 'code');
        $apres = array_column($redefinie['competences'], null, 'code');
        self::assertSame($avant['1.03']['nom'], $apres['1.03']['nom'], 'une redéfinition ne touche pas le nom');
        self::assertSame('Capacité à relier des savoirs épars en une vue d’ensemble argumentée.', $apres['1.03']['description']);
        // Invariant : la définition n'entre pas dans le contentHash (identité structurelle).
        self::assertSame($base['contentHash'], $redefinie['contentHash']);

        self::assertSame('Synthèse intégrative (nom révisé)', array_column($renommee['competences'], 'nom', 'code')['1.03']);
        self::assertNotSame($base['contentHash'], $renommee['contentHash'], 'le nom est structurel');
    }
}
