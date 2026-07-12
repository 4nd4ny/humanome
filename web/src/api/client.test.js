import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  API_UNAVAILABLE_MESSAGE,
  ApiError,
  ApiUnavailableError,
  apiFetch,
  deleteAccount,
  fetchMe,
  getCsrfToken,
  login,
  logout,
  resetApiClient,
} from './client.js'

afterEach(() => {
  resetApiClient()
})

/** Response-like minimal object (jsdom has no fetch). */
function jsonResponse(status, data) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => (name.toLowerCase() === 'content-type' ? 'application/json' : null) },
    json: async () => data,
  }
}

function htmlResponse(status) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => (name.toLowerCase() === 'content-type' ? 'text/html' : null) },
    json: async () => {
      throw new Error('not json')
    },
  }
}

function noContentResponse() {
  return { ok: true, status: 204, headers: { get: () => null }, json: async () => null }
}

describe('apiFetch', () => {
  it('appelle une URL relative api/…, en same-origin, et parse le JSON', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(200, { pong: true }))
    const data = await apiFetch('health', { fetchFn })

    expect(data).toEqual({ pong: true })
    const [url, init] = fetchFn.mock.calls[0]
    expect(url).toBe('api/health') // relative : fonctionne depuis tout sous-chemin
    expect(init.credentials).toBe('same-origin')
    expect(init.headers['X-CSRF-Token']).toBeUndefined()
  })

  it('mémorise le csrfToken reçu et l’injecte sur les requêtes mutantes suivantes', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, { user: { email: 'a@b.fr' }, csrfToken: 'tok-42' }))
      .mockResolvedValueOnce(noContentResponse())

    await login({ email: 'a@b.fr', password: 'x'.repeat(10) }, { fetchFn })
    expect(getCsrfToken()).toBe('tok-42')

    await logout({ fetchFn })
    const [url, init] = fetchFn.mock.calls[1]
    expect(url).toBe('api/auth/logout')
    expect(init.method).toBe('POST')
    expect(init.headers['X-CSRF-Token']).toBe('tok-42')
    expect(getCsrfToken()).toBe(null) // déconnexion : jeton oublié
  })

  it('n’envoie jamais le jeton CSRF sur un GET', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, { csrfToken: 'tok-1' }))
      .mockResolvedValueOnce(jsonResponse(200, { user: null }))

    await apiFetch('auth/login', { fetchFn, method: 'POST', body: {} })
    await apiFetch('auth/me', { fetchFn })
    expect(fetchFn.mock.calls[1][1].headers['X-CSRF-Token']).toBeUndefined()
  })

  it('401 -> ApiError avec statut ; 429 -> message rate-limit en français', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(401, { error: { code: 'invalid_credentials' } }))
      .mockResolvedValueOnce(jsonResponse(429, { error: { code: 'rate_limited' } }))

    const err401 = await apiFetch('auth/login', { fetchFn, method: 'POST', body: {} }).catch(
      (e) => e,
    )
    expect(err401).toBeInstanceOf(ApiError)
    expect(err401.status).toBe(401)
    expect(err401.code).toBe('invalid_credentials')

    const err429 = await apiFetch('auth/login', { fetchFn, method: 'POST', body: {} }).catch(
      (e) => e,
    )
    expect(err429.status).toBe(429)
    expect(err429.message).toContain('Trop de tentatives')
  })

  it('reprend le message français du serveur et les erreurs de champs (contrat P3)', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      jsonResponse(422, {
        error: 'Validation échouée',
        fields: { password: 'Le mot de passe doit contenir au moins 10 caractères' },
      }),
    )
    const err = await apiFetch('auth/register', { fetchFn, method: 'POST', body: {} }).catch(
      (e) => e,
    )
    expect(err).toBeInstanceOf(ApiError)
    expect(err.message).toBe('Validation échouée')
    expect(err.fields.password).toContain('au moins 10 caractères')
  })

  it('panne réseau ou réponse HTML (hébergement statique) -> ApiUnavailableError', async () => {
    const down = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
    await expect(apiFetch('auth/me', { fetchFn: down })).rejects.toBeInstanceOf(
      ApiUnavailableError,
    )

    const html = vi.fn().mockResolvedValue(htmlResponse(404))
    const err = await apiFetch('auth/me', { fetchFn: html }).catch((e) => e)
    expect(err).toBeInstanceOf(ApiUnavailableError)
    expect(err.message).toBe(API_UNAVAILABLE_MESSAGE)
  })

  it('refuse d’appeler le réseau depuis file:// (copie statique)', async () => {
    const fetchFn = vi.fn()
    await expect(apiFetch('auth/me', { fetchFn, protocol: 'file:' })).rejects.toBeInstanceOf(
      ApiUnavailableError,
    )
    expect(fetchFn).not.toHaveBeenCalled()
  })
})

describe('fetchMe', () => {
  it('401 signifie « non connecté », pas une erreur', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(401, { error: {} }))
    await expect(fetchMe({ fetchFn })).resolves.toEqual({ user: null })
  })

  it('retourne l’utilisateur connecté', async () => {
    const user = { email: 'a@b.fr', displayName: 'Alice', roles: ['apprenant'] }
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(200, { user, csrfToken: 't' }))
    await expect(fetchMe({ fetchFn })).resolves.toEqual({ user })
    expect(getCsrfToken()).toBe('t')
  })
})

describe('deleteAccount', () => {
  it('DELETE api/auth/account avec le jeton CSRF, puis oublie le jeton', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, { user: {}, csrfToken: 'tok-9' }))
      .mockResolvedValueOnce(noContentResponse())

    await login({ email: 'a@b.fr', password: 'x'.repeat(10) }, { fetchFn })
    await deleteAccount({ fetchFn })

    const [url, init] = fetchFn.mock.calls[1]
    expect(url).toBe('api/auth/account')
    expect(init.method).toBe('DELETE')
    expect(init.headers['X-CSRF-Token']).toBe('tok-9')
    expect(getCsrfToken()).toBe(null)
  })
})
