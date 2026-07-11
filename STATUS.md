# STATUS — journal de bord

## En cours

- **M2 (P2)** : visualisation unifiée + premier déploiement humanome.xyz.

## Fait

- 2026-07-12 — **M1 terminé (P0+P1)**. P0 : CLAUDE.md, ADR-001..009 (relus adversarialement),
  inventaire-assets, docker php8.2+mysql8, /api/health, web Vite+React, engine ESM, AGPL-3.0.
  P1 : 5 schémas draft 2020-12 dérivés du corpus réel (enums recensées sur 3590 compétences×59 jours),
  convertisseurs (carto-data→merge, extracted→jour, extract-referentiel), validation double runtime
  (ajv engine/src/validation.js + opis api/src/Validation.php), fixtures fictives « Maya » 3 journées,
  docs/contrats.md. Vérifié : validate-corpus 68/68 OK, engine 6/6, web 2/2, PHP 6/6.
  Bonus : deploy FTPS prêt (ADR-008), oracle de parité sunburst capturé (331 paths du rendu original),
  MySQL prod vérifiée (8.0.46 joignable depuis le cluster).

- 2026-07-12 — Repo initialisé (commit 1 = .gitignore seul), assets copiés en lecture seule
  (`assets-existants/merge-prototype/`, `assets-existants/prototypes-react/`), cahier des
  charges et plan-prompts dans `docs/`.
- 2026-07-12 — Décisions actées avec l'utilisateur : licence AGPL-3.0 ; clé API Anthropic
  fournie (hors repo) ; MySQL OVH à créer via panel (plugin Chrome) ; données réelles de
  démo publiées telles quelles (consentement explicite du 2026-07-11).
- 2026-07-12 — Vérifié serveur OVH : PHP 8.2 (.ovhconfig), www/ vide, FTP OK, pas de SSH.
- 2026-07-12 — MySQL : base OVH existante fournie par l'utilisateur (`example123.mysql.db`,
  hébergée sur un autre hébergement OVH — credentials hors repo, `cahier des charges/mysql.txt`).
  Plus de création via panel nécessaire. **Vérifié le jour même par sonde PDO éphémère
  depuis le cluster humanome.xyz : joignable, MySQL 8.0.46, utf8mb4, PHP webroot 8.2.29.**

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
