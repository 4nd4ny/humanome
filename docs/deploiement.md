# Déploiement (OVH mutualisé, sans SSH)

Modèle : **releases + pointeur** sur un hébergement FTP sans SSH ni processus
longs (ADR-008). Le front est un bundle statique ; l'API est une release PHP
pointée par `~/app/current.txt`.

## Topologie serveur

```
~/app/shared/.env          secrets (hors webroot, 403 en HTTP)
~/app/releases/<ts>/        code PHP par release (N=3 conservées)
~/app/current.txt          chemin de la release active
~/www/                      webroot : bundle Vite + data/ + api/index.php + .htaccess
```

`~/www/api/index.php` (front-controller) lit `current.txt` et délègue à la
release pointée.

## Prérequis

`cp .env.deploy.example .env.deploy` puis renseigner `FTP_HOST`, `FTP_USER`,
`FTP_PASSWORD`, `FTP_SECURE=false` (le cluster OVH ne supporte pas AUTH TLS,
vérifié), et `MIGRATE_TOKEN` (identique à celui de `~/app/shared/.env`).

## Déployer

```bash
# Front statique (sync par manifeste SHA-256, delta seul)
cd web && npm run build && cd ..
node scripts/deploy/deploy.mjs static

# API : release + www/api + current.txt (écrit en dernier) + migrations à
# distance + imports référentiel/prompt-packages + smoke health
./scripts/deploy/stage-api.sh
node scripts/deploy/deploy.mjs api
```

Le pointeur `current.txt` est écrit **après** l'upload complet de la release :
un déploiement interrompu ne bascule jamais sur une release partielle. Les
migrations sont **forward-only** (expand/contract) — jamais de destruction dans
la même release que le code qui l'utilise.

## Rollback

```bash
node scripts/deploy/deploy.mjs releases   # lister les releases distantes
node scripts/deploy/deploy.mjs rollback   # repointe current.txt sur la précédente
```

Le rollback est **code-seul** (les migrations forward-only restent compatibles).
Les assets front hashés des releases précédentes restent présents jusqu'à leur
purge (N=3), donc un `index.html` antérieur reste servable ; pour revenir aussi
le front, redéployer le `static` de la version cible.

## Invalidation de cache

Le versioning par répertoire de release neutralise l'OPcache (chemins neufs).
Côté navigateur, `.htaccess` marque les assets hashés `immutable` (1 an) et
`index.html` `no-cache`. Ne pas activer le CDN OVH en v1.

## Tâches planifiées

L'offre OVH **gratuite** n'inclut pas de cron (vérifié dans le panel :
« Ce service n'est pas accessible pour l'offre Hébergement gratuit 100M »).
Aucun cron n'est requis pour la **correction** : les compteurs de démo sont
indexés par jour UTC (rollover automatique) et l'expiration des liens est
appliquée à la lecture. Pour la cartographie de masse et la maintenance,
déclencher depuis un planificateur externe :

```bash
curl -X POST https://humanome.xyz/api/admin/worker-tick  -H "X-Migrate-Token: $TOKEN"
curl -X POST https://humanome.xyz/api/admin/maintenance   -H "X-Migrate-Token: $TOKEN"
```

Sur une offre avec cron (perso/pro), planifier plutôt `php scripts/worker.php`
et `php scripts/maintenance.php`.

## Santé

- `GET /api/health` → `{status, version, db}` (smoke de déploiement).
- `GET /api/status` → + état démo et worker (page de santé, cacheable 30 s).
