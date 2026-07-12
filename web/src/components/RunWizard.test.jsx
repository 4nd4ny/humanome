// Assistant « Nouveau run » (P8.3) : étapes, estimation affichée, exécution
// avec moteur réel (mock d'extraction sur fixtures), sauvegarde carto-store
// (mocké : contrat M6 du chantier C), et reprise simulée (stockage mémoire
// pré-checkpointé).
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import RunWizard from './RunWizard.jsx'
import { createMockProvider } from '@engine/providers/mock.js'
import { createMemoryStorage } from '@engine/runs/memory.js'
import referentiel from '../../../schemas/fixtures/referentiel-respire-v7.json'
import day05 from '../../../schemas/fixtures/cartographie-jour-2026-01-05.json'
import day06 from '../../../schemas/fixtures/cartographie-jour-2026-01-06.json'
import day07 from '../../../schemas/fixtures/cartographie-jour-2026-01-07.json'
import { createMemoryAdapter, createPortfolioStore } from '../lib/portfolio-store.js'
import { ApiUnavailableError } from '../api/client.js'
import { BUILTIN_PACKAGE, makeRunId } from '../lib/run-launcher.js'

const DAY_DOCS = { '2026-01-05': day05, '2026-01-06': day06, '2026-01-07': day07 }

function extractionMock() {
  return createMockProvider({
    responses: ({ prompt }) => {
      const iso = prompt.match(/\((\d{4}-\d{2}-\d{2})\)/)[1]
      const doc = DAY_DOCS[iso]
      if (prompt.includes('SYNTHÈSE KAIROS')) return JSON.stringify(doc.kairos)
      const num = Number(prompt.match(/# Pôle (\d) — /)[1])
      return JSON.stringify(doc.poles[num - 1])
    },
  })
}

/** carto-store factice conforme au contrat M6 (chantier C). */
function fakeCartoStore() {
  const saved = []
  return {
    saved,
    module: {
      async saveCartography(entry) {
        saved.push(entry)
        return { id: `c-${saved.length}` }
      },
      async listCartographies() {
        return saved
      },
    },
  }
}

async function seededPortfolioStore() {
  const store = createPortfolioStore(createMemoryAdapter(), { id: () => 'p-1' })
  await store.create({
    titre: 'Mon journal',
    segments: [
      { date: '2026-01-05', texte: 'Texte de la journée un.', debut: 0, fin: 10 },
      { date: '2026-01-06', texte: 'Texte de la journée deux.', debut: 10, fin: 20 },
      { date: '2026-01-07', texte: 'Texte de la journée trois.', debut: 20, fin: 30 },
    ],
  })
  return store
}

function makeDeps(overrides = {}) {
  const carto = fakeCartoStore()
  const storage = overrides.storage ?? createMemoryStorage()
  const navigate = vi.fn()
  const keyMap = new Map()
  const deps = {
    loadReferentiel: async () => ({ doc: referentiel, origin: 'bundled' }),
    apiFetchFn: vi.fn(async () => {
      throw new ApiUnavailableError()
    }),
    keyStorage: {
      getItem: (k) => keyMap.get(k) ?? null,
      setItem: (k, v) => keyMap.set(k, v),
    },
    providerBundleFactory: () => ({
      provider: extractionMock(),
      prime: null,
      model: 'mock-cartographe',
      maxTokens: 8192,
      estimationModel: 'claude-sonnet-4-6',
    }),
    runStorageFactory: () => storage,
    cartoStoreLoader: async () => carto.module,
    navigate,
    ...overrides.deps,
  }
  return { deps, carto, storage, navigate }
}

const session = { status: 'anonymous', user: null }

async function walkToExecution() {
  // (a) portfolio
  const radio = await screen.findByRole('radio', { name: /Mon journal — 3 journée/ })
  fireEvent.click(radio)
  fireEvent.click(screen.getByRole('button', { name: 'Continuer' }))

  // (b) version de prompt : repli embarqué (API indisponible)
  await screen.findByTestId('packages-fallback')
  expect(screen.getByText(/aurora-v3-reconstruit@1\.0\.0/)).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Continuer' }))

  // (c) fournisseur : clé personnelle requise
  await screen.findByTestId('step-fournisseur')
  const next = screen.getByRole('button', { name: 'Continuer' })
  expect(next.disabled).toBe(true) // pas de clé -> bloqué
  fireEvent.change(screen.getByLabelText('Clé API'), { target: { value: 'sk-perso' } })
  await waitFor(() => expect(screen.getByRole('button', { name: 'Continuer' }).disabled).toBe(false))
  fireEvent.click(screen.getByRole('button', { name: 'Continuer' }))

  // (d) estimation AVANT lancement
  await screen.findByTestId('run-estimate')
  fireEvent.click(screen.getByRole('button', { name: 'Continuer' }))
  await screen.findByTestId('step-execution')
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('RunWizard — étapes et estimation', () => {
  it('parcourt les étapes et affiche l’estimation (tokens, coût, durée)', async () => {
    const { deps } = makeDeps()
    render(<RunWizard session={session} deps={{ ...deps, portfolioStore: await seededPortfolioStore() }} />)

    const radio = await screen.findByRole('radio', { name: /Mon journal — 3 journée/ })
    fireEvent.click(radio)
    fireEvent.click(screen.getByRole('button', { name: 'Continuer' }))
    await screen.findByTestId('packages-fallback')
    fireEvent.click(screen.getByRole('button', { name: 'Continuer' }))
    await screen.findByTestId('step-fournisseur')
    fireEvent.change(screen.getByLabelText('Clé API'), { target: { value: 'sk-perso' } })
    fireEvent.click(screen.getByRole('button', { name: 'Continuer' }))

    const estimate = await screen.findByTestId('run-estimate')
    const text = estimate.textContent
    expect(text).toContain('3 journée(s)')
    expect(text).toContain('appels au modèle')
    expect(text).toMatch(/tokens d’entrée/)
    expect(text).toMatch(/Coût estimé/)
    expect(text).toMatch(/Durée estimée/)
    expect(screen.getByText(/Prix INDICATIFS/)).toBeTruthy()
  })

  it('bloque l’étape portfolio tant qu’aucun portfolio n’est choisi', async () => {
    const { deps } = makeDeps()
    render(<RunWizard session={session} deps={{ ...deps, portfolioStore: await seededPortfolioStore() }} />)
    await screen.findByRole('radio', { name: /Mon journal/ })
    expect(screen.getByRole('button', { name: 'Continuer' }).disabled).toBe(true)
  })
})

describe('RunWizard — exécution', () => {
  it('exécute le run puis sauvegarde 3 documents jour + 1 merge via carto-store', async () => {
    const { deps, carto, navigate } = makeDeps()
    render(<RunWizard session={session} deps={{ ...deps, portfolioStore: await seededPortfolioStore() }} />)

    await walkToExecution()
    fireEvent.click(screen.getByRole('button', { name: 'Lancer le run' }))

    await screen.findByTestId('run-success', {}, { timeout: 15000 })

    expect(carto.saved).toHaveLength(4)
    const types = carto.saved.map((e) => e.type)
    expect(types).toEqual(['jour', 'jour', 'jour', 'merge'])
    for (const entry of carto.saved) {
      expect(entry.visibility).toBe('privee')
      expect(entry.promptPackage).toEqual({ id: 'aurora-v3-reconstruit', version: '1.0.0' })
      expect(entry.referentiel.id).toBe('respire')
      expect(entry.serverId).toBeNull()
      expect(entry.runMeta.portfolioId).toBe('p-1')
    }
    expect(carto.saved[3].document.kind).toBe('cartographie-merge')

    // La clé est mémorisée en local (case cochée par défaut).
    expect(deps.keyStorage.getItem('humanome-keys')).toContain('sk-perso')

    fireEvent.click(screen.getByRole('button', { name: 'Retour à l’espace apprenant' }))
    expect(navigate).toHaveBeenCalledWith('#/espace')
  }, 20000)

  it('REPREND un run : la journée déjà checkpointée est sautée et annoncée', async () => {
    const storage = createMemoryStorage()
    const runId = makeRunId('p-1', BUILTIN_PACKAGE)
    // Journée 1 déjà checkpointée (run précédent interrompu / page rechargée).
    await storage.set(`run:${runId}:checkpoint:2026-01-05`, {
      runId,
      iso: '2026-01-05',
      document: day05,
      completedAt: '2026-01-07T10:00:00',
    })

    const provider = extractionMock()
    const { deps, carto } = makeDeps({
      storage,
      deps: {
        providerBundleFactory: () => ({
          provider,
          prime: null,
          model: 'mock-cartographe',
          maxTokens: 8192,
          estimationModel: 'claude-sonnet-4-6',
        }),
      },
    })
    render(<RunWizard session={session} deps={{ ...deps, portfolioStore: await seededPortfolioStore() }} />)

    await walkToExecution()
    fireEvent.click(screen.getByRole('button', { name: 'Lancer le run' }))

    await screen.findByTestId('run-success', {}, { timeout: 15000 })

    // Seules les journées 2 et 3 ont été traitées : 16 appels, pas 24.
    expect(provider.callCount).toBe(16)
    // Les trois documents jour (dont le checkpointé) et le merge sont sauvegardés.
    expect(carto.saved.map((e) => e.type)).toEqual(['jour', 'jour', 'jour', 'merge'])
  }, 20000)
})
