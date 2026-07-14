// Vecteurs générés par CPython 3.14.3 (str.strip/lstrip/rstrip/splitlines)
// puis figés ici — script : engine/test/twin9-vectors/gen_noyau_vectors.py ;
// jamais de python à l'exécution.
import { describe, expect, it } from "vitest";
import {
  PY_WS_CLASS,
  pyIsSpace,
  pyStrip,
  pyLStrip,
  pyRStrip,
  pySplitlines,
  universalNewlines,
  cpLen,
  u16ToCpIndexer,
} from "./pyText.js";

const V = {
 "strip": [
  {
   "s": "   x\ty\u001c",
   "chars": null,
   "out": "x\ty"
  },
  {
   "s": "  bonjour  ",
   "chars": null,
   "out": "bonjour"
  },
  {
   "s": "\u001c\u001d\u001e\u001f\u0085 zut \u3000 ",
   "chars": null,
   "out": "zut"
  },
  {
   "s": "\u00a0\u202f\u2028 mixte \u2029",
   "chars": null,
   "out": "mixte"
  },
  {
   "s": "\u00ab\u00bb\"' test \u00ab\u00bb\"'",
   "chars": "\u00ab\u00bb\"' ",
   "out": "test"
  },
  {
   "s": "__a_b__",
   "chars": "_",
   "out": "a_b"
  },
  {
   "s": "",
   "chars": null,
   "out": ""
  },
  {
   "s": "  ",
   "chars": null,
   "out": ""
  }
 ],
 "lstrip": [
  {
   "s": "###   Titre # interne",
   "chars": "# ",
   "out": "Titre # interne"
  },
  {
   "s": "## 12.03.24 \u2014 matin",
   "chars": "# ",
   "out": "12.03.24 \u2014 matin"
  }
 ],
 "rstrip": [
  {
   "s": "  fin  \t",
   "chars": null,
   "out": "  fin"
  }
 ],
 "splitlines": [
  {
   "s": "a\nb\r\nc\rd\u001ce f\u0085g\u000bh\fi j",
   "out": [
    "a",
    "b",
    "c",
    "d",
    "e f",
    "g",
    "h",
    "i j"
   ]
  },
  {
   "s": "fin\n",
   "out": [
    "fin"
   ]
  },
  {
   "s": "\n\na\n",
   "out": [
    "",
    "",
    "a"
   ]
  },
  {
   "s": "sans saut",
   "out": [
    "sans saut"
   ]
  },
  {
   "s": "",
   "out": []
  },
  {
   "s": "x\r\n\r\ny",
   "out": [
    "x",
    "",
    "y"
   ]
  },
  {
   "s": "l1\u2028l2\u2029l3",
   "out": [
    "l1",
    "l2",
    "l3"
   ]
  }
 ]
};

describe("pyText — sémantiques de chaînes Python", () => {
  it("pyStrip reproduit str.strip([chars])", () => {
    for (const c of V.strip) {
      expect(pyStrip(c.s, c.chars === null ? undefined : c.chars)).toBe(c.out);
    }
  });

  it("pyLStrip reproduit str.lstrip(chars)", () => {
    for (const c of V.lstrip) {
      expect(pyLStrip(c.s, c.chars === null ? undefined : c.chars)).toBe(c.out);
    }
  });

  it("pyRStrip reproduit str.rstrip()", () => {
    for (const c of V.rstrip) {
      expect(pyRStrip(c.s, c.chars === null ? undefined : c.chars)).toBe(c.out);
    }
  });

  it("pySplitlines reproduit str.splitlines()", () => {
    for (const c of V.splitlines) {
      expect(pySplitlines(c.s)).toEqual(c.out);
    }
  });

  it("pyIsSpace : les 29 points de code isspace() de Python, et eux seuls", () => {
    // Ensemble énuméré avec CPython (vérifié à la génération de ce module).
    const expected = [
      0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x1c, 0x1d, 0x1e, 0x1f, 0x20,
      0x85, 0xa0, 0x1680,
      0x2000, 0x2001, 0x2002, 0x2003, 0x2004, 0x2005, 0x2006, 0x2007,
      0x2008, 0x2009, 0x200a, 0x2028, 0x2029, 0x202f, 0x205f, 0x3000,
    ];
    const set = new Set(expected);
    for (let cp = 0; cp <= 0x3100; cp++) {
      expect(pyIsSpace(String.fromCodePoint(cp))).toBe(set.has(cp));
    }
    // U+FEFF : \s en JS mais PAS isspace() en Python.
    expect(pyIsSpace("﻿")).toBe(false);
  });

  it("PY_WS_CLASS matche exactement l'ensemble isspace()", () => {
    const re = new RegExp("^[" + PY_WS_CLASS + "]$");
    for (let cp = 0; cp <= 0x3100; cp++) {
      const ch = String.fromCodePoint(cp);
      expect(re.test(ch)).toBe(pyIsSpace(ch));
    }
  });

  it("universalNewlines : \\r\\n et \\r deviennent \\n", () => {
    expect(universalNewlines("a\r\nb\rc\nd\r")).toBe("a\nb\nc\nd\n");
    expect(universalNewlines("sans")).toBe("sans");
  });

  it("cpLen et u16ToCpIndexer comptent en points de code", () => {
    expect(cpLen("a\u{1F31F}b")).toBe(3);
    expect(cpLen("")).toBe(0);
    const idx = u16ToCpIndexer("x\u{1F31F}y\u{1F680}z");
    expect(idx(0)).toBe(0); // x
    expect(idx(1)).toBe(1); // 🌟 (paire aux index UTF-16 1-2)
    expect(idx(3)).toBe(2); // y
    expect(idx(4)).toBe(3); // 🚀
    expect(idx(6)).toBe(4); // z
    expect(idx(7)).toBe(5); // fin de chaîne
    const ident = u16ToCpIndexer("ascii épuré");
    expect(ident(7)).toBe(7);
  });
});
