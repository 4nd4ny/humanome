// Vecteurs générés par CPython 3.14.3 (repr(float), format %, str, repr) puis
// figés ici — script : engine/test/twin9-vectors/gen_vectors.py.
import { describe, expect, it } from "vitest";
import { PyFloat, pyFloatRepr, pyFormat, pyRepr, pyReprTuple, pyStr } from "./pyStr.js";

const VECTORS = {
 "floatRepr": [
  [
   0.1,
   "0.1"
  ],
  [
   1.0,
   "1.0"
  ],
  [
   -1.0,
   "-1.0"
  ],
  [
   2.675,
   "2.675"
  ],
  [
   0.30000000000000004,
   "0.30000000000000004"
  ],
  [
   1e+16,
   "1e+16"
  ],
  [
   1000000000000000.0,
   "1000000000000000.0"
  ],
  [
   9999999999999998.0,
   "9999999999999998.0"
  ],
  [
   0.0001,
   "0.0001"
  ],
  [
   1e-05,
   "1e-05"
  ],
  [
   1.5e-300,
   "1.5e-300"
  ],
  [
   1e+21,
   "1e+21"
  ],
  [
   123456789.12345679,
   "123456789.12345679"
  ],
  [
   -0.0,
   "-0.0"
  ],
  [
   0.0,
   "0.0"
  ],
  [
   Infinity,
   "inf"
  ],
  [
   -Infinity,
   "-inf"
  ],
  [
   NaN,
   "nan"
  ],
  [
   0.25,
   "0.25"
  ],
  [
   0.3333333333333333,
   "0.3333333333333333"
  ],
  [
   5e-324,
   "5e-324"
  ],
  [
   1.7976931348623157e+308,
   "1.7976931348623157e+308"
  ],
  [
   2.0,
   "2.0"
  ],
  [
   100.0,
   "100.0"
  ],
  [
   0.9230769230769231,
   "0.9230769230769231"
  ],
  [
   1e-323,
   "1e-323"
  ],
  [
   3.14159e+17,
   "3.14159e+17"
  ],
  [
   -2.5e-07,
   "-2.5e-07"
  ]
 ],
 "format": [
  [
   "[%7.1fs] %-5s %s",
   [
    0.34,
    "WARN",
    "message"
   ],
   "[    0.3s] WARN  message"
  ],
  [
   "[%7.1fs] %-5s %s",
   [
    123.456,
    "OK",
    "x"
   ],
   "[  123.5s] OK    x"
  ],
  [
   "[%7.1fs] %-5s %s",
   [
    12345.678,
    "ERR",
    "long"
   ],
   "[12345.7s] ERR   long"
  ],
  [
   "%04d-%02d-%02d",
   [
    2024,
    3,
    1
   ],
   "2024-03-01"
  ],
  [
   "F%02d",
   [
    7
   ],
   "F07"
  ],
  [
   "F%02d",
   [
    100
   ],
   "F100"
  ],
  [
   "%x",
   [
    233223382208256
   ],
   "d41d8cd98f00"
  ],
  [
   "%x",
   [
    255
   ],
   "ff"
  ],
  [
   "%.2f",
   [
    0.125
   ],
   "0.12"
  ],
  [
   "%.2f",
   [
    2.675
   ],
   "2.67"
  ],
  [
   "%.1f",
   [
    0.25
   ],
   "0.2"
  ],
  [
   "%.0f",
   [
    2.5
   ],
   "2"
  ],
  [
   "%.0f",
   [
    3.5
   ],
   "4"
  ],
  [
   "%7.1f",
   [
    -3.04
   ],
   "   -3.0"
  ],
  [
   "%02d",
   [
    -5
   ],
   "-5"
  ],
  [
   "%05.1f",
   [
    3.14159
   ],
   "003.1"
  ],
  [
   "%-8s|",
   [
    "ab"
   ],
   "ab      |"
  ],
  [
   "100%%",
   [],
   "100%"
  ],
  [
   "retour_hors%02d_l%d",
   [
    7,
    3
   ],
   "retour_hors07_l3"
  ],
  [
   "%f",
   [
    0.5
   ],
   "0.500000"
  ],
  [
   "%.3f",
   [
    0.0625
   ],
   "0.062"
  ],
  [
   "%.2f",
   [
    -0.0
   ],
   "-0.00"
  ],
  [
   "%d",
   [
    -0.0
   ],
   "0"
  ],
  [
   "%s et %s et %s et %s",
   [
    true,
    false,
    null,
    42
   ],
   "True et False et None et 42"
  ]
 ],
 "str": [
  [
   null,
   "None"
  ],
  [
   true,
   "True"
  ],
  [
   false,
   "False"
  ],
  [
   42,
   "42"
  ],
  [
   -7,
   "-7"
  ],
  [
   0,
   "0"
  ]
 ],
 "reprStr": [
  [
   "l'\u00e9t\u00e9",
   "\"l'\u00e9t\u00e9\""
  ],
  [
   "a\"b",
   "'a\"b'"
  ],
  [
   "a'b\"c",
   "'a\\'b\"c'"
  ],
  [
   "tab\there\nnl",
   "'tab\\there\\nnl'"
  ],
  [
   "simple",
   "'simple'"
  ],
  [
   "ctrl\u0001\u001f",
   "'ctrl\\x01\\x1f'"
  ],
  [
   "accents \u00e9\u00e0\ud83c\udf0d",
   "'accents \u00e9\u00e0\ud83c\udf0d'"
  ]
 ],
 "reprTuple": [
  [
   [
    "a",
    3
   ],
   "('a', 3)"
  ],
  [
   [
    1
   ],
   "(1,)"
  ],
  [
   [],
   "()"
  ],
  [
   [
    "x",
    null,
    true,
    2.5
   ],
   "('x', None, True, 2.5)"
  ]
 ],
 "reprList": [
  [
   [
    "a",
    3,
    null
   ],
   "['a', 3, None]"
  ]
 ]
};

describe("pyFloatRepr — repr(float) Python (round-trip minimal)", () => {
  for (const [x, expected] of VECTORS.floatRepr) {
    it(`repr(${expected}) `, () => {
      expect(pyFloatRepr(x)).toBe(expected);
    });
  }
});

describe("pyStr — str() Python des scalaires", () => {
  for (const [v, expected] of VECTORS.str) {
    it(`str(${expected})`, () => {
      expect(pyStr(v)).toBe(expected);
    });
  }
  it("PyFloat force le repr float d'un entier (1.0 ≠ 1)", () => {
    expect(pyStr(new PyFloat(1))).toBe("1.0");
    expect(pyStr(new PyFloat(-2))).toBe("-2.0");
    expect(pyStr(1)).toBe("1");
  });
  it("graines du pipeline : « ret|None », « jury|…|None|… »", () => {
    expect(`ret|${pyStr(null)}`).toBe("ret|None");
    expect(`jury|plant01|3|${pyStr(null)}|regulier`).toBe("jury|plant01|3|None|regulier");
  });
});

describe("pyFormat — format % Python (%7.1f, %-5s, %02d, %x…)", () => {
  for (const [fmt, args, expected] of VECTORS.format) {
    it(`${JSON.stringify(fmt)} % ${JSON.stringify(args)}`, () => {
      expect(pyFormat(fmt, ...args)).toBe(expected);
    });
  }
});

describe("pyRepr / pyReprTuple — repr() Python (str(seed_key) de permutation)", () => {
  for (const [s, expected] of VECTORS.reprStr) {
    it(`repr(${JSON.stringify(s)})`, () => {
      expect(pyRepr(s)).toBe(expected);
    });
  }
  for (const [items, expected] of VECTORS.reprTuple) {
    it(`str(tuple ${JSON.stringify(items)})`, () => {
      expect(pyReprTuple(items)).toBe(expected);
    });
  }
  for (const [items, expected] of VECTORS.reprList) {
    it(`str(list ${JSON.stringify(items)})`, () => {
      expect(pyStr(items)).toBe(expected);
    });
  }
});
