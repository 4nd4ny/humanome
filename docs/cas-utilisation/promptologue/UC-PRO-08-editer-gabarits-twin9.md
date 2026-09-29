# UC-PRO-08 — Éditer les gabarits du Golden Prompt Twin9

| Champ | Valeur |
|---|---|
| **Acteur principal** | Administrateur-promptologue (compte portant **les deux** rôles `admin` et `promptologue`) |
| **Acteurs secondaires** | Script d'import `scripts/twin9/import-protocole.mjs` (manuel, jeton `X-Migrate-Token`) ; script de déploiement (régénère les fiches confidentielles, UC-SYS-02) ; apprenants (leurs analyses Twin9 utilisent immédiatement les gabarits édités, UC-APP-10) |
| **Portée** | humanome.xyz — vue `#/twin9-atelier`, routes `/api/twin9/admin/protocole*`, `/api/twin9/admin/tester`, `POST /api/admin/twin9/import` |
| **Niveau** | Objectif utilisateur |
| **Cahier des charges** | §3.4 (éditer et versionner le système de prompts), §3.8 et §4.10 (Golden Prompt privé), §7 ; ADR-010 §2 et §6 ; décision AD-D2 (`docs/autorisations.md`) |
| **Statut** | Implémenté (AD-D2 : conjonction des rôles ; D13 : lecture et restauration des versions) |

## Objectif

Permettre aux seuls administrateurs-promptologues de faire évoluer les gabarits
**confidentiels** du Golden Prompt Twin9 — le secret industriel de la
plateforme — directement en ligne : lire, modifier en texte brut, garder
l'historique de chaque version, revenir en arrière sans rien perdre, et vérifier
le rendu d'un gabarit avec des variables d'exemple, sans appel au modèle.

## Déclencheur

L'administrateur-promptologue ouvre « Faire évoluer » → « Atelier Twin9 »
(`#/twin9-atelier`).

## Préconditions

- Le compte porte les rôles `admin` **et** `promptologue` (UC-ADM-01).
- Les gabarits ont été importés en base par le script d'import (A4), qui lit
  `TWIN_V9_DIR` (par défaut `../Twin_v9`, **hors du dépôt**) ; ils ne sont
  jamais dans le dépôt (contrôle `scripts/check-publiable.mjs`).

## Garanties en cas de succès

- Le gabarit modifié devient **immédiatement** celui que le serveur rend pour
  les analyses des apprenants.
- Le contenu précédent est archivé comme nouvelle version, attribuée à son
  auteur ; aucune version n'est jamais réécrite ni supprimée.
- Le contenu n'a transité que vers un client portant les deux rôles.

## Garanties minimales (en cas d'échec)

- Atelier (`/api/twin9/admin/*`) : rien n'est écrit si la saisie est invalide ;
  un refus (401, 403, 404, 422) ne contient jamais le moindre fragment de
  gabarit ni de métadonnée.
- Exception, l'import technique (A4, réservé au détenteur du jeton) : son `422`
  cite le **nom** du fichier fautif, et l'écriture peut être **partielle**
  (anomalie 1).

## Scénario nominal

1. L'utilisateur ouvre `#/twin9-atelier` ; le shell lui a fourni ses rôles et la
   vue vérifie la conjonction admin ∧ promptologue (sinon E1).
2. La vue charge la liste `GET /api/twin9/admin/protocole` : **métadonnées
   seules** (nom hiérarchique, longueur en caractères, variables `{$VAR}`,
   date) sous l'avertissement « Contenu confidentiel — ne pas divulguer ».
3. Il ouvre un gabarit : `GET /api/twin9/admin/protocole/{nom}` (nom encodé,
   ex. `lourd%2F20-greffier`) ; le contenu s'affiche en **texte brut** dans un
   éditeur (jamais interprété comme HTML).
4. Il modifie le texte et clique « Enregistrer » : `PUT
   /api/twin9/admin/protocole/{nom} {content}` (jeton CSRF, vérifié par
   `CsrfMiddleware` avant la route, E6). Le serveur valide le nom et le contenu,
   archive l'ancien contenu comme version `n+1` (au nom de son auteur), écrit le
   nouveau contenu attribué à l'utilisateur, ré-extrait les variables et répond
   `{name, variables, status: "updated"}`. Côté IHM, « Enregistrer » est
   désactivé tant que le contenu est vide ou blanc.
5. La vue affiche « Gabarit « {nom} » enregistré (nouvelle version archivée). »
   et relit la liste.
6. Dès lors, `POST /api/twin9/appel` rend le **nouveau** contenu pour tout
   apprenant (UC-APP-10).

## Scénarios alternatifs

- **A1 — Contenu inchangé** (étape 4) : `status: "unchanged"`, aucune version
  créée ; « Contenu inchangé — aucune nouvelle version. »
- **A2 — Historique et retour arrière** (étape 3) : « Voir les versions » →
  `GET …/{nom}/versions` (métadonnées, plus récente d'abord) ; « Voir » →
  `GET …/{nom}/versions/{v}` (contenu archivé en lecture seule) ; « Restaurer »
  → `POST …/{nom}/restore {version}` : le contenu vivant est d'abord archivé,
  puis la version choisie redevient vivante (`restored_from`) ; restaurer un
  contenu identique au vivant ne crée rien (« La version N est identique au
  gabarit vivant — rien à restaurer. »).
- **A3 — Banc d'essai** (à tout moment) : choix d'un gabarit, un champ par
  variable, « Rendre le gabarit » → `POST /api/twin9/admin/tester {name,
  variables}` → `{rendu, non_resolues}` affiché en texte brut ; **aucun appel
  LLM, aucun débit** ; les fiches confidentielles n'y sont pas injectées.
- **A4 — Import technique** (précondition, par le script manuel
  `scripts/twin9/import-protocole.mjs`, distinct de `deploy.mjs`) : `POST
  /api/admin/twin9/import {files, config?, referentiel?, fiches?}` avec
  `X-Migrate-Token` : chaque fichier est écrit comme par l'atelier (auteur nul,
  versions archivées, réimport identique sans effet) ; les réglages du pipeline,
  la structure du référentiel (nettoyée : num/nom, code/nom) et les fiches
  confidentielles sont stockés ; Twin9 est **activé** ; réponse `{imported}`.
- **A5 — Création par l'API** (étape 4) : un `PUT` sur un nom **valide mais
  inconnu** crée le gabarit (`200`, `status: "created"`, auteur = utilisateur,
  aucune version archivée), aussitôt appelable par `/api/twin9/appel`. Possible
  par l'API seulement : l'IHM n'ouvre que des gabarits listés.

## Scénarios d'erreur

- **E1 — Rôles insuffisants** (étape 1) : sans les deux rôles, la vue affiche
  « Cet atelier est réservé aux administrateurs-promptologues » sans aucun appel
  et la navigation ne propose pas le lien ; l'API répond `401` sans session et
  `403 {"error": "Rôle insuffisant"}` à un promptologue seul **comme** à un
  administrateur seul, sur toutes les routes de contenu.
- **E2 — Gabarit ou version inconnus** (étape 3, A2, A3) : `404` « Gabarit
  introuvable » / « Version introuvable » — y compris pour un nom **hors
  format** en restauration et au banc d'essai (le gabarit est cherché avant
  toute validation du nom). L'étape 4 n'a pas de 404 : voir A5.
- **E3 — Saisie invalide** : à l'étape 4, contenu absent, vide ou ≥ 256 Ko, nom
  hors format → `422` ; en A2, version absente ou non entière → `422` ; au banc
  d'essai (A3), nom absent → `422` ; messages génériques, rien n'est écrit. Côté
  IHM, « Enregistrer » est désactivé pour un contenu vide ou blanc : le `422`
  n'est visible que pour les autres causes (taille, nom) ; la vue affiche alors
  le message et garde le texte saisi.
- **E4 — Import refusé** (A4) : jeton non configuré → `404` ; jeton absent ou
  faux (une session, même d'atelier, ne suffit pas) → `403` ; sans fichier →
  `400` ; fichier invalide → `422 « Fichier invalide : <nom> »` (voir
  l'anomalie 1).
- **E5 — API indisponible ou liste refusée** (étape 2) : copie statique →
  message d'indisponibilité ; tout autre échec de la liste (par ex. `403` si les
  rôles ont été retirés côté serveur) → « Chargement impossible. » ; aucun
  contenu.
- **E6 — Jeton CSRF absent ou faux** (étape 4, A2, A3) : avec une session
  d'atelier valide mais sans `X-CSRF-Token` correct → `403 {"error": "Jeton
  CSRF absent ou invalide"}` ; rien n'est écrit.

## Règles de gestion

- **RG1 — Conjonction AD-D2** : lire ou écrire le contenu, les versions, la
  restauration et le banc d'essai exigent `admin` ∧ `promptologue`
  (`RequireRole::all`) ; la route de liste de l'atelier est gardée comme le
  contenu, mais noms, longueurs et variables restent visibles de **tout
  utilisateur connecté** via `GET /api/twin9/meta` (résidu assumé, ADR-010 §2,
  UC-APP-10). La supervision commerciale reste `admin` seul (UC-ADM-05).
- **RG2 — Nom** : segments `[a-z0-9][a-z0-9_-]*` séparés par `/` (insensible à la
  casse), 190 caractères au plus (un saut de ligne final passe : anomalie 3).
- **RG3 — Contenu** : non vide (hors blancs), strictement inférieur à 256 Ko ;
  affiché et édité en texte brut uniquement.
- **RG4 — Versions** : toute écriture qui change le contenu archive l'ancien
  contenu (numéro croissant par gabarit, auteur conservé) ; une restauration est
  une écriture comme une autre ; l'historique n'est jamais réécrit.
- **RG5 — Variables** : `{$VAR}` avec `VAR = [A-Z_][A-Z0-9_]*`, dans l'ordre de
  première apparition, sans doublon (syntaxe du Twin9 Python).
- **RG6 — Rendu du banc d'essai** : non strict, en une passe ; les variables
  absentes restent telles quelles ; `non_resolues` liste les motifs `{$…}`
  restant dans le **rendu**, y compris ceux apportés par les valeurs saisies
  (anomalie 2).
- **RG7 — Messages génériques** : aucune erreur des routes de l'atelier ne cite
  un gabarit (l'import, lui, cite le nom du fichier fautif, E4).

## Données et RGPD

| Donnée | Traitement |
|---|---|
| Gabarits (secret industriel) | En base (`twin9_protocole`), jamais dans le dépôt ; le **contenu** n'est jamais envoyé à un client sans les deux rôles ; les **métadonnées** (noms, longueurs, variables) le sont à tout utilisateur connecté (`/api/twin9/meta`) |
| Historique | `twin9_protocole_versions` ; auteur mis à `NULL` si son compte est supprimé (le gabarit appartient à la plateforme) |
| Auteur d'une édition | `updated_by` / `created_by` (identifiant de compte) |
| Fiches confidentielles | Réglage `twin9_fiches`, écrit par l'import **et** régénéré à chaque déploiement depuis la base (`/api/admin/generate-fiches`, garde-fou 409, UC-SYS-02) ; jamais exposé |

## Code sollicité

| Couche | Élément | Rôle |
|---|---|---|
| Front | `web/src/router.js` — `parseHash` | Route `#/twin9-atelier` |
| Front | `web/src/nav.js` — `navGroups` (`allRoles`) | Lien visible seulement avec les deux rôles |
| Front | `web/src/views/Twin9AtelierView.jsx` | Garde, liste, éditeur texte brut, historique, aperçu, restauration, banc d'essai |
| Front | `web/src/api/twin9.js` — `fetchProtocoleList`, `fetchProtocole`, `saveProtocole`, `fetchProtocoleVersions`, `fetchProtocoleVersion`, `restoreProtocoleVersion`, `testerProtocole` | Client de l'atelier (noms encodés) |
| API | `GET/PUT /api/twin9/admin/protocole{/nom}`, `…/versions{/v}`, `…/restore`, `POST /api/twin9/admin/tester` — `api/src/routes/twin9.php` | Routes de contenu (conjonction) |
| API | `POST /api/admin/twin9/import` — `api/src/routes/twin9.php` | Import technique |
| API | `api/src/Middleware/CsrfMiddleware.php` | Jeton CSRF des écritures de l'atelier (E6) — logique unitaire couverte par UC-CPT-02-U07 |
| Domaine | `api/src/Twin9/ProtocoleRepository.php` — `list`, `get`, `put`, `versions`, `version`, `restore`, `render`, `extractVariables`, `assertValidName`, `assertValidContent` | Dépôt versionné des gabarits |
| Domaine | `api/src/Middleware/RequireRole.php` — `all` | Garde conjonctive |
| Domaine | `api/src/Twin9/Twin9Config.php`, `api/src/Twin9/FicheStore.php` | Activation, réglages, référentiel, fiches (import) |

## Jeux de tests

### Tests unitaires

| ID | Cible | Vérifie | Fichier |
|---|---|---|---|
| UC-PRO-08-U01 | `parseHash` | `#/twin9-atelier` distinct de `#/admin/twin9` | `web/test/usecases/unit/uc-pro-08-editer-gabarits-twin9.test.jsx` |
| UC-PRO-08-U02 | `navGroups` | Lien « Atelier Twin9 » seulement avec les deux rôles (RG1) | idem |
| UC-PRO-08-U03 | client API de l'atelier | Noms hiérarchiques encodés, méthodes, corps, CSRF | idem |
| UC-PRO-08-U04 | `Twin9AtelierView` | Contenu et rendu en texte brut, champs par variable (RG3) | idem |
| UC-PRO-08-U05 | `ProtocoleRepository::put`, `versions`, `version` | created / updated / unchanged, archivage attribué (RG4) ; compte supprimé → auteur `NULL`, versions intactes (RGPD) | `api/tests/UseCases/Unit/UcPro08EditerGabaritsTwin9Test.php` |
| UC-PRO-08-U06 | `ProtocoleRepository::restore` | Restauration non destructive, 404 | idem |
| UC-PRO-08-U07 | `assertValidName`, `assertValidContent` | Bornes du nom et du contenu, rien d'écrit (RG2-RG3) ; **anomalie 3 figée** (saut de ligne final) | idem |
| UC-PRO-08-U08 | `extractVariables`, `list` | Variables ordonnées ; métadonnées sans contenu (RG5) | idem |
| UC-PRO-08-U09 | `RequireRole::all` | Sans session → 401 ; admin seul, promptologue seul → 403 ; les deux → passage avec `userId` et rôles ; au moins un rôle | idem |
| UC-PRO-08-U10 | `ProtocoleRepository::render` | Banc d'essai : une passe, variables saisies seules, fiches non injectées, absentes listées (RG6) ; **anomalie 2 figée** | idem |
| UC-PRO-08-U11 | `FicheStore::store`, `Twin9Config::update`, `setReferentiel` | Briques de l'import : fiches nettoyées, référentiel réduit à num/nom et code/nom (ni fiche ni en-tête), pipeline, activation (A4) | idem |

### Tests fonctionnels

| ID | Scénario | Niveau | Vérifie | Fichier |
|---|---|---|---|---|
| UC-PRO-08-F01 | Nominal | IHM | `<App/>` : liste, ouverture, édition, PUT avec CSRF, message, liste relue | `web/test/usecases/functional/uc-pro-08-editer-gabarits-twin9.test.jsx` |
| UC-PRO-08-F02 | A1 | IHM | Contenu identique : « aucune nouvelle version » | idem |
| UC-PRO-08-F03 | A2 | IHM | Historique, aperçu d'une version, restauration, historique relu ; restauration d'une version identique → « rien à restaurer » | idem |
| UC-PRO-08-F04 | A3 | IHM | Banc d'essai : rendu, non résolues, aucun appel LLM | idem |
| UC-PRO-08-F05 | E1 | IHM | Admin seul : atelier réservé, aucun appel, pas de lien | idem |
| UC-PRO-08-F06 | E3 | IHM | Contenu vide ou blanc : « Enregistrer » désactivé, aucun PUT ; 422 à l'enregistrement : message, texte conservé | idem |
| UC-PRO-08-F07 | E5 | IHM | API indisponible : message ; liste refusée (403) : « Chargement impossible. » ; aucun contenu | idem |
| UC-PRO-08-F08 | Nominal, A1, A2, A3 | API | Liste → lecture `%2F` → édition → PUT identique « unchanged » → versions → restauration → restauration identique « unchanged » → banc d'essai sans appel au modèle ni débit | `api/tests/UseCases/Functional/UcPro08EditerGabaritsTwin9Test.php` |
| UC-PRO-08-F09 | Nominal (étape 6) | API | L'appel d'un apprenant rend aussitôt le gabarit édité | idem |
| UC-PRO-08-F10 | A4 | API | Import : gabarits, réglages, référentiel, fiches (injectées ensuite dans l'appel d'un apprenant), activation, idempotence | idem |
| UC-PRO-08-F11 | E1 | API | 401 visiteur ; 403 promptologue seul et admin seul, sans fragment | idem |
| UC-PRO-08-F12 | E2, A5 | API | 404 (statut et message) gabarit / version inconnus, nom hors format en restauration et banc d'essai ; PUT sur un nom valide inconnu → création | idem |
| UC-PRO-08-F13 | E3 | API | 422 sur chaque saisie invalide, rien d'écrit | idem |
| UC-PRO-08-F14 | E4 | API | 404 / 403 / 400 (statuts et messages) à l'import ; **anomalie 1 figée** : import partiel, au premier import comme au réimport (Twin9 reste activé, gabarits mélangés) | idem |
| UC-PRO-08-F15 | E6 | API | Sans jeton CSRF ou jeton faux → 403 sur PUT, restauration, banc d'essai ; rien d'écrit | idem |
| UC-PRO-08-F16 | Anomalies 3-5 | API | Clé d'import numérique refusée ; nom à saut de ligne final accepté ; gabarit « …/versions » créé mais illisible | idem |

### Tests existants liés (non-régression)

- `api/tests/Twin9ProtocoleTest.php` — import, matrice de rôles complète, CRUD, versions, restauration, banc d'essai, extraction.
- `web/src/views/Twin9AtelierView.test.jsx` — garde, édition, versions, banc d'essai (noms plats).
- `web/src/nav.test.js` — conjonction des rôles dans la navigation.
- `scripts/check-publiable.mjs` — aucun gabarit Twin9 dans les fichiers publiables.

### Exécuter

```sh
docker compose run --rm php vendor/bin/phpunit --filter UcPro08 --testdox
cd web && npx vitest run test/usecases/unit/uc-pro-08 test/usecases/functional/uc-pro-08
```

## Anomalies constatées

1. **Import non atomique.** `POST /api/admin/twin9/import` écrit les fichiers un
   par un sans transaction : si un fichier du lot est invalide, la réponse est
   `422` mais les fichiers valides qui le précèdent sont **déjà** écrits ; la
   configuration, le référentiel et les fiches ne sont pas mis à jour, et Twin9
   garde son état d'activation antérieur. Au premier import il reste désactivé ;
   lors d'un **réimport** (cas normal en production) il reste **activé** et sert
   aux apprenants un mélange de gabarits neufs et anciens. Figé par
   UC-PRO-08-F14.
2. **Variables « non résolues » calculées sur le rendu.**
   `ProtocoleRepository::render` cherche les motifs `{$X}` dans le texte
   **rendu** et non dans le gabarit : une valeur saisie contenant `{$X}` fait
   apparaître `X` dans `non_resolues`, même si `X` a été fourni. Au banc
   d'essai, le rapport est faux ; dans `/api/twin9/appel`, qui partage
   `render()`, cela provoque un `422 Variables non résolues` et bloque l'analyse
   payante (anomalie 2 de UC-APP-10). Figé par UC-PRO-08-U10.
3. **Nom à saut de ligne final accepté.** `NAME_PATTERN` se termine par `$` sans
   le modificateur `D` : en PCRE, `$` accepte un saut de ligne final, donc
   `assertValidName("lourd/20-greffier\n")` passe, contrairement à RG2. Par
   l'import (dont les noms sont les clés JSON), on peut stocker un gabarit
   distinct de « lourd/20-greffier ». Figé par UC-PRO-08-U07 et UC-PRO-08-F16.
4. **Clé d'import purement numérique refusée.** `json_decode(…, true)`
   transforme une clé comme « 20 » en entier : l'import répond `422 « Fichier
   invalide : 20 »` pour un nom pourtant valide selon RG2. Figé par
   UC-PRO-08-F16.
5. **Gabarit « …/versions » inaccessible.** Les routes `GET
   …/{nom}/versions` et `…/versions/{v}`, déclarées avant la route générique,
   captent un gabarit dont le dernier segment est « versions » (« x/versions ») :
   il peut être créé par `PUT` ou par l'import, mais jamais relu dans l'atelier,
   qui renvoie les versions de « x » ou `404`. Figé par UC-PRO-08-F16.

## Limites

- Le front encode le `/` des noms hiérarchiques (`%2F`) ; Slim le décode et les
  tests en processus passent, mais un serveur Apache configuré avec
  `AllowEncodedSlashes Off` (valeur par défaut) refuse ces URL avant PHP — à
  vérifier sur l'hébergement (non vérifiable ici).
- Le banc d'essai n'injecte pas les fiches confidentielles : `COMPETENCE_FICHE`
  et `POLE_FICHES` y apparaissent comme non résolues (UC-PRO-08-F08).
- Les éditions de l'atelier ne sont pas journalisées dans l'audit : seule
  l'attribution `updated_by` / `created_by` garde la trace de l'auteur.
- Le script d'import `scripts/twin9/import-protocole.mjs` (source `TWIN_V9_DIR`
  hors dépôt, noms et tailles seulement dans ses journaux) n'est pas testé : il
  s'exécute dès son chargement et n'exporte aucune fonction ; seule la route
  qu'il appelle (`POST /api/admin/twin9/import`) l'est (UC-PRO-08-F10, F14,
  F16).
