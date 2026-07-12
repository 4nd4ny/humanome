<?php

declare(strict_types=1);

namespace Humanome\Tests;

/**
 * P8 — CRUD of the opt-in server cartographies (M6 API contract).
 *
 * RGPD assertions live here: opt_in_at is stamped by the INSERT itself
 * (the POST IS the opt-in), the list NEVER carries a document, DELETE is a
 * real purge including share_links.
 */
final class CartographiesTest extends AuthTestBase
{
    private string $csrf = '';

    protected function setUp(): void
    {
        parent::setUp();
        self::$pdo->exec('DELETE FROM users');
        self::$pdo->exec('DELETE FROM prompt_packages');
        self::$pdo->exec('DELETE FROM referentiel_versions');

        $response = $this->register('maya@example.org', self::PASSWORD, 'Maya');
        self::assertSame(201, $response->getStatusCode());
        $this->csrf = (string) self::json($response)['csrfToken'];
    }

    /** @return array<string, mixed> a minimal valid POST body */
    private static function body(array $overrides = []): array
    {
        return array_merge([
            'type' => 'jour',
            'titre' => 'Feuille du 5 janvier',
            'visibility' => 'privee',
            'document' => ['kind' => 'cartographie-jour', 'date' => '2026-01-05', 'poles' => []],
        ], $overrides);
    }

    private function post(array $body): \Psr\Http\Message\ResponseInterface
    {
        return $this->request('POST', '/api/cartographies', $body, ['X-CSRF-Token' => $this->csrf]);
    }

    public function testPostStoresDocumentWithOptInTimestamp(): void
    {
        $response = $this->post(self::body());
        self::assertSame(201, $response->getStatusCode());
        $id = self::json($response)['id'];
        self::assertIsInt($id);

        $row = self::$pdo->query('SELECT * FROM cartographies WHERE id = ' . $id)->fetch();
        self::assertNotFalse($row);
        self::assertNotNull($row['opt_in_at'], 'POST is the explicit opt-in: opt_in_at must be stamped');
        self::assertNotNull($row['document']);
        self::assertSame('jour', $row['type']);
        self::assertSame(
            '2026-01-05',
            json_decode((string) $row['document'], true)['date'],
        );
    }

    public function testPostRequiresAuthenticationAndRole(): void
    {
        $this->cookieSid = null; // visitor
        $response = $this->request('POST', '/api/cartographies', self::body());
        self::assertSame(401, $response->getStatusCode());
    }

    public function testPostValidatesBody(): void
    {
        $bad = [
            self::body(['type' => 'weekly']),
            self::body(['titre' => '']),
            self::body(['titre' => str_repeat('a', 191)]),
            self::body(['visibility' => 'friends']),
            self::body(['document' => 'not-an-object']),
            self::body(['document' => ['a', 'b']]), // JSON array, not an object
            self::body(['runMeta' => 'nope']),
        ];
        foreach ($bad as $i => $body) {
            $response = $this->post($body);
            self::assertSame(422, $response->getStatusCode(), 'case #' . $i);
        }
    }

    public function testPostResolvesPublishedPackageAndReferentielVersions(): void
    {
        $this->publishFixtures();

        $response = $this->post(self::body([
            'promptPackageId' => 'paquet-test',
            'promptPackageVersion' => '1.0.0',
            'referentielId' => 'respire',
            'referentielVersion' => '7.0.0',
            'runMeta' => ['provider' => 'mock', 'model' => 'mock-1', 'coutEstimeUsd' => 0],
        ]));
        self::assertSame(201, $response->getStatusCode());
        $id = (int) self::json($response)['id'];

        $detail = self::json($this->request('GET', '/api/cartographies/' . $id));
        self::assertSame(['id' => 'paquet-test', 'version' => '1.0.0'], $detail['promptPackage']);
        self::assertSame(['id' => 'respire', 'version' => '7.0.0'], $detail['referentiel']);
        self::assertSame('mock', $detail['runMeta']['provider']);
    }

    public function testPostRejectsUnknownPackageVersion(): void
    {
        $response = $this->post(self::body([
            'promptPackageId' => 'fantome',
            'promptPackageVersion' => '9.9.9',
        ]));
        self::assertSame(422, $response->getStatusCode());
        self::assertArrayHasKey('promptPackageId', self::json($response)['fields']);
    }

    public function testListNeverContainsDocuments(): void
    {
        $this->post(self::body(['titre' => 'Une']));
        $this->post(self::body(['titre' => 'Deux', 'type' => 'merge']));

        $response = $this->request('GET', '/api/cartographies');
        self::assertSame(200, $response->getStatusCode());
        $list = self::json($response);
        self::assertCount(2, $list);
        foreach ($list as $item) {
            self::assertArrayNotHasKey('document', $item, 'the list projection must NEVER carry a document');
            self::assertTrue($item['hasDocument']);
            self::assertSame(0, $item['shares']);
            self::assertArrayHasKey('createdAt', $item);
            self::assertArrayHasKey('updatedAt', $item);
        }
        // Raw body double-check: no fragment of the stored document leaks.
        self::assertStringNotContainsString('cartographie-jour', (string) $response->getBody());
    }

    public function testGetReturnsDocumentToOwnerOnly(): void
    {
        $id = (int) self::json($this->post(self::body()))['id'];

        $response = $this->request('GET', '/api/cartographies/' . $id);
        self::assertSame(200, $response->getStatusCode());
        $carto = self::json($response);
        self::assertSame('cartographie-jour', $carto['document']['kind']);
        self::assertNotNull($carto['optInAt']);
        self::assertNull($carto['promptPackage']);

        // Another learner sees a 404, indistinguishable from a missing id.
        $this->cookieSid = null;
        $this->register('other@example.org', self::PASSWORD, 'Other');
        $other = $this->request('GET', '/api/cartographies/' . $id);
        self::assertSame(404, $other->getStatusCode());
    }

    public function testPatchUpdatesTitreAndVisibility(): void
    {
        $id = (int) self::json($this->post(self::body()))['id'];

        $response = $this->request('PATCH', '/api/cartographies/' . $id, [
            'titre' => 'Renommée',
            'visibility' => 'cartographe',
        ], ['X-CSRF-Token' => $this->csrf]);
        self::assertSame(200, $response->getStatusCode());
        $patched = self::json($response);
        self::assertSame('Renommée', $patched['titre']);
        self::assertSame('cartographe', $patched['visibility']);
        self::assertArrayNotHasKey('document', $patched);

        $bad = $this->request('PATCH', '/api/cartographies/' . $id, [
            'visibility' => 'friends',
        ], ['X-CSRF-Token' => $this->csrf]);
        self::assertSame(422, $bad->getStatusCode());
    }

    public function testDeletePurgesRowAndItsShareLinks(): void
    {
        $id = (int) self::json($this->post(self::body()))['id'];
        $share = $this->request('POST', '/api/cartographies/' . $id . '/share', [
            'password' => 'motdepasse',
        ], ['X-CSRF-Token' => $this->csrf]);
        self::assertSame(201, $share->getStatusCode());

        $response = $this->request('DELETE', '/api/cartographies/' . $id, null, ['X-CSRF-Token' => $this->csrf]);
        self::assertSame(204, $response->getStatusCode());

        self::assertSame(0, (int) self::$pdo->query('SELECT COUNT(*) FROM cartographies')->fetchColumn());
        self::assertSame(
            0,
            (int) self::$pdo->query('SELECT COUNT(*) FROM share_links')->fetchColumn(),
            'purging a cartography must purge its share links (FK cascade)',
        );

        $again = $this->request('DELETE', '/api/cartographies/' . $id, null, ['X-CSRF-Token' => $this->csrf]);
        self::assertSame(404, $again->getStatusCode());
    }

    public function testOwnershipIsEnforcedOnMutations(): void
    {
        $id = (int) self::json($this->post(self::body()))['id'];

        $this->cookieSid = null;
        $intruder = $this->register('intru@example.org', self::PASSWORD, 'Intru');
        $intruderCsrf = (string) self::json($intruder)['csrfToken'];

        $patch = $this->request('PATCH', '/api/cartographies/' . $id, ['titre' => 'Volée'], ['X-CSRF-Token' => $intruderCsrf]);
        self::assertSame(404, $patch->getStatusCode());
        $delete = $this->request('DELETE', '/api/cartographies/' . $id, null, ['X-CSRF-Token' => $intruderCsrf]);
        self::assertSame(404, $delete->getStatusCode());

        self::assertSame(1, (int) self::$pdo->query('SELECT COUNT(*) FROM cartographies')->fetchColumn());
    }

    /** Publish one prompt package and one referentiel version for resolution tests. */
    private function publishFixtures(): void
    {
        self::$pdo->exec("INSERT INTO prompt_packages (slug, description) VALUES ('paquet-test', 'Paquet de test')");
        $packageId = (int) self::$pdo->lastInsertId();
        self::$pdo->prepare(
            "INSERT INTO prompt_versions (package_id, semver, status, content, published_at)
             VALUES (?, '1.0.0', 'published', '{\"id\": \"paquet-test\"}', NOW())"
        )->execute([$packageId]);
        self::$pdo->exec(
            "INSERT INTO referentiel_versions (referentiel_id, semver, label, status, content, content_hash, published_at)
             VALUES ('respire', '7.0.0', 'RESPIRE v7', 'published', '{}', REPEAT('0', 64), NOW())"
        );
    }
}
