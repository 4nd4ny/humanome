// Vecteurs générés par CPython 3.14.3 (aurora/templates.py de Twin_v9 :
// resolve avec str() Python, warning et mode strict) puis figés ici — script :
// engine/test/twin9-vectors/gen_noyau_vectors.py ; jamais de python à
// l'exécution.
import { afterEach, describe, expect, it } from "vitest";
import { resolve, resolveContent } from "./templates.js";
import { setLogger } from "./util.js";
import { PyFloat } from "./py/pyStr.js";

const V = [
 {
  "text": "A={$A} B={$B} A2={$A} C={$C}",
  "vars": {
   "A": "x$& $1",
   "B": null
  },
  "strict": false,
  "out": "A=x$& $1 B=None A2=x$& $1 C={$C}",
  "warn": "Variables non r\u00e9solues : C",
  "err": null
 },
 {
  "text": "{$X}{$Y}{$Z}",
  "vars": {
   "X": true,
   "Y": 3,
   "Z": 2.5
  },
  "strict": false,
  "out": "True32.5",
  "warn": null,
  "err": null
 },
 {
  "text": "val={$V}",
  "vars": {
   "V": "{$V} litt\u00e9ral"
  },
  "strict": false,
  "out": "val={$V} litt\u00e9ral",
  "warn": null,
  "err": null
 },
 {
  "text": "{$MANQUE} et {$AUSSI} et {$MANQUE}",
  "vars": {},
  "strict": false,
  "out": "{$MANQUE} et {$AUSSI} et {$MANQUE}",
  "warn": "Variables non r\u00e9solues : AUSSI, MANQUE",
  "err": null
 },
 {
  "text": "{$MANQUE}",
  "vars": {},
  "strict": true,
  "out": null,
  "warn": null,
  "err": "Variables non r\u00e9solues : MANQUE"
 },
 {
  "text": "{$a} {$A1} {$1A} {$_OK}",
  "vars": {
   "_OK": "oui",
   "a": "non"
  },
  "strict": false,
  "out": "{$a} {$A1} {$1A} oui",
  "warn": "Variables non r\u00e9solues : A1",
  "err": null
 },
 {
  "text": "rien",
  "vars": {
   "A": 1
  },
  "strict": false,
  "out": "rien",
  "warn": null,
  "err": null
 }
];

afterEach(() => setLogger({}));

describe("templates.resolve — parité resolve", () => {
  it("substitution str(), variables absentes laissées, warning trié", () => {
    for (const c of V) {
      const warns = [];
      setLogger({ warn: (m) => warns.push(m) });
      if (c.err !== null) {
        expect(() => resolve(c.text, c.vars, c.strict)).toThrowError(c.err);
        continue;
      }
      expect(resolve(c.text, c.vars, c.strict), c.text).toBe(c.out);
      expect(warns.length ? warns[0] : null, c.text).toBe(c.warn);
    }
  });

  it("clé présente à valeur null → 'None' (pas manquante), Map acceptée", () => {
    const warns = [];
    setLogger({ warn: (m) => warns.push(m) });
    expect(resolve("{$A}", new Map([["A", null]]))).toBe("None");
    expect(warns).toEqual([]);
  });

  it("PyFloat : float Python entier substitué en '1.0'", () => {
    expect(resolve("{$W}", { W: new PyFloat(1) })).toBe("1.0");
  });

  it("la valeur substituée n'est pas ré-analysée ($&, $1, {$X} littéraux)", () => {
    expect(resolve("v={$A}", { A: "$& $1 $' {$A}" })).toBe("v=$& $1 $' {$A}");
  });

  it("resolveContent normalise les fins de ligne du gabarit (universal newlines)", () => {
    expect(resolveContent("a\r\n{$B}\rc", { B: "x" })).toBe("a\nx\nc");
  });
});
