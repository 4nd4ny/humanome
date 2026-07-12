<?php

declare(strict_types=1);

namespace Humanome\Tests;

use Humanome\Db;
use Humanome\Packages\SettingsRepository;

/**
 * P10 — default prompt-package designation: promptologue proposal,
 * operator validation via POST /api/admin/default-package (X-Migrate-Token),
 * GET /api/prompt-packages/default with fallback to the most recently
 * published version.
 */
final class PackagesDefaultTest extends PackagesTestCase
{
    private const TOKEN = 'test_migrate_token_0123456789abcdef';

    protected function setUp(): void
    {
        parent::setUp();
        TestDb::setEnv('MIGRATE_TOKEN', self::TOKEN);
    }

    public function testDefaultFallsBackToTheLatestPublishedVersion(): void
    {
        // Nothing published yet -> 404.
        self::assertSame(404, $this->request('GET', '/prompt-packages/default')->getStatusCode());

        self::importPackage();
        self::assertSame(
            ['id' => 'aurora-demo', 'version' => '1.0.0'],
            self::body($this->request('GET', '/prompt-packages/default')),
        );

        // A newer publication becomes the fallback.
        self::importPackage(self::packageDocV2());
        self::assertSame(
            ['id' => 'aurora-demo', 'version' => '2.0.0'],
            self::body($this->request('GET', '/prompt-packages/default')),
        );
    }

    public function testProposeDefaultRequiresPromptologueAndAPublishedVersion(): void
    {
        self::importPackage();

        // Visitor -> 401 ; wrong role -> 403.
        self::assertSame(401, $this->request('POST', '/prompt-packages/aurora-demo/1.0.0/propose-default')->getStatusCode());
        self::loginAs(self::createUser('apprenant'));
        self::assertSame(403, $this->request('POST', '/prompt-packages/aurora-demo/1.0.0/propose-default')->getStatusCode());

        $userId = self::loginAsPromptologue();

        // Unknown version -> 404.
        self::assertSame(404, $this->request('POST', '/prompt-packages/aurora-demo/9.9.9/propose-default')->getStatusCode());

        $response = $this->request('POST', '/prompt-packages/aurora-demo/1.0.0/propose-default');
        self::assertSame(200, $response->getStatusCode());
        self::assertSame(
            ['id' => 'aurora-demo', 'version' => '1.0.0', 'status' => 'proposed'],
            self::body($response),
        );

        $proposal = (new SettingsRepository(Db::get()))->get(SettingsRepository::DEFAULT_PACKAGE_PROPOSAL);
        self::assertSame('aurora-demo', $proposal['id']);
        self::assertSame('1.0.0', $proposal['version']);
        self::assertSame($userId, $proposal['proposedBy']);

        // A proposal alone does NOT change the served default (admin validates).
        self::assertSame(
            ['id' => 'aurora-demo', 'version' => '1.0.0'],
            self::body($this->request('GET', '/prompt-packages/default')),
        );
    }

    public function testAdminValidationSetsTheServedDefault(): void
    {
        self::importPackage();
        self::importPackage(self::packageDocV2());
        self::loginAsPromptologue();
        $this->request('POST', '/prompt-packages/aurora-demo/1.0.0/propose-default');

        // Token gate: no/wrong token -> 403, unconfigured -> 404.
        self::assertSame(403, $this->requestWithHeaders('POST', '/admin/default-package', [
            'id' => 'aurora-demo',
            'version' => '1.0.0',
        ], [])->getStatusCode());
        self::assertSame(403, $this->requestWithHeaders('POST', '/admin/default-package', [
            'id' => 'aurora-demo',
            'version' => '1.0.0',
        ], ['X-Migrate-Token' => 'wrong'])->getStatusCode());

        // Missing fields -> 422 ; unpublished version -> 404.
        self::assertSame(422, $this->requestWithHeaders('POST', '/admin/default-package', [
            'id' => 'aurora-demo',
        ], ['X-Migrate-Token' => self::TOKEN])->getStatusCode());
        self::assertSame(404, $this->requestWithHeaders('POST', '/admin/default-package', [
            'id' => 'aurora-demo',
            'version' => '9.9.9',
        ], ['X-Migrate-Token' => self::TOKEN])->getStatusCode());

        // Validation: the setting now beats the "latest published" fallback
        // (2.0.0 is more recent, 1.0.0 is the VALIDATED default).
        $validated = $this->requestWithHeaders('POST', '/admin/default-package', [
            'id' => 'aurora-demo',
            'version' => '1.0.0',
        ], ['X-Migrate-Token' => self::TOKEN]);
        self::assertSame(200, $validated->getStatusCode());
        self::assertSame(
            ['id' => 'aurora-demo', 'version' => '1.0.0'],
            self::body($this->request('GET', '/prompt-packages/default')),
        );

        // The matching proposal was consumed by the validation.
        self::assertNull((new SettingsRepository(Db::get()))->get(SettingsRepository::DEFAULT_PACKAGE_PROPOSAL));

        // Endpoint "does not exist" without MIGRATE_TOKEN configured.
        TestDb::setEnv('MIGRATE_TOKEN', '');
        self::assertSame(404, $this->requestWithHeaders('POST', '/admin/default-package', [
            'id' => 'aurora-demo',
            'version' => '2.0.0',
        ], ['X-Migrate-Token' => self::TOKEN])->getStatusCode());
    }
}
