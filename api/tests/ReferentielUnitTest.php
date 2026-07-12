<?php

declare(strict_types=1);

namespace Humanome\Tests;

use Humanome\Referentiel\ContentHash;
use Humanome\Referentiel\ReferentielDiff;
use Humanome\Referentiel\Semver;
use PHPUnit\Framework\TestCase;

/** Pure-logic tests: content hash parity with Node, semver precedence, diff. */
final class ReferentielUnitTest extends TestCase
{
    /** @return array<string, mixed> */
    private static function respireDocument(): array
    {
        $path = dirname(__DIR__, 2) . '/web/public/data/referentiel/respire-v7.json';
        self::assertFileExists($path, 'run: node scripts/extract-referentiel.mjs');

        return json_decode((string) file_get_contents($path), true, 512, JSON_THROW_ON_ERROR);
    }

    public function testContentHashMatchesNodeExtractor(): void
    {
        // Parity guard with scripts/extract-referentiel.mjs (sha256 of
        // JSON.stringify({poles, competences})) on the real corpus document.
        $doc = self::respireDocument();

        self::assertSame($doc['contentHash'], ContentHash::compute($doc));
    }

    public function testNormalizeIsOrderInsensitive(): void
    {
        $doc = self::respireDocument();

        $shuffled = $doc;
        $shuffled['competences'] = array_reverse($doc['competences']);
        $shuffled['poles'] = array_reverse($doc['poles']);
        // Scramble key order inside an entry as well.
        $shuffled['competences'][0] = array_reverse($shuffled['competences'][0], true);

        $normalized = ContentHash::normalize($shuffled);

        self::assertSame($doc['contentHash'], $normalized['contentHash']);
        self::assertSame($doc['poles'], $normalized['poles']);
        self::assertSame($doc['competences'], $normalized['competences']);
        self::assertSame(
            ['schemaVersion', 'kind', 'id', 'version', 'label', 'contentHash', 'source', 'poles', 'competences'],
            array_keys($normalized),
        );
    }

    public function testNormalizeRejectsUnhashableBody(): void
    {
        $this->expectException(\InvalidArgumentException::class);

        ContentHash::normalize(['poles' => 'oops', 'competences' => []]);
    }

    public function testSemverPrecedence(): void
    {
        self::assertTrue(Semver::greaterThan('7.1.0', '7.0.0'));
        self::assertTrue(Semver::greaterThan('7.1.0', '7.0.9'));
        self::assertTrue(Semver::greaterThan('10.0.0', '9.9.9'));
        self::assertTrue(Semver::greaterThan('7.1.0', '7.1.0-rc.1'));
        self::assertTrue(Semver::greaterThan('7.1.0-rc.2', '7.1.0-rc.1'));
        self::assertTrue(Semver::greaterThan('7.1.0-rc.1.1', '7.1.0-rc.1'));
        self::assertFalse(Semver::greaterThan('7.0.0', '7.0.0'));
        self::assertFalse(Semver::greaterThan('6.9.9', '7.0.0'));
        self::assertSame(0, Semver::compare('1.2.3+build.5', '1.2.3'));
    }

    public function testSemverValidation(): void
    {
        self::assertTrue(Semver::isValid('7.0.0'));
        self::assertTrue(Semver::isValid('7.1.0-rc.1+build.2'));
        self::assertFalse(Semver::isValid('v7.0.0'));
        self::assertFalse(Semver::isValid('7.0'));
        self::assertFalse(Semver::isValid('07.0.0'));
        self::assertFalse(Semver::isValid(''));
    }

    public function testDiffDetectsEveryStructuralChangeKind(): void
    {
        $from = [
            'id' => 'respire',
            'version' => '7.0.0',
            'label' => 'RESPIRE v7',
            'poles' => [
                ['num' => 1, 'nom' => 'TETE', 'couleur' => '#111111'],
                ['num' => 2, 'nom' => 'COEUR', 'couleur' => '#222222'],
            ],
            'competences' => [
                ['code' => '1.01', 'nom' => 'Pensée critique', 'pole' => 1],
                ['code' => '1.02', 'nom' => 'Synthèse', 'pole' => 1],
                ['code' => '2.01', 'nom' => 'Écoute', 'pole' => 2],
            ],
        ];
        $to = [
            'id' => 'respire',
            'version' => '7.1.0',
            'label' => 'RESPIRE v7.1',
            'poles' => [
                ['num' => 1, 'nom' => 'TETE — Penser', 'couleur' => '#111111'],
                ['num' => 2, 'nom' => 'COEUR', 'couleur' => '#222222'],
            ],
            'competences' => [
                ['code' => '1.01', 'nom' => 'Pensée critique augmentée', 'pole' => 1],
                ['code' => '1.02', 'nom' => 'Synthèse', 'pole' => 2],
                ['code' => '2.02', 'nom' => 'Coopération', 'pole' => 2],
            ],
        ];

        $diff = ReferentielDiff::compute($from, $to);

        self::assertFalse($diff['identical']);
        self::assertSame('respire', $diff['referentielId']);
        self::assertSame('7.0.0', $diff['from']['version']);
        self::assertSame('7.1.0', $diff['to']['version']);

        self::assertSame([['num' => 1, 'changes' => [
            'nom' => ['from' => 'TETE', 'to' => 'TETE — Penser'],
        ]]], $diff['poles']['modified']);
        self::assertSame([], $diff['poles']['added']);
        self::assertSame([], $diff['poles']['removed']);

        self::assertSame([['code' => '2.02', 'nom' => 'Coopération', 'pole' => 2]], $diff['competences']['added']);
        self::assertSame([['code' => '2.01', 'nom' => 'Écoute', 'pole' => 2]], $diff['competences']['removed']);
        self::assertSame([[
            'code' => '1.01',
            'pole' => 1,
            'from' => 'Pensée critique',
            'to' => 'Pensée critique augmentée',
        ]], $diff['competences']['renamed']);
        self::assertSame([[
            'code' => '1.02',
            'nom' => 'Synthèse',
            'fromPole' => 1,
            'toPole' => 2,
        ]], $diff['competences']['moved']);

        self::assertSame([
            'polesAdded' => 0,
            'polesRemoved' => 0,
            'polesModified' => 1,
            'competencesAdded' => 1,
            'competencesRemoved' => 1,
            'competencesRenamed' => 1,
            'competencesMoved' => 1,
        ], $diff['summary']);
    }

    public function testDiffOfIdenticalDocumentsIsIdentical(): void
    {
        $doc = self::respireDocument();

        $diff = ReferentielDiff::compute($doc, $doc);

        self::assertTrue($diff['identical']);
        self::assertSame(0, array_sum($diff['summary']));
    }
}
