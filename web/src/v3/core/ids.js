// Interface V3 — identifiants stables d'import (spec §9.3).
//
// Les identifiants normalisés dérivent des octets et positions historiques
// IMMUABLES (jamais d'une date effective corrigeable) :
//
//   payloadDigest    = SHA-256(octets originaux)
//   sourceDocumentId = UUIDv5(datasetNamespace, [sourceRun, sourceDate, sourcePoleOuType, payloadDigest])
//   legacyPassageId  = UUIDv5(sourceDocumentId, ["passage", pid, arrayIndex])
//   legacyPieceId    = UUIDv5(sourceDocumentId, ["piece", rawCode, numero, arrayIndex])
//   observationId    = UUIDv5(sourceDocumentId, ["observation", rawCode, arrayIndex])
//
// L'index de tableau est TOUJOURS inclus (deux pid identiques dans deux pôles
// produisent des identifiants distincts — AC-DATA-03). Les identifiants privés
// sont ensuite remappés en identifiants aléatoires dans chaque export employeur
// (share.js) : rien ici n'est destiné à sortir du poste de l'apprenant.
//
// UUIDv5 = RFC 4122 §4.3 (SHA-1 du namespace + nom). SHA-1 est utilisé ici
// UNIQUEMENT comme fonction de dérivation d'identifiants (pas comme garantie
// d'intégrité — l'intégrité utilise SHA-256, cf. canonical-json.js).
// Implémentations synchrones et sans dépendance : le pipeline d'import tourne
// hors du fil d'interface, mais les tests (Node/jsdom) restent déterministes.

// --- SHA-256 (réutilise l'implémentation vérifiée du solveur PoW) -----------
import { sha256Bytes } from '../../lib/pow.js'

const HEX = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, '0'))

/** @param {Uint8Array} bytes @returns {string} hexadécimal minuscule */
export function bytesToHex(bytes) {
  let out = ''
  for (const b of bytes) out += HEX[b]
  return out
}

/**
 * SHA-256 hexadécimal d'octets ou d'une chaîne UTF-8.
 * @param {Uint8Array | string} input
 * @returns {string}
 */
export function sha256Hex(input) {
  return bytesToHex(sha256Bytes(input))
}

// --- SHA-1 (FIPS 180-4) — uniquement pour la dérivation UUIDv5 --------------

/** @param {Uint8Array} bytes @returns {Uint8Array} empreinte de 20 octets */
export function sha1Bytes(bytes) {
  const bitLen = bytes.length * 8
  const paddedLen = (((bytes.length + 8) >> 6) + 1) << 6
  const buf = new Uint8Array(paddedLen)
  buf.set(bytes)
  buf[bytes.length] = 0x80
  const view = new DataView(buf.buffer)
  view.setUint32(paddedLen - 8, Math.floor(bitLen / 0x100000000))
  view.setUint32(paddedLen - 4, bitLen >>> 0)

  let h0 = 0x67452301
  let h1 = 0xefcdab89
  let h2 = 0x98badcfe
  let h3 = 0x10325476
  let h4 = 0xc3d2e1f0
  const w = new Uint32Array(80)
  const rotl = (x, n) => (x << n) | (x >>> (32 - n))

  for (let offset = 0; offset < paddedLen; offset += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(offset + i * 4)
    for (let i = 16; i < 80; i++) w[i] = rotl(w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16], 1)
    let a = h0
    let b = h1
    let c = h2
    let d = h3
    let e = h4
    for (let i = 0; i < 80; i++) {
      let f
      let k
      if (i < 20) {
        f = (b & c) | (~b & d)
        k = 0x5a827999
      } else if (i < 40) {
        f = b ^ c ^ d
        k = 0x6ed9eba1
      } else if (i < 60) {
        f = (b & c) | (b & d) | (c & d)
        k = 0x8f1bbcdc
      } else {
        f = b ^ c ^ d
        k = 0xca62c1d6
      }
      const t = (rotl(a, 5) + f + e + k + w[i]) >>> 0
      e = d
      d = c
      c = rotl(b, 30) >>> 0
      b = a
      a = t
    }
    h0 = (h0 + a) >>> 0
    h1 = (h1 + b) >>> 0
    h2 = (h2 + c) >>> 0
    h3 = (h3 + d) >>> 0
    h4 = (h4 + e) >>> 0
  }

  const out = new Uint8Array(20)
  const ov = new DataView(out.buffer)
  ov.setUint32(0, h0)
  ov.setUint32(4, h1)
  ov.setUint32(8, h2)
  ov.setUint32(12, h3)
  ov.setUint32(16, h4)
  return out
}

// --- UUID ---------------------------------------------------------------------

/** @param {Uint8Array} b16 16 octets @returns {string} forme 8-4-4-4-12 */
function formatUuid(b16) {
  const h = bytesToHex(b16)
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** @param {string} uuid @returns {Uint8Array} 16 octets */
export function uuidToBytes(uuid) {
  if (!UUID_RE.test(uuid)) throw new TypeError(`UUID invalide : ${uuid}`)
  const hex = uuid.replaceAll('-', '').toLowerCase()
  const out = new Uint8Array(16)
  for (let i = 0; i < 16; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  return out
}

/**
 * UUIDv5 (RFC 4122) d'un nom structuré sous un namespace.
 *
 * Le « nom » est un tableau de segments joints par U+001F (séparateur d'unité,
 * impossible dans les valeurs historiques) : la concaténation est donc
 * non ambiguë ([\"a\",\"bc\"] ≠ [\"ab\",\"c\"]).
 *
 * @param {string} namespaceUuid
 * @param {Array<string | number>} parts
 * @returns {string}
 */
export function uuidV5(namespaceUuid, parts) {
  const name = parts.map((p) => String(p)).join('')
  const nameBytes = new TextEncoder().encode(name)
  const nsBytes = uuidToBytes(namespaceUuid)
  const input = new Uint8Array(nsBytes.length + nameBytes.length)
  input.set(nsBytes)
  input.set(nameBytes, nsBytes.length)
  const digest = sha1Bytes(input)
  const b16 = digest.slice(0, 16)
  b16[6] = (b16[6] & 0x0f) | 0x50 // version 5
  b16[8] = (b16[8] & 0x3f) | 0x80 // variante RFC 4122
  return formatUuid(b16)
}

/**
 * UUIDv4 aléatoire — pour les identifiants OPAQUES (datasetId, journées
 * canoniques, révisions) et le REMAPPAGE public des exports (un identifiant
 * public différent par projection, spec §9.3 et AC-SHARE-07).
 * @param {() => Uint8Array} [randomBytes16] couture de test (16 octets)
 * @returns {string}
 */
export function uuidV4(randomBytes16) {
  const b16 = randomBytes16
    ? randomBytes16()
    : globalThis.crypto.getRandomValues(new Uint8Array(16))
  b16[6] = (b16[6] & 0x0f) | 0x40
  b16[8] = (b16[8] & 0x3f) | 0x80
  return formatUuid(b16)
}

// --- Identifiants d'import (spec §9.3) -----------------------------------------

/**
 * Identifiant stable d'un document source historique.
 *
 * @param {string} datasetNamespace UUID du jeu de données privé
 * @param {{sourceRun: string, sourceDate: string, sourcePoleOrType: string, payloadDigest: string}} p
 *   sourceDate = date HISTORIQUE immuable (nom du ZIP), jamais l'effectiveDate.
 * @returns {string}
 */
export function sourceDocumentId(datasetNamespace, { sourceRun, sourceDate, sourcePoleOrType, payloadDigest }) {
  return uuidV5(datasetNamespace, [sourceRun, sourceDate, sourcePoleOrType, payloadDigest])
}

/** @param {string} docId @param {number|string} pid @param {number} arrayIndex */
export function legacyPassageId(docId, pid, arrayIndex) {
  return uuidV5(docId, ['passage', pid, arrayIndex])
}

/** @param {string} docId @param {string} rawCode @param {number|string} numero @param {number} arrayIndex */
export function legacyPieceId(docId, rawCode, numero, arrayIndex) {
  return uuidV5(docId, ['piece', rawCode, numero, arrayIndex])
}

/** @param {string} docId @param {string} rawCode @param {number} arrayIndex */
export function observationId(docId, rawCode, arrayIndex) {
  return uuidV5(docId, ['observation', rawCode, arrayIndex])
}

/** @param {string} obsId @param {string} sourceKind ('trace'|'piece-direct'|…) @param {number} arrayIndex */
export function evidenceLinkId(obsId, sourceKind, arrayIndex) {
  return uuidV5(obsId, ['evidence', sourceKind, arrayIndex])
}
