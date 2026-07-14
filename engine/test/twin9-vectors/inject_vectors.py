# -*- coding: utf-8 -*-
"""Injecte les blobs de vecteurs CPython dans les fichiers .test.js
(remplace le littéral placeholder "__VECTORS__" — pour RÉGÉNÉRER, remettre
d'abord le placeholder à la place du littéral VECTORS dans chaque test)."""
import os

SCRATCH = os.path.dirname(os.path.abspath(__file__))
DEST = os.path.join(SCRATCH, "..", "..", "src", "twin9", "py")

for name in ["md5", "stableHash", "mt19937", "pyRound", "pyStr", "pyJson", "difflib"]:
    with open(os.path.join(SCRATCH, name + ".vectors.json"), encoding="utf-8") as f:
        blob = f.read().strip()
    path = os.path.join(DEST, name + ".test.js")
    with open(path, encoding="utf-8") as f:
        src = f.read()
    marker = '"__VECTORS__"'
    assert marker in src, path
    src = src.replace(marker, blob, 1)
    with open(path, "w", encoding="utf-8") as f:
        f.write(src)
    print("injecté", name, len(blob), "octets")
