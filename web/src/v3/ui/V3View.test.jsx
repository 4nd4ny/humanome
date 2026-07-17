// Interface V3 — fumée de la vue principale : chargement du corpus démo,
// barre de contexte, panneaux par mode, sélection synchronisée, inspection,
// « Voir l'état à cette date » distincte de l'inspection (AC-SYNC-03/04),
// bascule de mode conservant l'état (AC-UI-01), vue employeur réimportée.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import V3View from './V3View.jsx'
import demoDay from '../../../public/data/demo/jours/2026-01-04.json'
import referentielDoc from '../../../public/data/referentiel/respire-v7.json'

afterEach(cleanup)

// Deux journées de démo (la seconde à contenu distinct, cf. share.test.js).
const day2 = structuredClone(demoDay)
day2.date = '2026-02-10'
for (const pole of day2.poles) {
  for (const p of pole.passagesSaillants ?? []) p.extraitVerbatim = `Deuxième journée (pôle ${pole.poleNum}, pid ${p.pid}).`
}

const INDEX = [
  { date: '2026-01-04', iso: '2026-01-04', label: '04/01/2026', ordre: 0 },
  { date: '2026-02-10', iso: '2026-02-10', label: '10/02/2026', ordre: 1 },
]
const DOCS = { '2026-01-04': demoDay, '2026-02-10': day2 }

function fetchStub() {
  return vi.fn(async (url) => {
    if (url.endsWith('index.json')) return { json: async () => INDEX }
    const m = url.match(/jours\/(\d{4}-\d{2}-\d{2})\.json$/)
    if (m) return { json: async () => DOCS[m[1]] }
    throw new Error(`fetch non mocké : ${url}`)
  })
}

const deps = () => ({
  fetchFn: fetchStub(),
  getReferentiel: vi.fn().mockResolvedValue({ doc: referentielDoc }),
})

describe('V3View', () => {
  it('charge le corpus, affiche la barre de contexte et le soleil (mode simplifié)', async () => {
    render(<V3View deps={deps()} />)
    await screen.findByRole('toolbar', { name: 'Barre de contexte' })
    expect(await screen.findByRole('img', { name: /Diagramme radial/ })).toBeTruthy()
    // Mode simplifié : pas d'éditeur JSON ni d'audit détaillé.
    expect(screen.queryByLabelText('Éditeur JSON expert')).toBeNull()
    // La commande « Réafficher les panneaux » reste accessible (AC-UI-03).
    expect(screen.getByText('Réafficher les panneaux')).toBeTruthy()
  })

  it('inspecter une journée ouvre le portfolio SANS déplacer la tête de lecture (AC-SYNC-03/04)', async () => {
    render(<V3View deps={deps()} />)
    await screen.findByRole('toolbar', { name: 'Barre de contexte' })
    // Ouvre le panneau portfolio via le menu Panneaux.
    fireEvent.click(screen.getByText('Panneaux'))
    fireEvent.click(screen.getByLabelText('Portfolio'))
    const cell = await screen.findByRole('gridcell', { name: /2026-01-04 : \d+ compétences/ })
    fireEvent.click(cell)
    expect(await screen.findByRole('region', { name: 'Portfolio de la journée 2026-01-04' })).toBeTruthy()
    // La tête de lecture n'a PAS bougé (état complet).
    expect(screen.getByRole('toolbar', { name: 'Barre de contexte' }).textContent).toContain('état complet')
    // « Voir l'état à cette date » la déplace.
    fireEvent.click(screen.getByText('Voir l’état à cette date'))
    expect(screen.getByRole('toolbar', { name: 'Barre de contexte' }).textContent).toContain('tête de lecture 2026-01-04')
  })

  it('bascule simplifié → expert : arbre + audit apparaissent, le filtre est conservé (AC-UI-01)', async () => {
    render(<V3View deps={deps()} />)
    await screen.findByRole('toolbar', { name: 'Barre de contexte' })
    // Filtre depuis le soleil (un secteur documenté).
    const sector = document.querySelector('.v3-sector:not(.v3-sector-family)')
    fireEvent.click(sector)
    const bar = screen.getByRole('toolbar', { name: 'Barre de contexte' })
    expect(bar.textContent).toContain('Filtre : comp-')
    fireEvent.change(screen.getByLabelText(/Mode/), { target: { value: 'expert' } })
    expect(await screen.findByRole('navigation', { name: 'Référentiel de compétences' })).toBeTruthy()
    expect(screen.getByLabelText('Rapport d’import')).toBeTruthy()
    expect(bar.textContent).toContain('Filtre : comp-') // état conservé
  })

  it('les titres « Référentiel » et « Journées » réinitialisent leur sélection', async () => {
    // localStorage peut porter le mode expert d'un test précédent : on force
    // un état propre puis on passe en expert (arbre + heatmap visibles).
    localStorage.clear()
    render(<V3View deps={deps()} />)
    await screen.findByRole('toolbar', { name: 'Barre de contexte' })
    fireEvent.change(screen.getByLabelText(/Mode/), { target: { value: 'expert' } })
    await screen.findByRole('navigation', { name: 'Référentiel de compétences' })

    // Filtre actif (secteur du soleil) → le titre-bouton « Référentiel » le retire.
    fireEvent.click(document.querySelector('.v3-sector:not(.v3-sector-family)'))
    const bar = screen.getByRole('toolbar', { name: 'Barre de contexte' })
    expect(bar.textContent).toContain('Filtre : comp-')
    fireEvent.click(screen.getByRole('button', { name: 'Référentiel — réinitialiser la sélection' }))
    expect(bar.textContent).toContain('Toutes les compétences')

    // Journée inspectée → le titre-bouton « Journées » réinitialise l'inspection.
    fireEvent.click(await screen.findByRole('gridcell', { name: /2026-01-04 : \d+ compétences/ }))
    expect(await screen.findByRole('region', { name: 'Portfolio de la journée 2026-01-04' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Journées — réinitialiser la sélection' }))
    expect(screen.queryByRole('region', { name: 'Portfolio de la journée 2026-01-04' })).toBeNull()
    // La tête de lecture, elle, n'a pas été touchée (AC-SYNC-04).
    expect(bar.textContent).toContain('état complet')
  })

  it('« Pourquoi ce rayon ? » (touche w) montre la métrique et les journées exactes (AC-SYNC-05)', async () => {
    render(<V3View deps={deps()} />)
    await screen.findByRole('toolbar', { name: 'Barre de contexte' })
    const sector = document.querySelector('.v3-sector:not(.v3-sector-family)')
    fireEvent.keyDown(sector, { key: 'w' })
    const dialog = await screen.findByRole('dialog', { name: /Pourquoi ce rayon/ })
    expect(dialog.textContent).toContain('documented-days-v1')
    expect(dialog.textContent).toMatch(/\d{4}-\d{2}-\d{2}/)
  })
})
