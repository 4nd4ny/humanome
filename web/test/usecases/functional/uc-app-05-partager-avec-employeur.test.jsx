// UC-APP-05 — Partager une cartographie avec un employeur (côté apprenant) :
// tests FONCTIONNELS (IHM).
// Fiche : docs/cas-utilisation/apprenant/UC-APP-05-partager-avec-employeur.md
//
// Ancien partage RETIRÉ (décision du 2026-10-14, journal de la cartographie
// D-43) : on ne crée plus de lien vers une cartographie du site. Le partage
// passe par l'interface de cartographie (espace Partage : version partagée,
// réservée aux adultes, garantie possible par un cartographe — ses propres
// tests sont ceux de l'interface, P6 et D-42). Joués ici :
// - le renvoi « Partager depuis l'interface » de « Mes cartographies »,
//   application complète (<App/>) : la cartographie arrive dans un nouveau
//   jeu de l'interface, à l'espace Partage (F24, F25) ;
// - la gestion des liens DÉJÀ CRÉÉS dans l'espace apprenant rendu (EspaceView,
//   #/espace) : session vérifiée au montage (vrai fetchMe → jeton CSRF),
//   panneau « Mes cartographies » réel, dialogue réel (F13, F14, F18–F20, F22).
// Seuls le stockage local (carto-store mémoire, IndexedDB factice pour
// <App/>) et le réseau (fetch global → serveur factice à état) sont simulés.
// F11, F12, F15–F17, F21 et F23 (création d'un lien) sont retirés avec elle.
// La consultation par l'employeur est l'objet de UC-EMP-01.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import App from '../../../src/App.jsx'
import EspaceView from '../../../src/views/EspaceView.jsx'
import CartographiesPanel from '../../../src/views/espace/CartographiesPanel.jsx'
import { createCartoStore, createMemoryAdapter } from '../../../src/lib/carto-store.js'
import { createCartoStore as createInterfaceStore } from '../../../src/carto/core/store.js'
import {
  createMemoryAdapter as createPortfolioMemoryAdapter,
  createPortfolioStore,
} from '../../../src/lib/portfolio-store.js'
import { resetApiClient } from '../../../src/api/client.js'
import * as fakeLib from '../../../src/test/fake-sunburst-lib.js'
import { FakeIDBKeyRange, createFakeIndexedDb } from '../support/appl-fake-indexeddb.js'
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
/** Échéance lointaine : le lien est encore servi quel que soit le jour du test. */
const LATER = '2099-09-29T10:00:00'
const idb = createFakeIndexedDb()

/**
 * Serveur factice à état : liens de partage DÉJÀ CRÉÉS de la copie serveur 42
 * (contrat de api/src/routes/share.php côté apprenant : 401 sans session,
 * 403 sans jeton CSRF, 404 hors propriété). La création (POST …/share) n'est
 * pas simulée : pour une cartographie du site, elle est retirée (422
 * share_retired, testé côté API). L'interface de cartographie lit
 * l'attestation de majorité (GET auth/me/adult) en arrivant à l'espace Partage.
 */
function createServer({ user = APPS_USER, cartoIds = [42], links = [], failRevoke = false } = {}) {
  const shares = links.map((l) => ({ ...l }))
  const known = (id) => cartoIds.includes(Number(id))
  const anonymous = () => (user ? null : jsonResponse(401, { error: 'Authentification requise' }))
  const api = createFakeApi([
    meRoute(user),
    [
      'GET',
      /^cartographies\/(\d+)\/shares$/,
      ({ match }) =>
        anonymous() ??
        (known(match[1])
          ? jsonResponse(200, shares.map((l) => ({ ...l }))) // copies : un nouvel état à chaque lecture
          : jsonResponse(404, { error: 'Cartographie introuvable' })),
    ],
    [
      'DELETE',
      /^shares\/(\d+)$/,
      ({ headers, match }) => {
        const refused = anonymous()
        if (refused) return refused
        if (headers['X-CSRF-Token'] !== APPS_CSRF) return jsonResponse(403, { error: 'Jeton CSRF absent ou invalide' })
        const link = shares.find((s) => s.shareId === Number(match[1]))
        if (!link || failRevoke) return jsonResponse(404, { error: 'Lien de partage introuvable' })
        link.revokedAt ??= '2026-07-12T11:00:00'
        return noContentResponse()
      },
    ],
    ['GET', 'auth/me/adult', () => jsonResponse(200, { adult: false, attestedAt: null, required: true })],
  ])
  vi.stubGlobal('fetch', api.fetch)
  return { ...api, shares }
}

async function openEspace(entries) {
  const store = createCartoStore(createMemoryAdapter())
  for (const entry of entries) await store.saveCartography(entry)
  const Panel = (props) => <CartographiesPanel {...props} store={store} />
  render(
    <EspaceView
      section={null}
      deps={{
        portfolioStore: createPortfolioStore(createPortfolioMemoryAdapter()),
        trainingStore: fakeTrainingStore(),
        cartographiesPanel: Panel,
      }}
    />,
  )
  await screen.findAllByTestId('carto-item')
  return store
}

/** Application complète sur le tableau de bord ; « Mes cartographies » lit le navigateur (IndexedDB factice). */
async function openApp(entries) {
  vi.stubGlobal('indexedDB', idb.factory)
  vi.stubGlobal('IDBKeyRange', FakeIDBKeyRange)
  const store = createCartoStore()
  for (const entry of entries) await store.saveCartography(entry)
  window.location.hash = '#/espace'
  render(<App lib={fakeLib} fetchMeFn={async () => ({ user: APPS_USER })} />)
  await screen.findAllByTestId('carto-item')
}

function itemOf(titre) {
  return screen.getAllByTestId('carto-item').find((item) => within(item).queryByText(titre))
}

/** Ouvre la gestion des liens déjà créés de la cartographie et attend leur liste. */
async function openDialog(titre = TITRE) {
  fireEvent.click(within(itemOf(titre)).getByRole('button', { name: 'Liens déjà créés' }))
  const dialog = await screen.findByRole('region', { name: `Liens de partage de ${titre}` })
  await waitFor(() => expect(within(dialog).queryByText('Chargement des liens…')).toBeNull())
  return dialog
}

/** L'interface de cartographie est ouverte à l'espace Partage, sur un jeu au titre donné. */
async function expectInterfacePartage(titre) {
  await waitFor(() => expect(window.location.hash).toBe('#/cartographie/partage'))
  const spaces = await screen.findByRole('navigation', { name: 'Espaces de la cartographie' })
  expect(within(spaces).getByRole('link', { name: 'Partage' }).getAttribute('aria-current')).toBe('page')
  await waitFor(() => expect(document.querySelector('.carto-context-dataset')?.textContent).toBe(titre))
  // Partage réservé aux adultes : l'attestation d'abord.
  expect(
    await screen.findByRole('heading', { name: 'Le partage par lien est réservé aux personnes majeures' }),
  ).toBeDefined()
}

const SHARED_ENTRY = { type: 'jour', titre: TITRE, visibility: 'publique', document: dayFixture, serverId: 42 }

beforeEach(() => {
  resetApiClient()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  idb.reset()
  window.location.hash = ''
  resetApiClient()
})

describe('UC-APP-05 — partager depuis l’interface de cartographie (ancien partage retiré)', () => {
  it('UC-APP-05-F24 — nominal : « Partager depuis l’interface » → interface, espace Partage, nouveau jeu au titre de la cartographie ; aucun lien, aucune copie', async () => {
    const server = createServer()
    await openApp([{ type: 'jour', titre: TITRE, document: dayFixture }]) // sans copie serveur

    fireEvent.click(within(itemOf(TITRE)).getByRole('button', { name: 'Partager depuis l’interface' }))

    await expectInterfacePartage(TITRE)
    // Le jeu est enregistré dans ce navigateur (magasin de l'interface), une journée.
    const sets = await createInterfaceStore().listDatasets()
    expect(sets).toHaveLength(1)
    expect(sets[0]).toMatchObject({ title: TITRE, dayCount: 1 })
    // Rien n'a quitté le navigateur vers le partage : ni lien, ni copie, ni version.
    expect(mutations(server.requests)).toEqual([])
    expect(server.requests.some((r) => /share/.test(r.path) || r.path === 'cartographies')).toBe(false)
  })

  it('UC-APP-05-F25 — retrait : « Liens déjà créés » le dit, sans formulaire de création ; son « Partager depuis l’interface » mène au même endroit', async () => {
    const server = createServer({
      links: [{ shareId: 1, createdAt: '2026-07-01T10:00:00', expiresAt: LATER, revokedAt: null }],
    })
    await openApp([SHARED_ENTRY])
    const dialog = await openDialog()

    expect(dialog.textContent).toContain('Le partage par lien de cette cartographie est retiré : on n’en crée plus de nouveau.')
    expect(within(dialog).getByText(/Créé le 01\/07\/2026 — expire le 29\/09\/2099/)).toBeDefined()
    expect(within(dialog).queryByLabelText(/Mot de passe/)).toBeNull()
    expect(within(dialog).queryByRole('button', { name: /Créer/ })).toBeNull()

    fireEvent.click(within(dialog).getByRole('button', { name: 'Partager depuis l’interface' }))
    await expectInterfacePartage(TITRE)
    expect(mutations(server.requests)).toEqual([])
  })
})

describe('UC-APP-05 — l’apprenant suit et révoque les liens déjà créés', () => {
  it('UC-APP-05-F13 — A2 : « Révoquer » → DELETE api/shares/{id} (CSRF), le lien apparaît révoqué', async () => {
    const server = createServer({
      links: [
        { shareId: 1, createdAt: '2026-07-01T10:00:00', expiresAt: LATER, revokedAt: null },
        { shareId: 2, createdAt: '2026-07-02T10:00:00', expiresAt: LATER, revokedAt: null },
      ],
    })
    await openEspace([SHARED_ENTRY])
    const dialog = await openDialog()

    fireEvent.click(within(dialog).getAllByRole('button', { name: 'Révoquer' })[0])

    expect(await within(dialog).findByText('révoqué le 12/07/2026')).toBeDefined()
    const [revoke] = mutations(server.requests)
    expect(revoke).toMatchObject({ method: 'DELETE', path: 'shares/1' })
    expect(revoke.headers['X-CSRF-Token']).toBe(APPS_CSRF)
    // A3 : l'autre lien reste actif et révocable.
    expect(within(dialog).getAllByRole('button', { name: 'Révoquer' })).toHaveLength(1)
  })

  it('UC-APP-05-F14 — A5 : sans copie serveur, pas de « Liens déjà créés » ; avec copie, même « privée », la gestion des liens est offerte', async () => {
    createServer()
    await openEspace([
      { type: 'jour', titre: 'Locale seulement', document: dayFixture },
      { type: 'jour', titre: 'Copie privée', visibility: 'privee', document: dayFixture, serverId: 42 },
    ])

    const locale = itemOf('Locale seulement')
    expect(within(locale).queryByRole('button', { name: 'Liens déjà créés' })).toBeNull()
    expect(within(locale).getByRole('button', { name: 'Copier sur le serveur' })).toBeDefined()

    // La visibilité n'est pas une condition : un lien créé avant reste révocable.
    expect(within(itemOf('Copie privée')).getByLabelText('Confidentialité de Copie privée').value).toBe('privee')
    expect(within(itemOf('Copie privée')).getByRole('button', { name: 'Liens déjà créés' })).toBeDefined()
    // L'ancien bouton « Partager » n'existe plus nulle part.
    expect(screen.queryByRole('button', { name: 'Partager' })).toBeNull()
  })

  it('UC-APP-05-F18 — E3 : session expirée (401) → la liste affiche le message brut du serveur', async () => {
    createServer({ user: null })
    await openEspace([SHARED_ENTRY])
    const dialog = await openDialog()

    expect((await within(dialog).findByRole('alert')).textContent).toBe('Authentification requise')
    expect(within(dialog).queryByRole('list')).toBeNull()
  })

  it('UC-APP-05-F19 — E4 : copie serveur retirée ailleurs (404) → « Cartographie introuvable »', async () => {
    createServer({ cartoIds: [] })
    await openEspace([SHARED_ENTRY])
    const dialog = await openDialog()

    expect((await within(dialog).findByRole('alert')).textContent).toBe('Cartographie introuvable')
    expect(within(dialog).queryByRole('list')).toBeNull()
  })

  it('UC-APP-05-F20 — E5 : la révocation échoue → message, le lien reste affiché actif', async () => {
    createServer({
      failRevoke: true,
      links: [{ shareId: 1, createdAt: '2026-07-01T10:00:00', expiresAt: LATER, revokedAt: null }],
    })
    await openEspace([SHARED_ENTRY])
    const dialog = await openDialog()

    fireEvent.click(within(dialog).getByRole('button', { name: 'Révoquer' }))

    expect((await within(dialog).findByRole('alert')).textContent).toBe('Lien de partage introuvable')
    expect(within(dialog).getByRole('button', { name: 'Révoquer' })).toBeDefined()
  })

  it('UC-APP-05-F22 — A4 : un lien échu reste listé, « expiré le », sans « Révoquer » (le serveur ne le sert plus)', async () => {
    createServer({
      links: [{ shareId: 1, createdAt: '2026-01-01T10:00:00', expiresAt: '2026-01-02T10:00:00', revokedAt: null }],
    })
    await openEspace([SHARED_ENTRY])
    const dialog = await openDialog()

    expect(within(dialog).getByText('Créé le 01/01/2026 — expiré le 02/01/2026')).toBeDefined()
    expect(within(dialog).queryByRole('button', { name: 'Révoquer' })).toBeNull()
  })
})
