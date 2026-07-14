// Sémantiques Python diffuses partagées par heatmap.js / tribunal.js /
// journee.js : dict.get(k, défaut) (une clé PRÉSENTE à valeur null reste
// null), truthiness Python ([] et {} sont falsy), float() et int() de
// CPython, comparaison de tuples élément par élément. Parité bit-à-bit :
// ces helpers reproduisent les conversions, pas les idiomes JS.

import { PyFloat } from "./pyStr.js";
import { codePointCompare } from "./pyJson.js";
import { pyStrip } from "./pyText.js";

/**
 * dict.get(key, default) Python : le défaut ne s'applique que si la clé est
 * ABSENTE (une clé présente à valeur null/undefined-explicite reste telle
 * quelle). Accepte objets simples et Map.
 * @param {object|Map<string, unknown>} d @param {string} key
 * @param {unknown} [dflt=null]
 * @returns {unknown}
 */
export function dictGet(d, key, dflt = null) {
  if (d instanceof Map) return d.has(key) ? d.get(key) : dflt;
  return Object.prototype.hasOwnProperty.call(d, key) ? d[key] : dflt;
}

/** `key in dict` Python. @param {object|Map<string, unknown>} d @param {string} key */
export function hasKey(d, key) {
  if (d instanceof Map) return d.has(key);
  return Object.prototype.hasOwnProperty.call(d, key);
}

/**
 * dict.items() Python — itération dans l'ordre d'insertion, objets ou Map.
 * @param {object|Map<unknown, unknown>|null|undefined} d
 * @returns {[unknown, unknown][]}
 */
export function entriesOf(d) {
  if (d === null || d === undefined) return [];
  if (d instanceof Map) return Array.from(d.entries());
  return Object.entries(d);
}

/**
 * bool(v) Python : None/False/0/""/[]/{} (et Map/Set vides) sont falsy ;
 * NaN est TRUTHY (float("nan") est vrai en Python).
 * @param {unknown} v @returns {boolean}
 */
export function pyTruthy(v) {
  if (v === null || v === undefined || v === false) return false;
  if (v === true) return true;
  if (typeof v === "number") return v !== 0; // NaN !== 0 → truthy, comme Python
  if (v instanceof PyFloat) return v.value !== 0;
  if (typeof v === "string") return v.length > 0;
  if (Array.isArray(v)) return v.length > 0;
  if (v instanceof Map || v instanceof Set) return v.size > 0;
  if (typeof v === "object") return Object.keys(v).length > 0;
  return true;
}

const RE_PY_FLOAT =
  /^[+-]?(?:\d+(?:_\d+)*(?:\.(?:\d+(?:_\d+)*)?)?|\.\d+(?:_\d+)*)(?:[eE][+-]?\d+(?:_\d+)*)?$/;
const RE_PY_INF_NAN = /^[+-]?(?:inf(?:inity)?|nan)$/i;

/**
 * float(v) Python : Number → lui-même, bool → 0/1, PyFloat → valeur,
 * chaîne → analyse float CPython (blancs Unicode strippés, "inf"/"nan"
 * acceptés) sinon ValueError ; null/objets → TypeError.
 * @param {unknown} v @returns {number}
 */
export function pyFloatOf(v) {
  if (typeof v === "number") return v;
  if (v === true) return 1;
  if (v === false) return 0;
  if (v instanceof PyFloat) return v.value;
  if (typeof v === "string") {
    const t = pyStrip(v);
    if (RE_PY_FLOAT.test(t)) return Number(t.replace(/_/g, ""));
    if (RE_PY_INF_NAN.test(t)) {
      const neg = t[0] === "-";
      if (/nan$/i.test(t)) return NaN;
      return neg ? -Infinity : Infinity;
    }
    throw new Error(`ValueError : float() sur « ${v} »`);
  }
  throw new TypeError("TypeError : float() sur un type non convertible");
}

/**
 * int(v) Python (troncature vers zéro pour les nombres, chaîne décimale
 * stricte sinon ValueError, bool → 0/1).
 * @param {unknown} v @returns {number}
 */
export function pyIntOf(v) {
  if (typeof v === "number") return Math.trunc(v);
  if (v === true) return 1;
  if (v === false) return 0;
  if (v instanceof PyFloat) return Math.trunc(v.value);
  if (typeof v === "string") {
    const t = pyStrip(v);
    if (!/^[+-]?\d+(?:_\d+)*$/.test(t)) {
      throw new Error(`ValueError : int() sur « ${v} »`);
    }
    return parseInt(t.replace(/_/g, ""), 10);
  }
  throw new TypeError("TypeError : int() sur un type non convertible");
}

/** Déballe un PyFloat vers son Number (identité sinon). @param {unknown} v */
export function asNum(v) {
  return v instanceof PyFloat ? v.value : /** @type {number} */ (v);
}

/**
 * Comparaison Python de deux scalaires pour un tri de tuples : chaînes par
 * points de code, nombres/booléens numériquement (False == 0 < True == 1),
 * null == null ; tout autre mélange → TypeError (comme sorted() Python).
 * @param {unknown} a @param {unknown} b @returns {number}
 */
export function pyScalarCompare(a, b) {
  if (typeof a === "string" && typeof b === "string") return codePointCompare(a, b);
  const na = a instanceof PyFloat ? a.value : a === true ? 1 : a === false ? 0 : a;
  const nb = b instanceof PyFloat ? b.value : b === true ? 1 : b === false ? 0 : b;
  if (typeof na === "number" && typeof nb === "number") {
    return na < nb ? -1 : na > nb ? 1 : 0;
  }
  if (a === null && b === null) return 0; // None == None (l'ordre n'est jamais requis)
  throw new TypeError("TypeError : comparaison de types non ordonnés");
}

/**
 * Comparaison Python de deux tuples (tableaux), élément par élément.
 * @param {unknown[]} a @param {unknown[]} b @returns {number}
 */
export function pyTupleCompare(a, b) {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const c = Array.isArray(a[i]) && Array.isArray(b[i])
      ? pyTupleCompare(/** @type {unknown[]} */ (a[i]), /** @type {unknown[]} */ (b[i]))
      : pyScalarCompare(a[i], b[i]);
    if (c !== 0) return c;
  }
  return a.length - b.length;
}
