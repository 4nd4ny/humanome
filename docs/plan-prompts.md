# humanome.xyz — Plan de construction par prompts (Claude Code)

**Source :** cahier des charges v0.1 (Harmonia Éducation)
**Objectif :** environnement opérationnel complet v1, du dépôt vide au déploiement OVH, en 14 sessions Claude Code (P0 → P13).

---

## Mode d'emploi

1. **Un prompt = une session.** Lance `/clear` entre deux prompts. Si une étape déborde sur plusieurs sessions, utilise le prompt de reprise (annexe A).
2. **Ordre :** P0 → P13. P2 (fusion visualisation) peut se mener en parallèle de P3–P4 dès que P1 est fait.
3. **La source de vérité est dans le dépôt.** P0 commit le cahier des charges dans `docs/` ; chaque prompt renvoie Claude Code aux sections concernées plutôt que de les paraphraser. Ne modifie pas les prompts pour y recopier la spec.
4. **Mode plan d'abord** pour P2, P5 et P11 (les prompts l'exigent) : demande le plan, valide-le, puis laisse exécuter. Pour les autres, laisse Claude Code proposer sa décomposition en début de session.
5. **Fin de session systématique :** tests verts, commit, `STATUS.md` mis à jour. C'est écrit dans chaque prompt ; si Claude Code l'oublie, rappelle-le.
6. **Relis les diffs.** Claude Code est bon mais pas infaillible ; ton temps de relecture est le vrai garde-fou (tu connais l'argument — c'est le même que pour le cartographe).

**Estimation indicative :** P0, P1, P3, P4, P6, P7 ≈ 1 session chacun. P2, P5, P8 ≈ 2–3 sessions (fusion, portage, e2e). P9–P13 ≈ 1–2 sessions chacun.

---

## Prérequis manuels (≈ 20 min, avant P0)

Créer un dossier vide `humanome/`, y exécuter `git init`, puis y déposer :

| Emplacement | Contenu |
|---|---|
| `docs/cahier-des-charges.md` | Le cahier des charges v0.1 (ce document source) |
| `assets-existants/visualisation-chrono/` | L'artifact JSX de navigation chronologique (« merge ») |
| `assets-existants/carto-jour/` | La page HTML/JavaScript de cartographie d'une journée |
| `assets-existants/prompts-python/` | Toutes les versions des prompts de cartographie (Python) |
| `assets-existants/referentiel/` | RESPIRE v7 : version condensée Aurora + version complète si disponible |
| `assets-existants/exemples-json/` | Cartographies JSON réelles (journalières et mergées si possible) |
| `assets-existants/golden-prompt/` | ⚠️ **Optionnel et hors git** — P0 l'ajoute au `.gitignore` ; vérifie avant tout push |

Puis : lancer `claude` à la racine et dérouler P0.

Vérifier aussi côté OVH (et noter les réponses dans `docs/hebergement.md`, même sommairement) : version PHP disponible (≥ 8.2 ?), version MySQL, accès cron, accès SSH/SFTP, domaine humanome.xyz pointé ou non.

---

## Décisions d'architecture pré-actées

Tranchées pour éviter l'errance ; chacune devient un ADR en P0 et reste réversible par ADR.

- **AD-1 — Exécution client-first.** Le moteur de cartographie (portage JS des prompts Python) s'exécute dans le navigateur : découpage journalier, checkpoints IndexedDB, reprise après interruption. Raisons : (a) le mutualisé OVH interdit les processus longs — un run de plusieurs heures (§8) ne peut pas être une requête PHP ; (b) alignement exact avec le RGPD-by-design (§6) — le portfolio ne quitte jamais le navigateur par défaut. Le serveur ne fait que : proxy LLM (démo, clés plateforme) et persistance opt-in.
- **AD-2 — Stack.** PHP 8.2 + Slim 4 + PDO + MySQL 8 (utf8mb4) ; front Vite + React 18 (le JSX existant s'y intègre nativement) ; tests PHPUnit, Vitest, Playwright. Pas de framework lourd : portabilité « clone déployable » (§5) et mutualisé obligent.
- **AD-3 — Build front en local/CI.** Aucun Node sur OVH : `npm run build` produit des artefacts statiques déployés tels quels.
- **AD-4 — Clés API personnelles.** localStorage par défaut ; stockage serveur uniquement opt-in, chiffré libsodium, clé maîtresse hors webroot.
- **AD-5 — Masse (établissements).** File de jobs MySQL + worker `cron` OVH à ticks courts et reprise incrémentale ; alternativement, runner CLI Node fourni, consommant la même file via l'API (pour les établissements disposant d'une machine ou d'un LLM local).
- **AD-6 — Format pivot.** L'archive d'export (portfolio + prompt-package + version du référentiel + cartographies + métadonnées) est LE format de portabilité : export/suppression RGPD, import de compte, et « clone déployable » utilisent le même schéma.

---

## Questions ouvertes (à trancher, au plus tard avant le prompt indiqué)

- **Q1 (avant P13)** — Licence du code publié sur GitHub : MIT, AGPL-3.0… ? (Les contenus pédagogiques peuvent rester CC-BY-SA comme le reste de l'écosystème.) L'AGPL protège le modèle « instance clonable » contre la privatisation ; le MIT maximise l'adoption.
- **Q2 (avant P7)** — Google Docs en v1 : documents publics/partagés en lecture uniquement (export texte sans OAuth) ? Recommandé : oui, OAuth reporté.
- **Q3 (avant P8)** — Liens de partage employeur : expiration par défaut (90 jours ?) et politique de révocation.
- **Q4 (avant P0)** — Versions PHP/MySQL effectives du mutualisé OVH (conditionne AD-2 ; à noter dans `docs/hebergement.md`).

---

## Les prompts

### P0 — Fondations du dépôt

```
Tu démarres le projet humanome.xyz. Lis d'abord docs/cahier-des-charges.md
en entier, puis explore assets-existants/ sans rien y modifier.

Objectif de cette session : poser les fondations du dépôt.

1. Crée CLAUDE.md à la racine : résumé du projet en 10 lignes ; stack
   (PHP 8.2 + Slim 4 + PDO + MySQL 8 utf8mb4 ; front Vite + React 18 ;
   tests PHPUnit / Vitest / Playwright) ; contraintes d'hébergement OVH
   mutualisé (pas de Node serveur, pas de processus longs, cron
   disponible, build front en local) ; principes RGPD non négociables
   (cahier §6) ; conventions (doc et UI en français, code et commits en
   anglais, un commit par lot cohérent, tests avant commit, STATUS.md
   mis à jour en fin de session).
2. Formalise dans docs/decisions/ six ADR (ADR-001 à 006) :
   AD-1 exécution du moteur de cartographie côté client (navigateur,
   checkpoints IndexedDB, reprise) — le serveur n'est que proxy LLM et
   persistance opt-in ; AD-2 stack ci-dessus ; AD-3 build front
   local/CI, artefacts statiques déployés ; AD-4 clés API personnelles
   en localStorage par défaut, stockage serveur opt-in chiffré
   libsodium ; AD-5 traitements de masse via file de jobs MySQL +
   worker cron à ticks courts (+ runner CLI Node optionnel) ;
   AD-6 l'archive d'export est le format pivot (RGPD + clone
   déployable). Justifie chaque ADR en citant les sections du cahier.
3. Crée STATUS.md : journal de bord (fait / en cours / prochaine
   étape / dettes techniques).
4. Structure : api/ (PHP), web/ (Vite+React), engine/ (moteur JS de
   cartographie, package partagé sans dépendance DOM), schemas/,
   content/ (formation), scripts/, docs/, assets-existants/ (lecture
   seule).
5. Outillage : composer.json (Slim 4, phpdotenv, PHPUnit, un
   validateur JSON Schema PHP), web/ initialisé avec Vite + React +
   Vitest, .editorconfig, .gitignore (node_modules, vendor, .env*,
   assets-existants/golden-prompt/, dist/).
6. docker-compose.yml de dev : PHP 8.2-apache + MySQL 8 (utf8mb4),
   au plus près du mutualisé OVH ; front servi par Vite en dev.
7. Fumée : GET /api/health -> {"status":"ok","version":...} ; page
   d'accueil Vite qui appelle et affiche /api/health.
8. Rédige docs/inventaire-assets.md : contenu de chaque dossier
   d'assets-existants/, formats JSON observés dans exemples-json/,
   structure des prompts Python (étapes, variables), composants
   notables du JSX et de la page HTML de cartographie-jour.

Definition of Done : docker compose up fonctionne ; /api/health
répond ; npm run dev affiche la page ; composer test et npm test
passent (tests d'exemple) ; commit "chore: bootstrap humanome".

Interdits : ne modifie rien dans assets-existants/ ; aucune dépendance
non justifiée par un ADR ; ne commence aucun module métier.
```

### P1 — Contrats de données (JSON Schemas)

```
Lis STATUS.md. Contexte : les schémas de données sont le contrat entre
tous les modules (cahier §4.3, §4.5, §6, AD-6). Ils se déduisent des
exemples réels, pas l'inverse.

Objectif : formaliser les contrats en JSON Schema (draft 2020-12) dans
schemas/, à partir d'assets-existants/exemples-json/ et
assets-existants/referentiel/.

1. schemas/cartographie-jour.schema.json : cartographie d'une journée
   (événements de compétence : identifiant de compétence du
   référentiel, horodatage, extraits/justifications, degré de
   confiance…). Pars des exemples réels ; documente chaque champ.
2. schemas/cartographie-merge.schema.json : agrégat chronologique
   multi-jours (séries temporelles par compétence, cumul,
   « bourgeonnement »), aligné sur ce que consomme le JSX existant.
3. schemas/referentiel.schema.json : 7 pôles / 61 compétences,
   versionné (semver + hash de contenu).
4. schemas/prompt-package.schema.json : un paquet prompt = texte(s) de
   prompt + code JS d'orchestration + métadonnées (version, auteur,
   modèle cible, version de référentiel compatible, changelog).
5. schemas/archive-export.schema.json : archive pivot d'un compte ou
   d'un run — portfolio + prompt-package utilisé + version du
   référentiel + cartographies + métadonnées (cahier §6.1, §6.3, §5
   « clone déployable »).
6. Validation double runtime : engine/src/validation.js (ajv) et
   api/src/Validation.php (même schémas).
7. Fixtures valides dans schemas/fixtures/ : dont un portfolio fictif
   de 3 journées et ses cartographies (jour + merge). Si les exemples
   réels divergent des schémas, documente chaque écart dans
   docs/contrats.md avec la migration proposée — ne « corrige » pas
   les exemples réels.

DoD : ajv et le validateur PHP valident toutes les fixtures et les
exemples réels (ou écarts documentés) ; tests automatisés des deux
runtimes ; docs/contrats.md rédigé ; commit.
```

### P2 — Fusion visualisation (bloc prioritaire, cahier §9)

```
Lis STATUS.md et docs/inventaire-assets.md. Contexte : cahier §4.4 et
§9 — fusionner l'artifact JSX (vue chronologique/merge) et la page
HTML/JS (cartographie d'une journée) en un logiciel de visualisation
unifié. C'est la pièce maîtresse de la démo publique.

Objectif : une application de visualisation unifiée dans web/,
autonome (aucun serveur requis), consommant les schémas P1.

1. D'abord un plan, pas de code : analyse les deux implémentations
   existantes et rédige docs/plan-fusion-visu.md — composants
   réutilisables tels quels, refactors nécessaires, mapping des
   formats existants vers les schémas P1, risques. Attends ma
   validation avant d'implémenter.
2. Implémente ensuite : vue Journée (reprise de la page HTML/JS,
   portée en React) ; vue Chronologique (reprise du JSX) ; navigation
   entre les deux (clic sur un jour dans la chronologie -> vue
   Journée) ; chargement d'un JSON local (drag & drop + bouton, aucune
   donnée envoyée nulle part) ; jeu de démonstration intégré
   (fixtures P1).
3. Responsive mobile (utilisable à une main, 360 px — cahier §1 :
   l'utilisateur cible peut n'avoir qu'un smartphone) et feuille de
   style d'impression propre (une cartographie = un document
   imprimable, cahier §5).
4. Qualité : composants purs, état minimal, tests Vitest sur les
   transformations de données ; aucune nouvelle dépendance graphique
   sans ADR.

DoD : npm run build produit un bundle statique ouvrable tel quel ;
les deux vues fonctionnent sur les fixtures ET sur au moins un exemple
réel ; viewport mobile et impression vérifiés ; commit.

Interdits : ne touche pas à api/ ; ne renomme aucun champ des schémas
(toute friction de format -> docs/contrats.md, pas de contournement).
```

### P3 — Base de données, comptes, rôles

```
Lis STATUS.md. Contexte : cahier §4.5, §6, §2. RGPD par conception :
aucun contenu de portfolio en base par défaut — c'est structurel, pas
une option.

Objectif : schéma MySQL, migrations, authentification, autorisation.

1. Migrations SQL versionnées (scripts/migrations/, numérotées,
   exécutées par scripts/migrate.php, idempotentes) : users ; roles
   (apprenant, cartographe, promptologue, epistemiarque, employeur,
   etablissement, admin — le visiteur est l'absence de session) ;
   user_roles (n-n) ; referentiel_versions ; prompt_packages et
   prompt_versions ; cartographies (métadonnées + JSON, opt-in
   uniquement, avec prompt_version_id et referentiel_version_id —
   cahier §4.3 : chaque cartographie référence ses versions) ;
   share_links (hash du mot de passe, expiration, révocation) ;
   training_progress ; user_api_keys (chiffrées, opt-in, AD-4) ;
   audit_events (minimal RGPD : création/export/suppression de compte,
   partages).
2. Auth : inscription, connexion, déconnexion ; sessions PHP
   sécurisées (cookies HttpOnly, SameSite, régénération d'ID) ;
   password_hash/password_verify ; protection CSRF ; limitation de
   tentatives.
3. Autorisation : middleware Slim par rôle ; matrice rôle -> routes
   dans docs/autorisations.md, dérivée du cahier §2 et §3.
4. RGPD : suppression de compte = purge réelle + événement d'audit ;
   pose les interfaces d'export/import branchées sur le schéma
   archive-export (implémentation complète en P8).

DoD : migrations passent sur base vierge ; tests PHPUnit (auth, rôles,
CSRF, rate-limit) verts ; docs/autorisations.md ; commit.

Interdits : aucune colonne pour le texte d'un portfolio ; pas d'ORM.
```

### P4 — Module Référentiel

```
Lis STATUS.md. Contexte : cahier §4.1, §3.5. Public en lecture,
modifiable par les seuls épistémiarques, versionné — chaque
cartographie pointe la version utilisée, donc aucune version publiée
n'est jamais modifiée en place.

Objectif : module Référentiel complet.

1. Import : scripts/import-referentiel.php charge
   assets-existants/referentiel/ (RESPIRE v7) comme version initiale,
   validée par schemas/referentiel.schema.json.
2. API : GET /api/referentiel (dernière version publiée),
   /api/referentiel/versions, /api/referentiel/versions/{v}, et diff
   entre deux versions.
3. Édition épistémiarque : cycle brouillon -> relecture -> publication
   (nouvelle version immuable, semver + hash + note de version).
4. Front : page publique de consultation (arbre 7 pôles -> 61
   compétences, recherche, permalien par compétence) ; bandeau vers
   l'espace participatif Decidim
   (https://participer.harmonia.education, cahier §3.5 : Decidim
   nourrit et critique le référentiel, il ne le remplace pas) ;
   interface d'édition réservée au rôle épistémiarque.

DoD : v7 importée et consultable publiquement ; création d'une version
de test en brouillon puis publication ; diff lisible entre v7 et la
version de test ; tests ; commit.
```

### P5 — Moteur de cartographie (portage Python → JS)

```
Lis STATUS.md, docs/contrats.md et assets-existants/prompts-python/.
Contexte : cahier §4.3 (cœur du produit), §5, §8 ; ADR-001 (exécution
côté client) et ADR-005.

Objectif : porter le système de prompts Python en un moteur JavaScript
réutilisable (engine/), exécutable dans le navigateur.

1. D'abord un plan, pas de code : docs/plan-portage-moteur.md —
   cartographie du pipeline Python (étapes, prompts, post-traitements,
   heuristiques), équivalents JS, points de non-parité assumés.
   Attends ma validation.
2. Implémente engine/ (package ESM, zéro dépendance DOM) :
   - providers/ : abstraction LLM unique — Anthropic, OpenAI, Google,
     xAI, plus OpenRouter et Ollama (cahier §5) — avec deux
     transports : « direct navigateur » (clé utilisateur) et « proxy »
     (POST /api/llm, implémenté en P6) ;
   - pipeline/ : découpage journalier du portfolio -> cartographie par
     jour (validée cartographie-jour) -> merge (validé
     cartographie-merge) qui révèle les compétences ténues
     transversales passées inaperçues jour par jour (cahier §4.3) ;
   - runs/ : journal de run (horodatages, modèle, tokens, coût
     estimé) ; checkpoints par journée via un adaptateur de stockage
     injectable (IndexedDB côté web, mémoire côté tests) ; reprise
     après interruption — un run de plusieurs heures DOIT survivre à
     un rechargement d'onglet ;
   - estimate() : estimation tokens / coût / durée avant lancement.
3. Consistance : utilitaire multi-run (N exécutions d'un même prompt
   sur un même portfolio) produisant des métriques de stabilité —
   compétences communes/divergentes entre runs, distance structurelle
   entre JSON (base des cas cartographe §3.3 et promptologue §3.4).
4. Tests : provider mock déterministe ; run complet sur la fixture
   3 journées ; un test d'intégration avec vraie clé, optionnel,
   derrière une variable d'environnement.

DoD : npm test vert dans engine/ ; run bout-en-bout mock, avec
interruption/reprise simulée ; parité avec le Python documentée
(écarts listés dans docs/plan-portage-moteur.md) ; commit.

Interdits : aucune clé en dur ; aucune télémétrie ; le moteur ne lit
ni n'écrit rien côté serveur de lui-même.
```

### P6 — Proxy LLM serveur + démo publique

```
Lis STATUS.md. Contexte : cahier §3.1 (démo visiteur, LLM peu coûteux
type Haiku, coûts masqués, garde-fous anti-abus), §5 ; ADR-001.

Objectif : proxy LLM côté serveur et page de démonstration publique.

1. POST /api/llm : proxy vers le fournisseur plateforme configuré
   (défaut : Claude Haiku), clé lue en configuration serveur, jamais
   exposée ; streaming si disponible.
2. Garde-fous : quota par IP (n requêtes/heure) ; quota global
   journalier en tokens ET en budget avec coupe-circuit ; plafond de
   tokens par requête ; taille maximale d'entrée ; délai progressif en
   cas d'abus ; défi léger anti-bot (honeypot + preuve de travail
   côté client, pas de service tiers) ; journalisation minimale
   (compteurs seulement, jamais le contenu — cahier §6).
3. Page publique « Essayer » : coller un texte libre ->
   mini-cartographie générée en direct via engine/ (transport proxy)
   -> visualisation P2 ; messages clairs quand un quota est atteint ;
   aucune persistance d'aucune sorte.
4. Configuration administrateur : config/demo.php (modèle, plafonds,
   budget/jour), documentée (cahier §3.8 : un fichier de config suffit
   en v1).

DoD : démo bout-en-bout sans compte en local ; tests des quotas
(dépassements simulés) ; docs/securite-demo.md rédigé du point de vue
« que ferait un abuseur » ; commit.
```

### P7 — Module Portfolio

```
Lis STATUS.md. Contexte : cahier §4.2 — v1 texte uniquement,
non-stockage par défaut, éditeur réutilisé (Sqilium).

Objectif : module Portfolio, entièrement côté client.

1. Sources : copier-coller direct ; import Google Docs par URL (v1 :
   documents publics ou partagés en lecture, via l'export texte —
   gère proprement les erreurs d'accès et documente la limite dans
   l'UI) ; import de fichier .txt/.md.
2. Segmentation en journées : détection heuristique (dates, entêtes,
   séparateurs) + ajustement manuel dans l'interface (fusionner /
   scinder des journées). Le résultat alimente le pipeline P5.
3. Éditeur : intègre Sqilium (https://github.com/4nd4ny/Sqilium)
   comme éditeur de texte v1 ; si blocage technique réel, ADR de
   repli sur une textarea améliorée — mais essaie sérieusement
   d'abord.
4. Persistance : IndexedDB local uniquement ; bandeau explicite
   « vos textes ne quittent pas ce navigateur » ; le stockage serveur
   opt-in reste hors périmètre jusqu'à P8.

DoD : import fonctionnel des trois sources ; segmentation vérifiée
sur la fixture 3 journées et sur un portfolio réel ; tests Vitest de
la segmentation ; commit.
```

### P8 — Espace apprenant (parcours cœur du MVP)

```
Lis STATUS.md. Contexte : cahier §3.2, §6, §10.3 — c'est le parcours
central du MVP : compte, portfolio, cartographie individuelle,
confidentialité, partage, export.

Objectif : parcours apprenant complet, bout en bout.

1. Tableau de bord : mes portfolios (locaux), mes cartographies (avec
   indication locale/serveur), ma progression de formation.
2. Formation apprenant « mode expert » (cahier §4.6) : contenu
   Markdown versionné dans content/formation/apprenant/ (comment bien
   rédiger son portfolio pour une bonne cartographie), rendu dans
   l'app, progression par chapitre rattachée au compte. Rédige un
   squelette de contenu (plan + introductions), pas le contenu final.
3. Lancement d'une cartographie : choix de la version de prompt
   (importe d'abord les versions existantes des assets comme versions
   publiées via script, l'éditeur complet arrive en P10) ; choix du
   fournisseur — clé personnelle (localStorage par défaut ; opt-in
   stockage serveur chiffré, AD-4) ou proxy plateforme si autorisé ;
   estimation de coût affichée avant lancement (P5) ; exécution avec
   reprise.
4. Confidentialité par cartographie (cahier §3.2) : privée / partagée
   avec mon cartographe / publique-partageable ; toute copie serveur
   est un opt-in explicite distinct (par défaut : local seulement).
5. Partage employeur : lien public + mot de passe (hash serveur,
   expiration configurable, révocation) ouvrant la visualisation P2
   en lecture seule, avec mention « garantie par » si validée (P9)
   — cahier §3.6.
6. Export / import / suppression : archive complète conforme à
   schemas/archive-export.schema.json (portfolio + prompts utilisés +
   référentiel + cartographies) ; import restaurant un compte ;
   suppression en un clic avec purge réelle (cahier §6.3).

DoD : scénario Playwright bout-en-bout — création de compte ->
portfolio -> run (mock) -> visualisation -> partage lien+mdp
(vérifié en navigation privée) -> export -> import -> suppression ;
tests verts ; commit.
```

### P9 — Espace cartographe

```
Lis STATUS.md. Contexte : cahier §3.3, §8 — le cartographe est le
garde-fou humain obligatoire ; jamais de cartographie 100 %
automatisée présentée comme validée.

Objectif : espace cartographe complet.

1. Rattachement apprenant <-> cartographe (invitation / acceptation) ;
   file des cartographies « partagées avec mon cartographe ».
2. Relecture : annotation par compétence (commentaire, signalement
   d'hallucination ou d'oubli) ; proposition de correction du JSON,
   contrôlée par le schéma ; historique des révisions conservé.
3. Garantie : action « valider et garantir » — signature horodatée,
   version figée ; le lien de partage employeur affiche l'état
   garanti et par qui.
4. Outils : comparaison côte à côte de deux cartographies d'un même
   portfolio (versions de prompts différentes, cahier §3.3) ; rapport
   de consistance multi-run (P5) présenté lisiblement.
5. Formation cartographe (cahier §4.6) : rôle, méthode, pourquoi
   l'humain reste nécessaire, micro-classes RESPIRE (5-6 élèves en
   cartographie mutuelle) — squelette dans
   content/formation/cartographe/.

DoD : workflow complet en test e2e sur fixtures — annoter ->
corriger -> garantir -> constat côté lien partagé ; commit.
```

### P10 — Espace promptologue

```
Lis STATUS.md. Contexte : cahier §3.4, §4.3. Attention sécurité : un
prompt-package contient du code JS — c'est du code arbitraire exécuté
chez les utilisateurs.

Objectif : atelier du promptologue.

1. Importe les versions existantes (prompts Python d'origine + leur
   portage engine/) comme prompt-packages v1..n en base, via script.
2. Éditeur en ligne d'un prompt-package : texte(s) + code JS
   d'orchestration ; brouillon -> publication (version immuable,
   semver, changelog) ; diff entre versions.
3. Sandbox : le code d'un package s'exécute exclusivement dans un Web
   Worker sans accès DOM, avec une interface d'entrées/sorties
   contrôlée (texte du jour en entrée, JSON validé en sortie, appels
   LLM via l'abstraction providers uniquement). Seules les versions
   publiées sont exécutables par autrui ; un brouillon ne tourne que
   chez son auteur. Documente le modèle de menace dans
   docs/securite-prompts.md.
4. Banc d'essai : exécuter une version sur un portfolio de test ;
   multi-run de consistance avec métriques (P5) ; comparaison A/B
   entre deux versions ; comparaison face au Golden Prompt si
   l'administrateur l'a autorisée (cahier §3.4, §7), sinon face aux
   versions publiques les plus récentes.
5. Version par défaut proposée aux apprenants : proposition
   promptologue + validation admin.
6. Régénération rétrospective (cahier §3.4, §8) : relancer une
   cartographie existante avec un référentiel plus récent et
   visualiser les compétences nouvellement détectées (v1 : à
   l'unité ; la masse reste en backlog).
7. Formation promptologue (cahier §4.6) : prompt engineering, genèse
   du prompt de base — squelette dans
   content/formation/promptologue/.

DoD : créer une v2 depuis l'éditeur ; banc d'essai A/B v1 vs v2 sur
fixture avec rapport généré ; test vérifiant que le Worker n'a ni DOM
ni réseau hors abstraction providers ; commit.
```

### P11 — Établissements (B2B) et cartographie de masse

```
Lis STATUS.md. Contexte : cahier §3.7, §4.9, §7 ; ADR-005. Contrainte
forte : pas de processus longs sur le mutualisé — la masse passe par
une file de jobs et des ticks cron courts.

Objectif : accès établissement et exécution de masse.

1. D'abord un plan court : docs/plan-masse.md — modèle de la file
   (table jobs : statut, priorité, checkpoints par journée, erreurs),
   dimensionnement d'un tick cron (que traiter en < 50 s ?), points de
   reprise. Validation avant code.
2. Comptes établissement : cohortes et rattachement d'apprenants
   (codes d'invitation) ; accès en lecture aux cartographies de ses
   propres élèves (cahier §3.7), avec consentement visible.
3. Fournisseur LLM au choix : clé « qualité » gérée par Harmonia
   (facturée à l'usage, cahier §7) OU point d'accès propre à
   l'établissement (URL compatible OpenAI + clé — serveur local,
   Ollama…).
4. Budget : plafond configurable par établissement, compteur
   tokens/coût, arrêt automatique au plafond (cahier §3.7).
5. Masse : worker scripts/worker.php exécuté par cron (ticks courts,
   traitement incrémental, reprise sur checkpoint) ; runner CLI Node
   alternatif (scripts/runner-node/) consommant la même file via
   l'API, pour les établissements équipés ; tableau de suivi de
   cohorte (avancement, erreurs, coût cumulé).

DoD : cohorte fixture de 20 portfolios cartographiée en local via le
worker cron simulé, avec interruption/reprise ; arrêt au plafond de
budget testé ; commit.
```

### P12 — Administration, RGPD transverse, durcissement

```
Lis STATUS.md. Contexte : cahier §3.8, §4.10, §6, §7 — le Golden
Prompt reste privé jusqu'à décision contraire de l'administrateur.

Objectif : administration, conformité, sécurité.

1. Administration : configuration serveur versionnable (config/*.php)
   + petite UI admin — gestion du Golden Prompt (import hors git,
   privé par défaut, autorisation d'accès au cas par cas, cahier §7),
   clés plateforme, plafonds démo, version de prompt par défaut,
   attribution des rôles.
2. RGPD transverse : page confidentialité en français clair ; registre
   des traitements docs/rgpd-registre.md ; vérification exhaustive que
   export et suppression couvrent 100 % des données d'un compte
   (croise avec le schéma de base P3) ; minimisation des journaux ;
   application de la politique d'expiration des liens de partage.
3. Sécurité : chiffrement au repos des clés API (libsodium, clé
   maîtresse hors webroot) ; en-têtes (CSP stricte, HSTS,
   X-Content-Type-Options…) ; revue OWASP Top 10 sous forme de
   checklist docs/securite-checklist.md (chaque item : fait ou
   justifié) ; composer audit et npm audit propres ; re-vérification
   de la sandbox Worker de P10.

DoD : checklist sécurité entièrement traitée ; parcours
export-suppression re-testé après durcissement ; UI admin
fonctionnelle ; commit.
```

### P13 — Déploiement OVH, clone déployable, publication

```
Lis STATUS.md et docs/hebergement.md. Contexte : cahier §5 — OVH
mutualisé, code open source sur GitHub, logique de « clone
déployable ».

Objectif : mise en production et publication.

1. Déploiement : scripts/deploy.sh — build front en local, assemblage
   des artefacts, envoi SFTP/rsync vers OVH, .env hors webroot,
   exécution des migrations, invalidation de cache ; procédure de
   rollback documentée.
2. Cron OVH : worker P11 + entretien (purge des liens expirés,
   remise à zéro des quotas démo).
3. Sauvegardes : dump MySQL quotidien + procédure de restauration
   TESTÉE (pas seulement écrite).
4. Clone déployable (cahier §5) : INSTALL.md permettant à un tiers de
   monter sa propre instance — prérequis, configuration, import du
   référentiel et d'archives P1 ; valide le parcours complet sur un
   environnement vierge.
5. Publication GitHub : vérifie l'historique (aucun secret, aucun
   Golden Prompt, aucune donnée réelle — sinon réécriture) ; LICENSE
   selon la décision Q1 ; README public (vision du cahier §1,
   captures, liens Decidim et respire.school).
6. Page /status : santé base, version déployée, quotas démo restants.

DoD : instance de test déployée sur le mutualisé OVH, démo publique
fonctionnelle en ligne ; INSTALL.md validé sur environnement vierge ;
dépôt GitHub publié ; commit + tag v1.0.0 ; STATUS.md conclu par la
liste du backlog restant.
```

---

## Annexe A — Prompt de reprise de session

À utiliser quand une étape déborde sur plusieurs sessions :

```
Lis CLAUDE.md puis STATUS.md. Résume en 5 lignes l'état du projet et
ce qui reste dans l'étape en cours (P__). Propose un plan pour la
terminer — n'écris aucun code avant ma validation.
```

## Annexe B — Backlog post-v1 (cahier §10.6 + reports du plan)

Marketplace employeur payante (bibliothèque de cartographies consenties, matching poste ↔ profil, §4.8) · multimédia dans le portfolio (§4.2) · publication open data recherche (§4.7 — les outils de consistance existent dès P5/P9/P10, seule la publication est reportée) · rôle promptagogue (§2) · régénération rétrospective de masse lors d'un changement de référentiel (§8 — l'unité existe en P10) · infrastructure GPU locale 8×H200 (§5) · OAuth Google Docs (Q2) · i18n · gratuité à l'échelle après capitalisation de la Fondation (§7).

## Annexe C — Traçabilité cahier des charges → prompts

| Cahier | Prompt(s) |
|---|---|
| §3.1 Visiteur / démo | P6 |
| §3.2 Apprenant | P7, P8 |
| §3.3 Cartographe | P9 |
| §3.4 Promptologue | P10 |
| §3.5 Épistémiarque | P4 |
| §3.6 Employeur | P8 (lien + mdp) ; marketplace → backlog |
| §3.7 Établissement | P11 |
| §3.8 Administrateur | P6 (config démo), P12 |
| §4.1 Référentiel | P4 |
| §4.2 Portfolio | P7 |
| §4.3 Cartographie | P1, P5 |
| §4.4 Visualisation | P2 |
| §4.5 Comptes & BDD | P3 |
| §4.6 Formation | P8, P9, P10 (squelettes de contenu) |
| §4.7 Statistiques & recherche | P5, P9, P10 (consistance) ; open data → backlog |
| §4.8 Employeur / marketplace | P8 ; bibliothèque payante → backlog |
| §4.9 Établissement B2B | P11 |
| §4.10 Administration | P12 |
| §5 Architecture | P0 (ADR), P13 |
| §6 RGPD | P3, P7, P8, P12 (transverse partout) |
| §7 Modèle économique | P11 (facturation à l'usage), P12 (Golden Prompt) |
| §8 Vigilances | AD-1/AD-5 (contexte & durée), P9 (hallucinations), P10 (rétrospectif) |
| §9 Existant | Prérequis manuels, P0 (inventaire), P2 (fusion) |
| §10 Démarche | Structure même de ce plan |
