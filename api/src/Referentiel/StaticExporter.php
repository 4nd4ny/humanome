<?php

declare(strict_types=1);

namespace Humanome\Referentiel;

use PDO;
use RuntimeException;

/**
 * Static export of every published referentiel version (plan M3: the public
 * consultation page reads these files — zero PHP at consultation time).
 *
 * Output in $outDir:
 *   - one <referentielId>-v<semver>.json per published version (schema-valid
 *     referentiel document);
 *   - index.json: list of {referentielId, semver, label, publishedAt, fichier},
 *     newest version first per referentiel.
 */
final class StaticExporter
{
    public const INDEX_FILE = 'index.json';

    /**
     * @return array{count: int, files: list<string>} written filenames (index.json last)
     */
    public static function export(PDO $pdo, string $outDir): array
    {
        if (!is_dir($outDir) && !mkdir($outDir, 0775, true) && !is_dir($outDir)) {
            throw new RuntimeException('Cannot create export directory: ' . $outDir);
        }

        $repository = new ReferentielRepository($pdo);
        $stmt = $pdo->prepare('SELECT DISTINCT referentiel_id FROM referentiel_versions WHERE status = ?');
        $stmt->execute(['published']);
        $referentielIds = $stmt->fetchAll(PDO::FETCH_COLUMN);
        sort($referentielIds, SORT_STRING);

        $index = [];
        $files = [];
        foreach ($referentielIds as $referentielId) {
            foreach ($repository->publishedVersions((string) $referentielId) as $version) {
                $filename = sprintf('%s-v%s.json', $version['referentielId'], $version['semver']);
                self::writeJson($outDir . '/' . $filename, $version['content']);
                $files[] = $filename;
                $index[] = [
                    'referentielId' => $version['referentielId'],
                    'semver' => $version['semver'],
                    'label' => $version['label'],
                    'publishedAt' => self::isoDate($version['publishedAt']),
                    'fichier' => $filename,
                ];
            }
        }

        self::writeJson($outDir . '/' . self::INDEX_FILE, $index);
        $files[] = self::INDEX_FILE;

        return ['count' => \count($index), 'files' => $files];
    }

    private static function writeJson(string $path, mixed $payload): void
    {
        $json = json_encode(
            $payload,
            JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR,
        ) . "\n";
        if (file_put_contents($path, $json) === false) {
            throw new RuntimeException('Cannot write export file: ' . $path);
        }
    }

    /** MySQL DATETIME ("Y-m-d H:i:s") -> ISO-8601 date-time (no TZ claim). */
    private static function isoDate(?string $datetime): ?string
    {
        return $datetime === null ? null : str_replace(' ', 'T', $datetime);
    }
}
