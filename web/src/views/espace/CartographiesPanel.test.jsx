import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import CartographiesPanel from './CartographiesPanel.jsx'
import { createCartoStore, createMemoryAdapter } from '../../lib/carto-store.js'
import {
  createPortfolioStore,
  createMemoryAdapter as createPortfolioMemoryAdapter,
} from '../../lib/portfolio-store.js'
import { resetApiClient } from '../../api/client.js'
import dayFixture from '../../../../schemas/fixtures/cartographie-jour-2026-01-05.json'

afterEach(() => {
  cleanup()
  resetApiClient()
})

function makeStore() {
  let tick = 0
  let seq = 0
  return createCartoStore(createMemoryAdapter(), {
    now: () => new Date(2026, 6, 1, 12, 0, tick++).toISOString(),
    id: () => `id-${++seq}`,
  })
}

function makePortfolioStore() {
  return createPortfolioStore(createPortfolioMemoryAdapter())
}

function jsonResponse(status, data) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => (name.toLowerCase() === 'content-type' ? 'application/json' : null) },
    json: async () => data,
  }
}

function noContentResponse() {
  return { ok: true, status: 204, headers: { get: () => null }, json: async () => null }
}

/** Faux fetch routé par 'MÉTHODE url' — indépendant de l'ordre des requêtes. */
function routedFetch(routes) {
  return vi.fn(async (url, init = {}) => {
    const key = `${init.method ?? 'GET'} ${url}`
    const handler = routes[key]
    if (!handler) throw new Error(`route non mockée : ${key}`)
    return typeof handler === 'function' ? handler(init) : handler
  })
}

const baseEntry = {
  type: 'jour',
  titre: 'Journée du 05/01/2026',
  document: dayFixture,
  promptPackage: { id: 'aurora-demo', version: '1.0.0' },
  referentiel: { id: 'respire', version: '7.0.0' },
  runMeta: { modele: 'mock', dateRun: '2026-07-01T10:00:00Z' },
}

describe('CartographiesPanel — liste locale', () => {
  it('affiche titre, type, visibilité et badge « copie serveur » si serverId', async () => {
    const store = makeStore()
    await store.saveCartography({ ...baseEntry, titre: 'Locale seulement' })
    await store.saveCartography({
      ...baseEntry,
      titre: 'Avec copie serveur',
      type: 'merge',
      serverId: 7,
      visibility: 'publique',
    })

    render(<CartographiesPanel store={store} portfolioStore={makePortfolioStore()} fetchFn={vi.fn()} />)

    const items = await screen.findAllByTestId('carto-item')
    expect(items).toHaveLength(2)

    const serveur = items.find((item) => within(item).queryByText('Avec copie serveur'))
    expect(within(serveur).getByText('copie serveur')).toBeDefined()
    expect(within(serveur).getByText('Parcours (merge)')).toBeDefined()
    expect(within(serveur).getByLabelText('Confidentialité de Avec copie serveur').value).toBe(
      'publique',
    )

    const locale = items.find((item) => within(item).queryByText('Locale seulement'))
    expect(within(locale).queryByText('copie serveur')).toBeNull()
    expect(within(locale).getByText('Journée')).toBeDefined()
    expect(within(locale).getByRole('button', { name: 'Copier sur le serveur' })).toBeDefined()
  })

  it('affiche l’état vide et la section « Mes données »', async () => {
    render(
      <CartographiesPanel store={makeStore()} portfolioStore={makePortfolioStore()} fetchFn={vi.fn()} />,
    )
    expect(await screen.findByText(/Aucune cartographie pour l’instant/)).toBeDefined()
    expect(screen.getByRole('button', { name: 'Exporter toutes mes données' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'Importer une archive' })).toBeDefined()
    expect(screen.getByRole('link', { name: 'espace compte' }).getAttribute('href')).toBe('#/compte')
  })

  it('« Voir » n’apparaît qu’avec la prop onOpen et transmet le document', async () => {
    const store = makeStore()
    await store.saveCartography(baseEntry)
    const onOpen = vi.fn()

    render(
      <CartographiesPanel
        store={store}
        portfolioStore={makePortfolioStore()}
        onOpen={onOpen}
        fetchFn={vi.fn()}
      />,
    )
    fireEvent.click(await screen.findByRole('button', { name: 'Voir' }))
    expect(onOpen).toHaveBeenCalledTimes(1)
    expect(onOpen.mock.calls[0][0]).toEqual(dayFixture)
    expect(onOpen.mock.calls[0][1].titre).toBe('Journée du 05/01/2026')
  })

  it('« Télécharger le JSON » télécharge le document seul', async () => {
    const store = makeStore()
    await store.saveCartography(baseEntry)
    const download = vi.fn()

    render(
      <CartographiesPanel
        store={store}
        portfolioStore={makePortfolioStore()}
        fetchFn={vi.fn()}
        download={download}
      />,
    )
    fireEvent.click(await screen.findByRole('button', { name: 'Télécharger le JSON' }))
    expect(download).toHaveBeenCalledTimes(1)
    expect(download.mock.calls[0][0]).toBe('cartographie-jour-2026-01-05.json')
    expect(JSON.parse(download.mock.calls[0][1])).toEqual(dayFixture)
  })
})

describe('CartographiesPanel — opt-in copie serveur (RGPD §6.2)', () => {
  it('demande une confirmation explicite puis POST api/cartographies et stocke serverId', async () => {
    const store = makeStore()
    const { id } = await store.saveCartography(baseEntry)
    const fetchFn = routedFetch({
      'POST api/cartographies': (init) => {
        const body = JSON.parse(init.body)
        expect(body.type).toBe('jour')
        expect(body.titre).toBe('Journée du 05/01/2026')
        expect(body.visibility).toBe('privee')
        expect(body.document).toEqual(dayFixture)
        expect(body.promptPackageId).toBe('aurora-demo')
        expect(body.referentielId).toBe('respire')
        return jsonResponse(201, { id: 42 })
      },
    })

    render(<CartographiesPanel store={store} portfolioStore={makePortfolioStore()} fetchFn={fetchFn} />)

    fireEvent.click(await screen.findByRole('button', { name: 'Copier sur le serveur' }))
    const optin = await screen.findByTestId('carto-optin')
    expect(optin.textContent).toContain('choix explicite (RGPD)')
    expect(fetchFn).not.toHaveBeenCalled() // rien ne part avant la confirmation

    fireEvent.click(within(optin).getByRole('button', { name: 'Je confirme la copie sur le serveur' }))

    expect(await screen.findByText('copie serveur')).toBeDefined()
    expect(fetchFn).toHaveBeenCalledTimes(1)
    expect((await store.getCartography(id)).serverId).toBe(42)
    expect(screen.getByRole('button', { name: 'Liens déjà créés' })).toBeDefined()
  })

  it('401 (pas de session) -> message français, pas de serverId stocké', async () => {
    const store = makeStore()
    const { id } = await store.saveCartography(baseEntry)
    const fetchFn = routedFetch({
      'POST api/cartographies': jsonResponse(401, { error: 'Authentification requise' }),
    })

    render(<CartographiesPanel store={store} portfolioStore={makePortfolioStore()} fetchFn={fetchFn} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Copier sur le serveur' }))
    fireEvent.click(
      await screen.findByRole('button', { name: 'Je confirme la copie sur le serveur' }),
    )

    expect((await screen.findByRole('alert')).textContent).toContain('Connectez-vous')
    expect((await store.getCartography(id)).serverId).toBeNull()
  })

  it('« Retirer du serveur » DELETE la copie et efface serverId', async () => {
    const store = makeStore()
    const { id } = await store.saveCartography({ ...baseEntry, serverId: 42 })
    const fetchFn = routedFetch({ 'DELETE api/cartographies/42': noContentResponse() })

    render(<CartographiesPanel store={store} portfolioStore={makePortfolioStore()} fetchFn={fetchFn} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Retirer du serveur' }))

    await waitFor(async () => {
      expect((await store.getCartography(id)).serverId).toBeNull()
    })
    expect(fetchFn).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('copie serveur')).toBeNull()
  })
})

describe('CartographiesPanel — confidentialité', () => {
  it('sans copie serveur : changement local, aucun appel réseau', async () => {
    const store = makeStore()
    const { id } = await store.saveCartography(baseEntry)
    const fetchFn = vi.fn()

    render(<CartographiesPanel store={store} portfolioStore={makePortfolioStore()} fetchFn={fetchFn} />)
    fireEvent.change(await screen.findByLabelText('Confidentialité de Journée du 05/01/2026'), {
      target: { value: 'cartographe' },
    })

    await waitFor(async () => {
      expect((await store.getCartography(id)).visibility).toBe('cartographe')
    })
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('avec copie serveur : PATCH api/cartographies/{serverId} puis mise à jour locale', async () => {
    const store = makeStore()
    const { id } = await store.saveCartography({ ...baseEntry, serverId: 42 })
    const fetchFn = routedFetch({
      'PATCH api/cartographies/42': (init) => {
        expect(JSON.parse(init.body)).toEqual({ visibility: 'publique' })
        return jsonResponse(200, {})
      },
    })

    render(<CartographiesPanel store={store} portfolioStore={makePortfolioStore()} fetchFn={fetchFn} />)
    fireEvent.change(await screen.findByLabelText('Confidentialité de Journée du 05/01/2026'), {
      target: { value: 'publique' },
    })

    await waitFor(async () => {
      expect((await store.getCartography(id)).visibility).toBe('publique')
    })
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })

  it('échec du PATCH serveur : visibilité locale inchangée + erreur affichée', async () => {
    const store = makeStore()
    const { id } = await store.saveCartography({ ...baseEntry, serverId: 42 })
    const fetchFn = routedFetch({
      'PATCH api/cartographies/42': jsonResponse(403, { error: 'Session expirée' }),
    })

    render(<CartographiesPanel store={store} portfolioStore={makePortfolioStore()} fetchFn={fetchFn} />)
    fireEvent.change(await screen.findByLabelText('Confidentialité de Journée du 05/01/2026'), {
      target: { value: 'publique' },
    })

    expect((await screen.findByRole('alert')).textContent).toContain('Session expirée')
    expect((await store.getCartography(id)).visibility).toBe('privee')
  })
})

describe('CartographiesPanel — ancien partage retiré (D-43) : liens déjà créés, partage depuis l’interface', () => {
  async function openDialog(store, fetchFn, props = {}) {
    render(
      <CartographiesPanel store={store} portfolioStore={makePortfolioStore()} fetchFn={fetchFn} {...props} />,
    )
    fireEvent.click(await screen.findByRole('button', { name: 'Liens déjà créés' }))
    return screen.findByRole('region', { name: 'Liens de partage de Journée du 05/01/2026' })
  }

  it('le dialogue ne crée plus de lien : ni mot de passe, ni bouton de création, aucun POST', async () => {
    const store = makeStore()
    await store.saveCartography({ ...baseEntry, serverId: 7 })
    const fetchFn = routedFetch({ 'GET api/cartographies/7/shares': jsonResponse(200, []) })

    const dialog = await openDialog(store, fetchFn)
    expect(await within(dialog).findByText('Aucun lien de partage pour cette cartographie.')).toBeDefined()
    expect(dialog.textContent).toContain('on n’en crée plus de nouveau')
    expect(within(dialog).queryByLabelText(/Mot de passe/)).toBeNull()
    expect(within(dialog).queryByRole('button', { name: /Créer/ })).toBeNull()
    expect(fetchFn).toHaveBeenCalledTimes(1) // seulement le GET des liens
  })

  it('« Partager depuis l’interface » : la cartographie part vers l’interface (nom de fichier, JSON du document)', async () => {
    const store = makeStore()
    await store.saveCartography(baseEntry) // pas besoin de copie serveur
    const onShareInInterface = vi.fn()

    render(
      <CartographiesPanel
        store={store}
        portfolioStore={makePortfolioStore()}
        fetchFn={vi.fn()}
        onShareInInterface={onShareInInterface}
      />,
    )
    fireEvent.click(await screen.findByRole('button', { name: 'Partager depuis l’interface' }))

    await waitFor(() => expect(onShareInInterface).toHaveBeenCalledTimes(1))
    const [files] = onShareInInterface.mock.calls[0]
    expect(files).toHaveLength(1)
    expect(files[0].path).toBe(`cartographie-jour-${dayFixture.date}.json`)
    expect(JSON.parse(files[0].text)).toEqual(dayFixture)
  })

  it('sans câblage vers l’interface, le bouton n’apparaît pas (aucune impasse)', async () => {
    const store = makeStore()
    await store.saveCartography(baseEntry)
    render(<CartographiesPanel store={store} portfolioStore={makePortfolioStore()} fetchFn={vi.fn()} />)
    expect(await screen.findByRole('button', { name: 'Télécharger le JSON' })).toBeDefined()
    expect(screen.queryByRole('button', { name: 'Partager depuis l’interface' })).toBeNull()
  })

  it('le dialogue des liens renvoie lui aussi vers l’interface', async () => {
    const store = makeStore()
    await store.saveCartography({ ...baseEntry, serverId: 7 })
    const fetchFn = routedFetch({ 'GET api/cartographies/7/shares': jsonResponse(200, []) })
    const onShareInInterface = vi.fn()

    const dialog = await openDialog(store, fetchFn, { onShareInInterface })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Partager depuis l’interface' }))
    await waitFor(() => expect(onShareInInterface).toHaveBeenCalledTimes(1))
    expect(JSON.parse(onShareInInterface.mock.calls[0][0][0].text)).toEqual(dayFixture)
  })

  it('révocation d’un lien déjà créé : DELETE api/shares/{shareId} puis liste rafraîchie', async () => {
    const store = makeStore()
    await store.saveCartography({ ...baseEntry, serverId: 7 })
    let shares = [
      { shareId: 1, createdAt: '2026-07-01T10:00:00Z', expiresAt: '2099-09-29T10:00:00Z', revokedAt: null },
    ]
    const fetchFn = routedFetch({
      'GET api/cartographies/7/shares': () => jsonResponse(200, shares),
      'DELETE api/shares/1': () => {
        shares = [{ ...shares[0], revokedAt: '2026-07-12T11:00:00Z' }]
        return noContentResponse()
      },
    })

    const dialog = await openDialog(store, fetchFn)
    expect(await within(dialog).findByText(/expire le/)).toBeDefined()
    // Le bouton qui l'ouvre la désigne (aria-controls).
    const toggle = screen.getByRole('button', { name: 'Liens déjà créés' })
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect(toggle.getAttribute('aria-controls')).toBe(dialog.id)
    fireEvent.click(within(dialog).getByRole('button', { name: 'Révoquer' }))

    expect(await within(dialog).findByText(/révoqué le/)).toBeDefined()
    expect(within(dialog).queryByRole('button', { name: 'Révoquer' })).toBeNull()
  })
})

describe('CartographiesPanel — suppression', () => {
  it('exige une confirmation puis supprime local + serveur (serverId)', async () => {
    const store = makeStore()
    const { id } = await store.saveCartography({ ...baseEntry, serverId: 42 })
    const fetchFn = routedFetch({ 'DELETE api/cartographies/42': noContentResponse() })

    render(<CartographiesPanel store={store} portfolioStore={makePortfolioStore()} fetchFn={fetchFn} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Supprimer' }))
    expect(fetchFn).not.toHaveBeenCalled() // premier clic = simple armement

    fireEvent.click(await screen.findByRole('button', { name: 'Confirmer la suppression' }))

    await waitFor(async () => {
      expect(await store.getCartography(id)).toBeUndefined()
    })
    expect(fetchFn).toHaveBeenCalledTimes(1)
    expect(await screen.findByText(/Aucune cartographie pour l’instant/)).toBeDefined()
  })

  it('sans copie serveur : suppression purement locale, aucun appel réseau', async () => {
    const store = makeStore()
    const { id } = await store.saveCartography(baseEntry)
    const fetchFn = vi.fn()

    render(<CartographiesPanel store={store} portfolioStore={makePortfolioStore()} fetchFn={fetchFn} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Supprimer' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Confirmer la suppression' }))

    await waitFor(async () => {
      expect(await store.getCartography(id)).toBeUndefined()
    })
    expect(fetchFn).not.toHaveBeenCalled()
  })
})

describe('CartographiesPanel — Mes données (import d’archive)', () => {
  it('importe une archive et rafraîchit la liste', async () => {
    const store = makeStore()
    const portfolioStore = makePortfolioStore()
    const archive = {
      schemaVersion: '1.0.0',
      kind: 'archive-export',
      exportedAt: '2026-07-12T10:00:00Z',
      account: null,
      portfolios: [],
      referentiels: [],
      promptPackages: [],
      cartographies: [
        {
          id: 'x1',
          type: 'jour',
          document: dayFixture,
          promptPackageId: 'aurora-demo',
          promptPackageVersion: '1.0.0',
          referentielId: 'respire',
          referentielVersion: '7.0.0',
          runMeta: { modele: 'mock', dateRun: '2026-07-01T10:00:00Z' },
        },
      ],
      audit: [],
    }
    const file = {
      text: async () => JSON.stringify(archive),
    }

    render(<CartographiesPanel store={store} portfolioStore={portfolioStore} fetchFn={vi.fn()} />)
    await screen.findByText(/Aucune cartographie pour l’instant/)

    const input = screen.getByTestId('archive-file-input')
    fireEvent.change(input, { target: { files: [file] } })

    expect((await screen.findByRole('status')).textContent).toContain(
      'Import terminé : 0 portfolio(s) et 1 cartographie(s) restaurés',
    )
    expect(await screen.findByText('Journée du 05/01/2026')).toBeDefined()
  })
})
