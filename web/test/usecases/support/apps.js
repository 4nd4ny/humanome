// Outils partagés du lot « apprenant — ce qui passe par le serveur »
// (UC-APP-04, UC-APP-05, UC-APP-07, UC-APP-08) : réponses HTTP simulées et
// petit serveur factice routé, qui JOURNALISE chaque requête (méthode, URL,
// en-têtes, corps décodé) pour que les tests fonctionnels vérifient ce que
// l'IHM envoie réellement à l'API (jeton CSRF compris).
import { vi } from 'vitest'

/** Jeton CSRF que le faux GET api/auth/me remet au client (mémoire du module). */
export const APPS_CSRF = 'csrf-apps-0123456789'

/** Compte apprenant connecté renvoyé par le faux api/auth/me. */
export const APPS_USER = {
  id: 7,
  email: 'maya@example.org',
  displayName: 'Maya',
  roles: ['apprenant'],
}

/** Réponse JSON minimale compatible avec apiFetch (web/src/api/client.js). */
export function jsonResponse(status, data) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => (name.toLowerCase() === 'content-type' ? 'application/json' : null) },
    json: async () => data,
  }
}

/** 204 No Content. */
export function noContentResponse() {
  return { ok: true, status: 204, headers: { get: () => null }, json: async () => null }
}

/**
 * Faux réseau routé. `routes` = liste de [méthode, motif, handler] où motif
 * est une chaîne exacte ('cartographies') ou une RegExp appliquée au chemin
 * SANS le préfixe 'api/'. Le handler reçoit {body, headers, match, method, path}
 * et renvoie une réponse (jsonResponse / noContentResponse).
 * Une route absente répond 404 JSON (et non une exception) : l'IHM doit
 * rester robuste, le test vérifie ensuite `requests`.
 *
 * @returns {{fetch: import('vitest').Mock, requests: Array<{method: string, path: string, headers: object, body: any}>}}
 */
export function createFakeApi(routes) {
  const requests = []
  const fetch = vi.fn(async (url, init = {}) => {
    const method = init.method ?? 'GET'
    const path = String(url).replace(/^api\//, '')
    const headers = init.headers ?? {}
    const body = init.body === undefined ? undefined : JSON.parse(init.body)
    requests.push({ method, path, headers, body })
    for (const [routeMethod, pattern, handler] of routes) {
      if (routeMethod !== method) continue
      const match = typeof pattern === 'string' ? (pattern === path ? [path] : null) : pattern.exec(path)
      if (match) return handler({ body, headers, match, method, path })
    }
    return jsonResponse(404, { error: `route non simulée : ${method} ${path}` })
  })
  return { fetch, requests }
}

/** Route GET auth/me : connecté (avec jeton CSRF) ou visiteur (401). */
export function meRoute(user = APPS_USER) {
  return [
    'GET',
    'auth/me',
    () =>
      user
        ? jsonResponse(200, { user, csrfToken: APPS_CSRF })
        : jsonResponse(401, { error: 'Authentification requise' }),
  ]
}

/** Requêtes mutantes (hors GET) journalisées par le faux réseau. */
export function mutations(requests) {
  return requests.filter((request) => request.method !== 'GET')
}

/** Store de formation factice (le tableau de bord le lit au montage). */
export function fakeTrainingStore() {
  return {
    async load() {
      return { chapitres: [], source: 'local' }
    },
    async setChapter() {},
  }
}
