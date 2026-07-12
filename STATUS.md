# STATUS — journal de bord

## En cours

- **M5 (P6+P7)** : proxy LLM + démo publique « Essayer » + module portfolio.

## Fait

- 2026-07-12 — **M4 terminé (P5) : moteur complet, gate de parité franchie** (rapport :
  docs/rapport-parite-moteur.md). Étage A (merge numérique) : PARITÉ 100 % — 132 618 valeurs
  comparées à l'oracle, formules retrouvées jusqu'à l'arrondi demi-pair Python (pythonRound).
  Étage B1 : 69/69 prompts narratifs identiques au byte près. Étage B2 : 100 % — quintiles
  exclusifs Python retrouvés, **archétype déterministe retrouvé (arbre à médiane par pôle,
  54/54)**, feedback HTML octet à octet. Étage C (extraction) recréé sans oracle (typologie
  d'attaques a..h retrouvée dans le corpus) = v1 du prompt-package par défaut (P10).
  Providers ×6 (2 transports, retry, estimate/coûts), runs/checkpoints/reprise (IndexedDB
  injectable), consistance multi-run, bout-en-bout mock 3 jours avec interruption/reprise.
  Revue adversariale : 3 bugs réels corrigés (dont corruption silencieuse du parseur JSON).
  Tests engine 182/182 ; squelettes de formation ×3 parcours livrés (§4.6).

- 2026-07-12 — **M3 terminé (P3+P4) : API en production.** 5 migrations MySQL (users/roles/
  sessions PDO/rate_limits/referentiel_versions/prompt_*/cartographies opt-in datée/share_links/
  training_progress/user_api_keys/audit_events, purge RGPD par FK), auth complète (ARGON2ID,
  anti-énumération, CSRF double-submit, rate-limit progressif, RequireRole), module référentiel
  versionné (import v7 idempotent hash-vérifié, brouillon→publication immuable, diff, export
  statique), front #/referentiel (arbre+recherche+permaliens+Decidim) et #/compte (RGPD),
  audit sécurité adversarial passé (1 défaut latent corrigé + 9 tests). Déploiement par releases
  ADR-008 opérationnel : 3 off-by-one de layout corrigés (migrations/schemas/VERSION),
  route POST /api/admin/import-referentiel ajoutée (pas de SSH). Prod vérifiée : migrations
  idempotentes, referentiel v7.0.0 servi par l'API, parcours register→me→purge RGPD→401,
  health db:ok versionné. Tests : PHP 89/89, web 147/147, corpus 68/68.

- 2026-07-12 — **M2 terminé (P2) : humanome.xyz EN LIGNE.** Visualisation unifiée déployée
  (https://humanome.xyz) : vue Merge (sunburst porté à parité stricte 331/331 paths contre le
  rendu original — divergence d'1 ulp de Math.cos/sin V8 résolue par arrondi correct BigInt),
  vue Journée reconstruite depuis extracted/ (verdicts, blocs adversariaux, traces, exclus,
  ?focus=), heatmap chrono cliquable, réécriture des 1262 liens du corpus vers les routes hash,
  DOMPurify durci (aucune requête externe possible depuis le HTML narratif), drag & drop JSON
  validé ajv, responsive 360px (onglets une-main ; fix minmax(0,1fr)), CSS print, a11y clavier.
  Bundle IIFE file://-compatible. Déployé par manifeste SHA-256 (65 fichiers), HTTPS forcé,
  CSP/HSTS actifs, smoke en ligne OK (deep-link jour + data lazy + console propre).
  Tests : 112/112. Limitation vérifiée : le FTP OVH clusterNNN ne supporte pas AUTH TLS →
  transfert en FTP simple (documenté).

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
