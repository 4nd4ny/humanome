// Interface V3 — sérialisation canonique et digest d'intégrité (spec §19.4).
//
// `integrity.contentDigest` est le SHA-256 d'une sérialisation canonique JSON
// conforme à RFC 8785 (JCS) après suppression de `/integrity/contentDigest`.
// Ce digest détecte une altération ; il ne prouve pas l'auteur.
//
// Périmètre JCS couvert ici :
//   - clés d'objet triées par unités de code UTF-16 (ordre JCS) ;
//   - nombres sérialisés comme JSON.stringify (ECMAScript « shortest round-trip »,
//     la règle de sérialisation des doubles retenue par RFC 8785) ;
//   - chaînes échappées comme JSON.stringify (mêmes échappements que JCS) ;
//   - rejet explicite de NaN/Infinity, undefined, fonctions et BigInt.
// Les documents V3 sont produits par nos soins (pas de -0 ni d'extrêmes
// exotiques) : ce sous-ensemble est suffisant ET testé par aller-retour.

import { sha256Hex } from './ids.js'

/**
 * Sérialisation canonique (clés triées, sans espace).
 * @param {unknown} value
 * @returns {string}
 */
export function canonicalStringify(value) {
  if (value === null) return 'null'
  const t = typeof value
  if (t === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('canonicalStringify : nombre non fini interdit')
    return JSON.stringify(value)
  }
  if (t === 'boolean' || t === 'string') return JSON.stringify(value)
  if (t === 'undefined' || t === 'function' || t === 'bigint' || t === 'symbol') {
    throw new TypeError(`canonicalStringify : type non sérialisable (${t})`)
  }
  if (Array.isArray(value)) {
    return `[${value.map((v) => canonicalStringify(v === undefined ? null : v)).join(',')}]`
  }
  const keys = Object.keys(value).sort()
  const parts = []
  for (const key of keys) {
    const v = /** @type {Record<string, unknown>} */ (value)[key]
    if (v === undefined) continue // même convention que JSON.stringify
    parts.push(`${JSON.stringify(key)}:${canonicalStringify(v)}`)
  }
  return `{${parts.join(',')}}`
}

/**
 * Digest de contenu d'un instantané : SHA-256 de la forme canonique SANS
 * `/integrity/contentDigest` (le champ est retiré avant le calcul).
 * @param {object} snapshot
 * @returns {string} hexadécimal minuscule
 */
export function contentDigest(snapshot) {
  const clone = JSON.parse(JSON.stringify(snapshot))
  if (clone.integrity && typeof clone.integrity === 'object') {
    delete clone.integrity.contentDigest
  }
  return sha256Hex(canonicalStringify(clone))
}

/**
 * Vérifie l'intégrité d'un instantané réimporté (spec §19.5, AC-SHARE-20).
 * @param {object} snapshot
 * @returns {{valid: boolean, expected: string | null, actual: string}}
 */
export function verifyIntegrity(snapshot) {
  const expected = snapshot?.integrity?.contentDigest ?? null
  const actual = contentDigest(snapshot ?? {})
  return { valid: expected !== null && expected === actual, expected, actual }
}
