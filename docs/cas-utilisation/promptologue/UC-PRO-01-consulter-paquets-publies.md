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
version est proposée **par défaut** aux apprenants, et de **comparer** deux
versions publiées d'un même paquet par un diff structurel.

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

- Seules les versions **publiées et non privées** sont listées, servies,
  comparées ou désignées comme défaut ; ni un brouillon, ni le Golden Prompt
  (paquet privé, UC-ADM-02) n'apparaissent jamais.
- La version par défaut affichée est celle que reçoivent les apprenants.
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
   `{id, version}`, sinon la version publiée non privée la plus récente ;
   réponse `200 {id, version}`.
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
- **A2 — Paquet réservé** (étapes 4 et 6) : un paquet dont le contenu porte
  `metadata.reserved = true` (pipeline source-unique, ex. `twin6-ouverte`)
  est listé avec `reserved: true` ; l'IHM l'annonce « réservé », propose
  « Forker (copie) » au lieu de « Nouvelle version » et affiche l'encart
  « Partir du Twin6 » (fork avec renommage, UC-PRO-02 A2).
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

## Règles de gestion

- **RG1** — Les lectures sont **publiques** : une version publiée est un
  artefact de méthode, sans donnée d'apprenant (`docs/autorisations.md`).
- **RG2** — Un seul filtre pour toute lecture publique : `status = published`
  **et** `is_private = 0` (`listPublished`, `findPublished`,
  `latestPublishedAnyPackage`, `isPublished`).
- **RG3** — Défaut effectif = réglage validé, sinon dernière publication
  (`published_at` décroissant puis ordre d'insertion).
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
- **RG6** — `drafts` et `default` sont des identifiants de paquet réservés
  (les routes `/prompt-packages/drafts/**` et `/default` sont déclarées avant
  `/prompt-packages/{id}/{version}`).

## Données et RGPD

| Donnée | Traitement |
|---|---|
| Paquets et versions | Contenus collectifs, sans donnée d'apprenant (`docs/rgpd-registre.md`) ; l'auteur (`created_by`) n'est jamais exposé |
| Golden Prompt | Paquet privé, invisible de toutes ces routes (§7) |
| Consultation | Aucune journalisation |

## Code sollicité

| Couche | Élément | Rôle |
|---|---|---|
| Front | `web/src/router.js` — `parseHash` | Route `#/promptologue` |
| Front | `web/src/views/PromptologueView.jsx` | Garde de session et de rôle, dispatch des sections |
| Front | `web/src/views/promptologue/AccueilSection.jsx` | Tableau des versions publiées, défaut marqué, paquet réservé |
| Front | `web/src/views/promptologue/api.js` — `createPromptologueApi` (`listPublished`, `getPackage`, `getDefault`, `diff`) | Appels HTTP |
| Front | `web/src/views/promptologue/EditeurSection.jsx` — `DiffView` | Rendu du diff structurel |
| Front | `web/src/lib/run-launcher.js` — `fetchPromptPackages` | Consommateur apprenant du défaut (marque `defaut: true`) |
| API | `GET /api/prompt-packages`, `/{id}/{version}`, `/default`, `/{id}/diff/{v1}/{v2}` — `api/src/routes/packages.php` | Orchestration |
| Domaine | `api/src/Packages/PromptPackageRepository.php` — `listPublished`, `findPublished`, `latestPublishedAnyPackage`, `isPublished` | Filtre publié et non privé |
| Domaine | `api/src/Packages/SettingsRepository.php` — `get` | Défaut validé |
| Domaine | `api/src/Packages/PackageDiff.php` — `compute`, `lineDiff` | Diff structurel |

## Jeux de tests

### Tests unitaires

| ID | Cible | Vérifie | Fichier |
|---|---|---|---|
| UC-PRO-01-U01 | `PromptPackageRepository::listPublished` | Publiées non privées, tri, métadonnées seules, `publishedAt` ISO, `reserved` (RG2) | `api/tests/UseCases/Unit/UcPro01ConsulterPaquetsPubliesTest.php` |
| UC-PRO-01-U02 | `findPublished` | Document complet ; `null` pour brouillon, inconnu, privé (E1) | idem |
| UC-PRO-01-U03 | `latestPublishedAnyPackage` | `null` sans publication ; plus récente hors brouillons et privés (RG3) | idem |
| UC-PRO-01-U04 | `isPublished` | Vrai seulement pour une version publiée publique (RG2) | idem |
| UC-PRO-01-U05 | `SettingsRepository::get/set/delete` | Défaut validé lu ; valeur non-objet ignorée | idem |
| UC-PRO-01-U06 | `PackageDiff::compute` | Version identique : `identical`, sections vides, résumé nul | idem |
| UC-PRO-01-U07 | `PackageDiff::compute` | Clé `(role, nom)` : renommer = retirer + ajouter (RG4) | idem |
| UC-PRO-01-U08 | `PackageDiff::compute` | Texte et variables d'un prompt modifié, `null` si inchangés (RG4) | idem |
| UC-PRO-01-U09 | `PackageDiff::compute` | Champs, code, métadonnées ; changelog non comparé (RG4) | idem |
| UC-PRO-01-U10 | `PackageDiff::lineDiff` | Plafond LCS : remplacement complet du bloc central (RG5) | idem |
| UC-PRO-01-U11 | `PackageDiff::compute` | Limite L1 : ordre des clés des objets imbriqués (comportement figé) | idem |
| UC-PRO-01-U12 | `createPromptologueApi` | Routes de lecture, segments encodés | `web/test/usecases/unit/uc-pro-01-consulter-paquets-publies.test.jsx` |
| UC-PRO-01-U13 | `parseHash` | `#/promptologue` → accueil de l'atelier | idem |
| UC-PRO-01-U14 | `DiffView` | Rendu tolérant (formes chaîne/objet), sections vides omises | idem |
| UC-PRO-01-U15 | `fetchPromptPackages` | Marque le défaut servi ; replis sans défaut et embarqué | idem |

### Tests fonctionnels

| ID | Scénario | Niveau | Vérifie | Fichier |
|---|---|---|---|---|
| UC-PRO-01-F01 | Nominal (étape 4) | API | Liste publique sans brouillon, Golden ni document | `api/tests/UseCases/Functional/UcPro01ConsulterPaquetsPubliesTest.php` |
| UC-PRO-01-F02 | Nominal (étape 7) | API | Document complet, conforme au schéma | idem |
| UC-PRO-01-F03 | Nominal (étape 5) | API | Défaut = dernière publication | idem |
| UC-PRO-01-F04 | Nominal (étape 8) | API | Diff 1.0.0 → 2.0.0 (ajout, retrait, modification, résumé), sens inverse | idem |
| UC-PRO-01-F05 | A1 | API | Défaut validé prioritaire | idem |
| UC-PRO-01-F06 | A2 | API | `reserved: true` pour `twin6-ouverte` | idem |
| UC-PRO-01-F07 | A3 | API | Promptologue connecté : même réponse qu'un visiteur ; son brouillon → 404 | idem |
| UC-PRO-01-F08 | E1 | API | Inconnue, brouillon, Golden, paquet inconnu → corps 404 identiques | idem |
| UC-PRO-01-F09 | E2 | API | Diff avec brouillon, inconnue, autre paquet, Golden → 404 | idem |
| UC-PRO-01-F10 | E3 | API | Rien de publié (Golden seul) : `[]`, défaut 404 | idem |
| UC-PRO-01-F11 | Nominal (étapes 1-6) + A2 | IHM | `<App/>` : tableau, « par défaut », « réservé », encart Twin6, 3 lectures | `web/test/usecases/functional/uc-pro-01-consulter-paquets-publies.test.jsx` |
| UC-PRO-01-F12 | A1 | IHM | Défaut validé marqué, pas la dernière publication | idem |
| UC-PRO-01-F13 | E3 | IHM | « Aucune version publiée sur ce serveur. » | idem |
| UC-PRO-01-F14 | E4 | IHM | Visiteur : invitation à se connecter, aucune lecture | idem |
| UC-PRO-01-F15 | E5 | IHM | Sans rôle : refus explicite | idem |
| UC-PRO-01-F16 | E6 | IHM | Copie statique : message dédié | idem |
| UC-PRO-01-F17 | Nominal (étape 8) | IHM | Après publication, « Diff contre 1.0.0 » rend le diff serveur | idem |
| UC-PRO-01-F18 | Anomalie AN-1 | IHM | Avant publication : alerte « Version publiée introuvable » (comportement figé) | idem |

### Tests existants liés (non-régression)

- `api/tests/PackagesTest.php` — `testListAndDetailRoutes` (brouillon invisible, 404),
  `testGeneratedDefaultPackageImportsCleanly` (paquet par défaut généré, servi entier).
- `api/tests/PackagesDiffTest.php` — diff lisible, identique, 404, contrat figé par
  la fixture partagée `schemas/fixtures/diff/prompt-package-diff-exemple.json`, `lineDiff`.
- `api/tests/PackagesDefaultTest.php` — `testDefaultFallsBackToTheLatestPublishedVersion`.
- `api/tests/PackagesTwin6Test.php` — `testImportReservedIsIdempotentAndListedReserved`.
- `api/tests/AdminGoldenTest.php` — `testGoldenNeverExposedOnAnyPublicPath`.
- `web/src/views/PromptologueView.test.jsx` — garde de rôle, défaut marqué.
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

## Limites

- **L1** — `PackageDiff::compute` compare les objets imbriqués
  (`referentielCompatible`, valeurs de métadonnées) par égalité stricte, donc
  sensible à l'ordre des clés. Sans effet par l'API : les deux documents
  comparés sont relus de colonnes JSON MySQL, qui normalisent l'ordre des clés
  (UC-PRO-01-U11).
