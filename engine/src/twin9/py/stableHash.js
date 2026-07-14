// stable_hash de aurora/util.py, bit-à-bit :
//   int(hashlib.md5(s.encode("utf-8")).hexdigest()[:12], 16)
// → entier non signé de 48 bits (0 ≤ h < 2^48 < 2^53) : Number exact, sans BigInt.
// PIÈGE MAJEUR (spec-index §4.1) : ne JAMAIS appliquer d'opérateur binaire JS
// (`>>`, `&`, `|0`…) sur le résultat — troncature 32 bits. Utiliser
// Math.floor(h / 256) là où Python fait h >> 8.

import { md5Hex } from "./md5.js";

/**
 * Hash stable 48 bits d'une chaîne (indépendant de tout PYTHONHASHSEED).
 * Vecteur de référence : stableHash("") === 233223382208256.
 * @param {string} s
 * @returns {number} entier 0 ≤ h < 2^48
 */
export function stableHash(s) {
  return parseInt(md5Hex(s).slice(0, 12), 16);
}
