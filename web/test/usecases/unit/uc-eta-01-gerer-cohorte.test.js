// UC-ETA-01 — Créer et gérer une cohorte : tests UNITAIRES (front).
// Fiche : docs/cas-utilisation/etablissement/UC-ETA-01-gerer-cohorte.md
//
// Code sollicité appelé directement : le routeur par hash (#/etablissement et
// ses sections), les appels de etablissement-api.js (création, liste, détail
// normalisé, suppression — jeton CSRF sur les mutations) et le formatage des
// dates. Réseau simulé par la couture fetchFn.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseHash } from '../../../src/router.js'
import { apiFetch, resetApiClient } from '../../../src/api/client.js'
import {
  createCohorte,
  deleteCohorte,
  fetchCohorte,
  fetchCohortes,
  frDate,
} from '../../../src/views/etablissement/etablissement-api.js'
import { CSRF, cohorteDetail, cohorteListItem, jsonResponse, noContent } from '../support/eta.js'

afterEach(() => resetApiClient())

/** Amorce le jeton CSRF en mémoire comme le fait GET api/auth/me. */
async function primeCsrf() {
  await apiFetch('auth/me', { fetchFn: async () => jsonResponse(200, { user: {}, csrfToken: CSRF }) })
}

describe('UC-ETA-01 — routeur de l’espace établissement', () => {
  it('UC-ETA-01-U07 — #/etablissement ouvre l’accueil, #/etablissement/cohorte/<id> la section cohorte', () => {
    expect(parseHash('#/etablissement')).toEqual({ name: 'etablissement', section: null })
    expect(parseHash('#/etablissement/cohorte/7')).toEqual({ name: 'etablissement', section: 'cohorte/7' })
  })
})

describe('UC-ETA-01 — client API des cohortes', () => {
  it('UC-ETA-01-U08 — fetchCohortes accepte la liste nue de l’API (et l’enveloppe {cohortes})', async () => {
    const bare = vi.fn().mockResolvedValue(jsonResponse(200, [cohorteListItem()]))
    expect(await fetchCohortes(bare)).toEqual([cohorteListItem()])
    expect(bare.mock.calls[0][0]).toBe('api/etablissement/cohortes')

    const wrapped = vi.fn().mockResolvedValue(jsonResponse(200, { cohortes: [cohorteListItem({ id: 8 })] }))
    expect((await fetchCohortes(wrapped)).map((c) => c.id)).toEqual([8])

    const garbage = vi.fn().mockResolvedValue(jsonResponse(200, { autre: true }))
    expect(await fetchCohortes(garbage)).toEqual([])
  })

  it('UC-ETA-01-U09 — createCohorte : POST {nom} en JSON avec le jeton CSRF de la session', async () => {
    await primeCsrf()
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(201, { id: 8, codeInvitation: 'NOUVCODE42' }))

    const created = await createCohorte('CAP Cuisine', fetchFn)

    expect(created).toEqual({ id: 8, codeInvitation: 'NOUVCODE42' })
    const [url, init] = fetchFn.mock.calls[0]
    expect(url).toBe('api/etablissement/cohortes')
    expect(init.method).toBe('POST')
    expect(init.headers['X-CSRF-Token']).toBe(CSRF)
    expect(JSON.parse(init.body)).toEqual({ nom: 'CAP Cuisine' })
  })

  it('UC-ETA-01-U10 — fetchCohorte normalise le détail À PLAT de l’API (membres, dépôt, avancement)', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(200, cohorteDetail()))

    const { cohorte, membres } = await fetchCohorte(7, fetchFn)

    expect(fetchFn.mock.calls[0][0]).toBe('api/etablissement/cohortes/7')
    expect(cohorte).toEqual({ id: 7, nom: 'BTS SIO 2026', codeInvitation: 'COHORTE7AZ' })
    expect(membres).toEqual([
      {
        userId: 12,
        displayName: 'Maya',
        email: null,
        consentAt: '2026-07-02T10:00:00',
        portfolio: { titre: 'Journal Astrolabe', journees: 3, taille: 9000, deposeLe: '2026-07-03T10:00:00' },
        avancement: { jobsTotal: 0, jobsDone: 0 },
      },
      {
        userId: 13,
        displayName: 'Noé',
        email: null,
        consentAt: '2026-07-02T11:00:00',
        portfolio: null,
        avancement: { jobsTotal: 0, jobsDone: 0 },
      },
    ])
  })

  it('UC-ETA-01-U11 — deleteCohorte : DELETE avec CSRF, 204 → null ; 404 → erreur « Cohorte introuvable »', async () => {
    await primeCsrf()
    const ok = vi.fn().mockResolvedValue(noContent())
    expect(await deleteCohorte(7, ok)).toBeNull()
    expect(ok.mock.calls[0][0]).toBe('api/etablissement/cohortes/7')
    expect(ok.mock.calls[0][1].method).toBe('DELETE')
    expect(ok.mock.calls[0][1].headers['X-CSRF-Token']).toBe(CSRF)

    const missing = vi.fn().mockResolvedValue(jsonResponse(404, { error: 'Cohorte introuvable' }))
    await expect(deleteCohorte(7, missing)).rejects.toMatchObject({ status: 404, message: 'Cohorte introuvable' })
  })

  it('UC-ETA-01-U12 — frDate : date ISO → jj/mm/aaaa, vide → « — », illisible → rendue telle quelle', () => {
    expect(frDate('2026-07-01T10:00:00')).toBe('01/07/2026')
    expect(frDate('')).toBe('—')
    expect(frDate(null)).toBe('—')
    expect(frDate('pas une date')).toBe('pas une date')
  })
})
