<?php

declare(strict_types=1);

namespace Humanome\Tests;

/**
 * P12.1 admin platform settings (cahier §3.8/§4.10): the read-mostly snapshot
 * (default package, demo caps, worker state, versionable config) and the one
 * write it owns — validating the default prompt-package (P10). No secret value
 * is ever surfaced.
 */
final class AdminSettingsTest extends AdminTestCase
{
    public function testRoleGuard(): void
    {
        $this->cookieSid = null;
        self::assertSame(401, $this->request('GET', '/api/admin/settings')->getStatusCode());

        $learner = $this->registerAs('eleve@example.org', 'Élève', ['apprenant']);
        self::assertSame(403, $this->as_($learner, 'GET', '/api/admin/settings')->getStatusCode());
    }

    public function testSnapshotShape(): void
    {
        $admin = $this->registerAdmin();
        self::importPublicPackage();

        $snapshot = self::json($this->as_($admin, 'GET', '/api/admin/settings'));

        // Default package: no stored value yet -> effective falls back to the
        // latest published (public) package.
        self::assertNull($snapshot['defaultPackage']['stored']);
        self::assertSame(self::PUBLIC_ID, $snapshot['defaultPackage']['effective']['id']);

        // Demo caps: effective values, display only.
        self::assertArrayHasKey('model', $snapshot['demo']);
        self::assertFalse($snapshot['demo']['editableInUi']);

        // Worker: empty queue initially.
        self::assertSame(0, $snapshot['worker']['jobsInQueue']);
        self::assertNull($snapshot['worker']['lastActivity']);

        // Config: secrets are reduced to a `configured` boolean, never a value.
        $secrets = $snapshot['config']['secrets'];
        self::assertTrue($secrets['ANTHROPIC_API_KEY']['secret']);
        self::assertArrayHasKey('configured', $secrets['ANTHROPIC_API_KEY']);
        self::assertArrayNotHasKey('value', $secrets['ANTHROPIC_API_KEY']);
    }

    public function testSetDefaultPackage(): void
    {
        $admin = $this->registerAdmin();
        self::importPublicPackage();

        $ok = $this->as_($admin, 'POST', '/api/admin/settings/default-package', [
            'id' => self::PUBLIC_ID,
            'version' => self::PUBLIC_VERSION,
        ]);
        self::assertSame(200, $ok->getStatusCode(), (string) $ok->getBody());
        self::assertSame('default', self::json($ok)['status']);

        // The stored default is now surfaced, and the public GET reflects it.
        $snapshot = self::json($this->as_($admin, 'GET', '/api/admin/settings'));
        self::assertSame(self::PUBLIC_ID, $snapshot['defaultPackage']['stored']['id']);

        $default = self::json($this->request('GET', '/api/prompt-packages/default'));
        self::assertSame(self::PUBLIC_ID, $default['id']);

        // An audit trail is left.
        self::assertNotNull(self::lastAudit('default_package_set'));
    }

    public function testSetDefaultPackageRejectsUnpublishedAndGolden(): void
    {
        $admin = $this->registerAdmin();
        $this->as_($admin, 'POST', '/api/admin/golden', self::goldenDoc());

        // Unknown published version: 404.
        self::assertSame(404, $this->as_($admin, 'POST', '/api/admin/settings/default-package', [
            'id' => 'inconnu',
            'version' => '1.0.0',
        ])->getStatusCode());

        // A GOLDEN (private) version can never become the platform default: 404
        // (isPublished excludes private packages).
        self::assertSame(404, $this->as_($admin, 'POST', '/api/admin/settings/default-package', [
            'id' => self::GOLDEN_ID,
            'version' => self::PUBLIC_VERSION,
        ])->getStatusCode());

        // Missing fields: 422.
        self::assertSame(422, $this->as_($admin, 'POST', '/api/admin/settings/default-package', ['id' => 'x'])->getStatusCode());
    }
}
