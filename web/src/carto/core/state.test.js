// État affiché état(S, t) et disposition du soleil — critères d'acceptation P0
// (spec §14) : 1 compétence = 360° ; l'ajout d'une 2ᵉ la fait passer à 180° ;
// aire = θ·k·C/2.
import { describe, expect, it } from 'vitest'
import { computeDayState, computeState, explainSurface, layoutSun } from './state.js'
import { normalizeReferential } from './referential.js'
import { annularSectorArea, encodedArea, ringGeometry, toRadians } from './formulas.js'
import { indexDataset, miniReferential } from '../test/fixtures.js'
import { chooseVariant, setActive } from './ops.js'

const ref = normalizeReferential(miniReferential())
const geometry = ringGeometry({ outerRadius: 200, centerRadius: 24, gap: 4 })

describe('critères d’acceptation P0', () => {
  it('une seule compétence observée occupe 360°', () => {
    const ds = indexDataset([{ date: '2025-12-22', verdicts: [{ code: '1.01', confidence: 0.8, roles: ['preuve'] }] }])
    const s = computeState(ds, { ref })
    expect(s.competencies.get('1.01').theta).toBeCloseTo(360)
    expect(s.poles.get(1).theta).toBeCloseTo(360)
  })

  it('l’ajout d’une deuxième compétence (même intensité) la fait passer à 180°', () => {
    const ds = indexDataset([
      { date: '2025-12-22', verdicts: [{ code: '1.01', confidence: 0.8, roles: ['preuve'] }] },
      { date: '2025-12-23', verdicts: [{ code: '2.01', confidence: 0.8, roles: ['preuve'] }] },
    ])
    const before = computeState(ds, { ref, until: '2025-12-22' })
    expect(before.competencies.get('1.01').theta).toBeCloseTo(360)
    const after = computeState(ds, { ref })
    expect(after.competencies.get('1.01').theta).toBeCloseTo(180)
    expect(after.competencies.get('2.01').theta).toBeCloseTo(180)
  })

  it('aire de chaque secteur dessiné = θ·k·C/2, et aire d’un pôle = Σ aires de ses compétences', () => {
    const ds = indexDataset([
      { date: '2025-12-22', verdicts: [{ code: '1.01', confidence: 0.8, roles: ['preuve', 'indice'] }, { code: '1.02', confidence: 0.55, roles: ['indice'] }] },
      { date: '2025-12-23', verdicts: [{ code: '2.01', confidence: 0.9, roles: ['preuve'] }, { code: '1.01', confidence: 0.6, roles: ['indice'] }] },
      { date: '2025-12-24', verdicts: [{ code: '3.02', confidence: 0.3, roles: ['indice', 'indice'] }] },
    ])
    const s = computeState(ds, { ref })
    const layout = layoutSun(s, ref, geometry, { minThickness: 0 })
    for (const sector of [...layout.competencies, ...layout.poles]) {
      const area = annularSectorArea(sector.a1 - sector.a0, sector.rIn, sector.rOut)
      expect(area).toBeCloseTo(encodedArea(toRadians(sector.theta), geometry.k, sector.confidence), 6)
    }
    for (const pole of layout.poles) {
      const poleArea = annularSectorArea(pole.a1 - pole.a0, pole.rIn, pole.rOut)
      const sum = layout.competencies
        .filter((c) => c.pole === pole.num)
        .reduce((acc, c) => acc + annularSectorArea(c.a1 - c.a0, c.rIn, c.rOut), 0)
      expect(poleArea).toBeCloseTo(sum, 6)
    }
  })
})

describe('état(S, t) (§5.1)', () => {
  const ds = indexDataset([
    { date: '2025-12-22', verdicts: [{ code: '1.01', confidence: 0.8, roles: ['preuve'] }] },
    { date: '2025-12-23', verdicts: [{ code: '2.01', confidence: 0.5, roles: ['indice'] }, { code: '1.01', confidence: 0.4, roles: ['indice'] }] },
    { date: '2025-12-27', verdicts: [{ code: '3.01', confidence: 0.9, roles: ['preuve'] }] },
  ])

  it('t borne les journées retenues (état cumulé jusqu’à t)', () => {
    const s = computeState(ds, { ref, until: '2025-12-23' })
    expect(s.dates).toEqual(['2025-12-22', '2025-12-23'])
    expect(s.competencies.has('3.01')).toBe(false)
  })

  it('t = null : état complet', () => {
    expect(computeState(ds, { ref }).dates).toHaveLength(3)
  })

  it('une journée décochée ne contribue pas', () => {
    const s = computeState(setActive(ds, ['2025-12-27'], false), { ref })
    expect(s.dates).toEqual(['2025-12-22', '2025-12-23'])
    expect(s.competencies.has('3.01')).toBe(false)
  })

  it('un ensemble explicite S remplace les cases cochées', () => {
    const s = computeState(ds, { ref, dates: ['2025-12-27'] })
    expect([...s.competencies.keys()]).toEqual(['3.01'])
  })

  it('intensité cumulée sur les journées : 1 − (1 − 0,8)(1 − 0,2)', () => {
    const c = computeState(ds, { ref }).competencies.get('1.01')
    expect(c.intensity).toBeCloseTo(1 - 0.2 * 0.8)
    expect(c.days).toEqual(['2025-12-22', '2025-12-23'])
    expect(c.proofs).toBe(1)
    expect(c.hints).toBe(1)
  })

  it('C(c) = moyenne des confiances des verdicts qui fournissent des traces', () => {
    expect(computeState(ds, { ref }).competencies.get('1.01').confidence).toBeCloseTo(0.6)
  })

  it('l’ordre angulaire est celui du référentiel, jamais celui des tailles', () => {
    const big = indexDataset([
      { date: '2025-12-22', verdicts: [{ code: '3.02', confidence: 0.95, roles: ['preuve', 'preuve', 'preuve'] }, { code: '1.02', confidence: 0.2, roles: ['indice'] }] },
    ])
    const layout = layoutSun(computeState(big, { ref }), ref, geometry)
    expect(layout.competencies.map((c) => c.code)).toEqual(['1.02', '3.02'])
    expect(layout.competencies[0].a0).toBeCloseTo(-Math.PI / 2)
    expect(layout.competencies[1].a1).toBeCloseTo(-Math.PI / 2 + 2 * Math.PI)
  })
})

describe('statuts (§5.2, §4.2)', () => {
  it('non établie et court-circuit ne fournissent pas de traces ; le court-circuit est compté à part', () => {
    const ds = indexDataset([
      {
        date: '2025-12-22',
        verdicts: [
          { code: '1.01', status: 'not_established', confidence: 0.9, roles: ['indice'] },
          { code: '1.02', status: 'established', courtCircuit: true, confidence: 0.9, roles: ['preuve'] },
          { code: '2.01', status: 'needs_review', confidence: 0.5, roles: ['indice'] },
        ],
      },
    ])
    const s = computeState(ds, { ref })
    expect([...s.competencies.keys()]).toEqual(['2.01'])
    expect(s.competencies.get('2.01').status).toBe('needs_review')
    expect(s.excluded).toMatchObject({ notEstablished: 1, courtCircuit: 1 })
    expect(s.poles.get(2).needsReviewOnly).toBe(true)
  })

  it('une compétence établie au moins une fois n’est plus « renvoi » (règle optimiste)', () => {
    const ds = indexDataset([
      { date: '2025-12-22', verdicts: [{ code: '2.01', status: 'needs_review', confidence: 0.5, roles: ['indice'] }] },
      { date: '2025-12-23', verdicts: [{ code: '2.01', status: 'established', confidence: 0.7, roles: ['preuve'] }] },
    ])
    expect(computeState(ds, { ref }).competencies.get('2.01').status).toBe('established')
  })

  it('une compétence hors référentiel n’a pas de secteur et est listée à part', () => {
    const ds = indexDataset([{ date: '2025-12-22', verdicts: [{ code: '8.01', confidence: 0.9, roles: ['preuve'] }, { code: '1.01', confidence: 0.9, roles: ['preuve'] }] }])
    const s = computeState(ds, { ref })
    expect(s.outOfReferential).toEqual(['8.01'])
    expect(s.competencies.get('1.01').theta).toBeCloseTo(360)
  })

  it('une journée à arbitrer ou « à examiner » ne contribue pas', () => {
    const ds = indexDataset([{ date: '2025-12-22', verdicts: [{ code: '1.01' }] }])
    ds.days[0].variantChoice = 'pending'
    expect(computeState(ds, { ref }).dates).toEqual([])
    const ds2 = chooseVariant(indexDataset([{ date: '2025-12-22', verdicts: [{ code: '1.01' }] }]), '2025-12-22', null)
    expect(ds2.days[0].variantChoice).toBe('examine')
    expect(computeState(ds2, { ref }).dates).toEqual([])
  })
})

describe('journée seule et explication', () => {
  const ds = indexDataset([
    { date: '2025-12-22', verdicts: [{ code: '1.01', confidence: 0.8, roles: ['preuve'] }] },
    { date: '2025-12-23', verdicts: [{ code: '2.01', confidence: 0.5, roles: ['indice'] }] },
  ])

  it('la modale du jour calcule les angles de ce seul jour', () => {
    const s = computeDayState(ds, '2025-12-23', { ref })
    expect([...s.competencies.keys()]).toEqual(['2.01'])
    expect(s.competencies.get('2.01').theta).toBeCloseTo(360)
  })

  it('« Pourquoi cette surface ? » liste traces, journées, confiance et formules', () => {
    const s = computeState(ds, { ref })
    const e = explainSurface(s, { type: 'competency', code: '1.01' })
    expect(e.traces).toHaveLength(1)
    expect(e.traces[0]).toMatchObject({ date: '2025-12-22', role: 'preuve', weight: 0.8 })
    expect(e.days).toEqual(['2025-12-22'])
    expect(e.formulas.intensity).toMatch(/1 − Π/)
    const p = explainSurface(s, { type: 'pole', num: 2 })
    expect(p.members).toEqual([{ code: '2.01', theta: expect.any(Number), confidence: 0.5, days: 1 }])
  })
})
