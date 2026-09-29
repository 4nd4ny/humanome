// Outillage partagé des tests « cas d'utilisation » du lot Cartographe
// (UC-CAR-01 à UC-CAR-07). Fiches : docs/cas-utilisation/cartographe/
//
// - Réseau simulé au niveau de fetch GLOBAL (vi.stubGlobal) : l'application
//   entière (<App/>) tourne comme dans le navigateur du cartographe, seules
//   les réponses HTTP sont fabriquées, aux formes RÉELLES de l'API
//   (api/src/routes/{cartographe,annotations}.php).
// - api/auth/me répond la session du cartographe (et son jeton CSRF, repris
//   ensuite par apiFetch sur chaque mutation) ; toute route non prévue répond
//   404 JSON — le référentiel publié absent retombe ainsi sur la copie
//   embarquée (data/load.js).
import { createElement } from 'react'
import { render } from '@testing-library/react'
import { vi } from 'vitest'
import App from '../../../src/App.jsx'
import * as fakeLib from '../../../src/test/fake-sunburst-lib.js'
import dayFixture from '../../../../schemas/fixtures/cartographie-jour-2026-01-05.json'
import mergeFixture from '../../../../schemas/fixtures/cartographie-merge-3-jours.json'

export const CSRF = 'jeton-csrf-du-cartographe'

/** Cartographe connecté (forme de GET api/auth/me). */
export const CAMILLE = Object.freeze({
  id: 9,
  email: 'camille@example.org',
  displayName: 'Camille',
  roles: ['cartographe'],
})

export const clone = (doc) => JSON.parse(JSON.stringify(doc))
export const dayDoc = () => clone(dayFixture)
export const mergeDoc = () => clone(mergeFixture)

export function jsonResponse(status, data) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => (name.toLowerCase() === 'content-type' ? 'application/json' : null) },
    json: async () => data,
  }
}

export function noContent() {
  return { ok: true, status: 204, headers: { get: () => null }, json: async () => null }
}

/**
 * Installe le réseau simulé.
 * @param {Record<string, object | ((ctx: {init: object, body: any}) => object)>} routes
 *   clé 'MÉTHODE url' (ex. 'POST api/cartographies/12/annotations')
 * @param {{user?: object | null, meThrows?: boolean}} [options] user null = visiteur
 * @returns {{fetchMock, calls: Array<{key, body, headers}>, called: (key: string) => Array}}
 */
export function stubNetwork(routes = {}, { user = CAMILLE, meThrows = false } = {}) {
  const calls = []
  const fetchMock = vi.fn(async (url, init = {}) => {
    const key = `${init.method ?? 'GET'} ${url}`
    const body = typeof init.body === 'string' ? JSON.parse(init.body) : undefined
    calls.push({ key, body, headers: init.headers ?? {} })
    if (Object.prototype.hasOwnProperty.call(routes, key)) {
      const handler = routes[key]
      return typeof handler === 'function' ? handler({ init, body }) : handler
    }
    if (key === 'GET api/auth/me') {
      if (meThrows) throw new TypeError('Failed to fetch')
      return user
        ? jsonResponse(200, { user, csrfToken: CSRF })
        : jsonResponse(401, { error: 'Authentification requise' })
    }
    return jsonResponse(404, { error: 'absent' })
  })
  vi.stubGlobal('fetch', fetchMock)
  return { fetchMock, calls, called: (key) => calls.filter((call) => call.key === key) }
}

/**
 * Ouvre l'application entière sur #/cartographe[/<section>].
 * @param {string} [section] ex. 'relecture/12', 'comparer', 'consistance'
 * @param {object | null} [user] session vue par le shell (navigation)
 */
export function openCartographe(section = '', user = CAMILLE) {
  window.location.hash = section ? `#/cartographe/${section}` : '#/cartographe'
  return render(createElement(App, { lib: fakeLib, fetchMeFn: async () => ({ user }) }))
}

/** Entrée de file (GET api/cartographe/cartographies), forme Links::queueFor. */
export function queueEntry(overrides = {}) {
  return {
    id: 12,
    type: 'jour',
    titre: 'Journée du 5 janvier',
    visibility: 'cartographe',
    createdAt: '2026-07-02T10:00:00',
    updatedAt: '2026-07-02T10:00:00',
    apprenant: { id: 1, displayName: 'Maya' },
    annotations: 0,
    revisions: 0,
    garantie: null,
    ...overrides,
  }
}

/**
 * Détail (GET api/cartographe/cartographies/{id}) à la forme RÉELLE de l'API :
 * objet PLAT (Links::findForCartographe + annotations + revisions + garantie).
 */
export function detailBody(overrides = {}) {
  return {
    id: 12,
    type: 'jour',
    titre: 'Journée du 5 janvier',
    visibility: 'cartographe',
    document: dayDoc(),
    createdAt: '2026-07-02T10:00:00',
    updatedAt: '2026-07-02T10:00:00',
    apprenant: { id: 1, displayName: 'Maya' },
    annotations: [],
    revisions: [],
    garantie: null,
    ...overrides,
  }
}
