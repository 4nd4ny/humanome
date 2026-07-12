<?php

declare(strict_types=1);

/**
 * System routes: health check + remote migration endpoint (ADR-008).
 */

use Humanome\Auth\Audit;
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

    // Shared gate for the admin tooling below — same trust model as
    // /admin/migrate (ADR-008, FTP-only hosting): the endpoint "does not
    // exist" (404) unless MIGRATE_TOKEN is configured, 403 on a wrong token,
    // 503 without a database. Returns null when the request may proceed.
    $adminGate = function (Request $request, Response $response) use ($json): ?Response {
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

        return null;
    };

    // ------------------------------------------------------------------
    // POST /api/admin/grant-role {email, role} — pre-P12 operations tooling
    // (M7): grant a referentiel §2 role to an existing account. Deploy-token
    // trust model; the P12 admin UI will replace it. Idempotent.
    // ------------------------------------------------------------------
    $app->post('/admin/grant-role', function (Request $request, Response $response) use ($json, $adminGate): Response {
        if (($denied = $adminGate($request, $response)) !== null) {
            return $denied;
        }

        $body = json_decode((string) $request->getBody(), true);
        $email = \is_array($body) && \is_string($body['email'] ?? null) ? trim($body['email']) : '';
        $role = \is_array($body) && \is_string($body['role'] ?? null) ? trim($body['role']) : '';
        if ($email === '' || $role === '') {
            return $json($response, ['error' => 'Fields "email" and "role" are required'], 422);
        }

        try {
            $pdo = Db::get();

            // Only the seeded referentiel §2 roles exist ("visiteur" is the
            // absence of a session, never a grantable role).
            $roleStmt = $pdo->prepare('SELECT id FROM roles WHERE name = ?');
            $roleStmt->execute([$role]);
            $roleId = $roleStmt->fetchColumn();
            if ($roleId === false) {
                return $json($response, ['error' => sprintf('Unknown role "%s" (referentiel §2 roles only)', $role)], 422);
            }

            $userStmt = $pdo->prepare('SELECT id FROM users WHERE email = ? AND deleted_at IS NULL');
            $userStmt->execute([$email]);
            $userId = $userStmt->fetchColumn();
            if ($userId === false) {
                return $json($response, ['error' => 'Unknown account'], 404);
            }

            $insert = $pdo->prepare('INSERT IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)');
            $insert->execute([(int) $userId, (int) $roleId]);
            $status = $insert->rowCount() > 0 ? 'granted' : 'unchanged';

            // §6.5: a privileged role grant is traceable — ids and the role
            // name (a whitelisted referentiel §2 value, not PII) only, never
            // the email. The actor is the deploy token, so user_id stays null
            // (system action), like the other X-Migrate-Token tooling.
            Audit::record($pdo, null, 'role_granted', [
                'targetUserId' => (int) $userId,
                'role' => $role,
                'status' => $status,
            ]);
        } catch (\Throwable $e) {
            error_log('[grant-role] ' . $e->getMessage());

            return $json($response, ['error' => 'Grant failed, see server log'], 500);
        }

        return $json($response, ['email' => $email, 'role' => $role, 'status' => $status]);
    });

    // ------------------------------------------------------------------
    // POST /api/admin/default-package {id, version} — operator validation of
    // the default prompt-package proposed to learners (P10 : proposition
    // promptologue + validation admin). Served by
    // GET /api/prompt-packages/default. The (id, version) MUST be published.
    // ------------------------------------------------------------------
    $app->post('/admin/default-package', function (Request $request, Response $response) use ($json, $adminGate): Response {
        if (($denied = $adminGate($request, $response)) !== null) {
            return $denied;
        }

        $body = json_decode((string) $request->getBody(), true);
        $id = \is_array($body) && \is_string($body['id'] ?? null) ? trim($body['id']) : '';
        $version = \is_array($body) && \is_string($body['version'] ?? null) ? trim($body['version']) : '';
        if ($id === '' || $version === '') {
            return $json($response, ['error' => 'Fields "id" and "version" are required'], 422);
        }

        try {
            $pdo = Db::get();
            if (!(new \Humanome\Packages\PromptPackageRepository($pdo))->isPublished($id, $version)) {
                return $json($response, ['error' => 'Unknown published version'], 404);
            }

            $settings = new \Humanome\Packages\SettingsRepository($pdo);
            $settings->set(\Humanome\Packages\SettingsRepository::DEFAULT_PACKAGE, [
                'id' => $id,
                'version' => $version,
                'validatedAt' => date('c'),
            ]);
            // A matching pending proposal is consumed by the validation.
            $proposal = $settings->get(\Humanome\Packages\SettingsRepository::DEFAULT_PACKAGE_PROPOSAL);
            if (\is_array($proposal) && ($proposal['id'] ?? null) === $id && ($proposal['version'] ?? null) === $version) {
                $settings->delete(\Humanome\Packages\SettingsRepository::DEFAULT_PACKAGE_PROPOSAL);
            }
        } catch (\Throwable $e) {
            error_log('[default-package] ' . $e->getMessage());

            return $json($response, ['error' => 'Update failed, see server log'], 500);
        }

        return $json($response, ['id' => $id, 'version' => $version, 'status' => 'default']);
    });

    // ------------------------------------------------------------------
    // POST /api/admin/maintenance — periodic housekeeping (P12.2, cahier §6),
    // production entry point for the OVH cron (no shell scripts ship to the
    // release, ADR-008 — same model as POST /api/admin/worker-tick). Idempotent.
    //
    // Purges dead share links past their 30-day grace window (expiry policy)
    // and resets the public-demo counters (drops past UTC days — today's live
    // row is kept so the daily budget breaker stays intact — plus expired PoW
    // challenges). Counters only, never any content (§6.5).
    //
    // The SQL is kept in sync with scripts/maintenance.php Maintenance::run()
    // (that class is the source of truth; this file must stay self-contained
    // for the release). Both are covered by tests asserting the same effects.
    // Recommended frequency: DAILY.
    // ------------------------------------------------------------------
    $app->post('/admin/maintenance', function (Request $request, Response $response) use ($json, $adminGate): Response {
        if (($denied = $adminGate($request, $response)) !== null) {
            return $denied;
        }

        try {
            $pdo = Db::get();

            $links = $pdo->query(
                'DELETE FROM share_links
                  WHERE (expires_at IS NOT NULL AND expires_at < (NOW() - INTERVAL 30 DAY))
                     OR (revoked_at IS NOT NULL AND revoked_at < (NOW() - INTERVAL 30 DAY))'
            );
            $shareLinksPurged = $links->rowCount();

            $demoDaysPruned = $pdo->query('DELETE FROM llm_usage_daily WHERE usage_date < UTC_DATE()')->rowCount();
            $powChallengesPruned = $pdo->query('DELETE FROM llm_pow_challenges WHERE expires_at < UNIX_TIMESTAMP()')->rowCount();
        } catch (\Throwable $e) {
            error_log('[maintenance] ' . $e->getMessage());

            return $json($response, ['error' => 'Maintenance failed, see server log'], 500);
        }

        return $json($response, [
            'shareLinksPurged' => $shareLinksPurged,
            'demoDaysPruned' => $demoDaysPruned,
            'powChallengesPruned' => $powChallengesPruned,
        ]);
    });
};
