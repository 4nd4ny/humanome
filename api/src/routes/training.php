<?php

declare(strict_types=1);

/**
 * Training progress (P8, cahier §4.6) — per-account chapter completion of
 * the formation parcours. The CONTENT of the formation is public static
 * Markdown (content/formation/); only the progression is account data.
 *
 * Access: any logged-in user, own progression only (docs/autorisations.md).
 * PUT rides the global CSRF middleware. Storage is the (user_id, parcours,
 * chapitre) primary key of migration 005: completed=true upserts the row,
 * completed=false deletes it — no content, no timestamps beyond completed_at.
 */

use Humanome\Auth\Session;
use Humanome\Db;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use Slim\App;

return function (App $app): void {
    /** Identifier shape for parcours and chapitre slugs (e.g. "01-bien-rediger"). */
    $slugPattern = '/^[a-z0-9][a-z0-9._-]{0,63}$/';

    $json = function (Response $response, mixed $payload, int $status = 200): Response {
        $response->getBody()->write(json_encode(
            $payload,
            JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES,
        ));

        return $response
            ->withHeader('Content-Type', 'application/json')
            ->withStatus($status);
    };

    // "Connecté" access (autorisations matrix): a session is enough, no role
    // needed — same inline pattern as GET /api/auth/me.
    $currentUserId = function (): ?int {
        if (!Db::isConfigured() || !Session::exists()) {
            return null;
        }
        Session::start();

        return Session::userId();
    };

    /** All parcours of the user: {<parcours>: {chapitresTermines: [...]}}. */
    $progressPayload = function (int $userId): \stdClass {
        $stmt = Db::get()->prepare(
            'SELECT parcours, chapitre FROM training_progress
              WHERE user_id = ? ORDER BY parcours, chapitre'
        );
        $stmt->execute([$userId]);

        $payload = new \stdClass();
        foreach ($stmt->fetchAll() as $row) {
            $parcours = (string) $row['parcours'];
            $payload->{$parcours} ??= ['chapitresTermines' => []];
            $payload->{$parcours}['chapitresTermines'][] = (string) $row['chapitre'];
        }

        return $payload; // stdClass so an empty progression encodes as {}
    };

    // ------------------------------------------------------------------
    // GET /api/training/progress -> {apprenant: {chapitresTermines: [...]}}
    // ------------------------------------------------------------------
    $app->get('/training/progress', function (Request $request, Response $response) use ($json, $currentUserId, $progressPayload): Response {
        $userId = $currentUserId();
        if ($userId === null) {
            return $json($response, ['error' => 'Authentification requise'], 401);
        }

        return $json($response, $progressPayload($userId));
    });

    // ------------------------------------------------------------------
    // PUT /api/training/progress — {parcours, chapitre, completed: bool}.
    // Idempotent both ways; answers the full refreshed progression.
    // ------------------------------------------------------------------
    $app->put('/training/progress', function (Request $request, Response $response) use ($json, $currentUserId, $progressPayload, $slugPattern): Response {
        $userId = $currentUserId();
        if ($userId === null) {
            return $json($response, ['error' => 'Authentification requise'], 401);
        }

        $data = (array) ($request->getParsedBody() ?? []);
        $errors = [];
        $parcours = \is_string($data['parcours'] ?? null) ? $data['parcours'] : '';
        if (preg_match($slugPattern, $parcours) !== 1) {
            $errors['parcours'] = 'Identifiant de parcours invalide';
        }
        $chapitre = \is_string($data['chapitre'] ?? null) ? $data['chapitre'] : '';
        if (preg_match($slugPattern, $chapitre) !== 1) {
            $errors['chapitre'] = 'Identifiant de chapitre invalide';
        }
        if (!\is_bool($data['completed'] ?? null)) {
            $errors['completed'] = 'completed doit être un booléen';
        }
        if ($errors !== []) {
            return $json($response, ['error' => 'Validation échouée', 'fields' => $errors], 422);
        }

        $pdo = Db::get();
        if ($data['completed'] === true) {
            $pdo->prepare(
                'INSERT INTO training_progress (user_id, parcours, chapitre) VALUES (?, ?, ?)
                 ON DUPLICATE KEY UPDATE completed_at = completed_at'
            )->execute([$userId, $parcours, $chapitre]);
        } else {
            $pdo->prepare(
                'DELETE FROM training_progress WHERE user_id = ? AND parcours = ? AND chapitre = ?'
            )->execute([$userId, $parcours, $chapitre]);
        }

        return $json($response, $progressPayload($userId));
    });
};
