// UC-ADM-01 — Gérer les comptes et les rôles : tests FONCTIONNELS (IHM).
// Fiche : docs/cas-utilisation/administration/UC-ADM-01-gerer-comptes-roles.md
//
// Le scénario est joué sur l'application ENTIÈRE (<App/>) : l'administrateur
// ouvre #/admin/roles, cherche un compte, attribue et retire des rôles. Seul
// le réseau est simulé, par un faux serveur d'administration en mémoire
// (web/test/usecases/support/adm.js) qui applique les mêmes règles que l'API
// (CSRF, anti-verrouillage 409, 404, 422) ; le module sunburst est le faux
// module de test.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import App from '../../../src/App.jsx'
import { resetApiClient } from '../../../src/api/client.js'
import * as fakeLib from '../../../src/test/fake-sunburst-lib.js'
import { ADMIN_USER, CSRF, callsTo, createAdminBackend, jsonResponse } from '../support/adm.js'

const MAYA = { id: 5, email: 'maya@example.org', displayName: 'Maya', roles: ['apprenant'] }
const BRUNO = { id: 6, email: 'bruno@example.org', displayName: 'Bruno Martin', roles: ['apprenant', 'cartographe'] }

function openAdmin(backend, hash = '#/admin/roles') {
  vi.stubGlobal('fetch', backend.fetchMock)
  window.location.hash = hash
  render(<App lib={fakeLib} />)
}

/** Ligne du tableau d'un compte (le nom peut aussi figurer dans l'en-tête du shell). */
const rowOf = (name) => screen.getAllByText(name).map((el) => el.closest('tr')).find(Boolean)

beforeEach(() => resetApiClient())

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  window.location.hash = ''
  resetApiClient()
})

describe('UC-ADM-01 — l’administrateur gère les comptes et les rôles', () => {
  it('UC-ADM-01-F13 — nominal : liste, recherche puis attribution d’un rôle (POST + CSRF, rechargement, message)', async () => {
    const backend = createAdminBackend({ users: [{ ...ADMIN_USER }, MAYA, BRUNO] })
    openAdmin(backend)

    expect(await screen.findByRole('heading', { name: 'Comptes et rôles' })).toBeDefined()
    await screen.findByText('Maya')
    expect(screen.getByText('3 comptes.')).toBeDefined()
    // Le menu du shell propose la famille « Administrer » à ce compte.
    expect(screen.getAllByRole('link', { name: 'Rôles et comptes', hidden: true }).length).toBeGreaterThan(0)

    // 4. Recherche.
    fireEvent.change(screen.getByLabelText('Rechercher un compte (e-mail ou nom)'), { target: { value: 'maya' } })
    fireEvent.click(screen.getByRole('button', { name: 'Rechercher' }))
    await waitFor(() => expect(screen.queryByText('Bruno Martin')).toBeNull())
    expect(screen.getByText('1 compte pour « maya ».')).toBeDefined()

    // 5. Attribution.
    const row = within(rowOf('Maya'))
    fireEvent.change(row.getByLabelText('Rôle à attribuer à maya@example.org'), { target: { value: 'cartographe' } })
    await act(async () => {
      fireEvent.click(row.getByRole('button', { name: 'Attribuer' }))
    })

    expect(await screen.findByText('Rôle « cartographe » attribué.')).toBeDefined()
    const [post] = callsTo(backend.calls, 'POST', 'api/admin/users/5/roles')
    expect(post.init.headers['X-CSRF-Token']).toBe(CSRF)
    expect(JSON.parse(post.init.body)).toEqual({ role: 'cartographe' })
    // 6. Liste rechargée : la puce du nouveau rôle apparaît.
    await waitFor(() => expect(within(rowOf('Maya')).getByText('cartographe', { selector: 'li span' })).toBeDefined())
    expect(backend.state.users.find((u) => u.id === 5).roles).toEqual(['apprenant', 'cartographe'])
  })

  it('UC-ADM-01-F14 — nominal (retrait) : la croix retire le rôle (DELETE) et la puce disparaît', async () => {
    const backend = createAdminBackend({ users: [{ ...ADMIN_USER }, BRUNO] })
    openAdmin(backend)
    await screen.findByText('Bruno Martin')

    await act(async () => {
      fireEvent.click(within(rowOf('Bruno Martin')).getByRole('button', { name: 'Retirer le rôle cartographe de bruno@example.org' }))
    })

    expect(await screen.findByText('Rôle « cartographe » retiré.')).toBeDefined()
    expect(callsTo(backend.calls, 'DELETE', 'api/admin/users/6/roles/cartographe')).toHaveLength(1)
    await waitFor(() =>
      expect(within(rowOf('Bruno Martin')).queryByText('cartographe', { selector: 'li span' })).toBeNull(),
    )
  })

  it('UC-ADM-01-F15 — E5 : anti-verrouillage — cadenas à la place de la croix sur son propre rôle admin', async () => {
    const other = { id: 9, email: 'root2@example.org', displayName: 'Second Admin', roles: ['admin'] }
    const backend = createAdminBackend({ users: [{ ...ADMIN_USER, roles: ['admin', 'apprenant'] }, other] })
    openAdmin(backend)
    await screen.findByText('Second Admin')

    const mine = within(rowOf('Root Admin'))
    expect(mine.queryByRole('button', { name: /Retirer le rôle admin/ })).toBeNull()
    expect(mine.getByTitle(/anti-verrouillage/i).textContent).toBe("🔒")
    // Ses autres rôles et l'admin d'un AUTRE compte restent retirables (A4).
    expect(mine.getByRole('button', { name: 'Retirer le rôle apprenant de root@example.org' })).toBeDefined()
    expect(within(rowOf('Second Admin')).getByRole('button', { name: 'Retirer le rôle admin de root2@example.org' })).toBeDefined()
  })

  it('UC-ADM-01-F16 — E4 : compte supprimé entre-temps → le message du serveur « Compte introuvable » s’affiche', async () => {
    const backend = createAdminBackend({ users: [{ ...ADMIN_USER }, MAYA] })
    openAdmin(backend)
    await screen.findByText('Maya')
    backend.state.users = backend.state.users.filter((u) => u.id !== 5) // purge concurrente

    const row = within(rowOf('Maya'))
    fireEvent.change(row.getByLabelText('Rôle à attribuer à maya@example.org'), { target: { value: 'employeur' } })
    await act(async () => {
      fireEvent.click(row.getByRole('button', { name: 'Attribuer' }))
    })

    expect((await screen.findByRole('alert')).textContent).toBe('Compte introuvable')
  })

  it('UC-ADM-01-F17 — A3 : plus de 20 comptes → pagination, « Suivant » charge la page 2', async () => {
    const many = Array.from({ length: 23 }, (_, i) => ({
      id: 100 + i,
      email: `compte${String(i).padStart(2, '0')}@example.org`,
      displayName: `Compte ${String(i).padStart(2, '0')}`,
      roles: ['apprenant'],
    }))
    const backend = createAdminBackend({ users: [{ ...ADMIN_USER }, ...many] })
    openAdmin(backend)
    await screen.findByText('Compte 00')
    expect(screen.getByText('Page 1 / 2')).toBeDefined()

    fireEvent.click(screen.getByRole('button', { name: 'Suivant' }))

    expect(await screen.findByText('Compte 22')).toBeDefined()
    expect(screen.queryByText('Compte 00')).toBeNull()
    expect(callsTo(backend.calls, 'GET', 'api/admin/users?page=2')).toHaveLength(1)
  })

  it('UC-ADM-01-F18 — E1 : visiteur sans session → espace réservé + invitation à se connecter, aucune liste demandée', async () => {
    const backend = createAdminBackend({ me: null })
    openAdmin(backend)

    expect(await screen.findByTestId('admin-reserve')).toBeDefined()
    expect(screen.getByText('Cet espace est réservé à l’administration de la plateforme.')).toBeDefined()
    expect(screen.getByRole('link', { name: 'Connectez-vous' }).getAttribute('href')).toBe('#/compte')
    expect(callsTo(backend.calls, 'GET', 'api/admin/users')).toHaveLength(0)
  })

  it('UC-ADM-01-F19 — E2 : compte connecté sans rôle admin → espace réservé, section non rendue, aucune liste demandée', async () => {
    const backend = createAdminBackend({ me: { ...MAYA, roles: ['apprenant', 'cartographe', 'etablissement'] } })
    openAdmin(backend)

    expect(await screen.findByTestId('admin-reserve')).toBeDefined()
    expect(screen.getByTestId('admin-connecte').textContent).toContain('Maya')
    expect(screen.queryByRole('heading', { name: 'Comptes et rôles' })).toBeNull()
    expect(callsTo(backend.calls, 'GET', 'api/admin/users')).toHaveLength(0)
  })

  it('UC-ADM-01-F20 — E6 : jeton CSRF perdu (mémoire effacée) → POST sans X-CSRF-Token refusé par le serveur, message affiché, aucune mutation', async () => {
    // Aucun override : c'est le faux serveur qui applique la garde CSRF
    // (support/adm.js), comme le middleware global de l'API.
    const backend = createAdminBackend({ users: [{ ...ADMIN_USER }, MAYA] })
    openAdmin(backend)
    await screen.findByText('Maya')
    resetApiClient() // jeton CSRF en mémoire perdu (ex. module rechargé)

    const row = within(rowOf('Maya'))
    fireEvent.change(row.getByLabelText('Rôle à attribuer à maya@example.org'), { target: { value: 'employeur' } })
    await act(async () => {
      fireEvent.click(row.getByRole('button', { name: 'Attribuer' }))
    })

    expect((await screen.findByRole('alert')).textContent).toBe('Jeton CSRF absent ou invalide')
    const [post] = callsTo(backend.calls, 'POST', 'api/admin/users/5/roles')
    expect(post.init.headers['X-CSRF-Token']).toBeUndefined()
    expect(backend.state.users.find((u) => u.id === 5).roles).toEqual(['apprenant'])
    expect(within(rowOf('Maya')).queryByText('employeur', { selector: 'li span' })).toBeNull()
  })

  it('UC-ADM-01-F21 — E7 : API injoignable (copie statique) → message explicite, pas de section', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch')
      }),
    )
    window.location.hash = '#/admin/roles'
    render(<App lib={fakeLib} />)

    expect(await screen.findByText(/Copie statique du site : l’administration a besoin de l’API/)).toBeDefined()
    expect(screen.queryByRole('heading', { name: 'Comptes et rôles' })).toBeNull()
  })

  it('UC-ADM-01-F23 — E8 : chargement de la liste refusé (rôle admin retiré entre-temps) → alerte portant le message serveur, pas de tableau', async () => {
    const backend = createAdminBackend({
      users: [{ ...ADMIN_USER }, MAYA],
      routes: { 'GET api/admin/users': jsonResponse(403, { error: 'Rôle insuffisant' }) },
    })
    openAdmin(backend)

    expect((await screen.findByRole('alert')).textContent).toBe('Rôle insuffisant')
    expect(screen.getByRole('heading', { name: 'Comptes et rôles' })).toBeDefined()
    expect(screen.queryByRole('table')).toBeNull()
    expect(screen.queryByText('Maya')).toBeNull()
  })

  it('UC-ADM-01-F24 — étape 4 et A6 : une recherche lancée depuis la page 2 repart en page 1 ; aucun résultat → « Aucun compte ne correspond. »', async () => {
    const many = Array.from({ length: 23 }, (_, i) => ({
      id: 100 + i,
      email: `compte${String(i).padStart(2, '0')}@example.org`,
      displayName: `Compte ${String(i).padStart(2, '0')}`,
      roles: ['apprenant'],
    }))
    const backend = createAdminBackend({ users: [{ ...ADMIN_USER }, ...many] })
    openAdmin(backend)
    await screen.findByText('Compte 00')
    fireEvent.click(screen.getByRole('button', { name: 'Suivant' }))
    await screen.findByText('Page 2 / 2')

    fireEvent.change(screen.getByLabelText('Rechercher un compte (e-mail ou nom)'), { target: { value: 'compte0' } })
    fireEvent.click(screen.getByRole('button', { name: 'Rechercher' }))

    expect(await screen.findByText('10 comptes pour « compte0 ».')).toBeDefined()
    expect(callsTo(backend.calls, 'GET', 'api/admin/users?query=compte0')).toHaveLength(1)
    expect(callsTo(backend.calls, 'GET', 'api/admin/users?query=compte0')[0].url).toBe('api/admin/users?query=compte0')
    expect(screen.queryByText(/^Page /)).toBeNull()

    fireEvent.change(screen.getByLabelText('Rechercher un compte (e-mail ou nom)'), { target: { value: 'zzz' } })
    fireEvent.click(screen.getByRole('button', { name: 'Rechercher' }))
    expect(await screen.findByText('Aucun compte ne correspond.')).toBeDefined()
    expect(screen.getByText('0 compte pour « zzz ».')).toBeDefined()
    expect(screen.queryByRole('table')).toBeNull()
  })
})

describe('UC-ADM-01 — section inconnue de l’administration (E9)', () => {
  it('UC-ADM-01-F25 — E9 : #/admin/r%C3%B4les → alerte citant le segment décodé, onglets sans section active, lien de retour ; aucun appel api/admin ; la garde de rôle passe avant', async () => {
    // Session : le shell la reçoit par fetchMeFn (menu), AdminView la vérifie
    // elle-même par GET api/auth/me (faux serveur) — défense en profondeur.
    const backend = createAdminBackend({ users: [{ ...ADMIN_USER }, MAYA] })
    vi.stubGlobal('fetch', backend.fetchMock)
    window.location.hash = '#/admin/r%C3%B4les' // « rôles » accentué : pas la section « roles »
    render(<App lib={fakeLib} fetchMeFn={async () => ({ user: ADMIN_USER })} />)

    expect((await screen.findByRole('alert')).textContent).toBe('Section inconnue de l’administration : « rôles ».')
    expect(screen.getByRole('link', { name: 'Retour à l’accueil de l’administration' }).getAttribute('href')).toBe(
      '#/admin',
    )
    // Onglets affichés (admin + section non nulle), aucun marqué comme courant.
    const tabs = screen.getByRole('navigation', { name: 'Sections d’administration' })
    expect(within(tabs).getByRole('link', { name: 'Rôles' }).getAttribute('aria-current')).toBeNull()
    expect(tabs.querySelector('[aria-current]')).toBeNull()
    // Aucune section montée : ni « Comptes et rôles », ni cartes d'accueil.
    expect(screen.queryByRole('heading', { name: 'Comptes et rôles' })).toBeNull()
    expect(screen.queryByRole('link', { name: /Golden Prompt Import privé/ })).toBeNull()
    await act(async () => {})
    expect(backend.calls.map((c) => `${c.method} ${c.url}`)).toEqual(['GET api/auth/me'])

    // Le lien de retour ramène à l'accueil (cartes des sections), sans nouvelle
    // vérification de session (même AdminView, fetchMe inchangé).
    await act(async () => {
      fireEvent.click(screen.getByRole('link', { name: 'Retour à l’accueil de l’administration' }))
    })
    await waitFor(() => expect(window.location.hash).toBe('#/admin'))
    expect(await screen.findByRole('link', { name: /Golden Prompt Import privé/ })).toBeDefined()
    expect(screen.queryByText(/Section inconnue/)).toBeNull()
    expect(callsTo(backend.calls, 'GET', 'api/auth/me')).toHaveLength(1)
    cleanup()
    vi.unstubAllGlobals()

    // Compte sans rôle admin sur la même URL : la garde passe AVANT le
    // dispatch → espace réservé, jamais le message de section inconnue.
    const other = createAdminBackend({ me: MAYA, users: [MAYA] })
    vi.stubGlobal('fetch', other.fetchMock)
    window.location.hash = '#/admin/r%C3%B4les'
    render(<App lib={fakeLib} fetchMeFn={async () => ({ user: MAYA })} />)
    expect(await screen.findByTestId('admin-reserve')).toBeDefined()
    expect(screen.queryByText(/Section inconnue/)).toBeNull()
    expect(screen.queryByRole('navigation', { name: 'Sections d’administration' })).toBeNull()
    expect(other.calls.map((c) => `${c.method} ${c.url}`)).toEqual(['GET api/auth/me'])
    cleanup()
    vi.unstubAllGlobals()

    // Comportement ACTUEL (anomalie AN1 de UC-VIS-02, commune aux routes à
    // section) : un segment au pourcentage mal formé n'atteint pas ce repli.
    // App calcule sa route au premier rendu (useState(currentRoute)) : le
    // rendu lui-même lève une URIError — ni shell, ni sonde de session.
    const broken = createAdminBackend({ users: [{ ...ADMIN_USER }] })
    vi.stubGlobal('fetch', broken.fetchMock)
    const shellMe = vi.fn(async () => ({ user: ADMIN_USER }))
    window.location.hash = '#/admin/100%'
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      expect(() => render(<App lib={fakeLib} fetchMeFn={shellMe} />)).toThrow(URIError)
    } finally {
      consoleError.mockRestore()
    }
    expect(document.body.textContent).toBe('')
    expect(shellMe).not.toHaveBeenCalled()
    expect(broken.calls).toEqual([])
  })
})
