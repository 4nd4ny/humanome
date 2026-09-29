// UC-ADM-02 — Gérer le Golden Prompt et ses accès : tests UNITAIRES (front).
// Fiche : docs/cas-utilisation/administration/UC-ADM-02-gerer-golden-prompt.md
//
// Client de l'API d'administration appelé directement (couture fetchFn) :
// liste, import (enveloppe {document}, jeton CSRF de session), autorisation,
// et formatage des dates d'autorisation ; composants rendus SEULS, sans
// l'application (createElement : ce fichier n'est pas en JSX) — section
// GoldenSection (validation locale, bouton, messages) et garde de rôle
// d'AdminView.
import { createElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { ApiError, ApiUnavailableError, fetchMe, resetApiClient } from '../../../src/api/client.js'
import { fetchGolden, frDate, grantGolden, importGolden } from '../../../src/views/admin/admin-api.js'
import GoldenSection from '../../../src/views/admin/GoldenSection.jsx'
import AdminView from '../../../src/views/AdminView.jsx'
import pkgFixture from '../../../../schemas/fixtures/prompt-package-exemple.json'
import { ADMIN, PROMPTOLOGUE, jsonResponse } from '../support/banc.js'

afterEach(() => {
  cleanup()
  resetApiClient()
})

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

describe('UC-ADM-02 — composants rendus seuls', () => {
  it('UC-ADM-02-U11 — GoldenSection : bouton inactif sur zone vide ou blanche, JSON illisible refusé sans requête, messages « importé » / « inchangé »', async () => {
    const reponses = [
      jsonResponse(200, []), // montage
      jsonResponse(200, { status: 'unchanged', id: 'golden-reference', version: '1.0.0' }),
      jsonResponse(200, [{ id: 'golden-reference', packageId: 4, description: null, versions: ['1.0.0'], grants: [] }]),
    ]
    const fetchFn = vi.fn(async () => reponses.shift())
    render(createElement(GoldenSection, { fetchFn }))
    expect(await screen.findByText('Aucun Golden Prompt importé pour l’instant.')).toBeDefined()
    const zone = screen.getByLabelText('Document prompt-package (JSON)')
    const bouton = screen.getByRole('button', { name: 'Importer' })
    expect(bouton.disabled).toBe(true)
    fireEvent.change(zone, { target: { value: '   \n  ' } })
    expect(bouton.disabled).toBe(true) // blanc seulement

    fireEvent.change(zone, { target: { value: '{"id": ' } })
    expect(bouton.disabled).toBe(false)
    await act(async () => {
      fireEvent.click(bouton)
    })
    expect(screen.getByRole('alert').textContent).toBe('Le document collé n’est pas un JSON valide.')
    expect(fetchFn).toHaveBeenCalledTimes(1) // le seul GET du montage

    fireEvent.change(zone, { target: { value: JSON.stringify({ ...pkgFixture, id: 'golden-reference' }) } })
    await act(async () => {
      fireEvent.click(bouton)
    })
    expect(await screen.findByText('Golden « golden-reference » 1.0.0 déjà présent, inchangé.')).toBeDefined()
    expect(fetchFn.mock.calls[1][0]).toBe('api/admin/golden')
    expect(fetchFn.mock.calls[1][1].method).toBe('POST')
    expect(zone.value).toBe('') // formulaire vidé, liste rechargée
    expect(fetchFn).toHaveBeenCalledTimes(3)
  })

  it('UC-ADM-02-U12 — AdminView : garde de rôle (non-admin : espace réservé, section non rendue) ; copie statique : l’administration a besoin de l’API', async () => {
    const fetchFn = vi.fn()
    render(createElement(AdminView, { section: 'golden', deps: { fetchMeFn: vi.fn(async () => ({ user: PROMPTOLOGUE })), fetchFn } }))
    expect((await screen.findByTestId('admin-reserve')).textContent).toContain('réservé à l’administration de la plateforme')
    expect(screen.queryByLabelText('Document prompt-package (JSON)')).toBeNull()
    expect(fetchFn).not.toHaveBeenCalled()
    cleanup()

    render(createElement(AdminView, { section: 'golden', deps: { fetchMeFn: vi.fn(async () => Promise.reject(new ApiUnavailableError())), fetchFn } }))
    expect((await screen.findByText(/Copie statique du site : l’administration a besoin de l’API/)).textContent).toContain('Rendez-vous sur le site en ligne')
    expect(fetchFn).not.toHaveBeenCalled()
    cleanup()

    // Administrateur : la section Golden est rendue et charge sa liste.
    const liste = vi.fn(async () => jsonResponse(200, []))
    render(createElement(AdminView, { section: 'golden', deps: { fetchMeFn: vi.fn(async () => ({ user: ADMIN })), fetchFn: liste } }))
    expect(await screen.findByText('Aucun Golden Prompt importé pour l’instant.')).toBeDefined()
    expect(liste.mock.calls[0][0]).toBe('api/admin/golden')
  })
})
