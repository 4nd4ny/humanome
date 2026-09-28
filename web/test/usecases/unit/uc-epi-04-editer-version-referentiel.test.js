// UC-EPI-04 — Éditer une version complète du référentiel : tests UNITAIRES (front).
// Fiche : docs/cas-utilisation/epistemiarque/UC-EPI-04-editer-version-referentiel.md
//
// Le grain « version » n'a pas de vue : seul son client fin existe
// (web/src/views/epistemiarque/api.js, branché sur aucune vue — fiche, L1).
// On vérifie qu'il suit le contrat de api/src/routes/referentiel.php
// (chemins, méthodes, corps) et sa suggestion de version.
import { describe, expect, it, vi } from 'vitest'
import {
  DECIDIM_URL,
  createEpistemiarqueApi,
  suggestNextVersion,
} from '../../../src/views/epistemiarque/api.js'

describe('UC-EPI-04 — client du grain version (api.js)', () => {
  it('UC-EPI-04-U10 — lectures : dernière publiée, versions, brouillons, un brouillon', async () => {
    const apiFetchFn = vi.fn(async () => ({}))
    const api = createEpistemiarqueApi(apiFetchFn)

    await api.getPublished()
    await api.listVersions()
    await api.listDrafts()
    await api.getDraft(12)

    expect(apiFetchFn.mock.calls).toEqual([
      ['referentiel'],
      ['referentiel/versions'],
      ['referentiel/drafts'],
      ['referentiel/drafts/12'],
    ])
  })

  it('UC-EPI-04-U11 — cycle d’édition : fork {from, semver, label}, PUT du document complet, soumission, retrait, publication', async () => {
    const apiFetchFn = vi.fn(async () => ({}))
    const api = createEpistemiarqueApi(apiFetchFn)
    const doc = { id: 'respire', version: '7.1.0', poles: [], competences: [] }

    await api.createDraft({ from: '7.0.0', semver: '7.1.0', label: 'RESPIRE v7.1' })
    await api.saveDraft(12, doc)
    await api.submitDraft(12, 'https://participer.harmonia.education/d/9')
    await api.submitDraft(12)
    await api.withdrawDraft(12)
    await api.publishDraft(12, 'Renommage 1.01')

    expect(apiFetchFn.mock.calls).toEqual([
      ['referentiel/drafts', { method: 'POST', body: { from: '7.0.0', semver: '7.1.0', label: 'RESPIRE v7.1' } }],
      ['referentiel/drafts/12', { method: 'PUT', body: doc }],
      ['referentiel/drafts/12/submit', { method: 'POST', body: { decidimUrl: 'https://participer.harmonia.education/d/9' } }],
      ['referentiel/drafts/12/submit', { method: 'POST', body: {} }],
      ['referentiel/drafts/12/withdraw', { method: 'POST' }],
      ['referentiel/drafts/12/publish', { method: 'POST', body: { releaseNote: 'Renommage 1.01' } }],
    ])
    // Pas d'en-tête If-Match à ce grain (fiche, L2 : dernier enregistrement gagnant).
    expect(apiFetchFn.mock.calls[1][1].headers).toBeUndefined()
  })

  it('UC-EPI-04-U12 — suggestNextVersion (mineure suivante, repli 7.1.0) et espace Decidim par défaut', () => {
    expect(suggestNextVersion('7.0.0')).toBe('7.1.0')
    expect(suggestNextVersion('7.9.2')).toBe('7.10.0')
    expect(suggestNextVersion(null)).toBe('7.1.0')
    expect(suggestNextVersion('sept')).toBe('7.1.0')
    expect(DECIDIM_URL).toBe('https://participer.harmonia.education')
  })
})
