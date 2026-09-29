# UC-PRO-01 — Consulter les paquets de prompts publiés et leurs différences

| Champ | Valeur |
|---|---|
| **Acteur principal** | Promptologue (atelier `#/promptologue`) |
| **Acteurs secondaires** | Tout client de l'API publique : visiteur, lanceur de runs de l'apprenant (UC-APP-02), établissement (UC-ETA-03), administrateur (UC-ADM-03) |
| **Portée** | humanome.xyz — routes publiques `GET /api/prompt-packages`, `/api/prompt-packages/{id}/{version}`, `/api/prompt-packages/default`, `/api/prompt-packages/{id}/diff/{v1}/{v2}` ; accueil « Paquets » de l'atelier et vue de diff de l'éditeur |
| **Niveau** | Objectif utilisateur |
| **Cahier des charges** | §3.4 (« comparer une version de prompt à une autre »), §4.3 (versions de prompts cohabitantes, sélectionnables, comparables), §7 (Golden Prompt privé) |
| **Statut** | Implémenté (P8 lecture, P10 diff et défaut, P12.1 exclusion des paquets privés, D1 paquets réservés) |

## Objectif

Permettre au promptologue — et à tout client de l'API — de connaître les
versions **publiées** (donc immuables et exécutables par autrui) de chaque
paquet de prompts, de lire le document complet d'une version, de savoir quelle
version est désignée **par défaut** (`GET /api/prompt-packages/default`), et de
**comparer** deux versions publiées d'un même paquet par un diff structurel.
En v1, cette désignation n'a pas encore d'effet dans l'assistant de run de
l'apprenant, qui présélectionne toujours le paquet embarqué (UC-APP-02,
anomalie A-01).

## Déclencheur

Le promptologue ouvre l'atelier `#/promptologue` (entrée « Paquets »), ou un
client appelle directement une route de lecture publique.

## Préconditions

- Au moins une version a été publiée : par le promptologue (UC-PRO-03) ou par
  le script de déploiement (`POST /api/admin/import-prompt-package`, UC-SYS-02).
  Le paquet initial `aurora-v3-reconstruit` 1.0.0 est généré depuis les
  gabarits du moteur par `scripts/build-default-prompt-package.mjs`
  (`build/prompt-packages/`, non versionné) puis importé au déploiement.
- Pour l'atelier : une session portant le rôle `promptologue` (les routes de
  lecture, elles, sont publiques).

## Garanties en cas de succès

- Seules les versions **publiées et non privées** sont listées, servies ou
  comparées ; ni un brouillon, ni le Golden Prompt (paquet privé, UC-ADM-02)
  n'apparaissent jamais. La désignation du défaut suit la même règle, mais
  elle est garantie à l'**écriture** du réglage (voir RG2 et limite L2).
- La version marquée **par défaut** est celle que sert
  `GET /api/prompt-packages/default` ; l'assistant de run apprenant ne la
  présélectionne pas (UC-APP-02, anomalie A-01).
- Aucune écriture : la consultation ne modifie rien et n'est pas journalisée.

## Garanties minimales (en cas d'échec)

- Une version inconnue, un brouillon et un paquet privé répondent le **même**
  `404` (pas d'oracle d'existence).
- L'atelier dégrade proprement : liste vide, défaut non marqué ou message
  explicite, jamais d'écran cassé.

## Scénario nominal

1. Le promptologue ouvre `#/promptologue` (route `promptologue`, section nulle).
2. La vue vérifie la session (`GET /api/auth/me`) : elle doit porter le rôle
   `promptologue` (garde de l'IHM ; les lectures restent publiques côté API).
3. L'accueil lance en parallèle `GET /api/prompt-packages`,
   `GET /api/prompt-packages/drafts` (ses brouillons, UC-PRO-02) et
   `GET /api/prompt-packages/default` ; chaque échec est toléré (liste vide,
   pas de défaut).
4. Le serveur renvoie les versions publiées non privées, triées par paquet
   puis par ordre de publication, en **métadonnées** seulement :
   `[{id, version, description, publishedAt, reserved}]` (`publishedAt` au
   format `AAAA-MM-JJTHH:MM:SS`, `description` = celle du paquet).
5. Le serveur résout le paquet par défaut : le réglage
   `default_prompt_package` validé par l'administrateur (UC-ADM-03) s'il porte
   `id` et `version` textuels (servi tel quel, RG2), sinon la version publiée
   non privée la plus récente, **réservée ou non** (anomalie AN-2) ; réponse
   `200 {id, version}`.
6. L'IHM affiche le tableau « Paquets publiés » (Paquet, Version,
   Description, Actions) : la version par défaut porte la mention
   **par défaut** (et n'offre pas « Proposer par défaut », UC-PRO-04), chaque
   ligne offre « Nouvelle version » (UC-PRO-02).
7. Pour lire une version entière, le client appelle
   `GET /api/prompt-packages/{id}/{version}` : `200` et le document
   `prompt-package` complet (prompts, code d'orchestration, changelog…).
8. Pour comparer deux versions publiées du même paquet, le client appelle
   `GET /api/prompt-packages/{id}/diff/{v1}/{v2}` : `200` et le diff
   structurel `{packageId, from:{version}, to:{version}, identical, fields,
   prompts:{added, removed, modified}, code:{entrypoint, orchestration},
   metadata, summary}`. Dans l'atelier, ce diff est obtenu par le bouton
   « Diff contre *version d'origine* » de l'éditeur, une fois la version du
   brouillon publiée (UC-PRO-03), et rendu par `DiffView` en sections
   Champs, Prompts, Code d'orchestration, Métadonnées (lignes `-`/`+`).

## Scénarios alternatifs

- **A1 — Défaut validé par l'administrateur** (étape 5) : le réglage validé
  l'emporte, même si des versions plus récentes ont été publiées depuis ;
  c'est lui qui est marqué **par défaut**.
- **A2 — Paquet réservé** (étapes 4 à 6) : un paquet dont le contenu porte
  `metadata.reserved = true` (pipeline source-unique, ex. `twin6-ouverte`)
  est listé avec `reserved: true` ; l'IHM l'annonce « réservé » et propose
  « Forker (copie) » au lieu de « Nouvelle version » (fork avec renommage,
  UC-PRO-02 A2). L'encart « Partir du Twin6 » s'affiche, lui, dès qu'une
  version de `twin6-ouverte` est publiée : identifiant codé en dur dans
  `AccueilSection`, indépendant du drapeau `reserved` ; il forke la dernière
  version publiée de ce paquet. Sans défaut validé, un paquet réservé peut
  être le défaut de repli (anomalie AN-2).
- **A3 — Lecteur connecté** (étape 3) : un promptologue connecté lit
  exactement la même chose qu'un visiteur ; ses propres brouillons ne sont
  jamais servis par les routes publiques.

## Scénarios d'erreur

- **E1 — Version inconnue, brouillon ou paquet privé** (étape 7) : `404
  {error: "Version publiée introuvable"}`, corps identique dans tous les cas.
- **E2 — Diff avec une version non publiée** (étape 8) : l'une des deux
  versions est inconnue, un brouillon, privée ou d'un autre paquet → même
  `404`. Voir l'anomalie AN-1 pour la conséquence dans l'éditeur.
- **E3 — Aucune version publiée** (étapes 4-5) : liste `[]`, `GET default`
  → `404 {error: "Aucun paquet publié"}` ; l'IHM affiche « Aucune version
  publiée sur ce serveur. ».
- **E4 — Visiteur sans session** (étape 2) : l'atelier affiche « L'atelier
  promptologue nécessite une session » et ne lit aucun paquet.
- **E5 — Compte sans rôle promptologue** (étape 2) : refus explicite
  (« Cet atelier est réservé au rôle promptologue »).
- **E6 — API injoignable (copie statique du site)** (étape 2) : message
  « Copie statique du site : l'atelier promptologue nécessite l'API serveur ».
- **E7 — Section inconnue** (étapes 1-2) : `#/promptologue/<autre>`, dont le
  segment, décodé par `parseHash`, n'est ni `editeur/<id>`, ni `banc-essai`,
  ni `retro`, ni `formation[/<chapitre>]` (ex. `#/promptologue/r%C3%A9tro` →
  « rétro »). Pour un promptologue, la vue affiche, sous le bandeau
  « Connecté en tant que … (promptologue) » et la navigation de l'atelier,
  l'alerte « Section inconnue de l'atelier promptologue : « rétro ». » et le
  lien « Retour à l'atelier » (`#/promptologue`). Aucune section n'est
  montée : aucune lecture de paquets, seule la vérification de session
  `GET /api/auth/me` part. La garde passe **avant** l'aiguillage : visiteur,
  compte sans rôle ou copie statique reçoivent les messages E4 à E6, jamais
  celui-ci. Un segment au pourcentage mal formé (`#/promptologue/100%`)
  n'atteint pas ce repli : `parseHash` lève une `URIError` avant tout rendu
  (anomalie AN1 de UC-VIS-02, commune aux routes à section).

## Règles de gestion

- **RG1** — Les lectures sont **publiques** : une version publiée est un
  artefact de méthode, sans donnée d'apprenant (`docs/autorisations.md`).
- **RG2** — Filtre `status = published` **et** `is_private = 0` appliqué à la
  lecture par `listPublished`, `findPublished` et
  `latestPublishedAnyPackage`. Le réglage validé, lui, est servi **tel quel**
  par `GET /default` (aucune relecture de la version) : sa conformité
  (publiée, non privée) est garantie à l'écriture par `isPublished`
  (UC-ADM-03, et UC-PRO-04 pour la proposition).
- **RG3** — Défaut effectif = réglage validé s'il porte `id` et `version`
  textuels (un réglage partiel est ignoré), sinon dernière publication
  (`published_at` décroissant puis ordre d'insertion), **sans critère sur
  `metadata.reserved`** (anomalie AN-2).
- **RG4** — Diff structurel (`PackageDiff`) : un prompt est identifié par
  `(role, nom)` — renommer un prompt = le retirer et en ajouter un ; un prompt
  modifié porte le diff de lignes de son `texte` et le diff de ses
  `variables` (par `nom` : ajoutées, retirées, `description`/`exemple`
  modifiés), chaque partie valant `null` si inchangée ; les champs comparés
  sont `schemaVersion`, `auteur`, `description`, `modeleCible`,
  `referentielCompatible` ; `changelog`, `id` et `version` ne sont pas
  comparés (les versions figurent dans `from`/`to`) ; les métadonnées sont
  comparées clé par clé (clé absente = `null`).
- **RG5** — Diff de lignes compact : préfixe et suffixe communs retirés, LCS
  sur le bloc central ; au-delà de 250 000 cellules, le bloc central est rendu
  en suppression puis insertion complètes (correct, moins minimal). Lignes
  `del` numérotées dans le document de départ, `add` dans le document
  d'arrivée.
- **RG6** — L'ordre de déclaration des routes (`/prompt-packages/drafts/**` et
  `/default` avant `/prompt-packages/{id}/{version}`) n'a d'effet que sur
  `/prompt-packages/drafts/{n}` (segment numérique, jamais une semver).
  Aucun identifiant de paquet n'est réellement réservé, contrairement au
  commentaire de `routes/packages.php` : un paquet nommé `default` ou
  `drafts` (le schéma accepte tout `id` non vide) reste lisible par
  `/{id}/{version}` et comparable par `/diff` ; `GET /default` garde son sens
  (désignation `{id, version}`).

## Données et RGPD

| Donnée | Traitement |
|---|---|
| Paquets et versions | Contenus collectifs, sans donnée d'apprenant (`docs/rgpd-registre.md`) ; l'auteur (`created_by`) n'est jamais exposé |
| Golden Prompt | Paquet privé, invisible de toutes ces routes (§7) |
| Consultation | Aucune journalisation |

## Code sollicité

| Couche | Élément | Rôle |
|---|---|---|
| Front | `web/src/router.js` — `parseHash` | Route `#/promptologue[/<section>]`, segment décodé par `decodeURIComponent` (E7) |
| Front | `web/src/views/PromptologueView.jsx` | Garde de session et de rôle, dispatch des sections, repli « section inconnue » (E7) |
| Front | `web/src/views/promptologue/AccueilSection.jsx` | Tableau des versions publiées, défaut marqué, paquet réservé |
| Front | `web/src/views/promptologue/api.js` — `createPromptologueApi` (`listPublished`, `getPackage`, `getDefault`, `diff`) | Appels HTTP |
| Front | `web/src/views/promptologue/EditeurSection.jsx` — `DiffView` | Rendu du diff structurel |
| Front | `web/src/lib/run-launcher.js` — `fetchPromptPackages` | Consommateur apprenant du défaut : marque `defaut: true` (marqueur non consommé par `RunWizard`, UC-APP-02 A-01 ; perdu si le défaut est l'embarqué, AN-3) |
| API | `GET /api/prompt-packages`, `/{id}/{version}`, `/default`, `/{id}/diff/{v1}/{v2}` — `api/src/routes/packages.php` | Orchestration |
| Domaine | `api/src/Packages/PromptPackageRepository.php` — `listPublished`, `findPublished`, `latestPublishedAnyPackage` | Filtre publié et non privé (lecture) |
| Domaine | `PromptPackageRepository::isPublished` | Garde d'écriture du réglage (UC-ADM-03, UC-PRO-04) : même filtre, aucune route de lecture de ce cas ne l'appelle |
| Domaine | `api/src/Packages/SettingsRepository.php` — `get` | Défaut validé |
| Domaine | `api/src/Packages/PackageDiff.php` — `compute`, `lineDiff` | Diff structurel |

## Jeux de tests

### Tests unitaires

| ID | Cible | Vérifie | Fichier |
|---|---|---|---|
| UC-PRO-01-U01 | `PromptPackageRepository::listPublished` | Publiées non privées, tri par paquet (publiées hors de l'ordre alphabétique), métadonnées seules, `publishedAt` ISO, `reserved` (RG2) | `api/tests/UseCases/Unit/UcPro01ConsulterPaquetsPubliesTest.php` |
| UC-PRO-01-U02 | `findPublished` | Document complet ; `null` pour brouillon, inconnu, privé (E1) | idem |
| UC-PRO-01-U03 | `latestPublishedAnyPackage` | `null` sans publication ; plus récente hors brouillons (même datés dans le futur) et privés ; réservé non exclu (RG3, AN-2) | idem |
| UC-PRO-01-U04 | `isPublished` | Vrai seulement pour une version publiée publique (RG2) | idem |
| UC-PRO-01-U05 | `SettingsRepository::get/set/delete` | Défaut validé lu ; valeur non-objet ignorée | idem |
| UC-PRO-01-U06 | `PackageDiff::compute` | Version identique : `identical`, sections vides, résumé nul | idem |
| UC-PRO-01-U07 | `PackageDiff::compute` | Clé `(role, nom)` : renommer = retirer + ajouter (RG4) | idem |
| UC-PRO-01-U08 | `PackageDiff::compute` | Texte et variables d'un prompt modifié, `null` si inchangés (RG4) | idem |
| UC-PRO-01-U09 | `PackageDiff::compute` | Champs, code, métadonnées ; changelog non comparé (RG4) | idem |
| UC-PRO-01-U10 | `PackageDiff::lineDiff` | Plafond LCS : remplacement complet du bloc central (RG5) | idem |
| UC-PRO-01-U11 | `PackageDiff::compute` | Limite L1 : ordre des clés des objets imbriqués (comportement figé) ; sans effet sur deux versions publiées relues de MySQL | idem |
| UC-PRO-01-U12 | `createPromptologueApi` | Routes de lecture, segments encodés (détail et diff) | `web/test/usecases/unit/uc-pro-01-consulter-paquets-publies.test.jsx` |
| UC-PRO-01-U13 | `parseHash` | `#/promptologue` → accueil de l'atelier | idem |
| UC-PRO-01-U14 | `DiffView` | Rendu tolérant (formes chaîne/objet), sections vides omises | idem |
| UC-PRO-01-U15 | `fetchPromptPackages` | Marque le défaut servi ; replis sans défaut et embarqué | idem |
| UC-PRO-01-U16 | `fetchPromptPackages` | Anomalie AN-3 : défaut = paquet embarqué → aucune entrée marquée (comportement figé) | idem |
| UC-PRO-01-U17 | `PromptologueView` | Garde : visiteur, API injoignable, sans rôle → message, aucune lecture ; promptologue → accueil (E4-E6) | idem |
| UC-PRO-01-U18 | `AccueilSection` | Lectures en échec tolérées (étape 3), entrées sans `id`/`version` filtrées, défaut marqué | idem |
| UC-PRO-01-U19 | `parseHash`, `PromptologueView` (vue isolée, `deps.api` espionné) | Segment décodé (`r%C3%A9tro` → « rétro ») ; hors des sections, comparaison exacte (casse, barre finale, `editeur/` sans identifiant, `formations`) → sous le bandeau et la navigation, alerte « Section inconnue de l'atelier promptologue : « … ». », lien `#/promptologue` ; client jamais appelé, aucune section montée ; sans rôle → refus, pas de message (E7) | idem |

### Tests fonctionnels

| ID | Scénario | Niveau | Vérifie | Fichier |
|---|---|---|---|---|
| UC-PRO-01-F01 | Nominal (étape 4) | API | Liste publique sans brouillon, Golden ni document ; les quatre lectures n'écrivent ni ne journalisent rien | `api/tests/UseCases/Functional/UcPro01ConsulterPaquetsPubliesTest.php` |
| UC-PRO-01-F02 | Nominal (étape 7) | API | Document complet, conforme au schéma | idem |
| UC-PRO-01-F03 | Nominal (étape 5) | API | Défaut = dernière publication | idem |
| UC-PRO-01-F04 | Nominal (étape 8) | API | Diff 1.0.0 → 2.0.0 (ajout, retrait, modification, résumé), sens inverse | idem |
| UC-PRO-01-F05 | A1 | API | Défaut validé prioritaire | idem |
| UC-PRO-01-F06 | A2 | API | `reserved: true` pour `twin6-ouverte` (publié en premier, liste triée par paquet) | idem |
| UC-PRO-01-F07 | A3 | API | Promptologue connecté : même réponse qu'un visiteur ; son brouillon → 404 | idem |
| UC-PRO-01-F08 | E1 | API | Inconnue, brouillon, Golden, paquet inconnu → corps 404 identiques | idem |
| UC-PRO-01-F09 | E2 | API | Diff avec brouillon, inconnue, autre paquet, Golden → 404 | idem |
| UC-PRO-01-F10 | E3 | API | Rien de publié (Golden seul) : `[]`, défaut 404 | idem |
| UC-PRO-01-F11 | Nominal (étapes 1-6) + A2 + AN-2 | IHM | `<App/>` : tableau, « par défaut » (sur le réservé, AN-2), « réservé », encart Twin6, 3 lectures | `web/test/usecases/functional/uc-pro-01-consulter-paquets-publies.test.jsx` |
| UC-PRO-01-F12 | A1 | IHM | Défaut validé marqué, pas la dernière publication ; pas de « Proposer par défaut » sur la ligne par défaut | idem |
| UC-PRO-01-F13 | E3 | IHM | « Aucune version publiée sur ce serveur. » | idem |
| UC-PRO-01-F14 | E4 | IHM | Visiteur : invitation à se connecter, aucune lecture | idem |
| UC-PRO-01-F15 | E5 | IHM | Sans rôle : refus explicite | idem |
| UC-PRO-01-F16 | E6 | IHM | Copie statique : message dédié | idem |
| UC-PRO-01-F17 | Nominal (étape 8) | IHM | Après publication, « Diff contre 1.0.0 » rend le diff serveur | idem |
| UC-PRO-01-F18 | Anomalie AN-1 | IHM | Avant publication : alerte « Version publiée introuvable » (comportement figé) | idem |
| UC-PRO-01-F19 | Anomalie AN-2 | API | Aurora puis `twin6-ouverte` importés (ordre du déploiement) : défaut servi = le réservé (comportement figé) | `api/tests/UseCases/Functional/UcPro01ConsulterPaquetsPubliesTest.php` |
| UC-PRO-01-F20 | RG6 | API | Paquets nommés `default` et `drafts` : document et diff servis ; `/default` reste la désignation | idem |
| UC-PRO-01-F21 | RG3 (étape 5) | API | Réglage partiel (`id` seul, `version` non textuelle…) → repli sur la dernière publication | idem |
| UC-PRO-01-F22 | Limite L2 | API | Réglage écrit hors routes vers le Golden : servi tel quel, document toujours 404 (comportement figé) | idem |
| UC-PRO-01-F23 | E7 | IHM | `<App/>` sur `#/promptologue/r%C3%A9tro` (promptologue) : alerte « Section inconnue de l'atelier promptologue : « rétro ». », bandeau et navigation, seul `GET api/auth/me` ; le lien de retour rouvre « Paquets » (trois lectures, sans nouvelle sonde) ; compte sans rôle → refus, pas de message ; `<App/>` sur `#/promptologue/100%` : le rendu lève une `URIError`, rien n'est affiché, ni sonde de session ni requête (comportement actuel, UC-VIS-02 AN1) | `web/test/usecases/functional/uc-pro-01-consulter-paquets-publies.test.jsx` |

### Tests existants liés (non-régression)

- `api/tests/PackagesTest.php` — `testListAndDetailRoutes` (brouillon invisible, 404),
  `testGeneratedDefaultPackageImportsCleanly` (paquet par défaut généré, servi entier).
- `api/tests/PackagesDiffTest.php` — diff lisible, identique, 404, contrat figé par
  la fixture partagée `schemas/fixtures/diff/prompt-package-diff-exemple.json`, `lineDiff`.
- `api/tests/PackagesDefaultTest.php` — `testDefaultFallsBackToTheLatestPublishedVersion`.
- `api/tests/PackagesTwin6Test.php` — `testImportReservedIsIdempotentAndListedReserved`.
- `api/tests/AdminGoldenTest.php` — `testGoldenNeverExposedOnAnyPublicPath`.
- `web/src/views/PromptologueView.test.jsx` — garde de rôle, défaut marqué, section inconnue (« section inconnue : alerte + retour à l'atelier », vue isolée, E7).
- `web/src/views/promptologue/AccueilSection.test.jsx`, `DiffView.test.jsx`,
  `EditeurSection.test.jsx` (diff contre l'origine).
- `web/src/lib/run-launcher.test.js` — défaut serveur marqué.
- `web/e2e/parcours-promptologue.e2e.js` — étape « Diff structurel » (navigateur réel).

### Exécuter

```sh
docker compose run --rm php vendor/bin/phpunit --filter UcPro01 --testdox
cd web && npx vitest run test/usecases --testNamePattern UC-PRO-01
```

## Anomalies constatées

- **AN-1 — « Diff contre *version* » inopérant sur un brouillon non publié.**
  L'éditeur (UC-PRO-02) propose ce bouton dès qu'une version d'origine est
  connue, et le chapitre de formation 03 §5 annonce qu'il « charge la
  comparaison serveur entre votre brouillon et sa version d'origine ». Or il
  appelle `GET /api/prompt-packages/{id}/diff/{origine}/{version du
  brouillon}`, qui ne compare que des versions **publiées** : tant que le
  brouillon n'est pas publié, la réponse est toujours `404 « Version publiée
  introuvable »`, affichée en alerte. Seul un fork renommé dispose d'un diff
  de brouillon (`GET …/drafts/{draftId}/diff-origin`, UC-PRO-02 A2). Le
  scénario e2e contourne le problème en publiant d'abord. Comportement figé
  par UC-PRO-01-F18 (IHM) et UC-PRO-01-F09 (API).
- **AN-2 — Le repli du défaut peut désigner un paquet réservé.**
  `latestPublishedAnyPackage` ne filtre pas `metadata.reserved`. Au
  déploiement, `scripts/deploy/stage-api.sh` construit
  `aurora-v3-reconstruit` puis `twin6-ouverte`, et `deploy.mjs` importe
  `build/prompt-packages/*.json` dans l'ordre alphabétique : sur un serveur
  sans défaut validé, `GET /api/prompt-packages/default` renvoie donc
  `twin6-ouverte@1.0.0`, le paquet réservé au pipeline source-unique, et non
  le paquet aurora que le script de déploiement présente comme « le paquet par
  défaut ». L'accueil de l'atelier le marque « par défaut ». Seule une
  validation administrateur (UC-ADM-03) corrige la désignation. Comportement
  figé par UC-PRO-01-F19 (API) et UC-PRO-01-F11 (IHM).
- **AN-3 — Marque « défaut » perdue quand le défaut est le paquet embarqué.**
  Si le défaut servi est `aurora-v3-reconstruit@1.0.0`, `fetchPromptPackages`
  marque la copie publiée puis la retire comme doublon de `BUILTIN_PACKAGE`
  (objet gelé, jamais marqué) : aucune entrée ne porte `defaut: true`. Sans
  effet visible aujourd'hui (le marqueur n'est pas consommé, UC-APP-02 A-01).
  Comportement figé par UC-PRO-01-U16.

## Limites

- **L1** — `PackageDiff::compute` compare les objets imbriqués
  (`referentielCompatible`, valeurs de métadonnées) par égalité stricte, donc
  sensible à l'ordre des clés. Sans effet par l'API : les deux documents
  comparés sont relus de colonnes JSON MySQL, qui normalisent l'ordre des clés
  (UC-PRO-01-U11 : deux versions importées avec des ordres de clés différents
  ne diffèrent pas).
- **L2** — Aucun filtre à la lecture du réglage validé : une valeur écrite
  hors des routes (base modifiée à la main) désignant une version privée ou
  inconnue serait servie telle quelle par `GET /default`, alors que le
  document resterait introuvable (UC-PRO-01-F22). Les deux routes d'écriture
  (UC-ADM-03, UC-SYS-02) passent par `isPublished`.
