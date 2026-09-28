<?php

declare(strict_types=1);

namespace Humanome\Tests\UseCases\Functional;

use Humanome\Tests\AdminTestCase;
use Humanome\Tests\UseCases\Support\AdmSupport;
use PHPUnit\Framework\Attributes\TestDox;

/**
 * UC-ADM-01 — Gérer les comptes et les rôles : tests FONCTIONNELS (API).
 *
 * Fiche : docs/cas-utilisation/administration/UC-ADM-01-gerer-comptes-roles.md
 *
 * Chaque test rejoue un scénario de la fiche à travers l'API HTTP (application
 * Slim en processus, vraie base MySQL) avec de vrais navigateurs simulés :
 * l'administrateur et les comptes cibles ont chacun leur cookie de session et
 * leur jeton CSRF (AdminTestCase::as_). Les effets sont observés du point de
 * vue du compte cible (accès accordé ou retiré à sa requête suivante).
 */
final class UcAdm01GererComptesRolesTest extends AdminTestCase
{
    /** @var array{id: int, csrf: string, sid: string} */
    private array $admin;

    protected function setUp(): void
    {
        parent::setUp();
        $this->admin = $this->registerAdmin('root@example.org');
    }

    private function grant(int $userId, mixed $role): \Psr\Http\Message\ResponseInterface
    {
        return $this->as_($this->admin, 'POST', "/api/admin/users/{$userId}/roles", ['role' => $role]);
    }

    private function revoke(int $userId, string $role): \Psr\Http\Message\ResponseInterface
    {
        return $this->as_($this->admin, 'DELETE', "/api/admin/users/{$userId}/roles/{$role}");
    }

    #[TestDox('UC-ADM-01-F01 — nominal : l’admin liste, recherche, attribue « cartographe » ; effet dès la requête suivante de la cible')]
    public function testF01NominalListSearchGrant(): void
    {
        $maya = $this->registerAs('maya@example.org', 'Maya', ['apprenant']);
        $this->registerAs('bruno@example.org', 'Bruno', ['apprenant']);

        $all = $this->as_($this->admin, 'GET', '/api/admin/users');
        self::assertSame(200, $all->getStatusCode());
        self::assertSame(3, self::json($all)['total']);

        $found = self::json($this->as_($this->admin, 'GET', '/api/admin/users?query=maya'));
        self::assertSame(1, $found['total']);
        self::assertSame(['apprenant'], $found['users'][0]['roles']);
        self::assertSame($maya['id'], $found['users'][0]['id']);

        // Avant : la cible n'a pas accès à l'espace cartographe.
        self::assertSame(403, $this->as_($maya, 'GET', '/api/cartographe/cartographies')->getStatusCode());

        $granted = $this->grant($maya['id'], 'cartographe');
        self::assertSame(200, $granted->getStatusCode());
        self::assertSame(['id' => $maya['id'], 'role' => 'cartographe', 'status' => 'granted'], self::json($granted));

        // Sans reconnexion : les rôles sont relus à chaque requête.
        self::assertSame(200, $this->as_($maya, 'GET', '/api/cartographe/cartographies')->getStatusCode());
        $me = self::json($this->as_($maya, 'GET', '/api/auth/me'));
        self::assertSame(['apprenant', 'cartographe'], $me['user']['roles']);

        $audit = self::lastAudit('role_granted');
        self::assertSame($this->admin['id'], $audit['userId'], 'acteur = l’administrateur de la session');
        self::assertEquals(['targetUserId' => $maya['id'], 'role' => 'cartographe', 'status' => 'granted'], $audit['details']);
    }

    #[TestDox('UC-ADM-01-F02 — nominal (retrait) : l’admin retire un rôle, la cible perd l’accès immédiatement ; audit role_revoked')]
    public function testF02NominalRevoke(): void
    {
        $camille = $this->registerAs('camille@example.org', 'Camille', ['apprenant', 'cartographe']);
        self::assertSame(200, $this->as_($camille, 'GET', '/api/cartographe/cartographies')->getStatusCode());

        $revoked = $this->revoke($camille['id'], 'cartographe');
        self::assertSame(200, $revoked->getStatusCode());
        self::assertSame(['id' => $camille['id'], 'role' => 'cartographe', 'status' => 'revoked'], self::json($revoked));

        self::assertSame(403, $this->as_($camille, 'GET', '/api/cartographe/cartographies')->getStatusCode());
        self::assertSame(200, $this->as_($camille, 'GET', '/api/cartographies')->getStatusCode(), 'les autres rôles restent');

        $audit = self::lastAudit('role_revoked');
        self::assertSame($this->admin['id'], $audit['userId']);
        self::assertStringNotContainsString('camille@example.org', (string) json_encode($audit['details']));
    }

    #[TestDox('UC-ADM-01-F03 — A1 : ré-attribuer ou re-retirer est idempotent (« unchanged »), sans nouvel audit')]
    public function testF03IdempotentGrantAndRevoke(): void
    {
        $maya = $this->registerAs('maya@example.org', 'Maya', ['apprenant']);

        self::assertSame('unchanged', self::json($this->grant($maya['id'], 'apprenant'))['status']);
        self::assertSame(0, AdmSupport::countAudit(self::$pdo, 'role_granted'));

        self::assertSame('unchanged', self::json($this->revoke($maya['id'], 'promptologue'))['status']);
        self::assertSame(0, AdmSupport::countAudit(self::$pdo, 'role_revoked'));
    }

    #[TestDox('UC-ADM-01-F04 — A2/A3 : filtre ?role= combiné à la recherche, et pagination par 20')]
    public function testF04RoleFilterAndPagination(): void
    {
        $alice = $this->registerAs('alice@example.org', 'Alice', ['epistemiarque']);
        $pdo = self::$pdo;
        for ($i = 1; $i <= 24; $i++) {
            AdmSupport::user($pdo, sprintf('lot%02d@example.org', $i), 'Lot ' . $i, ['apprenant']);
        }

        $epi = self::json($this->as_($this->admin, 'GET', '/api/admin/users?role=epistemiarque'));
        self::assertSame(1, $epi['total']);
        self::assertSame($alice['id'], $epi['users'][0]['id']);
        self::assertSame(0, self::json($this->as_($this->admin, 'GET', '/api/admin/users?role=epistemiarque&query=lot'))['total']);
        self::assertSame(0, self::json($this->as_($this->admin, 'GET', '/api/admin/users?role=inexistant'))['total']);

        $page1 = self::json($this->as_($this->admin, 'GET', '/api/admin/users'));
        self::assertSame(26, $page1['total']);
        self::assertCount(20, $page1['users']);
        $page2 = self::json($this->as_($this->admin, 'GET', '/api/admin/users?page=2'));
        self::assertCount(6, $page2['users']);
        self::assertSame(2, $page2['page']);
        self::assertSame([], array_intersect(array_column($page1['users'], 'id'), array_column($page2['users'], 'id')));
    }

    #[TestDox('UC-ADM-01-F05 — A4 : l’admin retire le rôle admin d’un AUTRE admin (effet immédiat) et un de ses propres rôles non-admin')]
    public function testF05RevokeOtherAdminAndOwnNonAdminRole(): void
    {
        $other = $this->registerAs('root2@example.org', 'Second Admin', ['admin']);
        self::assertSame(200, $this->as_($other, 'GET', '/api/admin/users')->getStatusCode());

        self::assertSame('revoked', self::json($this->revoke($other['id'], 'admin'))['status']);
        self::assertSame(403, $this->as_($other, 'GET', '/api/admin/users')->getStatusCode(), 'plus admin, dès la requête suivante');

        self::setRoles($this->admin['id'], ['admin', 'promptologue']);
        self::assertSame('revoked', self::json($this->revoke($this->admin['id'], 'promptologue'))['status']);
        self::assertSame(200, $this->as_($this->admin, 'GET', '/api/admin/users')->getStatusCode());
    }

    #[TestDox('UC-ADM-01-F06 — A5 : admin n’est pas un super-rôle ; il s’attribue « etablissement » (rôles cumulables) pour accéder à cet espace')]
    public function testF06AdminIsNotASuperRole(): void
    {
        self::assertSame(403, $this->as_($this->admin, 'GET', '/api/etablissement/cohortes')->getStatusCode());
        self::assertSame(403, $this->as_($this->admin, 'GET', '/api/cartographies')->getStatusCode());

        self::assertSame('granted', self::json($this->grant($this->admin['id'], 'etablissement'))['status']);

        self::assertSame(200, $this->as_($this->admin, 'GET', '/api/etablissement/cohortes')->getStatusCode());
        $me = self::json($this->as_($this->admin, 'GET', '/api/auth/me'));
        self::assertSame(['admin', 'etablissement'], $me['user']['roles']);
    }

    #[TestDox('UC-ADM-01-F07 — E1/E2 : visiteur → 401, compte sans rôle admin → 403 sur les trois routes, aucune mutation')]
    public function testF07VisitorAndNonAdminAreRefused(): void
    {
        $maya = $this->registerAs('maya@example.org', 'Maya', ['apprenant', 'cartographe', 'promptologue', 'epistemiarque', 'etablissement', 'employeur']);

        $this->cookieSid = null;
        self::assertSame(401, $this->request('GET', '/api/admin/users')->getStatusCode());
        self::assertSame(401, $this->request('POST', "/api/admin/users/{$maya['id']}/roles", ['role' => 'admin'])->getStatusCode());
        self::assertSame(401, $this->request('DELETE', "/api/admin/users/{$this->admin['id']}/roles/admin")->getStatusCode());

        // Six rôles, mais pas « admin » : refus.
        self::assertSame(403, $this->as_($maya, 'GET', '/api/admin/users')->getStatusCode());
        self::assertSame(403, $this->as_($maya, 'POST', "/api/admin/users/{$maya['id']}/roles", ['role' => 'admin'])->getStatusCode());
        self::assertSame(403, $this->as_($maya, 'DELETE', "/api/admin/users/{$this->admin['id']}/roles/admin")->getStatusCode());

        self::assertNotContains('admin', self::json($this->as_($maya, 'GET', '/api/auth/me'))['user']['roles']);
        self::assertSame(200, $this->as_($this->admin, 'GET', '/api/admin/users')->getStatusCode(), 'l’admin est intact');
    }

    #[TestDox('UC-ADM-01-F08 — E3 : rôle inconnu, « visiteur », champ absent ou non-chaîne → 422 ; rôle hors motif dans l’URL → 404 du routeur')]
    public function testF08InvalidRoleIsRejected(): void
    {
        $maya = $this->registerAs('maya@example.org', 'Maya', ['apprenant']);

        foreach (['superadmin', 'visiteur', '', '   ', 42, null] as $role) {
            $response = $this->grant($maya['id'], $role);
            self::assertSame(422, $response->getStatusCode(), var_export($role, true));
        }
        self::assertSame(422, $this->as_($this->admin, 'POST', "/api/admin/users/{$maya['id']}/roles", [])->getStatusCode());
        self::assertSame(422, $this->revoke($maya['id'], 'superadmin')->getStatusCode());
        self::assertSame(404, $this->revoke($maya['id'], 'Admin')->getStatusCode(), 'motif {role:[a-z]+}');
        self::assertSame(['apprenant'], self::json($this->as_($maya, 'GET', '/api/auth/me'))['user']['roles']);
    }

    #[TestDox('UC-ADM-01-F09 — E4 : compte inconnu ou supprimé → 404 « Compte introuvable » (attribution et retrait)')]
    public function testF09UnknownOrDeletedAccount(): void
    {
        $gone = $this->registerAs('gone@example.org', 'Parti', ['apprenant']);
        self::$pdo->exec('UPDATE users SET deleted_at = NOW() WHERE id = ' . $gone['id']);

        foreach ([999_999, $gone['id']] as $id) {
            $grant = $this->grant($id, 'cartographe');
            self::assertSame(404, $grant->getStatusCode());
            self::assertSame(['error' => 'Compte introuvable'], self::json($grant));
            self::assertSame(404, $this->revoke($id, 'apprenant')->getStatusCode());
        }
        self::assertSame(0, self::json($this->as_($this->admin, 'GET', '/api/admin/users?query=gone'))['total']);
    }

    #[TestDox('UC-ADM-01-F10 — E5 : anti-verrouillage — retirer son propre rôle admin → 409, le rôle est conservé')]
    public function testF10AntiLockout(): void
    {
        $response = $this->revoke($this->admin['id'], 'admin');

        self::assertSame(409, $response->getStatusCode());
        self::assertStringContainsString('anti-verrouillage', self::json($response)['error']);
        self::assertSame(200, $this->as_($this->admin, 'GET', '/api/admin/users')->getStatusCode());
        self::assertSame(0, AdmSupport::countAudit(self::$pdo, 'role_revoked'));
    }

    #[TestDox('UC-ADM-01-F11 — E6 : session admin sans X-CSRF-Token → 403, aucun rôle attribué ni retiré')]
    public function testF11MutationWithoutCsrfToken(): void
    {
        $maya = $this->registerAs('maya@example.org', 'Maya', ['apprenant']);

        $this->cookieSid = $this->admin['sid'];
        $post = $this->request('POST', "/api/admin/users/{$maya['id']}/roles", ['role' => 'cartographe']);
        self::assertSame(403, $post->getStatusCode());
        self::assertSame(['error' => 'Jeton CSRF absent ou invalide'], self::json($post));

        $this->cookieSid = $this->admin['sid'];
        $delete = $this->request('DELETE', "/api/admin/users/{$maya['id']}/roles/apprenant", null, ['X-CSRF-Token' => 'faux']);
        self::assertSame(403, $delete->getStatusCode());

        self::assertSame(['apprenant'], self::json($this->as_($maya, 'GET', '/api/auth/me'))['user']['roles']);
        self::assertSame(0, AdmSupport::countAudit(self::$pdo, 'role_granted'));
    }

    /**
     * COMPORTEMENT ACTUEL figé — anomalie AN-1 de la fiche : le rôle n'est pas
     * normalisé ; « CARTOGRAPHE » est accepté (collation insensible à la
     * casse), le bon rôle est posé, mais la réponse et l'audit gardent la
     * graphie envoyée.
     */
    #[TestDox('UC-ADM-01-F12 — (anomalie AN-1, comportement actuel) POST {role: "CARTOGRAPHE"} attribue « cartographe » mais renvoie et journalise la graphie reçue')]
    public function testF12UppercaseRoleCurrentBehaviour(): void
    {
        $maya = $this->registerAs('maya@example.org', 'Maya', ['apprenant']);

        $response = $this->grant($maya['id'], 'CARTOGRAPHE');

        self::assertSame(200, $response->getStatusCode());
        self::assertSame(['id' => $maya['id'], 'role' => 'CARTOGRAPHE', 'status' => 'granted'], self::json($response));
        self::assertSame(['apprenant', 'cartographe'], self::json($this->as_($maya, 'GET', '/api/auth/me'))['user']['roles']);
        self::assertSame('CARTOGRAPHE', self::lastAudit('role_granted')['details']['role']);
    }
}
