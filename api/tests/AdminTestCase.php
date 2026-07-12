<?php

declare(strict_types=1);

namespace Humanome\Tests;

use Humanome\Db;
use Humanome\Packages\PromptPackageRepository;

/**
 * Shared plumbing for the P12.1 admin SESSION API tests (routes/admin.php,
 * RequireRole::any('admin')). Real browser simulation (session cookie + CSRF)
 * inherited from CartographeTestCase; here we also wipe the prompt-package /
 * settings / golden tables between tests and offer package fixtures.
 */
abstract class AdminTestCase extends CartographeTestCase
{
    protected const PUBLIC_ID = 'aurora-demo';
    protected const PUBLIC_VERSION = '1.0.0';
    protected const GOLDEN_ID = 'golden-reference';

    protected function setUp(): void
    {
        parent::setUp(); // wipes users (+ cascades) and audit_events
        $pdo = Db::get();
        $pdo->exec('DELETE FROM prompt_packages'); // versions + golden_grants cascade
        $pdo->exec('DELETE FROM settings');
    }

    /** Register an admin account and return the acting identity. */
    protected function registerAdmin(string $email = 'admin@example.org'): array
    {
        return $this->registerAs($email, 'Root Admin', ['admin']);
    }

    /** The schema-valid fixture prompt-package document, with overrides. */
    protected static function packageDoc(array $overrides = []): array
    {
        $path = \dirname(__DIR__, 2) . '/schemas/fixtures/prompt-package-exemple.json';
        $doc = json_decode((string) file_get_contents($path), true, 512, JSON_THROW_ON_ERROR);

        return array_merge($doc, $overrides);
    }

    /** Import the fixture as a PUBLIC published package (aurora-demo 1.0.0). */
    protected static function importPublicPackage(?array $doc = null): void
    {
        (new PromptPackageRepository(Db::get()))->importPublishedDocument($doc ?? self::packageDoc());
    }

    /** A Golden document = fixture re-slugged, ready for POST /admin/golden. */
    protected static function goldenDoc(array $overrides = []): array
    {
        return self::packageDoc(array_merge([
            'id' => self::GOLDEN_ID,
            'description' => 'Golden Prompt de référence (privé).',
        ], $overrides));
    }
}
