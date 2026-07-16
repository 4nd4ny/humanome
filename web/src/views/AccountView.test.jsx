import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import AccountView from './AccountView.jsx'
import { resetApiClient } from '../api/client.js'

// D6 : le redimensionnement canvas n'existe pas en jsdom -> stub déterministe
// (le vrai resizeAvatar est testé dans resize-image.test.js).
vi.mock('../lib/resize-image.js', () => ({
  resizeAvatar: vi.fn(async () => ({ base64: 'AAAA', mime: 'image/webp', bytes: 100 })),
  AVATAR_SIZE: 256,
  MAX_AVATAR_BYTES: 200 * 1024,
}))

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

/** Installe un fetch global factice et le retourne (AccountView utilise le client réel).
 *  Les appels GET api/keys (section « Clés API » du profil) sont routés HORS de la
 *  file ordonnée : ils renvoient une liste vide, sans consommer les réponses d'auth. */
function stubFetch(...responses) {
  let i = 0
  const fetchFn = vi.fn((url) => {
    if (typeof url === 'string' && url.includes('api/keys')) {
      return Promise.resolve(jsonResponse(200, []))
    }
    const response = responses[i++]
    return response instanceof Error ? Promise.reject(response) : Promise.resolve(response)
  })
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
    fireEvent.change(screen.getByLabelText(/Confirmez l’email/), { target: { value: 'a@b.fr' } })
    fireEvent.change(screen.getByLabelText(/Mot de passe/), { target: { value: 'court' } })
    fireEvent.click(screen.getByRole('button', { name: 'Créer mon compte' }))

    expect((await screen.findByRole('alert')).textContent).toContain('au moins 10 caractères')
    expect(fetchFn).toHaveBeenCalledTimes(1) // auth/me seulement, pas d'appel réseau inutile
  })

  it('bloque une double saisie d’email divergente SANS appel réseau (D5)', async () => {
    const fetchFn = stubFetch(jsonResponse(401, { error: 'Authentification requise' }))
    render(<AccountView />)
    await screen.findByRole('button', { name: 'Se connecter' })

    fireEvent.click(screen.getByRole('button', { name: 'Inscription' }))
    fireEvent.change(screen.getByLabelText('Nom affiché'), { target: { value: 'Alice' } })
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@b.fr' } })
    fireEvent.change(screen.getByLabelText(/Confirmez l’email/), { target: { value: 'autre@b.fr' } })
    fireEvent.change(screen.getByLabelText(/Mot de passe/), { target: { value: 'motdepasse-long' } })
    fireEvent.click(screen.getByRole('button', { name: 'Créer mon compte' }))

    expect((await screen.findByRole('alert')).textContent).toContain('ne correspondent pas')
    expect(fetchFn).toHaveBeenCalledTimes(1) // auth/me seulement

    // Insensible à la casse : Alice@B.FR == a... non, même adresse en casse différente PASSE.
    fireEvent.change(screen.getByLabelText(/Confirmez l’email/), { target: { value: 'A@B.fr' } })
    fireEvent.click(screen.getByRole('button', { name: 'Créer mon compte' }))
    // Plus d'erreur de correspondance : l'appel réseau part (le stub n'a plus de
    // réponse -> le client tombera en erreur générique, peu importe ici).
    expect(fetchFn.mock.calls.length).toBeGreaterThan(1)
  })

  it('inscription -> écran d’activation, code accepté -> connecté (D5)', async () => {
    stubFetch(
      jsonResponse(401, { error: 'Authentification requise' }), // auth/me
      jsonResponse(201, { status: 'pending_activation', email: 'alice@exemple.fr' }), // register
      jsonResponse(200, { user: alice, csrfToken: 'tok' }), // activate
    )
    render(<AccountView />)
    await screen.findByRole('button', { name: 'Se connecter' })

    fireEvent.click(screen.getByRole('button', { name: 'Inscription' }))
    fireEvent.change(screen.getByLabelText('Nom affiché'), { target: { value: 'Alice' } })
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: alice.email } })
    fireEvent.change(screen.getByLabelText(/Confirmez l’email/), { target: { value: alice.email } })
    fireEvent.change(screen.getByLabelText(/Mot de passe/), { target: { value: 'motdepasse-long' } })
    fireEvent.click(screen.getByRole('button', { name: 'Créer mon compte' }))

    // Écran d'activation : le compte n'est PAS connecté, on attend le code.
    expect(await screen.findByRole('heading', { name: 'Activer votre compte' })).toBeDefined()
    expect(screen.getByText(/code de confirmation à 4 chiffres/)).toBeDefined()

    fireEvent.change(screen.getByLabelText(/Code de confirmation/), { target: { value: '4242' } })
    fireEvent.click(screen.getByRole('button', { name: 'Activer mon compte' }))

    expect(await screen.findByText('alice@exemple.fr')).toBeDefined()
    expect(screen.getByText('Apprenant')).toBeDefined()
  })

  it('login d’un compte non activé -> écran d’activation + renvoi du code (D5)', async () => {
    stubFetch(
      jsonResponse(401, { error: 'Authentification requise' }), // auth/me
      jsonResponse(403, {
        error: 'Compte non activé : confirmez votre email avec le code reçu.',
        code: 'email_not_verified',
        email: 'alice@exemple.fr',
      }), // login
      jsonResponse(200, { status: 'ok', message: 'Si un compte…' }), // resend
    )
    render(<AccountView />)
    await screen.findByRole('button', { name: 'Se connecter' })

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: alice.email } })
    fireEvent.change(screen.getByLabelText(/Mot de passe/), { target: { value: 'motdepasse!' } })
    fireEvent.click(screen.getByRole('button', { name: 'Se connecter' }))

    expect(await screen.findByRole('heading', { name: 'Activer votre compte' })).toBeDefined()
    // L'email est pré-rempli depuis le formulaire de connexion.
    expect(screen.getByLabelText('Email').value).toBe(alice.email)

    fireEvent.click(screen.getByRole('button', { name: 'Renvoyer le code' }))
    expect((await screen.findByRole('status')).textContent).toContain('nouveau code')
  })

  it('arrivée par le lien #/activer : email et code pré-remplis (D5)', async () => {
    stubFetch(jsonResponse(401, { error: 'Authentification requise' }))
    render(<AccountView initialActivation={{ email: 'alice@exemple.fr', code: '4242' }} />)

    expect(await screen.findByRole('heading', { name: 'Activer votre compte' })).toBeDefined()
    expect(screen.getByLabelText('Email').value).toBe('alice@exemple.fr')
    expect(screen.getByLabelText(/Code de confirmation/).value).toBe('4242')
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

  it('édite le nom affiché (PATCH) et affiche le nouveau (D6)', async () => {
    const withId = { ...alice, id: 7 }
    stubFetch(
      jsonResponse(200, { user: withId, csrfToken: 'tok' }), // auth/me
      jsonResponse(200, { user: { ...withId, displayName: 'Ada Lovelace' } }), // PATCH auth/me
    )
    render(<AccountView />)
    await screen.findByText('alice@exemple.fr')

    fireEvent.click(screen.getByRole('button', { name: 'Modifier' }))
    fireEvent.change(screen.getByLabelText('Nom affiché'), { target: { value: 'Ada Lovelace' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))

    expect(await screen.findByText('Ada Lovelace')).toBeDefined()
    expect(screen.getByRole('status').textContent).toContain('mis à jour')
  })

  it('sans avatar : initiales en repli ; téléverser une photo appelle PUT (D6)', async () => {
    const withId = { ...alice, id: 7, hasAvatar: false }
    stubFetch(
      jsonResponse(200, { user: withId, csrfToken: 'tok' }), // auth/me
      jsonResponse(200, { status: 'ok', mime: 'image/webp', size: 100 }), // PUT avatar
    )
    render(<AccountView />)
    await screen.findByText('alice@exemple.fr')

    // Repli initiales (au moins une pastille : profil + nav éventuelle).
    expect(screen.getAllByTestId('avatar-initials').length).toBeGreaterThan(0)

    const file = new File(['octets'], 'photo.png', { type: 'image/png' })
    fireEvent.change(screen.getByLabelText('Choisir une photo de profil'), {
      target: { files: [file] },
    })
    expect(await screen.findByText(/Photo de profil mise à jour/)).toBeDefined()
  })

  it('avec avatar : « Retirer la photo » appelle DELETE et revient aux initiales (D6)', async () => {
    const withAvatar = { ...alice, id: 7, hasAvatar: true }
    stubFetch(
      jsonResponse(200, { user: withAvatar, csrfToken: 'tok' }), // auth/me
      noContentResponse(), // DELETE avatar
    )
    render(<AccountView />)
    await screen.findByText('alice@exemple.fr')
    expect(screen.getAllByTestId('avatar-img').length).toBeGreaterThan(0)

    fireEvent.click(screen.getByRole('button', { name: 'Retirer la photo' }))
    await waitFor(() => expect(screen.getByText(/Photo de profil retirée/)).toBeDefined())
    expect(screen.getByText('Ajouter une photo')).toBeDefined()
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

    // Cible l'appel de purge (les appels api/keys de la section Clés API décalent les index).
    const purge = fetchFn.mock.calls.find(([url]) => url === 'api/auth/account')
    expect(purge).toBeDefined()
    expect(purge[1].method).toBe('DELETE')
    expect(purge[1].headers['X-CSRF-Token']).toBe('tok')
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
