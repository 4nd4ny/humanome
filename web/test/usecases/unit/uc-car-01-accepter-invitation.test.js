// UC-CAR-01 — Accepter l'invitation d'un apprenant : tests UNITAIRES (front).
// Fiche : docs/cas-utilisation/cartographe/UC-CAR-01-accepter-invitation.md
//
// Code sollicité appelé directement : le routeur par hash (#/cartographe),
// les appels API de l'accueil cartographe (acceptInvitation, fetchApprentis),
// le formatage de date de rattachement (frDate), puis les composants rendus
// SEULS (sans <App/>, réseau injecté par la couture `fetchFn`) : le
// formulaire de code d'AccueilSection et la garde de rôle de CartographeView.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { parseHash } from '../../../src/router.js'
import { ApiError, apiFetch, resetApiClient } from '../../../src/api/client.js'
import {
  acceptInvitation,
  fetchApprentis,
  frDate,
} from '../../../src/views/cartographe/cartographe-api.js'
import AccueilSection from '../../../src/views/cartographe/AccueilSection.jsx'
import CartographeView from '../../../src/views/CartographeView.jsx'
import { jsonResponse } from '../support/car.js'

afterEach(() => {
  cleanup()
  resetApiClient()
})

/** Réseau injecté : les deux GET du montage répondent des listes vides. */
function fakeAccueilNetwork(extra = {}) {
  return vi.fn(async (url, init = {}) => {
    const key = `${init.method ?? 'GET'} ${url}`
    if (key in extra) return extra[key]
    if (key === 'GET api/cartographe/apprentis' || key === 'GET api/cartographe/cartographies') {
      return jsonResponse(200, [])
    }
    return jsonResponse(404, { error: 'absent' })
  })
}

async function submitInAccueil(value) {
  fireEvent.change(await screen.findByLabelText('Code d’invitation'), { target: { value } })
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Accepter l’invitation' }))
  })
}

describe('UC-CAR-01 — routeur', () => {
  it('UC-CAR-01-U08 — #/cartographe ouvre l’accueil de l’espace (section null)', () => {
    expect(parseHash('#/cartographe')).toEqual({ name: 'cartographe', section: null })
  })
})

describe('UC-CAR-01 — acceptInvitation', () => {
  it('UC-CAR-01-U09 — POST api/cartographe/invitations/<code>/accept, avec le jeton CSRF de la session', async () => {
    // La session (GET auth/me) a livré un jeton CSRF gardé en mémoire.
    await apiFetch('auth/me', {
      fetchFn: vi.fn().mockResolvedValue(jsonResponse(200, { user: { id: 9 }, csrfToken: 'tok-9' })),
    })
    const fetchFn = vi
      .fn()
      .mockResolvedValue(jsonResponse(201, { apprenant: { id: 1, displayName: 'Maya' } }))

    const result = await acceptInvitation('K7TQZ2M9RC', fetchFn)

    expect(result).toEqual({ apprenant: { id: 1, displayName: 'Maya' } })
    const [url, init] = fetchFn.mock.calls[0]
    expect(url).toBe('api/cartographe/invitations/K7TQZ2M9RC/accept')
    expect(init.method).toBe('POST')
    expect(init.headers['X-CSRF-Token']).toBe('tok-9')
    expect(init.body).toBeUndefined()
  })

  it('UC-CAR-01-U10 — le code est encodé dans l’URL ; un 404 devient une ApiError au message serveur', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(jsonResponse(404, { error: 'Invitation introuvable ou expirée' }))

    const pending = acceptInvitation('A/B C', fetchFn)
    await expect(pending).rejects.toBeInstanceOf(ApiError)
    const failure = await pending.catch((e) => e)

    expect(fetchFn.mock.calls[0][0]).toBe('api/cartographe/invitations/A%2FB%20C/accept')
    expect(failure.status).toBe(404)
    expect(failure.message).toBe('Invitation introuvable ou expirée')
  })
})

describe('UC-CAR-01 — fetchApprentis', () => {
  it('UC-CAR-01-U11 — GET api/cartographe/apprentis : liste nue (forme API) ou enveloppée, sinon []', async () => {
    const apprentis = [{ id: 1, displayName: 'Maya', linkedAt: '2026-07-01T09:00:00' }]

    const bare = vi.fn().mockResolvedValue(jsonResponse(200, apprentis))
    expect(await fetchApprentis(bare)).toEqual(apprentis)
    expect(bare.mock.calls[0][0]).toBe('api/cartographe/apprentis')

    const wrapped = vi.fn().mockResolvedValue(jsonResponse(200, { apprentis }))
    expect(await fetchApprentis(wrapped)).toEqual(apprentis)

    const odd = vi.fn().mockResolvedValue(jsonResponse(200, { autre: true }))
    expect(await fetchApprentis(odd)).toEqual([])
  })
})

describe('UC-CAR-01 — frDate (date de rattachement)', () => {
  it('UC-CAR-01-U12 — ISO de l’API -> date française ; vide -> « — » ; illisible -> tel quel', () => {
    expect(frDate('2026-07-01T09:00:00')).toBe('01/07/2026')
    expect(frDate('')).toBe('—')
    expect(frDate(null)).toBe('—')
    expect(frDate(undefined)).toBe('—')
    expect(frDate('pas une date')).toBe('pas une date')
  })
})

describe('UC-CAR-01 — AccueilSection (formulaire de code, rendu seul)', () => {
  it('UC-CAR-01-U15 — normalisation : espaces retirés (trim) et majuscules avant l’envoi', async () => {
    const fetchFn = fakeAccueilNetwork({
      'POST api/cartographe/invitations/K7TQZ2M9RC/accept': jsonResponse(201, {
        apprenant: { id: 1, displayName: 'Maya' },
      }),
    })
    render(createElement(AccueilSection, { fetchFn }))

    // jsdom n'applique pas maxLength : la valeur arrive entière au composant,
    // ce qui permet d'exercer le trim (cf. Limites de la fiche).
    await submitInAccueil(' k7tqz2m9rc ')

    expect(await screen.findByText(/Invitation acceptée/)).toBeTruthy()
    const posts = fetchFn.mock.calls.filter(([, init]) => init?.method === 'POST')
    expect(posts.map(([url]) => url)).toEqual(['api/cartographe/invitations/K7TQZ2M9RC/accept'])
  })

  it('UC-CAR-01-U16 — contrôle local : code hors alphabet refusé avec le message, sans autre appel que les deux GET du montage', async () => {
    const fetchFn = fakeAccueilNetwork()
    render(createElement(AccueilSection, { fetchFn }))

    await submitInAccueil('K7TQZ2M9R0')

    expect((await screen.findByRole('alert')).textContent).toBe(
      'Le code d’invitation comporte 10 caractères (lettres A-Z, chiffres 2-9).',
    )
    expect(fetchFn.mock.calls.map(([url, init]) => `${init?.method ?? 'GET'} ${url}`).sort()).toEqual([
      'GET api/cartographe/apprentis',
      'GET api/cartographe/cartographies',
    ])
    expect(screen.getByLabelText('Code d’invitation').value).toBe('K7TQZ2M9R0')
  })
})

describe('UC-CAR-01 — CartographeView (garde de rôle, rendu seul)', () => {
  it('UC-CAR-01-U17 — sans le rôle cartographe : espace réservé et aucun appel ; avec le rôle : formulaire de code', async () => {
    const apprenantFetch = fakeAccueilNetwork()
    const first = render(
      createElement(CartographeView, {
        section: null,
        deps: {
          fetchMeFn: async () => ({ user: { id: 3, displayName: 'Zoé', roles: ['apprenant'] } }),
          fetchFn: apprenantFetch,
        },
      }),
    )
    expect((await screen.findByTestId('cartographe-reserve')).textContent).toContain(
      'Cet espace de travail est réservé aux cartographes.',
    )
    expect(screen.queryByLabelText('Code d’invitation')).toBeNull()
    expect(apprenantFetch).not.toHaveBeenCalled()
    first.unmount()

    const cartographeFetch = fakeAccueilNetwork()
    render(
      createElement(CartographeView, {
        section: null,
        deps: {
          fetchMeFn: async () => ({ user: { id: 9, displayName: 'Camille', roles: ['cartographe'] } }),
          fetchFn: cartographeFetch,
        },
      }),
    )
    expect(await screen.findByLabelText('Code d’invitation')).toBeTruthy()
    expect(screen.queryByTestId('cartographe-reserve')).toBeNull()
    expect(cartographeFetch).toHaveBeenCalled()
  })
})
