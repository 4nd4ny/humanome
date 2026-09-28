// UC-CPT-01 — Créer un compte et l'activer par code email : tests FONCTIONNELS (IHM).
// Fiche : docs/cas-utilisation/compte/UC-CPT-01-creer-activer-compte.md
//
// Le scénario est joué sur l'application ENTIÈRE (<App/>) : le visiteur ouvre
// #/compte (ou le lien #/activer du mail), s'inscrit, saisit le code reçu et
// arrive connecté, navigation comprise. Le réseau est un faux serveur en
// mémoire qui rejoue le contrat de api/src/routes/auth.php
// (web/test/usecases/support/cpt.js) ; aucun appel réel.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import App from '../../../src/App.jsx'
import { resetApiClient } from '../../../src/api/client.js'
import * as fakeLib from '../../../src/test/fake-sunburst-lib.js'
import { clearLocalStorage, installFakeAccountApi, jsonResponse } from '../support/cpt.js'

const PASSWORD = 'correct horse battery'

function openApp(hash) {
  window.location.hash = hash
  render(<App lib={fakeLib} />)
}

const nav = () => within(screen.getByRole('navigation', { name: 'Navigation principale' }))

async function click(name) {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name }))
  })
}

function type(label, value) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } })
}

async function fillRegistration({ name = 'Ada', email = 'ada@example.org', confirm = email, password = PASSWORD } = {}) {
  await screen.findByRole('button', { name: 'Se connecter' })
  await click('Inscription')
  type('Nom affiché', name)
  type('Email', email)
  type(/Confirmez l’email/, confirm)
  type(/Mot de passe/, password)
  await click('Créer mon compte')
}

beforeEach(() => {
  resetApiClient()
  clearLocalStorage()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  window.location.hash = ''
  resetApiClient()
  clearLocalStorage()
})

describe('UC-CPT-01 — le visiteur crée son compte puis l’active', () => {
  it('UC-CPT-01-F12 — nominal : inscription → écran d’activation → code reçu → connecté, navigation mise à jour', async () => {
    const api = installFakeAccountApi()
    openApp('#/compte')

    // 1. Visiteur : formulaires publics, la navigation propose « Se connecter ».
    await fillRegistration({ email: 'Ada@Example.org', confirm: 'ada@example.org' })

    // 4-6. Compte créé en attente : écran d'activation, email reporté.
    expect(await screen.findByRole('heading', { name: 'Activer votre compte' })).toBeDefined()
    expect(screen.getByText(/Compte créé ! Un code de confirmation à 4 chiffres/)).toBeDefined()
    expect(screen.getByLabelText('Email').value).toBe('Ada@Example.org')
    expect(api.callsTo('auth/register', 'POST')[0].body).toEqual({
      email: 'Ada@Example.org',
      emailConfirm: 'ada@example.org',
      password: PASSWORD,
      displayName: 'Ada',
    })
    expect(api.session).toBeNull()
    expect(nav().getByRole('link', { name: 'Se connecter' })).toBeDefined()

    // 7-9. Le code reçu par email active le compte et ouvre la session.
    type(/Code de confirmation/, api.lastCodeFor('ada@example.org'))
    await click('Activer mon compte')

    // 10. Profil affiché, rôle apprenant par défaut, navigation « connectée ».
    expect(await screen.findByText('Compte activé, bienvenue !')).toBeDefined()
    expect(screen.getByText('ada@example.org')).toBeDefined()
    expect(screen.getByText('Apprenant')).toBeDefined()
    expect(await nav().findByRole('button', { name: 'Se déconnecter' })).toBeDefined()
    expect(nav().getByRole('link', { name: 'Profil et rôles' })).toBeDefined()
  })

  it('UC-CPT-01-F13 — A1 : le lien #/activer du mail pré-remplit email et code ; un clic suffit', async () => {
    installFakeAccountApi({
      users: [{ email: 'ada@example.org', password: PASSWORD, displayName: 'Ada', verified: false, code: '4242' }],
    })
    openApp('#/activer?email=ada%40example.org&code=4242')

    expect(await screen.findByRole('heading', { name: 'Activer votre compte' })).toBeDefined()
    expect(screen.getByLabelText('Email').value).toBe('ada@example.org')
    expect(screen.getByLabelText(/Code de confirmation/).value).toBe('4242')

    await click('Activer mon compte')
    expect(await screen.findByText('Compte activé, bienvenue !')).toBeDefined()
  })

  it('UC-CPT-01-F14 — A2 : « Renvoyer le code » → message générique, le nouveau code active le compte', async () => {
    const api = installFakeAccountApi({
      users: [{ email: 'ada@example.org', password: PASSWORD, verified: false, code: '4242' }],
    })
    openApp('#/activer?email=ada%40example.org')
    await screen.findByRole('heading', { name: 'Activer votre compte' })

    await click('Renvoyer le code')
    expect(
      await screen.findByText(/Si un compte non activé existe pour cette adresse, un nouveau code vient d’être envoyé/),
    ).toBeDefined()
    expect(api.callsTo('auth/resend', 'POST')[0].body).toEqual({ email: 'ada@example.org' })

    const fresh = api.lastCodeFor('ada@example.org')
    expect(fresh).not.toBeNull()
    type(/Code de confirmation/, fresh)
    await click('Activer mon compte')
    expect(await screen.findByText('Compte activé, bienvenue !')).toBeDefined()
  })

  it('UC-CPT-01-F15 — A3 : reprise — la connexion d’un compte non activé mène à l’écran d’activation, puis au profil', async () => {
    const api = installFakeAccountApi({
      users: [{ email: 'ada@example.org', password: PASSWORD, displayName: 'Ada', verified: false, code: '7310' }],
    })
    openApp('#/compte')
    await screen.findByRole('button', { name: 'Se connecter' })
    type('Email', 'ada@example.org')
    type(/Mot de passe/, PASSWORD)
    await click('Se connecter')

    expect(await screen.findByRole('heading', { name: 'Activer votre compte' })).toBeDefined()
    expect(screen.getByText(/Ce compte n’est pas encore activé/)).toBeDefined()
    expect(screen.getByLabelText('Email').value).toBe('ada@example.org')
    expect(api.session).toBeNull()

    type(/Code de confirmation/, '7310')
    await click('Activer mon compte')
    expect(await screen.findByText('Compte activé, bienvenue !')).toBeDefined()
    // Le nom affiché apparaît aussi dans la navigation (identité à côté de l'avatar).
    expect(await nav().findByText('Ada')).toBeDefined()
  })

  it('UC-CPT-01-F16 — E1 : contrôles locaux (email vide, double saisie, nom, mot de passe) sans aucune requête', async () => {
    const api = installFakeAccountApi()
    openApp('#/compte')
    await screen.findByRole('button', { name: 'Se connecter' })
    await click('Inscription')

    const cases = [
      [{ name: 'Ada', email: '', confirm: '', password: PASSWORD }, 'Indiquez votre adresse email.'],
      [{ name: 'Ada', email: 'ada@example.org', confirm: 'ada@example.com', password: PASSWORD }, 'Les deux adresses email ne correspondent pas.'],
      [{ name: '  ', email: 'ada@example.org', confirm: 'ada@example.org', password: PASSWORD }, 'Indiquez le nom qui sera affiché sur votre profil.'],
      [{ name: 'Ada', email: 'ada@example.org', confirm: 'ada@example.org', password: '123456789' }, 'Le mot de passe doit contenir au moins 10 caractères.'],
    ]
    for (const [values, message] of cases) {
      type('Nom affiché', values.name)
      type('Email', values.email)
      type(/Confirmez l’email/, values.confirm)
      type(/Mot de passe/, values.password)
      await click('Créer mon compte')
      expect(screen.getByRole('alert').textContent).toBe(message)
    }
    expect(api.callsTo('auth/register')).toHaveLength(0)
  })

  it('UC-CPT-01-F17 — E2/E3 : refus serveur affichés (422 par champ, 409 adresse déjà utilisée), on reste sur l’inscription', async () => {
    installFakeAccountApi({ users: [{ email: 'taken@example.org', password: PASSWORD }] })
    openApp('#/compte')

    // E2 : l'adresse passe les contrôles locaux mais pas la validation serveur.
    await fillRegistration({ email: 'pas-un-email' })
    expect((await screen.findByRole('alert')).textContent).toBe('Adresse email invalide')

    // E3 : adresse déjà inscrite.
    type('Email', 'taken@example.org')
    type(/Confirmez l’email/, 'taken@example.org')
    await click('Créer mon compte')
    expect((await screen.findByRole('alert')).textContent).toBe('Un compte existe déjà avec cette adresse email')
    expect(screen.getByRole('button', { name: 'Créer mon compte' })).toBeDefined()
  })

  it('UC-CPT-01-F18 — E4 : quota d’inscription atteint (429) → message du serveur', async () => {
    const api = installFakeAccountApi()
    api.failNext(
      'POST auth/register',
      jsonResponse(429, { error: 'Trop de tentatives, réessayez plus tard' }, { 'retry-after': '30' }),
    )
    openApp('#/compte')
    await fillRegistration()

    expect((await screen.findByRole('alert')).textContent).toBe('Trop de tentatives, réessayez plus tard')
    expect(screen.queryByRole('heading', { name: 'Activer votre compte' })).toBeNull()
  })

  it('UC-CPT-01-F19 — E5/E6 : code faux → message générique ; code mal formé refusé localement', async () => {
    const api = installFakeAccountApi({
      users: [{ email: 'ada@example.org', password: PASSWORD, verified: false, code: '4242' }],
    })
    openApp('#/activer?email=ada%40example.org')
    await screen.findByRole('heading', { name: 'Activer votre compte' })

    type(/Code de confirmation/, '12a')
    await click('Activer mon compte')
    expect(screen.getByRole('alert').textContent).toBe('Saisissez le code à 4 chiffres reçu par email.')
    expect(api.callsTo('auth/activate')).toHaveLength(0)

    type(/Code de confirmation/, '0000')
    await click('Activer mon compte')
    expect((await screen.findByRole('alert')).textContent).toBe('Code invalide ou expiré')
    expect(screen.getByRole('heading', { name: 'Activer votre compte' })).toBeDefined()
    expect(api.session).toBeNull()
  })

  it('UC-CPT-01-F20 — E8 : trop de renvois (429) → message affiché, pas de nouveau code', async () => {
    const api = installFakeAccountApi({
      users: [{ email: 'ada@example.org', password: PASSWORD, verified: false, code: '4242' }],
    })
    api.failNext('POST auth/resend', jsonResponse(429, { error: 'Trop de demandes de code, réessayez plus tard' }))
    openApp('#/activer?email=ada%40example.org')
    await screen.findByRole('heading', { name: 'Activer votre compte' })

    await click('Renvoyer le code')
    expect((await screen.findByRole('alert')).textContent).toBe('Trop de demandes de code, réessayez plus tard')
    expect(api.mailbox).toHaveLength(0)
  })
})
