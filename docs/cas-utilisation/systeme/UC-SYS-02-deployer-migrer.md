# UC-SYS-02 — Déployer, migrer et importer

| Champ | Valeur |
|---|---|
| **Acteur principal** | Outil de déploiement (`scripts/deploy/deploy.mjs`), lancé par le mainteneur depuis son poste |
| **Acteurs secondaires** | Mainteneur (prépare la release, choisit `FICHES_FORCE`, amorce le premier admin) ; hébergement OVH mutualisé (FTP, Apache, MySQL) ; futur administrateur (UC-ADM-01) |
| **Portée** | Hors navigateur et hors rôles : routes à jeton `X-Migrate-Token` (`/api/admin/migrate`, `/import-referentiel`, `/seed-competences`, `/generate-fiches`, `/dump-fiches`, `/import-prompt-package`, `/grant-role`, `/default-package`), front-controller `www/api/index.php` + `app/current.txt`, scripts CLI équivalents |
| **Niveau** | Sous-fonction technique (exploitation) |
| **Cahier des charges** | §5 (hébergement mutualisé, clone déployable) ; secrets hors dépôt : `CLAUDE.md`, `docs/hebergement.md`, ADR-008 ; principe RGPD n°5 — journalisation minimale (`CLAUDE.md`, `docs/rgpd-registre.md`) ; ADR-003, ADR-008 ; `docs/deploiement.md`, `docs/administration.md` (amorçage) |
| **Statut** | Implémenté (P13, compléments P10/P12 et source unique des fiches) |

## Objectif

Mettre en ligne une nouvelle version de l'API sur un hébergement **sans SSH**
et **sans processus longs**, sans jamais servir une release à moitié copiée :
téléverser la release, basculer un pointeur, puis piloter à distance, par des
routes protégées par un jeton secret, les migrations de schéma et les imports
de données de référence (référentiel, compétences atomiques, fiches Twin9,
paquets de prompts) — de façon **idempotente** et **rejouable**. Le même
outillage amorce le premier administrateur et fixe le paquet de prompts par
défaut.

## Déclencheur

Le mainteneur lance `./scripts/deploy/stage-api.sh` puis
`node scripts/deploy/deploy.mjs api` (ou `rollback`, `releases`).

## Préconditions

- `.env.deploy` (gitignoré) contient `FTP_HOST`, `FTP_USER`,
  `FTP_PASSWORD`, `FTP_SECURE=false` (le cluster OVH ne gère pas FTPS),
  `MIGRATE_TOKEN` et éventuellement `SITE_URL`.
- Le même `MIGRATE_TOKEN` est configuré côté serveur dans
  `~/app/shared/.env` (hors webroot) ; sans lui, les routes « n'existent pas ».
- La base MySQL est configurée (`DB_HOST`, `DB_NAME`, `DB_USER`,
  `DB_PASSWORD`).
- La release a été préparée par `stage-api.sh` : `build/api-release/` (sources,
  `public/`, `config/`, `schemas/`, `scripts/migrations`, `scripts/data`,
  `vendor/` sans dépendances de dev, fichier `VERSION`) et
  `build/prompt-packages/*.json` régénérés.

## Garanties en cas de succès

- La nouvelle release est servie par `www/api/index.php` dès l'écriture de
  `app/current.txt`, **écrit en dernier** ; les trois releases les plus
  récentes sont conservées (rollback possible).
- Le schéma est à jour (migrations appliquées une seule fois, dans l'ordre) ;
  référentiel, compétences, fiches et paquets sont présents, chaque import
  étant sans effet s'il a déjà eu lieu.
- `GET /api/health` répond `200 {"status":"ok", …}` (smoke final). Ce smoke
  ne vérifie ni la valeur de `db` ni l'application des migrations : `/health`
  répond `200 {"status":"ok"}` même avec `db: "error"` ; et sans
  `MIGRATE_TOKEN` dans `.env.deploy`, `deploy.mjs` saute les étapes 4 à 8
  (simple avertissement) et termine par « api deploy done ».

## Garanties minimales (en cas d'échec)

- Un upload interrompu ne bascule jamais la production (pointeur non réécrit).
- Une étape distante en échec arrête `deploy.mjs` (exception) ; les étapes déjà
  jouées restent valables et se rejouent sans effet.
- Le jeton n'est jamais renvoyé. `migrate`, `import-referentiel`,
  `import-prompt-package`, `grant-role` et `default-package` répondent un
  `500` générique (détail dans le journal serveur seulement) ;
  `seed-competences` et `generate-fiches` renvoient en revanche le message brut
  de l'exception (SQLSTATE, nom de base…) au porteur du jeton (AN-2).
- Le garde-fou des fiches refuse d'écraser un `fiche_md` divergent d'une
  compétence **générée** (`409`, aucune écriture) ; il ne voit ni les en-têtes
  de pôle ni les codes disparus de la génération, et réécrit le réglage à
  chaque réponse `200` (AN-1).

## Scénario nominal

1. Le mainteneur construit et synchronise le front statique (`npm run build`,
   `deploy.mjs static` : manifeste SHA-256, seuls les fichiers modifiés partent).
2. `stage-api.sh` prépare `build/api-release/` et les paquets de prompts publiés.
3. `deploy.mjs api` téléverse la release dans `app/releases/<horodatage>-<version>/`
   et le front-controller dans `www/api/`, **puis** écrit
   `app/current.txt` (`releases/<nom>`), puis élague les releases au-delà de 3.
4. Il appelle `POST /api/admin/migrate` (en-tête `X-Migrate-Token`) :
   `MigrationRunner::run` prend le verrou MySQL `GET_LOCK('humanome_migrate', 30)`,
   crée `schema_migrations` si besoin et applique chaque `.sql` non encore
   enregistré, dans l'ordre lexicographique → `200 {applied: [...], skipped: n}`.
5. `POST /api/admin/import-referentiel` avec `respire-v7.json` (puis
   `respire-v7.1.0.json` s'il existe) : validation par le schéma, recalcul et
   contrôle du `contentHash`, insertion comme version **publiée** →
   `200 {status: "imported"|"unchanged", id, semver, contentHash}`.
6. `POST /api/admin/seed-competences` : la **route** lit le corpus versionné
   `scripts/data/competences-v7.json` et `fiches-v7.json` de la release (ce
   dernier facultatif) et passe les tableaux à `CompetenceSeeder::seed`, qui
   crée les pôles et les 61 compétences atomiques, vérifie le **gate de
   parité** (corps assemblé = référentiel publié) et pose le lockfile →
   `200 {poles, imported, unchanged, backfilled, fiches, parityHash, lockLinks}`.
7. `POST /api/admin/generate-fiches {force}` : `FicheGenerator` régénère depuis
   la base la structure des fiches ; la route compare, octet par octet, le
   `fiche_md` de chaque compétence **générée** à celui du réglage
   `twin9_fiches` (ni les en-têtes de pôle ni les codes absents de la
   génération ne sont comparés) → `200 {status: "unchanged"}` quand ils
   coïncident ; le réglage est alors **réécrit** avec la structure générée
   (AN-1).
8. `POST /api/admin/import-prompt-package` pour chaque
   `build/prompt-packages/*.json` → `200 {status, id, version, contentHash}`.
9. `GET /api/health` → `200 {"status":"ok","version":…,"db":"ok"}` ; le script
   exige un `200` et la chaîne `"ok"` — critère qui ne détecte pas une base en
   panne (`"status":"ok"` est inconditionnel). Chaque étape en échec (réponse
   non 2xx) lève une exception : les étapes suivantes ne sont pas jouées.

## Scénarios alternatifs

- **A1 — Redéploiement à l'identique** (étapes 4-8) : tout est idempotent —
  `applied: []`, imports `unchanged`, seed `imported: 0`, fiches `unchanged`.
- **A2 — Amorcer le premier administrateur** (hors séquence ; aussi pour
  ré-amorcer une plateforme restée sans administrateur, UC-ADM-01) : après
  l'inscription normale du compte, `POST /api/admin/grant-role
  {email, role: "admin"}` → `200 {email, role, status: "granted"}` (ou
  `unchanged`) ; effet immédiat, sans reconnexion (rôles relus à chaque
  requête). Audit `role_granted` **sans acteur** (`user_id` nul) et sans
  e-mail. Ensuite, les rôles se gèrent dans `#/admin/roles` (UC-ADM-01).
- **A3 — Valider le paquet par défaut hors navigateur** : `POST
  /api/admin/default-package {id, version}` → `200 {id, version, status:
  "default"}` ; `GET /api/prompt-packages/default` sert ce couple ; une
  proposition promptologue identique est consommée, une proposition
  différente est conservée. (Équivalent en session : UC-ADM-03.)
- **A4 — Évolution de fiche assumée / premier déploiement** (étape 7) : le
  garde-fou renvoie `409 {status: "diff", changed: [...]}` (au tout premier
  déploiement, les 61 fiches) et `deploy.mjs` s'arrête ; après vérification,
  le mainteneur relance **toute** la séquence avec `FICHES_FORCE=1` →
  `{force: true}` → `200 {status: "applied", poles: 7, competences: 61,
  changed}`.
- **A5 — Resynchroniser le corpus** : `GET /api/admin/dump-fiches` renvoie
  `{poleHeaders, fiches}` depuis la base (après une édition gouvernée dans
  l'atelier), pour mettre à jour `scripts/data/fiches-v7.json`.
- **A6 — Retour arrière** : `deploy.mjs rollback` réécrit `current.txt` vers
  l'avant-dernière release (code seul ; migrations forward-only compatibles),
  puis sonde `/api/health`. `deploy.mjs releases` liste les releases et la
  release active.
- **A7 — Poste de développement (CLI)** : `php scripts/migrate.php`,
  `php scripts/import-referentiel.php [fichier]`,
  `php scripts/import-prompt-packages.php [fichiers…]`,
  `php scripts/seed-competences.php` jouent les mêmes briques que les routes
  (code de sortie 0 en succès ou sans effet).

## Scénarios d'erreur

- **E1 — Jeton non configuré côté serveur** (étapes 4-8) : `404 {"error":"Not
  found"}` sur toutes les routes à jeton (elles « n'existent pas »).
- **E2 — En-tête absent ou jeton faux** : `403 {"error":"Forbidden"}`
  (comparaison en temps constant).
- **E3 — Base non configurée** : `503 {"error":"Database not configured"}`.
- **E4 — Corps illisible ou invalide**, route par route :
  `import-referentiel` et `import-prompt-package` : corps non JSON → `400`,
  document non conforme au schéma → `422 {"error":"Invalid document",
  "details":{…}}` ; `grant-role` et `default-package` : corps non JSON, champs
  requis absents ou rôle inconnu → `422` ; `generate-fiches` : tout corps
  autre que `{"force": true}` (illisible, `force` non booléen comme `1` ou
  `"true"`) vaut `force: false` ; `seed-competences` ignore le corps.
- **E5 — Conflit d'immuabilité** : même `(id, version)` de paquet avec un autre
  contenu, ou `contentHash` déclaré incohérent avec le référentiel → `409`.
- **E6 — Garde-fou des fiches** (étape 7) : `fiche_md` divergent d'une
  compétence générée, sans `force` → `409 {status: "diff", changed: [codes]}`,
  aucune écriture ; `deploy.mjs` s'arrête (« fiche generation blocked »).
  (En-têtes de pôle et codes disparus ne déclenchent pas ce refus : AN-1.)
- **E7 — Échec technique** (base injoignable, migration invalide) : `500`
  générique (« Migration failed, see server log », « Import failed, see server
  log »…), détail seulement dans le journal serveur — sauf `seed-competences`
  et `generate-fiches`, qui renvoient le message de l'exception (AN-2). Une
  migration en échec n'est pas enregistrée, mais les instructions DDL déjà
  exécutées **persistent** (auto-validation MySQL, aucun rollback) : son rejeu
  n'est sûr que si ses instructions sont idempotentes (`IF NOT EXISTS`…) ;
  sinon il faut une intervention manuelle sur la base (difficile sans SSH).
- **E8 — Cible inconnue** : compte inconnu ou supprimé → `404 "Unknown
  account"` (`grant-role`) ; version non publiée **ou privée** (Golden) →
  `404 "Unknown published version"` (`default-package`).
- **E9 — Pointeur de release invalide** : `current.txt` absent, vide ou hors
  motif `releases/[A-Za-z0-9._-]+` → `503 {"status":"error","message":"No
  release deployed"}` ; release pointée absente → `503 … "Release entry point
  missing"`.
- **E10 — CLI sans base** : `DB_HOST` vide → message sur la sortie d'erreur,
  code 1 ; fichier d'entrée introuvable (`import-referentiel.php`,
  `import-prompt-packages.php`) → code 1.
- **E11 — Seed impossible** (étape 6) : référentiel non encore publié →
  `500 « Seed failed: Aucune version publiée du référentiel… »` ; gate de
  parité en échec → `500 « Seed failed: Gate de parité ÉCHOUÉ… »` ; contenu
  riche manquant pour un code → `500 « Seed failed: Contenu riche manquant
  pour … »` ; `competences-v7.json` absent de la release → `500
  « competences-v7.json introuvable dans le release »`. Dans tous ces cas,
  `deploy.mjs` s'arrête (« competence seed failed »). À l'inverse,
  `fiches-v7.json` absent ne provoque **aucune** erreur : seed sans fiches
  (`fiches: 0`) et en-têtes de pôle réécrits à `NULL`.

## Règles de gestion

- **RG1** — Modèle de confiance ADR-008 : jeton long dans
  `~/app/shared/.env`, transmis **en en-tête** (jamais en query string ni dans
  les journaux), comparé par `hash_equals` ; aucun rôle, aucune session.
- **RG2** — CSRF : seule `/api/admin/migrate` figure dans les exemptions du
  middleware CSRF. Les autres routes à jeton passent parce que l'outil
  n'envoie **aucun cookie** ; appelées depuis un navigateur porteur d'une
  session, sans `X-CSRF-Token`, elles répondent `403 « Jeton CSRF absent ou
  invalide »`.
- **RG3** — Migrations forward-only (expand/contract), ordre lexicographique,
  une transaction par fichier (le DDL MySQL s'auto-valide : un fichier en
  échec laisse son DDL partiel), verrou `GET_LOCK` tenu pendant tout le
  passage et relâché même en cas d'échec (`finally`), table
  `schema_migrations`.
- **RG4** — Imports idempotents par empreinte de contenu ; une version publiée
  est immuable. Le `contentHash` du référentiel est son identité
  **structurelle** (pôles, compétences) : libellé et définitions n'y entrent pas.
- **RG5** — Le seed exige un référentiel publié et échoue si le corps assemblé
  diverge du publié (gate de parité) ; le lockfile est écrit une fois par
  (release, compétence) (`INSERT IGNORE` : une version plus récente ne
  remplace pas le lien initial). `lockLinks` compte les insertions
  **tentées**, pas les lignes écrites (61 à chaque passage).
- **RG6** — `current.txt` est écrit en dernier ; le front-controller n'accepte
  qu'un chemin relatif de motif `releases/[A-Za-z0-9._-]+` (qui admet
  toutefois `releases/..` et `releases/.`, AN-4) et transmet le dossier des
  secrets (`HUMANOME_SHARED_DIR = ~/app/shared`) à la release ; ses refus
  posent le code HTTP `503`.
- **RG7** — Journalisation minimale : `grant-role` trace `role_granted`
  `{targetUserId, role, status}` avec acteur nul, **y compris** pour un
  `unchanged`.

## Données et RGPD

| Donnée | Traitement |
|---|---|
| `MIGRATE_TOKEN`, identifiants FTP et MySQL | Hors dépôt : `.env.deploy` (poste), `~/app/shared/.env` (serveur, hors webroot) |
| E-mail du premier admin | Envoyé une fois à `grant-role`, jamais journalisé |
| Contenus importés | Données de référence publiques (référentiel, paquets publiés) ; fiches Twin9 confidentielles stockées en base, jamais renvoyées par ces routes sauf `dump-fiches` (jeton requis) |

## Code sollicité

| Couche | Élément | Rôle |
|---|---|---|
| Outil | `scripts/deploy/deploy.mjs` (`deployApi`, `rollbackApi`, `releasesCommand`), `scripts/deploy/stage-api.sh` | Upload FTP, pointeur, séquence distante, smoke, rollback (documentés, non exécutés par les tests) |
| Serveur | `api/deploy/webroot/index.php` | Front-controller : validation du pointeur, `503`, délégation à la release (script sans fonction : couvert par le sous-processus de UC-SYS-02-F10, pas de test unitaire) |
| API | `api/src/routes/system.php` — `/admin/migrate`, `/admin/import-referentiel`, `/admin/seed-competences`, `/admin/generate-fiches`, `/admin/dump-fiches`, `/admin/grant-role`, `/admin/default-package` | Portes 404/403/503, orchestration, lecture du corpus (seed), comparaison des fiches ; erreurs génériques sauf `seed-competences` et `generate-fiches` (AN-2) |
| API | `api/src/routes/packages.php` — `/admin/import-prompt-package` | Import de paquet publié |
| Domaine | `api/src/MigrationRunner.php` | Ordre, verrou, transaction, `splitStatements` |
| Domaine | `api/src/Referentiel/ReferentielRepository.php` — `importPublishedDocument` | Import idempotent, contrôle du hash |
| Domaine | `api/src/Packages/PromptPackageRepository.php` — `importPublishedDocument`, `isPublished` | Import idempotent, immuabilité, exclusion des privés |
| Domaine | `api/src/Referentiel/CompetenceSeeder.php`, `api/src/Referentiel/FicheGenerator.php`, `api/src/Twin9/FicheStore.php` | Seed + gate de parité, fiches depuis la base |
| Domaine | `api/src/Packages/SettingsRepository.php` | `default_prompt_package`, proposition |
| Transverse | `api/src/Middleware/CsrfMiddleware.php`, `api/src/Auth/Audit.php` | Exemption de `migrate`, audit `role_granted` |
| CLI | `scripts/migrate.php`, `scripts/import-referentiel.php`, `scripts/import-prompt-packages.php`, `scripts/seed-competences.php` | Équivalents locaux |

## Jeux de tests

### Tests unitaires

| ID | Cible | Vérifie | Fichier |
|---|---|---|---|
| UC-SYS-02-U01 | `MigrationRunner::run` | Ordre lexicographique, `.sql` seulement, suivi, verrou tenu par la connexion pendant l'exécution (`IS_USED_LOCK = CONNECTION_ID()`) puis relâché, second passage sans effet (RG3) | `api/tests/UseCases/Unit/UcSys02DeployerMigrerTest.php` |
| UC-SYS-02-U02 | `MigrationRunner::run` | Fichier en échec : exception, non enregistré, verrou relâché (vérifié sur la connexion, GET_LOCK étant réentrant) ; DDL partiel persistant : rejeu non idempotent → « already exists », reprise par `IF NOT EXISTS` | idem |
| UC-SYS-02-U03 | `MigrationRunner` | Dossier absent → erreur ; dossier par défaut du dépôt | idem |
| UC-SYS-02-U04 | `MigrationRunner::splitStatements` | Chaînes échappées, identifiants, commentaires, dernière instruction ; (AN-3) comportement actuel : `5--2` pris pour un commentaire | idem |
| UC-SYS-02-U05 | `ReferentielRepository::importPublishedDocument` | `imported`/`unchanged`, hash incohérent, même version autre structure (hash recalculé) → « immutable », document invalide (RG4, E5) | idem |
| UC-SYS-02-U06 | `PromptPackageRepository::importPublishedDocument`, `isPublished` | `imported`/`unchanged`, immuabilité, schéma ; `isPublished` faux pour une version inconnue et pour un paquet privé | idem |
| UC-SYS-02-U07 | `CompetenceSeeder::seed` | Référentiel requis, 7/61 + fiches + lockfile, idempotent (RG5) | idem |
| UC-SYS-02-U08 | `FicheGenerator`, `FicheStore::store` | Structure 7/61, corpus identique à `fiches-v7.json`, relecture (fiche et réassemblage exact de l'en-tête de pôle) | idem |
| UC-SYS-02-U09 | `SettingsRepository` | Réglage du paquet par défaut : pose, upsert, retrait | idem |
| UC-SYS-02-U10 | `CompetenceSeeder::seed` | « Contenu riche manquant pour … », « Gate de parité ÉCHOUÉ » ; backfill d'une 1.0.0 périmée (`backfilled: 1`, fiche rétablie) ; lockfile write-once (lien 1.0.0 conservé malgré une 1.1.0), `lockLinks` = tentatives (RG5, E11) | idem |
| UC-SYS-02-U11 | `CsrfMiddleware::process` | Session sans `X-CSRF-Token` : `/api/admin/migrate` passe, `grant-role`, `import-prompt-package`, `seed-competences` → `403` (RG2) | idem |

### Tests fonctionnels

| ID | Scénario | Niveau | Vérifie | Fichier |
|---|---|---|---|---|
| UC-SYS-02-F01 | Nominal (4-9), A4, E6 | API | Base vide : séquence de `deploy.mjs` arrêtée au `409` des fiches (aucune écriture, ni paquet ni smoke), relance complète avec `force`, smoke health ; témoin : `/health` `200 "ok"` avec `db: "error"` | `api/tests/UseCases/Functional/UcSys02DeployerMigrerTest.php` |
| UC-SYS-02-F02 | A1 | API | Deuxième séquence entièrement sans effet | idem |
| UC-SYS-02-F03 | A2 | API | `grant-role` : premier admin effectif sans reconnexion, audit `{targetUserId, role, status}` sans acteur ni e-mail, `unchanged` audité (RG7) | idem |
| UC-SYS-02-F04 | A3 | API | `default-package` servi par `/prompt-packages/default` ; proposition différente conservée, identique consommée | idem |
| UC-SYS-02-F05 | A5 | API | `dump-fiches` = corpus versionné | idem |
| UC-SYS-02-F06 | E1, E2, E3 | API | 8 routes : `404` / `403` / `403` / `503` | idem |
| UC-SYS-02-F07 | E4, E5, E8 | API | `400` (imports), `422` corps non JSON (`grant-role`, `default-package`), `422` + détails, `409`, `404` (compte inconnu ou supprimé, version, paquet privé) | idem |
| UC-SYS-02-F08 | E7, AN-2 | API | Base inexistante : `500` générique sans détail SQL (migrate, import) ; comportement actuel : `seed-competences` et `generate-fiches` renvoient `SQLSTATE…` | idem |
| UC-SYS-02-F09 | RG2 | API | Session sans CSRF : `migrate` passe, `import-prompt-package`/`grant-role` → `403` | idem |
| UC-SYS-02-F10 | A6, E9, AN-4 | CLI (front-controller) | Release pointée servie (aucun code imposé), rollback par réécriture, code HTTP `503` (lu par un lanceur `http_response_code()`) pour pointeur invalide/absent et release manquante ; comportement actuel : `releases/..` passe le motif | idem |
| UC-SYS-02-F11 | A7, E10 | CLI | `migrate.php`, `import-referentiel.php`, `import-prompt-packages.php`, `seed-competences.php` ; codes de sortie 1 (base absente, fichier introuvable) | idem |
| UC-SYS-02-F12 | E6 | API | `fiche_md` retouché en production → `409 {changed: [code]}`, réglage relu identique ; `force: 1` vaut `false` | idem |
| UC-SYS-02-F13 | AN-1 | API | Comportement actuel : en-tête de pôle retouché ou fiche disparue (1.1.0 sans `fiche`) → `200 unchanged`, réglage réécrit en silence | idem |
| UC-SYS-02-F14 | E11 | API | Seed avant tout référentiel publié → `500 « Seed failed: Aucune version publiée… »` | idem |

### Tests existants liés (non-régression)

- `api/tests/SystemRoutesTest.php`, `api/tests/MigrationRunnerTest.php` — migrate (portes, idempotence), runner.
- `api/tests/AdminImportReferentielTest.php`, `api/tests/ReferentielImportExportTest.php` — import du référentiel.
- `api/tests/PackagesTest.php` (`testAdminImportEndpoint`), `api/tests/PackagesDefaultTest.php` — paquets, défaut.
- `api/tests/FicheAdminEndpointsTest.php`, `api/tests/CompetenceAtomicTest.php` — fiches, seed.
- `api/tests/AdminRolesTest.php` — `grant-role`.
- `web/e2e/parcours-cartographe.e2e.js`, `web/e2e/parcours-promptologue.e2e.js` — `grant-role` avec le jeton de dev.

### Exécuter

```sh
docker compose run --rm php vendor/bin/phpunit --filter UcSys02 --testdox
```

## Anomalies constatées

- **AN-1 — Garde-fou des fiches partiel : écrasement silencieux de
  `twin9_fiches`.** `POST /api/admin/generate-fiches` ne compare que le
  `fiche_md` des codes **présents** dans la structure générée
  (`system.php`, boucle sur `$generated`) : (1) les en-têtes de pôle ne sont
  jamais comparés, bien que le commentaire du code annonce « fiche_md +
  en-têtes » ; (2) un code présent dans le réglage mais absent de la
  génération (version publiée sans `fiche`, champ facultatif de
  `schemas/competence.schema.json`, exclue par `FicheGenerator::byPole`)
  n'est jamais signalé ; (3) `FicheStore::store` est appelé sans condition.
  Résultat : `200 {status: "unchanged"}` avec écrasement silencieux des
  en-têtes confidentiels (y compris ceux importés par `/admin/twin9/import`)
  ou suppression de fiches. Correctif suggéré : comparer la structure entière
  (en-têtes et ensemble des codes) et n'écrire que si `force` ou s'il y a un
  changement. Figé par UC-SYS-02-F13.
- **AN-2 — Messages d'exception renvoyés par `seed-competences` et
  `generate-fiches`.** Contrairement aux autres routes à jeton, elles
  répondent `500 {"error": "Seed failed: " . $e->getMessage()}` (resp.
  « Generation failed: … ») : avec une base injoignable, le corps contient
  `SQLSTATE[HY000] [1049] Unknown database '…'`. Le destinataire est le
  porteur du jeton (outil de déploiement), mais la garantie « réponses
  génériques » n'est pas tenue. Correctif suggéré : message générique pour
  les erreurs techniques, message métier seulement pour les
  `RuntimeException` du seed (référentiel absent, gate de parité). Figé par
  UC-SYS-02-F08.
- **AN-3 — `splitStatements` prend tout « -- » pour un commentaire.** MySQL
  n'ouvre un commentaire que sur « -- » suivi d'un blanc (le docblock du code
  l'annonce aussi) ; ici, `a = 5--2 …;` avale la fin de la ligne, point-virgule
  compris, et fusionne deux instructions en une seule, invalide. Contournement
  dans les migrations : écrire `- -2` ou `-(-2)`. Figé par UC-SYS-02-U04.
- **AN-4 — Le motif du pointeur admet `releases/..` et `releases/.`**
  (`#^releases/[A-Za-z0-9._-]+$#`). `releases/..` vise `app/public/index.php`
  et n'est bloqué que par l'absence de ce fichier ; la traversée
  multi-segments (`releases/../../shared`) est, elle, refusée par le motif
  (second `/`). Durcissement suggéré : exiger un premier caractère
  alphanumérique. Figé par UC-SYS-02-F10.

## Limites

- `deploy.mjs` n'exporte aucune fonction et lance `main()` à l'import : il
  n'est pas testable sans effet de bord (FTP, site distant) ; son déroulé est
  documenté ici et sa séquence HTTP est rejouée par UC-SYS-02-F01/F02.
- La route `POST /api/admin/twin9/import` (jeton, import des gabarits Twin9
  confidentiels) et `POST /api/admin/worker-tick` relèvent d'autres cas
  (supervision Twin9 / UC-PRO-08, et UC-SYS-01) ; `POST /api/admin/maintenance`
  relève de UC-SYS-03.
- Le verrou de migration est nommé au niveau du **serveur** MySQL
  (`humanome_migrate`) : deux bases hébergées sur le même serveur (ex. plusieurs
  bases de test) sérialisent leurs migrations.
- Le smoke final de `deploy.mjs` (200 + `"ok"`) ne détecte ni une base en
  panne ni des migrations non appliquées ; sans `MIGRATE_TOKEN` dans
  `.env.deploy`, les étapes 4 à 8 sont sautées sur un simple avertissement.
- `fiches-v7.json` absent de la release : le seed réussit sans fiches et
  remet les en-têtes de pôle à `NULL` (E11), sans alerte.
