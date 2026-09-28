// Outillage partagé du lot « Visiteur + interface V3 » (UC-VIS-01…05, UC-APP-12).
// Fiches : docs/cas-utilisation/visiteur/ et docs/cas-utilisation/apprenant/UC-APP-12-interface-ipsative-v3.md
//
// - jsonResponse : réponse fetch minimale (ok, status, headers, json) ;
// - demoNetwork : réseau simulé des données STATIQUES de la démonstration
//   (référentiel publié + corpus data/demo/jours/) servi depuis les fixtures
//   versionnées de schemas/fixtures/ — trois journées courtes et stables ;
// - storedZip : ZIP « stored » (méthode 0) construit à la main, pour les
//   imports ZIP de l'interface V3 sans dépendance ni DecompressionStream.
import { vi } from 'vitest'
import day05 from '../../../../schemas/fixtures/cartographie-jour-2026-01-05.json'
import day06 from '../../../../schemas/fixtures/cartographie-jour-2026-01-06.json'
import day07 from '../../../../schemas/fixtures/cartographie-jour-2026-01-07.json'

/** Les trois journées de fixtures (contenus distincts, dates consécutives). */
export const FIXTURE_DAYS = { '2026-01-05': day05, '2026-01-06': day06, '2026-01-07': day07 }

/**
 * Faits établis sur ce corpus (calculés par le moteur V3 : présences établies
 * avec au moins une preuve résolue). Figés ici pour des assertions lisibles.
 */
export const FIXTURE_FACTS = {
  dates: ['2026-01-05', '2026-01-06', '2026-01-07'],
  documentedCodes: ['1.01', '2.01', '2.06', '3.04', '3.07', '4.05', '5.01', '5.03', '6.07', '7.01'],
  admissible: 14,
  needsReview: 3,
  byDate: {
    '2026-01-05': ['2.01', '3.04', '5.03', '7.01'],
    '2026-01-06': ['1.01', '2.01', '2.06', '5.01'],
    '2026-01-07': ['2.01', '3.07', '4.05', '5.03', '6.07', '7.01'],
  },
}

/** @returns {object} réponse fetch minimale */
export function jsonResponse(status, data) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => (name.toLowerCase() === 'content-type' ? 'application/json' : null) },
    json: async () => data,
    text: async () => JSON.stringify(data),
  }
}

/**
 * Réseau simulé des fichiers statiques de la démonstration.
 *
 * @param {{days?: Record<string, object>, referentielIndex?: 'absent' | object,
 *   referentielDoc?: object, failIndex?: boolean, extra?: (url: string, init?: object) => any}} [opts]
 *   referentielIndex = 'absent' (défaut) : index.json en 404 → repli embarqué.
 * @returns {import('vitest').Mock} le mock installé sur fetch (global)
 */
export function demoNetwork({ days = FIXTURE_DAYS, referentielIndex = 'absent', referentielDoc = null, failIndex = false, extra } = {}) {
  const index = Object.keys(days)
    .sort()
    .map((date, i) => ({ date, iso: date, label: date.split('-').reverse().join('/'), ordre: i }))
  const mock = vi.fn(async (url, init) => {
    const u = String(url)
    if (extra) {
      const answer = await extra(u, init)
      if (answer !== undefined) return answer
    }
    if (u === 'data/referentiel/index.json') {
      return referentielIndex === 'absent' ? jsonResponse(404, { error: 'absent' }) : jsonResponse(200, referentielIndex)
    }
    if (u.startsWith('data/referentiel/') && referentielDoc) return jsonResponse(200, referentielDoc)
    if (u === 'data/demo/jours/index.json') {
      if (failIndex) throw new TypeError('Failed to fetch')
      return jsonResponse(200, index)
    }
    const m = /^data\/demo\/jours\/(\d{4}-\d{2}-\d{2})\.json$/.exec(u)
    if (m) return days[m[1]] ? jsonResponse(200, days[m[1]]) : jsonResponse(404, { error: 'absent' })
    return jsonResponse(404, { error: 'absent' })
  })
  vi.stubGlobal('fetch', mock)
  return mock
}

/** URLs appelées par un mock fetch (chaînes). */
export function calledUrls(mock) {
  return mock.mock.calls.map(([url]) => String(url))
}

// --- ZIP « stored » minimal ---------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

function crc32(bytes) {
  let c = 0xffffffff
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

/**
 * Construit un ZIP non compressé (méthode 0) — suffisant pour le lecteur ZIP
 * de la V3 (web/src/v3/core/zip.js), qui lit les entrées « stored » telles quelles.
 * @param {Array<{name: string, data: string | Uint8Array}>} files
 * @returns {Uint8Array}
 */
export function storedZip(files) {
  const enc = new TextEncoder()
  const locals = []
  const centrals = []
  let offset = 0
  for (const f of files) {
    const name = enc.encode(f.name)
    const data = typeof f.data === 'string' ? enc.encode(f.data) : f.data
    const crc = crc32(data)
    const local = new Uint8Array(30 + name.length + data.length)
    const lv = new DataView(local.buffer)
    lv.setUint32(0, 0x04034b50, true)
    lv.setUint16(4, 20, true)
    lv.setUint16(8, 0, true)
    lv.setUint32(14, crc, true)
    lv.setUint32(18, data.length, true)
    lv.setUint32(22, data.length, true)
    lv.setUint16(26, name.length, true)
    local.set(name, 30)
    local.set(data, 30 + name.length)
    const central = new Uint8Array(46 + name.length)
    const cv = new DataView(central.buffer)
    cv.setUint32(0, 0x02014b50, true)
    cv.setUint16(4, 20, true)
    cv.setUint16(6, 20, true)
    cv.setUint16(10, 0, true)
    cv.setUint32(16, crc, true)
    cv.setUint32(20, data.length, true)
    cv.setUint32(24, data.length, true)
    cv.setUint16(28, name.length, true)
    cv.setUint32(42, offset, true)
    central.set(name, 46)
    locals.push(local)
    centrals.push(central)
    offset += local.length
  }
  const centralSize = centrals.reduce((n, c) => n + c.length, 0)
  const eocd = new Uint8Array(22)
  const ev = new DataView(eocd.buffer)
  ev.setUint32(0, 0x06054b50, true)
  ev.setUint16(8, files.length, true)
  ev.setUint16(10, files.length, true)
  ev.setUint32(12, centralSize, true)
  ev.setUint32(16, offset, true)
  const out = new Uint8Array(offset + centralSize + 22)
  let pos = 0
  for (const part of [...locals, ...centrals, eocd]) {
    out.set(part, pos)
    pos += part.length
  }
  return out
}

/** Découpe un document-jour en fichiers carto_Pn.json (+ kairos.json) d'un ZIP journalier. */
export function dayZipFiles(dayDoc, prefix = '') {
  const files = (dayDoc.poles ?? []).map((pole) => ({
    name: `${prefix}carto_P${pole.poleNum}.json`,
    data: JSON.stringify(pole),
  }))
  if (dayDoc.kairos) files.push({ name: `${prefix}kairos.json`, data: JSON.stringify(dayDoc.kairos) })
  return files
}

/**
 * Fichier navigateur prêt pour un <input type="file"> : jsdom n'expose pas
 * toujours Blob#arrayBuffer — on le fournit explicitement.
 */
export function browserFile(content, name, type = 'application/json') {
  const bytes = typeof content === 'string' ? new TextEncoder().encode(content) : content
  const file = new File([bytes], name, { type })
  Object.defineProperty(file, 'arrayBuffer', {
    value: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  })
  Object.defineProperty(file, 'text', { value: async () => new TextDecoder().decode(bytes) })
  return file
}

// --- Faux serveur de la démo LLM (contrat de api/src/routes/llm.php) ---------

/**
 * Émule le contrat HTTP de la démo publique, avec les MÊMES règles que le
 * serveur PHP : défi à usage unique au format v1.<exp>.<aléa>.<mac>, preuve
 * vérifiée par sha256(challenge + ':' + nonce) (node:crypto, comme PHP),
 * champ piège « website » vide, quota optionnel. Les réponses LLM sont
 * fournies par `answer(body, n, init)` ; `challengeAnswer(n)` peut surcharger le défi.
 *
 * @param {{difficultyBits?: number, answer: (body: object, n: number, init: object) => object,
 *   challengeAnswer?: (n: number) => object | undefined, createHash: Function,
 *   extra?: (url: string, init?: object) => any}} opts
 */
export function fakeDemoServer({ difficultyBits = 4, answer, challengeAnswer, createHash, extra }) {
  const issued = new Set()
  const redeemed = new Set()
  const posts = []
  const rejected = []
  let challenges = 0
  const zeroBits = (hex) => {
    let bits = 0
    for (const ch of hex) {
      const nibble = parseInt(ch, 16)
      if (nibble === 0) {
        bits += 4
        continue
      }
      bits += nibble < 2 ? 3 : nibble < 4 ? 2 : nibble < 8 ? 1 : 0
      break
    }
    return bits
  }
  const mock = vi.fn(async (url, init = {}) => {
    const u = String(url)
    if (extra) {
      const answered = await extra(u, init)
      if (answered !== undefined) return answered
    }
    if (u === 'api/llm/challenge') {
      challenges += 1
      const override = challengeAnswer?.(challenges)
      if (override) return override
      const expires = Math.floor(Date.now() / 1000) + 300
      const challenge = `v1.${expires}.${String(challenges).padStart(16, '0')}.${'ab'.repeat(32)}`
      issued.add(challenge)
      return jsonResponse(200, { challenge, difficultyBits, expiresAt: expires })
    }
    if (u === 'api/llm' || u === 'api/tuteur') {
      const body = JSON.parse(init.body)
      if (typeof body.website === 'string' && body.website.trim() !== '') {
        rejected.push('honeypot')
        return jsonResponse(400, { error: 'Requête invalide' })
      }
      if (!issued.has(body.challenge)) {
        rejected.push('pow_invalid')
        return jsonResponse(400, { error: 'Preuve de travail invalide.', code: 'pow_invalid' })
      }
      if (redeemed.has(body.challenge)) {
        rejected.push('pow_reused')
        return jsonResponse(429, { error: 'Défi déjà utilisé : demandez un nouveau défi.', code: 'pow_reused' })
      }
      const digest = createHash('sha256').update(`${body.challenge}:${body.nonce}`, 'utf8').digest('hex')
      if (zeroBits(digest) < difficultyBits) {
        rejected.push('pow_weak')
        return jsonResponse(400, { error: 'Preuve de travail invalide.', code: 'pow_invalid' })
      }
      redeemed.add(body.challenge)
      posts.push(body)
      return answer(body, posts.length, init)
    }
    return jsonResponse(404, { error: 'absent' })
  })
  vi.stubGlobal('fetch', mock)
  return { mock, posts, rejected, issuedCount: () => challenges }
}
