# UC-ETA-01 — Créer et gérer une cohorte

| Champ | Valeur |
|---|---|
| **Acteur principal** | Établissement de formation (compte portant le rôle `etablissement`) |
| **Acteurs secondaires** | Apprenants (rejoignent la cohorte par son code avec consentement explicite puis déposent leur portfolio — UC-APP-08) |
| **Portée** | humanome.xyz — espace `#/etablissement` et API `/api/etablissement/cohortes*` |
| **Niveau** | Objectif utilisateur |
| **Cahier des charges** | §3.7 (cartographie en masse des classes), §4.9 (module établissement B2B), §6 (RGPD : consentement, purge), docs/plan-masse.md §6-7, docs/autorisations.md (P11) |
| **Statut** | Implémenté (P11 / M8) |

## Objectif

Permettre à un établissement de créer le **contenant** d'une classe (la
cohorte), d'en obtenir le **code d'invitation** à transmettre aux apprenants,
puis de suivre, membre par membre, où en est chacun (consentement, dépôt du
portfolio, avancement des traitements) — sans jamais voir le contenu déposé —
et de supprimer la cohorte quand elle n'a plus lieu d'être.

## Déclencheur

L'établissement ouvre l'accueil de son espace (`#/etablissement`, section
« Mes cohortes ») pour créer une cohorte, ou la page d'une cohorte
(`#/etablissement/cohorte/<id>`) pour en suivre les membres.

## Préconditions

- Le compte est connecté et porte le rôle `etablissement` (attribué par
  l'administration, UC-ADM-01).
- Pour suivre des membres : des apprenants ont rejoint la cohorte avec le code
  (consentement explicite) et, le cas échéant, déposé leur portfolio (UC-APP-08).

## Garanties en cas de succès

- La cohorte existe, rattachée à l'établissement, avec un code d'invitation
  unique de 10 caractères.
- L'établissement voit la liste de SES cohortes (nombre de membres) et, pour
  chacune, ses membres : nom affiché, date du consentement, description du
  dépôt (titre, nombre de journées, taille, date) et avancement
  (journées extraites / total) — **jamais** le texte du portfolio.
- Après suppression : purge réelle de la cohorte et de tout ce qui en dépend
  (adhésions, portfolios déposés, runs, jobs).

## Garanties minimales (en cas d'échec)

- Aucune cohorte n'est créée ni supprimée.
- Une cohorte d'un autre établissement est indiscernable d'une cohorte
  inexistante (même `404`, même corps).

## Scénario nominal

1. L'établissement ouvre `#/etablissement`. La vue vérifie la session
   (`GET /api/auth/me`, qui fournit aussi le jeton CSRF) puis charge en
   parallèle ses cohortes (`GET /api/etablissement/cohortes`) et sa
   configuration (UC-ETA-02).
2. Le tableau « Mes cohortes » s'affiche (nom, code d'invitation, membres, date
   de création, actions), ou « Aucune cohorte pour l'instant ».
3. L'établissement saisit un nom (« Nom de la cohorte ») et clique sur
   « Créer la cohorte » ; le navigateur envoie
   `POST /api/etablissement/cohortes {nom}` (nom nettoyé des espaces, en-tête
   `X-CSRF-Token`).
4. Le serveur vérifie le rôle, le jeton CSRF et le nom (1 à 190 caractères
   après `trim`), génère un code de 10 caractères dans l'alphabet
   `A-Z` + `2-9` (jusqu'à 5 tentatives de tirage en cas de collision sur la
   clé unique, soit 4 reprises ; au-delà, l'erreur SQL remonte et la route
   répond `500 {error: "Erreur interne"}`) et répond `201 {id, codeInvitation}`.
5. Le site affiche « Cohorte « … » créée. Code d'invitation à transmettre aux
   apprenants : … » et recharge le tableau (0 membre).
6. L'établissement transmet le code ; les apprenants rejoignent la cohorte avec
   leur consentement explicite puis déposent leur portfolio (UC-APP-08).
7. L'établissement ouvre la cohorte (`#/etablissement/cohorte/<id>`) :
   `GET /api/etablissement/cohortes/{id}` renvoie `{id, nom, codeInvitation,
   createdAt, consentement, membres}` ; chaque membre porte `userId`,
   `displayName`, `consentAt`, `portfolioDepose`, `portfolio {titre, journees,
   taille, deposeLe}` (ou `null`) et `avancement {jobsTotal, jobsDone}` agrégé
   sur tous les runs de la cohorte. En parallèle (même `Promise.all`), le site
   charge la configuration (`GET /api/etablissement/config`) et les paquets
   publiés (`GET /api/prompt-packages`) pour le bloc de lancement de run
   (UC-ETA-03) : l'échec de l'un des trois appels masque aussi les membres
   (voir Anomalies). Le site affiche le code rappelé et le tableau « Membres »
   (badge « Consenti le … », « « titre » — N journée(s), déposé le … » ou
   « Non déposé », « x/y journées », ou « — » tant qu'aucun job n'existe pour
   le membre) ; une cohorte sans membre affiche « Aucun membre : transmettez
   le code d'invitation à vos apprenants. ».

## Scénarios alternatifs

- **A1 — Supprimer la cohorte** (étape 2) : dans « Mes cohortes », un premier
  clic sur « Supprimer » **arme** l'action (le bouton devient « Confirmer la
  suppression »), un second clic envoie `DELETE /api/etablissement/cohortes/{id}`
  → `204`. La base purge par clés étrangères les adhésions, portfolios
  déposés, runs et jobs de la cohorte ; le tableau est rechargé.
- **A2 — Plusieurs cohortes** (étape 3) : chaque cohorte reçoit son propre
  code ; l'apprenant rejoint celle dont il saisit le code (saisie en
  minuscules acceptée : `strtoupper` côté serveur, la colonne
  `utf8mb4_unicode_ci` étant de toute façon insensible à la casse) ; la liste
  est triée par identifiant (ordre de création, pas ordre alphabétique),
  chacune avec son compte de membres.

## Scénarios d'erreur

- **E0 — Nom vide côté site** (étape 3) : le site refuse sans requête
  (« Donnez un nom à la cohorte (ex. « BTS SIO 2026 »). »).
- **E1 — Nom invalide** (étape 4) : nom absent, non textuel, vide après
  `trim` ou de plus de 190 caractères → `422 {error: "Validation échouée",
  fields: {nom}}` ; le site affiche « Validation échouée » (le détail
  `fields.nom`, « Nom requis (190 caractères maximum) », n'est pas affiché).
- **E2 — Cohorte inconnue ou d'un autre établissement** (étapes 7, A1) :
  `GET` et `DELETE` → `404 {error: "Cohorte introuvable"}`, identique pour les
  deux cas ; le site affiche « Cohorte introuvable » ; ni nom, ni code, ni
  membre ne sont affichés, mais la page présente l'état « Aucun membre :
  transmettez le code… » et le bloc de lancement de run (voir Anomalies).
- **E3 — Pas le rôle** (étape 1) : sans session → `401` ; compte sans rôle
  `etablissement` → `403` ; le site remplace l'espace par « Cet espace est
  réservé aux établissements de formation » (et invite à se connecter).
- **E4 — Jeton CSRF absent ou faux** (étapes 3, A1) : `403 {error: "Jeton
  CSRF absent ou invalide"}`, aucun effet.
- **E5 — API injoignable (copie statique)** (étape 1) : `GET /api/auth/me`
  échoue au niveau réseau ou ne renvoie pas de JSON → le site affiche « Copie
  statique du site : l'espace établissement a besoin de l'API… » à la place
  de l'espace, sans autre appel.

## Règles de gestion

- **RG1** — Le code d'invitation fait 10 caractères de l'alphabet
  `ABCDEFGHIJKLMNOPQRSTUVWXYZ23456789` (ni `0` ni `1`) ; son unicité est
  garantie par la clé `uq_cohortes_code`, avec au plus 5 tentatives de tirage.
- **RG2** — Cloisonnement : « sa cohorte » = `cohortes.etablissement_id` égal
  à l'utilisateur de la session ; tout identifiant étranger répond le même
  `404` qu'un identifiant inexistant (pas d'oracle d'existence).
- **RG3** — Le suivi des membres ne transporte **aucun contenu** déposé : le
  détail du dépôt se limite à titre, nombre de journées, taille en caractères
  et date.
- **RG4** — L'adhésion **est** le consentement (`cohorte_membres.consent_at`
  non nul) ; l'avancement d'un membre ne compte que les jobs des runs de CETTE
  cohorte.
- **RG5** — La suppression est une purge réelle (cascade SQL de la migration
  009) ; côté site elle exige deux clics.

## Données et RGPD

| Donnée | Traitement |
|---|---|
| Nom de cohorte, code d'invitation | Table `cohortes`, propriété de l'établissement (purgée avec son compte) |
| Consentement de l'apprenant | `cohorte_membres.consent_at` (horodatage seul) |
| Portfolio déposé | Jamais exposé à l'établissement par ce cas ; description uniquement (titre, journées, taille, date) |
| Suppression de cohorte | Purge en cascade : adhésions, dépôts, runs, jobs (documents produits inclus — voir Anomalies) |

## Code sollicité

| Couche | Élément | Rôle |
|---|---|---|
| Front | `web/src/router.js` — `parseHash` | Routes `#/etablissement` et `#/etablissement/cohorte/<id>` |
| Front | `web/src/api/client.js` — `apiFetch`, `fetchMe` | Jeton CSRF gardé en mémoire depuis `GET /api/auth/me`, message d'erreur serveur (`data.error`) affiché, `ApiUnavailableError` (E5) |
| Front | `web/src/views/EtablissementView.jsx` | Garde de rôle (session), copie statique, aiguillage des sections, section inconnue |
| Front | `web/src/views/etablissement/AccueilSection.jsx` | Création (nom nettoyé, refus du nom vide), code affiché, tableau, suppression en deux temps armée par ligne |
| Front | `web/src/views/etablissement/CohorteSection.jsx` | Détail : code rappelé, tableau des membres (« — », « Non déposé », badges), message de chargement |
| Front | `web/src/views/etablissement/etablissement-api.js` — `fetchCohortes`, `createCohorte`, `fetchCohorte` (normalisation des membres), `deleteCohorte`, `frDate` | Appels HTTP et formes normalisées |
| API | `api/src/routes/etablissement.php` — `POST/GET /api/etablissement/cohortes`, `GET/DELETE /api/etablissement/cohortes/{id}` | Orchestration, validation, codes HTTP |
| API | `api/src/Middleware/RequireRole.php`, `CsrfMiddleware.php` | Rôle `etablissement`, double-soumission CSRF |
| Domaine | `api/src/Etablissement/CohorteRepository.php` — `create` (+ `randomCode`), `listForEtablissement`, `findForEtablissement`, `membersOf`, `deleteForEtablissement` | Code d'invitation, cloisonnement, projection des membres, purge |
| Données | `scripts/migrations/009_etablissements_masse.sql` | Clés uniques et cascades |

## Jeux de tests

### Tests unitaires

| ID | Cible | Vérifie | Fichier |
|---|---|---|---|
| UC-ETA-01-U01 | `CohorteRepository::create` | Code 10 caractères `A-Z2-9`, unique sur 25 créations, stocké tel quel | `api/tests/UseCases/Unit/UcEta01GererCohorteTest.php` |
| UC-ETA-01-U02 | `CohorteRepository::create` | Collision 1062 retentée (≤ 5 tentatives), autre erreur SQL remontée aussitôt (RG1) | idem |
| UC-ETA-01-U03 | `CohorteRepository::listForEtablissement` | Ses cohortes seulement, ordre par id, compte de membres, dates ISO | idem |
| UC-ETA-01-U04 | `CohorteRepository::findForEtablissement` | Cohorte étrangère ou inexistante → `null` (RG2) | idem |
| UC-ETA-01-U05 | `CohorteRepository::membersOf` | Consentement daté, dépôt sans contenu, avancement limité à la cohorte (RG3, RG4) | idem |
| UC-ETA-01-U06 | `CohorteRepository::deleteForEtablissement` | Refus hors propriétaire ; purge en cascade (RG5) | idem |
| UC-ETA-01-U07 | `parseHash` | `#/etablissement` et `#/etablissement/cohorte/<id>` | `web/test/usecases/unit/uc-eta-01-gerer-cohorte.test.js` |
| UC-ETA-01-U08 | `fetchCohortes` | Liste nue de l'API (et enveloppe tolérée) | idem |
| UC-ETA-01-U09 | `createCohorte` | `POST {nom}` JSON avec `X-CSRF-Token` | idem |
| UC-ETA-01-U10 | `fetchCohorte` | Normalisation du détail à plat (membres, dépôt, avancement non nul, replis `jobs_total`/`jobs_done`, avancement absent → `null`, taille 0 → `null`) | idem |
| UC-ETA-01-U11 | `deleteCohorte` | `DELETE` avec CSRF, `204` → `null`, `404` → erreur typée | idem |
| UC-ETA-01-U12 | `frDate` | Date ISO → `jj/mm/aaaa`, vide → `—` | idem |
| UC-ETA-01-U13 | `EtablissementView` (isolée, `deps.fetchMeFn`) | Rôle établissement → accueil ; autre rôle → espace réservé sans invitation ; visiteur → invitation à se connecter ; `ApiUnavailableError` → copie statique ; section inconnue → alerte | idem |
| UC-ETA-01-U14 | `AccueilSection` (isolée, `fetchFn`) | Nom nettoyé envoyé, nom vide refusé sans appel, premier clic arme la ligne sans `DELETE`, armer une autre ligne désarme la première | idem |
| UC-ETA-01-U15 | `CohorteSection` (isolée, `fetchFn`) | « — » sans job, « x/y journées », « Non déposé », badge « Sans consentement » (forme non produite par l'API), `404` affiché sans code | idem |

### Tests fonctionnels

| ID | Scénario | Niveau | Vérifie | Fichier |
|---|---|---|---|---|
| UC-ETA-01-F01 | Nominal | API | `201` + code, liste, détail des membres (consentement, dépôt, avancement 1/2) sans contenu | `api/tests/UseCases/Functional/UcEta01GererCohorteTest.php` |
| UC-ETA-01-F02 | A1 | API | `204`, `404` ensuite, purge des 5 tables, l'apprenant n'est plus membre | idem |
| UC-ETA-01-F03 | E1 | API | Nom absent/vide/non textuel/191 caractères → `422 fields.nom` ; 190 acceptés | idem |
| UC-ETA-01-F04 | E2 | API | Étranger et inexistant → même `404`, rien supprimé | idem |
| UC-ETA-01-F05 | E3 | API | `401` visiteur, `403` apprenant sur les 4 routes | idem |
| UC-ETA-01-F06 | E4 | API | Mutations sans/avec faux CSRF → `403`, aucun effet | idem |
| UC-ETA-01-F07 | A2 | API | Codes distincts, jointure par code (minuscules), liste triée par identifiant et non par nom, comptes par cohorte | idem |
| UC-ETA-01-F08 | Nominal | IHM | `<App/>` : création (CSRF), code affiché, liste rechargée, détail des membres | `web/test/usecases/functional/uc-eta-01-gerer-cohorte.test.jsx` |
| UC-ETA-01-F09 | A1 | IHM | Suppression en deux temps puis liste vide | idem |
| UC-ETA-01-F10 | E0, E1 | IHM | Nom vide refusé sans requête ; `422` serveur affiché (« Validation échouée », sans le détail `fields.nom`) | idem |
| UC-ETA-01-F11 | E2 | IHM | `404` → « Cohorte introuvable », ni code ni tableau ; état « Aucun membre… » affiché (comportement actuel) | idem |
| UC-ETA-01-F12 | E3 | IHM | Apprenant et visiteur → espace réservé, aucun appel `api/etablissement/*` | idem |
| UC-ETA-01-F13 | Anomalies | IHM | Configuration ou paquets en `500` : alerte, mais « Aucune cohorte pour l'instant » / « Aucun membre… » affichés alors que des données existent (comportement actuel) | idem |
| UC-ETA-01-F14 | E5 | IHM | API injoignable → « Copie statique du site… », aucun appel `api/etablissement/*` | idem |

### Tests existants liés (non-régression)

- `api/tests/EtablissementCohortesTest.php` — gardes de rôle, cycle de cohorte, consentement à la jointure, dépôt, quitter et cascade.
- `api/tests/MasseRgpdPurgeTest.php` — purge des comptes établissement/apprenant, cloisonnement des documents.
- `web/src/views/EtablissementView.test.jsx` — garde de rôle, création, tableau des membres (vue isolée).
- `api/tests/UseCases/Unit/UcAdm01GererComptesRolesTest.php` — UC-ADM-01-U10 : `RequireRole` (401 sans session, 403 sans rôle, rôles relus à chaque requête).
- `api/tests/UseCases/Unit/UcCpt02SeConnecterDeconnecterTest.php` — UC-CPT-02-U07 : `CsrfMiddleware` (jeton absent ou faux → 403).

### Exécuter

```sh
docker compose run --rm php vendor/bin/phpunit --filter UcEta01 --testdox
cd web && npx vitest run test/usecases/unit/uc-eta-01 test/usecases/functional/uc-eta-01
```

## Anomalies constatées

- **Incohérence de spécification (à arbitrer) : supprimer une cohorte efface
  les documents de l'apprenant.** Le code applique fidèlement la cascade
  voulue et documentée : runs en cascade sur la cohorte
  (`fk_mass_runs_cohorte`, migration 009 : « mass_runs: … CASCADE on both the
  establishment and the cohorte »), jobs en cascade sur les runs
  (`fk_mass_jobs_run`), « purge réelle en cascade (membres, dépôts, runs,
  jobs) » (docs/autorisations.md), « tout l'arbre » (plan-masse §6, « Purge
  par FK »). Mais cette cascade efface aussi les documents `cartographie-jour`
  déjà produits pour les membres, y compris la copie que l'apprenant récupère
  par `GET /api/mes-documents-masse` ; or plan-masse §6 pose, pour le départ
  d'un membre, que les cartographies déjà produites « restent à l'apprenant »
  et « suivent le cycle de vie de SON compte » (principe repris par la même
  migration : « the produced day-documents belong to the LEARNER »). Les deux
  règles ne peuvent pas valoir ensemble ; UC-ETA-01-F02 fige le comportement
  actuel.
- **États vides trompeurs après une erreur de chargement.** L'accueil charge
  cohortes et configuration dans un même `Promise.all`, la page cohorte
  détail, configuration et paquets publiés de même ; à l'échec de l'un des
  appels, le composant pose une liste vide (`current ?? []`) : à côté du
  message d'erreur, l'accueil affiche « Aucune cohorte pour l'instant :
  créez-en une ci-dessus. » alors que des cohortes existent, et la page
  cohorte « Aucun membre : transmettez le code d'invitation… » et « Aucun
  paquet de prompts publié n'est disponible » (même sur une cohorte en `404`,
  E2). Figé par UC-ETA-01-F11 et F13.
- **Pas de trace d'audit** : ni la création ni la suppression d'une cohorte
  (qui purge des données d'apprenants) n'enregistrent d'événement dans
  `audit_events`, contrairement à la jointure, au dépôt et au lancement de run.

## Limites

- Le badge « Sans consentement » de la page cohorte n'est jamais affiché :
  l'adhésion est elle-même le consentement (`consent_at` non nul) ; seul le
  test unitaire UC-ETA-01-U15 l'exerce, avec une forme que l'API ne produit
  pas.
- Le nom de cohorte n'est pas modifiable après création (aucune route).
