<?php

declare(strict_types=1);

namespace Humanome\Tests;

use Humanome\Db;

/**
 * P10 — promptologue draft lifecycle: fork -> edit (schema-validated) ->
 * publish (STRICTLY increasing semver, immutable afterwards), role guard,
 * and owner scoping (no IDOR, homogeneous 404 on foreign drafts).
 */
final class PackagesDraftsTest extends PackagesTestCase
{
    public function testDraftLifecycleCreateEditPublish(): void
    {
        self::importPackage();
        self::loginAsPromptologue();

        // Fork a draft from the published 1.0.0.
        $created = $this->request('POST', '/prompt-packages/drafts', [
            'fromId' => 'aurora-demo',
            'fromVersion' => '1.0.0',
            'version' => '1.1.0',
        ]);
        self::assertSame(201, $created->getStatusCode());
        $draftId = self::body($created)['draftId'];
        self::assertIsInt($draftId);
        self::assertSame('1.1.0', self::body($created)['version']);

        // My drafts list it (metadata only).
        $list = self::body($this->request('GET', '/prompt-packages/drafts'));
        self::assertCount(1, $list);
        self::assertSame(['aurora-demo', '1.1.0'], [$list[0]['id'], $list[0]['version']]);
        self::assertArrayNotHasKey('document', $list[0]);

        // Single draft: full document, version bumped, not published.
        $draft = self::body($this->request('GET', "/prompt-packages/drafts/{$draftId}"));
        self::assertSame('1.1.0', $draft['document']['version']);
        self::assertArrayNotHasKey('publieLe', $draft['document']['metadata']);

        // Edit: replace the document (texte modified).
        $edited = $draft['document'];
        $edited['description'] = 'Version retravaillée dans l\'atelier.';
        $edited['prompts'][0]['texte'] .= "\n\n# Note\nConsigne ajoutée en 1.1.0.";
        $updated = $this->request('PUT', "/prompt-packages/drafts/{$draftId}", $edited);
        self::assertSame(200, $updated->getStatusCode());
        self::assertStringContainsString(
            'Consigne ajoutée en 1.1.0',
            self::body($updated)['document']['prompts'][0]['texte'],
        );

        // The draft stays invisible to the public list until publication.
        self::assertCount(1, self::body($this->request('GET', '/prompt-packages')));

        // Publish with a changelog.
        $published = $this->request('POST', "/prompt-packages/drafts/{$draftId}/publish", [
            'changelog' => 'Consigne de citation renforcée.',
        ]);
        self::assertSame(200, $published->getStatusCode());
        self::assertSame(
            ['id' => 'aurora-demo', 'version' => '1.1.0', 'status' => 'published'],
            self::body($published),
        );

        // Now public: listed, served whole, changelog entry appended.
        $versions = array_column(self::body($this->request('GET', '/prompt-packages')), 'version');
        self::assertSame(['1.0.0', '1.1.0'], $versions);
        $doc = self::body($this->request('GET', '/prompt-packages/aurora-demo/1.1.0'));
        $lastEntry = $doc['changelog'][array_key_last($doc['changelog'])];
        self::assertSame('1.1.0', $lastEntry['version']);
        self::assertSame('Consigne de citation renforcée.', $lastEntry['description']);
        self::assertArrayHasKey('publieLe', $doc['metadata']);

        // Published: gone from my drafts.
        self::assertSame([], self::body($this->request('GET', '/prompt-packages/drafts')));
    }

    public function testPublishRequiresStrictlyIncreasingSemver(): void
    {
        self::importPackage();
        self::loginAsPromptologue();

        // An existing version cannot be forked onto itself.
        $sameVersion = $this->request('POST', '/prompt-packages/drafts', [
            'fromId' => 'aurora-demo',
            'fromVersion' => '1.0.0',
            'version' => '1.0.0',
        ]);
        self::assertSame(409, $sameVersion->getStatusCode());

        // A LOWER draft version can exist... but can never be published.
        $draftId = self::body($this->request('POST', '/prompt-packages/drafts', [
            'fromId' => 'aurora-demo',
            'fromVersion' => '1.0.0',
            'version' => '0.9.0',
        ]))['draftId'];
        $publish = $this->request('POST', "/prompt-packages/drafts/{$draftId}/publish", [
            'changelog' => 'Retour arrière interdit',
        ]);
        self::assertSame(409, $publish->getStatusCode());
        self::assertStringContainsString('strictly increasing', self::body($publish)['error']);
    }

    public function testWritingToAPublishedVersionIs409(): void
    {
        self::importPackage();
        self::loginAsPromptologue();

        $draftId = self::body($this->request('POST', '/prompt-packages/drafts', [
            'fromId' => 'aurora-demo',
            'fromVersion' => '1.0.0',
            'version' => '1.1.0',
        ]))['draftId'];
        $document = self::body($this->request('GET', "/prompt-packages/drafts/{$draftId}"))['document'];
        self::assertSame(200, $this->request('POST', "/prompt-packages/drafts/{$draftId}/publish", [
            'changelog' => 'Première publication',
        ])->getStatusCode());

        // Immutable: no re-edit, no re-publish.
        self::assertSame(409, $this->request('PUT', "/prompt-packages/drafts/{$draftId}", $document)->getStatusCode());
        self::assertSame(409, $this->request('POST', "/prompt-packages/drafts/{$draftId}/publish", [
            'changelog' => 'Republication interdite',
        ])->getStatusCode());
    }

    public function testDraftWritesAreSchemaValidated(): void
    {
        self::importPackage();
        self::loginAsPromptologue();

        $draftId = self::body($this->request('POST', '/prompt-packages/drafts', [
            'fromId' => 'aurora-demo',
            'fromVersion' => '1.0.0',
            'version' => '1.1.0',
        ]))['draftId'];
        $document = self::body($this->request('GET', "/prompt-packages/drafts/{$draftId}"))['document'];

        // Schema violation (prompts: minItems 1) -> 422.
        $invalid = $document;
        $invalid['prompts'] = [];
        self::assertSame(422, $this->request('PUT', "/prompt-packages/drafts/{$draftId}", $invalid)->getStatusCode());

        // The package id is invariant -> 422.
        $renamed = $document;
        $renamed['id'] = 'autre-paquet';
        self::assertSame(422, $this->request('PUT', "/prompt-packages/drafts/{$draftId}", $renamed)->getStatusCode());

        // Version colliding with the published 1.0.0 -> 409.
        $collision = $document;
        $collision['version'] = '1.0.0';
        self::assertSame(409, $this->request('PUT', "/prompt-packages/drafts/{$draftId}", $collision)->getStatusCode());

        // Invalid semver at draft creation -> 422; unknown source -> 404.
        self::assertSame(422, $this->request('POST', '/prompt-packages/drafts', [
            'fromId' => 'aurora-demo',
            'fromVersion' => '1.0.0',
            'version' => 'v8',
        ])->getStatusCode());
        self::assertSame(404, $this->request('POST', '/prompt-packages/drafts', [
            'fromId' => 'aurora-demo',
            'fromVersion' => '9.9.9',
            'version' => '10.0.0',
        ])->getStatusCode());
    }

    public function testDraftRoutesRequireThePromptologueRole(): void
    {
        self::importPackage();
        $body = ['fromId' => 'aurora-demo', 'fromVersion' => '1.0.0', 'version' => '1.1.0'];

        // Visitor (no session) -> 401.
        self::assertSame(401, $this->request('POST', '/prompt-packages/drafts', $body)->getStatusCode());
        self::assertSame(401, $this->request('GET', '/prompt-packages/drafts')->getStatusCode());

        // Wrong role -> 403 (admin is NOT an implicit super-role either).
        self::loginAs(self::createUser('apprenant'));
        self::assertSame(403, $this->request('POST', '/prompt-packages/drafts', $body)->getStatusCode());
        self::assertSame(403, $this->request('GET', '/prompt-packages/drafts')->getStatusCode());
    }

    public function testDraftsAreOwnerScopedNoIdor(): void
    {
        self::importPackage();
        self::loginAsPromptologue();
        $draftId = self::body($this->request('POST', '/prompt-packages/drafts', [
            'fromId' => 'aurora-demo',
            'fromVersion' => '1.0.0',
            'version' => '1.1.0',
        ]))['draftId'];
        $document = self::body($this->request('GET', "/prompt-packages/drafts/{$draftId}"))['document'];

        // Another promptologue sees nothing and can touch nothing —
        // homogeneous 404, exactly like a nonexistent id.
        self::loginAsPromptologue();
        self::assertSame([], self::body($this->request('GET', '/prompt-packages/drafts')));
        self::assertSame(404, $this->request('GET', "/prompt-packages/drafts/{$draftId}")->getStatusCode());
        self::assertSame(404, $this->request('PUT', "/prompt-packages/drafts/{$draftId}", $document)->getStatusCode());
        self::assertSame(404, $this->request('POST', "/prompt-packages/drafts/{$draftId}/publish", [
            'changelog' => 'Tentative interdite',
        ])->getStatusCode());
        // A foreign DRAFT is not a valid fork source either (no oracle).
        self::assertSame(404, $this->request('POST', '/prompt-packages/drafts', [
            'fromId' => 'aurora-demo',
            'fromVersion' => '1.1.0',
            'version' => '1.2.0',
        ])->getStatusCode());

        // The untouched draft is still intact for its author.
        $authorDraft = Db::get()->query(
            'SELECT COUNT(*) FROM prompt_versions WHERE status = "draft"'
        )->fetchColumn();
        self::assertSame(1, (int) $authorDraft);
    }

    public function testDraftCanForkFromOwnDraft(): void
    {
        self::importPackage();
        self::loginAsPromptologue();
        self::assertSame(201, $this->request('POST', '/prompt-packages/drafts', [
            'fromId' => 'aurora-demo',
            'fromVersion' => '1.0.0',
            'version' => '1.1.0',
        ])->getStatusCode());

        $forked = $this->request('POST', '/prompt-packages/drafts', [
            'fromId' => 'aurora-demo',
            'fromVersion' => '1.1.0',
            'version' => '1.2.0',
        ]);
        self::assertSame(201, $forked->getStatusCode());
        self::assertCount(2, self::body($this->request('GET', '/prompt-packages/drafts')));
    }
}
