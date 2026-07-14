# -*- coding: utf-8 -*-
"""Vecteurs de parité (CPython = oracle) pour backends.js : chaque branche du
MockBackend est échantillonnée (≥ 3 cas par branche, salts/meta/models variés),
sortie + CallRecord (sans `seconds`, non déterministe) figés dans
backends.vec.json puis injectés dans backends.test.js (placeholder
"__VEC_BACKENDS__") via inject_backends_vectors.py."""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
TWIN = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "..", "..", "..", "..", "Twin_v9")
sys.path.insert(0, TWIN)

from aurora.backends import MockBackend  # noqa: E402
from aurora.util import stable_hash  # noqa: E402


def scenario(code):
    return stable_hash("scn|" + code) % 10


# ── codes représentatifs par scénario (pool réaliste "P.NN") ─────────────────
POOL = ["%d.%02d" % (p, n) for p in range(1, 8) for n in range(1, 13)]
BY_H = {h: [c for c in POOL if scenario(c) == h] for h in range(10)}
for h in range(10):
    assert BY_H[h], "aucun code pour h=%d" % h

# codes spéciaux : gardien du support (r==0, r==1), gardien du raisonnement
# (%17==0), juge léger h==8 (parité l8 paire/impaire)
gs0 = next(c for c in ("g%03d" % i for i in range(3000)) if stable_hash("gsupport|" + c) % 11 == 0)
gs1 = next(c for c in ("g%03d" % i for i in range(3000)) if stable_hash("gsupport|" + c) % 11 == 1)
gr0 = next(c for c in ("r%03d" % i for i in range(9000)) if stable_hash("grais|" + c) % 17 == 0)
l8_pair = next(c for c in BY_H[8] + ["x%03d" % i for i in range(2000)]
               if scenario(c) == 8 and stable_hash("l8|" + c) % 2 == 0)
l8_impair = next(c for c in BY_H[8] + ["x%03d" % i for i in range(2000)]
                 if scenario(c) == 8 and stable_hash("l8|" + c) % 2 == 1)

SENTS_A = [["F01", "Phrase une avec détail daté."],
           ["F02", "Deuxième phrase, plus réflexive."],
           ["F03", "Troisième phrase \U0001F389 avec emoji astral."],
           ["F04", "Quatrième phrase sur le chantier."],
           ["F05", "Cinquième phrase, un essai chiffré."],
           ["F06", "Sixième phrase qui doute encore."],
           ["F07", "Septième phrase concrète et datée."],
           ["F08", "Huitième phrase, retour au calme."]]
SENTS_B = [["J02_s1", "Une seule matinée au jardin."],
           ["J02_s2", "L'après-midi, semis « à la volée »."],
           ["J02_s3", "Le soir, notes rapides."]]
SENTS_5 = SENTS_A[:5]  # len 5 → (k+5)%5 == k : dédoublonnage retour_sources
SENTS_1 = [["F09", "L'unique phrase du jour."]]


def pairs(codes):
    return [[c, "Nom %s" % c] for c in codes]


MIX = [BY_H[0][0], BY_H[4][0], BY_H[5][0], BY_H[6][0], BY_H[6][1] if len(BY_H[6]) > 1 else BY_H[6][0],
       BY_H[7][0], BY_H[8][0], BY_H[9][0]]
MIX_LARGE = sorted(set(MIX + [BY_H[h][i] for h in range(10) for i in range(min(2, len(BY_H[h])))]))

CASES = []


def case(task, meta, spec=None, model=None, label=None, prompt="Prompt de test — métadonnées seules."):
    CASES.append({"spec": spec if spec is not None else {}, "task": task, "meta": meta,
                  "model": model, "label": label, "prompt": prompt})


# ── tagger (v8 stigmergique) ──────────────────────────────────────────────────
case("tagger", {"codes": pairs(MIX), "sentences": SENTS_A, "journee": "J01"},
     spec={"salt": ""}, label="tag_m1_J01_P1")
case("tagger", {"codes": pairs(MIX), "sentences": SENTS_A, "journee": "J01"},
     spec={"salt": "sel-A", "model": "modele-B"}, label="tag_m2_J01_P1")
case("tagger", {"codes": pairs(MIX_LARGE), "sentences": SENTS_A, "journee": "2026-01-05_a"},
     spec={"salt": 7}, model="gpt-x", label="tag_gpt-x_2026-01-05_a_P3")
case("tagger", {"codes": pairs(MIX_LARGE), "sentences": SENTS_B, "journee": ""},
     spec={"salt": "z"}, model="claude-y")  # jid vide : pas de saut de fréquence
case("tagger", {"codes": pairs(MIX), "sentences": [], "journee": "J09"}, spec={"salt": "q"})
case("tagger", {"codes": [], "sentences": SENTS_A, "journee": "J01"}, spec={"salt": ""})
for j in ("J01", "J02", "J03", "J04", "J05"):  # sauts de fréquence h∈{6,7} selon jid
    case("tagger", {"codes": pairs(BY_H[6][:2] + BY_H[7][:2]), "sentences": SENTS_B, "journee": j},
         spec={"salt": "freq"}, model="m-freq")

# ── leger_scan (cartographie de pôle v8) ─────────────────────────────────────
case("leger_scan", {"pole": 1, "run": 1, "codes": pairs(MIX), "sentences": SENTS_A}, spec={"salt": ""})
case("leger_scan", {"pole": 2, "run": 2, "codes": pairs(MIX), "sentences": SENTS_A}, spec={"salt": "x"},
     model="m-2")
case("leger_scan", {"pole": 3, "run": 3, "codes": pairs(MIX), "sentences": SENTS_B}, spec={"salt": 7})
case("leger_scan", {"pole": "P5", "run": 1, "codes": pairs(MIX[:4]), "sentences": []}, spec={"salt": "v"})
case("leger_scan", {}, spec={"salt": "d"})  # défauts pole=1 run=1 codes=[] sents=[]
case("leger_scan", {"pole": 4, "run": 4, "codes": pairs([BY_H[8][0], l8_pair, l8_impair]),
                    "sentences": SENTS_5}, spec={"salt": "r4"})  # (run-1)%3 == 0

# ── premiere_impression ──────────────────────────────────────────────────────
for meta in ({"journee": "J01"}, {"journee": "2026-01-05_a"}, {}, {"journee": 42}, {"journee": ""}):
    case("premiere_impression", meta, spec={"salt": "s"}, label="lecteur_x_impression")

# ── condense / arpenteur / retour_sources (scan global) ──────────────────────
case("condense", {"journee": "J01", "sentences": SENTS_A}, spec={"salt": ""}, label="condense_J01")
case("condense", {"journee": "J02", "sentences": SENTS_1}, spec={"salt": "c"})
case("condense", {"journee": "2026-01-07_b", "sentences": SENTS_B}, spec={"salt": 3})
case("condense", {"journee": "J03", "sentences": []}, spec={})
case("condense", {"sentences": SENTS_B}, spec={})            # journee absente → "?"
case("condense", {"journee": None, "sentences": SENTS_B}, spec={})  # str(None) → "None"

case("arpenteur", {"jours": [["J01", "2026-01-02"], ["J02", "2026-01-03"], ["J03", "2026-01-04"]],
                   "codes": ["1.01", "2.02", "3.03", "4.04"],
                   "pepites": {"J01": ["pépite une"], "J02": []}},
     spec={"salt": ""}, label="arpenteur_global")
case("arpenteur", {"jours": [["J01", "2026-01-02"]], "codes": ["1.01"], "pepites": {}}, spec={})
case("arpenteur", {"jours": [], "codes": [], "pepites": {}}, spec={})
case("arpenteur", {"jours": [["Ja", "d1"], ["Jb", "d2"]], "codes": ["5.05", "6.06"],
                   "pepites": {"Ja": ["p-a", "p-a2"], "Jb": ["p-b"]}}, spec={"salt": "arp"})
case("arpenteur", {}, spec={})

case("retour_sources", {"sentences": SENTS_A, "jours": ["J01", "J02"], "titre": "Continuité X"},
     spec={"salt": ""}, label="retour_cont01_l1")
case("retour_sources", {"sentences": SENTS_A, "jours": ["J01"]}, spec={})   # titre → "None"
case("retour_sources", {"sentences": SENTS_5, "jours": ["J04"], "titre": "T"}, spec={"salt": "u"})
case("retour_sources", {"sentences": SENTS_1, "jours": [], "titre": "Hors réf"}, spec={})
case("retour_sources", {"sentences": [], "jours": ["J01"], "titre": "T2"}, spec={})

# ── merges & kairos ──────────────────────────────────────────────────────────
case("merge_kairos", {}, spec={"salt": "mk"}, label="merge_kairos")
case("merge_kairos", {"x": 1}, spec={})
case("merge_rapporteur", {}, spec={"salt": "mr"}, label="merge_rapporteur")
case("merge_rapporteur", {}, spec={})
case("merge_pole", {"pole": 3}, spec={}, label="merge_pole_P3")
case("merge_pole", {"pole": "P2"}, spec={})
case("merge_pole", {}, spec={})
case("merge_competence", {"code": "1.01"}, spec={}, label="merge_comp_1.01")
case("merge_competence", {}, spec={})
case("kairos", {}, spec={"salt": "k"})
case("kairos", {"y": 2}, spec={})

# ── tribunal : greffier / accusation / defense / replique / briefing ─────────
case("greffier", {"code": "1.01", "nom": "Nom un", "sentences": SENTS_A}, spec={"salt": ""},
     label="greffier_J01_1.01")
case("greffier", {"code": BY_H[8][0], "nom": "Nom huit", "sentences": SENTS_B}, spec={})
case("greffier", {"code": "2.02", "nom": "Vide", "sentences": []}, spec={})
case("greffier", {}, spec={})  # défauts code/nom "?" + dossier vide
for t in ("accusation", "defense", "replique", "briefing"):
    case(t, {"code": "3.03", "nom": "Nom trois"}, spec={}, label="%s_J01_3.03" % t)
    case(t, {"code": BY_H[9][0], "nom": "Nom neuf"}, spec={"salt": "t"})
    case(t, {}, spec={})

# ── jury v9 : jure / jure2 / relance ─────────────────────────────────────────
SOCLE = ["Linguiste", "Historien", "Pédagogue", "Sociologue"]
for h in (8, 9, 6, 7, 4, 5, 0):
    code = BY_H[h][0]
    for nj in SOCLE + ["Éthicien"]:
        case("jure", {"code": code, "nom": "Nom %s" % code, "jure": nj}, spec={},
             label="jure_J01_%s" % code)
        case("jure2", {"code": code, "nom": "Nom %s" % code, "jure": nj}, spec={},
             label="jure2_J01_%s" % code)
for h in (8, 5, 4, 0):
    code = BY_H[h][0]
    for nj in SOCLE + ["Portraitiste"]:
        case("relance", {"code": code, "nom": "Nom %s" % code, "jure": nj}, spec={},
             label="relance_J01_%s" % code)
case("jure", {}, spec={})  # défauts "?" partout

# ── gardiens ─────────────────────────────────────────────────────────────────
for code in (gs0, gs1, "1.01", "5.07"):
    case("gardien_support", {"code": code, "nom": "Nom %s" % code}, spec={},
         label="gardien_support_J01_%s" % code)
for code in (gr0, "1.01", "6.03"):
    case("gardien_raisonnement", {"code": code, "nom": "Nom %s" % code}, spec={},
         label="gardien_raisonnement_J01_%s" % code)

# ── juge léger v9 + contre-lecture ───────────────────────────────────────────
for code in (BY_H[6][0], BY_H[7][0], BY_H[2][0]):
    case("leger", {"code": code, "nom": "Nom %s" % code, "passe": 1}, spec={},
         label="leger_J01_%s_p1" % code)
for code in (l8_pair, l8_impair, BY_H[9][0]):
    for p in (1, 2, 3, 4, "2"):
        case("leger", {"code": code, "nom": "Nom %s" % code, "passe": p}, spec={"salt": "lg"})
case("leger", {"code": BY_H[9][0], "nom": "Sans passe"}, spec={})  # défaut passe=1
for code in (BY_H[7][0], BY_H[6][0], BY_H[8][0], BY_H[3][0]):
    case("contre_lecture", {"code": code, "nom": "Nom %s" % code}, spec={},
         label="contre-lecture_J01_%s" % code)
case("contre_lecture", {}, spec={})

# ── président ────────────────────────────────────────────────────────────────
for statut in ("renvoi au cartographe", "présence établie", "présence non établie"):
    case("president", {"code": "4.04", "nom": "Nom quatre", "statut": statut}, spec={},
         label="president_J01_4.04")
case("president", {"code": "4.04", "nom": "Nom quatre"}, spec={})  # défaut statut
case("president", {}, spec={})

# ── task inconnue + défauts model/record ─────────────────────────────────────
case("tache_inconnue", {}, spec={})
case(None, {}, spec={})                     # label du record → "call"
case(None, {}, spec={"model": "m-spec"})    # record.model = spec.model
case("premiere_impression", {"journee": "J01"}, spec={}, model="m-arg",
     prompt="Prompt astral \U0001F389\U0001D11E — longueurs en points de code.")

# ── exécution : sorties + records via l'oracle CPython ───────────────────────
out_cases = []
for c in CASES:
    b = MockBackend(dict(c["spec"]))
    out = b.call(c["prompt"], model=c["model"], task=c["task"], meta=c["meta"], label=c["label"])
    rec = b.records[-1].as_dict()
    del rec["seconds"]  # non déterministe (le test JS vérifie le type à part)
    out_cases.append({"spec": c["spec"], "task": c["task"], "meta": c["meta"], "model": c["model"],
                      "label": c["label"], "prompt": c["prompt"], "out": out, "record": rec})

blob = {"special_codes": {"by_h": {str(h): BY_H[h][:3] for h in range(10)},
                          "gsupport0": gs0, "gsupport1": gs1, "grais0": gr0,
                          "l8_pair": l8_pair, "l8_impair": l8_impair},
        "cases": out_cases}
with open(os.path.join(HERE, "backends.vec.json"), "w", encoding="utf-8") as f:
    json.dump(blob, f, ensure_ascii=True, indent=1)
    f.write("\n")
print("cases:", len(out_cases))
