<?php

declare(strict_types=1);

/**
 * Compétences ATOMIQUES (migration 016, cahier §3.5) : chaque compétence est
 * éditée / versionnée / gouvernée / concurrente INDÉPENDAMMENT.
 *
 * Lectures publiques : liste des compétences publiées, une compétence, ses
 * versions. Écritures épistémiarque : brouillon par compétence, édition avec
 * CONCURRENCE OPTIMISTE (en-tête If-Match = content_hash de base → 409 si
 * périmé), soumission au vote, vote (membres), entérinement à la majorité.
 * Coupe de release = assemblage des compétences publiées en un snapshot.
 */

use Humanome\Db;
use Humanome\Referentiel\CompetenceGovernance;
use Humanome\Referentiel\CompetenceRepository;
use Humanome\Referentiel\ConflictException;
use Humanome\Referentiel\InvalidDocumentException;
use Humanome\Referentiel\ReferentielRepository;
use Humanome\Referentiel\RoleGuard;
use Humanome\Referentiel\SnapshotAssembler;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use Slim\App;

return function (App $app): void {
    $json = function (Response $response, mixed $payload, int $status = 200): Response {
        $response->getBody()->write(json_encode(
            $payload,
            JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR,
        ));

        return $response->withHeader('Content-Type', 'application/json')->withStatus($status);
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
                error_log('[competences] ' . $e->getMessage());

                return $json($response, ['error' => 'Internal error'], 500);
            }
        };
    };

    $repo = static fn (): CompetenceRepository => new CompetenceRepository(Db::get());
    $gov = static fn (): CompetenceGovernance => new CompetenceGovernance(Db::get());
    $epistemiarque = RoleGuard::any('epistemiarque', 'admin');
    $member = RoleGuard::any('epistemiarque');

    $currentUserId = static function (): ?int {
        $id = $_SESSION['user_id'] ?? null;

        return \is_int($id) ? $id : (\is_string($id) && ctype_digit($id) ? (int) $id : null);
    };

    // ----------------------------------------------------------- public reads

    // Liste des compétences (dernière version publiée de chacune), triée par code.
    $app->get('/competences', $wrap(function (Request $request, Response $response) use ($json, $repo): Response {
        $out = array_map(
            static fn (array $c): array => CompetenceRepository::metadata($c),
            array_values($repo()->latestPublishedByCode()),
        );

        return $json($response, $out);
    }));

    // Une compétence : dernière version publiée AVEC contenu riche.
    $app->get('/competences/{code:[0-9]\.[0-9]{2}}', $wrap(
        function (Request $request, Response $response, array $args) use ($json, $repo): Response {
            $c = $repo()->latestPublished($args['code']);
            if ($c === null) {
                return $json($response, ['error' => 'Compétence introuvable'], 404);
            }

            return $json($response, ['id' => $c['id']] + CompetenceRepository::metadata($c) + ['content' => $c['content']]);
        }
    ));

    $app->get('/competences/{code:[0-9]\.[0-9]{2}}/versions', $wrap(
        function (Request $request, Response $response, array $args) use ($json, $repo): Response {
            return $json($response, array_map(
                static fn (array $c): array => CompetenceRepository::metadata($c),
                $repo()->publishedVersions($args['code']),
            ));
        }
    ));

    // -------------------------------------------- épistémiarque : atelier riche

    $withTally = static function (array $c) use ($gov): array {
        $payload = ['id' => $c['id']] + CompetenceRepository::metadata($c);
        if ($c['status'] === 'review') {
            $payload['tally'] = $gov()->tally($c['id']);
        }

        return $payload;
    };

    // Brouillons + propositions au vote (toutes compétences).
    $app->get('/competences/drafts', $wrap(
        function (Request $request, Response $response) use ($json, $repo, $withTally): Response {
            return $json($response, array_map($withTally, $repo()->editableVersions()));
        }
    ))->add($epistemiarque);

    // Un brouillon/proposition AVEC contenu (édition) + tally/votes si en vote.
    $app->get('/competences/drafts/{id:[0-9]+}', $wrap(
        function (Request $request, Response $response, array $args) use ($json, $repo, $gov): Response {
            $c = $repo()->findById((int) $args['id']);
            if ($c === null || $c['status'] === 'published') {
                return $json($response, ['error' => 'Brouillon introuvable'], 404);
            }
            $payload = ['id' => $c['id']] + CompetenceRepository::metadata($c) + ['content' => $c['content']];
            if ($c['status'] === 'review') {
                $payload['tally'] = $gov()->tally($c['id']);
                $payload['votes'] = $gov()->votes($c['id']);
            }

            return $json($response, $payload);
        }
    ))->add($epistemiarque);

    // Forke un brouillon d'UNE compétence depuis sa dernière version publiée.
    $app->post('/competences/{code:[0-9]\.[0-9]{2}}/drafts', $wrap(
        function (Request $request, Response $response, array $args) use ($json, $parseBody, $repo, $currentUserId): Response {
            $body = $parseBody($request);
            if ($body === null) {
                return $json($response, ['error' => 'Invalid JSON body'], 400);
            }
            $semver = $body['semver'] ?? null;
            if (!\is_string($semver) || $semver === '') {
                return $json($response, ['error' => 'Champ "semver" requis'], 422);
            }
            $draft = $repo()->createDraft($args['code'], $semver, $currentUserId());
            if ($draft === null) {
                return $json($response, ['error' => sprintf('Compétence publiée introuvable : %s', $args['code'])], 404);
            }

            return $json($response, ['id' => $draft['id']] + CompetenceRepository::metadata($draft) + ['content' => $draft['content']], 201);
        }
    ))->add($epistemiarque);

    // Édite le contenu d'un brouillon — CONCURRENCE OPTIMISTE via If-Match.
    $app->put('/competences/drafts/{id:[0-9]+}', $wrap(
        function (Request $request, Response $response, array $args) use ($json, $parseBody, $repo): Response {
            $content = $parseBody($request);
            if ($content === null || $content === []) {
                return $json($response, ['error' => 'Corps invalide : contenu de compétence attendu'], 400);
            }
            $ifMatch = trim($request->getHeaderLine('If-Match'), " \"");
            if ($ifMatch === '') {
                return $json($response, ['error' => 'Précondition requise (If-Match) : rechargez la compétence avant d\'enregistrer.'], 428);
            }
            $c = $repo()->updateDraft((int) $args['id'], $content, $ifMatch);
            if ($c === null) {
                return $json($response, ['error' => 'Brouillon introuvable'], 404);
            }

            return $json($response, ['id' => $c['id']] + CompetenceRepository::metadata($c) + ['content' => $c['content']]);
        }
    ))->add($epistemiarque);

    $app->post('/competences/drafts/{id:[0-9]+}/submit', $wrap(
        function (Request $request, Response $response, array $args) use ($json, $parseBody, $gov, $withTally, $currentUserId): Response {
            $body = $parseBody($request);
            if ($body === null) {
                return $json($response, ['error' => 'Invalid JSON body'], 400);
            }
            $decidimUrl = isset($body['decidimUrl']) && \is_string($body['decidimUrl']) ? $body['decidimUrl'] : null;
            $c = $gov()->submit((int) $args['id'], $decidimUrl, $currentUserId());
            if ($c === null) {
                return $json($response, ['error' => 'Brouillon introuvable'], 404);
            }

            return $json($response, $withTally($c));
        }
    ))->add($epistemiarque);

    $app->post('/competences/drafts/{id:[0-9]+}/withdraw', $wrap(
        function (Request $request, Response $response, array $args) use ($json, $gov, $withTally): Response {
            $c = $gov()->withdraw((int) $args['id']);
            if ($c === null) {
                return $json($response, ['error' => 'Brouillon introuvable'], 404);
            }

            return $json($response, $withTally($c));
        }
    ))->add($epistemiarque);

    $app->post('/competences/drafts/{id:[0-9]+}/publish', $wrap(
        function (Request $request, Response $response, array $args) use ($json, $parseBody, $repo): Response {
            $body = $parseBody($request);
            $releaseNote = isset($body['releaseNote']) && \is_string($body['releaseNote']) ? $body['releaseNote'] : null;
            $c = $repo()->publish((int) $args['id'], $releaseNote);
            if ($c === null) {
                return $json($response, ['error' => 'Brouillon introuvable'], 404);
            }

            return $json($response, ['id' => $c['id']] + CompetenceRepository::metadata($c));
        }
    ))->add($epistemiarque);

    // Propositions au vote (toutes compétences) + tally.
    $app->get('/competences/proposals', $wrap(
        function (Request $request, Response $response) use ($json, $repo, $gov): Response {
            $proposals = array_filter($repo()->editableVersions(), static fn (array $c): bool => $c['status'] === 'review');

            return $json($response, array_values(array_map(
                static fn (array $c): array => ['id' => $c['id']] + CompetenceRepository::metadata($c) + ['tally' => $gov()->tally($c['id'])],
                $proposals,
            )));
        }
    ))->add($epistemiarque);

    // Une proposition en détail : contenu proposé, version en vigueur, tally, votes.
    $app->get('/competences/proposals/{id:[0-9]+}', $wrap(
        function (Request $request, Response $response, array $args) use ($json, $repo, $gov): Response {
            $repository = $repo();
            $c = $repository->findById((int) $args['id']);
            if ($c === null || $c['status'] !== 'review') {
                return $json($response, ['error' => 'Proposition introuvable'], 404);
            }
            $current = $repository->latestPublished($c['code']);

            return $json($response, ['id' => $c['id']] + CompetenceRepository::metadata($c) + [
                'content' => $c['content'],
                'baseVersion' => $current !== null ? $current['semver'] : null,
                'baseContent' => $current !== null ? $current['content'] : null,
                'tally' => $gov()->tally($c['id']),
                'votes' => $gov()->votes($c['id']),
            ]);
        }
    ))->add($epistemiarque);

    // Dépose (ou change) le vote d'un membre. Membres épistémiarques uniquement.
    $app->post('/competences/proposals/{id:[0-9]+}/votes', $wrap(
        function (Request $request, Response $response, array $args) use ($json, $parseBody, $gov, $currentUserId): Response {
            $body = $parseBody($request);
            if ($body === null) {
                return $json($response, ['error' => 'Invalid JSON body'], 400);
            }
            $vote = $body['vote'] ?? null;
            if (!\is_string($vote)) {
                return $json($response, ['error' => 'Champ "vote" requis'], 422);
            }
            $comment = isset($body['comment']) && \is_string($body['comment']) ? $body['comment'] : null;
            $userId = $currentUserId();
            if ($userId === null) {
                return $json($response, ['error' => 'Authentication required'], 401);
            }
            $tally = $gov()->castVote((int) $args['id'], $userId, $vote, $comment);
            if ($tally === null) {
                return $json($response, ['error' => 'Proposition introuvable'], 404);
            }

            return $json($response, ['tally' => $tally]);
        }
    ))->add($member);

    // Coupe de release : assemble les compétences publiées en un snapshot de
    // référentiel immuable (semver strictement croissant + complétude 61/7,
    // SANS second vote — les changements ont déjà été entérinés par compétence).
    $app->post('/competences/release', $wrap(
        function (Request $request, Response $response) use ($json, $parseBody): Response {
            $body = $parseBody($request);
            if ($body === null) {
                return $json($response, ['error' => 'Invalid JSON body'], 400);
            }
            $semver = $body['semver'] ?? null;
            if (!\is_string($semver) || $semver === '') {
                return $json($response, ['error' => 'Champ "semver" requis'], 422);
            }
            $label = isset($body['label']) && \is_string($body['label']) ? $body['label'] : ('RESPIRE v' . $semver);
            $pdo = Db::get();
            $doc = (new SnapshotAssembler($pdo))->assembleDocument($semver, $label, 'Coupe de release depuis les compétences atomiques publiées');
            $result = (new ReferentielRepository($pdo))->cutReleaseFromDocument($doc);

            return $json($response, $result, $result['status'] === 'imported' ? 201 : 200);
        }
    ))->add($epistemiarque);
};
