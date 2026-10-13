// P3 — comparaison de soi à soi (spec §9). Critère d'acceptation : A et B de
// tailles différentes avertissent ; aucun rang ni verdict.
import { describe as group, expect, it } from 'vitest'
import { analysisRuns, changeNarrative, compareSets, comparePreset, describe, radarScale, resolveSide, topDays } from './compare.js'
import { normalizeReferential } from './referential.js'
import { indexDataset, miniReferential } from '../test/fixtures.js'

const ref = normalizeReferential(miniReferential())
const nameOf = (code) => ref.compByCode.get(code)?.name ?? code
const FORBIDDEN = /progr|amélior|régress|meilleur|pire|mieux|recul|déclin|faible|fort(e|s)?\b|rang|classement|\bbon\b|mauvais/i

function ds() {
  return indexDataset([
    { date: '2025-09-01', verdicts: [{ code: '1.01', confidence: 0.8, roles: ['preuve'] }] },
    { date: '2025-09-02', verdicts: [{ code: '1.01', confidence: 0.8, roles: ['preuve'] }, { code: '2.01', confidence: 0.6, roles: ['indice'] }] },
    { date: '2025-10-01', verdicts: [{ code: '2.01', confidence: 0.9, roles: ['preuve'] }, { code: '3.01', confidence: 0.7, roles: ['preuve'] }] },
    { date: '2025-10-02', verdicts: [{ code: '3.01', confidence: 0.5, roles: ['indice'] }] },
    { date: '2025-10-03', verdicts: [{ code: '3.01', confidence: 0.6, roles: ['preuve', 'indice'] }] },
  ])
}
const SEPT = { name: 'Septembre', def: { kind: 'period', from: '2025-09-01', to: '2025-09-30' } }
const OCT = { name: 'Octobre', def: { kind: 'period', from: '2025-10-01', to: '2025-10-31' } }

group('compareSets', () => {
  it('communes / seulement A / seulement B ; parts à somme 1 dans chaque ensemble', () => {
    const cmp = compareSets(ds(), ref, SEPT, OCT)
    expect(cmp.common).toEqual(['2.01'])
    expect(cmp.onlyA).toEqual(['1.01'])
    expect(cmp.onlyB).toEqual(['3.01'])
    const sum = (side) => cmp.rows.reduce((s, r) => s + (r[side]?.share ?? 0), 0)
    expect(sum('a')).toBeCloseTo(1)
    expect(sum('b')).toBeCloseTo(1)
  })

  it('A et B de tailles différentes : avertissement (critère P3)', () => {
    const cmp = compareSets(ds(), ref, SEPT, OCT)
    expect(cmp.warnings.map((w) => w.code)).toContain('sizes')
    expect(cmp.warnings.find((w) => w.code === 'sizes').text).toMatch(/2 journées analysées dans A, 3 dans B/)
    const same = compareSets(ds(), ref, SEPT, { name: 'B', def: { kind: 'dates', dates: ['2025-10-01', '2025-10-02'] } })
    expect(same.warnings.map((w) => w.code)).not.toContain('sizes')
  })

  it('recouvrement signalé', () => {
    const cmp = compareSets(ds(), ref, SEPT, { name: 'Tout', def: { kind: 'period', from: null, to: null } })
    expect(cmp.overlap.count).toBe(2)
    expect(cmp.warnings.map((w) => w.code)).toContain('overlap')
  })

  it('tableau : intensité absolue, confiance, journées, moyenne / min / max / σ sur les journées observées, Δ = B − A', () => {
    const cmp = compareSets(ds(), ref, SEPT, OCT)
    const r = cmp.rows.find((x) => x.code === '2.01')
    expect(r.a).toMatchObject({ days: 1, n: 1, confidence: 0.6 })
    expect(r.b).toMatchObject({ days: 1, n: 1, confidence: 0.9 })
    expect(r.a.intensity).toBeCloseTo(0.3) // indice : 0,5 × 0,6
    expect(r.b.intensity).toBeCloseTo(0.9)
    expect(r.delta.intensity).toBeCloseTo(0.6)
    expect(r.delta.confidence).toBeCloseTo(0.3)
    const s301 = cmp.rows.find((x) => x.code === '3.01').b
    expect(s301.n).toBe(3)
    expect(s301.min).toBeCloseTo(0.25)
    expect(s301.max).toBeCloseTo(1 - (1 - 0.6) * (1 - 0.3))
    expect(s301.sd).toBeGreaterThan(0)
    // Seulement dans A : Δ absolu, jamais de Δ relatif sans base.
    const only = cmp.rows.find((x) => x.code === '3.01')
    expect(only.a).toBeNull()
    expect(only.delta.shareRel).toBeNull()
  })

  it('pôles, concentration (5 plus grandes parts), radar à échelle commune arrondie', () => {
    const cmp = compareSets(ds(), ref, SEPT, OCT)
    expect(cmp.poleRows.map((p) => p.num)).toEqual([1, 2, 3])
    expect(cmp.concentration.a).toBeCloseTo(1)
    expect(cmp.radar.max).toBeGreaterThanOrEqual(Math.max(...cmp.radar.poles.flatMap((p) => [p.a, p.b])))
    expect(radarScale([0.62, 0.3])).toBe(0.65)
    expect(radarScale([0.034, 0.021])).toBe(0.04)
    expect(radarScale([])).toBe(0.01)
  })

  it('statistiques : moyenne, min, max, écart-type ; vide = null', () => {
    expect(describe([0.2, 0.4])).toMatchObject({ n: 2, mean: 0.30000000000000004, min: 0.2, max: 0.4 })
    expect(describe([0.2, 0.4]).sd).toBeCloseTo(0.1)
    expect(describe([])).toEqual({ n: 0, mean: null, min: null, max: null, sd: null })
  })

  it('top 5 des journées d’un pôle (sans rang affiché, ordre des intensités du jour)', () => {
    const cmp = compareSets(ds(), ref, SEPT, OCT)
    const top = topDays(cmp.b, ref, 3)
    expect(top.map((t) => t.date)).toEqual(['2025-10-03', '2025-10-01', '2025-10-02'])
  })
})

group('deux analyses du même portfolio', () => {
  it('chaque côté lit SA variante pour la même journée', () => {
    const d = ds()
    const day = d.days.find((x) => x.date === '2025-10-01')
    day.variants.push({
      id: 'v-other',
      provenance: { source: 'aurora-core', run: 'R2' },
      verdicts: [{ code: '1.02', status: 'established', confidence: 0.7, proofs: 1, hints: 0, traces: [{ id: 'v-other:1.02:0', role: 'preuve' }] }],
      anomalies: [],
    })
    expect(analysisRuns(d).map((r) => r.key)).toEqual(['aurora-core|R2', 'test|'])
    const A = { name: 'Analyse 1', def: { kind: 'run', source: 'test', run: null } }
    const B = { name: 'Analyse 2', def: { kind: 'run', source: 'aurora-core', run: 'R2' } }
    expect(resolveSide(d, B).dates).toEqual(['2025-10-01'])
    const cmp = compareSets(d, ref, A, B)
    expect(cmp.onlyB).toEqual(['1.02'])
    expect(cmp.b.state.dates).toEqual(['2025-10-01'])
  })
})

group('préréglages', () => {
  it('depuis la dernière évaluation : état cumulé à la journée précédente vs état cumulé à la référence', () => {
    const p = comparePreset(ds(), 'last-evaluation')
    expect(p.a.def).toMatchObject({ kind: 'period', to: '2025-10-02', onlyActive: true })
    expect(p.b.def).toMatchObject({ kind: 'period', to: '2025-10-03', onlyActive: true })
  })
  it('début du trimestre et de l’année scolaire ; année scolaire précédente indisponible sans données', () => {
    expect(comparePreset(ds(), 'quarter-start').a.def.to).toBe('2025-09-30')
    expect(comparePreset(ds(), 'school-year-start')).toMatchObject({ unavailable: expect.stringMatching(/indisponible/) })
    expect(comparePreset(ds(), 'previous-school-year')).toMatchObject({ unavailable: expect.stringMatching(/2024–2025/) })
  })
  it('les journées décochées ne comptent pas', () => {
    const d = ds()
    d.days.find((x) => x.date === '2025-10-03').active = false
    expect(comparePreset(d, 'last-evaluation').b.def.to).toBe('2025-10-02')
  })
})

group('récit « ce qui a changé »', () => {
  it('phrases factuelles et datées, sans valence (critère P3 : aucun verdict)', () => {
    const d = ds()
    const p = comparePreset(d, 'quarter-start')
    const cmp = compareSets(d, ref, p.a, p.b)
    const text = changeNarrative(cmp, { nameOf }).map((s) => s.text)
    expect(text[0]).toMatch(/^A, « Jusqu’au/)
    expect(text).toContain('B reprend les journées de A et en ajoute 3, depuis le 1er octobre 2025.')
    expect(text).toContain('Depuis le 1er octobre 2025, « Fabrication » (3.01) apparaît dans 3 journées.')
    expect(text).toContain('Depuis le 1er octobre 2025, « Écoute » (2.01) apparaît dans 1 journée de plus.')
    for (const t of text) expect(t).not.toMatch(FORBIDDEN)
    const grouped = changeNarrative(cmp, { nameOf, group: 0 }).map((s) => s.text)
    expect(grouped).toContain('Depuis le 1er octobre 2025, 1 compétence apparaît : « Fabrication » (3.01, 3 j.).')
    const disjoint = changeNarrative(compareSets(d, ref, SEPT, OCT), { nameOf }).map((s) => s.text)
    expect(disjoint).toContain('« Pensée critique » (1.01) apparaît dans 2 journées de A et dans aucune de B.')
    for (const t of disjoint) expect(t).not.toMatch(FORBIDDEN)
  })
})
