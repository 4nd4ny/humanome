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

- `.env.deploy` (gitignoré, à la racine du dépôt) existe et contient
  `FTP_HOST`, `FTP_USER`, `FTP_PASSWORD` (tous trois exigés par
  `loadEnvDeploy`), `FTP_SECURE=false` (le cluster OVH ne gère pas FTPS ;
  toute autre valeur, ou son absence, demande FTPS), `MIGRATE_TOKEN` et
  éventuellement `SITE_URL` (défaut `https://humanome.xyz`) et `FICHES_FORCE`
  (aussi lu dans l'environnement du processus).
- Le même `MIGRATE_TOKEN` est configuré côté serveur dans
  `~/app/shared/.env` (hors webroot) ; sans lui, les routes « n'existent pas ».
- La base MySQL est configurée (`DB_HOST`, `DB_NAME`, `DB_USER`,
  `DB_PASSWORD`).
- La release a été préparée par `stage-api.sh` : `build/api-release/` (sources,
  `public/`, `config/`, `schemas/*.schema.json`, `scripts/migrations` et
  `scripts/migrate.php`, `scripts/data`, `composer.json`/`composer.lock`,
  `vendor/` sans dépendances de dev, fichier `VERSION` = `git describe`) et
  `build/prompt-packages/*.json` régénérés. Les autres scripts CLI
  (`import-*.php`, `seed-competences.php`) ne sont **pas** copiés dans la
  release : ils ne servent qu'au poste de développement (A7).
- Le référentiel à importer est lu **sur le poste** du mainteneur, dans
  `web/public/data/referentiel/` (données générées, gitignorées :
  `respire-v7.json`, `respire-v7.1.0.json`).

## Garanties en cas de succès

- La nouvelle release est servie par `www/api/index.php` dès l'écriture de
  `app/current.txt`, **écrit après l'upload complet** (release puis
  front-controller) ; les trois releases les plus récentes (par ordre de nom,
  donc d'horodatage) sont conservées (rollback possible, voir AN-5).
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
  Il laisse toutefois un dossier de release **partiel** dans `app/releases/`,
  jamais nettoyé en tant que tel : il compte dans l'élagage (3 conservées) et
  peut devenir la cible d'un `rollback` ultérieur (AN-5).
- Une étape distante en échec arrête `deploy.mjs` (exception, « deploy
  failed: … » sur la sortie d'erreur, code 1) ; les étapes déjà jouées restent
  valables et se rejouent sans effet. Mais le pointeur a **déjà** basculé
  (étape 3 avant l'étape 4) : la nouvelle release reste servie, sur un schéma
  éventuellement non migré, sans retour arrière automatique — le mainteneur
  corrige et relance, ou lance `rollback` (A6).
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
   `deploy.mjs static [--dry-run]` : index SHA-256 de `web/dist`, comparé au
   manifeste distant `www/.deploy-manifest.json` ; seuls les fichiers modifiés
   partent ; ne sont supprimés que les fichiers listés dans l'ancien manifeste
   et disparus localement (échec de suppression = simple avertissement) ; le
   manifeste est écrit **en dernier** ; manifeste absent ou illisible → envoi
   complet sans suppression ; `--dry-run` liste sans rien transférer).
2. `stage-api.sh` prépare `build/api-release/` et les paquets de prompts publiés.
3. `deploy.mjs api` téléverse la release dans
   `app/releases/<AAAAMMJJ-HHMMSS UTC>-<version>/` (version = contenu de
   `VERSION`, caractères hors `[A-Za-z0-9._-]` remplacés par `_` : le nom
   respecte donc le motif du front-controller, RG6), puis l'arborescence
   `api/deploy/webroot/` (`index.php`, `.htaccess`) dans `www/api/`, **puis**
   écrit `app/current.txt` (`releases/<nom>\n`), puis élague par ordre de nom
   les releases au-delà de 3. Dès cet instant, la nouvelle release est servie
   (avant les étapes 4 à 9).
4. Il appelle `POST /api/admin/migrate` (en-tête `X-Migrate-Token`) :
   `MigrationRunner::run` prend le verrou MySQL `GET_LOCK('humanome_migrate', 30)`,
   crée `schema_migrations` si besoin et applique chaque `.sql` non encore
   enregistré, dans l'ordre lexicographique → `200 {applied: [...], skipped: n}`.
5. `POST /api/admin/import-referentiel` avec `respire-v7.json` puis
   `respire-v7.1.0.json`, lus dans `web/public/data/referentiel/` du poste —
   **chacun** est sauté en silence s'il est absent (sur une base neuve, si
   AUCUN des deux fichiers n'est présent, le seed échoue, E11 ; si seul
   `respire-v7.json` manque, la 7.1.0 seule est publiée et sert de structure :
   le seed réussit, même empreinte structurelle, RG4 — F14) : validation par le
   schéma, recalcul et contrôle du `contentHash`, insertion comme version
   **publiée** →
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
   `build/prompt-packages/*.json` → `200 {status, id, version, contentHash}`
   (étape sautée en silence si le dossier n'existe pas sur le poste).
9. `GET /api/health` → `200 {"status":"ok","version":…,"db":"ok"}` ; le script
   exige un `200` et la chaîne `"ok"` — critère qui ne détecte pas une base en
   panne (`"status":"ok"` est inconditionnel). Chaque étape en échec (réponse
   non 2xx) lève une exception : les étapes suivantes ne sont pas jouées,
   `main` affiche « deploy failed: <message> » et sort avec le code 1. Chaque
   réponse est journalisée sur la console, tronquée (160 à 300 caractères).

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
- **A6 — Retour arrière** : `deploy.mjs rollback` liste `app/releases/`
  (dossiers triés par nom), exige au moins 2 releases (sinon « need >= 2
  releases to roll back », code 1) et réécrit `current.txt` vers
  l'**avant-dernière par ordre de nom** — sans lire `current.txt` : ce n'est
  la release qui précède la release active que si l'active est la plus récente
  (AN-5). Code seul (migrations forward-only compatibles). Il sonde ensuite
  `/api/health` et affiche la réponse **sans** en vérifier le statut.
  `deploy.mjs releases` liste les releases et marque d'un `*` celle que pointe
  `current.txt` (« (none) » si illisible).
- **A7 — Poste de développement (CLI)** : `php scripts/migrate.php`,
  `php scripts/import-referentiel.php [fichier]`,
  `php scripts/import-prompt-packages.php [fichiers…]`,
  `php scripts/seed-competences.php` jouent les mêmes briques que les routes
  (code de sortie 0 en succès ou sans effet : une relance à l'identique
  répond « already imported … nothing to do » ou « 0 importées / 61
  inchangées »). Sans argument, `import-prompt-packages.php` prend chaque
  `build/prompt-packages/*.json` (ordre des noms) ; il traite tous les
  fichiers même après un échec, et rend 1 si l'un a échoué.
  `seed-competences.php` lit `scripts/data/competences-v7.json` (obligatoire)
  et `fiches-v7.json` (facultatif) **à côté du script**.

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
- **E10 — CLI en échec** (message sur la sortie d'erreur, code 1) : `DB_HOST`
  vide (« DB_HOST is not set… », « DB not configured… ») ; dépendances non
  installées (« composer autoload not found ») ; fichier d'entrée introuvable
  (`import-referentiel.php`, `import-prompt-packages.php`) ;
  `import-prompt-packages.php` sans argument et sans aucun
  `build/prompt-packages/*.json` (« no package file found… », contrôlé
  **avant** la base), document non conforme (« Invalid prompt-package
  document <fichier>: » + une ligne par pointeur), JSON illisible, scalaire
  ou null (« Import failed for <fichier>: … ») ; un tableau JSON est refusé
  par le schéma (« Invalid prompt-package document <fichier>: » + pointeur
  `/`) ; conflit d'immuabilité
  (« Conflict on <fichier>: … », version publiée intacte) ;
  `seed-competences.php` : `competences-v7.json` absent (« … introuvable
  (régénérer depuis les YAML) »), référentiel non publié ou gate de parité
  en échec (« Seed échoué : … », rien sur la sortie standard).
- **E11 — Seed impossible** (étape 6) : référentiel non encore publié →
  `500 « Seed failed: Aucune version publiée du référentiel… »` ; gate de
  parité en échec → `500 « Seed failed: Gate de parité ÉCHOUÉ… »` ; contenu
  riche manquant pour un code → `500 « Seed failed: Contenu riche manquant
  pour … »` ; `competences-v7.json` absent de la release → `500
  « competences-v7.json introuvable dans le release »`. Dans tous ces cas,
  `deploy.mjs` s'arrête (« competence seed failed »). À l'inverse,
  `fiches-v7.json` absent ne provoque **aucune** erreur : seed sans fiches
  (`fiches: 0`) et en-têtes de pôle réécrits à `NULL` ; sur une base déjà
  amorcée, les 61 versions 1.0.0 (encore dernières publiées) sont en outre
  « backfillées » **sans** leur fiche (`backfilled: 61`) — AN-6.
- **E12 — Outil de déploiement mal lancé** : cible inconnue (ou absente) →
  « Unknown target … », code 2 (avant toute lecture de `.env.deploy`) ;
  `.env.deploy` absent (« deploy failed: ENOENT… ») ou sans
  `FTP_HOST`/`FTP_USER`/`FTP_PASSWORD` (« deploy failed: FTP_HOST missing in
  .env.deploy ») → code 1 ; `build/api-release` absent
  (« … run scripts/deploy/stage-api.sh first ») ou `web/dist` absent
  (« Missing local dir: web/dist (build first?) ») → code 1, aucun transfert.

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
- **RG6** — `current.txt` est écrit après l'upload complet (release et
  front-controller), mais **avant** l'élagage et les étapes distantes 4 à 9 ;
  le nom de release est assaini par `deploy.mjs` pour rester dans le motif du
  front-controller. Le front-controller n'accepte
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
| Outil | `scripts/deploy/deploy.mjs` — `main` (cibles `static`, `api`, `rollback`, `releases` ; codes 1/2), `loadEnvDeploy`, `buildLocalIndex`/`readRemoteManifest` (synchro par manifeste), `uploadTree`, `deployApi`, `listReleases`, `rollbackApi`, `releasesCommand` ; `scripts/deploy/stage-api.sh` | Upload FTP, pointeur, élagage, séquence distante, smoke, rollback — `deploy.mjs` est exécuté en sous-processus sur une copie, avec un faux module `basic-ftp` et un site local (F19 à F22) ; pas de test unitaire : il n'exporte aucune fonction et lance `main()` dès l'import ; côté serveur, la séquence HTTP est rejouée par F01/F02 ; `stage-api.sh` n'est pas exécuté (voir Limites) |
| Serveur | `api/deploy/webroot/index.php` | Front-controller : validation du pointeur, `503`, délégation à la release (script sans fonction : couvert par le sous-processus de UC-SYS-02-F10, pas de test unitaire) |
| API | `api/src/routes/system.php` — `/admin/migrate`, `/admin/import-referentiel`, `/admin/seed-competences`, `/admin/generate-fiches`, `/admin/dump-fiches`, `/admin/grant-role`, `/admin/default-package` | Portes 404/403/503, orchestration, lecture du corpus (seed), comparaison des fiches ; erreurs génériques sauf `seed-competences` et `generate-fiches` (AN-2) |
| API | `api/src/routes/packages.php` — `/admin/import-prompt-package` | Import de paquet publié |
| Domaine | `api/src/MigrationRunner.php` | Ordre, verrou, transaction, `splitStatements` |
| Domaine | `api/src/Referentiel/ReferentielRepository.php` — `importPublishedDocument` | Import idempotent, contrôle du hash |
| Domaine | `api/src/Packages/PromptPackageRepository.php` — `importPublishedDocument`, `isPublished` | Import idempotent, immuabilité, exclusion des privés |
| Domaine | `api/src/Referentiel/CompetenceSeeder.php`, `api/src/Referentiel/FicheGenerator.php`, `api/src/Twin9/FicheStore.php` | Seed + gate de parité, fiches depuis la base |
| Domaine | `api/src/Packages/SettingsRepository.php` | `default_prompt_package`, proposition |
| Transverse | `api/src/Middleware/CsrfMiddleware.php`, `api/src/Auth/Audit.php` | Exemption de `migrate`, audit `role_granted` |
| CLI | `scripts/migrate.php`, `scripts/import-referentiel.php`, `scripts/import-prompt-packages.php` (entrée par défaut `build/prompt-packages/*.json`, traitement fichier par fichier), `scripts/seed-competences.php` (corpus relatif au script) | Équivalents locaux ; codes de sortie 0/1 (F11, F15 à F18) |

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
| UC-SYS-02-F14 | E11, Nominal (5) | API | Seed avant tout référentiel publié → `500 « Seed failed: Aucune version publiée… »` ; 7.1.0 seule publiée (définitions hors empreinte) → structure de référence, seed `200`, 7/61, même empreinte | idem |
| UC-SYS-02-F15 | A1, A7, E5, E10 | CLI | `import-prompt-packages.php` : relance à l'identique → code 0 « already imported … nothing to do », base inchangée ; document invalide (pointeurs) ou tableau JSON (pointeur `/`), JSON illisible ou scalaire (« Import failed »), conflit de version immuable → code 1, version publiée intacte, fichier suivant importé quand même ; sans base → code 1, stdout vide | idem |
| UC-SYS-02-F16 | A7, E10 | CLI (disposition jetable) | `import-prompt-packages.php` sans argument : `build/prompt-packages/` absent (même sans base) ou sans `.json` → code 1 « no package file found » ; présent → chaque `.json` importé dans l'ordre des noms, relance sans effet ; autoload absent → code 1 | idem |
| UC-SYS-02-F17 | A1, A7, E10, E11 | CLI | `seed-competences.php` : sans base → 1 ; référentiel non publié → 1 « Seed échoué : Aucune version publiée… » ; nominal 7/61/61 fiches, relance « 0 importées / 61 inchangées » (même empreinte, aucune ligne en plus) ; gate de parité (nom divergent) → 1, message avec l'empreinte publiée, stdout vide | idem |
| UC-SYS-02-F18 | E10, E11, AN-6, AN-1 | CLI (disposition jetable) + API | `seed-competences.php` : autoload absent → 1 ; `competences-v7.json` absent → 1 ; comportement actuel : `fiches-v7.json` absent → code 0, `61 backfillées · fiches 0`, fiches et en-têtes effacés de la base, puis `generate-fiches` sans `force` → `200 unchanged`, 0 compétence, `twin9_fiches` vidé ; un seed complet rétablit la base | idem |
| UC-SYS-02-F19 | E12 | CLI `deploy.mjs` (copie jetable, faux `basic-ftp`) | Cible inconnue ou absente → code 2 « Unknown target … » sans `.env.deploy` ; `.env.deploy` absent → « deploy failed: ENOENT… », code 1, pour les 4 cibles ; `FTP_HOST` (ligne commentée), `FTP_USER` (vide), `FTP_PASSWORD` manquants → code 1 ; `build/api-release` ou `web/dist` absent → code 1 ; aucun client FTP créé | `engine/test/usecases/unit/uc-sys-02-outil-deploiement.test.js` |
| UC-SYS-02-F20 | A6, AN-5 | CLI `deploy.mjs` + site local | Comportement actuel : `rollback` avec [A, B, C] et `current.txt` = A → `current.txt` réécrit vers B sans être lu, second `rollback` identique ; santé `503` seulement affichée, code 0 ; `releases` : `*` sur la release pointée, « (none) » sans pointeur ; moins de 2 releases (ou listage en échec) → code 1, pointeur intact ; FTPS sauf `FTP_SECURE=false` | idem |
| UC-SYS-02-F21 | Nominal (3-9), RG6, A4, E6 | CLI `deploy.mjs` + site local | Nom de release assaini (motif du front-controller), release puis front-controller puis `current.txt`, élagage à 3, fermeture FTP **avant** la première requête ; séquence migrate → référentiel (7.1.0 seule présente, 7.0.0 sautée) → seed → fiches (`FICHES_FORCE`) → paquets `.json` seulement → santé (`db: "error"` accepté) ; `409` des fiches → code 1, arrêt, pointeur déjà basculé ; sans `MIGRATE_TOKEN` → avertissement, santé seule ; santé sans `"ok"` → code 1 | idem |
| UC-SYS-02-F22 | Nominal (1) | CLI `deploy.mjs` | Synchro `static` : seuls les fichiers modifiés envoyés, seuls les fichiers de l'ancien manifeste disparus supprimés (échec = avertissement, fichier hors manifeste intact), manifeste écrit en dernier ; `--dry-run` sans transfert ; manifeste illisible ou absent → envoi complet sans suppression | idem |

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
cd engine && npx vitest run test/usecases/unit/uc-sys-02
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
- **AN-5 — `rollback` vise l'avant-dernière release par nom, pas celle qui
  précède la release active.** `rollbackApi` prend
  `releases[releases.length - 2]` de la liste triée de `app/releases/` sans
  lire `current.txt`, alors que son docblock annonce « the release before the
  active one » et `docs/deploiement.md` « repointe current.txt sur la
  précédente ». Conséquences : (1) un second `rollback` repointe la même
  release au lieu de reculer d'un cran ; (2) après un upload interrompu
  (dossier partiel B, pointeur resté sur A) suivi d'un déploiement réussi C,
  la liste vaut [A, B, C] et `rollback` pointe la release **partielle** B —
  front-controller en `503 « Release entry point missing »` ou release
  incomplète servie ; le sondage `/api/health` qui suit n'est qu'affiché, le
  script termine sans erreur. Correctif suggéré : partir de `current.txt`, et
  n'accepter comme cible qu'une release complète (fichier témoin écrit en fin
  d'upload). Figé par UC-SYS-02-F20 (conséquence 1 et sélection sans lecture
  de `current.txt` ; le dossier partiel de la conséquence 2 n'y est qu'un nom
  de la liste, le faux FTP ne distinguant pas une release incomplète).
- **AN-6 — `fiches-v7.json` absent : le seed efface les fiches de la base.**
  Le corpus des fiches est facultatif pour `seed-competences.php` comme pour
  la route (« ce dernier facultatif »), mais son absence fait passer à
  `CompetenceSeeder::seed` un contenu sans `fiche` : sur une base déjà
  amorcée, `reconcileSeed` voit une empreinte différente et « backfille » les
  61 versions 1.0.0 encore dernières publiées **sans** leur fiche, et les 7
  en-têtes de pôle sont réécrits à `NULL` — code 0 / `200`, aucune alerte.
  La source unique des fiches est ainsi effacée (le `generate-fiches` suivant
  génère alors une structure vide sans la signaler : AN-1). Correctif
  suggéré : refuser le seed (ou ne pas toucher aux fiches ni aux en-têtes)
  quand `fiches-v7.json` manque. Figé par UC-SYS-02-F18 (enchaînement avec
  AN-1 compris).

## Limites

- `deploy.mjs` n'exporte aucune fonction et appelle `main()` dès l'import
  (aucune garde « exécuté directement ») : il n'a pas de test unitaire. Il est
  exécuté en sous-processus sur une **copie** placée dans un dossier
  temporaire (F19 à F22), où un faux module `basic-ftp` (la vraie dépendance
  npm de `scripts/deploy/` est absente de la CI moteur) journalise les appels
  FTP et où `SITE_URL` vise un serveur HTTP local. Restent hors tests : le
  transfert FTP réel (connexion, FTPS, droits, dossiers partiels d'un upload
  interrompu) et les réponses du vrai site ; côté serveur, la séquence HTTP
  des étapes 4 à 9 est rejouée par UC-SYS-02-F01/F02, le front-controller par
  F10 et les scripts CLI par F11 et F15 à F18. `stage-api.sh` (Docker, Node,
  réécriture de `build/`) n'est pas exécuté : l'étape 2 est décrite d'après
  le script.
- Fenêtre de déploiement : entre l'écriture de `current.txt` (étape 3) et la
  fin des migrations (étape 4), la nouvelle release sert des requêtes sur
  l'ancien schéma ; les migrations expand/contract (RG3) sont conçues pour la
  tolérer, mais un échec distant laisse la nouvelle release en ligne (voir
  Garanties minimales).
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
  remet les en-têtes de pôle à `NULL` (E11), sans alerte — et efface les
  fiches déjà en base (AN-6).
- Les branches de `import-prompt-packages.php` et `seed-competences.php` qui
  dépendent de fichiers relatifs au script (`build/prompt-packages/`,
  `scripts/data/`, `api/vendor/`) sont exercées sur une **copie octet à
  octet** du script placée dans un dossier temporaire (F16, F18), pour ne
  jamais modifier le dépôt ; de même pour `deploy.mjs` (F19 à F22).
