# UC-SYS-01 — Traiter la file de jobs de masse

| Champ | Valeur |
|---|---|
| **Acteur principal** | Exécutant de la file : **worker de la plateforme** (tick borné lancé par cron `php scripts/worker.php` ou par l'appel externe `POST /api/admin/worker-tick`) **ou runner machine de l'établissement** (`scripts/runner-node/runner.mjs`, API `/api/worker/*`) |
| **Acteurs secondaires** | Établissement (a lancé le run et fixé le budget — UC-ETA-02, UC-ETA-03) ; fournisseur LLM (clé plateforme Anthropic, ou point d'accès compatible OpenAI de l'établissement) ; exploitant (planificateur externe, jeton `X-Migrate-Token`) |
| **Portée** | humanome.xyz — `api/src/Worker/*`, `api/src/routes/worker.php`, `scripts/worker.php`, `scripts/runner-node/` |
| **Niveau** | Sous-fonction système (sans IHM) |
| **Cahier des charges** | §3.7, §4.9, §5 (hébergement mutualisé, pas de processus long), §6.5 (journalisation minimale), §7, §8 (un run peut durer des heures) ; ADR-005, ADR-008 ; docs/plan-masse.md §1-5 ; docs/runner-node.md |
| **Statut** | Implémenté (P11 / M8) — cron indisponible sur l'offre OVH actuelle : déclenchement externe (docs/deploiement.md, « Tâches planifiées ») |

## Objectif

Faire aboutir, par exécutions courtes et reprenables, l'extraction LLM de
chaque job (un membre × une journée = 7 appels « pôle » + 1 appel « kairos »)
d'un run de masse, en respectant le budget de l'établissement, sans jamais
rappeler un pôle déjà obtenu ni écrire sur un job annulé, et en ne
journalisant que des compteurs.

## Déclencheur

- Plateforme : le planificateur appelle `POST /api/admin/worker-tick` (ou, sur
  une offre avec cron, exécute `php scripts/worker.php`) à intervalle régulier.
- Établissement : son runner (`node scripts/runner-node/runner.mjs --api …
  --token …`) interroge la file (`--once` ou `--loop`).

## Préconditions

- Des jobs `queued` (ou `running` au bail expiré) existent (UC-ETA-03).
- L'établissement a une configuration (UC-ETA-02) ; sans elle, ses jobs ne
  sont réservés par personne.
- Worker plateforme : fournisseur `humanome` de l'établissement,
  `ANTHROPIC_API_KEY` configurée (ou `WORKER_PROVIDER=mock` en développement).
- Runner : jeton worker de l'établissement (`hwk_…`, UC-ETA-02 A4) et LLM
  accessible (point d'accès de l'établissement, Ollama, clé propre).

## Garanties en cas de succès

- Chaque job traité se termine `done` avec un document `cartographie-jour`
  **validé au schéma**, ses compteurs (tokens, coût) et, le cas échéant, une
  note de dégradation ; le run passe `done`/`failed` quand plus rien n'est en
  attente.
- `spent_usd` de l'établissement est incrémenté du coût réel (plateforme) ou
  déclaré (runner, borné).
- Seuls des compteurs sont journalisés (sortie du CLI, journal serveur du tick
  HTTP, journal local du runner expurgé).

## Garanties minimales (en cas d'échec)

- Aucun pôle déjà validé n'est perdu : il reste dans le `checkpoint` du job.
- Aucune dépense plateforme au-delà du plafond ; aucun appel LLM pour un job
  annulé ; aucune écriture sur un job qui n'est plus `running`.

## Scénario nominal — tick de la plateforme

1. Le planificateur lance `php scripts/worker.php` (le script charge
   l'autoload, les secrets de `~/app/shared/.env`, vérifie la base).
2. Le tick prend le verrou MySQL `GET_LOCK('humanome_worker', 0)`.
3. Il réserve le job le plus prioritaire puis le plus ancien, parmi les
   établissements configurés en fournisseur `humanome`
   (`FOR UPDATE SKIP LOCKED`, statut `running`, bail de 5 minutes).
4. Il relit la configuration (garde : un établissement repassé en
   `endpoint` voit son job reposé, jamais d'appel vers son URL depuis la
   plateforme), le texte de la journée dans le portfolio déposé, et construit
   les prompts à partir des gabarits `extraction-pole`/`kairos` du paquet
   **figé** sur le run et du référentiel **figé** (`PromptRunner`).
5. Pour chaque pôle absent du checkpoint : vérification du temps et du nombre
   d'appels restants, puis du **budget** (`spent + estimation ≤ plafond`),
   appel LLM (un nouvel essai immédiat en cas de réponse inexploitable ou
   tronquée), réparation/validation du pôle (`PoleAssembler`), imputation du
   coût et **écriture du checkpoint** (conditionnelle au statut `running`,
   bail renouvelé).
6. Appel kairos, assemblage du document jour, validation au schéma, puis
   `complete` : job `done`, compteurs, statut du run recalculé.
7. Le tick enchaîne les jobs jusqu'à épuisement du budget de temps (40 s par
   défaut) ou d'appels, libère le verrou et écrit ses compteurs sur une ligne
   JSON : `{locked, elapsedMs, jobsTouched, jobsCompleted, jobsFailed,
   jobsReleased, calls, callErrors, budgetBlocked}` (code de sortie 0).

## Scénarios alternatifs

- **A1 — Déclenchement HTTP sans SSH** (étape 1) : `POST
  /api/admin/worker-tick` avec `X-Migrate-Token` exécute un tick ; corps
  optionnel `{budgetSeconds: 1..45, maxCalls: 1..50}` (valeurs bornées) ;
  réponse `200` = compteurs, recopiés tels quels dans le journal serveur.
- **A2 — Runner de l'établissement** : `GET /api/worker/jobs?limit=n`
  (`X-Worker-Token`, 1 à 20) réserve les jobs de SON établissement, quel que
  soit le fournisseur, et renvoie `{jobs: [{id, runId, cohorteId, userId,
  date, dayText, checkpoint, promptPackage, referentielVersion, provider
  {provider, endpointUrl?, model?} (jamais la clé), model, leaseSeconds}],
  referentiel}` (document référentiel complet partagé ; un job d'une autre
  version porte le sien). Le runner exécute l'extraction avec le moteur
  (`extractDay`, `kairosOptional`) contre le LLM choisi (options CLI, sinon
  config portée par le job : `endpoint` → adaptateur OpenAI) et poste
  `POST /api/worker/jobs/{id}/result {document, tokens, coutUsd}` ; le serveur
  **revalide** le document (date du job, schéma), borne le coût à
  [0, 1000] $, termine le job et incrémente `spent_usd`. Un exécutant peut
  aussi poster `POST /api/worker/jobs/{id}/checkpoint {checkpoint}` (objet
  JSON ≤ 2 Mo) pour sauvegarder son avancement et renouveler le bail — le
  runner Node fourni ne le fait pas (sans état).
- **A3 — Tick interrompu** (étape 5) : budget de temps/appels épuisé → le job
  est reposé `queued` avec son checkpoint ; le tick suivant reprend au pôle
  manquant (au moins un appel est garanti par tick).
- **A4 — Exécutant disparu** (étape 3) : un job `running` dont le bail a
  expiré (tick tué, runner coupé) redevient réservable, checkpoint intact.
- **A5 — Kairos inexploitable** (étape 6) : après le nouvel essai, la synthèse
  est dégradée à `kairos: null` (autorisé par le schéma) ; le job se termine
  `done` avec la note « kairos dégradé à null (date) — … », visible dans les
  erreurs du tableau.
- **A6 — Tick déjà en cours** (étape 2) : verrou tenu → le tick rend aussitôt
  `{locked: true, …}` sans rien toucher.
- **A7 — Budget atteint** (étape 5) : l'estimation dépasse le plafond → aucun
  appel ; le job courant et les jobs en file de l'établissement passent
  `budget_exceeded`, ses runs actifs aussi (`budgetBlocked`). Côté runner,
  une réservation alors que `spent_usd` dépasse le plafond répond
  `{jobs: [], budget: "exceeded"}` et marque la file de même. Réactivation par
  hausse du plafond (UC-ETA-02, A3).
- **A8 — Source disparue** (étape 4) : dépôt retiré (`portfolio_id` nul),
  journée absente du dépôt (re-dépôt), paquet ou référentiel figé
  indisponible → échec définitif immédiat du job (`failed`, message
  explicite), sans appel ; côté runner, le job n'est pas servi.
- **A9 — Partage du travail** (étape 3) : les jobs d'un établissement en
  `endpoint` ne sont jamais réservés par le tick de la plateforme (infra
  injoignable depuis OVH) ; ils sont servis à son runner.

## Scénarios d'erreur

- **E1 — Jeton worker absent ou inconnu** : `401 {error: "Jeton worker
  invalide"}` sur les trois routes ; un job d'un autre établissement répond
  `404 {error: "Job introuvable"}` (la réservation ne le sert jamais) ; le
  runner s'arrête (code 3) sur `401`/`403`.
- **E2 — Checkpoint invalide ou job plus en cours** : corps qui n'est pas un
  objet JSON de 2 Mo au plus → `422` ; job annulé, terminé ou repris →
  `409 {error: "Job plus en cours (annulé ou bail repris)"}`.
- **E3 — Résultat refusé** : ni `document` ni `erreur` (ou les deux), `erreur`
  vide, `document` non objet, date différente de celle du job, document
  invalide au schéma (`details`, 5 erreurs au plus) → `422` ; document posté
  pour un job qui n'est plus `running` (rejeu, annulation) → `409` sans double
  comptage.
- **E4 — Déclenchement HTTP refusé** : `X-Migrate-Token` absent ou faux →
  `403 {error: "Forbidden"}` ; `MIGRATE_TOKEN` non configuré → `404 {error:
  "Not found"}` ; exception du tick → `500` (détail dans le journal serveur).
- **E5 — CLI sans base** : `php scripts/worker.php` sans base configurée ou
  sans autoload → message sur stderr, code 1, rien sur stdout.
- **E6 — Échecs répétés** : chaque échec (appel LLM après nouvel essai côté
  plateforme, ou `{erreur}` posté par le runner) ajoute une tentative et remet
  le job en file ; à la 3e, il passe `failed` et le run se termine `failed`.

## Règles de gestion

- **RG1** — Un seul tick plateforme à la fois (`GET_LOCK`, nom global au
  serveur MySQL) ; la réservation est transactionnelle (`SKIP LOCKED`), donc
  sûre face aux runners.
- **RG2** — Réservation : `ORDER BY priority DESC, id ASC`, bail de 300 s,
  limite bornée à [1, 20] ; le tick plateforme ne sert que le fournisseur
  `humanome`, le runner que son établissement.
- **RG3** — Checkpoint par pôle après CHAQUE appel réussi ; un pôle présent
  n'est jamais rappelé (8 appels exactement par journée hors nouvel essai).
- **RG4** — Toutes les écritures des exécutants sont conditionnelles au
  statut `running` : une annulation ou un arrêt budgétaire concurrent gagne.
- **RG5** — Coupe-circuit AVANT chaque appel plateforme : estimation =
  `ceil(longueur du prompt / 3,6)` tokens d'entrée + `WORKER_MAX_TOKENS`
  (8192) de sortie au tarif `Llm\Pricing` du modèle (modèle configuré, sinon
  `WORKER_MODEL`, défaut `claude-sonnet-4-5`) ; un point d'accès `endpoint`
  n'est jamais bloqué côté tick (coût 0 pour la plateforme).
- **RG6** — Politique d'appel (leçons M5) : réponse tronquée
  (`stop_reason max_tokens`) = échec ; un nouvel essai immédiat, payé ; au-delà,
  tentative comptée.
- **RG7** — Les résultats du runner sont revalidés côté serveur ; son coût
  déclaré est borné à [0, 1000] $ et imputé à `spent_usd`.
- **RG8** — Journalisation minimale : compteurs du tick, identifiants,
  messages techniques ; jamais de texte de portfolio ni de réponse LLM (le
  runner masque les extraits cités « … » dans son journal local).
- **RG9** — La clé de la plateforme ne quitte jamais le serveur : un job
  `humanome` est inexécutable par le runner (erreur de configuration, code 4,
  rien n'est posté) ; la clé d'un point d'accès d'établissement n'est jamais
  servie au runner, qui prend la sienne en option ou variable
  d'environnement.

## Données et RGPD

| Donnée | Traitement |
|---|---|
| Texte de la journée | Lu dans le dépôt de l'apprenant (opt-in) ; transmis au LLM et, pour le runner, dans la réponse de réservation ; jamais journalisé |
| Checkpoint / document | `mass_jobs.checkpoint`, `mass_jobs.document` (validé) |
| Compteurs | `mass_jobs.tokens_*`, `cost_usd`, `attempts` ; `etablissement_config.spent_usd` |
| Erreurs | `mass_jobs.erreur` : message technique (contexte pôle/date, extrait de réponse LLM possible pour le runner — périmètre du consentement de cohorte) |
| Journaux | Ligne JSON de compteurs (CLI, `error_log` du tick HTTP), journal stderr du runner expurgé |

## Code sollicité

| Couche | Élément | Rôle |
|---|---|---|
| CLI | `scripts/worker.php` | Point d'entrée cron : secrets, garde base, un tick, compteurs sur stdout |
| API | `api/src/routes/worker.php` — `GET /api/worker/jobs`, `POST /api/worker/jobs/{id}/checkpoint`, `POST /api/worker/jobs/{id}/result`, `POST /api/admin/worker-tick` | Authentification par jeton, charge utile, revalidation, bornes, déclenchement |
| Domaine | `api/src/Worker/JobQueue.php` — `reserve`, `release`, `saveCheckpoint`, `complete`, `fail`, `failHard`, `markBudgetExceeded`, `jobRow` | File MySQL, bail, écritures conditionnelles |
| Domaine | `api/src/Worker/Tick.php` — `run` (verrou, boucle, `advance`, `callWithRetry`, `budgetAllows`, `mayStartCall`, fournisseurs) | Tick borné et reprenable |
| Domaine | `api/src/Worker/PromptRunner.php` | Substitution des gabarits du paquet figé |
| Domaine | `api/src/Worker/PoleAssembler.php` — `assemblePole`, `validateKairos`, `assembleDay`, `parse` | Réparation et validation des réponses |
| Domaine | `api/src/Worker/OpenAiCompatibleProvider.php` | Point d'accès compatible OpenAI (`/v1/chat/completions`) — branche du tick inatteignable, voir Anomalies |
| Domaine | `api/src/Etablissement/ConfigRepository.php` — `etablissementIdForWorkerToken`, `allowsSpending`, `addSpentUsd`, `revealApiKey` ; `CohorteRepository::segmentText` | Jeton, budget, clé, texte du jour |
| Runner | `scripts/runner-node/runner.mjs` — `parseArgs`, `resolveProviderConfig`, `createApiClient`, `createRunner` (`runOnce`, `runLoop`), `computeCostUsd`, `sanitizeForLog`, `main` | Exécutant machine de l'établissement |

## Jeux de tests

### Tests unitaires

| ID | Cible | Vérifie | Fichier |
|---|---|---|---|
| UC-SYS-01-U01 | `JobQueue::reserve` | Priorité, bail 300 s, cron = `humanome` seul, runner = son établissement, bail expiré repris (RG2) | `api/tests/UseCases/Unit/UcSys01TraiterFileJobsTest.php` |
| UC-SYS-01-U02 | `JobQueue::reserve` | Limite bornée [1, 20] ; établissement sans configuration jamais servi | idem |
| UC-SYS-01-U03 | `saveCheckpoint`, `release`, `complete` | Écritures conditionnelles, bail renouvelé, checkpoint gardé, rejeu refusé (RG3, RG4) | idem |
| UC-SYS-01-U04 | `fail`, `failHard` | Tentatives, échec à la 3e, échec immédiat, statut du run | idem |
| UC-SYS-01-U05 | `markBudgetExceeded` | Job courant + file de l'établissement, runs marqués, autres intacts | idem |
| UC-SYS-01-U06 | `Tick::run` | Verrou tenu → `locked`, rien touché (RG1) | idem |
| UC-SYS-01-U07 | `Tick::run` | Budget d'appels → job reposé avec checkpoint, reprise sans rappel (5 + 3 = 8 appels) | idem |
| UC-SYS-01-U08 | `Tick::run` | Kairos inexploitable → `kairos: null` + note, 9 appels | idem |
| UC-SYS-01-U09 | `Tick::run` | Segment/dépôt/paquet introuvable → `failed` sans appel | idem |
| UC-SYS-01-U10 | `Tick::run` | Coupe-circuit avant appel → `budget_exceeded`, zéro appel (RG5) | idem |
| UC-SYS-01-U11 | `Tick::run` | Pôle en échec après nouvel essai : tentative comptée, coût non imputé (anomalie figée) | idem |
| UC-SYS-01-U12 | `PromptRunner` | Substitution exacte, tri, date FR, erreurs de gabarit, référentiel invalide | idem |
| UC-SYS-01-U13 | `PoleAssembler` | `poleNum` incohérent refusé, champs réparés, kairos invalide refusé | idem |
| UC-SYS-01-U14 | `OpenAiCompatibleProvider::complete` | URL, en-têtes (clé en `Authorization` seulement), corps, usage, `length` → `max_tokens` | idem |
| UC-SYS-01-U15 | `OpenAiCompatibleProvider::complete` | Non 2xx / non JSON → `UpstreamException` sans la clé | idem |
| UC-SYS-01-U16 | `resolveProviderConfig` | Job « endpoint » réel → adaptateur openai ; job « humanome » → `RunnerConfigError` (RG9) | `engine/test/usecases/unit/uc-sys-01-runner-node.test.js` |
| UC-SYS-01-U17 | `createRunner().runOnce` | Face à une API simulée fidèle : documents valides, compteurs postés (forme actuelle), aucune route de checkpoint, jeton hors URL, journal sans contenu | idem |
| UC-SYS-01-U18 | `createRunner().runOnce` | Job annulé en cours : `409`, erreur postée avec coût, la passe continue | idem |

### Tests fonctionnels

| ID | Scénario | Niveau | Vérifie | Fichier |
|---|---|---|---|---|
| UC-SYS-01-F01 | Nominal | CLI | `php scripts/worker.php` : code 0, compteurs exacts (8 appels), run `done`, document valide, dépense > 0 | `api/tests/UseCases/Functional/UcSys01TraiterFileJobsTest.php` |
| UC-SYS-01-F02 | E5 | CLI | Sans base : code 1, message stderr, stdout vide | idem |
| UC-SYS-01-F03 | A1, A3 | API | Tick HTTP : 3 appels puis borne à 50, reprise exacte (72 appels au total), journal = compteurs | idem |
| UC-SYS-01-F04 | E4 | API | `403` sans/faux jeton, `404` si `MIGRATE_TOKEN` absent | idem |
| UC-SYS-01-F05 | A6 | API | Verrou tenu → `locked`, file intacte | idem |
| UC-SYS-01-F06 | A7 | API | Plafond insuffisant : `budgetBlocked`, zéro appel, run `budget_exceeded` | idem |
| UC-SYS-01-F07 | A5 | Tick (cron simulé) | Kairos tronqué → document avec `kairos: null`, note au tableau | idem |
| UC-SYS-01-F08 | A2 | API runner | Réservation (forme de la charge utile), checkpoint, résultats → run `done`, tokens et coût | idem |
| UC-SYS-01-F09 | A4 | API runner | Bail expiré → job re-servi avec son checkpoint | idem |
| UC-SYS-01-F10 | A8 | API runner | Journée retirée du dépôt → job non servi, `failed` expliqué | idem |
| UC-SYS-01-F11 | A9 | API | Jobs `endpoint` ignorés par le tick, servis au runner | idem |
| UC-SYS-01-F12 | E1 | API runner | `401` sans/mauvais jeton ; job étranger `404`, réservation vide | idem |
| UC-SYS-01-F13 | E2 | API runner | Checkpoint `422` (liste, texte, > 2 Mo) ; `409` hors `running` | idem |
| UC-SYS-01-F14 | E3 | API runner | 6 résultats invalides `422` ; rejeu `409` sans double comptage ; coût borné [0, 1000] | idem |
| UC-SYS-01-F15 | E6 | API runner | 3 erreurs → `failed`, tentatives et message au tableau | idem |
| UC-SYS-01-F16 | Anomalies | API runner | Tokens au format du runner ignorés ; erreur après `done` acceptée et refacturée | idem |
| UC-SYS-01-F17 | A7 | API runner | Coûts déclarés au-delà du plafond → `{jobs: [], budget: "exceeded"}`, file marquée | idem |

### Tests existants liés (non-régression)

- `api/tests/MasseDoDTest.php` — DoD P11 : 20 portfolios par ticks simulés, interruption/reprise (480 appels exactement), plafond, bail expiré, annulation, échecs, `WORKER_TICK_MAX_CALLS`.
- `api/tests/WorkerRouteTest.php` — API runner : jeton, charge utile, checkpoint, résultats, budget, tick HTTP.
- `api/tests/WorkerPromptRunnerTest.php` — parité octet à octet des prompts avec le moteur (goldens `api/tests/MasseGolden/`), ports `PoleAssembler`.
- `scripts/runner-node/runner.test.mjs` — options CLI, résolution du fournisseur, relances, jeton refusé, RGPD du journal (`cd scripts/runner-node && npm test`).

### Exécuter

```sh
docker compose run --rm php vendor/bin/phpunit --filter UcSys01 --testdox
cd engine && npx vitest run test/usecases/unit/uc-sys-01
```

## Anomalies constatées

- **Compteurs de tokens du runner perdus** : le runner poste
  `tokens: {inputTokens, outputTokens}` (docs/runner-node.md) alors que la
  route lit `tokens.input` / `tokens.output` : les tokens des journées
  traitées par un runner sont enregistrés à 0 (le coût, lui, est bien pris en
  compte). Figé par UC-SYS-01-F16 et U17.
- **Erreur acceptée hors « running », coût refacturé** : la branche `erreur`
  de `POST …/result` répond `200 {status: "recorded"}` même si le job est
  terminé ou annulé, et ajoute quand même `coutUsd` à `spent_usd`. Or le
  runner, après un `409` sur son document (job annulé, bail repris, ou
  réponse perdue puis renvoyée), poste justement une erreur avec le coût de la
  journée : double facturation possible (réponse d'un succès perdue puis
  rejouée). La matrice d'autorisations annonce « 409 en rejeu » : vrai pour
  les documents seulement. Figé par UC-SYS-01-F16 et U18.
- **Coût des appels en échec non imputé (tick plateforme)** : quand un appel
  échoue malgré le nouvel essai (ou quand kairos est dégradé), les tokens déjà
  consommés sur la clé plateforme ne sont reportés ni sur le job ni sur
  `spent_usd` (le coût cumulé est perdu avec l'exception), alors que le runner,
  lui, déclare le coût de ses échecs. Le coupe-circuit budgétaire ignore donc
  ces dépenses. Figé par UC-SYS-01-U11.
- **Documentation du runner** : docs/runner-node.md affirme « le dernier
  résultat posté pour un job gagne » ; c'est le **premier** document accepté
  qui gagne, les suivants reçoivent `409`.
- **Branches mortes** : `Tick::processJob` prévoit l'échec « configuration
  établissement absente », inatteignable puisque `reserve()` ne sert que les
  jobs d'établissements configurés (le run attend alors sans message,
  UC-ETA-03 A6). De même, la branche `endpoint` de
  `Tick::defaultProviderFactory` (`OpenAiCompatibleProvider` + clé déchiffrée
  par `revealApiKey`) n'est jamais atteinte : le tick repose tout job
  `endpoint` avant de créer un fournisseur. La clé d'API chiffrée de
  l'établissement (UC-ETA-02) n'est donc lue par aucun exécutant.
  `OpenAiCompatibleProvider` n'est couvert que par ses tests unitaires
  (UC-SYS-01-U14, U15).

## Limites

- Pas de jeton de bail : tant qu'un job est `running`, n'importe quel
  exécutant de l'établissement peut poster son résultat, même si le bail a été
  repris par un autre ; le runner Node ne renouvelle jamais son bail (aucun
  checkpoint) — une journée qui dépasse 5 minutes peut être servie deux fois
  (double coût LLM, le premier document gagne).
- Le verrou `humanome_worker` est global au serveur MySQL (toutes bases
  confondues).
- Le runner exécute les gabarits **du moteur**, pas ceux du paquet figé :
  identiques pour le paquet par défaut, divergents pour un paquet personnalisé
  (limite v1 assumée, docs/runner-node.md).
- Sur l'offre OVH actuelle (sans cron), la cadence dépend du planificateur
  externe qui appelle `POST /api/admin/worker-tick`.
- La supervision de la file (`GET /api/status` : dernière activité, jobs en
  file ; tableau de monitoring d'administration via `Admin/PlatformStatus`)
  relève de UC-SYS-03 et UC-ADM-06.
