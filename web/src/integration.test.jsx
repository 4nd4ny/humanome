// Integration: the views wired onto the REAL sunburst lib
// (src/lib/sunburst/index.js) and the REAL demo corpus — no fake module here.
// This is the end-to-end contract check between the app shell and the lib,
// both developed in parallel against docs/plan-fusion-visu.md.
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import * as sunburstLib from './lib/sunburst/index.js'
import { getDemoMerge, getReferentiel } from './data/load.js'
import MergeView from './views/MergeView.jsx'
import DayView from './views/DayView.jsx'
import dayDoc from '../public/data/demo/jours/2026-01-04.json'

afterEach(cleanup)

const mergeDoc = getDemoMerge()
const referentiel = getReferentiel()

describe('MergeView + lib réelle + corpus réel', () => {
  it('rend les 331 paths du diagramme original (7 pôles + 54 x 6)', () => {
    const { container } = render(
      <MergeView mergeDoc={mergeDoc} referentiel={referentiel} lib={sunburstLib} />,
    )
    const paths = container.querySelectorAll('svg.sunburst path')
    expect(paths).toHaveLength(331)
    expect(container.querySelectorAll('svg.sunburst path.sector')).toHaveLength(61) // 7 pôles + 54 compétences
    expect(container.querySelectorAll('svg.sunburst path.gray-sector')).toHaveLength(270) // 54 x 5
  })

  it('clic sur une compétence réelle -> feedback narratif sanitizé', () => {
    const { container } = render(
      <MergeView mergeDoc={mergeDoc} referentiel={referentiel} lib={sunburstLib} />,
    )
    const sector = container.querySelector(
      'path[data-kind="competence"][data-id="1.01 — Pensée Critique & Anti-Hallucination"]',
    )
    expect(sector).not.toBe(null)
    fireEvent.click(sector)
    expect(
      screen.getByRole('heading', { name: '1.01 — Pensée Critique & Anti-Hallucination' }),
    ).toBeDefined()
    // Le feedback réel commence par le badge « Présence établie (cumulée) »
    expect(screen.getByText('Présence établie (cumulée)')).toBeDefined()
  })

  it('clic sur un pôle réel -> rapport_html du pôle', () => {
    const { container } = render(
      <MergeView mergeDoc={mergeDoc} referentiel={referentiel} lib={sunburstLib} />,
    )
    const sector = container.querySelector(
      'path[data-kind="pole"][data-id="TETE — Penser & Comprendre"]',
    )
    expect(sector).not.toBe(null)
    fireEvent.click(sector)
    expect(screen.getByRole('heading', { name: 'TETE — Penser & Comprendre' })).toBeDefined()
    expect(screen.getByTestId('narrative-html').innerHTML).not.toBe('')
  })

  it('les secteurs gris réels sont inertes (le clic ne sélectionne pas)', () => {
    const { container } = render(
      <MergeView mergeDoc={mergeDoc} referentiel={referentiel} lib={sunburstLib} />,
    )
    const gray = container.querySelector('svg.sunburst path.gray-sector')
    expect(gray.getAttribute('pointer-events')).toBe('none')
  })
})

describe('DayView + lib réelle + journée réelle (2026-01-04)', () => {
  const getDay = () => Promise.resolve(dayDoc)

  it('rend le diagramme du jour et les exclus (non établies + court-circuits)', async () => {
    const { container } = render(
      <DayView date="2026-01-04" referentiel={referentiel} getDay={getDay} lib={sunburstLib} />,
    )
    // 9 établies x 6 paths + 16 renvois x 1 path + 7 pôles = 77
    await screen.findByTestId('exclus')
    expect(container.querySelectorAll('svg.sunburst path')).toHaveLength(77)
    expect(container.querySelectorAll('svg.sunburst path.renvoi-sector')).toHaveLength(16)
    expect(screen.getByTestId('exclus-non-etablies').textContent).toContain('(6)')
    expect(screen.getByTestId('exclus-court-circuits').textContent).toContain('(30)')
  })

  it('?focus=<code> sélectionne la compétence réelle et affiche son verdict', async () => {
    const etablie = dayDoc.poles
      .flatMap((p) => p.competences)
      .find((c) => !c.courtCircuit && c.verdict.statut === 'présence établie')
    render(
      <DayView
        date="2026-01-04"
        focus={etablie.code}
        referentiel={referentiel}
        getDay={getDay}
        lib={sunburstLib}
      />,
    )
    await screen.findByTestId('verdict-block')
    expect(screen.getByText('présence établie')).toBeDefined()
    const nom = referentiel.competences.find((c) => c.code === etablie.code).nom
    expect(screen.getByRole('heading', { name: `${etablie.code} — ${nom}` })).toBeDefined()
  })
})
