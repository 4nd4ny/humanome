# Plan masse (P11 / M8) — file de jobs MySQL + worker cron à ticks courts

**Contexte :** cahier §3.7, §4.9, §7, §8 ; ADR-005 (décision AD-5). Contrainte OVH
mutualisé : pas de processus long — chaque exécution du worker (« tick ») dure
**moins de 50 s** et la reprise est incrémentale.

## 0. Décision d'architecture M8 (fixée)

**Le worker PHP n'exécute QUE l'extraction LLM** (étage C — la partie coûteuse,
plusieurs heures par cohorte) ; **le MERGE reste au moteur JS** (`engine/`,
déterministe, parité oracle 100 % — docs/rapport-parite-moteur.md) :

- extraction côté serveur : construction des prompts par **substitution des
  gabarits `{{placeholders}}` du prompt-package stocké en base** (rôles
  `extraction-pole` et `kairos` du paquet, schéma `prompt-package`) — **aucune
  réimplémentation du moteur JS**. Le code PHP ne porte que les invariants
  déterministes de forme (`normalizeCompetences`, `computeAuditPole`,
  parseur JSON tolérant), copies conformes citées de
  `engine/src/pipeline/extract.js` ;
- merge côté client : calculé **dans le navigateur** à l'affichage des
  résultats par l'établissement (le front récupère les documents jour via
  `GET /api/etablissement/membres/{userId}/documents` et appelle le moteur),
  ou par le **runner Node** (`scripts/runner-node/`, chantier ultérieur) qui
  consomme la même file via `/api/worker/*`.

Pourquoi : le merge est déterministe et bon marché (des millisecondes), sa
parité avec l'oracle est garantie par UN seul code (le moteur JS) — le porter
en PHP créerait une seconde vérité à maintenir. L'extraction, elle, est une
suite d'appels LLM : la « logique » est dans les gabarits du paquet (données
en base), pas dans du code — la substitution PHP n'a besoin de reproduire que
le formatage des variables injectées (bloc référentiel, date française),
vérifié octet à octet contre le moteur (goldens `api/tests/MasseGolden/`).

## 1. Granularité et modèle de la file

**Un job = (membre, journée)** — l'unité naturelle du protocole (découpage
journalier, §4.3) : assez fine pour être reprenable, assez grosse pour amortir
les requêtes. Un job = 8 appels LLM (7 pôles + 1 kairos), **checkpoint PAR
PÔLE** dans le job : un tick peut s'arrêter au milieu d'une journée sans rien
perdre.

### Table `mass_runs` (un lancement de cohorte)

| colonne | rôle |
|---|---|
| `etablissement_id`, `cohorte_id` | FK CASCADE (purge RGPD, §5) |
| `prompt_package_slug/semver` | version PUBLIÉE figée au lancement (reproductibilité) |
| `referentiel_id/semver` | version publiée du référentiel figée au lancement |
| `status` | `active` / `done` / `failed` / `cancelled` / `budget_exceeded` |

### Table `mass_jobs`

| colonne | rôle |
|---|---|
| `run_id`, `user_id`, `portfolio_id`, `day_date` | identité du job ; UNIQUE (run_id, user_id, day_date) |
| `status` | `queued` / `running` / `done` / `failed` / `budget_exceeded` / `cancelled` |
| `priority` | TINYINT décroissant (défaut 0) — réservation `ORDER BY priority DESC, id ASC` (FIFO à priorité égale) |
| `lease_until` | bail de réservation (5 min) ; un job `running` au bail expiré est **réservable à nouveau** (tick tué, runner déconnecté) |
| `checkpoint` | JSON `{"poles": {"1": {...}, ...}}` — documents de pôle déjà validés ; écrit après CHAQUE appel réussi |
| `attempts` / `erreur` | compteur d'échecs d'appel (job → `failed` à 3) + dernier message d'erreur |
| `document` | document `cartographie-jour` final validé (Validation.php) |
| `tokens_input/output`, `cost_usd` | compteurs d'usage (jamais de contenu dans les logs) |

Tous les écrits du worker sont conditionnels `WHERE status = 'running'` :
une annulation posée pendant le traitement gagne (0 ligne affectée → le
worker abandonne le job sans écrire).

## 2. Dimensionnement d'un tick (< 50 s)

Mesuré (Docker php:8.2, MockProvider, prompt 4 000 caractères) : **0,18 ms
par appel mock** — le coût propre du worker (requêtes SQL comprises : ~2 ms
par checkpoint) est négligeable. **Le tick est borné par la latence du LLM
réel** : en prod M5 (Sonnet, thinking désactivé, JSON compact, 8 192 tokens
de sortie), un appel d'extraction dure **10 à 40 s**.

Politique du tick (budget utile **~40 s**, marge 10 s sous la limite) :

1. `GET_LOCK('humanome_worker', 0)` — un seul tick à la fois ; si le verrou
   est tenu (cron précédent encore actif), le tick sort immédiatement.
2. Boucle : réserver le job réservable le plus prioritaire/ancien
   (`queued`, ou `running` au bail expiré), avancer **pôle par pôle**.
3. **Avant chaque appel LLM** : (a) vérifier le budget (cf. §4) ; (b) vérifier
   le temps écoulé — si `elapsed >= 40 s`, reposer le job (`queued`,
   checkpoint conservé, bail levé) et rendre la main. **Au moins un appel est
   garanti par tick** (progrès même si le budget temps est mal réglé).
4. Timeout amont par appel : `min(45, ce qui reste sous 50 s)` — un appel qui
   déborde échoue proprement (attempts + 1, retenté au tick suivant).

Soit **1 à 3 appels LLM réels par tick** ; une journée (8 appels) traverse
3 à 8 ticks ; une cohorte de 20 portfolios × 3 jours = 480 appels ≈ 160 à
480 ticks. Avec un cron OVH à la minute : **3 à 8 h par cohorte de 60
journées** — conforme à « un run peut prendre plusieurs heures » (§8). Pour
les grandes cohortes, la voie recommandée reste le runner côté établissement
(ADR-005), qui consomme la même file **sans limite de durée** via
`/api/worker/*`.

Déclenchement : cron OVH `php scripts/worker.php` (ticks courts), ET
`POST /api/admin/worker-tick` (jeton `X-Migrate-Token`, ADR-008) pour
déclencher un tick depuis l'extérieur sans SSH (uptime-robot, script deploy).

## 3. Points de reprise (aucun appel LLM perdu, aucun doublé)

- **Checkpoint par pôle** : chaque pôle validé est écrit immédiatement dans
  `checkpoint.poles[n]` ; à la reprise, les pôles présents ne sont **jamais
  rappelés** (testé : interruption/reprise sans double-appel, compteur mock).
- **Bail (lease) 5 min** : un tick tué net laisse le job `running` ; passé le
  bail il redevient réservable, checkpoint intact. Le runner machine renouvelle
  son bail en écrivant ses checkpoints (`POST /api/worker/jobs/{id}/checkpoint`).
- **GET_LOCK MySQL** : sérialise les ticks cron (un cron lent ne se fait pas
  doubler) ; la réservation elle-même est une transaction
  `SELECT … FOR UPDATE SKIP LOCKED` → sûre aussi face au runner machine.
- **Écritures idempotentes** : reposer un job déjà reposé, annuler un job
  terminé, re-poster un résultat après expiration du bail = no-ops propres.

## 4. Budget (cahier §3.7, §7)

- `etablissement_config.budget_cap_usd` (plafond configurable par
  l'interface) et `spent_usd` (compteur cumulé, base de la facturation à
  l'usage du fournisseur « humanome », §7).
- **AVANT chaque appel LLM** : `spent + coût estimé de l'appel > plafond` →
  refus. Estimation conservatrice : tokens d'entrée ≈ longueur(prompt)/3,6
  (heuristique du moteur) + budget de sortie plein, tarifée par
  `Llm/Pricing` (préfixe de modèle le plus long). Le job courant passe
  `budget_exceeded` (checkpoint conservé), **tous les jobs `queued` de
  l'établissement aussi**, les runs touchés sont marqués `budget_exceeded`.
- **Réactivation en montant le plafond** : `PUT /api/etablissement/config`
  avec un `budgetCapUsd` supérieur re-file (`queued`) les jobs
  `budget_exceeded` de l'établissement et repasse les runs en `active`.
- Chaque résultat (tick PHP ou runner machine) incrémente `spent_usd`
  atomiquement (`UPDATE … SET spent_usd = spent_usd + ?`).
- Fournisseur `endpoint` (infra propre de l'établissement, §4.9) : coût
  estimé et facturé **0** — le plafond ne borne que la clé plateforme ;
  l'établissement paie sa propre infrastructure.

## 5. Fournisseur LLM (cahier §4.9)

`etablissement_config.provider` :

- **`humanome`** : clé plateforme `ANTHROPIC_API_KEY` (env, jamais en base),
  `Llm/AnthropicProvider` existant (tool_use forcé = JSON garanti, leçons
  M5), facturée à l'usage via `spent_usd` (§7) ;
- **`endpoint`** : URL compatible OpenAI (`/v1/chat/completions` — serveur
  local, Ollama, vLLM…) + clé optionnelle de l'établissement, **chiffrée
  sodium** (pattern KeyVault AD-4 : nonce ‖ secretbox, clé maîtresse
  `SODIUM_MASTER_KEY` hors webroot) — `Worker/OpenAiCompatibleProvider`.
  `GET /api/etablissement/config` ne renvoie **jamais** la clé (`hasApiKey`).

**Partage du travail** : le tick cron de la plateforme ne réserve que les
jobs des établissements en fournisseur `humanome` — une infra `endpoint` est
typiquement inaccessible depuis OVH (NAT, réseau local) : ses jobs sont
réservés au runner machine de l'établissement via `/api/worker/*` (même file,
mêmes checkpoints, mêmes règles de bail).

## 6. Flux RGPD (cahier §6 ; ADR-005 « opt-in contractuel »)

Les portfolios des apprenants sont **locaux** (client-first, ADR-001) : la
masse B2B exige un transit serveur, donc un opt-in explicite à DEUX étages :

1. **Rejoindre la cohorte** (`POST /api/cohortes/{code}/rejoindre`, apprenant
   connecté, CSRF) : consentement EXPLICITE dans le corps
   (`{"consentement": true}`) + texte affiché côté front : « En rejoignant
   cette cohorte, vous acceptez que l'établissement voie les cartographies
   produites dans ce cadre. » `consent_at` horodaté en base. Re-jointure
   idempotente (200, le consentement d'origine fait foi).
2. **Déposer son portfolio** (`POST /api/cohortes/{id}/portfolio`, membre
   consenti) : **le dépôt est l'opt-in de fait au traitement serveur** —
   seuls les membres ayant déposé sont enfilés par un run. Table dédiée
   `cohorte_portfolios` (titre, texte, segments journaliers), un dépôt par
   (cohorte, membre), re-dépôt = remplacement.

**Quitter la cohorte** (`DELETE /api/cohortes/{id}/quitter`) retire le
consentement : adhésion ET portfolio déposé purgés, jobs en attente annulés.
**Les cartographies déjà produites restent à l'apprenant** (lignes `mass_jobs`
done, propriété `user_id`) : l'établissement en perd l'accès (le contrôle
d'accès exige l'adhésion active), l'apprenant les conserve — elles suivent le
cycle de vie de SON compte. (Récupération par l'apprenant côté front :
chantier B.)

**Purge par FK** (suppression de compte, §6.3) :

- compte apprenant → `cohorte_membres`, `cohorte_portfolios`, `mass_jobs`
  (CASCADE sur `user_id`) purgés ;
- compte établissement → `etablissement_config`, `cohortes` → (CASCADE)
  membres, portfolios déposés, `mass_runs` → `mass_jobs` : tout l'arbre ;
- portfolio déposé supprimé (quitter) → `mass_jobs.portfolio_id` **SET
  NULL** : les documents produits survivent (ils appartiennent à
  l'apprenant), les jobs non terminés sans source sont annulés par le worker.

Journalisation : compteurs et ids uniquement (audit `mass_run_created`,
`cohorte_joined`…), jamais de texte de portfolio ni de document.

## 7. Contrat d'API (fixé — détails d'implémentation)

Rôle `etablissement` (déjà seedé en 001). Matrice complète :
docs/autorisations.md.

- `POST /api/etablissement/cohortes {nom}` → `{id, codeInvitation}` (code
  A-Z2-9 ×10, unique) ; `GET /api/etablissement/cohortes` ;
  `GET /api/etablissement/cohortes/{id}` (membres : `consentAt`,
  `portfolioDepose`, `portfolio` {titre, journees, taille, deposeLe},
  avancement jobs) ; `DELETE` (purge cascade).
- `GET /api/cohortes` (apprenant) : ses adhésions (consentement daté,
  établissement, état du dépôt) — la liste « Mes cohortes » de l'espace.
- `PUT/GET /api/etablissement/config` (§5, jamais la clé) ;
  `POST /api/etablissement/worker-token` → `{workerToken}` en clair UNE fois,
  stocké haché sha256 (pattern share_links).
- `POST /api/etablissement/cohortes/{id}/runs {promptPackageId,
  promptPackageVersion, membres?}` : versions publiées obligatoires (paquet
  ET référentiel figés sur le run) ; enfile un job par (membre consenti AYANT
  déposé × journée de son dépôt) → `{runId, jobs}`.
- `GET /api/etablissement/runs/{runId}` (jobs par statut, coût cumulé,
  erreurs) ; `POST /api/etablissement/runs/{runId}/annuler`.
- `GET /api/etablissement/membres/{userId}/documents` : enveloppe
  `{membre: {userId, displayName, consentAt}, documents: [...]}` — documents
  jour `done` produits pour SES cohortes uniquement, membre encore
  consenti — le front merge côté client via le moteur (§0).
- Worker machine (`X-Worker-Token`, pas de session → hors CSRF par
  construction) : `GET /api/worker/jobs?limit=n` (réserve : `running`,
  bail 5 min, texte du jour + checkpoint + versions figées
  (`referentielVersion`) + document référentiel COMPLET partagé au niveau
  réponse (le runner exécute le moteur chez lui) + config LLM de
  l'établissement (`provider`, jamais sa clé) inclus) ;
  `POST /api/worker/jobs/{id}/checkpoint` (renouvelle le bail) ;
  `POST /api/worker/jobs/{id}/result {document | erreur, tokens, coutUsd}`
  (document validé par Validation.php côté serveur, coût borné).
- `POST /api/admin/worker-tick` (`X-Migrate-Token`) : un tick borné, réponse
  = compteurs du tick.

## 8. Vérification (DoD P11)

Suite PHPUnit (provider mock injecté, fixtures réelles du schéma) :

1. cycle cohorte : création, jointure avec consentement explicite (422 sans),
   idempotence, dépôt de portfolio segmenté, quitter (purge + annulation) ;
2. enfilement : run sur membres consentis ayant déposé uniquement ;
3. **cohorte fixture de 20 portfolios × 3 journées** (textes courts variés
   générés) : boucle de ticks simulés → 60 jobs `done`, 60 documents valides
   au schéma `cartographie-jour` ;
4. **interruption** (arrêt de boucle à mi-course) puis **reprise** (nouvelle
   boucle) : aucun double-appel LLM (compteur du mock = 8 × jobs) ;
5. **plafond abaissé en cours de run** → arrêt propre (`budget_exceeded`),
   réactivation après hausse → run complet ;
6. bail expiré → job repris là où il en était (checkpoint) ;
7. annulation en cours de run → jobs `cancelled`, le tick n'appelle plus.
