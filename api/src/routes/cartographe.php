<?php

declare(strict_types=1);

/**
 * Cartographe workspace (P9, cahier §3.3) — attachment and reading queue.
 *
 * The learner INVITES (they stay in control of who reads them, cahier §6):
 * POST/GET /api/cartographe/invitations are `apprenant` routes. The
 * cartographe ACCEPTS a code, then only ever sees the cartographies of his
 * own linked learners in visibility 'cartographe' or 'publique' — anything
 * else answers the same 404 as a missing id (no existence oracle).
 *
 * RGPD §6.5: audit_events records invitation_accepted with ids only.
 * All mutating routes ride the global CSRF middleware.
 */

use Humanome\Auth\Audit;
use Humanome\Cartographe\Annotations;
use Humanome\Cartographe\Garanties;
use Humanome\Cartographe\Invitations;
use Humanome\Cartographe\Links;
use Humanome\Cartographe\Revisions;
use Humanome\Db;
use Humanome\Middleware\RequireRole;
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

    $wrap = function (callable $handler) use ($json): callable {
        return function (Request $request, Response $response, array $args) use ($handler, $json): Response {
            if (!Db::isConfigured()) {
                return $json($response, ['error' => 'Service indisponible'], 503);
            }
            try {
                return $handler($request, $response, $args);
            } catch (PDOException $e) {
                error_log('[cartographe] ' . $e->getMessage());

                return $json($response, ['error' => 'Erreur interne'], 500);
            }
        };
    };

    $apprenant = RequireRole::any('apprenant');
    $cartographe = RequireRole::any('cartographe');

    // ------------------------------------------------------------------
    // POST /api/cartographe/invitations — the learner mints a code for the
    // cartographe of their choice. 201 {code, expiresAt} (10 chars A-Z2-9,
    // 30 days). Soft cap on pending codes (anti-flood).
    // ------------------------------------------------------------------
    $app->post('/cartographe/invitations', $wrap(function (Request $request, Response $response) use ($json): Response {
        $pdo = Db::get();
        $userId = (int) $request->getAttribute('userId');

        $invitations = new Invitations($pdo);
        if ($invitations->countPending($userId) >= Invitations::MAX_PENDING) {
            return $json($response, [
                'error' => sprintf(
                    "Trop d'invitations en attente (%d maximum) — attendez une acceptation ou une expiration",
                    Invitations::MAX_PENDING,
                ),
            ], 429);
        }

        return $json($response, $invitations->create($userId), 201);
    }))->add($apprenant);

    // ------------------------------------------------------------------
    // GET /api/cartographe/invitations — the learner's codes with status
    // (en_attente / acceptee / expiree).
    // ------------------------------------------------------------------
    $app->get('/cartographe/invitations', $wrap(function (Request $request, Response $response) use ($json): Response {
        return $json(
            $response,
            (new Invitations(Db::get()))->listForApprenant((int) $request->getAttribute('userId')),
        );
    }))->add($apprenant);

    // ------------------------------------------------------------------
    // POST /api/cartographe/invitations/{code}/accept — the cartographe
    // accepts: link created, code consumed. Unknown, expired, used and
    // self-directed codes collapse into ONE 404 (no invitation oracle).
    // ------------------------------------------------------------------
    $app->post('/cartographe/invitations/{code}/accept', $wrap(function (Request $request, Response $response, array $args) use ($json): Response {
        $pdo = Db::get();
        $userId = (int) $request->getAttribute('userId');
        $code = (string) $args['code'];

        $apprenti = Invitations::isWellFormedCode($code)
            ? (new Invitations($pdo))->accept($code, $userId)
            : null;
        if ($apprenti === null) {
            return $json($response, ['error' => 'Invitation introuvable ou expirée'], 404);
        }

        // Ids only — never the code, never a name (§6.5).
        Audit::record($pdo, $userId, 'invitation_accepted', [
            'apprenantId' => $apprenti['id'],
        ]);

        return $json($response, ['apprenant' => $apprenti], 201);
    }))->add($cartographe);

    // ------------------------------------------------------------------
    // GET /api/cartographe/apprentis — the cartographe's linked learners.
    // ------------------------------------------------------------------
    $app->get('/cartographe/apprentis', $wrap(function (Request $request, Response $response) use ($json): Response {
        return $json(
            $response,
            (new Links(Db::get()))->apprentisOf((int) $request->getAttribute('userId')),
        );
    }))->add($cartographe);

    // ------------------------------------------------------------------
    // GET /api/cartographe/cartographies — the reading queue: metadata of
    // the linked learners' cartographies in visibility cartographe/publique.
    // NEVER a document in the list projection.
    // ------------------------------------------------------------------
    $app->get('/cartographe/cartographies', $wrap(function (Request $request, Response $response) use ($json): Response {
        return $json(
            $response,
            (new Links(Db::get()))->queueFor((int) $request->getAttribute('userId')),
        );
    }))->add($cartographe);

    // ------------------------------------------------------------------
    // GET /api/cartographe/cartographies/{id} — full review view: document
    // + annotations + revision metadata + garantie. Linked cartographe only.
    // ------------------------------------------------------------------
    $app->get('/cartographe/cartographies/{id:[0-9]+}', $wrap(function (Request $request, Response $response, array $args) use ($json): Response {
        $pdo = Db::get();
        $cartoId = (int) $args['id'];

        $carto = (new Links($pdo))->findForCartographe($cartoId, (int) $request->getAttribute('userId'));
        if ($carto === null) {
            return $json($response, ['error' => 'Cartographie introuvable'], 404);
        }

        $carto['annotations'] = (new Annotations($pdo))->listForCartography($cartoId);
        $carto['revisions'] = (new Revisions($pdo))->listForCartography($cartoId);
        $carto['garantie'] = (new Garanties($pdo))->findForCartography($cartoId);

        return $json($response, $carto);
    }))->add($cartographe);
};
