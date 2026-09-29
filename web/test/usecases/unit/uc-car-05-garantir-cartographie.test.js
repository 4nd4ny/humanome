// UC-CAR-05 — Garantir une cartographie ou retirer sa garantie : tests UNITAIRES (front).
// Fiche : docs/cas-utilisation/cartographe/UC-CAR-05-garantir-cartographie.md
//
// Code sollicité appelé directement : les appels API de la garantie
// (postGarantie — corps selon la cible figée, forme de réponse ; deleteGarantie),
// puis le choix de la version figée par RelectureSection rendue SEULE (sans
// <App/>, réseau injecté par la couture `fetchFn`).
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { resetApiClient } from '../../../src/api/client.js'
import { deleteGarantie, postGarantie } from '../../../src/views/cartographe/cartographe-api.js'
import RelectureSection from '../../../src/views/cartographe/RelectureSection.jsx'
import * as fakeLib from '../../../src/test/fake-sunburst-lib.js'
import { detailBody, jsonResponse, noContent } from '../support/car.js'

afterEach(() => {
  cleanup()
  resetApiClient()
})

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

describe('UC-CAR-05 — RelectureSection : version figée par défaut (rendu seul)', () => {
  const revision = (id, createdAt) => ({ id, note: `Révision ${id}`, author: null, createdAt })

  async function frozenTarget(revisions) {
    const view = render(
      createElement(RelectureSection, {
        id: '12',
        user: { id: 9, displayName: 'Camille' },
        lib: fakeLib,
        fetchFn: vi.fn(async (url) =>
          url === 'api/cartographe/cartographies/12'
            ? jsonResponse(200, detailBody({ revisions }))
            : jsonResponse(404, { error: 'absent' }),
        ),
        getReferentiel: async () => ({ doc: { competences: [] } }),
      }),
    )
    fireEvent.click(await screen.findByRole('button', { name: 'Valider et garantir' }))
    const text = (await screen.findByTestId('garantie-confirm')).textContent
    view.unmount()
    return text
  }

  it('UC-CAR-05-U13 — document d’origine affiché : la révision au createdAt le plus récent est figée, quel que soit l’ordre reçu', async () => {
    // Ordre réel de l'API (id décroissant, Revisions::listForCartography).
    expect(await frozenTarget([revision(7, '2026-07-08T10:00:00'), revision(6, '2026-07-05T10:00:00')])).toContain(
      'La révision 7 sera figée',
    )
    // Ordre non monotone : c'est la date qui compte, pas la position.
    expect(
      await frozenTarget([
        revision(6, '2026-07-05T10:00:00'),
        revision(8, '2026-07-09T10:00:00'),
        revision(7, '2026-07-08T10:00:00'),
      ]),
    ).toContain('La révision 8 sera figée')
    // Aucune révision : le document d'origine.
    expect(await frozenTarget([])).toContain('Le document d’origine sera présenté comme garanti')
  })
})
