# UC-PRO-08 — Éditer les gabarits du Golden Prompt Twin9

| Champ | Valeur |
|---|---|
| **Acteur principal** | Administrateur-promptologue (compte portant **les deux** rôles `admin` et `promptologue`) |
| **Acteurs secondaires** | Script de déploiement (import des gabarits, jeton `X-Migrate-Token`) ; apprenants (leurs analyses Twin9 utilisent immédiatement les gabarits édités, UC-APP-10) |
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
- Les gabarits ont été importés en base par le script de déploiement (A4) ;
  ils ne sont jamais dans le dépôt (dossier source gitignoré, contrôle
  `scripts/check-publiable.mjs`).

## Garanties en cas de succès

- Le gabarit modifié devient **immédiatement** celui que le serveur rend pour
  les analyses des apprenants.
- Le contenu précédent est archivé comme nouvelle version, attribuée à son
  auteur ; aucune version n'est jamais réécrite ni supprimée.
- Le contenu n'a transité que vers un client portant les deux rôles.

## Garanties minimales (en cas d'échec)

- Rien n'est écrit si la saisie est invalide.
- Un refus (401, 403, 404, 422) ne contient jamais le moindre fragment de
  gabarit ni de métadonnée.

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
   /api/twin9/admin/protocole/{nom} {content}` (jeton CSRF). Le serveur valide le
   nom et le contenu, archive l'ancien contenu comme version `n+1` (au nom de son
   auteur), écrit le nouveau contenu attribué à l'utilisateur, ré-extrait les
   variables et répond `{name, variables, status: "updated"}`.
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
  contenu identique au vivant ne crée rien.
- **A3 — Banc d'essai** (à tout moment) : choix d'un gabarit, un champ par
  variable, « Rendre le gabarit » → `POST /api/twin9/admin/tester {name,
  variables}` → `{rendu, non_resolues}` affiché en texte brut ; **aucun appel
  LLM, aucun débit** ; les fiches confidentielles n'y sont pas injectées.
- **A4 — Import technique** (précondition, par le script de déploiement) :
  `POST /api/admin/twin9/import {files, config?, referentiel?, fiches?}` avec
  `X-Migrate-Token` : chaque fichier est écrit comme par l'atelier (auteur nul,
  versions archivées, réimport identique sans effet) ; les réglages du pipeline,
  la structure du référentiel et les fiches confidentielles sont stockés ;
  Twin9 est **activé** ; réponse `{imported}`.

## Scénarios d'erreur

- **E1 — Rôles insuffisants** (étape 1) : sans les deux rôles, la vue affiche
  « Cet atelier est réservé aux administrateurs-promptologues » sans aucun appel
  et la navigation ne propose pas le lien ; l'API répond `401` sans session et
  `403 {"error": "Rôle insuffisant"}` à un promptologue seul **comme** à un
  administrateur seul, sur toutes les routes de contenu.
- **E2 — Gabarit ou version inconnus** (étapes 3-4, A2, A3) : `404` « Gabarit
  introuvable » / « Version introuvable ».
- **E3 — Saisie invalide** (étape 4, A2, A3) : contenu absent, vide ou ≥ 256 Ko,
  nom hors format, version absente ou non entière, banc d'essai sans nom →
  `422` au message générique ; rien n'est écrit ; la vue affiche le message et
  garde le texte saisi.
- **E4 — Import refusé** (A4) : jeton non configuré → `404` ; jeton absent ou
  faux (une session, même d'atelier, ne suffit pas) → `403` ; sans fichier →
  `400` ; fichier invalide → `422` (voir l'anomalie).
- **E5 — API indisponible** (étape 2) : message d'indisponibilité, aucun contenu.

## Règles de gestion

- **RG1 — Conjonction AD-D2** : lire ou écrire le contenu (liste comprise, qui
  révèle la structure du protocole), les versions, la restauration et le banc
  d'essai exigent `admin` ∧ `promptologue` (`RequireRole::all`) ; la
  supervision commerciale reste `admin` seul (UC-ADM-05).
- **RG2 — Nom** : segments `[a-z0-9][a-z0-9_-]*` séparés par `/` (insensible à la
  casse), 190 caractères au plus.
- **RG3 — Contenu** : non vide (hors blancs), strictement inférieur à 256 Ko ;
  affiché et édité en texte brut uniquement.
- **RG4 — Versions** : toute écriture qui change le contenu archive l'ancien
  contenu (numéro croissant par gabarit, auteur conservé) ; une restauration est
  une écriture comme une autre ; l'historique n'est jamais réécrit.
- **RG5 — Variables** : `{$VAR}` avec `VAR = [A-Z_][A-Z0-9_]*`, dans l'ordre de
  première apparition, sans doublon (syntaxe du Twin9 Python).
- **RG6 — Rendu du banc d'essai** : non strict, en une passe ; les variables
  absentes restent telles quelles et sont listées.
- **RG7 — Messages génériques** : aucune erreur ne cite un gabarit.

## Données et RGPD

| Donnée | Traitement |
|---|---|
| Gabarits (secret industriel) | En base (`twin9_protocole`), jamais dans le dépôt ni envoyés à un client sans les deux rôles |
| Historique | `twin9_protocole_versions` ; auteur mis à `NULL` si son compte est supprimé (le gabarit appartient à la plateforme) |
| Auteur d'une édition | `updated_by` / `created_by` (identifiant de compte) |
| Fiches confidentielles | Réglage `twin9_fiches`, écrit par l'import, jamais exposé |

## Code sollicité

| Couche | Élément | Rôle |
|---|---|---|
| Front | `web/src/router.js` — `parseHash` | Route `#/twin9-atelier` |
| Front | `web/src/nav.js` — `navGroups` (`allRoles`) | Lien visible seulement avec les deux rôles |
| Front | `web/src/views/Twin9AtelierView.jsx` | Garde, liste, éditeur texte brut, historique, aperçu, restauration, banc d'essai |
| Front | `web/src/api/twin9.js` — `fetchProtocoleList`, `fetchProtocole`, `saveProtocole`, `fetchProtocoleVersions`, `fetchProtocoleVersion`, `restoreProtocoleVersion`, `testerProtocole` | Client de l'atelier (noms encodés) |
| API | `GET/PUT /api/twin9/admin/protocole{/nom}`, `…/versions{/v}`, `…/restore`, `POST /api/twin9/admin/tester` — `api/src/routes/twin9.php` | Routes de contenu (conjonction) |
| API | `POST /api/admin/twin9/import` — `api/src/routes/twin9.php` | Import technique |
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
| UC-PRO-08-U05 | `ProtocoleRepository::put`, `versions`, `version` | created / updated / unchanged, archivage attribué (RG4) | `api/tests/UseCases/Unit/UcPro08EditerGabaritsTwin9Test.php` |
| UC-PRO-08-U06 | `ProtocoleRepository::restore` | Restauration non destructive, 404 | idem |
| UC-PRO-08-U07 | `assertValidName`, `assertValidContent` | Bornes du nom et du contenu, rien d'écrit (RG2-RG3) | idem |
| UC-PRO-08-U08 | `extractVariables`, `list` | Variables ordonnées ; métadonnées sans contenu (RG5) | idem |
| UC-PRO-08-U09 | `RequireRole::all` | Sans session → 401 avant traitement ; au moins un rôle | idem |
| UC-PRO-08-U10 | `ProtocoleRepository::render` | Banc d'essai : variables saisies seules, fiches non injectées, absentes listées (RG6) | idem |
| UC-PRO-08-U11 | `FicheStore::store`, `Twin9Config::update`, `setReferentiel` | Briques de l'import : données nettoyées, pipeline, activation (A4) | idem |

### Tests fonctionnels

| ID | Scénario | Niveau | Vérifie | Fichier |
|---|---|---|---|---|
| UC-PRO-08-F01 | Nominal | IHM | `<App/>` : liste, ouverture, édition, PUT avec CSRF, message, liste relue | `web/test/usecases/functional/uc-pro-08-editer-gabarits-twin9.test.jsx` |
| UC-PRO-08-F02 | A1 | IHM | Contenu identique : « aucune nouvelle version » | idem |
| UC-PRO-08-F03 | A2 | IHM | Historique, aperçu d'une version, restauration, historique relu | idem |
| UC-PRO-08-F04 | A3 | IHM | Banc d'essai : rendu, non résolues, aucun appel LLM | idem |
| UC-PRO-08-F05 | E1 | IHM | Admin seul : atelier réservé, aucun appel, pas de lien | idem |
| UC-PRO-08-F06 | E3 | IHM | 422 à l'enregistrement : message, texte conservé | idem |
| UC-PRO-08-F07 | E5 | IHM | API indisponible : message, aucun contenu | idem |
| UC-PRO-08-F08 | Nominal, A2, A3 | API | Liste → lecture `%2F` → édition → versions → restauration → banc d'essai | `api/tests/UseCases/Functional/UcPro08EditerGabaritsTwin9Test.php` |
| UC-PRO-08-F09 | Nominal (étape 6) | API | L'appel d'un apprenant rend aussitôt le gabarit édité | idem |
| UC-PRO-08-F10 | A4 | API | Import : gabarits, réglages, référentiel, fiches, activation, idempotence | idem |
| UC-PRO-08-F11 | E1 | API | 401 visiteur ; 403 promptologue seul et admin seul, sans fragment | idem |
| UC-PRO-08-F12 | E2 | API | 404 gabarit / version inconnus | idem |
| UC-PRO-08-F13 | E3 | API | 422 sur chaque saisie invalide, rien d'écrit | idem |
| UC-PRO-08-F14 | E4 | API | 404 / 403 / 400 à l'import ; **anomalie figée** : import partiel | idem |

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
   `422` mais les fichiers valides qui le précèdent sont **déjà** écrits (et
   Twin9 reste désactivé, la configuration n'étant pas mise à jour). Figé par
   UC-PRO-08-F14.

## Limites

- Le front encode le `/` des noms hiérarchiques (`%2F`) ; Slim le décode et les
  tests en processus passent, mais un serveur Apache configuré avec
  `AllowEncodedSlashes Off` (valeur par défaut) refuse ces URL avant PHP — à
  vérifier sur l'hébergement (non vérifiable ici).
- Le banc d'essai n'injecte pas les fiches confidentielles : `COMPETENCE_FICHE`
  et `POLE_FICHES` y apparaissent comme non résolues (UC-PRO-08-F08).
- Les éditions de l'atelier ne sont pas journalisées dans l'audit : seule
  l'attribution `updated_by` / `created_by` garde la trace de l'auteur.
