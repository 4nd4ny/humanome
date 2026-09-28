// UC-CPT-06 — Supprimer son compte (droit à l'effacement) : tests UNITAIRES (front).
// Fiche : docs/cas-utilisation/compte/UC-CPT-06-supprimer-compte.md
//
// Code sollicité appelé directement : deleteAccount() du client API (jeton
// CSRF, oubli du jeton, événement de session) et la règle de confirmation de
// la « Zone de danger » d'AccountView, composant rendu seul.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
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
