// Espace apprenant (P8) : tableau de bord (3 blocs), bandeau connecté/anonyme,
// formation (liste, rendu Markdown, progression locale + bascule serveur).
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import EspaceView from './EspaceView.jsx'
import { createMemoryAdapter, createPortfolioStore } from '../lib/portfolio-store.js'
import { createTrainingStore } from '../lib/training-store.js'
import { listChapters } from './espace/formation-content.js'
import * as fakeLib from '../test/fake-sunburst-lib.js'
import mergeFixture from '../../../schemas/fixtures/cartographie-merge-3-jours.json'
import referentielFixture from '../../../schemas/fixtures/referentiel-respire-v7.json'

/** Store de formation factice, journalisant les appels. */
function fakeTrainingStore(chapitres = [], source = 'local') {
  return {
    calls: { load: [], set: [] },
    async load(params) {
      this.calls.load.push(params)
      return { chapitres, source }
    },
    async setChapter(chapitre, completed, params) {
      this.calls.set.push({ chapitre, completed, ...params })
    },
  }
}

function FakePanel() {
  return <p data-testid="fake-carto-panel">panneau cartographies (chantier C)</p>
}

async function seededPortfolios() {
  const store = createPortfolioStore(createMemoryAdapter())
  await store.create({
    titre: 'Journal Astrolabe',
    segments: [{ date: '2026-01-05', texte: 'x', debut: 0, fin: 1 }],
  })
  return store
}

const anonyme = async () => ({ user: null })
const connecte = async () => ({ user: { email: 'a@b.fr', displayName: 'Maya', roles: ['apprenant'] } })

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('EspaceView — tableau de bord (#/espace)', () => {
  it('affiche les trois blocs : portfolios, cartographies, formation', async () => {
    const trainingStore = fakeTrainingStore(['01-pourquoi-un-portfolio-reflexif'])
    render(
      <EspaceView
        section={null}
        deps={{
          fetchMeFn: anonyme,
          portfolioStore: await seededPortfolios(),
          trainingStore,
          cartographiesPanel: FakePanel,
        }}
      />,
    )

    // Bloc portfolios (store local P7).
    await screen.findByText('Journal Astrolabe')
    expect(screen.getByRole('region', { name: 'Mes portfolios' })).toBeTruthy()

    // Bloc cartographies : le panneau du chantier C est composé tel quel.
    expect(screen.getByTestId('fake-carto-panel')).toBeTruthy()

    // Bloc formation : progression calculée sur les chapitres réels.
    const total = listChapters().length
    await waitFor(() =>
      expect(screen.getByTestId('dashboard-formation').textContent).toContain(
        `1 / ${total} chapitres`,
      ),
    )
  })

  it('bandeau anonyme : tout marche en local, invite à se connecter', async () => {
    render(
      <EspaceView
        section={null}
        deps={{
          fetchMeFn: anonyme,
          portfolioStore: createPortfolioStore(createMemoryAdapter()),
          trainingStore: fakeTrainingStore(),
          cartographiesPanel: FakePanel,
        }}
      />,
    )
    const banner = await screen.findByTestId('espace-anonyme')
    expect(banner.textContent).toContain('tout fonctionne en local')
    expect(banner.querySelector('a[href="#/compte"]')).toBeTruthy()
  })

  it('bandeau connecté : identité affichée', async () => {
    render(
      <EspaceView
        section={null}
        deps={{
          fetchMeFn: connecte,
          portfolioStore: createPortfolioStore(createMemoryAdapter()),
          trainingStore: fakeTrainingStore([], 'serveur'),
          cartographiesPanel: FakePanel,
        }}
      />,
    )
    const banner = await screen.findByTestId('espace-connecte')
    expect(banner.textContent).toContain('Maya')
  })

  it('« Voir » (onOpen du panneau, câblage B<->C) : visionneuse puis retour', async () => {
    // Panneau factice honorant le contrat : il reçoit onOpen du tableau de
    // bord et l'appelle avec (document, entry) comme le vrai CartographiesPanel.
    function OpeningPanel({ onOpen }) {
      return (
        <button
          type="button"
          data-testid="fake-voir"
          onClick={() =>
            onOpen(mergeFixture, { id: 'c1', type: 'merge', titre: 'Merge de Maya' })
          }
        >
          Voir
        </button>
      )
    }
    render(
      <EspaceView
        section={null}
        lib={fakeLib}
        deps={{
          fetchMeFn: anonyme,
          portfolioStore: createPortfolioStore(createMemoryAdapter()),
          trainingStore: fakeTrainingStore(),
          cartographiesPanel: OpeningPanel,
          getReferentiel: async () => ({ doc: referentielFixture, origin: 'bundled' }),
        }}
      />,
    )

    fireEvent.click(await screen.findByTestId('fake-voir'))
    const viewer = await screen.findByTestId('carto-viewer')
    expect(viewer.textContent).toContain('Merge de Maya')
    // La vue Merge existante (P2) rend le document en lecture seule.
    await screen.findByText(/Touchez un secteur du diagramme/)

    fireEvent.click(screen.getByRole('button', { name: /Retour au tableau de bord/ }))
    await screen.findByTestId('fake-voir')
    expect(screen.queryByTestId('carto-viewer')).toBeNull()
  })

  it('section inconnue : message et lien de retour', async () => {
    render(<EspaceView section="inconnue" deps={{ fetchMeFn: anonyme }} />)
    expect((await screen.findByRole('alert')).textContent).toContain('inconnue')
  })
})

describe('EspaceView — formation (#/espace/formation)', () => {
  it('liste les chapitres réels avec progression et cases à cocher', async () => {
    const trainingStore = fakeTrainingStore(['01-pourquoi-un-portfolio-reflexif'])
    render(
      <EspaceView section="formation" deps={{ fetchMeFn: anonyme, trainingStore }} />,
    )

    const chapters = listChapters()
    expect(chapters.length).toBeGreaterThanOrEqual(6)
    await screen.findByTestId('formation-progress')
    expect(screen.getByTestId('formation-progress').textContent).toContain(
      `1 / ${chapters.length}`,
    )
    // Un lien par chapitre.
    for (const c of chapters) {
      expect(screen.getByRole('link', { name: c.titre })).toBeTruthy()
    }
  })

  it('coche un chapitre en ANONYME -> progression locale (connected: false)', async () => {
    const trainingStore = fakeTrainingStore()
    render(
      <EspaceView section="formation" deps={{ fetchMeFn: anonyme, trainingStore }} />,
    )
    await screen.findByTestId('formation-progress')
    const box = screen.getAllByRole('checkbox')[0]
    fireEvent.click(box)
    await waitFor(() => expect(trainingStore.calls.set).toHaveLength(1))
    expect(trainingStore.calls.set[0].connected).toBe(false)
  })

  it('coche un chapitre CONNECTÉ -> PUT serveur (connected: true) après migration', async () => {
    const trainingStore = fakeTrainingStore([], 'serveur')
    render(
      <EspaceView section="formation" deps={{ fetchMeFn: connecte, trainingStore }} />,
    )
    await screen.findByTestId('formation-progress')
    // La progression a été chargée en mode connecté (migration incluse).
    await waitFor(() =>
      expect(trainingStore.calls.load).toContainEqual({ connected: true }),
    )
    const box = screen.getAllByRole('checkbox')[0]
    fireEvent.click(box)
    await waitFor(() => expect(trainingStore.calls.set).toHaveLength(1))
    expect(trainingStore.calls.set[0].connected).toBe(true)
  })

  it('bascule anonyme -> connecté avec le VRAI store : migration puis serveur', async () => {
    // Vrai createTrainingStore sur stockage mémoire + API espionnée.
    const map = new Map()
    const storage = {
      getItem: (k) => map.get(k) ?? null,
      setItem: (k, v) => map.set(k, v),
      removeItem: (k) => map.delete(k),
    }
    const put = vi.fn(async () => null)
    const get = vi.fn(async () => ({
      apprenant: { chapitresTermines: ['02-ecrire-des-traces-exploitables'] },
    }))
    const store = createTrainingStore({ storage, api: { get, put } })

    // Phase anonyme : coche locale.
    render(<EspaceView section="formation" deps={{ fetchMeFn: anonyme, trainingStore: store }} />)
    await screen.findByTestId('formation-progress')
    fireEvent.click(screen.getAllByRole('checkbox')[0])
    await waitFor(() => expect(store.listLocal()).toHaveLength(1))
    expect(put).not.toHaveBeenCalled()
    cleanup()

    // Phase connectée : la progression locale est migrée (PUT) puis lue du serveur.
    render(<EspaceView section="formation" deps={{ fetchMeFn: connecte, trainingStore: store }} />)
    await waitFor(() => expect(put).toHaveBeenCalledTimes(1))
    expect(put.mock.calls[0][0]).toMatchObject({ parcours: 'apprenant', completed: true })
    await waitFor(() =>
      expect(screen.getByTestId('formation-progress').textContent).toContain('synchronisée'),
    )
    expect(store.listLocal()).toEqual([]) // local vidé après migration
  })

  it('rend un chapitre en HTML assaini avec case « chapitre terminé »', async () => {
    const trainingStore = fakeTrainingStore()
    render(
      <EspaceView
        section="formation/01-pourquoi-un-portfolio-reflexif"
        deps={{ fetchMeFn: anonyme, trainingStore }}
      />,
    )
    const article = await screen.findByTestId('formation-chapitre')
    expect(article.querySelector('h1')?.textContent).toContain('Pourquoi un portfolio réflexif')
    expect(article.querySelector('script')).toBeNull()
    expect(article.textContent).not.toContain('parcours:') // front-matter ignoré
    expect(screen.getByLabelText(/Chapitre terminé/)).toBeTruthy()
  })

  it('chapitre inconnu : erreur et retour à la liste', async () => {
    render(
      <EspaceView
        section="formation/99-inexistant"
        deps={{ fetchMeFn: anonyme, trainingStore: fakeTrainingStore() }}
      />,
    )
    expect((await screen.findByRole('alert')).textContent).toContain('99-inexistant')
    expect(screen.getByRole('link', { name: 'Retour à la liste des chapitres' })).toBeTruthy()
  })
})
