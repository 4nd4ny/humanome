<?php

declare(strict_types=1);

namespace Humanome\Tests;

use Humanome\Db;
use Humanome\Packages\SettingsRepository;
use Humanome\Referentiel\CompetenceSeeder;
use Humanome\Referentiel\FicheGenerator;
use Humanome\Referentiel\SnapshotAssembler;
use Humanome\Twin9\FicheStore;

/**
 * SOURCE UNIQUE des fiches (2026-07-16) : prouve que le FicheGenerator
 * reconstruit, DEPUIS LA BASE (seedée par CompetenceSeeder), les artefacts que
 * Twin6 et Twin9 consomment BYTE-EXACTEMENT.
 *
 * Le « gold » est reconstruit depuis le CORPUS COMMITTÉ (scripts/data/fiches-v7.json),
 * pas depuis les P*.md gitignorés (générés au build) — le test tient sur un clone
 * frais / en CI. La parité des P*.md contre les vrais fichiers d'or est prouvée
 * côté JS (scripts/extract-fiches.mjs, generate-fiches.mjs --verify).
 */
final class FicheParityTest extends CompetenceTestCase
{
    /** @var array{poleHeaders: array<string,string>, fiches: array<string,string>} */
    private static array $corpus;

    public static function setUpBeforeClass(): void
    {
        parent::setUpBeforeClass();
        self::$corpus = json_decode(
            (string) file_get_contents(\dirname(__DIR__, 2) . '/scripts/data/fiches-v7.json'),
            true, 512, JSON_THROW_ON_ERROR,
        );
    }

    /** @return list<string> codes d'un pôle, triés (même ordre que la base) */
    private static function codesForPole(int $n): array
    {
        $codes = array_filter(array_keys(self::$corpus['fiches']), static fn (string $c): bool => str_starts_with($c, "{$n}."));
        sort($codes);

        return array_values($codes);
    }

    /** Gold P*.md reconstruit du corpus par la RÈGLE (b) (indépendant des P*.md gitignorés). */
    private static function goldPoleFiche(int $n): string
    {
        $header = self::$corpus['poleHeaders'][(string) $n];
        $fiches = array_map(static fn (string $c): string => self::$corpus['fiches'][$c], self::codesForPole($n));

        return $header . implode("\n\n", $fiches) . "\n";
    }

    /** POLE_FICHES runtime (règle c, `---` DOUBLÉ) attendu — ce que Twin9 envoie au LLM. */
    private static function goldPoleFichesRuntime(int $n): string
    {
        $header = self::$corpus['poleHeaders'][(string) $n];
        $fiches = array_map(static fn (string $c): string => trim(self::$corpus['fiches'][$c]), self::codesForPole($n));

        return rtrim($header) . "\n\n" . implode("\n\n---\n\n", $fiches) . "\n";
    }

    private function seedFromCorpus(): void
    {
        self::importRespire();
        $rich = json_decode(
            (string) file_get_contents(\dirname(__DIR__, 2) . '/scripts/data/competences-v7.json'),
            true, 512, JSON_THROW_ON_ERROR,
        )['competences'];
        $doc = self::respireDocument();
        $pdo = Db::get();
        $pole = $pdo->prepare('INSERT INTO referentiel_poles (num, nom, couleur) VALUES (?, ?, ?)');
        foreach ($doc['poles'] as $p) {
            $pole->execute([$p['num'], $p['nom'], $p['couleur'] ?? null]);
        }
        (new CompetenceSeeder($pdo))->seed($rich, self::$corpus);
    }

    public function testGeneratorRebuildsEachPoleFicheByteForByte(): void
    {
        $this->seedFromCorpus();
        $generated = (new FicheGenerator(Db::get()))->poleFiches();

        for ($n = 1; $n <= 7; $n++) {
            self::assertArrayHasKey($n, $generated, "P{$n} généré");
            self::assertSame(self::goldPoleFiche($n), $generated[$n], "P{$n}.md régénéré (règle b) byte-identique au corpus");
        }
    }

    /**
     * Round-trip du chemin RUNTIME Twin9 : base → FicheGenerator → FicheStore::store
     * → fromSettings → competenceFiche()/poleFiches(). Exerce la règle (c) (le `---`
     * DOUBLÉ) réellement envoyée au LLM — que le gate P*.md (règle b) ne couvre pas.
     */
    public function testFicheStoreRoundTripPreservesCompetenceAndPoleFiches(): void
    {
        $this->seedFromCorpus();
        $pdo = Db::get();
        $settings = new SettingsRepository($pdo);
        FicheStore::store($settings, (new FicheGenerator($pdo))->fichesStructure());
        $store = FicheStore::fromSettings($settings);

        // COMPETENCE_FICHE : chaque fiche_md verbatim === corpus.
        foreach (self::$corpus['fiches'] as $code => $expected) {
            self::assertSame($expected, $store->competenceFiche($code), "COMPETENCE_FICHE {$code}");
        }
        // POLE_FICHES : réassemblage runtime (règle c) byte-identique.
        for ($n = 1; $n <= 7; $n++) {
            self::assertSame(self::goldPoleFichesRuntime($n), $store->poleFiches($n), "POLE_FICHES pôle {$n}");
        }
    }

    public function testSeedPreservesStructuralParity(): void
    {
        $this->seedFromCorpus();
        self::assertSame(
            self::repo()->latestPublished(self::RESPIRE)['contentHash'],
            (new SnapshotAssembler(Db::get()))->structuralHash(),
        );
    }
}
