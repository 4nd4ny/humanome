// Data loading for the unified visualization (P2).
//
// - The demo merge document and the referentiel are imported statically so
//   Vite bundles them: the built app must open from file:// (ADR-003/ADR-009)
//   where fetch() is unavailable.
// - Day documents (59 x ~250 Ko) are fetched lazily and cached (never loaded
//   as a whole, plan-fusion-visu §Risques).
// - ajv validation (via the engine, docs/contrats.md) applies ONLY to
//   user-provided JSON (drag & drop / file input).
import mergeDocDemo from '../../public/data/demo/merge.json'
import referentielDemo from '../../public/data/referentiel/respire-v7.json'
import { validateDocument } from '@engine/validation.js'
import { isValidIsoDate } from '../router.js'

/** @returns {object} demo merge document (cartographie-merge, bundled) */
export function getDemoMerge() {
  return mergeDocDemo
}

/** @returns {object} RESPIRE v7 referentiel (bundled, 8 Ko) */
export function getReferentiel() {
  return referentielDemo
}

export const FILE_PROTOCOL_MESSAGE =
  'La vue journée est disponible sur le site en ligne ou via un serveur local ' +
  '(les fichiers de démonstration ne peuvent pas être chargés depuis un fichier ouvert directement).'

const dayCache = new Map()

/** Empties the day-document cache (used by tests). */
export function clearDayCache() {
  dayCache.clear()
}

/**
 * Lazily fetches a demo day document (cartographie-jour), with a Map cache.
 * The URL is relative so the app works from any subpath (ADR-003).
 *
 * @param {string} iso day date AAAA-MM-JJ
 * @param {{fetchFn?: typeof fetch, protocol?: string}} [options] test seams
 * @returns {Promise<object>} the day document
 * @throws {Error} French, displayable message; on file:// the message points
 *   to the online site or a local server.
 */
export async function loadDay(iso, options = {}) {
  if (!isValidIsoDate(iso)) {
    throw new Error(`Date invalide : « ${iso} ».`)
  }
  if (dayCache.has(iso)) return dayCache.get(iso)

  const protocol = options.protocol ?? globalThis.location?.protocol
  if (protocol === 'file:') {
    throw new Error(FILE_PROTOCOL_MESSAGE)
  }

  const fetchFn = options.fetchFn ?? globalThis.fetch?.bind(globalThis)
  let response
  try {
    response = await fetchFn(`data/demo/jours/${iso}.json`)
  } catch {
    throw new Error(
      `Impossible de charger la journée du ${frenchDate(iso)} (réseau indisponible ?). Réessayez plus tard.`,
    )
  }
  if (!response.ok) {
    throw new Error(
      response.status === 404
        ? `Aucune cartographie de journée pour le ${frenchDate(iso)}.`
        : `Erreur de chargement de la journée du ${frenchDate(iso)} (HTTP ${response.status}).`,
    )
  }
  const doc = await response.json()
  dayCache.set(iso, doc)
  return doc
}

/** @param {string} iso AAAA-MM-JJ @returns {string} JJ/MM/AAAA */
export function frenchDate(iso) {
  const [y, m, d] = String(iso).split('-')
  return `${d}/${m}/${y}`
}

const USER_KINDS = ['cartographie-merge', 'cartographie-jour']

/**
 * Parses and validates a user-provided file (drag & drop or file input).
 * Nothing leaves the browser: the file is read and validated locally.
 *
 * @param {string} text raw file content
 * @returns {{kind: 'cartographie-merge' | 'cartographie-jour', doc: object}}
 * @throws {Error} French message; `error.validationErrors` carries the ajv
 *   error list ({path, keyword, message}) when the JSON does not match its schema.
 */
export function parseUserDocument(text) {
  let data
  try {
    data = JSON.parse(text)
  } catch {
    if (/\bconst\s+(domainsData|profilMeta|kairosHtml)\b/.test(text)) {
      throw new Error(
        'Ce fichier ressemble à un carto-data.js hérité, pas à un document JSON. ' +
          'Convertissez-le d’abord avec scripts/convert/carto-data-to-merge-json.mjs (voir docs/contrats.md).',
      )
    }
    throw new Error('Ce fichier n’est pas un JSON valide.')
  }

  const kind = data && typeof data === 'object' ? data.kind : undefined
  if (!USER_KINDS.includes(kind)) {
    throw new Error(
      'Document non reconnu : le champ « kind » doit valoir ' +
        '« cartographie-merge » ou « cartographie-jour » (schémas P1).',
    )
  }

  const { valid, errors } = validateDocument(kind, data)
  if (!valid) {
    const error = new Error(
      `Document non conforme au schéma « ${kind} » (${errors.length} erreur${errors.length > 1 ? 's' : ''}).`,
    )
    error.validationErrors = errors
    throw error
  }

  return { kind, doc: data }
}
