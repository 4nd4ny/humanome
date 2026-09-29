# UC-APP-02 — Lancer une cartographie standard

| Champ | Valeur |
|---|---|
| **Acteur principal** | Apprenant (fonctionne aussi sans session) |
| **Acteurs secondaires** | Fournisseur LLM : service humanome (proxy plateforme) ou fournisseur choisi avec la clé personnelle de l'apprenant ; promptologues (versions publiées) ; administrateur (version par défaut) |
| **Portée** | humanome.xyz — assistant `#/espace/nouveau-run` ; moteur exécuté dans le navigateur |
| **Niveau** | Objectif utilisateur |
| **Cahier des charges** | §3.2 (déclencher une cartographie), §4.3 (découpage journalier, fusion obligatoire, traçabilité prompt/référentiel), §5 (clé API personnelle, LLM peu coûteux pour l'usage gratuit), §6.1 ; principe RGPD n°5 de `CLAUDE.md` (journalisation minimale) |
| **Décisions** | ADR-001 (exécution client-first), ADR-004 (clés API personnelles), ADR-005 (la masse passe par la file serveur — hors de ce cas) |
| **Statut** | Implémenté (P8.3) ; version par défaut exposée par le serveur (M7) mais non exploitée par l'assistant (anomalie A-01) |

## Objectif

Produire, à partir d'un portfolio local (UC-APP-01), une **cartographie de
compétences** : un document `cartographie-jour` par journée puis leur
**fusion chronologique** `cartographie-merge`, en choisissant la version de
prompt et le fournisseur du modèle, après une estimation de coût, avec des
**checkpoints** qui permettent d'interrompre et de reprendre — le tout
exécuté dans le navigateur, résultats conservés localement.

## Déclencheur

L'apprenant ouvre `#/espace/nouveau-run` (menu « Ma cartographie →
Cartographier mes écrits », ou le bouton du tableau de bord `#/espace`).

## Préconditions

- Un portfolio local comportant au moins une journée **datée** (UC-APP-01).
- Mode « Service humanome » : API joignable, démonstration activée et budget
  du jour non épuisé. Avec la configuration par défaut, au plus
  ⌊`perIpPerHour` / 8⌋ journées par heure et par IP (20/h dans
  `api/config/demo.php` ⇒ 2 journées ; 40/h dans `api/.env.example` ⇒ 5) et
  des journées d'au plus `maxInputChars` − ~8,5 k caractères de gabarit
  (≈ 11,5 k caractères avec 20 000) ; au-delà, voir E5 et les anomalies A-02
  et A-05.
- Mode « Clé personnelle » : une clé du fournisseur choisi (sauf Ollama,
  local et sans clé).
- Aucune session n'est exigée ; la synchronisation serveur de la clé et la
  récupération d'une clé enregistrée demandent d'être connecté.

## Garanties en cas de succès

- Un document `cartographie-jour` par journée et, si la fusion est
  constructible, un document `cartographie-merge` validé au schéma, sont
  enregistrés dans le **carto-store local** (IndexedDB
  `humanome-cartographies`) en visibilité `privee`, sans copie serveur
  (`serverId` null), avec leur traçabilité : `promptPackage` (version
  choisie), `referentiel`, `runMeta` (portfolio, mode, fournisseur, modèle,
  nombre de jours, date, compteurs de tokens réels).
- Les checkpoints par journée et le journal du run sont dans IndexedDB
  `humanome-runs` (magasin `kv`).
- Côté serveur (mode Service humanome) : des **compteurs** seulement
  (requêtes, tokens, coût estimé du jour), jamais de prompt ni de réponse.

## Garanties minimales (en cas d'échec)

- Chaque journée terminée reste checkpointée : une reprise ne refait pas le
  travail déjà payé.
- Aucune cartographie incomplète n'est enregistrée tant qu'une journée manque.
- La clé personnelle ne transite jamais par humanome, sauf synchronisation
  explicitement cochée (chiffrée côté serveur, ADR-004).

## Scénario nominal

1. L'apprenant ouvre l'assistant. L'espace vérifie la session
   (`GET api/auth/me`) ; l'assistant charge le référentiel publié (repli sur
   la copie embarquée), les portfolios locaux et les versions de prompt
   (`GET api/prompt-packages/default` puis `GET api/prompt-packages`).
2. **Portfolio** : il choisit un portfolio ; chaque entrée affiche son nombre
   de journées (segments datés regroupés par date, textes d'une même date
   concaténés, tri chronologique ; segments non datés ignorés). « Continuer »
   n'est actif qu'avec au moins une journée.
3. **Version de prompt** : le paquet embarqué `aurora-v3-reconstruit@1.0.0`
   est proposé en tête et présélectionné, suivi des versions publiées ;
   l'apprenant garde ou change la version.
4. **Fournisseur** : il choisit « Service humanome » (modèle et plafonds
   imposés par la plateforme, preuve de travail à chaque appel).
5. **Estimation** : l'assistant affiche le nombre de journées × la taille
   moyenne, le nombre d'appels (8 par journée + 69 récits de fusion), les
   tokens d'entrée/sortie, le coût estimé (ou « inconnu » hors table de prix)
   et la durée, avec l'avertissement de prix indicatifs.
6. **Exécution** : « Lancer le run ». Une première preuve de travail est
   pré-résolue, puis, journée par journée, le moteur appelle 7 fois le modèle
   (un appel par pôle) et une fois pour la synthèse kairos ; pour chaque appel
   du service humanome, le navigateur obtient un défi
   (`GET api/llm/challenge`), le résout et envoie
   `POST api/llm {provider, model, system, prompt, maxTokens, challenge, nonce, website: ''}`.
   Chaque journée validée est **checkpointée** ; la progression affiche
   « Journée k/n (date) — appel x/8 (pôle p) ».
7. Toutes les journées terminées, le moteur fusionne les documents
   (`mergeDays`) et construit le document `cartographie-merge` avec des
   **résumés locaux** à la place des récits narratifs, puis le valide au
   schéma.
8. Les documents sont enregistrés dans le carto-store (« Journée <date> —
   <titre> », « Cartographie — <titre> ») ; message « Cartographie terminée et
   enregistrée (n document(s) jour + le document merge, visibilité
   « privée ») » et consommation réelle (tokens, appels).
9. « Retour à l'espace apprenant » ramène au tableau de bord `#/espace`
   (UC-APP-03).

## Scénarios alternatifs

- **A1 — Clé personnelle** (étape 4) : fournisseur (Anthropic, OpenAI,
  Google, xAI, OpenRouter, Ollama), modèle (défaut du fournisseur) et clé ; la
  clé est pré-remplie depuis `localStorage` (`humanome-keys`) et y est
  mémorisée par défaut ; « Synchroniser sur le serveur (chiffrée) » (opt-in,
  connecté) envoie `PUT api/keys` avant le run ; « Récupérer la clé depuis le
  serveur » lit `GET api/keys/{fournisseur}` (clé absente : message du
  serveur, « Aucune clé enregistrée pour ce fournisseur »). Les appels partent
  **directement** vers l'API du fournisseur (clé en en-tête), jamais vers
  humanome ; le moteur fait 3 tentatives au total sur 429/5xx/erreur réseau
  (`Retry-After` respecté, plafonné à 5 min), soit, avec le nouvel essai
  d'`extractDay`, jusqu'à 6 requêtes par pôle. Un refus de la synchronisation
  bloque le lancement (E6).
- **A2 — API injoignable ou en erreur** (étapes 1 et 3) : API absente (échec
  réseau, réponse non JSON d'une copie statique) : bandeau « Copie statique du
  site… » ; API joignable mais en erreur 5xx JSON : bandeau « Vous n'êtes pas
  connecté… ». Dans les deux cas, seule la version embarquée est proposée
  (« Versions publiées indisponibles (API injoignable) : version embarquée
  proposée. ») et la synchronisation de clé est désactivée. Le mode clé
  personnelle reste utilisable.
- **A3 — Version publiée choisie** (étape 3) : la version choisie est
  enregistrée avec chaque cartographie (`promptPackage`) et entre dans
  l'identifiant du run ; en v1 le moteur exécute **toujours** le protocole
  embarqué (annoncé à l'écran).
- **A4 — Interrompre puis reprendre** (étape 6) : « Interrompre » arrête le run
  (l'appel en cours est abandonné, la journée entamée sera refaite) ;
  « Reprendre le run » saute les journées checkpointées : « Repris à la
  journée k/n : les j journée(s) déjà checkpointée(s) sont sautées. » (k est
  faux après une journée en échec, anomalie A-04).
- **A5 — Rechargement de la page** (étape 6) : quitter l'assistant interrompt
  le run ; relancé avec le même portfolio et la même version (même
  identifiant de run `portfolioId::paquet@version`), il reprend depuis les
  checkpoints IndexedDB.
- **A6 — Fusion non constructible** (étape 7) : si un pôle n'a aucune
  compétence établie sur la période (portfolio court), les documents jour sont
  enregistrés seuls : « Run terminé : n document(s) jour enregistrés… » et une
  note explique pourquoi la fusion manque.

## Scénarios d'erreur

- **E1 — Aucun portfolio local** (étape 2) : « Aucun portfolio local. Créez
  d'abord un portfolio… » (lien `#/portfolio`), « Continuer » inactif.
- **E2 — Portfolio sans journée datée** (étape 2) : « (aucune journée
  segmentée : à découper dans le module portfolio) », « Continuer » inactif.
- **E3 — Clé manquante** (étape 4) : « Continuer » inactif tant que la clé est
  vide (sauf Ollama : « Ollama tourne en local : aucune clé requise. »).
- **E4 — Journée en échec** (étape 6) : réponse illisible deux fois de suite,
  erreur du fournisseur… La journée est marquée en échec, le run **continue**
  avec les suivantes, puis affiche « Certaines journées ont échoué. Les
  journées réussies sont checkpointées : « Reprendre » ne retentera que les
  journées manquantes. » et la liste des journées en échec ; rien n'est
  enregistré dans le carto-store.
- **E5 — Service humanome indisponible** (étape 6). Au défi initial
  (`GET api/llm/challenge`, pré-résolu avant la 1re journée), seul un `503`
  est possible (démo désactivée, ou secret de preuve de travail absent) :
  « La démo est épuisée pour aujourd'hui ou momentanément désactivée.
  Revenez un peu plus tard — ou créez un compte pour cartographier sans ces
  limites. » avec « Reprendre le run », aucun appel LLM. Le quota horaire par
  IP (`429` + `Retry-After`), le budget du jour épuisé (`503`), le texte trop
  long (`413`) et les refus de preuve (`400 pow_*`, `429 pow_reused`) ne
  surviennent que sur `POST api/llm`, donc **en cours de run** : les journées
  concernées échouent avec le détail technique (E4, anomalie A-02).
- **E6 — Synchronisation de la clé refusée** (étape 6, A1) : `PUT api/keys`
  en échec (`401` session expirée, `403` CSRF, `422` « Validation échouée »,
  clé de moins de 8 caractères) : le run ne démarre pas, le message du
  serveur s'affiche avec « Reprendre le run », aucun appel au fournisseur —
  bien que la clé fonctionnerait localement.

## Règles de gestion

- **RG1** — Exécution dans le navigateur (ADR-001) : le serveur ne voit le
  texte d'une journée qu'en mode Service humanome, le temps de l'appel, sans
  le conserver (compteurs seulement, principe RGPD n°5).
- **RG2** — Une journée = 7 appels de pôle + 1 synthèse kairos ; un appel en
  échec (réponse illisible ou erreur du fournisseur) est réessayé **une**
  fois par `extractDay` ; une synthèse kairos en échec — pour **toute**
  cause, erreur HTTP ou réseau comprise — est dégradée en `kairos: null` : la
  journée reste valable et est checkpointée **définitivement** (jamais
  retentée, cf. A-03), sans signalement à l'écran.
- **RG3** — Identifiant de run stable `portfolioId::paquet@version` : même
  portfolio et même version ⇒ mêmes checkpoints (reprise automatique).
- **RG4** — Checkpoint atomique par journée (`run:<id>:checkpoint:<date>`),
  échec persistant (`run:<id>:failed:<date>`), journal horodaté
  (`run_started`, `run_resumed`, `day_started`, `day_completed`, `day_failed`,
  `run_completed`). Le moteur ne consulte le signal d'interruption qu'**entre**
  deux journées, mais l'assistant le transmet aussi aux appels du
  fournisseur : l'appel en cours est abandonné et la journée entamée est
  refaite à la reprise.
- **RG5** — Service humanome : une preuve de travail **par appel** (défi signé
  HMAC, 5 minutes, usage unique), pot de miel `website` vide ; le serveur
  impose modèle, `maxTokens` et plafonds (`api/config/demo.php`, surcharges
  admin). Reprises (`demo-llm.js`, transport à `maxAttempts: 1`) : **aucune**
  sur quota (`429` hors défi) ni sur `503` ; **une seule**, après 2,5 s et
  avec un défi neuf, sur `500`/`502`/`504`/`529`, erreur réseau ou défi refusé
  (`pow_reused`, `pow_expired`, `pow_required`).
- **RG6** — Estimation : 8 appels par journée + 69 récits de fusion ; tokens
  ≈ caractères / 3,6 ; 1 000 tokens de sortie et 20 s par appel ; le service
  humanome est estimé sur le modèle de référence `claude-sonnet-5` ; un
  modèle hors table de prix donne un coût « inconnu ».
- **RG7** — Le document merge n'est produit que si **toutes** les journées
  sont checkpointées et s'il valide le schéma (7 pôles portant chacun au moins
  une compétence établie) ; sinon seuls les documents jour sont gardés.
- **RG8** — Les cartographies produites sont **privées et locales** ; toute
  copie serveur est un opt-in ultérieur (UC-APP-04).

## Données et RGPD

| Donnée | Traitement |
|---|---|
| Texte des journées | Navigateur ; transite vers le fournisseur choisi (clé personnelle) ou via le proxy humanome sans conservation |
| Clé API personnelle | `localStorage` par défaut ; serveur seulement sur opt-in (chiffrée, ADR-004) ; jamais dans une URL |
| Checkpoints, journal de run | IndexedDB `humanome-runs` |
| Cartographies | IndexedDB `humanome-cartographies`, visibilité `privee` |
| Usage du service humanome | Compteurs journaliers (`llm_usage_daily`) ; empreinte du défi consommé (`llm_pow_challenges`) ; seau de quota haché |

## Code sollicité

| Couche | Élément | Rôle |
|---|---|---|
| Front | `web/src/views/EspaceView.jsx` | Session, dispatch de `#/espace/nouveau-run` |
| Front | `web/src/components/RunWizard.jsx` | Assistant en 5 étapes, exécution, enregistrement |
| Front | `web/src/lib/run-launcher.js` — `computeDayGroups`, `fetchPromptPackages`, `buildEstimate`, `createProviderBundle`, `makeRunId`, `executeRun`, `buildLocalNarratives`, clés locales et synchronisation | Logique non-UI du lancement, résumés locaux du merge |
| Front | `web/src/lib/demo-llm.js` — `createDemoProvider`, `describeDemoError` ; `web/src/lib/pow.js` | Service humanome : défi, preuve de travail, messages |
| Front | `web/src/lib/carto-store.js` (via `carto-store-bridge.js`) | Enregistrement local des résultats |
| Moteur | `engine/src/pipeline/extract.js` — `extractDay` | 7 pôles + kairos, validation, nouvel essai |
| Moteur | `engine/src/runs/run.js`, `journal.js`, `memory.js`, `indexeddb.js` | Checkpoints, échec, interruption, reprise, journal |
| Moteur | `engine/src/pipeline/merge.js`, `merge-document.js` ; `engine/src/validation.js` | Fusion chronologique, document merge, schémas |
| Moteur | `engine/src/providers/index.js`, `retry.js`, `mock.js`, `estimate.js` | Transports direct/proxy, reprises, estimation |
| API | `GET /api/prompt-packages`, `/default`, `/{id}/{version}` — `api/src/routes/packages.php` | Versions de prompt proposées |
| API | `GET /api/llm/challenge`, `POST /api/llm` — `api/src/routes/llm.php` | Proxy du service humanome |
| Domaine | `api/src/Packages/PromptPackageRepository.php`, `SettingsRepository.php` | Versions publiques, défaut validé |
| Domaine | `api/src/Llm/PowChallenge.php`, `MockProvider.php`, `UsageCounters.php`, `Pricing.php` | Preuve de travail, fournisseur mock, compteurs, coût |
| Domaine | `api/src/Llm/DemoConfig.php`, `api/src/Auth/RateLimiter.php` | Configuration du service (interrupteur, plafonds, quota), quota horaire par IP à délai progressif (RG5, E5) |

## Jeux de tests

### Tests unitaires

| ID | Cible | Vérifie | Fichier |
|---|---|---|---|
| UC-APP-02-U01 | `estimateRun` | 3 journées : 93 appels, tokens, coût, durée ; modèle inconnu refusé (RG6) | `engine/test/usecases/unit/uc-app-02-lancer-cartographie-standard.test.js` |
| UC-APP-02-U02 | `extractDay` | 7 pôles puis kairos, texte du jour dans chaque prompt, document valide | idem |
| UC-APP-02-U03 | `extractDay` | Un nouvel essai par pôle ; kairos en échec → `null` (RG2) | idem |
| UC-APP-02-U04 | `extractDay` | Pôle en échec deux fois → erreur contextualisée (E4) | idem |
| UC-APP-02-U05 | `createRun` | Checkpoint par journée, journal, fusion des 3 journées (RG4) | idem |
| UC-APP-02-U06 | `createRun` | Journée en échec persistée ; reprise limitée à celle-ci (E4) | idem |
| UC-APP-02-U07 | `createRun` | Moteur seul : interruption coopérative entre journées (A4 ; l'abandon de l'appel en cours est vu par F05/F06) | idem |
| UC-APP-02-U08 | `createIndexedDbStorage` + `createRun` | Base `humanome-runs` relue après rechargement (A5) | idem |
| UC-APP-02-U09 | `mergeDays`, `buildMergeDocument` | 3 journées → merge valide ; 2 journées → pôle vide, invalide (A6, RG7) | idem |
| UC-APP-02-U10 | `createProvider` (direct) | Appel direct, clé en en-tête seulement (A1) | idem |
| UC-APP-02-U11 | `createProvider` (proxy) | Transport proxy générique du moteur (politique par défaut, non utilisée par le Service humanome) : pas de clé, 429 réessayé après `Retry-After`, 413 jamais | idem |
| UC-APP-02-U12 | `computeDayGroups` | Vrai découpage : préambule non daté ignoré, tri ; textes d'une même date concaténés | `web/test/usecases/unit/uc-app-02-lancer-cartographie-standard.test.js` |
| UC-APP-02-U13 | `makeRunId` | Identifiant stable portfolio + version (RG3) | idem |
| UC-APP-02-U14 | `fetchPromptPackages` | Ordre des appels, embarqué en tête sans doublon, défaut marqué | idem |
| UC-APP-02-U15 | `createProviderBundle` | Service humanome (modèle imposé), clé requise sauf Ollama | idem |
| UC-APP-02-U16 | `setLocalKey`, `readLocalKeys` | `humanome-keys` : mémoriser, effacer, JSON corrompu toléré | idem |
| UC-APP-02-U17 | `syncKeyToServer`, `fetchKeyFromServer` | `PUT api/keys`, `GET api/keys/{fournisseur}` ; clé absente = 404 du serveur, message propagé ; garde défensive `{apiKey: ''}` | idem |
| UC-APP-02-U18 | `createDemoProvider`, `pow.js` | Un défi par appel, nonce satisfaisant la difficulté (sha256 recalculé), pot de miel joint (RG5) | idem |
| UC-APP-02-U19 | `describeDemoError` | 429 → minutes, 503 → épuisé, autre → détail | idem |
| UC-APP-02-U20 | `buildEstimate` | Modèle de référence du service, coût inconnu, surcharges | idem |
| UC-APP-02-U21 | `executeRun` + `createIndexedDbStorage` | Checkpoints persistés, reprise sur nouvel onglet, compteurs de session ; merge à résumés locaux (étape 7) | idem |
| UC-APP-02-U22 | `PowChallenge` | Format, TTL 5 min, OK / WEAK / EXPIRED / INVALID | `api/tests/UseCases/Unit/UcApp02LancerCartographieStandardTest.php` |
| UC-APP-02-U23 | `MockProvider` | Prompt de pôle/kairos → JSON de la fixture du jour | idem |
| UC-APP-02-U24 | `UsageCounters`, `Pricing` | Compteurs seuls, disjoncteur tokens/budget, jour UTC | idem |
| UC-APP-02-U25 | `PromptPackageRepository`, `SettingsRepository` | Versions publiées et publiques seulement ; dernière publiée tous paquets confondus ; lecture/écriture du réglage (la décision réglage > plus récente est testée par F14) | idem |
| UC-APP-02-U26 | `createDemoProvider` | Aucune reprise sur quota 429 ni sur 503 : 1 défi, 1 POST (RG5) | `web/test/usecases/unit/uc-app-02-lancer-cartographie-standard.test.js` |
| UC-APP-02-U27 | `createDemoProvider` | Une seule reprise après 2,5 s avec un défi neuf sur 502, erreur réseau, `pow_reused`, `pow_expired` ; pas de seconde reprise (RG5) | idem |

### Tests fonctionnels

| ID | Scénario | Niveau | Vérifie | Fichier |
|---|---|---|---|---|
| UC-APP-02-F01 | Nominal | IHM | `<App/>` : 5 étapes, estimation, 24 POST avec défis distincts, 3 jours + merge privés et tracés | `web/test/usecases/functional/uc-app-02-lancer-cartographie-standard.test.jsx` |
| UC-APP-02-F02 | A1 | IHM | 24 appels directs à Anthropic ; clé vers humanome uniquement par `PUT api/keys` (CSRF, réponse 204) ; `localStorage` | idem |
| UC-APP-02-F03 | A2 | IHM | Bandeau copie statique, version embarquée seule, synchronisation désactivée | idem |
| UC-APP-02-F04 | A3 (anomalie A-01) | IHM | Version publiée tracée ; paquet publié jamais téléchargé, 1er prompt = prompt du moteur embarqué ; défaut serveur ni présélectionné ni signalé | idem |
| UC-APP-02-F05 | A4 | IHM | Interruption en journée 2, reprise : 16 appels, journée 1 sautée | idem |
| UC-APP-02-F06 | A5 | IHM | Démontage (rechargement) : signal de la requête en cours abandonné ; reprise depuis IndexedDB | idem |
| UC-APP-02-F07 | A6 | IHM | 2 journées : documents jour seuls, note de fusion | idem |
| UC-APP-02-F08 | E1 | IHM | Aucun portfolio : lien `#/portfolio`, « Continuer » inactif | idem |
| UC-APP-02-F09 | E2 | IHM | Portfolio sans journée datée signalé, « Continuer » inactif | idem |
| UC-APP-02-F10 | E3 | IHM | Clé vide bloquante ; Ollama sans clé | idem |
| UC-APP-02-F11 | E4 (anomalie A-04) | IHM | Journée en échec listée, rien enregistré ; reprise = 8 appels de cette journée ; **comportement actuel** des indicateurs de progression et de reprise | idem |
| UC-APP-02-F12 | E5 | IHM | Démo désactivée (503) au défi initial : message dédié, aucun POST, « Reprendre le run » | idem |
| UC-APP-02-F13 | E5 (anomalie A-02) | IHM | **Comportement actuel** : 503 en cours de run → détails techniques, 6 appels | idem |
| UC-APP-02-F14 | Nominal (étape 3) | API | Versions publiées, défaut (réglage/plus récente/404), document, lecture publique | `api/tests/UseCases/Functional/UcApp02LancerCartographieStandardTest.php` |
| UC-APP-02-F15 | Nominal (étape 6) | API | Une journée = 8 appels avec défi, JSON pôle/kairos, compteurs sans contenu | idem |
| UC-APP-02-F16 | E5 | API | Preuve absente → 400 ; défi réutilisé → 429 + `Retry-After` | idem |
| UC-APP-02-F17 | E5 | API | Quota IP → 429 ; budget épuisé → 503 ; démo coupée → 503 | idem |
| UC-APP-02-F18 | E5 | API | Journée trop longue → 413, aucun défi ni compteur consommé | idem |
| UC-APP-02-F19 | A5 (anomalie A-03) | IHM | **Comportement actuel** : relance après modification → aucun appel, anciens documents ré-enregistrés en double | `web/test/usecases/functional/uc-app-02-lancer-cartographie-standard.test.jsx` |
| UC-APP-02-F20 | E5 (anomalie A-02) | IHM | **Comportement actuel** : quota 429 sur `POST api/llm` à partir du 9e appel → journée 1 checkpointée, journées 2 et 3 en échec « HTTP 429 », 12 appels | idem |
| UC-APP-02-F21 | A1 | IHM | Clé pré-remplie depuis `localStorage`, « Récupérer la clé depuis le serveur » ; sans synchronisation : aucun `api/keys`, aucune clé dans une requête vers humanome | idem |
| UC-APP-02-F22 | E6 | IHM | `PUT api/keys` → 422 : message du serveur, aucun appel au fournisseur, « Reprendre le run » | idem |
| UC-APP-02-F23 | A2 | IHM | API en erreur 5xx JSON : bandeau « non connecté », version embarquée seule, synchronisation et récupération indisponibles | idem |
| UC-APP-02-F24 | E5 (anomalie A-05) | API | **Comportement actuel** : quota par défaut (20/h) → un run de 3 journées bloqué au 21e appel, `Retry-After` 30/60/120/240 | `api/tests/UseCases/Functional/UcApp02LancerCartographieStandardTest.php` |

### Tests existants liés (non-régression)

- `web/src/components/RunWizard.test.jsx` — étapes, estimation, exécution et reprise (coutures injectées).
- `web/src/lib/run-launcher.test.js` — groupes de journées, estimation, paquets, clés, `executeRun` sur stockage mémoire.
- `web/src/lib/demo-llm.test.js`, `web/src/lib/pow.test.js` — défi, preuve de travail, messages.
- `engine/src/runs/run.test.js`, `journal.test.js`, `storage.test.js` — machine à états, journal, adaptateurs.
- `engine/src/pipeline/extract.test.js`, `merge.test.js`, `merge-document.test.js`, `narrative-prompts.test.js`.
- `engine/src/providers/index.test.js`, `mock.test.js`, `retry.test.js`, `estimate.test.js` ; `engine/src/validation.test.js`.
- `api/tests/LlmProxyTest.php`, `LlmPowTest.php`, `LlmMockProviderTest.php`, `PackagesDefaultTest.php`, `PackagesTest.php`.
- `web/e2e/parcours-apprenant.e2e.js` — étapes « Lancement du run » et « Run complet » (24 appels mock, navigateur réel).

### Exécuter

```sh
docker compose run --rm php vendor/bin/phpunit --filter UcApp02 --testdox
cd web && npx vitest run test/usecases --testNamePattern UC-APP-02
cd engine && npx vitest run test/usecases --testNamePattern UC-APP-02
```

## Anomalies constatées

- **A-01 — Version par défaut du serveur ignorée par l'assistant.**
  `fetchPromptPackages` interroge `GET api/prompt-packages/default` et marque
  la version correspondante (`defaut: true`), mais `RunWizard` ne lit jamais
  ce marqueur : l'embarqué `aurora-v3-reconstruit@1.0.0` reste présélectionné
  et la version validée par l'administrateur n'est ni cochée ni signalée.
  Figé par F04.
- **A-02 — Quota ou épuisement du service en cours de run.** Un `429`/`503`
  de `POST api/llm` n'est pas traduit par `describeDemoError` (réservé aux
  échecs hors journée, comme le défi initial — qui ne peut renvoyer que
  `503`) : chaque journée échoue avec le détail technique (« extractDay :
  pôle 1 (…) — anthropic: HTTP 503 — Démo épuisée… », « … HTTP 429 — Quota
  horaire atteint… »), et le run **continue d'appeler** le proxy pour toutes
  les journées restantes (un essai + un nouvel essai d'`extractDay` par
  journée), alors que `demo-llm.js` désactive volontairement les reprises
  automatiques sur quota. Sur quota, chaque appel refusé allonge encore le
  `Retry-After` (30 s × 2^excès, jusqu'à 1 h). Figé par F13 (503) et F20 (429).
- **A-03 — Checkpoints jamais purgés : relance sans recalcul.** L'identifiant
  de run ne dépend que du portfolio et de la version
  (`portfolioId::paquet@version`), et les checkpoints de `humanome-runs` ne
  sont jamais effacés. Relancer après avoir **modifié le texte** du portfolio
  reprend les anciens checkpoints : aucune journée n'est recalculée, et les
  anciens documents sont ré-enregistrés, **en double**, dans le carto-store.
  Figé par F19.
- **A-04 — Indicateurs de progression faux après une journée en échec.**
  `RunWizard.jsx` calcule le numéro de journée affiché à partir du nombre de
  journées **terminées** (`Math.min(daysDone + 1, …)`, `resumedFrom + 1`) au
  lieu de la position de la journée (`dayInfo.position`, pourtant transmise
  par `executeRun`). Après l'échec de la journée 2, la journée 3 s'affiche
  « Journée 2/3 (2026-01-07) » ; à la reprise (journées 1 et 3 checkpointées),
  l'écran annonce « Repris à la journée 3/3 : les 2 journée(s)… » et
  « Journée 3/3 (2026-01-06) » alors que c'est la journée 2 qui est refaite.
  Figé par F11.
- **A-05 — Quota par défaut incompatible avec un run standard, sans
  avertissement.** Avec la configuration livrée (`perIpPerHour` = 20 dans
  `api/config/demo.php`, 40 dans `api/.env.example`) et 8 `POST /api/llm` par
  journée, le Service humanome ne peut pas mener au bout un run de plus de 2
  journées (5 avec 40/h) dans l'heure : le 21e appel reçoit un `429`, la
  journée échoue et le run continue d'appeler le proxy (A-02), chaque refus
  allongeant le délai. L'assistant n'en tient pas compte (l'estimation
  annonce 93 appels pour 3 journées sans avertissement) ; seul
  `docker-compose.override.yml` relève le quota, en développement. Figé côté
  API par F24.

## Limites

- v1 : la version de prompt choisie est enregistrée mais **non exécutée** ;
  le protocole embarqué (Aurora v3 reconstruit) tourne toujours (annoncé à
  l'étape 3). Les récits narratifs de fusion sont remplacés par des résumés
  locaux, alors que l'estimation compte les 69 appels correspondants
  (« estimation haute », annoncée).
- `GET /api/prompt-packages/{id}/{version}` n'est pas appelé par l'assistant
  (il sert à l'archive, UC-APP-06, et à l'atelier promptologue).
- Le repli « télécharger le résultat (JSON) » de l'assistant ne s'affiche que
  si le module carto-store est absent du bundle : chemin mort dans la version
  livrée, non testé.
- Service humanome : une journée dont le texte dépasse `maxInputChars` moins
  le gabarit du prompt d'extraction (8 300 à 8 600 caractères selon le pôle,
  soit ≈ 11,5 k caractères de texte avec 20 000) échoue en `413` à chaque
  pôle ; l'assistant ne le vérifie pas avant le lancement (le `413` lui-même
  est testé par F18).
