<?php

declare(strict_types=1);

/**
 * Prompt packages (P8 + P10): published versions served to the run launcher,
 * the promptologue workshop (draft lifecycle, structural diff, default
 * package designation) and the admin import endpoint for FTP-only production.
 *
 * Reads are PUBLIC, like the referentiel (docs/autorisations.md): a
 * published package is a shareable artifact — its prompts describe the
 * method, never any learner data. The diff route only compares PUBLISHED
 * versions, so it is public too.
 *
 * Drafts (P10, cahier §3.4) are promptologue-only (RoleGuard, matrice
 * docs/autorisations.md — `admin` is not an implicit super-role) and strictly
 * OWNER-scoped: a foreign draft id answers 404 exactly like an unknown one.
 * Mutating routes ride the global CSRF middleware (routes/auth.php).
 *
 * POST /api/admin/import-prompt-package mirrors /api/admin/import-referentiel
 * (routes/system.php): X-Migrate-Token trust model (ADR-008, no SSH on OVH),
 * 404 unless MIGRATE_TOKEN is configured, idempotent by content hash.
 * (POST /api/admin/default-package lives in routes/system.php with the other
 * admin tooling.)
 */

use Humanome\Db;
use Humanome\Env;
use Humanome\Packages\InvalidPackageException;
use Humanome\Packages\PackageConflictException;
use Humanome\Packages\PackageDiff;
use Humanome\Packages\PromptPackageRepository;
use Humanome\Packages\SettingsRepository;
use Humanome\Referentiel\RoleGuard;
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
            } catch (PackageConflictException $e) {
                return $json($response, ['error' => $e->getMessage()], 409);
            } catch (InvalidPackageException $e) {
                return $json($response, ['error' => 'Document invalide', 'details' => $e->getErrors()], 422);
            } catch (PDOException $e) {
                error_log('[packages] ' . $e->getMessage());

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

    /** Authenticated user id — RoleGuard guarantees it is set on guarded routes. */
    $userId = static function (): int {
        $id = $_SESSION['user_id'] ?? null;

        return \is_int($id) ? $id : (int) (\is_string($id) && ctype_digit($id) ? $id : 0);
    };

    // Same intentional, load-bearing guard as routes/referentiel.php (see the
    // comment there): reads $_SESSION['user_id'] + roles fresh from the DB.
    $promptologue = RoleGuard::any('promptologue');

    // ------------------------------------------------------------------
    // GET /api/prompt-packages — published versions (id = package slug).
    // ------------------------------------------------------------------
    $app->get('/prompt-packages', $wrap(function (Request $request, Response $response) use ($json): Response {
        return $json($response, (new PromptPackageRepository(Db::get()))->listPublished());
    }));

    // ==================================================================
    // P10 — atelier promptologue. NOTE ORDRE DES ROUTES : les routes
    // /prompt-packages/drafts/** et /prompt-packages/default sont
    // enregistrées AVANT /prompt-packages/{id}/{version} — FastRoute prend
    // la première route déclarée qui matche, « drafts » et « default »
    // sont donc des identifiants de paquet réservés.
    // ==================================================================

    // ------------------------------------------------------------------
    // POST /api/prompt-packages/drafts {fromId, fromVersion, version, toId?}
    // (promptologue) — new draft forked from an existing version. `toId`
    // (nouveau nom de paquet) est REQUIS pour forker un paquet réservé
    // (source-unique, ex. twin6-ouverte) et ignoré sinon (D1/AD-D1).
    // ------------------------------------------------------------------
    $app->post('/prompt-packages/drafts', $wrap(function (Request $request, Response $response) use ($json, $parseBody, $userId): Response {
        $body = $parseBody($request);
        if ($body === null) {
            return $json($response, ['error' => 'Corps JSON invalide'], 400);
        }
        $fromId = $body['fromId'] ?? null;
        $fromVersion = $body['fromVersion'] ?? null;
        $version = $body['version'] ?? null;
        $toId = $body['toId'] ?? null;
        if (!\is_string($fromId) || $fromId === ''
            || !\is_string($fromVersion) || $fromVersion === ''
            || !\is_string($version) || $version === '') {
            return $json($response, [
                'error' => 'Champs requis : fromId, fromVersion (version source) et version (nouvelle version)',
            ], 422);
        }

        $draft = (new PromptPackageRepository(Db::get()))
            ->createDraft($fromId, $fromVersion, $version, $userId(), \is_string($toId) ? $toId : null);
        if ($draft === null) {
            return $json($response, ['error' => 'Version source introuvable'], 404);
        }

        return $json($response, [
            'draftId' => $draft['draftId'],
            'id' => $draft['id'],
            'version' => $draft['version'],
        ], 201);
    }))->add($promptologue);

    // ------------------------------------------------------------------
    // GET /api/prompt-packages/drafts — the author's drafts (metadata).
    // ------------------------------------------------------------------
    $app->get('/prompt-packages/drafts', $wrap(function (Request $request, Response $response) use ($json, $userId): Response {
        return $json($response, (new PromptPackageRepository(Db::get()))->listDrafts($userId()));
    }))->add($promptologue);

    // ------------------------------------------------------------------
    // GET /api/prompt-packages/drafts/{draftId} — one draft WITH document
    // (owner only; foreign/unknown id -> homogeneous 404). Editor reload.
    // ------------------------------------------------------------------
    $app->get('/prompt-packages/drafts/{draftId:[0-9]+}', $wrap(function (Request $request, Response $response, array $args) use ($json, $userId): Response {
        $draft = (new PromptPackageRepository(Db::get()))->findDraft((int) $args['draftId'], $userId());
        if ($draft === null) {
            return $json($response, ['error' => 'Brouillon introuvable'], 404);
        }

        return $json($response, $draft);
    }))->add($promptologue);

    // ------------------------------------------------------------------
    // GET /api/prompt-packages/drafts/{draftId}/diff-origin — diff structurel
    // du brouillon (fork renommé) contre SON original (metadata.forkedFrom).
    // Owner-scoped (findDraft) : « le diff fonctionne entre le fork et
    // l'original » (plan D1) même quand ils vivent sous des ids différents.
    // ------------------------------------------------------------------
    $app->get('/prompt-packages/drafts/{draftId:[0-9]+}/diff-origin', $wrap(function (Request $request, Response $response, array $args) use ($json, $userId): Response {
        $repo = new PromptPackageRepository(Db::get());
        $draft = $repo->findDraft((int) $args['draftId'], $userId());
        if ($draft === null) {
            return $json($response, ['error' => 'Brouillon introuvable'], 404);
        }
        $forked = $draft['document']['metadata']['forkedFrom'] ?? null;
        if (!\is_array($forked) || !\is_string($forked['id'] ?? null) || !\is_string($forked['version'] ?? null)) {
            return $json($response, ['error' => 'Ce brouillon n’a pas d’original de référence (ce n’est pas un fork renommé).'], 422);
        }
        $origin = $repo->findPublished($forked['id'], $forked['version']);
        if ($origin === null) {
            return $json($response, ['error' => 'Version d’origine introuvable (n’est plus publiée).'], 409);
        }

        return $json($response, PackageDiff::compute($origin, $draft['document']));
    }))->add($promptologue);

    // ------------------------------------------------------------------
    // PUT /api/prompt-packages/drafts/{draftId} {document} — replace the
    // draft's document (validated against schemas/prompt-package, id
    // invariant, version coherent). Published version -> 409.
    // Both body shapes are accepted (docs/contrats.md): the {document: …}
    // envelope of the M7 contract, or the bare document. Unambiguous: a
    // valid prompt-package never carries an object under a "document" key.
    // ------------------------------------------------------------------
    $app->put('/prompt-packages/drafts/{draftId:[0-9]+}', $wrap(function (Request $request, Response $response, array $args) use ($json, $parseBody, $userId): Response {
        $body = $parseBody($request);
        $doc = \is_array($body) && \is_array($body['document'] ?? null) ? $body['document'] : $body;
        if ($doc === null || $doc === []) {
            return $json($response, ['error' => 'Corps JSON invalide : document prompt-package complet attendu'], 400);
        }

        $draft = (new PromptPackageRepository(Db::get()))
            ->updateDraft((int) $args['draftId'], $doc, $userId());
        if ($draft === null) {
            return $json($response, ['error' => 'Brouillon introuvable'], 404);
        }

        return $json($response, $draft);
    }))->add($promptologue);

    // ------------------------------------------------------------------
    // POST /api/prompt-packages/drafts/{draftId}/publish {changelog} —
    // publication: semver STRICTLY increasing per package id, changelog
    // entry appended, immutable afterwards.
    // ------------------------------------------------------------------
    $app->post('/prompt-packages/drafts/{draftId:[0-9]+}/publish', $wrap(function (Request $request, Response $response, array $args) use ($json, $parseBody, $userId): Response {
        $body = $parseBody($request);
        if ($body === null) {
            return $json($response, ['error' => 'Corps JSON invalide'], 400);
        }
        $changelog = $body['changelog'] ?? null;
        if (!\is_string($changelog) || trim($changelog) === '') {
            return $json($response, ['error' => 'Champ requis : changelog (résumé des changements)'], 422);
        }

        $published = (new PromptPackageRepository(Db::get()))
            ->publishDraft((int) $args['draftId'], trim($changelog), $userId());
        if ($published === null) {
            return $json($response, ['error' => 'Brouillon introuvable'], 404);
        }

        return $json($response, $published);
    }))->add($promptologue);

    // ------------------------------------------------------------------
    // GET /api/prompt-packages/default — package proposed to learners:
    // validated setting first, else the most recently published version.
    // Public read (same policy as the published list).
    // ------------------------------------------------------------------
    $app->get('/prompt-packages/default', $wrap(function (Request $request, Response $response) use ($json): Response {
        $pdo = Db::get();
        $setting = (new SettingsRepository($pdo))->get(SettingsRepository::DEFAULT_PACKAGE);
        if (\is_array($setting) && \is_string($setting['id'] ?? null) && \is_string($setting['version'] ?? null)) {
            return $json($response, ['id' => $setting['id'], 'version' => $setting['version']]);
        }

        $latest = (new PromptPackageRepository($pdo))->latestPublishedAnyPackage();
        if ($latest === null) {
            return $json($response, ['error' => 'Aucun paquet publié'], 404);
        }

        return $json($response, $latest);
    }));

    // ------------------------------------------------------------------
    // GET /api/prompt-packages/{id}/diff/{v1}/{v2} — structural diff
    // between two PUBLISHED versions (public, like the referentiel diff).
    // ------------------------------------------------------------------
    $app->get('/prompt-packages/{id}/diff/{v1}/{v2}', $wrap(function (Request $request, Response $response, array $args) use ($json): Response {
        $repo = new PromptPackageRepository(Db::get());
        $from = $repo->findPublished((string) $args['id'], (string) $args['v1']);
        $to = $repo->findPublished((string) $args['id'], (string) $args['v2']);
        if ($from === null || $to === null) {
            return $json($response, ['error' => 'Version publiée introuvable'], 404);
        }

        return $json($response, PackageDiff::compute($from, $to));
    }));

    // ------------------------------------------------------------------
    // POST /api/prompt-packages/{id}/{version}/propose-default
    // (promptologue) — proposal, validated by the operator via
    // POST /api/admin/default-package (routes/system.php).
    // ------------------------------------------------------------------
    $app->post('/prompt-packages/{id}/{version}/propose-default', $wrap(function (Request $request, Response $response, array $args) use ($json, $userId): Response {
        $pdo = Db::get();
        $id = (string) $args['id'];
        $version = (string) $args['version'];
        if (!(new PromptPackageRepository($pdo))->isPublished($id, $version)) {
            return $json($response, ['error' => 'Version publiée introuvable'], 404);
        }

        (new SettingsRepository($pdo))->set(SettingsRepository::DEFAULT_PACKAGE_PROPOSAL, [
            'id' => $id,
            'version' => $version,
            'proposedBy' => $userId(),
            'proposedAt' => date('c'),
        ]);

        return $json($response, ['id' => $id, 'version' => $version, 'status' => 'proposed']);
    }))->add($promptologue);

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
