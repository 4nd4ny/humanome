// UC-PRO-02 — Créer et éditer un brouillon de paquet de prompts : tests
// UNITAIRES (front).
// Fiche : docs/cas-utilisation/promptologue/UC-PRO-02-editer-brouillon-paquet.md
//
// Code sollicité appelé directement : le client de l'atelier
// (createPromptologueApi — routes des brouillons), la suggestion de version
// (suggestNextVersion), la normalisation des entrées de brouillon
// (normalizeDraftEntry) et la route de l'éditeur (parseHash).
import { describe, expect, it, vi } from 'vitest'
import {
  createPromptologueApi,
  normalizeDraftEntry,
  suggestNextVersion,
} from '../../../src/views/promptologue/api.js'
import { parseHash } from '../../../src/router.js'

describe('UC-PRO-02 — client de l’atelier : brouillons', () => {
  it('UC-PRO-02-U16 — createDraft : POST {fromId, fromVersion, version}, toId joint seulement s’il est fourni', async () => {
    const apiFetchFn = vi.fn(async () => ({ draftId: 12 }))
    const api = createPromptologueApi(apiFetchFn)

    await api.createDraft({ fromId: 'aurora-demo', fromVersion: '1.0.0', version: '1.1.0' })
    await api.createDraft({ fromId: 'aurora-demo', fromVersion: '1.0.0', version: '1.2.0', toId: undefined })
    await api.createDraft({ fromId: 'twin6-ouverte', fromVersion: '1.0.0', version: '1.0.1', toId: 'mon-twin6' })

    expect(apiFetchFn.mock.calls).toEqual([
      ['prompt-packages/drafts', { method: 'POST', body: { fromId: 'aurora-demo', fromVersion: '1.0.0', version: '1.1.0' } }],
      ['prompt-packages/drafts', { method: 'POST', body: { fromId: 'aurora-demo', fromVersion: '1.0.0', version: '1.2.0' } }],
      ['prompt-packages/drafts', { method: 'POST', body: { fromId: 'twin6-ouverte', fromVersion: '1.0.0', version: '1.0.1', toId: 'mon-twin6' } }],
    ])
  })

  it('UC-PRO-02-U17 — listDrafts, getDraft, saveDraft (PUT enveloppe {document}) et diffDraftOrigin', async () => {
    const apiFetchFn = vi.fn(async () => ({}))
    const api = createPromptologueApi(apiFetchFn)
    const document = { kind: 'prompt-package', id: 'aurora-demo', version: '1.1.0' }

    await api.listDrafts()
    await api.getDraft('12')
    await api.saveDraft('12', document)
    await api.diffDraftOrigin('12/x')

    expect(apiFetchFn.mock.calls).toEqual([
      ['prompt-packages/drafts'],
      ['prompt-packages/drafts/12'],
      ['prompt-packages/drafts/12', { method: 'PUT', body: { document } }],
      ['prompt-packages/drafts/12%2Fx/diff-origin'],
    ])
  })
})

describe('UC-PRO-02 — logique de l’accueil et de l’éditeur', () => {
  it('UC-PRO-02-U18 — suggestNextVersion : incrément du correctif, repli 1.0.1 si non semver', () => {
    expect(suggestNextVersion('1.0.0')).toBe('1.0.1')
    expect(suggestNextVersion('2.3.9')).toBe('2.3.10')
    expect(suggestNextVersion('1.4.0-rc.1')).toBe('1.4.1')
    expect(suggestNextVersion('v2')).toBe('1.0.1')
    expect(suggestNextVersion(undefined)).toBe('1.0.1')
  })

  it('UC-PRO-02-U19 — normalizeDraftEntry : forme GET drafts (sans document), GET drafts/{id} (avec), document nu, entrée invalide', () => {
    // Forme RÉELLE de GET api/prompt-packages/drafts : métadonnées seulement.
    expect(
      normalizeDraftEntry({ draftId: 12, id: 'aurora-demo', version: '1.1.0', description: 'd', createdAt: '2026-07-01T09:00:00' }),
    ).toEqual({ draftId: '12', document: null, fromId: null, fromVersion: null, updatedAt: null })

    const document = { kind: 'prompt-package', id: 'aurora-demo', version: '1.1.0' }
    expect(normalizeDraftEntry({ draftId: 12, id: 'aurora-demo', status: 'draft', document })).toMatchObject({ draftId: '12', document })
    // Document nu (tolérance historique) : l'id sert de draftId.
    expect(normalizeDraftEntry(document)).toMatchObject({ draftId: 'aurora-demo', document })
    expect(normalizeDraftEntry(null)).toBeNull()
    expect(normalizeDraftEntry({ document })).toBeNull()
  })

  it('UC-PRO-02-U20 — #/promptologue/editeur/<draftId> ouvre l’éditeur (section décodée)', () => {
    expect(parseHash('#/promptologue/editeur/12')).toEqual({ name: 'promptologue', section: 'editeur/12' })
    expect(parseHash('#/promptologue/editeur%2F12')).toEqual({ name: 'promptologue', section: 'editeur/12' })
  })
})
