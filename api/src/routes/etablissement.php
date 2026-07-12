<?php

declare(strict_types=1);

/**
 * Establishment module (P11, cahier §3.7/§4.9/§7 — docs/plan-masse.md).
 *
 * Two actors (docs/autorisations.md):
 * - role `etablissement`: cohortes, LLM/budget config, mass runs, member
 *   documents (its own cohortes only, active membership required);
 * - role `apprenant`: joining a cohorte with EXPLICIT consent in the body
 *   ({"consentement": true} — the front displays CONSENT_TEXT), depositing
 *   a portfolio (the de-facto opt-in to server-side processing), quitting
 *   (consent withdrawal: membership + deposit purged, pending jobs
 *   cancelled; produced documents stay with the learner).
 *
 * All mutating routes ride the global CSRF middleware. Foreign ids answer
 * 404 exactly like missing ones (no existence oracle).
 */

use Humanome\Auth\Audit;
use Humanome\Db;
use Humanome\Etablissement\CohorteRepository;
use Humanome\Etablissement\ConfigRepository;
use Humanome\Keys\KeyVault;
use Humanome\Middleware\RequireRole;
use Humanome\Packages\PromptPackageRepository;
use Humanome\Referentiel\ReferentielRepository;
use Humanome\Worker\JobQueue;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use Slim\App;

return function (App $app): void {
    /** Displayed by the front next to the join button (plan-masse §6). */
    $consentText = 'En rejoignant cette cohorte, vous acceptez que l\'établissement '
        . 'voie les cartographies produites dans ce cadre.';

    $maxPortfolioBytes = 4 * 1024 * 1024;

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
                error_log('[etablissement] ' . $e->getMessage()); // SQL detail only in the server log

                return $json($response, ['error' => 'Erreur interne'], 500);
            }
        };
    };

    $cohortes = static fn (): CohorteRepository => new CohorteRepository(Db::get());
    $configs = static fn (): ConfigRepository => new ConfigRepository(Db::get(), KeyVault::masterKeyFromEnv());
    $queue = static fn (): JobQueue => new JobQueue(Db::get());
    $etablissement = RequireRole::any('etablissement');
    $apprenant = RequireRole::any('apprenant');

    // ==================================================================
    // Cohortes (role etablissement)
    // ==================================================================

    // POST /api/etablissement/cohortes {nom} -> 201 {id, codeInvitation}
    $app->post('/etablissement/cohortes', $wrap(function (Request $request, Response $response) use ($json, $cohortes): Response {
        $data = (array) ($request->getParsedBody() ?? []);
        $nom = \is_string($data['nom'] ?? null) ? trim($data['nom']) : '';
        if ($nom === '' || mb_strlen($nom) > 190) {
            return $json($response, ['error' => 'Validation échouée', 'fields' => ['nom' => 'Nom requis (190 caractères maximum)']], 422);
        }

        $created = $cohortes()->create((int) $request->getAttribute('userId'), $nom);

        return $json($response, $created, 201);
    }))->add($etablissement);

    // GET /api/etablissement/cohortes
    $app->get('/etablissement/cohortes', $wrap(function (Request $request, Response $response) use ($json, $cohortes): Response {
        return $json($response, $cohortes()->listForEtablissement((int) $request->getAttribute('userId')));
    }))->add($etablissement);

    // GET /api/etablissement/cohortes/{id} — members with consent + progress.
    $app->get('/etablissement/cohortes/{id:[0-9]+}', $wrap(function (Request $request, Response $response, array $args) use ($json, $cohortes, $consentText): Response {
        $cohorte = $cohortes()->findForEtablissement((int) $args['id'], (int) $request->getAttribute('userId'));
        if ($cohorte === null) {
            return $json($response, ['error' => 'Cohorte introuvable'], 404);
        }

        return $json($response, [
            'id' => (int) $cohorte['id'],
            'nom' => (string) $cohorte['nom'],
            'codeInvitation' => (string) $cohorte['code_invitation'],
            'createdAt' => str_replace(' ', 'T', (string) $cohorte['created_at']),
            'consentement' => $consentText,
            'membres' => $cohortes()->membersOf((int) $cohorte['id']),
        ]);
    }))->add($etablissement);

    // DELETE /api/etablissement/cohortes/{id} — real purge (FK cascade).
    $app->delete('/etablissement/cohortes/{id:[0-9]+}', $wrap(function (Request $request, Response $response, array $args) use ($json, $cohortes): Response {
        if (!$cohortes()->deleteForEtablissement((int) $args['id'], (int) $request->getAttribute('userId'))) {
            return $json($response, ['error' => 'Cohorte introuvable'], 404);
        }

        return $response->withStatus(204);
    }))->add($etablissement);

    // ==================================================================
    // Learner side: join / deposit / quit (role apprenant)
    // ==================================================================

    // GET /api/cohortes — cohortes the learner has joined (espace apprenant
    // « Mes cohortes ») : consent date, establishment, deposit state.
    $app->get('/cohortes', $wrap(function (Request $request, Response $response) use ($json, $cohortes): Response {
        return $json($response, $cohortes()->listForLearner((int) $request->getAttribute('userId')));
    }))->add($apprenant);

    // POST /api/cohortes/{code}/rejoindre {consentement: true} — the join IS
    // the explicit consent (plan-masse §6); idempotent (200 when already in).
    $app->post('/cohortes/{code:[A-Za-z0-9]{10}}/rejoindre', $wrap(function (Request $request, Response $response, array $args) use ($json, $cohortes, $consentText): Response {
        $data = (array) ($request->getParsedBody() ?? []);
        if (($data['consentement'] ?? null) !== true) {
            return $json($response, [
                'error' => 'Consentement explicite requis',
                'consentement' => $consentText,
            ], 422);
        }

        $cohorte = $cohortes()->findByCode((string) $args['code']);
        if ($cohorte === null) {
            return $json($response, ['error' => 'Cohorte introuvable'], 404);
        }

        $userId = (int) $request->getAttribute('userId');
        $created = $cohortes()->join($cohorte['id'], $userId);
        if ($created) {
            Audit::record(Db::get(), $userId, 'cohorte_joined', ['cohorteId' => $cohorte['id']]);
        }

        return $json($response, [
            'cohorteId' => $cohorte['id'],
            'nom' => $cohorte['nom'],
            'consentement' => $consentText,
        ], $created ? 201 : 200);
    }))->add($apprenant);

    // POST /api/cohortes/{id}/portfolio {titre, texte?, segments} — deposit =
    // de-facto opt-in to server-side processing; re-deposit replaces.
    $app->post('/cohortes/{id:[0-9]+}/portfolio', $wrap(function (Request $request, Response $response, array $args) use ($json, $cohortes, $maxPortfolioBytes): Response {
        $userId = (int) $request->getAttribute('userId');
        $cohorteId = (int) $args['id'];
        if (!$cohortes()->isMember($cohorteId, $userId)) {
            return $json($response, ['error' => 'Cohorte introuvable'], 404);
        }

        $data = (array) ($request->getParsedBody() ?? []);
        $errors = [];
        $titre = \is_string($data['titre'] ?? null) ? trim($data['titre']) : '';
        if ($titre === '' || mb_strlen($titre) > 190) {
            $errors['titre'] = 'Titre requis (190 caractères maximum)';
        }
        $texte = $data['texte'] ?? null;
        if ($texte !== null && !\is_string($texte)) {
            $errors['texte'] = 'texte doit être une chaîne';
        }

        $segments = $data['segments'] ?? null;
        $clean = [];
        if (!\is_array($segments) || !array_is_list($segments) || $segments === [] || \count($segments) > 366) {
            $errors['segments'] = 'segments requis : liste non vide de {date, texte} (366 maximum)';
        } else {
            $dates = [];
            foreach ($segments as $i => $segment) {
                $date = \is_array($segment) ? ($segment['date'] ?? null) : null;
                $segTexte = \is_array($segment) ? ($segment['texte'] ?? null) : null;
                if (!\is_string($date) || preg_match('/^\d{4}-\d{2}-\d{2}$/', $date) !== 1
                    || !\is_string($segTexte) || trim($segTexte) === '') {
                    $errors['segments'] = "segments[{$i}] invalide (attendu : {date: AAAA-MM-JJ, texte non vide})";
                    break;
                }
                if (isset($dates[$date])) {
                    $errors['segments'] = "date en double dans les segments : {$date}";
                    break;
                }
                $dates[$date] = true;
                $clean[] = ['date' => $date, 'texte' => $segTexte];
            }
        }
        if ($errors === []) {
            $size = \strlen(json_encode($clean, JSON_UNESCAPED_UNICODE) ?: '') + \strlen((string) $texte);
            if ($size > $maxPortfolioBytes) {
                $errors['segments'] = 'Portfolio trop volumineux (4 Mo maximum)';
            }
        }
        if ($errors !== []) {
            return $json($response, ['error' => 'Validation échouée', 'fields' => $errors], 422);
        }

        $id = $cohortes()->depositPortfolio($cohorteId, $userId, $titre, \is_string($texte) ? $texte : null, $clean);
        Audit::record(Db::get(), $userId, 'cohorte_portfolio_deposited', [
            'cohorteId' => $cohorteId,
            'segments' => \count($clean), // counters only, never content (§6.5)
        ]);

        return $json($response, ['id' => $id, 'segments' => \count($clean)], 201);
    }))->add($apprenant);

    // DELETE /api/cohortes/{id}/quitter — consent withdrawal (plan-masse §6):
    // membership + deposited portfolio purged, pending jobs cancelled;
    // produced documents stay with the learner, the establishment loses them.
    $app->delete('/cohortes/{id:[0-9]+}/quitter', $wrap(function (Request $request, Response $response, array $args) use ($json, $cohortes): Response {
        $userId = (int) $request->getAttribute('userId');
        if (!$cohortes()->quit((int) $args['id'], $userId)) {
            return $json($response, ['error' => 'Cohorte introuvable'], 404);
        }
        Audit::record(Db::get(), $userId, 'cohorte_quit', ['cohorteId' => (int) $args['id']]);

        return $response->withStatus(204);
    }))->add($apprenant);

    // GET /api/mes-documents-masse — the learner's OWN mass cartography day
    // documents (RGPD accès/portabilité, art. 15/20). The B2B endpoint above
    // only lets the establishment read them; a learner had no way to retrieve
    // or export the documents produced for them in a cohort. Returns their
    // documents regardless of current membership (art. 15 = access to data
    // held about oneself; leaving a cohort must not erase one's own copy).
    $app->get('/mes-documents-masse', $wrap(function (Request $request, Response $response) use ($json): Response {
        $userId = (int) $request->getAttribute('userId');

        $stmt = Db::get()->prepare(
            'SELECT j.id, j.run_id, j.day_date, j.document, r.cohorte_id, c.nom AS cohorte_nom,
                    r.prompt_package_slug, r.prompt_package_semver,
                    r.referentiel_id, r.referentiel_semver
               FROM mass_jobs j
               JOIN mass_runs r ON r.id = j.run_id
               JOIN cohortes c ON c.id = r.cohorte_id
              WHERE j.user_id = ? AND j.status = "done"
              ORDER BY j.day_date, j.id'
        );
        $stmt->execute([$userId]);

        $documents = [];
        foreach ($stmt->fetchAll() as $row) {
            $documents[] = [
                'jobId' => (int) $row['id'],
                'runId' => (int) $row['run_id'],
                'cohorteId' => (int) $row['cohorte_id'],
                'cohorte' => (string) $row['cohorte_nom'],
                'date' => (string) $row['day_date'],
                'promptPackage' => ['id' => (string) $row['prompt_package_slug'], 'version' => (string) $row['prompt_package_semver']],
                'referentiel' => ['id' => (string) $row['referentiel_id'], 'version' => (string) $row['referentiel_semver']],
                'document' => json_decode((string) $row['document'], true),
            ];
        }

        return $json($response, ['documents' => $documents]);
    }))->add($apprenant);

    // ==================================================================
    // LLM / budget configuration (role etablissement)
    // ==================================================================

    // PUT /api/etablissement/config {provider, endpointUrl?, apiKey?, model?, budgetCapUsd}
    // apiKey: absent = keep, "" = erase, value = replace (sodium, AD-4).
    // Raising the cap re-queues budget_exceeded work (plan-masse §4).
    $app->put('/etablissement/config', $wrap(function (Request $request, Response $response) use ($json, $configs, $queue): Response {
        $userId = (int) $request->getAttribute('userId');
        $data = (array) ($request->getParsedBody() ?? []);

        $errors = [];
        $provider = $data['provider'] ?? 'humanome';
        if (!\in_array($provider, ['humanome', 'endpoint'], true)) {
            $errors['provider'] = 'Fournisseur invalide (attendu : "humanome" ou "endpoint")';
        }
        $endpointUrl = $data['endpointUrl'] ?? null;
        if ($endpointUrl !== null) {
            if (!\is_string($endpointUrl) || preg_match('#^https?://#', $endpointUrl) !== 1 || \strlen($endpointUrl) > 255) {
                $errors['endpointUrl'] = 'URL http(s) requise (255 caractères maximum)';
            }
        }
        if ($provider === 'endpoint' && ($endpointUrl === null || $endpointUrl === '')) {
            $errors['endpointUrl'] = 'endpointUrl requis avec le fournisseur "endpoint"';
        }
        $apiKey = $data['apiKey'] ?? null;
        if ($apiKey !== null && (!\is_string($apiKey) || \strlen($apiKey) > 400)) {
            $errors['apiKey'] = 'Clé invalide (400 caractères maximum)';
        }
        $model = $data['model'] ?? null;
        if ($model !== null && (!\is_string($model) || mb_strlen($model) > 120)) {
            $errors['model'] = 'Modèle invalide (120 caractères maximum)';
        }
        $cap = $data['budgetCapUsd'] ?? null;
        if (!\is_int($cap) && !\is_float($cap) || $cap < 0 || $cap > 99999999) {
            $errors['budgetCapUsd'] = 'budgetCapUsd requis (nombre entre 0 et 99 999 999)';
        }
        if ($errors !== []) {
            return $json($response, ['error' => 'Validation échouée', 'fields' => $errors], 422);
        }
        if (\is_string($apiKey) && $apiKey !== '' && KeyVault::masterKeyFromEnv() === null) {
            return $json($response, ['error' => 'Chiffrement des clés non configuré sur ce serveur'], 503);
        }

        $before = $configs()->find($userId);
        $previousCap = $before === null ? 0.0 : (float) $before['budget_cap_usd'];
        $configs()->save(
            $userId,
            (string) $provider,
            \is_string($endpointUrl) && $endpointUrl !== '' ? $endpointUrl : null,
            \is_string($apiKey) ? $apiKey : null,
            \is_string($model) && trim($model) !== '' ? trim($model) : null,
            (float) $cap,
        );
        if ((float) $cap > $previousCap) {
            $queue()->reactivateBudget($userId); // plan-masse §4: raising the cap resumes
        }
        Audit::record(Db::get(), $userId, 'etablissement_config_updated', [
            'provider' => (string) $provider,
            'budgetCapUsd' => (float) $cap,
        ]);

        return $json($response, $configs()->projection($userId));
    }))->add($etablissement);

    // GET /api/etablissement/config — NEVER the key (hasApiKey only).
    $app->get('/etablissement/config', $wrap(function (Request $request, Response $response) use ($json, $configs): Response {
        return $json($response, $configs()->projection((int) $request->getAttribute('userId')));
    }))->add($etablissement);

    // POST /api/etablissement/worker-token — machine-runner bearer token,
    // answered in clear exactly ONCE, stored hashed (share_links pattern).
    $app->post('/etablissement/worker-token', $wrap(function (Request $request, Response $response) use ($json, $configs): Response {
        $userId = (int) $request->getAttribute('userId');
        $token = $configs()->generateWorkerToken($userId);
        Audit::record(Db::get(), $userId, 'worker_token_generated', []);

        return $json($response, ['workerToken' => $token], 201)
            ->withHeader('Cache-Control', 'no-store'); // M6 lesson: never cache revealed secrets
    }))->add($etablissement);

    // ==================================================================
    // Mass runs (role etablissement)
    // ==================================================================

    // POST /api/etablissement/cohortes/{id}/runs {promptPackageId,
    // promptPackageVersion, membres?} -> 201 {runId, jobs}. Versions are
    // frozen on the run; only consented members WHO DEPOSITED are enqueued.
    $app->post('/etablissement/cohortes/{id:[0-9]+}/runs', $wrap(function (Request $request, Response $response, array $args) use ($json, $cohortes, $queue): Response {
        $userId = (int) $request->getAttribute('userId');
        $cohorte = $cohortes()->findForEtablissement((int) $args['id'], $userId);
        if ($cohorte === null) {
            return $json($response, ['error' => 'Cohorte introuvable'], 404);
        }

        $data = (array) ($request->getParsedBody() ?? []);
        $errors = [];
        $packageId = \is_string($data['promptPackageId'] ?? null) ? trim($data['promptPackageId']) : '';
        $packageVersion = \is_string($data['promptPackageVersion'] ?? null) ? trim($data['promptPackageVersion']) : '';
        if ($packageId === '' || $packageVersion === '') {
            $errors['promptPackageId'] = 'promptPackageId et promptPackageVersion requis';
        }
        $membres = $data['membres'] ?? null;
        if ($membres !== null) {
            if (!\is_array($membres) || !array_is_list($membres)
                || $membres !== array_values(array_filter($membres, is_int(...)))) {
                $errors['membres'] = 'membres doit être une liste d\'identifiants entiers';
            }
        }
        if ($errors !== []) {
            return $json($response, ['error' => 'Validation échouée', 'fields' => $errors], 422);
        }

        $package = (new PromptPackageRepository(Db::get()))->findPublished($packageId, $packageVersion);
        if ($package === null) {
            return $json($response, ['error' => sprintf('Paquet de prompts publié introuvable : %s@%s', $packageId, $packageVersion)], 422);
        }
        $roles = array_map(
            static fn (array $p): string => (string) ($p['role'] ?? ''),
            array_filter((array) ($package['prompts'] ?? []), 'is_array'),
        );
        if (!\in_array('extraction-pole', $roles, true) || !\in_array('kairos', $roles, true)) {
            return $json($response, ['error' => 'Ce paquet ne contient pas les gabarits d\'extraction (extraction-pole + kairos)'], 422);
        }

        $referentiel = (new ReferentielRepository(Db::get()))->latestPublished('respire');
        if ($referentiel === null) {
            return $json($response, ['error' => 'Aucun référentiel publié'], 409);
        }

        $deposits = $cohortes()->depositsForRun((int) $cohorte['id'], $membres);
        if ($deposits === []) {
            return $json($response, ['error' => 'Aucun membre consenti n\'a déposé de portfolio dans cette cohorte'], 422);
        }

        $result = $queue()->enqueueRun(
            $userId,
            (int) $cohorte['id'],
            $packageId,
            $packageVersion,
            (string) $referentiel['referentielId'],
            (string) $referentiel['semver'],
            $deposits,
        );
        Audit::record(Db::get(), $userId, 'mass_run_created', [
            'runId' => $result['runId'],
            'cohorteId' => (int) $cohorte['id'],
            'jobs' => $result['jobs'],
        ]);

        return $json($response, $result, 201);
    }))->add($etablissement);

    // GET /api/etablissement/runs/{runId} — progress board.
    $app->get('/etablissement/runs/{runId:[0-9]+}', $wrap(function (Request $request, Response $response, array $args) use ($json, $queue): Response {
        $run = $queue()->runForEtablissement((int) $args['runId'], (int) $request->getAttribute('userId'));
        if ($run === null) {
            return $json($response, ['error' => 'Run introuvable'], 404);
        }
        $stats = $queue()->runStats((int) $run['id']);

        return $json($response, [
            'id' => (int) $run['id'],
            'cohorteId' => (int) $run['cohorte_id'],
            'status' => (string) $run['status'],
            'promptPackage' => ['id' => (string) $run['prompt_package_slug'], 'version' => (string) $run['prompt_package_semver']],
            'referentiel' => ['id' => (string) $run['referentiel_id'], 'version' => (string) $run['referentiel_semver']],
            'createdAt' => str_replace(' ', 'T', (string) $run['created_at']),
            'finishedAt' => $run['finished_at'] === null ? null : str_replace(' ', 'T', (string) $run['finished_at']),
        ] + $stats);
    }))->add($etablissement);

    // POST /api/etablissement/runs/{runId}/annuler — non-terminal jobs
    // cancelled; a worker mid-pole loses its conditional write and abandons.
    $app->post('/etablissement/runs/{runId:[0-9]+}/annuler', $wrap(function (Request $request, Response $response, array $args) use ($json, $queue): Response {
        $userId = (int) $request->getAttribute('userId');
        $run = $queue()->runForEtablissement((int) $args['runId'], $userId);
        if ($run === null) {
            return $json($response, ['error' => 'Run introuvable'], 404);
        }
        $queue()->cancelRun((int) $run['id']);
        Audit::record(Db::get(), $userId, 'mass_run_cancelled', ['runId' => (int) $run['id']]);

        return $json($response, ['id' => (int) $run['id'], 'status' => 'cancelled']);
    }))->add($etablissement);

    // GET /api/etablissement/membres/{userId}/documents — day documents
    // produced for THIS establishment's cohortes, ACTIVE membership required
    // (a member who quit takes their documents out of reach, plan-masse §6).
    // The front merges client-side through the engine (M8 decision).
    // NB: the placeholder is named membreId because Slim's invocation
    // strategy copies route arguments into request attributes — a {userId}
    // placeholder would overwrite RequireRole's authenticated userId.
    $app->get('/etablissement/membres/{membreId:[0-9]+}/documents', $wrap(function (Request $request, Response $response, array $args) use ($json): Response {
        $etablissementId = (int) $request->getAttribute('userId');
        $memberId = (int) $args['membreId'];

        $stmt = Db::get()->prepare(
            'SELECT j.id, j.run_id, j.day_date, j.document, r.cohorte_id, c.nom AS cohorte_nom,
                    r.prompt_package_slug, r.prompt_package_semver,
                    r.referentiel_id, r.referentiel_semver,
                    u.display_name, m.consent_at
               FROM mass_jobs j
               JOIN mass_runs r ON r.id = j.run_id
               JOIN cohortes c ON c.id = r.cohorte_id AND c.etablissement_id = ?
               JOIN cohorte_membres m ON m.cohorte_id = c.id AND m.user_id = j.user_id
               JOIN users u ON u.id = j.user_id
              WHERE j.user_id = ? AND j.status = "done"
              ORDER BY j.day_date, j.id'
        );
        $stmt->execute([$etablissementId, $memberId]);

        $membre = null;
        $documents = [];
        foreach ($stmt->fetchAll() as $row) {
            $membre ??= [
                'userId' => $memberId,
                'displayName' => (string) $row['display_name'],
                'consentAt' => str_replace(' ', 'T', (string) $row['consent_at']),
            ];
            $documents[] = [
                'jobId' => (int) $row['id'],
                'runId' => (int) $row['run_id'],
                'cohorteId' => (int) $row['cohorte_id'],
                'cohorte' => (string) $row['cohorte_nom'],
                'date' => (string) $row['day_date'],
                'promptPackage' => ['id' => (string) $row['prompt_package_slug'], 'version' => (string) $row['prompt_package_semver']],
                'referentiel' => ['id' => (string) $row['referentiel_id'], 'version' => (string) $row['referentiel_semver']],
                'document' => json_decode((string) $row['document'], true),
            ];
        }
        if ($documents === []) {
            // Homogeneous 404: unknown member, foreign member, member who
            // quit, or nothing produced yet — no membership oracle.
            return $json($response, ['error' => 'Aucun document pour ce membre'], 404);
        }

        // Envelope {membre, documents}: the establishment front shows WHO
        // consented and when next to the client-side merge (M8 decision).
        return $json($response, ['membre' => $membre, 'documents' => $documents]);
    }))->add($etablissement);
};
