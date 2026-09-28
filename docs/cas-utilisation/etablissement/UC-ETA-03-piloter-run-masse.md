# UC-ETA-03 — Lancer, suivre et annuler un run de masse

| Champ | Valeur |
|---|---|
| **Acteur principal** | Établissement de formation (rôle `etablissement`) |
| **Acteurs secondaires** | Worker cron de la plateforme / runner Node de l'établissement (traitent la file — UC-SYS-01) ; apprenants membres (ont consenti et déposé — UC-APP-08) ; promptologues (paquets publiés — UC-PRO-03) ; épistémiarques (référentiel publié — UC-EPI-03) |
| **Portée** | humanome.xyz — page `#/etablissement/cohorte/<id>` ; API `POST /api/etablissement/cohortes/{id}/runs`, `GET /api/etablissement/runs/{runId}`, `POST /api/etablissement/runs/{runId}/annuler` |
| **Niveau** | Objectif utilisateur |
| **Cahier des charges** | §3.7 (cartographie en masse, budget maximal), §4.9, §7 (facturation à l'usage), §8 (un run peut durer des heures), ADR-005, docs/plan-masse.md §1-4 et §7 |
| **Statut** | Implémenté (P11 / M8) |

## Objectif

Transformer les portfolios déposés d'une cohorte en cartographies journalières
par un **run de masse** : l'établissement choisit les membres et un paquet de
prompts publié, **voit le coût estimé avant de confirmer**, suit l'avancement
en direct (jobs par statut, coût cumulé, erreurs) et peut arrêter le run à
tout moment.

## Déclencheur

L'établissement ouvre la page d'une cohorte (section « Lancer un run de
masse ») et clique « Estimer le coût ».

## Préconditions

- Compte connecté portant le rôle `etablissement`, propriétaire de la cohorte.
- Au moins un membre a rejoint avec consentement **et** déposé son portfolio
  segmenté par journées (UC-APP-08).
- Un paquet de prompts publié contenant les gabarits `extraction-pole` et
  `kairos` (le paquet par défaut `aurora-v3-reconstruit@1.0.0` les contient) et
  un référentiel `respire` publié existent.
- Pour que le run avance : une configuration LLM/budget existe (UC-ETA-02) et
  un exécutant traite la file (cron de la plateforme pour le fournisseur
  humanome, runner de l'établissement pour un endpoint propre — UC-SYS-01).

## Garanties en cas de succès

- Un run est créé avec les versions **figées** du paquet et du référentiel
  (reproductibilité) et un job `queued` par (membre consenti ayant déposé ×
  journée de son dépôt).
- Le tableau d'avancement reflète la file (six statuts, coût, tokens, erreurs)
  jusqu'au statut terminal du run (`done`, `failed`, `cancelled`) ou à l'arrêt
  budgétaire (`budget_exceeded`).
- Événements d'audit `mass_run_created {runId, cohorteId, jobs}` et
  `mass_run_cancelled {runId}` — compteurs et identifiants seulement.

## Garanties minimales (en cas d'échec)

- Aucun run n'est créé ; aucune dépense n'est engagée.
- Un run d'un autre établissement est indiscernable d'un run inexistant.

## Scénario nominal

1. L'établissement ouvre `#/etablissement/cohorte/<id>` ; le site charge en
   parallèle le détail de la cohorte, la configuration (UC-ETA-02) et les
   paquets publiés (`GET /api/prompt-packages`). Tous les membres ayant déposé
   sont cochés ; la case d'un membre sans dépôt est désactivée.
2. Le premier paquet publié de la liste est présélectionné (menu « Paquet de
   prompts »).
3. Il clique « Estimer le coût » : le site calcule localement (moteur) le
   nombre de membres et de journées, `8 × journées` appels LLM (7 pôles +
   1 kairos ; la fusion est calculée plus tard côté client, sans LLM), les
   tokens (taille moyenne d'une journée tirée des dépôts + 30 000 caractères de
   prompt par appel, 1 000 tokens de sortie par appel) et le coût au prix du
   modèle configuré (à défaut `claude-sonnet-5`), avec l'avertissement « Prix
   INDICATIFS ». Rien n'est envoyé.
4. Il clique « Confirmer et lancer le run » ; le site envoie
   `POST /api/etablissement/cohortes/{id}/runs {promptPackageId,
   promptPackageVersion, membres?}` (`membres` omis quand tous les déposants
   sont cochés ; `X-CSRF-Token`).
5. Le serveur vérifie la propriété de la cohorte, le corps, que le paquet est
   **publié** et contient `extraction-pole` + `kairos`, prend la **dernière
   version publiée** du référentiel `respire`, sélectionne les dépôts des
   membres consentis (éventuellement restreints à `membres`).
6. Il crée le run (statut `active`, versions figées), un job `queued` par
   (membre × journée), journalise `mass_run_created` et répond
   `201 {runId, jobs}`.
7. Le site affiche la section « Avancement » et interroge
   `GET /api/etablissement/runs/{runId}` immédiatement puis **toutes les
   5 secondes** : `{id, cohorteId, status, promptPackage, referentiel,
   createdAt, finishedAt, jobs{queued, running, done, failed, budget_exceeded,
   cancelled}, coutUsd, tokens{input, output}, erreurs[]}` ; il affiche le
   statut, « x/N jobs terminés », le coût cumulé et un tableau par statut.
8. Les exécutants traitent la file (UC-SYS-01) ; quand plus aucun job n'est
   `queued`/`running`/`budget_exceeded`, le run passe `done` (ou `failed` si
   un job a échoué définitivement) avec `finishedAt` ; le bouton « Annuler le
   run » disparaît.

## Scénarios alternatifs

- **A1 — Sélection de membres** (étape 1) : décocher un membre efface
  l'estimation affichée ; le POST porte alors `membres: [userId…]` et seuls
  ces déposants sont enfilés.
- **A2 — Membre sans dépôt ou parti** (étape 5) : un membre consenti qui n'a
  pas déposé, ou qui a quitté la cohorte (dépôt purgé), n'obtient aucun job.
- **A3 — Plafond atteint en cours de run** (étape 8) : avant chaque appel LLM
  le worker vérifie le budget ; au plafond, les jobs restants passent
  `budget_exceeded` et le run aussi ; le site affiche « Plafond de budget
  atteint : N job(s) en attente de budget… ». Une **hausse** du plafond
  (UC-ETA-02, A3) remet ces jobs en file et le run redevient `active`.
- **A4 — Annulation** (étape 7) : « Annuler le run » envoie
  `POST /api/etablissement/runs/{runId}/annuler` → `200 {id, status:
  "cancelled"}` ; les jobs `queued`/`running`/`budget_exceeded` passent
  `cancelled`, les journées déjà produites restent acquises, le run est
  définitivement `cancelled` (un worker en plein pôle perd son écriture
  conditionnelle et abandonne) ; audit `mass_run_cancelled`.
- **A5 — Échecs** (étape 8) : un job dont les appels échouent est retenté
  jusqu'à 3 tentatives puis passe `failed` ; le tableau liste les erreurs
  (`jobId`, `userId`, `date`, `status`, `attempts`, message technique sans
  contenu de portfolio) et le run se termine `failed`.
- **A6 — Pas encore de configuration** (étape 8) : un run lancé avant toute
  configuration LLM/budget reste `active` avec ses jobs `queued` — aucun
  exécutant ne les réserve — jusqu'à l'enregistrement d'une configuration.
- **A7 — Estimation à surveiller** (étape 3) : si le coût estimé dépasse le
  budget restant (`plafond − dépense`), un avertissement annonce que les jobs
  excédentaires passeront « budget dépassé » ; si le modèle configuré est
  absent de la table de prix, le coût s'affiche « inconnu (modèle hors table
  de prix) ».

## Scénarios d'erreur

- **E0 — Refus local** (étapes 2-3) : aucun paquet publié → message « Aucun
  paquet de prompts publié n'est disponible… » et pas de bouton d'estimation ;
  aucun membre coché → « Aucun membre sélectionné n'a déposé son portfolio :
  le run n'aurait aucun job. » ; aucune requête.
- **E1 — Corps invalide** (étape 5) : `promptPackageId`/`promptPackageVersion`
  absents ou vides, `membres` qui n'est pas une liste d'entiers →
  `422 {error: "Validation échouée", fields}`.
- **E2 — Paquet inutilisable** (étape 5) : version non publiée →
  `422 "Paquet de prompts publié introuvable : <id>@<version>"` ; paquet sans
  `extraction-pole` + `kairos` → `422 "Ce paquet ne contient pas les gabarits
  d'extraction (extraction-pole + kairos)"`.
- **E3 — Aucun référentiel publié** (étape 5) : `409 "Aucun référentiel publié"`.
- **E4 — Aucun déposant** (étape 5) : `422 "Aucun membre consenti n'a déposé
  de portfolio dans cette cohorte"` (aussi quand la sélection ne contient que
  des non-déposants).
- **E5 — Cohorte ou run étranger/inexistant** : `404 "Cohorte introuvable"`
  (lancement) ou `404 "Run introuvable"` (suivi, annulation), corps identiques.
- **E6 — Accès refusé** : sans session `401`, sans rôle `403`, mutation sans
  jeton CSRF `403`.

Le site affiche le message du serveur pour E1 à E5.

## Règles de gestion

- **RG1** — Un job = (membre, journée) ; clé unique (run, membre, jour).
- **RG2** — Seuls les membres **consentis ayant déposé** sont enfilés (le dépôt
  est l'opt-in de fait au traitement serveur, plan-masse §6).
- **RG3** — Versions **publiées** et **figées** sur le run : le paquet choisi
  et la dernière version publiée du référentiel `respire` au moment du
  lancement ; une publication ultérieure ne touche pas le run (les exécutants
  servent les versions figées).
- **RG4** — Estimation obligatoire avant le POST (deux clics : estimer, puis
  confirmer) ; toute modification de la sélection ou du paquet efface
  l'estimation.
- **RG5** — L'annulation est définitive (`refreshRunStatus` ne touche qu'un
  run `active`) ; toutes les écritures des exécutants sont conditionnelles au
  statut `running`.
- **RG6** — Le tableau n'expose que des compteurs, identifiants, dates et
  messages techniques : jamais de texte de portfolio.

## Données et RGPD

| Donnée | Traitement |
|---|---|
| Run | `mass_runs` : établissement, cohorte, versions figées, statut, dates |
| Jobs | `mass_jobs` : membre, dépôt source, journée, statut, compteurs (tentatives, tokens, coût), erreur technique, document produit |
| Audit | `mass_run_created {runId, cohorteId, jobs}`, `mass_run_cancelled {runId}` |
| Portfolio | Lu uniquement par les exécutants (UC-SYS-01), jamais renvoyé à l'établissement |

## Code sollicité

| Couche | Élément | Rôle |
|---|---|---|
| Front | `web/src/views/etablissement/CohorteSection.jsx` — sélection, `computeEstimate`, `confirmLaunch`, polling (`POLL_INTERVAL_MS`), `RunProgress`, `onCancel` | Assistant de lancement, suivi, annulation |
| Front | `web/src/views/etablissement/etablissement-api.js` — `estimateMassRun`, `EXTRACTION_CALLS_PER_DAY`, `SERVICE_MODEL`, `fetchPublishedPackages`, `launchRun`, `fetchRun`, `cancelRun`, `JOB_STATUS_LABELS` | Estimation, appels, normalisation du tableau |
| Moteur | `engine/src/providers/estimate.js` — `getModelPricing`, `CHARS_PER_TOKEN_FR`, `PRICING_DISCLAIMER` | Table de prix indicative |
| API | `api/src/routes/etablissement.php` — `POST …/cohortes/{id}/runs`, `GET …/runs/{runId}`, `POST …/runs/{runId}/annuler` | Validation, versions, enfilage, audit |
| Domaine | `api/src/Etablissement/CohorteRepository.php` — `findForEtablissement`, `depositsForRun` | Propriété, sélection des dépôts |
| Domaine | `api/src/Worker/JobQueue.php` — `enqueueRun`, `runForEtablissement`, `runStats`, `cancelRun`, `refreshRunStatus` | File, tableau, annulation, statut terminal |
| Domaine | `api/src/Packages/PromptPackageRepository.php` — `findPublished` ; `api/src/Referentiel/ReferentielRepository.php` — `latestPublished` | Versions publiées |

## Jeux de tests

### Tests unitaires

| ID | Cible | Vérifie | Fichier |
|---|---|---|---|
| UC-ETA-03-U01 | `CohorteRepository::depositsForRun` | Consentis ayant déposé ; sélection ; `[]` = tous (RG2) | `api/tests/UseCases/Unit/UcEta03PiloterRunMasseTest.php` |
| UC-ETA-03-U02 | `JobQueue::enqueueRun` | Versions figées, un job `queued` par journée, doublon ignoré (RG1, RG3) | idem |
| UC-ETA-03-U03 | `JobQueue::runForEtablissement` | Run étranger ou inexistant → `null` | idem |
| UC-ETA-03-U04 | `JobQueue::runStats` | 6 statuts, coût arrondi, tokens, erreurs (50 max) (RG6) | idem |
| UC-ETA-03-U05 | `JobQueue::cancelRun` | Non terminaux → `cancelled`, terminés intacts ; run fini re-marqué (anomalie figée) | idem |
| UC-ETA-03-U06 | `JobQueue::refreshRunStatus` | `active` / `done` / `failed` ; annulation définitive (RG5) | idem |
| UC-ETA-03-U07 | `latestPublished`, `findPublished` | Référentiel 7.0.0, gabarits du paquet, version inconnue → `null` | idem |
| UC-ETA-03-U08 | `estimateMassRun` | 8 appels/journée, tokens, coût, hors table → `null`, familles locales → 0 | `web/test/usecases/unit/uc-eta-03-piloter-run-masse.test.js` |
| UC-ETA-03-U09 | `fetchRun` | Normalisation du tableau réel | idem |
| UC-ETA-03-U10 | `launchRun`, `cancelRun` | POST + CSRF sur les bonnes routes | idem |
| UC-ETA-03-U11 | `fetchPublishedPackages` | Liste réelle filtrée | idem |
| UC-ETA-03-U12 | `JOB_STATUS_LABELS`, `EXTRACTION_CALLS_PER_DAY`, `POLL_INTERVAL_MS`, `SERVICE_MODEL` | Six statuts libellés, 8 appels, 5 s, modèle de référence | idem |

### Tests fonctionnels

| ID | Scénario | Niveau | Vérifie | Fichier |
|---|---|---|---|---|
| UC-ETA-03-F01 | Nominal | API | `201`, audit, tableau initial, progression par ticks, `done` + `finishedAt`, coût = dépense | `api/tests/UseCases/Functional/UcEta03PiloterRunMasseTest.php` |
| UC-ETA-03-F02 | A1 | API | Seul le membre choisi est enfilé | idem |
| UC-ETA-03-F03 | A2, E4 | API | Non-déposant et partant ignorés ; sélection sans déposant → `422` | idem |
| UC-ETA-03-F04 | A3 | API | Tableau `budget_exceeded`, déjà-produit conservé, reprise après hausse | idem |
| UC-ETA-03-F05 | A4 | API | `200 {id, status}`, jobs annulés, produit gardé, plus d'appel, audit | idem |
| UC-ETA-03-F06 | A5 | API | Run `failed`, erreur (3 tentatives) sans contenu | idem |
| UC-ETA-03-F07 | A6 | API | Sans configuration : jobs non réservés, traités après configuration | idem |
| UC-ETA-03-F08 | E1 | API | Paquet absent/vide, `membres` mal formé → `422 fields` | idem |
| UC-ETA-03-F09 | E2 | API | Version non publiée, paquet sans kairos → `422` explicite | idem |
| UC-ETA-03-F10 | E3 | API | `409 Aucun référentiel publié` | idem |
| UC-ETA-03-F11 | E4 | API | Aucun déposant → `422`, aucun run | idem |
| UC-ETA-03-F12 | E5 | API | Étranger et inexistant → `404` homogènes, run intact | idem |
| UC-ETA-03-F13 | E6 | API | `401`/`403`, CSRF absent → `403` | idem |
| UC-ETA-03-F14 | RG3 | API | Nouveau référentiel publié : ancien run figé en 7.0.0, nouveau en 7.1.0, tous deux traités | idem |
| UC-ETA-03-F15 | Anomalies | API | `membres: []` = tous ; annuler un run `done` le marque `cancelled` (comportement actuel) | idem |
| UC-ETA-03-F16 | Nominal | IHM | `<App/>` : cases par défaut, estimation (40 appels), POST (CSRF), polling 5 s jusqu'à `done` | `web/test/usecases/functional/uc-eta-03-piloter-run-masse.test.jsx` |
| UC-ETA-03-F17 | A1 | IHM | Décocher → estimation effacée ; POST avec `membres` | idem |
| UC-ETA-03-F18 | A3, A4, A5 | IHM | Alerte budget, erreurs par membre, annulation puis tableau `cancelled` | idem |
| UC-ETA-03-F19 | E0 | IHM | Pas de paquet ; aucun membre coché → refus local | idem |
| UC-ETA-03-F20 | E2-E4 | IHM | `422`/`409` affichés, pas de suivi démarré | idem |
| UC-ETA-03-F21 | A7 | IHM | Dépassement du budget restant averti ; modèle hors table → « inconnu » | idem |

### Tests existants liés (non-régression)

- `api/tests/EtablissementRunsTest.php` — enfilage, refus d'enfilage, annulation d'un run étranger.
- `api/tests/MasseDoDTest.php` — DoD P11 : 20 portfolios, interruption/reprise sans double appel, plafond abaissé puis relevé, annulation, échecs.
- `web/src/views/EtablissementView.test.jsx` — estimation puis lancement, avancement, annulation, alerte budget (vue isolée).
- `engine/src/providers/estimate.test.js` — table de prix du moteur.

### Exécuter

```sh
docker compose run --rm php vendor/bin/phpunit --filter UcEta03 --testdox
cd web && npx vitest run test/usecases/unit/uc-eta-03 test/usecases/functional/uc-eta-03
```

## Anomalies constatées

- **`membres: []` vaut « tous les déposants »** : `depositsForRun` n'applique
  le filtre que si la liste est non vide ; un client API qui envoie une liste
  vide pensant « aucun membre » enfile toute la cohorte (et engage la dépense
  correspondante). Le site n'envoie jamais `[]` (refus local E0). Figé par
  UC-ETA-03-U01 et F15.
- **Un run terminé peut être « annulé »** : `cancelRun` met le run à
  `cancelled` sans condition sur son statut ; un run `done`/`failed` annulé
  change de statut, `finishedAt` est réécrit et `mass_run_cancelled` est
  journalisé alors que rien n'a été annulé. Le site masque le bouton hors run
  actif, mais l'API l'accepte. Figé par UC-ETA-03-U05 et F15.
- **« Relancez » après un arrêt budgétaire** : l'alerte du tableau (« Montez
  le plafond dans la configuration puis relancez pour les réactiver ») et le
  guide établissement (chapitre 4, §6) invitent à relancer un run, alors que la
  hausse du plafond suffit à réactiver les jobs du run existant (UC-ETA-02, A3).
  Un nouveau run ré-enfile **toutes** les journées des déposants, y compris
  celles déjà produites : double traitement et double dépense.

## Limites

- Les erreurs du tableau montrent l'**identifiant** du membre (`userId`), pas
  son nom : l'API ne renvoie pas `displayName` et `fetchRun` retombe sur
  `String(userId)`.
- L'API des paquets ne porte pas de marqueur « défaut » : l'IHM présélectionne
  le premier paquet de la liste (tri par slug puis date de publication, donc la
  plus ancienne version) et n'affiche jamais « (défaut) ».
- Le modèle de l'estimation (`claude-sonnet-5` à défaut de modèle configuré)
  peut différer du modèle facturé par le worker (`WORKER_MODEL`, défaut
  `claude-sonnet-4-5`) — même famille tarifaire ; les modèles locaux `llama`,
  `mistral`, `qwen` sont estimés à `0.00 $`, pas « inconnu ».
- Un run lancé sans configuration (A6) attend silencieusement : aucun message
  n'explique pourquoi rien n'avance.
- Le polling continue toutes les 5 s tant que la page reste ouverte, même
  après la fin du run.
- Le référentiel du run n'est pas choisi par l'établissement : c'est la
  dernière version publiée de `respire`.
