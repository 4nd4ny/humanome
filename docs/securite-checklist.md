# Checklist sécurité — OWASP Top 10 (2021)

Durcissement P12.3 (chantier C). Chaque item est **Fait** (comment, avec fichiers et
tests) ou **Justifié** (pourquoi non applicable). Contexte : app RGPD-by-design,
client-first (ADR-001), PHP 8.2 + Slim 4 + PDO sur mutualisé OVH (ADR-002/008),
front statique Vite. Docs de sécurité liées : `securite-demo.md` (garde-fous démo
P6), `securite-prompts.md` (modèle de menace sandbox promptologue P10).

Dernière revue : M9 (2026-07-12).

---

## Audits de dépendances (relancés en M9)

| Audit | Commande | Résultat |
|---|---|---|
| PHP | `docker compose run --rm php composer audit` | **0 advisory.** Deps directes : slim/slim 4.15.2, slim/psr7 1.8.0, vlucas/phpdotenv 5.6.4, opis/json-schema 2.6.0, phpunit 10.5.64 (dev). |
| JS (prod) | `cd web && npm audit --omit=dev` | **0 vulnérabilité.** Ce qui est déployé (bundle statique) est propre. |
| JS (dev) | `cd web && npm audit` | 5 (3 modérées, 1 haute, 1 critique) — **toutes dans l'outillage de dev** : vite / vitest (UI) / vite-node / esbuild / @vitest/mocker. Voir A06. |

---

## A01 — Contrôle d'accès défaillant · **Fait**

- **Autorisation par rôle** centralisée : middleware `RequireRole` (`api/src/Middleware/RequireRole.php`)
  — 401 sans session (le visiteur = absence de session, cahier §2), 403 sans le rôle ;
  les rôles sont relus en base à chaque requête (révocation immédiate). Matrice
  rôle→route dans `docs/autorisations.md`. Tests : `AuthRequireRoleTest`.
- **IDOR fermé par périmètre `user_id`** : les accès aux ressources d'un compte
  passent par des requêtes filtrées côté serveur, jamais par un id seul.
  Ex. `CartographyRepository::findForUser($id, $userId)` /
  `listForUser($userId)` (`api/src/Cartographies/CartographyRepository.php`) — un
  autre utilisateur reçoit 404, pas la ressource. Tests : `CartographiesTest`,
  `CartographiesPurgeTest`. Idem rattachements cartographe↔apprenant
  (`Cartographe/*`, tests `CartographeGarantieTest`/`CartographeRevisionsTest`) et
  cohortes établissement (`Etablissement/CohorteRepository.php`).
- **Outillage admin par jeton de déploiement** (`/admin/*`, ADR-008) : « n'existe
  pas » (404) si `MIGRATE_TOKEN` non configuré, 403 sinon, comparaison
  `hash_equals` (temps constant). Tests : `AdminRolesTest`, `SystemRoutesTest`.
- **En-têtes anti-cadrage** : `X-Frame-Options: DENY` (API) et `frame-ancestors`
  (front `'self'`, API `'none'`) — voir A05.

## A02 — Défaillances cryptographiques · **Fait**

- **Mots de passe** : `password_hash` en **Argon2id** quand disponible
  (`api/src/Auth/Users.php`), sinon repli `PASSWORD_DEFAULT`.
- **Clés API personnelles / établissement** : chiffrées au repos via
  **libsodium** `sodium_crypto_secretbox` (nonce par enregistrement), clé maîtresse
  `SODIUM_MASTER_KEY` **hors webroot** (`~/app/shared/.env`, ADR-004/008), effacée
  mémoire par `sodium_memzero` après usage (`api/src/Keys/KeyVault.php`,
  `api/src/Etablissement/ConfigRepository.php`). Tests : `KeysTest`,
  `EtablissementConfigTest`.
- **Jetons jamais stockés en clair** : liens de partage employeur hachés
  **Argon2id** + 404 homogène anti-énumération (`api/src/Cartographe/Links.php`,
  cahier §3.6) ; jetons worker et IP de session hachés **sha256**
  (`ConfigRepository`, `DbSessionHandler.php`). Le hash de contenu du référentiel
  (`Referentiel/ContentHash.php`) est un checksum d'intégrité, pas un secret.
- **Transport** : HTTPS forcé (redirection 301, `web/public/.htaccess`) + **HSTS**
  `max-age=31536000` sur le front ET l'API (voir A05).

## A03 — Injection · **Fait**

- **SQL** : **PDO en requêtes préparées à paramètres liés partout**. Les seuls
  `PDO::query()` du code portent des chaînes **constantes** (pas d'entrée
  utilisateur) : listings à SQL figé, `GET_LOCK`/`RELEASE_LOCK` dont l'argument
  passe par `PDO::quote()` (`api/src/Worker/Tick.php`). Re-grep M9 : aucune
  concaténation d'entrée utilisateur dans une requête. Pas d'ORM (cahier §4.5).
- **Injection HTML/DOM (XSS)** : le HTML narratif est assaini par **DOMPurify**
  durci (ADR-007, M2) ; la CSP interdit `'unsafe-eval'`, `object-src 'none'`,
  scripts hors origine (A05). Le code tiers des prompt-packages s'exécute en
  **sandbox** isolée (A08 / `securite-prompts.md`).
- **Injection de commande** : aucune (`exec`/`shell_exec`/`system` absents du code
  applicatif).

## A04 — Conception non sécurisée · **Fait**

- **RGPD-by-design, client-first** (ADR-001, cahier §6) : le portfolio ne quitte
  jamais le navigateur par défaut ; tout stockage serveur est un **opt-in explicite**
  (§6.2), tracé. Réduit d'emblée la surface de fuite côté serveur.
- **Garde-fou humain obligatoire** : jamais de cartographie 100 % automatisée
  présentée comme garantie (cahier §8, rôle cartographe P9).
- **Format pivot d'export** (AD-6) : un schéma unique pour export/suppression/clone,
  validé (`schemas/archive-export.schema.json`), limite les incohérences de données.
- **Moindre privilège** partout : jetons de déploiement pour l'admin, quotas démo,
  sandbox sans réseau ni DOM.

## A05 — Mauvaise configuration de sécurité · **Fait (durci en M9)**

- **En-têtes de sécurité API** : nouveau middleware Slim
  `api/src/Middleware/SecurityHeaders.php`, câblé **en dernier dans `Bootstrap`**
  donc **le plus externe** — il décore TOUTES les réponses `/api/**`, y compris les
  401/403 court-circuitées par les gardes internes et les 404/500 de l'error
  middleware. Valeurs (API JSON = surface minimale) :
  `Content-Security-Policy: default-src 'none'; frame-ancestors 'none'; base-uri 'none'`,
  `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
  `Referrer-Policy: no-referrer`, `Permissions-Policy` refusant toutes les
  fonctionnalités, `Strict-Transport-Security: max-age=31536000`.
  Tests : `SecurityHeadersTest` (présents sur `/api/health` **et** sur une route
  authentifiée renvoyant 401, **et** sur un 404).
- **CSP du front** (`web/public/.htaccess`) : `default-src 'self'`, pas de
  `'unsafe-eval'`, `object-src 'none'`, `base-uri 'self'`, `frame-ancestors 'self'`,
  `connect-src 'self'`, Permissions-Policy restrictive (ajoutée en M9).
  **Correction de régression M9 (bug réel)** : la CSP de prod cassait
  *silencieusement* la sandbox promptologue (P10). Un iframe `srcdoc` **hérite de la
  CSP de la page parente** ; `script-src 'self'` refusait donc le bootstrap inline
  du srcdoc et l'import blob du worker. La sandbox était de fait **morte en
  production depuis sa livraison (M7)** — la CSP en place depuis M2 refusant le
  script inline hérité du srcdoc (l'e2e ne l'avait pas vu : il tournait contre le
  dev-server sans CSP). Ajouts **au plus juste**, chacun vérifié bout-en-bout :
    - `script-src` : `'sha256-7Ll8/Q7scy4XeEgF5GUsqHX5nPQqrnsVFr+cbzr/yEc='` (hash du
      `<script>` **figé** du srcdoc — `buildSrcdoc()`, `web/src/lib/sandbox/protocol.js`)
      **et** `blob:` (source du worker + import ESM du paquet, blob: hérités par le
      worker). Ce `blob:` de haut niveau **n'est PAS** ce qui contient le code tiers :
      la containment réelle vient de l'**origine opaque** + de la meta CSP
      `default-src 'none'` DU srcdoc (aucune sortie réseau). `protocol.js` étant hors
      périmètre de ce chantier, la CSP doit accommoder l'architecture existante.
    - `worker-src blob:` : directive spec-correcte pour le worker blob (Chromium
      régit aujourd'hui la création du worker via `script-src`, donc redondante à ce
      jour mais elle blinde la chaîne de repli `worker-src`).
    - `frame-src` **non élargi** : `about:srcdoc` est déjà permis par
      `default-src 'self'`, et rien ne cadre de blob:/data:.
  Garde anti-dérive : `web/src/lib/sandbox/csp-hash.test.js` (vitest) recalcule le
  hash depuis la source et exige sa présence dans le `.htaccess` — une retouche du
  srcdoc échoue le test au lieu de re-casser la prod en silence.
  Preuve fonctionnelle **sous la vraie CSP de prod** :
  `web/e2e/sandbox-isolation.e2e.js` lit le `.htaccess`, applique la CSP sur le
  document parent, et vérifie (a) qu'un paquet bénin atteint `result` et (b) qu'un
  paquet hostile reste totalement contenu.
- **En-têtes API sur OVH** : sur le mutualisé, le `www/.htaccess` du front (`Header
  always set`) **se propage** dans `www/api/`. `api/deploy/webroot/.htaccess`
  **réaffirme** défensivement les valeurs API (CSP `default-src 'none'`, X-Frame
  `DENY`, …) pour qu'Apache et PHP s'accordent. **Non vérifiable avant déploiement**
  (le docker sert l'API sans le `.htaccess` du front) → **smoke à faire après
  déploiement** : `curl -sI https://humanome.xyz/api/health` doit montrer la CSP
  `default-src 'none'` et `X-Frame-Options: DENY`, pas les valeurs du front.
- **Erreurs masquées en prod** : `Bootstrap::createApp()` n'active
  `displayErrorDetails` que si `APP_ENV=dev` — en production les traces ne fuitent
  pas (message générique + `error_log`). Secrets **hors webroot** (`~/app/shared/.env`,
  ADR-008), jamais dans le dépôt ni servis par Apache.
- **Portée navigateur** : la validation sandbox est **Chromium** (comme toute la
  chaîne e2e). Limitation connue et assumée, non un défaut : Safari/Firefox mobiles
  ne sont pas couverts par le test d'isolation.

## A06 — Composants vulnérables et obsolètes · **Fait**

- **`composer audit` : 0 advisory** (deps de prod à jour, cf. tableau supra).
- **`npm audit --omit=dev` : 0 vulnérabilité** — le code déployé est un **bundle
  statique** (ADR-003), aucun Node ni dépendance runtime sur OVH.
- **`npm audit` complet** : 5 findings **tous dans l'outillage de développement**
  (serveur de dev Vite, UI Vitest, serveur esbuild). **Non exploitables en
  production** : ces surfaces sont des serveurs de dev locaux, jamais déployés et
  jamais atteignables par un attaquant du site en ligne. Correctif = bump majeur
  cassant de vite/vitest, **non justifié** au regard d'un risque prod nul ; à
  intégrer lors d'une montée de version de l'outillage (backlog), pas en réaction
  sécurité. Aucune vulnérabilité HAUTE/CRITIQUE *exploitable* n'a été trouvée.

## A07 — Défaillances d'identification et d'authentification · **Fait**

- **Sessions** : cookies `HttpOnly` + `SameSite`, régénération d'ID
  (`api/src/Auth/Session.php`, handler `DbSessionHandler.php`).
- **CSRF** : double-submit global sur les méthodes mutantes de `/api/**`
  (`api/src/Middleware/CsrfMiddleware.php`, `hash_equals`) ; exemptions documentées
  (endpoints à jeton propre, login/register rate-limités). Tests : `AuthCsrfTest`,
  `CartographiesCsrfTest`.
- **Anti-force-brute** : rate-limit progressif par IP (buckets par préfixe
  IPv6 /64, correctif abuseur M5) sur l'auth ; anti-énumération (réponses
  homogènes) à l'inscription/connexion et sur les liens de partage. Tests :
  `AuthRateLimitTest`, `ClientIpTest`.
- **Démo publique** : honeypot + preuve de travail HMAC one-time, quotas IP/h et
  budget quotidien (`securite-demo.md`, `LlmPowTest`).

## A08 — Défaillances d'intégrité des logiciels et des données · **Fait**

- **Code tiers (prompt-packages) exécuté en sandbox** : Web Worker blob dans un
  iframe `srcdoc` à **origine opaque**, sans DOM, sans storage, **sans réseau**
  (meta CSP `default-src 'none'`) ; seule interface = `postMessage` avec quota
  d'appels LLM et timeout ; **seules les versions publiées** (immuables, semver +
  hash) sont exécutables par autrui. Modèle de menace : `securite-prompts.md`.
  Isolation **démontrée en vrai Chromium** (`web/e2e/sandbox-isolation.e2e.js`), y
  compris **sous la CSP de production** (voir A05).
- **Versions immuables** : référentiel et prompt-packages publiés sont figés
  (semver + `contentHash` sha256) ; chaque cartographie référence ses versions
  (cahier §4.3). Import idempotent vérifié par hash.
- **Désérialisation** : uniquement `json_decode` + validation **JSON Schema**
  (opis/json-schema côté PHP, ajv côté moteur) ; jamais `unserialize` de données
  externes.

## A09 — Journalisation et supervision · **Fait / Justifié**

- **Minimisation RGPD (cahier §6.5)** : journal d'audit = **compteurs et
  événements**, **jamais de contenu** de portfolio ni de cartographie
  (`api/src/Auth/Audit.php`) : création/export/suppression de compte, partages,
  attribution de rôle (ids + nom de rôle whitelisté, jamais l'email). Registre des
  traitements : `docs/rgpd-registre.md` (P12.2, transverse).
- **Traces techniques** via `error_log` (message générique, sans secret ni PII) ;
  jetons jamais loggés, jamais en query string (ADR-008).
- **Supervision** : page `/status` + `GET /api/health` (santé base, version). Une
  alerting centralisée est **hors périmètre v1** (mutualisé OVH, Harmonia seul
  pilote — cahier §5) : **justifié**, à revoir en hébergement scalable v2+.

## A10 — Falsification de requête côté serveur (SSRF) · **Fait**

- **`GET /api/gdoc-text`** (import Google Docs, P7) : origine **codée en dur**
  (`docs.google.com`), **pas d'URL fournie par l'utilisateur** (seulement un
  `docId`), au plus 3 redirections suivies et **uniquement** vers `https` +
  `*.googleusercontent.com` — jamais d'IP littérale, jamais un autre domaine,
  jamais un port non standard (`api/src/routes/llm.php`). Tests : `LlmGdocTextTest`.
- **Endpoint LLM d'établissement** (URL + clé fournies par l'établissement, cahier
  §4.9) : **jamais atteint depuis OVH**. Le tick plateforme ne sert que le
  fournisseur `humanome` et **réaffirme le fournisseur après réservation du job**
  (`api/src/Worker/Tick.php` ~l.137) — correctif SSRF **medium** de M8 : sans cette
  réassertion, une bascule `humanome→endpoint` entre le SELECT de réservation et la
  lecture aurait fait d'`endpoint_url` un puits SSRF. Un job `endpoint` est laissé
  au **runner machine** de l'établissement (`/api/worker/*`), qui paie et exécute
  chez lui. Tests : `MasseDoDTest`, `WorkerRouteTest`.
- **Proxy LLM démo** : fournisseur/modèle/plafonds **imposés serveur**, clé jamais
  exposée, URL non contrôlable par le client (P6, `securite-demo.md`).

---

## À faire après déploiement (chef d'orchestre)

1. **Smoke des en-têtes API en prod** : `curl -sI https://humanome.xyz/api/health` →
   vérifier `Content-Security-Policy: default-src 'none'…`, `X-Frame-Options: DENY`,
   `Strict-Transport-Security`, `Referrer-Policy: no-referrer`, `Permissions-Policy`.
2. **Smoke de la CSP front + sandbox** : ouvrir `#/promptologue`, lancer le banc
   d'essai sur un paquet publié — la console ne doit montrer aucune violation CSP et
   la cartographie doit s'afficher (preuve que la correction de régression tient en
   prod réelle, pas seulement en e2e).
