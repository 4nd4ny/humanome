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
    }

    #[TestDox('UC-CPT-06-F03 — A3 : l’adresse est libérée — une nouvelle inscription avec le même email crée un compte neuf')]
    public function testF03EmailCanBeReused(): void
    {
        $ada = $this->registerAs('ada@example.org', 'Ada');
        self::assertSame(204, $this->deleteAccount($ada)->getStatusCode());

        $again = $this->registerAs('ada@example.org', 'Ada revenue');

        self::assertNotSame($ada['id'], $again['id']);
        self::assertSame('Ada revenue', self::json($this->as_($again, 'GET', '/api/auth/me'))['user']['displayName']);
        self::assertSame([], self::json($this->as_($again, 'GET', '/api/keys')), 'rien n’est hérité de l’ancien compte');
    }

    #[TestDox('UC-CPT-06-F04 — E1 : sans session → 401 ; cookie périmé (après déconnexion) → refusé 403 par la garde CSRF ; rien n’est supprimé')]
    public function testF04SessionRequired(): void
    {
        $ada = $this->registerAs('ada@example.org', 'Ada');

        $this->cookieSid = null;
        self::assertSame(401, $this->request('DELETE', '/api/auth/account')->getStatusCode());
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
}
