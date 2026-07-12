// Banc d'essai (P10.4) — composant : sélection de versions (publiées + MES
// brouillons seulement), exécution simple, multi-run, A/B avec rapport.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import BancEssaiSection from './BancEssaiSection.jsx'
import jourFixture from '../../../../schemas/fixtures/cartographie-jour-2026-01-05.json'
import pkgFixture from '../../../../schemas/fixtures/prompt-package-exemple.json'
import referentielFixture from '../../../../schemas/fixtures/referentiel-respire-v7.json'

const user = { email: 'p@b.fr', displayName: 'Pom', roles: ['promptologue'] }

function fakeApi(overrides = {}) {
  return {
    listPublished: vi.fn(async () => [{ id: 'aurora-lab', version: '2.0.0' }]),
    listDrafts: vi.fn(async () => [{ draftId: '7', id: 'aurora-demo', version: '1.1.0' }]),
    getDraft: vi.fn(async () => ({
      draftId: '7',
      document: { ...structuredClone(pkgFixture), version: '1.1.0' },
    })),
    getPackage: vi.fn(async (id, version) => ({ ...structuredClone(pkgFixture), id, version })),
    ...overrides,
  }
}

function fakeDeps(runFn) {
  return {
    runFn,
    portfolioStore: { list: vi.fn(async () => [] ) },
    getReferentielFn: () => referentielFixture,
    createBundleFn: vi.fn(() => ({
      provider: { complete: async () => ({ text: '' }) },
      prime: null,
      model: 'demo',
      maxTokens: 8192,
      estimationModel: 'claude-sonnet-5',
    })),
  }
}

const okRun = (pkg) => ({
  pkg: { id: pkg.id, version: pkg.version },
  engine: pkg.builtin === true,
  days: [{ iso: '2026-01-05', document: jourFixture }],
  llmCalls: 8,
  durationMs: 2000,
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('BancEssaiSection — sélection', () => {
  it('propose le paquet embarqué, les versions publiées et MES brouillons', async () => {
    render(<BancEssaiSection api={fakeApi()} user={user} deps={fakeDeps(vi.fn())} />)
    const select = await screen.findByLabelText('Version à tester')
    const labels = [...select.options].map((o) => o.textContent)
    expect(labels[0]).toContain('moteur embarqué')
    expect(labels).toContain('aurora-lab@2.0.0 (publiée)')
    expect(labels).toContain('aurora-demo@1.1.0 (mon brouillon)')
    // Règle de sécurité : la liste des brouillons vient de GET drafts (les
    // miens uniquement) — un brouillon ne tourne que chez son auteur.
    expect(screen.getByText(/ne s’exécute que chez son auteur/)).toBeTruthy()
  })
})

describe('BancEssaiSection — exécution', () => {
  it('run simple : exécute la version choisie et affiche le résumé par jour', async () => {
    const runFn = vi.fn(async ({ pkg }) => okRun(pkg))
    render(<BancEssaiSection api={fakeApi()} user={user} deps={fakeDeps(runFn)} />)
    await screen.findByLabelText('Version à tester')
    fireEvent.click(screen.getByRole('button', { name: 'Lancer' }))
    const table = await screen.findByTestId('banc-simple')
    expect(runFn).toHaveBeenCalledTimes(1)
    expect(runFn.mock.calls[0][0].pkg.id).toBe('aurora-v3-reconstruit')
    expect(runFn.mock.calls[0][0].dayGroups).toHaveLength(3) // fixture Maya
    expect(table.textContent).toContain('2026-01-05')
    expect(table.textContent).toContain('2.01')
  })

  it('un brouillon sélectionné est exécuté depuis son document local (auteur)', async () => {
    const runFn = vi.fn(async ({ pkg }) => okRun(pkg))
    const api = fakeApi()
    render(<BancEssaiSection api={api} user={user} deps={fakeDeps(runFn)} />)
    const select = await screen.findByLabelText('Version à tester')
    fireEvent.change(select, { target: { value: 'draft:7' } })
    fireEvent.click(screen.getByRole('button', { name: 'Lancer' }))
    await screen.findByTestId('banc-simple')
    expect(runFn.mock.calls[0][0].pkg.version).toBe('1.1.0')
    expect(api.getPackage).not.toHaveBeenCalled() // pas d'aller-retour serveur
  })

  it('multi-run : N exécutions puis rapport de consistance', async () => {
    const runFn = vi.fn(async ({ pkg }) => okRun(pkg))
    render(<BancEssaiSection api={fakeApi()} user={user} deps={fakeDeps(runFn)} />)
    await screen.findByLabelText('Version à tester')
    fireEvent.click(screen.getByRole('radio', { name: /Multi-run/ }))
    fireEvent.change(screen.getByLabelText('Nombre de runs'), { target: { value: '3' } })
    fireEvent.click(screen.getByRole('button', { name: 'Lancer' }))
    const bloc = await screen.findByTestId('banc-multi')
    expect(runFn).toHaveBeenCalledTimes(3)
    expect(bloc.textContent).toContain('3 runs')
    expect(bloc.textContent).toContain('0.000') // runs identiques -> distance 0
    // Rendu via lib/consistency-view.js (chantier C) : accord % + badges.
    expect(bloc.textContent).toContain('accord 100 %')
    expect(bloc.querySelector('.verdict-badge.etablie')).toBeTruthy()
  })

  it('A/B : deux versions, tableau comparatif et rapport JSON téléchargeable', async () => {
    const runFn = vi.fn(async ({ pkg }) => okRun(pkg))
    const api = fakeApi()
    render(<BancEssaiSection api={api} user={user} deps={fakeDeps(runFn)} />)
    await screen.findByLabelText('Version à tester')
    fireEvent.click(screen.getByRole('radio', { name: /A\/B/ }))
    fireEvent.change(screen.getByLabelText('Version A'), { target: { value: 'builtin' } })
    fireEvent.change(screen.getByLabelText('Version B'), { target: { value: 'pub:aurora-lab@2.0.0' } })
    fireEvent.click(screen.getByRole('button', { name: 'Lancer' }))
    const bloc = await screen.findByTestId('banc-ab')
    expect(runFn).toHaveBeenCalledTimes(2)
    expect(api.getPackage).toHaveBeenCalledWith('aurora-lab', '2.0.0')
    expect(bloc.textContent).toContain('aurora-v3-reconstruit@1.0.0')
    expect(bloc.textContent).toContain('aurora-lab@2.0.0')
    const link = screen.getByRole('link', { name: 'Télécharger le rapport JSON' })
    expect(link.getAttribute('href')).toMatch(/^data:application\/json/)
    expect(link.getAttribute('download')).toContain('rapport-ab')
  })

  it('affiche l’erreur d’exécution (echec provider, quota sandbox…)', async () => {
    const runFn = vi.fn(async () => {
      throw new Error("Sandbox : quota d'appels LLM dépassé (16 max par run) — exécution interrompue.")
    })
    render(<BancEssaiSection api={fakeApi()} user={user} deps={fakeDeps(runFn)} />)
    await screen.findByLabelText('Version à tester')
    fireEvent.click(screen.getByRole('button', { name: 'Lancer' }))
    await screen.findByText(/quota d'appels LLM dépassé/)
  })
})
