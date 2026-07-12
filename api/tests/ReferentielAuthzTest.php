<?php

declare(strict_types=1);

namespace Humanome\Tests;

use Humanome\Db;
use PHPUnit\Framework\Attributes\DataProvider;

/**
 * Authorization coverage of the referentiel WRITE routes (angle: privilege
 * escalation / "is the role guard on EVERY mutating epistemiarque route?").
 *
 * Regression lock for the RoleGuard wiring: the route file used to select its
 * guard through a class_exists() probe on a FQCN that never ships
 * (\Humanome\Auth\RequireRole), leaving RoleGuard the only guard that actually
 * runs. These tests pin every mutating endpoint to 401 (anonymous) / 403
 * (authenticated non-epistemiarque), so dropping ->add($epistemiarque) — or the
 * guard itself — fails here instead of silently opening the write API.
 */
final class ReferentielAuthzTest extends ReferentielTestCase
{
    /** @return array<string, array{0: string, 1: string, 2: array<string, mixed>|null}> */
    public static function mutatingRoutes(): array
    {
        return [
            'create draft' => ['POST', '/referentiel/drafts', ['from' => '7.0.0', 'semver' => '7.1.0']],
            'update draft' => ['PUT', '/referentiel/drafts/1', null],
            'publish draft' => ['POST', '/referentiel/drafts/1/publish', null],
        ];
    }

    /** @param array<string, mixed>|null $body */
    #[DataProvider('mutatingRoutes')]
    public function testWriteRouteRejectsAnonymousVisitor(string $method, string $path, ?array $body): void
    {
        self::importRespire();

        $response = $this->request($method, $path, $body);

        self::assertSame(401, $response->getStatusCode(), "$method $path must require a session");
    }

    /** @param array<string, mixed>|null $body */
    #[DataProvider('mutatingRoutes')]
    public function testWriteRouteRejectsAuthenticatedNonEpistemiarque(string $method, string $path, ?array $body): void
    {
        self::importRespire();
        // A user holding several non-epistemiarque roles must still be refused.
        self::loginAs(self::createUser('apprenant', 'cartographe', 'employeur'));

        $response = $this->request($method, $path, $body);

        self::assertSame(403, $response->getStatusCode(), "$method $path must reject a non-epistemiarque");
    }

    public function testEpistemiarqueRoleUnlocksTheWriteApi(): void
    {
        self::importRespire();
        self::loginAs(self::createUser('epistemiarque'));

        $response = $this->request('POST', '/referentiel/drafts', ['from' => '7.0.0', 'semver' => '7.1.0']);

        self::assertSame(201, $response->getStatusCode());
    }

    public function testAdminRoleAlsoUnlocksTheWriteApi(): void
    {
        self::importRespire();
        self::loginAs(self::createUser('admin'));

        $response = $this->request('POST', '/referentiel/drafts', ['from' => '7.0.0', 'semver' => '7.2.0']);

        self::assertSame(201, $response->getStatusCode());
    }

    /**
     * The draft author is captured from the authenticated session, never from
     * client input: created_by must equal the logged-in user id, so a caller
     * cannot forge authorship of a referentiel version.
     */
    public function testDraftAuthorIsCapturedFromTheSessionNotFromInput(): void
    {
        self::importRespire();
        $userId = self::createUser('epistemiarque');
        self::loginAs($userId);

        // Attempt to spoof authorship via the request body — must be ignored.
        $created = self::body($this->request('POST', '/referentiel/drafts', [
            'from' => '7.0.0',
            'semver' => '7.1.0',
            'createdBy' => 999999,
            'created_by' => 999999,
        ]));

        $stmt = Db::get()->prepare('SELECT created_by FROM referentiel_versions WHERE id = ?');
        $stmt->execute([$created['id']]);
        self::assertSame($userId, (int) $stmt->fetchColumn());
    }
}
