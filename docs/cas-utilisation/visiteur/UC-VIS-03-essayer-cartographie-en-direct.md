# UC-VIS-03 — Essayer la cartographie en direct, sans compte

| Champ | Valeur |
|---|---|
| **Acteur principal** | Visiteur (aucun compte requis) |
| **Acteurs secondaires** | Fournisseur LLM de la plateforme (Anthropic, clé `ANTHROPIC_API_KEY`) ou fournisseur `mock` ; administrateur (réglages de la démo, UC-ADM-04) |
| **Portée** | humanome.xyz — page `#/essayer` ; API publique `GET /api/llm/status`, `GET /api/llm/challenge`, `POST /api/llm` |
| **Niveau** | Objectif utilisateur |
| **Cahier des charges** | §3.1 (copier-coller un texte → cartographie en direct, coûts masqués, garde-fous anti-abus), §3.8 (réglages admin) ; principe RGPD n°5 de `CLAUDE.md` (journalisation minimale : compteurs, jamais de contenu) |
| **Statut** | Implémenté (P6 ; audit adversarial `docs/securite-demo.md`) |

## Objectif

Permettre à un visiteur, sans compte et sans rien laisser derrière lui, de
coller un texte réflexif et d'obtenir en direct la cartographie de cette
« journée » par le vrai moteur (7 pôles instruits un par un, puis une synthèse
transversale kairos), le modèle de langage étant fourni et payé par la
plateforme — dans des limites qui protègent son budget.

## Déclencheur

Le visiteur choisit « Essayer » (badge « gratuit », « sans compte ») dans la
famille « Découvrir » du menu, ou le bouton « Essayer avec votre propre texte »
de l'accueil.

## Préconditions

- La démo est activée (`enabled`, réglable par l'administrateur, UC-ADM-04).
- Un secret de preuve de travail existe (`POW_SECRET`, sinon dérivé de
  `MIGRATE_TOKEN`) et, en fournisseur `anthropic`, la clé plateforme est en
  environnement.
- Le budget journalier (tokens et dollars, jour UTC) n'est pas épuisé.

## Garanties en cas de succès

- Le visiteur voit la cartographie de son texte dans la vue journée
  (`DayView`), peut l'imprimer ou l'exporter en JSON (téléchargement local).
- Le serveur n'a conservé **que des compteurs** : requêtes, tokens et coût
  estimé du jour (`llm_usage_daily`), empreintes SHA-256 des défis consommés
  (`llm_pow_challenges`), seau de quota haché (`rate_limits`). Ni le texte, ni
  la réponse, ni l'IP en clair.
- Le navigateur n'a rien écrit (ni Web Storage, ni IndexedDB) : un
  rechargement efface tout, et la page le dit.

## Garanties minimales (en cas d'échec)

- La clé API n'apparaît jamais dans une réponse ou un message d'erreur.
- Aucun appel amont n'est fait (donc aucun coût) tant que tous les gardes
  moins coûteux ne sont pas passés.
- Le texte reste à l'écran pour un nouvel essai ; un message français explique
  le refus (quota, démo épuisée, échec d'analyse).

## Scénario nominal

1. Le visiteur ouvre `#/essayer` : page « Essayer avec votre propre texte »,
   mention « Démonstration sans compte et sans aucune conservation », zone
   « Texte à cartographier » avec compteur « n / 12 000 caractères ». Le
   référentiel publié est chargé (repli embarqué, UC-VIS-02).
2. Il colle un texte de 80 à 12 000 caractères (voir AN3 : au-delà d'environ
   11 400 caractères, le serveur refuse) et clique « Cartographier ce texte » ;
   la journée est datée du jour **local** du navigateur.
3. Le navigateur obtient un défi `GET /api/llm/challenge` →
   `{challenge: "v1.<expiration>.<aléa>.<hmac>", difficultyBits, expiresAt}`
   (signé HMAC-SHA256, valable 5 minutes, rien n'est stocké à l'émission), puis
   résout la preuve de travail : trouver `nonce` tel que
   `sha256(challenge + ":" + nonce)` commence par au moins `difficultyBits` bits
   à zéro (≈ 1 s à 20 bits, fil principal découpé, annulable).
4. Le moteur (`extractDay`) enchaîne 8 appels — un par pôle, puis la synthèse
   kairos. Chaque appel est un `POST /api/llm` portant `{system, prompt,
   challenge, nonce, website: ""}` (plus les indications du moteur, ignorées),
   avec **un défi neuf résolu à la volée**. La page affiche « appel k sur 8 »,
   les pôles terminés et la phase en cours (défi, résolution, analyse).
5. Pour chaque appel, le serveur applique ses gardes, du moins coûteux au plus
   coûteux : interrupteur, champ piège vide, texte présent et ≤
   `maxInputChars`, preuve de travail valide, non expirée, suffisante et **jamais
   utilisée** (empreinte insérée, clé primaire), quota par IP et par heure,
   coupe-circuit journalier ; puis appelle le fournisseur avec **son** modèle et
   **son** plafond de tokens, compte tokens et coût estimé, et renvoie
   `{text, usage, model, stopReason}`.
6. Le moteur valide chaque pôle et le document complet ; la page affiche le
   bandeau « Démo : ce résultat n'est pas conservé… » (Imprimer, Exporter le
   JSON, Cartographier un autre texte) et la vue journée du résultat.

## Scénarios alternatifs

- **A1 — Fournisseur réel** (étape 5) : en production (`provider =
  anthropic`), l'appel part vers l'API Messages avec la clé en en-tête
  `x-api-key` seulement, sortie JSON forcée par un outil ; le coût estimé
  (tarif du préfixe de modèle le plus long) alimente le budget du jour. En
  `mock`, la réponse est tirée des fixtures `cartographie-jour-2026-01-0{5,6,7}`
  (pôle demandé, kairos), coût nul.
- **A2 — Après le résultat** (étape 6) : « Exporter le JSON » télécharge
  `cartographie-jour-<date>.json` sans rien envoyer ; « Cartographier un autre
  texte » revient au formulaire (le texte est encore à l'écran).
- **A3 — Synthèse kairos inexploitable** (étape 4) : après un nouvel essai
  interne, la journée est rendue avec ses 7 pôles et la note « La synthèse
  transversale (kairos) n'a pas pu être produite cette fois… ». Cela vaut pour
  **toute** défaillance du kairos, quota (429) et budget (503) compris : la
  page affiche alors un résultat à 7 pôles, sans message de quota.
- **A4 — Nouveaux essais automatiques** (étape 4) : deux mécanismes se
  cumulent. (1) Le fournisseur de la démo refait **une** fois un appel sur
  500/502/504/529, erreur réseau ou défi refusé dont le message contient
  « défi » (« Défi expiré », mais aussi le `429` `pow_reused` « Défi déjà
  utilisé »), après une pause de 2,5 s et avec un défi neuf ; pas sur les
  autres `429`, ni sur `503`, ni sur « Preuve de travail invalide. », ni après
  annulation. (2) `extractDay` refait **une** fois, aussitôt, chaque appel pôle
  ou kairos en échec, **quel que soit le statut**. Un `429` ou un `503` au POST
  coûte donc 2 POST (2 défis, 2 unités de quota) ; un 5xx persistant jusqu'à
  4 POST par pôle (anomalie AN2).
- **A5 — Annulation** (étape 4) : « Annuler l'analyse » interrompt l'appel en
  cours ; « Analyse annulée. Votre texte est toujours là, rien n'a été
  conservé. »
- **A6 — Disponibilité** : `GET /api/llm/status` → `{enabled, remainingToday}`
  (booléens seulement, aucun chiffre).

## Scénarios d'erreur

- **E1 — Robot : champ piège rempli** (étape 5) : `400` « Requête invalide »,
  indiscernable d'une erreur de validation ; rien n'est compté ni consommé.
- **E2 — Preuve de travail** (étape 5) : absente → `400` `pow_required` ;
  falsifiée ou insuffisante → `400` `pow_invalid` ; expirée → `400`
  `pow_expired` ; rejouée → `429` `pow_reused` avec `Retry-After: 1`.
- **E3 — Texte invalide** : côté page, moins de 80 caractères **utiles**
  (espaces de bord exclus) ou plus de 12 000 caractères **bruts** → bouton
  inactif, avec une indication sauf si la zone est vide ; côté API, prompt
  vide → `422`, `system` non textuel → `422`, entrée (`system` + `prompt`) >
  `maxInputChars` (20 000) → `413`, avant toute preuve. Le gabarit du prompt
  d'extraction ajoutant ≈ 8 600 caractères, un texte accepté par la page
  au-delà d'environ 11 428 caractères reçoit ce `413` (anomalie AN3).
- **E4 — Quota horaire par IP** (étape 5) : au-delà de `perIpPerHour` (20 par
  défaut, IPv6 regroupées par /64, quota partagé avec `GET /api/gdoc-text`) →
  `429` « Quota horaire atteint… » avec `Retry-After` progressif ; la page
  affiche « La démo est très demandée en ce moment : réessayez dans N minutes. »
  et « Réessayer ». `extractDay` a déjà refait l'appel une fois, aussitôt,
  sans attendre le `Retry-After` : 2 POST (anomalie AN2).
- **E5 — Budget du jour épuisé** (étape 5) : tokens ou dollars du jour UTC
  atteints → `503` « Démo épuisée pour aujourd'hui, revenez demain. » au
  **POST** (le défi, lui, ne consulte jamais le budget : il est émis, puis
  résolu) ; la page affiche « La démo est épuisée pour aujourd'hui ou
  momentanément désactivée… », sans bouton « Réessayer » — après 2 POST
  (anomalie AN2).
- **E6 — Démo désactivée ou non configurée** : démo désactivée ou sans secret
  → `503` **dès le défi** (« La démonstration est désactivée pour le
  moment. » ou « Service indisponible ») ; sans base ou sans clé, le défi est
  émis et `POST /api/llm` répond `503` « Service indisponible » (sans base :
  avant la preuve ; sans clé : après la preuve et le quota).
- **E7 — Fournisseur en échec** (étape 5) : `429` amont relayé avec son
  `Retry-After` ; autre erreur → `502` « Erreur du fournisseur LLM : … » ;
  injoignable → `504` (délai) ou `502`. Aucun de ces échecs n'est compté comme
  un usage. Réponse inexploitable d'un pôle après le nouvel essai du moteur →
  « L'analyse a échoué en cours de route (détail technique : extractDay :
  pôle n …) », « Réessayer », texte conservé.

## Règles de gestion

- **RG1** — Défi sans état, à usage unique : l'unicité est garantie à la
  **consommation** (empreinte en clé primaire), l'émission ne stocke rien.
- **RG2** — Gardes ordonnés du moins coûteux au plus coûteux ; le fournisseur,
  le modèle et le plafond de sortie sont imposés par le serveur (indications du
  client ignorées).
- **RG3** — Configuration : base (`settings.demo_overrides`, admin) > variables
  `DEMO_*` > `api/config/demo.php` > défauts ; le fournisseur ne vient jamais de
  la base ; base indisponible → couche ignorée en silence.
- **RG4** — Coupe-circuit journalier global sur les tokens **ou** le coût
  estimé ; budgets de la démo et du tuteur séparés.
- **RG5** — Intention : pas de réessai automatique contre un quota (429) ni un
  budget (503), un seul pour un incident transitoire. Réalité : le
  fournisseur de la démo respecte cette intention (sauf `429` `pow_reused`),
  mais `extractDay` refait une fois tout appel en échec (anomalie AN2).

## Données et RGPD

| Donnée | Traitement |
|---|---|
| Texte collé, réponse du modèle | Jamais stockés ni journalisés (serveur et navigateur) |
| IP du visiteur | Jamais stockée : seau `llm:` + sha256 de l'identité (/64 en IPv6) |
| Défi consommé | Empreinte SHA-256 + expiration ; purgée de façon opportuniste lors d'une consommation ultérieure (démo ou tuteur), une fois expirée — aucune purge planifiée |
| Usage | Compteurs du jour : requêtes, tokens entrée/sortie, coût estimé |
| Clé plateforme | Environnement uniquement, en-tête amont uniquement |

## Code sollicité

| Couche | Élément | Rôle |
|---|---|---|
| Front | `web/src/views/EssayerView.jsx` | Saisie, bornes, progression, annulation, résultat, erreurs |
| Front | `web/src/lib/demo-llm.js` — `fetchChallenge`, `createDemoProvider`, `describeDemoError`, `localIsoToday`, `DEMO_TEXT_MIN_CHARS`/`MAX`, `UPSTREAM_RETRY_DELAY_MS` | Défi par appel, champ piège, nouvel essai unique du fournisseur (A4), messages, date locale |
| Front | `web/src/lib/pow.js` — `solvePow`, `leadingZeroBits`, `MAX_DIFFICULTY_BITS` | Preuve de travail côté navigateur |
| Moteur | `engine/src/providers/index.js` — `createProvider` (transport `proxy`) | Appel du proxy, sans clé, sans nouvel essai automatique **au niveau du fournisseur** (`maxAttempts: 1`) |
| Moteur | `engine/src/pipeline/extract.js` — `extractDay`, `buildExtractionPrompt` | 7 pôles + kairos facultatif, un nouvel essai immédiat de tout appel en échec (AN2), validation (voir aussi UC-APP-02) ; gabarit du prompt (AN3) |
| API | `GET /api/llm/status`, `GET /api/llm/challenge`, `POST /api/llm` — `api/src/routes/llm.php` | Orchestration des gardes |
| Domaine | `api/src/Llm/PowChallenge.php` — `issue`, `verify`, `secretFromEnv`, `leadingZeroBits` | Preuve de travail sans état |
| Domaine | `api/src/Llm/UsageCounters.php` — `record`, `today`, `isExhausted` | Coupe-circuit journalier |
| Domaine | `api/src/Llm/Pricing.php` — `estimateUsd` | Coût estimé |
| Domaine | `api/src/Llm/DemoConfig.php` — `load` | Précédence de configuration |
| Domaine | `api/src/Llm/MockProvider.php`, `api/src/Llm/AnthropicProvider.php`, `api/src/Llm/LlmRuntime.php` | Fournisseurs, client HTTP injectable |
| Domaine | `api/src/Auth/RateLimiter.php`, `api/src/ClientIp.php` | Quota par IP (voir UC-EMP-01) |

## Jeux de tests

### Tests unitaires

| ID | Cible | Vérifie | Fichier |
|---|---|---|---|
| UC-VIS-03-U01 | `PowChallenge::issue` | Format signé, expiration 5 min, aléa | `api/tests/UseCases/Unit/UcVis03EssayerCartographieTest.php` |
| UC-VIS-03-U02 | `PowChallenge::verify` | OK, falsifié, autre secret, expiré, trop faible (E2) | idem |
| UC-VIS-03-U03 | `PowChallenge::secretFromEnv`, `leadingZeroBits` | Précédence du secret, bits à zéro | idem |
| UC-VIS-03-U04 | `UsageCounters` | Jour UTC même sous un fuseau serveur à UTC+14, tokens OU budget, budgets séparés, table sur liste blanche (RG4) | idem |
| UC-VIS-03-U05 | `Pricing::estimateUsd` | Préfixe le plus long, mock gratuit, défaut prudent | idem |
| UC-VIS-03-U06 | `DemoConfig::load` | Base > env > fichier ; fournisseur hors base ; fail-safe base injoignable (branche `catch`) et base non configurée (RG3) | idem |
| UC-VIS-03-U07 | `MockProvider::complete` | Pôle et kairos des fixtures, texte générique, tokens estimés | idem |
| UC-VIS-03-U08 | `AnthropicProvider::complete` | Modèle, `thinking` désactivé, plafond, clé en en-tête, 429 typé, délai | idem |
| UC-VIS-03-U09 | `leadingZeroBits` (JS) | Parité avec les vecteurs PHP de U03 | `web/test/usecases/unit/uc-vis-03-essayer-cartographie-en-direct.test.js` |
| UC-VIS-03-U10 | `solvePow` | Nonce valide pour un défi au format serveur (node:crypto), annulation (`AbortError`) | idem |
| UC-VIS-03-U11 | `fetchChallenge` | URL relative, `ProviderError` typée, réponse invalide | idem |
| UC-VIS-03-U12 | `createDemoProvider` | Un défi neuf par appel, preuve valide, champ piège vide, phases | idem |
| UC-VIS-03-U13 | `describeDemoError` | 429 → minutes + réessai ; 503 → sans réessai ; autre → détail technique repris | idem |
| UC-VIS-03-U14 | `DEMO_TEXT_MIN_CHARS`, `DEMO_TEXT_MAX_CHARS` | Bornes de la page (80 / 12 000) — le plafond serveur est traité par U23 | idem |
| UC-VIS-03-U15 | `solvePow`, `MAX_DIFFICULTY_BITS` | **Comportement actuel figé** — anomalie AN1 | idem |
| UC-VIS-03-U16 | `createProvider` (transport `proxy`) | Corps exact vers `api/llm`, aucune clé, réponse relue | `engine/test/usecases/unit/uc-vis-03-essayer-cartographie-en-direct.test.js` |
| UC-VIS-03-U17 | `createProvider` (`maxAttempts: 1`) | Couche fournisseur seule : 429 sans nouvel essai, `Retry-After` porté (ne couvre pas RG5 de bout en bout, voir U22) | idem |
| UC-VIS-03-U18 | `extractDay` | 7 pôles + kairos → document valide au schéma | idem |
| UC-VIS-03-U19 | `extractDay` (`kairosOptional`) | Kairos inexploitable → `null`, « skipped » (A3) | idem |
| UC-VIS-03-U20 | `extractDay` | `stopReason: max_tokens` → échec explicite après un nouvel essai | idem |
| UC-VIS-03-U21 | `createDemoProvider` | Nouvel essai unique après 2,5 s (phase `retry`, défi neuf) sur 504, erreur réseau, défi expiré ; aucun sur 429, 503, preuve invalide, annulation (A4) | `web/test/usecases/unit/uc-vis-03-essayer-cartographie-en-direct.test.js` |
| UC-VIS-03-U22 | `createDemoProvider` + `extractDay` | **Comportement actuel figé** — anomalie AN2 : 429 ou 503 au POST → 2 POST, 504 persistant → 4 POST | idem |
| UC-VIS-03-U23 | `buildExtractionPrompt`, `DEMO_TEXT_MAX_CHARS` | **Comportement actuel figé** — anomalie AN3 : prompt > 20 000 à 12 000 caractères de texte | idem |
| UC-VIS-03-U24 | `localIsoToday` | Jour LOCAL (fuseau UTC+14) et non UTC (étape 2) | idem |

### Tests fonctionnels

| ID | Scénario | Niveau | Vérifie | Fichier |
|---|---|---|---|---|
| UC-VIS-03-F01 | Nominal, A6 | API | Statut, 8 appels (7 pôles + kairos) avec défis distincts, défis hachés, compteurs, aucune session | `api/tests/UseCases/Functional/UcVis03EssayerCartographieTest.php` |
| UC-VIS-03-F02 | Garanties (RGPD) | API | Ni texte, ni extrait de la réponse, ni IP dans **aucune** table ; seau haché | idem |
| UC-VIS-03-F03 | A1 | API | Anthropic simulé : modèle et plafond imposés, clé en en-tête, coût compté | idem |
| UC-VIS-03-F04 | E1 | API | Champ piège → 400 banal, rien de compté ni consommé | idem |
| UC-VIS-03-F05 | E2 | API | Preuve absente, falsifiée, faible, expirée (non consommée), rejouée | idem |
| UC-VIS-03-F06 | E3 | API | 422 / 413 avant toute preuve | idem |
| UC-VIS-03-F07 | E4 | API | Quota par IP → 429 + `Retry-After`, autre IP épargnée | idem |
| UC-VIS-03-F08 | E5, A6 | API | Budget épuisé → 503, `remainingToday` faux | idem |
| UC-VIS-03-F09 | E6 | API | Démo désactivée ou sans secret → 503 | idem |
| UC-VIS-03-F10 | E7 | API | 429 relayé, 502, 504, clé absente → 503 ; rien compté | idem |
| UC-VIS-03-F11 | Nominal | IHM | Menu → run complet accepté par un faux serveur aux règles PHP ; journée datée du jour local ; rien conservé ; verdict lisible | `web/test/usecases/functional/uc-vis-03-essayer-cartographie-en-direct.test.jsx` |
| UC-VIS-03-F12 | A2 | IHM | Export JSON local (nom daté du jour local) ; retour au formulaire | idem |
| UC-VIS-03-F13 | A3 | IHM | Kairos inexploitable → 7 pôles + note | idem |
| UC-VIS-03-F14 | A4, anomalie AN4 | IHM | 504 transitoire → un nouvel essai du fournisseur ≥ 2,4 s plus tard, défi neuf ; pendant la pause, phase « — » sans libellé (**comportement actuel figé**) | idem |
| UC-VIS-03-F15 | A5 | IHM | Annulation → texte conservé, aucun appel de plus | idem |
| UC-VIS-03-F16 | E3 | IHM | Trop court / trop long → bouton inactif, aucune requête | idem |
| UC-VIS-03-F17 | E4, anomalie AN2 | IHM | 429 → « réessayez dans 2 minutes », Réessayer ; 2 POST (**comportement actuel figé**) | idem |
| UC-VIS-03-F18 | E6 | IHM | 503 dès le défi (démo désactivée) → message, sans réessai, aucun POST | idem |
| UC-VIS-03-F19 | Anomalie AN1 | IHM | **Comportement actuel figé** — difficulté 23 → échec générique | idem |
| UC-VIS-03-F20 | E5, anomalie AN2 | IHM | Défi émis, POST en 503 « Démo épuisée… » → message « épuisée », sans Réessayer, texte conservé ; 2 défis, 2 POST (**comportement actuel figé**) | idem |
| UC-VIS-03-F21 | A3 | IHM | 503 sur l'appel kairos seul → résultat à 7 pôles + note kairos, aucun message de quota ; 9 POST | idem |
| UC-VIS-03-F22 | E7 | IHM | Pôle 2 inexploitable deux fois → « L'analyse a échoué… (détail technique : extractDay : pôle 2 … » , Réessayer, texte conservé, 3 POST | idem |
| UC-VIS-03-F23 | Anomalie AN3 | IHM | **Comportement actuel figé** — texte de 12 000 caractères accepté par la page → 413 (règle serveur) deux fois, échec générique | idem |

### Tests existants liés (non-régression)

- `api/tests/LlmPowTest.php`, `api/tests/LlmProxyTest.php`, `api/tests/LlmMockProviderTest.php` — gardes, quotas IPv6, surcharges admin.
- `api/tests/LlmGdocTextTest.php` (`testQuotaIsSharedWithTheLlmProxy`) — quota par IP partagé avec `GET /api/gdoc-text` (E4).
- `api/tests/CartographiesCsrfTest.php` — exemption CSRF de `/api/llm`.
- `web/src/views/EssayerView.test.jsx`, `web/src/lib/demo-llm.test.js`, `web/src/lib/pow.test.js`.
- `docs/securite-demo.md` — modèle de l'abuseur et résidus acceptés.

### Exécuter

```sh
docker compose run --rm -e DB_TEST_NAME=humanome_test_vis php vendor/bin/phpunit --filter UcVis03 --testdox
cd web && npx vitest run test/usecases/unit/uc-vis-03 test/usecases/functional/uc-vis-03
cd engine && npx vitest run test/usecases/unit/uc-vis-03
```

## Anomalies constatées

- **AN1 — Difficulté réglable par l'admin mais insoluble par le navigateur.**
  `api/src/Admin/DemoConfigService.php` accepte `powDifficultyBits` de 8 à
  **24** ; `web/src/lib/pow.js` refuse au-delà de **22** (`MAX_DIFFICULTY_BITS`,
  `TypeError`). Un réglage à 23 ou 24 rend la démo (et le tuteur, UC-VIS-05)
  inutilisable : chaque essai échoue avec « L'analyse a échoué en cours de
  route (détail technique : solvePow : difficultyBits entier entre 0 et 22
  requis…) ». Comportement actuel figé par UC-VIS-03-U15 et F19.
- **AN2 — Le moteur réessaie contre le quota et le budget.** `extractDay`
  (`engine/src/pipeline/extract.js`) refait une fois tout appel pôle ou kairos
  en échec, quel que soit le statut, ce qui annule l'intention de
  `createDemoProvider` (« automatic retries are DISABLED… a 429 here means the
  demo quota, hammering it would be abuse »). Sur un `429` de quota ou un
  `503` de budget, le navigateur renvoie aussitôt un second POST, sans
  attendre le `Retry-After` : un nouveau défi et une nouvelle preuve, une
  unité de quota de plus (et le backoff progressif avance). Sur un 5xx
  persistant, 4 POST par pôle (≈ 5 s de pauses). Le `429` `pow_reused` est,
  lui, réessayé par la démo (message « Défi déjà utilisé »). Comportement
  actuel figé par UC-VIS-03-U22, F17 et F20.
- **AN3 — Borne de saisie incompatible avec le plafond serveur.** La page
  accepte 12 000 caractères (`DEMO_TEXT_MAX_CHARS`), mais
  `buildExtractionPrompt` ajoute ≈ 8 300 à 8 600 caractères de gabarit et le
  serveur plafonne `system` + `prompt` à `maxInputChars` = 20 000 : au-delà
  d'environ 11 428 caractères de texte, les appels pôle reçoivent un `413`
  « Texte trop long : 20000 caractères maximum… » et le visiteur voit
  « L'analyse a échoué en cours de route (… HTTP 413 …) » alors que le
  compteur affiche par exemple « 11 800 / 12 000 ». Comportement actuel figé
  par UC-VIS-03-U23 et F23.
- **AN4 — Phase « retry » sans libellé** (cosmétique). Pendant la pause de
  2,5 s du nouvel essai (A4), `onPhase('retry')` positionne la phase courante,
  mais `PHASE_LABELS` (`web/src/views/EssayerView.jsx`) n'a pas d'entrée
  `retry` : l'étape active affiche un « — » orphelin. Comportement actuel figé
  par UC-VIS-03-F14.

## Limites

- La page n'interroge pas `GET /api/llm/status` avant de proposer l'essai :
  une démo **épuisée** n'est découverte qu'au premier `POST /api/llm`, après
  une preuve résolue, un défi consommé et une unité de quota (deux fois, avec
  le nouvel essai du moteur, AN2) ; seules une démo désactivée ou l'absence de
  secret sont refusées dès le défi (E6).
- Le quota par IP est consommé après la preuve de travail, y compris pour une
  requête refusée ensuite par le coupe-circuit journalier.
