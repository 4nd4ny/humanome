// Support du lot « apprenant, parcours local » (UC-APP-01/02/03/06) :
// réponses HTTP factices et routeur de `fetch` simulé.
//
// Le front n'appelle que des URL RELATIVES (« api/… », « data/… ») : le
// routeur associe un motif (chaîne exacte ou RegExp) à une réponse. Toute
// URL non routée répond 404 JSON — c'est-à-dire « API présente, ressource
// absente » — et reste consignée dans `calls` pour les vérifications RGPD
// (« aucun appel n'a transporté le texte du portfolio »).
import { vi } from 'vitest'

/** Réponse JSON minimale compatible avec api/client.js et le moteur. */
export function jsonResponse(status, data, headers = {}) {
  const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]))
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (name) =>
        name.toLowerCase() === 'content-type' ? 'application/json' : (lower[name.toLowerCase()] ?? null),
    },
    json: async () => data,
    text: async () => JSON.stringify(data),
  }
}

/** Réponse texte (ex. export texte d'un Google Docs relayé par l'API). */
export function textResponse(status, text, contentType = 'text/plain; charset=utf-8') {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => (name.toLowerCase() === 'content-type' ? contentType : null) },
    text: async () => text,
    json: async () => JSON.parse(text),
  }
}

/**
 * Routeur de fetch : `routes` = liste de [motif, (url, init, call) => réponse].
 * @param {Array<[string | RegExp, Function]>} routes
 * @returns {import('vitest').Mock & {calls: Array<{url: string, init: object}>}}
 */
export function routedFetch(routes) {
  const calls = []
  const fn = vi.fn(async (input, init = {}) => {
    const url = String(input)
    calls.push({ url, init })
    for (const [pattern, answer] of routes) {
      const hit = typeof pattern === 'string' ? url === pattern : pattern.test(url)
      if (hit) return answer(url, init, calls.length)
    }
    return jsonResponse(404, { error: 'absent' })
  })
  fn.calls = calls
  return fn
}

/** Corps JSON d'un appel (POST) consigné, ou null. */
export function bodyOf(call) {
  try {
    return call?.init?.body ? JSON.parse(call.init.body) : null
  } catch {
    return null
  }
}
