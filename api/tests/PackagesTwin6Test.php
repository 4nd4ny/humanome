<?php

declare(strict_types=1);

namespace Humanome\Tests;

use Humanome\Db;

/**
 * D1 / AD-D1 — Twin6 forkable dans l'atelier : import PUBLIÉ idempotent d'un
 * paquet RÉSERVÉ (source-unique), et fork-with-rename (un promptologue ne peut
 * pas republier sous le nom réservé « twin6-ouverte » — il forke une COPIE
 * sous un nouveau nom).
 */
final class PackagesTwin6Test extends PackagesTestCase
{
    /** @return array<string, mixed> paquet réservé (id twin6-ouverte). */
    private static function reservedDoc(): array
    {
        $doc = self::packageDoc(['id' => 'twin6-ouverte']);
        $doc['metadata']['reserved'] = true;

        return $doc;
    }

    public function testImportReservedIsIdempotentAndListedReserved(): void
    {
        $first = self::importPackage(self::reservedDoc());
        self::assertSame('imported', $first['status']);
        $second = self::importPackage(self::reservedDoc());
        self::assertSame('unchanged', $second['status']);

        // La liste publique expose le drapeau réservé.
        $published = self::body($this->request('GET', '/prompt-packages'));
        self::assertCount(1, $published);
        self::assertSame('twin6-ouverte', $published[0]['id']);
        self::assertTrue($published[0]['reserved']);
    }

    public function testForkingAReservedPackageRequiresARename(): void
    {
        self::importPackage(self::reservedDoc());
        self::loginAsPromptologue();

        // Sans toId -> 422 (rename imposé).
        $noRename = $this->request('POST', '/prompt-packages/drafts', [
            'fromId' => 'twin6-ouverte',
            'fromVersion' => '1.0.0',
            'version' => '1.1.0',
        ]);
        self::assertSame(422, $noRename->getStatusCode());

        // toId identique au nom réservé -> 422.
        $sameName = $this->request('POST', '/prompt-packages/drafts', [
            'fromId' => 'twin6-ouverte',
            'fromVersion' => '1.0.0',
            'version' => '1.1.0',
            'toId' => 'twin6-ouverte',
        ]);
        self::assertSame(422, $sameName->getStatusCode());

        // toId invalide (pas kebab-case) -> 422.
        $badSlug = $this->request('POST', '/prompt-packages/drafts', [
            'fromId' => 'twin6-ouverte',
            'fromVersion' => '1.0.0',
            'version' => '1.0.0',
            'toId' => 'Mon Twin6',
        ]);
        self::assertSame(422, $badSlug->getStatusCode());
    }

    public function testRenamedForkLandsInAFreshOwnedPackageAndCanBePublished(): void
    {
        self::importPackage(self::reservedDoc());
        self::loginAsPromptologue();

        $created = $this->request('POST', '/prompt-packages/drafts', [
            'fromId' => 'twin6-ouverte',
            'fromVersion' => '1.0.0',
            'version' => '1.0.0',
            'toId' => 'mon-twin6',
        ]);
        self::assertSame(201, $created->getStatusCode());
        $draftId = self::body($created)['draftId'];
        self::assertSame('mon-twin6', self::body($created)['id']);

        // Le document du brouillon porte le NOUVEAU nom et n'est plus réservé.
        $draft = self::body($this->request('GET', "/prompt-packages/drafts/{$draftId}"));
        self::assertSame('mon-twin6', $draft['document']['id']);
        self::assertArrayNotHasKey('reserved', $draft['document']['metadata']);

        // Le paquet réservé source est INTACT (aucun brouillon sous son nom).
        $reservedDrafts = Db::get()->query(
            "SELECT COUNT(*) FROM prompt_versions pv
               JOIN prompt_packages pp ON pp.id = pv.package_id
              WHERE pp.slug = 'twin6-ouverte' AND pv.status = 'draft'"
        )->fetchColumn();
        self::assertSame(0, (int) $reservedDrafts);

        // La copie (non réservée) se publie normalement.
        $published = $this->request('POST', "/prompt-packages/drafts/{$draftId}/publish", [
            'changelog' => 'Ma copie de travail.',
        ]);
        self::assertSame(200, $published->getStatusCode());
        self::assertSame('mon-twin6', self::body($published)['id']);

        // Elle apparaît publiée et NON réservée ; twin6-ouverte reste réservé.
        $list = self::body($this->request('GET', '/prompt-packages'));
        $byId = [];
        foreach ($list as $row) {
            $byId[$row['id']] = $row['reserved'];
        }
        self::assertTrue($byId['twin6-ouverte']);
        self::assertFalse($byId['mon-twin6']);
    }

    public function testForkDiffAgainstOriginWorksAcrossIds(): void
    {
        self::importPackage(self::reservedDoc());
        self::loginAsPromptologue();

        $draftId = self::body($this->request('POST', '/prompt-packages/drafts', [
            'fromId' => 'twin6-ouverte',
            'fromVersion' => '1.0.0',
            'version' => '1.0.0',
            'toId' => 'mon-twin6',
        ]))['draftId'];

        // On modifie un prompt du fork, puis on le compare à l'original.
        $doc = self::body($this->request('GET', "/prompt-packages/drafts/{$draftId}"))['document'];
        $doc['prompts'][0]['texte'] .= "\n\n# Ma variante\nConsigne ajoutée dans le fork.";
        self::assertSame(200, $this->request('PUT', "/prompt-packages/drafts/{$draftId}", $doc)->getStatusCode());

        $diffResp = $this->request('GET', "/prompt-packages/drafts/{$draftId}/diff-origin");
        self::assertSame(200, $diffResp->getStatusCode());
        $diff = self::body($diffResp);
        self::assertFalse($diff['identical']);
        self::assertCount(1, $diff['prompts']['modified']);
        $added = array_filter($diff['prompts']['modified'][0]['texte'], static fn ($op) => $op['op'] === 'add');
        self::assertNotEmpty($added);
        self::assertStringContainsString(
            'Consigne ajoutée dans le fork',
            implode("\n", array_column($added, 'text')),
        );
    }

    public function testDiffOriginRequiresAForkedDraftAndOwnerScope(): void
    {
        // Un brouillon ordinaire (non-fork) n'a pas d'original de référence -> 422.
        self::importPackage(self::packageDoc()); // aurora-demo (non réservé)
        self::loginAsPromptologue();
        $ordinaryDraft = self::body($this->request('POST', '/prompt-packages/drafts', [
            'fromId' => 'aurora-demo',
            'fromVersion' => '1.0.0',
            'version' => '1.1.0',
        ]))['draftId'];
        self::assertSame(422, $this->request('GET', "/prompt-packages/drafts/{$ordinaryDraft}/diff-origin")->getStatusCode());

        // Fork renommé d'un paquet réservé.
        self::importPackage(self::reservedDoc());
        $forkDraft = self::body($this->request('POST', '/prompt-packages/drafts', [
            'fromId' => 'twin6-ouverte',
            'fromVersion' => '1.0.0',
            'version' => '1.0.0',
            'toId' => 'mon-twin6',
        ]))['draftId'];
        self::assertSame(200, $this->request('GET', "/prompt-packages/drafts/{$forkDraft}/diff-origin")->getStatusCode());

        // Un AUTRE promptologue ne voit pas ce brouillon -> 404 (owner scope).
        self::loginAsPromptologue();
        self::assertSame(404, $this->request('GET', "/prompt-packages/drafts/{$forkDraft}/diff-origin")->getStatusCode());
    }

    public function testRenameTargetMustBeAFreshName(): void
    {
        self::importPackage(self::reservedDoc());
        // Un autre paquet publié occupe déjà le nom « mon-twin6 ».
        self::importPackage(self::packageDoc(['id' => 'mon-twin6']));
        self::loginAsPromptologue();

        $collision = $this->request('POST', '/prompt-packages/drafts', [
            'fromId' => 'twin6-ouverte',
            'fromVersion' => '1.0.0',
            'version' => '1.0.0',
            'toId' => 'mon-twin6',
        ]);
        self::assertSame(409, $collision->getStatusCode());
    }
}
