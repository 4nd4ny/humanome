// UC-APP-04 — Stocker une cartographie sur le serveur et régler sa
// confidentialité : tests UNITAIRES (front).
// Fiche : docs/cas-utilisation/apprenant/UC-APP-04-stocker-regler-confidentialite.md
//
// Code sollicité appelé directement : le carto-store local (visibilité par
// défaut, trace de la copie serveur `serverId`), les ponts de chargement du
// panneau et du store, le client API (vérification de session `fetchMe`,
// jeton CSRF en mémoire rejoué sur les mutations) et le composant
// CartographiesPanel rendu isolément avec un fetchFn factice (corps du POST
// d'opt-in, niveaux de confidentialité proposés, gestionnaires
// handleVisibilityChange / handleRemoveFromServer / handleDelete et leurs
// messages serverErrorMessage). RequireRole et CsrfMiddleware sont testés
// unitairement par UC-ADM-01-U10 et UC-CPT-02-U07.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createCartoStore, createMemoryAdapter, VISIBILITIES } from '../../../src/lib/carto-store.js'
import {
  createMemoryAdapter as createPortfolioMemoryAdapter,
  createPortfolioStore,
} from '../../../src/lib/portfolio-store.js'
import {
  ApiError,
  ApiUnavailableError,
  apiFetch,
  fetchMe,
  getCsrfToken,
  resetApiClient,
} from '../../../src/api/client.js'
import {
  hasCartographiesPanel,
  loadCartographiesPanel,
} from '../../../src/views/espace/cartographies-panel-bridge.js'
import { hasCartoStore, loadCartoStore } from '../../../src/views/espace/carto-store-bridge.js'
import CartographiesPanel from '../../../src/views/espace/CartographiesPanel.jsx'
import { APPS_CSRF, APPS_USER, createFakeApi, jsonResponse, meRoute, noContentResponse } from '../support/apps.js'
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

  it('UC-APP-04-U21 — fetchMe : 200 → {user} et jeton CSRF mémorisé ; 401 → {user: null} ; autre erreur relancée', async () => {
    const ok = createFakeApi([meRoute()])
    expect(await fetchMe({ fetchFn: ok.fetch })).toEqual({ user: APPS_USER })
    expect(getCsrfToken()).toBe(APPS_CSRF)
    resetApiClient()

    // Visiteur : 401 n'est pas une erreur, c'est « non connecté ».
    const anonymous = createFakeApi([meRoute(null)])
    expect(await fetchMe({ fetchFn: anonymous.fetch })).toEqual({ user: null })
    expect(getCsrfToken()).toBeNull()

    const broken = createFakeApi([['GET', 'auth/me', () => jsonResponse(500, { error: 'Erreur interne' })]])
    const error = await fetchMe({ fetchFn: broken.fetch }).catch((e) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect([error.status, error.message]).toEqual([500, 'Erreur interne'])

    // Copie statique (réponse non JSON) : API indisponible.
    const html = vi.fn(async () => ({ ok: true, status: 200, headers: { get: () => 'text/html' }, json: async () => null }))
    await expect(fetchMe({ fetchFn: html })).rejects.toBeInstanceOf(ApiUnavailableError)
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

  /** Faux réseau dont le statut de réponse des mutations est pilotable. */
  function failingApi(state) {
    const fail = () => jsonResponse(state.status, state.payload)
    return createFakeApi([
      ['POST', 'cartographies', fail],
      ['PATCH', /^cartographies\/\d+$/, fail],
      ['DELETE', /^cartographies\/\d+$/, fail],
    ])
  }

  const itemOf = (titre) => screen.getAllByTestId('carto-item').find((item) => within(item).queryByText(titre))
  const alertText = () => screen.getByRole('alert').textContent

  it('UC-APP-04-U17 — serverErrorMessage : un 401 donne l’invitation à se connecter propre à chaque action ; sinon le message du serveur', async () => {
    const store = makeStore()
    await store.saveCartography({ titre: 'Locale', document: dayFixture })
    const { id: copieId } = await store.saveCartography({ titre: 'Copie', document: dayFixture, serverId: 42 })
    const state = { status: 401, payload: { error: 'Authentification requise' } }
    await renderPanel(store, failingApi(state).fetch)

    fireEvent.change(within(itemOf('Copie')).getByLabelText('Confidentialité de Copie'), { target: { value: 'publique' } })
    await waitFor(() =>
      expect(alertText()).toBe('Connectez-vous (espace compte) pour changer la confidentialité de la copie serveur.'),
    )

    fireEvent.click(within(itemOf('Copie')).getByRole('button', { name: 'Retirer du serveur' }))
    await waitFor(() => expect(alertText()).toBe('Connectez-vous (espace compte) pour retirer une cartographie du serveur.'))

    fireEvent.click(within(itemOf('Copie')).getByRole('button', { name: 'Supprimer' }))
    fireEvent.click(within(itemOf('Copie')).getByRole('button', { name: 'Confirmer la suppression' }))
    await waitFor(() => expect(alertText()).toBe('Connectez-vous (espace compte) pour supprimer la copie serveur.'))

    fireEvent.click(within(itemOf('Locale')).getByRole('button', { name: 'Copier sur le serveur' }))
    fireEvent.click(within(itemOf('Locale')).getByRole('button', { name: 'Je confirme la copie sur le serveur' }))
    await waitFor(() => expect(alertText()).toBe('Connectez-vous (espace compte) pour copier une cartographie sur le serveur.'))

    // Tout autre statut : le message français du serveur, tel quel.
    Object.assign(state, { status: 500, payload: { error: 'Erreur interne' } })
    fireEvent.change(within(itemOf('Copie')).getByLabelText('Confidentialité de Copie'), { target: { value: 'publique' } })
    await waitFor(() => expect(alertText()).toBe('Erreur interne'))
    expect((await store.getCartography(copieId)).serverId).toBe(42)
  })

  it('UC-APP-04-U18 — handleVisibilityChange : sans serverId aucune requête ; avec serverId, PATCH d’abord puis report local', async () => {
    const store = makeStore()
    const { id: locale } = await store.saveCartography({ titre: 'Locale', document: dayFixture })
    const { id: copie } = await store.saveCartography({ titre: 'Copie', document: dayFixture, serverId: 42 })
    const localAtPatch = []
    const api = createFakeApi([
      [
        'PATCH',
        'cartographies/42',
        async () => {
          localAtPatch.push((await store.getCartography(copie)).visibility)
          return jsonResponse(200, { id: 42, visibility: 'cartographe' })
        },
      ],
    ])
    await renderPanel(store, api.fetch)

    fireEvent.change(within(itemOf('Locale')).getByLabelText('Confidentialité de Locale'), { target: { value: 'publique' } })
    await waitFor(async () => expect((await store.getCartography(locale)).visibility).toBe('publique'))
    expect(api.requests).toEqual([])

    fireEvent.change(within(itemOf('Copie')).getByLabelText('Confidentialité de Copie'), { target: { value: 'cartographe' } })
    await waitFor(async () => expect((await store.getCartography(copie)).visibility).toBe('cartographe'))
    expect(api.requests.map((r) => [r.method, r.path, r.body])).toEqual([
      ['PATCH', 'cartographies/42', { visibility: 'cartographe' }],
    ])
    expect(localAtPatch).toEqual(['privee']) // serveur d'abord, local ensuite
  })

  it('UC-APP-04-U19 — handleRemoveFromServer : 404 toléré (serverId effacé) ; toute autre erreur est affichée et serverId conservé', async () => {
    const store = makeStore()
    const { id: disparue } = await store.saveCartography({ titre: 'Disparue', document: dayFixture, serverId: 42 })
    const { id: bloquee } = await store.saveCartography({ titre: 'Bloquée', document: dayFixture, serverId: 43 })
    const api = createFakeApi([
      ['DELETE', 'cartographies/42', () => jsonResponse(404, { error: 'Cartographie introuvable' })],
      ['DELETE', 'cartographies/43', () => jsonResponse(500, { error: 'Erreur interne' })],
    ])
    await renderPanel(store, api.fetch)

    fireEvent.click(within(itemOf('Disparue')).getByRole('button', { name: 'Retirer du serveur' }))
    expect(
      await screen.findByText('Copie serveur de « Disparue » supprimée (les liens de partage sont purgés).'),
    ).toBeDefined()
    expect((await store.getCartography(disparue)).serverId).toBeNull()

    fireEvent.click(within(itemOf('Bloquée')).getByRole('button', { name: 'Retirer du serveur' }))
    await waitFor(() => expect(alertText()).toBe('Erreur interne'))
    expect((await store.getCartography(bloquee)).serverId).toBe(43)
    expect(within(itemOf('Bloquée')).getByText('copie serveur')).toBeDefined()
    expect(within(itemOf('Bloquée')).getByRole('button', { name: 'Retirer du serveur' }).disabled).toBe(false)
  })

  it('UC-APP-04-U20 — handleDelete : armement, annulation, confirmation ; sans serverId aucune requête, 404 toléré, autre erreur = local conservé', async () => {
    const store = makeStore()
    const { id: locale } = await store.saveCartography({ titre: 'Locale', document: dayFixture })
    const { id: disparue } = await store.saveCartography({ titre: 'Disparue', document: dayFixture, serverId: 42 })
    const { id: bloquee } = await store.saveCartography({ titre: 'Bloquée', document: dayFixture, serverId: 43 })
    const api = createFakeApi([
      ['DELETE', 'cartographies/42', () => jsonResponse(404, { error: 'Cartographie introuvable' })],
      ['DELETE', 'cartographies/43', () => jsonResponse(500, { error: 'Erreur interne' })],
    ])
    await renderPanel(store, api.fetch)

    // Armement puis annulation : rien ne part.
    fireEvent.click(within(itemOf('Locale')).getByRole('button', { name: 'Supprimer' }))
    fireEvent.click(within(itemOf('Locale')).getByRole('button', { name: 'Annuler' }))
    expect(within(itemOf('Locale')).getByRole('button', { name: 'Supprimer' })).toBeDefined()
    expect(await store.getCartography(locale)).toBeDefined()

    // Sans copie serveur : suppression locale seule, aucune requête.
    fireEvent.click(within(itemOf('Locale')).getByRole('button', { name: 'Supprimer' }))
    fireEvent.click(within(itemOf('Locale')).getByRole('button', { name: 'Confirmer la suppression' }))
    expect(await screen.findByText('« Locale » supprimée.')).toBeDefined()
    expect(await store.getCartography(locale)).toBeUndefined()
    expect(api.requests).toEqual([])

    // Copie serveur déjà absente (404) : toléré, la cartographie locale part.
    fireEvent.click(within(itemOf('Disparue')).getByRole('button', { name: 'Supprimer' }))
    fireEvent.click(within(itemOf('Disparue')).getByRole('button', { name: 'Confirmer la suppression' }))
    expect(await screen.findByText('« Disparue » supprimée.')).toBeDefined()
    expect(await store.getCartography(disparue)).toBeUndefined()

    // Autre erreur : message, cartographie locale conservée, bouton réarmé.
    fireEvent.click(within(itemOf('Bloquée')).getByRole('button', { name: 'Supprimer' }))
    fireEvent.click(within(itemOf('Bloquée')).getByRole('button', { name: 'Confirmer la suppression' }))
    await waitFor(() => expect(alertText()).toBe('Erreur interne'))
    expect((await store.getCartography(bloquee)).serverId).toBe(43)
    expect(within(itemOf('Bloquée')).getByRole('button', { name: 'Supprimer' })).toBeDefined()
    expect(api.requests.map((r) => `${r.method} ${r.path}`)).toEqual([
      'DELETE cartographies/42',
      'DELETE cartographies/43',
    ])
  })
})
