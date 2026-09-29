// UC-EPI-01 — Proposer une modification de compétence : tests UNITAIRES (front).
// Fiche : docs/cas-utilisation/epistemiarque/UC-EPI-01-proposer-modification-competence.md
//
// Code sollicité appelé directement : le routeur (#/epistemiarque[/<section>]),
// le client fin des compétences atomiques (competence-api.js : chemins,
// méthodes, corps, en-tête If-Match), la suggestion de version et le client API
// générique (en-têtes additionnels, jeton CSRF appris de auth/me, erreurs typées)
// et la sonde de session fetchMe.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseHash } from '../../../src/router.js'
import { ApiError, ApiUnavailableError, apiFetch, fetchMe, getCsrfToken, resetApiClient } from '../../../src/api/client.js'
import {
  createCompetenceApi,
  nextCompetenceVersion,
} from '../../../src/views/epistemiarque/competence-api.js'
import { htmlResponse, jsonResponse } from '../support/epi.js'

afterEach(() => resetApiClient())

describe('UC-EPI-01 — routeur de l’atelier', () => {
  it('UC-EPI-01-U12 — #/epistemiarque, #/epistemiarque/editer/<id> et proposition/<id> ouvrent l’atelier avec la bonne section', () => {
    expect(parseHash('#/epistemiarque')).toEqual({ name: 'epistemiarque', section: null })
    expect(parseHash('#/epistemiarque/editer/12')).toEqual({ name: 'epistemiarque', section: 'editer/12' })
    expect(parseHash('#/epistemiarque/proposition/12')).toEqual({
      name: 'epistemiarque',
      section: 'proposition/12',
    })
    expect(parseHash('#/epistemiarque/editer%2F7')).toEqual({ name: 'epistemiarque', section: 'editer/7' })
  })
})

describe('UC-EPI-01 — client des compétences atomiques', () => {
  it('UC-EPI-01-U13 — lectures et fork : chemins et méthodes du contrat api/src/routes/competences.php', async () => {
    const apiFetchFn = vi.fn(async () => ({}))
    const api = createCompetenceApi(apiFetchFn)

    await api.list()
    await api.get('1.01')
    await api.listDrafts()
    await api.getDraft(12)
    await api.createDraft('1.01', '1.1.0')

    expect(apiFetchFn.mock.calls).toEqual([
      ['competences'],
      ['competences/1.01'],
      ['competences/drafts'],
      ['competences/drafts/12'],
      ['competences/1.01/drafts', { method: 'POST', body: { semver: '1.1.0' } }],
    ])
  })

  it('UC-EPI-01-U14 — saveDraft : PUT du contenu complet avec If-Match = empreinte de base (aucun en-tête sans base)', async () => {
    const apiFetchFn = vi.fn(async () => ({}))
    const api = createCompetenceApi(apiFetchFn)
    const content = { identite: { code: '1.01', nom: 'Pensée Critique' } }

    await api.saveDraft(12, content, 'abc123')
    await api.saveDraft(12, content, null)

    expect(apiFetchFn.mock.calls[0]).toEqual([
      'competences/drafts/12',
      { method: 'PUT', body: content, headers: { 'If-Match': 'abc123' } },
    ])
    expect(apiFetchFn.mock.calls[1][1].headers).toBeUndefined()
  })

  it('UC-EPI-01-U15 — submitDraft envoie {decidimUrl} seulement s’il est fourni ; withdrawDraft est un POST sans corps', async () => {
    const apiFetchFn = vi.fn(async () => ({}))
    const api = createCompetenceApi(apiFetchFn)

    await api.submitDraft(12, 'https://participer.harmonia.education/d/3')
    await api.submitDraft(12)
    await api.withdrawDraft(12)

    expect(apiFetchFn.mock.calls).toEqual([
      ['competences/drafts/12/submit', { method: 'POST', body: { decidimUrl: 'https://participer.harmonia.education/d/3' } }],
      ['competences/drafts/12/submit', { method: 'POST', body: {} }],
      ['competences/drafts/12/withdraw', { method: 'POST' }],
    ])
  })

  it('UC-EPI-01-U16 — nextCompetenceVersion propose la mineure suivante (repli 1.1.0)', () => {
    expect(nextCompetenceVersion('1.0.0')).toBe('1.1.0')
    expect(nextCompetenceVersion('1.9.3')).toBe('1.10.0')
    expect(nextCompetenceVersion('2.4.1-rc.1')).toBe('2.5.0')
    expect(nextCompetenceVersion(undefined)).toBe('1.1.0')
    expect(nextCompetenceVersion('v1')).toBe('1.1.0')
  })
})

describe('UC-EPI-01 — client API générique', () => {
  it('UC-EPI-01-U17 — If-Match transmis, jeton CSRF appris de auth/me renvoyé sur les mutations, 409/428 → ApiError typée', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, { user: { id: 7 }, csrfToken: 'jeton-csrf' }))
      .mockResolvedValueOnce(jsonResponse(409, { error: 'Cette compétence a été modifiée par un autre épistémiarque ; rechargez avant d\'enregistrer.' }))
      .mockResolvedValueOnce(jsonResponse(428, {}))

    await apiFetch('auth/me', { fetchFn })
    expect(getCsrfToken()).toBe('jeton-csrf')

    const conflict = await apiFetch('competences/drafts/12', {
      method: 'PUT',
      body: { identite: {} },
      headers: { 'If-Match': 'abc123' },
      fetchFn,
    }).catch((e) => e)
    const [, init] = fetchFn.mock.calls[1]
    expect(init.headers['If-Match']).toBe('abc123')
    expect(init.headers['X-CSRF-Token']).toBe('jeton-csrf')
    expect(conflict).toBeInstanceOf(ApiError)
    expect(conflict.status).toBe(409)
    expect(conflict.serverMessage).toContain('modifiée par un autre épistémiarque')

    const precondition = await apiFetch('competences/drafts/12', { method: 'PUT', body: {}, fetchFn }).catch((e) => e)
    expect(precondition.status).toBe(428)
    expect(precondition.serverMessage).toBeNull()
  })

  it('UC-EPI-01-U20 — fetchMe (étape 1) : session → {user} ; 401 → {user: null} ; 500 → ApiError ; réponse non JSON → ApiUnavailableError', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, { user: { id: 7, roles: ['epistemiarque'] }, csrfToken: 'jeton' }))
      .mockResolvedValueOnce(jsonResponse(401, { error: 'Authentication required' }))
      .mockResolvedValueOnce(jsonResponse(500, { error: 'Internal error' }))
      .mockResolvedValueOnce(htmlResponse(404))

    expect(await fetchMe({ fetchFn })).toEqual({ user: { id: 7, roles: ['epistemiarque'] } })
    expect(fetchFn.mock.calls[0][0]).toBe('api/auth/me')
    expect(await fetchMe({ fetchFn })).toEqual({ user: null })
    const serverError = await fetchMe({ fetchFn }).catch((e) => e)
    expect(serverError).toBeInstanceOf(ApiError)
    expect(serverError.status).toBe(500)
    expect(await fetchMe({ fetchFn }).catch((e) => e)).toBeInstanceOf(ApiUnavailableError)
  })
})
