# INSTALL — monter sa propre instance de humanome.xyz

humanome.xyz est **clone déployable** (cahier §5) : ce dépôt contient tout le
nécessaire pour redémarrer une instance complète — référentiel, prompts,
schémas, moteur, API, front. Ce guide monte une instance de zéro.

## Prérequis

- **PHP 8.2** (l'API cible cette version ; le dev passe par Docker).
- **MySQL 8** (utf8mb4).
- **Node 20+** (build du front, moteur, runner, outil de déploiement).
- **Docker + Docker Compose** (dev local ; recommandé aussi pour le build PHP
  car il fige PHP 8.2 quelle que soit la version locale).
- Git.

## 1. Cloner et configurer

```bash
git clone <url-du-dépôt> humanome && cd humanome
cp api/.env.example api/.env          # puis renseigner DB_*, MIGRATE_TOKEN,
                                      # ANTHROPIC_API_KEY, SODIUM_MASTER_KEY…
```

Générer les secrets : `openssl rand -hex 32` (MIGRATE_TOKEN, POW_SECRET) et
`openssl rand -hex 32` pour `SODIUM_MASTER_KEY` (64 caractères hex).

## 2. Environnement de développement (Docker)

```bash
docker compose up -d                  # PHP 8.2 + MySQL 8
docker compose run --rm php composer install
```

Générer les données dérivées (référentiel, documents de démo) :

```bash
node scripts/convert/carto-data-to-merge-json.mjs
node scripts/convert/extracted-to-day-json.mjs
node scripts/extract-referentiel.mjs                 # référentiel 7.0.0
node scripts/enrich-referentiel.mjs                  # 7.1.0 (définitions des compétences)
node scripts/build-default-prompt-package.mjs
```

## 3. Base de données

Le conteneur `php` travaille dans `api/` : les scripts de la racine se
lancent donc par `../scripts/…`.

```bash
docker compose run --rm php php ../scripts/migrate.php     # applique les migrations en attente
docker compose run --rm php php ../scripts/import-referentiel.php
docker compose run --rm php php ../scripts/import-referentiel.php ../web/public/data/referentiel/respire-v7.1.0.json
docker compose run --rm php php ../scripts/import-prompt-packages.php
docker compose run --rm php php ../scripts/export-referentiel-static.php
```

L'export statique écrit dans `web/public/data/referentiel/` les versions
publiées (`respire-v7.0.0.json`, `respire-v7.1.0.json`) et `index.json`, que
lit la page `#/referentiel`.

Vérifier : `curl http://localhost:8080/api/health` → `{"status":"ok","db":"ok"}`.

## 4. Front

```bash
cd web && npm install && npm run build   # bundle statique dans web/dist
npm run dev                              # ou : serveur de dev, proxy /api -> :8080
```

Le `prebuild` assemble le paquet Twin6 public : il faut au préalable déposer
ses trois gabarits (`0-mega-prompt.md`, `1-scan-pole.md`, `2-kairos-final.md`)
dans `web/public/data/twin6/prompts/`, car ils ne sont pas encore versionnés
(anomalie AN-2 de `docs/cas-utilisation/systeme/UC-SYS-04-construire-artefacts-derives.md`).

Ouvrir http://localhost:5173. Le bundle `web/dist` est aussi ouvrable en
`file://` (routing par hash, ADR-009) sauf les vues journée (fetch relatif).

## 5. Tests

```bash
docker compose run --rm php composer test    # API (PHPUnit)
cd engine && npm test                        # moteur
cd web && npm test                           # front (Vitest)
cd web && npm run test:e2e                    # Playwright (docker mock requis)
node scripts/validate-corpus.mjs             # schémas ↔ données réelles
```

Les suites front et moteur lisent les données dérivées du §2 ; la suite front
lit aussi l'export statique du référentiel (§3) et le paquet Twin6 construit
par `npm run build` (§4).

## 6. Déploiement (OVH mutualisé, sans SSH — ADR-008)

Le déploiement se fait par **releases + pointeur** via FTP (voir `docs/deploiement.md`).

```bash
cp .env.deploy.example .env.deploy            # FTP_HOST/USER/PASSWORD (+ MIGRATE_TOKEN)
# Front statique
cd web && npm run build && cd ..
node scripts/deploy/deploy.mjs static
# API (release + migrations + imports à distance + smoke)
./scripts/deploy/stage-api.sh
node scripts/deploy/deploy.mjs api
```

Rollback : `node scripts/deploy/deploy.mjs rollback` (repointe la release
précédente). Lister les releases distantes : `node scripts/deploy/deploy.mjs releases`.

## 7. Rôles et administration

Le premier compte administrateur s'attribue via l'outillage de déploiement
(jeton `MIGRATE_TOKEN`), puis l'UI `#/admin` prend le relais :

```bash
curl -X POST https://<votre-domaine>/api/admin/grant-role \
  -H "X-Migrate-Token: $MIGRATE_TOKEN" -H "Content-Type: application/json" \
  -d '{"email":"vous@exemple.org","role":"admin"}'
```

## Hors OVH mutualisé

Sur un hébergement avec cron et SSH, on peut planifier `scripts/worker.php`
(cartographie de masse, ticks courts) et `scripts/maintenance.php` (purge des
liens expirés). Sur l'offre OVH gratuite (sans cron), déclencher plutôt les
endpoints `POST /api/admin/worker-tick` et `POST /api/admin/maintenance` depuis
un planificateur externe. Détails : `docs/plan-masse.md`, `docs/deploiement.md`.
