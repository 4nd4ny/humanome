# STATUS — journal de bord

## En cours

- **M1 (P0+P1)** : fondations du dépôt.

## Fait

- 2026-07-12 — Repo initialisé (commit 1 = .gitignore seul), assets copiés en lecture seule
  (`assets-existants/merge-prototype/`, `assets-existants/prototypes-react/`), cahier des
  charges et plan-prompts dans `docs/`.
- 2026-07-12 — Décisions actées avec l'utilisateur : licence AGPL-3.0 ; clé API Anthropic
  fournie (hors repo) ; MySQL OVH à créer via panel (plugin Chrome) ; données réelles de
  démo publiées telles quelles (consentement explicite du 2026-07-11).
- 2026-07-12 — Vérifié serveur OVH : PHP 8.2 (.ovhconfig), www/ vide, FTP OK, pas de SSH.

## Prochaines étapes

1. P0 : CLAUDE.md ✅, ADR-001..009, docker-compose, api/health, web Vite, inventaire assets.
2. P1 : schémas JSON + convertisseurs (carto-data→merge-json, extracted→day-json,
   extract-referentiel) + fixtures + validation double runtime (ajv + PHP).
3. M2 : fusion visualisation (P2) + premier déploiement.

## Dettes techniques / décisions en attente

- Publication GitHub reportée (backlog) — sauvegarde par git bundle en attendant.
- Golden Prompt : non fourni, hors git par design.
- Pipeline Python amont absent : moteur rétro-conçu en M4 avec oracles
  (`intermediate/carto_merge.json`, `intermediate/prompts/`).

## Jalons

| Jalon | Contenu | État |
|---|---|---|
| M1 | P0 fondations + P1 schémas/convertisseurs | en cours |
| M2 | P2 visualisation unifiée + 1er déploiement | à faire |
| M3 | P3 BDD/comptes + P4 référentiel | à faire |
| M4 | P5 moteur (parité oracle) | à faire |
| M5 | P6 démo LLM + P7 portfolio | à faire |
| M6 | P8 espace apprenant | à faire |
| M7 | P9 cartographe + P10 promptologue | à faire |
| M8 | P11 masse B2B | à faire |
| M9 | P12 durcissement + P13 prod v1.0.0 | à faire |
