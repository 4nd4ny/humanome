<?php

declare(strict_types=1);

namespace Humanome\Tests\UseCases\Unit;

use Humanome\Auth\Users;
use Humanome\Cartographe\Links;
use Humanome\Cartographies\CartographyRepository;
use Humanome\MigrationRunner;
use Humanome\Share\ShareLinks;
use Humanome\Tests\TestDb;
use Humanome\Validation;
use PDO;
use PHPUnit\Framework\Attributes\TestDox;
use PHPUnit\Framework\TestCase;

/**
 * UC-APP-04 — Stocker une cartographie sur le serveur et régler sa
 * confidentialité : tests UNITAIRES.
 *
 * Fiche : docs/cas-utilisation/apprenant/UC-APP-04-stocker-regler-confidentialite.md
 *
 * Les classes sollicitées par les routes /api/cartographies sont appelées
 * directement (sans couche HTTP) : CartographyRepository (opt-in daté,
 * projection de liste sans document, propriété, PATCH, purge réelle,
 * résolution des versions publiées) et Links (effet de la visibilité côté
 * cartographe lié). Le dernier test documente l'écart constaté : le document
 * stocké n'est pas validé au schéma (voir « Anomalies constatées »).
 */
final class UcApp04StockerConfidentialiteTest extends TestCase
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
        self::$pdo->exec('DELETE FROM referentiel_versions');
    }

    private static function repo(): CartographyRepository
    {
        return new CartographyRepository(self::$pdo);
    }

    private static function user(string $name = 'Maya'): int
    {
        self::$pdo->prepare('INSERT INTO users (email, password_hash, display_name) VALUES (?, ?, ?)')
            ->execute([uniqid('u', true) . '@example.org', Users::hashPassword('x-password'), $name]);

        return (int) self::$pdo->lastInsertId();
    }

    /** @return array<string, mixed> document de cartographie jour minimal */
    private static function doc(string $date = '2026-01-05'): array
    {
        return ['kind' => 'cartographie-jour', 'date' => $date, 'poles' => []];
    }

    private static function create(int $userId, string $titre = 'Feuille', string $visibility = 'privee'): int
    {
        return self::repo()->create($userId, 'jour', $titre, $visibility, self::doc(), null, null, null);
    }

    /** Paquet + référentiel : une version publiée et une version brouillon de chaque. */
    private static function seedVersions(): void
    {
        self::$pdo->exec("INSERT INTO prompt_packages (slug, description) VALUES ('paquet-test', 'Paquet de test')");
        $packageId = (int) self::$pdo->lastInsertId();
        $version = self::$pdo->prepare(
            "INSERT INTO prompt_versions (package_id, semver, status, content, published_at)
             VALUES (?, ?, ?, '{\"id\": \"paquet-test\"}', ?)"
        );
        $version->execute([$packageId, '1.0.0', 'published', date('Y-m-d H:i:s')]);
        $version->execute([$packageId, '1.1.0-draft', 'draft', null]);

        $referentiel = self::$pdo->prepare(
            "INSERT INTO referentiel_versions (referentiel_id, semver, label, status, content, content_hash, published_at)
             VALUES ('respire', ?, ?, ?, '{}', REPEAT('0', 64), ?)"
        );
        $referentiel->execute(['7.0.0', 'RESPIRE v7', 'published', date('Y-m-d H:i:s')]);
        $referentiel->execute(['8.0.0', 'RESPIRE v8 (brouillon)', 'draft', null]);
    }

    #[TestDox('UC-APP-04-U01 — create : l’INSERT lui-même horodate l’opt-in (opt_in_at) et stocke le document')]
    public function testU01CreateStampsOptInAndStoresDocument(): void
    {
        $userId = self::user();
        self::seedVersions();
        $promptVersionId = self::repo()->resolvePromptVersion('paquet-test', '1.0.0');
        $refVersionId = self::repo()->resolveReferentielVersion('respire', '7.0.0');

        $id = self::repo()->create(
            $userId,
            'merge',
            'Mon parcours',
            'cartographe',
            ['kind' => 'cartographie-merge', 'jours' => ['2026-01-05']],
            $promptVersionId,
            $refVersionId,
            ['modele' => 'mock', 'coutEstime' => 0],
        );

        self::assertGreaterThan(0, $id);
        $row = self::$pdo->query('SELECT * FROM cartographies WHERE id = ' . $id)->fetch();
        self::assertSame($userId, (int) $row['user_id']);
        self::assertSame('merge', $row['type']);
        self::assertSame('Mon parcours', $row['titre']);
        self::assertSame('cartographe', $row['visibility']);
        self::assertNotNull($row['opt_in_at'], 'le stockage serveur EST l’opt-in daté (§6.2)');
        self::assertLessThanOrEqual(
            5,
            (int) self::$pdo->query('SELECT ABS(TIMESTAMPDIFF(SECOND, opt_in_at, NOW())) FROM cartographies WHERE id = ' . $id)->fetchColumn(),
            'horodaté à l’instant de l’INSERT',
        );
        // Colonnes JSON MySQL : l'ordre des clés n'est pas conservé.
        self::assertEquals(['kind' => 'cartographie-merge', 'jours' => ['2026-01-05']], json_decode((string) $row['document'], true));
        self::assertEquals(['modele' => 'mock', 'coutEstime' => 0], json_decode((string) $row['run_meta'], true));
        self::assertSame($promptVersionId, (int) $row['prompt_version_id']);
        self::assertSame($refVersionId, (int) $row['referentiel_version_id']);
    }

    #[TestDox('UC-APP-04-U02 — listForUser : métadonnées seulement, jamais le document ; « shares » ne compte que les liens actifs')]
    public function testU02ListForUserIsMetadataOnlyWithActiveShareCount(): void
    {
        $maya = self::user();
        $autre = self::user('Autre');
        $first = self::create($maya, 'Première');
        $second = self::create($maya, 'Seconde', 'publique');
        self::create($autre, 'Pas à moi');

        $links = new ShareLinks(self::$pdo);
        $links->create($second, 'sesame-employeur', 30); // actif
        ['shareId' => $revoked] = $links->create($second, 'sesame-employeur', 30);
        $links->revokeForUser($revoked, $maya);
        ['shareId' => $expired] = $links->create($second, 'sesame-employeur', 30);
        self::$pdo->exec('UPDATE share_links SET expires_at = NOW() - INTERVAL 1 MINUTE WHERE id = ' . $expired);
        // Ordre déterministe : la seconde est la plus récemment modifiée.
        self::$pdo->exec('UPDATE cartographies SET updated_at = NOW() - INTERVAL 1 DAY WHERE id = ' . $first);

        $list = self::repo()->listForUser($maya);

        self::assertCount(2, $list, 'la cartographie d’un autre compte n’apparaît pas');
        self::assertSame([$second, $first], array_column($list, 'id'), 'plus récente en premier');
        foreach ($list as $item) {
            self::assertSame(
                ['id', 'type', 'titre', 'visibility', 'createdAt', 'updatedAt', 'hasDocument', 'shares'],
                array_keys($item),
            );
            self::assertTrue($item['hasDocument']);
            self::assertMatchesRegularExpression('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/', $item['updatedAt']);
        }
        self::assertSame(1, $list[0]['shares'], 'révoqué et expiré ne comptent pas');
        self::assertSame(0, $list[1]['shares']);
        self::assertSame('publique', $list[0]['visibility']);
    }

    #[TestDox('UC-APP-04-U03 — findForUser : le propriétaire reçoit tout (document, opt-in, versions, runMeta) ; un autre compte, rien')]
    public function testU03FindForUserIsOwnerScoped(): void
    {
        $maya = self::user();
        $intrus = self::user('Intrus');
        self::seedVersions();
        $id = self::repo()->create(
            $maya,
            'jour',
            'Feuille',
            'privee',
            self::doc(),
            self::repo()->resolvePromptVersion('paquet-test', '1.0.0'),
            self::repo()->resolveReferentielVersion('respire', '7.0.0'),
            ['modele' => 'mock'],
        );

        $carto = self::repo()->findForUser($id, $maya);
        self::assertNotNull($carto);
        self::assertEquals(self::doc(), $carto['document']);
        self::assertSame(['id' => 'paquet-test', 'version' => '1.0.0'], $carto['promptPackage']);
        self::assertSame(['id' => 'respire', 'version' => '7.0.0'], $carto['referentiel']);
        self::assertSame(['modele' => 'mock'], $carto['runMeta']);
        self::assertNotNull($carto['optInAt']);
        self::assertSame(0, $carto['shares']);

        self::assertNull(self::repo()->findForUser($id, $intrus), 'id étranger = comme inexistant');
        self::assertNull(self::repo()->findForUser($id + 1000, $maya));
    }

    #[TestDox('UC-APP-04-U04 — updateForUser : titre et/ou visibilité ; sans changement = état de propriété ; id étranger = false')]
    public function testU04UpdateForUserPatchesOnlyOwnedRows(): void
    {
        $maya = self::user();
        $intrus = self::user('Intrus');
        $id = self::create($maya, 'Avant');

        self::assertTrue(self::repo()->updateForUser($id, $maya, 'Après', null));
        self::assertTrue(self::repo()->updateForUser($id, $maya, null, 'cartographe'));
        $row = self::$pdo->query('SELECT titre, visibility FROM cartographies WHERE id = ' . $id)->fetch();
        self::assertSame(['titre' => 'Après', 'visibility' => 'cartographe'], $row);

        // Mêmes valeurs (0 ligne modifiée) ou rien à changer : succès si propriétaire.
        self::assertTrue(self::repo()->updateForUser($id, $maya, 'Après', 'cartographe'));
        self::assertTrue(self::repo()->updateForUser($id, $maya, null, null));

        self::assertFalse(self::repo()->updateForUser($id, $intrus, 'Volée', 'publique'));
        self::assertFalse(self::repo()->updateForUser($id, $intrus, null, null));
        self::assertFalse(self::repo()->updateForUser($id + 1000, $maya, 'X', null));
        $row = self::$pdo->query('SELECT titre, visibility FROM cartographies WHERE id = ' . $id)->fetch();
        self::assertSame(['titre' => 'Après', 'visibility' => 'cartographe'], $row, 'rien n’a bougé');
    }

    #[TestDox('UC-APP-04-U05 — deleteForUser : purge réelle de la ligne et de ses liens de partage ; id étranger = false')]
    public function testU05DeleteForUserPurgesRowAndShareLinks(): void
    {
        $maya = self::user();
        $intrus = self::user('Intrus');
        $id = self::create($maya);
        (new ShareLinks(self::$pdo))->create($id, 'sesame-employeur', 30);

        self::assertFalse(self::repo()->deleteForUser($id, $intrus));
        self::assertSame(1, (int) self::$pdo->query('SELECT COUNT(*) FROM cartographies')->fetchColumn());

        self::assertTrue(self::repo()->deleteForUser($id, $maya));
        self::assertSame(0, (int) self::$pdo->query('SELECT COUNT(*) FROM cartographies')->fetchColumn());
        self::assertSame(0, (int) self::$pdo->query('SELECT COUNT(*) FROM share_links')->fetchColumn(), 'FK ON DELETE CASCADE');
        self::assertFalse(self::repo()->deleteForUser($id, $maya), 'déjà purgée');
    }

    #[TestDox('UC-APP-04-U06 — ownedBy : vrai pour le propriétaire seulement')]
    public function testU06OwnedBy(): void
    {
        $maya = self::user();
        $intrus = self::user('Intrus');
        $id = self::create($maya);

        self::assertTrue(self::repo()->ownedBy($id, $maya));
        self::assertFalse(self::repo()->ownedBy($id, $intrus));
        self::assertFalse(self::repo()->ownedBy($id + 1000, $maya));
    }

    #[TestDox('UC-APP-04-U07 — resolvePromptVersion : seule une version PUBLIÉE se résout')]
    public function testU07ResolvePromptVersionOnlyPublished(): void
    {
        self::seedVersions();

        self::assertIsInt(self::repo()->resolvePromptVersion('paquet-test', '1.0.0'));
        self::assertNull(self::repo()->resolvePromptVersion('paquet-test', '1.1.0-draft'), 'brouillon : non rejouable');
        self::assertNull(self::repo()->resolvePromptVersion('fantome', '1.0.0'));
    }

    #[TestDox('UC-APP-04-U08 — resolveReferentielVersion : seule une version PUBLIÉE se résout')]
    public function testU08ResolveReferentielVersionOnlyPublished(): void
    {
        self::seedVersions();

        self::assertIsInt(self::repo()->resolveReferentielVersion('respire', '7.0.0'));
        self::assertNull(self::repo()->resolveReferentielVersion('respire', '8.0.0'));
        self::assertNull(self::repo()->resolveReferentielVersion('respire', '9.9.9'));
    }

    #[TestDox('UC-APP-04-U09 — Links : le cartographe lié ne voit que les visibilités « cartographe » et « publique »')]
    public function testU09VisibilityGovernsTheLinkedCartographeAccess(): void
    {
        $maya = self::user();
        $camille = self::user('Camille');
        self::$pdo->prepare('INSERT INTO cartographe_links (apprenant_id, cartographe_id) VALUES (?, ?)')
            ->execute([$maya, $camille]);
        $privee = self::create($maya, 'Privée', 'privee');
        $partagee = self::create($maya, 'Partagée', 'cartographe');
        $publique = self::create($maya, 'Publique', 'publique');
        $links = new Links(self::$pdo);

        $queue = array_column($links->queueFor($camille), 'id');
        sort($queue);
        self::assertSame([$partagee, $publique], $queue);
        self::assertNull($links->findForCartographe($privee, $camille));
        self::assertNotNull($links->findForCartographe($partagee, $camille));

        // Retour à « privée » : l'accès est coupé immédiatement.
        self::repo()->updateForUser($partagee, $maya, null, 'privee');
        self::assertNull($links->findForCartographe($partagee, $camille));
    }

    #[TestDox('UC-APP-04-U10 — écart documenté : le document minimal accepté au stockage n’est pas conforme au schéma')]
    public function testU10StoredDocumentIsNotSchemaValidated(): void
    {
        // Validation.php sert aux révisions (UC-CAR-04) et au worker, pas au
        // POST /api/cartographies : le document minimal ci-dessous est stocké
        // tel quel par create() (cf. fiche, « Anomalies constatées »).
        $fixture = json_decode(
            (string) file_get_contents(dirname(__DIR__, 4) . '/schemas/fixtures/cartographie-jour-2026-01-05.json'),
            true,
        );
        self::assertTrue(Validation::validate('cartographie-jour', $fixture)['valid'], 'la fixture réelle est conforme');
        self::assertFalse(Validation::validate('cartographie-jour', self::doc())['valid'], 'le document minimal ne l’est pas');

        $userId = self::user();
        $id = self::create($userId);
        self::assertEquals(self::doc(), self::repo()->findForUser($id, $userId)['document']);
    }
}
