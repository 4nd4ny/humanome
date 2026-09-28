<?php

declare(strict_types=1);

namespace Humanome\Tests\UseCases\Unit;

use Humanome\Admin\AdminException;
use Humanome\Admin\UserDirectory;
use Humanome\Auth\Session;
use Humanome\Auth\Users;
use Humanome\DbSessionHandler;
use Humanome\Middleware\RequireRole;
use Humanome\MigrationRunner;
use Humanome\Tests\TestDb;
use Humanome\Tests\UseCases\Support\AdmSupport;
use PDO;
use PHPUnit\Framework\Attributes\TestDox;
use PHPUnit\Framework\TestCase;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\RequestHandlerInterface;
use Slim\Psr7\Factory\ResponseFactory;
use Slim\Psr7\Factory\ServerRequestFactory;

/**
 * UC-ADM-01 — Gérer les comptes et les rôles : tests UNITAIRES.
 *
 * Fiche : docs/cas-utilisation/administration/UC-ADM-01-gerer-comptes-roles.md
 *
 * Le code sollicité par les routes de session admin GET /api/admin/users,
 * POST /api/admin/users/{id}/roles et DELETE /api/admin/users/{id}/roles/{role}
 * est appelé directement, sans couche HTTP : UserDirectory (liste, recherche,
 * filtre, pagination, attribution, retrait, anti-verrouillage, audit),
 * Users::rolesOf (rôles relus en base) et le garde RequireRole.
 */
final class UcAdm01GererComptesRolesTest extends TestCase
{
    private static PDO $pdo;

    public static function setUpBeforeClass(): void
    {
        self::$pdo = TestDb::fresh();
        (new MigrationRunner(self::$pdo, MigrationRunner::defaultMigrationsDir()))->run();
    }

    public static function tearDownAfterClass(): void
    {
        TestDb::restoreEnv();
    }

    protected function setUp(): void
    {
        TestDb::overrideEnv();
        self::$pdo->exec('DELETE FROM users');
        self::$pdo->exec('DELETE FROM audit_events');
    }

    protected function tearDown(): void
    {
        if (session_status() === PHP_SESSION_ACTIVE) {
            session_abort();
        }
        session_id('');
        unset($_COOKIE[DbSessionHandler::SESSION_NAME]);
    }

    private static function directory(): UserDirectory
    {
        return new UserDirectory(self::$pdo);
    }

    /** @return list<string> */
    private static function emails(array $page): array
    {
        return array_column($page['users'], 'email');
    }

    #[TestDox('UC-ADM-01-U01 — list : comptes supprimés exclus, tri par id, rôles alphabétiques, date ISO')]
    public function testU01ListExcludesDeletedAndSortsRoles(): void
    {
        $first = AdmSupport::user(self::$pdo, 'zoe@example.org', 'Zoé', ['etablissement', 'apprenant', 'admin']);
        AdmSupport::user(self::$pdo, 'adam@example.org', 'Adam', []);
        $gone = AdmSupport::user(self::$pdo, 'parti@example.org', 'Parti', ['apprenant']);
        self::$pdo->exec('UPDATE users SET deleted_at = NOW() WHERE id = ' . $gone);

        $page = self::directory()->list();

        self::assertSame(2, $page['total']);
        self::assertSame(1, $page['page']);
        self::assertSame(UserDirectory::PAGE_SIZE, $page['pageSize']);
        self::assertSame(['zoe@example.org', 'adam@example.org'], self::emails($page), 'ordre des id, pas alphabétique');
        self::assertSame($first, $page['users'][0]['id']);
        self::assertSame(['admin', 'apprenant', 'etablissement'], $page['users'][0]['roles']);
        self::assertSame([], $page['users'][1]['roles'], 'compte sans rôle : liste vide');
        self::assertMatchesRegularExpression('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/', $page['users'][0]['createdAt']);
        self::assertSame(['id', 'email', 'displayName', 'createdAt', 'roles'], array_keys($page['users'][0]));
    }

    #[TestDox('UC-ADM-01-U02 — list : recherche e-mail OU nom, insensible à la casse, jokers LIKE échappés')]
    public function testU02SearchMatchesEmailOrNameAndEscapesWildcards(): void
    {
        AdmSupport::user(self::$pdo, 'carla.dupond@example.org', 'Carla Dupond');
        AdmSupport::user(self::$pdo, 'bruno@example.org', 'Bruno Martin');
        AdmSupport::user(self::$pdo, 'a_b@example.org', '100% motivé');
        AdmSupport::user(self::$pdo, 'axb@example.org', '100 ans');

        self::assertSame(['carla.dupond@example.org'], self::emails(self::directory()->list('DUPOND')));
        self::assertSame(['bruno@example.org'], self::emails(self::directory()->list('  martin ')), 'nom, espaces rognés');
        // « _ » et « % » sont des caractères littéraux, pas des jokers SQL.
        self::assertSame(['a_b@example.org'], self::emails(self::directory()->list('a_b')));
        self::assertSame(['a_b@example.org'], self::emails(self::directory()->list('100%')));
        self::assertSame(0, self::directory()->list('introuvable')['total']);
    }

    #[TestDox('UC-ADM-01-U03 — list : filtre par rôle porté ; rôle inconnu → liste vide (pas d’erreur)')]
    public function testU03RoleFilter(): void
    {
        AdmSupport::user(self::$pdo, 'alice@example.org', 'Alice', ['epistemiarque', 'apprenant']);
        AdmSupport::user(self::$pdo, 'ada@example.org', 'Ada', ['apprenant']);
        AdmSupport::user(self::$pdo, 'root@example.org', 'Root', ['admin']);

        $epi = self::directory()->list('', 1, 'epistemiarque');
        self::assertSame(['alice@example.org'], self::emails($epi));
        self::assertSame(['apprenant', 'epistemiarque'], $epi['users'][0]['roles'], 'tous les rôles du compte, pas seulement le filtre');
        self::assertSame(2, self::directory()->list('', 1, 'apprenant')['total']);
        self::assertSame(1, self::directory()->list('ada', 1, 'apprenant')['total'], 'recherche ET filtre');
        self::assertSame(0, self::directory()->list('', 1, 'inexistant')['total']);
    }

    #[TestDox('UC-ADM-01-U04 — list : 20 comptes par page, page ≤ 0 ramenée à 1, page au-delà → vide')]
    public function testU04Pagination(): void
    {
        for ($i = 1; $i <= 21; $i++) {
            AdmSupport::user(self::$pdo, sprintf('u%02d@example.org', $i), 'U' . $i);
        }

        $first = self::directory()->list('', 1);
        self::assertCount(20, $first['users']);
        self::assertSame(21, $first['total']);
        $second = self::directory()->list('', 2);
        self::assertSame(['u21@example.org'], self::emails($second));
        self::assertSame(1, self::directory()->list('', 0)['page']);
        self::assertSame(1, self::directory()->list('', -3)['page']);
        $beyond = self::directory()->list('', 9);
        self::assertSame([], $beyond['users']);
        self::assertSame(21, $beyond['total']);
    }

    #[TestDox('UC-ADM-01-U05 — grant : « granted » puis « unchanged », audit seulement au premier (acteur = admin, sans e-mail)')]
    public function testU05GrantIsIdempotentAndAudited(): void
    {
        $admin = AdmSupport::user(self::$pdo, 'root@example.org', 'Root', ['admin']);
        $target = AdmSupport::user(self::$pdo, 'maya@example.org', 'Maya', ['apprenant']);

        self::assertSame(['status' => 'granted'], self::directory()->grant($admin, $target, 'cartographe'));
        self::assertSame(['status' => 'unchanged'], self::directory()->grant($admin, $target, 'cartographe'));

        self::assertSame(['apprenant', 'cartographe'], Users::rolesOf(self::$pdo, $target));
        self::assertSame(1, AdmSupport::countAudit(self::$pdo, 'role_granted'), 'pas d’audit pour un « unchanged »');
        $audit = AdmSupport::lastAudit(self::$pdo, 'role_granted');
        self::assertSame($admin, $audit['userId']);
        self::assertEquals(['targetUserId' => $target, 'role' => 'cartographe', 'status' => 'granted'], $audit['details']);
        self::assertStringNotContainsString('maya@example.org', $audit['raw']);
    }

    #[TestDox('UC-ADM-01-U06 — grant : rôle inconnu ou « visiteur » → 422 (avant le compte) ; compte inconnu ou supprimé → 404')]
    public function testU06GrantValidation(): void
    {
        $admin = AdmSupport::user(self::$pdo, 'root@example.org', 'Root', ['admin']);
        $target = AdmSupport::user(self::$pdo, 'maya@example.org', 'Maya');

        foreach (['superadmin', 'visiteur', ''] as $role) {
            try {
                self::directory()->grant($admin, 999_999, $role);
                self::fail('rôle ' . $role . ' accepté');
            } catch (AdminException $e) {
                self::assertSame(422, $e->getStatusCode(), $role . ' : le rôle est vérifié avant le compte');
                self::assertStringContainsString('Rôle inconnu', $e->getMessage());
            }
        }

        self::$pdo->exec('UPDATE users SET deleted_at = NOW() WHERE id = ' . $target);
        foreach ([999_999, $target] as $id) {
            try {
                self::directory()->grant($admin, $id, 'cartographe');
                self::fail('compte ' . $id . ' accepté');
            } catch (AdminException $e) {
                self::assertSame(404, $e->getStatusCode());
                self::assertSame('Compte introuvable', $e->getMessage());
            }
        }
        self::assertSame(0, AdmSupport::countAudit(self::$pdo, 'role_granted'));
    }

    #[TestDox('UC-ADM-01-U07 — revoke : « revoked » puis « unchanged », audit role_revoked seulement au premier')]
    public function testU07RevokeIsIdempotentAndAudited(): void
    {
        $admin = AdmSupport::user(self::$pdo, 'root@example.org', 'Root', ['admin']);
        $target = AdmSupport::user(self::$pdo, 'maya@example.org', 'Maya', ['apprenant', 'cartographe']);

        self::assertSame(['status' => 'revoked'], self::directory()->revoke($admin, $target, 'cartographe'));
        self::assertSame(['status' => 'unchanged'], self::directory()->revoke($admin, $target, 'cartographe'));

        self::assertSame(['apprenant'], Users::rolesOf(self::$pdo, $target));
        self::assertSame(1, AdmSupport::countAudit(self::$pdo, 'role_revoked'));
        $audit = AdmSupport::lastAudit(self::$pdo, 'role_revoked');
        self::assertSame($admin, $audit['userId']);
        self::assertEquals(['targetUserId' => $target, 'role' => 'cartographe', 'status' => 'revoked'], $audit['details']);
    }

    #[TestDox('UC-ADM-01-U08 — revoke : anti-verrouillage (propre rôle admin → 409) ; autre admin et propre rôle non-admin autorisés')]
    public function testU08RevokeAntiLockout(): void
    {
        $admin = AdmSupport::user(self::$pdo, 'root@example.org', 'Root', ['admin', 'promptologue']);
        $other = AdmSupport::user(self::$pdo, 'root2@example.org', 'Root 2', ['admin']);

        try {
            self::directory()->revoke($admin, $admin, 'admin');
            self::fail('auto-retrait du rôle admin accepté');
        } catch (AdminException $e) {
            self::assertSame(409, $e->getStatusCode());
            self::assertStringContainsString('anti-verrouillage', $e->getMessage());
        }
        self::assertContains('admin', Users::rolesOf(self::$pdo, $admin), 'le rôle a survécu');

        self::assertSame(['status' => 'revoked'], self::directory()->revoke($admin, $other, 'admin'));
        self::assertSame(['status' => 'revoked'], self::directory()->revoke($admin, $admin, 'promptologue'));
        self::assertSame(['admin'], Users::rolesOf(self::$pdo, $admin));

        // Rôle inconnu : 422 avant toute autre règle (même sur soi-même).
        try {
            self::directory()->revoke($admin, $admin, 'root');
            self::fail('rôle inconnu accepté');
        } catch (AdminException $e) {
            self::assertSame(422, $e->getStatusCode());
        }
    }

    #[TestDox('UC-ADM-01-U09 — Users::rolesOf relit la base : attribution et retrait visibles immédiatement')]
    public function testU09RolesOfReflectsTheDatabaseImmediately(): void
    {
        $admin = AdmSupport::user(self::$pdo, 'root@example.org', 'Root', ['admin']);
        $target = AdmSupport::user(self::$pdo, 'maya@example.org', 'Maya', ['apprenant']);

        self::assertSame(['apprenant'], Users::rolesOf(self::$pdo, $target));
        self::directory()->grant($admin, $target, 'etablissement');
        self::directory()->grant($admin, $target, 'admin');
        self::assertSame(['admin', 'apprenant', 'etablissement'], Users::rolesOf(self::$pdo, $target), 'rôles cumulables');
        self::directory()->revoke($admin, $target, 'apprenant');
        self::assertSame(['admin', 'etablissement'], Users::rolesOf(self::$pdo, $target));
    }

    #[TestDox('UC-ADM-01-U10 — RequireRole::any(admin) : 401 sans session, 403 sans rôle, passe avec userId/roles, relit les rôles à chaque requête')]
    public function testU10RequireRoleGuard(): void
    {
        $guard = RequireRole::any('admin');
        $handler = new class () implements RequestHandlerInterface {
            public ?ServerRequestInterface $seen = null;

            public function handle(ServerRequestInterface $request): ResponseInterface
            {
                $this->seen = $request;

                return (new ResponseFactory())->createResponse(200);
            }
        };
        $request = (new ServerRequestFactory())->createServerRequest('GET', '/api/admin/users');

        // Visiteur : aucune session, aucun cookie.
        $anonymous = $guard->process($request, $handler);
        self::assertSame(401, $anonymous->getStatusCode());
        self::assertSame(['error' => 'Authentification requise'], json_decode((string) $anonymous->getBody(), true));
        self::assertNull($handler->seen);

        $userId = AdmSupport::user(self::$pdo, 'root@example.org', 'Root', ['admin', 'apprenant']);
        Session::openForUser($userId);

        $ok = $guard->process($request, $handler);
        self::assertSame(200, $ok->getStatusCode());
        self::assertSame($userId, $handler->seen?->getAttribute('userId'));
        self::assertSame(['admin', 'apprenant'], $handler->seen?->getAttribute('roles'));

        // Rôle retiré en base : la même session est refusée à la requête suivante.
        self::$pdo->exec('DELETE FROM user_roles WHERE user_id = ' . $userId
            . " AND role_id = (SELECT id FROM roles WHERE name = 'admin')");
        $handler->seen = null;
        $denied = $guard->process($request, $handler);
        self::assertSame(403, $denied->getStatusCode());
        self::assertSame(['error' => 'Rôle insuffisant'], json_decode((string) $denied->getBody(), true));
        self::assertNull($handler->seen);
    }

    #[TestDox('UC-ADM-01-U11 — RequireRole::any() sans rôle est une erreur de programmation')]
    public function testU11RequireRoleNeedsAtLeastOneRole(): void
    {
        $this->expectException(\InvalidArgumentException::class);
        RequireRole::any();
    }

    /**
     * COMPORTEMENT ACTUEL figé (fiche, « Anomalies constatées », AN-1) : le nom
     * de rôle est résolu par `roles.name = ?` sous la collation
     * utf8mb4_unicode_ci, donc SANS tenir compte de la casse, alors que la
     * règle d'anti-verrouillage compare `$role === 'admin'` à la lettre.
     * Appelée directement, la classe laisse donc un admin retirer son propre
     * rôle avec « ADMIN ». Par HTTP, le motif de route {role:[a-z]+} du DELETE
     * ferme ce chemin ; seul l'écho non normalisé (« Admin ») subsiste côté
     * POST (réponse + audit). À corriger en normalisant le rôle (strtolower)
     * ou en comparant l'identifiant de rôle — ce test devra alors être inversé.
     */
    #[TestDox('UC-ADM-01-U12 — (anomalie AN-1, comportement actuel) rôle résolu sans la casse ; revoke("ADMIN") contourne l’anti-verrouillage de la classe')]
    public function testU12RoleNameIsCaseInsensitiveCurrentBehaviour(): void
    {
        $admin = AdmSupport::user(self::$pdo, 'root@example.org', 'Root', ['admin']);
        $target = AdmSupport::user(self::$pdo, 'maya@example.org', 'Maya', ['apprenant']);

        self::assertSame(['status' => 'granted'], self::directory()->grant($admin, $target, 'Cartographe'));
        self::assertSame(['apprenant', 'cartographe'], Users::rolesOf(self::$pdo, $target));
        self::assertSame('Cartographe', AdmSupport::lastAudit(self::$pdo, 'role_granted')['details']['role'], 'écho non normalisé');

        self::assertSame(['status' => 'revoked'], self::directory()->revoke($admin, $admin, 'ADMIN'));
        self::assertSame([], Users::rolesOf(self::$pdo, $admin), 'anti-verrouillage contourné au niveau de la classe');
    }
}
