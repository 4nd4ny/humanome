import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import AccountView from './AccountView.jsx'
import { resetApiClient } from '../api/client.js'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
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

function noContentResponse() {
  return { ok: true, status: 204, headers: { get: () => null }, json: async () => null }
}

/** Installe un fetch global factice et le retourne (AccountView utilise le client réel). */
function stubFetch(...responses) {
  const fetchFn = vi.fn()
  for (const response of responses) {
    if (response instanceof Error) fetchFn.mockRejectedValueOnce(response)
    else fetchFn.mockResolvedValueOnce(response)
  }
  vi.stubGlobal('fetch', fetchFn)
  return fetchFn
}

const alice = { email: 'alice@exemple.fr', displayName: 'Alice', roles: ['apprenant'] }

describe('AccountView — non connecté', () => {
  it('propose Connexion / Inscription après un 401 sur auth/me', async () => {
    stubFetch(jsonResponse(401, { error: 'Authentification requise' }))
    render(<AccountView />)

    expect(await screen.findByRole('button', { name: 'Se connecter' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'Inscription' })).toBeDefined()
    expect(screen.getByLabelText('Email')).toBeDefined()
    expect(screen.getByLabelText(/Mot de passe/)).toBeDefined()
  })

  it('affiche « Email ou mot de passe incorrect » sur un login 401', async () => {
    stubFetch(
      jsonResponse(401, { error: 'Authentification requise' }), // auth/me
      jsonResponse(401, { error: 'Identifiants invalides' }), // auth/login
    )
    render(<AccountView />)
    await screen.findByRole('button', { name: 'Se connecter' })

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@b.fr' } })
    fireEvent.change(screen.getByLabelText(/Mot de passe/), { target: { value: 'motdepasse' } })
    fireEvent.click(screen.getByRole('button', { name: 'Se connecter' }))

    expect((await screen.findByRole('alert')).textContent).toBe(
      'Email ou mot de passe incorrect.',
    )
  })

  it('affiche le message rate-limit français sur un login 429', async () => {
    stubFetch(jsonResponse(401, { error: 'Authentification requise' }), jsonResponse(429, { error: 'Trop de tentatives de connexion, réessayez plus tard' }))
    render(<AccountView />)
    await screen.findByRole('button', { name: 'Se connecter' })

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@b.fr' } })
    fireEvent.change(screen.getByLabelText(/Mot de passe/), { target: { value: 'motdepasse' } })
    fireEvent.click(screen.getByRole('button', { name: 'Se connecter' }))

    expect((await screen.findByRole('alert')).textContent).toContain('Trop de tentatives')
  })

  it('valide côté client le mot de passe d’inscription (>= 10 caractères)', async () => {
    const fetchFn = stubFetch(jsonResponse(401, { error: 'Authentification requise' }))
    render(<AccountView />)
    await screen.findByRole('button', { name: 'Se connecter' })

    fireEvent.click(screen.getByRole('button', { name: 'Inscription' }))
    fireEvent.change(screen.getByLabelText('Nom affiché'), { target: { value: 'Alice' } })
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@b.fr' } })
    fireEvent.change(screen.getByLabelText(/Mot de passe/), { target: { value: 'court' } })
    fireEvent.click(screen.getByRole('button', { name: 'Créer mon compte' }))

    expect((await screen.findByRole('alert')).textContent).toContain('au moins 10 caractères')
    expect(fetchFn).toHaveBeenCalledTimes(1) // auth/me seulement, pas d'appel réseau inutile
  })

  it('connexion réussie -> profil affiché', async () => {
    stubFetch(
      jsonResponse(401, { error: 'Authentification requise' }),
      jsonResponse(200, { user: alice, csrfToken: 'tok' }),
    )
    render(<AccountView />)
    await screen.findByRole('button', { name: 'Se connecter' })

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: alice.email } })
    fireEvent.change(screen.getByLabelText(/Mot de passe/), { target: { value: 'motdepasse!' } })
    fireEvent.click(screen.getByRole('button', { name: 'Se connecter' }))

    expect(await screen.findByText('alice@exemple.fr')).toBeDefined()
    expect(screen.getByText('Apprenant')).toBeDefined()
  })
})

describe('AccountView — connecté', () => {
  it('affiche profil (email, nom, rôles), déconnexion et zone de danger', async () => {
    stubFetch(
      jsonResponse(200, {
        user: { ...alice, roles: ['apprenant', 'cartographe'] },
        csrfToken: 'tok',
      }),
    )
    render(<AccountView />)

    expect(await screen.findByText('alice@exemple.fr')).toBeDefined()
    expect(screen.getByText('Alice')).toBeDefined()
    expect(screen.getByText('Apprenant, Cartographe')).toBeDefined()
    expect(screen.getByRole('button', { name: 'Se déconnecter' })).toBeDefined()
    expect(screen.getByText('Zone de danger')).toBeDefined()
    expect(screen.getByText(/purge réelle/)).toBeDefined()
  })

  it('déconnexion -> retour aux formulaires', async () => {
    stubFetch(
      jsonResponse(200, { user: alice, csrfToken: 'tok' }),
      noContentResponse(), // POST auth/logout
    )
    render(<AccountView />)
    fireEvent.click(await screen.findByRole('button', { name: 'Se déconnecter' }))

    expect(await screen.findByRole('button', { name: 'Se connecter' })).toBeDefined()
    expect(screen.getByRole('status').textContent).toContain('déconnecté')
  })

  it('suppression : bouton verrouillé tant que l’email exact n’est pas saisi, puis purge', async () => {
    const fetchFn = stubFetch(
      jsonResponse(200, { user: alice, csrfToken: 'tok' }),
      noContentResponse(), // DELETE account
    )
    render(<AccountView />)
    await screen.findByText('Zone de danger')

    const deleteButton = screen.getByRole('button', { name: 'Supprimer mon compte' })
    expect(deleteButton.disabled).toBe(true)

    const confirm = screen.getByLabelText(/Pour confirmer, saisissez votre email/)
    fireEvent.change(confirm, { target: { value: 'autre@exemple.fr' } })
    expect(deleteButton.disabled).toBe(true)

    fireEvent.change(confirm, { target: { value: alice.email } })
    expect(deleteButton.disabled).toBe(false)

    fireEvent.click(deleteButton)
    await screen.findByRole('button', { name: 'Se connecter' }) // retour anonyme
    expect(screen.getByRole('status').textContent).toContain('purgées')

    const [url, init] = fetchFn.mock.calls[1]
    expect(url).toBe('api/auth/account')
    expect(init.method).toBe('DELETE')
    expect(init.headers['X-CSRF-Token']).toBe('tok')
  })
})

describe('AccountView — API indisponible (copie statique)', () => {
  it('affiche un message clair, sans erreur console non gérée', async () => {
    stubFetch(new TypeError('Failed to fetch'))
    render(<AccountView />)

    const message = await screen.findByRole('status')
    expect(message.textContent).toContain('indisponible sur cette copie statique')
    expect(screen.queryByRole('button', { name: 'Se connecter' })).toBe(null)
  })
})
