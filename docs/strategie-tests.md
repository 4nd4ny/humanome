# Stratégie de tests & non-régression par release

**Question fréquente : « faut-il Selenium ? »** — Non. Le projet est déjà outillé
pour la non-régression, sur trois couches, et l'outil bout-en-bout est
**Playwright**, pas Selenium. Playwright est le successeur moderne de Selenium
(pilotage du navigateur via le protocole DevTools plutôt que WebDriver) :
attente automatique des éléments, moins de tests instables (« flaky »),
multi-navigateurs (Chromium/Firefox/WebKit), traces d'échec rejouables. Ajouter
Selenium ne ferait que dupliquer cette couche avec un outil plus fragile.

## Les trois couches (pyramide de tests)

| Couche | Outil | Portée | Où | Quand |
|---|---|---|---|---|
| **Unitaire + intégration API** | **PHPUnit** (php 8.2 via Docker) | Routes Slim, dépôts, services, gouvernance, crédits/PayPal, RGPD — contre une **vraie base MySQL** | `api/tests/` | À chaque changement PHP, avant chaque commit/release |
| **Unitaire + composant** | **Vitest** (Node) | Moteur ESM (parité octet Twin9, merge, sunburst) et front React (vues, hooks, lib, aide, thème) en **jsdom** | `engine/src/**/*.test.js`, `web/src/**/*.test.{js,jsx}` | À chaque changement JS, avant chaque commit/release |
| **Bout-en-bout (e2e)** | **Playwright** (Chromium) | Parcours réels dans un vrai navigateur : apprenant, cartographe, promptologue, nav/burger, timeline, guides — avec l'API docker en provider **mock** | `web/e2e/*.e2e.js` | Avant une release, et sur tout changement touchant un parcours utilisateur |

**Volumétrie actuelle (2026-07-16)** : PHPUnit **481** tests, Vitest **926**
(engine) + **696** (web), Playwright **~9** scénarios e2e.

## Ce qui garantit la non-régression entre releases

La règle du projet (CLAUDE.md) est **« tests verts avant commit »** : les trois
suites doivent passer avant tout commit, et donc avant tout déploiement. La
non-régression ne repose pas sur un seul outil e2e mais sur la **combinaison** :

- Les **contrats de format** entre modules sont figés par des tests dédiés
  (ex. le diff promptologue partage une **fixture** entre le PHP qui la produit
  et le front qui la consomme : renommer une clé casse les deux côtés — voir
  `schemas/fixtures/diff/`).
- La **parité octet** du moteur Twin9 est verrouillée par 6 oracles CPython
  (`engine/src/twin9/parite.test.js`) : toute dérive du portage JS est rouge.
- Les **invariants de sécurité** (garde de rôle 401/403, CSRF, IDOR, purge
  RGPD, isolation sandbox réseau) ont chacun leur test.
- Les **parcours critiques** (inscription → run → partage → export → suppression)
  sont rejoués en navigateur réel par Playwright.

## Checklist de non-régression avant une release

```sh
# 1. API (PHP) — base MySQL réelle (Docker)
docker compose up -d
docker compose run --rm php composer test          # PHPUnit, doit être 100 % vert

# 2. Moteur
cd engine && npm test                              # Vitest

# 3. Front
cd web && npm test                                 # Vitest (jsdom)
npm run build                                       # le build de prod doit passer

# 4. Bout-en-bout (navigateur réel) — local uniquement
#    Prérequis : API docker en provider mock (docker-compose.override.yml)
cd web && npm run test:e2e                          # Playwright, ~30 s
```

Une release ne part que si **les quatre passent**. Les détails d'exécution e2e
(prérequis mock, rejouabilité, quotas) sont dans `docs/tests-e2e.md`.

## Automatiser (recommandé, backlog D10)

Aujourd'hui la checklist est **manuelle** (lancée avant chaque release). Pour la
rendre systématique à chaque release, deux ajouts, sans changer d'outils :

1. **Intégration continue GitHub Actions** (`.github/workflows/ci.yml`) : au
   `push`/`pull_request`, jouer les couches 1–3 (PHPUnit + Vitest + build). Les
   e2e Playwright peuvent tourner en CI aussi (chromium headless), mais ils
   exigent l'API docker + le provider mock — à ajouter dans un second temps.
2. **Hook pre-commit** local : refuser un commit si une suite est rouge (et,
   couplé au futur `scripts/check-publiable.mjs`, refuser un secret ou un
   gabarit confidentiel — voir plan de dev D10).

> Tant que le dépôt n'était pas publié, l'exécution manuelle avant release
> suffisait ; dès la mise en ligne GitHub, la CI devient le garde-fou de
> non-régression par défaut sur chaque contribution.

## Pourquoi pas Selenium (résumé)

- **Playwright** est déjà en place, couvre les mêmes besoins avec moins de code
  et moins d'instabilité, et sait piloter Chromium/Firefox/WebKit.
- Le contexte d'hébergement (OVH mutualisé, **pas de Node serveur**) fait que
  les e2e sont un outil de **poste de développement / CI**, jamais déployé
  (ADR-003) — vrai pour Playwright comme pour Selenium.
- Migrer vers Selenium demanderait de réécrire les scénarios existants pour un
  gain nul. La recommandation est donc : **garder Playwright**, et
  éventuellement l'exécuter en CI pour couvrir chaque release automatiquement.
