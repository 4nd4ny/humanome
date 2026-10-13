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
 * Retirer l'attestation révoque immédiatement tous les liens actifs des
 * versions partagées du compte : ce qui était visible cesse de l'être. Les
 * versions restent consultables et téléchargeables par leur auteur, qui peut
 * les effacer à tout moment (DELETE /api/cartographies/{id}).
 *
 * RGPD §6.5 : les événements d'audit ne portent que des compteurs.
 */

use Humanome\Auth\Audit;
use Humanome\Auth\Users;
use Humanome\Db;
use Humanome\Middleware\RequireRole;
use Humanome\Share\ShareLinks;
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
    // PUT /api/auth/me/adult {adult: bool} -> {adult, attestedAt, required}
    // true : « J'atteste être majeur·e » (date conservée si déjà posée) ;
    // false : retrait — révoque les liens actifs des versions partagées.
    // ------------------------------------------------------------------
    $app->put('/auth/me/adult', $wrap(function (Request $request, Response $response) use ($json, $state): Response {
        $pdo = Db::get();
        $userId = (int) $request->getAttribute('userId');
        $data = (array) ($request->getParsedBody() ?? []);
        $adult = $data['adult'] ?? null;
        if (!\is_bool($adult)) {
            return $json($response, ['error' => 'Validation échouée', 'fields' => ['adult' => 'Attestation attendue (true ou false)']], 422);
        }

        $before = Users::adultAttestedAt($pdo, $userId);
        Users::setAdultAttested($pdo, $userId, $adult);
        if ($adult && $before === null) {
            Audit::record($pdo, $userId, 'adult_attested');
        } elseif (!$adult) {
            $revoked = (new ShareLinks($pdo))->revokeSharedVersionsOf($userId);
            if ($before !== null || $revoked > 0) {
                Audit::record($pdo, $userId, 'adult_attestation_withdrawn', ['revokedLinks' => $revoked]);
            }
        }

        return $json($response, $state($pdo, $userId));
    }))->add($apprenant);
};
