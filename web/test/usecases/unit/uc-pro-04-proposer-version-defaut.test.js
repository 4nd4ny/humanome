// UC-PRO-04 — Proposer une version par défaut : tests UNITAIRES (front).
// Fiche : docs/cas-utilisation/promptologue/UC-PRO-04-proposer-version-defaut.md
//
// Code sollicité appelé directement : createPromptologueApi.proposeDefault
// (POST sans corps sur la version choisie, segments encodés).
import { describe, expect, it, vi } from 'vitest'
import { createPromptologueApi } from '../../../src/views/promptologue/api.js'

describe('UC-PRO-04 — client de l’atelier : proposition', () => {
  it('UC-PRO-04-U04 — proposeDefault : POST {id}/{version}/propose-default, sans corps, segments encodés', async () => {
    const apiFetchFn = vi.fn(async () => ({ status: 'proposed' }))
    const api = createPromptologueApi(apiFetchFn)

    await api.proposeDefault('aurora-demo', '1.0.0')
    await api.proposeDefault('mon paquet', '2.0.0+build.1')

    expect(apiFetchFn.mock.calls).toEqual([
      ['prompt-packages/aurora-demo/1.0.0/propose-default', { method: 'POST' }],
      ['prompt-packages/mon%20paquet/2.0.0%2Bbuild.1/propose-default', { method: 'POST' }],
    ])
  })
})
