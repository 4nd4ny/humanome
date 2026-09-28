// UC-CPT-01 — Créer un compte et l'activer par code email : tests UNITAIRES (front).
// Fiche : docs/cas-utilisation/compte/UC-CPT-01-creer-activer-compte.md
//
// Code sollicité appelé directement : le routeur (lien #/activer du mail),
// les fonctions du client API register / activate / resendCode (corps envoyé,
// jeton CSRF, événement « humanome:auth » qui rafraîchit la navigation), la
// remontée des erreurs de validation champ par champ, et AccountView rendu
// seul pour l'écran d'activation.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import AccountView from '../../../src/views/AccountView.jsx'
import { parseHash } from '../../../src/router.js'
import {
  ApiError,
  activate,
  getCsrfToken,
  register,
  resendCode,
  resetApiClient,
} from '../../../src/api/client.js'
import { installFakeAccountApi, jsonResponse } from '../support/cpt.js'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  resetApiClient()
})

/** Compte les événements humanome:auth émis pendant `fn`. */
async function countAuthEvents(fn) {
  const listener = vi.fn()
  window.addEventListener('humanome:auth', listener)
  try {
    await fn()
  } finally {
    window.removeEventListener('humanome:auth', listener)
  }
  return listener.mock.calls.length
}

describe('UC-CPT-01 — routeur : le lien reçu par email', () => {
  it('UC-CPT-01-U10 — #/activer?email=…&code=… ouvre la route « activer » avec email décodé et code', () => {
    expect(parseHash('#/activer?email=ada%40example.org&code=0420')).toEqual({
      name: 'activer',
      email: 'ada@example.org',
      code: '0420',
    })
    // Paramètres absents : écran d'activation vide, pas une page introuvable.
    expect(parseHash('#/activer')).toEqual({ name: 'activer', email: '', code: '' })
  })
})

describe('UC-CPT-01 — client API', () => {
  it('UC-CPT-01-U11 — register() POSTe les quatre champs (double saisie), sans session ni événement de session', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      jsonResponse(201, { status: 'pending_activation', email: 'ada@example.org', message: 'ok' }),
    )
    let data
    const events = await countAuthEvents(async () => {
      data = await register(
        { email: 'ada@example.org', emailConfirm: 'ADA@example.org', password: 'correct horse', displayName: 'Ada' },
        { fetchFn },
      )
    })

    expect(data.status).toBe('pending_activation')
    const [url, init] = fetchFn.mock.calls[0]
    expect(url).toBe('api/auth/register')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({
      email: 'ada@example.org',
      emailConfirm: 'ADA@example.org',
      password: 'correct horse',
      displayName: 'Ada',
    })
    expect(init.headers['X-CSRF-Token']).toBeUndefined()
    expect(getCsrfToken()).toBeNull()
    expect(events).toBe(0) // compte en attente : la navigation ne change pas

    // Sans emailConfirm explicite, l'adresse est reprise telle quelle.
    await register({ email: 'b@example.org', password: 'x', displayName: 'B' }, { fetchFn })
    expect(JSON.parse(fetchFn.mock.calls[1][1].body).emailConfirm).toBe('b@example.org')
  })

  it('UC-CPT-01-U12 — activate() POSTe {email, code}, mémorise le jeton CSRF reçu et notifie la navigation', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      jsonResponse(200, { user: { id: 3, email: 'ada@example.org', roles: ['apprenant'] }, csrfToken: 'tok-activation' }),
    )
    let data
    const events = await countAuthEvents(async () => {
      data = await activate({ email: 'ada@example.org', code: '0420' }, { fetchFn })
    })

    expect(data.user.roles).toEqual(['apprenant'])
    expect(JSON.parse(fetchFn.mock.calls[0][1].body)).toEqual({ email: 'ada@example.org', code: '0420' })
    expect(fetchFn.mock.calls[0][0]).toBe('api/auth/activate')
    expect(getCsrfToken()).toBe('tok-activation')
    expect(events).toBe(1)
  })

  it('UC-CPT-01-U13 — resendCode() POSTe {email} et rend la réponse générique (anti-énumération)', async () => {
    const generic = { status: 'ok', message: 'Si un compte non activé existe pour cette adresse, un nouveau code a été envoyé.' }
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(200, generic))

    await expect(resendCode({ email: 'ada@example.org' }, { fetchFn })).resolves.toEqual(generic)
    const [url, init] = fetchFn.mock.calls[0]
    expect(url).toBe('api/auth/resend')
    expect(JSON.parse(init.body)).toEqual({ email: 'ada@example.org' })
  })

  it('UC-CPT-01-U14 — 422 → ApiError porteuse des messages par champ ; 409 et 429 → message serveur', async () => {
    const fields = { emailConfirm: 'Les deux adresses email ne correspondent pas', password: 'Le mot de passe doit contenir au moins 10 caractères' }
    const invalid = vi.fn().mockResolvedValue(jsonResponse(422, { error: 'Validation échouée', fields }))
    const failure = await register({ email: 'a@b.fr', password: 'x', displayName: 'A' }, { fetchFn: invalid }).catch((e) => e)
    expect(failure).toBeInstanceOf(ApiError)
    expect(failure.status).toBe(422)
    expect(failure.fields).toEqual(fields)

    for (const [status, error] of [
      [409, 'Un compte existe déjà avec cette adresse email'],
      [429, 'Trop de tentatives, réessayez plus tard'],
    ]) {
      const fetchFn = vi.fn().mockResolvedValue(jsonResponse(status, { error }))
      const e = await register({ email: 'a@b.fr', password: 'x', displayName: 'A' }, { fetchFn }).catch((err) => err)
      expect(e.status).toBe(status)
      expect(e.message).toBe(error)
      expect(e.fields).toBeNull()
    }
  })
})

describe('UC-CPT-01 — AccountView : écran d’activation', () => {
  it('UC-CPT-01-U15 — lien sans code : email seul pré-rempli, indice d’expiration, « Retour à la connexion » ramène au formulaire', async () => {
    installFakeAccountApi()
    render(<AccountView initialActivation={{ email: 'ada@example.org', code: '' }} />)

    expect(await screen.findByRole('heading', { name: 'Activer votre compte' })).toBeDefined()
    expect(screen.getByLabelText('Email').value).toBe('ada@example.org')
    const code = screen.getByLabelText(/Code de confirmation/)
    expect(code.value).toBe('')
    expect(code.getAttribute('maxLength')).toBe('4')
    expect(code.getAttribute('autocomplete')).toBe('one-time-code')
    expect(screen.getByText(/il expire au bout de 30 minutes/)).toBeDefined()

    fireEvent.click(screen.getByRole('button', { name: 'Retour à la connexion' }))
    expect(screen.getByRole('heading', { name: 'Compte' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'Se connecter' })).toBeDefined()
  })
})
