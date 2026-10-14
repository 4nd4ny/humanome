<?php

declare(strict_types=1);

/**
 * Cartographies module (P8, cahier §3.2, §6) — server-side opt-in storage.
 *
 * RGPD: nothing lands here by default (client-first, carto-store IndexedDB) —
 * POST /api/cartographies IS the explicit opt-in of the learner, stamped
 * opt_in_at = NOW() at INSERT. The list projection never carries a document;
 * DELETE is a real purge (row + share_links by FK).
 *
 * Access (docs/autorisations.md): role `apprenant`, owner only. A non-owned
 * id answers 404 exactly like a missing one (no existence oracle). All
 * mutating routes ride the global CSRF middleware.
 */

use Humanome\Auth\Audit;
use Humanome\Auth\Users;
use Humanome\Cartographies\CartographyRepository;
use Humanome\Db;
use Humanome\Middleware\RequireRole;
use Humanome\Share\SharedVersion;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use Slim\App;

return function (App $app): void {
    /** Documents are bounded to keep the shared MySQL healthy (multi-MB merges fit). */
    $maxDocumentBytes = 8 * 1024 * 1024;
    $maxRunMetaBytes = 64 * 1024;

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
                error_log('[cartographies] ' . $e->getMessage()); // SQL detail only in the server log

                return $json($response, ['error' => 'Erreur interne'], 500);
            }
        };
    };

    $repo = static fn (): CartographyRepository => new CartographyRepository(Db::get());
    $apprenant = RequireRole::any('apprenant');

    // ------------------------------------------------------------------
    // POST /api/cartographies — the explicit server-storage opt-in (§6.2).
    // {type, titre, visibility, document, promptPackageId?,
    //  promptPackageVersion?, referentielId?, referentielVersion?, runMeta?}
    // -> 201 {id}
    // ------------------------------------------------------------------
    $app->post('/cartographies', $wrap(function (Request $request, Response $response) use ($json, $repo, $maxDocumentBytes, $maxRunMetaBytes): Response {
        $data = (array) ($request->getParsedBody() ?? []);
        $userId = (int) $request->getAttribute('userId');

        $errors = [];
        $type = $data['type'] ?? null;
        // 'twin9' (D12) : carto_evolutive natif d'une analyse approfondie,
        // même contrat d'opt-in que les autres types.
        // 'partage' (interface ultime, §12) : version partagée figée, réservée
        // aux comptes qui ont attesté leur majorité — sinon la fonction
        // n'existe pas (403, rien n'est écrit).
        if (!\in_array($type, ['jour', 'merge', 'twin9', 'partage'], true)) {
            $errors['type'] = 'Type invalide (attendu : "jour", "merge", "twin9" ou "partage")';
        }
        if ($type === 'partage' && Users::adultAttestedAt(Db::get(), $userId) === null) {
            return $json($response, ['error' => 'Le partage est réservé aux personnes majeures (attestation requise)', 'code' => 'adult_required'], 403);
        }
        // Le titre d'une version partagée est celui de l'instantané (relu avant
        // publication) : le titre envoyé à côté est ignoré.
        $titre = $type === 'partage' && \is_array($data['document'] ?? null) && \is_string($data['document']['title'] ?? null)
            ? trim($data['document']['title'])
            : (\is_string($data['titre'] ?? null) ? trim($data['titre']) : '');
        if ($titre === '' || mb_strlen($titre) > 190) {
            $errors['titre'] = 'Titre requis (190 caractères maximum)';
        }
        $visibility = $data['visibility'] ?? 'privee';
        if (!\in_array($visibility, ['privee', 'cartographe', 'publique'], true)) {
            $errors['visibility'] = 'Visibilité invalide (attendu : "privee", "cartographe" ou "publique")';
        } elseif ($type === 'partage' && $visibility !== 'privee') {
            $errors['visibility'] = 'Une version partagée reste privée : seul un lien la montre';
        }
        $document = $data['document'] ?? null;
        if (!\is_array($document) || $document === [] || array_is_list($document)) {
            $errors['document'] = 'Document requis (objet JSON de cartographie)';
        } elseif (\strlen(json_encode($document, JSON_UNESCAPED_UNICODE) ?: '') > $maxDocumentBytes) {
            $errors['document'] = 'Document trop volumineux (8 Mo maximum)';
        } elseif ($type === 'partage') {
            // Liste blanche de champs : ni portfolio, ni jury, ni dates plus fines que choisi.
            $errors += SharedVersion::validate($document);
        }
        if ($type === 'partage') {
            // Une version partagée ne porte que son document : ni métadonnées de
            // run, ni versions de paquet ou de référentiel (liste blanche, §12).
            foreach (['runMeta', 'promptPackageId', 'promptPackageVersion', 'referentielId', 'referentielVersion'] as $field) {
                if (($data[$field] ?? null) !== null) {
                    $errors[$field] = 'Champ non autorisé pour une version partagée';
                }
            }
        }
        $runMeta = $data['runMeta'] ?? null;
        if ($runMeta !== null) {
            if (!\is_array($runMeta) || array_is_list($runMeta)) {
                $errors['runMeta'] = 'runMeta doit être un objet JSON';
            } elseif (\strlen(json_encode($runMeta, JSON_UNESCAPED_UNICODE) ?: '') > $maxRunMetaBytes) {
                $errors['runMeta'] = 'runMeta trop volumineux (64 Ko maximum)';
            }
        }

        // Version references: both halves of a pair or neither, and the pair
        // must resolve to a PUBLISHED version — a cartography must never
        // point at a version that cannot be replayed.
        $promptVersionId = null;
        $packageId = $data['promptPackageId'] ?? null;
        $packageVersion = $data['promptPackageVersion'] ?? null;
        if ($packageId !== null || $packageVersion !== null) {
            if (!\is_string($packageId) || $packageId === '' || !\is_string($packageVersion) || $packageVersion === '') {
                $errors['promptPackageId'] = 'promptPackageId et promptPackageVersion vont ensemble';
            } else {
                $promptVersionId = $repo()->resolvePromptVersion($packageId, $packageVersion);
                if ($promptVersionId === null) {
                    $errors['promptPackageId'] = sprintf(
                        'Paquet de prompts publié introuvable : %s@%s',
                        $packageId,
                        $packageVersion,
                    );
                }
            }
        }
        $referentielVersionId = null;
        $refId = $data['referentielId'] ?? null;
        $refVersion = $data['referentielVersion'] ?? null;
        if ($refId !== null || $refVersion !== null) {
            if (!\is_string($refId) || $refId === '' || !\is_string($refVersion) || $refVersion === '') {
                $errors['referentielId'] = 'referentielId et referentielVersion vont ensemble';
            } else {
                $referentielVersionId = $repo()->resolveReferentielVersion($refId, $refVersion);
                if ($referentielVersionId === null) {
                    $errors['referentielId'] = sprintf(
                        'Version publiée du référentiel introuvable : %s@%s',
                        $refId,
                        $refVersion,
                    );
                }
            }
        }

        if ($errors !== []) {
            return $json($response, ['error' => 'Validation échouée', 'fields' => $errors], 422);
        }

        $create = static fn (): int => $repo()->create(
            $userId,
            (string) $type,
            $titre,
            (string) $visibility,
            $document,
            $promptVersionId,
            $referentielVersionId,
            $runMeta,
        );
        if ($type !== 'partage') {
            return $json($response, ['id' => $create()], 201);
        }

        // Version partagée : attestation relue SOUS VERROU et insertion dans la
        // même transaction — un retrait d'attestation simultané ne laisse
        // jamais une version derrière lui (routes/partage.php).
        $pdo = Db::get();
        $pdo->beginTransaction();
        try {
            if (Users::lockAdultAttestedAt($pdo, $userId) === null) {
                $pdo->rollBack();

                return $json($response, ['error' => 'Le partage est réservé aux personnes majeures (attestation requise)', 'code' => 'adult_required'], 403);
            }
            $id = $create();
            $pdo->commit();
        } catch (\Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $e;
        }

        return $json($response, ['id' => $id], 201);
    }))->add($apprenant);

    // ------------------------------------------------------------------
    // GET /api/cartographies — metadata only, NEVER the documents.
    // ------------------------------------------------------------------
    $app->get('/cartographies', $wrap(function (Request $request, Response $response) use ($json, $repo): Response {
        return $json($response, $repo()->listForUser((int) $request->getAttribute('userId')));
    }))->add($apprenant);

    // ------------------------------------------------------------------
    // GET /api/cartographies/{id} — everything, document included (owner).
    // ------------------------------------------------------------------
    $app->get('/cartographies/{id:[0-9]+}', $wrap(function (Request $request, Response $response, array $args) use ($json, $repo): Response {
        $carto = $repo()->findForUser((int) $args['id'], (int) $request->getAttribute('userId'));
        if ($carto === null) {
            return $json($response, ['error' => 'Cartographie introuvable'], 404);
        }

        return $json($response, $carto);
    }))->add($apprenant);

    // ------------------------------------------------------------------
    // PATCH /api/cartographies/{id} — {titre?, visibility?}.
    // ------------------------------------------------------------------
    $app->patch('/cartographies/{id:[0-9]+}', $wrap(function (Request $request, Response $response, array $args) use ($json, $repo): Response {
        $data = (array) ($request->getParsedBody() ?? []);
        $userId = (int) $request->getAttribute('userId');

        $errors = [];
        $sharedVersion = $repo()->typeOwnedBy((int) $args['id'], $userId) === 'partage';
        $titre = null;
        if (\array_key_exists('titre', $data)) {
            $titre = \is_string($data['titre']) ? trim($data['titre']) : '';
            if ($sharedVersion) {
                $errors['titre'] = 'Une version partagée est figée : publiez-en une nouvelle pour changer son titre';
            } elseif ($titre === '' || mb_strlen($titre) > 190) {
                $errors['titre'] = 'Titre requis (190 caractères maximum)';
            }
        }
        $visibility = null;
        if (\array_key_exists('visibility', $data)) {
            $visibility = $data['visibility'];
            if (!\in_array($visibility, ['privee', 'cartographe', 'publique'], true)) {
                $errors['visibility'] = 'Visibilité invalide (attendu : "privee", "cartographe" ou "publique")';
            } elseif ($visibility !== 'privee' && $sharedVersion) {
                $errors['visibility'] = 'Une version partagée reste privée : seul un lien la montre';
            }
        }
        if ($errors !== []) {
            return $json($response, ['error' => 'Validation échouée', 'fields' => $errors], 422);
        }

        if (!$repo()->updateForUser((int) $args['id'], $userId, $titre, $visibility)) {
            return $json($response, ['error' => 'Cartographie introuvable'], 404);
        }

        $carto = $repo()->findForUser((int) $args['id'], $userId);
        if ($carto === null) {
            return $json($response, ['error' => 'Cartographie introuvable'], 404);
        }
        unset($carto['document']); // PATCH answers metadata, not the payload

        return $json($response, $carto);
    }))->add($apprenant);

    // ------------------------------------------------------------------
    // PUT /api/cartographies/{id}/document {document} — une nouvelle version
    // partagée publiée À LA PLACE d'une autre (décision du 2026-10-14) : même
    // contrôle que la publication (attestation sous verrou, liste blanche),
    // les liens restent et montrent désormais ce document ; l'ancien est
    // effacé. Réservé aux versions partagées (type « partage »).
    // ------------------------------------------------------------------
    $app->put('/cartographies/{id:[0-9]+}/document', $wrap(function (Request $request, Response $response, array $args) use ($json, $repo, $maxDocumentBytes): Response {
        $data = (array) ($request->getParsedBody() ?? []);
        $userId = (int) $request->getAttribute('userId');
        $id = (int) $args['id'];

        $type = $repo()->typeOwnedBy($id, $userId);
        if ($type === null) {
            return $json($response, ['error' => 'Cartographie introuvable'], 404);
        }
        if ($type !== 'partage') {
            return $json($response, ['error' => 'Validation échouée', 'fields' => ['type' => 'Seule une version partagée se publie à la place d’une autre']], 422);
        }
        if (Users::adultAttestedAt(Db::get(), $userId) === null) {
            return $json($response, ['error' => 'Le partage est réservé aux personnes majeures (attestation requise)', 'code' => 'adult_required'], 403);
        }
        $document = $data['document'] ?? null;
        $errors = [];
        if (!\is_array($document) || $document === [] || array_is_list($document)) {
            $errors['document'] = 'Document requis (objet JSON de cartographie)';
        } elseif (\strlen(json_encode($document, JSON_UNESCAPED_UNICODE) ?: '') > $maxDocumentBytes) {
            $errors['document'] = 'Document trop volumineux (8 Mo maximum)';
        } else {
            $errors += SharedVersion::validate($document);
        }
        if ($errors !== []) {
            return $json($response, ['error' => 'Validation échouée', 'fields' => $errors], 422);
        }
        $titre = trim((string) $document['title']);

        $pdo = Db::get();
        $pdo->beginTransaction();
        try {
            if (Users::lockAdultAttestedAt($pdo, $userId) === null) {
                $pdo->rollBack();

                return $json($response, ['error' => 'Le partage est réservé aux personnes majeures (attestation requise)', 'code' => 'adult_required'], 403);
            }
            if (!$repo()->replaceSharedDocument($id, $userId, $titre, $document)) {
                $pdo->rollBack();

                return $json($response, ['error' => 'Cartographie introuvable'], 404);
            }
            Audit::record($pdo, $userId, 'shared_version_replaced', ['cartographyId' => $id]);
            $pdo->commit();
        } catch (\Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $e;
        }

        $carto = $repo()->findForUser($id, $userId);
        unset($carto['document']);

        return $json($response, $carto);
    }))->add($apprenant);

    // ------------------------------------------------------------------
    // DELETE /api/cartographies/{id} — real purge (row + share_links, FK).
    // ------------------------------------------------------------------
    $app->delete('/cartographies/{id:[0-9]+}', $wrap(function (Request $request, Response $response, array $args) use ($json, $repo): Response {
        if (!$repo()->deleteForUser((int) $args['id'], (int) $request->getAttribute('userId'))) {
            return $json($response, ['error' => 'Cartographie introuvable'], 404);
        }

        return $response->withStatus(204);
    }))->add($apprenant);
};
