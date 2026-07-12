# Runner Node — cartographie de masse côté établissement (ADR-005, AD-5)

`scripts/runner-node/runner.mjs` est le runner CLI fourni aux établissements
équipés d'une machine ou d'une infrastructure LLM propre (cahier §3.7, §4.9).
Il consomme **la même file de jobs** que le worker cron OVH, via l'API worker
de la plateforme, mais tourne **chez l'établissement** : pas de limite de durée,
et le LLM peut être local (Ollama, vLLM, passerelle interne compatible OpenAI).

## Cas d'usage

| Situation | Pourquoi le runner |
|---|---|
| Établissement avec LLM local (Ollama, serveur GPU interne) | Les textes de portfolio déposés en cohorte ne partent vers **aucun fournisseur externe** : la plateforme ne sert que la file de jobs, l'inférence reste dans les murs. |
| Gros volumes (centaines/milliers de journées) | Le worker cron OVH est borné par ses ticks (< 50 s à intervalle régulier — ADR-005) ; le runner tourne en continu sur une machine de l'établissement et vide la file bien plus vite. |
| Cohabitation | Runner(s) et worker cron peuvent travailler **en même temps** sur la même file : la réservation avec lease côté serveur garantit qu'un job n'est traité que par un seul exécutant à la fois. |

## Ce que le runner fait — et ne fait pas

- Il exécute **l'extraction LLM d'une journée** (l'unité de job M8 :
  un job = un membre × une journée) avec le moteur `engine/` (`extractDay` :
  7 appels pôle + 1 appel kairos, `kairosOptional` — un échec de la synthèse
  kairos dégrade le document à `kairos: null` au lieu de perdre le job).
- Le **merge** (déterministe, parité oracle) reste au moteur JS côté
  affichage : navigateur de l'établissement ou runner Node de visualisation.
  Le runner ne produit que des documents `cartographie-jour`.
- Il est **sans état** : aucun fichier local, aucune reprise propre. Un job
  interrompu (coupure, Ctrl-C ×2, crash) est rendu à la file par l'expiration
  du **lease serveur (5 min)** et re-servi au prochain exécutant.
- Le **budget** est appliqué côté serveur : chaque résultat posté incrémente le
  compteur `spent_usd` de l'établissement ; au plafond (`budgetCapUsd`), le
  serveur cesse de servir des jobs (statut `budget_exceeded`, réactivable en
  montant le plafond). Le runner n'a pas de logique budgétaire propre — il
  déclare fidèlement `tokens` et `coutUsd` (table de prix du moteur,
  `getModelPricing` ; modèle local inconnu de la table → coût 0).

## Prérequis

- Node.js ≥ 20 (fetch natif) ;
- le dépôt cloné (le runner importe le moteur par chemin relatif
  `../../engine/src/index.js`) — **aucune installation npm n'est nécessaire**
  pour exécuter le runner ;
- un `worker_token` généré dans la configuration établissement de la
  plateforme ;
- un LLM accessible : Ollama local, endpoint compatible OpenAI, ou une clé
  API propre à l'établissement.

## Usage

```
node scripts/runner-node/runner.mjs --api <url> --token <worker_token> [options]

--api <url>        URL de la plateforme (ex. https://humanome.xyz)
--token <token>    jeton worker de l'établissement (ou variable HUMANOME_WORKER_TOKEN)
--provider <nom>   force le fournisseur : anthropic | openai | google | xai | openrouter | ollama
--endpoint <url>   URL de base du fournisseur (ex. http://localhost:11434 pour Ollama)
--model <id>       modèle à utiliser (sinon celui porté par le job)
--api-key <clé>    clé API du fournisseur (sinon LLM_API_KEY ou la variable dédiée)
--max-tokens <n>   budget de sortie par appel LLM (défaut : 8192, valeur fiabilisée en prod M5)
--limit <n>        jobs réservés par requête (défaut : 5)
--once             une passe : vide la file puis s'arrête (défaut)
--loop [s]         boucle : re-consulte la file toutes les <s> secondes (défaut : 30)
```

### Exemples

Ollama local (aucune clé API — l'inférence ne quitte pas la machine) :

```bash
export HUMANOME_WORKER_TOKEN='<jeton généré dans la config établissement>'
node scripts/runner-node/runner.mjs --api https://humanome.xyz \
  --provider ollama --endpoint http://localhost:11434 --model qwen3:32b --loop 30
```

Endpoint compatible OpenAI (vLLM, LM Studio, passerelle interne) — l'adaptateur
appelle `<endpoint>/v1/chat/completions`, donnez donc la base **sans** `/v1` :

```bash
LLM_API_KEY=local node scripts/runner-node/runner.mjs --api https://humanome.xyz \
  --token "$HUMANOME_WORKER_TOKEN" \
  --provider openai --endpoint http://gpu.interne:8000 --model mistral-large --loop
```

(Pour un endpoint local sans authentification, toute valeur de clé convient.)

Clé API propre à l'établissement, une seule passe qui vide la file :

```bash
ANTHROPIC_API_KEY=sk-... node scripts/runner-node/runner.mjs --api https://humanome.xyz \
  --token "$HUMANOME_WORKER_TOKEN" --provider anthropic --model claude-sonnet-5-20260115 --once
```

### Paralléliser

Une instance traite les jobs **séquentiellement** (un appel LLM à la fois),
ce qui convient à un LLM local. Pour paralléliser, lancez plusieurs instances
(sur une ou plusieurs machines) avec le même jeton : la réservation avec lease
côté serveur évite tout doublon.

## Contrat d'API consommé (M8)

Le runner ne parle qu'à deux routes, authentifiées par l'en-tête
`X-Worker-Token` (jamais dans l'URL) :

### `GET /api/worker/jobs?limit=n`

Réserve jusqu'à `n` jobs (le serveur les passe en `running` avec un lease de
5 min). Réponse attendue :

```jsonc
{
  "jobs": [
    {
      "id": 123,
      "runId": 45,
      "date": "2026-01-05",          // journée du portfolio (AAAA-MM-JJ)
      "dayText": "…texte de la journée déposée en cohorte…",
      "referentielVersion": { "id": "respire", "version": "7.0.0" }, // version FIGÉE du run
      "referentiel": { "poles": [], "competences": [] }, // seulement si ≠ du partagé ci-dessous
      "model": "claude-sonnet-5",     // optionnel
      "maxTokens": 8192,               // optionnel
      "temperature": 0.2,              // optionnel
      "provider": {                    // config LLM de l'établissement (JAMAIS sa clé)
        "provider": "endpoint",       // 'humanome' | 'endpoint' | nom direct
        "endpointUrl": "http://gpu.interne:8000",
        "model": "mistral-large"
      }
    }
  ],
  "referentiel": { "poles": [], "competences": [] } // document COMPLET partagé pour le lot
}
```

Le document référentiel complet (pôles + compétences de la version figée au
lancement du run) est partagé au niveau réponse ; un job figé sur une AUTRE
version porte le sien. Le runner utilise le document du job s'il est
exploitable (`poles`/`competences`), sinon celui du lot.

`401`/`403` → jeton refusé : le runner s'arrête immédiatement (code 3) avec un
message actionnable. File vide (`jobs: []`) → fin de passe (`--once`) ou pause
(`--loop`).

### `POST /api/worker/jobs/{id}/result`

Succès :

```json
{ "document": { "kind": "cartographie-jour", "...": "..." },
  "tokens": { "inputTokens": 41200, "outputTokens": 7900 },
  "coutUsd": 0.24, "model": "claude-sonnet-5", "durationMs": 93000 }
```

Échec (l'erreur alimente le tableau de suivi du run ; les tokens déjà
consommés par l'échec comptent aussi dans le budget) :

```json
{ "erreur": "extractDay : pôle 3 (2026-01-05) — réponse tronquée…",
  "tokens": { "inputTokens": 5200, "outputTokens": 1100 },
  "coutUsd": 0.03, "model": "claude-sonnet-5", "durationMs": 41000 }
```

Un envoi raté (réseau, 5xx, 429) est retenté 3 fois ; au-delà, le job sera
recalculé après expiration du lease (idempotence côté serveur : le dernier
résultat posté pour un job gagne).

### Choix du fournisseur LLM

Priorité de résolution, à chaque job :

1. **Options CLI** `--provider` / `--endpoint` / `--model` (priment toujours) ;
2. **Config portée par le job** : `provider: "endpoint"` → adaptateur
   OpenAI-compatible sur `endpointUrl` ; un nom direct (`anthropic`,
   `ollama`, …) → adaptateur correspondant ;
3. `provider: "humanome"` (clé plateforme) : **inexécutable par le runner** —
   la clé de la plateforme ne quitte jamais le serveur. Ces jobs sont réservés
   au worker cron ; le runner s'arrête avec un message clair (code 4) et ne
   poste rien : le lease rend les jobs à la file. Pour les traiter localement,
   relancez avec `--provider/--endpoint/--model`.

Clés API : `--api-key`, sinon `LLM_API_KEY`, sinon la variable dédiée au
fournisseur (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_API_KEY`,
`XAI_API_KEY`, `OPENROUTER_API_KEY`). Ollama n'exige pas de clé.

### Prompt-package

Le runner exécute les gabarits d'extraction **du moteur** (`engine/`), dont le
paquet par défaut `aurora-v3-reconstruit@1.0.0` est généré à l'octet près :
pour les runs sur le paquet par défaut, worker cron (substitution des gabarits
en base) et runner produisent les mêmes prompts. Limite v1 assumée : pour un
prompt-package **personnalisé**, les prompts du runner peuvent différer de ceux
du paquet — réservez ces runs au worker cron, ou acceptez la divergence
(le run trace de toute façon `promptPackageId`/`promptPackageVersion`).

## Sécurité du `worker_token`

Le jeton worker donne accès **en lecture aux textes de portfolio** des membres
consentants (charge utile des jobs) et **en écriture aux résultats** : c'est un
secret d'établissement, à traiter comme une clé API.

- Préférez la variable d'environnement `HUMANOME_WORKER_TOKEN` à `--token`
  (un argument CLI apparaît dans `ps` et l'historique du shell).
- Le runner l'envoie exclusivement dans l'en-tête `X-Worker-Token`, jamais
  dans une URL (pas de fuite dans les journaux d'accès ni les proxys).
- Utilisez toujours l'API en HTTPS (`https://humanome.xyz`).
- En cas de fuite : régénérez le jeton dans la configuration établissement
  (l'ancien est invalidé immédiatement) et auditez le tableau de suivi des runs.
- Exécutez le runner sur une machine de confiance de l'établissement : les
  textes de journée transitent en mémoire (jamais écrits sur disque par le
  runner).

## RGPD — journaux

Le journal local (stderr) ne contient **que** des compteurs, identifiants,
durées et coûts — jamais le texte des portfolios, et les extraits de réponse
LLM cités dans les messages d'erreur du moteur sont masqués
(`« extrait masqué (RGPD) »`). Le message d'erreur complet accompagne en
revanche le résultat posté au serveur : il alimente le rapport de run visible
par l'établissement, périmètre couvert par le consentement explicite de
cohorte (« l'établissement verra les cartographies produites dans ce cadre »).

## Arrêt et codes de sortie

- `Ctrl-C` (1×) : arrêt coopératif — le job en cours est terminé et son
  résultat posté, puis le runner s'arrête ;
- `Ctrl-C` (2×) : interruption immédiate — les appels en cours sont coupés,
  le lease serveur rendra les jobs à la file.

| Code | Signification |
|---|---|
| 0 | passe/boucle terminée (les échecs de jobs individuels sont postés au serveur, pas fatals) |
| 1 | erreur d'exécution (API injoignable en `--once`, etc.) |
| 2 | arguments CLI invalides (l'aide est affichée) |
| 3 | jeton worker refusé (401/403) |
| 4 | configuration fournisseur impossible (job `humanome` sans `--provider`, clé absente…) |

En mode `--loop`, les erreurs API **transitoires** (réseau, 5xx) sont
journalisées et réessayées à la passe suivante ; seuls le jeton refusé et les
erreurs de configuration arrêtent la boucle.

## Tests

```bash
cd scripts/runner-node && npm test   # vitest, réutilisé depuis engine/node_modules
```

La suite mocke l'API worker (fetch injectable) et le provider LLM (fixtures
réelles `schemas/fixtures/cartographie-jour-*.json`) : réservation → extraction
par le moteur → dépôt du résultat ; erreur LLM → job posté en erreur avec les
tokens consommés ; jeton refusé → sortie claire ; provenance du fournisseur ;
absence de contenu dans les journaux (RGPD).
