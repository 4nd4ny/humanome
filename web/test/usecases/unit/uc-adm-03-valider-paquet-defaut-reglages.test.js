// UC-ADM-03 — Valider le paquet par défaut et les réglages : tests UNITAIRES
// (front).
// Fiche : docs/cas-utilisation/administration/UC-ADM-03-valider-paquet-defaut-reglages.md
//
// Code sollicité appelé directement : les appels de la section Réglages de
// l'administration (admin-api.js : fetchSettings, setDefaultPackage,
// listPublishedPackages, frDate) et la route #/admin/reglages (parseHash).
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  fetchSettings,
  frDate,
  listPublishedPackages,
  setDefaultPackage,
} from '../../../src/views/admin/admin-api.js'
import { parseHash } from '../../../src/router.js'
import { apiFetch, resetApiClient } from '../../../src/api/client.js'

afterEach(() => resetApiClient())

function jsonResponse(status, data) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => (name.toLowerCase() === 'content-type' ? 'application/json' : null) },
    json: async () => data,
  }
}

describe('UC-ADM-03 — appels de la section Réglages', () => {
  it('UC-ADM-03-U07 — fetchSettings : GET admin/settings ; setDefaultPackage : POST {id, version} avec le jeton CSRF de la session', async () => {
    const fetchFn = vi.fn(async (url) =>
      url === 'api/auth/me'
        ? jsonResponse(200, { user: { id: 1, roles: ['admin'] }, csrfToken: 'jeton-admin' })
        : jsonResponse(200, { ok: true }),
    )
    await apiFetch('auth/me', { fetchFn })

    await fetchSettings(fetchFn)
    await setDefaultPackage('aurora-demo', '1.0.0', fetchFn)

    const [getUrl, getInit] = fetchFn.mock.calls[1]
    expect([getUrl, getInit.method]).toEqual(['api/admin/settings', 'GET'])
    const [postUrl, postInit] = fetchFn.mock.calls[2]
    expect([postUrl, postInit.method]).toEqual(['api/admin/settings/default-package', 'POST'])
    expect(JSON.parse(postInit.body)).toEqual({ id: 'aurora-demo', version: '1.0.0' })
    expect(postInit.headers['X-CSRF-Token']).toBe('jeton-admin')
  })

  it('UC-ADM-03-U08 — listPublishedPackages : liste publique, repli [] sur une réponse non tableau ; frDate : date courte ou tiret', async () => {
    const list = [{ id: 'aurora-demo', version: '1.0.0' }]
    expect(await listPublishedPackages(vi.fn(async () => jsonResponse(200, list)))).toEqual(list)
    expect(await listPublishedPackages(vi.fn(async () => jsonResponse(200, { packages: list })))).toEqual([])

    expect(frDate('2026-07-05T10:00:00')).toBe(new Date('2026-07-05T10:00:00').toLocaleDateString('fr-FR'))
    expect(frDate('')).toBe('—')
    expect(frDate(null)).toBe('—')
    expect(frDate('pas une date')).toBe('pas une date')
  })

  it('UC-ADM-03-U09 — #/admin/reglages ouvre la section Réglages de l’administration', () => {
    expect(parseHash('#/admin/reglages')).toEqual({ name: 'admin', section: 'reglages' })
    expect(parseHash('#/admin')).toEqual({ name: 'admin', section: null })
  })
})
