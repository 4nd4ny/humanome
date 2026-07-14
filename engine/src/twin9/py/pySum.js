// sum() de CPython ≥ 3.12 pour des flottants : sommation COMPENSÉE de
// Neumaier (bltinmodule.c, builtin_sum, voie rapide float). Une boucle
// d'additions naïves JS diverge d'un ULP dès que les arrondis s'accumulent
// (ex. sum([0.91, 0.8, 0.3, 0.8]) → 2.81 en Python, 2.8099999999999996 en
// naïf) — et cet ULP traverse round() : parité bit-à-bit impossible sans
// reproduire la compensation. Les entiers mêlés aux floats participent avec
// la même compensation (comme la voie rapide CPython).

import { PyFloat } from "./pyStr.js";

/**
 * sum(iterable) Python (départ 0) sur des nombres/PyFloat.
 * @param {Iterable<number|PyFloat>} values
 * @returns {number}
 */
export function pySum(values) {
  let f = 0.0;
  let c = 0.0;
  for (const v of values) {
    const x = v instanceof PyFloat ? v.value : v;
    const t = f + x;
    if (Math.abs(f) >= Math.abs(x)) {
      c += f - t + x;
    } else {
      c += x - t + f;
    }
    f = t;
  }
  return f + c;
}
