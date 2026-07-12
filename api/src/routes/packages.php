<?php

declare(strict_types=1);

/**
 * Prompt packages (P8 slice of P10): published versions served to the run
 * launcher, plus the admin import endpoint for FTP-only production.
 *
 * Reads are PUBLIC, like the referentiel (docs/autorisations.md): a
 * published package is a shareable artifact — its prompts describe the
 * method, never any learner data. Draft lifecycle, editor and sandbox
 * arrive in P10.
 *
 * POST /api/admin/import-prompt-package mirrors /api/admin/import-referentiel
 * (routes/system.php): X-Migrate-Token trust model (ADR-008, no SSH on OVH),
 * 404 unless MIGRATE_TOKEN is configured, idempotent by content hash.
 */

use Humanome\Db;
use Humanome\Env;
use Humanome\Packages\InvalidPackageException;
use Humanome\Packages\PackageConflictException;
use Humanome\Packages\PromptPackageRepository;
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
                error_log('[packages] ' . $e->getMessage());

                return $json($response, ['error' => 'Erreur interne'], 500);
            }
        };
    };

    // ------------------------------------------------------------------
    // GET /api/prompt-packages — published versions (id = package slug).
    // ------------------------------------------------------------------
    $app->get('/prompt-packages', $wrap(function (Request $request, Response $response) use ($json): Response {
        return $json($response, (new PromptPackageRepository(Db::get()))->listPublished());
    }));

    // ------------------------------------------------------------------
    // GET /api/prompt-packages/{id}/{version} — full document (schema
    // prompt-package) of one published version.
    // ------------------------------------------------------------------
    $app->get('/prompt-packages/{id}/{version}', $wrap(function (Request $request, Response $response, array $args) use ($json): Response {
        $doc = (new PromptPackageRepository(Db::get()))
            ->findPublished((string) $args['id'], (string) $args['version']);
        if ($doc === null) {
            return $json($response, ['error' => 'Version publiée introuvable'], 404);
        }

        return $json($response, $doc);
    }));

    // ------------------------------------------------------------------
    // POST /api/admin/import-prompt-package — deploy-script only
    // (X-Migrate-Token). Body = full prompt-package document.
    // ------------------------------------------------------------------
    $app->post('/admin/import-prompt-package', function (Request $request, Response $response) use ($json): Response {
        $token = Env::get('MIGRATE_TOKEN');
        if ($token === '') {
            // Endpoint does not exist unless explicitly configured (ADR-008).
            return $json($response, ['error' => 'Not found'], 404);
        }
        $given = $request->getHeaderLine('X-Migrate-Token');
        if ($given === '' || !hash_equals($token, $given)) {
            return $json($response, ['error' => 'Forbidden'], 403);
        }
        if (!Db::isConfigured()) {
            return $json($response, ['error' => 'Database not configured'], 503);
        }

        $doc = json_decode((string) $request->getBody(), true);
        if (!\is_array($doc)) {
            return $json($response, ['error' => 'Body must be a prompt-package JSON document'], 400);
        }

        try {
            $result = (new PromptPackageRepository(Db::get()))->importPublishedDocument($doc);
        } catch (InvalidPackageException $e) {
            return $json($response, ['error' => 'Invalid document', 'details' => $e->getErrors()], 422);
        } catch (PackageConflictException $e) {
            return $json($response, ['error' => $e->getMessage()], 409);
        } catch (\Throwable $e) {
            error_log('[import-prompt-package] ' . $e->getMessage());

            return $json($response, ['error' => 'Import failed, see server log'], 500);
        }

        return $json($response, $result);
    });
};
