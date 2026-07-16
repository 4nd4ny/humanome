<?php

declare(strict_types=1);

/**
 * Twin9 server routes (T3a admin surface + T3b user surface, ADR-010).
 *
 * The templates stored in twin9_protocole are the platform's industrial
 * secret: this file is the ONLY place where their content leaves the
 * database, and every such route is gated by RequireRole::any('admin')
 * (ADR-010 §2/§6 — promptologues get 403 like everyone else). Error
 * messages stay generic: no template fragment, ever.
 *
 * Admin routes:
 *   GET  /api/twin9/admin/protocole                 list (metadata, no content)
 *   GET  /api/twin9/admin/protocole/{name}/versions edit history (metadata)
 *   GET  /api/twin9/admin/protocole/{name}          one template WITH content
 *   PUT  /api/twin9/admin/protocole/{name}          {content} — edit + version
 *   GET  /api/twin9/admin/config                    Twin9Config (admin shape)
 *   PUT  /api/twin9/admin/config                    partial update, 422 on bounds
 *   POST /api/twin9/admin/tester                    {name, variables{}} -> {rendu, non_resolues}
 *   POST /api/admin/twin9/import                    X-Migrate-Token (deploy script)
 *
 * User routes (T3b — any logged-in user, ADR-010 §1/§3/§4; the templates are
 * rendered SERVER-SIDE and only the model output travels back, through the
 * LeakFilter):
 *   POST /api/twin9/appel                  proxied LLM call, debit or private key
 *   GET  /api/twin9/meta                   public offer + own balance (no content)
 *   GET  /api/twin9/credit                 balance + last ledger events
 *   GET  /api/twin9/facture?annee=&mois=   monthly recap invoice (own account)
 *   GET  /api/twin9/depenses               spend tracking per month (own account)
 *   GET  /api/twin9/admin/comptes          admin: balances/totals of all accounts
 *   POST /api/twin9/credit/paypal/creer    {pack_index} -> {approve_url, order_id}
 *   POST /api/twin9/credit/paypal/capturer {order_id} -> {solde_microusd}
 *
 * {name} is hierarchical ('lourd/20-greffier'): the routes use a greedy
 * {name:.+} pattern, and the /versions route is registered FIRST so FastRoute
 * matches it before the greedy catch-all.
 */

use Humanome\Auth\Audit;
use Humanome\Auth\RateLimiter;
use Humanome\Auth\Session;
use Humanome\Db;
use Humanome\Env;
use Humanome\Keys\KeyVault;
use Humanome\Llm\HttpClientException;
use Humanome\Llm\LlmRuntime;
use Humanome\Middleware\RequireRole;
use Humanome\Packages\SettingsRepository;
use Humanome\Twin9\AnthropicCaller;
use Humanome\Twin9\CreditService;
use Humanome\Twin9\FactureService;
use Humanome\Twin9\FicheStore;
use Humanome\Twin9\LeakFilter;
use Humanome\Twin9\PayPalClient;
use Humanome\Twin9\ProtocoleRepository;
use Humanome\Twin9\SoldeInsuffisantException;
use Humanome\Twin9\Twin9Config;
use Humanome\Twin9\Twin9Exception;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use Slim\App;

/** Per-user cap on the PayPal endpoints (2026-07-15 review) — each spends live
 * PayPal creds. Guarded define(): route files are require'd once per app
 * instance, and the test suite builds several apps in one process. */
if (!defined('PAYPAL_PAR_MINUTE')) {
    define('PAYPAL_PAR_MINUTE', 20);
}

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

    // Db guard + uniform error mapping (pattern routes/admin.php):
    // Twin9Exception carries its own status and a generic French message;
    // PDO detail stays in the server log only (never a template fragment).
    $wrap = function (callable $handler) use ($json): callable {
        return function (Request $request, Response $response, array $args) use ($handler, $json): Response {
            if (!Db::isConfigured()) {
                return $json($response, ['error' => 'Service indisponible'], 503);
            }
            try {
                return $handler($request, $response, $args);
            } catch (SoldeInsuffisantException $e) {
                // Safety net (the appel route pre-checks and answers its own
                // 402): amounts only, never content.
                return $json($response, [
                    'error' => 'Solde insuffisant',
                    'solde_microusd' => $e->getBalanceMicrousd(),
                    'requis_estime_microusd' => $e->getRequestedMicrousd(),
                ], 402);
            } catch (Twin9Exception $e) {
                return $json($response, ['error' => $e->getMessage()], $e->getStatusCode());
            } catch (HttpClientException $e) {
                // Defense in depth: callers normally wrap network failures
                // into Twin9Exception themselves.
                return $json($response, ['error' => 'Service amont injoignable, réessayez plus tard.'], 502);
            } catch (PDOException $e) {
                error_log('[twin9] ' . $e->getMessage());

                return $json($response, ['error' => 'Erreur interne'], 500);
            }
        };
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

    $admin = RequireRole::any('admin');
    // AD-D2 : le CONTENU des gabarits Twin9 (lecture ET écriture, y compris le
    // rendu du banc d'essai) exige la CONJONCTION admin ∧ promptologue. Un admin
    // non-promptologue ne voit plus le contenu (403) ; la supervision (config,
    // promo, comptes) reste admin seul. Le contenu ne transite JAMAIS vers un
    // client sans les deux rôles.
    $atelier = RequireRole::all('admin', 'promptologue');

    // ==================================================================
    // 1. Templates (protocole) — atelier : admin ∧ promptologue (AD-D2)
    // ==================================================================

    // GET /api/twin9/admin/protocole — metadata list (noms des gabarits :
    // révèle la structure du protocole, gardé comme le contenu).
    $app->get('/twin9/admin/protocole', $wrap(function (Request $request, Response $response) use ($json): Response {
        return $json($response, ['protocole' => (new ProtocoleRepository(Db::get()))->list()]);
    }))->add($atelier);

    // GET /api/twin9/admin/protocole/{name}/versions — edit history.
    // Registered BEFORE the greedy {name:.+} routes (FastRoute matches in
    // registration order).
    $app->get('/twin9/admin/protocole/{name:.+}/versions', $wrap(function (Request $request, Response $response, array $args) use ($json): Response {
        $repo = new ProtocoleRepository(Db::get());
        $name = (string) $args['name'];
        if ($repo->get($name) === null) {
            return $json($response, ['error' => 'Gabarit introuvable'], 404);
        }

        return $json($response, ['name' => $name, 'versions' => $repo->versions($name)]);
    }))->add($atelier);

    // GET /api/twin9/admin/protocole/{name} — WITH content. This route is THE
    // point where an admin-promptologue (and no one else) reads a template.
    $app->get('/twin9/admin/protocole/{name:.+}', $wrap(function (Request $request, Response $response, array $args) use ($json): Response {
        $template = (new ProtocoleRepository(Db::get()))->get((string) $args['name']);
        if ($template === null) {
            return $json($response, ['error' => 'Gabarit introuvable'], 404);
        }

        return $json($response, $template);
    }))->add($atelier);

    // PUT /api/twin9/admin/protocole/{name} {content} — edit (previous
    // content archived as a version). 422: empty or >= 256 Ko.
    $app->put('/twin9/admin/protocole/{name:.+}', $wrap(function (Request $request, Response $response, array $args) use ($json, $parseBody): Response {
        $body = $parseBody($request);
        $content = \is_array($body) && \is_string($body['content'] ?? null) ? $body['content'] : '';
        if ($content === '') {
            return $json($response, ['error' => 'Champ requis : content (texte non vide)'], 422);
        }

        $result = (new ProtocoleRepository(Db::get()))->put(
            (string) $args['name'],
            $content,
            (int) $request->getAttribute('userId'),
        );

        return $json($response, $result);
    }))->add($atelier);

    // ==================================================================
    // 2. Configuration — admin only (supervision commerciale, AD-D2)
    // ==================================================================

    // GET /api/twin9/admin/config — effective config (admin shape: raw list
    // prices + margin; the front only ever sees Twin9Config::publicView()).
    $app->get('/twin9/admin/config', $wrap(function (Request $request, Response $response) use ($json): Response {
        return $json($response, (new Twin9Config(new SettingsRepository(Db::get())))->read());
    }))->add($admin);

    // PUT /api/twin9/admin/config {champs partiels} — 422 out of bounds
    // (marge 1..5, prix > 0, packs 1..100 USD, étages connus).
    $app->put('/twin9/admin/config', $wrap(function (Request $request, Response $response) use ($json, $parseBody): Response {
        $body = $parseBody($request);
        if (!\is_array($body)) {
            return $json($response, ['error' => 'Corps JSON invalide : objet attendu'], 400);
        }

        return $json($response, (new Twin9Config(new SettingsRepository(Db::get())))->update($body));
    }))->add($admin);

    // ==================================================================
    // 3. Test bench — atelier : admin ∧ promptologue (le rendu CONTIENT le
    //    gabarit), rendering WITHOUT any LLM call
    // ==================================================================

    // POST /api/twin9/admin/tester {name, variables{}} -> {rendu, non_resolues}
    $app->post('/twin9/admin/tester', $wrap(function (Request $request, Response $response) use ($json, $parseBody): Response {
        $body = $parseBody($request);
        $name = \is_array($body) && \is_string($body['name'] ?? null) ? $body['name'] : '';
        $variables = \is_array($body) && \is_array($body['variables'] ?? null) ? $body['variables'] : [];
        if ($name === '') {
            return $json($response, ['error' => 'Champ requis : name'], 422);
        }

        return $json($response, (new ProtocoleRepository(Db::get()))->render($name, $variables));
    }))->add($atelier);

    // ==================================================================
    // 4. User surface (T3b) — any logged-in user, ADR-010 §1/§3/§4.
    //    The CSRF middleware covers every POST here (session-borne).
    // ==================================================================

    // Session guard without a role requirement (« tout utilisateur
    // connecté ») — pattern routes/keys.php. 401 exactly like RequireRole.
    $sessionUserId = function (): ?int {
        if (!Session::exists()) {
            return null;
        }
        Session::start();

        return Session::userId();
    };

    // Total request payload bound for /api/twin9/appel (413 beyond). One
    // Twin9 step carries at most a day's text + a few artefacts; 300 Ko is
    // ample and keeps rendering/leak-filtering cheap on shared hosting.
    $appelMaxPayloadBytes = 307200;

    // Twin6 (open cartography) carries the WHOLE portfolio in every scan-pole
    // prompt (7 calls re-read it), so its billed proxy accepts a larger body.
    $twin6MaxPayloadBytes = 2_000_000;

    // PayPal redirect targets (ADR-010 §3). No webhook at the MVP: the FRONT
    // calls /capturer when PayPal redirects back — the capture is idempotent
    // (PayPal-side and by the UNIQUE paypal_order_id in the ledger), so a
    // double click or a replayed redirect converges instead of double
    // crediting. PayPal appends its own '&token=<order_id>' to the return
    // URL (the '?' already present inside the fragment makes it land in the
    // hash query, readable by the hash router — ADR-009).
    $paypalReturnUrl = 'https://humanome.xyz/#/compte/credit?paypal=retour';
    $paypalCancelUrl = 'https://humanome.xyz/#/compte/credit?paypal=annule';

    // ------------------------------------------------------------------
    // POST /api/twin9/appel — THE proxied LLM call (ADR-010 §1): the client
    // sends step label + variables, the server renders the CONFIDENTIAL
    // template, calls Anthropic (locked base_url), leak-filters the output
    // and returns model output + real usage only. Body:
    //   {etape, variables{VAR: string}, modele, etage, max_tokens?,
    //    facturation: 'platform'|'cle_privee'}
    // ------------------------------------------------------------------
    $app->post('/twin9/appel', $wrap(function (Request $request, Response $response) use ($json, $parseBody, $sessionUserId, $appelMaxPayloadBytes): Response {
        $config = new Twin9Config(new SettingsRepository(Db::get()));
        if (!$config->isEnabled()) {
            return $json($response, ['error' => 'Twin9 non disponible'], 503);
        }
        $userId = $sessionUserId();
        if ($userId === null) {
            return $json($response, ['error' => 'Authentification requise'], 401);
        }

        // Payload bound BEFORE any parsing work.
        $raw = (string) $request->getBody();
        if (\strlen($raw) > $appelMaxPayloadBytes) {
            return $json($response, ['error' => 'Requête trop volumineuse (300 Ko maximum)'], 413);
        }
        $body = $parseBody($request);
        if (!\is_array($body)) {
            return $json($response, ['error' => 'Corps JSON invalide : objet attendu'], 400);
        }

        // --- Validation (422, field names only — never template content) --
        $etape = \is_string($body['etape'] ?? null) ? $body['etape'] : '';
        if ($etape === '') {
            return $json($response, ['error' => 'Champ requis : etape'], 422);
        }
        $variables = $body['variables'] ?? [];
        if (!\is_array($variables)) {
            return $json($response, ['error' => 'Champ variables invalide : objet attendu'], 422);
        }
        foreach ($variables as $name => $value) {
            // Run-state variables are scalars (rendered as-is) or, for the fiche
            // lookup key POLE_FICHES_ORDRE, a flat list of scalars. Objects and
            // nested arrays are refused.
            if (\is_scalar($value) || $value === null) {
                continue;
            }
            if (\is_array($value) && $value === array_filter($value, 'is_scalar')) {
                continue;
            }
            return $json($response, ['error' => 'Variable invalide (scalaire ou liste attendu) : ' . (string) $name], 422);
        }
        $modele = \is_string($body['modele'] ?? null) ? $body['modele'] : '';
        $etage = \is_string($body['etage'] ?? null) ? $body['etage'] : '';
        if (!\in_array($etage, Twin9Config::ETAGES, true)) {
            return $json($response, ['error' => 'Étage inconnu (taggers, rapide, tribunal)'], 422);
        }
        $offre = $config->modeles()[$modele] ?? null;
        if ($modele === '' || !\is_array($offre) || !\in_array($etage, $offre['etages'], true)) {
            return $json($response, ['error' => 'Modèle non proposé pour cet étage'], 422);
        }
        $maxTokens = $body['max_tokens'] ?? 4096;
        if (!\is_int($maxTokens)) {
            return $json($response, ['error' => 'Champ max_tokens invalide : entier attendu'], 422);
        }
        $maxTokens = max(256, min(16000, $maxTokens)); // bounded, defaut 4096
        $facturation = \is_string($body['facturation'] ?? null) ? $body['facturation'] : '';
        if (!\in_array($facturation, ['platform', 'cle_privee'], true)) {
            return $json($response, ['error' => 'Champ facturation invalide (platform ou cle_privee)'], 422);
        }
        // Own-key Twin9 is refused unless the PROMO window is open (owner toggle,
        // 2026-07-15): the proprietary Golden Prompt only travels via our
        // metered/credited path (+20 % contribution), except during a
        // promotional period meant to let people feel the quality before buying
        // tokens. /appel serves ONLY Twin9, so no protocole discriminator is
        // needed here. (Twin6, open source, has its own free/own-key path.)
        if ($facturation === 'cle_privee' && !$config->clePersoOuverte()) {
            return $json($response, [
                'error' => 'Twin9 s’utilise avec nos crédits. L’usage avec votre propre clé n’est pas ouvert pour le moment.',
            ], 403);
        }

        // --- Per-user rate limit (rate_limits table, fixed 1-min window) --
        $limiter = new RateLimiter(Db::get(), $config->appelsParMinute(), 60);
        $attempts = $limiter->hit('twin9:appel:' . $userId);
        if ($attempts > $config->appelsParMinute()) {
            return $json($response, ['error' => 'Rythme d’appels trop élevé, ralentissez.'], 429)
                ->withHeader('Retry-After', (string) $limiter->retryAfter($attempts));
        }

        // --- Render (server-side, ADR-010 §1) ----------------------------
        // Inject the CONFIDENTIAL fiche variables (COMPETENCE_FICHE, POLE_FICHES)
        // the client can't hold — computed authoritatively from the run-state
        // lookup keys (CODE ; POLE_NUM + POLE_FICHES_ORDRE) it provided. The
        // injected values WIN over anything the client sent for those names.
        $fiches = FicheStore::fromSettings(new SettingsRepository(Db::get()));
        $variables = array_merge($variables, $fiches->injecter($variables));

        $repo = new ProtocoleRepository(Db::get());
        $rendered = $repo->render($etape, $variables); // Twin9Exception 404 if unknown
        if ($rendered['non_resolues'] !== []) {
            // Variable NAMES only — never the surrounding template text.
            return $json($response, [
                'error' => 'Variables non résolues',
                'variables' => $rendered['non_resolues'],
            ], 422);
        }
        $prompt = $rendered['rendu'];

        // --- Billing path -------------------------------------------------
        $credits = new CreditService(Db::get());
        $reserve = 0;
        if ($facturation === 'platform') {
            $apiKey = Env::get('ANTHROPIC_API_KEY');
            if ($apiKey === '') {
                return $json($response, ['error' => 'Service indisponible'], 503);
            }
            // WORST-CASE RESERVATION before the call (security finding A):
            // a single ATOMIC conditional debit (no overdraft) of the maximum
            // this call could cost (real input + full max_tokens output). This
            // serializes concurrent calls on the same balance (each loses the
            // race → 402) and caps a series at what was actually reserved —
            // no read-then-compare gap, no unbounded overdraft. The real cost
            // (always ≤ reserve) is reconciled back after the call.
            // BYTE length (not mb_strlen): a hard upper bound on real input
            // tokens, so the reservation always covers the real cost and the
            // reconciliation is a pure refund (2026-07-15 review, overdraft).
            $reserve = max(1, (int) $config->reserveMicrousd($modele, strlen($prompt), $maxTokens));
            try {
                $credits->debit($userId, $reserve, $etape . ' (réserve)', $modele);
            } catch (SoldeInsuffisantException $e) {
                return $json($response, [
                    'error' => 'Solde insuffisant',
                    'solde_microusd' => $e->getBalanceMicrousd(),
                    'requis_estime_microusd' => $reserve,
                ], 402);
            }
        } else {
            // cle_privee (ADR-010 §4): the user's own Anthropic key, stored
            // encrypted (KeyVault), used SERVER-SIDE on the SAME locked path.
            $masterKey = KeyVault::masterKeyFromEnv();
            if ($masterKey === null) {
                return $json($response, ['error' => 'Stockage de clés non configuré'], 503);
            }
            $apiKey = (new KeyVault(Db::get(), $masterKey))->reveal($userId, 'anthropic');
            if ($apiKey === null) {
                return $json($response, ['error' => 'Aucune clé Anthropic enregistrée pour votre compte'], 409);
            }
        }

        // --- Upstream call (no retry: the client engine owns resumption) --
        // The reserve is already committed (platform): refund it on any failure
        // so a dropped upstream call never keeps the learner's credit.
        try {
            $result = (new AnthropicCaller(LlmRuntime::httpClient(), $apiKey))
                ->appeler($modele, null, $prompt, $maxTokens);
        } catch (\Throwable $e) {
            if ($reserve > 0) {
                // Carry the model so the per-model invoice split stays exact
                // (FactureService nets reservations against their refunds).
                $credits->adjust($userId, $reserve, $etape . ' (remboursement échec)', $modele);
            }
            throw $e;
        }

        // --- Reconcile the reservation to the REAL cost (platform) ---------
        $cout = 0;
        if ($facturation === 'platform') {
            $cout = (int) $config->coutMicrousd($modele, $result['tokens_in'], $result['tokens_out']);
            // Signed reconciliation: reserve - real. Positive → refund the
            // unused reservation; negative → charge the small remainder when
            // the real tokens exceeded the char-based estimate (bounded by the
            // estimation error, NOT by concurrency — the reserve already gated
            // that). One event, carrying the real token counts.
            $delta = $reserve - $cout;
            if ($delta !== 0) {
                $credits->adjust(
                    $userId,
                    $delta,
                    $etape . ' (réconciliation)',
                    $modele,
                    $result['tokens_in'],
                    $result['tokens_out'],
                );
            }
        }

        // --- Leak filter (ADR-010 §2): index built from the template with the
        // user's variables EMPTY (so quoting one's own payload stays legal) but
        // the CONFIDENTIAL fiches INJECTED (2026-07-15 review, finding HIGH):
        // COMPETENCE_FICHE / POLE_FICHES carry the secret fiche bodies at render
        // time; leaving them empty in the index gave a verbatim recitation of a
        // fiche zero backstop. Injecting them here indexes the fiche bodies so
        // their recitation is redacted like any other template fragment.
        $gabaritVide = $repo->render(
            $etape,
            array_merge(
                array_fill_keys($repo->get($etape)['variables'] ?? [], ''),
                $fiches->injecter($variables),
            ),
        )['rendu'];
        $filtre = LeakFilter::redact($gabaritVide, $result['texte']);
        if ($filtre['fuites'] > 0) {
            // Audited counters only (ADR-010 §2) — never the redacted text.
            Audit::record(Db::get(), $userId, 'twin9_fuite_expurgee', [
                'etape' => $etape,
                'fuites' => $filtre['fuites'],
            ]);
        }

        // The leak COUNT is NEVER returned (finding B): exposing it lets an
        // attacker tune a transformation until it drops to 0. The client gets
        // the already-redacted output and nothing about what was redacted.
        return $json($response, [
            'sortie' => $filtre['sortie'],
            'tokens_in' => $result['tokens_in'],
            'tokens_out' => $result['tokens_out'],
            'cout_microusd' => $cout,
            'stop_reason' => $result['stop_reason'],
        ]);
    }));

    // ------------------------------------------------------------------
    // POST /api/twin6/appel — « Cartographie ouverte Twin6 » CREDITS path.
    // Twin6 is OPEN SOURCE: the prompt is PUBLIC, so there is no template to
    // render server-side, no confidential fiche to inject, and NO LeakFilter.
    // The client (engine executerTwin6 with a proxy provider) sends a fully
    // built prompt; we call Anthropic with the PLATFORM key and bill the
    // prepaid balance at the Twin6 contribution (+10 %). Own-key Twin6 does NOT
    // come here — it runs client-side with the user's own key (free).
    // Response matches the engine proxy-provider contract {text, usage, model,
    // stopReason} (providers/index.js).
    // ------------------------------------------------------------------
    $app->post('/twin6/appel', $wrap(function (Request $request, Response $response) use ($json, $parseBody, $sessionUserId, $twin6MaxPayloadBytes): Response {
        $userId = $sessionUserId();
        if ($userId === null) {
            return $json($response, ['error' => 'Authentification requise'], 401);
        }
        $apiKey = Env::get('ANTHROPIC_API_KEY');
        if ($apiKey === '') {
            return $json($response, ['error' => 'Service indisponible'], 503);
        }

        $raw = (string) $request->getBody();
        if (\strlen($raw) > $twin6MaxPayloadBytes) {
            return $json($response, ['error' => 'Requête trop volumineuse (2 Mo maximum)'], 413);
        }
        $body = $parseBody($request);
        if (!\is_array($body)) {
            return $json($response, ['error' => 'Corps JSON invalide : objet attendu'], 400);
        }

        $config = new Twin9Config(new SettingsRepository(Db::get()));
        $modele = \is_string($body['model'] ?? null) ? $body['model'] : '';
        if (($config->modeles()[$modele] ?? null) === null) {
            return $json($response, ['error' => 'Modèle non proposé'], 422);
        }
        $prompt = \is_string($body['prompt'] ?? null) ? $body['prompt'] : '';
        if (trim($prompt) === '') {
            return $json($response, ['error' => 'Champ requis : prompt'], 422);
        }
        $system = \is_string($body['system'] ?? null) ? $body['system'] : null;
        $maxTokens = $body['max_tokens'] ?? $body['maxTokens'] ?? 8192;
        if (!\is_int($maxTokens)) {
            return $json($response, ['error' => 'Champ max_tokens invalide : entier attendu'], 422);
        }
        $maxTokens = max(256, min(16000, $maxTokens));

        $limiter = new RateLimiter(Db::get(), $config->appelsParMinute(), 60);
        $attempts = $limiter->hit('twin6:appel:' . $userId);
        if ($attempts > $config->appelsParMinute()) {
            return $json($response, ['error' => 'Rythme d’appels trop élevé, ralentissez.'], 429)
                ->withHeader('Retry-After', (string) $limiter->retryAfter($attempts));
        }

        // Worst-case reservation at the TWIN6 margin (+10 %), atomic (no
        // overdraft), reconciled to the real cost after — same discipline as
        // /appel (security finding A), but priced with the 'twin6' protocole.
        $credits = new CreditService(Db::get());
        $promptBytes = \strlen($prompt) + ($system !== null ? \strlen($system) : 0);
        $reserve = max(1, (int) $config->reserveMicrousd($modele, $promptBytes, $maxTokens, 'twin6'));
        try {
            $credits->debit($userId, $reserve, 'twin6/cartographie (réserve)', $modele);
        } catch (SoldeInsuffisantException $e) {
            return $json($response, [
                'error' => 'Solde insuffisant',
                'solde_microusd' => $e->getBalanceMicrousd(),
                'requis_estime_microusd' => $reserve,
            ], 402);
        }

        try {
            $result = (new AnthropicCaller(LlmRuntime::httpClient(), $apiKey))
                ->appeler($modele, $system, $prompt, $maxTokens);
        } catch (\Throwable $e) {
            $credits->adjust($userId, $reserve, 'twin6/cartographie (remboursement échec)', $modele);
            throw $e;
        }

        $cout = (int) $config->coutMicrousd($modele, $result['tokens_in'], $result['tokens_out'], 'twin6');
        $delta = $reserve - $cout;
        if ($delta !== 0) {
            $credits->adjust($userId, $delta, 'twin6/cartographie (réconciliation)', $modele, $result['tokens_in'], $result['tokens_out']);
        }

        // Engine proxy-provider contract. No leak filter: nothing is secret.
        return $json($response, [
            'text' => $result['texte'],
            'usage' => ['inputTokens' => $result['tokens_in'], 'outputTokens' => $result['tokens_out']],
            'model' => $modele,
            'stopReason' => $result['stop_reason'],
            'cout_microusd' => $cout,
        ]);
    }));

    // ------------------------------------------------------------------
    // GET /api/twin9/meta — EVERYTHING the client ever sees of Twin9
    // (ADR-010 §2 residual): step names, template lengths, variable names,
    // margined prices, packs, pipeline knobs, own balance. NEVER content.
    // ------------------------------------------------------------------
    $app->get('/twin9/meta', $wrap(function (Request $request, Response $response) use ($json, $sessionUserId): Response {
        $userId = $sessionUserId();
        if ($userId === null) {
            return $json($response, ['error' => 'Authentification requise'], 401);
        }

        $config = new Twin9Config(new SettingsRepository(Db::get()));
        $view = $config->publicView();

        $etapes = array_map(static fn (array $entry): array => [
            'name' => $entry['name'],
            'longueur_gabarit' => $entry['longueur'],
            'variables' => $entry['variables'],
        ], (new ProtocoleRepository(Db::get()))->list());

        $masterKey = KeyVault::masterKeyFromEnv();
        $clePrivee = $masterKey !== null
            && (new KeyVault(Db::get(), $masterKey))->reveal($userId, 'anthropic') !== null;

        return $json($response, [
            'enabled' => $view['enabled'],
            'etapes' => $etapes,
            'modeles' => $view['modeles'],
            'modeles_twin6' => $view['modeles_twin6'],
            // Promo: when true, Twin9 is usable free with one's own key.
            'twin9_cle_perso_ouverte' => $view['twin9_cle_perso_ouverte'],
            'packs' => $view['packs'],
            'pipeline' => $view['pipeline'],
            // Non-secret referentiel structure the client engine needs to
            // assemble artefacts (codes/names + accented pole names).
            'referentiel' => $config->referentiel(),
            'paypalConfigured' => $view['paypalConfigured'],
            'solde_microusd' => (new CreditService(Db::get()))->balance($userId),
            'cle_privee_disponible' => $clePrivee,
        ]);
    }));

    // ------------------------------------------------------------------
    // GET /api/twin9/credit — own balance + last 50 ledger events
    // (counters only: kind, amounts, tokens, labels — cahier §6.5).
    // ------------------------------------------------------------------
    $app->get('/twin9/credit', $wrap(function (Request $request, Response $response) use ($json, $sessionUserId): Response {
        $userId = $sessionUserId();
        if ($userId === null) {
            return $json($response, ['error' => 'Authentification requise'], 401);
        }
        $credits = new CreditService(Db::get());

        return $json($response, [
            'solde_microusd' => $credits->balance($userId),
            'evenements' => array_map(static fn (array $event): array => [
                'kind' => $event['kind'],
                'montant_microusd' => $event['amount_microusd'],
                'label' => $event['label'],
                'model' => $event['model'],
                'tokens_in' => $event['tokens_in'],
                'tokens_out' => $event['tokens_out'],
                'date' => $event['created_at'],
            ], $credits->events($userId, 50)),
        ]);
    }));

    // ------------------------------------------------------------------
    // GET /api/twin9/facture?annee=&mois= — monthly recap invoice of the
    // prepaid usage (owner request: individuals AND établissement accounts,
    // same ledger). Deterministic aggregation, stable number — the front
    // renders it as a printable document. Own account only.
    // ------------------------------------------------------------------
    $app->get('/twin9/facture', $wrap(function (Request $request, Response $response) use ($json, $sessionUserId): Response {
        $userId = $sessionUserId();
        if ($userId === null) {
            return $json($response, ['error' => 'Authentification requise'], 401);
        }
        $query = $request->getQueryParams();
        $annee = (int) ($query['annee'] ?? 0);
        $mois = (int) ($query['mois'] ?? 0);
        if ($annee < 2026 || $annee > 2100 || $mois < 1 || $mois > 12) {
            return $json($response, ['error' => 'Période invalide (annee, mois requis)'], 422);
        }

        return $json($response, (new FactureService(Db::get()))->facture($userId, $annee, $mois));
    }));

    // ------------------------------------------------------------------
    // GET /api/twin9/depenses — spend tracking per month (12 last), the data
    // behind the quota/spend dashboard. Own account only.
    // ------------------------------------------------------------------
    $app->get('/twin9/depenses', $wrap(function (Request $request, Response $response) use ($json, $sessionUserId): Response {
        $userId = $sessionUserId();
        if ($userId === null) {
            return $json($response, ['error' => 'Authentification requise'], 401);
        }
        $credits = new CreditService(Db::get());

        return $json($response, [
            'solde_microusd' => $credits->balance($userId),
            'mois' => (new FactureService(Db::get()))->depensesParMois($userId),
        ]);
    }));

    // ------------------------------------------------------------------
    // GET /api/twin9/admin/comptes — admin oversight: balances and lifetime
    // totals of every account with ledger activity (support + établissements).
    // ------------------------------------------------------------------
    $app->get('/twin9/admin/comptes', $wrap(function (Request $request, Response $response) use ($json): Response {
        return $json($response, ['comptes' => (new FactureService(Db::get()))->comptes()]);
    }))->add($admin);

    // ------------------------------------------------------------------
    // POST /api/twin9/credit/paypal/creer {pack_index} — create the PayPal
    // order for one pack. NO intermediate state stored: the capture creates
    // the (idempotent) ledger event, an abandoned order simply expires at
    // PayPal's.
    // ------------------------------------------------------------------
    $app->post('/twin9/credit/paypal/creer', $wrap(function (Request $request, Response $response) use ($json, $parseBody, $sessionUserId, $paypalReturnUrl, $paypalCancelUrl): Response {
        $userId = $sessionUserId();
        if ($userId === null) {
            return $json($response, ['error' => 'Authentification requise'], 401);
        }
        // Rate limit (2026-07-15 review, finding LOW): each call spends the
        // platform's live PayPal credentials — cap the loop.
        $rl = new RateLimiter(Db::get(), PAYPAL_PAR_MINUTE, 60);
        if ($rl->hit('twin9:paypal:creer:' . $userId) > PAYPAL_PAR_MINUTE) {
            return $json($response, ['error' => 'Trop de tentatives, réessayez plus tard.'], 429)
                ->withHeader('Retry-After', (string) $rl->retryAfter(PAYPAL_PAR_MINUTE + 1));
        }
        $paypal = PayPalClient::fromEnv(LlmRuntime::httpClient());
        if ($paypal === null) {
            return $json($response, ['error' => 'Recharge PayPal non configurée'], 503);
        }

        $body = $parseBody($request);
        $packIndex = \is_array($body) && \is_int($body['pack_index'] ?? null) ? $body['pack_index'] : -1;
        $packs = (new Twin9Config(new SettingsRepository(Db::get())))->packs();
        $pack = $packs[$packIndex] ?? null;
        if ($packIndex < 0 || $pack === null) {
            return $json($response, ['error' => 'Pack inconnu'], 422);
        }

        $order = $paypal->createOrder(
            (float) $pack['montant_usd'],
            $paypalReturnUrl,
            $paypalCancelUrl,
        );
        // Bind the order to its creator so /capturer can refuse anyone else
        // (2026-07-15 review, finding MEDIUM — credit misattribution).
        if (\is_array($order) && \is_string($order['order_id'] ?? null) && $order['order_id'] !== '') {
            (new CreditService(Db::get()))->recordPaypalOrder($userId, $order['order_id']);
        }

        return $json($response, $order);
    }));

    // ------------------------------------------------------------------
    // POST /api/twin9/credit/paypal/capturer {order_id} — capture after the
    // redirect back, then credit the CAPTURED amount (PayPal's figure ×1e6
    // micro-USD, never a client-provided one). Idempotent by order id.
    // ------------------------------------------------------------------
    $app->post('/twin9/credit/paypal/capturer', $wrap(function (Request $request, Response $response) use ($json, $parseBody, $sessionUserId): Response {
        $userId = $sessionUserId();
        if ($userId === null) {
            return $json($response, ['error' => 'Authentification requise'], 401);
        }
        $rl = new RateLimiter(Db::get(), PAYPAL_PAR_MINUTE, 60);
        if ($rl->hit('twin9:paypal:capturer:' . $userId) > PAYPAL_PAR_MINUTE) {
            return $json($response, ['error' => 'Trop de tentatives, réessayez plus tard.'], 429)
                ->withHeader('Retry-After', (string) $rl->retryAfter(PAYPAL_PAR_MINUTE + 1));
        }
        $paypal = PayPalClient::fromEnv(LlmRuntime::httpClient());
        if ($paypal === null) {
            return $json($response, ['error' => 'Recharge PayPal non configurée'], 503);
        }

        $body = $parseBody($request);
        $orderId = \is_array($body) && \is_string($body['order_id'] ?? null) ? $body['order_id'] : '';
        if (preg_match('/^[A-Za-z0-9_-]{1,64}$/', $orderId) !== 1) {
            return $json($response, ['error' => 'Champ requis : order_id'], 422);
        }

        // Ownership (2026-07-15 review, finding MEDIUM): only the account that
        // created the order (recorded at /creer) may capture it — a client can
        // otherwise credit itself with someone else's approved order_id. A
        // legitimate flow always recorded the order before the PayPal redirect,
        // so an order absent from the binding table is refused too.
        $credits = new CreditService(Db::get());
        if ($credits->paypalOrderOwner($orderId) !== $userId) {
            return $json($response, ['error' => 'Cet ordre de paiement ne vous appartient pas.'], 403);
        }

        $capture = $paypal->captureOrder($orderId); // 422 FR si non approuvé
        if ($capture['status'] !== 'COMPLETED') {
            return $json($response, ['error' => 'Paiement non finalisé côté PayPal, réessayez.'], 422);
        }
        $microusd = (int) round(((float) $capture['montant_usd']) * 1_000_000);
        if ($microusd <= 0) {
            return $json($response, ['error' => 'Montant PayPal invalide'], 502);
        }

        $result = $credits->topup($userId, $microusd, $orderId, 'Recharge PayPal');
        // Record the CAPTURE (id + amount) so this top-up can be refunded on
        // request later (a refund goes against a capture, not an order). Idempotent.
        $credits->recordCapture($userId, (string) ($capture['capture_id'] ?? ''), $orderId, $microusd);

        return $json($response, ['solde_microusd' => $result['balance']]);
    }));

    // ------------------------------------------------------------------
    // POST /api/twin9/credit/rembourser {montant_microusd?} — refund unused
    // balance ON REQUEST (never automatic: by default users keep their balance
    // for next time). Refunds against the user's own captures, most recent
    // first, in whole cents (µUSD dust below one cent stays as balance), each
    // capped at its remaining room. Idempotent per portion (PayPal-Request-Id).
    // ------------------------------------------------------------------
    $app->post('/twin9/credit/rembourser', $wrap(function (Request $request, Response $response) use ($json, $parseBody, $sessionUserId): Response {
        $userId = $sessionUserId();
        if ($userId === null) {
            return $json($response, ['error' => 'Authentification requise'], 401);
        }
        $rl = new RateLimiter(Db::get(), PAYPAL_PAR_MINUTE, 60);
        if ($rl->hit('twin9:rembourser:' . $userId) > PAYPAL_PAR_MINUTE) {
            return $json($response, ['error' => 'Trop de tentatives, réessayez plus tard.'], 429)
                ->withHeader('Retry-After', (string) $rl->retryAfter(PAYPAL_PAR_MINUTE + 1));
        }
        $paypal = PayPalClient::fromEnv(LlmRuntime::httpClient());
        if ($paypal === null) {
            return $json($response, ['error' => 'Remboursement PayPal non configuré'], 503);
        }

        $credits = new CreditService(Db::get());
        $remboursable = $credits->soldeRemboursable($userId);
        if ($remboursable <= 0) {
            return $json($response, ['error' => 'Aucun solde remboursable pour le moment.'], 422);
        }
        $body = $parseBody($request);
        $demande = \is_array($body) && \is_int($body['montant_microusd'] ?? null)
            ? $body['montant_microusd']
            : $remboursable;
        $aRembourser = max(1, min($demande, $remboursable));

        $totalRembourse = 0;
        $reste = $aRembourser;
        foreach ($credits->refundableCaptures($userId) as $c) {
            if ($reste <= 0) {
                break;
            }
            // Whole cents only (PayPal refunds in 2-decimal USD); sub-cent dust stays.
            $partCents = intdiv(min($c['room_microusd'], $reste), 10_000);
            if ($partCents <= 0) {
                continue;
            }
            $partMicrousd = $partCents * 10_000;
            $usd = number_format($partCents / 100, 2, '.', '');
            // Idempotency key unique per refunded portion (offset = amount already
            // refunded from this capture): a retry of a failed portion replays the
            // SAME id (PayPal moves money once); the next portion gets a new id.
            $requestId = 'rf-' . $userId . '-' . $c['capture_id'] . '-' . $c['rembourse_microusd'];
            $refund = $paypal->refundCapture($c['capture_id'], $usd, $requestId);
            if (!\in_array($refund['status'] ?? '', ['COMPLETED', 'PENDING'], true)) {
                return $json($response, [
                    'error' => 'Le remboursement PayPal n’a pas abouti, réessayez plus tard.',
                    'rembourse_microusd' => $totalRembourse,
                ], 502);
            }
            $credits->appliquerRemboursement($userId, $c['capture_id'], $partMicrousd);
            $totalRembourse += $partMicrousd;
            $reste -= $partMicrousd;
        }

        return $json($response, [
            'rembourse_microusd' => $totalRembourse,
            'solde_microusd' => $credits->balance($userId),
        ]);
    }));

    // ==================================================================
    // 5. Import — deploy script only (X-Migrate-Token, pattern
    //    /api/admin/import-prompt-package in routes/packages.php)
    // ==================================================================

    // POST /api/admin/twin9/import {files: {name: content}, config?: {...}}
    // -> upserts twin9_protocole (archiving versions), stores the protocol
    // settings under twin9_config.pipeline, flips twin9_config.enabled=true.
    $app->post('/admin/twin9/import', function (Request $request, Response $response) use ($json): Response {
        $token = Env::get('MIGRATE_TOKEN');
        if ($token === '') {
            // Endpoint does not exist unless explicitly configured (ADR-008).
            return $json($response, ['error' => 'Not found'], 404);
        }
        $given = $request->getHeaderLine('X-Migrate-Token');
        if ($given === '' || !hash_equals($token, $given)) {
            return $json($response, ['error' => 'Forbidden'], 403);
        }
        if (!Db::isConfigured()) {
            return $json($response, ['error' => 'Database not configured'], 503);
        }

        $body = json_decode((string) $request->getBody(), true);
        $files = \is_array($body) && \is_array($body['files'] ?? null) ? $body['files'] : null;
        if ($files === null || $files === []) {
            return $json($response, ['error' => 'Body must contain a non-empty files map'], 400);
        }

        try {
            $repo = new ProtocoleRepository(Db::get());
            $imported = 0;
            foreach ($files as $name => $content) {
                if (!\is_string($name) || !\is_string($content)) {
                    throw new Twin9Exception('Fichier invalide : ' . (string) $name, 422);
                }
                $repo->put($name, $content, null);
                ++$imported;
            }

            $config = new Twin9Config(new SettingsRepository(Db::get()));
            $update = ['enabled' => true];
            if (\is_array($body['config'] ?? null)) {
                $update['pipeline'] = $body['config'];
            }
            $config->update($update);
            // The non-secret referentiel structure (pole/competence names) the
            // client engine needs — stored apart from the validated admin config.
            if (\is_array($body['referentiel'] ?? null)) {
                $config->setReferentiel($body['referentiel']);
            }
            // The CONFIDENTIAL fiches (pole headers + per-competence fiche_md),
            // stored server-only (FicheStore) and injected at render — NEVER in
            // /meta. Kept apart from the non-secret referentiel structure.
            if (\is_array($body['fiches'] ?? null)) {
                FicheStore::store(new SettingsRepository(Db::get()), $body['fiches']);
            }
        } catch (Twin9Exception $e) {
            return $json($response, ['error' => $e->getMessage()], $e->getStatusCode());
        } catch (\Throwable $e) {
            error_log('[twin9-import] ' . $e->getMessage());

            return $json($response, ['error' => 'Import failed, see server log'], 500);
        }

        return $json($response, ['imported' => $imported]);
    });
};
