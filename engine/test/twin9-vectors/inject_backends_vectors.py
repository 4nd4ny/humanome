# -*- coding: utf-8 -*-
"""Injecte backends.vec.json dans backends.test.js (remplace le littéral
placeholder "__VEC_BACKENDS__" — pour RÉGÉNÉRER, remettre d'abord le
placeholder à la place du littéral dans le test)."""
import os

SCRATCH = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(SCRATCH, "..", "..", "src", "twin9")

path = os.path.join(SRC, "backends.test.js")
with open(path, encoding="utf-8") as f:
    src = f.read()
with open(os.path.join(SCRATCH, "backends.vec.json"), encoding="utf-8") as f:
    blob = f.read().strip()
lit = '"__VEC_BACKENDS__"'
assert lit in src, "placeholder absent de backends.test.js"
src = src.replace(lit, blob, 1)
with open(path, "w", encoding="utf-8") as f:
    f.write(src)
print("injecté backends.test.js", len(blob), "octets")
