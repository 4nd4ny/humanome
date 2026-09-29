# UC-APP-09 — Lancer une cartographie ouverte (Twin6)

| Champ | Valeur |
|---|---|
| **Acteur principal** | Apprenant (tout compte connecté) |
| **Acteurs secondaires** | Fournisseur LLM (Anthropic) ; plateforme (clé plateforme et crédit prépayé, UC-APP-11) ; administrateur (tarifs et contribution, UC-ADM-05) |
| **Portée** | humanome.xyz — vue `#/twin6-ouverte`, moteur navigateur `engine/src/twin6/`, proxy facturé `POST /api/twin6/appel` |
| **Niveau** | Objectif utilisateur |
| **Cahier des charges** | §3.2 (déclencher une cartographie), §4.3 (module cartographie), §5 (clé API personnelle), §6.1-6.2 (RGPD), §7 (modèle économique) ; ADR-001, ADR-004, ADR-010 §3 |
| **Statut** | Implémenté (cartographie ouverte Twin6, contribution +10 %) |

## Objectif

Permettre à un apprenant d'obtenir une cartographie de ses compétences avec le
protocole **ouvert** Twin6 — un scan par pôle RESPIRE puis une synthèse
« kairos », sur le portfolio **entier** — et de la voir dans le même sunburst
évolutif que toute cartographie. Le protocole est **open source** : ses prompts
sont publics et téléchargeables. L'usage du modèle est payé soit par la **clé
API personnelle** de l'apprenant (gratuit pour la plateforme), soit par son
**crédit prépayé** (coût réel des tokens + 10 % de contribution).

## Déclencheur

L'apprenant ouvre `#/twin6-ouverte`, colle son portfolio et clique sur
« Lancer la cartographie ouverte ».

## Préconditions

- L'apprenant a un compte actif et une session (UC-CPT-01, UC-CPT-02).
- Le paquet public `data/twin6/twin6-ouverte-1.0.0.json` est servi par le site
  (scanPole, kairos, fiches P1..P7). Ce fichier n'est **pas versionné**
  (`web/public/data/` est ignoré par git) : il est **construit** avant chaque
  build du front (`prebuild` de `web/package.json`) — `scripts/generate-fiches.mjs`
  régénère les fiches `P1.md`..`P7.md` de `web/public/data/twin6/prompts/` depuis
  le corpus versionné `scripts/data/fiches-v7.json`, puis
  `scripts/build-twin6-package.mjs` assemble ces fiches avec `1-scan-pole.md`,
  `2-kairos-final.md` et `0-mega-prompt.md` du même répertoire (modèle cible par
  défaut `claude-sonnet-5`). Le même corpus alimente le paquet **publié** et
  forkable `twin6-ouverte` 1.0.0 de l'atelier promptologue
  (`scripts/build-twin6-prompt-package.mjs`, régénéré par
  `scripts/deploy/stage-api.sh` dans `build/prompt-packages/`, marqué réservé),
  aux textes identiques octet pour octet. Ces constructions sont techniques,
  hors parcours de l'apprenant : elles relèvent de UC-SYS-04
  (`docs/cas-utilisation/systeme/UC-SYS-04-construire-artefacts-derives.md`).
- Le référentiel servi par `GET /api/twin9/meta` a été importé (structure non
  secrète des pôles et compétences, UC-PRO-08 A4).
- Voie crédits : la clé plateforme `ANTHROPIC_API_KEY` est configurée et le
  solde prépayé couvre le run (UC-APP-11). Voie clé perso : l'apprenant saisit
  une clé Anthropic ou en a enregistré une dans son profil (UC-CPT-04).

## Garanties en cas de succès

- Un document `cartographie-merge` est produit **dans le navigateur** et rendu
  par `MergeView` (sunburst, feuilles de portfolio) ; il est exportable en JSON.
- Voie crédits : le solde est débité du **coût réel** de chacun des 8 appels,
  à la contribution Twin6 (×1,10), et rien d'autre.
- Voie clé perso : aucun appel ne passe par l'API humanome, rien n'est débité.

## Garanties minimales (en cas d'échec)

- Aucun document partiel n'est affiché ; le formulaire reste disponible.
- Un appel **refusé** (401, 403, 413, 422, 429, 402) n'atteint pas l'amont et
  n'est pas facturé ; un appel dont l'**amont échoue** (E11) est intégralement
  remboursé (réserve rendue).
- En revanche, un appel **abouti** côté serveur est facturé au coût réel, même
  si le moteur échoue ensuite sur sa sortie : l'appel tronqué de E5, et tous les
  appels déjà aboutis d'un run qui s'arrête en cours (E4, E5, RG6, E11, JSON
  illisible), restent débités. Aucun document partiel n'est produit et il n'y a
  **pas de reprise** : relancer refacture les 8 appels.
- Ni le portfolio, ni les prompts, ni les sorties ne sont conservés côté
  serveur : le grand-livre ne porte que des compteurs.

## Scénario nominal (voie crédits)

1. L'apprenant ouvre `#/twin6-ouverte`. La vue vérifie la session
   (`GET /api/auth/me`, qui sème aussi le jeton CSRF).
2. La vue charge en parallèle le paquet PUBLIC (`GET data/twin6/twin6-ouverte-1.0.0.json`,
   contrôlé : scanPole, kairos, fiches) et l'offre (`GET /api/twin9/meta` :
   prix Twin6 déjà margés `modeles_twin6`, référentiel, solde) ; en parallèle
   encore (effet séparé), elle lit la liste des clés enregistrées
   (`GET /api/keys`), dont l'échec est ignoré silencieusement. Le modèle cible
   par défaut du paquet est présélectionné ; un lien « Télécharger les prompts »
   (AGPL) est affiché.
3. L'apprenant colle son portfolio (feuilles `### AAAA-MM-JJ`, plus de 40
   caractères), choisit le modèle et garde la voie « Avec nos crédits ».
4. Au clic, la vue vérifie que le solde couvre le **poids** du portfolio
   (RG5), puis lance le moteur `executerTwin6` avec un provider « crédits ».
5. Le moteur enchaîne **7 appels scan-pole** (pôles triés 1→7 : gabarit public
   où `${POLE}` devient le numéro, fiche du pôle et portfolio attachés) puis
   **1 appel kairos** (les 7 `carto_pole` + le portfolio). Chaque appel est un
   `POST /api/twin6/appel {model, prompt, system, max_tokens}` avec le jeton CSRF ;
   la progression « étape n/8 » et la contribution cumulée (« … débités
   jusqu'ici ») s'affichent. Une sortie tronquée est détectée **ici**, dès le
   premier appel concerné (E5).
6. Pour chaque appel, le serveur : vérifie le jeton CSRF de la session (403,
   E12), exige la session (401), la clé plateforme
   (503), borne le corps à 2 Mo (413), valide modèle, prompt et `max_tokens`
   (422), applique le rythme par utilisateur (429), **réserve** atomiquement le
   pire-cas au tarif Twin6 (402 sinon), appelle Anthropic sur l'URL verrouillée,
   **réconcilie** la réserve au coût réel et renvoie
   `{text, usage, model, stopReason, cout_microusd}` (aucun rendu, aucun filtre :
   le prompt est public).
7. Le moteur extrait le JSON de chaque sortie, puis `twin6ToMergeDocument`
   décompose chaque `carto_pole` en instantanés **par feuille** (date des
   passages) et réutilise le pipeline de merge : niveaux, ipsatif, narratifs
   (rapport de pôle, kairos, histoire synthétisée) sans appel supplémentaire.
8. La vue affiche « Cartographie ouverte terminée — X $ de contribution », le
   bouton « Exporter le JSON » et le sunburst.

## Scénarios alternatifs

- **A1 — Voie clé perso, clé saisie** (étapes 3-6) : l'apprenant choisit « Avec
  ma propre clé API » et saisit sa clé (le bouton reste désactivé sans clé). Le
  provider est **direct** : chaque appel part du navigateur vers
  `https://api.anthropic.com/v1/messages` avec la clé en en-tête ; aucun appel à
  `/api/twin6/appel`, aucun débit, aucun garde-fou de solde (RG5) ; le message
  final indique « (avec votre clé) ». Contrairement à la voie crédits, le
  transport direct **réessaie automatiquement** (3 tentatives au plus sur 429,
  5xx ou erreur réseau, `Retry-After` honoré).
- **A2 — Clé enregistrée au profil** (étape 3) : si `GET /api/keys` liste une clé
  `anthropic`, l'option « Utiliser ma clé Anthropic enregistrée » est cochée par
  défaut ; au lancement la clé est révélée une fois (`GET /api/keys/anthropic`,
  propriétaire seul) puis utilisée comme en A1, sans ressaisie.
- **A3 — Plafond de sortie hors bornes** (étape 6) : `max_tokens` (ou l'alias
  `maxTokens`) est ramené dans [256, 16 000] ; un arrêt `max_tokens` est relayé
  tel quel (`stopReason`) pour que le moteur échoue explicitement (E5).

## Scénarios d'erreur

- **E1 — Visiteur sans session, ou erreur serveur sur `/auth/me`** (étape 1) :
  la vue invite à se connecter (« Connectez-vous ») ; ni paquet ni offre ne sont
  chargés. Toute erreur non-401 de `GET /api/auth/me` (500, 503…) produit le même
  écran, y compris pour un utilisateur connecté.
- **E2 — Copie statique sans API** (étape 1) : « Cette fonctionnalité nécessite le
  serveur (indisponible sur cette copie statique) ».
- **E3 — Solde trop bas pour le poids du portfolio** (étape 4, voie crédits) :
  alerte « Solde insuffisant pour ce portfolio (~N $ estimés, solde S $).
  Rechargez votre crédit ou utilisez votre propre clé API. » — aucun appel.
- **E4 — Réserve non couverte** (étape 6) : `402 {error: "Solde insuffisant",
  solde_microusd, requis_estime_microusd}` ; l'amont n'est pas appelé ; la vue
  arrête le run et affiche le message ; le bouton redevient cliquable. Les
  appels déjà aboutis du run restent facturés.
- **E5 — Sortie tronquée** (étape 5, dès le premier appel tronqué) :
  `stopReason = max_tokens` → le moteur lève « sortie tronquée (max_tokens) à
  l'étape … » ; aucun document partiel. L'appel tronqué est un `200` côté
  serveur : il est facturé au coût réel, comme les appels aboutis avant lui.
- **E6 — Paquet public introuvable ou invalide, offre illisible** (étape 2) :
  « Paquet Twin6 introuvable (404) » ou « Paquet Twin6 invalide
  (scanPole/kairos/fiches attendus) » ; idem si l'offre `/api/twin9/meta` ne
  peut être lue (message du serveur) ; le formulaire n'est pas proposé.
- **E7 — Appel sans session** (étape 6) : `401 {error: "Authentification requise"}`.
- **E8 — Clé plateforme non configurée** (étape 6) : `503 Service indisponible`.
- **E9 — Requête invalide** (étape 6) : corps non JSON ou JSON scalaire →
  `400` ; corps > 2 Mo → `413` ; modèle hors offre (« Modèle non proposé »),
  prompt vide ou `max_tokens` non entier → `422` ; une liste JSON ou un corps
  vide sont traités comme un objet sans champ → `422` (modèle absent) ; rien
  n'est débité.
- **E10 — Rythme dépassé** (étape 6) : au-delà de `appels_par_minute` (30 par
  défaut) par utilisateur et par minute → `429` + `Retry-After`.
- **E11 — Échec du fournisseur** (étape 6) : erreur amont → `502` (ou `504` sur
  délai, `429` si saturé) au message **générique** ; la réserve est rendue
  (événement « twin6/cartographie (remboursement échec) »).
- **E12 — Jeton CSRF absent ou invalide** (étape 6) : avec un cookie de session
  mais sans `X-CSRF-Token` valide → `403 {error: "Jeton CSRF absent ou
  invalide"}` (`CsrfMiddleware`, avant la route) ; rien n'est appelé ni débité.

## Règles de gestion

- **RG1** — Twin6 est **open source** (AGPL) : prompts publics, aucun gabarit
  rendu côté serveur, aucune fiche confidentielle injectée, **aucun filtre
  anti-fuite** (contrairement à Twin9, UC-APP-10).
- **RG2** — Contribution Twin6 = `marge_twin6` (×1,10 par défaut, 1 à 5,
  réglable par l'administrateur), distincte de Twin9 (×1,20). Coût réel d'un
  appel en µUSD = ⌈tokens_in × prix_in × marge⌉ + ⌈tokens_out × prix_out × marge⌉
  (jamais arrondi en faveur de l'apprenant, au plus 2 µUSD au-dessus du montant
  exact).
- **RG3** — Réserve pire-cas **atomique** avant l'appel : entrée = octets du
  prompt (+ système), sortie = `max_tokens` ; débit conditionnel sans découvert
  (402 sinon) ; réconciliation au coût réel après l'appel ; remboursement
  intégral si l'appel échoue.
- **RG4** — Bornes serveur : corps ≤ 2 Mo ; `max_tokens` (ou `maxTokens`)
  entier ramené dans [256, 16 000] (8 192 si les deux sont absents) ; modèle ∈
  offre ; prompt non vide.
- **RG5** — Garde-fou client avant un run sur crédits : solde ≥ max(1,
  ⌈octets du portfolio / 1 024⌉) USD (heuristique « ~1 ko = 1 $ ») ; aucune garde
  sur la voie clé perso.
- **RG6** — Un run = 8 appels (7 scan-pole, pôles triés par numéro, + 1 kairos) ;
  une fiche publique manquante arrête le run avant l'appel du pôle concerné.
- **RG7** — Twin6 ne dépend ni de l'interrupteur Twin9 (`enabled`) ni de la
  promotion « Twin9 gratuit » (UC-ADM-05).
- **RG8** — Projection : une compétence n'est « présente » sur une feuille que si
  une de ses traces retenues renvoie à un passage de cette feuille ; le verdict
  d'une feuille n'est jamais promu au-dessus du verdict global.

## Données et RGPD

| Donnée | Traitement |
|---|---|
| Texte du portfolio | Voie crédits : transite par le serveur et Anthropic le temps de l'appel, **jamais stocké** ; voie clé perso : ne passe que du navigateur au fournisseur |
| Clé API personnelle | Saisie : reste dans le navigateur ; enregistrée : coffre chiffré (ADR-004), révélée au seul propriétaire |
| Prompts | Publics (paquet AGPL téléchargeable) |
| Grand-livre | `twin9_credit_events` : montants, modèle, tokens, libellé d'étape — jamais de contenu |
| Document produit | Reste dans le navigateur (export JSON à la demande) |

## Code sollicité

| Couche | Élément | Rôle |
|---|---|---|
| Front | `web/src/router.js` — `parseHash` | Route `#/twin6-ouverte` |
| Front | `web/src/views/Twin6OuverteView.jsx` | Garde de session, formulaire, voies de paiement, garde-fou de solde, progression, résultat |
| Front | `web/src/api/twin6.js` — `loadTwin6Package`, `makeCreditsProvider`, `makeOwnKeyProvider`, `fetchTwin6Offer` | Paquet public, provider proxy facturé, provider direct, offre |
| Front | `web/src/api/twin9.js` — `referentielPourMoteur`, `formatUsd` | Adaptation du référentiel, montants |
| Front | `web/src/api/keys.js` — `listKeys`, `revealKey` | Clé enregistrée au profil |
| Front | `web/src/api/client.js` — `fetchMe`, `apiFetch`, `ApiError`, `ApiUnavailableError` | Session et amorçage du jeton CSRF (étape 1), jeton sur chaque mutation, erreurs typées (E1, E2, E4) — unitaires : UC-APP-09-U15, U16 ; copie statique : UC-APP-10-U31 |
| Build | `scripts/build-twin6-package.mjs` (après `scripts/generate-fiches.mjs`, `prebuild` du front) | Construit le paquet public servi à l'étape 2 (précondition) — relève de UC-SYS-04 : rejoué en sous-processus dans un miroir temporaire par UC-SYS-04-F11 (gabarits absents) et F12 (gabarits fournis) |
| Build | `scripts/build-twin6-prompt-package.mjs` — `buildTwin6PromptPackageDoc` | Paquet publié forkable `twin6-ouverte` (même corpus) — relève de UC-SYS-04 : rejoué en sous-processus dans un miroir temporaire par UC-SYS-04-F11 et F12 ; test historique `web/src/views/promptologue/twin6-prompt-package.test.js` |
| Front | `web/src/views/MergeView.jsx`, `web/src/lib/download-json.js` | Rendu sunburst commun et export JSON (étape 8) — composants partagés (unitaires relevant de UC-APP-03 et UC-APP-12), rendus ici fonctionnellement (UC-APP-09-F01) |
| Moteur | `engine/src/twin6/index.js` — `buildScanPolePrompt`, `buildKairosPrompt`, `extractJson`, `executerTwin6`, `TWIN6_CALLS` | Orchestration des 8 appels |
| Moteur | `engine/src/twin6/mapper.js` — `twin6ToMergeDocument` | Projection vers `cartographie-merge` |
| Moteur | `engine/src/providers/index.js` — `createProvider` (direct) | Voie clé perso |
| API | `POST /api/twin6/appel` — `api/src/routes/twin9.php` | Proxy facturé (voie crédits) |
| API | `api/src/Middleware/CsrfMiddleware.php` | Jeton CSRF des mutations (E12) — logique unitaire couverte par UC-CPT-02-U07 |
| API | `GET /api/keys/anthropic` — `api/src/routes/keys.php`, `api/src/Keys/KeyVault.php` | Révélation de la clé enregistrée (A2) — garde propriétaire et chiffrement couverts par UC-CPT-04 |
| API | `GET /api/twin9/meta` — `api/src/routes/twin9.php` | Offre (prix Twin6, référentiel, solde) |
| Domaine | `api/src/Twin9/Twin9Config.php` — `coutMicrousd`, `reserveMicrousd`, `publicView`, `marge`, `modeles`, `appelsParMinute` | Tarification Twin6, bornes |
| Domaine | `api/src/Twin9/CreditService.php` — `debit`, `adjust` ; `SoldeInsuffisantException` | Réserve, réconciliation, remboursement |
| Domaine | `api/src/Twin9/AnthropicCaller.php` | Appel amont verrouillé, erreurs génériques |
| Domaine | `api/src/Auth/RateLimiter.php` | Rythme par utilisateur |

## Jeux de tests

### Tests unitaires

| ID | Cible | Vérifie | Fichier |
|---|---|---|---|
| UC-APP-09-U01 | `buildScanPolePrompt` | Toutes les occurrences de `${POLE}` remplacées ; fiche puis portfolio attachés | `engine/test/usecases/unit/uc-app-09-cartographie-ouverte-twin6.test.js` |
| UC-APP-09-U02 | `buildKairosPrompt` | Blocs `carto_P<n>` JSON dans l'ordre reçu, portfolio original | idem |
| UC-APP-09-U03 | `extractJson` | Bloc ```json prioritaire, préambule toléré, erreurs explicites | idem |
| UC-APP-09-U04 | `executerTwin6` | Entrées invalides refusées avant tout appel | idem |
| UC-APP-09-U05 | `executerTwin6` | 8 appels, pôles triés, `poleNum` complété, progression, usage, document valide | idem |
| UC-APP-09-U06 | `executerTwin6` | Fiche manquante → arrêt avant l'appel du pôle (RG6) | idem |
| UC-APP-09-U07 | `executerTwin6` | `stopReason max_tokens` → échec nommant l'étape (E5) | idem |
| UC-APP-09-U08 | `twin6ToMergeDocument` | Feuilles par date, renvoi jamais promu, narratifs rattachés ; un pôle sur deux feuilles : chaque compétence n'est présente que là où ses traces renvoient (RG8) | idem |
| UC-APP-09-U09 | `twin6ToMergeDocument` | **Anomalie figée** : pôle sans présence → domaine vide non conforme au schéma | idem |
| UC-APP-09-U10 | `twin6ToMergeDocument` | Entrées vides refusées | idem |
| UC-APP-09-U11 | `createProvider` direct (A1) | Appel direct à api.anthropic.com ; **anomalie figée** : `stopReason` non relayé | idem |
| UC-APP-09-U12 | `executerTwin6` | **Limite figée** : référentiel vide → 1 appel kairos puis échec | idem |
| UC-APP-09-U13 | `parseHash` | `#/twin6-ouverte` → vue `twin6ouverte` | `web/test/usecases/unit/uc-app-09-cartographie-ouverte-twin6.test.jsx` |
| UC-APP-09-U14 | `loadTwin6Package` | URL publique, modèle par défaut, HTTP en échec ou paquet incomplet → message (E6) | idem |
| UC-APP-09-U15 | `makeCreditsProvider` | Corps, jeton CSRF de session, contrat moteur, contribution remontée | idem |
| UC-APP-09-U16 | `makeCreditsProvider` | Replis sûrs ; 402 → `ApiError`, aucune contribution | idem |
| UC-APP-09-U17 | `makeOwnKeyProvider` | Transport direct, jamais `/api`, clé exigée | idem |
| UC-APP-09-U18 | `fetchTwin6Offer` | Prix Twin6, promo, référentiel, solde, replis | idem |
| UC-APP-09-U19 | `referentielPourMoteur` | Pôles et compétences aplaties | idem |
| UC-APP-09-U20 | `formatUsd` | µUSD → « x,yy $ », 4 décimales sous le centime | idem |
| UC-APP-09-U28 | `listKeys`, `revealKey` | Liste sans la clé, révélation `GET api/keys/anthropic` (A2) ; la garde propriétaire relève de UC-CPT-04 | idem |
| UC-APP-09-U29 | `Twin6OuverteView` (isolée) | Garde-fou : ⌈octets / 1024⌉ $ comparé au solde avant tout provider (RG5, E3) | idem |
| UC-APP-09-U21 | `Twin9Config::coutMicrousd` | Coût Twin6 ×1,10 arrondi au-dessus, < Twin9 ×1,20 (RG2) | `api/tests/UseCases/Unit/UcApp09CartographieOuverteTwin6Test.php` |
| UC-APP-09-U22 | `Twin9Config::reserveMicrousd` | Réserve ≥ tout coût réel possible (RG3) | idem |
| UC-APP-09-U23 | `Twin9Config::publicView` | Prix Twin6 margés exposés, marges jamais | idem |
| UC-APP-09-U24 | `CreditService::debit`, `adjust` | Réserve + réconciliation = coût réel ; remboursement d'échec | idem |
| UC-APP-09-U25 | `CreditService::debit`, `SoldeInsuffisantException` | Aucun découvert, montants portés par l'exception | idem |
| UC-APP-09-U26 | `AnthropicCaller::appeler` | URL verrouillée, système transmis, réflexion désactivée, usage réel | idem |
| UC-APP-09-U27 | `AnthropicCaller::appeler` | Erreurs amont → 504/502/429 génériques | idem |
| UC-APP-09-U30 | `RateLimiter` | Fenêtre d'une minute par compte, 31e appel → 30 s (E10) | idem |

### Tests fonctionnels

| ID | Scénario | Niveau | Vérifie | Fichier |
|---|---|---|---|---|
| UC-APP-09-F01 | Nominal | IHM | `<App/>` : progression « étape 1/8 » et contribution cumulée pendant le run ; 8 appels via `/api/twin6/appel` avec CSRF, contribution finale, secteurs du sunburst, export JSON (`cartographie-merge`, `.json`, aucun envoi réseau) ; portfolio envoyé nulle part ailleurs ; **anomalie 3 figée** (« X / 61 ») | `web/test/usecases/functional/uc-app-09-cartographie-ouverte-twin6.test.jsx` |
| UC-APP-09-F02 | A1, RG5 | IHM | Clé saisie, solde nul : 8 appels directs au fournisseur, aucun passage par l'API, aucun garde-fou de solde | idem |
| UC-APP-09-F03 | A2 | IHM | Clé du profil révélée une fois, 8 appels directs avec elle, aucun appel à `/api/twin6/appel` (voie crédits câblée en échec), « (avec votre clé) » | idem |
| UC-APP-09-F04 | E1 | IHM | Anonyme : invitation à se connecter, rien chargé | idem |
| UC-APP-09-F05 | E2 | IHM | Copie statique : fonctionnalité indisponible | idem |
| UC-APP-09-F06 | E3 | IHM | Solde < poids du portfolio : blocage avant tout appel | idem |
| UC-APP-09-F07 | E4 | IHM | 402 en cours de run : arrêt, message, bouton réutilisable | idem |
| UC-APP-09-F08 | E5 | IHM | Sortie tronquée : échec explicite, pas d'export | idem |
| UC-APP-09-F09 | E6 | IHM | Paquet public introuvable, ou offre `/meta` en erreur : erreur de chargement, formulaire absent | idem |
| UC-APP-09-F10 | Nominal | API | 8 appels : contrat, `text` amont intact et `model`, coût 6 602 µUSD chacun, prompt public transmis tel quel, grand-livre réserve/réconciliation | `api/tests/UseCases/Functional/UcApp09CartographieOuverteTwin6Test.php` |
| UC-APP-09-F11 | Nominal (étape 2), RG7 | API | `/api/twin9/meta` : prix Twin6, référentiel, solde ; Twin6 fonctionne Twin9 désactivé | idem |
| UC-APP-09-F12 | E7 | API | 401 sans session, aucun appel amont | idem |
| UC-APP-09-F13 | E8 | API | 503 sans clé plateforme, rien débité | idem |
| UC-APP-09-F14 | E9 | API | 422 / 413 / 400 (JSON scalaire ou illisible) ; liste JSON ou corps vide → 422 ; avant tout débit | idem |
| UC-APP-09-F15 | E4 | API | 402 avec montants (réserve exacte), solde intact | idem |
| UC-APP-09-F16 | E10 | API | 429 + `Retry-After: 30`, amont non appelé | idem |
| UC-APP-09-F17 | E11 | API | 502 / 504 génériques, réserves rendues | idem |
| UC-APP-09-F18 | A3, E5 | API | `max_tokens` borné (alias accepté, 8 192 par défaut), `stopReason max_tokens` relayé ; l'appel tronqué est facturé au coût réel (solde = recharge − somme des coûts) | idem |
| UC-APP-09-F19 | RGPD | API | Sortie relayée non filtrée à l'apprenant ; grand-livre et audit sans prompt ni sortie | idem |
| UC-APP-09-F20 | E12 | API | Session sans jeton CSRF ou avec un jeton faux → 403, amont non appelé, solde intact | idem |

### Tests existants liés (non-régression)

- `api/tests/Twin6AppelTest.php` — session, 503, validation, 402, facturation à +10 %.
- `web/src/views/Twin6OuverteView.test.jsx` — vue isolée (voies, clé du profil, garde-fou, export).
- `web/src/api/twin6.test.js` — client du paquet, providers, offre.
- `engine/src/twin6/index.test.js`, `engine/src/twin6/mapper.test.js` — moteur et projection.
- `engine/src/providers/index.test.js` — transport direct Anthropic.
- `api/tests/PackagesTwin6Test.php`, `web/src/views/promptologue/twin6-prompt-package.test.js` — paquet Twin6 côté atelier promptologue.

### Exécuter

```sh
docker compose run --rm php vendor/bin/phpunit --filter UcApp09 --testdox
cd web && npx vitest run test/usecases/unit/uc-app-09 test/usecases/functional/uc-app-09
cd engine && npx vitest run test/usecases/unit/uc-app-09
```

## Anomalies constatées

1. **Voie clé perso : troncature non détectée explicitement.** Le provider direct
   Anthropic (`engine/src/providers/anthropic.js`, `parseResponse`) ne relaie pas
   `stop_reason` ; la garde « sortie tronquée (max_tokens) » d'`executerTwin6` ne
   se déclenche donc que sur la voie crédits. Sur la voie clé perso, une sortie
   tronquée échoue plus loin, au parsing JSON, avec un message moins explicite
   (figé par UC-APP-09-U11).
2. **Pôle sans aucune présence établie → document non conforme au schéma.**
   `twin6ToMergeDocument` émet alors un domaine sans compétence, ce que le schéma
   `cartographie-merge` refuse (`domains[].competences` : `minItems 1`). Le viewer
   le tolère (c'est assumé pour Twin9 dans `engine/src/twin9/mapper.test.js`),
   mais le JSON exporté ne se revalide pas : le rechargement d'un fichier
   utilisateur (`web/src/data/load.js`, validation ajv) le refuse. Le test
   historique du mapper Twin6 qualifie ces domaines vides de « légitimes » sans
   en produire aucun (figé par UC-APP-09-U09).
3. **Dénominateur « Compétences établies » figé à 61.** `Twin6OuverteView` passe
   à `MergeView` le référentiel **au format `/meta`** (`res.offer.referentiel`,
   un tableau de pôles) ; `MergeView` lit `referentiel?.competences?.length ?? 61`
   et retombe donc toujours sur 61, quel que soit le référentiel importé (bandeau
   `StatBadges` et résumé de profil). Sans effet avec le référentiel de production
   (61 compétences), mais faux sinon : avec le référentiel fictif à 7
   compétences, l'écran affiche « X / 61 ». La forme attendue (`{poles,
   competences}`) est pourtant disponible via `referentielPourMoteur`, comme le
   fait `Twin9View` (figé par UC-APP-09-F01).

## Limites

- Un run n'est pas reprenable : une interruption (402, sortie tronquée, fiche
  manquante, échec amont, JSON illisible) laisse facturés les appels déjà
  aboutis, et une relance refacture les 8 appels (UC-APP-09-F07, UC-APP-09-F18).
- Le référentiel utilisé par Twin6 provient de l'import Twin9 (`/api/twin9/meta`) :
  s'il n'a jamais été importé, un run lance un unique appel kairos (facturé sur
  la voie crédits) puis échoue au mapping (figé par UC-APP-09-U12).
- La construction du paquet public (précondition) n'est pas testée au titre de
  ce cas mais de UC-SYS-04 : `scripts/build-twin6-package.mjs` (qui écrit
  `web/public/data/twin6/twin6-ouverte-1.0.0.json`) et
  `scripts/build-twin6-prompt-package.mjs` y sont rejoués dans un miroir
  temporaire (UC-SYS-04-F11, F12). Les gabarits publics `1-scan-pole.md`,
  `2-kairos-final.md` et `0-mega-prompt.md` ne sont versionnés nulle part
  (seules les fiches P1..P7 se régénèrent depuis `scripts/data/fiches-v7.json`) :
  sur un clone neuf, le `prebuild` s'arrête d'abord sur `generate-fiches.mjs`,
  qui échoue en `ENOENT` (dossier `twin6/prompts/` absent) ; une fois le dossier
  créé, `build-twin6-package.mjs` s'arrête sur « prompt manquant » et le paquet
  ne peut être reconstruit (UC-SYS-04 E5, figé par UC-SYS-04-F11). Les tests de
  ce cas utilisent un paquet fictif de même forme.
- Le garde-fou de solde (RG5) est une heuristique client ; seul le refus 402
  serveur (réserve pire-cas) est opposable. Son message arrondit le solde au
  centime avec un point décimal : un solde de 1,999999 $ s'affiche « solde
  2.00 $ » face à « ~2 $ estimés » (UC-APP-09-U29).
