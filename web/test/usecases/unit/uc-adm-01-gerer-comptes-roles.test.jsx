// UC-ADM-01 — Gérer les comptes et les rôles : tests UNITAIRES (front).
// Fiche : docs/cas-utilisation/administration/UC-ADM-01-gerer-comptes-roles.md
//
// Code sollicité appelé directement : le routeur par hash (#/admin/roles), la
// navigation adaptée au rôle (famille « Administrer »), les appels de
// admin-api.js (liste, attribution, retrait — URL, méthode, corps, jeton CSRF)
// et la pagination du composant RolesSection rendu isolément.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { parseHash } from '../../../src/router.js'
import { navGroups } from '../../../src/nav.js'
import { apiFetch, fetchMe, resetApiClient } from '../../../src/api/client.js'
import {
  ASSIGNABLE_ROLES,
  frDate,
  grantRole,
  listUsers,
  revokeRole,
} from '../../../src/views/admin/admin-api.js'
import RolesSection from '../../../src/views/admin/RolesSection.jsx'

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

/** Ouvre une « session » côté client : le jeton CSRF est gardé en mémoire. */
async function withCsrf(token = 'csrf-admin') {
  await fetchMe({ fetchFn: async () => jsonResponse(200, { user: { id: 1, roles: ['admin'] }, csrfToken: token }) })
}

describe('UC-ADM-01 — accès à la section', () => {
  it('UC-ADM-01-U13 — #/admin/roles ouvre la route « admin », section « roles » ; #/admin l’accueil', () => {
    expect(parseHash('#/admin/roles')).toEqual({ name: 'admin', section: 'roles' })
    expect(parseHash('#/admin')).toEqual({ name: 'admin', section: null })
  })

  it('UC-ADM-01-U14 — la famille de menu « Administrer » n’apparaît qu’avec le rôle admin', () => {
    const admin = navGroups({ roles: ['admin'] }).find((g) => g.id === 'administrer')
    expect(admin).toBeDefined()
    expect(admin.items.map((i) => i.href)).toContain('#/admin/roles')

    for (const roles of [[], ['apprenant', 'cartographe', 'promptologue', 'epistemiarque', 'etablissement']]) {
      expect(navGroups({ roles }).some((g) => g.id === 'administrer')).toBe(false)
    }
  })
})

describe('UC-ADM-01 — client admin-api.js', () => {
  it('UC-ADM-01-U15 — listUsers : query, page > 1 et role en paramètres ; réponse normalisée', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(200, { users: [{ id: 3 }], total: 21, page: 2, pageSize: 20 }))

    const result = await listUsers({ query: 'dupond', page: 2, role: 'cartographe' }, fetchFn)

    expect(fetchFn.mock.calls[0][0]).toBe('api/admin/users?query=dupond&page=2&role=cartographe')
    expect(fetchFn.mock.calls[0][1].method).toBe('GET')
    expect(result).toEqual({ users: [{ id: 3 }], total: 21, page: 2, pageSize: 20 })

    // Page 1 et filtres vides : aucune query string ; corps partiel -> défauts.
    fetchFn.mockResolvedValue(jsonResponse(200, {}))
    expect(await listUsers({}, fetchFn)).toEqual({ users: [], total: 0, page: 1, pageSize: 20 })
    expect(fetchFn.mock.calls[1][0]).toBe('api/admin/users')
  })

  it('UC-ADM-01-U16 — grantRole : POST {role} en JSON avec le jeton CSRF de la session', async () => {
    await withCsrf('jeton-123')
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(200, { id: 5, role: 'cartographe', status: 'granted' }))

    const data = await grantRole(5, 'cartographe', fetchFn)

    expect(data.status).toBe('granted')
    const [url, init] = fetchFn.mock.calls[0]
    expect(url).toBe('api/admin/users/5/roles')
    expect(init.method).toBe('POST')
    expect(init.headers['X-CSRF-Token']).toBe('jeton-123')
    expect(JSON.parse(init.body)).toEqual({ role: 'cartographe' })
  })

  it('UC-ADM-01-U17 — revokeRole : DELETE, rôle encodé dans l’URL, jeton CSRF ; 409 -> ApiError porteuse du message serveur', async () => {
    await withCsrf('jeton-456')
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(200, { status: 'revoked' }))

    await revokeRole(7, 'a/b', fetchFn)
    expect(fetchFn.mock.calls[0][0]).toBe('api/admin/users/7/roles/a%2Fb')
    expect(fetchFn.mock.calls[0][1].method).toBe('DELETE')
    expect(fetchFn.mock.calls[0][1].headers['X-CSRF-Token']).toBe('jeton-456')
    expect(fetchFn.mock.calls[0][1].body).toBeUndefined()

    const message = 'Un administrateur ne peut pas retirer son propre rôle admin (anti-verrouillage)'
    fetchFn.mockResolvedValue(jsonResponse(409, { error: message }))
    const failure = await revokeRole(1, 'admin', fetchFn).catch((e) => e)
    expect(failure.status).toBe(409)
    expect(failure.message).toBe(message)
  })

  it('UC-ADM-01-U18 — rôles attribuables = les 7 rôles du §2 (jamais « visiteur ») ; frDate tolère le vide', () => {
    expect(ASSIGNABLE_ROLES).toEqual([
      'apprenant',
      'cartographe',
      'promptologue',
      'epistemiarque',
      'employeur',
      'etablissement',
      'admin',
    ])
    expect(ASSIGNABLE_ROLES).not.toContain('visiteur')
    expect(frDate('')).toBe('—')
    expect(frDate(null)).toBe('—')
    expect(frDate('pas-une-date')).toBe('pas-une-date')
    expect(frDate('2026-02-01T09:00:00')).toBe(new Date('2026-02-01T09:00:00').toLocaleDateString('fr-FR'))
  })
})

describe('UC-ADM-01 — composant RolesSection isolé', () => {
  it('UC-ADM-01-U19 — pagination : « Page 1 / 3 », Suivant charge page=2, Précédent désactivé en page 1', async () => {
    const page = (n) => ({
      users: [{ id: 100 + n, email: `p${n}@b.fr`, displayName: `Compte page ${n}`, createdAt: '', roles: [] }],
      total: 45,
      page: n,
      pageSize: 20,
    })
    const fetchFn = vi.fn(async (url) => {
      if (url === 'api/admin/users') return jsonResponse(200, page(1))
      if (url === 'api/admin/users?page=2') return jsonResponse(200, page(2))
      throw new Error(`route non mockée : ${url}`)
    })
    render(<RolesSection currentUserId={1} fetchFn={fetchFn} />)

    await screen.findByText('Compte page 1')
    expect(screen.getByText('Page 1 / 3')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Précédent' }).disabled).toBe(true)
    expect(screen.getByText('45 comptes.')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Suivant' }))
    await screen.findByText('Compte page 2')
    expect(screen.getByText('Page 2 / 3')).toBeTruthy()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Précédent' }).disabled).toBe(false))
  })

  it('UC-ADM-01-U20 — menu d’attribution : seuls les rôles manquants, bouton inactif sans choix, « aucun » sans rôle', async () => {
    const fetchFn = vi.fn(async () =>
      jsonResponse(200, {
        users: [
          { id: 5, email: 'maya@b.fr', displayName: 'Maya', createdAt: '', roles: ['apprenant', 'cartographe'] },
          { id: 6, email: 'noe@b.fr', displayName: 'Noé', createdAt: '', roles: [] },
        ],
        total: 2,
        page: 1,
        pageSize: 20,
      }),
    )
    render(<RolesSection currentUserId={1} fetchFn={fetchFn} />)
    await screen.findByText('Maya')

    const select = screen.getByLabelText('Rôle à attribuer à maya@b.fr')
    const options = [...select.querySelectorAll('option')].map((o) => o.value).filter(Boolean)
    expect(options).toEqual(['promptologue', 'epistemiarque', 'employeur', 'etablissement', 'admin'])
    expect(screen.getAllByRole('button', { name: 'Attribuer' })[0].disabled).toBe(true)
    expect(screen.getByText('aucun')).toBeTruthy()
  })

  it('UC-ADM-01-U21 — apiFetch refuse une copie statique (file:) sans appel réseau', async () => {
    const fetchFn = vi.fn()
    const failure = await apiFetch('admin/users', { fetchFn, protocol: 'file:' }).catch((e) => e)
    expect(failure.name).toBe('ApiUnavailableError')
    expect(fetchFn).not.toHaveBeenCalled()
  })
})
