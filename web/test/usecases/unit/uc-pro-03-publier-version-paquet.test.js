// UC-PRO-03 — Publier une version de paquet (immuable) : tests UNITAIRES
// (front).
// Fiche : docs/cas-utilisation/promptologue/UC-PRO-03-publier-version-paquet.md
//
// Code sollicité appelé directement : le client de l'atelier
// (createPromptologueApi.publishDraft) et le client HTTP commun (apiFetch) qui
// joint le jeton CSRF de la session à la publication et remonte les refus du
// serveur (409 semver / immuabilité) en ApiError affichable.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createPromptologueApi } from '../../../src/views/promptologue/api.js'
import { ApiError, apiFetch, resetApiClient } from '../../../src/api/client.js'

afterEach(() => resetApiClient())

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
