// Égalité PROFONDE de Python (opérateur ==) pour les valeurs JSON-like qui
// circulent dans Twin9 (graines, observations) : `gr not in liste` de
// merge3.py / scan9.py compare les dicts clé par clé, récursivement.
// Sémantique numérique de Python : True == 1 == 1.0 (bool et PyFloat
// participent au même axe numérique) ; NaN != NaN ; None == None.
// Les clés de dict sont comparées STRICTEMENT ({1: x} != {"1": x}).

import { PyFloat } from "./pyStr.js";
import { entriesOf } from "./pyDict.js";

/** Axe numérique Python (int/float/bool) ; null si la valeur n'y vit pas. */
function numOf(v) {
  if (typeof v === "number") return v;
  if (v === true) return 1;
  if (v === false) return 0;
  if (v instanceof PyFloat) return v.value;
  return null;
}

/**
 * a == b au sens Python (profond).
 * @param {unknown} a @param {unknown} b @returns {boolean}
 */
export function pyDeepEqual(a, b) {
  if (a === b) return typeof a !== "number" || !Number.isNaN(a); // NaN != NaN
  const na = numOf(a);
  const nb = numOf(b);
  if (na !== null || nb !== null) return na !== null && nb !== null && na === nb;
  if (a === null || a === undefined || b === null || b === undefined) {
    return (a === null || a === undefined) && (b === null || b === undefined);
  }
  if (typeof a === "string" || typeof b === "string") return false; // a === b déjà testé
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!pyDeepEqual(a[i], b[i])) return false;
    }
    return true;
  }
  if (typeof a === "object" && typeof b === "object") {
    const ea = entriesOf(/** @type {object} */ (a));
    const eb = entriesOf(/** @type {object} */ (b));
    if (ea.length !== eb.length) return false;
    const mb = new Map(eb);
    for (const [k, va] of ea) {
      if (!mb.has(k)) return false;
      if (!pyDeepEqual(va, mb.get(k))) return false;
    }
    return true;
  }
  return false;
}
