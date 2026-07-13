# Spec de portage — `aurora/journee.py` + `aurora/heatmap.py` (Twin_v9)

> Contrat de portage JavaScript. Objectif : parité **bit-à-bit** avec le Python en mode
> mock (`--salt`). Toute divergence d'itération, d'arrondi, de formule ou de format de
> chaîne hashée casse l'oracle de parité.
>
> **Secret** : les gabarits `protocole/**/*.md` sont confidentiels. Cette spec les
> référence uniquement par nom de fichier, variables de gabarit et contrat de sortie
> (règles de parsing). Ne jamais recopier leur contenu dans le code ni la doc.

Constantes de module (`journee.py`) :

```python
SEUILS_CONSENSUS = {"conf_min": 0.4, "corrobore": 0.6, "instruire": 0.25,
                    "instruire_min_modeles": 2, "suspicion_min": 0.15}
VERSION_PROTOCOLE = "v9.8-contre-lecture"
```

Les seuils effectifs d'un run sont `dict(SEUILS_CONSENSUS, **config["seuils_consensus"])`
(la config **écrase** clé par clé, les clés absentes gardent le défaut).

---

## 1. Rôle des modules et flux global

`journee.py` cartographie **une** journée de portfolio, de façon atomique (elle ne voit
que sa journée ; le temps long appartient à `merge3.py`). Pipeline :

```
cartographier_journee(ctx, jr, roster, backends)
 ├─ 0. REPRISE : si carto_jour.json existe avec la même empreinte → rehydrater + return
 ├─ 1. jr.sentences = _sentences_de(texte)          (0 LLM)
 ├─ 2. _premiere_impression   (1 appel LLM "rapide", optionnel, caché sur disque)
 ├─ 3. _tagging               (N lecteurs × 7 pôles appels LLM "tagger", cachés)
 │     + _charger_calques_archives (calques d'anciens runs, 0 LLM, « lecteurs fantômes »)
 ├─ 4. ancrer + segments      (heatmap.py, 0 LLM)
 ├─ 5. _consensus             (0 LLM) → statut par compétence :
 │       corroborée / à instruire / minoritaire / non détectée
 ├─ 6. pour chaque compétence corroborée|à instruire (tri ratio desc) :
 │     _juger_leger = greffier (1 LLM) → dossier vide ? court-circuit
 │                    → juge léger ×N (N LLM) → résolution MÉCANIQUE
 │                    → si concordance "établie" + pièces ancrées : contre-lecture 20c
 │                      (1 LLM, si activée) → verdict OU tribunal
 ├─ 7. TRIBUNAL (tribunal9.juger) pour TOUS les désaccords du léger (tri ratio desc)
 ├─ 8. verdicts absents (_verdict_absent) pour le reste  (0 LLM)
 ├─ 9. registre des suspicions (rien ne se perd)
 ├─ 10. déclassement stigmergique (spans des codes rejetés PAR TRIBUNAL retirés,
 │      segments recalculés, calques du run élagués)
 ├─ 11. _persister_calques → magasin calques/<jid>.json
 └─ 12. écriture carto_jour.json + rehydrater(ctx, carto) + log récapitulatif
```

`heatmap.py` : ancrage verbatim des extraits cités (rejet compté si introuvable),
agrégation pondérée par caractère en **segments** homogènes, écriture des sorties
annotées (`tagged/*.md`, `portfolio.heat.md`, `heatmap.json`, viewer).

---

## 2. Entrées : structures `ctx`, `jr`, `roster`, `backends`

### 2.1 `jr` (journée)

```
{ "id": str,              # ex. "J07" — identifiant de journée
  "date": str|None,       # "YYYY-MM-DD" si connue
  "titre": str|None,
  "texte": str }           # texte brut de la journée
```

`cartographier_journee` y ajoute (copie, pas mutation) : `"sentences"` =
`_sentences_de(texte, id)` → liste de **paires** `(jid, phrase)` (en JS : tableaux
`[jid, phrase]` — le mock backend les consomme via `meta`).

### 2.2 `roster` (lecteurs du run)

Liste de dicts : `{"name": str, "model": str?, "family": str?, "weight": float?=1.0,
"temperature": float?, "seed": int?, "passe": ?, "kind": str?}`.
Défauts utilisés dans le code : `family` ← `name.split("#")[0]` (persistance calque)
ou `name` (consensus), `weight` ← `1.0`.

### 2.3 `ctx` (contexte du run) — clés consommées

| clé | usage |
|---|---|
| `config` | dict de configuration (voir §2.4) |
| `poles` | dict-like itérable `for p in ctx["poles"]` → objets `Pole` (attention : dans scan9, c'est une **liste** de `Pole` ; l'itération donne les pôles dans l'ordre P1..P7). Chaque `Pole` : `.num`, `.nom`, `.competences` (liste `{code, nom, fiche_md}`), `.fiche_complete(ordre=…)` |
| `protocole_dir` | racine des gabarits |
| `logs_dir` | calques du run : `logs_dir/<jid>/tags_<name>_P<n>.json` |
| `journees_dir` | artefacts LLM : `journees_dir/<jid>/10-premiere-impression.md`, `journees_dir/<jid>/tribunal/<CODE>/…`, `journees_dir/<jid>/carto_jour.json` |
| `calques_dir` | magasin persistant inter-runs `calques_dir/<jid>.json` (peut être absent/None → accumulation désactivée) |
| `base_dir` | sert à `marque_run = empreinte(base_dir)[:6]` ; sorties heatmap |
| `backend_tribunal` | Backend de l'étage lourd |
| `rapide` | `(backend, modèle)` de l'analyse rapide, ou None |
| `incidents` | dict global d'incidents (muté par `rehydrater`) |
| `ancrage_stats` | créé/muté par `rehydrater` |

### 2.4 Clés `config` consommées

`max_workers` (déf. 6), `seuils_consensus` (surcharge de SEUILS_CONSENSUS),
`premiere_impression` (bool, déf. True), `juge_leger.passes` (déf. 3, min 1),
`juge_leger.contre_lecture` (bool, déf. False), `calques.accumulation` (déf. True),
`calques.max_archives` (déf. 12), `backend_tribunal.{kind,model,model_mini}`,
`backend_rapide.{kind,model}`, `jury` (dict complet, versé dans l'empreinte),
`jury.mode` (déf. `"socle4+1"`, versé dans carto).

### 2.5 `backends`

`backends[name].call(prompt, model=…, temperature=…, seed=…, task=…, meta=…, label=…) → str`.
**En mode mock, seuls `task`, `meta` (et le salt du backend) déterminent la sortie** —
le prompt est ignoré. Les contenus exacts de `meta` sont donc des invariants de parité
(voir tableau §7).

---

## 3. `heatmap.py` — fonctions publiques

### 3.1 `ancrer(raw, tags_par_modele, roster) → (spans, rejets)`

- `poids = {m["name"]: float(m.get("weight", 1.0)) for m in roster}`.
- Itère `tags_par_modele.items()` **dans l'ordre d'insertion** (voir §7.2), et pour
  chaque tag dans l'ordre de sa liste :
  - `loc = find_verbatim(raw, t["extrait"])` (util, voir §6.4).
  - `None` → rejet : `{"model", "competence", "extrait": extrait[:200],
    "motif": "non ancré (citation introuvable)"}`.
  - Sinon `(s, e, ratio)` ; si `e - s > 1200` : **tronqué** à `e = s + 1200`,
    marqué `tronque: true`, PAS compté en rejet.
  - Span : `{"start": s, "end": e, "model": name, "code": t["competence"],
    "conf": t["confiance"], "poids": poids.get(name, 1.0),
    "justification": t.get("justification", ""), "ratio": round(ratio, 3),
    "tronque": bool}` (`round` = arrondi Python, §7.5).
- Log OK : `"Ancrage : %d spans ancrés (%d tronqués), %d tags rejetés"`.

### 3.2 `segments(raw, spans, poids_total) → [seg]`

Balayage par événements :

1. `events` : dict `position → [(op, i)]` ; pour chaque span d'indice `i` (ordre de la
   liste) : `(+1, i)` à `start`, `(-1, i)` à `end`. **Ordre des paires par position =
   ordre d'insertion.**
2. `points = sorted(events)` (positions croissantes, uniques).
3. Ensemble `actifs` d'indices de spans ; à chaque point on applique les ops
   (`add` si op>0, `discard` sinon) **dans l'ordre de la liste**, puis si un point
   suivant existe et `actifs` non vide, on émet un segment `[pt, nxt)` :
   - `cover = [spans[i] for i in actifs]` — ⚠ ordre d'itération d'un `set` Python
     d'entiers (§7.3) ; en JS, itérer les indices actifs **en ordre croissant** et
     documenter le risque flottant résiduel.
   - `models` = tri croissant des noms distincts.
   - `par_modele[model] = max(poids × conf)` sur le segment (pas de cumul intra-modèle).
   - `heat = sum(par_modele.values()) / (poids_total or 1.0)` ; champ
     `heat = round(min(1.0, heat), 4)`.
   - `comps` = tri croissant des codes distincts.
   - `conf_moyenne = round(sum(conf)/len(cover), 3)`.
   - `details` = `[{"model", "code", "conf"}]` trié par `(model, code)`
     (tri lexicographique de tuples, stable).
   - Segment : `{"start": pt, "end": nxt, "heat", "models", "comps",
     "conf_moyenne", "details"}` (ordre des clés = ordre d'insertion ci-dessus).

Seuls les segments **couverts** sont émis (pas de segments à heat nulle).

### 3.3 `_fusion_spans_modele(spans_modele) → [[s, e, set(codes), conf_max]]`

- Tri par `(start, -end)` ; fusion si `sp["start"] < out[-1][1]` (chevauchement strict
  avec la fin **courante fusionnée**) : `end = max(end, sp.end)`, union des codes,
  `conf = max(conf, sp.conf)` ; sinon nouveau bloc.

### 3.4 `_inserer_marks(raw, marks)` et `html_escape_min`

- `marks = [(start, end, attrs_str)]` ; tri lexicographique **du triplet complet**
  (start, end, attrs). Un mark dont `start < pos` courant est sauté (chevauchement
  résiduel). Sortie : `texte[pos:s] + "<mark %s>%s</mark>" % (attrs, texte[s:e])`…
- `html_escape_min(s)` = **identité** (le texte est laissé tel quel).

### 3.5 `ecrire_sorties(ctx, raw, spans, segs, rejets, roster) → rollup`

1. Par modèle du roster : fusion de ses spans, puis marks
   `data-model="%s" data-comps="%s" data-conf="%.2f"` (codes triés joints par `,`,
   `%.2f` = formatage C de Python, §7.5) → `base_dir/tagged/<name>.md`.
2. Marks des segments `data-heat="%.2f" data-models="%s" data-comps="%s"` →
   `base_dir/portfolio.heat.md`.
3. `rollup` : par code (ordre de première apparition dans `spans`) :
   `{"modeles": {model: n_spans_du_modele}, "n_spans": int, "max_heat": float}` ;
   `max_heat` = max des `heat` des segments dont `comps` contient le code
   (0.0 si jamais couvert). Écrit `base_dir/heatmap.json` :
   `{"journal_id", "date", "roster": [names], "segments", "par_competence": rollup,
   "rejets"}` (utilise `ctx["journal_id"]`, `ctx["date"]`).

### 3.6 `ecrire_viewer(ctx, raw, segs, roster, competences_noms, consensus)`

- `viewer/heatmap-data.js` = `"window.HEATMAP_DATA = %s;\n"` avec
  `json.dumps(data, ensure_ascii=False)` — séparateurs Python par défaut
  `", "` et `": "` (⚠ pas `JSON.stringify`, §7.6). `data = {"journal_id", "date",
  "texte", "segments", "roster", "competences", "consensus"}`.
- Copie `ctx["impl_dir"]/viewer/heatmap.html` → `base_dir/viewer/heatmap.html` si présent.

Note : dans le flux `cartographier_journee`, seuls `ancrer` et `segments` sont
appelés ; `ecrire_sorties`/`ecrire_viewer` sont utilisés par d'autres orchestrateurs.

---

## 4. `journee.py` — fonctions, pas à pas

### 4.1 `_sentences_de(texte, jid) → [(jid, phrase)]`

- Pour chaque ligne (`splitlines`), `strip()` ; ignorer si commence par `#` **ou**
  `len < 60`.
- Découper par la regex `(?<=[.!?])\s+` (lookbehind), `strip()` chaque morceau, garder
  si `60 <= len <= 400`. Résultat : liste de paires `(jid, s)`.

### 4.2 `_tag_call(ctx, backend, entry, pole, jr, inc) → (tags|None, alertes)`

1. Décorrélation : `ordre = permutation(len(pole.competences),
   "fiche|%s|P%d" % (entry["name"], pole.num))` (§6.3).
2. Variables gabarit `tagger/1-tag-pole.md` : `POLE_NUM` (int), `POLE_NOM`, `JOURNEE`
   (= `jr["id"]`), `POLE_FICHES` = `pole.fiche_complete(ordre=ordre)`,
   `PORTFOLIO` = `neutraliser_balises(jr["texte"])` (§6.5).
3. Appel : `model=entry.get("model")`, `temperature=entry.get("temperature", 0.3)`,
   `seed=entry.get("seed")`, `task="tagger"`,
   `meta={"pole": pole.num, "codes": [(code, nom) par compétence du pôle, ordre fiche],
   "sentences": jr["sentences"], "journee": jr["id"]}`,
   `label="tag_%s_%s_P%d" % (name, jid, pole.num)`.
4. `data = extract_json(raw)` (§6.6). Si pas un dict ou `data["tags"]` pas une liste :
   incident `tags_json_invalides`, retour `(None, [])` — **jamais mis en cache**.
5. Validation tag par tag (ordre conservé) :
   - rejeté (compteur `ignores`) si pas dict, ou `competence` ∉ codes du pôle, ou
     `extrait` pas une chaîne non vide après `strip()`.
   - `conf = float(t.get("confiance", 0.5))` ; en cas de TypeError/ValueError → `0.5` ;
     clampée `max(0.0, min(1.0, conf))`.
   - tag valide : `{"competence", "extrait": strip(), "confiance": clampée,
     "justification": str(t.get("justification", ""))[:400]}`.
6. `ignores > 0` → incident `tags_invalides_ignores` (+= ignores).
7. `alertes` : si `data["alertes"]` est une liste → `[str(a)[:300] for a in … if a]`,
   sinon `[]`.

### 4.3 `_tagging(ctx, jr, roster, backends, inc) → (resultats, alertes)`

- `jdir = logs_dir/<jid>` (créé) ; `horodatage = now().isoformat(timespec="seconds")`
  (⚠ horloge, §7.9) ; `marque_run = empreinte(ctx["base_dir"])[:6]`.
- `resultats = {name: [] pour chaque m du roster}` (ordre roster).
- `jobs = [(entry, pole) for entry in roster for pole in ctx["poles"]]` — produit
  cartésien, roster externe, pôles interne.
- Pour chaque job (ThreadPool `max_workers = int(config.get("max_workers", 6))`,
  collecte en ordre d'achèvement — §7.2) :
  - **Cache** : si `tags_<name>_P<num>.json` existe → relire, retourner
    `(name, data["tags"] ?? [], data["alertes"] ?? [])`.
  - Sinon `_tag_call` ; exception → incident `echec_appel_tagging`, warn, `(name,[],[])` ;
    `tags is None` → `(name,[],[])` sans écrire de fichier.
  - Succès → écrit le calque JSON :
    ```
    {"calque_id": "<name>@<horodatage>.<marque_run>", "model": name,
     "llm": entry.get("model"), "famille": entry.get("family", name.split("#")[0]),
     "passe": entry.get("passe"), "poids": float(entry.get("weight", 1.0)),
     "journee": jid, "pole": pole.num, "horodatage": …, "tags": […],
     "alertes": […], "elagues": []}
    ```
- `resultats[name].extend(tags)` à chaque complétion ; alertes accumulées comme
  `{"model": name, "alerte": a}`.
- Si alertes : incident `injection_signalee` (+= len), warn.

### 4.4 Calques (persistance inter-runs)

- `_fichiers_calques(jdir)` : fichiers `tags_*.json` du dossier, **triés** par nom ;
  `[]` si le dossier n'existe pas.
- `_ids_calques_locaux(jdir)` : set des `calque_id` lisibles (erreurs de lecture
  silencieuses).
- `_charger_calques_archives(ctx, jr, ids_locaux)` :
  - `[]` si `calques_dir` absent ou `config.calques.accumulation == False`.
  - Lit `calques_dir/<jid>.json` ; `[]` si absent ou si
    `store["texte_empreinte"] != empreinte(jr["texte"])` (texte modifié → caduc).
  - Garde les calques avec `id` non présent dans `ids_locaux`.
  - Plafond `max_archives` (déf. 12) : tri `horodatage` (ou `""`) **décroissant**
    (stable), warn, coupe aux `cap` premiers.
- `_persister_calques(ctx, jr) → descripteurs` :
  - Regroupe les fichiers locaux (ordre trié) par `calque_id` :
    `{id, lecteur: model, llm, famille, passe, poids (déf. 1.0), journee, horodatage,
    tags (concat), elagues (concat)}` — premier fichier vu fixe les métadonnées.
  - Descripteurs : `{id, lecteur, llm, passe, horodatage, n_tags, n_elagues,
    "source": "run"}`.
  - Si `calques_dir` et groupes non vides : relit/initialise le store
    `{journee, texte_empreinte, calques: []}` ; si empreinte texte différente →
    warn + store réinitialisé ; ajoute les groupes dont l'`id` n'y est pas encore,
    **triés par `calque_id`** (comparaison de chaînes par unités de code) ; réécrit.
  - Retour : descripteurs **triés par `id`**.
- `_elaguer_calques(ctx, jr, rejetes, marque, inc)` : pour chaque fichier local (ordre
  trié), déplace les tags dont `competence ∈ rejetes` vers `elagues` en leur ajoutant
  `"juge": marque` (copie du tag + champ), réécrit si changement ; incident
  `tags_elagues_apres_jury` (+= n) si n > 0.
- `_bloc_calques(jr, c)` : sur `c["spans"] + c["sous_seuil"]` (ordre : spans triés
  conf desc, puis sous_seuil triés conf desc), déduplication par `(start, end, model)`,
  lignes `- « %s » — calque %s, confiance %.2f` où l'extrait =
  `neutraliser_balises(texte[start:end][:240])` ; **max 10 lignes** ; jointes par `\n`.

### 4.5 `_consensus(spans, segs, roster, poles, seuils) → {code: entrée}`

⚠ `roster` ici = **lecteurs** (roster du run + calques archivés fantômes).

- `familles = {name: m.get("family", name)}` ; `n = len(roster) or 1`.
- Partition des spans (ordre conservé) : `conf >= conf_min` → `par_comp[code]` ;
  sinon `conf >= suspicion_min` (déf. 0.15) → `sous_seuil[code]` ; sinon jeté.
- **Span partagé** : pour chaque segment, `par_code[code] = {models}` des `details`
  avec `conf >= conf_min` ; si ≥ 2 modèles sur un code → `partages[code] = True`.
- `min_mod = int(instruire_min_modeles)` ; `mono_famille = (nombre de familles
  distinctes du roster) < 2`.
- Pour chaque pôle (ordre d'itération de `ctx["poles"]`), chaque compétence (ordre
  fiche) — cet ordre fixe **l'ordre des clés** de la sortie :
  - `sps = par_comp.get(code, [])` ; `modeles = sorted(noms distincts)` ;
    `fams = sorted(familles distinctes de ces modèles)` ; `r = len(modeles)/n`.
  - `diversite_ok = len(fams) >= 2 or (mono_famille and len(modeles) >= 2)`.
  - Routage :
    - `r == 0` → `"non détectée"` ;
    - `r >= corrobore` **et** `diversite_ok` **et** `partages[code]` → `"corroborée"` ;
    - `r >= instruire` **et** `len(modeles) >= min_mod` → `"à instruire"` ;
    - sinon → `"minoritaire"`.
  - Entrée : `{"statut", "ratio": round(r, 3), "modeles", "familles",
    "span_partage": bool(partages[code]), "spans": sorted(sps, key=-conf),
    "sous_seuil": sorted(…, key=-conf)}` — tris **stables** : à confiance égale,
    l'ordre d'arrivée des spans est conservé (§7.2).

### 4.6 `_premiere_impression(ctx, jr, inc) → str|None`

- `None` si `config.premiere_impression == False`.
- Cache : `journees_dir/<jid>/10-premiere-impression.md`.
- Appel via `_rapide_de(ctx)` : gabarit `lourd/10-premiere-impression.md`, variables
  `JOURNEE` (= jid), `PORTFOLIO` (= texte neutralisé) ; `task="premiere_impression"`,
  `meta={"journee": jid}`, `label="lecteur_<jid>_impression"`. Exception → incident
  `premiere_impression_echec`, retour None. Succès → écrit le cache.
- `_authenticite_de(impression)` : regex insensible à la casse
  `\*\*\s*Indicateur\s*\*\*\s*:\s*`? suivi de `(habitée|mixte|produite)` ; retour
  groupe en minuscules, sinon None.
- `_rapide_de(ctx)` : `ctx["rapide"]` si son backend n'est pas None, sinon
  `(ctx["backend_tribunal"], config.backend_tribunal.model_mini or .model)`.

### 4.7 `_parse_leger(texte) → {statut, pieces, conf}` (contrat de sortie 20b/20c)

- `statut` : regex `\*\*\s*Statut\s*\*\*\s*:\s*([^\n]+)` (IGNORECASE) sur le texte ;
  la capture en minuscules est testée **dans cet ordre** : contient `"renvoi"` →
  `"renvoi au cartographe"` ; contient `"non établie"` ou `"non etablie"` →
  `"présence non établie"` ; contient `"établie"` ou `"etablie"` →
  `"présence établie"` ; sinon `None` (illisible).
- `pieces` : regex `\*\*\s*Pi[èe]ces[^*]*\*\*\s*:\s*([^\n]+)` ; dans la capture,
  tous les `\bP\s*(\d+)\b` → set d'entiers **trié croissant** ; `[]` si pas de ligne.
- `conf` : regex `\*\*\s*Confiance\s*\*\*\s*:\s*([01](?:[.,]\d+)?)` ; virgule → point,
  `float`, clamp [0,1] ; défaut `0.5`.

### 4.8 `_contre_lecture(ctx, jr, comp, dossier, tdir, n_passes, inc) → cl|None`

- Cache : `tdir/20c-contre-lecture.md`.
- Sinon gabarit `lourd/20c-contre-lecture.md`, variables : `CODE`, `NOM`,
  `PASSES` (= n_passes, int), `COMPETENCE_FICHE` (= `comp["fiche_md"]`), `DOSSIER`.
  Appel rapide avec `seed = stable_hash("contre|%s|%s" % (jid, code)) % (2**31 - 1)`,
  `task="contre_lecture"`, `meta={"code", "nom"}`,
  `label="contre-lecture_<jid>_<code>"`. Exception → incident `contre_lecture_echec`,
  retour None (→ tribunal). Succès → cache.
- Parse `_parse_leger` + `motif` : regex `\*\*\s*Motif du verdict\s*\*\*\s*:\s*([^\n]+)`
  → `strip()`, sinon None. `statut is None` → incident `contre_lecture_illisible`.

### 4.9 `_juger_leger(ctx, jr, pole, comp, cons_entry, inc) → (verdict|None, detail)`

`None` en premier membre = **défèrement au tribunal**.

1. `n_passes = max(1, int(config.juge_leger.passes ?? 3))` ;
   `tdir = journees_dir/<jid>/tribunal/<CODE>`.
2. **Greffier** (tribunal9.`constituer_dossier`, cache `tdir/20-greffier.md`) avec
   `rapide=_rapide_de(ctx)` et `calques=_bloc_calques(jr, cons_entry)`.
   Exception → incident `greffier_echec`, retour `(None, {"erreur": "greffier : …"})`.
   Dossier vide (le texte contient `DOSSIER VIDE` dans `dossier[:400].upper()`) →
   retour `(verdict_dossier_vide(code, nom, dossier), {"dossier_vide": True})` —
   ce verdict a `etage="tribunal-court-circuit"`, statut `présence non établie`,
   confiance `0.9`.
3. **N passes** du juge léger, k = 1..n_passes, **séquentielles** :
   - Cache `tdir/20b-leger-<k>.md` ; sinon gabarit `lourd/20b-juge-leger.md`,
     variables `CODE, NOM, PASSE (=k), PASSES (=n), COMPETENCE_FICHE, DOSSIER` ;
     appel rapide, `seed = stable_hash("leger|%s|%s|%d" % (jid, code, k)) % (2**31-1)`,
     `task="leger"`, `meta={"code", "nom", "passe": k}`,
     `label="leger_<jid>_<code>_p<k>"`. Exception → incident `leger_echec`,
     `(None, {"erreur": "léger p<k> : …"})`. Succès → cache.
   - `_parse_leger` ; statut None → incident `leger_illisible`,
     `(None, {"lectures": …, "resolution": "lecture <k> illisible → tribunal"})`.
4. **Résolution mécanique** — `statuts = {lecture.statut}` (ensemble) ;
   `pieces_greffier = {num: piece}` via tribunal9.`parse_pieces(dossier)` :
   - **Cas A — toutes `présence établie`** :
     - `compte[p]` = nb de lectures citant la pièce p (chaque lecture compte ses
       pièces **dédupliquées**).
     - `seuil_commun = 2 si n_passes >= 2 sinon 1`.
     - Pour chaque `num` **trié croissant** avec `compte >= seuil_commun` et présent
       chez le greffier : `(t_type, role) = _type_role(p["type"])` (tribunal9 ;
       `(None, None)` = non probante → sautée) ; `loc = find_verbatim(texte, extrait)` ;
       introuvable → incident `trace_leger_non_ancree`, sautée ; sinon trace
       `{"piece": num, "extrait": texte[s:e][:400], "date": str(p["date"]) si elle
       matche le préfixe \d{4}-\d{2}-\d{2}, sinon jr["date"] or jid, "type": t_type,
       "role": role}` ; **max 5 traces**.
     - `sp` = nb de traces rôle `"preuve décisive"` ; `si = len(traces) - sp`.
     - Garde-fou : si NON `(sp >= 1 or si >= 2)` → detail.resolution =
       `"concordance sans pièces communes ancrables → tribunal"`, retour `(None, detail)`.
     - **Contre-lecture** si `config.juge_leger.contre_lecture` truthy :
       `cl = _contre_lecture(…)` ; `detail["contre_lecture"] = cl` ;
       - cl None ou statut None → resolution
         `"contre-lecture indisponible ou illisible → tribunal"`, `(None, detail)` ;
       - statut ≠ `présence établie` → `detail["ecarte_cl"] = traces[0].extrait`
         (ou None), resolution `"la convergence (%d lectures) n'a pas résisté à la
         contre-lecture → tribunal"`, `(None, detail)`.
     - `conf_moy = moyenne des conf` ;
       `confiance = round(min(0.9, 0.5 + 0.1*min(len(traces),3) + 0.1*conf_moy), 3)`.
     - `detail["resolution"] = "%d lectures concordantes%s, %d pièce(s) commune(s)
       ancrée(s)"` (avec `" + contre-lecture"` si cl).
     - Verdict (Schéma 1) :
       ```
       {"code", "nom", "dossier_vide": false, "statut": "présence établie",
        "score_preuves": sp, "score_indices": si, "confiance", "jury": null,
        "traces_probantes": traces,
        "prescription": {"pour_apprenant": "Cette journée atteste la compétence :
          %d lectures rapides indépendantes concordent sur les mêmes pièces%s. Pour
          consolider, une piste serait de documenter une nouvelle situation."
          (%s = ", et la contre-lecture les confirme" si cl, sinon ""),
          "pour_cartographe": null},
        "gardien": null, "etage": "leger-v6x<N>" + ("+cl" si cl), "leger": detail}
       ```
   - **Cas B — toutes `présence non établie`** :
     - `cites` = nums cités (union, triés) présents chez le greffier ;
       `detail["ecartes"] = [extrait[:300] des 2 premiers]` ;
       `detail["resolution"] = "%d lectures concordantes : non établie"`.
     - `confiance = round(min(0.95, 0.6 + 0.15*conf_moy), 3)`.
     - Verdict : statut `présence non établie`, scores 0/0, traces `[]`,
       prescription apprenant `"Ce dossier ne contient pas encore de pièce établie
       pour %s (examiné par %d lectures indépendantes)."`, `etage="leger-v6x<N>"`,
       `leger: detail`.
   - **Cas C — tout le reste** (mélange, renvoi…) : resolution
     `"désaccord entre lectures (%s) → tribunal"` avec les statuts **triés** joints
     par `" / "` ; retour `(None, detail)`.

### 4.10 `_verdict_absent(code, nom, cons)` (0 LLM)

```
{"code", "nom", "dossier_vide": not cons["spans"],
 "statut": "présence non établie", "score_preuves": 0, "score_indices": 0,
 "confiance": 1.0 si aucun span, sinon round(1.0 - cons["ratio"], 3),
 "jury": null, "traces_probantes": [],
 "prescription": {"pour_apprenant": "Cette journée ne contient pas encore de trace
   établie pour <nom>.",
  "pour_cartographe": si minoritaire : "Détection minoritaire (<modeles joints par
   ', '>) — versée au registre des graines." sinon null},
 "gardien": null, "etage": "minoritaire" | "non-détectée"}
```

### 4.11 Registre des suspicions

`_QUESTIONS` (dict source → question, à reproduire mot pour mot) :

| source | question |
|---|---|
| `sous-seuil` | `Un lecteur a cru voir %s ici, sans certitude — as-tu remarqué ce passage ?` |
| `minoritaire` | `As-tu remarqué que cette journée revient sur ceci ?` |
| `leger-ecarte` | `Trois lectures rapides ont examiné ceci sans le retenir — le fil reste ouvert.` |
| `contre-lecture` | `La convergence n'a pas résisté au contre-examen — qu'en dis-tu ?` |
| `contestation-jury` | `Un juré y a vu un piège — la trace mérite un échange.` |
| `detection-jury` | `Un juré y a vu quelque chose que les autres n'ont pas confirmé.` |
| `renvoi` | `Le tribunal n'a pas tranché — dossier préparé pour l'enseignant.` |
| `support-masque` | `Le format écrit masque peut-être cette compétence — à chercher autrement.` |
| `scan-global` | `La lecture du portfolio entier a relié ceci que le découpage en journées avait dispersé — qu'en dis-tu ?` |

Source inconnue → `"Signal conservé pour le temps long."`. Si la question contient
`%s`, elle est formatée avec `nom` (seul `sous-seuil` en contient un).

`_suspicion(code, nom, jr, source, extrait=None, detail=None)` →
`{"code", "nom", "journee": jid, "date": jr.get("date"), "source", "detail",
"extrait": (extrait or "")[:300] or None, "question"}` — chaîne vide → `null`.

### 4.12 `empreinte_journee(jr, roster, config)` — clé de reprise

```
empreinte(
  jr["texte"],
  sorted((m["name"], m.get("model"), m.get("family"), m.get("weight", 1.0),
          m.get("kind")) for m in roster),          # tri de tuples, élément par élément
  (bt.kind, bt.model, bt.model_mini),               # bt = config.backend_tribunal ?? {}
  (br.kind, br.model),                              # br = config.backend_rapide ?? {}
  seuils,                                           # dict fusionné (défauts + config)
  (int(jl.passes ?? 3), bool(jl.contre_lecture ?? False)),
  config.get("jury", {}), infos_personas(),         # tribunal9 : {version, empreinte}
  bool(config.premiere_impression ?? True), VERSION_PROTOCOLE)
```

`empreinte(*parts)` (util) = `"%x" % stable_hash(json.dumps(parts, sort_keys=True,
ensure_ascii=False, default=str))` — voir §7.6/§7.7 pour la reproduction exacte.

### 4.13 `cartographier_journee(ctx, jr, roster, backends) → carto`

1. `seuils` fusionnés ; `archives = _charger_calques_archives(ctx, jr,
   _ids_calques_locaux(journees_dir/<jid>))` — ⚠ les ids locaux sont lus dans
   **`journees_dir/<jid>`** (pas `logs_dir`) : sur un arbre standard il n'y a pas de
   `tags_*.json` là → set vide. Reproduire tel quel.
2. `fp = empreinte(empreinte_journee(jr, roster, config), sorted(ids des archives))`.
3. **Reprise** : si `journees_dir/<jid>/carto_jour.json` existe et
   `carto["empreinte"] == fp` → log, `rehydrater(ctx, carto)`, retour carto.
   Sinon (empreinte différente) → warn « recalcul ».
4. `jr = dict(jr, sentences=_sentences_de(texte, jid))` ; `day_inc = {}` avec `inc(k,
   n=1)` protégé par verrou (ordre des clés = ordre du premier incrément, §7.9).
5. `impression = _premiere_impression(…)` ; `authenticite = _authenticite_de(…)`.
6. `tags, alertes = _tagging(…)`.
7. **Lecteurs fantômes** : `lecteurs = list(roster)` puis, pour chaque calque archivé
   (ordre du store, après plafonnement) : append
   `{"name": cal["id"], "family": cal.get("famille") or cal["id"],
   "weight": float(cal.get("poids", 1.0)), "model": cal.get("llm"), "archive": True}`
   et `tags[cal["id"]] = list(cal["tags"] ?? [])`. Log si archives.
8. `spans, rejets = ancrer(texte, tags, lecteurs)` ; `stats_jour` par modèle :
   `{"ancres": n, "rejets": n}` (créées à la première occurrence, ordre spans puis
   rejets).
9. `poids_total = Σ weight des lecteurs` ; `segs = segments(texte, spans,
   poids_total)` ; `cons = _consensus(spans, segs, lecteurs, ctx["poles"], seuils)`.
10. Index `comp_par_code`, `pole_par_code` (toutes compétences).
    `a_examiner = [codes avec statut ∈ {corroborée, à instruire}]` dans l'ordre des
    clés de `cons`, **triés par ratio décroissant** (tri stable : à ratio égal, ordre
    référentiel conservé).
11. `_juger_leger` en ThreadPool (`max_workers=4`) sur `a_examiner` ; à chaque
    complétion : `details_leger[code] = detail` ; verdict None → `au_tribunal.append`,
    sinon `verdicts_leger[code] = verdict`. ⚠ ordre d'insertion de `details_leger` /
    `verdicts_leger` = ordre d'achèvement (§7.9).
12. `au_tribunal.sort(key=-ratio)` (stable sur l'ordre d'achèvement) ;
    `instruits = set(au_tribunal)`.
13. **Boucle verdicts** — pour chaque pôle, chaque compétence (ordre référentiel,
    fixe l'ordre des clés de `verdicts`) :
    - `code ∈ verdicts_leger` → verdict du léger ;
    - sinon `code ∈ instruits` → `tribunal9.juger(backend_tribunal, protocole_dir,
      tdir, pole, comp, jr, config, jr["sentences"], day_inc,
      premiere_impression=impression, rapide=_rapide_de(ctx),
      calques=_bloc_calques(jr, cons[code]), authenticite=authenticite)` ; puis pour
      chaque trace probante : `t.setdefault("date", jr["date"] or jid)` ;
    - sinon → `_verdict_absent`.
    - **Suspicions de la compétence** (ordre d'append, à reproduire) :
      1. chaque extrait de `details_leger[code]["ecartes"]` → source `leger-ecarte` ;
      2. si `details_leger[code]["contre_lecture"]` existe avec statut ∉
         {None, "présence établie"} → source `contre-lecture`, extrait =
         `detail["ecarte_cl"]`, detail = `cl["motif"]` ;
      3. statut consensus `minoritaire` → 2 premiers `spans` : source `minoritaire`,
         extrait = `texte[start:end]`, detail = `sp["model"]` ;
      4. 2 premiers `sous_seuil` **si** le verdict n'est pas `présence établie` :
         source `sous-seuil`, extrait idem, detail = `"%s @%.2f" % (model, conf)` ;
      5. si verdict a un `jury` : chaque nom de `jury["contestations"]` → source
         `contestation-jury`, detail = `"%s — piège : %s" % (nom,
         (jury["pieges_nommes"] or ["?"])[0])` ; et si statut ≠ établie, chaque nom de
         `jury["detections"]` → source `detection-jury`, extrait = première citation
         de `verdict["dossier_cartographe"]["citations"]` (ou None), detail = nom ;
      6. si `verdict["gardien"]["support"]["constat"] == "masque"` → `support-masque` ;
      7. si statut `renvoi au cartographe` **et** `etage == "tribunal"` → source
         `renvoi`, extrait = première citation du dossier cartographe, detail = motif.
14. **Déclassement stigmergique** : `rejetes_jury = {codes au statut "présence non
    établie" ET etage ∈ {"tribunal", "tribunal-court-circuit"}}` (⚠ inclut les
    dossiers vides court-circuités **du chemin léger**). Si non vide :
    - `spans_ecartes = [{model, code, start, end, conf}]` (projection, ordre spans) ;
    - si non vide : filtrer `spans`, **recalculer `segs`**, incident
      `spans_declasses_apres_jury` (+= n) ;
    - `marque = "tribunal du %s : non retenue" % (date or jid)` ; les suspicions des
      codes rejetés reçoivent `s["jugee"] = marque` ;
    - `_elaguer_calques(ctx, jr, rejetes_jury, marque, inc)`.
15. **Validations** (métadonnées heat) : pour chaque `(code, v)` de `verdicts` (ordre
    d'insertion) dont `etage` commence par `"leger"` ou `"tribunal"` :
    `{"statut", "voie": etage, "jury": v.jury?.composition, "jury_mode": v.jury?.mode,
    "lectures_leger": len(v.leger?.lectures ?? []) or None, "n_traces":
    len(traces_probantes ?? [])}` — ⚠ `0 → null` pour `lectures_leger`.
16. `desc_calques = _persister_calques(ctx, jr)` + pour chaque archive :
    `{id, lecteur, llm, passe, horodatage, n_tags, "source": "archive"}`
    (⚠ pas de `n_elagues` pour les archives).
17. **`carto`** — ordre exact des clés (contrat du JSON) :
    ```
    {"journee", "date", "titre", "n_caracteres": len(texte), "empreinte": fp,
     "premiere_impression", "authenticite", "spans_ecartes", "calques",
     "validations", "jury_mode": str(config.jury?.mode ?? "socle4+1"),
     "personas": infos_personas(), "verdicts",
     "consensus": {code: {statut, ratio, modeles, span_partage}}  # projection, même ordre
     "legers": details_leger, "segments": segs, "rejets", "graines": suspicions,
     "alertes_injection": alertes, "ancrage_stats_jour": stats_jour,
     "incidents_jour": day_inc,
     "etablies": sorted(codes statut "présence établie"),
     "renvois": sorted(codes statut "renvoi au cartographe")}
    ```
18. `write_json(carto_path, carto)` ; `rehydrater(ctx, carto)` ; log récap :
    `"Journée %s : %d dossiers examinés — %d établies (%d par juge léger, %d par
    tribunal), %d désaccords instruits, %d renvois, %d suspicions au registre"` où
    « par juge léger » = etage commence par `"leger"` et statut établie, « par
    tribunal » = etage `== "tribunal"` exactement.

### 4.14 `rehydrater(ctx, carto)`

- Pour chaque `(model, st)` de `ancrage_stats_jour` : cumul dans
  `ctx["ancrage_stats"][model] = {"ancres", "rejets"}` (créé à 0/0).
- Pour chaque `(k, v)` de `incidents_jour` : `ctx["incidents"][k] += v`.
- Appelée à la fois après calcul et à la reprise (les métriques globales restent
  justes après un run repris).

---

## 5. Appels LLM — tableau récapitulatif (contrat mock)

Chaque ligne : gabarit (SECRET, référencé par chemin), variables injectées,
paramètres `call`. En mock, la sortie dépend de `(salt du backend, task, meta)`
uniquement — les valeurs de `meta` sont donc contractuelles au caractère près.

| Étape | Gabarit | Variables `{$VAR}` | backend / model | task | meta | seed | label |
|---|---|---|---|---|---|---|---|
| Tagging | `tagger/1-tag-pole.md` | `POLE_NUM, POLE_NOM, JOURNEE, POLE_FICHES` (permuté), `PORTFOLIO` (neutralisé) | `backends[name]` / `entry.model`, temp `entry.temperature ?? 0.3` | `tagger` | `{pole, codes: [(code,nom)…], sentences, journee}` | `entry.seed` | `tag_<name>_<jid>_P<n>` |
| Première impression | `lourd/10-premiere-impression.md` | `JOURNEE, PORTFOLIO` | rapide | `premiere_impression` | `{journee}` | — | `lecteur_<jid>_impression` |
| Greffier (tribunal9) | `lourd/20-greffier.md` | `CODE, NOM, POLE_NUM, POLE_NOM, COMPETENCE_FICHE, CALQUES, FEUILLES` | rapide (ou tribunal+model_mini) | `greffier` | `{code, nom, sentences}` | — | `greffier_<jid>_<code>` |
| Juge léger ×k | `lourd/20b-juge-leger.md` | `CODE, NOM, PASSE, PASSES, COMPETENCE_FICHE, DOSSIER` | rapide | `leger` | `{code, nom, passe}` | `stable_hash("leger|<jid>|<code>|<k>") % (2^31−1)` | `leger_<jid>_<code>_p<k>` |
| Contre-lecture | `lourd/20c-contre-lecture.md` | `CODE, NOM, PASSES, COMPETENCE_FICHE, DOSSIER` | rapide | `contre_lecture` | `{code, nom}` | `stable_hash("contre|<jid>|<code>") % (2^31−1)` | `contre-lecture_<jid>_<code>` |
| Tribunal (21a→25b, 24) | `lourd/21a…25b…24-president.md` | voir spec tribunal9 | tribunal | `accusation, defense, replique, briefing, jure, jure2, relance, gardien_support, gardien_raisonnement, president` | voir spec tribunal9 | — | — |

`FEUILLES` (greffier/tribunal) = `"═══ Feuille : %s ═══\n%s\n" % (jid,
neutraliser_balises(texte))`. `CALQUES` = `_bloc_calques(...)` ou, si vide/None, le
littéral `"(aucun surlignage vivant pour cette compétence)"`.

Résolution de gabarit (`templates.py`) : motif `\{\$([A-Z_][A-Z0-9_]*)\}` remplacé par
`str(variables[VAR])` ; variable absente → laissée telle quelle + warn (mode non
strict). Les entiers injectés (POLE_NUM, PASSE…) suivent le `str()` Python.

**Caches disque** (reprise fichier) : chaque appel LLM ci-dessus écrit sa sortie brute
et la relit si le fichier existe — les chemins exacts sont dans §4. Une réponse
**inexploitable n'est jamais cachée** (tagging), une **panne** non plus.

---

## 6. Dépendances (interfaces à respecter)

### 6.1 `tribunal9` (spec séparée) — symboles importés

- `constituer_dossier(backend, protocole_dir, tdir, pole, comp, journee, config,
  sentences, rapide, calques) → (dossier_md, vide: bool)` ; `vide` =
  `"DOSSIER VIDE" in dossier[:400].upper()`.
- `parse_pieces(dossier_md) → [{num:int, extrait:str[:600], date:str|None, type:str}]`
  (blocs `#### Pièce N`, champs `**Extrait**` (guillemets « » ou ligne), `**Date**`,
  `**Type**`).
- `_type_role(type_str) → (type, role)` : slug sans accents/minuscule ; contient
  `trace concrete` → `("trace_concrete", "preuve décisive")` ; `observation tierce` →
  `("observation_tierce", "preuve décisive")` ; `declaration etayee` →
  `("declaration_etayee", "indice corroboratif")` ; `nue` ou `intention` →
  `(None, None)` ; sinon `("indice", "indice corroboratif")`.
- `verdict_dossier_vide(code, nom, dossier)` → verdict §4.9 cas dossier vide.
- `juger(…) → verdict Schéma 1` avec `etage="tribunal"` (ou
  `"tribunal-court-circuit"`), champs `jury`, `gardien`, `dossier_cartographe`,
  `deliberation`, `motif_regle`.
- `infos_personas() → {"version": "personas-v1", "empreinte": "%x" %
  stable_hash("|".join("nom=angle" triés))}` — entre dans `empreinte_journee` ET dans
  `carto["personas"]`.

### 6.2 `referentiel.Pole`

`fiche_complete(ordre)` = `header.rstrip() + "\n\n" + sections "fiche_md".strip()
jointes par "\n\n---\n\n" + "\n"`, sections réordonnées par la permutation.

### 6.3 `referentiel.permutation(n_items, seed_key)`

```
h = stable_hash(str(seed_key)) ; idx = [0..n-1]
rot = h % n_items (0 si n_items == 0) ; idx = idx[rot:] + idx[:rot]
si (h >> 8) % 2 : idx.reverse()
```
⚠ `h` est un entier 48 bits (§6.7) : `>> 8` et `%` exacts en JS avec Number
(< 2^53) — ne PAS utiliser les opérateurs 32 bits (`>>`), utiliser
`Math.floor(h / 256) % 2`.

### 6.4 `util.find_verbatim(source, quote, min_ratio=0.82)` — l'ancrage

1. Pré-nettoyage : `quote.strip()`, puis strip des caractères `«»"' ` (et l'espace),
   suppression de tous les `[...]` (littéral), `strip()` final ; vide → None.
2. **Exact** : `source.find(q)` → `(i, i+len(q), 1.0)`.
3. **Normalisé** : table typographique 1:1
   `’‘→'`, `“”«»→"`, `–—→-`, U+202F et U+00A0 → espace ; puis compactage des blancs :
   pour chaque caractère de `source` (après translation), si `isspace()` : n'émettre
   qu'UN espace (au premier blanc d'une série ; l'index mappé est celui de CE
   caractère), sinon émettre le caractère. `idx_map[i_norm] → i_source`.
   `qn = re.sub(r"\s+", " ", q translaté)`. Recherche **insensible à la casse**
   (`lower()` des deux côtés — attention aux minuscules Unicode, §7.8) ; trouvé →
   `(idx_map[i], idx_map[i+len(qn)-1] + 1, 0.99)`.
4. **Approché** (difflib) : seulement si `qn` compte ≥ 4 mots (split sur espace).
   `SequenceMatcher(a=qn.lower(), b=flat.lower(), autojunk=False)` ;
   `m = find_longest_match(0, len(a), 0, len(b))` ; exige
   `m.size >= max(20, int(len(qn) * min_ratio * 0.6))` (int = troncature) ;
   `b0 = max(0, m.b - m.a)` ; `b1 = min(len(flat), b0 + len(qn))` ;
   `ratio = SequenceMatcher(a=qn.lower(), b=flat[b0:b1].lower()).ratio()` ;
   accepté si `ratio >= min_ratio` et `b1-1 < len(idx_map)` →
   `(idx_map[b0], idx_map[b1-1] + 1, ratio)`. Sinon None.
   ⚠ Le port JS doit réimplémenter **exactement** l'algorithme difflib
   (`find_longest_match` avec b2j, et `ratio()` = 2*M/T via `get_matching_blocks`) —
   c'est le point de parité le plus lourd du module.

### 6.5 `util.neutraliser_balises(texte)`

Regex IGNORECASE : `</?\s*(PORTFOLIO|FEUILLES|DOSSIER|FICHE|FICHES_POLE|EXTRAITS|
BRIEFING|REQUISITOIRE|PLAIDOIRIE|REPLIQUE|AVIS_JURES|RELANCE|MA_POSITION_R1|GARDIENS|
VERDICT_CALCULE)\s*>` → dans la correspondance, `<`→`‹` et `>`→`›`.

### 6.6 `util.extract_json(text, last=True)`

1. Blocs ` ```json ` ou ` ``` ` (regex `` ```(?:json)?\s*\n(.*?)\n``` ``, DOTALL),
   parcourus **du dernier au premier** (last=True) ; pour chaque candidat : tentative
   brute puis réparée (`_repair_json` : guillemets typographiques `“”→"`, `’→'`,
   virgules finales `,\s*([}\]])` supprimées).
2. Fallback : balayage caractère par caractère des objets `{...}` équilibrés au niveau
   0, avec gestion des chaînes (`"`) et échappements (`\`) ; candidats du dernier au
   premier, brut puis réparé. Échec → None.

### 6.7 `util.stable_hash(s)` et `util.empreinte(*parts)`

- `stable_hash(s) = parseInt(md5(utf8(s)).hexdigest()[:12], 16)` — entier < 2^48,
  exact en Number JS.
- `empreinte(*parts)` = `stable_hash(dumps).toString(16)` (sans zéros de tête) où
  `dumps` = **json.dumps Python** : `sort_keys=True`, `ensure_ascii=False`,
  `default=str`, séparateurs par défaut `", "` / `": "` (avec espaces !), tuples →
  tableaux, `None→null`, `True/False→true/false`, floats en repr Python le plus court
  (`1.0` → `"1.0"`, jamais `"1"`). À réimplémenter en JS (un `pyJsonDumps`).

### 6.8 `util.write_json` / `write_text`

- `write_json` : `json.dump(obj, indent=2, ensure_ascii=False)` + `"\n"` final.
  Avec `indent`, les séparateurs Python sont `(",", ": ")` (pas d'espace après la
  virgule, retour ligne + indentation). Ordre des clés = **ordre d'insertion**.
  Floats : `1.0` s'écrit `1.0` (⚠ JSON.stringify écrirait `1`) — il faut préserver
  la distinction int/float du Python pour les champs calculés (`poids`, `confiance`,
  `ratio`, `heat`, `conf`, `conf_moyenne`… sont des **floats** même quand ils valent
  un entier ; `score_preuves`, compteurs, `start/end` sont des **ints** ;
  `score_preuves` peut aussi valoir la chaîne `"R"` au tribunal).
- Création récursive des dossiers parents ; UTF-8.

---

## 7. Points de vigilance parité (à traiter comme des exigences)

### 7.1 Décisions de routage — table de vérité

| Situation | Décision |
|---|---|
| consensus `non détectée` / `minoritaire` | verdict absent (0 LLM), etage `non-détectée` / `minoritaire` |
| consensus `corroborée` / `à instruire` | greffier + juge léger ×N |
| greffier : `DOSSIER VIDE` (400 premiers caractères, upper) | `présence non établie`, etage `tribunal-court-circuit`, conf 0.9 — compté dans `rejetes_jury` (déclassement !) |
| panne greffier / panne léger / lecture illisible | tribunal |
| N lectures `établie` + pièces communes ancrées (≥1 preuve ou ≥2 indices) | publiée par le léger (ou contre-lecture d'abord si activée) |
| concordance `établie` sans pièces ancrables | tribunal |
| contre-lecture ≠ `présence établie`, en panne ou illisible | tribunal |
| N lectures `non établie` | `présence non établie` par le léger |
| statuts mélangés ou `renvoi` | tribunal |
| tribunal `présence non établie` (etage tribunal/court-circuit) | déclassement des spans + élagage des calques du run + suspicions marquées `jugee` |

### 7.2 Ordres d'itération de dicts et tris stables

- Tous les dicts Python conservent l'**ordre d'insertion** → reproduire avec des
  `Map`/objets en insérant dans le même ordre (clés de `carto`, `verdicts`,
  `consensus`, `rollup`, `stats_jour`, `par_calque`…).
- Tous les `sorted(…, key=…)` Python sont **stables** ; en JS, `Array.prototype.sort`
  est stable (ES2019+) mais le comparateur doit retourner la même relation :
  `-conf` → `(a,b) => b.conf - a.conf` ; tri de tuples → comparaison élément par
  élément (chaînes par unités de code UTF-16 ≈ code points Python pour le BMP ;
  ⚠ divergence possible hors BMP, cf. astral).
- `a_examiner` et `au_tribunal` : tri par ratio décroissant, stable — l'ordre de base
  de `au_tribunal` est l'ordre d'ACHÈVEMENT des threads (§7.9).

### 7.3 Itération d'un `set` d'entiers (segments.cover)

`cover = [spans[i] for i in actifs]` itère un set CPython : pour des petits entiers,
l'ordre suit la table de hachage (h(i)=i) et l'historique add/discard — il n'est PAS
contractuellement croissant. Cet ordre n'influence que : l'ordre d'insertion de
`par_modele` (→ ordre de sommation flottante de `heat`) et l'ordre de sommation de
`conf_moyenne`. Décision de portage : itérer les indices actifs **en ordre croissant**
et considérer toute divergence d'arrondi au 4ᵉ/3ᵉ décimal comme un cas limite à
signaler (en pratique les valeurs mock sont des multiples exacts et ne divergent pas).

### 7.4 Modulo et décalages sur les hashs

- `stable_hash(...) % (2**31 - 1)` : opérandes positifs → `%` JS équivalent.
- `permutation` : `h % n` (h ≥ 0) OK ; `(h >> 8) % 2` → **pas** l'opérateur `>>` JS
  (32 bits) : `Math.floor(h / 256) % 2`.
- Aucun modulo sur négatif dans ces deux modules, mais rester vigilant si un hash
  devenait signé.

### 7.5 Arrondis et formatage

- `round(x, n)` Python = arrondi au plus proche, **ties-to-even**, sur le double
  binaire (implémenté via la représentation décimale correcte). `Math.round` et
  `toFixed` ne suffisent PAS : fournir un `pyRound(x, n)` (p. ex. via conversion
  décimale exacte du double). Occurrences : `ratio` (3), `heat` (4),
  `conf_moyenne` (3), toutes les `confiance` (3), `1.0 - ratio` (3).
- `%.2f` (marks heatmap, `_bloc_calques`, detail sous-seuil `"%s @%.2f"`) : rendu du
  double le plus proche à 2 décimales — `toFixed(2)` est équivalent pour les doubles
  usuels (les vraies égalités décimales à mi-chemin n'existent que pour des binaires
  exacts type 0.125 ; à tester dans l'oracle).
- `%d`, `%s`, `%x` : formatage direct ; `str()` d'un float Python (repr court) si un
  float passait par `%s` — ici les `%s` reçoivent des chaînes/ints.

### 7.6 Sérialisation JSON

- Fichiers `write_json` : indent 2, `ensure_ascii=False`, séparateurs `(",", ": ")`,
  newline final, ordre d'insertion, distinction int/float (§6.8).
- `empreinte` : json.dumps compact-avec-espaces `(", ", ": ")`, `sort_keys=True`,
  `default=str`. Toute différence d'un octet change l'empreinte → change la reprise
  et `calque_id` indirectement. Écrire un sérialiseur dédié et le tester contre des
  vecteurs générés par Python.
- `ecrire_viewer` : dumps par défaut (`", "` / `": "`), sans tri de clés.

### 7.7 Chaînes hashées / formats à l'octet près

Reproduire **exactement** (format `%`, séparateurs, casse) :
`"fiche|%s|P%d"`, `"leger|%s|%s|%d"`, `"contre|%s|%s"`, labels
(`tag_…`, `greffier_…`, `leger_…_p%d`, `contre-lecture_…`, `lecteur_…_impression`),
`calque_id = "%s@%s.%s"`, `FEUILLES = "═══ Feuille : %s ═══\n%s\n"`,
lignes `_bloc_calques`, `marque = "tribunal du %s : non retenue"`, toutes les
prescriptions/résolutions/questions citées en §4 (elles atterrissent dans le JSON).

### 7.8 Regex et Unicode

- Porter les regex en conservant : lookbehind `(?<=[.!?])`, classes `\s`/`\d`/`\b`
  (⚠ en JS utiliser le flag `u` avec prudence : `\s` JS ≈ `\s` Python mais `\b` est
  ASCII dans les deux ; `\d` Python str est Unicode-décimal, JS ASCII — les motifs
  concernés ne matchent que des chiffres ASCII en pratique, à couvrir par tests),
  IGNORECASE (accents : `é` vs `É` — Python et JS `i` gèrent le BMP pareil), DOTALL
  (`s` en JS).
- `str.lower()` Python vs `toLowerCase()` JS : identiques sur le français courant ;
  divergences connues (ı, İ, ς) improbables ici mais l'oracle tranchera.
- `str.strip()` Python retire les blancs Unicode (dont U+00A0, U+202F) — `trim()`
  JS aussi ; `strip("«»\"' ")` retire un JEU de caractères aux deux bouts
  (pas une chaîne) : à implémenter manuellement.
- Slicing par caractères : les index de `find_verbatim`/spans sont des index de
  **code units** ? Non — Python indexe par **points de code**. En JS, les chaînes
  sont en UTF-16 : si le portfolio contient des caractères hors BMP (émojis), tous
  les index (`start`, `end`, longueurs 60/400/1200, `[:240]`, `[:300]`, `[:400]`)
  divergent. Décision de portage : soit travailler en tableaux de points de code,
  soit documenter la contrainte « BMP uniquement » et la faire vérifier par l'oracle.

### 7.9 Non-déterminisme résiduel du Python (à neutraliser dans l'oracle)

Même côté Python, trois choses ne sont PAS bit-stables d'un run à l'autre :
1. `horodatage` (`datetime.now()`) → `calque_id`, descripteurs, magasin de calques ;
2. l'ordre d'ACHÈVEMENT des ThreadPools → ordre des clés de `legers`
   (= `details_leger`), de `verdicts_leger`, base du tri de `au_tribunal`, ordre
   d'accumulation de `resultats[name]` quand un lecteur a des tags sur plusieurs
   pôles (donc ordre des spans à égalité de confiance), ordre des clés de
   `incidents_jour`, de `stats_jour` ;
3. `marque_run = empreinte(base_dir)[:6]` dépend du chemin absolu du run.
Le port JS doit adopter un ordre déterministe (ordre des jobs) et l'oracle de parité
doit comparer ces zones de façon insensible à l'ordre (tri canonique des clés) ou
exécuter Python avec `max_workers=1` et horloge/chemin fixés.

### 7.10 Divers pièges Python

- `if not ctx["config"].get("premiere_impression", True)` : `false` explicite
  désactive ; toute valeur falsy (0, "", None) aussi.
- `cfg.get("contre_lecture", False)` : truthy test (pas `is True`).
- `partages` est un `defaultdict(bool)` : lire `partages[code]` retourne `false`
  par défaut (et l'insère — sans effet observable).
- `float("0.7")` accepte les confiances envoyées en chaîne ; `float(True) == 1.0` ;
  seul TypeError/ValueError retombe sur 0.5 (⚠ `Number("abc")` JS donne NaN, pas une
  exception : détecter NaN ET les types non convertibles comme en Python — `null` →
  TypeError → 0.5, tandis que `Number(null)` JS donnerait 0).
- `re.match(r"\d{4}-\d{2}-\d{2}", str(date))` = ancré au DÉBUT seulement
  (préfixe) — `"2024-01-02 et après"` passe.
- `(extrait or "")[:300] or None` : chaîne vide → null.
- `len(...) or None` (validations.lectures_leger) : 0 → null.
- `int(...)` sur les seuils/config = troncature vers zéro (`parseInt`/`Math.trunc`).
- `sorted(cites)` sur des ints ; `sorted(statuts)` sur des chaînes accentuées : tri
  Python par points de code (`"présence établie" < "présence non établie"` car
  `é` (U+00E9) > `n` ? non : comparer code à code — reproduire par comparaison
  d'unités de code, PAS `localeCompare`).
- `dict(t, juge=marque)` = copie superficielle + champ ; `dict(jr, sentences=…)` idem.
- `verdicts_leger` peut contenir un verdict `tribunal-court-circuit` (dossier vide via
  le chemin léger) — il compte dans `rejetes_jury` mais PAS dans « établies par
  tribunal » du log.

---

## 8. Dépendances vers les autres modules (résumé)

| Module | Utilisé pour | Spec |
|---|---|---|
| `heatmap.py` | `ancrer`, `segments` (cœur) ; `ecrire_sorties`/`ecrire_viewer` (autres orchestrateurs) | ce document |
| `util.py` | `stable_hash`, `empreinte`, `find_verbatim`, `extract_json`, `neutraliser_balises`, IO, logs | §6.4–6.8 (contrats repris ici) |
| `referentiel.py` | `Pole.fiche_complete`, `permutation` | §6.2–6.3 |
| `templates.py` | `resolve_file` (`{$VAR}`) | §5 |
| `tribunal9.py` | greffier, parse des pièces, tribunal complet, personas | spec-tribunal9 (les contrats minimaux nécessaires sont en §6.1) |
| `backends.py` | `call(...)` ; mock déterministe piloté par `(salt, task, meta)` | spec-backends |

Appelant : `scan9.py` / orchestrateur du run (construit `ctx`, `jr`, `roster`,
`backends`, puis appelle `cartographier_journee` journée par journée).
