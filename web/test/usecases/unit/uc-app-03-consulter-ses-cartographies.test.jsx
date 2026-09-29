// UC-APP-03 — Consulter ses cartographies : tests UNITAIRES (front).
// Fiche : docs/cas-utilisation/apprenant/UC-APP-03-consulter-ses-cartographies.md
//
// Code sollicité appelé directement : routage de l'espace, ponts de
// chargement paresseux (carto-store, panneau), carto-store sur son
// adaptateur IndexedDB RÉEL (base « humanome-cartographies », jamais
// exécuté par les suites historiques) et sur son singleton par défaut,
// téléchargement d'un document, visionneuse isolée, panneau « Mes
// cartographies » sur store mémoire, bandeaux de session de l'espace, repli
// « section inconnue » d'EspaceView et chargement du référentiel publié.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { parseHash } from '../../../src/router.js'
import { hasCartoStore, loadCartoStore } from '../../../src/views/espace/carto-store-bridge.js'
import {
  hasCartographiesPanel,
  loadCartographiesPanel,
} from '../../../src/views/espace/cartographies-panel-bridge.js'
import {
  VISIBILITIES,
  createCartoStore,
  createIndexedDbAdapter,
  createMemoryAdapter as cartoMemory,
} from '../../../src/lib/carto-store.js'
import {
  createMemoryAdapter as portfolioMemory,
  createPortfolioStore,
} from '../../../src/lib/portfolio-store.js'
import { downloadJson } from '../../../src/lib/archive.js'
import { ApiError, ApiUnavailableError } from '../../../src/api/client.js'
import { clearReferentielCache, loadPublishedReferentiel } from '../../../src/data/referentiel.js'
import { getReferentiel } from '../../../src/data/load.js'
import CartographyViewer from '../../../src/views/espace/CartographyViewer.jsx'
import CartographiesPanel from '../../../src/views/espace/CartographiesPanel.jsx'
import EspaceView from '../../../src/views/EspaceView.jsx'
import * as fakeLib from '../../../src/test/fake-sunburst-lib.js'
import referentiel from '../../../../schemas/fixtures/referentiel-respire-v7.json'
import day05 from '../../../../schemas/fixtures/cartographie-jour-2026-01-05.json'
import merge3 from '../../../../schemas/fixtures/cartographie-merge-3-jours.json'
import { createFakeIndexedDb } from '../support/appl-fake-indexeddb.js'
import { jsonResponse } from '../support/appl-http.js'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('UC-APP-03 — accès au tableau de bord (étape 1)', () => {
  it('UC-APP-03-U01 — #/espace ouvre le tableau de bord (section nulle), les sous-sections restent distinctes', () => {
    expect(parseHash('#/espace')).toEqual({ name: 'espace', section: null })
    expect(parseHash('#/espace/nouveau-run')).toEqual({ name: 'espace', section: 'nouveau-run' })
    expect(parseHash('#/espace/formation/01-intro')).toEqual({ name: 'espace', section: 'formation/01-intro' })
  })

  it('UC-APP-03-U02 — ponts : carto-store et panneau « Mes cartographies » présents dans le bundle, chargés à la demande', async () => {
    expect(hasCartoStore()).toBe(true)
    expect(hasCartographiesPanel()).toBe(true)
    const store = await loadCartoStore()
    expect(Object.keys(store)).toEqual(
      expect.arrayContaining(['listCartographies', 'saveCartography', 'getCartography', 'updateCartography', 'removeCartography']),
    )
    expect(typeof (await loadCartographiesPanel())).toBe('function')
  })
})

describe('UC-APP-03 — lecture du stockage local (étape 3)', () => {
  it('UC-APP-03-U03 — adaptateur IndexedDB : base « humanome-cartographies », magasin à clé id, relu après rechargement', async () => {
    const idb = createFakeIndexedDb()
    vi.stubGlobal('indexedDB', idb.factory)
    let t = 0
    const now = () => `2026-01-0${++t}T10:00:00.000Z`
    const store = createCartoStore(createIndexedDbAdapter(), { now })

    const { id: jour } = await store.saveCartography({ type: 'jour', titre: 'Journée', document: day05 })
    const { id: fusion } = await store.saveCartography({ type: 'merge', titre: 'Parcours', document: merge3, serverId: 12 })

    expect(idb.databases()).toEqual(['humanome-cartographies'])
    const reloaded = createCartoStore(createIndexedDbAdapter()) // nouvel onglet
    const list = await reloaded.listCartographies()
    expect(list.map((c) => c.id)).toEqual([fusion, jour]) // plus récent d'abord
    expect(list[0]).toMatchObject({ type: 'merge', visibility: 'privee', serverId: 12 })
    expect(list[1].document).toEqual(day05)
    expect(await reloaded.getCartography('inconnu')).toBeUndefined()

    // RG3 : type et visibilité inconnus normalisés en valeurs sûres, relus d'IndexedDB.
    const { id: bizarre } = await store.saveCartography({ type: 'inconnu', visibility: 'secret', titre: 'Bizarre', document: day05 })
    expect(await reloaded.getCartography(bizarre)).toMatchObject({ type: 'jour', visibility: 'privee' })
  })

  it('UC-APP-03-U04 — singleton par défaut (assistant RunWizard, résultats Twin9) : même base IndexedDB que l’instance du panneau', async () => {
    const idb = createFakeIndexedDb()
    vi.stubGlobal('indexedDB', idb.factory)
    const defaultStore = await loadCartoStore()

    await defaultStore.saveCartography({ type: 'jour', titre: 'Via le singleton', document: day05 })
    expect(idb.values('humanome-cartographies', 'cartographies').map((c) => c.titre)).toEqual(['Via le singleton'])
    expect((await defaultStore.listCartographies()).map((c) => c.titre)).toEqual(['Via le singleton'])
    // Le panneau crée SA propre instance (createCartoStore()) : il relit la même base.
    expect((await createCartoStore().listCartographies()).map((c) => c.titre)).toEqual(['Via le singleton'])
    expect(VISIBILITIES).toEqual(['privee', 'cartographe', 'publique'])
  })

  it('UC-APP-03-U05 — IndexedDB absent : lecture refusée avec un message français (E1)', async () => {
    vi.stubGlobal('indexedDB', undefined)
    await expect(createCartoStore().listCartographies()).rejects.toThrow(
      'IndexedDB est indisponible dans ce navigateur : les cartographies ne peuvent pas être conservées localement.',
    )
  })
})

describe('UC-APP-03 — visualisation et téléchargement (étapes 4-5, A4)', () => {
  it('UC-APP-03-U06 — downloadJson : document seul, JSON indenté, nom fourni', () => {
    const download = vi.fn()
    downloadJson('cartographie-jour-2026-01-05.json', day05, download)
    expect(download).toHaveBeenCalledWith('cartographie-jour-2026-01-05.json', JSON.stringify(day05, null, 2))
  })

  it('UC-APP-03-U07 — CartographyViewer : référentiel chargé puis fusion → vue chronologique, journée → vue du jour', async () => {
    let resolveRef
    const getReferentiel = () => new Promise((resolve) => (resolveRef = resolve))
    const onClose = vi.fn()
    const { unmount } = render(
      <CartographyViewer document={merge3} entry={{ type: 'merge', titre: 'Mon parcours' }} onClose={onClose} lib={fakeLib} getReferentiel={getReferentiel} />,
    )
    expect(screen.getByRole('status').textContent).toBe('Chargement du référentiel…')
    resolveRef({ doc: referentiel, origin: 'bundled' })
    expect(await screen.findByRole('group', { name: 'Cartographie cumulée des compétences' })).toBeDefined()
    expect(screen.getByRole('heading', { name: 'Mon parcours' })).toBeDefined()
    screen.getByRole('button', { name: '← Retour au tableau de bord' }).click()
    expect(onClose).toHaveBeenCalledTimes(1)
    unmount()

    render(
      <CartographyViewer document={day05} entry={{ type: 'jour', titre: 'Journée du 5' }} onClose={onClose} lib={fakeLib} getReferentiel={async () => ({ doc: referentiel })} />,
    )
    expect(await screen.findByRole('group', { name: 'Cartographie de la journée du 05/01/2026' })).toBeDefined()
  })

  it('UC-APP-03-U10 — CartographiesPanel (store mémoire) : libellés de type et de confidentialité, noms de fichier à trois replis (A4)', async () => {
    const stamps = ['2026-01-05T09:00:00.000Z', '2026-01-07T09:00:00.000Z', '2026-03-10T09:00:00.000Z', '2026-02-03T09:00:00.000Z']
    let i = 0
    const store = createCartoStore(cartoMemory(), { now: () => stamps[i++] })
    await store.saveCartography({ type: 'jour', titre: 'Le 5', document: day05 })
    await store.saveCartography({ type: 'merge', titre: 'Parcours', visibility: 'cartographe', serverId: 3, document: merge3 })
    await store.saveCartography({ type: 'twin9', titre: 'Approfondie', visibility: 'publique', document: { date: '2026-03-10', competences: {} } })
    await store.saveCartography({ type: 'jour', titre: 'Sans date', document: { kind: 'x' } })
    const download = vi.fn()
    render(
      <CartographiesPanel store={store} portfolioStore={createPortfolioStore(portfolioMemory())} onOpen={vi.fn()} download={download} />,
    )
    await waitFor(() => expect(screen.getAllByTestId('carto-item')).toHaveLength(4))

    const byTitle = (titre) => screen.getAllByTestId('carto-item').find((li) => within(li).queryByText(titre))
    const describeItem = (titre) => {
      const li = byTitle(titre)
      const select = within(li).getByRole('combobox')
      return [li.querySelector('.carto-type').textContent, select.options[select.selectedIndex].textContent]
    }
    expect(describeItem('Le 5')).toEqual(['Journée', 'Privée'])
    expect(describeItem('Parcours')).toEqual(['Parcours (merge)', 'Partagée avec mon cartographe'])
    expect(describeItem('Approfondie')).toEqual(['Analyse Twin9', 'Publique (partageable)'])
    expect(within(byTitle('Parcours')).getByText('copie serveur')).toBeDefined()
    expect(within(byTitle('Le 5')).queryByText('copie serveur')).toBeNull()

    for (const titre of ['Le 5', 'Parcours', 'Approfondie', 'Sans date']) {
      await act(async () => {
        fireEvent.click(within(byTitle(titre)).getByRole('button', { name: 'Télécharger le JSON' }))
      })
    }
    // Date du document, sinon dernière date de la période, sinon date de modification.
    expect(download.mock.calls.map(([name]) => name)).toEqual([
      'cartographie-jour-2026-01-05.json',
      'cartographie-merge-2026-01-07.json',
      'cartographie-twin9-2026-03-10.json',
      'cartographie-jour-2026-02-03.json',
    ])
  })
})

describe('UC-APP-03 — session et référentiel (étapes 1 et 4, A1)', () => {
  const USER = { id: 7, email: 'maya@example.org', displayName: 'Maya', roles: ['apprenant'] }

  function renderEspace(fetchMeFn) {
    return render(
      <EspaceView
        section={null}
        deps={{
          fetchMeFn,
          portfolioStore: createPortfolioStore(portfolioMemory()),
          trainingStore: { load: async () => ({ chapitres: [] }) },
          cartographiesPanel: () => null,
        }}
      />,
    )
  }

  it('UC-APP-03-U11 — EspaceView : session → bandeau (connecté, 401 anonyme, API absente = copie statique, autre erreur = anonyme)', async () => {
    const cases = [
      [async () => ({ user: USER }), 'espace-connecte', 'Connecté en tant que Maya.'],
      [async () => ({ user: null }), 'espace-anonyme', 'Vous n’êtes pas connecté'],
      [async () => Promise.reject(new ApiUnavailableError()), 'espace-anonyme', 'Copie statique du site'],
      [async () => Promise.reject(new ApiError('Service indisponible', 503)), 'espace-anonyme', 'Vous n’êtes pas connecté'],
    ]
    for (const [fetchMeFn, testId, text] of cases) {
      const { unmount } = renderEspace(fetchMeFn)
      expect((await screen.findByTestId(testId)).textContent).toContain(text)
      unmount()
    }
  })

  it('UC-APP-03-U12 — loadPublishedReferentiel : fichier statique publié, sinon copie embarquée ; résultat mis en cache', async () => {
    clearReferentielCache()
    const published = { ...referentiel, version: '7.9.0' }
    const fetchFn = vi.fn(async (url) =>
      url === 'data/referentiel/index.json'
        ? jsonResponse(200, [{ referentielId: 'respire', semver: '7.9.0', fichier: 'respire-7.9.0.json' }])
        : jsonResponse(200, published),
    )
    const first = await loadPublishedReferentiel({ fetchFn, protocol: 'https:' })
    expect(first.origin).toBe('published')
    expect(first.doc.version).toBe('7.9.0')
    expect(fetchFn.mock.calls.map(([url]) => url)).toEqual(['data/referentiel/index.json', 'data/referentiel/respire-7.9.0.json'])
    expect(await loadPublishedReferentiel({ fetchFn })).toBe(first) // cache de module
    expect(fetchFn).toHaveBeenCalledTimes(2)

    clearReferentielCache()
    const offline = await loadPublishedReferentiel({
      fetchFn: async () => {
        throw new TypeError('Failed to fetch')
      },
      protocol: 'https:',
    })
    expect(offline).toEqual({ doc: getReferentiel(), origin: 'bundled' })
    clearReferentielCache()
  })
})

describe('UC-APP-03 — EspaceView isolée : section inconnue (E5)', () => {
  const MAYA = { id: 7, email: 'maya@example.org', displayName: 'Maya', roles: ['apprenant'] }

  it('UC-APP-03-U13 — EspaceView : segment décodé par parseHash hors des sections (comparaison exacte) → alerte citant le segment, lien de retour #/espace ; aucun bloc monté, stores et panneau jamais sollicités, IndexedDB jamais ouvert ; même repli sans session (A1, E5)', async () => {
    // Le segment arrive décodé du routeur, sous-chemin compris.
    expect(parseHash('#/espace/cohortes/3')).toEqual({ name: 'espace', section: 'cohortes/3' })
    expect(parseHash('#/espace/nouveau%2Drun%2F')).toEqual({ name: 'espace', section: 'nouveau-run/' })

    const idb = createFakeIndexedDb()
    vi.stubGlobal('indexedDB', idb.factory)
    /** Store factice : tout accès à une de ses propriétés est journalisé. */
    const touched = []
    const untouchable = (name) =>
      new Proxy({}, { get: (_, prop) => (touched.push(`${name}.${String(prop)}`), vi.fn(async () => null)) })
    const cartographiesPanel = vi.fn(() => null)
    const getReferentiel = vi.fn()
    const fetchFn = vi.fn()

    const sessions = [
      [async () => ({ user: MAYA }), 'espace-connecte', 'Connecté en tant que Maya.'],
      [async () => ({ user: null }), 'espace-anonyme', 'Vous n’êtes pas connecté'],
    ]
    // « formations » n'est pas « formation[/…] », « nouveau-run/ » pas « nouveau-run ».
    for (const section of ['cohortes/3', 'formations', 'nouveau-run/', 'Cohortes']) {
      for (const [fetchMeFn, testId, banner] of sessions) {
        render(
          <EspaceView
            section={section}
            deps={{
              fetchMeFn,
              portfolioStore: untouchable('portfolioStore'),
              trainingStore: untouchable('trainingStore'),
              cartographiesPanel,
              getReferentiel,
              runWizardDeps: untouchable('runWizardDeps'),
              fetchFn,
            }}
          />,
        )
        expect((await screen.findByTestId(testId)).textContent, section).toContain(banner)
        expect(screen.getByRole('alert').textContent, section).toBe(`Section inconnue de l’espace apprenant : « ${section} ».`)
        expect(screen.getByRole('link', { name: 'Retour à l’accueil de l’espace' }).getAttribute('href')).toBe('#/espace')
        expect(screen.queryByRole('region', { name: 'Mes portfolios' })).toBeNull()
        expect(screen.queryByRole('region', { name: 'Mes cohortes' })).toBeNull()
        await act(async () => {})
        cleanup()
      }
    }
    expect(touched).toEqual([])
    expect(cartographiesPanel).not.toHaveBeenCalled()
    expect(getReferentiel).not.toHaveBeenCalled()
    expect(fetchFn).not.toHaveBeenCalled()
    expect(idb.openCount()).toBe(0)
  })
})
