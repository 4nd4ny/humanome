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
 * `onPost` / `onDelete` permettent de forcer une réponse d'erreur ; `onDelete`
 * reçoit l'id visé et peut observer l'état local au moment de la requête.
 */
function createServer({ user = APPS_USER, existing = [], onPost = null, onDelete = null } = {}) {
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
      async ({ headers, match }) => {
        const refused = guard(headers) ?? (await onDelete?.(Number(match[1])))
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

  it('UC-APP-04-F18 — A5 : « Supprimer » en deux temps efface la copie serveur PUIS la cartographie locale (404 toléré, sans copie = sans requête)', async () => {
    const store = makeStore()
    const { id } = await store.saveCartography({ ...RUN_ENTRY, serverId: 42 })
    const { id: locale } = await store.saveCartography({ ...RUN_ENTRY, titre: 'Locale seulement' })
    const { id: orphan } = await store.saveCartography({ ...RUN_ENTRY, titre: 'Copie disparue', serverId: 43 })
    const localAtDelete = {}
    const server = createServer({
      existing: [{ id: 42, titre: TITRE }],
      onDelete: async (serverId) => {
        // Ordre : la cartographie locale existe encore quand le DELETE part.
        localAtDelete[serverId] = (await store.getCartography(serverId === 42 ? id : orphan)) !== undefined
        return null
      },
    })
    await openEspace(store)

    fireEvent.click(within(itemOf(TITRE)).getByRole('button', { name: 'Supprimer' }))
    expect(mutations(server.requests)).toEqual([]) // premier clic = armement
    fireEvent.click(await screen.findByRole('button', { name: 'Confirmer la suppression' }))

    expect(await screen.findByText(`« ${TITRE} » supprimée.`)).toBeDefined()
    expect(await store.getCartography(id)).toBeUndefined()
    expect(server.cartos.size).toBe(0)
    expect(localAtDelete[42]).toBe(true)

    // Sans copie serveur : suppression purement locale, aucune requête.
    fireEvent.click(within(itemOf('Locale seulement')).getByRole('button', { name: 'Supprimer' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Confirmer la suppression' }))
    expect(await screen.findByText('« Locale seulement » supprimée.')).toBeDefined()
    expect(await store.getCartography(locale)).toBeUndefined()

    // Copie serveur déjà absente (404) : tolérée, la cartographie locale part quand même.
    fireEvent.click(within(itemOf('Copie disparue')).getByRole('button', { name: 'Supprimer' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Confirmer la suppression' }))
    expect(await screen.findByText(/Aucune cartographie pour l’instant/)).toBeDefined()
    expect(await store.getCartography(orphan)).toBeUndefined()
    expect(localAtDelete[43]).toBe(true)
    expect(screen.queryByRole('alert')).toBeNull()
    expect(mutations(server.requests).map((r) => `${r.method} ${r.path}`)).toEqual([
      'DELETE cartographies/42',
      'DELETE cartographies/43',
    ])
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
  ])('UC-APP-04-F20 — %s : seul le message général du serveur est affiché (pas le détail des champs), pas de badge', async (_label, status, payload, message) => {
    const store = makeStore()
    const { id } = await store.saveCartography(RUN_ENTRY)
    createServer({ onPost: () => jsonResponse(status, payload) })
    await openEspace(store)

    fireEvent.click(within(itemOf(TITRE)).getByRole('button', { name: 'Copier sur le serveur' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Je confirme la copie sur le serveur' }))

    // Seul `error` est affiché : le détail `fields` (ex. « Document trop
    // volumineux (8 Mo maximum) ») n'est jamais montré (fiche, E4 et Limites).
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toBe(message)
    expect(alert.textContent).not.toContain('8 Mo')
    expect((await store.getCartography(id)).serverId).toBeNull()
    // L'encart reste ouvert : l'apprenant peut annuler.
    expect(screen.getByTestId('carto-optin')).toBeDefined()
  })

  it('UC-APP-04-F21 — E7 + anomalie 4 : le PATCH échoue (404) → confidentialité locale inchangée, message, serverId périmé conservé (comportement actuel figé)', async () => {
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

    // Comportement ACTUEL (fiche, anomalie 4) : contrairement au retrait et à
    // la suppression, le 404 du PATCH n'est pas réaligné — serverId reste
    // périmé, le badge demeure, et chaque nouveau réglage échoue de même.
    expect((await store.getCartography(id)).serverId).toBe(42)
    expect(within(itemOf(TITRE)).getByText('copie serveur')).toBeDefined()
    await waitFor(() => expect(screen.getByLabelText(`Confidentialité de ${TITRE}`).disabled).toBe(false))
    fireEvent.change(screen.getByLabelText(`Confidentialité de ${TITRE}`), { target: { value: 'cartographe' } })
    await waitFor(() => expect(mutations(server.requests)).toHaveLength(2))
    expect((await screen.findByRole('alert')).textContent).toBe('Cartographie introuvable')
    expect((await store.getCartography(id)).visibility).toBe('privee')
    expect((await store.getCartography(id)).serverId).toBe(42)
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

  it('UC-APP-04-F25 — E8 : « Retirer du serveur » échoue (500, puis 401) → message, serverId et badge conservés, bouton réarmé', async () => {
    const store = makeStore()
    const { id } = await store.saveCartography({ ...RUN_ENTRY, serverId: 42 })
    const failures = [
      jsonResponse(500, { error: 'Erreur interne' }),
      jsonResponse(401, { error: 'Authentification requise' }),
    ]
    const server = createServer({ existing: [{ id: 42, titre: TITRE }], onDelete: () => failures.shift() ?? null })
    await openEspace(store)

    fireEvent.click(within(itemOf(TITRE)).getByRole('button', { name: 'Retirer du serveur' }))
    expect((await screen.findByRole('alert')).textContent).toBe('Erreur interne')
    expect((await store.getCartography(id)).serverId).toBe(42)
    expect(within(itemOf(TITRE)).getByText('copie serveur')).toBeDefined()

    // Session expirée entre-temps : invitation à se connecter.
    await waitFor(() =>
      expect(within(itemOf(TITRE)).getByRole('button', { name: 'Retirer du serveur' }).disabled).toBe(false),
    )
    fireEvent.click(within(itemOf(TITRE)).getByRole('button', { name: 'Retirer du serveur' }))
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe(
        'Connectez-vous (espace compte) pour retirer une cartographie du serveur.',
      ),
    )
    expect((await store.getCartography(id)).serverId).toBe(42)
    expect(server.cartos.has(42)).toBe(true)
    expect(screen.queryByText(/supprimée \(les liens de partage sont purgés\)/)).toBeNull()
  })

  it('UC-APP-04-F26 — E8 : la suppression échoue côté serveur (500) → message, cartographie locale conservée, « Supprimer » réarmé', async () => {
    const store = makeStore()
    const { id } = await store.saveCartography({ ...RUN_ENTRY, serverId: 42 })
    const server = createServer({
      existing: [{ id: 42, titre: TITRE }],
      onDelete: () => jsonResponse(500, { error: 'Erreur interne' }),
    })
    await openEspace(store)

    fireEvent.click(within(itemOf(TITRE)).getByRole('button', { name: 'Supprimer' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Confirmer la suppression' }))

    expect((await screen.findByRole('alert')).textContent).toBe('Erreur interne')
    expect((await store.getCartography(id)).serverId).toBe(42)
    expect(within(itemOf(TITRE)).getByRole('button', { name: 'Supprimer' })).toBeDefined()
    expect(screen.queryByText(`« ${TITRE} » supprimée.`)).toBeNull()
    expect(server.cartos.has(42)).toBe(true)
  })

  it('UC-APP-04-F27 — anomalie 3 figée : la copie transmet des extraits verbatim du portfolio et, dans runMeta, son titre', async () => {
    // Comportement ACTUEL (fiche, anomalie 3) : l'encart promet « jamais votre
    // portfolio », mais le document porte des citations exactes du portfolio
    // (poles[].passagesSaillants[].extraitVerbatim) et le runMeta produit par
    // l'assistant de run (UC-APP-02-F01) porte l'id et le titre du portfolio.
    const store = makeStore()
    const runMeta = {
      portfolioId: 'p-1',
      portfolioTitre: 'Journal de Maya',
      mode: 'humanome',
      provider: 'humanome',
      model: 'impose par la plateforme',
      jours: 1,
      generatedAt: '2026-07-01T10:00:00Z',
    }
    const titre = 'Journée 2026-01-05 — Journal de Maya'
    await store.saveCartography({ ...RUN_ENTRY, titre, runMeta })
    const server = createServer()
    await openEspace(store)

    fireEvent.click(within(itemOf(titre)).getByRole('button', { name: 'Copier sur le serveur' }))
    const optin = await screen.findByTestId('carto-optin')
    expect(optin.textContent).toContain('le document de la cartographie (jamais votre portfolio)')
    expect(optin.textContent).not.toMatch(/extrait|citation/i)
    fireEvent.click(within(optin).getByRole('button', { name: 'Je confirme la copie sur le serveur' }))
    await within(itemOf(titre)).findByText('copie serveur')

    const [post] = mutations(server.requests)
    const extrait = dayFixture.poles[0].passagesSaillants[0].extraitVerbatim
    expect(extrait.length).toBeGreaterThan(20)
    expect(post.body.document.poles[0].passagesSaillants[0].extraitVerbatim).toBe(extrait)
    expect(post.body.runMeta).toMatchObject({ portfolioId: 'p-1', portfolioTitre: 'Journal de Maya' })
    expect(post.body.titre).toContain('Journal de Maya')
  })
})
