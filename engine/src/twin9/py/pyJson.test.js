// Vecteurs générés par CPython 3.14.3 (json.dumps) puis figés ici — script :
// engine/test/twin9-vectors/gen_vectors.py. Les objets JS ci-dessous MIROITENT les objets
// Python du générateur (mêmes valeurs, même ordre d'insertion) ; les floats
// entiers Python (1.0, 1e16) sont marqués PyFloat côté JS.
import { describe, expect, it } from "vitest";
import { PyFloat, codePointCompare, pyJsonDumps, pyJsonDumpsEmpreinte, pyJsonDumpsWriteJson } from "./pyJson.js";
import { pyStr } from "./pyStr.js";

const VECTORS = [
 {
  "compact": "{\"b\": 1, \"a\": 2, \"\u00e9\": 3, \"Z\": 4}",
  "empreinte": "{\"Z\": 4, \"a\": 2, \"b\": 1, \"\u00e9\": 3}",
  "indent2": "{\n  \"b\": 1,\n  \"a\": 2,\n  \"\u00e9\": 3,\n  \"Z\": 4\n}\n"
 },
 {
  "compact": "[\"x\", 1, 1.0, 0.1, true, false, null]",
  "empreinte": "[\"x\", 1, 1.0, 0.1, true, false, null]",
  "indent2": "[\n  \"x\",\n  1,\n  1.0,\n  0.1,\n  true,\n  false,\n  null\n]\n"
 },
 {
  "compact": "{\"nested\": {\"z\": [1, 2, {\"k\": \"v\"}], \"a\": \"h\u00e9llo\"}, \"emoji\": \"\ud83c\udf0d\", \"quote\": \"il a dit \\\"non\\\"\\nligne2\\ttab\\\\fin\"}",
  "empreinte": "{\"emoji\": \"\ud83c\udf0d\", \"nested\": {\"a\": \"h\u00e9llo\", \"z\": [1, 2, {\"k\": \"v\"}]}, \"quote\": \"il a dit \\\"non\\\"\\nligne2\\ttab\\\\fin\"}",
  "indent2": "{\n  \"nested\": {\n    \"z\": [\n      1,\n      2,\n      {\n        \"k\": \"v\"\n      }\n    ],\n    \"a\": \"h\u00e9llo\"\n  },\n  \"emoji\": \"\ud83c\udf0d\",\n  \"quote\": \"il a dit \\\"non\\\"\\nligne2\\ttab\\\\fin\"\n}\n"
 },
 {
  "compact": "{}",
  "empreinte": "{}",
  "indent2": "{}\n"
 },
 {
  "compact": "[]",
  "empreinte": "[]",
  "indent2": "[]\n"
 },
 {
  "compact": "{\"conf\": 0.85, \"ratio\": 0.9230769230769231, \"n\": 3, \"vide\": {}, \"lv\": []}",
  "empreinte": "{\"conf\": 0.85, \"lv\": [], \"n\": 3, \"ratio\": 0.9230769230769231, \"vide\": {}}",
  "indent2": "{\n  \"conf\": 0.85,\n  \"ratio\": 0.9230769230769231,\n  \"n\": 3,\n  \"vide\": {},\n  \"lv\": []\n}\n"
 },
 {
  "compact": "[\"ctrl:\\u0001\\u001f\", \"del:\u007f\", \"u2028:\u2028\", \"bell\\u0007\"]",
  "empreinte": "[\"ctrl:\\u0001\\u001f\", \"del:\u007f\", \"u2028:\u2028\", \"bell\\u0007\"]",
  "indent2": "[\n  \"ctrl:\\u0001\\u001f\",\n  \"del:\u007f\",\n  \"u2028:\u2028\",\n  \"bell\\u0007\"\n]\n"
 },
 {
  "compact": "{\"1\": \"un\", \"10\": \"dix\", \"2\": \"deux\"}",
  "empreinte": "{\"1\": \"un\", \"10\": \"dix\", \"2\": \"deux\"}",
  "indent2": "{\n  \"1\": \"un\",\n  \"10\": \"dix\",\n  \"2\": \"deux\"\n}\n"
 },
 {
  "compact": "[\"a\", [\"b\", 3]]",
  "empreinte": "[\"a\", [\"b\", 3]]",
  "indent2": "[\n  \"a\",\n  [\n    \"b\",\n    3\n  ]\n]\n"
 },
 {
  "compact": "{\"neg\": -0.0, \"big\": 1e+16, \"small\": 1e-05, \"un\": 1.0}",
  "empreinte": "{\"big\": 1e+16, \"neg\": -0.0, \"small\": 1e-05, \"un\": 1.0}",
  "indent2": "{\n  \"neg\": -0.0,\n  \"big\": 1e+16,\n  \"small\": 1e-05,\n  \"un\": 1.0\n}\n"
 },
 {
  "compact": "{\"accents\": \"\u00e0\u00e9\u00ee\u00f5\u00fc\", \"\u00abcl\u00e9\u00bb\": \"\u201ctypo\u201d et \u2019quote\u2019\"}",
  "empreinte": "{\"accents\": \"\u00e0\u00e9\u00ee\u00f5\u00fc\", \"\u00abcl\u00e9\u00bb\": \"\u201ctypo\u201d et \u2019quote\u2019\"}",
  "indent2": "{\n  \"accents\": \"\u00e0\u00e9\u00ee\u00f5\u00fc\",\n  \"\u00abcl\u00e9\u00bb\": \"\u201ctypo\u201d et \u2019quote\u2019\"\n}\n"
 },
 {
  "compact": "[[[\"profond\"]], {\"x\": {\"y\": {\"z\": 0.5}}}]",
  "empreinte": "[[[\"profond\"]], {\"x\": {\"y\": {\"z\": 0.5}}}]",
  "indent2": "[\n  [\n    [\n      \"profond\"\n    ]\n  ],\n  {\n    \"x\": {\n      \"y\": {\n        \"z\": 0.5\n      }\n    }\n  }\n]\n"
 }
];

// Mêmes objets que la liste `objs` du générateur Python, dans le même ordre.
const OBJS = [
  { b: 1, a: 2, "é": 3, Z: 4 },
  ["x", 1, new PyFloat(1), 0.1, true, false, null],
  {
    nested: { z: [1, 2, { k: "v" }], a: "héllo" },
    emoji: "🌍",
    quote: 'il a dit "non"\nligne2\ttab\\fin',
  },
  {},
  [],
  { conf: 0.85, ratio: 0.9230769230769231, n: 3, vide: {}, lv: [] },
  ["ctrl:\x01\x1f", "del:\x7f", "u2028: ", "bell\x07"],
  new Map([["1", "un"], ["10", "dix"], ["2", "deux"]]),
  ["a", ["b", 3]],
  { neg: -0, big: new PyFloat(1e16), small: 1e-5, un: new PyFloat(1) },
  { accents: "àéîõü", "«clé»": "“typo” et ’quote’" },
  [[["profond"]], { x: { y: { z: 0.5 } } }],
];

describe("pyJsonDumps — parité octet à octet avec json.dumps Python", () => {
  OBJS.forEach((obj, i) => {
    const v = VECTORS[i];
    it(`objet #${i} — compact par défaut (séparateurs ", " et ": ")`, () => {
      expect(pyJsonDumps(obj)).toBe(v.compact);
    });
    it(`objet #${i} — profil empreinte (sort_keys, default=str)`, () => {
      expect(pyJsonDumps(obj, { sortKeys: true, defaultFn: (x) => pyStr(x) })).toBe(v.empreinte);
    });
    it(`objet #${i} — profil write_json (indent=2 + \\n final)`, () => {
      expect(pyJsonDumpsWriteJson(obj)).toBe(v.indent2);
    });
  });

  it("pyJsonDumpsEmpreinte : profil de util.empreinte(*parts)", () => {
    // empreinte(parts) sérialise le TABLEAU des arguments.
    const parts = ["v9.8-contre-lecture", { b: 1, a: 2 }, 3, null, true];
    // json.dumps(parts, sort_keys=True, ensure_ascii=False, default=str)
    expect(pyJsonDumpsEmpreinte(parts)).toBe('["v9.8-contre-lecture", {"a": 2, "b": 1}, 3, null, true]');
  });

  it("clés numériques : Map préserve l'ordre d'insertion (objets JS le cassent)", () => {
    // Un objet JS { "1": …, "10": …, "2": … } réordonnerait 1, 2, 10.
    const m = new Map([["10", "a"], ["1", "b"]]);
    expect(pyJsonDumps(m)).toBe('{"10": "a", "1": "b"}');
  });

  it("NaN/Infinity nus, comme Python (allow_nan par défaut)", () => {
    expect(pyJsonDumps([NaN, Infinity, -Infinity])).toBe("[NaN, Infinity, -Infinity]");
    expect(pyJsonDumps([new PyFloat(NaN)])).toBe("[NaN]");
  });
});

describe("codePointCompare — tri Python des clés (jamais localeCompare)", () => {
  it("Pédagogue APRÈS Portraitiste, Éthicien dernier (spec-index §4.8)", () => {
    const noms = ["Pédagogue", "Portraitiste", "Éthicien", "Avocat"];
    noms.sort(codePointCompare);
    expect(noms).toEqual(["Avocat", "Portraitiste", "Pédagogue", "Éthicien"]);
  });
  it("astral comparé par points de code, pas par unités UTF-16", () => {
    // U+FF61 (｡) < U+1F30D (🌍) en points de code ; en UTF-16 brut
    // l'ordre serait inversé (surrogate high 0xD83C < 0xFF61).
    expect(codePointCompare("｡", "🌍")).toBeLessThan(0);
    expect("｡" < "🌍").toBe(false); // le piège JS natif, documenté
  });
});
