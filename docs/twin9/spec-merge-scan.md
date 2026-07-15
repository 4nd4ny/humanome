# SPEC — Portage JS de `aurora/merge3.py` (849 l.) et `aurora/scan9.py` (373 l.)

> **Contrat de portage.** Ce document décrit le comportement BIT-À-BIT des deux
> modules. Le mode mock déterministe (`--salt`) sert d'oracle de parité : les
> `task`/`meta` passés à `backend.call` pilotent la sortie du mock, le prompt et
> le `label` entrent dans les métriques (`CallRecord`) — tout cela, plus chaque
> tri, arrondi et ordre d'insertion de dict, DOIT être reproduit à l'identique.
>
> **Confidentialité.** Les fichiers `protocole/**/*.md` (prompts) sont
> confidentiels : ils sont référencés ici par chemin, variables de gabarit et
> contrat de sortie JSON uniquement. Ne jamais recopier leur texte.

---

## 0. Rôle des modules

- **`merge3.py`** — fusion des cartographies journalières en une carte
  évolutive ADDITIVE. Agrégation 100 % mécanique (statuts, trajectoires,
  profil ipsatif, gardien des formulations) ; seule la mise en récit
  (relectures kairos/pôles/histoires/rapporteur) est générative. Produit les
  artefacts finaux : `carto_evolutive.json` (contrat vital du visualiseur),
  `rapport_evolutif.md`, `rapport.md`, `profil_ipsatif.json`,
  `viewer/carto-evolutive-data.js`.
- **`scan9.py`** — « l'Arpenteur » : scan global du portfolio, sans grille.
  Condensé fidèle par journée (incrémental par empreinte) → passe globale sur
  le condensé entier → retour aux sources sur le texte brut → ancrage
  mécanique (`find_verbatim`) → versement additif de graines
  `source="scan-global"` et d'observations (orphelines/continuités). Il ne
  publie aucun statut. Produit `scan_global.json`.

Ordre d'orchestration (appelant, hors périmètre de ce fichier) :
`fusionner` → `arpenter` (étape 9bis) → `second_ressort` → `relectures` →
`ecrire_sorties`.

---

## 1. Contrats des dépendances utilisées (extraits de `util.py`, `templates.py`, `journee.py`, `tribunal9.py`)

Ces fonctions ont leur propre spec ailleurs, mais leur comportement exact est
load-bearing ici ; contrats minimaux à respecter :

### 1.1 `stable_hash(s)` et `empreinte(*parts)` — SEEDS DE PARITÉ

```python
def stable_hash(s):
    return int(hashlib.md5(s.encode("utf-8")).hexdigest()[:12], 16)

def empreinte(*parts):
    return "%x" % stable_hash(json.dumps(parts, sort_keys=True,
                                         ensure_ascii=False, default=str))
```

- `json.dumps` de Python avec ses séparateurs PAR DÉFAUT : `", "` entre
  éléments et `": "` après les clés (PAS la forme compacte de
  `JSON.stringify`). `sort_keys=True` trie les clés des objets ; les tuples
  Python deviennent des tableaux JSON ; `None`→`null`, `True`→`true` ;
  `default=str` convertit tout non-sérialisable via `str()`.
- md5 de l'UTF-8, on garde les **12 premiers caractères hex**, parsés en
  entier base 16, re-formatés `"%x"` (hex minuscule, sans zéros de tête).
  En JS : BigInt ou parseInt sur 48 bits (12 hex = 48 bits, sûr en Number
  mais attention au formatage sans zéros de tête).

### 1.2 `extract_json(text, last=True)`

1. Cherche tous les blocs `` ```json\n...\n``` `` ou `` ```\n...\n``` ``
   (regex `` ```(?:json)?\s*\n(.*?)\n``` `` en DOTALL) ; essaie chaque
   candidat en partant du DERNIER, tel quel puis « réparé » (guillemets
   typographiques `“”’` → droits, virgules finales avant `}` ou `]`
   supprimées).
2. Repli : balayage caractère par caractère des objets `{...}` équilibrés au
   niveau 0 (avec gestion des chaînes et échappements), essai du dernier vers
   le premier, tel quel puis réparé.
3. `None` si rien ne parse.

### 1.3 `neutraliser_balises(texte)`

Remplace `<` et `>` par `‹` `›` dans toute balise ouvrante/fermante (insensible
à la casse, espaces tolérés : `</?\s*(NOM)\s*>`) parmi : `PORTFOLIO, FEUILLES,
DOSSIER, FICHE, FICHES_POLE, EXTRAITS, BRIEFING, REQUISITOIRE, PLAIDOIRIE,
REPLIQUE, AVIS_JURES, RELANCE, MA_POSITION_R1, GARDIENS, VERDICT_CALCULE`.
`None` → `""`.

### 1.4 `find_verbatim(source, quote, min_ratio=0.82)` → `(start, end, ratio) | None`

Utilisé par `scan9._retour_aux_sources`. Trois étages : exact (`ratio=1.0`) ;
normalisé espaces+typographie insensible à la casse (`ratio=0.99`, indices
re-mappés vers la source) ; approximatif difflib (`SequenceMatcher`,
`autojunk=False`, `find_longest_match`, seuils `m.size >= max(20,
int(len(qn)*min_ratio*0.6))` puis `ratio >= min_ratio`). Le quote est d'abord
`strip()` puis débarrassé de `«»"' ` en bord et de `[...]`. Voir la spec
d'`util.py` pour l'algorithme intégral (le portage difflib est délicat).

### 1.5 `resolve_file(path, variables, strict=False)`

Lit le fichier UTF-8 et remplace chaque `{$VAR}` (regex
`\{\$([A-Z_][A-Z0-9_]*)\}`) par `str(variables["VAR"])`. Variable absente :
laissée telle quelle + warning (pas d'erreur en mode non strict).

### 1.6 `write_json(path, obj)` / `write_text(path, content)`

- `write_json` : `mkdir -p` du dossier, `json.dump(obj, ensure_ascii=False,
  indent=2)` **+ un `\n` final**. Indentation Python : 2 espaces, séparateurs
  `,` (item) et `": "` (clé) — vérifier que la sérialisation JS produit
  l'octet-à-octet identique (ordre des clés = ordre d'insertion ; pas de tri).
- `write_text` : écrit tel quel en UTF-8.

### 1.7 `journee._sentences_de(texte, jid)` → `[(jid, phrase), ...]`

Pour chaque ligne (`splitlines()`), `strip()` ; ignorée si elle commence par
`#` ou si `len < 60` ; sinon découpe sur `(?<=[.!?])\s+` ; chaque phrase
`strip()`ée est gardée si `60 <= len <= 400`. Les longueurs sont en POINTS DE
CODE Python (voir §7.4). Ces tuples partent dans `meta["sentences"]` (mock).

### 1.8 `journee._suspicion(code, nom, jr, source, extrait=None, detail=None)` → dict graine

```json
{"code": .., "nom": .., "journee": jr["id"], "date": jr.get("date"),
 "source": .., "detail": detail, "extrait": (extrait or "")[:300] or null,
 "question": Q}
```
`Q` = phrase associée à `source` dans la table `_QUESTIONS` de `journee.py`
(pour `"scan-global"` : `"La lecture du portfolio entier a relié ceci que le
découpage en journées avait dispersé — qu'en dis-tu ?"`) ; si `Q` contient
`%s`, il est remplacé par `nom`. Ordre des clés EXACT (sérialisé dans les
états et les JSON de sortie).

### 1.9 `tribunal9.infos_personas()` et `tribunal9.juger_faisceau(...)`

- `infos_personas()` → `{"version": "personas-v1", "empreinte": "%x" %
  stable_hash("|".join("%s=%s" % (n, BANQUE_ANGLES[n]) for n in
  sorted(BANQUE_ANGLES)))}` (tri des noms de personas par point de code).
- `juger_faisceau(backend, protocole_dir, tdir, pole, comp, suspicions,
  periode, config, incidents, textes_par_journee, rapide=None)` → verdict
  « Schéma 1 » avec `verdict["etage"] = "faisceau"` (spec tribunal9). Champs
  consommés ici : `statut` (`"présence établie"` / `"présence non établie"` /
  `"renvoi au cartographe"`), `confiance`, `motif_regle`, `prescription`,
  `traces_probantes` (liste de `{extrait, date?}`), `jury`, `gardien`,
  `dossier_cartographe`, `deliberation`.

---

## 2. Structures d'entrée

### 2.1 `ctx` (dict, clés utilisées par ces deux modules)

| Clé | Type | Usage |
|---|---|---|
| `poles` | liste d'objets pôle : `.num` (int 1..7), `.nom` (str), `.competences` (liste de dicts `{code, nom, fiche_md, ...}`) | ordre canonique d'itération |
| `config` | dict config globale | `merge`, `scan_global`, `jury`, `backend_tribunal` |
| `base_dir` | str | racine des sorties du run |
| `protocole_dir` | str | racine des prompts |
| `impl_dir` | str | racine du code (source du viewer HTML) |
| `journal_id`, `date` | str | métadonnées |
| `incidents` | dict compteurs (muté) | `clé -> int` |
| `textes_journees` | dict `journee_id -> texte brut` | scan + faisceau |
| `etat_faisceaux` | dict persistant ou `None` | chose jugée du second ressort |
| `etat_scan` | dict persistant ou `None` | état de l'Arpenteur |
| `scan_global` | dict (posé par `verser`) | consommé par `relectures`/`ecrire_sorties` |
| `ancrage_stats` | dict (créé au besoin) | `{"arpenteur": {"ancres": n, "rejets": n}}` |
| `rapide` | booléen/backend optionnel | passé à `juger_faisceau` |

### 2.2 `cartos` — liste des cartographies journalières `cj`, ORDRE CHRONOLOGIQUE

Clés consommées : `journee` (id str), `date` (str ou None), `titre`,
`verdicts` (dict `code -> verdict`), `segments` (liste de
`{comps: [codes], heat: float, ...}`), `etablies` (liste de codes, ordonnée),
`renvois`, `graines` (liste de dicts §1.8), `premiere_impression` (str md),
`authenticite` (str), `consensus`, `legers`, `validations`, `spans_ecartes`,
`calques`, `rejets`, `alertes_injection`.

Verdict journalier (champs consommés) : `statut`, `etage`, `confiance`,
`score_preuves`, `score_indices`, `traces_probantes` (liste de
`{extrait, ...}`), `prescription` (`{pour_apprenant, pour_cartographe}`),
`dossier_cartographe` (`{motif, desaccord, pieges_envisages, citations}`),
`jury` (`{positions_finales: {nom->pos}, second_tour, relance_par}`), `motif`.

---

## 3. `merge3.py` — spécification intégrale

Constante module : `STATUT_FAISCEAU = "établie par faisceau (second ressort)"`.

### 3.1 `_statut_temporel(n_etablies, n_renvois)` → str

Ordre STRICT des tests :
1. `n_etablies >= 2` → `"présence consolidée"`
2. `n_etablies == 1` → `"présence établie (à confirmer)"`
3. `n_renvois >= 1` → `"renvoi au cartographe"`
4. sinon → `"présence non établie"`

### 3.2 `_trajectoire(jours_etablie, jours_signal, n_jours)` → str

- `jours_etablie` : liste des index de jour des attestations, ORDRE
  D'APPARITION (croissant par construction) ; `jours_signal` : liste triée
  d'index distincts.
- `tiers = max(1, (n_jours + 2) // 3)` — division ENTIÈRE PLANCHER
  (`Math.floor`), donc plafond arrondi : `n=1→1, n=4→2, n=7→3`.
- `dernier_tiers = {n_jours - tiers, ..., n_jours - 1}` (ensemble).
- Si `jours_etablie` vide : `len(jours_signal) >= 2` → `"frontière
  persistante"` ; ≥1 → `"signal isolé"` ; 0 → `"stable absente"`.
- Si un seul jour établi : dans le dernier tiers → `"émergence récente"`,
  sinon `"apparition isolée"`.
- Si aucun jour établi n'intersecte le dernier tiers → `"en sommeil"`.
- Sinon `ecarts = [j[k+1]-j[k]]` ; `max(ecarts) > tiers` → `"intermittence"`,
  sinon `"consolidation"`. (`ecarts` est non vide ici car ≥ 2 jours établis.)

### 3.3 `fusionner(ctx, cartos)` → `competences` (dict `code -> comp`)

Ordre d'itération : `for pole in ctx["poles"]: for comp in pole.competences:`
— c'est l'ORDRE D'INSERTION du dict résultat (61 entrées, toutes les
compétences, y compris absentes). Pour chaque code :

1. Pour chaque jour `i, cj` (ordre chronologique) :
   - `v = cj["verdicts"].get(code) or {}` ;
   - **heat** : max des `g.get("heat", 0.0)` des segments dont
     `code in g.get("comps", [])` ; `heat_tl.append(round(heat, 3))`
     (round Python half-even, §7.1) ;
   - `v["statut"] == "présence établie"` → attestation :
     ```json
     {"jour_index": i, "journee": cj["journee"], "date": cj.get("date"),
      "etage": v.get("etage"), "confiance": v.get("confiance"),
      "score_preuves": v.get("score_preuves"),
      "score_indices": v.get("score_indices"),
      "citations": [t.get("extrait","")[:300]
                    pour t dans (v.get("traces_probantes") or [])[:3]]}
     ```
   - sinon `v["statut"] == "renvoi au cartographe"` → signal
     `{"jour_index": i, "journee": .., "type": "renvoi"}` ;
   - sinon `v.get("etage") == "minoritaire"` → signal `type: "minoritaire"` ;
   - sinon si `v["statut"] == "présence non établie"` ET
     `str(v.get("etage","")).split("-")[0] in ("tribunal","leger")`
     (donc `"tribunal-court-circuit"` compte, `"non-détectée"` non) →
     signal `type: "instruite"` ;
   - **graines** : chaque `gr` de `cj.get("graines", [])` avec
     `gr["code"] == code` est ajoutée à `graines_par_code[code]` si
     `gr not in graines_par_code[code]` — **égalité PROFONDE de dicts**
     (mêmes clés/valeurs), pas identité (§7.6).
2. Agrégats :
   - `je` = `[a["jour_index"] for a in attestations]` ;
     `js` = `sorted(set des jour_index des signaux))` ;
   - `n_renvois` = nombre de signaux `type == "renvoi"` ;
   - `sp` = somme des `score_preuves` qui sont `isinstance(int)` — **en
     Python `bool` EST un `int`** (True→1) mais `"R"`/None/float sont exclus ;
   - `si` = idem pour `score_indices` ;
   - `confs` = confiances `isinstance((int, float))` ;
     `cmoy = round(sum/len, 3)` si non vide sinon `0.0` ;
   - `score_cumule = round(sp + si*cmoy, 3)`.
3. Entrée finale, ORDRE DE CLÉS EXACT (sérialisé tel quel dans les JSON) :
   ```
   code, nom, pole (int), statut_temporel (=_statut_temporel(len(attestations),
   n_renvois)), trajectoire (=_trajectoire(je, js, n_jours)), attestations,
   signaux, heat_timeline, cumul_preuves (sp), cumul_indices (si),
   confiance_moyenne (cmoy), score_cumule, graines (=graines_par_code[code]),
   graines_recurrentes (bool : >= 2 journees distinctes parmi les graines),
   faisceau (null)
   ```

### 3.4 `second_ressort(ctx, cartos, competences, backend)` → `out` (dict `code -> verdict`)

Config : `cfg = ctx["config"].get("merge", {})`.
- `cfg.get("second_ressort", True)` faux → log
  `"Merge_v3 : second ressort désactivé (config)"`, retour `{}`.
- `seuil_j = int(cfg.get("seuil_faisceau_journees", 2))`.
- `fiches` : `code -> (pole, comp)` construit par double boucle poles/comps.
- `dates = [c.get("date") or c["journee"] for c in cartos]` ;
  `periode = "%s → %s" % (dates[0], dates[-1])` si non vide, sinon `"-"`
  (flèche U+2192 entourée d'espaces).
- `idx_jour` : pour chaque jour `i` : `idx_jour[journee]=i` puis, si `date`,
  `idx_jour[date]=i` (une date partagée : le DERNIER jour gagne, affectation
  directe).

**Candidats** : itération sur `competences.values()` (ordre d'insertion §3.3).
Retenu si `statut_temporel in ("présence non établie", "renvoi au
cartographe")` ET `len(jours) >= seuil_j` où `jours = {g["journee"] pour g
dans graines si g.get("extrait") et non g.get("jugee")}` (FAIT NOUVEAU : les
graines déjà jugées ne déclenchent pas). Tri : `candidats.sort(key=(-nb_jours,
code))` — décroissant par nb de journées, puis code croissant (point de code).

**Pour chaque candidat** (dans cet ordre) :
1. `pieces = [g for g in c["graines"] if g.get("extrait")]` ;
   `fp_dossier = empreinte(sorted((g.get("journee"), g.get("extrait"),
   bool(g.get("jugee"))) for g in pieces))` — tri Python de TRIPLETS
   (str, str, bool) : comparaison lexicographique élément par élément,
   `False < True` ; l'appel `empreinte(liste)` sérialise
   `[[journee, extrait, bool], ...]` dans un tableau englobant (§1.1).
2. **Chose jugée** : `ancien = (etat_faisceaux or {}).get(code)` ; si
   `ancien["empreinte"] == fp_dossier` et `ancien["verdict"]` truthy →
   `verdict = ancien["verdict"]`, log
   `"Second ressort %s : chose jugée (dossier inchangé) — verdict repris sans
   nouvelle instruction"`. AUCUN PLAFOND de candidats.
3. Sinon : `tdir = base_dir/second_ressort/<code>` ;
   `verdict = juger_faisceau(backend, protocole_dir, tdir, pole, comp,
   c["graines"], periode, ctx["config"], ctx["incidents"],
   ctx["textes_journees"], rapide=ctx.get("rapide"))`.
   - Si `verdict["statut"] == "présence non établie"` : pour CHAQUE graine
     avec extrait et non jugée, MUTATION `g["jugee"] = "second ressort (%s) :
     faisceau non retenu" % periode` — ces dicts sont PARTAGÉS avec l'état
     persistant du scan : la marque survit d'un run à l'autre.
   - Si `etat_faisceaux is not None` :
     `etat_faisceaux[code] = {"empreinte": fp_dossier, "verdict": verdict}`.
4. Toujours : `out[code] = verdict` ; `c["faisceau"] = {"statut", "confiance",
   "motif": verdict.get("motif_regle"), "prescription", "traces":
   verdict.get("traces_probantes") or [], "jury", "gardien",
   "dossier_cartographe", "deliberation"}` (ordre de clés exact).
5. Si `statut == "présence établie"` :
   - `c["statut_temporel"] = STATUT_FAISCEAU` ;
   - regroupement des traces par `t.get("date") or "-"` :
     `par_jour[d].append(t.get("extrait","")[:300])` (ordre des traces
     préservé) ; puis `for d, cits in sorted(par_jour.items())` (tri par clé,
     point de code) → append d'une attestation :
     ```json
     {"jour_index": idx_jour.get(d, 0), "journee": d, "date": d,
      "etage": "faisceau", "confiance": verdict["confiance"],
      "score_preuves": 0, "score_indices": len(cits),
      "citations": cits[:3]}
     ```
6. Si `statut == "renvoi au cartographe"` :
   `c["statut_temporel"] = "renvoi au cartographe"` ; append signal
   `{"jour_index": null, "journee": "second-ressort", "type": "faisceau-renvoi"}`.

Log final si des dossiers ont été instruits :
`"Second ressort : %d faisceaux instruits — %d établis, %d renvois, %d non
établis"`.

### 3.5 `profil_ipsatif(competences)` → dict (0 LLM)

- `etablies` = compétences dont `statut_temporel in ("présence consolidée",
  "présence établie (à confirmer)", STATUT_FAISCEAU)` ET `score_cumule > 0`,
  DANS L'ORDRE D'ITÉRATION du dict.
- `total = somme des score_cumule` (float).
- `par_pole` pré-initialisé pour les 7 noms DANS CET ORDRE :
  `TETE, COEUR, MAIN, AME, RACINES, CITE, FLAMBEAU`
  (mapping `_POLES_IPSATIF = {1:TETE, 2:COEUR, 3:MAIN, 4:AME, 5:RACINES,
  6:CITE, 7:FLAMBEAU}`), chacun `{"proportion": 0.0, "competences": []}`.
- Boucle sur `sorted(etablies, key=(-score_cumule, code))` (tri STABLE ;
  égalité parfaite impossible car le code départage) :
  - `prop = round(100.0 * score_cumule / total, 1)` si `total` truthy sinon
    `0.0` (round half-even §7.1) ;
  - append à `lignes` ; append à `par_pole[nom]["competences"]` du dict
    `{"code", "nom", "proportion": prop, "score_preuves": cumul_preuves,
    "score_indices": cumul_indices, "score": score_cumule}` ;
  - **`pp["proportion"] = round(pp["proportion"] + prop, 1)`** — accumulation
    AVEC ARRONDI INTERMÉDIAIRE à chaque pas : l'ordre d'addition (celui du tri
    ci-dessus) change le résultat, à reproduire tel quel.
- Retour (ordre de clés exact) :
  ```json
  {"competences_etablies": "%d / %d" % (len(etablies), len(competences)),
   "competences_renvoyees": <nb de statut "renvoi au cartographe">,
   "par_pole": {...7 entrées, même si vides...},
   "concentration": {
     "top_5_competences": [{"code","nom","proportion"} x lignes[:5]],
     "part_du_top_5": round(somme des 5 proportions, 1)}}
  ```

### 3.6 Aides des relectures

#### `_resume_jour(cj)` → str

```
### {journee} ({date ou "sans date"})[ — écriture perçue : {authenticite}]
Établies : {", ".join(etablies) ou "aucune"}
{citations}
```
`citations` : pour chaque code de `cj["etablies"][:4]`, `tr = (verdict
.traces_probantes or [{}])[0]` puis ligne `"%s : « %s »" % (code,
tr.get("extrait","")[:160])` — jointes par `\n` (chaîne vide si aucune
établie ; noter le `\n` final du gabarit avant le bloc citations même vide).
Format exact : `"### %s (%s)%s\nÉtablies : %s\n%s"`.

#### `_registre_tenu(competences, max_lignes=15)` → str

- `avec` = compétences avec `graines` non vides, triées par
  `-nombre de journées distinctes des graines` (tri STABLE : à égalité,
  l'ordre d'itération du dict est conservé).
- Pour chacune des `avec[:15]` :
  - `jours = sorted({g["journee"]})` ; `g0` = première graine avec `extrait`
    sinon `graines[0]` ; `jugees` = nb de graines avec `jugee` truthy ;
  - ligne : `"- %s — %s : %d signal(aux) sur %d journée(s) [%s]%s — sources :
    %s%s"` avec dans l'ordre : code, nom, `len(graines)`, `len(jours)`,
    `", ".join(jours)`, suffixe `" — dont %d déjà instruit(s) et non
    retenu(s)" % jugees` si `jugees` sinon `""`, `", ".join(sorted({g["source"]}))`,
    suffixe `" — « %s »" % g0["extrait"][:120]` si `g0.get("extrait")` sinon `""`.
- Ligne de débordement si `len(avec) > 15` :
  `"- (+ %d autres compétences avec signaux ténus)"`.
- Jointure `\n` ; si vide → `"(aucun signal ténu sur la période)"`.

#### `_appel_relecture(backend, prompt, task, meta, label, incidents)` → str|None

`backend.call(prompt, task=task, meta=meta, label=label).strip()` ; toute
exception → `incidents["relecture_echec"] += 1`, warn
`"Relecture %s indisponible (%s)"`, retour `None`. (Résilience : une relecture
perdue ne perd jamais la fusion.)

### 3.7 `relectures(ctx, cartos, competences, backend)` → `out`

`out` initial : `{"kairos_evolutif": None, "poles": {}, "histoires": {}}`.
Si `cfg.get("relectures", True)` faux → log
`"Merge_v3 : relectures génératives désactivées (config)"` et retour immédiat
(SANS clés `kairos` ni `rapport`).

Variables de base (toutes les relectures) :
`{"PREMIERE_DATE": dates[0], "DERNIERE_DATE": dates[-1], "NB_JOURNEES":
len(cartos), "DATES_LISTE": ", ".join(dates), "JOURNAL_ID": journal_id}` où
`dates = [c.get("date") or c["journee"]]`.
`noms = {code: nom}` depuis `competences.values()`.

#### 3.7.1 Kairos évolutif (1 appel)

`DONNEES` = jointure par `"\n\n"` des blocs suivants, DANS L'ORDRE :

1. `"### Résumés journaliers (citations retenues par la procédure)"` puis
   `"\n\n".join(_resume_jour(c))`.
2. `"### Premières impressions du Lecteur (indicateurs)"` puis une ligne par
   jour : `"- %s : écriture perçue « %s »%s"` avec `authenticite or "?"` et,
   si la regex `## Question spontanée\s*\n(.+)` (re.search, `.` ne franchit
   pas la ligne) matche `premiere_impression or ""`, le suffixe
   `" — question du Lecteur : " + m.group(1).strip()[:160]`.
3. `"### Statuts calculés par la procédure (INTANGIBLES — tu racontes, tu ne
   requalifies pas)"` puis lignes `"- %s %s — %s (%s)"` (code, nom,
   statut_temporel, trajectoire) pour les compétences triées PAR CODE dont
   `statut_temporel != "présence non établie"` OU `graines` non vides.
4. `"### Registre des signaux ténus (suspicions conservées, jamais publiées)"`
   puis `_registre_tenu(competences)`.
5. CONDITIONNEL — si `ctx["scan_global"]` a `orphelines` ou `continuites` :
   - pour chaque orpheline : `ex = " ; ".join("« %s » (%s)" %
     (e["verbatim"][:120], e.get("date") or e["journee"]) pour
     extraits_ancres[:2])` puis ligne
     `"- [hors référentiel] %s : %s — extraits : %s — hypothèse : %s — test :
     %s"` (titre or "?", description or "", ex, hypotheseFalsifiable or "-",
     testEntretien or "-") ;
   - pour chaque continuité : `jrs = sorted({date or journee des
     extraits_ancres})`, `ex0 = extraits_ancres[0]["verbatim"][:100]` si non
     vide sinon `""`, ligne `"- [continuité, %s] %s : %s — « %s »"` ;
   - en-tête : `"### Observations du scan global (l'Arpenteur — le portfolio
     lu d'un seul tenant ; pièces ancrées dans le texte brut, PISTES jamais
     verdicts)"` puis les lignes jointes par `\n`.
6. `"### Profil ipsatif (distribution des 100 % du travail observé — pour
   calibrer formeProfil)"` puis lignes `"- %s : %.1f %% (%d compétence(s))"`
   pour les pôles NON VIDES (ordre d'insertion §3.5), plus la ligne
   `"- top 5 : " + ", ".join("%s (%s %%)" % (nom, proportion))` — noter le
   `%s` (repr du float, ex. `12.5`) et non `%.1f` ici ; repli
   `"(aucune compétence établie)"` si tout est vide (la ligne top 5 existe
   toujours, donc le repli n'arrive que si `lignes_ips` de pôles est vide ET…
   en pratique la ligne top-5 rend le bloc non vide : reproduire le code :
   `lignes_ips` = pôles non vides puis TOUJOURS append de la ligne top 5 ;
   `"\n".join(lignes_ips) or "(aucune compétence établie)"`).
7. `"### Le référentiel des 61 compétences (pour vérifier les orphelines)"`
   puis `"- %s %s"` par compétence (ordre poles→comps).

Prompt : `resolve_file(protocole_dir + "/merge/01-kairos-evolutif.md",
base ∪ {DONNEES})`. Appel : `task="merge_kairos"`, `meta={}`,
`label="merge_kairos"`.

Parsing : `data = extract_json(raw)` ; si dict avec `data["kairos"]` dict →
`kairos_struct = data` et `kairos_md = data["kairos"]["apprenant"]
["syntheseCompleteMarkdown"]` (via `.get`, tolère absences). Si `kairos_md`
falsy → `incidents["kairos_json_invalide"] += 1`, warn, `kairos_md = raw`.
`out["kairos"] = kairos_struct` (peut être None) ;
`out["kairos_evolutif"] = kairos_md`. Si `raw` est None : les deux restent
None (pas d'incident).

**Contrat de sortie du prompt kairos** (structure attendue, sans citer le
prompt) : objet JSON avec au moins `{"kairos": {"apprenant":
{"syntheseCompleteMarkdown": str}, "emergencesCrossPoles": {
"competencesOrphelines": [ {titre, description, testEntretien} ],
"connexionsTransversales": [ {titre, codesRelies, description} ],
"noeudsConceptuels": [ {nom, description} ],
"patternTemporel": {type, evidence},
"coherenceImpressionsVerdicts": {divergences} }}}`.

#### 3.7.2 Pôles évolutifs (7 appels)

Pour chaque pôle (ordre `ctx["poles"]`) : `codes` du pôle ; pour chaque jour,
`et = [c for c in cj["etablies"] if c in codes]` (ordre de `etablies`) ; si
non vide, ligne `"%s : %s"` avec `", ".join("%s (%s)" % (code,
noms.get(code, code)))`. Variables : base ∪ `{POLE_NUM, POLE_NOM,
DONNEES: "\n".join(lignes) or "(aucune présence établie sur la période)"}`.
Prompt `merge/02-pole-evolutif.md` ; `task="merge_pole"`,
`meta={"pole": num}`, `label="merge_pole_P%d"`. Si `raw` non None :
`out["poles"][str(num)] = raw` (clé CHAÎNE).

#### 3.7.3 Histoires de compétences (≤ `max_histoires`)

`cap = int(cfg.get("max_histoires", 12))`. `cibles` = compétences aux 3
statuts établis, triées par `-score_cumule` (tri STABLE, égalités dans
l'ordre du dict), tronquées `[:cap]`. Pour chacune :
- `occ` = lignes `"- %s (%s) : %s"` (journee, date or "-",
  `" / ".join('« %s »' % x[:120] for x in a["citations"])`) pour chaque
  attestation, jointes `\n` ;
- variables : base ∪ `{CODE, NOM, POLE_NUM: c["pole"], POLE_NOM (nom du pôle
  de même num), NB_JOURNEES_ETABLIES: len(attestations), STATUT_FINAL,
  TRAJECTOIRE, CUMUL_PREUVES, CUMUL_INDICES, CONFIANCE_MOY: confiance_moyenne,
  SCORE_CUMULE, DONNEES: occ or "(occurrence unique, voir attestation)"}` ;
- prompt `merge/03-competence-evolution.md` ; `task="merge_competence"`,
  `meta={"code": code}`, `label="merge_comp_%s"` ;
- si `raw` : `out["histoires"][code] = raw[:900]` (troncature points de code).

#### 3.7.4 Rapporteur (1 appel)

`out["rapport"] = None` d'abord. Si `cfg.get("rapporteur", True)` :
`ips = profil_ipsatif(competences)` (recalcul). `d` = liste de blocs, joints
en fin par `"\n\n"` :

1. `"### Premières impressions du Lecteur"` puis lignes
   `"- %s : écriture perçue « %s »"` (authenticite or "?").
2. `"### Territoires les plus denses (profil ipsatif, avec extraits
   verbatim)"` puis, pour chaque `t` du top 5 : `c = competences[t["code"]]`,
   `cit = next((x for a in reversed(attestations) for x in a["citations"]),
   "")` (première citation de la DERNIÈRE attestation qui en a), ligne
   `"- %s — %s (%s %% du profil, %s, %s) : « %s »"` (code, nom,
   `t["proportion"]` en `%s`, statut, trajectoire, `cit[:220]`) ; repli
   `"(aucune compétence établie)"`.
3. `"### Répartition par pôle (à traduire en langage humain, sans chiffres
   bruts)"` puis `"- %s : %.1f %% (%d compétence(s))"` pour pôles non vides ;
   repli `"(profil vide)"`.
4. `"### Non trouvées significatives (signaux ou graines présents)"` puis les
   compétences `statut == "présence non établie"` avec signaux ou graines,
   triées `-(len(graines)+len(signaux))` (stable), `[:6]`, lignes
   `"- %s %s (%d signal(aux), %d graine(s))"` ; repli `"(aucune)"`.
5. `"### Renvois au Cartographe (questions d'entretien disponibles)"` puis,
   pour chaque compétence `statut == "renvoi au cartographe"` (ordre du
   dict) : `q` obtenu en itérant `reversed(cartos)` avec
   `q = (verdict.prescription or {}).get("pour_cartographe") or q` — **la
   prescription du jour le plus ANCIEN qui en a une gagne** (chaque itération
   plus ancienne écrase si truthy) ; ligne `"- %s %s : %s"` avec
   `q or "dossier préparé"` ; repli `"(aucun renvoi)"`.
6. `gardien_formulations(cartos, competences, out)` (appelé sur `out` SANS
   rapport encore) → `"### Alertes du gardien des formulations et de pôle"`
   puis `"\n".join("- " + a for a in alertes_poles) + ("\n- %d
   formulation(s) signalée(s) à relire" % len(signalements) si signalements
   sinon "")` — si le tout est falsy (aucune alerte NI signalement) →
   `"(aucune)"`.
7. `"### Vigilance anti-gaming"` puis
   `"- instructions embarquées signalées : %d\n- journées à écriture perçue
   « produite » : %s"` avec `gaming = somme des len(alertes_injection)` et la
   liste des `journee` où `authenticite == "produite"` jointe `", "` ou
   `"aucune"`.
8. `"### Observations Kairos (structurées)"` puis
   `json.dumps(out.get("kairos") or {}, ensure_ascii=False)[:4000]` —
   séparateurs PAR DÉFAUT `", "`/`": "` (PAS compact), ordre d'insertion.

Prompt `merge/04-rapporteur.md`, variables base ∪ `{DONNEES}` ;
`task="merge_rapporteur"`, `meta={}`, `label="merge_rapporteur"`.
Parsing : `extract_json` ; si dict avec `data["rapport"]` dict →
`out["rapport"] = data["rapport"]` ; sinon (raw non None mais parse KO)
`incidents["rapporteur_json_invalide"] += 1` + warn. Contrat du rapport :
objet avec champs libres dont `rapport_complet_markdown` (str) et à défaut
`portrait`, `forme_profil`, `non_trouve`, `emergences`.

Log final :
`"Merge_v3 : relectures — kairos %s, %d pôles, %d histoires, rapporteur %s"`
(`"ok"`/`"indisponible"`).

### 3.8 `gardien_formulations(cartos, competences, rel)` → `(signalements, alertes)`

Liste EXACTE (ordre compris) des formulations interdites, minuscules — noter
les DOUBLONS apostrophe droite `'` / typographique `’`, et l'espace FINAL de
`"malgré "`, `"tu es "`, `"vous êtes "`, `"l'apprenant est "` :

```python
["n'a pas démontré", "n’a pas démontré", "manque de", "il faudrait que",
 "malheureusement", "insuffisant", "insuffisante", "lacune", "défaillance",
 "malgré ", "tu es ", "vous êtes ", "l'apprenant est ", "l’apprenant est "]
```

`_scan(texte, source)` : `low = (texte or "").lower()` (lowercase Unicode
Python ; pour le français `toLowerCase()` JS est équivalent) ; pour CHAQUE
formulation trouvée par sous-chaîne, append
`{"source": source, "formulation": f.strip()}` (le strip retire l'espace
final ; une même formulation peut être signalée par plusieurs sources, et
`"insuffisant"` matche aussi dans `"insuffisante"` → deux signalements pour
un texte contenant « insuffisante »).

Niveau 1 — parcours :
1. Pour chaque jour, chaque `(code, v)` de `cj["verdicts"].items()` (ordre
   d'insertion) : SKIP si `statut == "présence non établie"` ET `etage in
   ("non-détectée", "minoritaire")` ; sinon scan de
   `(v.get("prescription") or {}).get("pour_apprenant")`, source
   `"prescription %s @ %s" % (code, journee)`.
2. Scan de `rel.get("kairos_evolutif")`, source `"kairos évolutif"`.
3. Pour chaque `(n, t)` de `rel["poles"]` : source `"relecture pôle %s"`.
4. Pour chaque `(c, t)` de `rel["histoires"]` : source `"histoire %s"`.

Niveau 2 — alertes de pôle : compteurs par `c["pole"]` (int) : `renvois`
(statut renvoi), `etablies` (3 statuts établis), `graines` (a des graines).
Puis pour `sorted(par_pole.items())` (tri numérique des numéros de pôle) :
- `renvois >= 3` → `"Pôle %d : %d dossiers en renvoi — pattern de difficulté
  systémique possible, à contextualiser en entretien."` ;
- `etablies == 0 and graines >= 4` → `"Pôle %d : aucune présence établie mais
  %d compétences à graines — risque de découragement cumulatif si la
  restitution n'est pas accompagnée."`.
(Les deux alertes peuvent coexister pour un même pôle, dans cet ordre.)

### 3.9 `ecrire_sorties(ctx, cartos, competences, rel, roster)` → `carto_evo`

`dates = [c.get("date") or c["journee"]]`. `stats` : compteur par
`statut_temporel`, ordre d'insertion = ordre de PREMIÈRE RENCONTRE en itérant
`competences.values()`.

#### 3.9.1 `carto_evolutive.json` — CONTRAT DU VISUALISEUR (ordre de clés exact)

```json
{
  "journal_id": str,
  "date": str,
  "version": "Twin9",
  "personas": {"version": "personas-v1", "empreinte": hex-str},   // §1.9
  "jury_mode": str,        // str(config.jury.mode, défaut "socle4+1")
  "periode": {"debut": dates[0], "fin": dates[-1], "n_journees": len(cartos)},
  "roster": [m["name"] for m in roster],
  "statuts": {statut_temporel: int, ...},        // dict(stats), ordre §3.9
  "competences": { code: <entrée §3.3 enrichie §3.4>, ... },  // les 61
  "kairos_evolutif": str|null,
  "kairos": objet|null,
  "rapport": objet|null,
  "scan_global": objet|null,     // ctx["scan_global"], structure §4.10
  "profil_ipsatif": <§3.5>,
  "rapports_poles": { "1": str, ... },   // rel["poles"] (défaut {})
  "histoires": { code: str, ... }        // rel["histoires"] (défaut {})
}
```
Écrit via `write_json` (§1.6). ATTENTION : `rel.get("kairos")` /
`rel.get("rapport")` peuvent être ABSENTS de `rel` (relectures désactivées) →
`None`. `profil_ipsatif` est RECALCULÉ ici (après second ressort).

#### 3.9.2 `profil_ipsatif.json`

`write_json(base/profil_ipsatif.json, carto_evo["profil_ipsatif"])` (le même
objet).

#### 3.9.3 `rapport.md` (uniquement si `rel["rapport"]` truthy)

`md = rapport["rapport_complet_markdown"]` ; si falsy, repli : jointure
`"\n\n"` de `"## %s\n\n%s" % (titre, rapport.get(cle) or "")` pour les 4
paires ORDONNÉES : `("Portrait","portrait")`, `("La forme de votre
profil","forme_profil")`, `("Ce que le tribunal n'a pas
trouvé","non_trouve")`, `("Ce qui émerge entre les lignes","emergences")`.
Contenu du fichier :
`"# Cartographie de %s — %s\n\n%s\n" % (journal_id, date, md)`.

#### 3.9.4 `rapport_evolutif.md` — sections dans l'ordre

Liste `L` de lignes, fichier final = `"\n".join(L) + "\n"`.

**En-tête** :
```
# Cartographie évolutive — {journal_id}
*Twin9 — {date} — {n} journées ({dates[0]} → {dates[-1]})*
<vide>
{_PROCEDURE}
---
<vide>
```
`_PROCEDURE` est la constante Python suivante, à recopier OCTET POUR OCTET
(markdown, avec sa fin de ligne finale) :

```markdown
## Comment lire cette carte (la procédure, en clair)

Ce journal est passé devant un **tribunal des compétences** : plusieurs lecteurs
indépendants ont surligné le texte, chacun sur son calque, sans se concerter ; un
greffier — seul à voir la superposition des calques — a recopié les pièces mot pour
mot (jamais de paraphrase) ; chaque dossier a été lu **trois fois** par un juge
rapide qui présume l'absence puis attaque sa propre lecture ; seuls les
**désaccords** entre ces trois lectures ont convoqué le tribunal complet — où
**personne ne vote** : une découverte minoritaire rouvre l'examen, une contestation
argumentée bloque la publication, et le désaccord irréductible part chez
l'enseignant, dossier préparé. Les signaux trop faibles pour la carte ne sont pas jetés : ils vivent au
**registre des graines**, et quand ils reviennent de journée en journée, un tribunal
de **second ressort** examine s'ils forment ensemble un faisceau probant.

Chaque affirmation montre sa pièce. Tu peux donc contester trois choses : **la pièce**
(cette phrase ne dit pas cela), **la lecture** (cette phrase ne prouve pas cela),
**le doute** (ce cas méritait l'examen humain). Les absences sont des territoires
non visités — pas des manques.
```

**Kairos** (si `rel["kairos_evolutif"]`) : le texte, `""`, `"---"`, `""`.

**Carte additive** : titre `"# La carte additive"`, ligne vide, table markdown
`| Code | Compétence | Statut temporel | Trajectoire | Attestations |
Dernière trace |` + ligne de séparation exacte
`|------|------------|-----------------|-------------|--------------|----------------|`.
Pour chaque `code in sorted(competences)` (tri des CLÉS par point de code) :
SKIP si `statut == "présence non établie"` et ni signaux ni graines. `att` =
dates (`a.get("date") or a["journee"]`) jointes `", "` ou `"—"`. `cit` :
première citation de la DERNIÈRE attestation qui en a,
`"« %s »" % citations[0][:80].replace("|", "/")`, sinon `"—"`. Ligne
`"| %s | %s | %s | %s | %s | %s |"`. Puis `""`, la ligne
`"*Territoires non visités : %d compétences sans aucun signal sur la
période.*"` (compte des non-établies sans signaux ni graines), `""`.

**Second ressort** (si au moins un `c["faisceau"]` non null) : `"---"`, `""`,
`"# Second ressort — les faisceaux d'indices"`, `""`, la phrase en italique
`"*Compétences jamais établies en journée mais dont les signaux revenaient :
instruites au niveau de la trajectoire.*"`, `""` ; puis, TRIÉ PAR CODE :
`"- **%s %s** — %s (confiance %.2f) : %s" % (code, nom, f["statut"],
f["confiance"] or 0.0, f["motif"] or "")` (formatage `%.2f`) ; puis `""`.

**L'Arpenteur** (si `scan_global` a orphelines, continuites ou
graines_versees truthy) : `"---"`, `""`, `"# L'Arpenteur — ce que le
découpage en journées ne voit pas"`, `""`, le paragraphe italique EXACT :
```
*Le portfolio entier lu d'un seul regard (condensé fidèle par journée, puis retour au texte brut) : des pistes ancrées, jamais des verdicts. {g} graine(s) versée(s) au registre, {n} suspicion(s) non retrouvée(s) dans le texte brut (archivées), {r} extrait(s) rejeté(s) à l'ancrage.*
```
(construit par concaténation de littéraux adjacents — une seule ligne), `""`.
Puis TOUTES les orphelines (aucun plafond) :
`"### Hors référentiel — %s"` (titre or "?"), `"- %s"` (description or ""),
chaque extrait `"  - « %s » (%s)"` (verbatim[:200], date or journee), puis
conditionnels `"- **Pourquoi hors des 61** : %s"`,
`"- **Hypothèse falsifiable** : %s"`, `"- **Test en entretien** : %s"`,
`"- **Compétences les plus proches** : %s"` (jointure `", "`), puis `""`.
Puis les continuités : `"### Continuité — %s (%s)"` (titre or "?",
`", ".join(sorted({date or journee}))`), `"- %s%s"` (description or "",
suffixe `" — en relation avec : " + ", ".join(codes)` si `codes`), extraits
`[:4]` au même format `[:200]`, puis `""`.

**Émergences Kairos** : `kx = (rel.get("kairos") or {}).get
("emergencesCrossPoles") or {}` ; si l'une des listes
`competencesOrphelines/connexionsTransversales/noeudsConceptuels` est truthy
ou `patternTemporel` truthy : `"---"`, `""`, `"# Émergences structurées
(Kairos — pistes, jamais des verdicts)"`, `""` puis :
- orphelines `[:3]` : `"- **Orpheline — %s** : %s *(test en entretien : %s)*"`
  (`o.get("titre","?")`, `o.get("description","")`,
  `o.get("testEntretien","—")`) ;
- connexions `[:3]` : `"- **Connexion — %s** (%s) : %s"`
  (titre, `", ".join(codesRelies or [])`, description) ;
- nœuds `[:3]` : `"- **Nœud — %s** : %s"` (nom, description) ;
- si `patternTemporel.type` : `"- **Pattern temporel** : %s — %s"`
  (type, `evidence[:300]` défaut "") ;
- si `coherenceImpressionsVerdicts.divergences` :
  `"- **Cohérence impressions ↔ verdicts** : %s"` (`divergences[:300]`) ;
- puis `""`.

**Profil ipsatif** : `"---"`, `""`, `"# Le profil ipsatif (répartition des
100 % du travail observé)"`, `""`,
`"*Établies : %s — renvois : %s. Les absentes sont hors profil (pas des
zéros).*"` (`competences_etablies`, `competences_renvoyees` en `%s`), `""` ;
par pôle NON VIDE (ordre d'insertion) :
`"- **%s** : %.1f %% — %s"` avec la liste des 4 premières compétences
`"%s %.1f %%" % (code, proportion)` jointes `", "` ; puis
`"- **Concentration** : le top 5 porte %.1f %% du profil"` et `""`.

**Histoires** (si `rel["histoires"]`) : `"---"`, `""`,
`"# Histoires d'apprentissage"`, `""` ; pour chaque code TRIÉ :
`"**%s — %s** (%s, %s)"` (code, nom, statut, trajectoire), `""`, le texte,
`""`.

**Pôles** (si `rel["poles"]`) : `"---"`, `""`, `"# Évolution par pôle"`,
`""` ; pour chaque clé triée NUMÉRIQUEMENT (`key=int`) : le texte, `""`.

**Registre des graines** : `avec_graines` = compétences à graines triées par
`(-nb journées distinctes, code)`. Si non vide : `"---"`, `""`, `"# Registre
des graines (jamais des constats : des questions)"`, `""` ; par compétence :
`"- **%s %s** (%d journée%s%s) — sources : %s"` — `%s` pluriel = `"s"` si
`len(jours) > 1` sinon `""` ; suffixe récurrent `" — **récurrent**"` si
`graines_recurrentes` ; sources = `", ".join(sorted({g["source"]}))` ; puis,
si une graine a un extrait (première trouvée),
`"  - « %s » → *%s*" % (g0["extrait"][:160], g0["question"])` ; enfin `""`.

**Gardien** : `signalements, alertes_poles = gardien_formulations(cartos,
competences, rel)` (RE-calculé ; cette fois `rel` peut contenir `rapport`,
mais le gardien ne scanne pas le rapport). Si signalements :
`incidents["formulations_signalees"] += len(signalements)` ; `"---"`, `""`,
`"# Gardien des formulations (à relire par l'humain avant restitution)"`,
`""`, `"*Formulations mécaniquement détectées comme contraires aux règles
d'écriture Aurora — le gardien signale, il ne réécrit pas.*"` (une ligne),
`""` ; les 20 premiers : `"- %s : « %s »"` (source, formulation) ; ligne de
débordement `"- (+ %d autres signalements)"` ; `""`.

**Cahier du cartographe** : `cahier` = tuples `(code, ou, v, chemin)` :
- par jour puis par verdict (`items()`), si `statut == "renvoi au
  cartographe"` ET `dossier_cartographe` truthy :
  `(code, cj["journee"], v, "journees/%s/tribunal/%s/" % (journee, code))` ;
- par compétence à `faisceau` avec `dossier_cartographe` :
  `(code, "second ressort", f, "second_ressort/%s/" % code)`.
Si `cahier` ou `alertes_poles` : `"---"`, `""`, `"# Cahier du cartographe
(les dossiers qui appellent l'humain)"`, `""` ; chaque alerte
`"> ⚠ %s"` (U+26A0 + espace) ; si alertes → `""` ; puis pour chaque entrée
triée par `(code, ou)` :
```
### {code} {nom} — {ou}
- **Motif** : {dc.motif or v.motif or "-"}
- **Désaccord** : {dc.desaccord or "-"}
[- **Positions finales** : {", ".join("%s %s" % (n,p) pour items())}{ " — second tour relancé par %s" % relance_par si second_tour}]
[- **Question pour l'entretien** : {prescription.pour_cartographe}]
[- **Pièges envisagés** : {"; ".join(pieges_envisages)}]
[  - « {cit[:200]} » ×3 max]
- **Dossier complet** : `{chemin}`
<vide>
```

#### 3.9.5 Données du visualiseur — `viewer/carto-evolutive-data.js`

Filtre des verdicts embarqués :
`_garder(v)` = `statut != "présence non établie"` OU `etage in
("minoritaire", "tribunal", "tribunal-court-circuit")`.

Objet `data` (ordre de clés exact) :
```json
{"journal_id", "date", "personas", "jury_mode", "periode", "roster",
 "journees": [
   {"id": cj["journee"], "date", "titre",
    "texte": textes_journees.get(journee, ""),
    "segments", "etablies", "renvois", "premiere_impression",
    "authenticite", "consensus" (déf. {}), "legers" (déf. {}),
    "validations" (déf. {}), "graines" (déf. []), "spans_ecartes" (déf. []),
    "calques" (déf. []), "rejets" (déf. []), "alertes_injection" (déf. []),
    "verdicts": {code: v filtrés par _garder, ordre d'insertion}}
 ],
 "competences", "kairos_evolutif", "kairos", "rapport", "scan_global",
 "profil_ipsatif", "rapports_poles", "histoires"}
```
Fichier : `"window.CARTO9 = %s;\n" % json.dumps(data, ensure_ascii=False)`
— séparateurs PAR DÉFAUT (`", "`, `": "`), PAS d'indentation — puis
`.replace("</", "<\\/")` (échappe `</script>` dans les textes d'élèves).
Puis copie de `impl_dir/viewer/carto_evolutive.html` vers
`base/viewer/carto_evolutive.html` si la source existe, sinon warn
`"Visualiseur source introuvable : %s"`.

Log final :
`"carto_evolutive.json + rapport_evolutif.md + rapport.md (Rapporteur) +
profil_ipsatif.json + viewer/carto_evolutive.html"`. Retourne `carto_evo`.

---

## 4. `scan9.py` — spécification intégrale

Constante : `VERSION_SCAN = "scan-v1"`.

### 4.1 `_inc(ctx, cle)` — `incidents[cle] = incidents.get(cle, 0) + 1`.

### 4.2 `_appel(ctx, backend, prompt, task, meta, label)` → str|None

`backend.call(prompt, task=task, meta=meta, label=label)` — SANS `.strip()`
(contrairement à `_appel_relecture`). Exception → incident
`"scan_appel_echec"`, warn `"Arpenteur : appel %s indisponible (%s)"`, None.

### 4.3 `_jours_de(ctx, cartos)` → liste `{id, date, texte}`

Une entrée par jour de `cartos` (ordre chrono) dont
`ctx["textes_journees"].get(id)` a un `strip()` non vide (texte ORIGINAL
conservé, pas strippé).

### 4.4 `_condenser(ctx, jours, backend, etat_scan)` → nb de reprises

- `conds = etat_scan.setdefault("condenses", {})` ;
  `modele = (config.get("backend_tribunal") or {}).get("model")` (peut être
  None → `null` dans l'empreinte).
- Pour chaque jour : `fp = empreinte(texte, modele, VERSION_SCAN)` (3 parts).
  Si l'entrée existante a même empreinte ET un `condense` truthy →
  `reprises += 1`, skip (rien d'autre).
- Sinon appel : prompt `scan/00-condense-fidele.md`, variables
  `{JOURNEE_ID: id, DATE: date or "-", TEXTE: neutraliser_balises(texte)}` ;
  `task="condense"`, `meta={"journee": id, "sentences":
  _sentences_de(texte, id)}`, `label="condense_%s" % id`.
- Parsing : `extract_json(raw)` si raw ; `c = data.get("condense_fidele")` ;
  invalide si pas dict ou `resume` falsy → incident
  `"condense_json_invalide"`, warn `"Arpenteur : condensé %s invalide —
  journée absente de la passe globale de ce run (sera retentée au prochain)"`,
  continue (l'ANCIENNE entrée reste en l'état).
- Sinon : ARCHIVAGE — `archives = ent.get("archives", [])` si entrée
  existante sinon `[]` ; si l'entrée existante avait un `condense`,
  `archives = archives + [{"empreinte": ancien_fp, "condense": ancien}]`
  (nouvelle liste). Puis
  `conds[id] = {"empreinte": fp, "date": date, "condense": c,
  "archives": archives}`.
- Si `reprises` : log `"Arpenteur : %d condensé(s) repris sans relecture
  (empreintes)"`.

Contrat de sortie du prompt condensé : objet `{"condense_fidele": {"resume":
str, "forme": str?, "singularites": str?, "pepites": [str]?}}`.

### 4.5 `_passe_globale(ctx, jours, backend, etat_scan)` → `(arpentage|None, nouveau: bool)`

- Blocs : pour chaque jour AVEC condensé (ordre des jours) :
  `peps` = pépites qui sont des `str` non vides après strip (les valeurs
  gardées NE sont PAS strippées) ; `pepites[id] = peps` ; bloc :
  ```
  #### {id} ({date or "-"})
  - Résumé : {resume déf. ""}
  - Forme : {forme or "-"}
  - Singularités : {singularites or "-"}
  - Pépites verbatim : {" / ".join("« %s »" % p) or "—"}
  ```
  (format exact : `"#### %s (%s)\n- Résumé : %s\n- Forme : %s\n-
  Singularités : %s\n- Pépites verbatim : %s"` ; `c.get("forme","") or "-"`.)
- Aucun bloc → warn `"Arpenteur : aucun condensé disponible — passe globale
  annulée"`, retour `(None, False)`.
- **Chose vue** : `fp = empreinte(sorted((jid, e.get("empreinte")) for
  (jid, e) in conds.items() if e.get("condense")), VERSION_SCAN)` — liste
  triée de paires [jid, empreinte] + la version, 2 parts. Si
  `etat_scan["arpentage"]` existe avec même empreinte et `resultat is not
  None` → log `"Arpenteur : condensé du portfolio inchangé — passe globale et
  retours aux sources reprises sans relecture (chose vue)"`, retour
  `(resultat, False)`.
- Appel : prompt `scan/01-arpenteur.md`, variables `{JOURNAL_ID,
  PREMIERE_DATE: dates[0], DERNIERE_DATE: dates[-1], NB_JOURNEES: len(jours),
  LISTE_61: "- %s %s" par compétence joints "\n", CONDENSES:
  "\n\n".join(blocs)}` où `dates = [date or id]` ; `task="arpenteur"`,
  `meta={"jours": [(id, date)], "codes": [tous les codes],
  "pepites": pepites}`, `label="arpenteur_global"`.
- Parsing : `a = data.get("arpentage")` ; pas un dict → incident
  `"arpentage_json_invalide"`, warn `"Arpenteur : passe globale invalide —
  scan sans effet sur ce run"`, `(None, False)`. Sinon
  `etat_scan["arpentage"] = {"empreinte": fp, "resultat": a}`, `(a, True)`.

Contrat de sortie du prompt arpenteur : objet `{"arpentage":
{"observationsHorsReferentiel": [obs], "continuites": [obs],
"grainesReferentiel": [obs]}}` ; une `obs` porte (selon famille) : `titre`,
`code`, `description`, `pourquoiInvisibleAuJour`, `indices` ([str]),
`journeesCitees` ([id ou date]), `codesRelies`, `codesLesPlusProches`,
`pourquoiHorsReferentiel`, `hypotheseFalsifiable`, `testEntretien`.

### 4.6 `_resoudre_journees(refs, jours)` → sous-liste de `jours`

`par_cle` : `par_cle[id] = j` (affectation) puis si date
`par_cle.setdefault(date, j)` — le PREMIER jour d'une date partagée gagne
(contrairement à `idx_jour` du merge). Résolution : pour chaque réf,
`str(r).strip()`, dédoublonnage par id, ORDRE DES RÉFS préservé.

### 4.7 `_retour_aux_sources(ctx, obs, type_, cites, backend, label_base)` → `(ancres, issues)`

- `max_c = int((config.get("scan_global") or {}).get("retour_max_caracteres",
  30000))` — taille de LOT technique, PAS un plafond : TOUS les lots sont lus.
- Lots : accumulation gloutonne ; nouveau lot AVANT d'ajouter `j` si
  `cur` non vide ET `cur_len + len(texte) > max_c` (une journée seule plus
  longue que `max_c` forme quand même son lot). `len` en points de code.
- Par lot `li` (base 0) :
  - `DOSSIER` = `"\n\n".join("#### Journée %s (%s)\n\n%s" % (id, date or "-",
    neutraliser_balises(texte)))` ;
  - prompt `scan/02-retour-aux-sources.md`, variables `{TYPE: type_, TITRE:
    obs.titre or obs.code or "?", DESCRIPTION: obs.description or
    obs.pourquoiInvisibleAuJour or "-", INDICES: " ; ".join(obs.indices or
    []) or "-", DOSSIER}` ;
  - `sents` = concaténation des `_sentences_de(texte, id)` du lot ;
  - appel `task="retour_sources"`, `meta={"jours": [ids du lot], "sentences":
    sents, "titre": obs.titre or obs.code}`,
    `label="retour_%s_l%d" % (label_base, li + 1)` ;
  - parsing : `r = data.get("retour_aux_sources")` ; pas un dict → incident
    `"retour_json_invalide"`, continue ; sinon
    `issues.append(r.get("issue"))` (peut être None) et collecte des
    `extraits` qui sont des dicts avec `verbatim` truthy.
- Ancrage : `par_id` : id → jour, puis `setdefault(date, j)`. Stats :
  `ctx["ancrage_stats"]["arpenteur"]` créé à `{"ancres": 0, "rejets": 0}` au
  besoin. Pour chaque extrait brut : `j = par_id.get(str(e.get("journee",
  "")).strip())` ; `loc = find_verbatim(j["texte"], e["verbatim"])` si `j`
  sinon None. Trouvé → `ancres += 1` et append :
  ```json
  {"journee": j["id"], "date": j.get("date"),
   "verbatim": str(e["verbatim"])[:300],
   "span": [loc[0], loc[1]], "ratio": round(loc[2], 3)}
  ```
  Sinon → `rejets += 1` ET incident `"scan_ancrage_rejets"`.

Contrat du prompt retour-aux-sources : objet `{"retour_aux_sources":
{"issue": str, "extraits": [{"journee": id-ou-date, "verbatim": str}]}}`.

### 4.8 `_cle_obs(o)` / `_fusionner_obs(etat_scan, nouvelles, noms)` / `_graine`

- `_cle_obs` : type `"graine-referentiel"` → `("graine", code)` ; sinon
  `(type, (titre or "").strip().lower())`.
- `_graine(code, noms, extrait)` = `_suspicion(code, noms.get(code, code),
  {"id": extrait["journee"], "date": extrait.get("date")}, "scan-global",
  extrait=extrait["verbatim"])` (§1.8 — l'extrait y est retronqué `[:300]`).
- `_fusionner_obs` (fusion ADDITIVE dans l'état persistant) :
  `obs_etat = etat_scan.setdefault("observations", [])` ; index
  `tuple(o["cle"]) -> o`. Pour chaque nouvelle :
  - clé inconnue → `n["cle"] = list(cle)` (LISTE, sérialisable), append,
    indexation ;
  - clé connue → dédoublonnage des extraits par `(journee, verbatim)`
    existants ; chaque extrait NOUVEAU est appendé à `o["extraits_ancres"]`
    et, pour CHAQUE code de `o.get("codes") or []` (les codes de
    l'observation EXISTANTE), une graine `_graine(code, noms, e)` est
    appendée à `o["graines"]` (créée au besoin). Jamais de remplacement : les
    graines existantes gardent leur marque `jugee`.
  - complétion des champs seulement s'ils MANQUENT (`n[champ] truthy et
    o[champ] falsy`), dans l'ordre : `description, hypotheseFalsifiable,
    testEntretien, pourquoiHorsReferentiel, codesLesPlusProches, issues`.

### 4.9 `verser(ctx, competences, etat_scan)` → `ctx["scan_global"]`

Rejoué à CHAQUE run (la fusion reconstruit `competences`). Pour chaque
observation de l'état (ordre de la liste) : classement `hors-referentiel` →
`orphelines`, `continuite` → `continuites` (les `graine-referentiel` ne sont
listées nulle part mais leurs graines sont versées). Pour chaque graine de
l'observation : `c = competences.get(code)` ; inconnue → incident
`"scan_code_inconnu"`, continue ; si `g not in c["graines"]` (égalité
PROFONDE — la mutation `jugee` rend la graine différente d'une copie non
jugée, mais ici c'est le MÊME dict partagé qui circule) : append,
`n_graines += 1`, recalcul `graines_recurrentes` (≥ 2 journées distinctes).

```json
ctx["scan_global"] = {
  "version": "scan-v1",
  "orphelines": [...], "continuites": [...],
  "graines_versees": n,
  "non_retrouvees": len(etat_scan.get("non_retrouvees", [])),
  "rejets_ancrage": ancrage_stats.arpenteur.rejets (déf. 0)}
```

### 4.10 `arpenter(ctx, cartos, competences, backend)` → résumé

1. `etat_scan = ctx["etat_scan"]` ; si None → `{}` posé dans ctx (scan
   éphémère `--sans-etat`).
2. `jours = _jours_de(...)` ; `noms` = code→nom (61). Si vide → warn
   `"Arpenteur : aucune journée avec texte — scan sans objet"` et retour
   `verser(...)` (PAS de scan_global.json écrit dans ce cas).
3. Log `"Arpenteur : scan global — %d journées, du %s au %s"` (date or id du
   premier/dernier).
4. `reprises = _condenser(...)` puis `arpentage, nouveau = _passe_globale(...)`.
5. Si `arpentage` ET `nouveau` : trois familles DANS L'ORDRE :
   `("hors-referentiel", observationsHorsReferentiel)`,
   `("continuite", continuites)`, `("graine-referentiel",
   grainesReferentiel)`. Compteur `num` GLOBAL aux trois familles,
   incrémenté par obs qui EST un dict (les non-dicts sont sautés sans
   incrémenter). Pour chaque obs :
   - `cites = _resoudre_journees(obs.journeesCitees, jours)` ; vide →
     incident `"scan_journees_introuvables"` et `mortes.append(dict(obs,
     type=type_, motif="journées citées introuvables"))` (copie de l'obs +
     2 clés) ;
   - `ancres, issues = _retour_aux_sources(ctx, obs, type_, cites, backend,
     "%s%02d" % (type_[:4], num))` — préfixe label : 4 premiers caractères du
     type (`hors`, `cont`, `grai`) + numéro `%02d` ;
   - aucun ancrage → `mortes.append(dict(obs, type=type_, issues=issues,
     motif="aucun extrait retrouvé et ancré"))` (meurt proprement, jamais
     versée) ;
   - sinon `codes` = `[obs["code"]]` si famille graine-referentiel avec code,
     sinon `[c for c in (obs.codesRelies or []) if c]` ; observation
     normalisée (ordre de clés EXACT) :
     ```json
     {"type": type_, "titre": obs.titre or obs.code,
      "description": obs.description or obs.pourquoiInvisibleAuJour,
      "codes": codes, "codesLesPlusProches": .., "pourquoiHorsReferentiel": ..,
      "hypotheseFalsifiable": .., "testEntretien": ..,
      "issues": issues, "extraits_ancres": ancres,
      "graines": [_graine(code, noms, e) for code in codes for e in ancres],
      "scan_date": ctx["date"]}
     ```
     (produit cartésien codes × ancres, codes en boucle EXTERNE.)
   - `_fusionner_obs(etat_scan, nouvelles, noms)` puis
     `etat_scan["non_retrouvees"].extend(mortes)` si mortes.
6. `resume = verser(...)` puis écriture de `base_dir/scan_global.json` :
   ```json
   {"version": "scan-v1", "journal_id": .., "date": ..,
    "n_journees": len(jours), "condenses_repris": reprises,
    "passe_globale_rejouee": bool(nouveau),
    "arpentage_brut": (etat_scan.get("arpentage") or {}).get("resultat"),
    "observations": etat_scan.get("observations", []),
    "non_retrouvees": etat_scan.get("non_retrouvees", []),
    "parametres": config.get("scan_global") or {}}
   ```
7. Log `"Arpenteur : %d orpheline(s), %d continuité(s), %d graine(s)
   versée(s), %d suspicion(s) non retrouvée(s), %d rejet(s) d'ancrage"`.

---

## 5. Fichiers de prompts référencés (NE PAS recopier leur contenu)

| Fichier | Variables de gabarit | Contrat de sortie |
|---|---|---|
| `protocole/merge/01-kairos-evolutif.md` | base + `DONNEES` | JSON `{kairos: {apprenant.syntheseCompleteMarkdown, emergencesCrossPoles...}}` |
| `protocole/merge/02-pole-evolutif.md` | base + `POLE_NUM, POLE_NOM, DONNEES` | markdown libre |
| `protocole/merge/03-competence-evolution.md` | base + `CODE, NOM, POLE_NUM, POLE_NOM, NB_JOURNEES_ETABLIES, STATUT_FINAL, TRAJECTOIRE, CUMUL_PREUVES, CUMUL_INDICES, CONFIANCE_MOY, SCORE_CUMULE, DONNEES` | markdown libre (tronqué à 900) |
| `protocole/merge/04-rapporteur.md` | base + `DONNEES` | JSON `{rapport: {...}}` |
| `protocole/scan/00-condense-fidele.md` | `JOURNEE_ID, DATE, TEXTE` | JSON `{condense_fidele: {resume, forme, singularites, pepites}}` |
| `protocole/scan/01-arpenteur.md` | `JOURNAL_ID, PREMIERE_DATE, DERNIERE_DATE, NB_JOURNEES, LISTE_61, CONDENSES` | JSON `{arpentage: {observationsHorsReferentiel, continuites, grainesReferentiel}}` |
| `protocole/scan/02-retour-aux-sources.md` | `TYPE, TITRE, DESCRIPTION, INDICES, DOSSIER` | JSON `{retour_aux_sources: {issue, extraits}}` |

`base` = `PREMIERE_DATE, DERNIERE_DATE, NB_JOURNEES, DATES_LISTE, JOURNAL_ID`.

---

## 6. Récapitulatif des appels `backend.call` (oracle mock `--salt`)

Le mock ne lit JAMAIS le prompt : ses réponses dérivent exclusivement de
`(salt, task, meta, model)` — le prompt ne sert qu'aux longueurs du
`CallRecord` (métriques). Chaque champ ci-dessous doit être BYTE-IDENTIQUE.

| # | task | meta | label |
|---|------|------|-------|
| kairos | `merge_kairos` | `{}` | `merge_kairos` |
| pôle | `merge_pole` | `{"pole": num}` | `merge_pole_P%d` |
| histoire | `merge_competence` | `{"code": code}` | `merge_comp_%s` |
| rapporteur | `merge_rapporteur` | `{}` | `merge_rapporteur` |
| condensé | `condense` | `{"journee", "sentences"}` | `condense_%s` |
| arpenteur | `arpenteur` | `{"jours", "codes", "pepites"}` | `arpenteur_global` |
| retour | `retour_sources` | `{"jours", "sentences", "titre"}` | `retour_%s_l%d` |

(+ `juger_faisceau` : voir spec tribunal9 ; meta `{"code", "nom",
"sentences": [(journee, extrait)]}`.)

---

## 7. Points de vigilance parité (idiomes Python à reproduire)

1. **`round()` Python = arrondi bancaire sur flottants binaires**
   (`round(x, 3)`, `round(x, 1)`, ties-to-even sur la représentation
   double) : `round(0.5)=0`, `round(2.675, 2)=2.67`. `Math.round` JS et
   `toFixed` diffèrent. Implémenter un `pyRound(x, n)` fidèle (via la
   représentation décimale la plus courte du double, comme CPython). Endroits
   critiques : `heat_timeline`, `confiance_moyenne`, `score_cumule`,
   `ratio` d'ancrage, TOUTES les proportions du profil ipsatif — dont
   l'**accumulation avec arrondi intermédiaire** `pp["proportion"] =
   round(pp["proportion"] + prop, 1)` (ordre d'addition significatif).
2. **`empreinte`/`stable_hash`** (§1.1) : `json.dumps(parts, sort_keys=True,
   ensure_ascii=False, default=str)` avec séparateurs `", "` / `": "`,
   tuples→arrays, puis md5 → 12 hex → int → `"%x"`. Les floats y sont
   sérialisés en repr Python la plus courte (identique à
   `JSON.stringify(Number)` pour les doubles, sauf les entiers-flottants :
   Python `1.0` ≠ JS `1` — attention si un float entier entre dans une
   empreinte).
3. **Ordre d'insertion des dicts** partout : `competences` (poles→comps),
   `statuts` (première rencontre), `par_pole` (TETE→FLAMBEAU), clés des JSON
   de sortie, `verdicts` filtrés du viewer. En JS : objets ordinaires
   (l'ordre d'insertion est garanti pour les clés chaînes) —
   ATTENTION : les clés NUMÉRIQUES-chaînes (`"1"`... de `rapports_poles`)
   sont réordonnées numériquement par les objets JS : c'est ici sans écart
   car 1..7 arrivent déjà en ordre croissant, mais utiliser une `Map` si
   l'ordre d'appel changeait.
4. **Troncatures `[:n]` et `len()` en POINTS DE CODE Unicode**, pas en unités
   UTF-16 : en JS utiliser `Array.from(s).slice(0, n).join("")` et
   `[...s].length` (les emojis/astraux dans les textes d'élèves feraient
   dériver spans, lots et citations).
5. **Tris** : `sort()` Python est STABLE ; comparaison des chaînes par point
   de code (PAS `localeCompare`) ; tuples comparés lexicographiquement
   (`False < True` ; `(-n, code)` etc.). `sorted(par_pole.items())` trie des
   clés ENTIÈRES numériquement ; `sorted(rel["poles"], key=int)` parse les
   clés. `sorted(competences)` trie les codes par point de code (les accents
   comptent).
6. **Égalité profonde** pour `gr not in liste` (dédoublonnage des graines,
   §3.3 et §4.9) : comparer TOUTES les clés/valeurs récursivement (une graine
   marquée `jugee` n'est plus égale à sa version vierge). Noter aussi le
   PARTAGE de référence : la mutation `g["jugee"]` du second ressort doit
   atteindre le même objet que celui stocké dans `etat_scan` et
   `competences[..]["graines"]`.
7. **`isinstance(x, int)` inclut `bool`** (True compte 1 dans `cumul_preuves`
   / `cumul_indices`) et EXCLUT les floats et `"R"` ;
   `isinstance(x, (int, float))` pour les confiances inclut les bools.
8. **printf `%`** : `%.1f`/`%.2f` (arrondi du double, half-even au niveau
   binaire — `(0.15).toFixed(2)` JS donne "0.15" vs Python `"%.2f" % 0.15` →
   "0.15" ; vérifier les cas limites avec un formateur fidèle), `%d`, `%02d`,
   `%x` (minuscule sans padding), `%s` d'un float = `str()` Python
   (`12.5`, `0.0` — PAS `0`).
9. **Sérialisation JSON des fichiers** : `indent=2` + `\n` final,
   `ensure_ascii=False`, ordre d'insertion ; pour le viewer : compacte à la
   Python (`", "`/`": "`) + `.replace("</", "<\\/")` ; Python sérialise
   `NaN/Infinity` littéralement (à éviter en amont), `None`→`null`. Les
   floats : `json.dumps` Python utilise `repr` shortest (0.1 → `0.1`) —
   identique à `JSON.stringify` SAUF les floats à valeur entière
   (`3.0` vs `3`) : conserver l'information int/float des calculs
   (`cmoy = 0.0`, `heat = 0.0`, `score_preuves: 0` int…).
10. **Regex** : `## Question spontanée\s*\n(.+)` (le `.` ne franchit pas
    `\n`) ; `(?<=[.!?])\s+` (lookbehind) ; la regex des balises est
    insensible à la casse ; `_RE_FENCE` en DOTALL non-greedy.
11. **`str.strip()` Python** retire l'espace Unicode (dont NBSP U+00A0 et
    espaces fines) — `String.prototype.trim()` couvre les mêmes classes sauf
    subtilités (U+200B non strippé des deux côtés) ; utiliser trim() mais
    tester sur les textes réels. `splitlines()` Python coupe aussi sur
    `\x0b\x0c\x1c-\x1e\x85  ` — ne PAS utiliser `split("\n")` tel
    quel pour `_sentences_de`.
12. **Caractères spéciaux dans les formats** : flèche `→` (periode, ligne
    Cohérence), tiret cadratin `—`, guillemets `« »` AVEC espaces normales
    (pas insécables), `⚠` (U+26A0), `‹›` de la neutralisation. Copier depuis
    ce document, pas retaper.
13. **Résilience** : tout appel LLM raté (exception, JSON invalide) incrémente
    un compteur d'incidents et DÉGRADE sans casser (kairos → texte brut ;
    relecture absente → clé absente/None ; condensé invalide → journée
    absente de la passe de CE run). Ne jamais lever depuis ces chemins.
14. **Chose jugée / chose vue** : la reprise dépend exclusivement de
    l'égalité d'empreintes (§1.1) — tout écart d'empreinte casse l'économie
    d'appels ET la parité mock (des appels en plus/en moins décalent la
    séquence du backend mock s'il est à compteur).

---

## 8. Dépendances vers les autres modules (specs sœurs)

- `aurora/util.py` : `empreinte`, `stable_hash`, `extract_json`,
  `find_verbatim` (difflib !), `neutraliser_balises`, `read_text`,
  `write_text`, `write_json`, `log/log_ok/log_warn`.
- `aurora/templates.py` : `resolve`, `resolve_file`.
- `aurora/journee.py` : `_sentences_de`, `_suspicion` (+ table `_QUESTIONS`),
  producteur des `cartos` (§2.2).
- `aurora/tribunal9.py` : `infos_personas`, `juger_faisceau` (schéma de
  verdict, composition du jury, dossier de faisceau mécanique).
- `aurora/referentiel.py` : objets pôle (`num`, `nom`, `competences`).
- `aurora/backends.py` : `backend.call(prompt, task=, meta=, label=)` — le
  mode mock `--salt` y vit ; les `meta` du §6 sont son entrée déterministe.
- Appelant (`twin9.py`, fonction `executer`) : construit `ctx`, ordonne
  fusionner → arpenter (ou versement 0 LLM si scan désactivé mais observations
  en état) → second_ressort → relectures → ecrire_sorties, et persiste
  `etat_faisceaux` / `etat_scan` entre les runs.
