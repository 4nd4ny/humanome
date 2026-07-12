<?php

declare(strict_types=1);

namespace Humanome\Tests;

use Humanome\Db;

/**
 * P12.1 admin SESSION API — roles section (GET /admin/users, grant/revoke).
 * Distinct from AdminRolesTest, which covers the pre-P12 deploy-token
 * /admin/grant-role. Guarded by RequireRole::any('admin'); every mutation
 * rides the global CSRF middleware (verified through the as_ helper).
 */
final class AdminUsersTest extends AdminTestCase
{
    public function testRoleGuard(): void
    {
        // Visitor (no session): 401.
        $this->cookieSid = null;
        self::assertSame(401, $this->request('GET', '/api/admin/users')->getStatusCode());

        // Learner (no admin role): 403.
        $learner = $this->registerAs('eleve@example.org', 'Élève', ['apprenant']);
        self::assertSame(403, $this->as_($learner, 'GET', '/api/admin/users')->getStatusCode());
        self::assertSame(
            403,
            $this->as_($learner, 'POST', "/api/admin/users/{$learner['id']}/roles", ['role' => 'cartographe'])->getStatusCode(),
        );
    }

    public function testListSearchAndPagination(): void
    {
        $admin = $this->registerAdmin();
        $this->registerAs('bruno.martin@example.org', 'Bruno Martin', ['apprenant']);
        $this->registerAs('carla.dupond@example.org', 'Carla Dupond', ['cartographe']);

        // Full list (admin + 2).
        $all = self::json($this->as_($admin, 'GET', '/api/admin/users'));
        self::assertSame(3, $all['total']);
        self::assertSame(20, $all['pageSize']);

        // Search by email fragment.
        $byEmail = self::json($this->as_($admin, 'GET', '/api/admin/users?query=carla.dupond'));
        self::assertSame(1, $byEmail['total']);
        self::assertSame('carla.dupond@example.org', $byEmail['users'][0]['email']);
        self::assertSame(['cartographe'], $byEmail['users'][0]['roles']);

        // Search by display name fragment (case-insensitive).
        $byName = self::json($this->as_($admin, 'GET', '/api/admin/users?query=bruno'));
        self::assertSame(1, $byName['total']);
        self::assertSame('Bruno Martin', $byName['users'][0]['displayName']);

        // Second page is empty (only 3 users, page size 20).
        $page2 = self::json($this->as_($admin, 'GET', '/api/admin/users?page=2'));
        self::assertSame(3, $page2['total']);
        self::assertSame([], $page2['users']);
    }

    public function testDeletedAccountsExcluded(): void
    {
        $admin = $this->registerAdmin();
        $victim = $this->registerAs('gone@example.org', 'Parti', ['apprenant']);
        Db::get()->exec("UPDATE users SET deleted_at = NOW() WHERE id = {$victim['id']}");

        $list = self::json($this->as_($admin, 'GET', '/api/admin/users?query=gone'));
        self::assertSame(0, $list['total']);
    }

    public function testGrantIsEffectiveImmediatelyAndIdempotent(): void
    {
        $admin = $this->registerAdmin();
        $target = $this->registerAs('user@example.org', 'Utilisateur', ['apprenant']);

        // Before: the target cannot reach the establishment surface.
        self::assertSame(403, $this->as_($target, 'GET', '/api/etablissement/cohortes')->getStatusCode());

        $granted = $this->as_($admin, 'POST', "/api/admin/users/{$target['id']}/roles", ['role' => 'etablissement']);
        self::assertSame(200, $granted->getStatusCode());
        self::assertSame('granted', self::json($granted)['status']);

        // Effective on the target's very next request (roles re-read per request).
        self::assertSame(200, $this->as_($target, 'GET', '/api/etablissement/cohortes')->getStatusCode());

        // Idempotent re-grant.
        self::assertSame('unchanged', self::json(
            $this->as_($admin, 'POST', "/api/admin/users/{$target['id']}/roles", ['role' => 'etablissement']),
        )['status']);
    }

    public function testGrantValidation(): void
    {
        $admin = $this->registerAdmin();
        $target = $this->registerAs('user@example.org', 'Utilisateur', ['apprenant']);

        // Unknown role (and "visiteur", the absence of a session, is not grantable).
        self::assertSame(422, $this->as_($admin, 'POST', "/api/admin/users/{$target['id']}/roles", ['role' => 'superadmin'])->getStatusCode());
        self::assertSame(422, $this->as_($admin, 'POST', "/api/admin/users/{$target['id']}/roles", ['role' => 'visiteur'])->getStatusCode());
        self::assertSame(422, $this->as_($admin, 'POST', "/api/admin/users/{$target['id']}/roles", [])->getStatusCode());

        // Unknown / deleted account: 404.
        self::assertSame(404, $this->as_($admin, 'POST', '/api/admin/users/999999/roles', ['role' => 'cartographe'])->getStatusCode());
    }

    public function testRevoke(): void
    {
        $admin = $this->registerAdmin();
        $target = $this->registerAs('user@example.org', 'Utilisateur', ['apprenant', 'cartographe']);

        $revoked = $this->as_($admin, 'DELETE', "/api/admin/users/{$target['id']}/roles/cartographe");
        self::assertSame(200, $revoked->getStatusCode());
        self::assertSame('revoked', self::json($revoked)['status']);

        // The target lost the cartographe surface.
        self::assertSame(403, $this->as_($target, 'GET', '/api/cartographe/cartographies')->getStatusCode());

        // Re-revoke: unchanged (idempotent).
        self::assertSame('unchanged', self::json(
            $this->as_($admin, 'DELETE', "/api/admin/users/{$target['id']}/roles/cartographe"),
        )['status']);
    }

    public function testAntiLockoutOnOwnAdminRole(): void
    {
        $admin = $this->registerAdmin();
        $other = $this->registerAs('admin2@example.org', 'Second Admin', ['admin']);

        // An admin cannot remove their OWN admin role: 409.
        $self = $this->as_($admin, 'DELETE', "/api/admin/users/{$admin['id']}/roles/admin");
        self::assertSame(409, $self->getStatusCode());
        self::assertStringContainsString('anti', strtolower((string) $self->getBody()));

        // The role survived.
        self::assertSame(200, $this->as_($admin, 'GET', '/api/admin/users')->getStatusCode());

        // An admin CAN revoke another admin's admin role.
        self::assertSame(
            200,
            $this->as_($admin, 'DELETE', "/api/admin/users/{$other['id']}/roles/admin")->getStatusCode(),
        );
        // ...and may drop a NON-admin role from themselves.
        self::setRoles($admin['id'], ['admin', 'promptologue']);
        self::assertSame(
            'revoked',
            self::json($this->as_($admin, 'DELETE', "/api/admin/users/{$admin['id']}/roles/promptologue"))['status'],
        );
    }

    public function testGrantAndRevokeAreAudited(): void
    {
        $admin = $this->registerAdmin();
        $target = $this->registerAs('user@example.org', 'Utilisateur Cible', ['apprenant']);

        $this->as_($admin, 'POST', "/api/admin/users/{$target['id']}/roles", ['role' => 'cartographe']);
        $grant = self::lastAudit('role_granted');
        self::assertNotNull($grant);
        // Session action: the ACTING admin is the actor (unlike the deploy-token tooling).
        self::assertSame($admin['id'], $grant['userId']);
        // assertEquals (not assertSame): MySQL JSON columns reorder object keys.
        self::assertEquals(
            ['targetUserId' => $target['id'], 'role' => 'cartographe', 'status' => 'granted'],
            $grant['details'],
        );
        // §6.5: ids + whitelisted role only, never the email.
        self::assertStringNotContainsStringIgnoringCase('user@example.org', json_encode($grant['details']));

        $this->as_($admin, 'DELETE', "/api/admin/users/{$target['id']}/roles/cartographe");
        $revoke = self::lastAudit('role_revoked');
        self::assertNotNull($revoke);
        self::assertSame($admin['id'], $revoke['userId']);
        self::assertSame('revoked', $revoke['details']['status']);
    }
}
