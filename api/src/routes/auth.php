<?php

declare(strict_types=1);

/**
 * Authentication routes (P3.2) + registration of the global middlewares
 * (body parsing, CSRF — P3.3). Bootstrap stays untouched: route files own
 * their cross-cutting concerns and are loaded by glob().
 *
 * Error messages are user-facing, hence in French (convention CLAUDE.md).
 */

use Humanome\Auth\Audit;
use Humanome\Auth\RateLimiter;
use Humanome\Auth\Session;
use Humanome\Auth\Users;
use Humanome\ClientIp;
use Humanome\Db;
use Humanome\Middleware\CsrfMiddleware;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use Slim\App;

return function (App $app): void {
    $app->addBodyParsingMiddleware();
    $app->add(new CsrfMiddleware());

    $json = function (Response $response, array $payload, int $status = 200): Response {
        $response->getBody()->write(json_encode($payload, JSON_THROW_ON_ERROR));

        return $response
            ->withHeader('Content-Type', 'application/json')
            ->withStatus($status);
    };

    // Rate-limit key IP. REMOTE_ADDR is authoritative and the ONLY IP we trust:
    // on OVH mutualisé (behind the OVH IPLB) REMOTE_ADDR already carries the real
    // client IP. Client-supplied forwarding headers (X-Forwarded-For, X-Real-IP,
    // ...) are attacker-controlled and MUST NOT feed the limiter — trusting them
    // would let anyone reset their own bucket by rotating a spoofed header.
    // Buckets go through ClientIp::bucketIdentity: IPv6 is keyed per /64 so an
    // abuser cannot rotate the interface id of a single allocation to dodge the
    // limiter (register spam / login brute-force).
    $clientIp = fn (Request $request): string => (string) ($request->getServerParams()['REMOTE_ADDR']
        ?? $_SERVER['REMOTE_ADDR']
        ?? '');

    /** @return array{email: string, password: string, displayName: string} */
    $credentials = function (Request $request): array {
        $data = (array) ($request->getParsedBody() ?? []);

        return [
            'email' => \is_string($data['email'] ?? null)
                ? mb_strtolower(trim($data['email']))
                : '',
            'password' => \is_string($data['password'] ?? null) ? $data['password'] : '',
            'displayName' => \is_string($data['displayName'] ?? null)
                ? trim($data['displayName'])
                : '',
        ];
    };

    /** @param array<string, mixed> $user */
    $userPayload = fn (\PDO $pdo, array $user): array => [
        'id' => (int) $user['id'],
        'email' => (string) $user['email'],
        'displayName' => (string) $user['display_name'],
        'roles' => Users::rolesOf($pdo, (int) $user['id']),
    ];

    // ------------------------------------------------------------------
    // POST /api/auth/register — {email, password, displayName}
    // Default role: apprenant (cahier §3.2). Opens a session.
    // ------------------------------------------------------------------
    $app->post('/auth/register', function (Request $request, Response $response) use ($json, $clientIp, $credentials, $userPayload): Response {
        if (!Db::isConfigured()) {
            return $json($response, ['error' => 'Service indisponible'], 503);
        }
        $pdo = Db::get();

        // No CSRF token exists for a visitor: abuse is contained per IP
        // instead (rate limit, counted before any validation).
        $limiter = new RateLimiter($pdo, 10, 3600);
        $bucket = 'register:' . hash('sha256', ClientIp::bucketIdentity($clientIp($request)));
        $attempts = $limiter->hit($bucket);
        if ($attempts > 10) {
            return $json($response, ['error' => 'Trop de tentatives, réessayez plus tard'], 429)
                ->withHeader('Retry-After', (string) $limiter->retryAfter($attempts));
        }

        ['email' => $email, 'password' => $password, 'displayName' => $displayName] = $credentials($request);

        $errors = [];
        if ($email === '' || filter_var($email, FILTER_VALIDATE_EMAIL) === false || mb_strlen($email) > 255) {
            $errors['email'] = 'Adresse email invalide';
        }
        if (mb_strlen($password) < 10) {
            $errors['password'] = 'Le mot de passe doit contenir au moins 10 caractères';
        } elseif (\strlen($password) > 1024) {
            $errors['password'] = 'Mot de passe trop long';
        }
        if ($displayName === '' || mb_strlen($displayName) > 190) {
            $errors['displayName'] = 'Le nom affiché est requis (190 caractères maximum)';
        }
        if ($errors !== []) {
            return $json($response, ['error' => 'Validation échouée', 'fields' => $errors], 422);
        }

        if (Users::findByEmail($pdo, $email) !== null) {
            return $json($response, ['error' => 'Un compte existe déjà avec cette adresse email'], 409);
        }

        try {
            $pdo->beginTransaction();
            $userId = Users::create($pdo, $email, Users::hashPassword($password), $displayName);
            Users::assignRole($pdo, $userId, 'apprenant');
            Audit::record($pdo, $userId, Audit::ACCOUNT_CREATED);
            $pdo->commit();
        } catch (\PDOException $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            if ($e->getCode() === '23000') { // unique email, lost race
                return $json($response, ['error' => 'Un compte existe déjà avec cette adresse email'], 409);
            }
            throw $e;
        }

        $csrfToken = Session::openForUser($userId);
        $user = Users::findById($pdo, $userId);

        return $json($response, [
            'user' => $userPayload($pdo, $user ?? []),
            'csrfToken' => $csrfToken,
        ], 201);
    });

    // ------------------------------------------------------------------
    // POST /api/auth/login — {email, password}
    // Rate limited per IP+email: 5 attempts / 15 min, then 429 with a
    // progressive Retry-After. Session id regenerated (fixation).
    // ------------------------------------------------------------------
    $app->post('/auth/login', function (Request $request, Response $response) use ($json, $clientIp, $credentials, $userPayload): Response {
        if (!Db::isConfigured()) {
            return $json($response, ['error' => 'Service indisponible'], 503);
        }
        $pdo = Db::get();

        ['email' => $email, 'password' => $password] = $credentials($request);
        if ($email === '' || $password === '') {
            return $json($response, ['error' => 'Email et mot de passe requis'], 422);
        }

        $limiter = new RateLimiter($pdo, 5, 900);
        $bucket = 'login:' . hash('sha256', ClientIp::bucketIdentity($clientIp($request)) . '|' . $email);
        if ($limiter->isBlocked($bucket)) {
            // Blocked attempts still count: the delay keeps growing.
            $attempts = $limiter->hit($bucket);

            return $json($response, ['error' => 'Trop de tentatives de connexion, réessayez plus tard'], 429)
                ->withHeader('Retry-After', (string) $limiter->retryAfter($attempts));
        }

        $user = Users::findByEmail($pdo, $email);
        $hash = $user === null ? Users::dummyHash() : (string) $user['password_hash'];
        if (!password_verify($password, $hash) || $user === null) {
            $limiter->hit($bucket);

            return $json($response, ['error' => 'Identifiants invalides'], 401);
        }

        $limiter->reset($bucket);
        $csrfToken = Session::openForUser((int) $user['id']);

        return $json($response, [
            'user' => $userPayload($pdo, $user),
            'csrfToken' => $csrfToken,
        ]);
    });

    // ------------------------------------------------------------------
    // POST /api/auth/logout — destroys the session (CSRF protected).
    // ------------------------------------------------------------------
    $app->post('/auth/logout', function (Request $request, Response $response) use ($json): Response {
        if (!Db::isConfigured() || !Session::exists()) {
            return $json($response, ['error' => 'Authentification requise'], 401);
        }
        Session::start();
        if (Session::userId() === null) {
            return $json($response, ['error' => 'Authentification requise'], 401);
        }

        Session::destroy();

        return $response->withStatus(204);
    });

    // ------------------------------------------------------------------
    // GET /api/auth/me — profile + roles + CSRF token.
    // 401 without a session: the visitor is the absence of a session (§2).
    // ------------------------------------------------------------------
    $app->get('/auth/me', function (Request $request, Response $response) use ($json, $userPayload): Response {
        if (!Db::isConfigured() || !Session::exists()) {
            return $json($response, ['error' => 'Authentification requise'], 401);
        }
        Session::start();
        $userId = Session::userId();
        if ($userId === null) {
            return $json($response, ['error' => 'Authentification requise'], 401);
        }

        $pdo = Db::get();
        $user = Users::findById($pdo, $userId);
        if ($user === null) {
            Session::destroy(); // stale session of a purged account

            return $json($response, ['error' => 'Authentification requise'], 401);
        }

        return $json($response, [
            'user' => $userPayload($pdo, $user),
            'csrfToken' => Session::csrfToken(),
        ]);
    });

    // ------------------------------------------------------------------
    // DELETE /api/auth/account — RGPD purge (cahier §6.3), CSRF protected.
    // Real DELETE with FK cascades; the audit event is written with the
    // user id, then anonymized (SET NULL) by the purge itself.
    // ------------------------------------------------------------------
    $app->delete('/auth/account', function (Request $request, Response $response) use ($json): Response {
        if (!Db::isConfigured() || !Session::exists()) {
            return $json($response, ['error' => 'Authentification requise'], 401);
        }
        Session::start();
        $userId = Session::userId();
        if ($userId === null) {
            return $json($response, ['error' => 'Authentification requise'], 401);
        }

        $pdo = Db::get();
        try {
            $pdo->beginTransaction();
            Audit::record($pdo, $userId, Audit::ACCOUNT_DELETED);
            Users::purge($pdo, $userId);
            $pdo->commit();
        } catch (\Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $e;
        }

        // The purge already cascaded the session rows; this drops the PHP
        // side so the shutdown write cannot resurrect an orphan session.
        Session::destroy();

        return $response->withStatus(204);
    });
};
