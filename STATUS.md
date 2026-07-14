# STATUS — journal de bord

## État : v1.0.0 — EN PRODUCTION

Les 14 prompts P0→P13 sont appliqués, intégrés, déployés sur https://humanome.xyz et
vérifiés en ligne. Voir « Actions restantes (utilisateur) » en fin de fichier.

## Fait

- 2026-07-14 — **En-tête épuré : grappe d'actions flottante + tiroir de nav depuis la
  gauche + épinglage + déconnexion rapide.** `.app-header` perd la marque et son fond
  (coquille invisible, juste une réserve de hauteur) ; `.app-header-actions` (aide + burger)
  passe en `position: fixed` (un `sticky` classique serait resté borné par la boîte quasi
  vide de `.app-header`, qui n'a plus assez de hauteur propre pour offrir une plage
  d'accroche — piège découvert et corrigé en vérifiant au navigateur, pas juste supposé).
  Le panneau de nav (`.app-nav-panel`) passe d'un dropdown ancré sous le bouton à un tiroir
  `position: fixed` pleine hauteur qui glisse depuis le **bord gauche de l'écran** (pas du
  bouton, resté à droite) via `transform: translateX(-100%/0)`, toujours dans le DOM (pas de
  `display:none`, a11y). Ajout d'une **icône punaise** dans l'en-tête du panneau
  (`.app-nav-panel-head`) : épingle l'ouverture (`is-pinned`), qui résiste au survol perdu,
  au clic extérieur et même à un changement de route (seule Échap ou la punaise referment) —
  état `pinned` lu via ref dans l'effet de route pour ne pas le reprogrammer à chaque
  épinglage. Ajout d'un bouton **« Se déconnecter »** (icône porte + flèche) en bas de
  `app-nav`, visible seulement connecté, appelant le vrai `logout()` d'`api/client.js` avec
  dégradation gracieuse (comme `AccountView`). `html { overflow-x: hidden }` pour clipper le
  tiroir hors-écran sans élargir le scroll (attention : jamais sur `body` seul, bascule
  implicite d'`overflow-y` en `auto` qui casse les contextes de scroll imbriqués). Vérifié au
  navigateur : desktop (survol révèle, clic épingle, épinglage survit à une vraie navigation
  intra-app, Échap referme + rend le focus), mobile (tap ouvre/ferme au tap extérieur),
  actions flottantes visibles au défilement sans chevaucher le contenu. Tests web 537 verts.

- 2026-07-14 — **Refonte de la navigation : 7 familles d'intention + landing « palais mental ».**
  Étude d'ergonomie complète (`docs/ergonomie-navigation.md` : mindmaps par persona, frictions
  confirmées + découvertes via 8 lentilles-persona multi-agents, 3 philosophies candidates,
  synthèse) puis câblage validé par l'utilisateur. **(1) Burger accessible** : la nav quitte la
  barre pour un panneau déroulant (survol desktop avec délai de grâce, clic épinglant web+mobile,
  focus clavier via `:focus-within`, Échap/clic-extérieur ferment ; liens toujours dans le DOM,
  masquage visuel seulement). **(2) `nav.js` réécrit** = source unique des 7 familles nommées par
  le BUT (Découvrir · Ma cartographie · Encadrer et garantir · Piloter mon organisation · Faire
  évoluer · Administrer · Mon compte), role-additives, items filtrés par rôle (l'épistémiarque a
  enfin un domicile : « Édition du référentiel ») ; badges d'échelle de valeur
  gratuit/standard/premium sur Essayer / Cartographier mes écrits / Analyse approfondie
  (friction n°1) ; `isCurrentItem` route+section. **(3) Landing de profil**
  (`components/FamilyTiles.jsx`) : tuiles des familles de la session teintées par famille
  (`--fam-*`) ; visiteur = bouton « Voir les profils d'utilisateurs » révélant la persona-bar
  (8 profils ; Employeur = carte explicative du lien de partage) ; **callout d'aide** : le
  survol/focus d'un lien de tuile affiche le contenu du bouton « ? » (`help/registry.js` via
  `parseHash`), le **1er clic sélectionne** (aria-live, Échap désarme, clics modifiés natifs),
  le **2e clic ouvre** — la « table des matières interactive » en actes. Prototype TOC conservé
  dans l'état (`docs/prototypes/plan-du-site-toc.html`). **Revue adversariale multi-agents du
  diff avant commit : 17 findings confirmés, tous corrigés** — dont le survol qui reprend la
  main sur un lien armé, l'armement par item (alias #/espace), la purge du callout au
  changement de profil, `role=group` sur les familles du burger, contrastes AA (teal 700),
  consignes clavier, et `help/registry.js` + tableau de bord alignés sur les nouveaux libellés
  (fin de « Lancer un run »). Vérifié en navigateur (visiteur, aperçu Cartographe, survol,
  deux-clics, navigation réelle, armé+survol post-correctif). Tests web 535. Non déployé
  (front seulement, `npm run build` OK + deploy à la prochaine fenêtre).

- 2026-07-13 — **Twin_v9 (le vrai Golden Prompt) porté et intégré (ADR-010).** Système
  multi-agents Python (~4400 l., 29 gabarits, ~3000 appels/run) rendu opérationnel sur le
  site. (T1) specs de portage bit-à-bit ; (T2) **portage JS `engine/src/twin9/` avec parité
  OCTET-À-OCTET** contre 6 oracles mock Python (0 écart) ; (T3) serveur : gabarits secrets en
  base, `POST /api/twin9/appel` (rendu serveur, base_url verrouillée, filtre anti-fuite),
  crédits prépayés micro-USD + **PayPal en flux redirect**, **factures récapitulatives
  mensuelles** + suivi dépenses (particuliers ET établissements), **marge +10 %** (couvre
  PayPal/OVH/domaine/démo Haiku) ; (T4) front : run (consentement RGPD, **devis via run mock
  navigateur avant paiement**, progression + reprise IndexedDB, résultats), crédit+factures
  imprimables, éditeur admin des gabarits + table des comptes ; (T5) déployé (désactivé).
  **Revue de sécurité adversariale** → 2 failles corrigées (course de solde/découvert ;
  contournement du filtre anti-fuite). **Correctif majeur du raccord réel** (le portage rendait
  les prompts côté client ; sur le site les gabarits + fiches confidentielles doivent rester
  serveur) : le moteur envoie chemin+variables d'état, le serveur **injecte les fiches secrètes**
  (`FicheStore`, jamais dans `/meta`) — bug invisible aux 903 tests mock, attrapé par un **test
  de contrat hors-ligne** et **prouvé par un vrai appel Anthropic** (greffier réel, fiche injectée,
  réserve→réconciliation = coût réel). Suites : PHP 373, engine 903, web 520. **Reste avant mise
  en service (utilisateur)** : identifiants PayPal REST (fournis plus tard) ; import des gabarits
  en prod (`scripts/twin9/import-protocole.mjs`, X-Migrate-Token) qui active la fonctionnalité —
  décision délibérée de l'utilisateur. Source `Twin_v9/` + gabarits = confidentiels, gitignorés.

- 2026-07-13 — **Phase UX post-v1 (demande utilisateur, 6 points) : trois chantiers livrés.**
  **(B) Navigation adaptée au rôle + aide contextuelle.** `web/src/nav.js` = source unique
  rôle → sections, groupées par famille (« Découvrir » pour tous ; « Mon travail » selon les
  rôles de la session, rafraîchie sans rechargement via l'événement `humanome:auth`). Bouton
  « ? » dans l'en-tête : aide par rubrique et par rôle (`web/src/help/`). En-tête restylé
  (rubrique courante marquée, cibles 44px).
  **(A) Réglages démo éditables depuis l'admin (smartphone).** Couche d'overrides en base
  (`settings.demo_overrides`) prioritaire dans `DemoConfig::load()` (base > env > fichier >
  défaut, fail-safe DB) ; API session admin `GET/PUT/DELETE /api/admin/demo-config` (validation
  bornée 422, audit sans valeurs, clé API jamais exposée — env uniquement ; provider non
  éditable). UI Réglages : grand interrupteur activer/désactiver (un clic, effet immédiat sur
  POST /api/llm — vérifié en dev : OFF → challenge refusé → ON → reset), modèle (menu +
  champ libre), 7 champs bornés avec badge d'origine (base/env/fichier/défaut). Nav admin
  refondue (accueil en cartes, onglets pastilles, mobile-friendly).
  **(C) Timeline animée de la cartographie.** `web/src/lib/sunburst/as-of.js` reconstruit la
  carte cumulée à toute date (règles verbatim du moteur, seuils de quintile FIXES calculés sur
  le doc final → la dernière trame == merge.json publié, 0 écart, parité 331 intacte) ;
  `TimelinePlayer` (lecture/pause/vitesse/scrubber accessible, arrêt en fin de plage, pause
  auto à la sélection d'un secteur, prefers-reduced-motion) câblé dans MergeView à côté de la
  heatmap ; compteur cumulé « N compétences sur la carte » + score du jour. Vérifié en
  navigateur : la démo se construit de 11 → 54 compétences sur les 59 feuilles. Idées reprises
  des prototypes `temporal-progression`/`cartography-viewer` (lecteur, scrubber, pivot).
  Tests : PHP 320, web 480, engine 214. Déployé (static + api).

- 2026-07-12 — **Post-v1.0.0 : deux défauts détectés puis corrigés (au lieu de simplement journalisés).**
  (1) **Crash de la vue diff du promptologue** : `DiffView` attendait une forme française fictive
  (`ajoutes/retires/modifies`, `from/to` en chaînes) que le serveur n'émet jamais — `PackageDiff.php`
  renvoie des clés anglaises, `from/to` en objets `{version}`, lignes `{op,line,text}` ; rendre
  `{diff.from}` (objet) plantait React et vidait l'atelier. Vue réécrite pour consommer la forme
  RÉELLE ; le test unitaire nourrit désormais cette forme (il propait la fiction et masquait le bug),
  l'e2e clique le vrai bouton « Diff contre X » et vérifie le rendu. (2) **Portabilité RGPD des
  cartographies de masse** (art. 15/20) : un apprenant ne pouvait pas récupérer les documents produits
  pour lui par un établissement (accès réservé au rôle établissement). Ajout de
  `GET /api/mes-documents-masse` (rôle apprenant, accès survivant au départ de la cohorte) + intégration
  à l'export « un clic ». Déployé (v1.0.0-2). Tests : PHP 311, web 440, engine 214, e2e vert.

- 2026-07-12 — **P13 finalisé : v1.0.0 déployée et taguée.** Le chantier D du workflow M9
  (déploiement/clone/status) ayant échoué en cours de flux, complété à la main : `GET /api/status`
  (santé publique version/db/démo/worker, cacheable 30 s, sans secret, testé) ; commandes
  `deploy.mjs releases` et `rollback` (repointage de `current.txt`, exercées en prod) ;
  `scripts/backup/backup-db.mjs` + restauration **testée en round-trip sur Docker** (dump → base
  neuve → 29 tables) ; `INSTALL.md` (clone déployable), `README.md` (vitrine AGPL-3.0),
  `api/.env.example`, `docs/deploiement.md`, `docs/backup-restore.md`. Historique git scanné :
  aucun secret réel (seuls des placeholders EXEMPLE). Déploiement final : migration 010 en prod
  (10/10), `/api/status` sain, en-têtes API stricts (CSP `default-src 'none'`, X-Frame DENY),
  CSP front avec jetons sandbox, page /confidentialite rendue. **Contrainte OVH consignée**
  (vérifiée au panel) : offre gratuite → PAS de cron ; masse/maintenance par endpoints externes,
  rien ne casse sans cron. Suites finales : PHP 308/308, web 439/439, engine 214/214, e2e 5/5.

- 2026-07-12 — **M9 terminé (P12+P13) : admin, RGPD transverse, durcissement — v1.0.0 INTÉGRÉE.**
  Clôture qualité : les 4 chantiers M9 (A administration, B RGPD transverse, C durcissement,
  D déploiement) fusionnés sans friction. **Suites toutes vertes ENSEMBLE** : PHP **307/307**
  (2470 assertions), web **439/439** (54 fichiers), engine **214/214**, runner **25/25**,
  e2e **5/5**, `npm run build` OK. **Parcours clone déployable rejoué sur instance vierge**
  (`docker compose down -v` → `up -d`) : migration DEPUIS ZÉRO par l'endpoint de prod
  `POST /api/admin/migrate` → **10/10 migrations appliquées dans l'ordre, 0 collision**
  (010 se pose proprement sur 009) ; imports idempotents (référentiel 7.0.0 + prompt-package
  `aurora-v3-reconstruit@1.0.0`) ; `GET /api/health` → `status ok, db ok, version` ; parcours
  minimal register→me→logout→login→logout OK (compte id 1 rôle `apprenant`, logout gardé CSRF —
  403 sans jeton, 401 après logout). **Checklist sécurité re-vérifiée** (`docs/securite-checklist.md`),
  5 items à risque sondés et CONFIRMÉS : (1) **IDOR** — `CartographyRepository` scope
  `AND user_id = ?` sur toute lecture/écriture (404, pas la ressource) ; (2) **CSRF** —
  middleware global `$app->add(new CsrfMiddleware())` (auth.php), double-submit `hash_equals`,
  exemptions exactes (migrate/login/register/llm), les routes admin SESSION en héritent
  (403 empirique) ; (3) **CSP-sandbox** — le vrai bloqueur était le **hash du `<script>` inline
  du srcdoc** (pas `frame-src`) ; garde anti-dérive `csp-hash.test.js` (recalcul depuis
  `buildSrcdoc()`) + e2e `sandbox-isolation` jouant la **CSP de prod réelle** lue dans
  `.htaccess` (bénin→result ET hostile contenu) — les deux verts ; (4) **secrets historique** —
  `git log --all` propre, seul `.env.deploy.example` versionné, toute occurrence `sk-ant-*`
  est un EXEMPLE/fixture, `.env.deploy` gitignoré ; (5) **purge RGPD complète** — `purge()` =
  `DELETE FROM users` s'appuyant sur les cascades FK (pas de liste de tables en dur qui
  dériverait) ; **`golden_grants` (ajoutée en A après le code de suppression) couverte** —
  preuve empirique : grant présent → `DELETE` user → grant cascade-supprimé, paquet conservé.
  Cohérence multi-agents de `system.php` vérifiée : `/api/status` n'existe pas (santé =
  `/api/health`) ; `/admin/maintenance` inline == `scripts/maintenance.php Maintenance::run()`
  (mêmes 3 DELETE, testés) ; **aucune collision de route** admin session (`/admin/users`,
  `/admin/golden`, `/admin/settings/*`) vs outillage jeton (`/admin/grant-role`,
  `/admin/default-package`, `/admin/maintenance`). `SecurityHeaders` câblé en dernier
  (le plus externe → décore 401/403/404). Chantier A : API admin session
  (`RequireRole::any('admin')` + CSRF), Golden = `is_private=1` + `golden_grants` (invisible
  aux 5 chemins de lecture de `PromptPackageRepository`). Chantier B : `content/legal/`,
  `docs/rgpd-registre.md` (10 traitements), `scripts/rgpd-audit.php`. Chantier C : CSP front
  corrigée (`script-src` + hash srcdoc + `blob:` + `worker-src blob:`), `SecurityHeaders`,
  audits deps (composer 0 advisory, `npm audit --omit=dev` 0).

- 2026-07-12 — **M8 terminé (P11) : établissements B2B et cartographie de masse, EN PRODUCTION.**
  Déployé (migration 009 en prod, worker-tick opérationnel). Audit : 1 SSRF medium corrigé
  (réassertion du fournisseur après réservation du job). Cron OVH worker à configurer en M9
  (POST /api/admin/worker-tick ou php scripts/worker.php).
  API (chantier A) : cohortes + codes d'invitation, consentement explicite à deux étages
  (rejoindre `{"consentement": true}` 422 sinon, dépôt de portfolio = opt-in serveur),
  config LLM/budget (clé endpoint sodium, jeton worker sha256), runs de masse (versions
  figées), file `mass_jobs` (checkpoint PAR PÔLE, bail 5 min, GET_LOCK, écritures
  conditionnelles), tick borné < 50 s (`php scripts/worker.php` + POST /api/admin/worker-tick),
  coupe-circuit budget AVANT chaque appel, purge RGPD par FK. Front (chantier B) :
  #/etablissement (cohortes, config, lancement en 2 temps avec estimation, avancement
  poll 5 s, vue membre = MERGE CÔTÉ CLIENT par le moteur) ; #/espace/cohortes (consentement,
  dépôt, quitter). Runner Node (chantier C) : même file via /api/worker/*, zéro dépendance.
  **Intégration : DoD P11 rejouée HORS PHPUnit** (scripts/dev/dod-p11.sh, preuves) :
  20 apprenants × 3 journées → run de 60 jobs par ticks CLI mock (5 appels/tick),
  interruption à 24/60 (39 ticks/195 appels), reprise 58 ticks/285 appels → 60 done,
  **480 appels exactement (0 double-appel)**, coût cohérent (spent_usd = Σ jobs = tableau
  = 12.808770 $), 120/120 documents valides (ajv moteur) ; plafond abaissé en cours de
  2e run → budget_exceeded propre, réactivation par hausse ; runner Node --once (mock
  injecté) draine 60 jobs via l'API. **Frictions d'intégration corrigées** : contrat
  /api/worker/jobs (référentiel COMPLET partagé au niveau réponse + referentielVersion
  + provider, le runner tel que livré ne pouvait PAS fonctionner contre l'API) ;
  page cohorte établissement (crash React : avancement objet rendu tel quel ; membres
  sans détail de dépôt → run inlançable ; statuts pending/error ≠ queued/failed ;
  run 'running' ≠ 'active') ; GET /api/cohortes manquant (liste apprenant) ; enveloppe
  {membre, documents} ; tarifs famille claude-* moteur alignés sur Pricing.php ;
  WORKER_TICK_MAX_CALLS (tick CLI bornable). Vérifié en navigateur : avancement en
  direct pendant une boucle de ticks (28/60 → 60/60 done), merge client (10/61
  compétences, vues jour), parcours apprenant 21e (inscription → consentement coché →
  dépôt « Journal de Maya »). Suites : PHP 274/274 (2213 assertions), web 422/422,
  engine 214/214, runner 25/25, e2e 4/4, build OK.

- 2026-07-12 — **M7 terminé (P9+P10) : espaces cartographe et promptologue EN PRODUCTION.**
  P9 : invitations à usage unique, file de relecture, annotations par compétence, révisions
  validées au schéma avec historique, GARANTIE humaine (révision figée servie par le lien de
  partage public, retirée automatiquement à toute nouvelle révision — §8), comparaison côte à
  côte, rapport de consistance multi-run lisible, purge RGPD asymétrique (révisions anonymisées).
  P10 : éditeur brouillon→publication immuable (semver strict, diff structurel ligne à ligne),
  proposition/validation de version par défaut, régénération rétrospective, banc d'essai
  (multi-run, A/B avec rapport téléchargeable), SANDBOX iframe origine opaque + worker blob +
  pont postMessage (quota 16 appels, timeout) avec **isolation réseau DÉMONTRÉE en vrai Chromium**
  (spec e2e dédiée), docs/securite-prompts.md, outillage admin grant-role (audité).
  E2E 4/4, PHP 234/234, web 395/395. Rôles en prod : à attribuer via POST /api/admin/grant-role
  (X-Migrate-Token) en attendant l'UI admin P12.

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
  40 req/h/IP, PoW 16 bits, budget **8 $/jour**.
  **DÉCISION DE COÛT à trancher par l'utilisateur** (écart au cahier §3.1/§5 qui visait Haiku
  bon marché) : un run démo = 8 appels Sonnet ≈ 1 $+, donc le plafond 8 $/jour coupe après
  ~6-8 visiteurs/jour. Testé le 2026-07-12 : **Haiku + tool_use forcé ne suffit PAS** (JSON
  valide mais structure incomplète — `competences` absent ; Haiku ne suit pas la structure
  adverse profonde). Options : (a) garder Sonnet + plafond bas (actuel) ; (b) monter le budget ;
  (c) **piste non testée prometteuse** : mettre le SCHÉMA COMPLET du pôle dans `input_schema`
  du tool (décodage contraint) pour forcer la structure → pourrait rendre Haiku (bien moins cher)
  viable. Backlog M5 : (c) ci-dessus ; panneau pôle sans rapport (dégradé) affiche l'état vide
  — afficher audit + passages à la place.

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

## Actions manuelles restantes (chef d'orchestre — clôture v1.0.0)

1. **Déploiement final** : `cd web && npm run build` (fait, à refaire si diff), puis
   `node scripts/deploy/deploy.mjs static` (www/) ; `scripts/deploy/stage-api.sh` puis
   `node scripts/deploy/deploy.mjs api` (releases + `current.txt` + `POST /api/admin/migrate`
   + imports + smoke `/api/health`). Credentials dans `.env.deploy` (gitignoré).
2. **Tag `v1.0.0`** : `git tag -a v1.0.0 -m "humanome.xyz v1.0.0"` (+ `git push --tags` après
   publication GitHub). La version affichée par `/api/health` est estampillée au déploiement
   depuis `git describe` (via `stage-api.sh` → fichier `VERSION`) : **tagger AVANT de stager l'API**.
3. **Cron OVH** (ADR-005/008, aucun script shell déployé — endpoints à jeton) :
   - worker de masse — `POST /api/admin/worker-tick` (X-Migrate-Token), ticks courts, ~toutes
     les 1–5 min tant qu'il y a des jobs (voir `docs/plan-masse.md`) ;
   - maintenance RGPD — `POST /api/admin/maintenance` (X-Migrate-Token), **quotidien**
     (purge liens de partage > 30 j, reset compteurs démo, PoW expirés).
4. **Rôles admin/privilégiés à créer** : aucun compte n'est admin par défaut (le 1er inscrit
   est `apprenant`, `admin` n'est pas un super-rôle implicite). Attribuer via
   `POST /api/admin/grant-role {email, role}` (X-Migrate-Token) — au moins un `admin`, puis
   les `cartographe`/`promptologue`/`epistemiarque` selon les personnes. L'UI admin
   (#/admin) prend le relais une fois un premier admin créé.
5. **Publication GitHub** (reportée depuis M1) : créer le dépôt, `git push` (+ tags).
   Sauvegarde intermédiaire : `git bundle create ../humanome-backup.bundle --all`.
6. **Smokes post-déploiement** (`docs/securite-checklist.md` §« après déploiement ») :
   `curl -sI https://humanome.xyz/api/health` → en-têtes API (CSP `default-src 'none'`,
   `X-Frame-Options: DENY`, HSTS, `Referrer-Policy`, `Permissions-Policy`) ; ouvrir
   #/promptologue et lancer le banc d'essai sur un paquet publié → **zéro violation CSP**
   en console (preuve que la correction sandbox tient en prod réelle) ; ramener le budget
   démo quotidien à 5–10 $ selon usage (compteurs de test consommés en M5).

## Backlog post-v1 (hors périmètre v1.0.0)

- **Marketplace employeur payante** (mise en relation apprenants↔employeurs monétisée).
- **Portfolio multimédia** (au-delà du texte : images, audio, vidéo).
- **Open-data recherche** (jeux de données anonymisés pour la recherche).
- **Promptagogue** (rôle/atelier pédagogique autour des prompts).
- **Régénération de masse** (rejeu rétrospectif d'une nouvelle version de prompt-package
  sur une cohorte entière).
- **GPU local** (inférence LLM auto-hébergée, hors API tierce).
- **OAuth Google Docs** (import portfolio authentifié, au-delà du `gdoc-text` public actuel).
- **i18n** (internationalisation de l'UI, aujourd'hui français uniquement).

## Dettes techniques / décisions en attente

- Golden Prompt : non fourni, hors git par design (`assets-existants/golden-prompt/` gitignoré).
- Pipeline Python amont absent : moteur rétro-conçu en M4 avec oracles
  (`intermediate/carto_merge.json`, `intermediate/prompts/`).
- Bundle front monolithique (~1,58 Mo / 331 Ko gzip) : avertissement de taille Vite
  informatif, non bloquant — code-splitting à envisager (backlog outillage).
- `npm audit` complet : 5 findings **outillage de dev uniquement** (vite/vitest/esbuild),
  non déployés, non exploitables en prod (cf. checklist A06) — bump majeur reporté au backlog.

## Jalons

| Jalon | Contenu | État |
|---|---|---|
| M1 | P0 fondations + P1 schémas/convertisseurs | ✅ terminé |
| M2 | P2 visualisation unifiée + 1er déploiement | ✅ en production |
| M3 | P3 BDD/comptes + P4 référentiel | ✅ en production |
| M4 | P5 moteur (parité oracle) | ✅ terminé |
| M5 | P6 démo LLM + P7 portfolio | ✅ en production |
| M6 | P8 espace apprenant | ✅ en production |
| M7 | P9 cartographe + P10 promptologue | ✅ en production |
| M8 | P11 masse B2B | ✅ en production |
| M9 | P12 durcissement + P13 prod v1.0.0 | ✅ intégré — déploiement + tag v1.0.0 par le chef d'orchestre |
