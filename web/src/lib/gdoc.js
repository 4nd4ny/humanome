// Google Docs import (P7.1) — the ONLY portfolio source that transits through
// the humanome.xyz server: browsers cannot read docs.google.com directly
// (CORS), so the API relays the text export of PUBLIC / link-readable
// documents. The UI states this explicitly (cahier §4.2, plan Q2); the server
// never stores nor logs the text (cahier §6.5: counters only, never content).
//
// Server contract (api/src/routes/llm.php, P6):
//   GET api/gdoc-text?docId=<id>
//     -> 200 text/plain (the document text)
//     -> 4xx/5xx application/json {error: '<French user-facing message>'}

export const GDOC_UNAVAILABLE_MESSAGE =
  'L’import Google Docs passe par le serveur humanome.xyz, qui est injoignable ' +
  'depuis cette copie du site. Utilisez le copier-coller ou un fichier .txt/.md.'

const ID_CHARS = /^[A-Za-z0-9_-]{20,80}$/

/**
 * Extracts the document id from a Google Docs URL (or a raw id).
 *
 * Accepted forms:
 * - https://docs.google.com/document/d/<id>/edit?usp=sharing (and /u/0/d/…)
 * - https://docs.google.com/open?id=<id>
 * - the raw <id> pasted alone
 *
 * @param {string} input pasted URL or id
 * @returns {string | null} the docId, or null when none is recognisable
 */
export function extractGdocId(input) {
  const raw = String(input ?? '').trim()
  if (raw === '') return null
  if (ID_CHARS.test(raw)) return raw

  const path = /\/document(?:\/u\/\d+)?\/d\/([A-Za-z0-9_-]+)/.exec(raw)
  if (path) return path[1]

  const query = /[?&]id=([A-Za-z0-9_-]+)/.exec(raw)
  if (query) return query[1]

  return null
}

/** @param {number} status @returns {string} French fallback per HTTP status */
function fallbackMessage(status) {
  if (status === 403 || status === 404) {
    return (
      'Document inaccessible : vérifiez qu’il est public ou partagé « en lecture » ' +
      'par lien, puis réessayez.'
    )
  }
  if (status === 422) return 'Identifiant de document Google Docs invalide.'
  if (status === 429) return 'Quota horaire atteint, réessayez plus tard.'
  return `L’import Google Docs a échoué (HTTP ${status}). Réessayez plus tard.`
}

/**
 * Fetches the plain-text export of a public Google Docs document through the
 * platform API relay. Relative URL: same discipline as api/client.js (works
 * behind any subpath and through the Vite dev proxy).
 *
 * @param {string} docId as returned by extractGdocId()
 * @param {{fetchFn?: typeof fetch, protocol?: string}} [options] test seams
 * @returns {Promise<string>} the document text
 * @throws {Error} with a displayable French message on any failure
 */
export async function fetchGdocText(docId, options = {}) {
  const { fetchFn, protocol } = options
  if ((protocol ?? globalThis.location?.protocol) === 'file:') {
    throw new Error(GDOC_UNAVAILABLE_MESSAGE)
  }
  const doFetch = fetchFn ?? globalThis.fetch?.bind(globalThis)
  if (!doFetch) throw new Error(GDOC_UNAVAILABLE_MESSAGE)

  let response
  try {
    response = await doFetch(`api/gdoc-text?docId=${encodeURIComponent(docId)}`, {
      method: 'GET',
      headers: { Accept: 'text/plain, application/json' },
      credentials: 'same-origin',
    })
  } catch {
    throw new Error(GDOC_UNAVAILABLE_MESSAGE)
  }

  const contentType = String(response.headers?.get?.('content-type') ?? '')

  if (!response.ok) {
    // The API answers {error: <French message>}; anything else (static host
    // serving an HTML 404) means the API is simply not there.
    if (contentType.includes('application/json')) {
      let body = null
      try {
        body = await response.json()
      } catch {
        body = null
      }
      const serverMessage = typeof body?.error === 'string' ? body.error : null
      throw new Error(serverMessage ?? fallbackMessage(response.status))
    }
    throw new Error(GDOC_UNAVAILABLE_MESSAGE)
  }

  if (!contentType.includes('text/plain')) {
    // A 200 that is not the text export (HTML index fallback…): not the API.
    throw new Error(GDOC_UNAVAILABLE_MESSAGE)
  }
  return response.text()
}
