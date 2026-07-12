# Tests bout-en-bout (Playwright) — parcours apprenant (DoD P8)

**Local uniquement.** Playwright et le navigateur Chromium sont des outils de
poste de développement : rien de tout ceci n'est déployé ni exécutable sur
l'hébergement OVH (pas de Node serveur, ADR-003).

## Ce qui est testé

Un seul scénario séquentiel, `web/e2e/parcours-apprenant.e2e.js` — LE parcours
cœur du MVP (plan-prompts P8, cahier §3.2/§3.6/§6), chaque étape étant un
`test.step` nommé en français :

1. Création de compte (email unique par run : rejouable sans nettoyage).
2. Création d'un portfolio : collage de la fixture
   `schemas/fixtures/portfolio-3-jours.md`, segmentation automatique vérifiée
   (3 journées datées 2026-01-05..07), sauvegarde locale (IndexedDB).
3. Assistant « Nouveau run » : portfolio → version de prompt par défaut
   (`aurora-v3-reconstruit@1.0.0`) → fournisseur « Service humanome »
   (proxy `/api/llm`, preuve de travail par appel) → estimation affichée.
4. Run complet : exactement **24 appels mock** comptés sur le réseau
   (3 journées × (7 pôles + 1 synthèse kairos)).
5. Les 4 cartographies (3 jours + 1 merge) apparaissent dans le tableau de
   bord ; ouverture de la visualisation (sunburst rendu).
6. Opt-in explicite « copie serveur » (RGPD §6.2), puis partage : lien +
   mot de passe (`partage-test-1`), expiration par défaut 90 jours.
7. Ouverture du lien dans un **contexte navigateur neuf** (équivalent
   navigation privée) : mauvais mot de passe refusé (403), bon mot de passe →
   document rendu en lecture seule.
8. Export de l'archive : téléchargement réel, puis **validation au schéma**
   `archive-export` par le moteur (`engine/src/validation.js`) dans le test.
9. Suppression du compte (confirmation par email) : purge réelle.
10. Après la purge, le lien de partage répond 404 (réponse homogène
    anti-énumération).

## Prérequis

1. **API docker avec le provider LLM mock** (aucune clé API nécessaire) :

   ```sh
   docker compose up -d          # php 8.2 + mysql 8, http://localhost:8080
   curl -s http://localhost:8080/api/health   # {"status":"ok",...,"db":"ok"}
   ```

   `docker-compose.override.yml` (auto-chargé, jamais déployé) fournit
   `DEMO_PROVIDER=mock` (réponses tirées de `schemas/fixtures/`) et remonte le
   quota `/api/llm` à 500/h/IP — le quota de production (20/h) bloquerait le
   run de 24 appels en plein milieu.

   Migrations à jour si la base est neuve :
   `curl -X POST -H 'X-Migrate-Token: dev_migrate_token' http://localhost:8080/api/admin/migrate`.

2. **Dépendances web + navigateur Playwright** (une fois) :

   ```sh
   cd web
   npm install                    # @playwright/test est en devDependency
   npx playwright install chromium
   ```

Le dev-server Vite (port 5173, proxy `/api` → :8080) est lancé et arrêté par
Playwright lui-même (`webServer` de `web/playwright.config.js`) ; s'il tourne
déjà, il est réutilisé.

## Commandes

```sh
cd web
npm run test:e2e               # toute la suite e2e (~30 s)
npx playwright test --headed  # avec fenêtre visible
npx playwright show-trace test-results/*/trace.zip  # trace d'un échec
```

`workers: 1` est imposé : le scénario partage l'état serveur (compte, quotas
IP) et l'état navigateur (IndexedDB) d'étape en étape.

## Choix d'implémentation

- **Suffixe `.e2e.js`** (et `testMatch` dédié dans `playwright.config.js`) :
  les motifs par défaut de vitest incluent `**/*.spec.js` — un suffixe propre
  évite que `npm test` (vitest, jsdom) ne ramasse les scénarios Playwright.
- **Timeout de test 420 s** : chaque appel `/api/llm` exige une preuve de
  travail de 20 bits (~1 s) ; le run mock complet se joue en pratique en
  ~20 s, mais la marge absorbe les machines lentes.
- La validation de l'archive importe directement
  `engine/src/validation.js` (validateurs précompilés, aucun ajv à charger) :
  le test utilise exactement le même validateur que l'application.

## Rejouabilité / limites connues

- Email de compte unique par run (`e2e-<timestamp>@humanome.test`) et compte
  supprimé en fin de scénario : la suite est rejouable sans nettoyage.
- `POST /api/auth/register` est limité à **10/h par IP** (P3) : au-delà de
  ~10 exécutions dans l'heure sur la même base dev, l'inscription répondra
  429. Remède dev : attendre, ou vider la table `rate_limits`
  (`docker compose exec mysql mysql -uhumanome -phumanome_dev humanome -e
  'TRUNCATE rate_limits;'`).
- Le run n'exécute que le pipeline embarqué (v1 assumée, P8.3) : le choix de
  version de prompt est tracé dans `runMeta`, l'exécution des paquets publiés
  arrive avec le banc promptologue (P10).
