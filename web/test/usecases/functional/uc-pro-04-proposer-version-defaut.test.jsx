// UC-PRO-04 — Proposer une version par défaut : tests FONCTIONNELS (IHM).
// Fiche : docs/cas-utilisation/promptologue/UC-PRO-04-proposer-version-defaut.md
//
// Le scénario est joué sur l'application ENTIÈRE (<App/>) : sur l'accueil de
// l'atelier (#/promptologue), le promptologue clique « Proposer par défaut »
// sur une version publiée qui n'est pas le défaut. Réseau simulé par le faux
// serveur du lot (test/usecases/support/pro.js) : la proposition est rangée à
// part et ne change pas le défaut servi.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import App from '../../../src/App.jsx'
import { resetApiClient } from '../../../src/api/client.js'
import * as fakeLib from '../../../src/test/fake-sunburst-lib.js'
import { CSRF, PROMPTOLOGUE, createPromptologueBackend, jsonResponse, packageDoc } from '../support/pro.js'

function openWorkshop(backend) {
  vi.stubGlobal('fetch', backend.fetchMock)
  window.location.hash = '#/promptologue'
  render(<App lib={fakeLib} fetchMeFn={async () => ({ user: PROMPTOLOGUE })} />)
}

async function rows() {
  const table = await screen.findByRole('table')
  return within(table).getAllByRole('row').slice(1)
}

beforeEach(() => resetApiClient())

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  window.location.hash = ''
  resetApiClient()
})

describe('UC-PRO-04 — proposer une version par défaut depuis l’accueil', () => {
  it('UC-PRO-04-F06 — nominal : « Proposer par défaut » sur 1.0.0 → POST + CSRF, confirmation, défaut affiché inchangé', async () => {
    const backend = createPromptologueBackend({ published: [packageDoc(), packageDoc({ version: '2.0.0' })] })
    openWorkshop(backend)

    const [v1, v2] = await rows()
    // Seules les versions qui ne sont pas le défaut offrent le bouton.
    expect(within(v2).queryByRole('button', { name: 'Proposer par défaut' })).toBeNull()
    await act(async () => {
      fireEvent.click(within(v1).getByRole('button', { name: 'Proposer par défaut' }))
    })

    expect((await screen.findByText(/Proposition envoyée/)).textContent).toBe(
      'Proposition envoyée : aurora-demo@1.0.0 comme version par défaut (validation admin requise).',
    )
    const [call] = backend.callsTo('POST', 'api/prompt-packages/aurora-demo/1.0.0/propose-default')
    expect(call.headers['X-CSRF-Token']).toBe(CSRF)
    expect(call.body).toBeUndefined()
    expect(backend.state.proposal).toMatchObject({ id: 'aurora-demo', version: '1.0.0', proposedBy: PROMPTOLOGUE.id })
    // Le défaut reste 2.0.0 tant que l'admin n'a pas validé (UC-ADM-03).
    expect(v2.querySelector('.promptologue-defaut')).not.toBeNull()
    expect(v1.querySelector('.promptologue-defaut')).toBeNull()
  })

  it('UC-PRO-04-F07 — E2 : la version n’est plus proposable côté serveur (404) → message d’erreur, aucune proposition', async () => {
    const backend = createPromptologueBackend({
      published: [packageDoc(), packageDoc({ version: '2.0.0' })],
      routes: {
        'POST api/prompt-packages/aurora-demo/1.0.0/propose-default': () =>
          jsonResponse(404, { error: 'Version publiée introuvable' }),
      },
    })
    openWorkshop(backend)

    const [v1] = await rows()
    await act(async () => {
      fireEvent.click(within(v1).getByRole('button', { name: 'Proposer par défaut' }))
    })

    expect((await screen.findByRole('alert')).textContent).toBe('Version publiée introuvable')
    expect(backend.state.proposal).toBeNull()
  })
})
