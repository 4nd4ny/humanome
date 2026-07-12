<?php

declare(strict_types=1);

/**
 * Review surface of a cartography (P9, cahier §3.3, §8): annotations,
 * schema-validated revisions and the garantie.
 *
 * WHO MAY DO WHAT (docs/autorisations.md):
 *   - annotate / revise / read the trail: the OWNER of the cartography, or a
 *     LINKED cartographe while the visibility is 'cartographe'/'publique';
 *   - delete an annotation: its AUTHOR only;
 *   - pose / withdraw the garantie: a LINKED cartographe only — never the
 *     owner, never automatic (cahier §8: the human safeguard is mandatory).
 *
 * Every access failure (unknown id, foreign cartography, 'privee'
 * visibility, unlinked cartographe) answers the SAME 404 — no existence
 * oracle. Revisions are validated against schemas/cartographie-<type> via
 * Validation.php: nothing malformed ever lands in the history. Posting a
 * revision on a guaranteed cartography REMOVES the garantie (a modified
 * cartography is never presented as guaranteed) and audits garantie_retiree.
 */

use Humanome\Auth\Audit;
use Humanome\Auth\Users;
use Humanome\Cartographe\Annotations;
use Humanome\Cartographe\Garanties;
use Humanome\Cartographe\Links;
use Humanome\Cartographe\Revisions;
use Humanome\Db;
use Humanome\Middleware\RequireRole;
use Humanome\Validation;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use Slim\App;

return function (App $app): void {
    /** Same bound as the cartographies module (multi-MB merges fit). */
    $maxDocumentBytes = 8 * 1024 * 1024;
    $maxTexteChars = 5000;
    $maxNoteChars = 500;

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
                error_log('[annotations] ' . $e->getMessage());

                return $json($response, ['error' => 'Erreur interne'], 500);
            }
        };
    };

    /** Owner (apprenant) or linked cartographe — the review pair. */
    $reviewer = RequireRole::any('apprenant', 'cartographe');
    $cartographe = RequireRole::any('cartographe');

    $notFound = fn (Response $response): Response => $json($response, ['error' => 'Cartographie introuvable'], 404);

    /** @return array{level: string, type: string}|null */
    $access = function (Request $request, int $cartoId): ?array {
        return (new Links(Db::get()))->access(
            $cartoId,
            (int) $request->getAttribute('userId'),
            (array) $request->getAttribute('roles'),
        );
    };

    // ------------------------------------------------------------------
    // POST /api/cartographies/{id}/annotations — {competenceCode, type:
    // commentaire|hallucination|oubli, texte} -> 201 (owner or linked
    // cartographe).
    // ------------------------------------------------------------------
    $app->post('/cartographies/{id:[0-9]+}/annotations', $wrap(function (Request $request, Response $response, array $args) use ($json, $access, $notFound, $maxTexteChars): Response {
        $cartoId = (int) $args['id'];
        if ($access($request, $cartoId) === null) {
            return $notFound($response);
        }

        $data = (array) ($request->getParsedBody() ?? []);
        $errors = [];
        $competenceCode = \is_string($data['competenceCode'] ?? null) ? trim($data['competenceCode']) : '';
        if (preg_match('/^[1-7]\.\d{2}$/', $competenceCode) !== 1) {
            $errors['competenceCode'] = 'Code de compétence invalide (attendu : "<pôle 1-7>.<rang à 2 chiffres>", ex. "1.01")';
        }
        $type = $data['type'] ?? null;
        if (!\in_array($type, Annotations::TYPES, true)) {
            $errors['type'] = 'Type invalide (attendu : "commentaire", "hallucination" ou "oubli")';
        }
        $texte = \is_string($data['texte'] ?? null) ? trim($data['texte']) : '';
        if ($texte === '' || mb_strlen($texte) > $maxTexteChars) {
            $errors['texte'] = sprintf('Texte requis (%d caractères maximum)', $maxTexteChars);
        }
        if ($errors !== []) {
            return $json($response, ['error' => 'Validation échouée', 'fields' => $errors], 422);
        }

        $id = (new Annotations(Db::get()))->create(
            $cartoId,
            (int) $request->getAttribute('userId'),
            $competenceCode,
            (string) $type,
            $texte,
        );

        return $json($response, ['id' => $id], 201);
    }))->add($reviewer);

    // ------------------------------------------------------------------
    // GET /api/cartographies/{id}/annotations — the review trail (both).
    // ------------------------------------------------------------------
    $app->get('/cartographies/{id:[0-9]+}/annotations', $wrap(function (Request $request, Response $response, array $args) use ($json, $access, $notFound): Response {
        $cartoId = (int) $args['id'];
        if ($access($request, $cartoId) === null) {
            return $notFound($response);
        }

        return $json($response, (new Annotations(Db::get()))->listForCartography($cartoId));
    }))->add($reviewer);

    // ------------------------------------------------------------------
    // DELETE /api/annotations/{annotationId} — author only; a foreign
    // annotation answers like a missing one.
    // ------------------------------------------------------------------
    $app->delete('/annotations/{annotationId:[0-9]+}', $wrap(function (Request $request, Response $response, array $args) use ($json): Response {
        $deleted = (new Annotations(Db::get()))->deleteForAuthor(
            (int) $args['annotationId'],
            (int) $request->getAttribute('userId'),
        );
        if (!$deleted) {
            return $json($response, ['error' => 'Annotation introuvable'], 404);
        }

        return $response->withStatus(204);
    }))->add($reviewer);

    // ------------------------------------------------------------------
    // POST /api/cartographies/{id}/revisions — {document, note?} -> 201
    // {revisionId}. The document is validated against the schema matching
    // the cartography type (422 with pointer-keyed errors otherwise).
    // ------------------------------------------------------------------
    $app->post('/cartographies/{id:[0-9]+}/revisions', $wrap(function (Request $request, Response $response, array $args) use ($json, $access, $notFound, $maxDocumentBytes, $maxNoteChars): Response {
        $pdo = Db::get();
        $cartoId = (int) $args['id'];
        $userId = (int) $request->getAttribute('userId');

        $granted = $access($request, $cartoId);
        if ($granted === null) {
            return $notFound($response);
        }

        $data = (array) ($request->getParsedBody() ?? []);
        $errors = [];
        $document = $data['document'] ?? null;
        if (!\is_array($document) || $document === [] || array_is_list($document)) {
            $errors['document'] = 'Document requis (objet JSON de cartographie)';
        } elseif (\strlen(json_encode($document, JSON_UNESCAPED_UNICODE) ?: '') > $maxDocumentBytes) {
            $errors['document'] = 'Document trop volumineux (8 Mo maximum)';
        }
        $note = null;
        if (($data['note'] ?? null) !== null) {
            $note = \is_string($data['note']) ? trim($data['note']) : '';
            if ($note === '' || mb_strlen($note) > $maxNoteChars) {
                $errors['note'] = sprintf('Note invalide (%d caractères maximum)', $maxNoteChars);
            }
        }
        if ($errors !== []) {
            return $json($response, ['error' => 'Validation échouée', 'fields' => $errors], 422);
        }

        // Same type as the cartography, full server-side schema validation
        // (M7 contract): the revision history only ever holds documents that
        // replay. The schema's `kind` const pins the type equality.
        $kind = 'cartographie-' . $granted['type'];
        $result = Validation::validate($kind, $document);
        if (!$result['valid']) {
            return $json($response, [
                'error' => sprintf('Document invalide au schéma %s', $kind),
                'fields' => $result['errors'],
            ], 422);
        }

        ['revisionId' => $revisionId, 'garantieRemoved' => $garantieRemoved] =
            (new Revisions($pdo))->create($cartoId, $userId, $document, $note);

        if ($garantieRemoved) {
            // Cahier §8: a new revision invalidates the standing garantie.
            Audit::record($pdo, $userId, 'garantie_retiree', [
                'cartographieId' => $cartoId,
                'cause' => 'nouvelle_revision',
                'revisionId' => $revisionId,
            ]);
        }

        return $json($response, ['revisionId' => $revisionId], 201);
    }))->add($reviewer);

    // ------------------------------------------------------------------
    // GET /api/cartographies/{id}/revisions — metadata only (both parties).
    // ------------------------------------------------------------------
    $app->get('/cartographies/{id:[0-9]+}/revisions', $wrap(function (Request $request, Response $response, array $args) use ($json, $access, $notFound): Response {
        $cartoId = (int) $args['id'];
        if ($access($request, $cartoId) === null) {
            return $notFound($response);
        }

        return $json($response, (new Revisions(Db::get()))->listForCartography($cartoId));
    }))->add($reviewer);

    // ------------------------------------------------------------------
    // GET /api/revisions/{revisionId} — one revision WITH its document;
    // access follows the parent cartography.
    // ------------------------------------------------------------------
    $app->get('/revisions/{revisionId:[0-9]+}', $wrap(function (Request $request, Response $response, array $args) use ($json, $access): Response {
        $revision = (new Revisions(Db::get()))->find((int) $args['revisionId']);
        if ($revision === null || $access($request, $revision['cartographieId']) === null) {
            return $json($response, ['error' => 'Révision introuvable'], 404);
        }

        return $json($response, $revision);
    }))->add($reviewer);

    // ------------------------------------------------------------------
    // POST /api/cartographies/{id}/garantie — {revisionId?} -> 201, the
    // frozen state {par, date, revisionId}. LINKED cartographe only (the
    // owner never guarantees their own cartography — cahier §8); 409 when
    // another cartographe's garantie already stands.
    // ------------------------------------------------------------------
    $app->post('/cartographies/{id:[0-9]+}/garantie', $wrap(function (Request $request, Response $response, array $args) use ($json, $access, $notFound): Response {
        $pdo = Db::get();
        $cartoId = (int) $args['id'];
        $userId = (int) $request->getAttribute('userId');

        $granted = $access($request, $cartoId);
        if ($granted === null || $granted['level'] !== 'cartographe') {
            return $notFound($response);
        }

        $data = (array) ($request->getParsedBody() ?? []);
        $revisionId = null;
        if (($data['revisionId'] ?? null) !== null) {
            $revisionId = $data['revisionId'];
            if (!\is_int($revisionId) || !(new Revisions($pdo))->belongsTo($revisionId, $cartoId)) {
                return $json($response, [
                    'error' => 'Validation échouée',
                    'fields' => ['revisionId' => 'Révision inconnue pour cette cartographie'],
                ], 422);
            }
        }

        $user = Users::findById($pdo, $userId);
        if ($user === null) {
            return $json($response, ['error' => 'Authentification requise'], 401);
        }

        $garantie = (new Garanties($pdo))->pose($cartoId, $userId, (string) $user['display_name'], $revisionId);
        if ($garantie === null) {
            return $json($response, ['error' => 'Cartographie déjà garantie par un autre cartographe'], 409);
        }

        Audit::record($pdo, $userId, 'garantie_posee', [
            'cartographieId' => $cartoId,
            'revisionId' => $revisionId,
        ]);

        return $json($response, $garantie, 201);
    }))->add($cartographe);

    // ------------------------------------------------------------------
    // DELETE /api/cartographies/{id}/garantie — the SAME cartographe
    // withdraws their signature (always possible: it is their name).
    // ------------------------------------------------------------------
    $app->delete('/cartographies/{id:[0-9]+}/garantie', $wrap(function (Request $request, Response $response, array $args) use ($json): Response {
        $pdo = Db::get();
        $cartoId = (int) $args['id'];
        $userId = (int) $request->getAttribute('userId');

        if (!(new Garanties($pdo))->withdraw($cartoId, $userId)) {
            return $json($response, ['error' => 'Garantie introuvable'], 404);
        }

        Audit::record($pdo, $userId, 'garantie_retiree', [
            'cartographieId' => $cartoId,
            'cause' => 'retrait',
        ]);

        return $response->withStatus(204);
    }))->add($cartographe);
};
