<?php

declare(strict_types=1);

/**
 * P6 — platform LLM proxy + public Google Docs text proxy (cahier §3.1).
 *
 * Visitor routes (no role guard — the visitor is the absence of a session,
 * docs/autorisations.md). Anti-abuse guards, cheapest first: enabled switch,
 * honeypot, input size, proof of work (single-use, expiring), per-IP hourly
 * quota (hashed buckets), global daily token+budget circuit breaker.
 *
 * RGPD §6: prompts, responses and document contents are NEVER logged nor
 * stored — counters only (rate_limits, llm_usage_daily). The platform API
 * key (ANTHROPIC_API_KEY) travels only in the upstream request header.
 *
 * Contract of POST /api/llm — compatible with the engine 'proxy' transport
 * (engine/src/providers/index.js): client provider/model/maxTokens are
 * accepted but IGNORED (the server imposes api/config/demo.php — budget
 * safety); the answer mirrors the engine provider result shape.
 */

use Humanome\Auth\RateLimiter;
use Humanome\ClientIp;
use Humanome\Db;
use Humanome\Env;
use Humanome\Llm\AnthropicProvider;
use Humanome\Llm\DemoConfig;
use Humanome\Llm\HttpClientException;
use Humanome\Llm\LlmRuntime;
use Humanome\Llm\MockProvider;
use Humanome\Llm\PowChallenge;
use Humanome\Llm\Pricing;
use Humanome\Llm\UpstreamException;
use Humanome\Llm\UsageCounters;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use Slim\App;

return function (App $app): void {
    $json = function (Response $response, array $payload, int $status = 200): Response {
        $response->getBody()->write(json_encode($payload, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE));

        return $response
            ->withHeader('Content-Type', 'application/json')
            ->withStatus($status);
    };

    // REMOTE_ADDR only — client-supplied forwarding headers are attacker
    // controlled (same rationale as routes/auth.php).
    $clientIp = fn (Request $request): string => (string) ($request->getServerParams()['REMOTE_ADDR']
        ?? $_SERVER['REMOTE_ADDR']
        ?? '');

    // Shared per-IP hourly quota for POST /api/llm and GET /api/gdoc-text
    // (config perIpPerHour). Bucket is hashed — never a raw IP (§6.5). IPv6 is
    // bucketed by /64 (ClientIp): a whole /64 is one routine allocation, so
    // without this an abuser rotates the interface id for a fresh quota per
    // request — and gdoc-text, which has no daily breaker, would become an
    // unbounded proxy.
    $ipBucket = fn (Request $request): string => 'llm:' . hash('sha256', ClientIp::bucketIdentity($clientIp($request)));

    // ------------------------------------------------------------------
    // GET /api/llm/status — public, no sensitive figures (bool only).
    // ------------------------------------------------------------------
    $app->get('/llm/status', function (Request $request, Response $response) use ($json): Response {
        $config = DemoConfig::load();
        $remaining = false;
        if ($config->enabled && Db::isConfigured()) {
            try {
                $remaining = !(new UsageCounters(Db::get()))
                    ->isExhausted($config->dailyGlobalTokens, $config->dailyBudgetUsd);
            } catch (\Throwable) {
                $remaining = false;
            }
        }

        return $json($response, ['enabled' => $config->enabled, 'remainingToday' => $remaining]);
    });

    // ------------------------------------------------------------------
    // GET /api/llm/challenge — stateless proof-of-work challenge.
    // The client must find `nonce` such that sha256(challenge . ':' . nonce)
    // (hex digest of the UTF-8 concatenation) has >= difficultyBits leading
    // zero bits, then send {challenge, nonce} with POST /api/llm.
    // Each challenge is single-use and expires after 2 minutes.
    // ------------------------------------------------------------------
    $app->get('/llm/challenge', function (Request $request, Response $response) use ($json): Response {
        $config = DemoConfig::load();
        if (!$config->enabled) {
            return $json($response, ['error' => 'La démonstration est désactivée pour le moment.'], 503);
        }
        $secret = PowChallenge::secretFromEnv();
        if ($secret === '') {
            return $json($response, ['error' => 'Service indisponible'], 503);
        }

        $pow = new PowChallenge($secret, $config->powDifficultyBits);

        return $json($response, $pow->issue());
    });

    // ------------------------------------------------------------------
    // POST /api/llm — platform proxy for visitors without an account.
    // Body: {prompt, system?, challenge, nonce, website? (honeypot),
    //        provider?/model?/maxTokens? (ignored — server-imposed)}.
    // 200 -> {text, usage: {inputTokens, outputTokens}, model}
    // ------------------------------------------------------------------
    $app->post('/llm', function (Request $request, Response $response) use ($json, $clientIp, $ipBucket): Response {
        $config = DemoConfig::load();

        // 1. Kill switch (cheapest guard).
        if (!$config->enabled) {
            return $json($response, ['error' => 'La démonstration est désactivée pour le moment.'], 503);
        }
        if (!Db::isConfigured()) {
            return $json($response, ['error' => 'Service indisponible'], 503);
        }

        $data = (array) ($request->getParsedBody() ?? []);

        // 2. Honeypot: the hidden 'website' field must stay empty. Filled by
        // a bot -> deliberately banal 400, indistinguishable from a
        // validation error (no hint that it is a trap).
        if (\is_string($data['website'] ?? null) && trim($data['website']) !== '') {
            return $json($response, ['error' => 'Requête invalide'], 400);
        }

        $prompt = $data['prompt'] ?? null;
        $system = $data['system'] ?? null;
        if (!\is_string($prompt) || trim($prompt) === '') {
            return $json($response, ['error' => 'Le champ « prompt » est requis'], 422);
        }
        if ($system !== null && !\is_string($system)) {
            return $json($response, ['error' => 'Le champ « system » doit être une chaîne'], 422);
        }

        // 3. Input size cap.
        if (mb_strlen(($system ?? '') . $prompt) > $config->maxInputChars) {
            return $json($response, [
                'error' => sprintf('Texte trop long : %d caractères maximum pour la démonstration.', $config->maxInputChars),
            ], 413);
        }

        // 4. Proof of work: valid, unexpired, meeting the difficulty, and
        // never redeemed before (single-use, enforced by primary key).
        $secret = PowChallenge::secretFromEnv();
        if ($secret === '') {
            return $json($response, ['error' => 'Service indisponible'], 503);
        }
        $challenge = $data['challenge'] ?? '';
        $nonce = $data['nonce'] ?? '';
        if (!\is_string($challenge) || $challenge === '' || !\is_string($nonce) || $nonce === '') {
            return $json($response, [
                'error' => 'Preuve de travail requise : obtenez un défi via GET /api/llm/challenge.',
                'code' => 'pow_required',
            ], 400);
        }
        $pow = new PowChallenge($secret, $config->powDifficultyBits);
        $verdict = $pow->verify($challenge, $nonce);
        if ($verdict === PowChallenge::EXPIRED) {
            return $json($response, ['error' => 'Défi expiré : demandez un nouveau défi.', 'code' => 'pow_expired'], 400);
        }
        if ($verdict !== PowChallenge::OK) {
            return $json($response, ['error' => 'Preuve de travail invalide.', 'code' => 'pow_invalid'], 400);
        }

        $pdo = Db::get();
        // Opportunistic prune, then single-use redemption.
        $pdo->prepare('DELETE FROM llm_pow_challenges WHERE expires_at < ?')->execute([time()]);
        try {
            $parts = explode('.', $challenge);
            $pdo->prepare('INSERT INTO llm_pow_challenges (challenge_hash, expires_at) VALUES (?, ?)')
                ->execute([hash('sha256', $challenge), (int) $parts[1]]);
        } catch (\PDOException $e) {
            if ($e->getCode() === '23000') {
                return $json($response, ['error' => 'Défi déjà utilisé : demandez un nouveau défi.', 'code' => 'pow_reused'], 429)
                    ->withHeader('Retry-After', '1');
            }
            throw $e;
        }

        // 5. Per-IP hourly quota, progressive backoff on repeated abuse.
        $limiter = new RateLimiter($pdo, $config->perIpPerHour, 3600);
        $attempts = $limiter->hit($ipBucket($request));
        if ($attempts > $config->perIpPerHour) {
            return $json($response, ['error' => 'Quota horaire atteint, réessayez plus tard.'], 429)
                ->withHeader('Retry-After', (string) $limiter->retryAfter($attempts));
        }

        // 6. Global daily circuit breaker (tokens AND estimated budget).
        $counters = new UsageCounters($pdo);
        if ($counters->isExhausted($config->dailyGlobalTokens, $config->dailyBudgetUsd)) {
            return $json($response, ['error' => 'Démo épuisée pour aujourd’hui, revenez demain.'], 503);
        }

        // 7. Upstream call. The server IMPOSES provider/model/maxTokens from
        // the config — whatever the client sent is ignored (budget safety).
        try {
            if ($config->provider === 'mock') {
                $result = (new MockProvider())
                    ->complete($config->model, $system, $prompt, $config->maxTokensPerRequest);
            } else {
                $apiKey = Env::get('ANTHROPIC_API_KEY');
                if ($apiKey === '') {
                    return $json($response, ['error' => 'Service indisponible'], 503);
                }
                $result = (new AnthropicProvider(LlmRuntime::httpClient(), $apiKey, $config->upstreamTimeoutSeconds))
                    ->complete($config->model, $system, $prompt, $config->maxTokensPerRequest);
            }
        } catch (UpstreamException $e) {
            if ($e->status === 429) {
                return $json($response, ['error' => 'Le fournisseur LLM est saturé, réessayez plus tard.'], 429)
                    ->withHeader('Retry-After', $e->retryAfter ?? '30');
            }

            return $json($response, ['error' => 'Erreur du fournisseur LLM : ' . $e->getMessage()], 502);
        } catch (HttpClientException $e) {
            return $json($response, ['error' => 'Le fournisseur LLM est injoignable, réessayez plus tard.'], $e->timedOut ? 504 : 502);
        }

        // 8. Counters only (§6): tokens in/out + estimated cost, never content.
        $counters->record(
            $result['usage']['inputTokens'],
            $result['usage']['outputTokens'],
            Pricing::estimateUsd($result['model'], $result['usage']['inputTokens'], $result['usage']['outputTokens']),
        );

        return $json($response, [
            'text' => $result['text'],
            'usage' => $result['usage'],
            'model' => $result['model'],
        ]);
    });

    // ------------------------------------------------------------------
    // GET /api/gdoc-text?docId=<id> — text export proxy for PUBLIC Google
    // Docs (P7 portfolio import, cahier §4.2: read-only public documents,
    // no OAuth). Not gated by the demo 'enabled' switch: logged-in learners
    // rely on it too; abuse is contained by the shared per-IP quota.
    // Anti-SSRF: the origin is hardcoded (docs.google.com), at most 3
    // redirects are followed, and ONLY towards *.googleusercontent.com
    // hosts over https (no IP literals, no other domains). The response is
    // capped at 1 MB. Neither the content nor the docId is ever logged.
    // ------------------------------------------------------------------
    $app->get('/gdoc-text', function (Request $request, Response $response) use ($json, $ipBucket): Response {
        if (!Db::isConfigured()) {
            return $json($response, ['error' => 'Service indisponible'], 503);
        }

        $docId = (string) ($request->getQueryParams()['docId'] ?? '');
        if (preg_match('/^[A-Za-z0-9_-]{20,80}$/', $docId) !== 1) {
            return $json($response, ['error' => 'Identifiant de document Google Docs invalide.'], 422);
        }

        $config = DemoConfig::load();
        $limiter = new RateLimiter(Db::get(), $config->perIpPerHour, 3600);
        $attempts = $limiter->hit($ipBucket($request));
        if ($attempts > $config->perIpPerHour) {
            return $json($response, ['error' => 'Quota horaire atteint, réessayez plus tard.'], 429)
                ->withHeader('Retry-After', (string) $limiter->retryAfter($attempts));
        }

        $http = LlmRuntime::httpClient();
        $url = 'https://docs.google.com/document/d/' . $docId . '/export?format=txt';
        $maxBytes = 1048576; // 1 MB
        $upstream = null;

        for ($redirects = 0; $redirects <= 3; $redirects++) {
            try {
                $upstream = $http->request('GET', $url, [], null, 15, $maxBytes);
            } catch (HttpClientException) {
                return $json($response, ['error' => 'Google Docs est injoignable, réessayez plus tard.'], 504);
            }
            if ($upstream['overflow']) {
                return $json($response, ['error' => 'Document trop volumineux : 1 Mo de texte maximum.'], 413);
            }
            if (!\in_array($upstream['status'], [301, 302, 303, 307, 308], true)) {
                break;
            }
            if ($redirects === 3) {
                return $json($response, ['error' => 'Trop de redirections depuis Google Docs.'], 502);
            }
            $location = $upstream['headers']['location'] ?? '';
            $scheme = parse_url($location, PHP_URL_SCHEME);
            $host = parse_url($location, PHP_URL_HOST);
            $port = parse_url($location, PHP_URL_PORT);
            // Follow ONLY https redirects to Google download hosts — never an
            // IP, never another domain, never a non-default port (anti-SSRF).
            if ($scheme !== 'https'
                || !\is_string($host)
                || $port !== null
                || !str_ends_with(strtolower($host), '.googleusercontent.com')) {
                return $json($response, ['error' => 'Redirection refusée (hôte non autorisé).'], 502);
            }
            $url = $location;
        }

        /** @var array{status: int, headers: array<string, string>, body: string, overflow: bool} $upstream */
        if ($upstream['status'] === 403 || $upstream['status'] === 401) {
            return $json($response, [
                'error' => 'Document non accessible : vérifiez qu’il est partagé en lecture avec « Tous les utilisateurs disposant du lien ».',
            ], 403);
        }
        if ($upstream['status'] === 404) {
            return $json($response, ['error' => 'Document introuvable : vérifiez l’URL du document.'], 404);
        }
        if ($upstream['status'] !== 200) {
            return $json($response, ['error' => 'Google Docs a renvoyé une erreur, réessayez plus tard.'], 502);
        }

        $response->getBody()->write($upstream['body']);

        return $response
            ->withHeader('Content-Type', 'text/plain; charset=utf-8')
            ->withHeader('Cache-Control', 'no-store')
            ->withStatus(200);
    });
};
