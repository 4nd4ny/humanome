// UC-APP-04 — Stocker une cartographie sur le serveur et régler sa
// confidentialité : tests UNITAIRES (front).
// Fiche : docs/cas-utilisation/apprenant/UC-APP-04-stocker-regler-confidentialite.md
//
// Code sollicité appelé directement : le carto-store local (visibilité par
// défaut, trace de la copie serveur `serverId`), les ponts de chargement du
// panneau et du store, le client API (jeton CSRF en mémoire rejoué sur les
// mutations) et le composant CartographiesPanel rendu isolément (corps du
// POST d'opt-in, niveaux de confidentialité proposés).
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { createCartoStore, createMemoryAdapter, VISIBILITIES } from '../../../src/lib/carto-store.js'
import {
  createMemoryAdapter as createPortfolioMemoryAdapter,
  createPortfolioStore,
} from '../../../src/lib/portfolio-store.js'
import { apiFetch, resetApiClient } from '../../../src/api/client.js'
import {
  hasCartographiesPanel,
  loadCartographiesPanel,
} from '../../../src/views/espace/cartographies-panel-bridge.js'
import { hasCartoStore, loadCartoStore } from '../../../src/views/espace/carto-store-bridge.js'
import CartographiesPanel from '../../../src/views/espace/CartographiesPanel.jsx'
import { APPS_CSRF, createFakeApi, jsonResponse, meRoute, noContentResponse } from '../support/apps.js'
import dayFixture from '../../../../schemas/fixtures/cartographie-jour-2026-01-05.json'

afterEach(() => {
  cleanup()
  resetApiClient()
})

function makeStore() {
  let tick = 0
  let seq = 0
  return createCartoStore(createMemoryAdapter(), {
    now: () => new Date(Date.UTC(2026, 6, 1, 12, 0, tick++)).toISOString(),
    id: () => `local-${++seq}`,
  })
}

describe('UC-APP-04 — carto-store : la cartographie vit d’abord dans le navigateur', () => {
  it('UC-APP-04-U11 — trois niveaux alignés sur l’API ; « privée » et sans copie serveur par défaut', async () => {
    expect(VISIBILITIES).toEqual(['privee', 'cartographe', 'publique'])
    const store = makeStore()

    const { id } = await store.saveCartography({ titre: 'Nouvelle', document: dayFixture })
    const record = await store.getCartography(id)
    expect(record.visibility).toBe('privee')
    expect(record.serverId).toBeNull()

    // Valeur hors contrat : ramenée au défaut protecteur.
    const { id: other } = await store.saveCartography({ titre: 'X', visibility: 'amis' })
    expect((await store.getCartography(other)).visibility).toBe('privee')
  })

  it('UC-APP-04-U12 — updateCartography consigne serverId puis la visibilité, sans perdre le reste', async () => {
    const store = makeStore()
    const { id } = await store.saveCartography({ titre: 'Journée', document: dayFixture })
    const before = await store.getCartography(id)

    await store.updateCartography(id, { serverId: 42 })
    const after = await store.updateCartography(id, { visibility: 'cartographe' })

    expect(after.serverId).toBe(42)
    expect(after.visibility).toBe('cartographe')
    expect(after.document).toEqual(dayFixture)
    expect(after.createdAt).toBe(before.createdAt)
    expect(after.updatedAt > before.updatedAt).toBe(true)
    await expect(store.updateCartography('inconnu', { serverId: 1 })).rejects.toThrow(
      'Cartographie introuvable (id inconnu).',
    )
  })
})

describe('UC-APP-04 — ponts de chargement (chantier C)', () => {
  it('UC-APP-04-U13 — le panneau et le carto-store sont présents et chargeables', async () => {
    expect(hasCartographiesPanel()).toBe(true)
    expect(await loadCartographiesPanel()).toBe(CartographiesPanel)

    expect(hasCartoStore()).toBe(true)
    const mod = await loadCartoStore()
    for (const fn of [
      'listCartographies',
      'saveCartography',
      'getCartography',
      'removeCartography',
      'updateCartography',
    ]) {
      expect(typeof mod[fn]).toBe('function')
    }
  })
})

describe('UC-APP-04 — client API : le jeton CSRF accompagne les mutations', () => {
  it('UC-APP-04-U14 — après auth/me, POST/PATCH/DELETE portent X-CSRF-Token ; GET non', async () => {
    const api = createFakeApi([
      meRoute(),
      ['GET', 'cartographies', () => jsonResponse(200, [])],
      ['POST', 'cartographies', () => jsonResponse(201, { id: 42 })],
      ['PATCH', 'cartographies/42', () => jsonResponse(200, { id: 42 })],
      ['DELETE', 'cartographies/42', () => noContentResponse()],
    ])
    const fetchFn = api.fetch

    await apiFetch('auth/me', { fetchFn })
    await apiFetch('cartographies', { fetchFn })
    expect(await apiFetch('cartographies', { method: 'POST', body: { titre: 'x' }, fetchFn })).toEqual({ id: 42 })
    await apiFetch('cartographies/42', { method: 'PATCH', body: { visibility: 'publique' }, fetchFn })
    expect(await apiFetch('cartographies/42', { method: 'DELETE', fetchFn })).toBeNull()

    const byKey = Object.fromEntries(api.requests.map((r) => [`${r.method} ${r.path}`, r.headers]))
    expect(byKey['GET cartographies']['X-CSRF-Token']).toBeUndefined()
    expect(byKey['POST cartographies']['X-CSRF-Token']).toBe(APPS_CSRF)
    expect(byKey['PATCH cartographies/42']['X-CSRF-Token']).toBe(APPS_CSRF)
    expect(byKey['DELETE cartographies/42']['X-CSRF-Token']).toBe(APPS_CSRF)
  })
})

describe('UC-APP-04 — CartographiesPanel isolé', () => {
  async function renderPanel(store, fetchFn) {
    render(
      <CartographiesPanel
        store={store}
        portfolioStore={createPortfolioStore(createPortfolioMemoryAdapter())}
        fetchFn={fetchFn}
      />,
    )
    return screen.findAllByTestId('carto-item')
  }

  it('UC-APP-04-U15 — corps du POST d’opt-in : références de versions et runMeta seulement si connues', async () => {
    const store = makeStore()
    await store.saveCartography({ titre: 'Sans traçabilité', document: dayFixture })
    await store.saveCartography({
      titre: 'Tracée',
      type: 'merge',
      visibility: 'cartographe',
      document: { kind: 'cartographie-merge' },
      promptPackage: { id: 'aurora-demo', version: '1.0.0' },
      referentiel: { id: 'respire', version: '7.0.0' },
      runMeta: { modele: 'mock', dateRun: '2026-07-01T10:00:00Z' },
    })
    const bodies = {}
    const api = createFakeApi([
      [
        'POST',
        'cartographies',
        ({ body }) => {
          bodies[body.titre] = body
          return jsonResponse(201, { id: Object.keys(bodies).length })
        },
      ],
    ])

    const items = await renderPanel(store, api.fetch)
    for (const item of items) {
      fireEvent.click(within(item).getByRole('button', { name: 'Copier sur le serveur' }))
      fireEvent.click(await within(item).findByRole('button', { name: 'Je confirme la copie sur le serveur' }))
      await within(item).findByText('copie serveur')
    }

    expect(bodies['Sans traçabilité']).toEqual({
      type: 'jour',
      titre: 'Sans traçabilité',
      visibility: 'privee',
      document: dayFixture,
    })
    expect(bodies['Tracée']).toEqual({
      type: 'merge',
      titre: 'Tracée',
      visibility: 'cartographe',
      document: { kind: 'cartographie-merge' },
      promptPackageId: 'aurora-demo',
      promptPackageVersion: '1.0.0',
      referentielId: 'respire',
      referentielVersion: '7.0.0',
      runMeta: { modele: 'mock', dateRun: '2026-07-01T10:00:00Z' },
    })
  })

  it('UC-APP-04-U16 — le sélecteur propose exactement les trois niveaux, libellés en français', async () => {
    const store = makeStore()
    await store.saveCartography({ titre: 'Analyse', type: 'twin9', document: { journal_id: 'x' } })

    const [item] = await renderPanel(store, vi.fn())
    const select = within(item).getByLabelText('Confidentialité de Analyse')
    const options = [...select.querySelectorAll('option')].map((o) => [o.value, o.textContent])

    expect(options).toEqual([
      ['privee', 'Privée'],
      ['cartographe', 'Partagée avec mon cartographe'],
      ['publique', 'Publique (partageable)'],
    ])
    expect(select.value).toBe('privee')
    expect(within(item).getByText('Analyse Twin9')).toBeDefined()
  })
})
