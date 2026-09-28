// UC-APP-03 — Consulter ses cartographies : tests UNITAIRES (front).
// Fiche : docs/cas-utilisation/apprenant/UC-APP-03-consulter-ses-cartographies.md
//
// Code sollicité appelé directement : routage de l'espace, ponts de
// chargement paresseux (carto-store, panneau), carto-store sur son
// adaptateur IndexedDB RÉEL (base « humanome-cartographies », jamais
// exécuté par les suites historiques) et sur son singleton par défaut,
// téléchargement d'un document, visionneuse isolée.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
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
} from '../../../src/lib/carto-store.js'
import { downloadJson } from '../../../src/lib/archive.js'
import CartographyViewer from '../../../src/views/espace/CartographyViewer.jsx'
import * as fakeLib from '../../../src/test/fake-sunburst-lib.js'
import referentiel from '../../../../schemas/fixtures/referentiel-respire-v7.json'
import day05 from '../../../../schemas/fixtures/cartographie-jour-2026-01-05.json'
import merge3 from '../../../../schemas/fixtures/cartographie-merge-3-jours.json'
import { createFakeIndexedDb } from '../support/appl-fake-indexeddb.js'

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
  })

  it('UC-APP-03-U04 — singleton par défaut (utilisé par l’assistant et le panneau) : même base IndexedDB', async () => {
    const idb = createFakeIndexedDb()
    vi.stubGlobal('indexedDB', idb.factory)
    const defaultStore = await loadCartoStore()

    await defaultStore.saveCartography({ type: 'jour', titre: 'Via le singleton', document: day05 })
    expect(idb.values('humanome-cartographies', 'cartographies').map((c) => c.titre)).toEqual(['Via le singleton'])
    expect((await defaultStore.listCartographies()).map((c) => c.titre)).toEqual(['Via le singleton'])
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
})
