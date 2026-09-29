// UC-CPT-06 — Supprimer son compte (droit à l'effacement) : tests UNITAIRES (front).
// Fiche : docs/cas-utilisation/compte/UC-CPT-06-supprimer-compte.md
//
// Code sollicité appelé directement : deleteAccount() du client API (jeton
// CSRF, oubli du jeton, événement de session), la règle de confirmation de
// la « Zone de danger » et les gestionnaires handleDelete / becomeAnonymous
// d'AccountView, composant rendu seul. (L'écoute de « humanome:auth » par le
// shell App.jsx est testée unitairement en UC-CPT-02-U14.)
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import AccountView from '../../../src/views/AccountView.jsx'
import { ApiError, deleteAccount, getCsrfToken, login, resetApiClient } from '../../../src/api/client.js'
import { installFakeAccountApi, jsonResponse, noContentResponse } from '../support/cpt.js'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  resetApiClient()
})

async function withToken(token) {
  await login({ email: 'a', password: 'b' }, { fetchFn: vi.fn().mockResolvedValue(jsonResponse(200, { user: {}, csrfToken: token })) })
}

describe('UC-CPT-06 — client API', () => {
  it('UC-CPT-06-U05 — deleteAccount() : DELETE auth/account avec le jeton, puis jeton oublié et navigation notifiée', async () => {
    await withToken('tok-del')
    const events = vi.fn()
    window.addEventListener('humanome:auth', events)
    const fetchFn = vi.fn().mockResolvedValue(noContentResponse())

    await expect(deleteAccount({ fetchFn })).resolves.toBeNull()
    window.removeEventListener('humanome:auth', events)

    const [url, init] = fetchFn.mock.calls[0]
    expect(url).toBe('api/auth/account')
    expect(init.method).toBe('DELETE')
    expect(init.body).toBeUndefined() // l'API n'attend aucune confirmation dans le corps
    expect(init.headers['X-CSRF-Token']).toBe('tok-del')
    expect(getCsrfToken()).toBeNull()
    expect(events).toHaveBeenCalledTimes(1)
  })

  it('UC-CPT-06-U06 — suppression refusée (403) : erreur typée, le jeton est CONSERVÉ et la session n’est pas notifiée', async () => {
    await withToken('tok-keep')
    const events = vi.fn()
    window.addEventListener('humanome:auth', events)
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(403, { error: 'Jeton CSRF absent ou invalide' }))

    const failure = await deleteAccount({ fetchFn }).catch((e) => e)
    window.removeEventListener('humanome:auth', events)

    expect(failure).toBeInstanceOf(ApiError)
    expect(failure.status).toBe(403)
    expect(getCsrfToken()).toBe('tok-keep')
    expect(events).not.toHaveBeenCalled()
  })
})

describe('UC-CPT-06 — confirmation dans la Zone de danger (AccountView seul)', () => {
  it('UC-CPT-06-U07 — le bouton ne s’active que pour l’email EXACT du compte (casse comprise), espaces de bord tolérés', async () => {
    installFakeAccountApi({
      users: [{ email: 'ada@example.org', password: 'correct horse battery', displayName: 'Ada' }],
      loggedInAs: 'ada@example.org',
    })
    render(<AccountView />)
    const button = await screen.findByRole('button', { name: 'Supprimer mon compte' })
    const confirm = screen.getByLabelText('Pour confirmer, saisissez votre email (ada@example.org) :')
    expect(confirm.getAttribute('autocomplete')).toBe('off')

    const expectations = [
      ['', true],
      ['ada@example.or', true],
      ['ADA@example.org', true],
      ['bob@example.org', true],
      ['  ada@example.org  ', false],
      ['ada@example.org', false],
    ]
    for (const [value, disabled] of expectations) {
      fireEvent.change(confirm, { target: { value } })
      expect(button.disabled, JSON.stringify(value)).toBe(disabled)
    }
    expect(screen.getByText(/purge réelle de toutes vos données serveur/)).toBeDefined()
  })
})

describe('UC-CPT-06 — AccountView : handleDelete et becomeAnonymous (composant seul)', () => {
  const ADA = { email: 'ada@example.org', password: 'correct horse battery', displayName: 'Ada' }
  const confirmField = () => screen.getByLabelText('Pour confirmer, saisissez votre email (ada@example.org) :')

  async function deleteWithConfirmation() {
    fireEvent.change(confirmField(), { target: { value: 'ada@example.org' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Supprimer mon compte' }))
    })
  }

  it('UC-CPT-06-U09 — succès : notice RGPD (role=status) puis formulaire de connexion vierge ; échec : alerte, profil et saisie de confirmation conservés', async () => {
    const api = installFakeAccountApi({ users: [ADA], loggedInAs: ADA.email })
    render(<AccountView />)
    await screen.findByRole('region', { name: 'Zone de danger' })
    await deleteWithConfirmation()

    expect((await screen.findByRole('status')).textContent).toBe(
      'Votre compte a été supprimé : toutes vos données serveur ont été réellement purgées ' +
        '(un événement d’audit anonyme en garde la trace, conformément au RGPD).',
    )
    expect(screen.getByRole('button', { name: 'Se connecter' })).toBeDefined() // mode « login »
    expect(screen.getByLabelText(/Mot de passe/).value).toBe('')
    expect(screen.queryByRole('region', { name: 'Profil' })).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(api.users.has(ADA.email)).toBe(false)
    cleanup()
    vi.unstubAllGlobals()
    resetApiClient()

    // Échec (ex. 403) : setAccountError, rien d'autre ne change.
    const refused = installFakeAccountApi({ users: [ADA], loggedInAs: ADA.email })
    refused.failNext('DELETE auth/account', jsonResponse(403, { error: 'Jeton CSRF absent ou invalide' }))
    render(<AccountView />)
    await screen.findByRole('region', { name: 'Zone de danger' })
    await deleteWithConfirmation()

    expect((await screen.findByRole('alert')).textContent).toBe('Jeton CSRF absent ou invalide')
    expect(screen.getByRole('region', { name: 'Profil' })).toBeDefined()
    expect(confirmField().value).toBe('ada@example.org')
    expect(screen.getByRole('button', { name: 'Supprimer mon compte' }).disabled).toBe(false)
  })
})
