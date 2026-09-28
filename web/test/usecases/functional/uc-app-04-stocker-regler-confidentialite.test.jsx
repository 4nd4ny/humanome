// UC-APP-04 — Stocker une cartographie sur le serveur et régler sa
// confidentialité : tests FONCTIONNELS (IHM).
// Fiche : docs/cas-utilisation/apprenant/UC-APP-04-stocker-regler-confidentialite.md
//
// Le scénario est joué sur l'espace apprenant rendu (EspaceView, #/espace) :
// vérification de session au montage (vrai fetchMe → jeton CSRF en mémoire),
// tableau de bord, panneau « Mes cartographies » réel. Seuls le stockage
// local (carto-store sur adaptateur mémoire, IndexedDB absente de jsdom) et
// le réseau (fetch global → petit serveur factice à état) sont simulés.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import EspaceView from '../../../src/views/EspaceView.jsx'
import CartographiesPanel from '../../../src/views/espace/CartographiesPanel.jsx'
import { createCartoStore, createMemoryAdapter } from '../../../src/lib/carto-store.js'
import {
  createMemoryAdapter as createPortfolioMemoryAdapter,
  createPortfolioStore,
} from '../../../src/lib/portfolio-store.js'
import { resetApiClient } from '../../../src/api/client.js'
import * as fakeLib from '../../../src/test/fake-sunburst-lib.js'
import {
  APPS_CSRF,
  APPS_USER,
  createFakeApi,
  fakeTrainingStore,
  jsonResponse,
  meRoute,
  mutations,
  noContentResponse,
} from '../support/apps.js'
import dayFixture from '../../../../schemas/fixtures/cartographie-jour-2026-01-05.json'

const TITRE = 'Journée du 05/01/2026'

/** Sortie d'un run standard, telle que l'assistant l'enregistre en local. */
const RUN_ENTRY = {
  type: 'jour',
  titre: TITRE,
  document: dayFixture,
  promptPackage: { id: 'aurora-demo', version: '1.0.0' },
  referentiel: { id: 'respire', version: '7.0.0' },
  runMeta: { modele: 'mock', dateRun: '2026-07-01T10:00:00Z' },
}

function makeStore() {
  let tick = 0
  return createCartoStore(createMemoryAdapter(), {
    now: () => new Date(Date.UTC(2026, 6, 1, 12, 0, tick++)).toISOString(),
  })
}

/**
 * Serveur factice À ÉTAT reproduisant le contrat des routes
 * /api/cartographies (401 sans session, 403 sans jeton CSRF, 404 id inconnu).
 * `onPost` permet de forcer une réponse d'erreur.
 */
function createServer({ user = APPS_USER, existing = [], onPost = null } = {}) {
  const cartos = new Map(existing.map((c) => [c.id, { ...c }]))
  let nextId = 42
  const guard = (headers) => {
    if (!user) return jsonResponse(401, { error: 'Authentification requise' })
    if (headers['X-CSRF-Token'] !== APPS_CSRF) {
      return jsonResponse(403, { error: 'Jeton CSRF absent ou invalide' })
    }
    return null
  }
  const api = createFakeApi([
    meRoute(user),
    [
      'GET',
      'cartographies',
      () => jsonResponse(200, [...cartos.values()].map(({ document, ...meta }) => meta)),
    ],
    [
      'POST',
      'cartographies',
      ({ body, headers }) => {
        const refused = guard(headers) ?? onPost?.(body)
        if (refused) return refused
        while (cartos.has(nextId)) nextId += 1
        const id = nextId
        cartos.set(id, { id, ...body })
        return jsonResponse(201, { id })
      },
    ],
    [
      'PATCH',
      /^cartographies\/(\d+)$/,
      ({ body, headers, match }) => {
        const refused = guard(headers)
        if (refused) return refused
        const carto = cartos.get(Number(match[1]))
        if (!carto) return jsonResponse(404, { error: 'Cartographie introuvable' })
        Object.assign(carto, body)
        const { document, ...meta } = carto
        return jsonResponse(200, meta)
      },
    ],
    [
      'DELETE',
      /^cartographies\/(\d+)$/,
      ({ headers, match }) => {
        const refused = guard(headers)
        if (refused) return refused
        return cartos.delete(Number(match[1]))
          ? noContentResponse()
          : jsonResponse(404, { error: 'Cartographie introuvable' })
      },
    ],
  ])
  vi.stubGlobal('fetch', api.fetch)
  return { ...api, cartos }
}

/** L'apprenant ouvre #/espace : tableau de bord avec le vrai panneau. */
async function openEspace(store) {
  const Panel = (props) => <CartographiesPanel {...props} store={store} />
  render(
    <EspaceView
      section={null}
      lib={fakeLib}
      deps={{
        portfolioStore: createPortfolioStore(createPortfolioMemoryAdapter()),
        trainingStore: fakeTrainingStore(),
        cartographiesPanel: Panel,
      }}
    />,
  )
  return screen.findAllByTestId('carto-item')
}

function itemOf(titre) {
  return screen.getAllByTestId('carto-item').find((item) => within(item).queryByText(titre))
}

beforeEach(() => resetApiClient())

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  resetApiClient()
})

describe('UC-APP-04 — copier une cartographie sur le serveur (opt-in) et régler sa confidentialité', () => {
  it('UC-APP-04-F15 — nominal : encart RGPD, confirmation, POST avec CSRF, badge, puis confidentialité synchronisée', async () => {
    const store = makeStore()
    const { id } = await store.saveCartography(RUN_ENTRY)
    const server = createServer()
    await openEspace(store)
    expect((await screen.findByTestId('espace-connecte')).textContent).toContain('Maya')

    // 1-2. « Copier sur le serveur » n'envoie RIEN : il ouvre l'encart d'opt-in.
    fireEvent.click(within(itemOf(TITRE)).getByRole('button', { name: 'Copier sur le serveur' }))
    const optin = await screen.findByTestId('carto-optin')
    expect(optin.textContent).toContain('Copie serveur = choix explicite (RGPD).')
    expect(optin.textContent).toContain('jamais votre portfolio')
    expect(mutations(server.requests)).toEqual([])

    // 3-5. Confirmation explicite → POST api/cartographies (jeton CSRF joint).
    fireEvent.click(within(optin).getByRole('button', { name: 'Je confirme la copie sur le serveur' }))
    expect(await within(itemOf(TITRE)).findByText('copie serveur')).toBeDefined()
    expect(screen.getByText(`« ${TITRE} » est copiée sur le serveur (retrait possible à tout moment).`)).toBeDefined()
    const [post] = mutations(server.requests)
    expect(post.path).toBe('cartographies')
    expect(post.headers['X-CSRF-Token']).toBe(APPS_CSRF)
    expect(post.body).toMatchObject({ type: 'jour', titre: TITRE, visibility: 'privee', document: dayFixture })
    expect((await store.getCartography(id)).serverId).toBe(42)
    expect(within(itemOf(TITRE)).getByRole('button', { name: 'Partager' })).toBeDefined()
    expect(within(itemOf(TITRE)).getByRole('button', { name: 'Retirer du serveur' })).toBeDefined()
    expect(screen.queryByTestId('carto-optin')).toBeNull()

    // 6-7. Confidentialité « partagée avec mon cartographe » : PATCH puis local.
    fireEvent.change(screen.getByLabelText(`Confidentialité de ${TITRE}`), {
      target: { value: 'cartographe' },
    })
    await waitFor(async () => expect((await store.getCartography(id)).visibility).toBe('cartographe'))
    const patch = mutations(server.requests)[1]
    expect(patch).toMatchObject({ method: 'PATCH', path: 'cartographies/42', body: { visibility: 'cartographe' } })
    expect(patch.headers['X-CSRF-Token']).toBe(APPS_CSRF)
    expect(server.cartos.get(42).visibility).toBe('cartographe')
  })

  it('UC-APP-04-F16 — A1 : sans copie serveur, la confidentialité se règle en local, sans requête', async () => {
    const store = makeStore()
    const { id } = await store.saveCartography(RUN_ENTRY)
    const server = createServer()
    await openEspace(store)

    fireEvent.change(screen.getByLabelText(`Confidentialité de ${TITRE}`), { target: { value: 'publique' } })

    await waitFor(async () => expect((await store.getCartography(id)).visibility).toBe('publique'))
    expect(screen.getByLabelText(`Confidentialité de ${TITRE}`).value).toBe('publique')
    expect(mutations(server.requests)).toEqual([])
    expect(server.requests.map((r) => r.path)).toEqual(['auth/me'])
  })

  it('UC-APP-04-F17 — A4 : « Retirer du serveur » supprime la copie (liens purgés), y compris déjà absente (404)', async () => {
    const store = makeStore()
    const { id } = await store.saveCartography({ ...RUN_ENTRY, serverId: 42 })
    const { id: orphan } = await store.saveCartography({ ...RUN_ENTRY, titre: 'Copie disparue', serverId: 43 })
    const server = createServer({ existing: [{ id: 42, titre: TITRE, visibility: 'privee' }] })
    await openEspace(store)

    fireEvent.click(within(itemOf(TITRE)).getByRole('button', { name: 'Retirer du serveur' }))
    expect(
      await screen.findByText(`Copie serveur de « ${TITRE} » supprimée (les liens de partage sont purgés).`),
    ).toBeDefined()
    expect(server.cartos.has(42)).toBe(false)
    expect((await store.getCartography(id)).serverId).toBeNull()
    expect(within(itemOf(TITRE)).queryByText('copie serveur')).toBeNull()
    expect(within(itemOf(TITRE)).getByRole('button', { name: 'Copier sur le serveur' })).toBeDefined()

    // Copie déjà absente côté serveur (404) : le local est réaligné quand même.
    fireEvent.click(within(itemOf('Copie disparue')).getByRole('button', { name: 'Retirer du serveur' }))
    await waitFor(async () => expect((await store.getCartography(orphan)).serverId).toBeNull())
    expect(screen.queryByRole('alert')).toBeNull()
    expect(mutations(server.requests).map((r) => `${r.method} ${r.path}`)).toEqual([
      'DELETE cartographies/42',
      'DELETE cartographies/43',
    ])
  })

  it('UC-APP-04-F18 — A5 : « Supprimer » en deux temps efface la copie serveur puis la cartographie locale', async () => {
    const store = makeStore()
    const { id } = await store.saveCartography({ ...RUN_ENTRY, serverId: 42 })
    const server = createServer({ existing: [{ id: 42, titre: TITRE }] })
    await openEspace(store)

    fireEvent.click(within(itemOf(TITRE)).getByRole('button', { name: 'Supprimer' }))
    expect(mutations(server.requests)).toEqual([]) // premier clic = armement
    fireEvent.click(await screen.findByRole('button', { name: 'Confirmer la suppression' }))

    expect(await screen.findByText(/Aucune cartographie pour l’instant/)).toBeDefined()
    expect(screen.getByText(`« ${TITRE} » supprimée.`)).toBeDefined()
    expect(await store.getCartography(id)).toBeUndefined()
    expect(server.cartos.size).toBe(0)
    expect(mutations(server.requests).map((r) => `${r.method} ${r.path}`)).toEqual(['DELETE cartographies/42'])
  })

  it('UC-APP-04-F19 — E1 : visiteur non connecté → invitation à se connecter, rien n’est copié', async () => {
    const store = makeStore()
    const { id } = await store.saveCartography(RUN_ENTRY)
    const server = createServer({ user: null })
    await openEspace(store)
    expect((await screen.findByTestId('espace-anonyme')).textContent).toContain('tout fonctionne en local')

    fireEvent.click(within(itemOf(TITRE)).getByRole('button', { name: 'Copier sur le serveur' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Je confirme la copie sur le serveur' }))

    expect((await screen.findByRole('alert')).textContent).toBe(
      'Connectez-vous (espace compte) pour copier une cartographie sur le serveur.',
    )
    expect((await store.getCartography(id)).serverId).toBeNull()
    expect(within(itemOf(TITRE)).queryByText('copie serveur')).toBeNull()
    expect(server.cartos.size).toBe(0)
  })

  it.each([
    ['E2 — rôle apprenant absent', 403, { error: 'Rôle insuffisant' }, 'Rôle insuffisant'],
    [
      'E4 — corps refusé par la validation',
      422,
      { error: 'Validation échouée', fields: { document: 'Document trop volumineux (8 Mo maximum)' } },
      'Validation échouée',
    ],
  ])('UC-APP-04-F20 — %s : message du serveur affiché, pas de badge', async (_label, status, payload, message) => {
    const store = makeStore()
    const { id } = await store.saveCartography(RUN_ENTRY)
    createServer({ onPost: () => jsonResponse(status, payload) })
    await openEspace(store)

    fireEvent.click(within(itemOf(TITRE)).getByRole('button', { name: 'Copier sur le serveur' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Je confirme la copie sur le serveur' }))

    expect((await screen.findByRole('alert')).textContent).toBe(message)
    expect((await store.getCartography(id)).serverId).toBeNull()
    // L'encart reste ouvert : l'apprenant peut annuler.
    expect(screen.getByTestId('carto-optin')).toBeDefined()
  })

  it('UC-APP-04-F21 — E7 : le PATCH serveur échoue → confidentialité locale inchangée et message', async () => {
    const store = makeStore()
    const { id } = await store.saveCartography({ ...RUN_ENTRY, serverId: 42 })
    // Copie supprimée entre-temps (autre appareil) : le serveur répond 404.
    const server = createServer({ existing: [] })
    await openEspace(store)

    fireEvent.change(screen.getByLabelText(`Confidentialité de ${TITRE}`), { target: { value: 'publique' } })

    expect((await screen.findByRole('alert')).textContent).toBe('Cartographie introuvable')
    expect((await store.getCartography(id)).visibility).toBe('privee')
    expect(screen.getByLabelText(`Confidentialité de ${TITRE}`).value).toBe('privee')
    expect(mutations(server.requests)).toHaveLength(1)
  })

  it('UC-APP-04-F22 — anomalie figée : sur un autre appareil, les copies serveur ne sont ni listées ni récupérables', async () => {
    // Comportement ACTUEL (fiche, « Anomalies constatées ») : l'encart d'opt-in
    // promet de « retrouver [la cartographie] depuis un autre appareil », mais
    // le panneau ne lit que le carto-store local et n'appelle jamais
    // GET api/cartographies, pourtant disponible côté serveur.
    const server = createServer({
      existing: [{ id: 42, type: 'jour', titre: TITRE, visibility: 'privee', document: dayFixture }],
    })
    render(
      <EspaceView
        section={null}
        lib={fakeLib}
        deps={{
          portfolioStore: createPortfolioStore(createPortfolioMemoryAdapter()),
          trainingStore: fakeTrainingStore(),
          cartographiesPanel: (props) => <CartographiesPanel {...props} store={makeStore()} />,
        }}
      />,
    )

    expect(await screen.findByText(/Aucune cartographie pour l’instant/)).toBeDefined()
    await screen.findByTestId('espace-connecte')
    expect(server.requests.map((r) => `${r.method} ${r.path}`)).toEqual(['GET auth/me'])
  })
})
