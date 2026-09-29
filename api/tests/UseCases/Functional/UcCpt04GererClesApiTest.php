<?php

declare(strict_types=1);

namespace Humanome\Tests\UseCases\Functional;

use Humanome\Tests\CartographeTestCase;
use Humanome\Tests\TestDb;
use PHPUnit\Framework\Attributes\TestDox;
use Psr\Http\Message\ResponseInterface;

/**
 * UC-CPT-04 — Gérer ses clés API personnelles : tests FONCTIONNELS (API).
 *
 * Fiche : docs/cas-utilisation/compte/UC-CPT-04-gerer-cles-api.md
 *
 * Volet serveur (opt-in chiffré, ADR-004) : l'utilisateur connecté enregistre,
 * liste, récupère sur un autre navigateur, remplace et supprime sa clé par
 * /api/keys. Le volet « localStorage par défaut » est purement navigateur :
 * il est couvert par les tests IHM du même UC.
 */
final class UcCpt04GererClesApiTest extends CartographeTestCase
{
    private const MASTER_HEX = '89b1b60f0a26f73b63f9df20a9c58ab24905b48b2bd45a01b344cee69d7e3a55';
    private const API_KEY = 'sk-ant-api03-EXEMPLE-jamais-en-clair';

    /** @var array{id: int, csrf: string, sid: string} */
    private array $ada;

    protected function setUp(): void
    {
        parent::setUp();
        TestDb::setEnv('SODIUM_MASTER_KEY', self::MASTER_HEX);
        $this->ada = $this->registerAs('ada@example.org', 'Ada');
    }

    private function store(array $user, string $provider, string $apiKey): ResponseInterface
    {
        return $this->as_($user, 'PUT', '/api/keys', ['provider' => $provider, 'apiKey' => $apiKey]);
    }

    private static function rowCount(): int
    {
        return (int) self::$pdo->query('SELECT COUNT(*) FROM user_api_keys')->fetchColumn();
    }

    #[TestDox('UC-CPT-04-F01 — nominal : liste vide → PUT (204) → liste {provider, createdAt} sans la clé ; en base, du chiffré seulement')]
    public function testF01StoreFromTheProfile(): void
    {
        self::assertSame([], self::json($this->as_($this->ada, 'GET', '/api/keys')));

        self::assertSame(204, $this->store($this->ada, 'anthropic', self::API_KEY)->getStatusCode());

        $list = $this->as_($this->ada, 'GET', '/api/keys');
        self::assertSame(200, $list->getStatusCode());
        $entries = self::json($list);
        self::assertCount(1, $entries);
        self::assertSame('anthropic', $entries[0]['provider']);
        self::assertMatchesRegularExpression('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/', $entries[0]['createdAt']);
        self::assertStringNotContainsString(self::API_KEY, (string) $list->getBody());
        $blob = (string) self::$pdo->query('SELECT encrypted_key FROM user_api_keys')->fetchColumn();
        self::assertStringNotContainsString(self::API_KEY, $blob);
    }

    #[TestDox('UC-CPT-04-F02 — A3 : sur un autre navigateur, après connexion, GET /api/keys/{provider} rend la clé en clair (no-store)')]
    public function testF02RecoverOnAnotherBrowser(): void
    {
        $this->store($this->ada, 'anthropic', self::API_KEY);

        // Nouveau navigateur : nouvelle session par login.
        $this->cookieSid = null;
        self::assertSame(200, $this->login('ada@example.org', self::PASSWORD)->getStatusCode());
        $response = $this->request('GET', '/api/keys/anthropic');

        self::assertSame(200, $response->getStatusCode());
        self::assertSame(['apiKey' => self::API_KEY], self::json($response));
        self::assertSame('no-store', $response->getHeaderLine('Cache-Control'));
    }

    #[TestDox('UC-CPT-04-F03 — A4 : remplacer la clé d’un fournisseur → une seule entrée, la nouvelle clé est rendue')]
    public function testF03ReplaceKey(): void
    {
        $this->store($this->ada, 'openai', 'sk-ancienne-cle-openai');
        self::$pdo->exec("UPDATE user_api_keys SET created_at = '2026-01-01 00:00:00'");

        self::assertSame(204, $this->store($this->ada, 'openai', 'sk-nouvelle-cle-openai')->getStatusCode());

        self::assertSame(1, self::rowCount());
        self::assertSame('sk-nouvelle-cle-openai', self::json($this->as_($this->ada, 'GET', '/api/keys/openai'))['apiKey']);
        self::assertNotSame('2026-01-01T00:00:00', self::json($this->as_($this->ada, 'GET', '/api/keys'))[0]['createdAt'], 'date = dernière écriture');
    }

    #[TestDox('UC-CPT-04-F04 — A5 : suppression (révocation de l’opt-in) → 204, liste vide, lecture 404, nouvelle suppression 404')]
    public function testF04DeleteKey(): void
    {
        $this->store($this->ada, 'google', 'AIza-cle-google-ada');

        self::assertSame(204, $this->as_($this->ada, 'DELETE', '/api/keys/google')->getStatusCode());

        self::assertSame(0, self::rowCount(), 'suppression réelle');
        self::assertSame([], self::json($this->as_($this->ada, 'GET', '/api/keys')));
        foreach (['GET', 'DELETE'] as $method) {
            $response = $this->as_($this->ada, $method, '/api/keys/google');
            self::assertSame(404, $response->getStatusCode(), $method);
            self::assertSame(['error' => 'Aucune clé enregistrée pour ce fournisseur'], self::json($response));
        }
    }

    #[TestDox('UC-CPT-04-F05 — E1 : clé maîtresse absente ou malformée → 503 explicite sur toutes les routes, avant même l’authentification')]
    public function testF05StorageNotConfigured(): void
    {
        $this->store($this->ada, 'anthropic', self::API_KEY);
        foreach (['', 'pas-une-cle-hex'] as $master) {
            TestDb::setEnv('SODIUM_MASTER_KEY', $master);
            foreach ([['PUT', '/api/keys', ['provider' => 'openai', 'apiKey' => 'sk-12345678']], ['GET', '/api/keys', null], ['GET', '/api/keys/anthropic', null], ['DELETE', '/api/keys/anthropic', null]] as [$method, $path, $body]) {
                $response = $this->as_($this->ada, $method, $path, $body);
                self::assertSame(503, $response->getStatusCode(), $method . ' ' . $path);
                self::assertSame(['error' => 'Stockage de clés non configuré'], self::json($response));
            }
            $this->cookieSid = null;
            self::assertSame(503, $this->request('GET', '/api/keys')->getStatusCode(), 'visiteur : 503 aussi');
            // Sur une mutation, la garde CSRF (middleware global) passe AVANT la route :
            // un cookie de session sans jeton reçoit 403, pas 503.
            $this->cookieSid = $this->ada['sid'];
            self::assertSame(403, $this->request('DELETE', '/api/keys/anthropic')->getStatusCode(), 'CSRF avant 503');
        }
        self::assertSame(1, self::rowCount(), 'rien n’a été effacé');
        self::assertSame(200, $this->as_($this->ada, 'GET', '/api/auth/me')->getStatusCode(), 'le reste de l’API répond');
    }

    #[TestDox('UC-CPT-04-F06 — E2 : sans session → 401 sur les quatre routes')]
    public function testF06AuthenticationRequired(): void
    {
        foreach ([['PUT', '/api/keys', ['provider' => 'openai', 'apiKey' => 'sk-12345678']], ['GET', '/api/keys', null], ['GET', '/api/keys/openai', null], ['DELETE', '/api/keys/openai', null]] as [$method, $path, $body]) {
            $this->cookieSid = null;
            $response = $this->request($method, $path, $body);
            self::assertSame(401, $response->getStatusCode(), $method . ' ' . $path);
            self::assertSame(['error' => 'Authentification requise'], self::json($response));
        }
        self::assertSame(0, self::rowCount());
    }

    #[TestDox('UC-CPT-04-F07 — E3 : fournisseur inconnu, clé trop courte, trop longue, avec caractère de contrôle ou absente → 422 par champ')]
    public function testF07Validation(): void
    {
        $cases = [
            [['provider' => 'mistral', 'apiKey' => 'sk-12345678'], ['provider']],
            [['provider' => 'openai', 'apiKey' => 'sk-1234'], ['apiKey']],
            [['provider' => 'openai', 'apiKey' => str_repeat('k', 4097)], ['apiKey']],
            [['provider' => 'openai', 'apiKey' => "sk-1234\n5678"], ['apiKey']],
            [[], ['provider', 'apiKey']],
        ];
        foreach ($cases as [$body, $fields]) {
            $response = $this->as_($this->ada, 'PUT', '/api/keys', $body);
            self::assertSame(422, $response->getStatusCode(), json_encode($body));
            $json = self::json($response);
            self::assertSame('Validation échouée', $json['error']);
            self::assertSame($fields, array_keys($json['fields']));
            if (\in_array('apiKey', $fields, true)) {
                self::assertSame('Clé API invalide (8 à 4096 caractères imprimables)', $json['fields']['apiKey']);
            }
        }
        self::assertSame(0, self::rowCount());
        self::assertSame(204, $this->store($this->ada, 'openai', 'sk-12345')->getStatusCode(), '8 caractères suffisent');
        self::assertSame(204, $this->store($this->ada, 'ollama', str_repeat('k', 4096))->getStatusCode(), '4096 caractères acceptés');
    }

    #[TestDox('UC-CPT-04-F08 — E5 : clé maîtresse changée (rotation) → la clé stockée n’est plus lisible : 404, jamais 500 ni fuite ; l’entrée listée peut être remplacée ou supprimée')]
    public function testF08RotatedMasterKey(): void
    {
        $this->store($this->ada, 'anthropic', self::API_KEY);
        TestDb::setEnv('SODIUM_MASTER_KEY', strrev(self::MASTER_HEX));

        $response = $this->as_($this->ada, 'GET', '/api/keys/anthropic');

        self::assertSame(404, $response->getStatusCode());
        self::assertStringNotContainsString(self::API_KEY, (string) $response->getBody());
        self::assertSame(['anthropic'], array_column(self::json($this->as_($this->ada, 'GET', '/api/keys')), 'provider'), 'l’entrée reste listée');

        // L'entrée illisible peut être remplacée (chiffrée avec la nouvelle clé maîtresse)…
        self::assertSame(204, $this->store($this->ada, 'anthropic', 'sk-ant-nouvelle-cle-apres-rotation')->getStatusCode());
        self::assertSame('sk-ant-nouvelle-cle-apres-rotation', self::json($this->as_($this->ada, 'GET', '/api/keys/anthropic'))['apiKey']);
        // … ou supprimée (la suppression ne déchiffre rien).
        self::assertSame(204, $this->as_($this->ada, 'DELETE', '/api/keys/anthropic')->getStatusCode());
        self::assertSame(0, self::rowCount());
    }

    #[TestDox('UC-CPT-04-F09 — E6 : PUT ou DELETE sans jeton CSRF → 403, rien n’est écrit ni effacé')]
    public function testF09CsrfRequired(): void
    {
        $this->store($this->ada, 'anthropic', self::API_KEY);
        $this->cookieSid = $this->ada['sid'];

        self::assertSame(403, $this->request('PUT', '/api/keys', ['provider' => 'openai', 'apiKey' => 'sk-forgee-123'])->getStatusCode());
        self::assertSame(403, $this->request('DELETE', '/api/keys/anthropic')->getStatusCode());

        self::assertSame(['anthropic'], array_column(self::json($this->as_($this->ada, 'GET', '/api/keys')), 'provider'));
    }

    #[TestDox('UC-CPT-04-F10 — RG5 : un autre compte ne voit, ne lit ni ne supprime la clé d’Ada')]
    public function testF10OwnerIsolation(): void
    {
        $this->store($this->ada, 'anthropic', self::API_KEY);
        $bob = $this->registerAs('bob@example.org', 'Bob');

        self::assertSame([], self::json($this->as_($bob, 'GET', '/api/keys')));
        self::assertSame(404, $this->as_($bob, 'GET', '/api/keys/anthropic')->getStatusCode());
        self::assertSame(404, $this->as_($bob, 'DELETE', '/api/keys/anthropic')->getStatusCode());
        self::assertSame(self::API_KEY, self::json($this->as_($this->ada, 'GET', '/api/keys/anthropic'))['apiKey']);
    }
}
