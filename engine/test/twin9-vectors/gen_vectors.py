# -*- coding: utf-8 -*-
"""Génère les vecteurs de test CPython pour les modules infra twin9/py.
Sortie : un fichier JSON-JS par module dans ce répertoire (NaN/Infinity
littéraux autorisés : le blob est injecté dans un fichier .test.js, pas parsé
en JSON)."""
import difflib
import hashlib
import json
import os
import random
import sys

OUT = os.path.dirname(os.path.abspath(__file__))
PYVER = "%d.%d.%d" % sys.version_info[:3]


def dump(name, obj):
    path = os.path.join(OUT, name + ".vectors.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=True, indent=1)
    print("écrit", path)


# ── md5 / stableHash ─────────────────────────────────────────────────────────
STRINGS = [
    "",
    "a",
    "abc",
    "message digest",
    "abcdefghijklmnopqrstuvwxyz",
    "The quick brown fox jumps over the lazy dog",
    "Éléonore çà et là — « guillemets » et ’apostrophes’ typographiques",
    "🌍🚀 émojis hors BMP 🎭",
    "héllo\nwörld\navec\tsauts",
    "a" * 55,
    "a" * 56,
    "a" * 57,
    "a" * 63,
    "a" * 64,
    "a" * 65,
    "ab" * 5000,
    "é" * 3000,
    "tag_lecteur01_2024-03-01_P3",
    "jury|plant01|3|None|regulier",
    "leger|2024-03-01|3.07|1",
    "salt-démo|premiere_impression|2024-03-01|passe2",
    "Pédagogue < Portraitiste < Éthicien",
    ("Portfolio réflexif — semaine du 4 mars. J'ai animé l'atelier de médiation "
     "scientifique avec les CM2 ; nous avons construit un sismographe en carton. ") * 30,
]

def stable_hash(s):
    return int(hashlib.md5(s.encode("utf-8")).hexdigest()[:12], 16)

dump("md5", [{"s": s, "hex": hashlib.md5(s.encode("utf-8")).hexdigest()} for s in STRINGS])
dump("stableHash", [{"s": s, "h": stable_hash(s)} for s in STRINGS])

# ── mt19937 ──────────────────────────────────────────────────────────────────
SEEDS = [0, 1, 42, 12345, 233223382208256, 9007199254740991,
         stable_hash("salt|tag|gpt|3.07|2024-03-01")]
mt = {"seeds": []}
for seed in SEEDS:
    entry = {"seed": seed}
    r = random.Random(seed)
    entry["random10"] = [r.random() for _ in range(10)]
    r = random.Random(seed)
    ks = [1, 3, 8, 16, 31, 32, 33, 48, 53]
    entry["getrandbits"] = {"ks": ks, "vals": [r.getrandbits(k) for k in ks]}
    r = random.Random(seed)
    pairs = [(0, 1), (1, 6), (0, 2**31 - 2), (5, 5), (-10, 10), (0, 6)]
    entry["randint"] = {"pairs": pairs,
                        "vals": [r.randint(a, b) for a, b in pairs for _ in range(2)]}
    r = random.Random(seed)
    entry["choice7x10"] = [r.choice(list(range(7))) for _ in range(10)]
    r = random.Random(seed)
    x10 = list(range(10)); r.shuffle(x10)
    x25 = list(range(25)); r.shuffle(x25)
    entry["shuffle"] = {"x10": x10, "x25_apres_x10": x25}
    r = random.Random(seed)
    samples = []
    for n, k in [(7, 3), (7, 7), (20, 5), (30, 6), (100, 10), (500, 3), (2000, 40)]:
        samples.append({"n": n, "k": k, "out": r.sample(list(range(n)), k)})
    entry["samples"] = samples
    # séquence mêlée : l'état est partagé entre méthodes
    r = random.Random(seed)
    mixed = [r.random(), r.randint(0, 100), r.choice(list(range(5))),
             r.sample(list(range(12)), 4), r.random(), r.getrandbits(31)]
    y = list(range(6)); r.shuffle(y); mixed.append(y); mixed.append(r.random())
    entry["mixed"] = mixed
    mt["seeds"].append(entry)
dump("mt19937", mt)

# ── pyRound ──────────────────────────────────────────────────────────────────
xs2 = [2.675, 2.665, 0.125, 0.135, 0.045, 0.055, 2.67499999, 0.30000000000000004,
       1.0005, -2.675, 0.005, 0.015, 0.025, 0.985, 0.995, 1e-13, 123.456]
rnd = random.Random(42)
xs2 += [0.8 + rnd.random() * 0.15 for _ in range(8)]
xs2 += [0.6 + rnd.random() * 0.2 for _ in range(4)]
vec_nd = [[x, 2, round(x, 2)] for x in xs2]
vec_nd += [[x, 1, round(x, 1)] for x in [0.25, 0.35, -0.25, 2.675, 0.05, 12.15, 0.8500000000000001]]
vec_nd += [[x, 3, round(x, 3)] for x in [0.0625, 1.0005, 2.6754999]]
vec_nd += [[1234.5678, -2, round(1234.5678, -2)], [1250.0, -2, round(1250.0, -2)],
           [1350.0, -2, round(1350.0, -2)], [55.0, -1, round(55.0, -1)],
           [0.0, 2, round(0.0, 2)], [-0.4, 0, round(-0.4, 0)],
           [5e-324, 2, round(5e-324, 2)], [1.5e300, 2, round(1.5e300, 2)],
           [-0.0, 1, round(-0.0, 1)]]
vec_int = [[x, round(x)] for x in
           [2.5, 3.5, -2.5, -3.5, 0.5, 1.5, -0.5, 0.4999999999999999, 2.675,
            -1.5, 1e15 + 0.5, 7.0, -0.0, 0.0]]
vec_divmod = [[a, b, list(divmod(a, b)), a % b] for a, b in
              [(7, 3), (-7, 3), (7, -3), (-7, -3), (0, 5), (10, 2), (-1, 7),
               (13, 5), (-13, 5), (7.5, 2), (-7.5, 2), (7.5, -2)]]
dump("pyRound", {"ndigits": vec_nd, "entier": vec_int, "divmod": vec_divmod})

# ── pyStr ────────────────────────────────────────────────────────────────────
floats = [0.1, 1.0, -1.0, 2.675, 0.30000000000000004, 1e16, 1e15,
          9999999999999998.0, 1e-4, 1e-5, 1.5e-300, 1e21, 123456789.123456789,
          -0.0, 0.0, float("inf"), float("-inf"), float("nan"), 0.25, 1 / 3,
          5e-324, 1.7976931348623157e308, 2.0, 100.0, 0.9230769230769231,
          1e-323, 3.14159e17, -2.5e-7]
vec_repr = [[x, repr(x)] for x in floats]
fmt_cases = [
    ["[%7.1fs] %-5s %s", [0.34, "WARN", "message"]],
    ["[%7.1fs] %-5s %s", [123.456, "OK", "x"]],
    ["[%7.1fs] %-5s %s", [12345.678, "ERR", "long"]],
    ["%04d-%02d-%02d", [2024, 3, 1]],
    ["F%02d", [7]],
    ["F%02d", [100]],
    ["%x", [233223382208256]],
    ["%x", [255]],
    ["%.2f", [0.125]],
    ["%.2f", [2.675]],
    ["%.1f", [0.25]],
    ["%.0f", [2.5]],
    ["%.0f", [3.5]],
    ["%7.1f", [-3.04]],
    ["%02d", [-5]],
    ["%05.1f", [3.14159]],
    ["%-8s|", ["ab"]],
    ["100%%", []],
    ["retour_hors%02d_l%d", [7, 3]],
    ["%f", [0.5]],
    ["%.3f", [0.0625]],
    ["%.2f", [-0.0]],
    ["%d", [-0.0]],
    ["%s et %s et %s et %s", [True, False, None, 42]],
]
def apply_fmt(f, args):
    return f % tuple(args)
vec_fmt = [[f, a, apply_fmt(f, a)] for f, a in fmt_cases]
vec_str = [[None, str(None)], [True, str(True)], [False, str(False)],
           [42, str(42)], [-7, str(-7)], [0, str(0)]]
vec_reprstr = [[s, repr(s)] for s in
               ["l'été", 'a"b', "a'b\"c", "tab\there\nnl", "simple", "ctrl\x01\x1f",
                "accents éà🌍"]]
vec_tuple = [[["a", 3], str(("a", 3))], [[1], str((1,))], [[], str(())],
             [["x", None, True, 2.5], str(("x", None, True, 2.5))]]
vec_list = [[["a", 3, None], str(["a", 3, None])]]
dump("pyStr", {"floatRepr": vec_repr, "format": vec_fmt, "str": vec_str,
               "reprStr": vec_reprstr, "reprTuple": vec_tuple, "reprList": vec_list})

# ── pyJson ───────────────────────────────────────────────────────────────────
objs = [
    {"b": 1, "a": 2, "é": 3, "Z": 4},
    ["x", 1, 1.0, 0.1, True, False, None],
    {"nested": {"z": [1, 2, {"k": "v"}], "a": "héllo"}, "emoji": "🌍",
     "quote": "il a dit \"non\"\nligne2\ttab\\fin"},
    {},
    [],
    {"conf": 0.85, "ratio": 0.9230769230769231, "n": 3, "vide": {}, "lv": []},
    ["ctrl:\x01\x1f", "del:\x7f", "u2028: ", "bell\x07"],
    {"1": "un", "10": "dix", "2": "deux"},
    ["a", ["b", 3]],
    {"neg": -0.0, "big": 1e16, "small": 1e-05, "un": 1.0},
    {"accents": "àéîõü", "«clé»": "“typo” et ’quote’"},
    [[["profond"]], {"x": {"y": {"z": 0.5}}}],
]
vec_json = []
for o in objs:
    vec_json.append({
        "compact": json.dumps(o, ensure_ascii=False),
        "empreinte": json.dumps(o, sort_keys=True, ensure_ascii=False, default=str),
        "indent2": json.dumps(o, ensure_ascii=False, indent=2) + "\n",
    })
dump("pyJson", vec_json)

# ── difflib ──────────────────────────────────────────────────────────────────
LONG_B = ("Aujourd'hui, j'ai animé l'atelier de médiation scientifique avec les "
          "CM2 de l'école Jean-Jaurès ; nous avons construit un sismographe en "
          "carton et chacun a noté ses observations dans le carnet de bord. "
          "Ensuite nous avons comparé les tracés obtenus et discuté des sources "
          "d'erreur possibles, avant de ranger le matériel ensemble.")
QUOTE = "j'ai animé l'atelier de médiation scientifique avec les CM2"
QUOTE_TYPO = "jai animé latelier de mediation scientifique avec les CM2"
pairs = [
    ("abcd", "bcde"),
    (" abcd", "abcd abcd"),
    ("abxcd", "abcd"),
    ("", "abc"),
    ("abc", ""),
    ("identique", "identique"),
    ("🌍ab🌍cd", "ab🌍cdef"),
    ("aaaa", "aaa"),
    ("xaxbx", "bxax"),
    (QUOTE.lower(), LONG_B.lower()),
    (QUOTE_TYPO.lower(), LONG_B.lower()),
    (QUOTE_TYPO.lower(), LONG_B[24:24 + len(QUOTE_TYPO)].lower()),
    ("e" * 10 + "xyz", ("e" * 50 + "abc") * 4),          # 'e' populaire (len 212)
    ("ab e cd", "e".join(["mot%d" % i for i in range(40)])),
    ("q" * 5 + " suffixe commun", "x" * 190 + " suffixe commun"),  # len(b) > 200
    ("phrase avec « guillemets » et — tirets", "texte avec \"guillemets\" et - tirets"),
]
vec_dl = []
for a, b in pairs:
    for autojunk in (False, True):
        sm = difflib.SequenceMatcher(a=a, b=b, autojunk=autojunk)
        m = sm.find_longest_match(0, len(a), 0, len(b))
        blocks = [[x.a, x.b, x.size] for x in sm.get_matching_blocks()]
        vec_dl.append({"a": a, "b": b, "autojunk": autojunk,
                       "flm": [m.a, m.b, m.size], "blocks": blocks,
                       "ratio": sm.ratio()})
# seuils autojunk autour de len(b) == 200
for blen in (199, 200, 201, 300):
    b = ("ab" * 200)[:blen]
    a = "ab" * 12
    sm = difflib.SequenceMatcher(a=a, b=b, autojunk=True)
    m = sm.find_longest_match(0, len(a), 0, len(b))
    vec_dl.append({"a": a, "b": b, "autojunk": True,
                   "flm": [m.a, m.b, m.size],
                   "blocks": [[x.a, x.b, x.size] for x in sm.get_matching_blocks()],
                   "ratio": sm.ratio()})
dump("difflib", vec_dl)

print("PYVER", PYVER)
