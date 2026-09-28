// UC-ADM-03 — Valider le paquet par défaut et les réglages : tests
// FONCTIONNELS (IHM).
// Fiche : docs/cas-utilisation/administration/UC-ADM-03-valider-paquet-defaut-reglages.md
//
// Le scénario est joué sur l'application ENTIÈRE (<App/>) : l'administrateur
// ouvre #/admin/reglages, lit la version effective et la proposition en
// attente, choisit une version publiée et la valide, et lit l'état du worker
// de masse. Réseau simulé par le faux serveur du lot
// (test/usecases/support/pro.js : mêmes formes que PlatformStatus et
// routes/admin.php, RequireRole admin, jeton CSRF).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import App from '../../../src/App.jsx'
import { resetApiClient } from '../../../src/api/client.js'
import * as fakeLib from '../../../src/test/fake-sunburst-lib.js'
import { ADMIN, CSRF, PROMPTOLOGUE, createPromptologueBackend, jsonResponse, packageDoc } from '../support/pro.js'

function openAdmin(hash, backend, me = ADMIN) {
  vi.stubGlobal('fetch', backend.fetchMock)
  window.location.hash = hash
  render(<App lib={fakeLib} fetchMeFn={async () => ({ user: me })} />)
}

/** Bloc « Version de prompt par défaut » une fois chargé. */
async function defaultBlock() {
  const heading = await screen.findByRole('heading', { name: 'Version de prompt par défaut' })
  return heading.closest('.admin-default-package')
}

beforeEach(() => resetApiClient())

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  window.location.hash = ''
  resetApiClient()
})

describe('UC-ADM-03 — l’administrateur valide le paquet par défaut', () => {
  it('UC-ADM-03-F08 — nominal : proposition en attente → choisir 1.0.0 → « Valider comme défaut » → défaut validé', async () => {
    const backend = createPromptologueBackend({
      me: ADMIN,
      published: [packageDoc(), packageDoc({ version: '2.0.0' })],
      proposal: { id: 'aurora-demo', version: '1.0.0', proposedBy: PROMPTOLOGUE.id, proposedAt: '2026-07-03T10:00:00+00:00' },
    })
    openAdmin('#/admin/reglages', backend)

    const block = await defaultBlock()
    expect(block.textContent).toContain('Effectif : aurora-demo 2.0.0 (dernier publié, par défaut).')
    expect(within(block).getByTestId('default-proposal').textContent).toBe(
      'Proposition promptologue en attente : aurora-demo 1.0.0.',
    )
    const button = within(block).getByRole('button', { name: 'Valider comme défaut' })
    expect(button.disabled).toBe(true) // aucun choix

    fireEvent.change(within(block).getByLabelText('Valider un paquet publié comme défaut'), {
      target: { value: 'aurora-demo@1.0.0' },
    })
    await act(async () => {
      fireEvent.click(button)
    })

    expect((await screen.findByText('Paquet par défaut : aurora-demo 1.0.0.')).getAttribute('role')).toBe('status')
    const [call] = backend.callsTo('POST', 'api/admin/settings/default-package')
    expect(call.body).toEqual({ id: 'aurora-demo', version: '1.0.0' })
    expect(call.headers['X-CSRF-Token']).toBe(CSRF)
    // Rechargement de l'instantané : validé, proposition consommée.
    await waitFor(() => expect(block.textContent).toContain('Effectif : aurora-demo 1.0.0 (validé).'))
    expect(within(block).queryByTestId('default-proposal')).toBeNull()
    expect(backend.callsTo('GET', 'api/admin/settings')).toHaveLength(2)
  })

  it('UC-ADM-03-F09 — E3 : la version n’est plus publiée côté serveur (404) → alerte, rien de validé', async () => {
    const backend = createPromptologueBackend({
      me: ADMIN,
      routes: {
        'POST api/admin/settings/default-package': () => jsonResponse(404, { error: 'Version publiée introuvable' }),
      },
    })
    openAdmin('#/admin/reglages', backend)

    const block = await defaultBlock()
    fireEvent.change(within(block).getByLabelText('Valider un paquet publié comme défaut'), {
      target: { value: 'aurora-demo@1.0.0' },
    })
    await act(async () => {
      fireEvent.click(within(block).getByRole('button', { name: 'Valider comme défaut' }))
    })

    expect((await screen.findByRole('alert')).textContent).toBe('Version publiée introuvable')
    expect(backend.state.stored).toBeNull()
  })

  it('UC-ADM-03-F10 — E4 (IHM) : aucun paquet publié → « aucun paquet publié », choix impossible', async () => {
    const backend = createPromptologueBackend({ me: ADMIN, published: [] })
    openAdmin('#/admin/reglages', backend)

    const block = await defaultBlock()
    expect(block.textContent).toContain('Effectif : aucun paquet publié.')
    expect(within(block).getByLabelText('Valider un paquet publié comme défaut').disabled).toBe(true)
  })

  it('UC-ADM-03-F11 — E1 (IHM) : un promptologue (non admin) voit l’explication du rôle, aucun réglage n’est lu', async () => {
    const backend = createPromptologueBackend({ me: PROMPTOLOGUE })
    openAdmin('#/admin/reglages', backend, PROMPTOLOGUE)

    expect((await screen.findByTestId('admin-reserve')).textContent).toContain(
      'Cet espace est réservé à l’administration de la plateforme.',
    )
    expect(backend.calls.some((c) => c.url.startsWith('api/admin/'))).toBe(false)
  })

  it('UC-ADM-03-F12 — A3 : état du worker de masse (jobs en file, runs actifs, dernière activité, terminés / échoués)', async () => {
    const backend = createPromptologueBackend({
      me: ADMIN,
      worker: { jobsInQueue: 3, byStatus: { queued: 2, running: 1, done: 4, failed: 1 }, activeRuns: 1, lastActivity: '2026-07-05T10:00:00' },
    })
    openAdmin('#/admin/reglages', backend)

    expect((await screen.findByTestId('worker-queue')).textContent).toBe('3')
    const rows = [...screen.getByTestId('worker-queue').closest('table').querySelectorAll('tr')].map((tr) => [
      tr.querySelector('th').textContent,
      tr.querySelector('td').textContent,
    ])
    expect(rows.slice(0, 4)).toEqual([
      ['Jobs en file (en attente + en cours)', '3'],
      ['Runs actifs', '1'],
      ['Dernière activité', new Date('2026-07-05T10:00:00').toLocaleDateString('fr-FR')],
      ['Terminés / échoués', '4 / 1'],
    ])
  })
})
