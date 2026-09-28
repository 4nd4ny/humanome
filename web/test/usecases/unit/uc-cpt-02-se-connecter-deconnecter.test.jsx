// UC-CPT-02 — Se connecter et se déconnecter : tests UNITAIRES (front).
// Fiche : docs/cas-utilisation/compte/UC-CPT-02-se-connecter-deconnecter.md
//
// Code sollicité appelé directement : client API (login / logout / fetchMe :
// jeton CSRF gardé en MÉMOIRE seulement, événement « humanome:auth »,
// dégradation « API indisponible ») et construction de la navigation selon
// l'état de session (navGroups) ; le shell <App/> est rendu avec sa couture
// fetchMeFn pour vérifier qu'il se rafraîchit sur « humanome:auth ».
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import App from '../../../src/App.jsx'
import * as fakeLib from '../../../src/test/fake-sunburst-lib.js'
import {
  ApiError,
  ApiUnavailableError,
  fetchMe,
  getCsrfToken,
  login,
  logout,
  resetApiClient,
} from '../../../src/api/client.js'
import { navGroups } from '../../../src/nav.js'
import { clearLocalStorage, jsonResponse, noContentResponse } from '../support/cpt.js'

afterEach(() => {
  cleanup()
  window.location.hash = ''
  resetApiClient()
  clearLocalStorage()
})

function authEvents() {
  const listener = vi.fn()
  window.addEventListener('humanome:auth', listener)
  return { listener, stop: () => window.removeEventListener('humanome:auth', listener) }
}

const ada = { id: 4, email: 'ada@example.org', displayName: 'Ada', roles: ['apprenant'], hasAvatar: false }

describe('UC-CPT-02 — client API : connexion', () => {
  it('UC-CPT-02-U09 — login() POSTe {email, password} sans jeton, garde le jeton reçu et notifie la navigation', async () => {
    const events = authEvents()
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(200, { user: ada, csrfToken: 'tok-login' }))

    const data = await login({ email: 'ada@example.org', password: 'correct horse' }, { fetchFn })
    events.stop()

    expect(data.user).toEqual(ada)
    const [url, init] = fetchFn.mock.calls[0]
    expect(url).toBe('api/auth/login')
    expect(init.method).toBe('POST')
    expect(init.credentials).toBe('same-origin') // le cookie de session voyage seul
    expect(init.headers['X-CSRF-Token']).toBeUndefined()
    expect(JSON.parse(init.body)).toEqual({ email: 'ada@example.org', password: 'correct horse' })
    expect(getCsrfToken()).toBe('tok-login')
    expect(events.listener).toHaveBeenCalledTimes(1)
  })

  it('UC-CPT-02-U10 — le jeton CSRF ne vit qu’en mémoire : rien dans localStorage ni sessionStorage', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(200, { user: ada, csrfToken: 'tok-secret-memoire' }))
    await login({ email: 'ada@example.org', password: 'x' }, { fetchFn })

    const stored = [localStorage, sessionStorage].flatMap((s) =>
      Array.from({ length: s.length }, (_, i) => s.getItem(s.key(i))),
    )
    expect(stored.join('|')).not.toContain('tok-secret-memoire')
    expect(getCsrfToken()).toBe('tok-secret-memoire')
  })
})

describe('UC-CPT-02 — client API : déconnexion et session', () => {
  it('UC-CPT-02-U11 — logout() renvoie le jeton en X-CSRF-Token puis l’oublie et notifie, même si l’API est injoignable', async () => {
    await login({ email: 'a', password: 'b' }, { fetchFn: vi.fn().mockResolvedValue(jsonResponse(200, { user: ada, csrfToken: 'tok-1' })) })
    const events = authEvents()
    const fetchFn = vi.fn().mockResolvedValue(noContentResponse())

    await expect(logout({ fetchFn })).resolves.toBeNull()
    const [url, init] = fetchFn.mock.calls[0]
    expect(url).toBe('api/auth/logout')
    expect(init.method).toBe('POST')
    expect(init.headers['X-CSRF-Token']).toBe('tok-1')
    expect(getCsrfToken()).toBeNull()

    // Réseau coupé : l'erreur remonte, mais le jeton est oublié et la nav rafraîchie.
    await login({ email: 'a', password: 'b' }, { fetchFn: vi.fn().mockResolvedValue(jsonResponse(200, { user: ada, csrfToken: 'tok-2' })) })
    const down = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
    await expect(logout({ fetchFn: down })).rejects.toBeInstanceOf(ApiUnavailableError)
    expect(getCsrfToken()).toBeNull()
    events.stop()
    expect(events.listener.mock.calls.length).toBeGreaterThanOrEqual(3) // logout, login, logout
  })

  it('UC-CPT-02-U12 — fetchMe() : 401 = visiteur (pas une erreur), 200 = profil + jeton, panne ou file:// = API indisponible', async () => {
    await expect(fetchMe({ fetchFn: vi.fn().mockResolvedValue(jsonResponse(401, { error: 'Authentification requise' })) })).resolves.toEqual({ user: null })

    await expect(fetchMe({ fetchFn: vi.fn().mockResolvedValue(jsonResponse(200, { user: ada, csrfToken: 'tok-me' })) })).resolves.toEqual({ user: ada })
    expect(getCsrfToken()).toBe('tok-me')

    await expect(fetchMe({ fetchFn: vi.fn().mockRejectedValue(new TypeError('offline')) })).rejects.toBeInstanceOf(ApiUnavailableError)
    const never = vi.fn()
    await expect(fetchMe({ fetchFn: never, protocol: 'file:' })).rejects.toBeInstanceOf(ApiUnavailableError)
    expect(never).not.toHaveBeenCalled()

    // Une autre erreur HTTP reste une erreur typée (ex. 500).
    const e = await fetchMe({ fetchFn: vi.fn().mockResolvedValue(jsonResponse(500, { error: 'Erreur interne' })) }).catch((err) => err)
    expect(e).toBeInstanceOf(ApiError)
    expect(e.status).toBe(500)
  })
})

describe('UC-CPT-02 — navigation selon la session', () => {
  it('UC-CPT-02-U13 — navGroups : visiteur → « Compte / Se connecter » ; connecté → « Mon compte » et familles de ses rôles', () => {
    const visitor = navGroups({ roles: [] })
    const compteVisitor = visitor.find((g) => g.id === 'compte')
    expect(compteVisitor.label).toBe('Compte')
    expect(compteVisitor.items.map((i) => i.label)).toEqual(['Se connecter', 'Confidentialité'])
    expect(visitor.some((g) => g.roles?.includes('apprenant'))).toBe(false)

    const connected = navGroups({ roles: ['apprenant', 'cartographe'] })
    const compte = connected.find((g) => g.id === 'compte')
    expect(compte.label).toBe('Mon compte')
    expect(compte.items.map((i) => i.href)).toEqual(['#/compte', '#/compte/credit', '#/confidentialite'])
    const labels = connected.flatMap((g) => g.items.map((i) => i.label))
    expect(labels).toContain('Tableau de bord')
    expect(labels).toContain('Ma file de relecture')
    expect(labels).not.toContain('Rôles et comptes') // pas admin
  })
})

describe('UC-CPT-02 — shell de l’application', () => {
  it('UC-CPT-02-U14 — <App/> relit la session à chaque « humanome:auth » et reconstruit la navigation (identité, rôles, déconnexion)', async () => {
    const fetchMeFn = vi.fn().mockResolvedValueOnce({ user: null })
    window.location.hash = '#/'
    render(<App lib={fakeLib} fetchMeFn={fetchMeFn} />)
    const nav = within(screen.getByRole('navigation', { name: 'Navigation principale' }))
    await waitFor(() => expect(fetchMeFn).toHaveBeenCalledTimes(1))
    expect(nav.getByRole('link', { name: 'Se connecter' })).toBeDefined()

    // Connexion ailleurs dans l'application (AccountView → login()).
    fetchMeFn.mockResolvedValueOnce({ user: { id: 4, displayName: 'Ada', roles: ['apprenant'], hasAvatar: false } })
    await act(async () => {
      window.dispatchEvent(new Event('humanome:auth'))
    })
    expect(await nav.findByRole('link', { name: 'Tableau de bord' })).toBeDefined()
    expect(nav.getByText('Ada')).toBeDefined()
    expect(nav.getByRole('button', { name: 'Se déconnecter' })).toBeDefined()

    // Déconnexion / suppression : même événement, retour à l'état visiteur.
    fetchMeFn.mockResolvedValueOnce({ user: null })
    await act(async () => {
      window.dispatchEvent(new Event('humanome:auth'))
    })
    await waitFor(() => expect(nav.queryByRole('button', { name: 'Se déconnecter' })).toBeNull())
    expect(fetchMeFn).toHaveBeenCalledTimes(3)
  })
})
