# UC-VIS-03 — Essayer la cartographie en direct, sans compte

| Champ | Valeur |
|---|---|
| **Acteur principal** | Visiteur (aucun compte requis) |
| **Acteurs secondaires** | Fournisseur LLM de la plateforme (Anthropic, clé `ANTHROPIC_API_KEY`) ou fournisseur `mock` ; administrateur (réglages de la démo, UC-ADM-04) |
| **Portée** | humanome.xyz — page `#/essayer` ; API publique `GET /api/llm/status`, `GET /api/llm/challenge`, `POST /api/llm` |
| **Niveau** | Objectif utilisateur |
| **Cahier des charges** | §3.1 (copier-coller un texte → cartographie en direct, coûts masqués, garde-fous anti-abus), §6.5 (compteurs, jamais de contenu), §3.8 (réglages admin) |
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
2. Il colle un texte de 80 à 12 000 caractères et clique « Cartographier ce
   texte » ; la journée est datée du jour **local**.
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
  transversale (kairos) n'a pas pu être produite cette fois… ».
- **A4 — Incident amont transitoire** (étape 4) : sur 500/502/504/529, erreur
  réseau ou défi refusé (expiré/rejoué), un **seul** nouvel essai automatique
  après 2,5 s, avec un défi neuf ; jamais sur 429 ni 503.
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
- **E3 — Texte invalide** : côté page, moins de 80 ou plus de 12 000 caractères
  → bouton inactif et indication ; côté API, prompt vide → `422`, `system` non
  textuel → `422`, entrée > `maxInputChars` → `413`.
- **E4 — Quota horaire par IP** (étape 5) : au-delà de `perIpPerHour` (20 par
  défaut, IPv6 regroupées par /64, quota partagé avec `GET /api/gdoc-text`) →
  `429` « Quota horaire atteint… » avec `Retry-After` progressif ; la page
  affiche « La démo est très demandée en ce moment : réessayez dans N minutes. »
  et « Réessayer ».
- **E5 — Budget du jour épuisé** (étape 5) : tokens ou dollars du jour UTC
  atteints → `503` « Démo épuisée pour aujourd'hui, revenez demain. » ; la page
  affiche « La démo est épuisée pour aujourd'hui ou momentanément désactivée… »,
  sans réessai.
- **E6 — Démo désactivée ou non configurée** : `503` sur le défi et l'appel
  (« La démonstration est désactivée pour le moment. » ou « Service
  indisponible » sans secret, sans base ou sans clé).
- **E7 — Fournisseur en échec** (étape 5) : `429` amont relayé avec son
  `Retry-After` ; autre erreur → `502` « Erreur du fournisseur LLM : … » ;
  injoignable → `504` (délai) ou `502`. Aucun de ces échecs n'est compté comme
  un usage. Réponse inexploitable après le nouvel essai du moteur → « L'analyse
  a échoué en cours de route (détail technique : …) », « Réessayer ».

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
- **RG5** — Pas de réessai automatique contre un quota (429) ; un seul pour un
  incident transitoire.

## Données et RGPD

| Donnée | Traitement |
|---|---|
| Texte collé, réponse du modèle | Jamais stockés ni journalisés (serveur et navigateur) |
| IP du visiteur | Jamais stockée : seau `llm:` + sha256 de l'identité (/64 en IPv6) |
| Défi consommé | Empreinte SHA-256 + expiration, purgée à l'expiration |
| Usage | Compteurs du jour : requêtes, tokens entrée/sortie, coût estimé |
| Clé plateforme | Environnement uniquement, en-tête amont uniquement |

## Code sollicité

| Couche | Élément | Rôle |
|---|---|---|
| Front | `web/src/views/EssayerView.jsx` | Saisie, bornes, progression, annulation, résultat, erreurs |
| Front | `web/src/lib/demo-llm.js` — `fetchChallenge`, `createDemoProvider`, `describeDemoError`, `DEMO_TEXT_MIN_CHARS`/`MAX` | Défi par appel, champ piège, nouvel essai unique, messages |
| Front | `web/src/lib/pow.js` — `solvePow`, `leadingZeroBits`, `MAX_DIFFICULTY_BITS` | Preuve de travail côté navigateur |
| Moteur | `engine/src/providers/index.js` — `createProvider` (transport `proxy`) | Appel du proxy, sans clé, sans nouvel essai automatique |
| Moteur | `engine/src/pipeline/extract.js` — `extractDay` | 7 pôles + kairos facultatif, validation (voir aussi UC-APP-02) |
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
| UC-VIS-03-U04 | `UsageCounters` | Jour UTC, tokens OU budget, budgets séparés, table sur liste blanche (RG4) | idem |
| UC-VIS-03-U05 | `Pricing::estimateUsd` | Préfixe le plus long, mock gratuit, défaut prudent | idem |
| UC-VIS-03-U06 | `DemoConfig::load` | Base > env > fichier ; fournisseur hors base ; fail-safe (RG3) | idem |
| UC-VIS-03-U07 | `MockProvider::complete` | Pôle et kairos des fixtures, texte générique, tokens estimés | idem |
| UC-VIS-03-U08 | `AnthropicProvider::complete` | Modèle/plafond, clé en en-tête, 429 typé, délai | idem |
| UC-VIS-03-U09 | `leadingZeroBits` (JS) | Parité avec les vecteurs PHP de U03 | `web/test/usecases/unit/uc-vis-03-essayer-cartographie-en-direct.test.js` |
| UC-VIS-03-U10 | `solvePow` | Nonce valide pour un défi au format serveur (node:crypto), annulation | idem |
| UC-VIS-03-U11 | `fetchChallenge` | URL relative, `ProviderError` typée, réponse invalide | idem |
| UC-VIS-03-U12 | `createDemoProvider` | Un défi neuf par appel, preuve valide, champ piège vide, phases | idem |
| UC-VIS-03-U13 | `describeDemoError` | 429 → minutes + réessai ; 503 → sans réessai ; autre → détail | idem |
| UC-VIS-03-U14 | `DEMO_TEXT_MIN_CHARS`, `DEMO_TEXT_MAX_CHARS` | Bornes de la page sous le plafond serveur | idem |
| UC-VIS-03-U15 | `solvePow`, `MAX_DIFFICULTY_BITS` | **Comportement actuel figé** — anomalie A1 | idem |
| UC-VIS-03-U16 | `createProvider` (transport `proxy`) | Corps exact vers `api/llm`, aucune clé, réponse relue | `engine/test/usecases/unit/uc-vis-03-essayer-cartographie-en-direct.test.js` |
| UC-VIS-03-U17 | `createProvider` (`maxAttempts: 1`) | 429 sans nouvel essai, `Retry-After` porté (RG5) | idem |
| UC-VIS-03-U18 | `extractDay` | 7 pôles + kairos → document valide au schéma | idem |
| UC-VIS-03-U19 | `extractDay` (`kairosOptional`) | Kairos inexploitable → `null`, « skipped » (A3) | idem |
| UC-VIS-03-U20 | `extractDay` | `stopReason: max_tokens` → échec explicite après un nouvel essai | idem |

### Tests fonctionnels

| ID | Scénario | Niveau | Vérifie | Fichier |
|---|---|---|---|---|
| UC-VIS-03-F01 | Nominal, A6 | API | Statut, 8 appels (7 pôles + kairos) avec défis distincts, défis hachés, compteurs, aucune session | `api/tests/UseCases/Functional/UcVis03EssayerCartographieTest.php` |
| UC-VIS-03-F02 | Garanties (RGPD) | API | Ni texte, ni réponse, ni IP en base ; seau haché | idem |
| UC-VIS-03-F03 | A1 | API | Anthropic simulé : modèle et plafond imposés, clé en en-tête, coût compté | idem |
| UC-VIS-03-F04 | E1 | API | Champ piège → 400 banal, rien de compté ni consommé | idem |
| UC-VIS-03-F05 | E2 | API | Preuve absente, falsifiée, faible, rejouée | idem |
| UC-VIS-03-F06 | E3 | API | 422 / 413 avant toute preuve | idem |
| UC-VIS-03-F07 | E4 | API | Quota par IP → 429 + `Retry-After`, autre IP épargnée | idem |
| UC-VIS-03-F08 | E5, A6 | API | Budget épuisé → 503, `remainingToday` faux | idem |
| UC-VIS-03-F09 | E6 | API | Démo désactivée ou sans secret → 503 | idem |
| UC-VIS-03-F10 | E7 | API | 429 relayé, 502, 504, clé absente → 503 ; rien compté | idem |
| UC-VIS-03-F11 | Nominal | IHM | Menu → run complet accepté par un faux serveur aux règles PHP ; rien conservé ; verdict lisible | `web/test/usecases/functional/uc-vis-03-essayer-cartographie-en-direct.test.jsx` |
| UC-VIS-03-F12 | A2 | IHM | Export JSON local ; retour au formulaire | idem |
| UC-VIS-03-F13 | A3 | IHM | Kairos inexploitable → 7 pôles + note | idem |
| UC-VIS-03-F14 | A4 | IHM | 504 transitoire → un nouvel essai, défi neuf | idem |
| UC-VIS-03-F15 | A5 | IHM | Annulation → texte conservé, aucun appel de plus | idem |
| UC-VIS-03-F16 | E3 | IHM | Trop court / trop long → bouton inactif, aucune requête | idem |
| UC-VIS-03-F17 | E4 | IHM | 429 → « réessayez dans 2 minutes », Réessayer | idem |
| UC-VIS-03-F18 | E5, E6 | IHM | 503 dès le défi → message, sans réessai | idem |
| UC-VIS-03-F19 | Anomalie A1 | IHM | **Comportement actuel figé** — difficulté 23 → échec générique | idem |

### Tests existants liés (non-régression)

- `api/tests/LlmPowTest.php`, `api/tests/LlmProxyTest.php`, `api/tests/LlmMockProviderTest.php` — gardes, quotas IPv6, surcharges admin.
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

- **A1 — Difficulté réglable par l'admin mais insoluble par le navigateur.**
  `api/src/Admin/DemoConfigService.php` accepte `powDifficultyBits` de 8 à
  **24** ; `web/src/lib/pow.js` refuse au-delà de **22** (`MAX_DIFFICULTY_BITS`,
  `TypeError`). Un réglage à 23 ou 24 rend la démo (et le tuteur, UC-VIS-05)
  inutilisable : chaque essai échoue avec « L'analyse a échoué en cours de
  route (détail technique : solvePow : difficultyBits entier entre 0 et 22
  requis…) ». Comportement actuel figé par UC-VIS-03-U15 et F19.

## Limites

- La page n'interroge pas `GET /api/llm/status` avant de proposer l'essai :
  une démo épuisée ou désactivée n'est découverte qu'au premier défi (E5/E6).
- Le quota par IP est consommé après la preuve de travail, y compris pour une
  requête refusée ensuite par le coupe-circuit journalier.
