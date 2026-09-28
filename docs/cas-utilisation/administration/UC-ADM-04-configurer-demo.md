# UC-ADM-04 — Configurer la démo publique

| Champ | Valeur |
|---|---|
| **Acteur principal** | Administrateur (rôle `admin`, session ouverte — typiquement depuis un smartphone) |
| **Acteurs secondaires** | Visiteur de la démo (subit l'effet : UC-VIS-03, UC-VIS-05) ; exploitant qui règle l'environnement serveur (`~/app/shared/.env`) |
| **Portée** | humanome.xyz — `#/admin/reglages` (bloc « Démo publique »), `#/admin/config` ; API de session `/api/admin/demo-config` |
| **Niveau** | Objectif utilisateur |
| **Cahier des charges** | §3.1 (démo sans compte, garde-fous anti-abus), §3.8 et §4.10 (configuration simple), §6.5 (journalisation minimale) ; `docs/administration.md` §3-4, `api/config/demo.php` |
| **Statut** | Implémenté (P12.1 ; édition en ligne : chantier A) |

## Objectif

Permettre à l'administrateur d'**allumer ou éteindre** la démonstration
publique (proxy LLM des visiteurs sans compte) et d'en régler le **modèle** et
les **plafonds** (tokens, taille d'entrée, quota par IP, plafond global et
budget quotidiens, difficulté de la preuve de travail, délai amont), avec effet
**immédiat et sans redéploiement**, sans jamais exposer ni rendre modifiables la
clé plateforme et le fournisseur.

## Déclencheur

L'administrateur ouvre `#/admin/reglages` (menu « Administrer » → « Réglages »),
par exemple juste avant ou juste après une présentation.

## Préconditions

- Compte `admin` connecté (session + jeton CSRF), API et base joignables.
- Les couches inférieures existent : `api/config/demo.php` (versionné,
  « fichier ») et, en production, les variables `DEMO_*` de
  `~/app/shared/.env` (« env »). La clé `ANTHROPIC_API_KEY` ne vit que dans
  l'environnement.

## Garanties en cas de succès

- Les valeurs envoyées sont **validées puis fusionnées** dans
  `settings["demo_overrides"]` (couche « base ») ; la réponse donne pour chaque
  champ sa valeur **effective** et son **origine** (`base`, `env`, `fichier`,
  `defaut`).
- La requête suivante d'un visiteur (`POST /api/llm`, `GET /api/llm/challenge`,
  `GET /api/llm/status`, `POST /api/tuteur`, `GET /api/status`) applique les
  nouvelles valeurs.
- Un audit `demo_config_updated` (noms des champs modifiés, **jamais les
  valeurs**) ou `demo_config_reset` est écrit, acteur = l'administrateur.

## Garanties minimales (en cas d'échec)

- Un patch invalide n'écrit **rien** (tout ou rien), ni surcharge ni audit.
- Si la base est absente ou injoignable, la couche « base » est ignorée en
  silence : la démo continue sur env/fichier et ne répond jamais `500` à cause
  de cette couche (fail-safe).
- La clé API n'est jamais renvoyée (seulement `apiKeyConfigured`, booléen) ; le
  fournisseur ne peut pas être changé depuis le web.

## Scénario nominal

1. L'administrateur ouvre `#/admin/reglages`. `AdminView` vérifie la session
   (rôle `admin`), puis `ReglagesSection` charge en parallèle
   `GET /api/admin/settings`, `GET /api/prompt-packages` et
   `GET /api/admin/demo-config`.
2. `DemoConfigService::read` renvoie `200 {effective, sources, allowedModels,
   apiKeyConfigured}` : dix valeurs effectives (`enabled`, `provider`, `model`,
   `maxTokensPerRequest`, `maxInputChars`, `perIpPerHour`, `dailyGlobalTokens`,
   `dailyBudgetUsd`, `powDifficultyBits`, `upstreamTimeoutSeconds`) calculées par
   `DemoConfig::load` (précédence **base > env > fichier > défaut**).
3. L'IHM affiche le grand interrupteur « Démo publique : activée /
   désactivée » (`role="switch"`), le fournisseur (« non modifiable »), l'état de
   la clé API (« configurée » / « absente »), puis le formulaire : modèle (liste
   + « autre… » en saisie libre) et sept plafonds, chacun avec ses bornes et un
   badge d'origine (« réglage base », « env », « fichier », « défaut »).
4. **Interrupteur** : un clic envoie `PUT /api/admin/demo-config {enabled}`
   (+ `X-CSRF-Token`). Le serveur valide, fusionne, audite et renvoie le nouvel
   état ; l'IHM affiche « Démo publique désactivée. » (ou « activée. ») et
   l'interrupteur bascule. Dès la requête suivante, le visiteur reçoit `503
   « La démonstration est désactivée pour le moment. »` sur `POST /api/llm` et
   `GET /api/llm/challenge`, l'assistant tuteur répond `503 « L'assistant est
   indisponible pour le moment. »`, et `GET /api/llm/status` /
   `GET /api/status` annoncent `enabled: false`.
5. **Réglages** : l'administrateur modifie le modèle et/ou des plafonds puis
   clique « Enregistrer ». L'IHM calcule un **PUT partiel** ne contenant que les
   champs dont la valeur diffère de l'effectif (nombres convertis) ; le serveur
   répond `200` avec l'état complet ; message « Réglages de la démo enregistrés
   (effet immédiat). », badges « réglage base » sur les champs posés.
6. La démo applique aussitôt les nouvelles valeurs : difficulté du défi
   (`difficultyBits`), `413` au-delà de `maxInputChars`, `429 « Quota horaire
   atteint »` au-delà de `perIpPerHour`, modèle, `maxTokens` et délai imposés au
   fournisseur, coupe-circuit journalier (`dailyGlobalTokens`,
   `dailyBudgetUsd`).

## Scénarios alternatifs

- **A1 — Budget ou plafond global atteint** (étape 6) : un budget quotidien à
  `0` (borne autorisée) ou un plafond de tokens dépassé rend la démo « épuisée »
  pour le jour UTC : `remainingToday: false` et `503 « Démo épuisée pour
  aujourd'hui, revenez demain. »` sur `POST /api/llm`.
- **A2 — Réinitialiser** (étape 5) : « Réinitialiser (revenir aux valeurs
  env/fichier) » envoie `DELETE /api/admin/demo-config` : toutes les surcharges
  sont supprimées, l'état revient à env/fichier (message « Réglages de la démo
  réinitialisés (valeurs env/fichier). »), audit `demo_config_reset`. Une
  surcharge « base » gagne toujours sur une variable `DEMO_*` tant qu'elle
  existe.
- **A3 — Base injoignable** (étape 2 ou 6) : `DemoConfig::load` ignore la couche
  « base » (journal serveur `[demo-config] overrides unavailable…`) ; la démo
  tourne sur env/fichier, les surcharges réapparaissent au retour de la base.
- **A4 — Consulter la configuration serveur** : `#/admin/config`
  (`ConfigSection`, `GET /api/admin/settings` → `config`) liste les variables
  versionnées de `api/config/app.php` avec leur valeur effective (ou « (défaut :
  …) ») ; les secrets (`ANTHROPIC_API_KEY`, `POW_SECRET`, `MIGRATE_TOKEN`…)
  n'apparaissent que comme « configuré » / « absent ».
- **A5 — Rien à enregistrer** (étape 5) : aucun champ modifié → « Aucune
  modification à enregistrer. », aucune requête.
- **A6 — Modèle hors liste** (étape 3) : un modèle effectif absent de
  `allowedModels` présélectionne « autre… » avec sa valeur ; tout identifiant au
  bon format est accepté (nouveau modèle utilisable le jour de sa sortie).

## Scénarios d'erreur

- **E1 — Visiteur sans session** : `401` sur `GET/PUT/DELETE
  /api/admin/demo-config` ; IHM : espace réservé.
- **E2 — Compte sans rôle admin** : `403 « Rôle insuffisant »` ; IHM : espace
  réservé, aucune lecture de la configuration.
- **E3 — Valeur invalide** (étape 5) : `422` avec un message français précis,
  rien n'est appliqué — bornes (« maxTokensPerRequest doit être compris entre
  256 et 16000. »), type (« perIpPerHour doit être un entier. », « enabled doit
  être un booléen. », « dailyBudgetUsd doit être un nombre. »), modèle (« Le
  modèle ne peut pas être vide. », « Identifiant de modèle invalide … »), champ
  inconnu (« Champ inconnu : … »), fournisseur (« Le fournisseur n'est pas
  modifiable : … »), patch vide (« Aucun champ à modifier. »). L'IHM affiche le
  message en alerte. Côté client, un champ vidé est refusé avant tout envoi
  (« Champ vide : <libellé>. »), de même qu'un modèle libre vide.
- **E4 — Corps illisible** : un corps qui n'est pas du JSON → `400 « Corps JSON
  invalide : objet attendu »` ; un corps vide → `422`.
- **E5 — Jeton CSRF absent ou invalide** : `403`, configuration intacte ; l'IHM
  affiche le message et l'interrupteur ne bouge pas.

## Règles de gestion

- **RG1** — Précédence par champ : `base` (surcharge admin) > `env` (`DEMO_*`) >
  `fichier` (`api/config/demo.php`) > `defaut` (codé). Une valeur de base au
  mauvais type (chaîne pour un entier, modèle vide, chaîne pour un booléen) est
  ignorée **champ par champ** ; un entier est accepté pour le budget (réel).
- **RG2** — Bornes : `maxTokensPerRequest` 256–16000 ; `maxInputChars`
  1000–200000 ; `perIpPerHour` 1–1000 ; `dailyGlobalTokens` 10000–50000000 ;
  `powDifficultyBits` 8–24 ; `upstreamTimeoutSeconds` 10–300 (entiers stricts) ;
  `dailyBudgetUsd` 0–1000 (réel) ; `model` rogné, motif
  `[A-Za-z0-9][A-Za-z0-9._-]{0,99}`.
- **RG3** — `provider` n'est **jamais** lu depuis la base ni modifiable par
  l'API (env/fichier seulement, `mock` = développement) ; `ANTHROPIC_API_KEY`
  n'est jamais stockée ni renvoyée.
- **RG4** — Variables d'environnement : `DEMO_ENABLED` vaut « éteint » pour
  `0`, `false`, `off`, `no` (sans casse) et « allumé » pour toute autre valeur
  non vide ; une variable entière non numérique est ignorée.
- **RG5** — PUT partiel : les champs non envoyés conservent leur surcharge ; un
  patch est validé en entier avant toute écriture.
- **RG6** — L'interrupteur `enabled` coupe la démo LLM **et** l'assistant
  tuteur ; `perIpPerHour` est un quota partagé avec `GET /api/gdoc-text`.
- **RG7** — Journalisation minimale : l'audit ne porte que les **noms** des
  champs modifiés.

## Données et RGPD

| Donnée | Traitement |
|---|---|
| Surcharges de la démo | `settings.demo_overrides` (JSON), aucune donnée personnelle |
| Clé plateforme Anthropic | Environnement serveur uniquement ; exposée comme booléen |
| Trace des modifications | `audit_events` : `demo_config_updated {fields}`, `demo_config_reset` |
| Visiteurs de la démo | Quotas par seau d'IP haché (`rate_limits`), compteurs journaliers sans contenu (`llm_usage_daily`) |

## Code sollicité

| Couche | Élément | Rôle |
|---|---|---|
| Front | `web/src/views/admin/ReglagesSection.jsx` — `DemoSettings` | Interrupteur, formulaire, PUT partiel, badges d'origine, messages, état occupé |
| Front | `web/src/views/admin/ConfigSection.jsx` | Configuration serveur versionnée, secrets « configuré / absent » |
| Front | `web/src/views/admin/admin-api.js` — `fetchDemoConfig`, `saveDemoConfig`, `resetDemoConfig`, `toggleDemo`, `fetchSettings` | Appels HTTP |
| Front | `web/src/views/AdminView.jsx`, `web/src/api/client.js` | Garde de rôle, CSRF, erreurs typées |
| API | `api/src/routes/admin.php` — `GET/PUT/DELETE /admin/demo-config`, `GET /admin/settings` | Orchestration, `400` corps illisible, mapping `AdminException` |
| Domaine | `api/src/Admin/DemoConfigService.php` — `read`, `update`, `reset` | Validation, fusion, audit |
| Domaine | `api/src/Llm/DemoConfig.php` — `load` | Précédence, origine par champ, fail-safe |
| Domaine | `api/src/Packages/SettingsRepository.php` | Stockage `demo_overrides` |
| Domaine | `api/src/Admin/PlatformStatus.php` — `snapshot` | Instantané `demo` et `config` de `/admin/settings` |
| API (effet) | `api/src/routes/llm.php`, `api/src/routes/tuteur.php`, `api/src/routes/system.php` (`/status`) | Application des réglages côté visiteur |
| Config | `api/config/demo.php`, `api/config/app.php` | Couche « fichier », documentation des variables |

## Jeux de tests

### Tests unitaires

| ID | Cible | Vérifie | Fichier |
|---|---|---|---|
| UC-ADM-04-U01 | `DemoConfigService::read` | 10 valeurs, origines, liste de modèles, clé en booléen seulement | `api/tests/UseCases/Unit/UcAdm04ConfigurerDemoTest.php` |
| UC-ADM-04-U02 | `DemoConfigService::update` | Fusion de patchs partiels, modèle rogné, audit des noms (RG5, RG7) | idem |
| UC-ADM-04-U03 | `DemoConfigService::update` | Bornes entières inclusives, hors bornes et non-entiers → 422 (RG2) | idem |
| UC-ADM-04-U04 | `DemoConfigService::update` | Budget réel 0–1000, entier converti | idem |
| UC-ADM-04-U05 | `DemoConfigService::update` | Modèle libre, motif, 100 caractères max, jamais vide | idem |
| UC-ADM-04-U06 | `DemoConfigService::update` | Booléen, champ inconnu, fournisseur, patch vide ; tout ou rien | idem |
| UC-ADM-04-U07 | `DemoConfigService::reset` | Retour env/fichier, audit, idempotent | idem |
| UC-ADM-04-U08 | `DemoConfig::load` | Précédence base > env > fichier par champ (RG1) | idem |
| UC-ADM-04-U09 | `DemoConfig::load` | Lecture de `DEMO_ENABLED`, entier non numérique ignoré, `DEMO_PROVIDER` (RG4) | idem |
| UC-ADM-04-U10 | `DemoConfig::load` | Types invalides en base ignorés, `provider` en base ignoré (RG1, RG3) | idem |
| UC-ADM-04-U11 | `DemoConfig::load` | Base non configurée → pas de couche base, sans erreur | idem |
| UC-ADM-04-U12 | `PlatformStatus::snapshot` (AN-1) | Comportement actuel : `demo.editableInUi = false` | idem |
| UC-ADM-04-U13 | `fetchDemoConfig`, `saveDemoConfig`, `resetDemoConfig` | URL, méthodes, corps, CSRF sur mutations | `web/test/usecases/unit/uc-adm-04-configurer-demo.test.jsx` |
| UC-ADM-04-U14 | `toggleDemo` | `PUT {enabled}` booléen seul | idem |
| UC-ADM-04-U15 | `ReglagesSection` | PUT partiel des seuls champs modifiés, nombres | idem |
| UC-ADM-04-U16 | `ReglagesSection` | Modèle hors liste → « autre… » ; rien à enregistrer | idem |
| UC-ADM-04-U17 | `ReglagesSection` | État occupé : interrupteur et boutons inactifs | idem |
| UC-ADM-04-U18 | `ReglagesSection` (L2) | Comportement actuel : décimale tronquée dans un champ entier | idem |
| UC-ADM-04-U19 | `ConfigSection` | Groupes, secrets « configuré / absent », défaut affiché | idem |
| UC-ADM-04-U20 | `ConfigSection` | Erreurs de chargement (copie statique, erreur serveur) | idem |

### Tests fonctionnels

| ID | Scénario | Niveau | Vérifie | Fichier |
|---|---|---|---|---|
| UC-ADM-04-F01 | Nominal (1-3, 5) | API | Lecture, PUT partiel, origine « base », audit | `api/tests/UseCases/Functional/UcAdm04ConfigurerDemoTest.php` |
| UC-ADM-04-F02 | Nominal (4) | API | Interrupteur : `503` démo + tuteur, status/santé, puis rallumage | idem |
| UC-ADM-04-F03 | Nominal (6) | API | PoW 8 bits, `413` taille, appel mock `200`, `429` quota | idem |
| UC-ADM-04-F04 | A1 | API | Budget 0 → `remainingToday` faux, `503` « Démo épuisée » | idem |
| UC-ADM-04-F05 | A2 | API | Base > env, puis DELETE → env/fichier, démo rallumée, audit | idem |
| UC-ADM-04-F06 | A3 | API | Base injoignable → `/api/llm/status` `200` sur fichier, surcharge conservée | idem |
| UC-ADM-04-F07 | E1, E2 | API | `401` / `403` sur les trois méthodes, rien d'écrit | idem |
| UC-ADM-04-F08 | E3 | API | `422` + message exact pour 7 patchs invalides, rien d'écrit | idem |
| UC-ADM-04-F09 | E4 | API | `400` corps non JSON, `422` corps vide | idem |
| UC-ADM-04-F10 | E5 | API | `403` sans CSRF sur PUT et DELETE, configuration intacte | idem |
| UC-ADM-04-F11 | Nominal (1-4) | IHM | `<App/>` : interrupteur → PUT `{enabled:false}` + CSRF, message, badge | `web/test/usecases/functional/uc-adm-04-configurer-demo.test.jsx` |
| UC-ADM-04-F12 | Nominal (5) | IHM | Modèle + plafond → PUT partiel, message, badges « réglage base » | idem |
| UC-ADM-04-F13 | A2 | IHM | Réinitialiser → DELETE, message, retour au fichier | idem |
| UC-ADM-04-F14 | E3 | IHM | `422` serveur → alerte, rien appliqué | idem |
| UC-ADM-04-F15 | E3 (client) | IHM | Champ vide → alerte locale, aucun PUT | idem |
| UC-ADM-04-F16 | E5 | IHM | CSRF refusé → alerte, interrupteur inchangé | idem |
| UC-ADM-04-F17 | A4 | IHM | `#/admin/config` : secrets « configuré / absent », défaut affiché | idem |
| UC-ADM-04-F18 | E1, E2 | IHM | Compte non admin : espace réservé, aucune lecture | idem |

### Tests existants liés (non-régression)

- `api/tests/AdminDemoConfigTest.php` — précédence, PUT partiel, bornes, reset, fail-safe, CSRF, audit sans valeurs.
- `api/tests/AdminSettingsTest.php` — instantané `/admin/settings`, secrets masqués.
- `api/tests/LlmProxyTest.php`, `api/tests/LlmPowTest.php`, `api/tests/TuteurTest.php` — garde-fous de la démo et du tuteur.
- `api/tests/StatusTest.php` — page de santé publique.
- `web/src/views/admin/ReglagesSection.test.jsx`, `web/src/views/AdminView.test.jsx`.

### Exécuter

```sh
docker compose run --rm php vendor/bin/phpunit --filter UcAdm04 --testdox
cd web && npx vitest run test/usecases/unit/uc-adm-04 test/usecases/functional/uc-adm-04
```

## Anomalies constatées

- **AN-1 — Instantané des réglages obsolète.** `GET /api/admin/settings`
  (`PlatformStatus::snapshot`) renvoie `demo.editableInUi: false` et un bloc
  `demo` sans `upstreamTimeoutSeconds`, vestiges de la v1 « démo réglée par
  l'environnement », alors que la démo est éditable (`/admin/demo-config`).
  Sans effet visible (l'IHM lit `/admin/demo-config`), mais trompeur pour un
  client de l'API. Figé par UC-ADM-04-U12.

## Limites

- **L1** — L'origine `defaut` est inatteignable avec le fichier versionné :
  `api/config/demo.php` définit toutes les clés, donc sans surcharge ni
  variable, chaque champ vient du « fichier ».
- **L2** — Le formulaire convertit les champs entiers par `parseInt` : une
  saisie décimale (`12.7`) part tronquée (`12`) sans avertissement (figé par
  UC-ADM-04-U18) ; les bornes affichées ne sont que des repères (`noValidate`),
  la validation fait foi côté serveur.
- **L3** — La section charge `/admin/settings`, `/prompt-packages` et
  `/admin/demo-config` ensemble : l'échec de l'un masque tout le bloc
  (« Chargement impossible. »).
- **L4** — `DEMO_ENABLED` : toute valeur non vide autre que `0/false/off/no`
  allume la démo (ex. `non`), à connaître en éditant le `.env`.
