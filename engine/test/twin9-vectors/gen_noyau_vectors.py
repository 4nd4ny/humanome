# -*- coding: utf-8 -*-
"""Vecteurs de parité (CPython = oracle) pour les tests du NOYAU twin9
(util, templates, portfolio, referentiel, pyText). Exige le dossier source
confidentiel Twin_v9 (../Twin_v9 du dépôt, ou argv[1]). Sortie : des
.vec.json dans ce répertoire, à substituer ensuite dans les fichiers de test
via inject_noyau_vectors.py (littéraux JS figés — jamais de python à
l'exécution des tests)."""
import hashlib
import json
import os
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
TWIN = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "..", "..", "..", "..", "Twin_v9")
OUTDIR = HERE
sys.path.insert(0, TWIN)

from aurora.util import extract_json, neutraliser_balises, find_verbatim, stable_hash, empreinte
from aurora import templates
from aurora.portfolio import split_portfolio, feuilles_block, sentences_of
from aurora.referentiel import parse_pole, permutation, POLE_NOMS, all_competences, Pole

def md5(s):
    return hashlib.md5(s.encode("utf-8")).hexdigest()

def dump(name, obj):
    # ensure_ascii=True (convention du dépôt) : blobs ASCII purs, sans
    # ambiguïté d'encodage une fois injectés dans les .test.js.
    with open(os.path.join(OUTDIR, name), "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=True, indent=1)
    print(name, "ok")

# ── pyText ────────────────────────────────────────────────────────────────────
strip_cases = [
    ["   x\ty\x1c", None],
    ["  bonjour  ", None],
    ["\x1c\x1d\x1e\x1f\x85 zut 　 ", None],
    ["    mixte  ", None],
    ["«»\"' test «»\"'", "«»\"' "],
    ["__a_b__", "_"],
    ["", None],
    ["  ", None],
]
lstrip_cases = [
    ["###   Titre # interne", "# "],
    ["## 12.03.24 — matin", "# "],
]
splitlines_cases = [
    "a\nb\r\nc\rd\x1ce f\x85g\vh\fi j",
    "fin\n",
    "\n\na\n",
    "sans saut",
    "",
    "x\r\n\r\ny",
    "l1 l2 l3",
]
pytext = {
    "strip": [{"s": s, "chars": c, "out": (s.strip() if c is None else s.strip(c))}
              for s, c in strip_cases],
    "lstrip": [{"s": s, "chars": c, "out": s.lstrip(c)} for s, c in lstrip_cases],
    "rstrip": [{"s": "  fin  \t", "chars": None, "out": "  fin  \t".rstrip()}],
    "splitlines": [{"s": s, "out": s.splitlines()} for s in splitlines_cases],
}
dump("pytext.vec.json", pytext)

# ── util.extract_json ─────────────────────────────────────────────────────────
ej_texts = [
    '```json\n{"a": 1, "b": [1, 2], "é": "à"}\n```',
    'avant ```\n{"a": 1,}\n``` après',
    'un ```json\n{"n": 1}\n``` deux ```json\n{"n": 2}\n``` fin',
    '```json\n{"t": “typo”}\n```\nrien',
    'prose {"x": {"y": 2, "z": [3, {"w": 4}]}} suite',
    'il a dit "bonjour" puis {"a": 1} et {"b": 2}',
    "l'élève écrit \" et ensuite {\"a\": 1} sans fermer",
    '```json {"inline": true} ```',
    '[1, 2, 3]',
    '{"a": "x}y", "b": 2}',
    '```json  \n\n{"a": 2}\n```',
    'texte {"c": [1, 2,],} fin',
    'aucun json ici',
    '{cassé} et {"ok": true}',
    '```\npas du json\n``` puis {"r": 9}',
    '{"esc": "a\\"b{c", "d": 1}',
]
ej = []
for t in ej_texts:
    for last in (True, False):
        ej.append({"text": t, "last": last, "out": extract_json(t, last=last)})
dump("extract_json.vec.json", ej)

# ── util.neutraliser_balises ──────────────────────────────────────────────────
nb_texts = [
    "<PORTFOLIO>x</PORTFOLIO>",
    "a </ fiches_pole > b < FICHE\t> c",
    "<PoRtFoLiO> et <AUTRE> et <fiche >",
    "<FICHES_POLE><VERDICT_CALCULE>",
    "<  PORTFOLIO >",
    "sans balise <div> ni rien",
    "",
]
dump("neutraliser.vec.json", [{"t": t, "out": neutraliser_balises(t)} for t in nb_texts])

# ── util.find_verbatim ────────────────────────────────────────────────────────
SRC = (
    "## 12.03.24 — matinée d'atelier\n\n"
    "Aujourd'hui, j'ai repris la maquette du pont avec Léa : nous avons mesuré, "
    "coupé, recommencé deux fois, et le tablier tient enfin sans fléchir au centre.\n"
    "Ensuite — pendant la pause — j'ai noté ce que « rater » m'avait appris : "
    "vérifier l'équerrage avant de coller, c'est gagner une heure.\n"
    "Le soir, j'ai relu mes notes de la semaine et j'ai vu que je pose plus de "
    "questions qu'avant, surtout quand une consigne me paraît floue ou incomplète.\n"
)
SRC_EMOJI = "Intro 🌟 étoilée.\n" + SRC
fv_cases = [
    (SRC, "nous avons mesuré, coupé, recommencé deux fois"),
    (SRC, "« rater »"),
    (SRC, "j'ai noté ce que « rater » m'avait appris"),
    (SRC, "Ensuite - pendant la pause - j'ai noté ce que \"rater\" m'avait appris"),
    (SRC, "ensuite — pendant la pause — j'ai noté ce que « rater » m'avait appris : vérifier l'équerrage"),
    (SRC, "  «nous avons mesuré, coupé, recommencé deux fois»  "),
    (SRC, "nous avons mesuré [...] recommencé deux fois"),
    (SRC, "je pose plus de questions qu'avant, surtout quand une consigne me parait floue ou incomplette."),
    (SRC, "Le soir j'ai relu mes notes de la semaine et j'ai vu que je pose bien plus de questions qu'avant"),
    (SRC, "totalement absent du texte source ici pourtant assez long pour l'étage difflib"),
    (SRC, "mot"),
    (SRC, ""),
    (SRC, "LE SOIR, J'AI RELU MES NOTES DE LA SEMAINE"),
    (SRC_EMOJI, "nous avons mesuré, coupé, recommencé deux fois"),
    (SRC_EMOJI, "le soir, j'ai relu mes notes de la semaine et j'ai vu que je pose plus de question"),
    ("petit", "un texte bien plus long que la source elle-même, oui vraiment certain"),
]
fv = []
for src, q in fv_cases:
    r = find_verbatim(src, q)
    fv.append({"src": src, "q": q, "out": list(r) if r else None})
dump("find_verbatim.vec.json", fv)

# ── util.stable_hash / empreinte ─────────────────────────────────────────────
sh_cases = ["", "a", "fiche|mockA#1|P3", "scn|3.07", "é🌟", "salt|x|1"]
emp = {
    "stable_hash": [{"s": s, "out": stable_hash(s)} for s in sh_cases],
    "empreinte": [
        {"parts": ["texte"], "out": empreinte("texte")},
        {"parts": ["a", ["x", 1], {"b": 2, "a": 1}], "out": empreinte("a", ["x", 1], {"b": 2, "a": 1})},
        {"parts": ["é🌟", None, True, False], "out": empreinte("é🌟", None, True, False)},
        {"parts": [{"é": "à", "Z": 1, "a": [1, {"y": None}]}],
         "out": empreinte({"é": "à", "Z": 1, "a": [1, {"y": None}]})},
        {"parts": [["ctrl\n\t\"\\", "fin"]], "out": empreinte(["ctrl\n\t\"\\", "fin"])},
    ],
    # forme empreinte_journee : tuples/floats/bools imbriqués — le poids 1.0
    # est un float Python (PyFloat côté JS)
    "empreinte_journee_like": empreinte(
        "texte de journée",
        [("mockA", "m1", "fam", 1.0, "mock"), ("mockB", None, None, 0.5, "mock")],
        ("mock", None, None),
        {"conf_min": 0.4, "corrobore": 0.6, "instruire": 0.25,
         "instruire_min_modeles": 2, "suspicion_min": 0.15},
        (2, True), {}, "personas-v1", True, "v9.8-contre-lecture"),
}
dump("empreinte.vec.json", emp)

# ── templates.resolve ─────────────────────────────────────────────────────────
warns = []
templates.log_warn = lambda m: warns.append(m)  # capture du warning
tpl_cases = []
def tpl(text, variables, strict=False):
    warns.clear()
    try:
        out = templates.resolve(text, variables, strict=strict)
        err = None
    except KeyError as e:
        out = None
        err = e.args[0]
    tpl_cases.append({"text": text, "vars": variables, "strict": strict,
                      "out": out, "warn": (warns[0] if warns else None), "err": err})

tpl("A={$A} B={$B} A2={$A} C={$C}", {"A": "x$& $1", "B": None})
tpl("{$X}{$Y}{$Z}", {"X": True, "Y": 3, "Z": 2.5})
tpl("val={$V}", {"V": "{$V} littéral"})
tpl("{$MANQUE} et {$AUSSI} et {$MANQUE}", {})
tpl("{$MANQUE}", {}, strict=True)
tpl("{$a} {$A1} {$1A} {$_OK}", {"_OK": "oui", "a": "non"})
tpl("rien", {"A": 1})
dump("templates.vec.json", tpl_cases)

# ── portfolio (synthétiques, figés intégralement) ────────────────────────────
def run_split(content, filename):
    d = tempfile.mkdtemp()
    p = os.path.join(d, filename)
    # newline="" : conserve les \r\n littéraux à l'écriture (read_text fera
    # la conversion universal newlines à la lecture, comme en production)
    with open(p, "w", encoding="utf-8", newline="") as f:
        f.write(content)
    return split_portfolio(p)

P_DATED = (
    "Préambule ignoré avant le premier titre.\n\n"
    "### 12.3.24 — matin\nPremière journée, texte assez court.\n\n"
    "## 12.03.2024 (soir)\nMême jour : l'id reçoit le suffixe _b.\n\n"
    "### 2024-03-11\nJournée ISO antérieure, elle doit remonter au tri.\r\n"
    "Avec une ligne CRLF pour tester les fins de ligne.\r\n\n"
    "#### Pas un séparateur (h4)\n\n"
    "### 5.3.124\nAnnée à trois chiffres : 2000 + 124.\n"
)
P_UNDATED = (
    "# Journal (h1 ignoré)\n\n"
    "## Semaine 1\nContenu de la première semaine.\n\n"
    "### Détail important\nSous-partie comptée comme feuille.\n\n"
    "## Semaine 2\nContenu de la deuxième semaine.\n"
)
P_SINGLE = "## Unique titre\nUn seul marqueur : fallback feuille unique.\n"
P_NONE = "# Grand titre h1\nTexte sans séparateur reconnu.\n#### h4\nSuite.\n"
P_SENT = (
    "### 1.1.24\n"
    "# Ligne titre ignorée pourtant longue " + "x" * 60 + "\n"
    "Ligne trop courte pour compter.\n"
    "Cette première phrase dépasse largement les soixante caractères requis, c'est certain ! "
    "Courte suite. "
    "Et voici une seconde phrase valide, elle aussi assez longue pour être retenue au final ? "
    "Une interminable phrase " + "très " * 80
    + "longue qui dépasse le plafond des quatre cents caractères et sera donc exclue du décompte.\n"
    "### 2.1.24\n"
    "Une autre journée 🌟 avec une unique phrase suffisamment développée pour figurer ici.\n"
)
synth = []
for content, fname in [
    (P_DATED, "Mon Portfolio (élève) v2.final.md"),
    (P_UNDATED, "SYNTH-hebdo.md"),
    (P_SINGLE, "unique.md"),
    (P_NONE, "sans_titres.md"),
    (P_SENT, "phrases.md"),
]:
    pf = run_split(content, fname)
    synth.append({
        "content": content, "filename": fname,
        "journal_id": pf["journal_id"],
        "raw_md5": md5(pf["raw"]),
        "feuilles": pf["feuilles"],
        "sentences": [list(t) for t in sentences_of(pf)],
        "feuilles_block": feuilles_block(pf["feuilles"]),
    })
dump("portfolio_synth.vec.json", synth)

# ── portfolio (réels : digests, les textes ne sont pas figés) ────────────────
reels = []
for fname in ["PLANT-01.md", "SYNTH-01.md", "SYNTH-02.md", "SYNTH-06.md", "SYNTH-08.md"]:
    p = os.path.join(TWIN, "tests", "portfolios", fname)
    pf = split_portfolio(p)
    sents = sentences_of(pf)
    reels.append({
        "filename": fname,
        "journal_id": pf["journal_id"],
        "raw_md5": md5(pf["raw"]),
        "n_feuilles": len(pf["feuilles"]),
        "feuilles_meta": [{"id": f["id"], "date": f["date"], "titre": f["titre"],
                           "start": f["start"], "end": f["end"],
                           "texte_len": len(f["texte"]), "texte_md5": md5(f["texte"])}
                          for f in pf["feuilles"]],
        "n_sentences": len(sents),
        "sentences_md5": md5("\n".join("%s|%s" % (fid, s) for fid, s in sents)),
        "first_sentence": list(sents[0]) if sents else None,
        "last_sentence": list(sents[-1]) if sents else None,
        "feuilles_block_md5": md5(feuilles_block(pf["feuilles"])),
    })
dump("portfolio_reels.vec.json", reels)

# ── referentiel ───────────────────────────────────────────────────────────────
FAKE = (
    "# Pôle 3 — MAIN : Créer & Incarner (factice)\n\n"
    "Préambule inventé du pôle, deux lignes,\navec des espaces finaux.  \n\n"
    "## 3.01 — Alpha factice\n\n**Essence** : première compétence inventée.\n"
    "Manifestations : a, b, c.\n\n"
    "## 3.02 — Béta factice  \n\nTexte de la deuxième fiche.\n\n"
    "### Sous-titre qui ne sépare pas\n\n## 3.9 — pas un code valide\n\n"
    "## 3.03 — Gamma — avec tiret interne\n\nDernière fiche.\n"
)
d = tempfile.mkdtemp()
fp = os.path.join(d, "P3.md")
with open(fp, "w", encoding="utf-8") as f:
    f.write(FAKE)
pole = parse_pole(fp, 3)
ordre = permutation(len(pole.competences), "fiche|mockA#1|P3")
ref = {
    "fake_fiche": FAKE,
    "pole": {"num": pole.num, "nom": pole.nom, "header": pole.header,
             "competences": pole.competences},
    "fiche_complete": pole.fiche_complete(),
    "ordre": ordre,
    "fiche_complete_ordre": pole.fiche_complete(ordre=ordre),
    "competence_302": pole.competence("3.02"),
    "pole_noms": {str(k): v for k, v in POLE_NOMS.items()},
    "pole_nom_fallback": Pole(9, "", []).nom,
    "permutations": [
        {"n": n, "seed": seed, "out": permutation(n, seed)}
        for n, seed in [
            (10, "fiche|gpt#1|P1"), (9, "fiche|gpt#1|P2"), (7, "fiche|mockA#1|P3"),
            (9, "fiche|claude#2|P4"), (8, "fiche|mockB#2|P5"), (10, "fiche|x|P6"),
            (8, "fiche|x|P7"), (0, "vide"), (1, "seul"), (61, "global|1"),
        ]
    ] + [{"n": 5, "seed": 42, "out": permutation(5, 42)}],
}
dump("referentiel.vec.json", ref)

# structure réelle (métadonnées seulement — jamais le texte des fiches)
from aurora.referentiel import load_referentiel
poles = load_referentiel(os.path.join(TWIN, "protocole", "tagger"))
ref_real = {
    "all_competences": [list(t) for t in all_competences(poles)],
    "n_codes": sum(len(p.competences) for p in poles.values()),
}
dump("referentiel_reel.vec.json", ref_real)
print("done")
