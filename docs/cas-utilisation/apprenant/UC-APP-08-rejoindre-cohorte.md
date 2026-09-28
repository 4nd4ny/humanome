# UC-APP-08 — Rejoindre une cohorte, déposer son portfolio, quitter

| Champ | Valeur |
|---|---|
| **Acteur principal** | Apprenant (compte actif, rôle `apprenant`) |
| **Acteurs secondaires** | Établissement (émet le code, lance les runs et lit les documents produits : UC-ETA-01, UC-ETA-03, UC-ETA-04) ; système (file de jobs, UC-SYS-01) |
| **Portée** | humanome.xyz — espace apprenant `#/espace/cohortes` (« Mes cohortes ») ; API `/api/cohortes…`, `/api/mes-documents-masse` |
| **Niveau** | Objectif utilisateur |
| **Cahier des charges** | §3.7 (cartographie de masse, accès aux cartographies de ses élèves), §4.9, §6.1 et §6.2 (le portfolio ne quitte le navigateur que sur décision explicite), §6.3, §6.5 ; `docs/plan-masse.md` §6-7 |
| **Statut** | Implémenté (P11 / contrat M8) |

## Objectif

Permettre à l'apprenant de participer, **par deux consentements explicites et
révocables**, à la cartographie de masse organisée par son établissement :
**rejoindre** la cohorte (l'établissement verra les cartographies produites
dans ce cadre), puis **déposer** son portfolio (seule exception au principe
« le portfolio ne quitte jamais le navigateur »), et **quitter** à tout moment
(retrait du consentement pour la suite, les documents déjà produits restant à
lui).

## Déclencheur

L'apprenant a reçu de son établissement un **code d'invitation** et ouvre
« Mes cohortes » (bouton « Gérer mes cohortes » du tableau de bord `#/espace`).

## Préconditions

- L'établissement a créé la cohorte et diffusé son code de 10 caractères
  (UC-ETA-01).
- Compte activé, session ouverte, rôle `apprenant` (UC-CPT-01, UC-CPT-02).
- Pour déposer : au moins un portfolio local segmenté par journées
  (UC-APP-01).

## Garanties en cas de succès

- L'adhésion `cohorte_membres` existe avec `consent_at` : la ligne **est** le
  consentement daté ; l'événement `cohorte_joined {cohorteId}` est journalisé.
- Le portfolio déposé est stocké dans `cohorte_portfolios` (un dépôt par
  cohorte et par membre) ; l'événement `cohorte_portfolio_deposited
  {cohorteId, segments}` ne contient que des compteurs. Seuls les membres
  **ayant déposé** sont enfilés par les runs de l'établissement.
- Après départ : adhésion et dépôt purgés, jobs non terminés annulés,
  établissement privé d'accès ; les documents déjà produits restent
  accessibles à l'apprenant (`/api/mes-documents-masse`, export d'archive).

## Garanties minimales (en cas d'échec)

- Aucune adhésion sans `{"consentement": true}` ; aucun dépôt hors adhésion.
- Le code d'invitation n'est jamais renvoyé dans « Mes cohortes » ; le texte
  du portfolio n'est jamais exposé à l'établissement ni journalisé.

## Scénario nominal

1. L'apprenant ouvre `#/espace/cohortes`. La vue vérifie la session (`GET
   /api/auth/me`, jeton CSRF gardé en mémoire) puis charge ses adhésions
   (`GET /api/cohortes`) : « Vous n’avez rejoint aucune cohorte pour
   l’instant. »
2. Il saisit le code (mis en majuscules à la saisie). Le texte de
   consentement (« … l’établissement verra les cartographies produites dans ce
   cadre (et uniquement celles-là)… ») est affiché **avant** le bouton
   « Rejoindre la cohorte », inactif tant que la case « Je donne mon
   consentement explicite… » n'est pas cochée.
3. Il coche la case et valide : `POST /api/cohortes/{CODE}/rejoindre`
   `{"consentement": true}` avec `X-CSRF-Token`.
4. Le serveur vérifie session, rôle et CSRF, exige `consentement === true`,
   résout le code (rogné, majuscules), crée l'adhésion (`consent_at = NOW()`),
   journalise `cohorte_joined` et répond `201 {cohorteId, nom, consentement}`.
5. Le navigateur affiche « Cohorte rejointe : votre consentement est
   enregistré… », vide le code, décoche la case et recharge la liste :
   « *nom* — *établissement* (rejointe le JJ/MM/AAAA) · Portfolio non
   déposé », avec le formulaire de dépôt et l'avertissement « Le dépôt
   **envoie ce portfolio au serveur** … c’est l’exception explicite … Il est
   supprimé avec votre compte ».
6. Il choisit un portfolio local (titre, nombre de journées) et clique
   « Déposer dans la cohorte » : le navigateur relit le portfolio local et
   envoie `POST /api/cohortes/{id}/portfolio` `{titre, texte, segments}` avec
   `X-CSRF-Token`.
7. Le serveur vérifie l'adhésion, valide le dépôt (RG4, RG5), enregistre
   `{date, texte}` par journée, journalise `cohorte_portfolio_deposited` et
   répond `201 {id, segments}`.
8. Le navigateur affiche « Portfolio « *titre* » déposé dans la cohorte
   « *nom* ». » et le badge « Portfolio déposé ».
9. La suite ne dépend plus de l'apprenant : l'établissement lance des runs sur
   les déposants (UC-ETA-03), la file les traite (UC-SYS-01), l'établissement
   lit les documents tant que l'adhésion est active (UC-ETA-04).

## Scénarios alternatifs

- **A1 — Re-jointure** (étape 4) : déjà membre → `200` (même corps), le
  consentement **d'origine** est conservé, pas de nouvel audit ; l'IHM affiche
  le même message.
- **A2 — Re-dépôt** (étape 7, API) : un nouveau dépôt **remplace** tout le
  précédent (même `id`, titre, texte et segments) ; chaque dépôt est journalisé.
  L'IHM ne le propose pas (voir Limites).
- **A3 — Code en minuscules ou avec espaces de bord** (étapes 2-4) : le
  navigateur rogne et met en majuscules ; le serveur normalise aussi.
- **A4 — Quitter la cohorte** (après l'étape 5 ou 8) : « Quitter la cohorte »
  s'arme, « Confirmer le départ » envoie `DELETE
  /api/cohortes/{id}/quitter` : les jobs `queued`, `running` et
  `budget_exceeded` de l'apprenant dans cette cohorte passent `cancelled`, le
  dépôt et l'adhésion sont purgés, `cohorte_quit {cohorteId}` est journalisé,
  réponse `204`. Les documents `done` restent (source détachée,
  `portfolio_id` NULL) mais l'établissement n'y accède plus (`404`). L'IHM
  affiche « Vous avez quitté la cohorte « *nom* » : votre consentement est
  retiré pour la suite. Les cartographies déjà produites dans ce cadre restent
  à vous. » Revenir = nouvelle jointure, nouveau consentement.
- **A5 — Récupérer ses documents de masse** : `GET /api/mes-documents-masse`
  → `{documents: [{jobId, runId, cohorteId, cohorte, date, promptPackage,
  referentiel, document}]}` — jobs `done` du compte seulement, toutes
  cohortes, **même après départ** (RGPD art. 15/20). Côté IHM, ils sont
  intégrés à l'export d'archive (UC-APP-06).
- **A6 — Aucun portfolio local** (étape 5) : lien « créez d’abord un
  portfolio » vers `#/portfolio`, pas de bouton de dépôt.
- **A7 — Visiteur non connecté** (étape 1) : « Rejoindre une cohorte
  d’établissement nécessite un compte : connectez-vous… » ; ni formulaire ni
  appel aux cohortes.

## Scénarios d'erreur

- **E1 — Consentement absent** (étapes 3-4) : dans l'IHM, le bouton reste
  inactif ; un code vide est refusé localement (« Saisissez le code
  d’invitation transmis par votre établissement. »). Côté API, tout corps où
  `consentement` n'est pas le booléen `true` (absent, `false`, `"oui"`, `1`,
  `"true"`) → `422 {"error": "Consentement explicite requis", "consentement":
  "<texte>"}`, contrôlé **avant** le code.
- **E2 — Code inconnu** (étape 4) : `404 {"error": "Cohorte introuvable"}`,
  message affiché.
- **E3 — Code mal formé** (étape 4) : autre chose que 10 caractères
  alphanumériques → aucune route ne correspond, `404 {"message": "404 Not
  Found"}` (réponse générique de Slim) ; l'IHM affiche « 404 Not Found »
  (anomalie 1).
- **E4 — Dépôt hors adhésion** (étape 7) : pas membre, cohorte d'un autre
  établissement ou inconnue → `404 {"error": "Cohorte introuvable"}`.
- **E5 — Portfolio invalide** (étape 7) : `422 {"error": "Validation
  échouée", "fields": {…}}` — titre vide ou > 190 caractères, `texte` non
  chaîne, `segments` absent, vide, non liste ou > 366, segment sans date
  `AAAA-MM-JJ` (y compris une journée non datée, `date: null`) ou à texte
  vide, date en double (« date en double dans les segments : … »), total >
  4 Mo (« Portfolio trop volumineux (4 Mo maximum) ») ; l'IHM affiche le
  message, rien n'est stocké.
- **E6 — Quitter sans être membre** (A4) : `404 {"error": "Cohorte
  introuvable"}`.
- **E7 — Session, CSRF, rôle** : sans session `401` sur les cinq routes ;
  sans jeton CSRF `403` sur les mutations ; compte sans rôle `apprenant` (ex.
  établissement) `403`.

## Règles de gestion

- **RG1** — Double consentement (plan-masse §6) : l'adhésion exige le
  booléen `true` dans le corps **et** le texte affiché ; le dépôt est
  l'opt-in de fait au traitement serveur (seuls les déposants sont enfilés).
- **RG2** — Adhésion idempotente : `INSERT IGNORE`, `consent_at` d'origine
  conservé.
- **RG3** — Code : 10 caractères alphanumériques dans l'URL, comparés en
  majuscules après rognage ; jamais renvoyé à l'apprenant dans « Mes
  cohortes ».
- **RG4** — Dépôt : titre rogné 1..190 ; `texte` facultatif (chaîne) ;
  `segments` = liste de 1 à 366 `{date: AAAA-MM-JJ, texte non vide}` aux dates
  uniques ; seuls `date` et `texte` sont conservés ; taille (segments JSON +
  texte) ≤ 4 Mo.
- **RG5** — Un dépôt par (cohorte, membre) ; le re-dépôt remplace.
- **RG6** — Départ : annulation des jobs non terminaux de ce membre dans cette
  cohorte, purge du dépôt et de l'adhésion ; les documents produits
  appartiennent à l'apprenant (purgés avec son compte seulement).
- **RG7** — L'établissement ne lit les documents d'un membre que si
  l'adhésion est active (UC-ETA-04) ; l'apprenant lit toujours les siens.
- **RG8** — Journal : `cohorte_joined`, `cohorte_portfolio_deposited`
  (compteur de segments), `cohorte_quit` — identifiants et compteurs, jamais de
  texte (§6.5).

## Données et RGPD

| Donnée | Traitement |
|---|---|
| Consentement | `cohorte_membres.consent_at` (la ligne = le consentement), supprimée au départ |
| Portfolio déposé | `cohorte_portfolios` : titre, **texte intégral** (facultatif) et segments ; purgé au départ, avec la cohorte ou avec le compte |
| Documents produits | `mass_jobs.document`, propriété de l'apprenant (CASCADE sur son compte) ; accès établissement conditionné à l'adhésion |
| Journal | Identifiants et compteurs seulement |

## Code sollicité

| Couche | Élément | Rôle |
|---|---|---|
| Front | `web/src/views/EspaceView.jsx` (section `cohortes`), `web/src/views/espace/DashboardSection.jsx` (bloc « Mes cohortes ») | Session, point d'entrée |
| Front | `web/src/views/espace/CohorteSection.jsx` — `CONSENT_TEXT`, `fetchMesCohortes`, `submitJoin`, `DepotForm`/`onDeposit`, `onQuit` | Consentement, jointure, dépôt, départ en deux temps |
| Front | `web/src/lib/portfolio-store.js` — `list`, `get` | Portfolio local déposé |
| Front | `web/src/api/client.js` — `apiFetch` | Jeton CSRF, messages d'erreur |
| Front | `web/src/lib/archive.js` — `defaultGetMassDocuments` | Documents de masse dans l'export (UC-APP-06) |
| API | `api/src/routes/etablissement.php` — `GET /api/cohortes`, `POST /api/cohortes/{code}/rejoindre`, `POST /api/cohortes/{id}/portfolio`, `DELETE /api/cohortes/{id}/quitter`, `GET /api/mes-documents-masse` | Consentement, validation, audit |
| API | `api/src/Middleware/RequireRole.php`, `api/src/Middleware/CsrfMiddleware.php` | 401/403 |
| Domaine | `api/src/Etablissement/CohorteRepository.php` — `findByCode`, `join`, `isMember`, `listForLearner`, `depositPortfolio`, `quit`, `depositsForRun`, `segmentText` | Adhésion, dépôt, retrait, effet sur l'enfilement |
| Données | `scripts/migrations/009_etablissements_masse.sql` | Tables, CASCADE / SET NULL |

## Jeux de tests

### Tests unitaires

| ID | Cible | Vérifie | Fichier |
|---|---|---|---|
| UC-APP-08-U01 | `CohorteRepository::findByCode` | Rognage + majuscules, inconnu → `null`, `{id, nom}` seulement (RG3) | `api/tests/UseCases/Unit/UcApp08RejoindreCohorteTest.php` |
| UC-APP-08-U02 | `CohorteRepository::join` | Consentement daté, idempotence, date d'origine conservée (RG2) | idem |
| UC-APP-08-U03 | `CohorteRepository::isMember` | Seulement pour la cohorte rejointe | idem |
| UC-APP-08-U04 | `CohorteRepository::listForLearner` | Ses adhésions, établissement, état du dépôt, jamais le code (RG3) | idem |
| UC-APP-08-U05 | `CohorteRepository::depositPortfolio`, `segmentText` | Re-dépôt = remplacement complet (RG5) | idem |
| UC-APP-08-U06 | `CohorteRepository::quit` | Jobs non terminaux annulés, dépôt et adhésion purgés, `done` conservés, rien d'autre touché (RG6) | idem |
| UC-APP-08-U07 | `CohorteRepository::depositsForRun` | Seuls les déposants sont enfilés ; plus après départ (RG1) | idem |
| UC-APP-08-U08 | `CONSENT_TEXT` | Ce que voit l'établissement, ce qui reste local, effet du départ | `web/test/usecases/unit/uc-app-08-rejoindre-cohorte.test.jsx` |
| UC-APP-08-U09 | `CohorteSection` (isolé) — `fetchMesCohortes` | Forme réelle (tableau) de `GET api/cohortes`, dates, badge, formulaire masqué si déposé | idem |
| UC-APP-08-U10 | `CohorteSection` (isolé) — `submitJoin` | Code vide refusé localement ; code rogné et en majuscules | idem |
| UC-APP-08-U11 | `CohorteSection` (isolé) — `onDeposit` | Portfolio local disparu → message, aucun envoi | idem |

### Tests fonctionnels

| ID | Scénario | Niveau | Vérifie | Fichier |
|---|---|---|---|---|
| UC-APP-08-F01 | Nominal | API | `201` + texte de consentement, audit, liste sans code, dépôt `201 {id, segments}`, audit à compteurs, vue établissement sans texte | `api/tests/UseCases/Functional/UcApp08RejoindreCohorteTest.php` |
| UC-APP-08-F02 | A1 | API | `200`, consentement d'origine, un seul audit | idem |
| UC-APP-08-F03 | A2 | API | Re-dépôt : même dépôt, contenu remplacé | idem |
| UC-APP-08-F04 | A3 | API | Code en minuscules accepté | idem |
| UC-APP-08-F05 | A4 | API | Départ avant production : `204`, audit, purge, établissement aveugle, retour possible | idem |
| UC-APP-08-F06 | A4 | API | Départ après production : `queued` → `cancelled`, `done` gardé, établissement `404`, apprenant garde ses documents | idem |
| UC-APP-08-F07 | A5 | API | `mes-documents-masse` : `done` seulement, clés, versions, cloisonnement | idem |
| UC-APP-08-F08 | E1 | API | Cinq corps sans `true` → `422` + texte ; contrôle avant le code | idem |
| UC-APP-08-F09 | E2, E3 | API | Code inconnu → `404 Cohorte introuvable` ; mal formé → `404 {"message": "404 Not Found"}` | idem |
| UC-APP-08-F10 | E4 | API | Dépôt hors adhésion / étranger / inconnu → `404` | idem |
| UC-APP-08-F11 | E5 | API | Douze dépôts invalides (dont une journée non datée) → `422` champ par champ, rien de stocké | idem |
| UC-APP-08-F12 | E6 | API | Départ sans adhésion → `404`, pas d'audit | idem |
| UC-APP-08-F13 | E7 | API | `401`, `403` CSRF, `403` rôle sur les cinq routes | idem |
| UC-APP-08-F14 | Limite | API | Date inexistante `2026-02-30` acceptée — comportement actuel figé | idem |
| UC-APP-08-F15 | Nominal | IHM | Texte avant bouton, jointure avec CSRF, liste, dépôt du portfolio local, « Portfolio déposé » | `web/test/usecases/functional/uc-app-08-rejoindre-cohorte.test.jsx` |
| UC-APP-08-F16 | A1 | IHM | Re-jointure : même message, une seule cohorte | idem |
| UC-APP-08-F17 | A4 | IHM | Départ en deux temps, DELETE avec CSRF, message, liste vide | idem |
| UC-APP-08-F18 | A6 | IHM | Lien vers `#/portfolio`, pas de dépôt | idem |
| UC-APP-08-F19 | A7 | IHM | Anonyme : invitation à se connecter, aucun appel | idem |
| UC-APP-08-F20 | E1 | IHM | Bouton inactif sans case ; code vide refusé localement | idem |
| UC-APP-08-F21 | E2, E3 | IHM | « Cohorte introuvable » ; code mal formé → « 404 Not Found » (anomalie figée) | idem |
| UC-APP-08-F22 | E5 | IHM | Dépôt refusé : message, toujours « non déposé » | idem |

### Tests existants liés (non-régression)

- `api/tests/EtablissementCohortesTest.php` — gardes de rôle, consentement, re-jointure, dépôt segmenté, départ, purge en cascade.
- `api/tests/MasseLearnerAccessTest.php` — `GET /api/mes-documents-masse` (isolation, `done` seulement, survie au départ).
- `api/tests/MasseRgpdPurgeTest.php` — départ et purge des comptes vs documents produits.
- `web/src/views/espace/CohorteSection.test.jsx` — composant isolé (consentement, jointure, dépôt, départ).
- `web/src/lib/archive.test.js` — documents de masse inclus dans l'export (UC-APP-06).

### Exécuter

```sh
docker compose run --rm php vendor/bin/phpunit --filter UcApp08 --testdox
cd web && npx vitest run test/usecases --testNamePattern UC-APP-08
```

## Anomalies constatées

1. **Code mal formé : message technique en anglais.** Le front ne contrôle
   pas le format du code (10 caractères) ; l'URL ne correspond alors à aucune
   route et Slim répond `404 {"message": "404 Not Found"}`, que la vue affiche
   tel quel au lieu d'un message français. Figé par UC-APP-08-F09 (API) et
   UC-APP-08-F21 (IHM).
2. **Minimisation : le texte intégral du portfolio est déposé et conservé
   sans être traité.** L'IHM envoie `texte` (le portfolio complet, y compris
   ce qui n'appartient à aucune journée) en plus des `segments` ; le serveur le
   stocke, mais ne s'en sert que pour mesurer la taille du dépôt
   (`CohorteRepository::membersOf`) — les runs ne lisent que les segments
   (`segmentText`). Écart au principe de minimisation (RGPD art. 5.1.c).
   Figé par UC-APP-08-F01 et UC-APP-08-F15.

## Limites

- Le contrôle des dates du dépôt est un motif `AAAA-MM-JJ` : une date
  inexistante (`2026-02-30`) est acceptée par l'API (l'éditeur de portfolio,
  lui, refuse ces dates). Figé par UC-APP-08-F14.
- L'IHM envoie **toutes** les journées du portfolio local : une seule journée
  non datée (`date: null`, possible dans l'éditeur) fait refuser tout le dépôt,
  et la vue n'affiche que « Validation échouée », sans le détail du champ
  (`fields.segments`) qui désigne la journée fautive (UC-APP-08-F11,
  UC-APP-08-F22).
- Une fois un portfolio déposé, l'IHM ne propose plus de nouveau dépôt : le
  remplacement (A2) n'est accessible que par l'API (ou départ puis nouvelle
  jointure).
- Les documents de masse ne sont pas affichés dans « Mes cohortes » ; l'IHM
  ne les restitue qu'à travers l'export d'archive (UC-APP-06).
- Le texte de consentement renvoyé par l'API (« En rejoignant cette cohorte,
  vous acceptez que l'établissement voie les cartographies produites dans ce
  cadre. ») diffère du texte, plus complet, affiché par l'IHM
  (`CONSENT_TEXT`) ; seul ce dernier est montré.
