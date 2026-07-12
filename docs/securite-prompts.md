# Sécurité des prompt-packages — modèle de menace de la sandbox (P10.3)

**Statut :** M7, chantier D. **Code :** `web/src/lib/sandbox/`
(`protocol.js`, `sandbox.js`, `index.js`). **Schéma :**
`schemas/prompt-package.schema.json` (champ `code.orchestration`).

## 1. Le problème

Un prompt-package contient `code.orchestration` : du **code JavaScript
arbitraire écrit par un promptologue**, exécuté **chez les utilisateurs**
(le run de cartographie tourne dans le navigateur, ADR-001). Sans isolation,
ce code lirait le portfolio complet, les cookies de session, les clés API en
localStorage (`humanome-keys`), et pourrait exfiltrer le tout.

Adversaire type : un promptologue malveillant (ou au compte compromis) qui
publie un paquet piégé, ou incite une victime à essayer « sa super version ».

## 2. Architecture d'isolation

```
page humanome (parent)                         confiance : totale
 │  postMessage (source vérifiée)
 ▼
iframe sandbox="allow-scripts"  srcdoc FIGÉ    confiance : nulle
 │  CSP du srcdoc : default-src 'none';
 │                  script-src 'unsafe-inline' blob:; worker-src blob:
 │  (origine OPAQUE : pas de cookies, pas de storage, pas de same-origin)
 ▼
Web Worker (blob, CLASSIQUE)                   confiance : nulle
 └─ import(blob) DYNAMIQUE du module ESM d'orchestration du paquet
    (worker classique à dessein : Chromium refuse un worker
    { type: 'module' } créé depuis un blob en origine opaque — fetch
    de module soumis à CORS, constaté à l'intégration M7 ; l'import()
    dynamique reste permis dans un worker classique)
```

- Le **srcdoc de l'iframe est une chaîne figée** (`buildSrcdoc()`), sans
  aucune interpolation : le code du paquet n'y transite jamais (pas d'évasion
  par `</script>`). Le code voyage par `postMessage` (`{type:'init'}`) et
  n'existe côté sandbox que comme argument de `new Blob()`.
- `sandbox="allow-scripts"` **sans** `allow-same-origin` : origine opaque —
  ni cookies, ni localStorage/IndexedDB, ni DOM du parent (accès cross-origin
  interdits par le navigateur).
- La CSP du document iframe (`default-src 'none'`) coupe **tout réseau** :
  `fetch`, `XHR`, `WebSocket`, `EventSource`, images/balises traçantes,
  `navigator.sendBeacon` — pour l'iframe **et le worker qu'il crée** (le
  worker blob hérite de la politique du créateur).
- L'interface du worker est **exclusivement** `postMessage` :
  - entrée : `{type:'run', dayText, date, referentiel}` ;
  - sorties : `{type:'llm', id, prompt}`, `{type:'result', document}`,
    `{type:'error', message}` ;
  - réponses LLM : `{type:'llm-ok', id, text}` / `{type:'llm-error', id, message}`.

Le **parent** (`runPackageInSandbox`) est le seul pont vers le monde :

1. il route les demandes `llm` vers **l'abstraction providers** choisie par
   l'UTILISATEUR (jamais par le paquet : ni URL, ni modèle, ni clé ne sont
   acceptés du code sandboxé) ;
2. il applique un **quota de 16 appels LLM par run** (`MAX_LLM_CALLS_PER_RUN`)
   puis interrompt le run ;
3. il applique un **timeout global de 5 minutes** (`SANDBOX_TIMEOUT_MS`) puis
   `terminate()` (iframe retiré du DOM : worker détruit avec lui) ;
4. il **valide le document final au schéma** (`validateDocument`) avant de le
   rendre à l'appelant — un `kind` inattendu est refusé ;
5. il filtre les messages entrants par **source** (`event.source` doit être le
   `contentWindow` de NOTRE iframe) et ignore tout type hors protocole.

## 3. Règle de diffusion

- **Seules les versions publiées sont exécutables par autrui.** Une version
  publiée est immuable (semver strictement croissant, changelog) : ce que la
  communauté a relu est ce qui s'exécute.
- **Un brouillon ne tourne que chez son auteur.** Application : le banc
  d'essai ne propose que les brouillons de `GET /api/prompt-packages/drafts`,
  qui ne renvoie que ceux de la session (contrat M7) ; aucun autre chemin du
  front ne charge un brouillon étranger.
- Le run apprenant standard (`RunWizard`) n'exécute en v1 que le paquet par
  défaut délégué au **moteur embarqué** (marqueur `engine://`) : pas de code
  tiers du tout hors banc d'essai.

## 4. Menaces et parades

| # | Menace | Vecteur | Parade |
|---|---|---|---|
| E1 | **Exfiltration** du portfolio / référentiel | `fetch`/XHR/WebSocket/beacon depuis le code | CSP `default-src 'none'` (iframe + worker) — aucun réseau direct |
| E2 | Exfiltration via cookies/session | lecture des cookies, appels API authentifiés | Origine opaque (pas de cookies) + aucun accès à `api/` (CSP) |
| E3 | Exfiltration des clés API | lecture `localStorage['humanome-keys']` | Origine opaque : storage inaccessible ; la clé reste dans le parent, le provider est instancié côté parent |
| E4 | Exfiltration **par le canal LLM** | encoder le texte du jour dans un prompt vers un fournisseur | **Résidu accepté et borné** : le canal LLM est la fonction même du paquet ; le fournisseur est choisi par l'utilisateur, quota 16 appels, et le texte du jour a de toute façon vocation à être envoyé au LLM |
| D1 | **DoS** calcul infini | `while(true)` dans le code | Timeout global 5 min puis `terminate()` — le worker meurt avec l'iframe. Résidu accepté : jusqu'à 5 min de CPU d'un cœur |
| D2 | DoS mémoire | allocations massives | Limites navigateur par onglet ; le timeout borne la durée ; résidu accepté |
| D3 | DoS financier | boucle d'appels LLM | Quota 16 appels/run puis arrêt du run ; côté service humanome s'ajoutent PoW + quotas IP + budget quotidien (P6) |
| P1 | **Escalade** vers le DOM parent | `window.parent.document` | Interdit par le navigateur (origines différentes) ; le worker n'a de toute façon pas de DOM |
| P2 | Escalade par navigation/popup | `top.location`, `window.open` | `sandbox` sans `allow-top-navigation`/`allow-popups` |
| P3 | Injection HTML via srcdoc | `</script>` dans `code.orchestration` | Le code ne transite JAMAIS par le HTML : srcdoc figé, code par postMessage + Blob |
| P4 | Usurpation du protocole | une autre fenêtre poste des messages | Filtrage par `event.source` côté parent ET côté iframe (`event.source !== window.parent` ignoré) |
| P5 | Empoisonnement du résultat | document forgé (`kind` inattendu, structure invalide) | Validation au schéma avant remise ; les visualisations re-valident à l'affichage (P2) et DOMPurify couvre le HTML narratif (ADR-007) |
| P6 | Boucle de messages parasites | spam `{type:'llm'}` sans prompt | Prompt non-chaîne refusé (`llm-error`), quota inchangé ; types inconnus ignorés |
| S1 | **Ingénierie sociale** : brouillon piégé partagé | « teste mon brouillon » | Un brouillon ne quitte pas son auteur (API + front) ; il faut PUBLIER pour être exécuté par autrui, version immuable et attribuée (`auteur`) |
| S2 | Prompt-injection vers le LLM | prompts malveillants dans les gabarits | Hors périmètre sandbox : le résultat reste borné par la validation de schéma + relecture humaine du cartographe (§8 du cahier : jamais de cartographie 100 % automatique) |

## 5. Résidus acceptés (assumés, documentés)

1. **CPU borné** : un paquet peut brûler du CPU pendant 5 minutes max (D1/D2).
2. **Canal LLM** : jusqu'à 16 prompts partent vers le fournisseur choisi par
   l'utilisateur — c'est la fonction du système (E4). Un utilisateur qui teste
   un paquet inconnu avec SA clé accepte d'envoyer le texte de test à son
   fournisseur ; le banc d'essai propose une fixture fictive par défaut.
3. **Canaux auxiliaires théoriques** (timing, consommation) : hors modèle —
   aucune donnée secrète n'est présente dans la sandbox au-delà du texte du
   jour déjà destiné au LLM.
4. `'unsafe-inline'` dans la CSP du **srcdoc** : nécessaire au bootstrap ;
   sans portée sur le site parent (document distinct, origine opaque), et
   `default-src 'none'` neutralise ce que ce script pourrait charger.

## 6. Point d'attention déploiement (CSP de production)

Les documents `srcdoc` **héritent de la CSP de la page qui les embarque**.
La CSP de production du site (script-src strict, M2/P6) doit donc autoriser :

- l'exécution du bootstrap inline du srcdoc — soit par le hash
  `'sha256-…'` du script figé de `buildSrcdoc()` (recommandé : la chaîne est
  stable, générée par le build), soit en scopant la politique de la page ;
- `worker-src blob:` et `script-src blob:` (création du worker et
  `import()` du module blob).

À vérifier en phase e2e/déploiement M7 (le dev Vite n'envoie pas ces
en-têtes ; la sandbox elle-même RESTREINT toujours via sa propre meta CSP).

## 7. Vérification

- **Vitest** (`web/src/lib/sandbox/sandbox.test.js`) : protocole complet avec
  un faux hôte — init/run, routage LLM, quota, timeout, validation de schéma,
  refus des documents inattendus, srcdoc figé portant la CSP exacte,
  échappement du code (jamais dans le HTML).
- **E2E — le VRAI test d'isolation navigateur** (`web/e2e/sandbox-isolation.e2e.js`,
  Chromium/Playwright) : un paquet HOSTILE, exécuté dans le vrai srcdoc figé +
  le vrai worker blob, tente et ÉCHOUE sur chaque évasion — `fetch` (y compris
  `mode:'no-cors'`, POST inclus), `XMLHttpRequest`, `WebSocket`, `EventSource`
  (la connexion, pas seulement le constructeur), `import()` distant,
  `importScripts` distant/`data:`, `sendBeacon` ; `localStorage`/`window`/
  `document`/`parent` valent `undefined` et l'origine est `null` (opaque).
  Le **discriminant décisif** est le `fetch { mode:'no-cors' }` : une origine
  opaque SEULE masque la réponse mais LAISSE PARTIR la requête (exfiltration par
  l'URL/le corps) — son blocage prouve que c'est bien la CSP `default-src 'none'`
  HÉRITÉE PAR LE WORKER BLOB qui coupe le réseau, pas seulement l'opacité. Le
  test vérifie aussi que `importScripts(blob:)` FONCTIONNE : la CSP est précise
  (canal du module autorisé), pas un déni aveugle qui casserait tout au hasard.
  (Le quota d'appels LLM et le timeout `while(true)` sont couverts par la suite
  vitest ci-dessus : ils sont imposés côté parent, hors du navigateur invité.)
- **P12** : re-vérification de la sandbox au durcissement (plan-prompts).
