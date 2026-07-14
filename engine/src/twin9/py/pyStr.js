// str() et format % de Python pour les types qui transitent dans les hachages,
// graines et gabarits : None→"None", True→"True", int décimal, float en repr
// Python (0.1→"0.1", 1.0→"1.0", 1e16→"1e+16", 1e-5→"1e-05"), plus pyFormat
// ("%7.1f", "%-5s", "%02d", "%x", "%s"…). JS ne distingue pas int et float :
// la classe PyFloat marque explicitement une valeur « float Python » (2.0 →
// new PyFloat(2) → "2.0").

import { formatFixed } from "./pyRound.js";

/** Marqueur « float Python » pour les Number entiers (1.0 ≠ 1). */
export class PyFloat {
  /** @param {number} value */
  constructor(value) {
    this.value = value;
  }
}

/**
 * repr(float) Python : chaîne minimale round-trip, format fixe si l'exposant
 * décimal E vérifie -4 ≤ E ≤ 15, sinon notation scientifique « d.ddde±XX »
 * (exposant signé, ≥ 2 chiffres). str(float) == repr(float) en Python 3.
 * @param {number} x
 * @returns {string}
 */
export function pyFloatRepr(x) {
  if (Number.isNaN(x)) return "nan";
  if (x === Infinity) return "inf";
  if (x === -Infinity) return "-inf";
  if (x === 0) return Object.is(x, -0) ? "-0.0" : "0.0";
  const sign = x < 0 ? "-" : "";
  // toExponential() sans argument : mantisse minimale round-trip (mêmes
  // chiffres que le repr Python, tous deux « shortest, closest »).
  const [mant, expStr] = Math.abs(x).toExponential().split("e");
  const digits = mant.replace(".", "");
  const E = parseInt(expStr, 10);
  if (E >= 16 || E <= -5) {
    const m = digits.length > 1 ? digits[0] + "." + digits.slice(1) : digits;
    const esign = E < 0 ? "-" : "+";
    const eabs = String(Math.abs(E)).padStart(2, "0");
    return sign + m + "e" + esign + eabs;
  }
  if (E >= 0) {
    if (digits.length <= E + 1) {
      return sign + digits + "0".repeat(E + 1 - digits.length) + ".0";
    }
    return sign + digits.slice(0, E + 1) + "." + digits.slice(E + 1);
  }
  return sign + "0." + "0".repeat(-E - 1) + digits;
}

/**
 * str() Python pour les scalaires du pipeline :
 * null→"None", true→"True", false→"False", chaîne inchangée, PyFloat→repr
 * float, Number entier→décimal (int Python), Number non entier→repr float.
 * @param {unknown} v
 * @returns {string}
 */
export function pyStr(v) {
  if (v === null || v === undefined) return "None";
  if (v === true) return "True";
  if (v === false) return "False";
  if (typeof v === "string") return v;
  if (v instanceof PyFloat) return pyFloatRepr(v.value);
  if (typeof v === "number") {
    if (Number.isInteger(v) && !Object.is(v, -0)) return String(v);
    return pyFloatRepr(v);
  }
  if (Array.isArray(v)) return pyRepr(v); // str(list) == repr(list)
  throw new TypeError(`pyStr : type non porté (${typeof v})`);
}

/**
 * repr() Python (sous-ensemble : scalaires + listes). Chaînes entre quotes
 * simples (doubles si la chaîne contient ' mais pas "), échappements \\ \' \n
 * \r \t et \xXX pour les contrôles ; l'Unicode imprimable reste littéral.
 * @param {unknown} v
 * @returns {string}
 */
export function pyRepr(v) {
  if (v === null || v === undefined) return "None";
  if (v === true) return "True";
  if (v === false) return "False";
  if (v instanceof PyFloat) return pyFloatRepr(v.value);
  if (typeof v === "number") {
    if (Number.isInteger(v) && !Object.is(v, -0)) return String(v);
    return pyFloatRepr(v);
  }
  if (typeof v === "string") return reprStr(v);
  if (Array.isArray(v)) return "[" + v.map(pyRepr).join(", ") + "]";
  throw new TypeError(`pyRepr : type non porté (${typeof v})`);
}

/**
 * repr() Python d'un tuple : parenthèses, virgule finale pour le singleton.
 * Nécessaire à str(seed_key) quand un tuple transite (permutation).
 * @param {unknown[]} items
 * @returns {string}
 */
export function pyReprTuple(items) {
  if (items.length === 0) return "()";
  if (items.length === 1) return "(" + pyRepr(items[0]) + ",)";
  return "(" + items.map(pyRepr).join(", ") + ")";
}

/** repr() d'une chaîne Python (choix de quote + échappements). */
function reprStr(s) {
  const quote = s.includes("'") && !s.includes('"') ? '"' : "'";
  let out = quote;
  for (const ch of s) {
    const cp = ch.codePointAt(0);
    if (ch === "\\" || ch === quote) out += "\\" + ch;
    else if (ch === "\n") out += "\\n";
    else if (ch === "\r") out += "\\r";
    else if (ch === "\t") out += "\\t";
    else if (cp < 0x20 || cp === 0x7f) out += "\\x" + cp.toString(16).padStart(2, "0");
    else out += ch;
  }
  return out + quote;
}

/**
 * Formatage « % » de Python — sous-ensemble utilisé par Twin_v9 :
 * %s, %d, %i, %x, %f avec flags «-» et «0», largeur et précision
 * (ex. "%7.1f", "%-5s", "%02d", "%04d-%02d-%02d", "F%02d", "%x"), et %%.
 * @param {string} fmt
 * @param {...unknown} args
 * @returns {string}
 */
export function pyFormat(fmt, ...args) {
  let ai = 0;
  const out = fmt.replace(
    /%([-0]*)(\d+)?(?:\.(\d+))?([sdixf%])/g,
    (_m, flags, widthStr, precStr, conv) => {
      if (conv === "%") return "%";
      const v = args[ai++];
      let s;
      let signChar = "";
      if (conv === "s") {
        s = pyStr(v);
      } else if (conv === "d" || conv === "i") {
        const n = v instanceof PyFloat ? Math.trunc(v.value) : Math.trunc(/** @type {number} */ (v));
        if (n < 0) {
          signChar = "-";
          s = String(Math.abs(n));
        } else {
          s = String(n + 0); // int(-0.0) == 0 en Python : "%d" % -0.0 → "0"
        }
      } else if (conv === "x") {
        const n = /** @type {number} */ (v);
        if (n < 0) {
          signChar = "-";
          s = Math.abs(n).toString(16);
        } else {
          s = n.toString(16);
        }
      } else {
        // %f : précision par défaut 6
        const n = v instanceof PyFloat ? v.value : /** @type {number} */ (v);
        const prec = precStr === undefined ? 6 : parseInt(precStr, 10);
        s = formatFixed(n, prec);
        if (s.startsWith("-")) {
          signChar = "-";
          s = s.slice(1);
        }
      }
      const width = widthStr ? parseInt(widthStr, 10) : 0;
      const len = signChar.length + s.length;
      if (len >= width) return signChar + s;
      const pad = width - len;
      if (flags.includes("-")) return signChar + s + " ".repeat(pad);
      if (flags.includes("0") && conv !== "s") return signChar + "0".repeat(pad) + s;
      return " ".repeat(pad) + signChar + s;
    },
  );
  return out;
}
