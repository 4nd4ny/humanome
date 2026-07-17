// Interface V3 — lecteur ZIP minimal pour l'import du corpus historique
// (spec §7-8) : ZIP journalier (7 carto_Pn + kairos) et ZIP corpus
// (runs → AAAA-MM-JJ.zip). Sans dépendance : répertoire central parsé à la
// main, entrées « stored » lues telles quelles, « deflate » décompressées via
// DecompressionStream('deflate-raw') (navigateur moderne et Node ≥ 18).
//
// Sécurité (spec §22.1) : chemins traversants rejetés, taille bornée,
// répertoire central exigé — un fichier tronqué produit une erreur claire.

const MAX_ENTRY_BYTES = 32 * 1024 * 1024 // 32 Mo par entrée : largement au-delà du corpus
const EOCD_SIG = 0x06054b50
const CDIR_SIG = 0x02014b50
const LOCAL_SIG = 0x04034b50

/** @param {string} name @returns {boolean} chemin sûr (pas de traversée) */
export function isSafeZipPath(name) {
  if (name.includes('\\')) return false
  if (name.startsWith('/') || /^[a-zA-Z]:/.test(name)) return false
  return !name.split('/').includes('..')
}

/**
 * Liste les entrées du répertoire central d'un ZIP.
 * @param {Uint8Array} bytes
 * @returns {Array<{name: string, method: number, compressedSize: number, size: number, localOffset: number}>}
 */
export function listZipEntries(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  // EOCD : cherché depuis la fin (commentaire ≤ 64 Ko).
  let eocd = -1
  const min = Math.max(0, bytes.length - 65557)
  for (let i = bytes.length - 22; i >= min; i--) {
    if (view.getUint32(i, true) === EOCD_SIG) {
      eocd = i
      break
    }
  }
  if (eocd < 0) throw new Error('ZIP illisible : répertoire central introuvable (fichier tronqué ?)')
  const count = view.getUint16(eocd + 10, true)
  let offset = view.getUint32(eocd + 16, true)
  const entries = []
  const decoder = new TextDecoder()
  for (let i = 0; i < count; i++) {
    if (view.getUint32(offset, true) !== CDIR_SIG) {
      throw new Error('ZIP illisible : entrée de répertoire central corrompue')
    }
    const method = view.getUint16(offset + 10, true)
    const compressedSize = view.getUint32(offset + 20, true)
    const size = view.getUint32(offset + 24, true)
    const nameLen = view.getUint16(offset + 28, true)
    const extraLen = view.getUint16(offset + 30, true)
    const commentLen = view.getUint16(offset + 32, true)
    const localOffset = view.getUint32(offset + 42, true)
    const name = decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLen))
    if (!name.endsWith('/')) {
      if (!isSafeZipPath(name)) throw new Error(`ZIP rejeté : chemin dangereux « ${name} »`)
      if (size > MAX_ENTRY_BYTES) throw new Error(`ZIP rejeté : entrée trop volumineuse « ${name} »`)
      entries.push({ name, method, compressedSize, size, localOffset })
    }
    offset += 46 + nameLen + extraLen + commentLen
  }
  return entries
}

/**
 * Extrait les octets d'une entrée.
 * @param {Uint8Array} bytes @param {ReturnType<typeof listZipEntries>[0]} entry
 * @returns {Promise<Uint8Array>}
 */
export async function readZipEntry(bytes, entry) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (view.getUint32(entry.localOffset, true) !== LOCAL_SIG) {
    throw new Error(`ZIP illisible : en-tête local corrompu (${entry.name})`)
  }
  const nameLen = view.getUint16(entry.localOffset + 26, true)
  const extraLen = view.getUint16(entry.localOffset + 28, true)
  const start = entry.localOffset + 30 + nameLen + extraLen
  const raw = bytes.subarray(start, start + entry.compressedSize)
  if (entry.method === 0) return raw.slice()
  if (entry.method === 8) {
    const ds = new DecompressionStream('deflate-raw')
    const stream = new Blob([raw]).stream().pipeThrough(ds)
    const out = new Uint8Array(await new Response(stream).arrayBuffer())
    if (out.length !== entry.size) throw new Error(`ZIP illisible : taille inattendue (${entry.name})`)
    return out
  }
  throw new Error(`ZIP non géré : méthode de compression ${entry.method} (${entry.name})`)
}

const DAY_ZIP_RE = /(^|\/)(\d{4}-\d{2}-\d{2})\.zip$/
const CARTO_RE = /(^|\/)carto_P([1-7])\.json$/
const KAIROS_RE = /(^|\/)kairos\.json$/

/**
 * Inventorie un ZIP (journalier ou corpus) en documents-jour prêts pour
 * importJourDocuments. La date canonique d'un ZIP journalier vient de son NOM
 * (§6.9) ; runId vient du dossier parent.
 *
 * @param {Uint8Array} bytes
 * @param {{fallbackRun?: string}} [opts]
 * @returns {Promise<{entries: Array<{run: string, sourceDate: string, payload: object, rawBytes: Uint8Array}>, report: Array}>}
 */
export async function inventoryZip(bytes, { fallbackRun = 'import' } = {}) {
  const report = []
  const entries = []
  const zipEntries = listZipEntries(bytes)

  // Corpus : des ZIP journaliers imbriqués (run/AAAA-MM-JJ.zip).
  const nested = zipEntries.filter((e) => DAY_ZIP_RE.test(e.name))
  if (nested.length > 0) {
    for (const inner of nested) {
      const m = inner.name.match(DAY_ZIP_RE)
      const sourceDate = m[2]
      const run = inner.name.includes('/') ? inner.name.split('/')[0] : fallbackRun
      try {
        const innerBytes = await readZipEntry(bytes, inner)
        const day = await dayFromZip(innerBytes, { run, sourceDate, report })
        if (day) entries.push(day)
      } catch (err) {
        report.push({ severity: 'blocking', code: 'zip-journalier-invalide', message: `${inner.name} : ${err.message}`, run, sourceDate })
      }
    }
    return { entries, report }
  }

  // ZIP journalier direct : le nom du FICHIER n'est pas lisible ici (l'appelant
  // le passe via fallbackRun/sourceDate) — on tente les carto_Pn à la racine.
  const day = await dayFromZip(bytes, { run: fallbackRun, sourceDate: null, report })
  if (day) entries.push(day)
  return { entries, report }
}

/** Assemble un document-jour depuis les entrées d'un ZIP journalier. */
async function dayFromZip(bytes, { run, sourceDate, report }) {
  const zipEntries = listZipEntries(bytes)
  const decoder = new TextDecoder()
  const poles = []
  let kairos = null
  let missingDate = sourceDate === null

  for (const e of zipEntries) {
    const carto = e.name.match(CARTO_RE)
    if (!carto && !KAIROS_RE.test(e.name)) continue
    let parsed
    try {
      parsed = JSON.parse(decoder.decode(await readZipEntry(bytes, e)))
    } catch (err) {
      report.push({ severity: 'blocking', code: 'json-invalide', message: `${e.name} : JSON invalide — fichier en quarantaine`, run, sourceDate })
      continue // quarantaine sans bloquer le reste (AC-DATA-01)
    }
    if (carto) poles.push(parsed)
    else kairos = parsed
  }
  if (poles.length === 0 && !kairos) return null
  if (poles.length < 7) {
    report.push({ severity: 'warning', code: 'journee-incomplete', message: `${poles.length}/7 pôles présents${kairos ? '' : ', kairos absent'}`, run, sourceDate })
  }
  if (missingDate) {
    // §6.9 : pour un JSON isolé la date vient de l'utilisateur ; les feuilles
    // ne préremplissent que si TOUTES identiques et au format strict.
    const feuilles = new Set()
    for (const pole of poles) for (const p of pole.passagesSaillants ?? []) if (p.feuille) feuilles.add(p.feuille)
    if (feuilles.size === 1 && /^\d{4}-\d{2}-\d{2}$/.test([...feuilles][0])) {
      sourceDate = [...feuilles][0]
      report.push({ severity: 'arbitrate', code: 'date-proposee', message: `Date proposée depuis les feuilles (${sourceDate}) — à confirmer`, run })
    } else {
      report.push({ severity: 'blocking', code: 'date-absente', message: 'Date de la journée à saisir (aucune proposition fiable)', run })
      return null
    }
  }
  return { run, sourceDate, payload: { date: sourceDate, poles, ...(kairos ? { kairos } : {}) }, rawBytes: bytes }
}
