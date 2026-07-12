// Public referentiel loading (P4.4). Consultation is STATIC by design: the
// published versions live as plain JSON under data/referentiel/, exported by
// api/src/Referentiel/StaticExporter.php — index.json is an ARRAY of
// {referentielId, semver, label, publishedAt, fichier}, newest version first
// per referentiel. No PHP call at consultation time. When the fetch is
// impossible (file://, offline copy), the bundled RESPIRE v7 import
// (data/load.js) is the fallback so the page always renders.
import { getReferentiel } from './load.js'

/** Filenames accepted from index.json (no path traversal, same directory). */
const SAFE_FILE_RE = /^[A-Za-z0-9._-]+\.json$/

let cache = null

/** Empties the module cache (used by tests). */
export function clearReferentielCache() {
  cache = null
}

/**
 * Loads the latest published referentiel version, falling back to the bundled
 * one. Never rejects: the fallback is part of the contract.
 *
 * @param {{fetchFn?: typeof fetch, protocol?: string}} [options] test seams
 * @returns {Promise<{doc: object, origin: 'published' | 'bundled'}>}
 */
export async function loadPublishedReferentiel(options = {}) {
  if (cache !== null) return cache
  cache = await fetchLatest(options).catch(() => ({ doc: getReferentiel(), origin: 'bundled' }))
  return cache
}

/** @returns {Promise<{doc: object, origin: 'published'}>} @throws on any anomaly */
async function fetchLatest(options) {
  const protocol = options.protocol ?? globalThis.location?.protocol
  if (protocol === 'file:') throw new Error('fetch unavailable on file://')
  const doFetch = options.fetchFn ?? globalThis.fetch?.bind(globalThis)
  if (!doFetch) throw new Error('fetch unavailable')

  const index = await fetchJson(doFetch, 'data/referentiel/index.json')
  if (!Array.isArray(index) || index.length === 0) {
    throw new Error('referentiel index: empty or invalid')
  }
  // Newest first (StaticExporter). RESPIRE is the platform's referentiel:
  // prefer it should several referentiels ever be published side by side.
  const entry = index.find((e) => e?.referentielId === 'respire') ?? index[0]
  const file = entry?.fichier
  if (typeof file !== 'string' || !SAFE_FILE_RE.test(file)) {
    throw new Error('referentiel index: invalid "fichier" entry')
  }

  const doc = await fetchJson(doFetch, `data/referentiel/${file}`)
  if (!Array.isArray(doc?.poles) || !Array.isArray(doc?.competences)) {
    throw new Error('referentiel: unexpected document shape')
  }
  return { doc, origin: 'published' }
}

/** @throws {Error} on network failure, non-2xx or invalid JSON */
async function fetchJson(doFetch, url) {
  const response = await doFetch(url)
  if (!response.ok) throw new Error(`HTTP ${response.status} on ${url}`)
  return response.json()
}
