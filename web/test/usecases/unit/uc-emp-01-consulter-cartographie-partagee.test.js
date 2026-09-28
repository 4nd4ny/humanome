// UC-EMP-01 — Consulter une cartographie partagée : tests UNITAIRES (front).
// Fiche : docs/cas-utilisation/employeur/UC-EMP-01-consulter-cartographie-partagee.md
//
// Code sollicité appelé directement : le routeur par hash (le lien reçu par
// l'employeur est #/partage/<jeton>), le client API (POST sans session, erreurs
// HTTP -> ApiError typée) et la règle de longueur minimale du mot de passe.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseHash } from '../../../src/router.js'
import { ApiError, apiFetch, resetApiClient } from '../../../src/api/client.js'
import { SHARE_PASSWORD_MIN_LENGTH } from '../../../src/views/ShareView.jsx'

afterEach(() => resetApiClient())

function jsonResponse(status, data) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => (name.toLowerCase() === 'content-type' ? 'application/json' : null) },
    json: async () => data,
  }
}

describe('UC-EMP-01 — routeur : le lien de partage', () => {
  it('UC-EMP-01-U10 — #/partage/<jeton hex 32> ouvre la route publique « share »', () => {
    const token = '0123456789abcdef0123456789abcdef'
    expect(parseHash(`#/partage/${token}`)).toEqual({ name: 'share', token })
  })

  it('UC-EMP-01-U11 — un jeton trop court ou avec des caractères interdits n’est pas une route de partage', () => {
    expect(parseHash('#/partage/abc').name).toBe('not-found')
    expect(parseHash('#/partage/abc%20def0123456').name).toBe('not-found')
    expect(parseHash('#/partage/').name).toBe('not-found')
  })
})

describe('UC-EMP-01 — client API : POST api/share/<jeton>', () => {
  it('UC-EMP-01-U12 — envoie {password} en JSON, sans jeton CSRF quand aucune session n’existe', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      jsonResponse(200, { titre: 'T', type: 'jour', document: {}, garantie: null }),
    )
    const data = await apiFetch('share/abc', { method: 'POST', body: { password: 'sesame-employeur' }, fetchFn })

    expect(data.titre).toBe('T')
    const [url, init] = fetchFn.mock.calls[0]
    expect(url).toBe('api/share/abc')
    expect(init.method).toBe('POST')
    expect(init.credentials).toBe('same-origin')
    expect(init.headers['Content-Type']).toBe('application/json')
    expect(init.headers['X-CSRF-Token']).toBeUndefined()
    expect(JSON.parse(init.body)).toEqual({ password: 'sesame-employeur' })
  })

  it.each([
    [403, 'Mot de passe incorrect'],
    [404, 'Lien de partage introuvable ou expiré'],
    [422, 'Mot de passe requis'],
    [429, 'Trop de tentatives, réessayez plus tard'],
  ])('UC-EMP-01-U13 — HTTP %i -> ApiError portant le statut et le message serveur', async (status, error) => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(status, { error }))
    const failure = await apiFetch('share/abc', { method: 'POST', body: { password: 'x' }, fetchFn }).catch(
      (e) => e,
    )
    expect(failure).toBeInstanceOf(ApiError)
    expect(failure.status).toBe(status)
    expect(failure.message).toBe(error)
  })
})

describe('UC-EMP-01 — règle de gestion du mot de passe', () => {
  it('UC-EMP-01-U14 — minimum 8 caractères, aligné sur la règle de création du lien côté API', () => {
    expect(SHARE_PASSWORD_MIN_LENGTH).toBe(8)
  })
})
