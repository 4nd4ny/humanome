# UC-SYS-05 — Sauvegarder et restaurer la base

| Champ | Valeur |
|---|---|
| **Acteur principal** | Mainteneur (exploitant), depuis un poste de travail ou une CI capable de joindre l'hôte MySQL |
| **Acteurs secondaires** | Hébergeur OVH (sauvegardes automatiques primaires, panel Web Cloud) ; serveur MySQL (source du dump, cible de la restauration) ; titulaires des données contenues dans la base |
| **Portée** | `scripts/backup/backup-db.mjs` (copie hors OVH par `mysqldump`) ; procédure manuelle de restauration (`docs/backup-restore.md`, client `mysql`) ; hors navigateur, hors API |
| **Niveau** | Objectif d'exploitation (sous-fonction technique) |
| **Cahier des charges** | §5 (hébergement mutualisé OVH) ; §6 et principes RGPD de `CLAUDE.md` (n°3 : purge réelle) ; ADR-002 (MySQL 8, utf8mb4), ADR-008 ; `docs/backup-restore.md`, `docs/hebergement.md` |
| **Statut** | Sauvegarde implémentée, inopérante contre la base mutualisée de production (AN-6) ; restauration documentée, non outillée — voir « Anomalies constatées » |

## Objectif

Disposer, **indépendamment de l'hébergeur**, d'une copie cohérente et fidèle
(utf8mb4) de la base MySQL de production, et savoir la réinjecter dans une base
vide pour redémarrer le service après un incident. Pour la base mutualisée de
production, cet objectif n'est pas atteint aujourd'hui (AN-6).

Ce cas est distinct d'UC-SYS-03 (maintenance et supervision) : son but est la
continuité (plan de reprise), non l'hygiène courante ; son déclencheur est
hebdomadaire ou ponctuel (avant une migration destructive), non quotidien ; il
s'exécute **hors du serveur**, depuis un poste muni du client MySQL, alors
qu'UC-SYS-03 passe par l'API et des scripts PHP ; il comprend une procédure de
restauration ; enfin il soulève ses propres questions RGPD (copie intégrale des
données personnelles hors de l'hébergement, conservation après effacement).

## Déclencheur

- Copie hors OVH hebdomadaire, avant chaque migration destructive (phase
  « contract ») et à la demande avant une opération risquée
  (`docs/backup-restore.md`, « Fréquence recommandée »).
- Restauration : incident hébergeur ou base corrompue, ou répétition de la
  procédure.

## Préconditions

- Node ≥ 20 (le script n'a aucune dépendance npm) et client `mysqldump` dans le
  `PATH`.
- L'hôte MySQL est joignable depuis la machine sur le port par défaut 3306
  (`DB_PORT` est ignoré : AN-2) : par exemple la base Docker locale, ou une
  base OVH CloudDB ouverte aux adresses autorisées. L'hôte de la base
  mutualisée de production (`<compte>.mysql.db`) n'est résolu que dans le
  réseau d'OVH : il n'est pas joignable depuis un poste ou une CI (AN-6).
- `DB_HOST`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` non vides, dans
  l'environnement ou dans `api/.env` **du dépôt** où se trouve le script.
- Restauration : client `mysql`, base cible existante et droits d'écriture.

## Garanties en cas de succès

- Un fichier SQL `backups/humanome-<AAAAMMJJHHMMSS>.sql` (horodatage UTC) à la
  racine du dépôt, ou au chemin donné par `--out`, produit par `mysqldump
  --single-transaction --no-tablespaces --default-character-set=utf8mb4` :
  instantané cohérent sans verrou de tables (InnoDB), encodage de production.
- Sortie standard « backup written: <chemin absolu> », code 0.
- Les dumps restent hors du dépôt git (`backups/` est gitignoré) ; par défaut,
  ils sont néanmoins écrits dans la copie de travail, synchronisée par Dropbox
  (AN-5).
- Restauration : la base cible reçoit les tables du dump ; la vérification
  documentée compte les tables de `information_schema.tables`.

## Garanties minimales (en cas d'échec)

- Variable manquante : `mysqldump` n'est pas lancé, aucun fichier n'est créé.
- Client absent : message d'aide, code 3, aucun dump (le dossier de
  destination a cependant déjà été créé).
- Échec de `mysqldump` : son code de sortie est propagé et « backup written »
  n'est pas affiché ; un fichier partiel peut subsister (AN-4).
- La sauvegarde ne modifie jamais la base (lecture seule, transaction
  cohérente).

## Scénario nominal

1. Le mainteneur lance `node scripts/backup/backup-db.mjs [--out <chemin>]`
   depuis une machine munie du client MySQL.
2. Le script prend l'environnement, puis complète chaque variable **non
   définie** par la ligne `CLE=valeur` correspondante de `api/.env` (lignes
   commençant par `#` ignorées) ; il exige `DB_HOST`, `DB_NAME`, `DB_USER` et
   `DB_PASSWORD` non vides.
3. Le chemin de sortie est la valeur de `--out`, résolue depuis le dossier
   courant, sinon `backups/humanome-<horodatage UTC>.sql` sous la racine du
   dépôt (quel que soit le dossier courant) ; le dossier parent est créé.
4. Il lance `mysqldump -h<hôte> -u<utilisateur> -p<mot de passe>
   --single-transaction --no-tablespaces --default-character-set=utf8mb4
   --result-file=<fichier> <base>` (sorties de `mysqldump` transmises telles
   quelles).
5. `mysqldump` sort en 0 : le script affiche « backup written: <fichier> » et
   sort en 0.
6. Le mainteneur conserve le fichier hors OVH, hors dépôt et hors de tout
   dossier synchronisé (AN-5).

## Scénarios alternatifs

- **A1 — Identifiants dans `api/.env`** (étape 2) : à défaut de variable
  d'environnement, la valeur de `api/.env` est utilisée ; une variable
  d'environnement l'emporte toujours sur le fichier.
- **A2 — Restauration** (procédure manuelle, `docs/backup-restore.md`) :
  `mysql -h<hôte> -u<utilisateur> -p<mdp> <base_cible> < <dump>.sql` (en
  développement : `docker compose exec -T mysql mysql -uroot -p<mdp> humanome <
  <dump>.sql`), puis vérification :
  `SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='<base>'`.
  Aucun script ne l'outille.
- **A3 — Sauvegarde primaire OVH** : sauvegardes automatiques quotidiennes de
  l'offre (panel OVHcloud → Web Cloud → Bases de données), source de vérité en
  cas d'incident hébergeur ; aucune intervention de la plateforme. C'est
  aujourd'hui la seule protection effective de la base mutualisée de
  production (AN-6).

## Scénarios d'erreur

- **E1 — Identifiant manquant** (étape 2) : variable absente de
  l'environnement et de `api/.env`, ou vide → exception non rattrapée
  « Error: <VAR> missing (set it in api/.env or the environment) » (trace Node),
  code 1 ; `mysqldump` n'est pas lancé, aucun fichier. Une variable
  d'environnement **définie mais vide** masque la valeur du fichier et produit
  la même erreur.
- **E2 — Client `mysqldump` absent** (étape 4) : « mysqldump not found on PATH.
  Install the MySQL client tools, or use OVH’s automatic backups (Web Cloud >
  Databases). See docs/backup-restore.md. », code 3.
- **E3 — Dump en échec** (étapes 4-5) : connexion refusée, droits insuffisants,
  base inconnue… — message de `mysqldump` sur la sortie d'erreur, son code de
  sortie propagé (1 s'il a été tué par un signal), pas de « backup written » ;
  le fichier partiellement écrit reste en place (AN-4).
- **E4 — `--out` sans valeur** (étape 3) : l'option est ignorée sans
  avertissement, chemin par défaut.

## Règles de gestion

- **RG1** — Copie **secondaire** : la sauvegarde automatique OVH reste la source
  de vérité ; la copie applicative existe pour ne pas dépendre de l'hébergeur.
- **RG2** — Dump cohérent sans verrou (`--single-transaction`), fidèle à
  l'encodage de production (`utf8mb4`, ADR-002), sans les tablespaces
  (`--no-tablespaces` : pas de privilège `PROCESS` exigé sur un hébergement
  mutualisé).
- **RG3** — Un dump contient des données personnelles : il ne va jamais dans le
  dépôt git (`backups/` gitignoré). Le dossier par défaut `backups/` est
  toutefois dans la copie de travail, synchronisée par Dropbox tant qu'il n'est
  pas marqué `xattr -w com.dropbox.ignored 1 backups` (à refaire s'il est
  recréé) : préférer `--out` vers un emplacement hors Dropbox et chiffré (AN-5).
- **RG4** — Précédence des identifiants : environnement, puis `api/.env` ; le
  fichier n'est jamais modifié.

## Données et RGPD

| Donnée | Traitement |
|---|---|
| Dump SQL | Copie **intégrale** de la base : comptes (e-mail, empreinte du mot de passe), rôles, cartographies et portfolios stockés sur opt-in, clés API chiffrées, liens de partage, journaux d'audit… ; stocké hors OVH et hors du dépôt git, sans chiffrement applicatif ; par défaut dans `<racine du dépôt>/backups/`, synchronisé par Dropbox (sous-traitant absent du registre) s'il n'est pas marqué `com.dropbox.ignored` (AN-5) |
| Identifiants de la base | Lus dans l'environnement ou `api/.env` ; mot de passe transmis en argument de `mysqldump` (AN-1) |
| Compte effacé (UC-CPT-06) | Subsiste dans les dumps antérieurs : aucune durée de conservation ni purge des copies n'est définie (AN-5) |

## Code sollicité

| Couche | Élément | Rôle |
|---|---|---|
| Script | `scripts/backup/backup-db.mjs` — `loadDbEnv` | Identifiants : environnement puis `api/.env`, contrôle de présence |
| Script | `scripts/backup/backup-db.mjs` — `timestamp`, `main` | Chemin de sortie, appel de `mysqldump`, codes de sortie |
| Outil externe | `mysqldump`, `mysql` (client MySQL) | Dump cohérent ; restauration manuelle |
| Documentation | `docs/backup-restore.md` | Procédure de sauvegarde, de restauration et de vérification |
| Configuration | `.gitignore` (`backups/`) | Dumps hors dépôt |

## Jeux de tests

`backup-db.mjs` n'exporte rien et s'exécute dès son chargement : il est lancé
en **sous-processus**, copié dans un dossier temporaire qui tient lieu de dépôt
(aucune lecture de l'`api/.env` réel, aucune écriture dans le dépôt). Aucune
vraie base : un faux `mysqldump`, seul dans le `PATH` du sous-processus,
journalise ses arguments, écrit le fichier demandé et sort avec le code choisi.
Les dossiers temporaires sont résolus par `realpathSync` (sur macOS,
`os.tmpdir()` traverse un lien symbolique et le script imprime son chemin
résolu : voir UC-SYS-04 AN-4). Ces tests fonctionnels de niveau « CLI » sont
rangés dans `engine/test/usecases/unit/`, seul dossier de cas d'utilisation du
moteur prévu par le catalogue.

### Tests unitaires

Aucun : le script n'expose aucune fonction et appelle `main()` au chargement
(voir « Limites »).

### Tests fonctionnels

| ID | Scénario | Niveau | Vérifie | Fichier |
|---|---|---|---|---|
| UC-SYS-05-F01 | Nominal (`--out`) | CLI | Un seul appel, arguments exacts (options de cohérence et d'encodage, base en dernier), `--out` relatif résolu depuis le dossier courant (distinct de la racine du dépôt, où rien n'est écrit), dossier créé, « backup written », code 0 | `engine/test/usecases/unit/uc-sys-05-sauvegarder-restaurer.test.js` |
| UC-SYS-05-F02 | Nominal (défaut), E4 | CLI | `backups/humanome-<horodatage UTC>.sql` sous la racine du dépôt, pas du dossier courant ; `--out` sans valeur → même défaut | idem |
| UC-SYS-05-F03 | A1 | CLI | Identifiants lus dans `api/.env`, commentaires ignorés, environnement prioritaire | idem |
| UC-SYS-05-F04 | E1 | CLI | Chacune des 4 variables absente → code 1, message, `mysqldump` non lancé, aucun fichier ; variable d'environnement vide masquant le fichier | idem |
| UC-SYS-05-F05 | E2 | CLI | Client absent → message d'aide exact, code 3, dossier de destination vide | idem |
| UC-SYS-05-F06 | E3 (AN-4) | CLI | Code de `mysqldump` propagé, pas de « backup written », fichier partiel laissé sous un nom de sauvegarde (comportement actuel) ; tué par un signal → code 1 | idem |
| UC-SYS-05-F07 | AN-1, AN-2 | CLI | `-p<mot de passe>` dans les arguments du processus ; `DB_PORT` ignoré (comportement actuel) | idem |
| UC-SYS-05-F08 | AN-3 | CLI | `api/.env` lu à la lettre : guillemets, commentaire de fin de ligne et espaces finaux conservés (comportement actuel) | idem |

### Tests existants liés (non-régression)

- Aucun test automatisé préexistant. `docs/backup-restore.md` rapporte une
  restauration vérifiée à la main sur l'environnement Docker (dump d'une base
  peuplée → nouvelle base → import → 29 tables restaurées).

### Exécuter

```sh
cd engine && npx vitest run test/usecases/unit/uc-sys-05-sauvegarder-restaurer.test.js
```

## Anomalies constatées

- **AN-1 — Mot de passe de la base en argument de ligne de commande.** Le
  script passe `-p<mot de passe>` à `mysqldump` : pendant toute la durée du
  dump, le secret est lisible par les autres utilisateurs de la machine (`ps`,
  `/proc/<pid>/cmdline`), et `mysqldump` l'accompagne de l'avertissement
  « Using a password on the command line interface can be insecure ».
  Correctif possible : variable `MYSQL_PWD` du processus enfant ou fichier
  `--defaults-extra-file` en mode 0600. Figé par UC-SYS-05-F07.
- **AN-2 — `DB_PORT` ignoré.** L'API honore `DB_PORT` (`api/src/Db.php`, 3306
  par défaut) ; le script de sauvegarde ne transmet aucun port : une instance
  configurée sur un autre port est sauvegardée sur le 3306 (échec de connexion,
  ou dump d'un autre serveur). Figé par UC-SYS-05-F07.
- **AN-3 — `api/.env` lu autrement que par l'API.** L'API charge ce fichier
  avec phpdotenv 5, qui retire les guillemets, les commentaires de fin de ligne
  et les espaces finaux (vérifié sur php:8.2, valeurs d'exemple :
  `DB_PASSWORD="pa ss"` (exemple) → `pa ss`,
  `DB_NAME=humanome # base` → `humanome`) ; `backup-db.mjs` recopie la valeur
  brute (`"pa ss"` avec ses guillemets, `humanome # base`). Un mot de passe
  entre guillemets — obligatoire pour phpdotenv dès qu'il contient une espace —
  fait donc échouer la sauvegarde avec des identifiants valides pour l'API.
  Figé par UC-SYS-05-F08.
- **AN-4 — Dump partiel conservé sous un nom de sauvegarde valide.** Quand
  `mysqldump` échoue en cours de route, le fichier déjà écrit
  (`backups/humanome-<horodatage>.sql`) n'est ni supprimé ni renommé : seul le
  code de sortie distingue une copie tronquée d'une copie complète, au risque
  de la restaurer plus tard. Figé par UC-SYS-05-F06.
- **AN-5 — Copies hors OVH absentes du registre RGPD.** Ni
  `docs/rgpd-registre.md`, ni `docs/rgpd-verification.md`, ni le cahier des
  charges ne mentionnent les dumps : aucune durée de conservation, aucun lieu de
  stockage, aucune protection (chiffrement) ni purge ne sont prévus. Un compte
  effacé « réellement » (principe RGPD n°3, UC-CPT-06) subsiste dans toutes les
  copies antérieures. De plus, le dossier par défaut
  (`<racine du dépôt>/backups/`) se trouve dans la copie de travail, qui vit dans
  Dropbox (`CLAUDE.md`) ; seuls `node_modules/`, `vendor/` et `dist/` y sont
  exclus de la synchronisation (`com.dropbox.ignored`) et `.gitignore` n'exclut
  `backups/` que de git : chaque copie intégrale de la base part donc chez
  Dropbox, sous-traitant absent du registre. Recommandation : marquer
  `backups/` (`xattr -w com.dropbox.ignored 1 backups`, à refaire s'il est
  recréé, et l'ajouter à la liste de `CLAUDE.md`) ou passer `--out` vers un
  emplacement hors Dropbox et chiffré. Anomalie de documentation et de
  procédure, non testable automatiquement.
- **AN-6 — La copie hors OVH est impossible pour la base mutualisée de
  production.** L'hôte de production a la forme `<compte>.mysql.db`
  (`api/.env.example`, `api/config/app.php`, `docs/backup-restore.md`) ; `.db`
  n'est pas un domaine de premier niveau public (absent de la liste IANA des
  TLD) : ce nom n'est résolu que dans le réseau interne d'OVH, et
  `docs/hebergement.md` ne l'atteste joignable que depuis l'hébergement web.
  Depuis un poste de travail ou une CI — le seul contexte d'exécution prévu,
  faute de shell sur le mutualisé —, `backup-db.mjs` échoue donc (E3, hôte
  inconnu) : l'objectif « copie indépendante de l'hébergeur » n'est pas atteint
  et seule la sauvegarde automatique OVH (A3) protège réellement la production.
  Piste de correction : dump côté serveur (PHP, par la route à jeton ou le
  cron) vers `~/app/shared`, hors webroot, puis récupération par FTP. Anomalie
  d'architecture, non testable automatiquement (aucun appel réseau réel dans
  les tests).

## Limites

- Aucun test unitaire : `backup-db.mjs` n'exporte pas `loadDbEnv` et exécute
  `main()` dès son chargement ; ses branches sont couvertes en sous-processus.
- Aucun test ne joint une vraie base : les arguments transmis à `mysqldump` et
  les codes de sortie sont vérifiés avec un faux client ; le contenu réel d'un
  dump et la **restauration** (A2, procédure manuelle au client `mysql`) ne sont
  pas rejoués.
- Le script ne lit ni `~/app/shared/.env` ni `HUMANOME_SHARED_DIR` (contrairement
  aux scripts PHP d'UC-SYS-03) : les identifiants de production se fournissent
  par l'environnement ou par l'`api/.env` du poste.
- L'hôte MySQL mutualisé n'est pas joignable depuis l'extérieur d'OVH : voir
  AN-6.
