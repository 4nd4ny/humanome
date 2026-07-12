import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import MergeView, { findMergeNode } from './MergeView.jsx'
import * as fakeLib from '../test/fake-sunburst-lib.js'

afterEach(cleanup)

const mergeDoc = {
  kind: 'cartographie-merge',
  periode: { premiere: '2026-01-05', derniere: '2026-01-19', nbFeuilles: 3 },
  domains: [
    {
      id: 'TETE — Penser & Comprendre',
      color: '#2563eb',
      rapport_html: '<p>Rapport narratif du pôle TETE.</p>',
      tendance_titre: 'Crescendo',
      tendance_description: 'Le pôle monte.',
      competences: [
        {
          id: '1.01 — Pensée Critique',
          code: '1.01',
          points: 21,
          niveau: 5,
          statut: 'présence établie',
          description: 'Pensée Critique',
          feedback: '<p>Feedback narratif de 1.01.</p>',
          archetype_titre: 'La Vigie',
          archetype_description: 'Toujours en éveil.',
        },
        {
          id: '1.02 — Autre',
          code: '1.02',
          points: 3,
          niveau: -1,
          statut: 'présence établie',
          description: 'Autre',
          feedback: '<p>Feedback de 1.02.</p>',
        },
      ],
    },
    {
      id: 'COEUR — Relier & Naviguer',
      color: '#10b981',
      rapport_html: '<p>Rapport du pôle COEUR.</p>',
      competences: [],
    },
  ],
  profilMeta: {
    competences_etablies: 45,
    competences_renvoyees: 12,
    competences_orphelines: 4,
    score_total: 1234.6,
    evolution_globale: [{ date: '2026-01-05', score_total: 10 }],
  },
  feuilles: [
    { iso: '2026-01-05', label: '05/01/2026' },
    { iso: '2026-01-07', label: '07/01/2026' },
    { iso: '2026-01-19', label: '19/01/2026' },
  ],
  narratifs: { kairosHtml: '<h3>Synthèse évolutive du portfolio</h3><p>Kairos.</p>' },
}

const referentiel = { competences: Array.from({ length: 61 }, (_, i) => ({ code: String(i) })) }

function renderView() {
  return render(<MergeView mergeDoc={mergeDoc} referentiel={referentiel} lib={fakeLib} />)
}

describe('findMergeNode', () => {
  it('résout pôles et compétences depuis les meta du layout', () => {
    const pole = findMergeNode(mergeDoc, { kind: 'pole', id: 'TETE — Penser & Comprendre' })
    expect(pole.domain.color).toBe('#2563eb')
    const competence = findMergeNode(mergeDoc, { kind: 'competence', code: '1.01' })
    expect(competence.competence.points).toBe(21)
    expect(competence.domain.id).toBe('TETE — Penser & Comprendre')
    expect(findMergeNode(mergeDoc, { kind: 'competence', code: '9.99' })).toBe(null)
  })
})

describe('MergeView', () => {
  it('état vide : profil (profilMeta) + kairos, badges et heatmap', () => {
    renderView()
    expect(screen.getByText(/Touchez un secteur du diagramme/)).toBeDefined()
    // Résumé profilMeta comme l'original (le libellé apparaît aussi dans les badges)
    const summary = document.querySelector('.profile-summary')
    expect(summary).not.toBe(null)
    expect(summary.textContent).toContain('Compétences établies')
    expect(summary.textContent).toContain('45 / 61')
    expect(summary.textContent).toContain('En renvoi (entretien)')
    expect(summary.textContent).toContain('12')
    expect(summary.textContent).toContain('1235') // score arrondi
    // Kairos narratif
    expect(screen.getByText('Synthèse évolutive du portfolio')).toBeDefined()
    // Badges d'en-tête + heatmap
    expect(screen.getByText('Feuilles de portfolio')).toBeDefined()
    expect(document.querySelectorAll('rect.heatmap-day')).toHaveLength(3)
  })

  it('clic sur une compétence -> feedback narratif', () => {
    const { container } = renderView()
    fireEvent.click(container.querySelector('path[data-id="1.01 — Pensée Critique"]'))
    expect(screen.getByRole('heading', { name: '1.01 — Pensée Critique' })).toBeDefined()
    expect(screen.getByText('Feedback narratif de 1.01.')).toBeDefined()
    expect(screen.getByText(/Niveau 5 — Excellence/)).toBeDefined()
    expect(screen.getByText('La Vigie')).toBeDefined()
  })

  it('clic sur un pôle -> rapport_html du pôle', () => {
    const { container } = renderView()
    fireEvent.click(container.querySelector('path[data-id="TETE — Penser & Comprendre"]'))
    expect(screen.getByRole('heading', { name: 'TETE — Penser & Comprendre' })).toBeDefined()
    expect(screen.getByText('Rapport narratif du pôle TETE.')).toBeDefined()
    expect(screen.getByText(/2 compétences dans ce pôle/)).toBeDefined()
    expect(screen.getByText(/1 en renvoi/)).toBeDefined()
    expect(screen.getByText('Crescendo')).toBeDefined()
  })

  it('clic sur le fond -> retour à l’état vide', () => {
    const { container } = renderView()
    fireEvent.click(container.querySelector('path[data-id="1.01 — Pensée Critique"]'))
    expect(screen.queryByText(/Touchez un secteur/)).toBe(null)
    fireEvent.click(container.querySelector('svg.sunburst'))
    expect(screen.getByText(/Touchez un secteur du diagramme/)).toBeDefined()
  })

  it('survol -> le nom du secteur apparaît en overlay', () => {
    const { container } = renderView()
    fireEvent.mouseEnter(container.querySelector('path[data-id="1.01 — Pensée Critique"]'))
    expect(container.querySelector('.hover-overlay').textContent).toBe('1.01 — Pensée Critique')
  })

  it('sans lib injectée : le reste de la vue reste utilisable', () => {
    render(<MergeView mergeDoc={mergeDoc} referentiel={referentiel} />)
    expect(screen.getByTestId('diagram-status')).toBeDefined()
    expect(screen.getByText(/Touchez un secteur du diagramme/)).toBeDefined()
    expect(document.querySelectorAll('rect.heatmap-day')).toHaveLength(3)
  })
})
