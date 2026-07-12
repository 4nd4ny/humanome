<?php

declare(strict_types=1);

namespace Humanome\Tests;

use Humanome\Worker\PoleAssembler;
use Humanome\Worker\PromptRunner;
use PHPUnit\Framework\TestCase;

/**
 * M8 coherence gate (docs/plan-masse.md §0): the PHP PromptRunner must
 * rebuild, from the DB-stored package templates, the EXACT prompts the JS
 * engine builds — byte for byte. The goldens in tests/MasseGolden/ are
 * generated THROUGH the engine (buildExtractionPrompt /
 * buildKairosExtractionPrompt of engine/src/pipeline/extract.js) against the
 * real respire-v7 referentiel. Plus unit coverage of the PoleAssembler ports
 * (parseExtractionResponse / normalizeCompetences / computeAuditPole).
 */
final class WorkerPromptRunnerTest extends TestCase
{
    private static function goldenDir(): string
    {
        return __DIR__ . '/MasseGolden';
    }

    /** @return array<string, mixed> */
    private static function package(): array
    {
        $path = dirname(__DIR__, 2) . '/build/prompt-packages/aurora-v3-reconstruit-1.0.0.json';
        self::assertFileExists($path, 'run: node scripts/build-default-prompt-package.mjs');

        return json_decode((string) file_get_contents($path), true, 512, JSON_THROW_ON_ERROR);
    }

    /** @return array<string, mixed> */
    private static function referentiel(): array
    {
        $path = dirname(__DIR__, 2) . '/web/public/data/referentiel/respire-v7.json';
        self::assertFileExists($path);

        return json_decode((string) file_get_contents($path), true, 512, JSON_THROW_ON_ERROR);
    }

    public function testPromptPoleIdentiqueAuMoteurOctetParOctet(): void
    {
        $runner = new PromptRunner(self::package(), self::referentiel());
        self::assertTrue($runner->hasExtractionTemplates());

        $dayText = (string) file_get_contents(self::goldenDir() . '/day-text.txt');
        $golden = (string) file_get_contents(self::goldenDir() . '/extraction-pole-3.golden.txt');

        self::assertSame($golden, $runner->polePrompt(3, $dayText, '2026-01-06'));
    }

    public function testPromptKairosIdentiqueAuMoteurOctetParOctet(): void
    {
        $runner = new PromptRunner(self::package(), self::referentiel());

        $dayText = (string) file_get_contents(self::goldenDir() . '/day-text.txt');
        $golden = (string) file_get_contents(self::goldenDir() . '/kairos.golden.txt');

        self::assertSame($golden, $runner->kairosPrompt($dayText, '2026-01-06'));
    }

    public function testSubstitutionSansInjectionDepuisLePortfolio(): void
    {
        $runner = new PromptRunner(self::package(), self::referentiel());

        // A portfolio containing placeholder syntax must pass through as
        // LITERAL text (single-pass strtr, never re-scanned).
        $prompt = $runner->polePrompt(1, 'Mon texte contient {{date_iso}} et {{referentiel_bloc}}.', '2026-01-05');
        self::assertStringContainsString('Mon texte contient {{date_iso}} et {{referentiel_bloc}}.', $prompt);

        // Unknown pole / missing template fail loudly.
        $this->expectException(\InvalidArgumentException::class);
        $runner->polePrompt(9, 'x', '2026-01-05');
    }

    public function testGabaritsAbsentsDetectes(): void
    {
        $runner = new PromptRunner(['prompts' => []], self::referentiel());
        self::assertFalse($runner->hasExtractionTemplates());
        $this->expectException(\RuntimeException::class);
        $runner->polePrompt(1, 'x', '2026-01-05');
    }

    // ------------------------------------------------ PoleAssembler ports

    public function testParseTolerant(): void
    {
        // Direct, fenced, prose around, trailing commas — extract.js
        // parseExtractionResponse behaviours.
        self::assertSame(['a' => 1], PoleAssembler::parse('{"a": 1}'));
        self::assertSame(['a' => 1], PoleAssembler::parse("Voici :\n```json\n{\"a\": 1}\n```\nfin"));
        self::assertSame(['a' => 1], PoleAssembler::parse('Le résultat {"a": 1} est prêt.'));
        self::assertSame(['a' => [1, 2]], PoleAssembler::parse('{"a": [1, 2,], }'));
        self::assertSame(['a' => 'x, ]'], PoleAssembler::parse('{"a": "x, ]"}'), 'les virgules DANS les chaînes survivent');
        self::assertNull(PoleAssembler::parse('null'), 'kairos absent');

        $this->expectException(\RuntimeException::class);
        PoleAssembler::parse('Aucun JSON ici.');
    }

    public function testNormalizeCompetencesInvariantsDuCorpus(): void
    {
        // extract.js normalizeCompetences: courtCircuit ⇔ pieces vides (la
        // donnée décide), forme CC forcée, pédagogue incomplet -> null.
        $competences = PoleAssembler::normalizeCompetences([
            [
                'code' => '1.01',
                'courtCircuit' => false, // liar flag: no piece -> CC anyway
                'pieces' => [],
                'pedagogue' => ['presomptionAbsence' => ['raisonnement' => 'x']],
                'tracesRetenues' => [['pieceId' => 1]],
                'verdict' => ['statut' => 'présence établie', 'prescription' => 'garder la trace'],
            ],
            [
                'code' => '1.02',
                'courtCircuit' => true, // liar flag: has pieces -> not a CC
                'pieces' => [['pid' => 1, 'numero' => 1, 'contexte' => 'c']],
                'pedagogue' => ['presomptionAbsence' => ['raisonnement' => 'incomplet']],
                'tracesRetenues' => [],
                'verdict' => ['statut' => 'renvoi au cartographe', 'nombrePreuves' => 0, 'nombreIndices' => 0, 'confiance' => 0.4, 'motif' => 'm', 'prescription' => 'p'],
            ],
        ]);

        $cc = $competences[0];
        self::assertTrue($cc['courtCircuit']);
        self::assertNull($cc['pedagogue']);
        self::assertSame([], $cc['tracesRetenues']);
        self::assertSame('présence non établie', $cc['verdict']['statut']);
        self::assertSame(1, $cc['verdict']['confiance']);
        self::assertSame(PoleAssembler::RAISON_COURT_CIRCUIT, $cc['verdict']['raison']);
        self::assertSame('garder la trace', $cc['verdict']['prescriptionMinimale'], 'prescription recyclée');

        $ouvert = $competences[1];
        self::assertFalse($ouvert['courtCircuit']);
        self::assertNull($ouvert['pedagogue'], 'un demi-examen ne vaut rien (schéma : complet ou null)');
        self::assertSame('renvoi au cartographe', $ouvert['verdict']['statut']);
    }

    public function testComputeAuditPoleRecompte(): void
    {
        // extract.js computeAuditPole: recomputed from the verdicts (the
        // LLM counters drift). nonEtablies counts EVERY « présence non
        // établie », court-circuits included.
        $audit = PoleAssembler::computeAuditPole([
            ['courtCircuit' => true, 'verdict' => ['statut' => 'présence non établie']],
            ['courtCircuit' => false, 'verdict' => ['statut' => 'présence non établie']],
            ['courtCircuit' => false, 'verdict' => ['statut' => 'présence établie']],
            ['courtCircuit' => false, 'verdict' => ['statut' => 'renvoi au cartographe']],
        ]);
        self::assertSame([
            'competencesTotales' => 4,
            'competencesNonCourtCircuit' => 3,
            'presencesEtablies' => 1,
            'renvoisCartographe' => 1,
            'nonEtablies' => 2,
            'courtCircuits' => 1,
        ], $audit);
    }

    public function testAssemblePoleValideUnPoleReelEtRejetteUnFragment(): void
    {
        $fixture = json_decode(
            (string) file_get_contents(dirname(__DIR__, 2) . '/schemas/fixtures/cartographie-jour-2026-01-05.json'),
            true,
            512,
            JSON_THROW_ON_ERROR,
        );
        $pole = $fixture['poles'][0];

        $assembled = PoleAssembler::assemblePole($pole, 1, '2026-01-05');
        self::assertSame('1', $assembled['poleNum']);
        self::assertSame($assembled['auditPole']['competencesTotales'], \count($assembled['competences']));

        // Fragment (typical broken answer): fails loudly for the retry.
        $this->expectException(\RuntimeException::class);
        PoleAssembler::assemblePole(['code' => '1.01', 'pieces' => []], 1, '2026-01-05');
    }

    public function testAssembleDayDocumentComplet(): void
    {
        $fixture = json_decode(
            (string) file_get_contents(dirname(__DIR__, 2) . '/schemas/fixtures/cartographie-jour-2026-01-07.json'),
            true,
            512,
            JSON_THROW_ON_ERROR,
        );
        $polesByNum = [];
        foreach ($fixture['poles'] as $pole) {
            $polesByNum[(int) $pole['poleNum']] = $pole;
        }

        PoleAssembler::validateKairos($fixture['kairos'], $polesByNum, '2026-01-07');
        $document = PoleAssembler::assembleDay($polesByNum, $fixture['kairos'], '2026-01-07');
        self::assertSame('cartographie-jour', $document['kind']);
        self::assertCount(7, $document['poles']);

        // 6 poles only -> the schema (7 exactly) fails the assembly.
        unset($polesByNum[4]);
        $this->expectException(\RuntimeException::class);
        PoleAssembler::assembleDay($polesByNum, null, '2026-01-07');
    }
}
