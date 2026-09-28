// UC-CAR-01 — Accepter l'invitation d'un apprenant : tests UNITAIRES (front).
// Fiche : docs/cas-utilisation/cartographe/UC-CAR-01-accepter-invitation.md
//
// Code sollicité appelé directement : le routeur par hash (#/cartographe),
// les appels API de l'accueil cartographe (acceptInvitation, fetchApprentis)
// et le formatage de date de rattachement (frDate).
import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseHash } from '../../../src/router.js'
import { apiFetch, resetApiClient } from '../../../src/api/client.js'
import {
  acceptInvitation,
  fetchApprentis,
  frDate,
} from '../../../src/views/cartographe/cartographe-api.js'
import { jsonResponse } from '../support/car.js'

afterEach(() => resetApiClient())

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

    const failure = await acceptInvitation('A/B C', fetchFn).catch((e) => e)

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
