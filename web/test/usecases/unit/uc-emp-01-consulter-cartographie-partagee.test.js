// UC-EMP-01 — Consulter une cartographie partagée : tests UNITAIRES (front).
// Fiche : docs/cas-utilisation/employeur/UC-EMP-01-consulter-cartographie-partagee.md
//
// Code sollicité appelé directement : le routeur par hash (le lien reçu par
// l'employeur est #/partage/<jeton>), le client API (POST sans session, erreurs
// HTTP -> ApiError typée) et le composant ShareView rendu SEUL (sans shell ni
// réseau : coutures fetchFn / getReferentiel) pour sa logique propre — contrôle
// local de longueur, traduction statut -> message, mention de garantie.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { parseHash } from '../../../src/router.js'
import { ApiError, apiFetch, resetApiClient } from '../../../src/api/client.js'
import ShareView, { SHARE_PASSWORD_MIN_LENGTH } from '../../../src/views/ShareView.jsx'

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

/** ShareView seul ; le référentiel ne se résout jamais (le corps reste « Chargement… »). */
function renderShareView(fetchFn) {
  render(
    createElement(ShareView, {
      token: '0123456789abcdef0123456789abcdef',
      fetchFn,
      getReferentiel: () => new Promise(() => {}),
    }),
  )
}

async function submit(value) {
  fireEvent.change(screen.getByLabelText('Mot de passe du lien'), { target: { value } })
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Consulter la cartographie' }))
  })
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
  it('UC-EMP-01-U14 — minimum 8 caractères, aligné sur l’API : 7 refusés localement sans requête, 8 envoyés', async () => {
    expect(SHARE_PASSWORD_MIN_LENGTH).toBe(8)
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(403, { error: 'Mot de passe incorrect' }))
    renderShareView(fetchFn)

    await submit('x'.repeat(SHARE_PASSWORD_MIN_LENGTH - 1))
    expect(screen.getByRole('alert').textContent).toBe(
      'Le mot de passe d’un lien de partage compte au moins 8 caractères.',
    )
    expect(fetchFn).not.toHaveBeenCalled()

    await submit('x'.repeat(SHARE_PASSWORD_MIN_LENGTH))
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })
})

describe('UC-EMP-01 — ShareView : mention de garantie et messages d’erreur', () => {
  it('UC-EMP-01-U16 — mention de garantie : garant sans nom → « son cartographe », date tronquée à AAAA-MM-JJ ; sans garantie → aucune mention', async () => {
    const answers = [
      { par: '', date: '2026-07-10T09:00:00', revisionId: null },
      { par: 'Camille', date: '', revisionId: 4 },
      null,
    ].map((garantie) => jsonResponse(200, { titre: 'Parcours', type: 'merge', document: {}, garantie }))
    const expected = [
      'Cartographie relue et garantie par son cartographe le 2026-07-10.',
      'Cartographie relue et garantie par Camille.',
      null,
    ]

    for (const [i, answer] of answers.entries()) {
      renderShareView(vi.fn().mockResolvedValue(answer))
      await submit('sesame-employeur')
      expect(screen.getByRole('heading', { name: 'Parcours' })).toBeDefined()
      const mention = screen.queryByTestId('share-garantie')
      expect(mention === null ? null : mention.textContent).toBe(expected[i])
      cleanup()
    }
  })

  it.each([
    [403, 'Mot de passe incorrect', 'Mot de passe incorrect.'],
    [404, 'Lien de partage introuvable ou expiré', 'Ce lien de partage n’existe pas, a expiré ou a été révoqué par son auteur.'],
    [429, 'Trop de tentatives, réessayez plus tard', 'Trop de tentatives. Patientez quelques minutes avant de réessayer.'],
    [422, 'Mot de passe requis', 'Mot de passe requis'],
    // AN2 — comportement ACTUEL figé : le 403 du middleware CSRF est lu comme
    // un mauvais mot de passe (tout 403 est traduit sans regarder le message).
    [403, 'Jeton CSRF absent ou invalide', 'Mot de passe incorrect.'],
  ])('UC-EMP-01-U17 — HTTP %i « %s » → message affiché « %s », formulaire conservé', async (status, error, shown) => {
    renderShareView(vi.fn().mockResolvedValue(jsonResponse(status, { error })))
    await submit('sesame-employeur')

    expect(screen.getByRole('alert').textContent).toBe(shown)
    expect(screen.getByLabelText('Mot de passe du lien')).toBeDefined()
  })
})
