# UC-PRO-02 — Créer et éditer un brouillon de paquet de prompts

| Champ | Valeur |
|---|---|
| **Acteur principal** | Promptologue |
| **Acteurs secondaires** | Administrateur (Golden Prompt privé, jamais dérivable — UC-ADM-02) ; pipeline source-unique (paquets réservés, ex. `twin6-ouverte`) |
| **Portée** | humanome.xyz — `POST`/`GET /api/prompt-packages/drafts`, `GET`/`PUT /api/prompt-packages/drafts/{draftId}`, `GET /api/prompt-packages/drafts/{draftId}/diff-origin` ; accueil `#/promptologue` et éditeur `#/promptologue/editeur/<draftId>` |
| **Niveau** | Objectif utilisateur |
| **Cahier des charges** | §3.4 (« éditer/versionner le système de prompts — texte + code JavaScript — via une interface en ligne »), §4.3 ; plan P10 points 2 et 3 (« un brouillon ne tourne que chez son auteur ») ; décision D1/AD-D1 (fork renommé d'un paquet réservé) |
| **Statut** | Implémenté (P10, fork renommé D1) |

## Objectif

Permettre au promptologue de préparer une nouvelle version d'un paquet de
prompts **sans jamais toucher une version publiée** : il dérive un
**brouillon** d'une version existante, en édite les gabarits, les variables,
le code d'orchestration et les métadonnées, le valide au schéma et
l'enregistre. Le brouillon reste **privé à son auteur** jusqu'à sa publication
(UC-PRO-03).

## Déclencheur

Sur l'accueil de l'atelier, le promptologue clique « Nouvelle version » sur
une version publiée (ou « Forker (copie) » / « Partir du Twin6 » sur un paquet
réservé), ou rouvre un brouillon depuis « Mes brouillons ».

## Préconditions

- Session ouverte portant le rôle `promptologue` (UC-CPT-02, rôle attribué
  par un administrateur, UC-ADM-01).
- La version source existe : version publiée non privée (UC-PRO-01), ou un
  brouillon de l'auteur.

## Garanties en cas de succès

- Un brouillon (`prompt_versions.status = draft`, `created_by` = l'auteur) est
  créé ou mis à jour ; son document est **conforme au schéma**
  `prompt-package` à chaque écriture.
- Aucune version publiée n'est modifiée ; le brouillon n'est visible,
  modifiable et exécutable (banc d'essai, UC-PRO-05) que par son auteur.

## Garanties minimales (en cas d'échec)

- Rien n'est écrit (document refusé, conflit, garde de rôle ou CSRF).
- Un brouillon d'autrui répond exactement comme un identifiant inexistant
  (`404` homogène, pas d'IDOR).

## Scénario nominal

1. Sur l'accueil (UC-PRO-01), le promptologue clique « Nouvelle version » sur
   la ligne d'une version publiée ; un formulaire propose la version suivante
   (correctif + 1, ex. `1.0.0` → `1.0.1`), qu'il ajuste (elle doit rester
   strictement croissante pour être publiable, UC-PRO-03).
2. Il clique « Créer le brouillon » : le navigateur envoie
   `POST /api/prompt-packages/drafts` `{fromId, fromVersion, version}` avec le
   cookie de session et l'en-tête `X-CSRF-Token`.
3. Le serveur vérifie le rôle `promptologue` (relu en base), que le corps est
   un objet JSON portant les trois champs, que `version` est un semver valide,
   que la source est une version publiée non privée **ou** un brouillon de
   l'auteur, et que `version` n'existe pas déjà dans le paquet (quel que soit
   son statut).
4. Le serveur copie le document source, y remplace `version`, retire
   `metadata.publieLe`, pose `metadata.modifieLe`, le valide au schéma et
   l'enregistre comme brouillon de l'auteur : `201 {draftId, id, version}`.
5. L'atelier ouvre `#/promptologue/editeur/<draftId>` ; l'éditeur charge
   `GET /api/prompt-packages/drafts/{draftId}` → `{draftId, id, version,
   status: "draft", createdAt, document}`.
6. Le promptologue édite : métadonnées (description, « Modèle cible (vide =
   agnostique) », changelog en lecture), prompts (onglets « rôle — nom »,
   texte du gabarit avec compteur de caractères, variables nom / description /
   exemple, ajout et suppression), code d'orchestration (module ESM et
   entrypoint).
7. « Valider » exécute dans le navigateur la validation au schéma
   `prompt-package` (moteur) : « Document valide au schéma prompt-package. »,
   ou la liste des erreurs (pointeur JSON + message, dix au plus).
8. « Enregistrer » valide d'abord localement puis envoie
   `PUT /api/prompt-packages/drafts/{draftId}` `{document}` ; le serveur
   vérifie que c'est un brouillon de l'auteur, re-valide au schéma, vérifie
   que l'`id` n'a pas changé et que la version ne collisionne pas, horodate
   `metadata.modifieLe` et répond `200` avec le brouillon : l'IHM affiche
   « Brouillon enregistré. ».
9. « Mes brouillons » (accueil, `GET /api/prompt-packages/drafts`) liste ses
   brouillons en métadonnées `{draftId, id, version, description, createdAt}`,
   avec un lien vers l'éditeur ; seuls ceux-là sont proposés au banc d'essai.

## Scénarios alternatifs

- **A1 — Dériver depuis un de ses brouillons** (étape 3) : `fromVersion`
  désigne un brouillon de l'auteur ; accepté (API uniquement : l'accueil ne
  propose « Nouvelle version » que sur les versions publiées).
- **A2 — Forker un paquet réservé** (étapes 1 à 4) : pour un paquet
  `reserved` (« Forker (copie) », ou l'encart « Partir du Twin6 »), l'IHM
  demande le « Nom de votre copie » (pré-rempli `<id>-ma-copie`, trimé) et
  l'envoie en `toId`. Le serveur crée un **nouveau paquet** à ce nom, y range
  le brouillon (document : `id = toId`, `metadata.reserved` retiré,
  `metadata.forkedFrom = {id, version}` de la source). Dans l'éditeur, le
  bouton « Diff contre l'original *id@version* » appelle
  `GET /api/prompt-packages/drafts/{draftId}/diff-origin` : diff structurel
  (UC-PRO-01 RG4) de l'original publié vers le brouillon courant.
- **A3 — Document nu et changement de version** (étape 8) : le `PUT` accepte
  aussi le document sans enveloppe `{document}` ; la version d'un brouillon
  peut changer tant qu'elle ne collisionne pas.

## Scénarios d'erreur

- **E1 — Pas de session / pas le rôle** (étape 3) : `401 {error:
  "Authentication required"}` sans session ; `403 {error: "Forbidden"}` sans
  le rôle `promptologue` — y compris pour un administrateur (pas de
  super-rôle).
- **E2 — Jeton CSRF absent ou invalide** (étapes 2 et 8) : mutation d'une
  session sans `X-CSRF-Token` valide → `403 {error: "Jeton CSRF absent ou
  invalide"}`.
- **E3 — Corps de création invalide** (étape 3) : JSON non objet → `400
  {error: "Corps JSON invalide"}` ; champ manquant → `422` ; semver invalide →
  `422 {error: "Document invalide", details: {"/version": ["Version semver
  invalide"]}}`.
- **E4 — Source introuvable** (étape 3) : version inconnue, brouillon d'un
  autre promptologue ou paquet privé (Golden) → même `404 {error: "Version
  source introuvable"}`.
- **E5 — Version déjà prise** (étape 3) : `409` (« Version x of prompt package
  "id" already exists ») ; l'IHM affiche ce message et reste sur l'accueil.
- **E6 — Fork réservé sans nom valide** (A2) : `toId` absent, identique à la
  source ou hors format (kebab-case, 64 caractères au plus) → `422` (détails
  sur `/toId`) ; nom déjà pris par un paquet (même privé) → `409`. L'IHM
  refuse localement un nom vide (« Ce paquet est réservé : donnez un nouveau
  nom à votre copie. »), sans requête.
- **E7 — Document refusé à l'enregistrement** (étapes 7-8) : non conforme au
  schéma → `422 {error: "Document invalide", details: {<pointeur>: [...]}}` ;
  `id` modifié → `422` ; version déjà prise → `409` ; corps vide → `400`.
  Côté IHM, « Valider » / « Enregistrer » bloquent localement un document
  invalide (aucun `PUT`).
- **E8 — Brouillon d'autrui ou inconnu** (étapes 5, 8, A2) : `GET`, `PUT` et
  `diff-origin` → `404 {error: "Brouillon introuvable"}` ; l'éditeur affiche
  l'alerte et « Retour à l'atelier ».
- **E9 — Version déjà publiée** (étape 8) : `409 {error: "Published versions
  are immutable: create a new draft instead"}` ; la version n'est d'ailleurs
  plus listée ni lisible comme brouillon.
- **E10 — Diff contre l'original impossible** (A2) : brouillon qui n'est pas
  un fork renommé → `422` ; `forkedFrom` ne désignant aucune version publiée →
  `409 {error: "Version d'origine introuvable (n'est plus publiée)."}`.

## Règles de gestion

- **RG1** — Un brouillon ne tourne que chez son auteur : toute lecture ou
  écriture est filtrée par `created_by` ; un identifiant étranger répond comme
  un identifiant inexistant (`404` homogène).
- **RG2** — Garde `RoleGuard::any('promptologue')`, rôles relus en base à
  chaque requête ; `admin` n'est pas un super-rôle ; CSRF global sur les
  mutations.
- **RG3** — Validation au schéma `prompt-package` à chaque écriture, côté
  client (moteur, précompilé) **et** côté serveur (`Validation::validate`).
- **RG4** — L'`id` d'un brouillon est invariant ; sa version est libre tant
  que le couple (paquet, version) est unique, **tous statuts confondus** (un
  brouillon réserve son numéro).
- **RG5** — Un paquet privé n'est jamais dérivable ; un paquet réservé ne
  l'est que renommé (slug neuf, différent de la source) et la copie mémorise
  `metadata.forkedFrom`.
- **RG6** — `metadata.publieLe` est retiré à la dérivation ;
  `metadata.modifieLe` est posé par le serveur à chaque écriture.
- **RG7** — Pas de concurrence optimiste (pas d'`If-Match`, contrairement aux
  compétences UC-EPI-01) : le dernier enregistrement l'emporte.

## Données et RGPD

| Donnée | Traitement |
|---|---|
| Document du brouillon | Prompts et code de méthode, sans donnée d'apprenant ; visible de son seul auteur |
| Auteur (`created_by`) | Jamais exposé ; `SET NULL` à la suppression du compte (voir AN-3) |
| Validation « Valider » | Exécutée dans le navigateur, rien n'est envoyé |

## Code sollicité

| Couche | Élément | Rôle |
|---|---|---|
| Front | `web/src/router.js` — `parseHash` | Route `#/promptologue/editeur/<draftId>` |
| Front | `web/src/views/promptologue/AccueilSection.jsx` | « Nouvelle version », fork renommé, « Mes brouillons », navigation vers l'éditeur |
| Front | `web/src/views/promptologue/EditeurSection.jsx` | Chargement, édition, Valider, Enregistrer, diff contre l'original |
| Front | `web/src/views/promptologue/api.js` — `createDraft`, `listDrafts`, `getDraft`, `saveDraft`, `diffDraftOrigin`, `suggestNextVersion`, `normalizeDraftEntry` | Appels HTTP et logique de l'accueil |
| Moteur | `engine/src/validation.js` — `validateDocument('prompt-package')` | Validation client |
| API | `POST`/`GET /api/prompt-packages/drafts`, `GET`/`PUT …/drafts/{draftId}`, `GET …/diff-origin` — `api/src/routes/packages.php` | Orchestration, codes HTTP |
| API | `api/src/Referentiel/RoleGuard.php`, `api/src/Middleware/CsrfMiddleware.php` | Rôle, CSRF |
| Domaine | `api/src/Packages/PromptPackageRepository.php` — `createDraft` (et `packageForReservedFork`), `listDrafts`, `findDraft`, `updateDraft` | Cycle de vie du brouillon |
| Domaine | `api/src/Referentiel/Semver.php` — `isValid` ; `api/src/Validation.php` | Semver, schéma |
| Domaine | `api/src/Packages/InvalidPackageException.php`, `PackageConflictException.php` | Erreurs 422 / 409 |
| Domaine | `api/src/Packages/PackageDiff.php` — `compute` | Diff contre l'original (A2) |

`web/src/views/promptologue/carnet.js` et `CompetenceDiff.jsx` relèvent du banc
d'essai (UC-PRO-05), pas de ce cas.

## Jeux de tests

### Tests unitaires

| ID | Cible | Vérifie | Fichier |
|---|---|---|---|
| UC-PRO-02-U01 | `createDraft` | Copie de la source, version remplacée, `publieLe` retiré, `modifieLe`, auteur (RG6) | `api/tests/UseCases/Unit/UcPro02EditerBrouillonPaquetTest.php` |
| UC-PRO-02-U02 | `createDraft`, `InvalidPackageException` | Semver invalide → erreurs sur `/version` (E3) | idem |
| UC-PRO-02-U03 | `createDraft` | Source inconnue, brouillon d'autrui, privé → `null` ; propre brouillon accepté (E4, A1) | idem |
| UC-PRO-02-U04 | `createDraft`, `PackageConflictException` | Version prise (publiée ou brouillon) (E5, RG4) | idem |
| UC-PRO-02-U05 | `createDraft` (fork réservé) | `toId` requis, neuf, kebab-case ; copie non réservée, `forkedFrom` ; `toId` ignoré sinon (A2, E6) | idem |
| UC-PRO-02-U06 | `listDrafts` | Brouillons de l'auteur, métadonnées (RG1) | idem |
| UC-PRO-02-U07 | `findDraft` | Portée auteur ; `null` pour autrui, inconnu, publié (E8) | idem |
| UC-PRO-02-U08 | `updateDraft` | Remplacement, `modifieLe` serveur, version modifiable (A3) | idem |
| UC-PRO-02-U09 | `updateDraft` | Schéma, `id`, collision, version publiée, autrui (E7, E9) | idem |
| UC-PRO-02-U10 | `updateDraft` | Limite RG7 : dernier enregistrement gagnant | idem |
| UC-PRO-02-U11 | `createDraft` après purge | Anomalie AN-3 : brouillon orphelin qui réserve sa version | idem |
| UC-PRO-02-U12 | `createDraft` (fork réservé) | Anomalie AN-4 : `toId` non trimé dans le document | idem |
| UC-PRO-02-U13 | `validateDocument('prompt-package')` | Brouillon dérivé valide | `engine/test/usecases/unit/uc-pro-02-editer-brouillon-paquet.test.js` |
| UC-PRO-02-U14 | `validateDocument` | Erreurs localisées par pointeur JSON | idem |
| UC-PRO-02-U15 | `validateDocument` | Code et entrypoint obligatoires | idem |
| UC-PRO-02-U16 | `createPromptologueApi.createDraft` | Corps, `toId` seulement s'il est fourni | `web/test/usecases/unit/uc-pro-02-editer-brouillon-paquet.test.js` |
| UC-PRO-02-U17 | `listDrafts`, `getDraft`, `saveDraft`, `diffDraftOrigin` | Routes, `PUT {document}`, encodage | idem |
| UC-PRO-02-U18 | `suggestNextVersion` | Correctif + 1, repli `1.0.1` | idem |
| UC-PRO-02-U19 | `normalizeDraftEntry` | Formes API (liste sans document, détail), document nu | idem |
| UC-PRO-02-U20 | `parseHash` | Route de l'éditeur | idem |

### Tests fonctionnels

| ID | Scénario | Niveau | Vérifie | Fichier |
|---|---|---|---|---|
| UC-PRO-02-F01 | Nominal | API | Créer (201), lister, ouvrir, enregistrer ; invisible du public | `api/tests/UseCases/Functional/UcPro02EditerBrouillonPaquetTest.php` |
| UC-PRO-02-F02 | A1 | API | Dériver depuis son brouillon | idem |
| UC-PRO-02-F03 | A2 | API | Fork renommé de `twin6-ouverte` + `diff-origin` | idem |
| UC-PRO-02-F04 | A3 | API | `PUT` du document nu, changement de version | idem |
| UC-PRO-02-F05 | E1 | API | 401 visiteur, 403 apprenant et admin | idem |
| UC-PRO-02-F06 | E2 | API | Sans jeton CSRF : 403, rien d'écrit | idem |
| UC-PRO-02-F07 | E3 | API | 400 JSON non objet, 422 champs, 422 semver | idem |
| UC-PRO-02-F08 | E4 | API | Source inconnue, étrangère, privée → même 404 | idem |
| UC-PRO-02-F09 | E5 | API | Version publiée ou brouillon existante → 409 | idem |
| UC-PRO-02-F10 | E6 | API | `toId` absent/identique/invalide → 422 ; pris → 409 | idem |
| UC-PRO-02-F11 | E7 | API | Schéma 422 + détails, `id` 422, collision 409, corps vide 400 | idem |
| UC-PRO-02-F12 | E8 | API | Brouillon d'autrui ou inconnu → 404 (GET, PUT, diff) | idem |
| UC-PRO-02-F13 | E9 | API | `PUT` sur version publiée → 409 | idem |
| UC-PRO-02-F14 | E10 | API | `diff-origin` : 422 non forké, 409 original introuvable | idem |
| UC-PRO-02-F15 | RG7 (limite) | API | `If-Match` ignoré, dernier enregistrement gagnant | idem |
| UC-PRO-02-F16 | AN-3 | API | Compte supprimé → brouillon orphelin, 409 pour un autre | idem |
| UC-PRO-02-F17 | Nominal | IHM | `<App/>` : Nouvelle version → éditeur → Valider → Enregistrer (CSRF, `{document}`) | `web/test/usecases/functional/uc-pro-02-editer-brouillon-paquet.test.jsx` |
| UC-PRO-02-F18 | A2 | IHM | « Partir du Twin6 », nom trimé, diff contre l'original | idem |
| UC-PRO-02-F19 | E6 | IHM | Nom vide refusé localement, aucune requête | idem |
| UC-PRO-02-F20 | E5 + AN-2 | IHM | Message serveur (en anglais) affiché, reste sur l'accueil | idem |
| UC-PRO-02-F21 | E7 | IHM | Erreurs de schéma listées, aucun `PUT` | idem |
| UC-PRO-02-F22 | E8 | IHM | « Brouillon introuvable » + retour à l'atelier | idem |
| UC-PRO-02-F23 | AN-1 | IHM | « Mes brouillons » : lien « brouillon 100 » (comportement figé) | idem |

### Tests existants liés (non-régression)

- `api/tests/PackagesDraftsTest.php` — cycle brouillon, semver, 409, schéma,
  garde de rôle, portée auteur, fork depuis son brouillon.
- `api/tests/PackagesTwin6Test.php` — fork renommé, `diff-origin`, nom neuf.
- `api/tests/AdminGoldenTest.php` — Golden non dérivable.
- `web/src/views/promptologue/AccueilSection.test.jsx`, `EditeurSection.test.jsx`,
  `web/src/views/PromptologueView.test.jsx` — composants isolés.
- `web/e2e/parcours-promptologue.e2e.js` — étapes brouillon et éditeur (navigateur réel).

### Exécuter

```sh
docker compose run --rm php vendor/bin/phpunit --filter UcPro02 --testdox
cd web && npx vitest run test/usecases --testNamePattern UC-PRO-02
cd engine && npx vitest run test/usecases/unit/uc-pro-02
```

## Anomalies constatées

- **AN-1 — « Mes brouillons » n'affiche pas `id@version`.** `GET
  /api/prompt-packages/drafts` renvoie `{draftId, id, version, description,
  createdAt}` sans document ; `normalizeDraftEntry` n'utilise que `document`
  pour le libellé, d'où un lien « brouillon 100 » ; de même « modifié le »
  n'apparaît jamais (`updatedAt` attendu, `createdAt` fourni). Les tests
  historiques simulent une liste qui inclut le document. Figé par
  UC-PRO-02-F23.
- **AN-2 — Messages d'erreur en anglais dans l'IHM.** Les `409` du dépôt
  (« Version 1.0.1 of prompt package "aurora-demo" already exists »,
  « Published versions are immutable… », « Semver must be strictly
  increasing… ») et les `401`/`403` de `RoleGuard` (« Authentication
  required », « Forbidden ») sont affichés tels quels, contrairement à la
  convention d'une UI en français. Figé par UC-PRO-02-F20.
- **AN-3 — Brouillons orphelins après suppression du compte de l'auteur.**
  `created_by` passe à `NULL` (FK `SET NULL`) : le brouillon est conservé
  indéfiniment, invisible de tous, et **réserve toujours son numéro de
  version** (`409` pour les autres promptologues). Le registre RGPD ne
  justifie cette conservation que pour les versions publiées. Figé par
  UC-PRO-02-U11 et UC-PRO-02-F16.
- **AN-4 — `toId` non trimé dans le document du fork.** Pour un appel direct
  à l'API avec `toId = " mon-twin6 "`, le paquet est créé sous `mon-twin6`
  (trimé) mais le document garde `id = " mon-twin6 "` : le réenregistrer tel
  quel échoue (`422` « l'identifiant ne peut pas changer ») et sa publication
  sert un document dont l'`id` diffère du paquet. L'IHM trime le nom, donc
  l'atelier ne déclenche pas le cas. Figé par UC-PRO-02-U12.

## Limites

- RG7 : pas de verrou ni de concurrence optimiste ; deux onglets du même
  auteur s'écrasent silencieusement (UC-PRO-02-U10, UC-PRO-02-F15).
- Le bouton « Diff contre *version* » d'un brouillon ordinaire ne fonctionne
  qu'après publication (UC-PRO-01, anomalie AN-1).
