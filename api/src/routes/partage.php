<?php

declare(strict_types=1);

/**
 * Partage adulte de l'interface ultime de cartographie (spécification §12).
 *
 * Pas de contrôle d'âge mais une AUTO-ATTESTATION : un compte n'obtient la
 * copie serveur d'une version partagée et son lien que s'il est marqué
 * adulte (users.adult_attested_at) ; sans attestation, tout reste local.
 * L'attestation est posée par l'apprenant lui-même, au moment de publier.
 *
 * La garantie « un mineur n'a jamais accès à la fonction » est tenue PAR LE
 * SERVEUR : POST /api/cartographies (type « partage ») et
 * POST /api/cartographies/{id}/share sur une version partagée répondent
 * 403 `adult_required` sans attestation, quoi qu'affiche le client.
 *
 * Retirer l'attestation EFFACE aussitôt toutes les versions partagées du
 * compte, et leurs liens (§12 : « pour les mineurs, ni copie serveur ni
 * partage ») : aucun compte sans attestation ne garde de copie serveur.
 * L'interface propose de les télécharger avant. Le retrait et une
 * publication simultanée sont sérialisés par le verrou de la ligne `users`
 * (Users::lockAdultAttestedAt), pris aussi par les routes de publication.
 *
 * Version GARANTIE (décision de Christian du 2026-10-14, journal D-42) : la
 * cartographie peut être publiée par un cartographe, à la demande de
 * l'apprenant ; le cartographe qui publie se porte garant d'avoir vérifié ce
 * que la personne a fait, ce que l'analyse par IA a détecté et ce qu'en a vu
 * le groupe classe. L'apprenant adulte crée un code de demande à usage unique
 * (Share\PublicationRequests) ; le cartographe l'ouvre, compose la version
 * dans son interface et la publie DANS LE COMPTE DE L'APPRENANT, privée et
 * sans lien, avec sa garantie (cartography_garanties). L'apprenant décide
 * seul de la partager ; le cartographe n'y a plus accès. Remplacer soi-même
 * une version garantie lui retire sa garantie (routes/cartographies.php).
 *
 * RGPD §6.5 : les événements d'audit ne portent que des compteurs et des
 * identifiants — jamais un code de demande ni un contenu.
 */

use Humanome\Auth\Audit;
use Humanome\Auth\RateLimiter;
use Humanome\Auth\Users;
use Humanome\Cartographe\Garanties;
use Humanome\Cartographies\CartographyRepository;
use Humanome\Db;
use Humanome\Middleware\RequireRole;
use Humanome\Share\PublicationRequests;
use Humanome\Share\SharedVersion;
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
                error_log('[partage] ' . $e->getMessage());

                return $json($response, ['error' => 'Erreur interne'], 500);
            }
        };
    };

    /**
     * État de l'attestation. `required` : le serveur exige l'attestation pour
     * toute version partagée — toujours vrai ici (non configurable).
     */
    $state = static function (\PDO $pdo, int $userId): array {
        $at = Users::adultAttestedAt($pdo, $userId);

        return [
            'adult' => $at !== null,
            'attestedAt' => $at === null ? null : str_replace(' ', 'T', $at),
            'required' => true,
        ];
    };

    $apprenant = RequireRole::any('apprenant');

    // ------------------------------------------------------------------
    // GET /api/auth/me/adult -> {adult, attestedAt, required}
    // ------------------------------------------------------------------
    $app->get('/auth/me/adult', $wrap(function (Request $request, Response $response) use ($json, $state): Response {
        return $json($response, $state(Db::get(), (int) $request->getAttribute('userId')));
    }))->add($apprenant);

    // ------------------------------------------------------------------
    // PUT /api/auth/me/adult {adult: bool} -> {adult, attestedAt, required,
    // deletedVersions?}
    // true : « J'atteste avoir 18 ans ou plus » (date conservée si déjà posée) ;
    // false : retrait — efface les versions partagées du compte et leurs liens.
    // ------------------------------------------------------------------
    $app->put('/auth/me/adult', $wrap(function (Request $request, Response $response) use ($json, $state): Response {
        $pdo = Db::get();
        $userId = (int) $request->getAttribute('userId');
        $data = (array) ($request->getParsedBody() ?? []);
        $adult = $data['adult'] ?? null;
        if (!\is_bool($adult)) {
            return $json($response, ['error' => 'Validation échouée', 'fields' => ['adult' => 'Attestation attendue (true ou false)']], 422);
        }

        $deleted = 0;
        $pdo->beginTransaction();
        try {
            $before = Users::lockAdultAttestedAt($pdo, $userId);
            Users::setAdultAttested($pdo, $userId, $adult);
            if ($adult && $before === null) {
                Audit::record($pdo, $userId, 'adult_attested');
            } elseif (!$adult) {
                $deleted = (new CartographyRepository($pdo))->deleteSharedVersionsOf($userId);
                // Les demandes de publication garantie en attente partent aussi :
                // sans attestation, aucune version ne doit pouvoir arriver (D-42).
                (new PublicationRequests($pdo))->deleteForApprenant($userId);
                if ($before !== null || $deleted > 0) {
                    Audit::record($pdo, $userId, 'adult_attestation_withdrawn', ['deletedVersions' => $deleted]);
                }
            }
            $pdo->commit();
        } catch (\Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $e;
        }

        return $json($response, $state($pdo, $userId) + ($adult ? [] : ['deletedVersions' => $deleted]));
    }))->add($apprenant);

    // ==================================================================
    // Version publiée par un cartographe, avec sa garantie (D-42).
    // ==================================================================

    $cartographe = RequireRole::any('cartographe');
    /** Documents bornés comme à la publication (routes/cartographies.php). */
    $maxDocumentBytes = 8 * 1024 * 1024;
    /** Codes essayés par cartographe et par heure (ouverture et publication). */
    $codeAttemptsPerHour = 30;

    $adultRequired = static fn () => ['error' => 'Le partage est réservé aux personnes majeures (attestation requise)', 'code' => 'adult_required'];

    // ------------------------------------------------------------------
    // GET /api/partage/versions — les versions partagées du compte (sans
    // document), avec leur garantie {par, date} quand un cartographe les a
    // publiées à la demande de l'apprenant, null sinon.
    // ------------------------------------------------------------------
    $app->get('/partage/versions', $wrap(function (Request $request, Response $response) use ($json): Response {
        return $json($response, (new CartographyRepository(Db::get()))->listSharedVersionsForUser((int) $request->getAttribute('userId')));
    }))->add($apprenant);

    // ------------------------------------------------------------------
    // POST /api/partage/demandes {replacesId?, adult: true} -> 201 {code,
    // createdAt, expiresAt, replaces} — l'apprenant demande qu'un cartographe
    // publie pour lui une version qu'il a vérifiée, avec sa garantie : un code
    // à usage unique (30 jours) à remettre au cartographe de son choix.
    // Réservé aux adultes : attestation du compte (relue sous verrou) ET case
    // de cette demande, comme à chaque publication (D-31).
    // ------------------------------------------------------------------
    $app->post('/partage/demandes', $wrap(function (Request $request, Response $response) use ($json, $adultRequired): Response {
        $pdo = Db::get();
        $userId = (int) $request->getAttribute('userId');
        $data = (array) ($request->getParsedBody() ?? []);

        $errors = [];
        if (($data['adult'] ?? null) !== true) {
            $errors['adult'] = 'Attestation de majorité requise pour cette demande';
        }
        $replacesId = $data['replacesId'] ?? null;
        if ($replacesId !== null && (!\is_int($replacesId) || (new CartographyRepository($pdo))->typeOwnedBy($replacesId, $userId) !== 'partage')) {
            $errors['replacesId'] = 'Version partagée introuvable';
        }
        if ($errors !== []) {
            return $json($response, ['error' => 'Validation échouée', 'fields' => $errors], 422);
        }

        $requests = new PublicationRequests($pdo);
        $pdo->beginTransaction();
        try {
            if (Users::lockAdultAttestedAt($pdo, $userId) === null) {
                $pdo->rollBack();

                return $json($response, $adultRequired(), 403);
            }
            if ($requests->countPending($userId) >= PublicationRequests::MAX_PENDING) {
                $pdo->rollBack();

                return $json($response, [
                    'error' => sprintf('Trop de demandes en attente (%d au plus) : annulez-en une, ou attendez qu’elle soit honorée', PublicationRequests::MAX_PENDING),
                ], 429);
            }
            $created = $requests->create($userId, $replacesId);
            // Identifiants seulement, jamais le code (§6.5).
            Audit::record($pdo, $userId, 'publication_request_created', ['replacesId' => $replacesId]);
            $pdo->commit();
        } catch (\Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $e;
        }

        return $json($response, $created, 201);
    }))->add($apprenant);

    // ------------------------------------------------------------------
    // GET /api/partage/demandes -> [{code, createdAt, expiresAt, replaces}]
    // (en attente seulement ; les demandes expirées sont effacées).
    // ------------------------------------------------------------------
    $app->get('/partage/demandes', $wrap(function (Request $request, Response $response) use ($json): Response {
        return $json($response, (new PublicationRequests(Db::get()))->listForApprenant((int) $request->getAttribute('userId')));
    }))->add($apprenant);

    // ------------------------------------------------------------------
    // DELETE /api/partage/demandes/{code} -> 204 ; 404 si ce n'est pas une
    // demande en attente du compte.
    // ------------------------------------------------------------------
    $app->delete('/partage/demandes/{code}', $wrap(function (Request $request, Response $response, array $args) use ($json): Response {
        $pdo = Db::get();
        $userId = (int) $request->getAttribute('userId');
        $code = (string) $args['code'];
        if (!PublicationRequests::isWellFormedCode($code) || !(new PublicationRequests($pdo))->cancel($userId, $code)) {
            return $json($response, ['error' => 'Demande introuvable'], 404);
        }
        Audit::record($pdo, $userId, 'publication_request_cancelled');

        return $response->withStatus(204);
    }))->add($apprenant);

    // ------------------------------------------------------------------
    // GET /api/cartographe/demandes/{code} — le cartographe ouvre la demande
    // qu'on lui a remise : {code, apprenant: {displayName}, garant:
    // {displayName}, createdAt, expiresAt, replaces: {titre} | null}. Un code
    // inconnu, expiré, consommé ou qui le désigne lui-même : même 404.
    // ------------------------------------------------------------------
    $app->get('/cartographe/demandes/{code}', $wrap(function (Request $request, Response $response, array $args) use ($json, $codeAttemptsPerHour): Response {
        $pdo = Db::get();
        $userId = (int) $request->getAttribute('userId');
        $limiter = new RateLimiter($pdo, $codeAttemptsPerHour, 3600);
        $attempts = $limiter->hit('carto-demande:' . $userId);
        if ($attempts > $codeAttemptsPerHour) {
            return $json($response, ['error' => 'Trop de tentatives, réessayez plus tard'], 429)
                ->withHeader('Retry-After', (string) $limiter->retryAfter($attempts));
        }

        $open = (new PublicationRequests($pdo))->findOpen((string) $args['code'], $userId);
        if ($open === null) {
            return $json($response, ['error' => 'Demande introuvable ou expirée'], 404);
        }
        $me = Users::findById($pdo, $userId);

        return $json($response, [
            'code' => $open['code'],
            'apprenant' => $open['apprenant'],
            'garant' => ['displayName' => (string) ($me['display_name'] ?? '')],
            'createdAt' => $open['createdAt'],
            'expiresAt' => $open['expiresAt'],
            'replaces' => $open['replaces'] === null ? null : ['titre' => $open['replaces']['titre']],
        ]);
    }))->add($cartographe);

    // ------------------------------------------------------------------
    // POST /api/cartographe/demandes/{code}/publier {document, garant: true}
    // -> 201 {replaced, apprenant: {displayName}, garantie: {par, date,
    // revisionId}}. Le cartographe publie DANS LE COMPTE DE L'APPRENANT la
    // version qu'il a vérifiée (liste blanche de la version partagée), privée
    // et sans lien, et y pose sa garantie ; la demande est consommée. Sous
    // verrou de la ligne de l'apprenant : sans son attestation, rien n'est
    // écrit (403). Remplacer une version (demande « à la place de ») garde
    // ses liens et remplace sa garantie.
    // ------------------------------------------------------------------
    $app->post('/cartographe/demandes/{code}/publier', $wrap(function (Request $request, Response $response, array $args) use ($json, $adultRequired, $maxDocumentBytes, $codeAttemptsPerHour): Response {
        $pdo = Db::get();
        $userId = (int) $request->getAttribute('userId');
        $code = (string) $args['code'];
        $limiter = new RateLimiter($pdo, $codeAttemptsPerHour, 3600);
        $attempts = $limiter->hit('carto-demande:' . $userId);
        if ($attempts > $codeAttemptsPerHour) {
            return $json($response, ['error' => 'Trop de tentatives, réessayez plus tard'], 429)
                ->withHeader('Retry-After', (string) $limiter->retryAfter($attempts));
        }

        $data = (array) ($request->getParsedBody() ?? []);
        $errors = [];
        if (($data['garant'] ?? null) !== true) {
            $errors['garant'] = 'La garantie doit être confirmée : vous vous portez garant de ce que vous publiez';
        }
        $document = $data['document'] ?? null;
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

        $requests = new PublicationRequests($pdo);
        $repo = new CartographyRepository($pdo);
        $pdo->beginTransaction();
        try {
            // Ordre des verrous : la ligne de l'apprenant (comme le retrait de
            // son attestation), puis la demande, relue sous verrou.
            $open = $requests->findOpen($code, $userId);
            if ($open === null) {
                $pdo->rollBack();

                return $json($response, ['error' => 'Demande introuvable ou expirée'], 404);
            }
            if (Users::lockAdultAttestedAt($pdo, $open['apprenantId']) === null) {
                $pdo->rollBack();

                return $json($response, $adultRequired(), 403);
            }
            $open = $requests->findOpen($code, $userId, true);
            if ($open === null) {
                $pdo->rollBack();

                return $json($response, ['error' => 'Demande introuvable ou expirée'], 404);
            }

            $replaced = $open['replaces'] !== null;
            if ($replaced) {
                $id = $open['replaces']['id'];
                if (!$repo->replaceSharedDocument($id, $open['apprenantId'], $titre, $document)) {
                    $pdo->rollBack();

                    return $json($response, ['error' => 'Demande introuvable ou expirée'], 404);
                }
            } else {
                $id = $repo->create($open['apprenantId'], 'partage', $titre, 'privee', $document, null, null, null);
            }
            $me = Users::findById($pdo, $userId);
            $garantie = (new Garanties($pdo))->setForPublication($id, $userId, (string) ($me['display_name'] ?? ''));
            $requests->consume($open['id']);
            Audit::record($pdo, $userId, 'shared_version_guaranteed', [
                'cartographyId' => $id,
                'apprenantId' => $open['apprenantId'],
                'replaced' => $replaced,
            ]);
            $pdo->commit();
        } catch (\Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $e;
        }

        return $json($response, ['replaced' => $replaced, 'apprenant' => $open['apprenant'], 'garantie' => $garantie], 201);
    }))->add($cartographe);
};
