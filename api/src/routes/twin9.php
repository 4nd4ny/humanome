<?php

declare(strict_types=1);

/**
 * Twin_v9 server routes (T3a admin surface + T3b user surface, ADR-010).
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

    // ==================================================================
    // 1. Templates (protocole) — admin only
    // ==================================================================

    // GET /api/twin9/admin/protocole — metadata list, NO content.
    $app->get('/twin9/admin/protocole', $wrap(function (Request $request, Response $response) use ($json): Response {
        return $json($response, ['protocole' => (new ProtocoleRepository(Db::get()))->list()]);
    }))->add($admin);

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
    }))->add($admin);

    // GET /api/twin9/admin/protocole/{name} — WITH content. This route is THE
    // point where an administrator (and no one else) reads a template.
    $app->get('/twin9/admin/protocole/{name:.+}', $wrap(function (Request $request, Response $response, array $args) use ($json): Response {
        $template = (new ProtocoleRepository(Db::get()))->get((string) $args['name']);
        if ($template === null) {
            return $json($response, ['error' => 'Gabarit introuvable'], 404);
        }

        return $json($response, $template);
    }))->add($admin);

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
    }))->add($admin);

    // ==================================================================
    // 2. Configuration — admin only
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
    // 3. Test bench — admin only, rendering WITHOUT any LLM call
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
    }))->add($admin);

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
    // Twin_v9 step carries at most a day's text + a few artefacts; 300 Ko is
    // ample and keeps rendering/leak-filtering cheap on shared hosting.
    $appelMaxPayloadBytes = 307200;

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
            return $json($response, ['error' => 'Twin_v9 non disponible'], 503);
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
            $reserve = max(1, (int) $config->reserveMicrousd($modele, mb_strlen($prompt), $maxTokens));
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

        // --- Leak filter (ADR-010 §2): index built from the template with
        // EMPTY variables, so quoting the user's own payload stays legal. --
        $gabaritVide = $repo->render(
            $etape,
            array_fill_keys($repo->get($etape)['variables'] ?? [], ''),
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
    // GET /api/twin9/meta — EVERYTHING the client ever sees of Twin_v9
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

        return $json($response, $paypal->createOrder(
            (float) $pack['montant_usd'],
            $paypalReturnUrl,
            $paypalCancelUrl,
        ));
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
        $paypal = PayPalClient::fromEnv(LlmRuntime::httpClient());
        if ($paypal === null) {
            return $json($response, ['error' => 'Recharge PayPal non configurée'], 503);
        }

        $body = $parseBody($request);
        $orderId = \is_array($body) && \is_string($body['order_id'] ?? null) ? $body['order_id'] : '';
        if (preg_match('/^[A-Za-z0-9_-]{1,64}$/', $orderId) !== 1) {
            return $json($response, ['error' => 'Champ requis : order_id'], 422);
        }

        $capture = $paypal->captureOrder($orderId); // 422 FR si non approuvé
        if ($capture['status'] !== 'COMPLETED') {
            return $json($response, ['error' => 'Paiement non finalisé côté PayPal, réessayez.'], 422);
        }
        $microusd = (int) round(((float) $capture['montant_usd']) * 1_000_000);
        if ($microusd <= 0) {
            return $json($response, ['error' => 'Montant PayPal invalide'], 502);
        }

        $result = (new CreditService(Db::get()))
            ->topup($userId, $microusd, $orderId, 'Recharge PayPal');

        return $json($response, ['solde_microusd' => $result['balance']]);
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
