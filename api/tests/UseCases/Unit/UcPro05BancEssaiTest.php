<?php

declare(strict_types=1);

namespace Humanome\Tests\UseCases\Unit;

use Humanome\Admin\GoldenRepository;
use Humanome\Auth\Users;
use Humanome\MigrationRunner;
use Humanome\Packages\PromptPackageRepository;
use Humanome\Referentiel\ReferentielRepository;
use Humanome\Tests\TestDb;
use Humanome\Tests\UseCases\Support\BancSupport;
use PDO;
use PHPUnit\Framework\Attributes\TestDox;
use PHPUnit\Framework\TestCase;

/**
 * UC-PRO-05 — Évaluer un paquet au banc d'essai : tests UNITAIRES (API).
 *
 * Fiche : docs/cas-utilisation/promptologue/UC-PRO-05-banc-essai.md
 *
 * Le banc s'exécute dans le navigateur ; côté serveur, il ne fait que LIRE ses
 * sources. Les classes qui les servent sont appelées directement (sans HTTP) :
 * PromptPackageRepository (versions publiées, MES brouillons, document d'une
 * version) et ReferentielRepository (versions publiées du référentiel).
 */
final class UcPro05BancEssaiTest extends TestCase
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
        self::$pdo->exec('DELETE FROM prompt_packages');
        self::wipeReferentiel(self::$pdo);
    }

    private static function user(string $name): int
    {
        self::$pdo->prepare('INSERT INTO users (email, password_hash, display_name) VALUES (?, ?, ?)')
            ->execute([uniqid($name, true) . '@example.org', Users::hashPassword('x-password'), $name]);

        return (int) self::$pdo->lastInsertId();
    }

    private static function packages(): PromptPackageRepository
    {
        return new PromptPackageRepository(self::$pdo);
    }

    #[TestDox('UC-PRO-05-U01 — listPublished : versions publiées et publiques seulement (ni brouillon, ni Golden privé) ; drapeau reserved')]
    public function testU01ListPublishedExposesOnlyPublicPublishedVersions(): void
    {
        $author = self::user('Pom');
        self::packages()->importPublishedDocument(self::enginePackage('aurora-lab', '2.0.0'));
        // Paquet réservé au pipeline Twin6 (metadata.reserved) : le banc s'appuie
        // sur ce drapeau pour l'alerte « référentiel en dur » AVANT le run (A8).
        $twin6 = self::enginePackage('twin6-ouverte', '1.0.0');
        $twin6['metadata']['reserved'] = true;
        self::packages()->importPublishedDocument($twin6);
        self::packages()->createDraft('aurora-lab', '2.0.0', '2.1.0', $author);
        (new GoldenRepository(self::$pdo))->import(self::user('Root'), self::bancPackage(['id' => 'golden-reference']));

        $listed = self::packages()->listPublished();

        self::assertSame(
            [['aurora-lab', '2.0.0', false], ['twin6-ouverte', '1.0.0', true]],
            array_map(static fn (array $p): array => [$p['id'], $p['version'], $p['reserved']], $listed),
            'ni brouillon ni Golden ; reserved vrai pour le seul paquet Twin6 réservé',
        );
    }

    #[TestDox('UC-PRO-05-U02 — listDrafts : uniquement les brouillons de l’auteur (un brouillon ne tourne que chez lui)')]
    public function testU02ListDraftsIsOwnerScoped(): void
    {
        $pom = self::user('Pom');
        $autre = self::user('Autre');
        self::packages()->importPublishedDocument(self::enginePackage('aurora-lab', '2.0.0'));
        $mine = self::packages()->createDraft('aurora-lab', '2.0.0', '2.1.0', $pom);
        self::packages()->createDraft('aurora-lab', '2.0.0', '2.2.0', $autre);

        $drafts = self::packages()->listDrafts($pom);

        self::assertCount(1, $drafts);
        self::assertSame($mine['draftId'], $drafts[0]['draftId']);
        self::assertSame(['aurora-lab', '2.1.0'], [$drafts[0]['id'], $drafts[0]['version']]);
        self::assertArrayNotHasKey('document', $drafts[0], 'la liste ne porte que des métadonnées');
    }

    #[TestDox('UC-PRO-05-U03 — findDraft : document complet pour l’auteur, null pour tout autre compte')]
    public function testU03FindDraftReturnsTheDocumentToItsAuthorOnly(): void
    {
        $pom = self::user('Pom');
        $autre = self::user('Autre');
        self::packages()->importPublishedDocument(self::enginePackage('aurora-lab', '2.0.0'));
        $draft = self::packages()->createDraft('aurora-lab', '2.0.0', '2.1.0', $pom);

        $found = self::packages()->findDraft($draft['draftId'], $pom);
        self::assertNotNull($found);
        self::assertSame('2.1.0', $found['document']['version']);
        self::assertStringContainsString('engine://', $found['document']['code']['orchestration']);

        self::assertNull(self::packages()->findDraft($draft['draftId'], $autre));
    }

    #[TestDox('UC-PRO-05-U04 — findPublished : document exécutable d’une version publiée ; null pour un brouillon ou un Golden')]
    public function testU04FindPublishedServesOnlyPublicPublishedDocuments(): void
    {
        $pom = self::user('Pom');
        self::packages()->importPublishedDocument(self::bancPackage());
        self::packages()->createDraft('aurora-demo', '1.0.0', '1.1.0', $pom);
        (new GoldenRepository(self::$pdo))->import(self::user('Root'), self::bancPackage(['id' => 'golden-reference']));

        $doc = self::packages()->findPublished('aurora-demo', '1.0.0');
        self::assertNotNull($doc);
        self::assertSame('run', $doc['code']['entrypoint']);
        self::assertSame(['extraction-pole', 'kairos'], array_column($doc['prompts'], 'role'));

        self::assertNull(self::packages()->findPublished('aurora-demo', '1.1.0'), 'brouillon');
        self::assertNull(self::packages()->findPublished('golden-reference', '1.0.0'), 'Golden privé');
    }

    #[TestDox('UC-PRO-05-U05 — référentiel : versions publiées triées (semver décroissant), métadonnées sous la clé « semver »')]
    public function testU05PublishedReferentielVersionsAndTheirMetadataShape(): void
    {
        self::publishReferentiel(self::$pdo, '7.0.0');
        self::publishReferentiel(self::$pdo, '7.10.0');
        self::publishReferentiel(self::$pdo, '7.2.0');
        $repo = new ReferentielRepository(self::$pdo);

        $versions = $repo->publishedVersions(ReferentielRepository::DEFAULT_REFERENTIEL_ID);
        self::assertSame(['7.10.0', '7.2.0', '7.0.0'], array_column($versions, 'semver'));

        $meta = ReferentielRepository::metadata($versions[0]);
        self::assertSame('7.10.0', $meta['semver']);
        // Contrat constaté (anomalie AN-1 de la fiche) : pas de clé « version »,
        // que le banc attend pourtant pour lister les versions.
        self::assertArrayNotHasKey('version', $meta);
        self::assertArrayNotHasKey('content', $meta);

        $document = $repo->findPublished(ReferentielRepository::DEFAULT_REFERENTIEL_ID, '7.2.0')['content'];
        self::assertSame('7.2.0', $document['version']);
        self::assertCount(7, $document['poles']);
        self::assertCount(61, $document['competences']);
    }
}
