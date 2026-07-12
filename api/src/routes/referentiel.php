<?php

declare(strict_types=1);

/**
 * Referentiel module routes (P4, cahier §4.1, §3.5).
 *
 * Public reads: latest published version, version list, one version, diff.
 * (The public consultation page reads the STATIC export in
 * web/public/data/referentiel/ — these endpoints serve the logged-in app.)
 *
 * Epistemiarque writes: draft creation/edition/publication. Published
 * versions are immutable — every write on one is a 409.
 */

use Humanome\Db;
use Humanome\Referentiel\ConflictException;
use Humanome\Referentiel\InvalidDocumentException;
use Humanome\Referentiel\ReferentielDiff;
use Humanome\Referentiel\ReferentielRepository;
use Humanome\Referentiel\RoleGuard;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use Slim\App;

return function (App $app): void {
    $json = function (Response $response, mixed $payload, int $status = 200): Response {
        $response->getBody()->write(json_encode(
            $payload,
            JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR,
        ));

        return $response
            ->withHeader('Content-Type', 'application/json')
            ->withStatus($status);
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

    // Domain errors -> HTTP, DB availability, no SQL detail leakage.
    $wrap = function (callable $handler) use ($json): callable {
        return function (Request $request, Response $response, array $args) use ($handler, $json): Response {
            if (!Db::isConfigured()) {
                return $json($response, ['error' => 'Database not configured'], 503);
            }
            try {
                return $handler($request, $response, $args);
            } catch (ConflictException $e) {
                return $json($response, ['error' => $e->getMessage()], 409);
            } catch (InvalidDocumentException $e) {
                return $json($response, ['error' => $e->getMessage(), 'errors' => $e->getErrors()], 422);
            } catch (PDOException $e) {
                error_log('[referentiel] ' . $e->getMessage());

                return $json($response, ['error' => 'Internal error'], 500);
            }
        };
    };

    $repo = static fn (): ReferentielRepository => new ReferentielRepository(Db::get());

    // Authorization guard for EVERY mutating referentiel route (authz matrix,
    // docs/autorisations.md). RoleGuard is the intentional, load-bearing guard
    // here — not a temporary shim: it shares the $_SESSION['user_id'] contract
    // of the DB-backed session module and reads roles fresh from the database
    // on every request, so a role change or an account purge takes effect on
    // the very next call. Do NOT drop the ->add($epistemiarque) on any of the
    // three write routes below: without it they are reachable unauthenticated.
    // (The earlier class_exists(\Humanome\Auth\RequireRole) probe was dead code:
    // that FQCN never ships — the auth guard is Humanome\Middleware\RequireRole,
    // which offers the same 401/403 contract for routes built on the Session
    // object rather than the raw $_SESSION array.)
    $epistemiarque = RoleGuard::any('epistemiarque', 'admin');

    // ------------------------------------------------------------ public reads

    $app->get('/referentiel', $wrap(function (Request $request, Response $response) use ($json, $repo): Response {
        $latest = $repo()->latestPublished(ReferentielRepository::DEFAULT_REFERENTIEL_ID);
        if ($latest === null) {
            return $json($response, ['error' => 'No published referentiel version'], 404);
        }

        return $json($response, $latest['content']);
    }));

    $app->get('/referentiel/versions', $wrap(
        function (Request $request, Response $response) use ($json, $repo): Response {
            $versions = $repo()->publishedVersions(ReferentielRepository::DEFAULT_REFERENTIEL_ID);

            return $json($response, array_map(
                static fn (array $version): array => ReferentielRepository::metadata($version),
                $versions,
            ));
        }
    ));

    $app->get('/referentiel/versions/{semver}', $wrap(
        function (Request $request, Response $response, array $args) use ($json, $repo): Response {
            $version = $repo()->findPublished(ReferentielRepository::DEFAULT_REFERENTIEL_ID, $args['semver']);
            if ($version === null) {
                return $json($response, ['error' => 'Unknown published version'], 404);
            }

            return $json($response, $version['content']);
        }
    ));

    $app->get('/referentiel/diff/{from}/{to}', $wrap(
        function (Request $request, Response $response, array $args) use ($json, $repo): Response {
            $repository = $repo();
            $from = $repository->findPublished(ReferentielRepository::DEFAULT_REFERENTIEL_ID, $args['from']);
            $to = $repository->findPublished(ReferentielRepository::DEFAULT_REFERENTIEL_ID, $args['to']);
            if ($from === null || $to === null) {
                return $json($response, ['error' => 'Unknown published version'], 404);
            }

            return $json($response, ReferentielDiff::compute($from['content'], $to['content']));
        }
    ));

    // ------------------------------------------- epistemiarque draft lifecycle

    $app->post('/referentiel/drafts', $wrap(
        function (Request $request, Response $response) use ($json, $parseBody, $repo): Response {
            $body = $parseBody($request);
            if ($body === null) {
                return $json($response, ['error' => 'Invalid JSON body'], 400);
            }
            $from = $body['from'] ?? null;
            $semver = $body['semver'] ?? null;
            if (!\is_string($from) || $from === '' || !\is_string($semver) || $semver === '') {
                return $json($response, ['error' => 'Fields "from" (source version) and "semver" (new version) are required'], 422);
            }
            $label = isset($body['label']) && \is_string($body['label']) ? $body['label'] : null;
            $userId = $_SESSION['user_id'] ?? null;

            $draft = $repo()->createDraft(
                ReferentielRepository::DEFAULT_REFERENTIEL_ID,
                $from,
                $semver,
                $label,
                \is_int($userId) ? $userId : null,
            );
            if ($draft === null) {
                return $json($response, ['error' => sprintf('Unknown source version %s', $from)], 404);
            }

            return $json($response, ['id' => $draft['id']]
                + ReferentielRepository::metadata($draft)
                + ['content' => $draft['content']], 201);
        }
    ))->add($epistemiarque);

    $app->put('/referentiel/drafts/{id:[0-9]+}', $wrap(
        function (Request $request, Response $response, array $args) use ($json, $parseBody, $repo): Response {
            $content = $parseBody($request);
            if ($content === null || $content === []) {
                return $json($response, ['error' => 'Invalid JSON body: expected the full referentiel document'], 400);
            }

            $draft = $repo()->updateDraft((int) $args['id'], $content);
            if ($draft === null) {
                return $json($response, ['error' => 'Unknown draft'], 404);
            }

            return $json($response, ['id' => $draft['id']]
                + ReferentielRepository::metadata($draft)
                + ['content' => $draft['content']]);
        }
    ))->add($epistemiarque);

    $app->post('/referentiel/drafts/{id:[0-9]+}/publish', $wrap(
        function (Request $request, Response $response, array $args) use ($json, $parseBody, $repo): Response {
            $body = $parseBody($request);
            if ($body === null) {
                return $json($response, ['error' => 'Invalid JSON body'], 400);
            }
            $releaseNote = isset($body['releaseNote']) && \is_string($body['releaseNote'])
                ? $body['releaseNote']
                : null;

            $version = $repo()->publish((int) $args['id'], $releaseNote);
            if ($version === null) {
                return $json($response, ['error' => 'Unknown draft'], 404);
            }

            return $json($response, ['id' => $version['id']] + ReferentielRepository::metadata($version));
        }
    ))->add($epistemiarque);
};
