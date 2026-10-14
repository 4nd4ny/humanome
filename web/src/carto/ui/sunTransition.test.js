// Passage animé d'un pôle qui s'ouvre sur 360°, puis se referme (journal D-45).
import { describe, expect, it } from 'vitest'
import { easeInOutCubic, interpolateSunLayout, poleLabelAngle } from './sunTransition.js'
import { computeState, layoutPole, layoutSun } from '../core/state.js'
import { normalizeReferential } from '../core/referential.js'
import { ringGeometry } from '../core/formulas.js'
import { indexDataset, miniReferential } from '../test/fixtures.js'

const ref = normalizeReferential(miniReferential())
const geometry = ringGeometry({ outerRadius: 190, centerRadius: 30, gap: 5 })
const ds = indexDataset([
  { date: '2025-12-22', verdicts: [{ code: '1.01', roles: ['preuve', 'preuve'] }, { code: '2.01', roles: ['preuve'] }] },
  { date: '2025-12-23', verdicts: [{ code: '3.01', roles: ['preuve'] }, { code: '3.02', confidence: 0.4, roles: ['preuve', 'indice'] }] },
])
const state = computeState(ds, { ref })
const full = layoutSun(state, ref, geometry)
const opened = layoutPole(state, ref, geometry, 3)
const byCode = (l) => new Map(l.competencies.map((c) => [c.code, c]))

describe('ouvrir un pôle : du soleil principal au pôle sur 360°', () => {
  it('au départ, chaque secteur est là où il était ; les autres pôles sont pleinement visibles', () => {
    const f = interpolateSunLayout(full, opened, 0)
    const a = byCode(f)
    for (const c of full.competencies) {
      expect(a.get(c.code).a0).toBeCloseTo(c.a0)
      expect(a.get(c.code).a1).toBeCloseTo(c.a1)
    }
    expect(a.get('1.01')).toMatchObject({ opacity: 1, transient: true })
    expect(a.get('3.01')).toMatchObject({ opacity: 1, transient: false })
  })

  it('à l’arrivée, les compétences du pôle occupent leur place sur 360° (au tour près) ; les autres ont disparu', () => {
    const f = interpolateSunLayout(full, opened, 1)
    const a = byCode(f)
    for (const c of opened.competencies) {
      const turns = (a.get(c.code).a0 - c.a0) / (2 * Math.PI)
      expect(turns).toBeCloseTo(Math.round(turns))
      expect(a.get(c.code).a1 - a.get(c.code).a0).toBeCloseTo(c.a1 - c.a0)
    }
    expect(a.get('1.01').opacity).toBe(0)
    expect(a.get('2.01').opacity).toBe(0)
    // L'anneau du pôle s'est ouvert en entier.
    const ring = f.poles.find((p) => p.num === 3 && !p.transient)
    expect(ring.a1 - ring.a0).toBeCloseTo(2 * Math.PI)
  })

  it('à mi-chemin, l’arc s’élargit : plus large qu’au départ, moins qu’un tour ; ceux qui partent s’effacent', () => {
    const before = full.poles.find((p) => p.num === 3)
    const f = interpolateSunLayout(full, opened, 0.5)
    const ring = f.poles.find((p) => p.num === 3)
    expect(ring.a1 - ring.a0).toBeGreaterThan(before.a1 - before.a0)
    expect(ring.a1 - ring.a0).toBeLessThan(2 * Math.PI)
    expect(byCode(f).get('1.01').opacity).toBeCloseTo(0.5)
    // Les secteurs qui partent sont dessinés dessous (en premier).
    expect(f.competencies.slice(0, 2).map((c) => c.code)).toEqual(['1.01', '2.01'])
  })

  it('le nom du pôle glisse du milieu de son arc vers le haut de l’anneau, toujours sur l’arc, sans saut à la fin', () => {
    const from = full.poles.find((p) => p.num === 3)
    const at = (e) => interpolateSunLayout(full, opened, e).poles.find((p) => p.num === 3 && !p.transient)
    expect(at(0).labelAngle).toBeCloseTo((from.a0 + from.a1) / 2)
    for (const e of [0.1, 0.3, 0.5, 0.7, 0.9]) {
      const s = at(e)
      expect(s.labelAngle).toBeGreaterThanOrEqual(s.a0 - 1e-9)
      expect(s.labelAngle).toBeLessThanOrEqual(s.a1 + 1e-9)
    }
    // À l'arrivée : le haut (−90°, au tour près), là où l'anneau ouvert écrit son nom.
    const end = at(1).labelAngle
    expect(Math.cos(end)).toBeCloseTo(Math.cos(poleLabelAngle(opened.poles[0])))
    expect(Math.sin(end)).toBeCloseTo(-1)
  })

  it('le pôle tourne le moins possible : son milieu se déplace de moins d’un demi-tour', () => {
    for (const num of [1, 2, 3]) {
      const from = full.poles.find((p) => p.num === num)
      const to = interpolateSunLayout(full, layoutPole(state, ref, geometry, num), 1).poles.find((p) => p.num === num && !p.transient)
      expect(Math.abs((from.a0 + from.a1) / 2 - (to.a0 + to.a1) / 2)).toBeLessThanOrEqual(Math.PI + 1e-9)
    }
  })
})

describe('refermer le pôle : retour au soleil principal', () => {
  it('les autres pôles reviennent en se montrant ; à l’arrivée, tout est à sa place', () => {
    const f0 = interpolateSunLayout(opened, full, 0)
    expect(byCode(f0).get('1.01')).toMatchObject({ opacity: 0, transient: true })
    // Ils sont dessinés sous l'arc qui se referme : il les découvre en se resserrant.
    expect(f0.competencies.map((c) => c.code)).toEqual(['1.01', '2.01', '3.01', '3.02'])
    expect(f0.poles.map((p) => [p.num, p.transient])).toEqual([
      [1, true],
      [2, true],
      [3, false],
    ])
    const f1 = interpolateSunLayout(opened, full, 1)
    for (const c of full.competencies) {
      const got = byCode(f1).get(c.code)
      const turns = (got.a0 - c.a0) / (2 * Math.PI)
      expect(turns).toBeCloseTo(Math.round(turns))
      expect(got.a1 - got.a0).toBeCloseTo(c.a1 - c.a0)
      expect(got.opacity).toBe(1)
    }
  })
})

describe('passage inversé en cours de route', () => {
  it('repart de ce qui est affiché : un secteur à demi effacé revient depuis son opacité, sans éclat', () => {
    const mid = interpolateSunLayout(full, opened, 0.6) // 1.01 s'efface : opacité 0,4
    expect(byCode(mid).get('1.01').opacity).toBeCloseTo(0.4)
    const back = (e) => byCode(interpolateSunLayout(mid, full, e)).get('1.01')
    expect(back(0).opacity).toBeCloseTo(0.4)
    expect(back(0.5).opacity).toBeCloseTo(0.7)
    expect(back(1).opacity).toBeCloseTo(1)
    // Et l'inverse : rouvert pendant qu'il se refermait, un secteur qui partait repart de son opacité.
    const closing = interpolateSunLayout(opened, full, 0.3) // 1.01 revient : opacité 0,3
    const reopen = interpolateSunLayout(closing, opened, 0)
    expect(byCode(reopen).get('1.01').opacity).toBeCloseTo(0.3)
    expect(byCode(interpolateSunLayout(closing, opened, 0.5)).get('1.01').opacity).toBeCloseTo(0.15)
  })
})

describe('adoucissement', () => {
  it('part de 0, arrive à 1, symétrique, borné', () => {
    expect(easeInOutCubic(0)).toBe(0)
    expect(easeInOutCubic(1)).toBe(1)
    expect(easeInOutCubic(0.5)).toBeCloseTo(0.5)
    expect(easeInOutCubic(0.25) + easeInOutCubic(0.75)).toBeCloseTo(1)
    expect(easeInOutCubic(-1)).toBe(0)
    expect(easeInOutCubic(2)).toBe(1)
  })
})
