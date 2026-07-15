<?php

declare(strict_types=1);

namespace Humanome\Tests;

use Humanome\Db;
use Humanome\Referentiel\ConflictException;
use Humanome\Referentiel\InvalidDocumentException;
use Humanome\Referentiel\StaticExporter;
use Humanome\Validation;

/**
 * Import (scripts/import-referentiel.php core, P4.1) and static export
 * (scripts/export-referentiel-static.php core, plan M3) tests.
 */
final class ReferentielImportExportTest extends ReferentielTestCase
{
    private function countVersions(): int
    {
        return (int) Db::get()
            ->query('SELECT COUNT(*) FROM referentiel_versions')
            ->fetchColumn();
    }

    public function testImportIsIdempotent(): void
    {
        $first = self::importRespire();
        self::assertSame('imported', $first['status']);
        self::assertSame('7.0.0', $first['semver']);

        $second = self::importRespire();
        self::assertSame('unchanged', $second['status']);
        self::assertSame($first['id'], $second['id']);
        self::assertSame(1, $this->countVersions());

        $imported = self::repo()->findById($first['id']);
        self::assertSame('published', $imported['status']);
        self::assertSame(self::IMPORT_NOTE, $imported['releaseNote']);
        self::assertNotEmpty($imported['publishedAt']);
        self::assertSame(self::respireDocument()['contentHash'], $imported['contentHash']);
    }

    public function testImportRejectsContentHashMismatch(): void
    {
        $doc = self::respireDocument();
        $doc['competences'][0]['nom'] = 'Contenu altéré sans recalcul du hash';

        $this->expectException(ConflictException::class);
        $this->expectExceptionMessage('contentHash mismatch');

        self::repo()->importPublishedDocument($doc, self::IMPORT_NOTE);
    }

    public function testImportRefusesToOverwriteExistingVersionWithDifferentContent(): void
    {
        self::importRespire();

        // Same semver, different (correctly re-hashed) content: immutable.
        $doc = self::respireDocument();
        $doc['competences'][0]['nom'] = 'Autre contenu';
        $doc['contentHash'] = \Humanome\Referentiel\ContentHash::compute($doc);

        try {
            self::repo()->importPublishedDocument($doc, self::IMPORT_NOTE);
            self::fail('Expected ConflictException');
        } catch (ConflictException $e) {
            self::assertStringContainsString('immutable', $e->getMessage());
        }
        self::assertSame(1, $this->countVersions());
    }

    public function testImportValidatesAgainstSchemaBeforeInsertion(): void
    {
        $doc = self::respireDocument();
        unset($doc['label']);

        try {
            self::repo()->importPublishedDocument($doc, self::IMPORT_NOTE);
            self::fail('Expected InvalidDocumentException');
        } catch (InvalidDocumentException $e) {
            self::assertNotEmpty($e->getErrors());
        }
        self::assertSame(0, $this->countVersions());
    }

    public function testStaticExportWritesOneFilePerPublishedVersionPlusIndex(): void
    {
        self::importRespire();
        $repo = self::repo();
        $draft = $repo->createDraft(self::RESPIRE, '7.0.0', '7.1.0', 'RESPIRE v7.1 (test)');
        // Publication now requires a majority vote of the épistémiarque members.
        self::adoptAndPublish($draft['id'], 'Version de test export');
        // Drafts must NOT be exported.
        $repo->createDraft(self::RESPIRE, '7.0.0', '7.2.0', 'Brouillon non publié');

        $outDir = sys_get_temp_dir() . '/humanome-export-' . uniqid('', true);
        try {
            $result = StaticExporter::export(Db::get(), $outDir);

            self::assertSame(2, $result['count']);
            self::assertSame(
                ['respire-v7.1.0.json', 'respire-v7.0.0.json', 'index.json'],
                $result['files'],
            );

            $index = json_decode((string) file_get_contents($outDir . '/index.json'), true, 512, JSON_THROW_ON_ERROR);
            self::assertSame(['7.1.0', '7.0.0'], array_column($index, 'semver'));
            foreach ($index as $entry) {
                self::assertSame(
                    ['referentielId', 'semver', 'label', 'publishedAt', 'fichier'],
                    array_keys($entry),
                );
                self::assertSame(self::RESPIRE, $entry['referentielId']);
                self::assertMatchesRegularExpression('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/', $entry['publishedAt']);

                // Every exported version file conforms to the referentiel schema.
                $doc = json_decode(
                    (string) file_get_contents($outDir . '/' . $entry['fichier']),
                    true,
                    512,
                    JSON_THROW_ON_ERROR,
                );
                self::assertTrue(Validation::validate('referentiel', $doc)['valid']);
                self::assertSame($entry['semver'], $doc['version']);
            }
        } finally {
            foreach (glob($outDir . '/*.json') ?: [] as $file) {
                unlink($file);
            }
            if (is_dir($outDir)) {
                rmdir($outDir);
            }
        }
    }
}
