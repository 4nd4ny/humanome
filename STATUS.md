# STATUS — journal de bord

## En cours

- **M7 (P9+P10)** : espaces cartographe et promptologue.

## Fait

- 2026-07-12 — **M6 terminé (P8) : espace apprenant complet, EN PRODUCTION.** API : cartographies
  (stockage opt-in daté, liste sans document), liens de partage (token 128 bits haché, Argon2id,
  404 homogène anti-énumération, révocation, rate-limit), formation trackée, clés API personnelles
  chiffrées sodium (AD-4), prompt-packages publiés + paquet par défaut aurora-v3-reconstruit@1.0.0
  généré depuis les gabarits RÉELS du moteur (import idempotent par hash, endpoint admin).
  Front : dashboard (#/espace, fonctionne aussi anonyme/local), formation Markdown embarquée
  (parseur maison + DOMPurify, progression locale→serveur), assistant de run 5 étapes (paquet,
  fournisseur clé perso/service humanome, estimation, exécution avec checkpoints IndexedDB et
  REPRISE réelle), panneau cartographies (confidentialité, opt-in serveur RGPD explicite,
  partage+révocation, visionneuse), ShareView lecture seule, export/import archive validée au
  schéma. **E2E Playwright DoD vert** (compte→portfolio→run mock 24 appels→partage en contexte
  privé→export validé→suppression→404). Audit : 1 faible corrigée (no-store sur révélation de
  clé). PHP 182/182, web 299/299. Smoke prod : parcours complet vérifié en ligne.
  Backlog : titre « Mes cartographies » dupliqué (cosmétique) ; récits narratifs du merge en P10.

- 2026-07-12 — **M5 terminé (P6+P7) : démo LLM publique VALIDÉE EN PRODUCTION** (run complet
  réel : collage → PoW → 7 pôles Sonnet → visualisation Journée interactive sur humanome.xyz/#/essayer).
  P6 : proxy /api/llm (provider/model/plafonds imposés serveur, clé jamais exposée), garde-fous
  tous VÉRIFIÉS EN LIGNE (honeypot, PoW HMAC one-time — rejeu 429, quota IP/h — 429 vécu,
  coupe-circuit budget quotidien — 503 vécu, plafond d'entrée), gdoc-text anti-SSRF, page
  Essayer (progression par pôle, annulation, zéro persistance). P7 : portfolio client-first
  (coller/.txt/.md/Google Docs, segmentation en journées testée ×30, IndexedDB, ADR-010
  repli éditeur — Sqilium est une app Rails non intégrable). Audit abuseur : faille ÉLEVÉE
  corrigée (rotation IPv6 /64 → buckets par préfixe, aussi appliqué à l'auth).
  **Fiabilisation LLM apprise en prod** (~20 runs de debug, chaque échec = un correctif) :
  thinking par défaut du modèle mange le budget (→ thinking disabled) ; JSON indenté double
  le coût (→ compact monoligne exigé) ; malformations stochastiques (→ tool_use forcé =
  JSON garanti par l'API + retry unique par appel) ; glissements sémantiques (→ normalisation
  déterministe des invariants du corpus + dégradation ciblée pilotée par les chemins d'erreur
  ajv + validation par pôle) ; kairos volumineux (→ bornes de longueur + kairosOptional :
  dégradation gracieuse à null avec note UI) ; timeouts (→ curl 150 s, le LB OVH suit ;
  8192 tokens de budget). Config prod (env ~/app/shared/.env) : Sonnet 5, 8192 tokens,
  40 req/h/IP, PoW 16 bits, budget 15 $/jour (les compteurs de la journée de test sont
  consommés ; ramener à 5-10 $ selon usage réel).
  Backlog M5 : panneau pôle sans rapport (dégradé) affiche l'état vide — afficher audit +
  passages ; envisager le schéma JSON complet dans le tool input_schema pour ancrer kairos.

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
