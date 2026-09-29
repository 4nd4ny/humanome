# UC-ETA-02 — Configurer le moteur LLM, le budget et le jeton worker

| Champ | Valeur |
|---|---|
| **Acteur principal** | Établissement de formation (rôle `etablissement`) |
| **Acteurs secondaires** | Worker cron de la plateforme et runner Node de l'établissement (consomment la configuration et le jeton — UC-SYS-01) ; Harmonia (facturation à l'usage du service humanome, §7) |
| **Portée** | humanome.xyz — section « Configuration LLM et budget » de `#/etablissement` ; API `PUT/GET /api/etablissement/config`, `POST /api/etablissement/worker-token` |
| **Niveau** | Objectif utilisateur |
| **Cahier des charges** | §3.7 (budget maximal configurable), §4.9 (clé « qualité établissement » ou infrastructure LLM propre), §6 (clés chiffrées), §7 (facturation à l'usage), ADR-004 (clés chiffrées sodium), ADR-005, docs/plan-masse.md §4-5 |
| **Statut** | Implémenté (P11 / M8) — jeton worker : API seulement |

## Objectif

Permettre à l'établissement de décider **quel moteur** analysera les
portfolios de ses cohortes (service humanome facturé à l'usage, ou son propre
point d'accès compatible OpenAI), **jusqu'à quel montant** la plateforme peut
dépenser pour lui, et d'obtenir le **jeton** qui authentifie son runner
machine auprès de la file de jobs.

## Déclencheur

L'établissement ouvre `#/etablissement` et modifie la section
« Configuration LLM et budget » ; ou il appelle
`POST /api/etablissement/worker-token` pour (ré)générer le jeton de son runner.

## Préconditions

- Compte connecté portant le rôle `etablissement`.
- Pour enregistrer une clé d'API : la plateforme dispose de sa clé maîtresse
  `SODIUM_MASTER_KEY` (64 caractères hexadécimaux, hors webroot).

## Garanties en cas de succès

- La configuration de l'établissement (une ligne `etablissement_config`) porte
  le fournisseur, l'URL et le modèle éventuels, le plafond (au centime) et, le
  cas échéant, la clé d'API **chiffrée** (nonce ‖ secretbox).
- La réponse et toute lecture ultérieure renvoient la **projection** :
  `provider`, `endpointUrl`, `model`, `budgetCapUsd`, `spentUsd`, `hasApiKey`,
  `hasWorkerToken` — jamais la clé ni le jeton.
- Une hausse du plafond remet en file les jobs arrêtés faute de budget.
- Un événement d'audit `etablissement_config_updated` `{provider,
  budgetCapUsd}` (ou `worker_token_generated` `[]`) est enregistré, sans secret.

## Garanties minimales (en cas d'échec)

- La configuration existante est inchangée (pour E2, cette invariance tient
  au pré-contrôle `503` de la route, fait AVANT toute écriture :
  `ConfigRepository::save` n'est pas atomique, voir Anomalies).
- Aucune clé n'est jamais stockée en clair ni renvoyée.

## Scénario nominal

1. L'établissement ouvre `#/etablissement` ; le site lit
   `GET /api/etablissement/config` (projection ; défauts `humanome`, plafond 0
   si rien n'est encore configuré) et affiche « Dépense courante : X $ sur un
   plafond de Y $ ».
2. Il laisse « Service humanome » coché et saisit un « Plafond de dépense
   (USD) ».
3. Il clique « Enregistrer la configuration » ; le site envoie
   `PUT /api/etablissement/config {provider: "humanome", budgetCapUsd}` (avec
   `X-CSRF-Token`).
4. Le serveur valide le corps, enregistre (plafond arrondi au centime), et,
   si le nouveau plafond est **supérieur** à l'ancien, réactive les jobs
   `budget_exceeded` de l'établissement (A3) ; il journalise
   `etablissement_config_updated` et répond `200` avec la projection.
5. Le site affiche « Configuration enregistrée. » et relit la configuration.

## Scénarios alternatifs

- **A1 — Infrastructure propre** (étape 2) : « Mon infrastructure » ouvre les
  champs « URL du point d'accès », « Modèle », « Clé API » ; le site envoie
  `{provider: "endpoint", endpointUrl, model?, apiKey?, budgetCapUsd}` (URL et
  modèle nettoyés, clé seulement si saisie). Le serveur chiffre la clé
  (sodium secretbox, clé maîtresse `SODIUM_MASTER_KEY`), répond
  `hasApiKey: true` ; le champ est vidé et son indication devient « Une clé est
  enregistrée (jamais réaffichée) — saisir pour remplacer ». Le plafond vaut
  aussi pour ce mode : les coûts que le runner déclare alimentent `spent_usd`
  (RG3) ; avec un plafond à 0, le runner est bloqué dès son premier job
  déclaré payant (UC-SYS-01, A7).
- **A2 — Conserver, effacer la clé, revenir au service humanome**
  (étape 3) : `apiKey` absent = clé conservée ; `apiKey: ""` = clé effacée ;
  en mode humanome le site n'envoie ni URL, ni modèle, ni clé : URL et modèle
  sont remis à `null`, la clé chiffrée reste stockée (`hasApiKey` vrai) tant
  qu'elle n'est pas effacée explicitement.
- **A3 — Hausse du plafond après arrêt budgétaire** (étape 4) : les jobs
  `budget_exceeded` de l'établissement repassent `queued` (checkpoint
  conservé) et ses runs `budget_exceeded` redeviennent `active` ; un plafond
  égal ou inférieur ne réactive rien. La comparaison porte sur la valeur
  saisie brute, pas sur la valeur stockée au centime (voir Anomalies).
- **A4 — Générer le jeton du runner** : `POST /api/etablissement/worker-token`
  → `201 {workerToken: "hwk_<32 hex>"}` avec `Cache-Control: no-store` ; seule
  l'empreinte sha256 est stockée ; `hasWorkerToken` devient vrai ; une
  nouvelle génération invalide immédiatement l'ancien jeton
  (`/api/worker/*` répond alors `401`).

## Scénarios d'erreur

- **E0 — Saisie invalide côté site** (étape 3) : plafond négatif bloqué par la
  contrainte native du champ (`min="0"`), URL absente en mode « Mon
  infrastructure » refusée avec « Indiquez l'URL de votre point d'accès
  compatible OpenAI. » ; aucune requête.
- **E1 — Corps invalide** (étape 4) : fournisseur hors `humanome`/`endpoint`
  (un fournisseur **absent** vaut `humanome`, sans erreur), `endpoint` sans
  URL, URL non `http(s)://` ou > 255 caractères (validée même en mode
  `humanome` si elle est fournie), clé > 400 caractères, modèle > 120
  caractères, plafond absent, qui n'est pas un nombre JSON (une chaîne, même
  numérique comme `"10"`, est refusée), négatif ou > 99 999 999 →
  `422 {error: "Validation échouée", fields}` ; le site affiche « Validation
  échouée ».
- **E2 — Clé maîtresse absente** (étape 4, A1) : une clé non vide est fournie
  alors que `SODIUM_MASTER_KEY` manque ou est malformée → `503 {error:
  "Chiffrement des clés non configuré sur ce serveur"}`, rien n'est enregistré
  (pré-contrôle de la route, avant `ConfigRepository::save`).
- **E3 — Accès refusé** : sans session `401`, sans rôle `403`, mutation sans
  jeton CSRF `403`.

## Règles de gestion

- **RG1** — Seule `ConfigRepository::revealApiKey` déchiffre la clé d'API ;
  elle n'est appelée que par une branche du tick actuellement inatteignable
  (voir Limites) ; aucune route ne la renvoie.
- **RG2** — Sémantique de `apiKey` : absent = conserver, `""` = effacer,
  valeur = chiffrer et remplacer.
- **RG3** — Coupe-circuit : toute dépense comptabilisée — appels du tick de la
  plateforme, et coûts déclarés par le runner via `POST /api/worker/jobs/{id}/result`
  — n'est permise que si `spent_usd + estimation ≤ budget_cap_usd` ; côté
  runner, l'estimation vaut 0 à la réservation (`GET /api/worker/jobs` refusé
  dès que `spent_usd` dépasse le plafond, quel que soit le fournisseur) ; sans
  configuration, aucune dépense n'est permise.
- **RG4** — `spent_usd` n'augmente que par incréments atomiques positifs (un
  montant négatif compte pour 0).
- **RG5** — Seule une hausse stricte du plafond réactive le travail bloqué
  (comparaison faite dans la route, sur la valeur saisie).
- **RG6** — Le jeton worker (128 bits) n'existe en clair que dans la réponse
  de génération ; la base ne garde que `sha256(jeton)`.
- **RG7** — Côté site, un champ plafond vidé vaut `0` (`Number("")`) : les
  traitements plateforme s'arrêtent alors, et le runner d'un établissement en
  `endpoint` aussi dès qu'un coût non nul a été déclaré (RG3).

## Données et RGPD

| Donnée | Traitement |
|---|---|
| Clé d'API de l'établissement | Chiffrée sodium (nonce 24 o ‖ secretbox), jamais relue par l'API, effaçable (`apiKey: ""`), purgée avec le compte |
| Jeton worker | Empreinte sha256 seulement (`worker_token_hash`, unique) |
| Plafond, dépense | `budget_cap_usd` (DECIMAL 10,2), `spent_usd` (DECIMAL 12,6) |
| Audit | `etablissement_config_updated {provider, budgetCapUsd}`, `worker_token_generated []` — aucun secret |

## Code sollicité

| Couche | Élément | Rôle |
|---|---|---|
| Front | `web/src/views/etablissement/AccueilSection.jsx` — `ConfigForm` | Choix du fournisseur, champs endpoint, clé jamais réaffichée, contrôles locaux, dépense courante |
| Front | `web/src/views/etablissement/etablissement-api.js` — `fetchConfig`, `saveConfig`, `money` | Projection normalisée, PUT JSON, montants |
| API | `api/src/routes/etablissement.php` — `PUT/GET /api/etablissement/config`, `POST /api/etablissement/worker-token` | Validation, 503 sans clé maîtresse, réactivation, audit, `no-store` |
| Domaine | `api/src/Etablissement/ConfigRepository.php` — `projection`, `save`, `revealApiKey`, `generateWorkerToken`, `etablissementIdForWorkerToken`, `addSpentUsd`, `allowsSpending` | Stockage chiffré, jeton haché, coupe-circuit |
| Domaine | `api/src/Worker/JobQueue.php` — `reactivateBudget` | Remise en file après hausse du plafond |
| Domaine | `api/src/Worker/Tick.php` — `modelFor` | Modèle configuré, sinon `WORKER_MODEL` (y compris en mode humanome) |
| Domaine | `api/src/Keys/KeyVault.php` — `masterKeyFromEnv` | Clé maîtresse depuis l'environnement |

## Jeux de tests

### Tests unitaires

| ID | Cible | Vérifie | Fichier |
|---|---|---|---|
| UC-ETA-02-U01 | `ConfigRepository::projection` | Défauts, aucune clé exposée, plafond au centime | `api/tests/UseCases/Unit/UcEta02ConfigurerLlmBudgetTest.php` |
| UC-ETA-02-U02 | `ConfigRepository::save`, `revealApiKey` | Format nonce ‖ secretbox ; conserver / remplacer / effacer (RG2) | idem |
| UC-ETA-02-U03 | `ConfigRepository::save` | Clé sans clé maîtresse → exception, rien en clair ; fournisseur et URL déjà écrits (non-atomicité, anomalie figée) | idem |
| UC-ETA-02-U04 | `ConfigRepository::revealApiKey` | Sans ligne, sans clé, autre clé maîtresse → `null` (RG1) | idem |
| UC-ETA-02-U05 | `generateWorkerToken`, `etablissementIdForWorkerToken` | `hwk_` + 32 hex, sha256, rotation, jeton vide/empreinte refusés (RG6) | idem |
| UC-ETA-02-U06 | `addSpentUsd`, `allowsSpending` | Cumul, négatif ignoré, borne ≤ plafond (RG3, RG4) | idem |
| UC-ETA-02-U07 | `JobQueue::reactivateBudget` | Jobs → `queued`, runs → `active`, checkpoint gardé à l'identique, autres établissements intacts (A3 ; la règle RG5 est dans la route, voir F04) | idem |
| UC-ETA-02-U08 | `KeyVault::masterKeyFromEnv` | 64 hex → 32 octets, sinon `null` | idem |
| UC-ETA-02-U09 | `fetchConfig` | Normalisation de la projection réelle | `web/test/usecases/unit/uc-eta-02-configurer-llm-budget.test.js` |
| UC-ETA-02-U10 | `saveConfig` | PUT JSON + CSRF ; 422/503 → `ApiError` | idem |
| UC-ETA-02-U11 | `money` | Format `12.50 $`, absent → `—` | idem |
| UC-ETA-02-U12 | `ConfigForm` (dans `AccueilSection` isolée, `fetchFn`) | Plafond vidé → `budgetCapUsd: 0` (RG7) ; modèle nettoyé, modèle blanc non envoyé ; clé non ressaisie → pas d'`apiKey` (A2, clé conservée) | idem |

### Tests fonctionnels

| ID | Scénario | Niveau | Vérifie | Fichier |
|---|---|---|---|---|
| UC-ETA-02-F01 | Nominal | API | Défauts, PUT humanome → projection, audit `{provider, budgetCapUsd}` ; fournisseur absent = humanome, modèle accepté en humanome | `api/tests/UseCases/Functional/UcEta02ConfigurerLlmBudgetTest.php` |
| UC-ETA-02-F02 | A1 | API | Clé chiffrée (clé maîtresse posée par le test), absente des réponses et de l'audit, déchiffrable par `ConfigRepository::revealApiKey` (lecture de contrôle) | idem |
| UC-ETA-02-F03 | A2 | API | Retour humanome : URL/modèle `null`, clé gardée ; effacement par `""` | idem |
| UC-ETA-02-F04 | A3, RG5 | API | Arrêt budgétaire au tick ; même plafond et plafond abaissé sans effet ; hausse → run actif puis terminé | idem |
| UC-ETA-02-F05 | A4 | API | `201` + `no-store`, empreinte sha256, jeton utilisable, rotation → ancien `401` | idem |
| UC-ETA-02-F06 | E1 | API | 11 corps invalides (dont plafond `"10"` et URL `ftp://` en mode humanome) → `422` avec le champ, configuration inchangée | idem |
| UC-ETA-02-F07 | E2 | API | Sans `SODIUM_MASTER_KEY` : clé → `503`, rien enregistré ; sans clé → `200` | idem |
| UC-ETA-02-F08 | E3 | API | `401`/`403` sur les 3 routes, CSRF absent → `403` | idem |
| UC-ETA-02-F09 | Nominal | IHM | `<App/>` : dépense/plafond affichés, PUT humanome (CSRF), relecture ; pas de commande de jeton | `web/test/usecases/functional/uc-eta-02-configurer-llm-budget.test.jsx` |
| UC-ETA-02-F10 | A1 | IHM | PUT endpoint complet, champ clé vidé, indication « clé enregistrée » | idem |
| UC-ETA-02-F11 | A2 | IHM | Retour humanome : ni URL, ni modèle, ni clé envoyés | idem |
| UC-ETA-02-F12 | E0 | IHM | Plafond négatif bloqué par la contrainte native (aucune alerte JavaScript), URL manquante refusée, aucun PUT | idem |
| UC-ETA-02-F13 | E1, E2 | IHM | `422` et `503` affichés, pas de message de succès | idem |
| UC-ETA-02-F14 | Anomalies | API | Hausse de 0.01 à 0.014 : plafond stocké 0.01, audit 0.014, run réactivé puis rebloqué au tick suivant (comportement actuel) | `api/tests/UseCases/Functional/UcEta02ConfigurerLlmBudgetTest.php` |

### Tests existants liés (non-régression)

- `api/tests/EtablissementConfigTest.php` — projection par défaut, validation, clé chiffrée conservée/effacée, jeton worker, garde de rôle.
- `api/tests/MasseDoDTest.php` — `testPlafondAbaisseEnCoursDeRunPuisReactive` (plafond abaissé puis relevé en cours de run).
- `api/tests/WorkerRouteTest.php` — `testBudgetConsommeRefuseLaReservation` (réactivation vue du runner).
- `web/src/views/EtablissementView.test.jsx` — configuration endpoint, clé jamais réaffichée (vue isolée).

### Exécuter

```sh
docker compose run --rm php vendor/bin/phpunit --filter UcEta02 --testdox
cd web && npx vitest run test/usecases/unit/uc-eta-02 test/usecases/functional/uc-eta-02
```

## Anomalies constatées

- **Réactivation sur une hausse inférieure au demi-centime.** La route compare
  le plafond saisi **brut** (`(float) $cap > $previousCap`) au plafond stocké
  arrondi au centime (`DECIMAL(10,2)`, `number_format($cap, 2)`), et
  journalise la valeur brute. Plafond stocké 0.01, `PUT budgetCapUsd 0.014` :
  le stockage reste `0.01`, mais les jobs `budget_exceeded` repassent `queued`
  et le run `active` (contre RG5), puis sont rebloqués au tick suivant ; l'audit
  indique 0.014, valeur qui ne figure pas en base. Figé par UC-ETA-02-F14.
- **`ConfigRepository::save` non atomique (latent).** L'upsert du
  fournisseur, de l'URL, du modèle et du plafond est exécuté AVANT le contrôle
  de la clé maîtresse ; l'exception « SODIUM_MASTER_KEY not configured » est
  levée après coup, la configuration étant déjà modifiée. Inatteignable par
  l'API aujourd'hui (pré-contrôle `503` de la route) ; figé par UC-ETA-02-U03.

## Limites

- **La clé d'API enregistrée n'est utilisée par aucun exécutant actuel** :
  le cron de la plateforme ne réserve pas les jobs d'un établissement en
  `endpoint` (`reserve()` filtre sur `humanome`) et, en cas de bascule
  concurrente entre réservation et lecture de la configuration, le tick les
  repose en file sans appel ; le runner Node ne reçoit jamais cette clé (il
  prend la sienne en option `--api-key` ou variable d'environnement). Le
  chiffrement est opérationnel (UC-ETA-02-U02, F02) mais la clé stockée reste
  inerte (voir UC-SYS-01, « Anomalies constatées »).
- **Pas d'IHM pour le jeton worker** : la génération n'existe que par l'API
  (`POST /api/etablissement/worker-token`, session + CSRF) ; l'espace
  établissement n'offre aucun bouton et n'affiche pas l'indicateur
  `hasWorkerToken` (ignoré par `fetchConfig`).
- En mode humanome, le site n'envoie pas de modèle : le worker utilise
  `WORKER_MODEL` (défaut `claude-sonnet-4-5`), alors que l'estimation de coût
  du lancement (UC-ETA-03) raisonne sur `claude-sonnet-5`. Par l'API en
  revanche, un modèle peut être fixé en mode humanome ; il prime alors sur
  `WORKER_MODEL` (`Tick::modelFor`) : l'établissement choisit ainsi le modèle
  facturé sur la clé plateforme (UC-ETA-02-F01).
- Le message JavaScript « Le plafond de budget doit être un montant en dollars
  (0 ou plus). » est pratiquement inatteignable : la contrainte native
  `min="0"` bloque l'envoi avant lui (le navigateur affiche sa propre bulle).
- La clé d'une infrastructure propre reste chiffrée en base après un retour au
  service humanome tant qu'elle n'est pas effacée par l'API (`apiKey: ""`) :
  l'IHM ne propose pas d'effacement.
