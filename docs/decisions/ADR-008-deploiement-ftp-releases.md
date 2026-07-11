# ADR-008 — Déploiement FTP par releases sur OVH mutualisé (sans SSH)

## Statut

Accepté — 2026-07-12

## Contexte

Le §5 impose l'hébergement v1 sur **serveur mutualisé OVH** (« suffisant tant
qu'Harmonia Éducation est seul utilisateur/pilote du projet »), et le plan P13 exige
un déploiement reproductible avec procédure de rollback. Contraintes constatées du
mutualisé (docs/hebergement.md) :

- **pas d'accès SSH** : ni rsync, ni `composer install` distant, ni symlinks
  atomiques à la Capistrano ; seul FTP/FTPS est disponible ;
- pas de Node serveur (ADR-003 : le front est buildé en local/CI) ;
- pas de processus longs (ADR-001) ; cron disponible mais limité ;
- un webroot `~/www/` servi par Apache, le reste du home étant inaccessible en HTTP.

Un simple « FTP écrasant » poserait trois problèmes : transferts intégraux lents et
fragiles, site incohérent pendant l'upload (fichiers mixtes ancienne/nouvelle
version), aucun retour arrière. Le « clone déployable » (§5) exige de plus que la
procédure soit scriptée et documentée, pas artisanale.

## Décision

### Outil de déploiement

Un **script Node** (`scripts/deploy/`) fondé sur **`basic-ftp`** en **FTPS explicite**
(AUTH TLS), exécuté en local ou en CI. Node est déjà requis pour le build front
(ADR-002/003) : aucune dépendance d'environnement nouvelle.

### Synchronisation par manifeste SHA-256

Le script calcule un manifeste `{chemin: sha256}` des artefacts à déployer, le
compare au manifeste déposé sur le serveur lors du déploiement précédent, et ne
transfère que le **delta** (ajouts, modifications, suppressions). Le manifeste est
réécrit en fin de transfert. Déploiements rapides, idempotents, vérifiables.

### Layout serveur

```
~/app/shared/.env               # secrets (BDD, clés LLM, MIGRATE_TOKEN) — hors webroot
~/app/releases/<timestamp>/     # code PHP d'une release, immuable une fois déployée
~/app/current.txt               # pointeur : nom de la release active
~/www/                          # webroot : front statique buildé + api/index.php
```

- Les **secrets vivent hors webroot** (`~/app/shared/.env`), jamais servis par
  Apache — exigence de P12/P13 (« .env hors webroot ») et prérequis ADR-004
  (clé maîtresse hors webroot).
- Chaque déploiement crée `~/app/releases/<timestamp>/` complet ; les anciennes
  releases sont conservées (rotation aux N dernières).
- **`~/app/current.txt` remplace le symlink** (impossible à créer en FTP) : il
  contient le nom de la release active. `~/www/api/index.php` est un
  **front-controller minimal** qui lit `current.txt` puis `require` le point
  d'entrée de la release pointée. La bascule de version est l'écriture d'un
  fichier d'une ligne : quasi atomique, pas de site à moitié déployé.
- Le front statique (`~/www/`) est synchronisé par le même manifeste ; les bundles
  Vite étant fingerprintés, ancien et nouveau HTML restent servables pendant le
  court instant du transfert.

### Rollback

**Rollback = réécrire `current.txt`** avec le nom d'une release antérieure encore
présente (`scripts/deploy/rollback`). Aucun re-transfert, retour arrière en secondes
— la « procédure de rollback documentée » exigée par P13.

### Migrations de base de données

Sans SSH, pas de `php migrate.php` distant. Les migrations s'exécutent via
**`POST /api/admin/migrate`** :

- protégé par un **`MIGRATE_TOKEN`** secret lu dans `~/app/shared/.env`, transmis
  en en-tête par le script de déploiement ;
- **idempotent** : table `schema_migrations`, chaque migration numérotée n'est
  appliquée qu'une fois ; rejouer l'endpoint est sans effet ;
- **verrou `GET_LOCK` MySQL** le temps de l'exécution : deux appels concurrents
  (double déploiement, tick cron simultané) ne peuvent pas appliquer deux fois la
  même migration ;
- migrations **forward-only** selon le motif **expand/contract** : on n'écrit pas
  de `down` ; une release N+1 commence par étendre le schéma (colonnes/tables
  nouvelles, compatibles avec la release N encore pointée), la contraction
  (suppression de l'ancien) n'arrive qu'une fois la release N+1 stabilisée. C'est
  ce qui rend le rollback par `current.txt` sûr : l'ancienne release fonctionne
  toujours sur le schéma étendu.

## Conséquences

**Positives**

- Déploiement et rollback scriptés, reproductibles, compatibles avec le « clone
  déployable » (§5) : un tiers sur n'importe quel mutualisé FTP peut suivre
  INSTALL.md sans SSH.
- Bascule et retour arrière quasi instantanés ; jamais d'état mixte servi.
- Secrets structurellement hors de portée HTTP (§6, P12).
- Transferts delta : un déploiement courant se mesure en secondes.

**Négatives / points de vigilance**

- `POST /api/admin/migrate` est une surface d'attaque : token long généré
  aléatoirement, comparaison en temps constant, journalisation d'audit (P3),
  jamais de token en query string ni dans les logs.
- Le motif expand/contract exige de la discipline de conception des migrations
  (revue systématique : « la release précédente survit-elle à ce schéma ? »).
- `current.txt` est un point unique : le front-controller doit échouer proprement
  (503 + message) si le fichier est absent ou pointe une release manquante.
- La rotation des releases doit surveiller le quota disque du mutualisé.

**Décisions liées** : ADR-002 (stack PHP/MySQL), ADR-003 (build front local, la
cible FTP ne reçoit que des artefacts), ADR-004 (secrets hors webroot).
Remplacera : un ADR ultérieur actera la migration vers l'hébergement scalable v2+
(§5), où symlinks et SSH redeviendront disponibles.
