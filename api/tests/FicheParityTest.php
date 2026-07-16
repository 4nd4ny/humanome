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

    /**
     * Gold P{n}.md (règle b) avec certaines fiches REMPLACÉES — l'attendu après
     * une édition gouvernée publiée.
     *
     * @param array<string, string> $overrides code => fiche_md éditée
     */
    private static function goldPoleFicheWith(int $n, array $overrides): string
    {
        $header = self::$corpus['poleHeaders'][(string) $n];
        $fiches = array_map(
            static fn (string $c): string => $overrides[$c] ?? self::$corpus['fiches'][$c],
            self::codesForPole($n),
        );

        return $header . implode("\n\n", $fiches) . "\n";
    }

    /**
     * POLE_FICHES runtime (règle c) avec certaines fiches REMPLACÉES.
     *
     * @param array<string, string> $overrides code => fiche_md éditée
     */
    private static function goldPoleFichesRuntimeWith(int $n, array $overrides): string
    {
        $header = self::$corpus['poleHeaders'][(string) $n];
        $fiches = array_map(
            static fn (string $c): string => trim($overrides[$c] ?? self::$corpus['fiches'][$c]),
            self::codesForPole($n),
        );

        return rtrim($header) . "\n\n" . implode("\n\n---\n\n", $fiches) . "\n";
    }

    /** Fiche du corpus enrichie AVANT son séparateur final (édition gouvernée réaliste). */
    private static function enrichedFiche(string $code, string $note): string
    {
        $original = self::$corpus['fiches'][$code];
        self::assertStringEndsWith("\n\n---", $original, "précondition : {$code} n'est pas la dernière fiche de son pôle");

        return substr($original, 0, -\strlen("\n\n---")) . "\n\n{$note}\n\n---";
    }

    /** Édition GOUVERNÉE de content.fiche : fork 1.1.0 → édition CAS → vote → publication. */
    private static function publishGovernedFicheEdit(string $code, string $newFiche): void
    {
        $draft = self::compRepo()->createDraft($code, '1.1.0');
        self::assertNotNull($draft);
        self::assertSame(
            self::$corpus['fiches'][$code],
            $draft['content']['fiche'] ?? null,
            'le brouillon est forké avec la fiche publiée (source unique)',
        );
        $content = $draft['content'];
        $content['fiche'] = $newFiche;
        self::compRepo()->updateDraft($draft['id'], $content, $draft['contentHash']);
        self::adoptAndPublishCompetence($draft['id']);
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

    /**
     * La forme CORPUS servie par GET /admin/dump-fiches (FicheGenerator::corpus)
     * est STRICTEMENT identique au corpus committé — clés, ordre et octets.
     * C'est la preuve PHP de « dump === extract » (byte-stabilité de
     * scripts/dump-fiches.mjs), jusqu'ici confinée aux scripts manuels.
     */
    public function testCorpusDumpMatchesCommittedCorpus(): void
    {
        $this->seedFromCorpus();

        self::assertSame(
            ['poleHeaders' => self::$corpus['poleHeaders'], 'fiches' => self::$corpus['fiches']],
            (new FicheGenerator(Db::get()))->corpus(),
        );
    }

    /**
     * LA preuve de la chaîne exigée : une édition GOUVERNÉE de content.fiche
     * (fork → édition CAS → vote → publication 1.1.0) aboutit aux DEUX
     * régénérations — Twin6 (poleFiches/corpus, chemin build) ET Twin9
     * (fichesStructure → FicheStore, chemin endpoint) — la nouvelle fiche
     * remplaçant l'ancienne, toutes les autres restant byte-identiques.
     */
    public function testGovernedFicheEditFlowsToBothGenerators(): void
    {
        $this->seedFromCorpus();
        $code = '1.01';
        $newFiche = self::enrichedFiche($code, '*Enrichissement entériné par le vote (test parité).*');
        self::publishGovernedFicheEdit($code, $newFiche);

        $generator = new FicheGenerator(Db::get());

        // 1) Chemin Twin6 : P1.md porte la fiche éditée, P2..P7 sont intacts…
        $poleFiches = $generator->poleFiches();
        self::assertSame(self::goldPoleFicheWith(1, [$code => $newFiche]), $poleFiches[1], 'P1.md régénéré avec la fiche 1.1.0');
        for ($n = 2; $n <= 7; $n++) {
            self::assertSame(self::goldPoleFiche($n), $poleFiches[$n], "P{$n}.md inchangé byte-à-byte");
        }
        // …et le corpus dumpable (matière de fiches-v7.json) suit la base.
        $dumped = $generator->corpus();
        self::assertSame($newFiche, $dumped['fiches'][$code]);

        // 2) Chemin Twin9 : le setting régénéré sert la fiche éditée (règle c),
        //    les 60 autres COMPETENCE_FICHE restent verbatim.
        $settings = new SettingsRepository(Db::get());
        FicheStore::store($settings, $generator->fichesStructure());
        $store = FicheStore::fromSettings($settings);
        self::assertSame($newFiche, $store->competenceFiche($code), 'COMPETENCE_FICHE 1.01 = fiche 1.1.0');
        self::assertSame(self::goldPoleFichesRuntimeWith(1, [$code => $newFiche]), $store->poleFiches(1), 'POLE_FICHES pôle 1');
        for ($n = 2; $n <= 7; $n++) {
            self::assertSame(self::goldPoleFichesRuntime($n), $store->poleFiches($n), "POLE_FICHES pôle {$n} inchangé");
        }
        foreach (self::$corpus['fiches'] as $other => $fiche) {
            if ($other !== $code) {
                self::assertSame($fiche, $store->competenceFiche($other), "COMPETENCE_FICHE {$other} intacte");
            }
        }
    }

    /**
     * Le « backfill 61 compétences » du déploiement prod : un seed HISTORIQUE
     * (d'avant le champ fiche) re-seedé AVEC le corpus backfille les 1.0.0
     * publiées, rafraîchit la provenance du lockfile et rend le générateur
     * capable de produire les P*.md d'or.
     */
    public function testSeedBackfillsLegacySeedVersionWithoutFiche(): void
    {
        self::importRespire();
        $rich = json_decode(
            (string) file_get_contents(\dirname(__DIR__, 2) . '/scripts/data/competences-v7.json'),
            true, 512, JSON_THROW_ON_ERROR,
        )['competences'];
        $seeder = new CompetenceSeeder(Db::get());

        // Seed « legacy » : SANS fiches (l'état de la base avant la source unique).
        $first = $seeder->seed($rich);
        self::assertSame(61, $first['imported']);
        self::assertSame(0, $first['fiches']);
        self::assertArrayNotHasKey('fiche', self::compRepo()->latestPublished('1.01')['content']);

        // Re-seed AVEC le corpus : les 61 versions de seed 1.0.0 sont backfillées.
        $second = $seeder->seed($rich, self::$corpus);
        self::assertSame(61, $second['backfilled'], 're-seed avec corpus = backfill des 61 compétences');
        self::assertSame(61, $second['fiches']);
        self::assertSame(0, $second['imported']);
        self::assertSame(0, $second['unchanged']);

        $published = self::compRepo()->latestPublished('1.01');
        self::assertSame('1.0.0', $published['semver'], 'le backfill ne crée PAS de nouvelle version');
        self::assertSame(self::$corpus['fiches']['1.01'], $published['content']['fiche']);

        // Provenance du lockfile rafraîchie (content_hash du contenu backfillé).
        $stmt = Db::get()->prepare(
            'SELECT content_hash FROM referentiel_snapshot_competences WHERE competence_code = ?'
        );
        $stmt->execute(['1.01']);
        self::assertSame($published['contentHash'], $stmt->fetchColumn());

        // Et la base backfillée régénère les 7 P*.md d'or (règle b).
        $generated = (new FicheGenerator(Db::get()))->poleFiches();
        for ($n = 1; $n <= 7; $n++) {
            self::assertSame(self::goldPoleFiche($n), $generated[$n], "P{$n}.md d'or après backfill");
        }
    }

    /**
     * IMMUTABILITÉ de l'historique publié : après une édition gouvernée (fiche
     * publiée en 1.1.0) puis re-synchronisation du corpus (dump) et re-seed du
     * déploiement suivant, la version publiée 1.0.0 doit conserver sa fiche
     * D'ORIGINE — sinon la diff de gouvernance 1.0.0 → 1.1.0 disparaît
     * (réécriture d'historique).
     *
     * ROUGE-PRODUIT : reconcileSeed backfille la 1.0.0 dès que son hash diffère
     * du corpus, même quand la divergence vient d'une édition gouvernée
     * POSTÉRIEURE (CompetenceRepository::reconcileSeed) — à corriger en ne
     * backfillant que si la version de seed est encore la dernière publiée.
     */
    public function testReseedAfterGovernedEditDoesNotRewritePublishedHistory(): void
    {
        $this->seedFromCorpus();
        $code = '1.01';
        $originalFiche = self::$corpus['fiches'][$code];
        $newFiche = self::enrichedFiche($code, '*Enrichissement entériné par le vote (test immutabilité).*');
        self::publishGovernedFicheEdit($code, $newFiche);

        // Re-synchronisation corpus ← base (dump-fiches), puis re-seed comme au
        // déploiement suivant (deploy.mjs enchaîne seed-competences à chaque fois).
        $dumped = (new FicheGenerator(Db::get()))->corpus();
        self::assertSame($newFiche, $dumped['fiches'][$code], 'le corpus dumpé porte la fiche 1.1.0');
        $rich = json_decode(
            (string) file_get_contents(\dirname(__DIR__, 2) . '/scripts/data/competences-v7.json'),
            true, 512, JSON_THROW_ON_ERROR,
        )['competences'];
        (new CompetenceSeeder(Db::get()))->seed($rich, $dumped);

        // La 1.1.0 reste la dernière publiée, avec la fiche éditée.
        self::assertSame($newFiche, self::compRepo()->latestPublished($code)['content']['fiche']);

        // Les versions publiées sont IMMUABLES : la 1.0.0 garde sa fiche d'origine.
        $v100 = null;
        foreach (self::compRepo()->publishedVersions($code) as $version) {
            if ($version['semver'] === '1.0.0') {
                $v100 = $version;
            }
        }
        self::assertNotNull($v100, 'la version de seed 1.0.0 existe toujours');
        self::assertSame(
            $originalFiche,
            $v100['content']['fiche'] ?? null,
            'réécriture d\'historique interdite : le re-seed ne doit pas backfiller une version de seed '
                . 'DÉPASSÉE par une édition gouvernée (la diff 1.0.0 → 1.1.0 doit rester visible)',
        );
    }
}
