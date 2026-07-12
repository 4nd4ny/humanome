<?php

declare(strict_types=1);

namespace Humanome\Tests;

use Humanome\Admin\GoldenRepository;
use Humanome\Db;

/**
 * P12.1 Golden Prompt administration (cahier §3.8/§4.10/§7).
 *
 * The DoD invariant: a Golden package is imported PRIVATE and is NEVER exposed
 * — not listed, not served, not defaulted, not proposable, not runnable, not
 * forkable — until an admin grants a specific promptologue access. The
 * non-exposure is asserted on EVERY public read path of the prompt-package
 * module, not just the list (advisor's blind-spot check).
 */
final class AdminGoldenTest extends AdminTestCase
{
    public function testRoleGuard(): void
    {
        $this->cookieSid = null;
        self::assertSame(401, $this->request('GET', '/api/admin/golden')->getStatusCode());

        $promptologue = $this->registerAs('p@example.org', 'Promptologue', ['promptologue']);
        self::assertSame(403, $this->as_($promptologue, 'GET', '/api/admin/golden')->getStatusCode());
        self::assertSame(403, $this->as_($promptologue, 'POST', '/api/admin/golden', self::goldenDoc())->getStatusCode());
    }

    public function testImportIsPrivateAndIdempotent(): void
    {
        $admin = $this->registerAdmin();

        $created = $this->as_($admin, 'POST', '/api/admin/golden', self::goldenDoc());
        self::assertSame(201, $created->getStatusCode(), (string) $created->getBody());
        self::assertSame('imported', self::json($created)['status']);

        // The row is flagged private.
        $isPrivate = Db::get()->query(
            "SELECT is_private FROM prompt_packages WHERE slug = '" . self::GOLDEN_ID . "'"
        )->fetchColumn();
        self::assertSame(1, (int) $isPrivate);

        // Re-import identical document: unchanged, HTTP 200.
        $again = $this->as_($admin, 'POST', '/api/admin/golden', self::goldenDoc());
        self::assertSame(200, $again->getStatusCode());
        self::assertSame('unchanged', self::json($again)['status']);

        // Different content, same (id, version): 409 (immutability).
        $mutated = self::goldenDoc(['description' => 'Contenu modifié']);
        self::assertSame(409, $this->as_($admin, 'POST', '/api/admin/golden', $mutated)->getStatusCode());
    }

    public function testGoldenNeverExposedOnAnyPublicPath(): void
    {
        $admin = $this->registerAdmin();
        $promptologue = $this->registerAs('p@example.org', 'Promptologue', ['promptologue']);

        // A public package exists (so /default resolves to it, never golden).
        self::importPublicPackage();
        $this->as_($admin, 'POST', '/api/admin/golden', self::goldenDoc());

        // 1. Public list excludes golden.
        $list = self::json($this->request('GET', '/api/prompt-packages'));
        $slugs = array_column($list, 'id');
        self::assertContains(self::PUBLIC_ID, $slugs);
        self::assertNotContains(self::GOLDEN_ID, $slugs);

        // 2. Default resolves to the public package, never golden.
        $default = self::json($this->request('GET', '/api/prompt-packages/default'));
        self::assertSame(self::PUBLIC_ID, $default['id']);

        // 3. Document fetch of the golden version: 404.
        self::assertSame(
            404,
            $this->request('GET', '/api/prompt-packages/' . self::GOLDEN_ID . '/' . self::PUBLIC_VERSION)->getStatusCode(),
        );

        // 4. propose-default on golden (isPublished path): 404.
        self::assertSame(
            404,
            $this->as_($promptologue, 'POST', '/api/prompt-packages/' . self::GOLDEN_ID . '/' . self::PUBLIC_VERSION . '/propose-default')->getStatusCode(),
        );

        // 5. Draft fork with golden as source: 404 (never forkable).
        $fork = $this->as_($promptologue, 'POST', '/api/prompt-packages/drafts', [
            'fromId' => self::GOLDEN_ID,
            'fromVersion' => self::PUBLIC_VERSION,
            'version' => '9.9.9',
        ]);
        self::assertSame(404, $fork->getStatusCode(), (string) $fork->getBody());
    }

    public function testGoldenNotMassRunnableByEstablishment(): void
    {
        // §7's exact "exécutable par autrui sans autorisation" path: a B2B
        // establishment must not be able to launch a mass run on the Golden.
        $admin = $this->registerAdmin();
        $etab = $this->registerAs('lycee@example.org', 'Lycée', ['etablissement']);
        $this->as_($admin, 'POST', '/api/admin/golden', self::goldenDoc());

        $created = $this->as_($etab, 'POST', '/api/etablissement/cohortes', ['nom' => 'Terminale']);
        self::assertSame(201, $created->getStatusCode(), (string) $created->getBody());
        $cohorteId = self::json($created)['id'];

        // Launch is refused at validation (422), never enqueued: findPublished
        // excludes private packages, so the run cannot freeze the golden slug.
        $launch = $this->as_($etab, 'POST', "/api/etablissement/cohortes/{$cohorteId}/runs", [
            'promptPackageId' => self::GOLDEN_ID,
            'promptPackageVersion' => self::PUBLIC_VERSION,
        ]);
        self::assertSame(422, $launch->getStatusCode(), (string) $launch->getBody());
        self::assertStringContainsStringIgnoringCase('introuvable', (string) $launch->getBody());

        // No run and no job were created.
        self::assertSame(0, (int) Db::get()->query('SELECT COUNT(*) FROM mass_runs')->fetchColumn());
        self::assertSame(0, (int) Db::get()->query('SELECT COUNT(*) FROM mass_jobs')->fetchColumn());
    }

    public function testImportRefusesToShadowPublicSlug(): void
    {
        $admin = $this->registerAdmin();
        self::importPublicPackage(); // aurora-demo, public

        // Golden import reusing the public slug: 409 (no shadowing).
        $collide = self::goldenDoc(['id' => self::PUBLIC_ID]);
        self::assertSame(409, $this->as_($admin, 'POST', '/api/admin/golden', $collide)->getStatusCode());
    }

    public function testListAndGrant(): void
    {
        $admin = $this->registerAdmin();
        $promptologue = $this->registerAs('p@example.org', 'Promptologue', ['promptologue']);
        $apprenant = $this->registerAs('a@example.org', 'Apprenant', ['apprenant']);
        $this->as_($admin, 'POST', '/api/admin/golden', self::goldenDoc());

        // Grant to a non-promptologue: 422 (access only for promptologues).
        self::assertSame(
            422,
            $this->as_($admin, 'POST', '/api/admin/golden/' . self::GOLDEN_ID . '/grant', ['userId' => $apprenant['id']])->getStatusCode(),
        );

        // Grant to the promptologue: granted, idempotent.
        $granted = $this->as_($admin, 'POST', '/api/admin/golden/' . self::GOLDEN_ID . '/grant', ['userId' => $promptologue['id']]);
        self::assertSame(200, $granted->getStatusCode(), (string) $granted->getBody());
        self::assertSame('granted', self::json($granted)['status']);
        self::assertSame(
            'unchanged',
            self::json($this->as_($admin, 'POST', '/api/admin/golden/' . self::GOLDEN_ID . '/grant', ['userId' => $promptologue['id']]))['status'],
        );

        // The grant is authoritative in the model.
        self::assertTrue((new GoldenRepository(Db::get()))->hasAccess($promptologue['id'], self::GOLDEN_ID));

        // The admin listing shows the private package with its grant.
        $listed = self::json($this->as_($admin, 'GET', '/api/admin/golden'));
        self::assertCount(1, $listed);
        self::assertSame(self::GOLDEN_ID, $listed[0]['id']);
        self::assertSame([self::PUBLIC_VERSION], $listed[0]['versions']);
        self::assertCount(1, $listed[0]['grants']);
        self::assertSame($promptologue['id'], $listed[0]['grants'][0]['userId']);

        // Grant on an unknown golden slug: 404.
        self::assertSame(
            404,
            $this->as_($admin, 'POST', '/api/admin/golden/inconnu/grant', ['userId' => $promptologue['id']])->getStatusCode(),
        );
    }

    public function testImportAndGrantAreAudited(): void
    {
        $admin = $this->registerAdmin();
        $promptologue = $this->registerAs('p@example.org', 'Promptologue', ['promptologue']);
        $this->as_($admin, 'POST', '/api/admin/golden', self::goldenDoc());

        $imported = self::lastAudit('golden_imported');
        self::assertNotNull($imported);
        self::assertSame($admin['id'], $imported['userId']);

        $this->as_($admin, 'POST', '/api/admin/golden/' . self::GOLDEN_ID . '/grant', ['userId' => $promptologue['id']]);
        $access = self::lastAudit('golden_access_granted');
        self::assertNotNull($access);
        self::assertSame($admin['id'], $access['userId']);
        self::assertSame($promptologue['id'], $access['details']['targetUserId']);
    }
}
