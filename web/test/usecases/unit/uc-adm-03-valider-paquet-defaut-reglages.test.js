// UC-ADM-03 — Valider le paquet par défaut et les réglages : tests UNITAIRES
// (front).
// Fiche : docs/cas-utilisation/administration/UC-ADM-03-valider-paquet-defaut-reglages.md
//
// Code sollicité appelé directement : les appels de la section Réglages de
// l'administration (admin-api.js : fetchSettings, setDefaultPackage,
// listPublishedPackages, frDate), la route #/admin/reglages (parseHash), le
// composant ReglagesSection (bloc « Version de prompt par défaut ») et la
// garde de AdminView, rendus seuls ; le réseau est la fonction fetch du faux
// serveur du lot passée en couture (fetchFn), sans rendu de <App/>.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import ReglagesSection from '../../../src/views/admin/ReglagesSection.jsx'
import AdminView from '../../../src/views/AdminView.jsx'
import { ADMIN, PROMPTOLOGUE, createPromptologueBackend, jsonResponse as backendJson, packageDoc } from '../support/pro.js'
import {
  fetchSettings,
  frDate,
  listPublishedPackages,
  setDefaultPackage,
} from '../../../src/views/admin/admin-api.js'
import { parseHash } from '../../../src/router.js'
import { apiFetch, resetApiClient } from '../../../src/api/client.js'

afterEach(() => {
  cleanup()
  resetApiClient()
})

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

/** Bloc « Version de prompt par défaut » une fois chargé. */
async function defaultBlock() {
  const heading = await screen.findByRole('heading', { name: 'Version de prompt par défaut' })
  return heading.closest('.admin-default-package')
}

describe('UC-ADM-03 — ReglagesSection isolée : valider le paquet par défaut', () => {
  it('UC-ADM-03-U11 — bouton désactivé sans choix ; « id@version » découpé en {id, version} ; message ; 404 → alerte ; API injoignable → « Validation impossible. »', async () => {
    const backend = createPromptologueBackend({
      me: ADMIN,
      published: [packageDoc(), packageDoc({ version: '2.0.0' })],
      routes: {
        'POST api/admin/settings/default-package': (init) =>
          JSON.parse(init.body).version === '2.0.0'
            ? backendJson(404, { error: 'Version publiée introuvable' })
            : backendJson(200, { ...JSON.parse(init.body), status: 'default' }),
      },
    })
    await apiFetch('auth/me', { fetchFn: backend.fetchMock }) // jeton CSRF de la session
    render(createElement(ReglagesSection, { fetchFn: backend.fetchMock }))

    const block = await defaultBlock()
    const select = within(block).getByLabelText('Valider un paquet publié comme défaut')
    const button = within(block).getByRole('button', { name: 'Valider comme défaut' })
    expect(button.disabled).toBe(true)
    fireEvent.change(select, { target: { value: 'aurora-demo@1.0.0' } })
    expect(button.disabled).toBe(false)
    await act(async () => {
      fireEvent.click(button)
    })
    expect(backend.callsTo('POST', 'api/admin/settings/default-package')[0].body).toEqual({ id: 'aurora-demo', version: '1.0.0' })
    await waitFor(() => expect(screen.getByText('Paquet par défaut : aurora-demo 1.0.0.').getAttribute('role')).toBe('status'))
    expect(backend.callsTo('GET', 'api/admin/settings')).toHaveLength(2) // rechargement après succès

    fireEvent.change(within(await defaultBlock()).getByLabelText('Valider un paquet publié comme défaut'), { target: { value: 'aurora-demo@2.0.0' } })
    await act(async () => {
      fireEvent.click(within(await defaultBlock()).getByRole('button', { name: 'Valider comme défaut' }))
    })
    expect(screen.getByRole('alert').textContent).toBe('Version publiée introuvable')
    expect(screen.queryByText(/Paquet par défaut :/)).toBeNull()
    expect(backend.callsTo('GET', 'api/admin/settings')).toHaveLength(2) // pas de rechargement après un échec
    cleanup()

    // Erreur hors ApiError (réseau coupé au moment de valider) : message générique.
    const offline = vi.fn(async (url, init) => {
      if (init?.method === 'POST') throw new TypeError('Failed to fetch')
      return backend.fetchMock(url, init)
    })
    render(createElement(ReglagesSection, { fetchFn: offline }))
    fireEvent.change(within(await defaultBlock()).getByLabelText('Valider un paquet publié comme défaut'), { target: { value: 'aurora-demo@1.0.0' } })
    await act(async () => {
      fireEvent.click(within(await defaultBlock()).getByRole('button', { name: 'Valider comme défaut' }))
    })
    expect(screen.getByRole('alert').textContent).toBe('Validation impossible.')
  })
})

describe('UC-ADM-03 — AdminView isolée : garde administrateur', () => {
  it('UC-ADM-03-U12 — visiteur : explication + invitation à se connecter ; autre rôle : explication seule ; aucun réglage lu ; admin : section Réglages chargée', async () => {
    for (const [label, me, notConnected] of [
      ['visiteur', null, true],
      ['promptologue', PROMPTOLOGUE, false],
    ]) {
      const backend = createPromptologueBackend({ me })
      render(createElement(AdminView, { section: 'reglages', deps: { fetchMeFn: async () => ({ user: me }), fetchFn: backend.fetchMock } }))
      expect((await screen.findByTestId('admin-reserve')).textContent, label).toContain('Cet espace est réservé à l’administration de la plateforme.')
      expect(Boolean(screen.queryByText(/Vous n’êtes pas connecté/)), label).toBe(notConnected)
      expect(backend.calls.filter((c) => c.url.startsWith('api/admin/')), label).toEqual([])
      cleanup()
    }

    const backend = createPromptologueBackend({ me: ADMIN })
    render(createElement(AdminView, { section: 'reglages', deps: { fetchMeFn: async () => ({ user: ADMIN }), fetchFn: backend.fetchMock } }))
    expect(await screen.findByRole('heading', { name: 'Version de prompt par défaut' })).toBeDefined()
    expect(screen.queryByTestId('admin-reserve')).toBeNull()
    expect(backend.callsTo('GET', 'api/admin/settings')).toHaveLength(1)
  })
})
