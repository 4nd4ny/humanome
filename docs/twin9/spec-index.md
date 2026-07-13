# Spec-index — Portage JS de Twin_v9 : vue d'ensemble

> Porte d'entrée des 6 specs de portage. Objectif global : parité **bit-à-bit**
> avec le Python en mode mock (`--salt`) — le mock est l'oracle.
> Rappel confidentialité : les prompts `protocole/**/*.md` sont référencés par
> chemin + variables `{$VAR}` + contrat de sortie, jamais recopiés. Seules
> exceptions tolérées : les en-têtes de FORMAT de sortie (ex.
> `**Position** :`, titres de sections du squelette de réponse) qui figurent
> aussi littéralement dans `backends.py` (mock) — nécessaires à la parité.

| Spec | Modules couverts |
|---|---|
| `spec-noyau.md` | `util.py`, `templates.py`, `portfolio.py`, `referentiel.py` |
| `spec-backends.md` | `backends.py` (CallRecord, 4 backends réels, MockBackend intégral) |
| `spec-journee.md` | `journee.py`, `heatmap.py` |
| `spec-tribunal.md` | `tribunal9.py` (personas, jury, arène, résolution calculée, faisceau) |
| `spec-merge-scan.md` | `merge3.py`, `scan9.py` |
| `spec-contrats.md` | PROTOCOLE.md, inventaire des 29 gabarits, `config.json`, `models.json`, viewer `window.CARTO9`, `tests.py` (25 invariants), `bench9.py`, `twin9.executer()` |

---

## 1. Pipeline (twin9.executer, ordre strict)

```
0.  Config + surcharges CLI (dont réinjection bt_spec/br_spec dans config
    AVANT tout calcul d'empreinte)
1.  split_portfolio → journées datées (ids uniques, dédup _b)          0 LLM
2.  _charger_roster (passes name#k, seed/salt "…|passeK") + backends
3.  load_referentiel (P1..P7 → 61 compétences)                        0 LLM
4.  Par journée (reprise si empreinte_journee identique) :
      a. première impression (rapide, 1 appel, optionnel)
      b. tagging N lecteurs × 7 pôles (calques) + calques archivés    N×7 appels
      c. ancrer + segments (heatmap)                                  0 LLM
      d. consensus (corroborée / à instruire / minoritaire / non détectée) 0 LLM
      e. par code à signal : greffier → juge léger ×N → résolution
         mécanique → contre-lecture 20c (si activée) → verdict OU tribunal
      f. tribunal (arène 21a→22b, jury R1, second tour unique, gardiens,
         RÉSOLUTION CALCULÉE, président porte-parole)
      g. verdicts absents, registre des suspicions, déclassement
         stigmergique + élagage des calques, carto_jour.json          0 LLM
5.  Carte additive : journées d'état absentes du fichier réintégrées,
    tri (date or journee, journee)                                    0 LLM
6.  fusionner (61 entrées : statut temporel, trajectoire, heat_timeline,
    cumuls, graines)                                                  0 LLM
7.  9bis. arpenter (scan global, si activé) : condensés (1/journée
    nouvelle) → passe globale (1) → retours aux sources (lots) →
    ancrage → versement ; sinon versement 0 LLM des observations d'état
8.  second_ressort (faisceaux, chose jugée par empreinte)
9.  relectures (kairos, 7 pôles, ≤12 histoires, rapporteur)
10. ecrire_sorties : carto_evolutive.json, profil_ipsatif.json,
    rapport.md, rapport_evolutif.md, viewer data.js                   0 LLM
11. écriture de l'état persistant
12. metrics_v9.json + resume JSON sur stdout
```

---

## 2. Graphe de dépendances — ordre de portage recommandé

```
niveau 0 (infra transverse, à écrire d'abord + vecteurs de test Python) :
    md5, MT19937 CPython (init_by_array, genrand_res53, _randbelow, sample),
    pyRound (half-even sur double), pyFormat (%.1f/%.2f/%.3f/%d/%02d/%x/%s),
    pyStr (None→"None", True→"True"), pyJsonDumps (2 profils : compact
    Python ", "/": " ± sort_keys ; indent=2 + "\n" final),
    codepoints (len/slice/index par points de code), universal newlines,
    difflib (find_longest_match + ratio, autojunk)

niveau 1 : util.py          (stable_hash, empreinte, extract_json,
                             find_verbatim, neutraliser_balises, IO)
niveau 2 : templates.py     ← util
           portfolio.py     ← util
           referentiel.py   ← util (permutation ← stable_hash)
niveau 3 : backends.py      ← util (mock = oracle : à valider contre
                             CPython AVANT de continuer)
           heatmap.py       ← util
niveau 4 : tribunal9.py     ← util, templates (+ MT19937 pour jury aléatoire)
niveau 5 : journee.py       ← util, templates, referentiel, heatmap,
                             tribunal9, backends
niveau 6 : merge3.py        ← util, templates, tribunal9
           scan9.py         ← util, templates, journee (_sentences_de,
                             _suspicion)
niveau 7 : twin9 (executer) ← tout ; puis tests.py (25 invariants), bench9
```

Chaque niveau se valide par vecteurs générés côté Python (mêmes entrées →
sorties comparées octet à octet) avant de monter au niveau suivant.

---

## 3. Appels LLM par étape — étiquettes exactes

Étages : TAGGERS = `backends[name]` du roster ; RAPIDE = `backend_rapide`
(sinon `backend_tribunal` + `model_mini`) ; PROFOND = `backend_tribunal`.
En mock, la sortie ne dépend que de `(salt, task, meta, model)` ; le label
n'alimente que les métriques (routage par `label.split("_")[0]` +
présence de `"_faisceau_"`).

| Étape (métrique) | task | label exact | Étage | Gabarit |
|---|---|---|---|---|
| tagging | `tagger` | `tag_<name>_<jid>_P<n>` | TAGGERS | `tagger/1-tag-pole.md` |
| premiere-impression | `premiere_impression` | `lecteur_<jid>_impression` | RAPIDE | `lourd/10-premiere-impression.md` |
| instruction-rapide | `greffier` | `greffier_<jid>_<code>` | RAPIDE | `lourd/20-greffier.md` |
| instruction-rapide | `leger` | `leger_<jid>_<code>_p<k>` | RAPIDE | `lourd/20b-juge-leger.md` |
| instruction-rapide | `contre_lecture` | `contre-lecture_<jid>_<code>` | RAPIDE | `lourd/20c-contre-lecture.md` |
| tribunal¹ | `accusation` | `accusation_<ctx>_<code>` | PROFOND | `lourd/21a-accusation.md` |
| tribunal¹ | `defense` | `defense_<ctx>_<code>` | PROFOND | `lourd/21b-defense.md` |
| tribunal¹ | `replique` | `replique_<ctx>_<code>` | PROFOND | `lourd/22a-replique.md` |
| tribunal¹ | `briefing` | `briefing_<ctx>_<code>` | PROFOND | `lourd/22b-briefing.md` |
| tribunal¹ | `jure` | `jure_<ctx>_<code>` | PROFOND | `lourd/23-jure.md` |
| tribunal¹ | `relance` | `relance_<ctx>_<code>` | PROFOND | `lourd/23b-relance.md` |
| tribunal¹ | `jure2` | `jure2_<ctx>_<code>` | PROFOND | `lourd/23c-second-tour.md` |
| tribunal¹ | `gardien_support` | `gardien_support_<ctx>_<code>` | **RAPIDE** (model + bk rapides) | `lourd/25a-gardien-support.md` |
| tribunal¹ | `gardien_raisonnement` | `gardien_raisonnement_<ctx>_<code>` | PROFOND | `lourd/25b-gardien-raisonnement.md` |
| tribunal¹ | `president` | `president_<ctx>_<code>` | PROFOND | `lourd/24-president.md` |
| scan-global | `condense` | `condense_<jid>` | PROFOND | `scan/00-condense-fidele.md` |
| scan-global | `arpenteur` | `arpenteur_global` | PROFOND | `scan/01-arpenteur.md` |
| scan-global | `retour_sources` | `retour_<hors\|cont\|grai><num %02d>_l<lot>` | PROFOND | `scan/02-retour-aux-sources.md` |
| relectures | `merge_kairos` | `merge_kairos` | PROFOND | `merge/01-kairos-evolutif.md` |
| relectures | `merge_pole` | `merge_pole_P<n>` | PROFOND | `merge/02-pole-evolutif.md` |
| relectures | `merge_competence` | `merge_comp_<code>` | PROFOND | `merge/03-competence-evolution.md` |
| relectures | `merge_rapporteur` | `merge_rapporteur` | PROFOND | `merge/04-rapporteur.md` |

¹ `<ctx>` = id de journée (étape métrique `tribunal`) ou le littéral
`faisceau` (second ressort → étape `second-ressort`, détectée par
`"_faisceau_" in label`). Au second ressort il n'y a PAS d'appel greffier
(dossier assemblé mécaniquement) ; fichiers cache sous
`second_ressort/<code>/` au lieu de `journees/<jid>/tribunal/<code>/`.

Note mock : `_pos_jure` du mock ne lit pas le tour dans le label mais dans la
task (`jure`/`jure2`) et `meta.jure` ; les 20 tasks du dispatch sont listées
dans `spec-backends.md` §4.3. Toute task inconnue → `"OK (mock)"`.

Seeds passés à `call` (backends réels seulement, ignorés par le mock) :
`entry.seed` (tagger, passes multiples), `stable_hash("leger|<jid>|<code>|<k>")
% (2^31−1)`, `stable_hash("contre|<jid>|<code>") % (2^31−1)`.

---

## 4. TOP 10 des pièges de parité (tous modules)

1. **`stable_hash` 48 bits** : `int(md5(utf8(s)).hex[:12], 16)`. Jamais
   d'opérateur binaire JS dessus (`>>`, `&`, `|0` tronquent à 32 bits) :
   `permutation` fait `Math.floor(h / 256) % 2`, pas `h >> 8`. MD5 embarqué
   requis. Vecteur : `stable_hash("") = 233223382208256`.
2. **`empreinte` = json.dumps Python à l'octet** : séparateurs `", "` / `": "`
   (AVEC espaces), `sort_keys` par points de code, `ensure_ascii=False`,
   `default=str`, tuples→arrays, floats entiers `1.0` (pas `1`). Un octet
   d'écart invalide reprise, chose jugée, chose vue, calque_id — et décale la
   séquence d'appels mock. Idem `write_json` (indent=2 + `\n` final) et le
   viewer (compact + `.replace("</", "<\\/")`).
3. **MT19937 CPython** : `random.Random(seed 48 bits)` via `init_by_array`
   (mots 32 bits little-endian, init 19650218) ; `random()` =
   `genrand_res53` ; `sample` = méthode pool avec `_randbelow` par rejet.
   Concerne le mock (confiances, sauts de fréquence, hallucinations — ordre
   des tirages par branche contractuel) et le jury aléatoire.
4. **difflib** : `find_longest_match` (départage strict `>` → plus petit i
   puis j) + `ratio()` = 2M/T via `get_matching_blocks` (fusion des blocs
   adjacents). Asymétrie piégeuse de `find_verbatim` : 1er matcher
   `autojunk=False`, 2e matcher (fenêtre) `autojunk=True` (éléments
   « populaires » éliminés si `len(b) ≥ 200`) ; seuil
   `int(len(qn) * 0.82 * 0.6)` en troncature, dans cet ordre flottant.
   C'est l'oracle du rejet d'hallucinations (ratio ≥ 0.82).
5. **`round()` half-even sur le double binaire** (pas `Math.round` ni
   `toFixed`) + formats `%.1f/%.2f` avec zéro final (`0.80`). Cas extrême :
   l'accumulation AVEC arrondi intermédiaire du profil ipsatif
   `pp["proportion"] = round(pp + prop, 1)` — l'ordre d'addition (tri
   `(-score_cumule, code)`) fait partie du contrat.
6. **Universal newlines** : toute lecture texte convertit `\r\n`/`\r` → `\n`
   AVANT regex `^`/`$` et calcul d'offsets (les `start`/`end` sont persistés
   et comparés bit-à-bit).
7. **Points de code, pas UTF-16** : toutes les longueurs (`60/400/1200`,
   `tokens_estimes`), index de spans et troncatures `[:120..800]` suivent la
   sémantique `len`/slice Python. Hors BMP (émojis), `s.length`/`slice` JS
   divergent : travailler en tableaux de points de code ou faire vérifier la
   contrainte « BMP seulement » par l'oracle.
8. **Ordres d'itération et tris** : dicts = ordre d'insertion (construire les
   objets JS dans le même ordre ; `Map` obligatoire pour les clés numériques
   — `textes_par_journee` du faisceau, `rapports_poles`) ; tris Python
   stables ; chaînes comparées par points de code (JAMAIS `localeCompare` :
   `Pédagogue` APRÈS `Portraitiste`, `Éthicien` dernier — l'empreinte
   personas `1ec337d3a2ef` en dépend) ; tuples comparés élément par élément
   (`False < True`).
9. **Sémantiques Python diffuses** : `str()` dans graines/gabarits
   (`None`→`"None"` — graine `"ret|None"`, jury `"jury|…|None|…"`) ;
   truthiness (`[]`/`{}` falsy en Python, truthy en JS — `calques or "…"`) ;
   `isinstance(x, int)` inclut `bool` (cumuls) ; modulo Python ≥ 0 ; `int()`
   = troncature ; `strip`/`splitlines`/`isspace` Unicode ; égalité PROFONDE
   des dicts (`gr not in liste`) COUPLÉE au partage de référence : la
   mutation `g["jugee"]` du second ressort doit atteindre le même objet dans
   `etat_scan` ET `competences[..]["graines"]`.
10. **Non-déterminisme résiduel du Python, à neutraliser dans l'oracle** :
    ordre d'ACHÈVEMENT des ThreadPools (clés de `legers`, base du tri
    `au_tribunal`, `incidents_jour`, `stats_jour`, ordre des spans à conf
    égale), horodatage dans `calque_id`, `marque_run = empreinte(base_dir)[:6]`
    (dépend du chemin absolu). Le port JS adopte l'ordre déterministe des
    jobs ; la comparaison Python↔JS canonicalise ces zones (ou exécute Python
    avec `max_workers=1`, horloge et chemin fixés).

---

## 5. Constantes d'identité (doivent coïncider)

- `VERSION_PROTOCOLE = "v9.8-contre-lecture"` (journee.py) — entre dans
  l'empreinte de reprise.
- `PERSONAS_VERSION = "personas-v1"`, empreinte calculée `1ec337d3a2ef`
  (vérifiée contre CPython) — entre dans l'empreinte ET dans les artefacts.
- `VERSION_SCAN = "scan-v1"`, `STATUT_FAISCEAU = "établie par faisceau
  (second ressort)"`, `SEUILS_CONSENSUS = {conf_min: 0.4, corrobore: 0.6,
  instruire: 0.25, instruire_min_modeles: 2, suspicion_min: 0.15}`.
- Défauts divergents : `empreinte_journee` lit `juge_leger.passes` défaut
  **3** / `contre_lecture` défaut **False** si clés absentes, alors que
  `config.json` livre 2/true.
