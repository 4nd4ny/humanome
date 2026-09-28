// UC-CAR-05 — Garantir une cartographie ou retirer sa garantie : tests UNITAIRES (front).
// Fiche : docs/cas-utilisation/cartographe/UC-CAR-05-garantir-cartographie.md
//
// Code sollicité appelé directement : les appels API de la garantie
// (postGarantie — corps selon la cible figée, forme de réponse ; deleteGarantie).
import { afterEach, describe, expect, it, vi } from 'vitest'
import { resetApiClient } from '../../../src/api/client.js'
import { deleteGarantie, postGarantie } from '../../../src/views/cartographe/cartographe-api.js'
import { jsonResponse, noContent } from '../support/car.js'

afterEach(() => resetApiClient())

const GARANTIE = { par: 'Camille', date: '2026-07-10T09:00:00', revisionId: 7 }

describe('UC-CAR-05 — postGarantie', () => {
  it('UC-CAR-05-U08 — cible absente (null/undefined) -> corps {} ; révision -> {revisionId}', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(201, { ...GARANTIE, revisionId: null }))

    await postGarantie(12, null, fetchFn)
    await postGarantie(12, undefined, fetchFn)
    await postGarantie(12, 7, fetchFn)

    expect(fetchFn.mock.calls.map(([url]) => url)).toEqual([
      'api/cartographies/12/garantie',
      'api/cartographies/12/garantie',
      'api/cartographies/12/garantie',
    ])
    expect(fetchFn.mock.calls.map(([, init]) => init.method)).toEqual(['POST', 'POST', 'POST'])
    expect(fetchFn.mock.calls.map(([, init]) => JSON.parse(init.body))).toEqual([{}, {}, { revisionId: 7 }])
  })

  it('UC-CAR-05-U09 — réponse PLATE de l’API {par, date, revisionId} renvoyée telle quelle ; forme enveloppée tolérée', async () => {
    expect(await postGarantie(12, 7, vi.fn().mockResolvedValue(jsonResponse(201, GARANTIE)))).toEqual(GARANTIE)
    expect(
      await postGarantie(12, 7, vi.fn().mockResolvedValue(jsonResponse(201, { garantie: GARANTIE }))),
    ).toEqual(GARANTIE)
  })

  it('UC-CAR-05-U10 — 409 -> ApiError au message serveur (conflit de signataires)', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(jsonResponse(409, { error: 'Cartographie déjà garantie par un autre cartographe' }))

    const failure = await postGarantie(12, null, fetchFn).catch((e) => e)

    expect(failure.status).toBe(409)
    expect(failure.message).toBe('Cartographie déjà garantie par un autre cartographe')
  })
})

describe('UC-CAR-05 — deleteGarantie', () => {
  it('UC-CAR-05-U11 — DELETE api/cartographies/<id>/garantie : 204 -> null ; 404 -> « Garantie introuvable »', async () => {
    const ok = vi.fn().mockResolvedValue(noContent())
    expect(await deleteGarantie(12, ok)).toBeNull()
    expect(ok.mock.calls[0][0]).toBe('api/cartographies/12/garantie')
    expect(ok.mock.calls[0][1].method).toBe('DELETE')
    expect(ok.mock.calls[0][1].body).toBeUndefined()

    const missing = vi.fn().mockResolvedValue(jsonResponse(404, { error: 'Garantie introuvable' }))
    const failure = await deleteGarantie(12, missing).catch((e) => e)
    expect(failure.status).toBe(404)
    expect(failure.message).toBe('Garantie introuvable')
  })
})
