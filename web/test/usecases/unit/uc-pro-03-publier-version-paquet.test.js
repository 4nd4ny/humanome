// UC-PRO-03 — Publier une version de paquet (immuable) : tests UNITAIRES
// (front).
// Fiche : docs/cas-utilisation/promptologue/UC-PRO-03-publier-version-paquet.md
//
// Code sollicité appelé directement : le client de l'atelier
// (createPromptologueApi.publishDraft) et le client HTTP commun (apiFetch) qui
// joint le jeton CSRF de la session à la publication et remonte les refus du
// serveur (409 semver / immuabilité) en ApiError affichable ; le formulaire
// « Publication » d'EditeurSection rendu seul avec un client simulé.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createPromptologueApi } from '../../../src/views/promptologue/api.js'
import EditeurSection from '../../../src/views/promptologue/EditeurSection.jsx'
import { ApiError, apiFetch, resetApiClient } from '../../../src/api/client.js'
import { packageDoc } from '../support/pro.js'

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

describe('UC-PRO-03 — client de l’atelier : publication', () => {
  it('UC-PRO-03-U08 — publishDraft : POST drafts/{draftId}/publish avec {changelog}', async () => {
    const apiFetchFn = vi.fn(async () => ({ id: 'aurora-demo', version: '1.1.0', status: 'published' }))
    const api = createPromptologueApi(apiFetchFn)

    const result = await api.publishDraft('12', 'Consigne de citation renforcée.')

    expect(result.status).toBe('published')
    expect(apiFetchFn).toHaveBeenCalledWith('prompt-packages/drafts/12/publish', {
      method: 'POST',
      body: { changelog: 'Consigne de citation renforcée.' },
    })
  })

  it('UC-PRO-03-U09 — apiFetch : jeton CSRF de la session joint à la publication ; 409 → ApiError portant le message serveur', async () => {
    const fetchFn = vi.fn(async (url) =>
      url === 'api/auth/me'
        ? jsonResponse(200, { user: { id: 7, roles: ['promptologue'] }, csrfToken: 'jeton-session' })
        : jsonResponse(409, { error: 'Semver must be strictly increasing: 0.9.0 is not greater than published 1.0.0' }),
    )
    await apiFetch('auth/me', { fetchFn })

    const failure = await apiFetch('prompt-packages/drafts/12/publish', {
      method: 'POST',
      body: { changelog: 'x' },
      fetchFn,
    }).catch((e) => e)

    const [, init] = fetchFn.mock.calls[1]
    expect(init.headers['X-CSRF-Token']).toBe('jeton-session')
    expect(JSON.parse(init.body)).toEqual({ changelog: 'x' })
    expect(failure).toBeInstanceOf(ApiError)
    expect(failure.status).toBe(409)
    expect(failure.message).toBe('Semver must be strictly increasing: 0.9.0 is not greater than published 1.0.0')
  })
})

describe('UC-PRO-03 — EditeurSection isolée : formulaire « Publication »', () => {
  function api(publishDraft) {
    return {
      getDraft: vi.fn(async () => ({ draftId: 100, id: 'aurora-demo', version: '1.1.0', status: 'draft', document: packageDoc({ version: '1.1.0' }) })),
      publishDraft,
    }
  }

  async function openPublication(client) {
    render(createElement(EditeurSection, { api: client, draftId: '100' }))
    await waitFor(() => expect(document.querySelector('.promptologue-editeur h2')?.textContent).toBe('Brouillon aurora-demo@1.1.0'))
    await act(async () => {
      fireEvent.click(screen.getByText('Publier…'))
    })
    return screen.getByText('Confirmer la publication')
  }

  it('UC-PRO-03-U12 — confirmation désactivée pour un changelog vide ou blanc ; succès : message, formulaire refermé ; 409 : message serveur, formulaire ouvert', async () => {
    const ok = vi.fn(async () => ({ id: 'aurora-demo', version: '1.1.0', status: 'published' }))
    const confirm = await openPublication(api(ok))
    const changelog = screen.getByLabelText('Changelog de la version (obligatoire)')
    expect(confirm.disabled).toBe(true)
    fireEvent.change(changelog, { target: { value: '   ' } })
    expect(confirm.disabled).toBe(true)
    fireEvent.change(changelog, { target: { value: '  Consigne renforcée.  ' } })
    expect(confirm.disabled).toBe(false)
    await act(async () => {
      fireEvent.click(confirm)
    })
    // Le changelog part tel que saisi : c'est le serveur qui le trime (étape 4).
    expect(ok).toHaveBeenCalledWith('100', '  Consigne renforcée.  ')
    expect(screen.getByRole('status').textContent).toBe('Version aurora-demo@1.1.0 publiée — elle est désormais immuable.')
    expect(screen.queryByRole('form', { name: 'Publication' })).toBeNull()
    cleanup()

    const refused = vi.fn(async () => {
      throw new ApiError('Semver must be strictly increasing: 1.1.0 is not greater than published 1.2.0', 409)
    })
    const again = await openPublication(api(refused))
    fireEvent.change(screen.getByLabelText('Changelog de la version (obligatoire)'), { target: { value: 'x' } })
    await act(async () => {
      fireEvent.click(again)
    })
    expect(screen.getByRole('alert').textContent).toBe('Semver must be strictly increasing: 1.1.0 is not greater than published 1.2.0')
    expect(screen.getByRole('form', { name: 'Publication' })).toBeDefined()
    expect(screen.getByText('Confirmer la publication').disabled).toBe(false)
  })
})
