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
