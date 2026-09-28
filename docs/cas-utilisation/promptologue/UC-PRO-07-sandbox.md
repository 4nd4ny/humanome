# UC-PRO-07 — Exécuter le code d'un paquet en sandbox

| Champ | Valeur |
|---|---|
| **Acteur principal** | Promptologue qui exécute, au banc d'essai, un paquet dont l'orchestration est du code (version publiée par autrui, ou son propre brouillon) |
| **Acteurs secondaires** | Auteur du paquet (tiers de confiance nulle) ; fournisseur LLM choisi par l'utilisateur ; navigateur (applique `sandbox`, origine opaque et CSP) |
| **Portée** | humanome.xyz — navigateur : `web/src/lib/sandbox/` (iframe `srcdoc` + Web Worker blob), appelé par le banc d'essai (UC-PRO-05) |
| **Niveau** | Sous-fonction (sécurité) |
| **Cahier des charges** | §3.4 (texte + code JavaScript des prompts), §5 (providers), §6 (le portfolio ne quitte pas le navigateur) ; `docs/securite-prompts.md` ; formation promptologue ch. 6 ; ADR-001 |
| **Statut** | Implémenté (P10.3), CSP de production corrigée (M9) ; isolation prouvée en navigateur réel (e2e) |

## Objectif

Exécuter le module d'orchestration (`code.orchestration`) d'un prompt-package
— du code arbitraire écrit par un tiers — sur une journée de portfolio, sans
qu'il puisse lire la session, les clés API ou le stockage de l'utilisateur, ni
contacter le réseau : son **seul** canal est la demande d'appel LLM, que la
page route vers le fournisseur choisi par l'utilisateur, sous quota et délai,
et son résultat n'est accepté que s'il est valide au schéma.

## Déclencheur

Au banc d'essai, `runVersionOnDays` rencontre un paquet dont l'orchestration
n'est pas déléguée au moteur (ni paquet embarqué, ni marqueur `engine://`,
ni marqueur Twin6) : il appelle `runPackageInSandbox` pour chaque journée.

## Préconditions

- Le paquet est une version publiée (exécutable par autrui) ou un brouillon
  de l'utilisateur (un brouillon ne tourne que chez son auteur, UC-PRO-05 RG1).
- Le paquet porte `code.orchestration` (module ESM) et `code.entrypoint`.
- En production, la CSP du site autorise le script inline figé du `srcdoc`
  par son hash sha256, `script-src blob:` et `worker-src blob:`
  (`web/public/.htaccess`).

## Garanties en cas de succès

- Le banc reçoit un document `cartographie-jour` **validé au schéma** (ou, en
  périmètre restreint, validé par la sonde tolérante) et le nombre d'appels
  LLM consommés.
- L'iframe et le worker sont détruits en fin de run.

## Garanties minimales (en cas d'échec)

- Au-delà de 16 appels LLM ou de 5 minutes, le run est arrêté et l'hôte
  détruit (worker compris).
- Un document d'un autre `kind` ou invalide n'atteint jamais le banc.
- En toutes circonstances, le code du paquet n'a eu ni réseau, ni cookies,
  ni stockage, ni DOM de la page (garanti par le navigateur, prouvé en e2e).

## Scénario nominal

1. Le banc appelle `runPackageInSandbox({pkg, dayText, date, referentiel,
   provider, model, maxTokens, signal, onLlmCall, validateFn?})`. Le pont
   génère la source du worker (`buildWorkerSource`) : code du paquet, point
   d'entrée et table des gabarits (`buildPromptsMap`, par rôle et par
   « rôle/nom ») injectés par `JSON.stringify`, jamais concaténés.
2. Le pont crée l'hôte (`createIframeHost`) : une iframe cachée
   `sandbox="allow-scripts"` **sans** `allow-same-origin` (origine opaque),
   dont le `srcdoc` est une chaîne **figée** (`buildSrcdoc`) portant la CSP
   `default-src 'none'; script-src 'unsafe-inline' blob:; worker-src blob:`.
   Il écoute les messages **de cette iframe seulement** (`event.source`) et
   arme le délai global (5 min).
3. Le script du `srcdoc` annonce `{type:'boot'}` ; le pont répond
   `{type:'init', workerSource}`. L'iframe crée le Web Worker **classique**
   depuis un blob et répond `{type:'ready'}` ; le pont envoie
   `{type:'run', dayText, date, referentiel}`.
4. Le worker importe dynamiquement le module du paquet (blob ESM) et appelle
   son point d'entrée avec `{texteFeuille, dayText, dateFeuille, date,
   referentiel, providers, prompts}`.
5. Chaque `providers.complete(prompt)` du paquet devient `{type:'llm', id,
   prompt}`. Le pont compte l'appel (quota 16), notifie la progression, puis
   appelle **le fournisseur de l'utilisateur** avec **son** modèle et **son**
   budget : `{model, prompt, maxTokens, signal}` — rien d'autre ne vient du
   paquet. La réponse revient en `{type:'llm-ok', id, text}` (ou
   `{type:'llm-error', id, message}`).
6. Le paquet rend son document : `{type:'result', document}`. Le pont vérifie
   le `kind` attendu (`cartographie-jour`), valide au schéma, détruit l'hôte
   et rend `{document, llmCalls, durationMs}` au banc.

## Scénarios alternatifs

- **A1 — A/B moteur vs paquet à code** (déclencheur) : en A/B, une branche peut
  passer par le moteur et l'autre par la sandbox ; le rapport les compare
  comme deux versions quelconques (UC-PRO-05).
- **A2 — Périmètre restreint** (étape 1) : la sandbox reçoit le référentiel
  **filtré** (pôles/compétences retenus) et une validation tolérante
  (`validatePartialJour`) ; le banc marque ensuite le document
  `perimetre.partiel`.
- **A3 — Mon brouillon** (déclencheur) : le brouillon de l'auteur, code
  modifié compris, s'exécute de la même façon, chez lui seulement.
- **A4 — Refus LLM rendu au paquet** (étape 5) : un échec du fournisseur est
  renvoyé en `llm-error` ; le paquet peut l'intercepter (réessayer, dégrader
  son document) et le run continue — l'appel refusé compte dans le quota.

## Scénarios d'erreur

- **E1 — Quota dépassé** (étape 5) : 17ᵉ demande → `llm-error` « quota
  dépassé », run interrompu : « Sandbox : quota d'appels LLM dépassé (16 max
  par run) — exécution interrompue. »
- **E2 — Délai global** (étapes 3-6) : « Sandbox : délai global de 5 min
  dépassé — exécution interrompue (worker détruit). » (le libellé arrondit à
  la minute, 1 min au minimum).
- **E3 — Document invalide** (étape 6) : « Sandbox : document final invalide
  au schéma cartographie-jour (n erreur(s) : …). »
- **E4 — Type inattendu** (étape 6) : « Sandbox : le paquet a produit un
  document de type « X » au lieu de « cartographie-jour ». »
- **E5 — Erreur du paquet** (étapes 4-6) : point d'entrée absent, exception,
  erreur de chargement du worker → « Sandbox : *message* ».
- **E6 — Interruption** (toute étape) : le signal d'annulation du banc détruit
  l'hôte (« Sandbox : exécution annulée. ») ; le banc affiche « Run
  interrompu. ».

## Règles de gestion

- **RG1** — Le code du paquet ne transite **jamais** par le HTML : `srcdoc`
  figé, code transmis par `postMessage` puis `Blob` (pas d'évasion par
  `</script>`) ; le hash du script figé est inscrit dans la CSP de production.
- **RG2** — Ni URL, ni modèle, ni clé ne sont acceptés du code sandboxé : le
  fournisseur, le modèle et le budget sont ceux de l'utilisateur.
- **RG3** — Quota de 16 appels LLM par run (une journée), délai global de
  5 minutes, puis destruction de l'iframe (et du worker).
- **RG4** — Le document final est validé au schéma avant remise ; seuls les
  messages de NOTRE iframe sont écoutés (et, côté iframe, seuls ceux du
  parent) ; les types hors protocole sont ignorés et un prompt non textuel est
  refusé en `llm-error` (compté dans le quota, sans appel au fournisseur).
- **RG5** — Worker **classique** (Chromium refuse un worker `module` créé
  depuis un blob en origine opaque) ; le code du paquet reste un module ESM
  chargé par `import()` dynamique.
- **RG6** — Seules les versions publiées sont exécutables par autrui ; hors
  banc d'essai, aucun code tiers n'est exécuté (le run apprenant utilise le
  moteur embarqué).
- **RG7** — Défense en profondeur : un fournisseur sans `complete()` ou un
  paquet sans code / sans point d'entrée est rejeté **avant** toute création
  d'iframe (les paquets servis par l'API sont de toute façon validés au
  schéma à l'écriture).

## Données et RGPD

| Donnée | Traitement |
|---|---|
| Texte de la journée, référentiel | Transmis au worker par `postMessage` ; le paquet peut les inclure dans ses prompts vers le fournisseur choisi (résidu accepté E4 du modèle de menace, borné par le quota) |
| Cookies, `localStorage` (clés API), IndexedDB | Inaccessibles (origine opaque) |
| Réseau | Coupé par la CSP `default-src 'none'`, héritée par le worker blob |

## Code sollicité

| Couche | Élément | Rôle |
|---|---|---|
| Front | `web/src/lib/sandbox/sandbox.js` — `runPackageInSandbox` | Pont parent : protocole, quota, délai, routage LLM, validation, destruction |
| Front | `web/src/lib/sandbox/sandbox.js` — `createIframeHost` | Iframe `allow-scripts`, filtrage des messages par source |
| Front | `web/src/lib/sandbox/protocol.js` — `buildWorkerSource`, `buildPromptsMap`, `buildSrcdoc`, `SANDBOX_CSP`, `MAX_LLM_CALLS_PER_RUN`, `SANDBOX_TIMEOUT_MS` | Sources et constantes de sécurité |
| Front | `web/src/lib/sandbox/index.js` — `usesEngineOrchestration` | Routage moteur / sandbox |
| Front | `web/src/views/promptologue/bench.js` — `runVersionOnDays`, `validatePartialJour` | Appel par journée, périmètre, marquage partiel |
| Front | `web/src/views/promptologue/BancEssaiSection.jsx` | Affichage « exécution sandbox », erreurs, interruption |
| Moteur | `engine/src/validation.js` — `validateDocument` | Validation au schéma |
| Déploiement | `web/public/.htaccess` (CSP : hash du `srcdoc`, `blob:`) | CSP de production héritée par le `srcdoc` |

## Jeux de tests

### Tests unitaires

| ID | Cible | Vérifie | Fichier |
|---|---|---|---|
| UC-PRO-07-U01 | `runPackageInSandbox` + `buildWorkerSource` (source réelle) | Paquet fixture : 8 demandes routées, document valide, hôte détruit | `web/test/usecases/unit/uc-pro-07-sandbox.test.js` |
| UC-PRO-07-U02 | `runPackageInSandbox` | Modèle/budget du parent, rien d'autre du paquet (RG2) | idem |
| UC-PRO-07-U03 | `runPackageInSandbox` | Quota : 16 appels servis, 17ᵉ refusé, hôte détruit (E1, RG3) | idem |
| UC-PRO-07-U04 | `runPackageInSandbox` | Délai global → destruction (E2) | idem |
| UC-PRO-07-U05 | `runPackageInSandbox` | `llm-error` rendu au paquet, dégradation (A4) | idem |
| UC-PRO-07-U06 | `runPackageInSandbox` | Entrypoint absent, exception (E5) | idem |
| UC-PRO-07-U07 | `runPackageInSandbox` | `kind` inattendu, document invalide (E3, E4, RG4) | idem |
| UC-PRO-07-U08 | `runPackageInSandbox` | Pré-conditions : rejet sans créer d'hôte (RG7) | idem |
| UC-PRO-07-U09 | `buildPromptsMap` | Rôle, « rôle/nom », entrées invalides ignorées | idem |
| UC-PRO-07-U10 | `buildWorkerSource`, `buildSrcdoc` | `JSON.stringify`, CSP, filtre de source, worker classique, code absent du HTML (RG1, RG5) | idem |
| UC-PRO-07-U11 | `createIframeHost` | `allow-scripts` sans `allow-same-origin`, messages filtrés par source, retrait complet (RG4) | idem |

Les tests U01 à U07 exécutent la **vraie** source du worker et le **vrai**
module du paquet grâce à un hôte simulé (`web/test/usecases/support/banc.js`,
`simulatedSandbox`) : import dynamique d'une URL `data:` à la place du blob.
Cet hôte n'isole rien — il prouve le protocole, pas l'isolation.

### Tests fonctionnels

| ID | Scénario | Niveau | Vérifie | Fichier |
|---|---|---|---|---|
| UC-PRO-07-F01 | Nominal | IHM | Banc : paquet publié à code → « exécution sandbox », 8 prompts des gabarits servis par le proxy humanome, document fixture | `web/test/usecases/functional/uc-pro-07-sandbox.test.jsx` |
| UC-PRO-07-F02 | A1 | IHM | A/B moteur vs sandbox : une seule branche en sandbox | idem |
| UC-PRO-07-F03 | A2 | IHM | Référentiel filtré (pôle 2) transmis au worker, 2 appels, document partiel | idem |
| UC-PRO-07-F04 | A3 | IHM | Brouillon au code modifié (sans kairos) : 7 appels | idem |
| UC-PRO-07-F05 | E1 | IHM | Quota : message, 16 appels | idem |
| UC-PRO-07-F06 | E2 | IHM | Délai (couture `timeoutMs`) : message, hôte détruit | idem |
| UC-PRO-07-F07 | E3 | IHM | Document invalide : message, aucun résultat | idem |
| UC-PRO-07-F08 | E4 | IHM | `kind` inattendu : message | idem |
| UC-PRO-07-F09 | E5 | IHM | Entrypoint absent : message, 0 appel | idem |
| UC-PRO-07-F10 | E6 | IHM | Interruption : « Run interrompu. », hôte détruit | idem |
| UC-PRO-07-F11 | Nominal (étape 2), E6 | IHM | Hôte **réel** : iframe `allow-scripts` + `srcdoc` CSP insérée puis retirée | idem |
| UC-PRO-07-F12 | A4 | IHM | 429 sur le 1ᵉʳ appel : le paquet réessaie, run abouti (9 appels), aucune erreur | idem |

Les tests fonctionnels passent par `PromptologueView` (section banc d'essai)
avec la couture `benchDeps.sandboxRunner` : le **vrai** `runPackageInSandbox`
sur l'hôte simulé. F11 garde l'hôte iframe réel : jsdom n'exécutant pas le
`srcdoc`, le run attend jusqu'à l'interruption.

### Tests existants liés (non-régression)

- `web/src/lib/sandbox/sandbox.test.js` — protocole avec un faux hôte (boot/init/run, quota, délai, validation, messages hors protocole et prompts non textuels — RG4).
- `web/src/lib/sandbox/csp-hash.test.js` — hash sha256 du script figé présent dans la CSP de `web/public/.htaccess`, `blob:`.
- `web/src/views/promptologue/bench.test.js` — routage moteur/sandbox, périmètre restreint en sandbox (`validatePartialJour`, marquage partiel).
- `engine/src/validation.test.js` — validation des documents au schéma.
- **`web/e2e/sandbox-isolation.e2e.js`** — **preuve de l'isolation en Chromium réel** : un paquet hostile échoue sur `fetch` (y compris `no-cors`), XHR, WebSocket, EventSource, `import()` distant, `importScripts`, `sendBeacon` ; `localStorage`/`document`/`parent` indisponibles, origine `null` ; sous la CSP de production.
- `web/e2e/parcours-promptologue.e2e.js` — sonde d'évasion exécutée au banc (aucune requête ne sort), boucle infinie terminée par le délai.

### Exécuter

```sh
cd web && npx vitest run test/usecases/unit/uc-pro-07 test/usecases/functional/uc-pro-07
cd web && npx playwright test sandbox-isolation   # isolation réelle (local, Chromium)
```

## Limites

- jsdom n'exécute ni `srcdoc`, ni Worker, ni CSP : l'isolation n'est vérifiable
  qu'en navigateur réel (e2e, local uniquement — pas en CI).
- Résidus acceptés (`docs/securite-prompts.md` §5) : jusqu'à 5 minutes de CPU,
  et le canal LLM lui-même (jusqu'à 16 prompts vers le fournisseur choisi).
- Le quota et le délai s'appliquent **par journée** (un appel
  `runPackageInSandbox` par journée) : un portfolio de N journées peut
  consommer jusqu'à 16 × N appels.
