<?php

declare(strict_types=1);

/**
 * System routes: health check + remote migration endpoint (ADR-008).
 */

use Humanome\Bootstrap;
use Humanome\Db;
use Humanome\Env;
use Humanome\MigrationRunner;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use Slim\App;

return function (App $app): void {
    $json = function (Response $response, array $payload, int $status = 200): Response {
        $response->getBody()->write(json_encode($payload, JSON_THROW_ON_ERROR));

        return $response
            ->withHeader('Content-Type', 'application/json')
            ->withStatus($status);
    };

    $app->get('/health', function (Request $request, Response $response) use ($json): Response {
        // The static site must keep working without a database: db is a
        // diagnostic field, never a failure. Raw SQL errors are never leaked.
        if (!Db::isConfigured()) {
            $db = 'unconfigured';
        } else {
            try {
                Db::get()->query('SELECT 1');
                $db = 'ok';
            } catch (\Throwable) {
                $db = 'error';
            }
        }

        return $json($response, [
            'status' => 'ok',
            'version' => Bootstrap::version(),
            'db' => $db,
        ]);
    });

    // Remote migrations for FTP-only hosting (ADR-008). Token lives in
    // ~/app/shared/.env; the deploy script sends it as a header — never in
    // a query string, never logged.
    $app->post('/admin/migrate', function (Request $request, Response $response) use ($json): Response {
        $token = Env::get('MIGRATE_TOKEN');
        if ($token === '') {
            // Endpoint does not exist unless explicitly configured.
            return $json($response, ['error' => 'Not found'], 404);
        }

        $given = $request->getHeaderLine('X-Migrate-Token');
        if ($given === '' || !hash_equals($token, $given)) {
            return $json($response, ['error' => 'Forbidden'], 403);
        }

        if (!Db::isConfigured()) {
            return $json($response, ['error' => 'Database not configured'], 503);
        }

        try {
            $runner = new MigrationRunner(Db::get(), MigrationRunner::defaultMigrationsDir());
            $result = $runner->run();
        } catch (\Throwable $e) {
            error_log('[migrate] ' . $e->getMessage());

            return $json($response, ['error' => 'Migration failed, see server log'], 500);
        }

        return $json($response, $result);
    });

    // Remote referentiel import for FTP-only hosting: same trust model as
    // /admin/migrate (deploy-script only). Body = a full referentiel document;
    // validation + contentHash check + idempotence live in the repository.
    $app->post('/admin/import-referentiel', function (Request $request, Response $response) use ($json): Response {
        $token = Env::get('MIGRATE_TOKEN');
        if ($token === '') {
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
            return $json($response, ['error' => 'Body must be a referentiel JSON document'], 400);
        }

        try {
            $repository = new \Humanome\Referentiel\ReferentielRepository(Db::get());
            $result = $repository->importPublishedDocument($doc, 'Import via deploy script');
        } catch (\Humanome\Referentiel\ConflictException $e) {
            return $json($response, ['error' => $e->getMessage()], 409);
        } catch (\Humanome\Referentiel\InvalidDocumentException $e) {
            return $json($response, ['error' => 'Invalid document', 'details' => $e->getErrors()], 422);
        } catch (\Throwable $e) {
            error_log('[import-referentiel] ' . $e->getMessage());

            return $json($response, ['error' => 'Import failed, see server log'], 500);
        }

        return $json($response, $result);
    });
};
