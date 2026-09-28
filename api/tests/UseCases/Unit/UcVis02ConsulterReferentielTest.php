<?php

declare(strict_types=1);

namespace Humanome\Tests\UseCases\Unit;

use Humanome\MigrationRunner;
use Humanome\Referentiel\CompetenceHash;
use Humanome\Referentiel\CompetenceRepository;
use Humanome\Referentiel\ReferentielDiff;
use Humanome\Referentiel\ReferentielRepository;
use Humanome\Referentiel\StaticExporter;
use Humanome\Tests\TestDb;
use Humanome\Tests\UseCases\Support\VisSupport;
use PDO;
use PHPUnit\Framework\Attributes\TestDox;
use PHPUnit\Framework\TestCase;

/**
 * UC-VIS-02 — Consulter le référentiel public : tests UNITAIRES.
 *
 * Fiche : docs/cas-utilisation/visiteur/UC-VIS-02-consulter-referentiel-public.md
 *
 * Les classes de LECTURE du référentiel sont appelées directement, sans couche
 * HTTP : ReferentielRepository (versions publiées, précédence semver,
 * brouillons invisibles, métadonnées), ReferentielDiff (différences
 * structurelles), StaticExporter (export statique lu par la page publique) et
 * CompetenceRepository (dernière version publiée de chaque compétence).
 */
final class UcVis02ConsulterReferentielTest extends TestCase
{
    private static PDO $pdo;

    public static function setUpBeforeClass(): void
    {
        self::$pdo = TestDb::fresh();
        (new MigrationRunner(self::$pdo, MigrationRunner::defaultMigrationsDir()))->run();
    }

    protected function setUp(): void
    {
        foreach ([
            'referentiel_snapshot_competences',
            'competence_votes',
            'competence_versions',
            'referentiel_votes',
            'referentiel_versions',
        ] as $table) {
            self::$pdo->exec('DELETE FROM ' . $table);
        }
    }

    private static function repo(): ReferentielRepository
    {
        return new ReferentielRepository(self::$pdo);
    }

    /** Insère une version de compétence au statut donné (contenu minimal conforme). */
    private static function competenceRow(string $code, string $semver, string $status, string $nom): void
    {
        $content = [
            'identite' => ['code' => $code, 'nom' => $nom, 'definition' => 'Déf.', 'marqueurs_fondamentaux' => ['a']],
            'protocole' => ['passe_1' => ['signaux_declencheurs' => ['s'], 'token_budget' => 10]],
        ];
        self::$pdo->prepare(
            'INSERT INTO competence_versions (competence_code, semver, pole, nom, status, content, content_hash, published_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ' . ($status === 'published' ? 'NOW()' : 'NULL') . ')'
        )->execute([
            $code, $semver, (int) $code[0], $nom, $status,
            CompetenceHash::encode(CompetenceHash::canonical($content)), CompetenceHash::compute($content),
        ]);
    }

    #[TestDox('UC-VIS-02-U01 — versions publiées : la plus récente d’abord (précédence semver), brouillon exclu')]
    public function testU01PublishedVersionsNewestFirstDraftExcluded(): void
    {
        VisSupport::publishTwoVersionsAndADraft(self::$pdo);
        // 7.10.0 doit passer devant 7.9.0 (précédence numérique, pas lexicale).
        self::repo()->cutReleaseFromDocument(VisSupport::respireVersion('7.9.0'));
        self::repo()->cutReleaseFromDocument(VisSupport::respireVersion('7.10.0'));

        $semvers = array_column(self::repo()->publishedVersions(ReferentielRepository::DEFAULT_REFERENTIEL_ID), 'semver');
        self::assertSame(['7.10.0', '7.9.0', '7.1.0', '7.0.0'], $semvers);
        self::assertNotContains('7.2.0', $semvers, 'le brouillon n’est jamais public');
        self::assertSame('7.10.0', self::repo()->latestPublished('respire')['semver']);
        self::assertNull(self::repo()->latestPublished('referentiel-inconnu'));
    }

    #[TestDox('UC-VIS-02-U02 — findPublished : une version publiée oui, un brouillon ou une version inconnue non')]
    public function testU02FindPublishedIgnoresDraftsAndUnknown(): void
    {
        VisSupport::publishTwoVersionsAndADraft(self::$pdo);

        self::assertSame('published', self::repo()->findPublished('respire', '7.0.0')['status']);
        self::assertNull(self::repo()->findPublished('respire', '7.2.0'), 'brouillon');
        self::assertNull(self::repo()->findPublished('respire', '9.9.9'));
        self::assertNull(self::repo()->findPublished('respire', 'pas-un-semver'));
    }

    #[TestDox('UC-VIS-02-U03 — contenu relu : forme canonique restaurée, empreinte de contenu cohérente ; metadata sans contenu')]
    public function testU03ContentIsCanonicalAndMetadataHasNoContent(): void
    {
        VisSupport::publishTwoVersionsAndADraft(self::$pdo);
        $v700 = self::repo()->findPublished('respire', '7.0.0');

        // Colonne JSON MySQL : l'ordre des clés est restauré (ContentHash::normalize).
        self::assertEquals(VisSupport::respireV7(), $v700['content']);
        self::assertSame(VisSupport::respireV7()['contentHash'], $v700['contentHash']);
        self::assertSame($v700['contentHash'], $v700['content']['contentHash']);
        self::assertCount(7, $v700['content']['poles']);
        self::assertCount(61, $v700['content']['competences']);

        $meta = ReferentielRepository::metadata($v700);
        self::assertArrayNotHasKey('content', $meta);
        self::assertSame(
            ['id', 'referentielId', 'semver', 'label', 'status', 'contentHash', 'releaseNote', 'publishedAt', 'submittedAt', 'decidimUrl'],
            array_keys($meta),
        );
        self::assertSame('Import initial RESPIRE v7', $meta['releaseNote']);
    }

    #[TestDox('UC-VIS-02-U04 — ReferentielDiff : renommage détecté ; une définition ajoutée n’est pas une différence STRUCTURELLE')]
    public function testU04DiffReportsStructuralChangesOnly(): void
    {
        $from = VisSupport::respireV7();
        $to = VisSupport::respireVersion('7.1.0', static function (array $doc): array {
            foreach ($doc['competences'] as &$competence) {
                if ($competence['code'] === '1.01') {
                    $competence['description'] = 'Nouvelle définition.';
                }
                if ($competence['code'] === '7.03') {
                    $competence['nom'] = 'Mentorat renommé';
                }
            }

            return $doc;
        });

        $diff = ReferentielDiff::compute($from, $to);
        self::assertFalse($diff['identical']);
        self::assertSame(['version' => '7.0.0', 'label' => 'RESPIRE v7'], $diff['from']);
        self::assertSame('7.1.0', $diff['to']['version']);
        self::assertSame(
            [['code' => '7.03', 'pole' => 7, 'from' => 'Documentation Vivante', 'to' => 'Mentorat renommé']],
            $diff['competences']['renamed'],
        );
        self::assertSame(1, $diff['summary']['competencesRenamed']);
        self::assertSame(0, array_sum($diff['summary']) - 1, 'la définition de 1.01 n’apparaît pas');

        $descriptionOnly = VisSupport::respireVersion('7.1.1', static function (array $doc): array {
            $doc['competences'][0]['description'] = 'Seulement une définition.';

            return $doc;
        });
        self::assertTrue(ReferentielDiff::compute($from, $descriptionOnly)['identical']);
    }

    #[TestDox('UC-VIS-02-U05 — StaticExporter : un fichier par version publiée + index.json (plus récente d’abord), brouillon non exporté')]
    public function testU05StaticExportWritesPublishedVersionsAndIndex(): void
    {
        VisSupport::publishTwoVersionsAndADraft(self::$pdo);
        $dir = sys_get_temp_dir() . '/uc-vis-02-export-' . bin2hex(random_bytes(4));

        $result = StaticExporter::export(self::$pdo, $dir);

        self::assertSame(2, $result['count']);
        self::assertSame(['respire-v7.1.0.json', 'respire-v7.0.0.json', 'index.json'], $result['files']);
        $index = json_decode((string) file_get_contents($dir . '/index.json'), true, 512, JSON_THROW_ON_ERROR);
        self::assertSame(['7.1.0', '7.0.0'], array_column($index, 'semver'));
        self::assertSame(['referentielId', 'semver', 'label', 'publishedAt', 'fichier'], array_keys($index[0]));
        self::assertMatchesRegularExpression('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/', $index[0]['publishedAt']);
        self::assertFileDoesNotExist($dir . '/respire-v7.2.0.json');
        $v710 = json_decode((string) file_get_contents($dir . '/respire-v7.1.0.json'), true, 512, JSON_THROW_ON_ERROR);
        self::assertSame('7.1.0', $v710['version']);

        array_map('unlink', glob($dir . '/*') ?: []);
        rmdir($dir);
    }

    #[TestDox('UC-VIS-02-U06 — CompetenceRepository : dernière version PUBLIÉE de chaque compétence, triée par code ; brouillons exclus')]
    public function testU06LatestPublishedByCode(): void
    {
        self::competenceRow('2.01', '1.0.0', 'published', 'Intelligence émotionnelle');
        self::competenceRow('1.01', '1.0.0', 'published', 'Pensée critique');
        self::competenceRow('1.01', '1.10.0', 'published', 'Pensée critique (v1.10)');
        self::competenceRow('1.01', '1.9.0', 'published', 'Pensée critique (v1.9)');
        self::competenceRow('1.01', '2.0.0', 'draft', 'Brouillon');

        $repo = new CompetenceRepository(self::$pdo);
        $latest = $repo->latestPublishedByCode();
        self::assertSame(['1.01', '2.01'], array_keys($latest));
        self::assertSame('1.10.0', $latest['1.01']['semver']);
        self::assertSame('Pensée critique (v1.10)', $latest['1.01']['nom']);
        self::assertSame(['1.10.0', '1.9.0', '1.0.0'], array_column($repo->publishedVersions('1.01'), 'semver'));
        self::assertSame('1.10.0', $repo->latestPublished('1.01')['semver']);
        self::assertNull($repo->latestPublished('9.99'));
        self::assertSame([], $repo->publishedVersions('9.99'));
    }

    #[TestDox('UC-VIS-02-U07 — CompetenceRepository : contenu riche relu, metadata sans contenu')]
    public function testU07CompetenceContentAndMetadata(): void
    {
        self::competenceRow('3.04', '1.0.0', 'published', 'Jugement esthétique');
        $repo = new CompetenceRepository(self::$pdo);
        $competence = $repo->latestPublished('3.04');

        self::assertSame(3, $competence['pole']);
        self::assertSame('3.04', $competence['content']['identite']['code']);
        $meta = CompetenceRepository::metadata($competence);
        self::assertArrayNotHasKey('content', $meta);
        self::assertSame(['id', 'code', 'semver', 'pole', 'nom', 'status', 'contentHash', 'releaseNote', 'publishedAt', 'submittedAt', 'decidimUrl'], array_keys($meta));
        self::assertMatchesRegularExpression(CompetenceRepository::CODE_RE, '3.04');
        self::assertDoesNotMatchRegularExpression(CompetenceRepository::CODE_RE, '3.4');
    }
}
