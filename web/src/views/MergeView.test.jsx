import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import MergeView, { findMergeNode } from './MergeView.jsx'
import * as fakeLib from '../test/fake-sunburst-lib.js'

afterEach(cleanup)

const ETABLIE = 'présence établie'

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
          score_moyen_par_feuille: 2.5,
          // Établie dès la première feuille (visible sur toutes les trames).
          parFeuille: [
            { date: '2026-01-05', statut: ETABLIE, preuves: 2, indices: 1, confiance: 0.8, score: 2.8 },
            { date: '2026-01-07', statut: ETABLIE, preuves: 3, indices: 2, confiance: 0.9, score: 4.8 },
            { date: '2026-01-19', statut: ETABLIE, preuves: 1, indices: 0, confiance: 0.7, score: 1 },
          ],
        },
        {
          id: '1.02 — Autre',
          code: '1.02',
          points: 3,
          niveau: -1,
          statut: 'présence établie',
          description: 'Autre',
          feedback: '<p>Feedback de 1.02.</p>',
          score_moyen_par_feuille: 1.0,
          // Établie seulement à la dernière feuille (absente des trames 0 et 1).
          parFeuille: [
            { date: '2026-01-19', statut: ETABLIE, preuves: 1, indices: 0, confiance: 0.6, score: 1 },
          ],
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
    evolution_globale: [
      { date: '2026-01-05', score_total: 10, etablies: 1 },
      { date: '2026-01-07', score_total: 20.4, etablies: 1 },
      { date: '2026-01-19', score_total: 30.9, etablies: 2 },
    ],
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

describe('MergeView — timeline animée (chantier C)', () => {
  const slider = () => screen.getByRole('slider', { name: 'Position dans les feuilles du portfolio' })

  it('vue finale par défaut : timeline positionnée sur la dernière feuille, sunburst complet', () => {
    const { container } = renderView()
    expect(slider().value).toBe('2') // dernière trame (index feuilles.length - 1)
    expect(slider().getAttribute('aria-valuetext')).toBe('19/01/2026')
    // Trame finale = document publié tel quel : tous les secteurs présents.
    expect(container.querySelector('path[data-id="1.01 — Pensée Critique"]')).not.toBe(null)
    expect(container.querySelector('path[data-id="1.02 — Autre"]')).not.toBe(null)
    expect(container.querySelector('path[data-id="COEUR — Relier & Naviguer"]')).not.toBe(null)
    // Compteur : cumul de compétences sur la carte + score du jour
    // (profilMeta.evolution_globale, dernière entrée).
    expect(screen.getByTestId('timeline-counter').textContent).toBe(
      '2 compétences sur la carte · score du jour 31',
    )
    // La heatmap reste en place pour l'accès « jour instantané ».
    expect(document.querySelectorAll('rect.heatmap-day')).toHaveLength(3)
  })

  it('scrub vers une trame antérieure : le sunburst se reconstruit avec les seules compétences établies à cette date', () => {
    const { container } = renderView()
    fireEvent.change(slider(), { target: { value: '0' } })
    // 1.01 est établie dès la première feuille, 1.02 seulement à la dernière ;
    // le pôle COEUR (vide) disparaît des trames intermédiaires.
    expect(container.querySelector('path[data-id="1.01 — Pensée Critique"]')).not.toBe(null)
    expect(container.querySelector('path[data-id="1.02 — Autre"]')).toBe(null)
    expect(container.querySelector('path[data-id="COEUR — Relier & Naviguer"]')).toBe(null)
    expect(screen.getByTestId('timeline-counter').textContent).toBe(
      '1 compétence sur la carte · score du jour 10',
    )
    // Retour à la dernière trame : le secteur réapparaît (monotonie).
    fireEvent.change(slider(), { target: { value: '2' } })
    expect(container.querySelector('path[data-id="1.02 — Autre"]')).not.toBe(null)
  })

  it('sélection sur une trame antérieure : le panneau lit les agrégats cumulés à cette date', () => {
    const { container } = renderView()
    fireEvent.change(slider(), { target: { value: '0' } })
    fireEvent.click(container.querySelector('path[data-id="1.01 — Pensée Critique"]'))
    // 1 feuille établie au 05/01 -> 1 point (et non les 21 du document final) ;
    // métadonnées non numériques reportées du final (feedback, archétype).
    expect(screen.getByText(/1 points/)).toBeDefined()
    expect(screen.getByText('Feedback narratif de 1.01.')).toBeDefined()
    expect(screen.getByText('La Vigie')).toBeDefined()
  })

  it('la lecture se met en pause dès qu un secteur est sélectionné ou survolé', () => {
    const { container } = renderView()
    const play = screen.getByRole('button', { name: /Lancer la lecture/ })
    fireEvent.click(play)
    expect(play.getAttribute('aria-pressed')).toBe('true')
    fireEvent.mouseEnter(container.querySelector('path[data-id="1.01 — Pensée Critique"]'))
    expect(
      screen.getByRole('button', { name: /Lancer la lecture/ }).getAttribute('aria-pressed'),
    ).toBe('false')
  })

  it('document sans feuilles : pas de timeline, sunburst final inchangé', () => {
    const doc = { ...mergeDoc, feuilles: [] }
    const { container } = render(<MergeView mergeDoc={doc} referentiel={referentiel} lib={fakeLib} />)
    expect(screen.queryByRole('slider', { name: 'Position dans les feuilles du portfolio' })).toBe(null)
    expect(container.querySelector('path[data-id="1.01 — Pensée Critique"]')).not.toBe(null)
  })
})
