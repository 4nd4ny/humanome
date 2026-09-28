// UC-ADM-02 — Gérer le Golden Prompt et ses accès : tests UNITAIRES (front).
// Fiche : docs/cas-utilisation/administration/UC-ADM-02-gerer-golden-prompt.md
//
// Client de l'API d'administration appelé directement (couture fetchFn) :
// liste, import (enveloppe {document}, jeton CSRF de session), autorisation,
// et formatage des dates d'autorisation.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, fetchMe, resetApiClient } from '../../../src/api/client.js'
import { fetchGolden, frDate, grantGolden, importGolden } from '../../../src/views/admin/admin-api.js'
import pkgFixture from '../../../../schemas/fixtures/prompt-package-exemple.json'
import { ADMIN, jsonResponse } from '../support/banc.js'

afterEach(() => resetApiClient())

/** Ouvre la « session » admin : le jeton CSRF est retenu en mémoire du module. */
async function sessionAdmin() {
  await fetchMe({ fetchFn: vi.fn(async () => jsonResponse(200, { user: ADMIN, csrfToken: 'csrf-admin' })) })
}

describe('UC-ADM-02 — client d’administration du Golden Prompt', () => {
  it('UC-ADM-02-U07 — fetchGolden : GET api/admin/golden, tableau garanti', async () => {
    const liste = [{ id: 'golden-reference', packageId: 4, description: null, versions: ['1.0.0'], grants: [] }]
    const fetchFn = vi.fn(async () => jsonResponse(200, liste))
    expect(await fetchGolden(fetchFn)).toEqual(liste)
    expect(fetchFn.mock.calls[0][0]).toBe('api/admin/golden')
    expect(fetchFn.mock.calls[0][1].method).toBe('GET')
    expect(await fetchGolden(vi.fn(async () => jsonResponse(200, { inattendu: true })))).toEqual([])
  })

  it('UC-ADM-02-U08 — importGolden : POST {document} avec le jeton CSRF de la session admin', async () => {
    await sessionAdmin()
    const fetchFn = vi.fn(async () => jsonResponse(201, { status: 'imported', id: 'golden-reference', version: '1.0.0' }))
    const doc = { ...pkgFixture, id: 'golden-reference' }

    const result = await importGolden(doc, fetchFn)

    expect(result.status).toBe('imported')
    const [url, init] = fetchFn.mock.calls[0]
    expect(url).toBe('api/admin/golden')
    expect(init.method).toBe('POST')
    expect(init.headers['X-CSRF-Token']).toBe('csrf-admin')
    expect(JSON.parse(init.body)).toEqual({ document: doc })
  })

  it('UC-ADM-02-U09 — grantGolden : POST …/{id encodé}/grant {userId} ; refus serveur → ApiError au message français', async () => {
    await sessionAdmin()
    const ok = vi.fn(async () => jsonResponse(200, { status: 'granted', id: 'golden reference', userId: 7 }))
    await grantGolden('golden reference', 7, ok)
    expect(ok.mock.calls[0][0]).toBe('api/admin/golden/golden%20reference/grant')
    expect(JSON.parse(ok.mock.calls[0][1].body)).toEqual({ userId: 7 })

    const refus = vi.fn(async () =>
      jsonResponse(422, { error: 'L\'accès au Golden Prompt ne peut être accordé qu\'à un compte promptologue' }),
    )
    const error = await grantGolden('golden-reference', 3, refus).catch((e) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error.status).toBe(422)
    expect(error.message).toBe('L\'accès au Golden Prompt ne peut être accordé qu\'à un compte promptologue')
  })

  it('UC-ADM-02-U10 — frDate : date d’autorisation au format français, repli sûr', () => {
    expect(frDate('2026-07-10T09:30:00')).toBe('10/07/2026')
    expect(frDate('')).toBe('—')
    expect(frDate(null)).toBe('—')
    expect(frDate('pas une date')).toBe('pas une date')
  })
})
