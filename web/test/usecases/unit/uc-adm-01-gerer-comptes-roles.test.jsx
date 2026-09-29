// UC-ADM-01 — Gérer les comptes et les rôles : tests UNITAIRES (front).
// Fiche : docs/cas-utilisation/administration/UC-ADM-01-gerer-comptes-roles.md
//
// Code sollicité appelé directement : le routeur par hash (#/admin/roles), la
// navigation adaptée au rôle (famille « Administrer »), les appels de
// admin-api.js (liste, attribution, retrait — URL, méthode, corps, jeton CSRF)
// la pagination du composant RolesSection rendu isolément, la sonde de session
// fetchMe, la garde de rôle d'AdminView et son repli « section inconnue »
// (coutures deps.fetchMeFn/fetchFn).
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { parseHash } from '../../../src/router.js'
import { navGroups } from '../../../src/nav.js'
import {
  ApiError,
  ApiUnavailableError,
  apiFetch,
  fetchMe,
  getCsrfToken,
  resetApiClient,
} from '../../../src/api/client.js'
import {
  ASSIGNABLE_ROLES,
  frDate,
  grantRole,
  listUsers,
  revokeRole,
} from '../../../src/views/admin/admin-api.js'
import RolesSection from '../../../src/views/admin/RolesSection.jsx'
import AdminView from '../../../src/views/AdminView.jsx'

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

describe('UC-ADM-01 — session et garde de la vue', () => {
  it('UC-ADM-01-U25 — fetchMe : 200 → {user} et jeton CSRF gardé en mémoire ; 401 → {user: null} ; 500 → ApiError relancée', async () => {
    const ok = await fetchMe({ fetchFn: async () => jsonResponse(200, { user: { id: 1, roles: ['admin'] }, csrfToken: 'jeton-me' }) })
    expect(ok).toEqual({ user: { id: 1, roles: ['admin'] } })
    expect(getCsrfToken()).toBe('jeton-me')

    expect(await fetchMe({ fetchFn: async () => jsonResponse(401, { error: 'Authentification requise' }) })).toEqual({ user: null })

    const failure = await fetchMe({ fetchFn: async () => jsonResponse(500, { error: 'Erreur interne' }) }).catch((e) => e)
    expect(failure).toBeInstanceOf(ApiError)
    expect(failure.status).toBe(500)
    expect(failure.message).toBe('Erreur interne')
  })

  it('UC-ADM-01-U26 — AdminView : copie statique → message ; admin → onglets (« Rôles » aria-current) + section ; non-admin → espace réservé ; /auth/me en 5xx → traité comme « non connecté » (limite)', async () => {
    const fetchFn = vi.fn(async () => jsonResponse(200, { users: [], total: 0, page: 1, pageSize: 20 }))

    // Copie statique : ApiUnavailableError.
    render(<AdminView section="roles" deps={{ fetchMeFn: async () => Promise.reject(new ApiUnavailableError()), fetchFn }} />)
    expect(await screen.findByText(/Copie statique du site : l’administration a besoin de l’API/)).toBeTruthy()
    expect(screen.queryByRole('navigation', { name: 'Sections d’administration' })).toBeNull()
    cleanup()

    // Administrateur : onglets, section active, section rendue.
    render(
      <AdminView
        section="roles"
        deps={{ fetchMeFn: async () => ({ user: { id: 1, displayName: 'Root', roles: ['admin'] } }), fetchFn }}
      />,
    )
    expect(await screen.findByRole('heading', { name: 'Comptes et rôles' })).toBeTruthy()
    const tabs = screen.getByRole('navigation', { name: 'Sections d’administration' })
    expect(tabs.querySelector('a[aria-current="page"]').textContent).toBe('Rôles')
    expect(screen.getByTestId('admin-connecte').textContent).toBe('Connecté en tant que Root.')
    await waitFor(() => expect(fetchFn).toHaveBeenCalledWith('api/admin/users', expect.objectContaining({ method: 'GET' })))
    cleanup()

    // Connecté sans rôle admin : espace réservé, sans invitation à se connecter.
    fetchFn.mockClear()
    render(
      <AdminView section="roles" deps={{ fetchMeFn: async () => ({ user: { id: 5, displayName: 'Maya', roles: ['apprenant'] } }), fetchFn }} />,
    )
    expect(await screen.findByTestId('admin-reserve')).toBeTruthy()
    expect(screen.queryByText(/Vous n’êtes pas connecté/)).toBeNull()
    expect(fetchFn).not.toHaveBeenCalled()
    cleanup()

    // COMPORTEMENT ACTUEL (fiche, « Limites ») : toute erreur de /auth/me
    // autre qu'ApiUnavailableError (ici un 500) est affichée comme « non connecté ».
    render(<AdminView section="roles" deps={{ fetchMeFn: async () => Promise.reject(new ApiError('Erreur interne', 500)), fetchFn }} />)
    expect(await screen.findByTestId('admin-reserve')).toBeTruthy()
    expect(screen.getByText(/Vous n’êtes pas connecté/)).toBeTruthy()
    expect(fetchFn).not.toHaveBeenCalled()
  })
})

describe('UC-ADM-01 — AdminView isolée : section inconnue (E9)', () => {
  it('UC-ADM-01-U27 — AdminView : segment décodé par parseHash hors des six sections (comparaison exacte) → alerte citant le segment, lien de retour #/admin, onglets sans section courante, aucune section montée ni appel fetchFn ; non-admin → espace réservé, jamais le message', async () => {
    // Le segment arrive décodé du routeur : « r%C3%B4les » devient « rôles ».
    expect(parseHash('#/admin/r%C3%B4les')).toEqual({ name: 'admin', section: 'rôles' })

    const fetchFn = vi.fn(async () => jsonResponse(200, { users: [], total: 0, page: 1, pageSize: 20 }))
    const admin = async () => ({ user: { id: 1, displayName: 'Root', roles: ['admin'] } })
    // Comparaison exacte : casse, barre finale, sous-segment ne sont pas des sections.
    for (const section of ['rôles', 'Roles', 'roles/', 'config/app']) {
      const fetchMeFn = vi.fn(admin)
      render(<AdminView section={section} deps={{ fetchMeFn, fetchFn }} />)
      expect((await screen.findByRole('alert')).textContent, section).toBe(
        `Section inconnue de l’administration : « ${section} ».`,
      )
      expect(screen.getByRole('link', { name: 'Retour à l’accueil de l’administration' }).getAttribute('href')).toBe('#/admin')
      const tabs = screen.getByRole('navigation', { name: 'Sections d’administration' })
      expect(tabs.querySelectorAll('a'), section).toHaveLength(7) // Accueil + six sections
      expect(tabs.querySelector('[aria-current]'), section).toBeNull()
      expect(screen.getByTestId('admin-connecte').textContent).toBe('Connecté en tant que Root.')
      // Aucune section montée : ni « Comptes et rôles », ni cartes d'accueil.
      expect(screen.queryByRole('heading', { name: 'Comptes et rôles' })).toBeNull()
      expect(document.querySelector('.admin-home')).toBeNull()
      await act(async () => {})
      expect(fetchMeFn).toHaveBeenCalledTimes(1)
      expect(fetchFn, section).not.toHaveBeenCalled()
      cleanup()
    }

    // La garde passe avant l'aiguillage : compte sans rôle admin → espace réservé.
    render(
      <AdminView section="rôles" deps={{ fetchMeFn: async () => ({ user: { id: 5, displayName: 'Maya', roles: ['apprenant'] } }), fetchFn }} />,
    )
    expect(await screen.findByTestId('admin-reserve')).toBeTruthy()
    expect(screen.queryByText(/Section inconnue/)).toBeNull()
    expect(screen.queryByRole('navigation', { name: 'Sections d’administration' })).toBeNull()
    expect(fetchFn).not.toHaveBeenCalled()
  })
})
