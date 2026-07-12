<?php

declare(strict_types=1);

/**
 * Employer sharing (P8, cahier §3.6): link + password, expiration,
 * revocation, and the PUBLIC consultation endpoint.
 *
 * Owner side (`apprenant`, CSRF): create link on an owned cartography, list
 * links, revoke. Public side (no session, no account — §3.6): POST the
 * password against the token.
 *
 * Anti-enumeration on the public side: unknown token, expired link and
 * revoked link all collapse into ONE identical 404, with a dummy
 * password_verify() so the timing does not tell a valid token from an
 * invalid one; a wrong password on a live link is the only 403. Attempts
 * are rate-limited per IP (hashed /64-aware buckets via ClientIp, same
 * model as auth/llm).
 *
 * RGPD §6.5: audit_events records share_created/share_revoked with ids
 * only — never a token, a password, or any cartography content.
 */

use Humanome\Auth\Audit;
use Humanome\Auth\RateLimiter;
use Humanome\Auth\Users;
use Humanome\Cartographe\Garanties;
use Humanome\Cartographies\CartographyRepository;
use Humanome\ClientIp;
use Humanome\Db;
use Humanome\Middleware\RequireRole;
use Humanome\Share\ShareLinks;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use Slim\App;

return function (App $app): void {
    /** Public consultation attempts per IP per hour (fixed window). */
    $publicAttemptsPerHour = 20;

    $json = function (Response $response, mixed $payload, int $status = 200): Response {
        $response->getBody()->write(json_encode(
            $payload,
            JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES,
        ));

        return $response
            ->withHeader('Content-Type', 'application/json')
            ->withStatus($status);
    };

    $wrap = function (callable $handler) use ($json): callable {
        return function (Request $request, Response $response, array $args) use ($handler, $json): Response {
            if (!Db::isConfigured()) {
                return $json($response, ['error' => 'Service indisponible'], 503);
            }
            try {
                return $handler($request, $response, $args);
            } catch (PDOException $e) {
                error_log('[share] ' . $e->getMessage());

                return $json($response, ['error' => 'Erreur interne'], 500);
            }
        };
    };

    $apprenant = RequireRole::any('apprenant');

    // ------------------------------------------------------------------
    // POST /api/cartographies/{id}/share — {password (>= 8), expiresInDays
    // (1..365, default 90)} -> 201 {shareId, token, url}. The clear token
    // exists only in this response.
    // ------------------------------------------------------------------
    $app->post('/cartographies/{id:[0-9]+}/share', $wrap(function (Request $request, Response $response, array $args) use ($json): Response {
        $pdo = Db::get();
        $userId = (int) $request->getAttribute('userId');
        $cartoId = (int) $args['id'];

        if (!(new CartographyRepository($pdo))->ownedBy($cartoId, $userId)) {
            return $json($response, ['error' => 'Cartographie introuvable'], 404);
        }

        $data = (array) ($request->getParsedBody() ?? []);
        $errors = [];
        $password = \is_string($data['password'] ?? null) ? $data['password'] : '';
        if (mb_strlen($password) < 8) {
            $errors['password'] = 'Le mot de passe doit contenir au moins 8 caractères';
        } elseif (\strlen($password) > 1024) {
            $errors['password'] = 'Mot de passe trop long';
        }
        $expiresInDays = $data['expiresInDays'] ?? 90;
        if (!\is_int($expiresInDays) || $expiresInDays < 1 || $expiresInDays > 365) {
            $errors['expiresInDays'] = "Durée d'expiration invalide (1 à 365 jours)";
        }
        if ($errors !== []) {
            return $json($response, ['error' => 'Validation échouée', 'fields' => $errors], 422);
        }

        $links = new ShareLinks($pdo);
        ['shareId' => $shareId, 'token' => $token] = $links->create($cartoId, $password, $expiresInDays);

        // Counters and ids only — never the token, never the password (§6.5).
        Audit::record($pdo, $userId, 'share_created', [
            'cartographieId' => $cartoId,
            'shareId' => $shareId,
            'expiresInDays' => $expiresInDays,
        ]);

        return $json($response, [
            'shareId' => $shareId,
            'token' => $token,
            'url' => '/#/partage/' . $token,
        ], 201);
    }))->add($apprenant);

    // ------------------------------------------------------------------
    // GET /api/cartographies/{id}/shares — links of an owned cartography.
    // ------------------------------------------------------------------
    $app->get('/cartographies/{id:[0-9]+}/shares', $wrap(function (Request $request, Response $response, array $args) use ($json): Response {
        $pdo = Db::get();
        $cartoId = (int) $args['id'];
        if (!(new CartographyRepository($pdo))->ownedBy($cartoId, (int) $request->getAttribute('userId'))) {
            return $json($response, ['error' => 'Cartographie introuvable'], 404);
        }

        return $json($response, (new ShareLinks($pdo))->listForCartography($cartoId));
    }))->add($apprenant);

    // ------------------------------------------------------------------
    // DELETE /api/shares/{shareId} — revocation (revoked_at). Idempotent on
    // an already-revoked link; 404 when not owned (like missing).
    // ------------------------------------------------------------------
    $app->delete('/shares/{shareId:[0-9]+}', $wrap(function (Request $request, Response $response, array $args) use ($json): Response {
        $pdo = Db::get();
        $userId = (int) $request->getAttribute('userId');

        $revoked = (new ShareLinks($pdo))->revokeForUser((int) $args['shareId'], $userId);
        if ($revoked === null) {
            return $json($response, ['error' => 'Lien de partage introuvable'], 404);
        }

        Audit::record($pdo, $userId, 'share_revoked', [
            'cartographieId' => $revoked['cartographieId'],
            'shareId' => $revoked['shareId'],
        ]);

        return $response->withStatus(204);
    }))->add($apprenant);

    // ------------------------------------------------------------------
    // POST /api/share/{token} — PUBLIC consultation (no session, §3.6).
    // {password} -> 200 {titre, type, document, garantie}
    // 404 unknown/expired/revoked (single homogeneous answer), 403 wrong
    // password. `garantie` (P9) is the frozen cartographe signature
    // {par, date, revisionId} or null; when it pins a revision, the SERVED
    // document is that guaranteed revision (cahier §8: what is presented as
    // guaranteed is exactly what was signed).
    // ------------------------------------------------------------------
    $app->post('/share/{token}', $wrap(function (Request $request, Response $response, array $args) use ($json, $publicAttemptsPerHour): Response {
        $pdo = Db::get();

        // Per-IP fixed window before ANY lookup: password brute force and
        // token enumeration burn the same budget. REMOTE_ADDR only (the
        // forwarding headers are attacker-controlled, cf. routes/auth.php).
        $ip = (string) ($request->getServerParams()['REMOTE_ADDR'] ?? $_SERVER['REMOTE_ADDR'] ?? '');
        $limiter = new RateLimiter($pdo, $publicAttemptsPerHour, 3600);
        $bucket = 'share:' . hash('sha256', ClientIp::bucketIdentity($ip));
        $attempts = $limiter->hit($bucket);
        if ($attempts > $publicAttemptsPerHour) {
            return $json($response, ['error' => 'Trop de tentatives, réessayez plus tard'], 429)
                ->withHeader('Retry-After', (string) $limiter->retryAfter($attempts));
        }

        $data = (array) ($request->getParsedBody() ?? []);
        $password = \is_string($data['password'] ?? null) ? $data['password'] : '';
        if ($password === '' || \strlen($password) > 1024) {
            return $json($response, ['error' => 'Mot de passe requis'], 422);
        }

        $token = (string) $args['token'];
        $row = preg_match('/^[0-9a-f]{32}$/', $token) === 1
            ? (new ShareLinks($pdo))->findByToken($token)
            : null;

        if ($row === null || !ShareLinks::isConsultable($row)) {
            // Homogeneous 404 for unknown, expired AND revoked, with a dummy
            // verify so the timing does not reveal which case it was.
            password_verify($password, Users::dummyHash());

            return $json($response, ['error' => 'Lien de partage introuvable ou expiré'], 404);
        }

        if (!password_verify($password, (string) $row['password_hash'])) {
            return $json($response, ['error' => 'Mot de passe incorrect'], 403);
        }

        // P9: standing garantie of the shared cartography. When it freezes a
        // revision, serve THAT document — never a later modification (§8).
        $garanti = (new Garanties($pdo))->forShareLink((int) $row['id']);
        $document = $garanti !== null && $garanti['revisionDocument'] !== null
            ? $garanti['revisionDocument']
            : ($row['document'] === null ? null : json_decode((string) $row['document'], true));

        return $json($response, [
            'titre' => (string) $row['titre'],
            'type' => (string) $row['type'],
            'document' => $document,
            'garantie' => $garanti === null ? null : $garanti['garantie'],
        ]);
    }));
};
