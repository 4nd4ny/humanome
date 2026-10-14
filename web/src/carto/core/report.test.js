// P5 — rapport imprimable (spec §11, point 3) : données des pages.
import { describe, expect, it } from 'vitest'
import { reportDates, reportObservations, reportSummary, reportTraces } from './report.js'
import { computeState } from './state.js'
import { normalizeReferential } from './referential.js'
import { saveSet, setActive } from './ops.js'
import { indexDataset, miniReferential } from '../test/fixtures.js'

const ref = normalizeReferential(miniReferential())
const NOW = '2026-10-13T12:00:00.000Z'

function dataset() {
  return indexDataset([
    { date: '2025-12-22', verdicts: [{ code: '1.01', confidence: 0.8, roles: ['preuve'] }] },
    { date: '2025-12-23', verdicts: [{ code: '2.01', confidence: 0.5, roles: ['indice'] }, { code: '1.01', confidence: 0.4, roles: ['indice'] }] },
    { date: '2025-12-27', verdicts: [{ code: '3.01', confidence: 0.9, roles: ['preuve'] }] },
  ])
}

describe('rapport : pages 1 et 2', () => {
  it('période, ensemble, pôles et compétences de l’état affiché (ensemble coché jusqu’à t)', () => {
    const ds = dataset()
    const state = computeState(ds, { ref, until: '2025-12-23' })
    const s = reportSummary(ds, state, ref)
    expect(s.period).toEqual({ from: '2025-12-22', to: '2025-12-23' })
    expect(s).toMatchObject({ analysedDays: 2, activeDays: 3, totalDays: 3, setName: null, proofs: 1, hints: 2 })
    expect(s.competencies.map((c) => c.code)).toEqual(['1.01', '2.01'])
    expect(s.competencies.reduce((a, c) => a + c.share, 0)).toBeCloseTo(1)
    expect(s.poles.map((p) => p.num)).toEqual([1, 2])
    expect(s.concentration).toBeCloseTo(1)
  })

  it('nomme l’ensemble quand les journées cochées sont celles d’un ensemble enregistré', () => {
    let ds = setActive(dataset(), ['2025-12-27'], false, { now: NOW })
    ds = saveSet(ds, { name: 'Avant Noël', definition: { kind: 'dates', dates: ['2025-12-22', '2025-12-23'] }, id: 'set-1' }, { now: NOW })
    const s = reportSummary(ds, computeState(ds, { ref }), ref)
    expect(s.setName).toBe('Avant Noël')
    expect(s.activeDays).toBe(2)
  })

  it('sans observation : pas de période, listes vides', () => {
    const ds = setActive(dataset(), ['2025-12-22', '2025-12-23', '2025-12-27'], false, { now: NOW })
    const s = reportSummary(ds, computeState(ds, { ref }), ref)
    expect(s.period).toBeNull()
    expect(s.competencies).toEqual([])
    expect(s.concentration).toBe(0)
  })
})

describe('rapport : pages du jury', () => {
  it('la dernière journée ou toutes ; journées à charger (verdicts et extraits)', () => {
    const ds = dataset()
    const state = computeState(ds, { ref })
    expect(reportObservations(ds, state, '1.01').map((o) => o.date)).toEqual(['2025-12-23'])
    const all = reportObservations(ds, state, '1.01', { scope: 'all' })
    expect(all.map((o) => o.date)).toEqual(['2025-12-22', '2025-12-23'])
    expect(all[0].verdict).toMatchObject({ code: '1.01', status: 'established' })
    expect(all[0].key).toBe(`2025-12-22|v-2025-12-22|1.01`)
    expect(reportObservations(ds, state, '9.99')).toEqual([])
    expect(reportDates(ds, state, ['1.01'], { scope: 'last', extracts: false })).toEqual(['2025-12-23'])
    // Les extraits suivent la portée : ceux de la dernière journée, ou de toutes.
    expect(reportTraces(ds, state, '1.01').map((t) => t.date)).toEqual(['2025-12-23'])
    expect(reportTraces(ds, state, '1.01', { scope: 'all' }).map((t) => t.date)).toEqual(['2025-12-22', '2025-12-23'])
    expect(reportDates(ds, state, ['1.01', '3.01'], { scope: 'last', extracts: true })).toEqual(['2025-12-23', '2025-12-27'])
    expect(reportDates(ds, state, ['1.01', '3.01'], { scope: 'all', extracts: true })).toEqual(['2025-12-22', '2025-12-23', '2025-12-27'])
  })
})
