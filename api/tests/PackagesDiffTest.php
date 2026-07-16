<?php

declare(strict_types=1);

namespace Humanome\Tests;

use Humanome\Packages\PackageDiff;

/**
 * P10 — structural diff between two published prompt-package versions:
 * prompts keyed by (role, nom) with a compact line diff of texte and a
 * variables diff, plus code / metadata / top-level field changes.
 */
final class PackagesDiffTest extends PackagesTestCase
{
    public function testStructuralDiffIsReadable(): void
    {
        self::importPackage();
        self::importPackage(self::packageDocV2());

        $response = $this->request('GET', '/prompt-packages/aurora-demo/diff/1.0.0/2.0.0');
        self::assertSame(200, $response->getStatusCode());
        $diff = self::body($response);

        self::assertSame('aurora-demo', $diff['packageId']);
        self::assertSame('1.0.0', $diff['from']['version']);
        self::assertSame('2.0.0', $diff['to']['version']);
        self::assertFalse($diff['identical']);

        // Prompt added / removed, identified by role + nom.
        self::assertSame(
            [['role' => 'merge', 'nom' => 'Fusion chronologique multi-jours']],
            $diff['prompts']['added'],
        );
        self::assertSame(
            [['role' => 'kairos', 'nom' => 'Synthèse transversale de la journée']],
            $diff['prompts']['removed'],
        );

        // Prompt modified: compact line diff of texte + variables diff.
        self::assertCount(1, $diff['prompts']['modified']);
        $modified = $diff['prompts']['modified'][0];
        self::assertSame('extraction-pole', $modified['role']);
        $ops = array_column($modified['texte'], 'op');
        self::assertSame(['del', 'add'], $ops); // one line replaced
        self::assertStringContainsString('sans reformuler ni inventer.', $modified['texte'][0]['text']);
        self::assertStringContainsString('avec leur position dans la feuille', $modified['texte'][1]['text']);
        self::assertSame(['consignes_additionnelles'], $modified['variables']['added']);
        self::assertSame([], $modified['variables']['removed']);

        // Code and top-level fields.
        self::assertNotNull($diff['code']['orchestration']);
        self::assertNull($diff['code']['entrypoint']);
        self::assertArrayHasKey('description', $diff['fields']);

        // Count summary.
        self::assertSame(1, $diff['summary']['promptsAdded']);
        self::assertSame(1, $diff['summary']['promptsRemoved']);
        self::assertSame(1, $diff['summary']['promptsModified']);
        self::assertTrue($diff['summary']['codeChanged']);
    }

    public function testDiffOfAVersionWithItselfIsIdentical(): void
    {
        self::importPackage();

        $diff = self::body($this->request('GET', '/prompt-packages/aurora-demo/diff/1.0.0/1.0.0'));
        self::assertTrue($diff['identical']);
        self::assertSame([], $diff['prompts']['added']);
        self::assertSame([], $diff['prompts']['modified']);
    }

    public function testDiffRequiresPublishedVersions(): void
    {
        self::importPackage();
        self::loginAsPromptologue();
        self::body($this->request('POST', '/prompt-packages/drafts', [
            'fromId' => 'aurora-demo',
            'fromVersion' => '1.0.0',
            'version' => '1.1.0',
        ]));

        // Unknown version and DRAFT version answer the same 404.
        self::assertSame(404, $this->request('GET', '/prompt-packages/aurora-demo/diff/1.0.0/9.9.9')->getStatusCode());
        self::assertSame(404, $this->request('GET', '/prompt-packages/aurora-demo/diff/1.0.0/1.1.0')->getStatusCode());
        self::assertSame(404, $this->request('GET', '/prompt-packages/inconnu/diff/1.0.0/2.0.0')->getStatusCode());
    }

    /**
     * Exigence (diff-promptologue) : protection contre une divergence FUTURE
     * de contrat entre PackageDiff.php et le front. La sortie réelle du
     * serveur (PackageDiff::compute ET la route GET diff) doit rester
     * strictement égale à la fixture PARTAGÉE
     * schemas/fixtures/diff/prompt-package-diff-exemple.json (sous-répertoire
     * diff/ : scripts/validate-corpus.mjs ne valide que les DOCUMENTS à
     * `kind` de schemas/fixtures/*.json, or ce fichier est un instantané de
     * contrat dérivé, pas un document du corpus), rendue telle quelle
     * par web/src/views/promptologue/DiffView.test.jsx. Tout renommage de clé
     * dans PackageDiff.php casse ce test ; si la fixture est régénérée pour
     * suivre le serveur, RELANCER le test front DiffView (il casse alors
     * symétriquement tant que la vue n'est pas réalignée).
     */
    public function testDiffMatchesSharedFixture(): void
    {
        $fixturePath = dirname(__DIR__, 2) . '/schemas/fixtures/diff/prompt-package-diff-exemple.json';
        $expected = json_decode((string) file_get_contents($fixturePath), true, 512, JSON_THROW_ON_ERROR);

        // 1. Unit level: the computed diff IS the shared fixture.
        $computed = PackageDiff::compute(self::packageDoc(), self::diffFixtureDocV2());
        self::assertSame(
            self::canonicalized($expected),
            self::canonicalized($computed),
            'PackageDiff::compute a divergé de schemas/fixtures/diff/prompt-package-diff-exemple.json — '
            . 'régénérer la fixture puis relancer web/src/views/promptologue/DiffView.test.jsx.',
        );

        // 2. Route level: the HTTP payload the front actually receives is the
        // fixture too (the route returns compute() verbatim — no decoration).
        self::importPackage();
        self::importPackage(self::diffFixtureDocV2());
        $response = $this->request('GET', '/prompt-packages/aurora-demo/diff/1.0.0/2.0.0');
        self::assertSame(200, $response->getStatusCode());
        self::assertSame(
            self::canonicalized($expected),
            self::canonicalized(self::body($response)),
            'GET /prompt-packages/{id}/diff/{v1}/{v2} a divergé de la fixture partagée.',
        );
    }

    /**
     * The v2 document behind the shared fixture: packageDocV2() (one prompt
     * modified, one removed, one added, orchestration + description changed)
     * enriched so the fixture exercises EVERY DiffView branch — entrypoint
     * change (objet {from,to}), one modified variable (changes.description)
     * and one metadata change.
     *
     * @return array<string, mixed>
     */
    private static function diffFixtureDocV2(): array
    {
        $doc = self::packageDocV2();
        $doc['code']['entrypoint'] = 'main';
        $doc['prompts'][0]['variables'][2]['description'] =
            'Date de la feuille de portfolio cartographiée, au format ISO (AAAA-MM-JJ).';
        $doc['metadata']['licence'] = 'CC-BY-4.0';

        return $doc;
    }

    /**
     * Recursive ksort on maps (lists untouched): strict deep equality with
     * key ORDER indifference, but exact structure, types and values.
     */
    private static function canonicalized(mixed $value): mixed
    {
        if (!\is_array($value)) {
            return $value;
        }
        $out = array_map(self::canonicalized(...), $value);
        if (!array_is_list($out)) {
            ksort($out);
        }

        return $out;
    }

    public function testLineDiffIsCompact(): void
    {
        self::assertNull(PackageDiff::lineDiff("a\nb\nc", "a\nb\nc"));

        self::assertSame(
            [
                ['op' => 'del', 'line' => 2, 'text' => 'b'],
                ['op' => 'add', 'line' => 2, 'text' => 'B'],
            ],
            PackageDiff::lineDiff("a\nb\nc", "a\nB\nc"),
        );

        // Pure insertion keeps surrounding lines out of the diff.
        self::assertSame(
            [['op' => 'add', 'line' => 3, 'text' => 'nouveau']],
            PackageDiff::lineDiff("a\nb\nc", "a\nb\nnouveau\nc"),
        );

        // Pure deletion, numbered in the FROM document.
        self::assertSame(
            [['op' => 'del', 'line' => 1, 'text' => 'a']],
            PackageDiff::lineDiff("a\nb", 'b'),
        );
    }
}
