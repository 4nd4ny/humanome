<?php

declare(strict_types=1);

/**
 * Administration module (P12.1, cahier §3.8/§4.10/§6/§7) — admin SESSION API.
 *
 * Distinct from the pre-P12 deploy tooling in routes/system.php and
 * routes/packages.php, which is gated by the X-Migrate-Token (ADR-008,
 * deploy-script only). Everything here is gated by RequireRole::any('admin')
 * — a real session with the admin role — and rides the global CSRF middleware
 * (routes/auth.php) on every mutating method.
 *
 * Sections (docs/administration.md):
 *   1. Roles      GET  /admin/users?query=&page=
 *                 POST /admin/users/{id}/roles {role}
 *                 DELETE /admin/users/{id}/roles/{role}   (anti-lockout)
 *   2. Golden     POST /admin/golden {document}           (private import)
 *                 GET  /admin/golden
 *                 POST /admin/golden/{id}/grant {userId}
 *   3. Réglages   GET  /admin/settings
 *                 POST /admin/settings/default-package {id, version}
 *                 GET  /admin/demo-config
 *                 PUT  /admin/demo-config {champs partiels}
 *                 DELETE /admin/demo-config              (reset -> env/fichier)
 *
 * `admin` is NOT an implicit super-role elsewhere (docs/autorisations.md):
 * these routes are the ONLY admin surface.
 */

use Humanome\Admin\AdminException;
use Humanome\Admin\DemoConfigService;
use Humanome\Admin\GoldenRepository;
use Humanome\Admin\PlatformStatus;
use Humanome\Admin\UserDirectory;
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

    // Db guard + uniform error mapping: AdminException carries its own status
    // and a French message; PDO detail stays in the server log only.
    $wrap = function (callable $handler) use ($json): callable {
        return function (Request $request, Response $response, array $args) use ($handler, $json): Response {
            if (!Db::isConfigured()) {
                return $json($response, ['error' => 'Service indisponible'], 503);
            }
            try {
                return $handler($request, $response, $args);
            } catch (AdminException $e) {
                return $json($response, ['error' => $e->getMessage()], $e->getStatusCode());
            } catch (PDOException $e) {
                error_log('[admin] ' . $e->getMessage());

                return $json($response, ['error' => 'Erreur interne'], 500);
            }
        };
    };

    /** @return array<string, mixed>|null null when the body is not a JSON object */
    $parseBody = function (Request $request): ?array {
        $raw = (string) $request->getBody();
        if (trim($raw) === '') {
            return [];
        }
        $decoded = json_decode($raw, true);

        return \is_array($decoded) ? $decoded : null;
    };

    $admin = RequireRole::any('admin');

    // ==================================================================
    // 1. Roles
    // ==================================================================

    // GET /api/admin/users?query=&page= — accounts with their roles.
    $app->get('/admin/users', $wrap(function (Request $request, Response $response) use ($json): Response {
        $params = $request->getQueryParams();
        $query = \is_string($params['query'] ?? null) ? $params['query'] : '';
        $page = (int) ($params['page'] ?? 1);

        return $json($response, (new UserDirectory(Db::get()))->list($query, $page));
    }))->add($admin);

    // POST /api/admin/users/{id}/roles {role} — grant a cahier §2 role.
    $app->post('/admin/users/{id:[0-9]+}/roles', $wrap(function (Request $request, Response $response, array $args) use ($json, $parseBody): Response {
        $body = $parseBody($request);
        $role = \is_array($body) && \is_string($body['role'] ?? null) ? trim($body['role']) : '';
        if ($role === '') {
            return $json($response, ['error' => 'Champ requis : role'], 422);
        }

        $result = (new UserDirectory(Db::get()))->grant(
            (int) $request->getAttribute('userId'),
            (int) $args['id'],
            $role,
        );

        return $json($response, ['id' => (int) $args['id'], 'role' => $role] + $result);
    }))->add($admin);

    // DELETE /api/admin/users/{id}/roles/{role} — revoke (anti-lockout on
    // the acting admin's own admin role).
    $app->delete('/admin/users/{id:[0-9]+}/roles/{role:[a-z]+}', $wrap(function (Request $request, Response $response, array $args) use ($json): Response {
        $result = (new UserDirectory(Db::get()))->revoke(
            (int) $request->getAttribute('userId'),
            (int) $args['id'],
            (string) $args['role'],
        );

        return $json($response, ['id' => (int) $args['id'], 'role' => (string) $args['role']] + $result);
    }))->add($admin);

    // ==================================================================
    // 2. Golden Prompt (private import + grant, cahier §7)
    // ==================================================================

    // POST /api/admin/golden {document} — import a PRIVATE prompt-package.
    $app->post('/admin/golden', $wrap(function (Request $request, Response $response) use ($json, $parseBody): Response {
        $body = $parseBody($request);
        $doc = \is_array($body) && \is_array($body['document'] ?? null) ? $body['document'] : $body;
        if (!\is_array($doc) || $doc === []) {
            return $json($response, ['error' => 'Corps JSON invalide : document prompt-package attendu'], 400);
        }

        $result = (new GoldenRepository(Db::get()))->import((int) $request->getAttribute('userId'), $doc);

        return $json($response, $result, $result['status'] === 'imported' ? 201 : 200);
    }))->add($admin);

    // GET /api/admin/golden — private packages + their access grants.
    $app->get('/admin/golden', $wrap(function (Request $request, Response $response) use ($json): Response {
        return $json($response, (new GoldenRepository(Db::get()))->list());
    }))->add($admin);

    // POST /api/admin/golden/{id}/grant {userId} — authorise a promptologue.
    $app->post('/admin/golden/{id}/grant', $wrap(function (Request $request, Response $response, array $args) use ($json, $parseBody): Response {
        $body = $parseBody($request);
        $targetUserId = \is_array($body) && \is_int($body['userId'] ?? null) ? $body['userId'] : 0;
        if ($targetUserId <= 0) {
            return $json($response, ['error' => 'Champ requis : userId (entier)'], 422);
        }

        $result = (new GoldenRepository(Db::get()))->grant(
            (int) $request->getAttribute('userId'),
            (string) $args['id'],
            $targetUserId,
        );

        return $json($response, $result);
    }))->add($admin);

    // ==================================================================
    // 3. Réglages plateforme
    // ==================================================================

    // GET /api/admin/settings — effective settings snapshot (display).
    $app->get('/admin/settings', $wrap(function (Request $request, Response $response) use ($json): Response {
        return $json($response, (new PlatformStatus(Db::get()))->snapshot());
    }))->add($admin);

    // POST /api/admin/settings/default-package {id, version} — admin
    // validation of the default prompt-package (P10). Must be published +
    // non-private.
    $app->post('/admin/settings/default-package', $wrap(function (Request $request, Response $response) use ($json, $parseBody): Response {
        $body = $parseBody($request);
        $id = \is_array($body) && \is_string($body['id'] ?? null) ? trim($body['id']) : '';
        $version = \is_array($body) && \is_string($body['version'] ?? null) ? trim($body['version']) : '';
        if ($id === '' || $version === '') {
            return $json($response, ['error' => 'Champs requis : id et version'], 422);
        }

        $result = (new PlatformStatus(Db::get()))->setDefaultPackage(
            (int) $request->getAttribute('userId'),
            $id,
            $version,
        );

        return $json($response, $result);
    }))->add($admin);

    // GET /api/admin/demo-config — effective public-demo settings + per-field
    // origin (base/env/fichier/defaut). Never returns the API key (boolean).
    $app->get('/admin/demo-config', $wrap(function (Request $request, Response $response) use ($json): Response {
        return $json($response, (new DemoConfigService(Db::get()))->read());
    }))->add($admin);

    // PUT /api/admin/demo-config {champs partiels} — validate and merge into
    // settings.demo_overrides (base > env > fichier > defaut). Immediate
    // effect on the public demo, no redeploy (chantier A: on/off d'un geste).
    $app->put('/admin/demo-config', $wrap(function (Request $request, Response $response) use ($json, $parseBody): Response {
        $body = $parseBody($request);
        if (!\is_array($body)) {
            return $json($response, ['error' => 'Corps JSON invalide : objet attendu'], 400);
        }

        $result = (new DemoConfigService(Db::get()))->update(
            (int) $request->getAttribute('userId'),
            $body,
        );

        return $json($response, $result);
    }))->add($admin);

    // DELETE /api/admin/demo-config — drop every override, back to env/fichier.
    $app->delete('/admin/demo-config', $wrap(function (Request $request, Response $response) use ($json): Response {
        $result = (new DemoConfigService(Db::get()))->reset(
            (int) $request->getAttribute('userId'),
        );

        return $json($response, $result);
    }))->add($admin);
};
