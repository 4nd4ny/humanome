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
- Aucune dépense **enregistrée** au-delà du plafond, à l'estimation près : les
  coûts des appels en échec ne sont ni imputés ni vus du coupe-circuit (voir
  Anomalies), et l'estimation d'entrée reste une heuristique.
- Le tick plateforme n'entame plus d'appel après avoir constaté l'annulation
  d'un job (checkpoint refusé) — l'appel en vol, lui, est perdu ; le runner
  termine l'extraction d'une journée annulée et ne l'apprend qu'au `409`
  (UC-SYS-01-U18).
- Aucune écriture sur la ligne d'un job qui n'est plus `running` (`spent_usd`,
  lui, peut encore être incrémenté : anomalie « erreur acceptée hors
  running »).

## Scénario nominal — tick de la plateforme

1. Le planificateur lance `php scripts/worker.php` (le script charge
   l'autoload, puis le premier `.env` trouvé parmi `HUMANOME_SHARED_DIR`,
   `<racine>/../shared` et `<racine>/api` — où `<racine>` est le parent de
   `scripts/` — et vérifie la base). Dans la disposition des releases, le
   deuxième candidat vaut `~/app/releases/shared`, pas `~/app/shared` : seul
   `HUMANOME_SHARED_DIR` permet de lire les secrets partagés (voir Anomalies).
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
- **A5 — Kairos inexploitable** (étape 6) : réponse non JSON, invalide ou
  tronquée ; après le nouvel essai, la synthèse est dégradée à `kairos: null`
  (autorisé par le schéma) ; le job se termine `done` avec la note « kairos
  dégradé à null (date) — … », visible dans les erreurs du tableau, sans
  compter de tentative.
- **A6 — Tick déjà en cours** (étape 2) : verrou tenu → le tick rend aussitôt
  `{locked: true, …}` sans rien toucher.
- **A7 — Budget atteint** (étape 5) : l'estimation dépasse le plafond → aucun
  appel ; le job courant et les jobs en file de l'établissement passent
  `budget_exceeded`, ses runs actifs aussi (`budgetBlocked`). Côté runner,
  une réservation alors que `spent_usd` dépasse le plafond répond
  `{jobs: [], budget: "exceeded"}` et marque la file de même ; le runner ne
  lit pas le champ `budget` : il journalise « file vide — aucun job en
  attente » et, en `--loop`, continue d'interroger après chaque pause
  (UC-SYS-01-U25). Réactivation par hausse du plafond (UC-ETA-02, A3).
- **A8 — Source disparue** (étape 4) : côté tick plateforme, dépôt retiré
  (`portfolio_id` nul), journée absente du dépôt (re-dépôt), paquet ou
  référentiel figé indisponible → échec définitif immédiat du job (`failed`,
  message explicite), sans appel. Côté runner, dépôt retiré, journée absente
  ou référentiel figé non publié → job non servi, `failed` (message propre à
  la route : « référentiel <id>@<version> indisponible (version figée non
  publiée) ») ; un paquet figé indisponible n'empêche PAS le service (le
  runner exécute les gabarits du moteur, voir Limites).
- **A9 — Partage du travail** (étape 3) : les jobs d'un établissement en
  `endpoint` ne sont jamais réservés par le tick de la plateforme (infra
  injoignable depuis OVH) ; ils sont servis à son runner.
- **A10 — Runner en boucle** (`--loop [s]`, défaut 30 s) : `runLoop` enchaîne
  des passes `runOnce` (réservation par lots de `--limit`, 5 par défaut,
  jusqu'à file vide) séparées par une pause de `s × 1000` ms, interruptible
  par le signal d'arrêt du runner ; un job mis en file pendant la pause est
  traité à la passe suivante. Un `409` sur un document (job annulé pendant
  son extraction) est posté en erreur avec le coût de la journée, et la
  boucle continue. `runLoop` rend les totaux cumulés des passes **terminées**
  (`passes`, `reserved`, `ok`, `errors`, `tokens`, `coutUsd`) — `main` ne les
  affiche pas (UC-SYS-01-U23, F22).
- **A11 — Arrêt du runner** (Ctrl-C, SIGINT/SIGTERM captés par `main` puis
  relâchés à la sortie) : une première fois, `requestStop()` — le job en
  cours est terminé et son résultat posté, les autres jobs du lot restent
  réservés (`running`) jusqu'à l'expiration du bail (300 s), aucune nouvelle
  pause n'est entamée ; si l'arrêt survient pendant la réservation, aucun job
  du lot reçu n'est traité (tout le lot reste `running`) ; une pause **en
  cours** n'est pas écourtée (jusqu'à `s` secondes). Une seconde fois,
  `abort()` — la pause ou l'appel LLM en vol est coupé, rien n'est posté pour
  le job en cours (rendu par le bail) ; code de sortie 0, sauf interruption
  d'un appel LLM en `--once` (code 1, voir Anomalies) (UC-SYS-01-U24, U26,
  F23).

## Scénarios d'erreur

- **E1 — Jeton worker absent ou inconnu** : `401 {error: "Jeton worker
  invalide"}` sur les trois routes ; un job d'un autre établissement répond
  `404 {error: "Job introuvable"}` (la réservation ne le sert jamais) ; le
  runner s'arrête (code 3) sur `401`/`403`. Les routes `/api/worker/*` et
  `/api/admin/worker-tick` ne sont pas dans la liste d'exemption CSRF : elles
  passent parce qu'aucun cookie de session n'est envoyé ; un appel porteur
  d'un cookie de session sans `X-CSRF-Token` est refusé (`403 "Jeton CSRF
  absent ou invalide"`).
- **E2 — Checkpoint invalide ou job plus en cours** : corps qui n'est pas un
  objet JSON de 2 Mo au plus → `422` ; job annulé, terminé, en échec, reposé
  en file ou `budget_exceeded` → `409 {error: "Job plus en cours (annulé ou
  bail repris)"}`. Un job dont le bail a été repris par un autre exécutant
  reste `running` : le checkpoint de l'ancien exécutant est accepté (`200`),
  faute de jeton de bail (voir Limites).
- **E3 — Résultat refusé** : ni `document` ni `erreur` (ou les deux), `erreur`
  vide, `document` non objet, date différente de celle du job, document
  invalide au schéma (`details`, 5 erreurs au plus) → `422` ; document posté
  pour un job qui n'est plus `running` (rejeu, annulation) → `409` sans double
  comptage.
- **E4 — Déclenchement HTTP refusé** : `X-Migrate-Token` absent ou faux →
  `403 {error: "Forbidden"}` ; `MIGRATE_TOKEN` non configuré → `404 {error:
  "Not found"}` ; exception du tick → `500 {error: "Tick failed, see server
  log"}` (message de l'exception dans le journal serveur). Plus généralement,
  les routes worker répondent `503 {error: "Service indisponible"}` sans base
  configurée et `500 {error: "Erreur interne"}` sur une exception SQL.
- **E5 — CLI en échec** : `php scripts/worker.php` sans autoload (« autoload
  introuvable ») ou sans base configurée (« base de données non
  configurée ») → message sur stderr, code 1, rien sur stdout ; base
  configurée mais exception du tick → « [worker] tick en échec : … » sur
  stderr, code 1.
- **E6 — Échecs répétés** : chaque échec (appel LLM après nouvel essai côté
  plateforme, ou `{erreur}` posté par le runner) ajoute une tentative et remet
  le job en file ; à la 3e, il passe `failed` et le run se termine `failed`.
  Côté plateforme, le job remis en file est aussitôt re-réservé par le MÊME
  tick : les 3 tentatives peuvent être consommées en quelques secondes ; une
  exception du fournisseur (HTTP 5xx/429, délai dépassé) n'a pas de nouvel
  essai immédiat ; une clé plateforme absente fait échouer toute la file
  `humanome` en un tick, sans appel (voir Anomalies).
- **E7 — Runner face à une API en erreur** : en `--once`, toute erreur de
  l'API worker autre que `401`/`403` et qui n'est pas absorbée par le
  traitement du job (un refus du document, `409` ou `422`, est redéclaré en
  `{erreur}`) — réseau, `503 "Service indisponible"`, `500 "Erreur
  interne"`, `404`… — arrête la passe : « ERREUR : API GET
  /api/worker/jobs?limit=n : HTTP 503 — … » sur stderr, code 1. En `--loop`,
  la même erreur — y compris un `404`, que le client ne tient pas pour
  retentable — est journalisée « erreur API transitoire : … » (extraits
  masqués) puis retentée après la pause ; seuls `401`/`403` (code 3) et une
  configuration impossible (`RunnerConfigError`, code 4, rien posté)
  arrêtent la boucle. Un résultat impossible à poster (réseau, `429`, `5xx` :
  3 envois, relances à 2 s puis 4 s ; un autre `4xx` n'est pas renvoyé) est
  redéclaré en `{erreur}` portant ce message (3 envois de plus) ; si ce
  dernier échoue aussi, la passe est abandonnée : job laissé `running`
  (rendu par le bail), journée extraite et payée absente des totaux
  (UC-SYS-01-U25, U26). Arguments invalides → aide sur stderr, code 2 ;
  `--help` → aide sur stdout, code 0. En sous-processus : UC-SYS-01-F24 (le
  résultat impossible à poster, dont les relances réelles durent 12 s, n'est
  couvert que par U25).

## Règles de gestion

- **RG1** — Un seul tick plateforme à la fois (`GET_LOCK`, nom global au
  serveur MySQL, toutes bases confondues) ; la réservation est
  transactionnelle (`SKIP LOCKED`), donc sûre face aux runners.
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
  (`stop_reason max_tokens`) ou inexploitable = échec ; un nouvel essai
  immédiat, payé ; au-delà, tentative comptée. Une exception du fournisseur
  n'a pas de nouvel essai (voir Anomalies).
- **RG7** — Les résultats du runner sont revalidés côté serveur ; son coût
  déclaré est borné à [0, 1000] $ et imputé à `spent_usd`.
- **RG8** — Journalisation minimale : compteurs du tick, identifiants,
  messages techniques (le runner masque les extraits cités « … » dans son
  journal local). Mais `mass_jobs.erreur`, lu par l'établissement, peut
  contenir un extrait de réponse LLM (≤ 160 caractères, potentiellement
  verbatim du portfolio) — côté tick plateforme comme côté runner (voir
  Anomalies) ; et le journal serveur reçoit les messages des exceptions SQL
  ou du tick (`error_log` de `routes/worker.php`), pas seulement des
  compteurs.
- **RG9** — La clé de la plateforme ne quitte jamais le serveur : sans
  `--provider`, un job `humanome` est inexécutable par le runner (erreur de
  configuration, code 4, rien n'est posté) ; avec `--provider` (options CLI
  prioritaires), le runner l'exécute avec le LLM de l'établissement. La clé
  d'un point d'accès d'établissement n'est jamais servie au runner, qui prend
  la sienne en option ou variable d'environnement.

## Données et RGPD

| Donnée | Traitement |
|---|---|
| Texte de la journée | Lu dans le dépôt de l'apprenant (opt-in) ; transmis au LLM et, pour le runner, dans la réponse de réservation ; jamais journalisé |
| Checkpoint / document | `mass_jobs.checkpoint`, `mass_jobs.document` (validé) |
| Compteurs | `mass_jobs.tokens_*`, `cost_usd`, `attempts` ; `etablissement_config.spent_usd` |
| Erreurs | `mass_jobs.erreur` : message technique (contexte pôle/date) pouvant contenir un extrait de réponse LLM (≤ 160 caractères, potentiellement verbatim du portfolio), côté tick plateforme ET runner ; visible de l'établissement au tableau du run, même après le départ du membre |
| Journaux | Ligne JSON de compteurs (CLI, `error_log` du tick HTTP) ; messages d'exception (SQL, tick) dans le journal serveur ; journal stderr du runner expurgé |

## Code sollicité

| Couche | Élément | Rôle |
|---|---|---|
| CLI | `scripts/worker.php` | Point d'entrée cron : secrets, garde base, un tick, compteurs sur stdout |
| API | `api/src/routes/worker.php` — `GET /api/worker/jobs`, `POST /api/worker/jobs/{id}/checkpoint`, `POST /api/worker/jobs/{id}/result`, `POST /api/admin/worker-tick` | Authentification par jeton, charge utile, revalidation, bornes, déclenchement, `503`/`500` |
| API | `api/src/Middleware/CsrfMiddleware.php` | Routes worker hors exemption : sans cookie de session elles passent, avec un cookie il faut le jeton CSRF |
| Domaine | `api/src/Worker/JobQueue.php` — `reserve`, `release`, `saveCheckpoint`, `complete`, `fail`, `failHard`, `markBudgetExceeded`, `jobRow`, `refreshRunStatus` | File MySQL, bail, écritures conditionnelles, statut terminal du run |
| Domaine | `api/src/Worker/Tick.php` — `run` (verrou, boucle, `advance`, `callWithRetry`, `budgetAllows`, `mayStartCall`, fournisseurs) | Tick borné et reprenable |
| Domaine | `api/src/Worker/PromptRunner.php` | Substitution des gabarits du paquet figé |
| Domaine | `api/src/Worker/PoleAssembler.php` — `assemblePole`, `validateKairos`, `assembleDay`, `parse` | Réparation et validation des réponses |
| Domaine | `api/src/Worker/OpenAiCompatibleProvider.php` | Point d'accès compatible OpenAI (`/v1/chat/completions`) — branche du tick inatteignable, voir Anomalies |
| Domaine | `api/src/Etablissement/ConfigRepository.php` — `etablissementIdForWorkerToken`, `allowsSpending`, `addSpentUsd`, `revealApiKey` ; `CohorteRepository::segmentText` | Jeton, budget, clé, texte du jour |
| Runner | `scripts/runner-node/runner.mjs` — `parseArgs`, `resolveProviderConfig`, `createApiClient` (`reserveJobs`, `postResult` et ses 3 envois), `createRunner` (`runOnce`, `runLoop`, `requestStop`, `abort`), `computeCostUsd`, `sanitizeForLog`, `main` (codes 0 à 4, SIGINT/SIGTERM) | Exécutant machine de l'établissement : passe unique ou boucle, arrêt coopératif ou immédiat |

## Jeux de tests

### Tests unitaires

| ID | Cible | Vérifie | Fichier |
|---|---|---|---|
| UC-SYS-01-U01 | `JobQueue::reserve` | Runner = son établissement (réservé pendant que les jobs plus anciens d'un autre sont en file), priorité, bail 300 s, cron = `humanome` seul, bail expiré repris (RG2) | `api/tests/UseCases/Unit/UcSys01TraiterFileJobsTest.php` |
| UC-SYS-01-U02 | `JobQueue::reserve` | Limite bornée [1, 20] ; établissement sans configuration jamais servi | idem |
| UC-SYS-01-U03 | `saveCheckpoint`, `release`, `complete`, `jobRow` | Écritures conditionnelles, bail renouvelé, checkpoint gardé, rejeu refusé (RG3, RG4) ; relecture avec colonnes du run jointes | idem |
| UC-SYS-01-U04 | `fail`, `failHard` | Tentatives, échec à la 3e, échec immédiat, statut du run | idem |
| UC-SYS-01-U05 | `markBudgetExceeded` | Job courant + file de l'établissement, runs marqués, autres intacts | idem |
| UC-SYS-01-U06 | `Tick::run` | Verrou tenu → `locked`, rien touché (RG1 ; prise du verrou avec attente bornée) | idem |
| UC-SYS-01-U07 | `Tick::run` | Budget d'appels → job reposé avec checkpoint, reprise sans rappel (5 + 3 = 8 appels) | idem |
| UC-SYS-01-U08 | `Tick::run` | Kairos inexploitable → `kairos: null` + note, 9 appels ; seuls les 7 pôles imputés au job et à `spent_usd` (anomalie 3 figée) | idem |
| UC-SYS-01-U09 | `Tick::run` | Segment/dépôt/paquet introuvable → `failed` sans appel | idem |
| UC-SYS-01-U10 | `Tick::run` | Coupe-circuit avant appel → `budget_exceeded`, zéro appel (RG5) | idem |
| UC-SYS-01-U11 | `Tick::run` | Pôle en échec après nouvel essai : tentative comptée, coût non imputé, message citant la réponse (anomalies figées) | idem |
| UC-SYS-01-U12 | `PromptRunner` | Substitution exacte, tri, date FR, erreurs de gabarit, référentiel invalide | idem |
| UC-SYS-01-U13 | `PoleAssembler` | `poleNum` incohérent refusé, champs réparés, kairos invalide refusé | idem |
| UC-SYS-01-U14 | `OpenAiCompatibleProvider::complete` | URL, en-têtes (clé en `Authorization` seulement), corps, usage, `length` → `max_tokens` | idem |
| UC-SYS-01-U15 | `OpenAiCompatibleProvider::complete` | Non 2xx / non JSON → `UpstreamException` sans la clé | idem |
| UC-SYS-01-U16 | `resolveProviderConfig` | Job « endpoint » réel → adaptateur openai ; job « humanome » → `RunnerConfigError` (RG9) | `engine/test/usecases/unit/uc-sys-01-runner-node.test.js` |
| UC-SYS-01-U17 | `createRunner().runOnce` | Face à une API simulée fidèle : documents valides, compteurs postés (forme actuelle), aucune route de checkpoint, jeton hors URL, journal sans contenu | idem |
| UC-SYS-01-U18 | `createRunner().runOnce` | Job annulé en cours : `409`, erreur postée avec coût, la passe continue | idem |
| UC-SYS-01-U19 | `Tick::run` | Job en échec re-réservé dans le même tick : 3 tentatives, 6 appels, `failed` en un tick (anomalie figée) | `api/tests/UseCases/Unit/UcSys01TraiterFileJobsTest.php` |
| UC-SYS-01-U20 | `Tick::run` (fabrique de production) | `ANTHROPIC_API_KEY` vide : les jobs de deux runs `failed` en un tick, 0 appel, 6 erreurs (anomalie figée) | idem |
| UC-SYS-01-U21 | `Tick::run` | Kairos tronqué (`max_tokens`) → `done`, `kairos: null`, note « réponse tronquée » (RG6, A5) | idem |
| UC-SYS-01-U22 | `main` (runner) | `401` → code 3 ; job `humanome` sans `--provider` → code 4, rien posté ; avec `--provider`, configuration résolue (RG9) | `engine/test/usecases/unit/uc-sys-01-runner-node.test.js` |
| UC-SYS-01-U23 | `createRunner().runLoop` | Face à une API simulée fidèle : 2 passes séparées par une pause de `--loop 7` (7 000 ms, signal du runner), job arrivé pendant la pause traité ensuite, `409` posté en erreur sans arrêter la boucle, `requestStop()` n'écourte pas la pause, totaux exacts (A10) | `engine/test/usecases/unit/uc-sys-01-runner-loop.test.js` |
| UC-SYS-01-U24 | `runLoop`, `requestStop`, `abort` | `requestStop()` pendant un job : job posté, reste du lot `running`, aucune pause ; `abort()` coupe la pause réelle du moteur (30 s) ; comportement actuel : `abort()` pendant l'extraction → rien posté, journalisé « erreur API transitoire » (A11, anomalie) | idem |
| UC-SYS-01-U25 | `runLoop` | `503`, réseau et `404` journalisés « transitoires » puis pause ; `{budget: "exceeded"}` = file vide ; résultat impossible à poster (document puis erreur, relances 2 s/4 s) → passe non comptée, job `running` ; `401` et `RunnerConfigError` arrêtent la boucle (A7, E7) | idem |
| UC-SYS-01-U26 | `main` (runner) | `--help` → 0 ; arguments invalides → 2 ; `--once` + `503` → 1 ; `--loop` + Ctrl-C ×1 → 0, écouteurs SIGINT/SIGTERM retirés ; Ctrl-C ×2 pendant la pause → 0 immédiat ; comportement actuel : Ctrl-C ×2 pendant un appel LLM (adaptateur OpenAI réel) en `--once` → 1 (A11, E7, anomalie). « Ctrl-C » = appel direct de l'écouteur SIGINT posé par `main` (aucun signal émis) ; les vrais signaux sont envoyés par F23 | idem |

### Tests fonctionnels

| ID | Scénario | Niveau | Vérifie | Fichier |
|---|---|---|---|---|
| UC-SYS-01-F01 | Nominal | CLI | `php scripts/worker.php` : code 0, compteurs exacts (8 appels), run `done`, document valide, dépense > 0 | `api/tests/UseCases/Functional/UcSys01TraiterFileJobsTest.php` |
| UC-SYS-01-F02 | E5 | CLI | Sans base (`.env` partagé vide, jamais le `api/.env` du poste) : code 1, message stderr, stdout vide | idem |
| UC-SYS-01-F03 | A1, A3 | API | Tick HTTP : 3 appels puis borne à 50, reprise exacte (72 appels au total), journal = compteurs | idem |
| UC-SYS-01-F04 | E4 | API | `403` sans/faux jeton, `404` si `MIGRATE_TOKEN` absent, exception du tick → `500` + journal serveur | idem |
| UC-SYS-01-F05 | A6 | API | Verrou tenu → `locked`, file intacte | idem |
| UC-SYS-01-F06 | A7 | API | Plafond insuffisant : `budgetBlocked`, zéro appel, run `budget_exceeded` | idem |
| UC-SYS-01-F07 | A5 | API (tick HTTP) | Paquet publié au gabarit kairos inexploitable : 9 appels, document avec `kairos: null`, note au tableau (0 tentative) | idem |
| UC-SYS-01-F08 | A2 | API runner | Réservation (forme de la charge utile), checkpoint, résultats → run `done`, tokens et coût | idem |
| UC-SYS-01-F09 | A4 | API runner | Bail expiré → job re-servi avec son checkpoint | idem |
| UC-SYS-01-F10 | A8 | API runner | Journée retirée du dépôt → job non servi, `failed` expliqué | idem |
| UC-SYS-01-F11 | A9 | API | Jobs `endpoint` ignorés par le tick, servis au runner | idem |
| UC-SYS-01-F12 | E1 | API runner | Réservation étrangère vide alors que le job est en file ; `401` sans/mauvais jeton ; job étranger `404` ; cookie de session sans CSRF → `403` | idem |
| UC-SYS-01-F13 | E2 | API runner | Checkpoint `422` (liste, texte, > 2 Mo) ; checkpoint d'un exécutant dont le bail a été repris → `200` ; `409` hors `running` | idem |
| UC-SYS-01-F14 | E3 | API runner | 6 résultats invalides `422` ; rejeu `409` sans double comptage ; coût borné [0, 1000] (négatif ou texte → `200 done`, coût 0) | idem |
| UC-SYS-01-F15 | E6 | API runner | 3 erreurs → `failed`, tentatives et message au tableau | idem |
| UC-SYS-01-F16 | Anomalies | API runner | Tokens au format du runner ignorés ; erreur après `done` acceptée et refacturée | idem |
| UC-SYS-01-F17 | A7 | API runner | Coûts déclarés au-delà du plafond → `{jobs: [], budget: "exceeded"}`, file marquée | idem |
| UC-SYS-01-F18 | Nominal (étape 1) | CLI | Sans `DB_*` dans l'environnement : secrets lus dans le `.env` de `HUMANOME_SHARED_DIR`, tick exécuté | idem |
| UC-SYS-01-F19 | Anomalies | CLI | Disposition des releases : `~/app/shared/.env` ignoré (code 1), `~/app/releases/shared/.env` lu (comportement actuel) | idem |
| UC-SYS-01-F20 | A8 | API runner | Version de paquet figée introuvable : le job est quand même servi | idem |
| UC-SYS-01-F21 | E6 | API (tick HTTP) | Paquet publié au gabarit de pôle inexploitable : 3 tentatives en un tick (6 appels), job et run `failed`, message citant la réponse | idem |
| UC-SYS-01-F22 | A10 | CLI runner (sous-processus Node, API worker et LLM simulés sur 127.0.0.1) | `--loop 1` réel : 2 passes séparées par une pause ≥ 1 s, job mis en file pendant la pause traité ensuite, `409` posté en erreur avec le coût sans arrêter la boucle, documents valides ; SIGINT pendant la pause : pause menée à son terme, aucune réservation de plus, code 0 ; journal sans contenu | `engine/test/usecases/unit/uc-sys-01-runner-cli.test.js` |
| UC-SYS-01-F23 | A11, anomalie | CLI runner (vrais signaux) | SIGINT ×1 pendant un job → job posté, reste du lot `running`, aucune pause ; SIGINT ×1 pendant la réservation → lot entier `running`, aucun appel LLM ; SIGTERM ×2 pendant la pause de 30 s → sortie immédiate, code 0 ; SIGINT ×2 pendant un appel LLM → rien posté, code 0 en `--loop` (« erreur API transitoire »), comportement actuel : code 1 en `--once` | idem |
| UC-SYS-01-F24 | E7, RG9 | CLI runner | `--once` + `503` → 1 sans nouvel essai ; `--loop 1` : `503`, coupure réseau, `404` retentés après la pause, puis `401` → 3 ; job `humanome` sans `--provider` → 4, rien posté ; arguments invalides → 2 ; `--help` → 0 | idem |

### Tests existants liés (non-régression)

- `api/tests/MasseDoDTest.php` — DoD P11 : 20 portfolios par ticks simulés, interruption/reprise (480 appels exactement), plafond, bail expiré, annulation, échecs, `WORKER_TICK_MAX_CALLS`.
- `api/tests/WorkerRouteTest.php` — API runner : jeton, charge utile, checkpoint, résultats, budget, tick HTTP.
- `api/tests/WorkerPromptRunnerTest.php` — parité octet à octet des prompts avec le moteur (goldens `api/tests/MasseGolden/`), ports `PoleAssembler`.
- `scripts/runner-node/runner.test.mjs` — options CLI, résolution du fournisseur, relances, jeton refusé, RGPD du journal (`cd scripts/runner-node && npm test` ; hors de la suite du moteur, donc hors CI) ; couvre notamment `sanitizeForLog` et `computeCostUsd` (sans test UC propre) et, sommairement, `runLoop` (403 fatal, survie à une erreur réseau) — la boucle, l'arrêt et `main` sont couverts par UC-SYS-01-U23 à U26 et, en sous-processus avec de vrais signaux, par F22 à F24.
- Éléments du « Code sollicité » couverts ailleurs : `ConfigRepository::etablissementIdForWorkerToken`, `allowsSpending`, `addSpentUsd`, `revealApiKey` → UC-ETA-02-U02, U04, U05, U06 ; `JobQueue::refreshRunStatus` → UC-ETA-03-U06 ; `PoleAssembler::parse`, `assembleDay` → `WorkerPromptRunnerTest::testParseTolerant`, `::testAssembleDayDocumentComplet` (et indirectement U08, U11, U21).

### Exécuter

```sh
docker compose run --rm php vendor/bin/phpunit --filter UcSys01 --testdox
cd engine && npx vitest run test/usecases/unit/uc-sys-01
```

Le verrou `humanome_worker` étant global au serveur MySQL, ces tests (U06 et
F05 le tiennent volontairement ; les autres lancent des ticks) ne sont pas
isolés des autres processus PHPUnit qui tournent en parallèle sur d'autres
bases : les tests du lot relancent un tick qui répond `locked` à cause d'un
autre processus (`EtaSupport::untilUnlocked`, `EtaTickSupport`) et prennent le
verrou avec une attente bornée, mais les classes hors lot qui lancent des
ticks (`MasseDoDTest`, `WorkerRouteTest`, UC-CPT-05…) n'ont pas cette
protection : en cas d'échec « locked » inattendu, rejouer ces suites
séquentiellement.

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
  ces dépenses. Figé par UC-SYS-01-U11 (pôle) et U08 (kairos).
- **Tentatives consommées dans un même tick, sans espacement.** Après un
  échec, `fail()` remet le job `queued` (tentative + 1) et la boucle du tick
  le re-réserve aussitôt (`ORDER BY priority DESC, id ASC`) : ses 3
  tentatives partent en quelques secondes, alors que docs/plan-masse.md
  prévoit « retenté au tick suivant ». De plus, `$provider->complete()` est
  hors du `try` de `callWithRetry` : une exception du fournisseur (HTTP
  5xx/429/529, délai dépassé) n'a aucun nouvel essai immédiat. Enfin, sans
  `ANTHROPIC_API_KEY`, la fabrique lève une exception attrapée par le filet
  de `processJob` (`fail()` sans appel ; `calls` reste à 0, le tick ne
  s'arrête pas) : un seul tick fait passer `failed` toute la file `humanome`.
  Figé par UC-SYS-01-U19, U20 et F21.
- **CLI mal branché dans la disposition des releases.** `scripts/worker.php`
  cherche `$root/../shared/.env` avec `$root = dirname(__DIR__)` : sur
  l'hébergement, `~/app/releases/<ts>/../shared` = `~/app/releases/shared`
  (le commentaire du script annonce `~/app/shared` ; `Bootstrap` utilise bien
  `dirname(__DIR__, 3)`). Et `scripts/deploy/stage-api.sh` ne copie pas
  `scripts/worker.php` dans la release (seulement `scripts/migrations` et
  `migrate.php`), alors que docs/deploiement.md recommande de planifier
  `php scripts/worker.php` sur une offre avec cron. Sur une telle offre, le
  nominal tomberait en E5 ; seul `HUMANOME_SHARED_DIR` permet de le faire
  fonctionner. Figé par UC-SYS-01-F19 (F18 couvre `HUMANOME_SHARED_DIR`).
- **Extraits de réponse LLM dans `mass_jobs.erreur` (tick plateforme
  compris).** `PoleAssembler::parse` met les 160 premiers caractères de la
  réponse dans son exception (« début : « … » »), que le tick recopie dans
  `fail()` ou dans la note kairos de `complete()` ; `runStats` les renvoie à
  l'établissement. Contredit la docblock de `JobQueue::fail` (« never
  portfolio content ») et plan-masse §6. Figé par UC-SYS-01-U11, F07, F21 et
  UC-ETA-03-F24.
- **Interruption immédiate du runner mal classée.** Quand `abort()` (Ctrl-C
  ×2) coupe un appel LLM, `extractDay` enveloppe l'`AbortError` dans une
  `Error` ordinaire (« extractDay : pôle N (date) — This operation was
  aborted »), que `processJob` relance telle quelle. `main` ne reconnaît
  l'interruption que par `err.name === 'AbortError'` : en `--once`, il
  journalise « ERREUR : extractDay … » et sort avec le code **1** (« erreur
  d'exécution ») au lieu de 0 ; en `--loop`, `runLoop` la journalise
  « erreur API transitoire : extractDay … » avant de s'arrêter (code 0).
  Rien n'est posté dans les deux cas (le bail rend le job), conformément à
  docs/runner-node.md. Correctif suggéré : tester `signal.aborted` (ou
  `err.cause?.name`) plutôt que le seul nom de l'erreur. Figé par
  UC-SYS-01-U24, U26 et F23.
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
  confondues) : deux environnements partageant un serveur MySQL se
  sérialisent, et les suites de tests parallèles se gênent (voir
  « Exécuter »).
- Le runner exécute les gabarits **du moteur**, pas ceux du paquet figé :
  identiques pour le paquet par défaut, divergents pour un paquet personnalisé
  (limite v1 assumée, docs/runner-node.md).
- Sur l'offre OVH actuelle (sans cron), la cadence dépend du planificateur
  externe qui appelle `POST /api/admin/worker-tick`.
- La supervision de la file (`GET /api/status` : dernière activité, jobs en
  file ; tableau de monitoring d'administration via `Admin/PlatformStatus`)
  relève de UC-SYS-03 et UC-ADM-06.
- Runner, limites de conception observées (UC-SYS-01-U24, U25, F23) : un
  premier Ctrl-C abandonne les autres jobs du lot réservé (jusqu'à `--limit`
  si l'arrêt tombe pendant la réservation, `--limit - 1` s'il tombe pendant
  un job), bloqués `running` pendant le bail de 5 minutes ; il n'écourte pas
  une pause en cours ; le plafond budgétaire atteint n'est pas signalé (« file vide ») ;
  en `--loop`, une erreur d'API permanente (URL erronée → `404`) est
  retentée indéfiniment ; les totaux de `runLoop` ignorent une passe
  abandonnée sur erreur, même si ses journées ont été payées.
