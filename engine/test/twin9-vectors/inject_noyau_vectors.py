# -*- coding: utf-8 -*-
"""Injecte les blobs de vecteurs CPython du NOYAU dans les fichiers .test.js
(remplace les littéraux placeholder "__VEC_*__" — pour RÉGÉNÉRER, remettre
d'abord les placeholders à la place des littéraux dans chaque test)."""
import os

SCRATCH = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(SCRATCH, "..", "..", "src", "twin9")

# (fichier test, [(marqueur, fichier vecteurs)])
PLAN = [
    (os.path.join(SRC, "py", "pyText.test.js"), [("__VEC_PYTEXT__", "pytext.vec.json")]),
    (os.path.join(SRC, "util.test.js"), [
        ("__VEC_EXTRACT_JSON__", "extract_json.vec.json"),
        ("__VEC_NEUTRALISER__", "neutraliser.vec.json"),
        ("__VEC_FIND_VERBATIM__", "find_verbatim.vec.json"),
        ("__VEC_EMPREINTE__", "empreinte.vec.json"),
    ]),
    (os.path.join(SRC, "templates.test.js"), [("__VEC_TEMPLATES__", "templates.vec.json")]),
    (os.path.join(SRC, "portfolio.test.js"), [
        ("__VEC_PORTFOLIO_SYNTH__", "portfolio_synth.vec.json"),
        ("__VEC_PORTFOLIO_REELS__", "portfolio_reels.vec.json"),
    ]),
    (os.path.join(SRC, "referentiel.test.js"), [
        ("__VEC_REFERENTIEL__", "referentiel.vec.json"),
        ("__VEC_REFERENTIEL_REEL__", "referentiel_reel.vec.json"),
    ]),
]

for path, subs in PLAN:
    with open(path, encoding="utf-8") as f:
        src = f.read()
    for marker, vec in subs:
        with open(os.path.join(SCRATCH, vec), encoding="utf-8") as f:
            blob = f.read().strip()
        lit = '"%s"' % marker
        assert lit in src, (path, marker)
        src = src.replace(lit, blob, 1)
        print("injecté", os.path.basename(path), marker, len(blob), "octets")
    with open(path, "w", encoding="utf-8") as f:
        f.write(src)
