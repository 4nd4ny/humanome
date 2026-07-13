# Spec de portage JS — `aurora/backends.py` (Twin_v9)

Source : `Twin_v9/aurora/backends.py` (675 lignes, couverture intégrale).
Objectif : reproduction **bit-à-bit** du comportement, en particulier du `MockBackend`
qui sert d'oracle de parité (mode `--salt`).

---

## 1. Rôle du module

Fournit des backends LLM interchangeables derrière une interface unique
`backend.call(prompt, …) → str` :

| kind | classe | usage |
|---|---|---|
| `mock` | `MockBackend` | générateur déterministe hors-ligne (tests, dry-run, CI, oracle de parité) |
| `claude-cli` | `ClaudeCLIBackend` | sous-processus `claude -p` |
| `anthropic` | `AnthropicBackend` | API Anthropic `/v1/messages` |
| `openai` | `OpenAICompatBackend` | toute API compatible `/chat/completions` |
| `ollama` | `OllamaBackend` | API native Ollama `/api/chat` |

Constantes module : `DEFAULT_TIMEOUT = 600` (secondes), `RETRIES = 2`.

Dépendances internes : `aurora.util` → `log(msg)`, `log_warn(msg)`, `stable_hash(s)`.

### `stable_hash(s)` (défini dans `util.py`, indispensable ici)

```python
int(hashlib.md5(s.encode("utf-8")).hexdigest()[:12], 16)
```

- MD5 de la chaîne encodée **UTF-8**, hexdigest **minuscule**, on garde les
  **12 premiers caractères hex**, parsés en entier → valeur dans `[0, 2^48)`.
- En JS : nécessite une implémentation MD5 ; 48 bits tiennent exactement dans un
  `Number` (`parseInt(hex.slice(0,12), 16)` est sûr).

---

## 2. Structures de données

### 2.1 `CallRecord`

Champs : `label`, `model`, `seconds`, `prompt_chars`, `response_chars`, `ok`.

`as_dict()` retourne **exactement** (ordre des clés inclus) :

```json
{"label": …, "model": …, "seconds": round(seconds, 2),
 "prompt_chars": …, "response_chars": …,
 "tokens_estimes": int((prompt_chars + response_chars) / 4), "ok": true|false}
```

**Formule `tokens_estimes`** : division flottante `(p + r) / 4` puis troncature
vers zéro (`int()`). p et r étant ≥ 0, équivaut à `Math.floor((p + r) / 4)`.
`prompt_chars` / `response_chars` = `len()` Python de la chaîne, c.-à-d. le
**nombre de code points Unicode** — en JS utiliser `[...s].length` (ou compter
les code points), PAS `s.length` (unités UTF-16) si des caractères astraux
peuvent apparaître (emoji). Pour du texte FR courant les deux coïncident, mais
le contrat est « code points ».

### 2.2 Classe `Backend` (abstraite)

- `constructor(spec)` : `this.spec = spec || {}` ; `this.records = []`.
- `kind = "abstract"`.

#### `call(prompt, {model, temperature, seed, task, meta, label})`

Algorithme exact :

1. `t0 = now()`.
2. Boucle `attempt = 0 … RETRIES` (soit **3 tentatives**) :
   - essaie `this._call(prompt, {model, temperature, seed, task, meta})` ;
   - **succès** → push d'un `CallRecord(label || task || "call",
     model || spec.model || "?", now()-t0, len(prompt), len(out || ""), true)`
     puis `return out`. Attention : `label or task or "call"` en Python traite la
     chaîne vide comme absente → en JS utiliser `label || task || "call"` (pas `??`).
   - **échec** → `log_warn("Backend %s : tentative %d échouée (%s)" % (kind, attempt+1, err))`
     puis pause **synchrone** de `2 * (attempt + 1)` secondes (2 s, 4 s, 6 s — la
     3e pause a lieu même après la dernière tentative, avant la sortie de boucle).
3. Après épuisement : push `CallRecord(…, response_chars=0, ok=false)` puis
   lève `RuntimeError("Backend %s : échec après %d tentatives : %s" % (kind, 3, dernière_erreur))`.

Le temps `seconds` d'un record couvre **toutes** les tentatives (t0 pris avant la boucle).

`task`/`meta` ne servent qu'au mock ; les backends réels les ignorent.

---

## 3. Backends réels

Parité fonctionnelle requise (formats de requête), pas bit-à-bit (réseau).

### 3.1 `ClaudeCLIBackend` (`kind = "claude-cli"`)

- Commande : `[spec.cmd || "claude", "-p", "--output-format", "json"]`
  + `["--model", m]` si `m = model || spec.model` est défini.
- Prompt passé sur **stdin** encodé UTF-8 ; timeout `spec.timeout || 600` s.
- `returncode != 0` → erreur `"claude CLI exit=%d : %s"` avec les 400 premiers
  caractères de stderr (décodé UTF-8 avec remplacement).
- stdout parsé en JSON :
  - si objet : `is_error` truthy → erreur `"claude CLI is_error : %s"`
    (str du champ `result`, tronqué à 400) ; sinon retourne `data.result ?? ""`.
  - si non-objet (ex. tableau) : retourne le **stdout brut décodé**.
  - JSON invalide → exception → retry.

### 3.2 `AnthropicBackend` (`kind = "anthropic"`)

- Clé : `process.env[spec.env_key || "ANTHROPIC_API_KEY"]` ; vide/absente →
  erreur `"ANTHROPIC_API_KEY manquante"` (déclenche les retries !).
- POST `(spec.base_url || "https://api.anthropic.com") + "/v1/messages"`.
- Corps : `{model: model || spec.model || "claude-sonnet-4-5",
  max_tokens: spec.max_tokens || 16000,
  messages: [{role: "user", content: prompt}]}` ;
  `temperature` ajouté **seulement si non null/undefined** (0 est envoyé : test
  `is not None`, pas truthiness). Pas de `seed`.
- Headers : `content-type: application/json`, `x-api-key`, `anthropic-version: 2023-06-01`.
- Réponse : concaténation de `b.text || ""` pour chaque bloc de `data.content || []`.

### 3.3 `OpenAICompatBackend` (`kind = "openai"`)

- `base = (spec.base_url || "https://api.openai.com/v1")` avec **suppression des
  `/` finaux** (`rstrip("/")` retire tous les slashs de fin, pas un seul).
- Clé : `env[spec.env_key || "OPENAI_API_KEY"]` — **peut être vide** : le header
  `authorization: Bearer <clé>` n'est ajouté que si la clé est non vide
  (cas Ollama /v1 sans clé).
- Corps : `{model: model || spec.model || "gpt-4o", messages: [{role:"user", content: prompt}]}` ;
  `temperature` si non null ; `seed` si non null **et** `spec.supports_seed !== false`
  (défaut true).
- POST `base + "/chat/completions"` ; retourne `data.choices[0].message.content || ""`
  (le `or ""` couvre `content: null`).

### 3.4 `OllamaBackend` (`kind = "ollama"`)

- `base = (spec.base_url || "http://localhost:11434")` rstrip `/`.
- `options` : `temperature` si non null, `seed` si non null,
  `num_ctx: spec.num_ctx` si truthy.
- Corps : `{model: model || spec.model || "qwen2.5:14b",
  messages: [{role:"user", content: prompt}], stream: false, options}`.
- POST `base + "/api/chat"` ; retourne `data.message?.content ?? ""`.

---

## 4. `MockBackend` — ORACLE DE PARITÉ (bit-à-bit obligatoire)

### 4.0 Principes fondamentaux

1. **Le mock ne lit JAMAIS le contenu du prompt.** `prompt` ne sert qu'à
   `len(prompt)` dans le `CallRecord`. Toute la sortie dépend **exclusivement**
   de : `task`, `meta`, `model` (ou `spec.model`, défaut `"mock-llm"`) et
   `spec.salt`. → Le port JS DOIT garder cette propriété : dépendre des
   métadonnées uniquement, jamais du texte du prompt.
2. Le dispatch se fait sur **`task`** (chaîne exacte), pas sur `label` (le label
   sert seulement au `CallRecord`). Les étiquettes d'appel du pipeline
   (`tag_…`, `lecteur_…`, `greffier_…`, `leger_…`, `contre-lecture_…`,
   `accusation_…`, `defense_…`, `replique_…`, `briefing_…`, `jure_…`,
   `relance_…`, `gardien_…`, `president_…`, `condense_…`, `arpenteur_…`,
   `retour_…`, `merge_…`) sont des labels ; les tasks correspondantes sont
   listées en 4.3.
3. `meta = meta || {}` ; `model = model || spec.model || "mock-llm"`.
4. Toute task inconnue → retourne la chaîne littérale `"OK (mock)"`.

### 4.1 Générateurs déterministes

#### `_rng(...keys)`

```python
salt = str(self.spec.get("salt", ""))
return random.Random(stable_hash(salt + "|" + "|".join(str(k) for k in keys)))
```

- `salt` : `str()` de `spec.salt` (défaut `""` → chaîne de graine commençant par `"|"`).
  Si `salt` est un entier dans la spec, `str(7)` → `"7"`. **Attention JS** :
  `String(7)` = `"7"` ✔, mais `str(True)` Python = `"True"` ≠ `String(true)` = `"true"` —
  n'utiliser que des salts chaîne/entier.
- Chaque clé passe par `str()` : entiers → décimal (`str(1)` = `"1"`),
  chaînes inchangées.
- Graine : `stable_hash(chaîne)` → entier 48 bits.
- **`random.Random(graine)` = Mersenne Twister MT19937 avec le seeding CPython** :
  la graine entière `n` (ici < 2^48, positive) est décomposée en mots de 32 bits
  **poids faible d'abord** (`key = [n & 0xffffffff, n >>> 32]` ; si `n < 2^32`,
  `key = [n]`), puis `init_by_array(key)` (init préalable `init_genrand(19650218)`).
  `rng.random()` = `genrand_res53` : `a = mt_next() >> 5`, `b = mt_next() >> 6`,
  résultat `(a * 67108864.0 + b) / 9007199254740992.0` (double 53 bits).
  Le port JS doit embarquer un MT19937 conforme (seeding init_by_array inclus) —
  c'est LE point de parité le plus lourd. Note : CPython découpe en mots la
  valeur absolue et pour `n` multiple exact de 2^32 le mot de poids fort est
  quand même émis ; avec `n < 2^48` la règle simple ci-dessus suffit, à un cas
  près : si `n == 0`, `key = [0]`.
- **L'ordre des appels `rng.random()` fait partie du contrat** (détaillé par task).

#### `_scenario(code)`

```python
stable_hash("scn|" + code) % 10
```

Table des scénarios (docstring de la classe) :

| h | scénario |
|---|---|
| 0–3 | court-circuit (aucune pièce) → concordance-absence |
| 4–5 | pièces disqualifiées, confiance basse → concordance-absence |
| 6–7 | présence stable (confiance ~0.85+) → disculpé-présence |
| 8 | DIVERGENT entre les passes → escalade tribunal |
| 9 | ambigu (confiance médiane) → escalade tribunal |

### 4.2 Formats de sortie communs

- Les sorties « JSON » sont : `"```json\n" + json.dumps(obj, ensure_ascii=False) + "\n```"`.
- **`json.dumps` Python ≠ `JSON.stringify` JS** :
  - séparateurs par défaut Python : `", "` (virgule + espace) et `": "`
    (deux-points + espace). `JSON.stringify` n'insère pas d'espaces → le port
    doit sérialiser avec ces séparateurs pour la parité bit-à-bit ;
  - ordre des clés = ordre d'insertion (reproduire l'ordre littéral des objets,
    documenté par les extraits ci-dessous) ;
  - `ensure_ascii=False` : caractères non-ASCII émis tels quels (comme JS) ;
  - flottants : `repr` le plus court (identique à JS) **sauf les flottants
    entiers** : Python émet `1.0`, JS `1`. Cas concret : `"confiance": 1.0`
    du court-circuit de `_leger` → doit s'écrire `1.0` ;
  - `None` → `null`, `True`/`False` → `true`/`false`.
- `round(x, n)` Python : arrondi **correct** au plus proche sur la valeur
  binaire exacte, égalité → pair (half-even). Pour les valeurs produites ici
  (bases + bruit MT), les égalités exactes sont improbables mais l'arrondi doit
  être « correctly rounded » (pas `Math.round(x*1000)/1000`, qui diffère sur
  certains doubles). Implémentation JS sûre : passer par la représentation
  décimale exacte du double (ex. `toFixed` a la bonne sémantique d'arrondi au
  plus proche sur la valeur exacte ; en cas d'égalité stricte `toFixed` arrondit
  vers le haut là où Python prend le pair — cas à documenter/tester, quasi
  inatteignable ici). Le résultat de `round` reste un **nombre** ensuite
  sérialisé au plus court (`0.86`, `0.153`, …).
- `"%.2f" % x`, `"%.3f"` : format fixe, arrondi correct ; `%d` : entier décimal ;
  `%s` : `str()` Python.

### 4.3 Dispatch de `_call` (ordre des tests, chaînes exactes de `task`)

```
"leger_scan"            → _leger(meta, model)
"kairos"                → _kairos(meta)
"tagger"                → _tagger(meta, model)
"premiere_impression"   → inline (voir 4.4)
"greffier"|"accusation"|"defense"|"replique"|"briefing" → _tribunal_texte(task, meta)
"jure"                  → _jure_v9(meta, tour=1)
"jure2"                 → _jure_v9(meta, tour=2)
"relance"               → _relance(meta)
"gardien_support"       → _gardien_support(meta)
"gardien_raisonnement"  → _gardien_raisonnement(meta)
"leger"                 → _leger_v9(meta)
"contre_lecture"        → _contre_lecture_v9(meta)
"president"             → _president(meta)
"condense"              → inline (4.5)
"arpenteur"             → inline (4.6)
"retour_sources"        → inline (4.7)
"merge_kairos"          → inline (4.8)
"merge_rapporteur"      → inline (4.9)
"merge_pole"            → inline (4.10)
"merge_competence"      → inline (4.10)
défaut                  → "OK (mock)"
```

NB : `"leger_scan"` (cartographie de pôle v8) et `"leger"` (juge léger v9) sont
deux tasks distinctes.

### 4.4 `premiere_impression`

- `jid = str(meta.journee ?? "?")` (str Python : entier → décimal).
- `ind = ["habitée", "habitée", "mixte", "produite"][stable_hash("imp|" + jid) % 4]`.
- Sortie (gabarit exact, `%s` = jid puis ind) :

```
# Lecteur — Première impression — {jid}

## Voix
Registre narratif, doute utilisé comme moteur (mock).

## Texture
Détails situés et datés, quelques passages génériques (mock).

## Authenticité
**Indicateur** : `{ind}`
**Justification** : marqueurs concrets datés observés (mock).

## Question spontanée
Qu'est-ce qui t'a surpris ce jour-là ? (mock)
```

### 4.5 `condense`

- `jid = str(meta.journee ?? "?")` ; `sents = meta.sentences ?? []`
  (liste de paires `[feuille_id, phrase]`).
- `peps = []` ; si `sents` non vide :
  `k = stable_hash("pep|" + jid) % len(sents)` ; `peps = [sents[k][1]]` ;
  si `len(sents) > 1` : ajoute `sents[(k + 3) % len(sents)][1]`.
- Objet (ordre des clés) :

```json
{"condense_fidele": {"resume": "Journée {jid} : travail décrit et daté, avec un passage réflexif (mock).",
 "pepites": peps,
 "forme": "Récit daté, longueur ordinaire, ton posé (mock).",
 "singularites": "Un détail concret revient en fin de journée (mock)."}}
```

Rendu en bloc ```` ```json ```` (cf. 4.2).

### 4.6 `arpenteur`

Entrées : `meta.jours` = liste `[id, date]` ; `meta.codes` = liste de codes
(chaînes) ; `meta.pepites` = objet `{journee_id: [phrases…]}`.

- `ids = jours.map(j => j[0])` ; `cite2 = ids.slice(0, 2)` (ou `ids` entier si < 2).
- `indices = cite2.filter(j => pepites[j] est truthy et non vide).map(j => pepites[j][0])`
  (équivalent de `if peps.get(j)` : liste vide → exclue).
- Objet `{"arpentage": {…}}` avec, dans l'ordre :
  - `observationsHorsReferentiel` : 1 élément, clés dans l'ordre
    `titre, description, journeesCitees, indices, pourquoiHorsReferentiel,
    hypotheseFalsifiable, testEntretien, codesLesPlusProches` ; textes mock
    littéraux (voir source lignes 245–253) ; `indices` = `indices` calculés ou
    `["passage daté récurrent (mock)"]` si vide ; `codesLesPlusProches = codes.slice(0,1)`.
  - `continuites` : si `ids.length >= 2`, 1 élément (`titre, description,
    journeesCitees, indices, codesRelies`) avec `codesRelies = codes.slice(1,2)`
    et fallback indices `["reprise du même chantier (mock)"]` ; sinon `[]`.
  - `grainesReferentiel` : si `ids` non vide, 1 élément (`code, journeesCitees,
    indices, pourquoiInvisibleAuJour`) avec
    `code = codes[2] si len(codes) > 2, sinon codes[0] si codes non vide, sinon "1.01"`
    et fallback indices `["trace répétée (mock)"]` ; sinon `[]`.

### 4.7 `retour_sources`

Entrées : `meta.sentences` = liste `[journee_id, phrase]` ; `meta.jours` = liste d'ids ;
`meta.titre`.

- `extraits = []` ; si `sents` non vide :
  - `k = stable_hash("ret|" + str(meta.get("titre"))) % len(sents)` —
    **piège** : `titre` absent → `str(None)` = `"None"` (chaîne à hasher
    littéralement `"ret|None"` en JS aussi) ;
  - pour `kk` dans `(k, (k + 5) % len(sents))` : `e = {"journee": f, "verbatim": s}` ;
    ajouté seulement si pas déjà présent (**égalité structurelle** — dédoublonne
    quand `len(sents) ≤ 5` fait retomber sur la même paire) ;
  - puis ajout d'un verbatim **halluciné exprès** (doit être rejeté à
    l'ancrage — il mesure le taux d'hallucination du scan) :
    `{"journee": jids[0] ?? "?", "verbatim": "Phrase inventée absente du journal (mock halluciné)."}`.
- Objet :

```json
{"retour_aux_sources": {"issue": "retrouvée"|"non retrouvée",
 "extraits": extraits, "commentaire": "Vérification mock sur le texte brut fourni."}}
```

`issue` = `"retrouvée"` ssi `sents` non vide. Si `sents` vide : `extraits = []`
(pas d'hallucination).

### 4.8 `merge_kairos`

Sortie 100 % constante : bloc JSON avec `kairos.apprenant` (`portrait,
formeProfil, ceQuiRelieLesPoles, ceQuiEmergeEntreLesLignes,
invitationsPourLaSuite, syntheseCompleteMarkdown`) et `emergencesCrossPoles`
(`competencesOrphelines` [1 élément], `connexionsTransversales` [1 élément],
`noeudsConceptuels` [], `patternTemporel` {type: "escalier", evidence},
`coherenceImpressionsVerdicts` {convergences, divergences: ""}).
Recopier les littéraux des lignes 288–321 du source à l'identique, y compris le
markdown multi-sections de `syntheseCompleteMarkdown` (construit avec `\n\n`).

### 4.9 `merge_rapporteur`

Sortie 100 % constante (lignes 323–339) : `{"rapport": {…}}` avec les clés dans
l'ordre `journal_id ("mock"), date ("2026-01-01"), portrait, forme_profil,
territoires_denses [1 élément: competence_nom, description, extrait_portfolio],
non_trouve, emergences, pistes [1], pour_cartographe {renvois [1: competence_code
"1.05", question_entretien], alertes_gardien [], incoherences null,
vigilance_gaming null, profil_ipsatif_complet}, rapport_complet_markdown`.
Recopier les littéraux à l'identique.

### 4.10 `merge_pole` / `merge_competence`

- `merge_pole` :
  `"## Évolution du pôle %s\n\nSur la période, ce pôle montre une progression d'abord exploratoire puis consolidée (mock)."`
  avec `%s = meta.pole ?? "?"` (via `%s` : entier → décimal).
- `merge_competence` : chaîne constante
  `"Attestée d'abord de façon isolée, cette compétence s'est précisée au fil des journées : les traces passent de la déclaration à l'acte situé, et la confiance du collège s'est consolidée (mock)."`

### 4.11 `_leger` (task `leger_scan`) — cartographie de pôle v8

Entrées : `meta.pole` (défaut 1), `meta.run` (défaut 1, entier),
`meta.codes` = liste `[code, nom]`, `meta.sentences` = liste `[feuille_id, phrase]`.

Algorithme, **dans l'ordre de la liste `codes`** (le compteur `pid` traverse
toute la boucle) :

1. `h = _scenario(code)` ; `rng = _rng("leger", code, run, model)` — clés
   `str()` : `"leger|<code>|<run>|<model>"` préfixées du salt.
2. `noise = (rng.random() - 0.5) * 0.06` — **1er et unique tirage** du rng,
   effectué AVANT le test de court-circuit (le rng est créé et consommé même
   pour les codes court-circuités : sans incidence, mais l'implémentation peut
   l'omettre car le rng est local au code).
3. **Si `h <= 3` OU `sents` vide** → compétence court-circuitée :

```json
{"code": code, "courtCircuit": true, "pieces": [], "pedagogue": null,
 "tracesRetenues": [],
 "verdict": {"statut": "présence non établie", "nombrePreuves": 0,
  "nombreIndices": 0, "confiance": 1.0,
  "raison": "aucune pièce extraite par le Greffier",
  "prescriptionMinimale": "Documenter une situation concrète illustrant {nom}."}}
```

   (⚠ `confiance: 1.0` — sérialiser `1.0`, pas `1`.) Puis `continue`
   (pid non incrémenté, pas de passages).
4. Sinon : sélection de phrases **stable par compétence** (convergence
   inter-passes) : `k = stable_hash("sent|" + code) % len(sents)` ;
   `(f1, s1) = sents[k]` ; `(f2, s2) = sents[(k + 7) % len(sents)]`.
   `pid += 1 → p1` ; `pid += 1 → p2`. Deux passages ajoutés à `passagesSaillants` :

```json
{"pid": p1, "feuille": f1, "extraitVerbatim": s1,
 "contexte": "Passage relevé pour {code}.", "auteur": "apprenant"}
{"pid": p2, "feuille": f2, "extraitVerbatim": s2,
 "contexte": "Second passage relevé pour {code}.", "auteur": "apprenant"}
```

5. Verdict selon `h` :
   - `h ∈ {4,5}` : `conf = max(0.05, 0.14 + noise)` ; statut
     `"présence non établie"`, `nbp=0, nbi=0, traces=[]`.
   - `h ∈ {6,7}` : `conf = min(0.98, (h==6 ? 0.88 : 0.84) + noise)` ; statut
     `"présence établie"` ; `(nbp,nbi) = h==6 ? (1,1) : (0,2)` ;
     `traces = [{"pieceId":1,"type":"trace concrète","role":"preuve décisive"},
     {"pieceId":2,"type":"déclaration étayée","role":"indice corroboratif"}]` ;
     si `h==7`, `traces[0] = {"pieceId":1,"type":"déclaration étayée","role":"indice corroboratif"}`.
   - `h == 8` : `conf = [0.25, 0.82, 0.55][(run - 1) % 3] + noise` —
     ⚠ `%` Python sur négatif donne un résultat ≥ 0 (`(-1) % 3 == 2`) ; si
     `run ≥ 1` toujours, pas d'écart, sinon reproduire le modulo Python
     (`((n % m) + m) % m`). Statut : `conf < 0.45` → `"présence non établie"` ;
     sinon `conf >= 0.7` → `"présence établie"` ; sinon `"renvoi au cartographe"`.
     `(nbp,nbi) = (1,0)` si établie sinon `(0,0)` ;
     `traces = [{"pieceId":1,"type":"trace concrète","role":"preuve décisive"}]`
     si établie sinon `[]`.
   - `h == 9` : `conf = 0.55 + noise` ; `"renvoi au cartographe"`, `nbp=0, nbi=1`,
     `traces = [{"pieceId":2,"type":"déclaration étayée","role":"indice corroboratif"}]`.
6. Objet compétence (ordre des clés exact) :

```json
{"code": code, "courtCircuit": false,
 "pieces": [{"numero": 1, "pid": p1, "extraitVerbatim": s1,
   "contexte": "Pertinent pour {code}.", "auteur": "apprenant"},
  {"numero": 2, "pid": p2, "extraitVerbatim": s2,
   "contexte": "Pertinent pour {code}.", "auteur": "apprenant"}],
 "pedagogue": {
  "presomptionAbsence": {"raisonnement": "Lecture sceptique (mock) ; certaines pièces résistent.",
   "piecesQuiResistent": [{"pieceId": 1, "motifResistance": "acte daté décrit"}]},
  "presomptionSycophantie": {"raisonnement": "Relecture critique (mock).",
   "examenPieces": [{"pieceId": 1, "attaqueDominante": "a",
    "verdictAttaque": "attaque non recevable, pièce confirmée",
    "motifAttaque": "dispositif décrit et daté"}]},
  "conclusionAdversariale": {"raisonnement": "Après les deux retournements (mock), le verdict suit.",
   "confianceFinale": round(conf, 3)}},
 "verdict": {"statut": statut, "nombrePreuves": nbp, "nombreIndices": nbi,
  "confiance": round(conf, 3), "motif": "Conclusion adversariale (mock).",
  "prescription": "Pour prolonger, documenter une nouvelle situation liée à {nom}."},
 "tracesRetenues": traces}
```

7. Enveloppe finale :

```json
{"poleNum": str(pole), "passagesSaillants": […], "competences": […],
 "auditPole": {"competencesTotales": len(codes),
  "competencesNonCourtCircuit": <compte courtCircuit==false>,
  "presencesEtablies": <compte statut=="présence établie">,
  "renvoisCartographe": <compte statut=="renvoi au cartographe">,
  "nonEtablies": <compte statut=="présence non établie" ET courtCircuit==false>,
  "courtCircuits": <compte courtCircuit==true>},
 "rapport": {"portraitPole": "Portrait du pôle {pole} (mock) : le travail montre un ancrage concret.",
  "territoiresDenses": [], "territoiresNonVisites": "Territoires non visités (mock).",
  "emergencesPole": "Émergences (mock).",
  "pistes": ["Pour enrichir ce pôle, un chemin possible serait de documenter un cas vécu."],
  "rapportCompletMarkdown": "## Portrait du pôle\n\nRapport de pôle {pole} généré par le backend mock.\n"}}
```

`"poleNum": str(pole)` — chaîne, même si `meta.pole` est un entier.
Le tout dans un bloc ```` ```json ````.

### 4.12 `_tribunal_texte` (tasks `greffier`, `accusation`, `defense`, `replique`, `briefing`)

`code = meta.code ?? "?"`, `nom = meta.nom ?? "?"`, `sents = meta.sentences ?? []`.

**`greffier`** :
- `sents` vide → `"# Greffier — {code} {nom}\n\nDOSSIER VIDE — Aucune pièce identifiée pour {code}."`
- sinon `k = stable_hash("sent|" + code) % len(sents)` (même graine que `_leger`
  → convergence). Trois pièces aux indices `k`, `(k+7) % len`, `(k+3) % len`,
  numérotées 1..3. Document assemblé par lignes jointes par `\n` :

```
# Greffier — {code} {nom}

### Pièces extraites

#### Pièce {n}
- **Extrait** : « {phrase} »
- **Date** : {feuille}
- **Localisation** : feuille {feuille}
- **Type** : {"trace concrète" si n==1 sinon "déclaration étayée"}
- **Vigilance** : aucune

(… ×3, une ligne vide après chaque pièce …)
### Bilan
- Traces concrètes : 1
- Déclarations étayées : 2
- Déclarations nues : 0
- Intentions : 0
- Observations tierces : 0
- Alertes authenticité : 0
```

  (Guillemets français avec espaces insécables ? Non : espaces normales
  `« %s »` — U+00AB, espace, phrase, espace, U+00BB. Pas de `\n` final.)

**`accusation` / `defense` / `replique` / `briefing`** : sortie
`"# {Titre} — {code} {nom}\n\n{corps}"` où Titre ∈
{Accusation, Défense, Réplique, Briefing juré} et les corps sont les littéraux
constants des lignes 458–461 du source (mentionnant P1–P3), à recopier à
l'identique.

### 4.13 `_pos_jure(code, nj, tour)` — table des positions du jury

`h = _scenario(code)` ; `nj` = nom du juré.

- **Jurés hors socle** (`nj ∉ {Linguiste, Historien, Pédagogue, Sociologue}`) :
  `"détection"` si `h ∈ {6,7,8}` sinon `"abstention"` (identique aux deux tours).
- Socle, par scénario (r1 = tour 1, r2 = tour 2) :

| h | Linguiste | Historien | Pédagogue | Sociologue |
|---|---|---|---|---|
| 8 | r1 détection, r2 détection | r1 **contestation**, r2 détection | r1 détection, r2 détection | r1 détection, r2 détection |
| 9 | détection (r1=r2) | abstention | contestation | abstention |
| 6 | détection | détection | détection | **abstention** |
| 7 | **contestation** | abstention | abstention | abstention |
| 4 | r1 contestation, r2 **abstention** | r1 détection, r2 détection | abstention | abstention |
| 5 | r1 abstention, r2 abstention | r1 abstention, r2 abstention | r1 abstention, r2 **contestation** | r1 **détection**, r2 détection |
| 0–3 | abstention | **détection** | abstention | abstention |

(h=5 : `r2 = "contestation"` pour Pédagogue, sinon `r2 = r1` ; Sociologue r1
détection donc r2 détection. h=0–3 : branche `else` — Historien détection,
autres abstention, r2 = r1.)

Retourne `r1` si `tour == 1`, sinon `r2`.

### 4.14 `_jure_v9` (tasks `jure` / `jure2`) et `_relance`

`nj = meta.jure ?? "?"` ; `pos = _pos_jure(code, nj, tour)` ;
`pieces = {"détection": "P1, P2", "contestation": "P2, P3", "abstention": "—"}[pos]` ;
`piege = "récit performatif (déclaration sans acte)"` si contestation sinon `"—"`.

En-tête : tour 1 → `"# Juré {nj} — {code} {nom}"` ; tour 2 →
`"# Second tour — {nj} — {code} {nom}"` (⚠ tirets différents : ` — ` partout).

Corps :

```
{entete}

**Position** : {pos}
**Pièces** : {pieces}
**Piège visé** : {piege}

## Raisonnement
Depuis mon angle (mock), P1 pèse le plus.

## Ce que mon angle révèle que les autres pourraient manquer
Un détail de formulation (mock).
```

**`relance`** : utilise `pos = _pos_jure(code, nj, 2)` (tour 2) ; mêmes maps ;
sortie :

```
# Relance — {nj} — {code} {nom}

**Position maintenue** : {pos}
**Pièces** : {pieces}
**Piège visé** : {piege}

## L'argument qui justifie la réouverture
Mon angle éclaire P1 autrement (mock).

## Questions précises aux autres jurés
1. P1 décrit-elle un acte daté ? (P1)
2. P2 est-elle étayée ? (P2)
```

### 4.15 `gardien_support` / `gardien_raisonnement`

- Support : `r = stable_hash("gsupport|" + code) % 11` ;
  `constat = r==0 ? "le support gonfle" : r==1 ? "le support masque" : "neutre"` ;
  sortie : `"# Gardien du support — {code} {nom}\n\n**Constat** : {constat}\n\n## Motif\nConstat sur le canal écrit, pas sur l'élève (mock)."`
- Raisonnement : `drapeau = stable_hash("grais|" + code) % 17 == 0 ? "vice de raisonnement" : "aucun"` ;
  motif = `"Une position croit l'élève sur parole"` si drapeau ≠ "aucun" sinon
  `"Le raisonnement du collège tient"` ; sortie :
  `"# Gardien du raisonnement — {code} {nom}\n\n**Drapeau** : {drapeau}\n\n## Motif\n{motif} (mock)."`

### 4.16 `_leger_v9` (task `leger`) — juge léger, 3 lectures

`k = int(meta.passe ?? 1)` (`int()` : "3" → 3) ; `h = _scenario(code)`.

- `h ∈ {6,7}` : `("présence établie", "P1, P2", 0.86)`.
- `h == 8` :
  - si `stable_hash("l8|" + code) % 2 == 0` : `("présence établie", "P1, P2", 0.8)` ;
  - sinon : `statut = ["présence établie", "présence établie", "présence non établie"][(k-1) % 3]`
    (modulo Python : k ≥ 1 attendu) ; `pieces = statut établie ? "P1, P2" :
    "P2 (examinée puis écartée)"` ; `conf = 0.62`.
- `h == 9` : `statut = ["présence établie", "renvoi au cartographe",
  "présence non établie"][(k-1) % 3]` ; `pieces = établie ? "P1" : "—"` ; `conf = 0.55`.
- sinon : `("présence non établie", "P2 (examinée puis écartée)", 0.8)`.

Sortie (`%d` pour k, `%.2f` pour conf → `0.86`, `0.80`, `0.62`, `0.55`) :

```
# Juge léger — {code} {nom} — lecture {k}

**Statut** : {statut}
**Pièces retenues** : {pieces}
**Confiance** : {conf %.2f}

## Temps 1 — ce qui résiste à la présomption d'absence
P1 décrit un acte daté (mock).

## Temps 2 — ce qui cède sous la présomption de sycophantie
P3 tombe : déclaration nue (mock).

## Temps 3 — conclusion
Le mouvement conduit au statut ci-dessus (mock).
```

### 4.17 `_contre_lecture_v9` (task `contre_lecture`)

Aveugle aux lectures du juge léger. `h = _scenario(code)`.

- `h == 7` : `("présence non établie", "—", 0.74)`, motif =
  `"attaque (f) récit performatif : les pièces racontent la compétence sans la montrer en acte (mock)"`.
- sinon : `("présence établie", "P1, P2", 0.82)`, motif =
  `"attaques non recevables : les pièces survivent à la démolition (mock)"`.

Sortie (gabarit lignes 582–590, `%.2f` pour conf) :

```
# Contre-lecture — {code} {nom}

**Statut** : {statut}
**Pièces retenues** : {pieces}
**Confiance** : {conf %.2f}

## Temps 1 — présomption de présence
Lecture favorable construite : P1 et P2 portées au meilleur de ce qu'elles autorisent (mock).

## Temps 2 — présomption de sycophantie
Démolition de la lecture favorable, attaque dominante par pièce (mock).

## Temps 3 — conclusion adversariale
Le mouvement conduit au statut ci-dessus (mock).

**Motif du verdict** : {motif}
```

### 4.18 `_president` (task `president`)

`statut = meta.statut ?? "présence établie"` (le statut est CALCULÉ par la
procédure appelante, le président ne fait que raconter).

```json
{"prescription": {
 "pour_apprenant": "Pour consolider ce dossier, une piste serait de documenter une nouvelle situation vécue (mock).",
 "pour_cartographe": <si statut == "renvoi au cartographe" :
   "Question à explorer en entretien : la pièce P1 relève-t-elle de {code} ? (mock)"
   sinon null>}}
```

Sortie :

```
# Président — {code} {nom}

## Délibération
### Synthèse des positions
(récit mock du porte-parole — le statut calculé est : {statut})

## Prescription

```json
{prescription json}
```
```

Assemblage exact : `md` se termine par `"## Prescription\n"` puis concaténation
de `"\n```json\n" + dumps + "\n```"` → une ligne vide entre « ## Prescription »
et le bloc JSON, pas de `\n` final.

### 4.19 `_kairos` (task `kairos`)

Sortie constante (lignes 608–616) : `{"kairos": {"apprenant": {portrait,
formeProfil, ceQuiRelieLesPoles, ceQuiEmergeEntreLesLignes,
invitationsPourLaSuite [1], syntheseCompleteMarkdown
"## Synthèse\n\nSynthèse inter-pôles générée par le backend mock.\n"}},
"emergencesCrossPoles": {"competencesOrphelines": [],
"connexionsTransversales": [], "noeudsConceptuels": []}}` — littéraux à
recopier à l'identique.

### 4.20 `_tagger` (task `tagger`) — tagger stigmergique v8

Entrées : `meta.codes` = liste `[code, nom]` ; `meta.sentences` = liste
`[feuille_id, phrase]` ; `jid = str(meta.journee ?? "")` (⚠ défaut `""`, pas `"?"`).

Pour chaque `(code, nom)` **dans l'ordre de la liste** :

1. `h = _scenario(code)` ; si `h <= 3` OU `sents` vide → passer au code suivant
   (⚠ le bloc hallucination est AUSSI sauté : le `continue` court-circuite tout).
2. `rng = _rng("tag", model, code, jid)` — graine
   `"{salt}|tag|{model}|{code}|{jid}"`.
3. **`h ∈ {6,7}` (consensus — tous les modèles pointent la même phrase)** :
   - si `jid` non vide : `p_skip = 0.30 + (stable_hash("freq|" + code) % 66) / 100.0`
     (∈ [0.30, 0.95]) ; si `_rng("jour", code, jid).random() < p_skip` →
     `continue` (⚠ rng **séparé**, graine `"{salt}|jour|{code}|{jid}"`, un seul
     tirage ; ne consomme PAS le rng principal ; le `continue` saute aussi
     l'hallucination) ;
   - `k = stable_hash("sent|" + code) % len(sents)` (même ancre que léger/greffier) ;
   - tag 1 : `{"competence": code, "extrait": sents[k][1],
     "confiance": round(0.8 + rng.random() * 0.15, 2),
     "justification": "Acte daté correspondant aux manifestations de {code}."}`
     — **tirage rng n° 1** ;
   - si `rng.random() > 0.5` (**tirage n° 2**) : `k2 = (k + 7) % len(sents)` ;
     tag 2 : `{"competence": code, "extrait": sents[k2][1],
     "confiance": round(0.6 + rng.random() * 0.2, 2),   ← tirage n° 3
     "justification": "Indice corroboratif."}`.
4. **`h ∈ {8,9}` (divergence — chaque modèle voit sa phrase)** :
   `k = stable_hash("sent|" + code + "|" + model) % len(sents)` ;
   si `rng.random() > 0.35` (**tirage n° 1**) : tag
   `{"competence": code, "extrait": sents[k][1],
   "confiance": round(0.45 + rng.random() * 0.3, 2),    ← tirage n° 2
   "justification": "Trace possible, lecture propre à ce modèle."}`.
   ⚠ `k` est calculé AVANT le test (sans effet observable, mais l'ordre des
   tirages rng est 1 = test, 2 = confiance).
5. **`h ∈ {4,5}` (soupçons ténus)** : si `rng.random() > 0.5` (**tirage n° 1**) :
   `k = stable_hash("sent|" + code + "|" + model) % len(sents)` ; tag
   `{"competence": code, "extrait": sents[k][1],
   "confiance": round(0.18 + rng.random() * 0.18, 2),   ← tirage n° 2
   "justification": "Soupçon ténu, confiance honnête (mock)."}`.
6. **Hallucination simulée** (exécutée pour tout code non court-circuité qui
   n'a pas fait `continue` au saut de fréquence) :
   si `_rng("hallu", model, code, jid).random() < 0.09` (rng séparé, graine
   `"{salt}|hallu|{model}|{code}|{jid}"`, un tirage) : tag
   `{"competence": code,
   "extrait": "Cette phrase n'existe pas dans le portfolio (hallucination simulée).",
   "confiance": 0.7, "justification": "Citation non ancrée (test)."}`.

Sortie : `"```json\n" + dumps({"tags": tags, "alertes": []}) + "\n```"`.

---

## 5. `KINDS` et `make_backend(spec)`

```python
KINDS = {"mock": MockBackend, "claude-cli": ClaudeCLIBackend,
         "anthropic": AnthropicBackend, "openai": OpenAICompatBackend,
         "ollama": OllamaBackend}
```

`make_backend(spec)` :
- `kind = (spec || {}).kind ?? "mock"` (défaut **mock**) ;
- inconnu → `ValueError("Backend inconnu : %s (choix : %s)")` avec les kinds
  **triés** joints par `", "` : `anthropic, claude-cli, mock, ollama, openai` ;
- construit `KINDS[kind](spec)` puis
  `log("Backend initialisé : %s (modèle par défaut : %s)" % (kind, spec.get("model", "-")))`
  — ⚠ `spec.get` direct : si `spec` est null ici, Python lèverait ; en pratique
  spec est toujours fourni ; défaut d'affichage `"-"`.

---

## 6. Points de vigilance parité (récapitulatif)

1. **MT19937 CPython** : `random.Random(seed_entier)` = Mersenne Twister avec
   seeding `init_by_array` (découpage de la graine en mots 32 bits little-endian,
   init préalable 19650218) et `random()` = `genrand_res53`
   (`(a*2^26 + b)/2^53`). Sans implémentation conforme, AUCUNE valeur de
   confiance ni décision probabiliste ne matchera. L'ordre exact des tirages
   par branche (documenté en 4.11 et 4.20) fait partie du contrat.
2. **`stable_hash`** : MD5 UTF-8, 12 premiers hex, entier 48 bits. Toutes les
   ancres de phrases (`"sent|"…`), scénarios (`"scn|"`), fréquences (`"freq|"`),
   impressions (`"imp|"`), pépites (`"pep|"`), retours (`"ret|"`), gardiens
   (`"gsupport|"`, `"grais|"`), léger h=8 (`"l8|"`) en dépendent.
3. **Sérialisation JSON Python** : séparateurs `", "` / `": "`, ordre
   d'insertion des clés, `1.0` sérialisé avec `.0` (court-circuit `_leger`),
   `null` pour `None`. `JSON.stringify` nu ne convient pas.
4. **Arrondis** : `round(x, 2|3)` correctement arrondi (half-even sur la valeur
   binaire exacte) ; `"%.2f"` pour les confiances des sorties markdown
   (`0.80` avec zéro final).
5. **`str()` Python dans les graines et gabarits** : `str(None)` = `"None"`
   (graine `"ret|None"` si `titre` absent), entiers en décimal, salt converti
   par `str()`. Modulo Python toujours ≥ 0 pour diviseur positif
   (`(k-1) % 3`, `(run-1) % 3` — reproduire `((n % m) + m) % m` si n peut être négatif).
6. **Le mock ne dépend que des métadonnées** (`task`, `meta`, `model`,
   `spec.salt`) — jamais du texte du prompt. Le port JS doit conserver cette
   frontière : c'est ce qui permet d'utiliser le mock comme oracle sans porter
   les prompts (`protocole/*.md`, référencés par nom uniquement, jamais recopiés).
7. **Retries** : 3 tentatives, pauses 2 s / 4 s / 6 s (la 3e a lieu même après
   l'ultime échec, avant la levée de l'erreur — cf. §2.2), un seul `CallRecord` par appel
   (succès ou échec final), `seconds` couvrant toutes les tentatives,
   `tokens_estimes = floor((prompt_chars + response_chars) / 4)`.
8. **Typographie des gabarits** : tirets cadratins ` — ` (U+2014), guillemets
   `« »` (U+00AB/BB), accents (`établie`, `détection`) — toute variation casse
   la parité et les parseurs aval qui regexent ces sorties.
