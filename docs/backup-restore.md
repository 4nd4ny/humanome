# Sauvegarde et restauration

## Sauvegardes de la base MySQL

**Primaire — OVH.** La base MySQL (`example123.mysql.db`) est hébergée sur un
hébergement OVH mutualisé qui fournit des **sauvegardes automatiques** (panel
OVHcloud → Web Cloud → Bases de données). C'est la source de vérité pour la
restauration en cas d'incident hébergeur.

**Secondaire — copie hors-OVH (applicative).** Pour une copie indépendante de
l'hébergeur, `scripts/backup/backup-db.mjs` réalise un `mysqldump` depuis toute
machine capable de joindre l'hôte MySQL :

```bash
node scripts/backup/backup-db.mjs            # -> backups/humanome-<horodatage>.sql
node scripts/backup/backup-db.mjs --out /chemin/backup.sql
```

Le script lit `DB_HOST/DB_NAME/DB_USER/DB_PASSWORD` depuis `api/.env` (ou
l'environnement) et exige le client `mysqldump`. L'hébergement mutualisé OVH n'a
pas de shell : lancer ce script depuis un poste de travail ou une CI. Les dumps
(`backups/`) sont gitignorés (données personnelles).

## Restauration — procédure TESTÉE

La restauration a été **vérifiée de bout en bout** sur l'environnement Docker :
dump d'une base peuplée → nouvelle base → import → 29 tables restaurées.

```bash
# 1. Dump (source : base à sauver)
node scripts/backup/backup-db.mjs --out backups/restore-test.sql

# 2. Restauration dans une base cible
mysql -h<hôte> -u<user> -p<mdp> <base_cible> < backups/restore-test.sql

# En développement (Docker) :
docker compose exec -T mysql mysql -uroot -proot_dev humanome < backups/restore-test.sql
```

Vérification post-restauration :

```bash
mysql -h<hôte> -u<user> -p<mdp> -N \
  -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='<base>'"
```

Le dump est un `--single-transaction` en `utf8mb4` : cohérent (pas de verrou de
tables) et fidèle à l'encodage de production (ADR-002).

## Fréquence recommandée

- OVH automatique : quotidienne (par défaut de l'offre).
- Copie hors-OVH : hebdomadaire, avant chaque déploiement de migration
  destructive (contract-phase), et à la demande avant une opération risquée.
