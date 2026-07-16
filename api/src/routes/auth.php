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
use Humanome\Env;
use Humanome\Mail\MailerFactory;
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
        // D6 : le front sait s'il faut afficher l'avatar ou les initiales sans
        // tenter un GET d'image qui échouerait (avatar_mime, léger, pas le blob).
        'hasAvatar' => ($user['avatar_mime'] ?? null) !== null,
    ];

    // --- Vérification d'email (D5 / AD-D3) --------------------------------
    // Code à 4 chiffres, hashé en base, expiration 30 min, 5 essais max. Le
    // VRAI garde-fou du code court est le rate-limit du RENVOI (chaque renvoi
    // régénère le code et rouvre les 5 essais) : 5 × (renvois/heure) reste très
    // en-deçà de 10^4. Anti-énumération : mêmes réponses que le compte existe ou non.
    $CODE_TTL_SECONDS = 1800; // 30 minutes
    $MAX_CODE_ATTEMPTS = 5;

    /** Génère un code à 4 chiffres, le pose (hashé + expiration) et l'envoie par email. */
    $sendVerification = function (\PDO $pdo, int $userId, string $email) use ($CODE_TTL_SECONDS): void {
        $code = str_pad((string) random_int(0, 9999), 4, '0', STR_PAD_LEFT);
        $expiresAt = date('Y-m-d H:i:s', time() + $CODE_TTL_SECONDS);
        Users::setVerificationCode($pdo, $userId, Users::hashPassword($code), $expiresAt);

        $site = rtrim(Env::get('SITE_URL', 'https://humanome.xyz'), '/');
        $link = $site . '/#/activer?email=' . rawurlencode($email) . '&code=' . $code;
        $subject = 'humanome.xyz — activez votre compte';
        $body = implode("\n", [
            'Bonjour,',
            '',
            'Bienvenue sur humanome.xyz. Pour activer votre compte, votre code de confirmation est :',
            '',
            '    ' . $code,
            '',
            'Vous pouvez aussi cliquer ce lien — il vous connecte sans ressaisir votre mot de passe :',
            $link,
            '',
            'Ce code expire dans 30 minutes. Si vous n\'êtes pas à l\'origine de cette inscription, ignorez ce message.',
            '',
            '— L\'équipe humanome.xyz',
        ]);
        MailerFactory::default()->send($email, $subject, $body);
    };

    // ------------------------------------------------------------------
    // POST /api/auth/register — {email, emailConfirm, password, displayName}
    // Default role: apprenant (cahier §3.2). NE crée PAS de session : le compte
    // est NON activé jusqu'à /auth/activate (D5). Double saisie de l'email.
    // ------------------------------------------------------------------
    $app->post('/auth/register', function (Request $request, Response $response) use ($json, $clientIp, $credentials, $sendVerification): Response {
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
        $data = (array) ($request->getParsedBody() ?? []);
        // Double saisie : comparaison insensible à la casse (collage autorisé).
        $emailConfirm = \is_string($data['emailConfirm'] ?? null) ? mb_strtolower(trim($data['emailConfirm'])) : '';

        $errors = [];
        if ($email === '' || filter_var($email, FILTER_VALIDATE_EMAIL) === false || mb_strlen($email) > 255) {
            $errors['email'] = 'Adresse email invalide';
        } elseif ($emailConfirm !== $email) {
            $errors['emailConfirm'] = 'Les deux adresses email ne correspondent pas';
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
            $sendVerification($pdo, $userId, $email); // code posé + email envoyé
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

        // PAS de session : le compte n'est activé qu'après confirmation du code.
        return $json($response, [
            'status' => 'pending_activation',
            'email' => $email,
            'message' => 'Un code de confirmation à 4 chiffres vous a été envoyé par email.',
        ], 201);
    });

    // ------------------------------------------------------------------
    // POST /api/auth/activate — {email, code}
    // Active le compte (email_verified_at) ET ouvre la session (« premier
    // login qui confirme »). Anti-énumération : réponse générique. Code court :
    // 5 essais max/compte + rate-limit IP + expiration (D5).
    // ------------------------------------------------------------------
    $app->post('/auth/activate', function (Request $request, Response $response) use ($json, $clientIp, $userPayload, $MAX_CODE_ATTEMPTS): Response {
        if (!Db::isConfigured()) {
            return $json($response, ['error' => 'Service indisponible'], 503);
        }
        $pdo = Db::get();

        $data = (array) ($request->getParsedBody() ?? []);
        $email = \is_string($data['email'] ?? null) ? mb_strtolower(trim($data['email'])) : '';
        $code = \is_string($data['code'] ?? null) ? trim($data['code']) : '';
        if ($email === '' || preg_match('/^\d{4}$/', $code) !== 1) {
            return $json($response, ['error' => 'Email et code à 4 chiffres requis'], 422);
        }

        // Rate-limit IP : borne le brute-force du code court, tous comptes confondus.
        $limiter = new RateLimiter($pdo, 20, 900);
        $bucket = 'activate:' . hash('sha256', ClientIp::bucketIdentity($clientIp($request)));
        if ($limiter->isBlocked($bucket)) {
            $limiter->hit($bucket);

            return $json($response, ['error' => 'Trop de tentatives, réessayez plus tard'], 429)
                ->withHeader('Retry-After', (string) $limiter->retryAfter($limiter->attempts($bucket)));
        }
        $limiter->hit($bucket);

        $genericError = ['error' => 'Code invalide ou expiré'];
        $user = Users::findByEmail($pdo, $email);
        // Anti-énumération : même réponse si le compte est inconnu, déjà activé,
        // sans code, expiré, sur-tenté ou si le code est faux.
        if ($user === null
            || Users::isVerified($user)
            || ($user['verification_code_hash'] ?? null) === null
            || (int) ($user['verification_attempts'] ?? 0) >= $MAX_CODE_ATTEMPTS
            || strtotime((string) ($user['verification_expires_at'] ?? '1970-01-01')) < time()) {
            return $json($response, $genericError, 401);
        }

        if (!password_verify($code, (string) $user['verification_code_hash'])) {
            Users::bumpVerificationAttempts($pdo, (int) $user['id']);

            return $json($response, $genericError, 401);
        }

        // Code valide : active + ouvre la session (premier login qui confirme).
        Users::markVerified($pdo, (int) $user['id']);
        $csrfToken = Session::openForUser((int) $user['id']);
        $fresh = Users::findById($pdo, (int) $user['id']);

        return $json($response, [
            'user' => $userPayload($pdo, $fresh ?? $user),
            'csrfToken' => $csrfToken,
        ]);
    });

    // ------------------------------------------------------------------
    // POST /api/auth/resend — {email}
    // Renvoie un code (régénéré, essais remis à 0). C'est le VRAI garde-fou du
    // code court : rate-limit STRICT par compte ET par IP. Anti-énumération :
    // réponse générique quel que soit l'état du compte (D5).
    // ------------------------------------------------------------------
    $app->post('/auth/resend', function (Request $request, Response $response) use ($json, $clientIp, $sendVerification): Response {
        if (!Db::isConfigured()) {
            return $json($response, ['error' => 'Service indisponible'], 503);
        }
        $pdo = Db::get();

        $data = (array) ($request->getParsedBody() ?? []);
        $email = \is_string($data['email'] ?? null) ? mb_strtolower(trim($data['email'])) : '';

        $generic = ['status' => 'ok', 'message' => 'Si un compte non activé existe pour cette adresse, un nouveau code a été envoyé.'];
        if ($email === '' || filter_var($email, FILTER_VALIDATE_EMAIL) === false) {
            return $json($response, $generic);
        }

        // Rate-limit STRICT : 3 renvois/heure/compte, 10 renvois/heure/IP.
        $ipLimiter = new RateLimiter($pdo, 10, 3600);
        $ipBucket = 'resend:ip:' . hash('sha256', ClientIp::bucketIdentity($clientIp($request)));
        $acctLimiter = new RateLimiter($pdo, 3, 3600);
        $acctBucket = 'resend:acct:' . hash('sha256', $email);
        if ($ipLimiter->isBlocked($ipBucket) || $acctLimiter->isBlocked($acctBucket)) {
            $ipLimiter->hit($ipBucket);
            $acctLimiter->hit($acctBucket);

            return $json($response, ['error' => 'Trop de demandes de code, réessayez plus tard'], 429)
                ->withHeader('Retry-After', (string) $ipLimiter->retryAfter($ipLimiter->attempts($ipBucket)));
        }
        $ipLimiter->hit($ipBucket);
        $acctLimiter->hit($acctBucket);

        $user = Users::findByEmail($pdo, $email);
        if ($user !== null && !Users::isVerified($user)) {
            $sendVerification($pdo, (int) $user['id'], $email);
        }

        return $json($response, $generic);
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

        // Compte non activé (email non confirmé, D5) : 403 explicite + le front
        // propose de renvoyer le code. On ne consomme PAS le rate-limit (le mot
        // de passe est bon) et on n'ouvre PAS de session.
        if (!Users::isVerified($user)) {
            return $json($response, [
                'error' => 'Compte non activé : confirmez votre email avec le code reçu.',
                'code' => 'email_not_verified',
                'email' => (string) $user['email'],
            ], 403);
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

    // Session courante (utilisateur connecté) ou null — factorisé pour les
    // routes de profil (D6). CSRF couvert par le middleware global (mutations).
    $currentUserId = static function (): ?int {
        if (!Db::isConfigured() || !Session::exists()) {
            return null;
        }
        Session::start();

        return Session::userId();
    };

    // ------------------------------------------------------------------
    // PATCH /api/auth/me {displayName} — édition de l'identifiant en clair (D6).
    // ------------------------------------------------------------------
    $app->patch('/auth/me', function (Request $request, Response $response) use ($json, $userPayload, $currentUserId): Response {
        $userId = $currentUserId();
        if ($userId === null) {
            return $json($response, ['error' => 'Authentification requise'], 401);
        }
        $pdo = Db::get();
        $data = (array) ($request->getParsedBody() ?? []);
        $displayName = \is_string($data['displayName'] ?? null) ? trim($data['displayName']) : '';
        if ($displayName === '' || mb_strlen($displayName) > 190) {
            return $json($response, ['error' => 'Validation échouée', 'fields' => ['displayName' => 'Le nom affiché est requis (190 caractères maximum)']], 422);
        }

        Users::updateDisplayName($pdo, $userId, $displayName);

        return $json($response, ['user' => $userPayload($pdo, Users::findById($pdo, $userId) ?? [])]);
    });

    // ------------------------------------------------------------------
    // PUT /api/auth/me/avatar {avatar (base64), mime} — pose l'avatar (D6).
    // Le serveur VALIDE mime + magic number + taille (jamais confiance au client).
    // ------------------------------------------------------------------
    $app->put('/auth/me/avatar', function (Request $request, Response $response) use ($json, $currentUserId): Response {
        $userId = $currentUserId();
        if ($userId === null) {
            return $json($response, ['error' => 'Authentification requise'], 401);
        }
        $data = (array) ($request->getParsedBody() ?? []);
        $rawAvatar = \is_string($data['avatar'] ?? null) ? $data['avatar'] : '';
        $mime = \is_string($data['mime'] ?? null) ? strtolower(trim($data['mime'])) : '';
        // Tolère un data-URL « data:image/png;base64,… » comme du base64 nu.
        if (preg_match('#^data:([^;,]+);base64,(.*)$#s', $rawAvatar, $m) === 1) {
            if ($mime === '') {
                $mime = strtolower(trim($m[1]));
            }
            $rawAvatar = $m[2];
        }
        $bytes = base64_decode(preg_replace('/\s+/', '', $rawAvatar) ?? '', true);
        if ($bytes === false || $bytes === '') {
            return $json($response, ['error' => 'Données d’image invalides (base64 attendu)'], 422);
        }
        $error = \Humanome\Media\AvatarValidator::validate($bytes, $mime);
        if ($error !== null) {
            return $json($response, ['error' => $error], 422);
        }

        Users::setAvatar(Db::get(), $userId, $bytes, $mime);

        return $json($response, ['status' => 'ok', 'mime' => $mime, 'size' => \strlen($bytes)]);
    });

    // ------------------------------------------------------------------
    // DELETE /api/auth/me/avatar — retrait indépendant de l'avatar (D6/RGPD).
    // ------------------------------------------------------------------
    $app->delete('/auth/me/avatar', function (Request $request, Response $response) use ($json, $currentUserId): Response {
        $userId = $currentUserId();
        if ($userId === null) {
            return $json($response, ['error' => 'Authentification requise'], 401);
        }
        Users::deleteAvatar(Db::get(), $userId);

        return $response->withStatus(204);
    });

    // ------------------------------------------------------------------
    // GET /api/users/{id}/avatar — sert l'image (cache privé, 404 si absente).
    // Public en LECTURE (une photo de profil n'est pas un secret) mais borné :
    // seul l'octet-flux, pas d'énumération d'autres données.
    // ------------------------------------------------------------------
    $app->get('/users/{id:[0-9]+}/avatar', function (Request $request, Response $response, array $args) use ($json): Response {
        if (!Db::isConfigured()) {
            return $json($response, ['error' => 'Service indisponible'], 503);
        }
        $avatar = Users::getAvatar(Db::get(), (int) $args['id']);
        if ($avatar === null) {
            return $json($response, ['error' => 'Avatar introuvable'], 404);
        }
        $response->getBody()->write($avatar['bytes']);

        return $response
            ->withHeader('Content-Type', $avatar['mime'])
            ->withHeader('Cache-Control', 'private, max-age=300')
            ->withStatus(200);
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
