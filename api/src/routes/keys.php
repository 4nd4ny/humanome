<?php

declare(strict_types=1);

/**
 * Per-user LLM API keys (P8, AD-4): opt-in encrypted server storage so the
 * learner can retrieve their key on another browser. Encryption model in
 * src/Keys/KeyVault.php (sodium crypto_secretbox, per-entry nonce, master
 * key SODIUM_MASTER_KEY outside the webroot).
 *
 * Access: any logged-in user, own keys only. GET /api/keys/{provider}
 * returns the DECRYPTED key to the authenticated owner — that is the AD-4
 * synchronization: runs execute in the browser (ADR-001) and need the key
 * client-side. The list never carries key material; keys are never logged.
 *
 * Without a valid SODIUM_MASTER_KEY every route answers an explicit 503
 * (« stockage de clés non configuré ») and the rest of the API is unaffected.
 */

use Humanome\Auth\Session;
use Humanome\Db;
use Humanome\Keys\KeyVault;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use Slim\App;

return function (App $app): void {
    $json = function (Response $response, mixed $payload, int $status = 200): Response {
        $response->getBody()->write(json_encode(
            $payload,
            JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES,
        ));

        return $response
            ->withHeader('Content-Type', 'application/json')
            ->withStatus($status);
    };

    $currentUserId = function (): ?int {
        if (!Db::isConfigured() || !Session::exists()) {
            return null;
        }
        Session::start();

        return Session::userId();
    };

    /**
     * Shared guard: 503 when key storage is unconfigured, 401 without a
     * session; otherwise hands (userId, vault) to the handler.
     */
    $withVault = function (callable $handler) use ($json, $currentUserId): callable {
        return function (Request $request, Response $response, array $args) use ($handler, $json, $currentUserId): Response {
            if (!Db::isConfigured()) {
                return $json($response, ['error' => 'Service indisponible'], 503);
            }
            $masterKey = KeyVault::masterKeyFromEnv();
            if ($masterKey === null) {
                return $json($response, ['error' => 'Stockage de clés non configuré'], 503);
            }
            $userId = $currentUserId();
            if ($userId === null) {
                return $json($response, ['error' => 'Authentification requise'], 401);
            }

            return $handler($request, $response, $args, $userId, new KeyVault(Db::get(), $masterKey));
        };
    };

    // ------------------------------------------------------------------
    // PUT /api/keys — {provider, apiKey} (CSRF via global middleware).
    // ------------------------------------------------------------------
    $app->put('/keys', $withVault(function (Request $request, Response $response, array $args, int $userId, KeyVault $vault) use ($json): Response {
        $data = (array) ($request->getParsedBody() ?? []);
        $errors = [];
        $provider = $data['provider'] ?? null;
        if (!\is_string($provider) || !\in_array($provider, KeyVault::PROVIDERS, true)) {
            $errors['provider'] = 'Fournisseur inconnu (attendu : ' . implode(', ', KeyVault::PROVIDERS) . ')';
        }
        $apiKey = $data['apiKey'] ?? null;
        if (!\is_string($apiKey) || \strlen($apiKey) < 8 || \strlen($apiKey) > 4096
            || preg_match('/[\x00-\x1f\x7f]/', $apiKey) === 1) {
            $errors['apiKey'] = 'Clé API invalide (8 à 4096 caractères imprimables)';
        }
        if ($errors !== []) {
            return $json($response, ['error' => 'Validation échouée', 'fields' => $errors], 422);
        }

        $vault->store($userId, (string) $provider, (string) $apiKey);

        return $response->withStatus(204);
    }));

    // ------------------------------------------------------------------
    // GET /api/keys — [{provider, createdAt}], NEVER the keys.
    // ------------------------------------------------------------------
    $app->get('/keys', $withVault(function (Request $request, Response $response, array $args, int $userId, KeyVault $vault) use ($json): Response {
        return $json($response, $vault->listForUser($userId));
    }));

    // ------------------------------------------------------------------
    // GET /api/keys/{provider} — {apiKey} decrypted, OWNER ONLY (AD-4).
    // The body carries a cleartext secret: mark it no-store so no browser
    // disk cache or shared proxy retains the decrypted key (cf. gdoc-text).
    // ------------------------------------------------------------------
    $app->get('/keys/{provider:[a-z]+}', $withVault(function (Request $request, Response $response, array $args, int $userId, KeyVault $vault) use ($json): Response {
        $apiKey = $vault->reveal($userId, (string) $args['provider']);
        if ($apiKey === null) {
            return $json($response, ['error' => 'Aucune clé enregistrée pour ce fournisseur'], 404);
        }

        return $json($response, ['apiKey' => $apiKey])->withHeader('Cache-Control', 'no-store');
    }));

    // ------------------------------------------------------------------
    // DELETE /api/keys/{provider} — real deletion (CSRF via middleware).
    // ------------------------------------------------------------------
    $app->delete('/keys/{provider:[a-z]+}', $withVault(function (Request $request, Response $response, array $args, int $userId, KeyVault $vault) use ($json): Response {
        if (!$vault->delete($userId, (string) $args['provider'])) {
            return $json($response, ['error' => 'Aucune clé enregistrée pour ce fournisseur'], 404);
        }

        return $response->withStatus(204);
    }));
};
