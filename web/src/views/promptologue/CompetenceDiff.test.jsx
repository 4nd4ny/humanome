// Diff de compétences avec traces du jury (D15) — rendu.
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import jourFixture from '../../../../schemas/fixtures/cartographie-jour-2026-01-05.json'
import { buildCompetenceDiff } from './bench.js'
import CompetenceDiff, { attaqueLabel } from './CompetenceDiff.jsx'

afterEach(cleanup)

function diffFixture() {
  const docB = structuredClone(jourFixture)
  for (const pole of docB.poles) {
    for (const comp of pole.competences) {
      if (comp.code === '2.01') comp.verdict.statut = 'présence non établie'
    }
  }
  return buildCompetenceDiff(
    { days: [{ iso: '2026-01-05', document: jourFixture }] },
    { days: [{ iso: '2026-01-05', document: docB }] },
  )
}

describe('CompetenceDiff', () => {
  it('rend les écarts avec les traces du jury des deux côtés', () => {
    render(<CompetenceDiff diff={diffFixture()} competenceNames={{ '2.01': 'Sollicitude' }} />)
    const bloc = screen.getByTestId('banc-diff-competences')
    // Résumé de la journée : communes + écarts.
    expect(bloc.textContent).toContain('2026-01-05')
    expect(bloc.textContent).toContain('3 commune(s)')
    expect(bloc.textContent).toContain('Établies seulement par A')
    // L'entrée 2.01 porte le nom du référentiel et les statuts des deux côtés.
    expect(bloc.textContent).toContain('2.01 — Sollicitude')
    expect(bloc.textContent).toContain('présence établie')
    expect(bloc.textContent).toContain('présence non établie')
    // Traces du jury : greffier (verbatim), pédagogue (présomptions), verdict.
    expect(bloc.textContent).toContain('Greffier')
    expect(bloc.textContent).toContain('Naël')
    expect(bloc.textContent).toContain('présomption d’absence')
    expect(bloc.textContent).toContain('sycophantie')
    expect(bloc.textContent).toContain('Verdict')
  })

  it('libelle les attaques du pédagogue depuis la typologie du moteur', () => {
    expect(attaqueLabel('g')).toBe('(g) mouvement-vers')
    expect(attaqueLabel('z')).toBe('(z)')
  })

  it('diff vide -> rien', () => {
    const { container } = render(<CompetenceDiff diff={{ parJour: [] }} />)
    expect(container.innerHTML).toBe('')
  })
})
