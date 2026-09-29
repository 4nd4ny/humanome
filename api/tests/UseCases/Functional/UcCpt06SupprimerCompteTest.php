<?php

declare(strict_types=1);

namespace Humanome\Tests\UseCases\Functional;

use Humanome\Tests\CartographeTestCase;
use Humanome\Tests\TestDb;
use PHPUnit\Framework\Attributes\TestDox;
use Psr\Http\Message\ResponseInterface;

/**
 * UC-CPT-06 — Supprimer son compte (droit à l'effacement) : tests FONCTIONNELS (API).
 *
 * Fiche : docs/cas-utilisation/compte/UC-CPT-06-supprimer-compte.md
 *
 * Le compte est d'abord PEUPLÉ par les routes réelles (avatar, progression,
 * clé API chiffrée, cartographie opt-in, lien de partage, connexions), puis
 * supprimé par DELETE /api/auth/account. On vérifie la purge réelle, l'audit
 * anonymisé et les effets visibles de l'extérieur (employeur, autre compte).
 */
final class UcCpt06SupprimerCompteTest extends CartographeTestCase
{
    private const MASTER_HEX = '89b1b60f0a26f73b63f9df20a9c58ab24905b48b2bd45a01b344cee69d7e3a55';
    private const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
    private const LINK_PASSWORD = 'sesame-employeur';

    protected function setUp(): void
    {
        parent::setUp();
        TestDb::setEnv('SODIUM_MASTER_KEY', self::MASTER_HEX);
    }

    protected function tearDown(): void
    {
        // Table de blocage de F09 : jamais laissée derrière (RgpdAuditTest vérifie le graphe exact).
        self::$pdo->exec('DROP TABLE IF EXISTS uc_cpt06_blocage');
        parent::tearDown();
    }

    /** @param array{id: int, csrf: string, sid: string} $user */
    private function populate(array $user, string $key): array
    {
        self::assertSame(200, $this->as_($user, 'PUT', '/api/auth/me/avatar', ['avatar' => self::PNG_B64, 'mime' => 'image/png'])->getStatusCode());
        self::assertSame(200, $this->as_($user, 'PUT', '/api/training/progress', ['parcours' => 'apprenant', 'chapitre' => '01-pourquoi-un-portfolio-reflexif', 'completed' => true])->getStatusCode());
        self::assertSame(204, $this->as_($user, 'PUT', '/api/keys', ['provider' => 'anthropic', 'apiKey' => $key])->getStatusCode());
        $cartoId = $this->createCarto($user, ['visibility' => 'publique', 'titre' => 'Journée du 5 janvier', 'document' => self::jourDocument()]);
        $share = $this->as_($user, 'POST', '/api/cartographies/' . $cartoId . '/share', ['password' => self::LINK_PASSWORD]);
        self::assertSame(201, $share->getStatusCode(), (string) $share->getBody());

        return ['cartoId' => $cartoId, 'token' => (string) self::json($share)['token']];
    }

    private function deleteAccount(array $user): ResponseInterface
    {
        return $this->as_($user, 'DELETE', '/api/auth/account');
    }

    private function employeurConsulte(string $token): ResponseInterface
    {
        $this->cookieSid = null;
        $this->clientIp = '198.51.100.7';

        return $this->request('POST', '/api/share/' . $token, ['password' => self::LINK_PASSWORD]);
    }

    private static function rows(string $sql): int
    {
        return (int) self::$pdo->query($sql)->fetchColumn();
    }

    #[TestDox('UC-CPT-06-F01 — nominal : compte peuplé → DELETE (204) → purge réelle partout, audit anonymisé, toutes ses sessions mortes, autres comptes intacts')]
    public function testF01NominalDeletion(): void
    {
        $ada = $this->registerAs('ada@example.org', 'Ada');
        $adaData = $this->populate($ada, 'sk-ant-cle-ada-123');
        $bob = $this->registerAs('bob@example.org', 'Bob');
        $bobData = $this->populate($bob, 'sk-ant-cle-bob-123');
        // Un second navigateur d'Ada, et un échec de connexion journalisé à son nom.
        $this->cookieSid = null;
        $this->login('ada@example.org', 'mauvais mot de passe');
        self::assertSame(200, $this->login('ada@example.org', self::PASSWORD)->getStatusCode());
        $secondBrowser = $this->cookieSid;
        self::assertSame(200, $this->employeurConsulte($adaData['token'])->getStatusCode(), 'lien vivant avant la suppression');

        $response = $this->deleteAccount($ada);

        self::assertSame(204, $response->getStatusCode());
        self::assertSame('', (string) $response->getBody());
        // Étape 6 / RG5 — contrôlé AVANT toute autre requête (un GET avec le cookie
        // périmé recréerait une ligne vide, UC-CPT-02 AN2) : sans Session::destroy(),
        // l'écriture de fin de requête aurait ressuscité la session courante.
        self::assertSame(
            0,
            self::rows("SELECT COUNT(*) FROM sessions WHERE id IN ('" . $ada['sid'] . "', '" . $secondBrowser . "')"),
            'aucune session orpheline (étape 6), ni celle de l’autre navigateur (cascade)',
        );
        $id = $ada['id'];
        foreach ([
            'users' => "SELECT COUNT(*) FROM users WHERE id = $id OR email = 'ada@example.org'",
            'user_roles' => "SELECT COUNT(*) FROM user_roles WHERE user_id = $id",
            'sessions' => "SELECT COUNT(*) FROM sessions WHERE user_id = $id",
            'cartographies' => "SELECT COUNT(*) FROM cartographies WHERE user_id = $id",
            'share_links' => 'SELECT COUNT(*) FROM share_links WHERE cartographie_id = ' . $adaData['cartoId'],
            'training_progress' => "SELECT COUNT(*) FROM training_progress WHERE user_id = $id",
            'user_api_keys' => "SELECT COUNT(*) FROM user_api_keys WHERE user_id = $id",
            'audit_events (non anonymisés)' => "SELECT COUNT(*) FROM audit_events WHERE user_id = $id",
        ] as $table => $sql) {
            self::assertSame(0, self::rows($sql), $table);
        }
        $deleted = self::$pdo->query("SELECT user_id, details FROM audit_events WHERE type = 'account_deleted'")->fetchAll();
        self::assertCount(1, $deleted);
        self::assertNull($deleted[0]['user_id']);
        self::assertNull($deleted[0]['details']);
        self::assertGreaterThanOrEqual(3, self::rows("SELECT COUNT(*) FROM audit_events WHERE user_id IS NULL AND type IN ('login', 'login_failed', 'account_created')"));
        $raw = implode('|', self::$pdo->query('SELECT COALESCE(details, "") FROM audit_events')->fetchAll(\PDO::FETCH_COLUMN));
        self::assertStringNotContainsString('ada@example.org', $raw);

        // Vu de l'extérieur : plus rien.
        self::assertSame(404, $this->employeurConsulte($adaData['token'])->getStatusCode(), 'lien de partage mort');
        self::assertSame(404, $this->request('GET', '/api/users/' . $id . '/avatar')->getStatusCode());
        foreach ([$ada['sid'], $secondBrowser] as $sid) {
            $this->cookieSid = $sid;
            self::assertSame(401, $this->request('GET', '/api/auth/me')->getStatusCode(), 'session périmée');
        }
        $this->cookieSid = null;
        self::assertSame(401, $this->login('ada@example.org', self::PASSWORD)->getStatusCode());

        // Bob n'est pas touché.
        self::assertSame(200, $this->employeurConsulte($bobData['token'])->getStatusCode());
        self::assertSame('sk-ant-cle-bob-123', self::json($this->as_($bob, 'GET', '/api/keys/anthropic'))['apiKey']);
        self::assertSame(200, $this->request('GET', '/api/users/' . $bob['id'] . '/avatar')->getStatusCode());
    }

    #[TestDox('UC-CPT-06-F02 — A2 : un cartographe supprime son compte → la garantie disparaît du lien de l’apprenant, qui sert de nouveau la base')]
    public function testF02CartographeDeletionAndSharedLink(): void
    {
        $maya = $this->registerAs('maya@example.org', 'Maya');
        $carl = $this->registerAs('carl@example.org', 'Carl', ['cartographe']);
        $this->link($maya, $carl);
        $cartoId = $this->createCarto($maya, ['visibility' => 'publique', 'document' => self::jourDocument()]);
        $revised = self::jourDocument();
        $revised['date'] = '2026-01-06';
        $revision = $this->as_($carl, 'POST', '/api/cartographies/' . $cartoId . '/revisions', ['document' => $revised, 'note' => 'Date corrigée']);
        $revisionId = (int) self::json($revision)['revisionId'];
        self::assertSame(201, $this->as_($carl, 'POST', '/api/cartographies/' . $cartoId . '/garantie', ['revisionId' => $revisionId])->getStatusCode());
        $share = self::json($this->as_($maya, 'POST', '/api/cartographies/' . $cartoId . '/share', ['password' => self::LINK_PASSWORD]));
        $before = self::json($this->employeurConsulte($share['token']));
        self::assertSame('Carl', $before['garantie']['par']);
        self::assertSame('2026-01-06', $before['document']['date']);

        self::assertSame(204, $this->deleteAccount($carl)->getStatusCode());

        $after = $this->employeurConsulte($share['token']);
        self::assertSame(200, $after->getStatusCode(), 'le lien de Maya survit');
        self::assertNull(self::json($after)['garantie']);
        self::assertEquals(self::jourDocument(), self::json($after)['document'], 'document de base, plus la révision signée');
        self::assertNull(self::$pdo->query('SELECT author_id FROM cartography_revisions WHERE id = ' . $revisionId)->fetchColumn(), 'révision conservée, auteur anonymisé');
        self::assertSame(0, self::rows('SELECT COUNT(*) FROM cartographe_links'));

        // Vu par l'apprenante, par l'API : la révision reste listée et lisible, sans auteur.
        $this->clientIp = '203.0.113.10';
        $list = $this->as_($maya, 'GET', '/api/cartographies/' . $cartoId . '/revisions');
        self::assertSame(200, $list->getStatusCode());
        self::assertSame([$revisionId], array_column(self::json($list), 'id'));
        self::assertNull(self::json($list)[0]['author']);
        $one = $this->as_($maya, 'GET', '/api/revisions/' . $revisionId);
        self::assertSame(200, $one->getStatusCode());
        self::assertNull(self::json($one)['author'] ?? null);
        self::assertSame('2026-01-06', self::json($one)['document']['date']);
    }

    #[TestDox('UC-CPT-06-F03 — A3 : l’adresse est libérée — une nouvelle inscription avec le même email crée un compte neuf')]
    public function testF03EmailCanBeReused(): void
    {
        $ada = $this->registerAs('ada@example.org', 'Ada', ['apprenant', 'cartographe']);
        $this->populate($ada, 'sk-ant-cle-ada-123'); // avatar, progression, clé, cartographie, partage
        self::assertSame(204, $this->deleteAccount($ada)->getStatusCode());

        $again = $this->registerAs('ada@example.org', 'Ada revenue');

        self::assertNotSame($ada['id'], $again['id']);
        $me = self::json($this->as_($again, 'GET', '/api/auth/me'))['user'];
        self::assertSame('Ada revenue', $me['displayName']);
        // Rien n'est hérité de l'ancien compte, pourtant peuplé.
        self::assertSame(['apprenant'], $me['roles']);
        self::assertFalse($me['hasAvatar']);
        self::assertSame([], self::json($this->as_($again, 'GET', '/api/keys')));
        self::assertSame('{}', (string) $this->as_($again, 'GET', '/api/training/progress')->getBody());
        self::assertSame(0, self::rows('SELECT COUNT(*) FROM cartographies WHERE user_id = ' . $again['id']));
    }

    #[TestDox('UC-CPT-06-F04 — E1 : sans session → 401 ; cookie périmé (après déconnexion) → refusé 403 par la garde CSRF ; rien n’est supprimé')]
    public function testF04SessionRequired(): void
    {
        $ada = $this->registerAs('ada@example.org', 'Ada');

        $this->cookieSid = null;
        $anonymous = $this->request('DELETE', '/api/auth/account');
        self::assertSame(401, $anonymous->getStatusCode());
        self::assertSame(['error' => 'Authentification requise'], self::json($anonymous));
        self::assertSame(204, $this->as_($ada, 'POST', '/api/auth/logout')->getStatusCode());
        // Le navigateur garde son cookie périmé et l'ancien jeton : la garde CSRF
        // ouvre une session NEUVE (sans jeton) et refuse avant même la route.
        $this->cookieSid = $ada['sid'];
        $stale = $this->request('DELETE', '/api/auth/account', null, ['X-CSRF-Token' => $ada['csrf']]);
        self::assertSame(403, $stale->getStatusCode());
        self::assertSame(['error' => 'Jeton CSRF absent ou invalide'], self::json($stale));

        self::assertSame(1, self::rows("SELECT COUNT(*) FROM users WHERE email = 'ada@example.org'"));
        self::assertNull(self::lastAudit('account_deleted'));
    }

    #[TestDox('UC-CPT-06-F05 — E2 : jeton CSRF absent ou faux (tir cross-site) → 403, le compte et la session restent intacts')]
    public function testF05CsrfRequired(): void
    {
        $ada = $this->registerAs('ada@example.org', 'Ada');
        $this->cookieSid = $ada['sid'];

        foreach ([[], ['X-CSRF-Token' => 'forge']] as $headers) {
            $refused = $this->request('DELETE', '/api/auth/account', null, $headers);
            self::assertSame(403, $refused->getStatusCode());
            self::assertSame(['error' => 'Jeton CSRF absent ou invalide'], self::json($refused));
        }
        self::assertSame(1, self::rows("SELECT COUNT(*) FROM users WHERE email = 'ada@example.org'"));
        self::assertSame(200, $this->request('GET', '/api/auth/me')->getStatusCode());
        self::assertNull(self::lastAudit('account_deleted'));
    }

    #[TestDox('UC-CPT-06-F09 — E4 : purge impossible (erreur SQL) → 500, transaction annulée : compte, session et audit intacts, aucun account_deleted orphelin')]
    public function testF09FailedPurgeRollsBackEverything(): void
    {
        $ada = $this->registerAs('ada@example.org', 'Ada');
        // Une contrainte RESTRICT posée pour le test fait échouer le DELETE FROM users
        // APRÈS l'écriture de l'audit, dans la même transaction.
        self::$pdo->exec('CREATE TABLE uc_cpt06_blocage (user_id INT UNSIGNED NOT NULL,
            CONSTRAINT fk_uc_cpt06_blocage FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE RESTRICT) ENGINE=InnoDB');
        self::$pdo->prepare('INSERT INTO uc_cpt06_blocage (user_id) VALUES (?)')->execute([$ada['id']]);

        // Configuration de production : pas de détail d'erreur dans la réponse.
        // (La trace, journalisée par le middleware d'erreur, est envoyée à /dev/null.)
        $env = \Humanome\Env::get('APP_ENV');
        $log = ini_set('error_log', '/dev/null');
        TestDb::setEnv('APP_ENV', 'production');
        try {
            $response = $this->deleteAccount($ada);
        } finally {
            TestDb::setEnv('APP_ENV', $env);
            ini_set('error_log', $log === false ? '' : $log);
        }

        self::assertSame(500, $response->getStatusCode());
        self::assertStringNotContainsString('uc_cpt06_blocage', (string) $response->getBody(), 'aucun détail SQL exposé');
        self::assertSame(1, self::rows("SELECT COUNT(*) FROM users WHERE email = 'ada@example.org'"));
        self::assertNull(self::lastAudit('account_deleted'), 'rollback : pas d’événement orphelin');
        self::assertSame(1, self::rows('SELECT COUNT(*) FROM user_roles WHERE user_id = ' . $ada['id']));
        self::assertSame(200, $this->as_($ada, 'GET', '/api/auth/me')->getStatusCode(), 'session non détruite');
    }

    #[TestDox('UC-CPT-06-F10 — A4 : un compte établissement supprimé efface en cascade ses cohortes, les adhésions et les portfolios déposés de ses membres ; leurs comptes restent')]
    public function testF10EtablissementDeletionCascadesToMembers(): void
    {
        $eta = $this->registerAs('lycee@example.org', 'Lycée Jean Moulin', ['etablissement']);
        $maya = $this->registerAs('maya@example.org', 'Maya');
        $created = $this->as_($eta, 'POST', '/api/etablissement/cohortes', ['nom' => 'Terminale B']);
        self::assertSame(201, $created->getStatusCode(), (string) $created->getBody());
        $cohorte = self::json($created);
        $cohorteId = (int) $cohorte['id'];
        self::assertSame(201, $this->as_($maya, 'POST', '/api/cohortes/' . $cohorte['codeInvitation'] . '/rejoindre', ['consentement' => true])->getStatusCode());
        $deposit = $this->as_($maya, 'POST', '/api/cohortes/' . $cohorteId . '/portfolio', [
            'titre' => 'Journal de Maya',
            'segments' => [['date' => '2026-01-05', 'texte' => 'Une journée de stage.']],
        ]);
        self::assertSame(201, $deposit->getStatusCode(), (string) $deposit->getBody());
        self::assertCount(1, self::json($this->as_($maya, 'GET', '/api/cohortes')));

        self::assertSame(204, $this->deleteAccount($eta)->getStatusCode());

        self::assertSame([], self::json($this->as_($maya, 'GET', '/api/cohortes')), 'la cohorte a disparu pour le membre');
        foreach (['cohortes' => "id = $cohorteId", 'cohorte_membres' => "cohorte_id = $cohorteId", 'cohorte_portfolios' => "cohorte_id = $cohorteId"] as $table => $where) {
            self::assertSame(0, self::rows("SELECT COUNT(*) FROM $table WHERE $where"), $table);
        }
        $me = $this->as_($maya, 'GET', '/api/auth/me');
        self::assertSame(200, $me->getStatusCode(), 'le compte du membre reste');
        self::assertSame('Maya', self::json($me)['user']['displayName']);
    }

    #[TestDox('UC-CPT-06-F11 — A5 : un administrateur supprimé — les rôles qu’il a attribués restent ; son audit est anonymisé mais garde l’identifiant du compte visé, même supprimé à son tour')]
    public function testF11ContributorDeletionAndAuditPseudonyms(): void
    {
        $admin = $this->registerAs('admin@example.org', 'Admin', ['admin']);
        $bob = $this->registerAs('bob@example.org', 'Bob');
        $grant = $this->as_($admin, 'POST', '/api/admin/users/' . $bob['id'] . '/roles', ['role' => 'cartographe']);
        self::assertSame(200, $grant->getStatusCode(), (string) $grant->getBody());

        self::assertSame(204, $this->deleteAccount($admin)->getStatusCode());

        self::assertSame(['apprenant', 'cartographe'], self::json($this->as_($bob, 'GET', '/api/auth/me'))['user']['roles'], 'le rôle attribué survit à son auteur');
        $event = self::lastAudit('role_granted');
        self::assertNull($event['userId'], 'auteur anonymisé (SET NULL)');
        self::assertEquals(['targetUserId' => $bob['id'], 'role' => 'cartographe', 'status' => 'granted'], $event['details']);

        // Comportement ACTUEL figé (« Limites ») : l'identifiant de Bob, hors clé
        // étrangère, reste dans les détails d'un événement dont il n'est pas l'auteur.
        self::assertSame(204, $this->deleteAccount($bob)->getStatusCode());
        self::assertSame($bob['id'], self::lastAudit('role_granted')['details']['targetUserId'], 'pseudonyme orphelin');
    }
}
