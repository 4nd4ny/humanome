import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import DayView, { findDayNode } from './DayView.jsx'
import * as fakeLib from '../test/fake-sunburst-lib.js'
import { getReferentiel } from '../data/load.js'

afterEach(cleanup)

const referentiel = getReferentiel()

const dayDoc = {
  kind: 'cartographie-jour',
  date: '2026-01-01',
  poles: [
    {
      poleNum: 1,
      passagesSaillants: [
        { pid: 1, extraitVerbatim: 'Extrait saillant', contexte: 'Contexte du passage' },
      ],
      auditPole: {
        competencesTotales: 3,
        presencesEtablies: 1,
        renvoisCartographe: 0,
        nonEtablies: 1,
        courtCircuits: 1,
      },
      rapport: {
        portraitPole: 'Portrait du pôle TETE ce jour.',
        territoiresDenses: [{ competence: 'Pensée critique', description: 'Très présente.' }],
        territoiresNonVisites: 'Régions en attente.',
        emergencesPole: 'Une émergence.',
        pistes: ['Piste concrète 1'],
      },
      competences: [
        {
          code: '1.01',
          courtCircuit: false,
          pieces: [{ numero: 1, pid: 3, contexte: 'Contexte de la pièce 1' }],
          pedagogue: {
            presomptionAbsence: { raisonnement: 'Raisonnement absence.' },
            presomptionSycophantie: { raisonnement: 'Raisonnement sycophantie.' },
            conclusionAdversariale: { raisonnement: 'Conclusion adverse.', confianceFinale: 0.82 },
          },
          verdict: {
            statut: 'présence établie',
            nombrePreuves: 2,
            nombreIndices: 1,
            confiance: 0.82,
            motif: 'Motif du verdict.',
            prescription: 'Prescription du verdict.',
          },
          tracesRetenues: [{ pieceId: 1, type: 'trace concrète', role: 'preuve décisive' }],
        },
        {
          code: '1.02',
          courtCircuit: false,
          pieces: [],
          pedagogue: null,
          verdict: {
            statut: 'présence non établie',
            nombrePreuves: 0,
            nombreIndices: 0,
            confiance: 0.2,
            motif: 'Pièces disqualifiées.',
          },
          tracesRetenues: [],
        },
        {
          code: '1.03',
          courtCircuit: true,
          pieces: [],
          pedagogue: null,
          verdict: {
            statut: 'présence non établie',
            nombrePreuves: 0,
            nombreIndices: 0,
            confiance: 1,
            raison: 'aucune pièce extraite par le Greffier',
            prescriptionMinimale: 'Documenter une situation.',
          },
          tracesRetenues: [],
        },
      ],
    },
  ],
  kairos: {
    kairos: {
      apprenant: { portrait: 'Portrait kairos de la journée.', formeProfil: 'Forme du profil.' },
    },
  },
}

function renderView(props = {}) {
  return render(
    <DayView
      date="2026-01-01"
      referentiel={referentiel}
      days={['2025-12-22', '2026-01-01', '2026-01-04']}
      getDay={() => Promise.resolve(dayDoc)}
      lib={fakeLib}
      {...props}
    />,
  )
}

describe('findDayNode', () => {
  it('résout une compétence et son pôle référentiel', () => {
    const node = findDayNode(dayDoc, referentiel, { kind: 'competence', code: '1.01' })
    expect(node.kind).toBe('competence')
    expect(node.competence.verdict.motif).toBe('Motif du verdict.')
    expect(node.ref.nom).toBe('Pensée Critique & Anti-Hallucination')
    expect(node.refPole.num).toBe(1)
  })

  it('résout un pôle par son nom de référentiel', () => {
    const node = findDayNode(dayDoc, referentiel, {
      kind: 'pole',
      id: 'TETE — Penser & Comprendre',
    })
    expect(node.kind).toBe('pole')
    expect(node.pole.poleNum).toBe(1)
  })
})

describe('DayView', () => {
  it('badge date, retour merge et navigation précédent/suivant', async () => {
    renderView()
    expect(screen.getByTestId('day-badge').textContent).toBe('Journée du 01/01/2026')
    expect(screen.getByRole('link', { name: /Retour à la cartographie/ }).getAttribute('href')).toBe(
      '#/merge',
    )
    await waitFor(() => expect(screen.getByText('Portrait kairos de la journée.')).toBeDefined())
    expect(screen.getByRole('link', { name: /22\/12\/2025/ }).getAttribute('href')).toBe(
      '#/jour/2025-12-22',
    )
    expect(screen.getByRole('link', { name: /04\/01\/2026/ }).getAttribute('href')).toBe(
      '#/jour/2026-01-04',
    )
  })

  it('état vide : portrait kairos + listes des exclus', async () => {
    renderView()
    await waitFor(() => expect(screen.getByTestId('exclus')).toBeDefined())
    expect(screen.getByText('Portrait kairos de la journée.')).toBeDefined()

    const nonEtablies = screen.getByTestId('exclus-non-etablies')
    expect(nonEtablies.textContent).toContain('1.02')
    expect(nonEtablies.textContent).toContain('Présences non établies (1)')

    const courtCircuits = screen.getByTestId('exclus-court-circuits')
    expect(courtCircuits.textContent).toContain('1.03')
    expect(courtCircuits.textContent).toContain('aucune pièce extraite par le Greffier')
  })

  it('?focus=<code> sélectionne la compétence : verdict, pédagogue, traces', async () => {
    renderView({ focus: '1.01' })
    await waitFor(() => expect(screen.getByTestId('verdict-block')).toBeDefined())

    expect(screen.getByText('présence établie')).toBeDefined()
    expect(screen.getByText(/Confiance 82 %/)).toBeDefined()
    expect(screen.getByText(/Motif du verdict\./)).toBeDefined()
    expect(screen.getByText(/Prescription du verdict\./)).toBeDefined()

    // Les trois blocs adversariaux du pédagogue
    const pedagogue = screen.getByTestId('pedagogue')
    expect(pedagogue.textContent).toContain('Présomption d’absence')
    expect(pedagogue.textContent).toContain('Présomption de sycophantie')
    expect(pedagogue.textContent).toContain('Conclusion adversariale')
    expect(pedagogue.textContent).toContain('Raisonnement absence.')

    // Traces retenues, jointes aux pièces
    const traces = screen.getByTestId('traces')
    expect(traces.textContent).toContain('Pièce 1')
    expect(traces.textContent).toContain('preuve décisive')
    expect(traces.textContent).toContain('Contexte de la pièce 1')
  })

  it('clic sur un pôle -> rapport du pôle et passages saillants', async () => {
    const { container } = renderView()
    await waitFor(() =>
      expect(container.querySelector('path[data-kind="pole"]')).not.toBe(null),
    )
    fireEvent.click(container.querySelector('path[data-kind="pole"]'))

    expect(screen.getByRole('heading', { name: 'TETE — Penser & Comprendre' })).toBeDefined()
    expect(screen.getByText('Portrait du pôle TETE ce jour.')).toBeDefined()
    expect(screen.getByText('Piste concrète 1')).toBeDefined()
    expect(screen.getByTestId('passages').textContent).toContain('Extrait saillant')
    expect(screen.getByText(/1 présence\(s\) établie\(s\)/)).toBeDefined()
  })

  it('affiche l’erreur de chargement (ex. file://)', async () => {
    renderView({
      getDay: () =>
        Promise.reject(
          new Error('La vue journée est disponible sur le site en ligne ou via un serveur local'),
        ),
    })
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toContain(
        'La vue journée est disponible sur le site en ligne ou via un serveur local',
      ),
    )
  })
})
