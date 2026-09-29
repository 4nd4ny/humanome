// UC-PRO-04 — Proposer une version par défaut : tests UNITAIRES (front).
// Fiche : docs/cas-utilisation/promptologue/UC-PRO-04-proposer-version-defaut.md
//
// Code sollicité appelé directement : createPromptologueApi.proposeDefault
// (POST sans corps sur la version choisie, segments encodés) et AccueilSection
// rendue seule avec un client simulé (bouton masqué sur le défaut, message de
// confirmation, message d'erreur et repli).
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { createPromptologueApi } from '../../../src/views/promptologue/api.js'
import AccueilSection from '../../../src/views/promptologue/AccueilSection.jsx'

afterEach(cleanup)

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

describe('UC-PRO-04 — AccueilSection isolée : « Proposer par défaut »', () => {
  function fakeApi(proposeDefault) {
    return {
      listPublished: vi.fn(async () => [
        { id: 'aurora-demo', version: '1.0.0' },
        { id: 'aurora-demo', version: '2.0.0' },
      ]),
      listDrafts: vi.fn(async () => []),
      getDefault: vi.fn(async () => ({ id: 'aurora-demo', version: '2.0.0' })),
      proposeDefault,
    }
  }

  async function proposeV1(proposeDefault) {
    render(createElement(AccueilSection, { api: fakeApi(proposeDefault) }))
    const [v1, v2] = within(await screen.findByRole('table')).getAllByRole('row').slice(1)
    expect(within(v2).queryByRole('button', { name: 'Proposer par défaut' })).toBeNull()
    await act(async () => {
      fireEvent.click(within(v1).getByRole('button', { name: 'Proposer par défaut' }))
    })
    return { v1, v2 }
  }

  it('UC-PRO-04-U05 — bouton absent sur le défaut ; succès : proposeDefault(id, version) et message ; échec : message de l’erreur, sinon repli', async () => {
    const ok = vi.fn(async () => ({ status: 'proposed' }))
    const { v2 } = await proposeV1(ok)
    expect(ok).toHaveBeenCalledWith('aurora-demo', '1.0.0')
    expect(screen.getByRole('status').textContent).toBe(
      'Proposition envoyée : aurora-demo@1.0.0 comme version par défaut (validation admin requise).',
    )
    expect(v2.querySelector('.promptologue-defaut')?.textContent).toBe('par défaut')
    cleanup()

    await proposeV1(vi.fn(async () => Promise.reject(new Error('Version publiée introuvable'))))
    expect(screen.getByRole('alert').textContent).toBe('Version publiée introuvable')
    cleanup()

    await proposeV1(vi.fn(async () => Promise.reject({})))
    expect(screen.getByRole('alert').textContent).toBe('La proposition a échoué.')
  })
})
