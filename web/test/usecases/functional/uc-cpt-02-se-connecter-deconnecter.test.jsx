// UC-CPT-02 — Se connecter et se déconnecter : tests FONCTIONNELS (IHM).
// Fiche : docs/cas-utilisation/compte/UC-CPT-02-se-connecter-deconnecter.md
//
// Le scénario est joué sur l'application ENTIÈRE (<App/>) : l'utilisateur
// ouvre #/compte, se connecte, voit son profil et la navigation « connectée »,
// puis se déconnecte (depuis le profil ou le panneau de navigation). Le
// réseau est le faux serveur en mémoire du lot (web/test/usecases/support/cpt.js).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import App from '../../../src/App.jsx'
import { API_UNAVAILABLE_MESSAGE, getCsrfToken, resetApiClient } from '../../../src/api/client.js'
import * as fakeLib from '../../../src/test/fake-sunburst-lib.js'
import { clearLocalStorage, installFakeAccountApi, jsonResponse } from '../support/cpt.js'

const PASSWORD = 'correct horse battery'
const ADA = { email: 'ada@example.org', password: PASSWORD, displayName: 'Ada Lovelace', roles: ['apprenant', 'cartographe'] }

function openApp(hash = '#/compte') {
  window.location.hash = hash
  render(<App lib={fakeLib} />)
}

const nav = () => within(screen.getByRole('navigation', { name: 'Navigation principale' }))
const profile = () => within(screen.getByRole('region', { name: 'Profil' }))
/** Attend l'affichage du profil (la session est vérifiée au montage de la route). */
const profileShown = async () => within(await screen.findByRole('region', { name: 'Profil' }))

async function click(name, scope = screen) {
  await act(async () => {
    fireEvent.click(scope.getByRole('button', { name }))
  })
}

async function signIn(email, password) {
  await screen.findByRole('button', { name: 'Se connecter' })
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: email } })
  fireEvent.change(screen.getByLabelText(/Mot de passe/), { target: { value: password } })
  await click('Se connecter')
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

describe('UC-CPT-02 — connexion et déconnexion', () => {
  it('UC-CPT-02-F09 — nominal : connexion → profil + navigation connectée ; « Se déconnecter » → retour au formulaire', async () => {
    const api = installFakeAccountApi({ users: [ADA] })
    openApp()

    await signIn('ada@example.org', PASSWORD)

    // Profil : email, nom affiché, rôles traduits.
    expect((await profileShown()).getByText('ada@example.org')).toBeDefined()
    expect(profile().getByText('Apprenant, Cartographe')).toBeDefined()
    expect(api.callsTo('auth/login')[0].body).toEqual({ email: 'ada@example.org', password: PASSWORD })
    // Navigation rafraîchie par l'événement humanome:auth (sans rechargement).
    expect(await nav().findByRole('link', { name: 'Ma file de relecture' })).toBeDefined()
    expect(nav().getByText('Ada Lovelace')).toBeDefined()
    const token = api.session.csrf

    await click('Se déconnecter', profile())

    expect(await screen.findByText('Vous êtes déconnecté.')).toBeDefined()
    expect(screen.getByRole('button', { name: 'Se connecter' })).toBeDefined()
    expect(api.callsTo('auth/logout', 'POST')[0].headers['X-CSRF-Token']).toBe(token)
    expect(api.session).toBeNull()
    expect(await nav().findByRole('link', { name: 'Se connecter' })).toBeDefined()
    expect(nav().queryByRole('button', { name: 'Se déconnecter' })).toBeNull()
  })

  it('UC-CPT-02-F10 — A1 : session déjà ouverte → le profil s’affiche directement, sans formulaire', async () => {
    const api = installFakeAccountApi({ users: [ADA], loggedInAs: 'ada@example.org' })
    openApp()

    expect((await profileShown()).getByText('ada@example.org')).toBeDefined()
    expect(screen.queryByLabelText(/Mot de passe/)).toBeNull()
    expect(api.callsTo('auth/login')).toHaveLength(0)
  })

  it('UC-CPT-02-F11 — A2 : « Se déconnecter » du panneau de navigation → session fermée, panneau refermé, retour à l’accueil', async () => {
    const api = installFakeAccountApi({ users: [ADA], loggedInAs: 'ada@example.org' })
    openApp()
    await nav().findByRole('button', { name: 'Se déconnecter' })
    await click('Menu de navigation')
    expect(document.querySelector('.app-menu').classList.contains('is-open')).toBe(true)

    await click('Se déconnecter', nav())

    await waitFor(() => expect(window.location.hash).toBe('#/'))
    expect(document.querySelector('.app-menu').classList.contains('is-open')).toBe(false)
    expect(api.session).toBeNull()
    expect(await nav().findByRole('link', { name: 'Se connecter' })).toBeDefined()
  })

  it('UC-CPT-02-F12 — A3 : API injoignable → message « copie statique » ; déconnexion hors ligne = déconnexion locale, navigation visiteur', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    openApp()
    expect((await screen.findByRole('status')).textContent).toBe(API_UNAVAILABLE_MESSAGE)
    cleanup()
    vi.unstubAllGlobals()

    // Connecté, puis TOUT le réseau tombe : « Se déconnecter » ramène au formulaire
    // et la relecture de session du shell (en échec) repasse la navigation en visiteur.
    const api = installFakeAccountApi({ users: [ADA], loggedInAs: 'ada@example.org' })
    openApp()
    await profileShown()
    await nav().findByRole('button', { name: 'Se déconnecter' })
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

    await click('Se déconnecter', profile())

    expect(await screen.findByText('Vous êtes déconnecté.')).toBeDefined()
    expect(await nav().findByRole('link', { name: 'Se connecter' })).toBeDefined()
    expect(nav().queryByRole('button', { name: 'Se déconnecter' })).toBeNull()
    expect(getCsrfToken()).toBeNull()
    expect(api.session).not.toBeNull() // session serveur intacte (voir « Limites »)
  })

  it('UC-CPT-02-F13 — E1 : email ou mot de passe vide → message local, aucune requête', async () => {
    const api = installFakeAccountApi({ users: [ADA] })
    openApp()
    await signIn('', PASSWORD)
    expect(screen.getByRole('alert').textContent).toBe('Indiquez votre adresse email.')
    await signIn('ada@example.org', '')
    expect(screen.getByRole('alert').textContent).toBe('Indiquez votre mot de passe.')
    expect(api.callsTo('auth/login')).toHaveLength(0)
  })

  it('UC-CPT-02-F14 — E2 : identifiants invalides → « Email ou mot de passe incorrect. », toujours anonyme', async () => {
    const api = installFakeAccountApi({ users: [ADA] })
    openApp()
    await signIn('ada@example.org', 'pas le bon')

    expect((await screen.findByRole('alert')).textContent).toBe('Email ou mot de passe incorrect.')
    expect(api.session).toBeNull()
    expect(nav().getByRole('link', { name: 'Se connecter' })).toBeDefined()
  })

  it('UC-CPT-02-F15 — E3 : compte non activé → bascule sur l’écran d’activation (UC-CPT-01 A3)', async () => {
    installFakeAccountApi({ users: [{ ...ADA, verified: false, code: '1234' }] })
    openApp()
    await signIn('ada@example.org', PASSWORD)

    expect(await screen.findByRole('heading', { name: 'Activer votre compte' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'Renvoyer le code' })).toBeDefined()
  })

  it('UC-CPT-02-F16 — E4 : trop de tentatives (429) → message du serveur, pas de session', async () => {
    const api = installFakeAccountApi({ users: [ADA] })
    api.failNext(
      'POST auth/login',
      jsonResponse(429, { error: 'Trop de tentatives de connexion, réessayez plus tard' }, { 'retry-after': '30' }),
    )
    openApp()
    await signIn('ada@example.org', PASSWORD)

    expect((await screen.findByRole('alert')).textContent).toBe('Trop de tentatives de connexion, réessayez plus tard')
    expect(api.session).toBeNull()
  })

  it('UC-CPT-02-F17 — E5 : déconnexion refusée (jeton CSRF invalide) → message, l’utilisateur reste connecté', async () => {
    const api = installFakeAccountApi({ users: [ADA], loggedInAs: 'ada@example.org' })
    api.failNext('POST auth/logout', jsonResponse(403, { error: 'Jeton CSRF absent ou invalide' }))
    openApp()
    await profileShown()

    const meCalls = api.callsTo('auth/me').length

    await click('Se déconnecter', profile())

    expect((await screen.findByRole('alert')).textContent).toBe('Jeton CSRF absent ou invalide')
    expect(profile().getByText('ada@example.org')).toBeDefined()
    // « Rester connecté » côté client : logout() a oublié le jeton, la relecture
    // de /me déclenchée par humanome:auth le récupère ; la navigation reste connectée.
    await waitFor(() => expect(api.callsTo('auth/me').length).toBeGreaterThan(meCalls))
    await waitFor(() => expect(getCsrfToken()).toBe(api.session.csrf))
    expect(nav().getByRole('button', { name: 'Se déconnecter' })).toBeDefined()
  })

  it('UC-CPT-02-F21 — ANOMALIE AN1 : session disparue côté serveur (cookie gardé) → déconnexion refusée 403 CSRF ; profil + message, navigation visiteur', async () => {
    const api = installFakeAccountApi({ users: [ADA], loggedInAs: 'ada@example.org' })
    openApp()
    await profileShown()
    await nav().findByRole('button', { name: 'Se déconnecter' })
    api.expireSession() // ramasse-miettes ou purge depuis un autre navigateur

    await click('Se déconnecter', profile())

    // Comportement ACTUEL figé (« Anomalies constatées », AN1) : affichage incohérent.
    expect((await screen.findByRole('alert')).textContent).toBe('Jeton CSRF absent ou invalide')
    expect(profile().getByText('ada@example.org')).toBeDefined() // le profil reste affiché…
    expect(await nav().findByRole('link', { name: 'Se connecter' })).toBeDefined() // … la navigation est celle d'un visiteur
    expect(nav().queryByRole('button', { name: 'Se déconnecter' })).toBeNull()
  })

  it('UC-CPT-02-F22 — ANOMALIE AN3 : déconnexion refusée depuis le panneau → aucun message, retour à l’accueil, toujours connecté', async () => {
    const api = installFakeAccountApi({ users: [ADA], loggedInAs: 'ada@example.org' })
    api.failNext('POST auth/logout', jsonResponse(403, { error: 'Jeton CSRF absent ou invalide' }))
    openApp()
    await nav().findByRole('button', { name: 'Se déconnecter' })

    await click('Se déconnecter', nav())

    // Comportement ACTUEL figé : l'erreur est avalée (App.jsx, handleLogout).
    await waitFor(() => expect(window.location.hash).toBe('#/'))
    expect(screen.queryByText('Jeton CSRF absent ou invalide')).toBeNull()
    await waitFor(() => expect(getCsrfToken()).toBe(api.session.csrf))
    expect(nav().getByRole('button', { name: 'Se déconnecter' })).toBeDefined()
  })

  it('UC-CPT-02-F23 — ANOMALIE AN4 : compte connecté SANS aucun rôle → profil affiché mais navigation de visiteur, sans « Se déconnecter »', async () => {
    const api = installFakeAccountApi({ users: [{ ...ADA, roles: [] }], loggedInAs: 'ada@example.org' })
    openApp()

    expect((await profileShown()).getByText('Aucun rôle attribué pour l’instant')).toBeDefined()
    await waitFor(() => expect(api.callsTo('auth/me').length).toBeGreaterThanOrEqual(2)) // shell + profil
    // Comportement ACTUEL figé : App.jsx déduit « connecté » de roles.length > 0.
    expect(nav().getByRole('link', { name: 'Se connecter' })).toBeDefined()
    expect(nav().queryByRole('button', { name: 'Se déconnecter' })).toBeNull()
    expect(nav().queryByText('Ada Lovelace')).toBeNull()
  })

  it('UC-CPT-02-F24 — A3 : /me en erreur serveur (500) → « Impossible de vérifier votre session… », pas le message « copie statique »', async () => {
    const api = installFakeAccountApi({ users: [ADA], loggedInAs: 'ada@example.org' })
    api.override('GET auth/me', () => jsonResponse(500, { error: 'Erreur interne' }))
    openApp()

    expect((await screen.findByRole('status')).textContent).toBe(
      'Impossible de vérifier votre session pour le moment. Réessayez plus tard.',
    )
    expect(nav().getByRole('link', { name: 'Se connecter' })).toBeDefined()
  })

  it('UC-CPT-02-F25 — A3 (limite) : panne PARTIELLE — déconnexion perdue mais /me joignable → profil « déconnecté », navigation toujours connectée', async () => {
    const api = installFakeAccountApi({ users: [ADA], loggedInAs: 'ada@example.org' })
    openApp()
    await profileShown()
    await nav().findByRole('button', { name: 'Se déconnecter' })
    api.override('POST auth/logout', () => {
      throw new TypeError('Failed to fetch')
    })

    await click('Se déconnecter', profile())

    // Comportement ACTUEL figé (voir « Limites ») : l'espace compte se croit déconnecté…
    expect(await screen.findByText('Vous êtes déconnecté.')).toBeDefined()
    // … mais la session serveur vit : le shell relit /me, récupère le jeton et reste connecté.
    await waitFor(() => expect(getCsrfToken()).toBe(api.session.csrf))
    expect(nav().getByRole('button', { name: 'Se déconnecter' })).toBeDefined()
  })
})
