import { describe, it, expect } from 'vitest'

import {
  createSectorPath,
  getMaxDepth,
  crCos,
  crSin,
  NIVEAUX,
  GRAY_LEVELS,
  RENVOI_RADIUS_FACTOR,
} from './geometry.js'

describe('createSectorPath', () => {
  it('quarter sector at origin (0 -> 90 degrees, small-arc flags)', () => {
    expect(createSectorPath(0, 0, 1, 2, 0, 90)).toBe(
      'M 1 0 L 2 0 A 2 2 0 0 1 1.2246467991473532e-16 2 L 6.123233995736766e-17 1 A 1 1 0 0 0 1 0 Z',
    )
  })

  it('half circle with the original merge radii (-90 -> 90, boundary: largeArc stays 0)', () => {
    // endAngle - startAngle === 180 -> the strict comparison `> 180` keeps largeArc at 0
    expect(createSectorPath(200, 200, 32, 112, -90, 90)).toBe(
      'M 200 168 L 200 88 A 112 112 0 0 1 200 312 L 200 232 A 32 32 0 0 0 200 168 Z',
    )
  })

  it('span greater than 180 degrees sets the large-arc flags to 1', () => {
    expect(createSectorPath(0, 0, 10, 20, -90, 130)).toBe(
      'M 6.123233995736766e-16 -10 L 1.2246467991473533e-15 -20 A 20 20 0 1 1 -12.855752193730787 15.32088886237956 L -6.427876096865393 7.66044443118978 A 10 10 0 1 0 6.123233995736766e-16 -10 Z',
    )
  })

  it('zero-width sector (start === end) is degenerate but well-formed', () => {
    const d = createSectorPath(0, 0, 1, 2, 45, 45)
    expect(d.startsWith('M ')).toBe(true)
    expect(d.endsWith(' Z')).toBe(true)
    // start and end points coincide
    const [x1, y1] = d.slice(2).split(' ')
    expect(d.endsWith(` ${x1} ${y1} Z`)).toBe(true)
  })
})

describe('crCos / crSin (correctly-rounded, engine-independent trig)', () => {
  it('returns the correctly-rounded values where V8 is 1 ulp off (end angle of 2.09)', () => {
    // Math.cos(t) in V8 gives ...7014 and Math.sin(t) ...9627: both 1 ulp above
    // the correctly-rounded values captured in the original render.
    const t = 0.8408380337549153
    expect(crCos(t)).toBe(0.6668385554647013)
    expect(crSin(t)).toBe(0.7452022148019626)
  })

  it('exact identities', () => {
    expect(crCos(0)).toBe(1)
    expect(crSin(0)).toBe(0)
    const t = -90 * (Math.PI / 180)
    expect(crSin(t)).toBe(-1)
    expect(crCos(t)).toBe(6.123233995736766e-17)
  })
})

describe('config constants (l.743-753 of the original)', () => {
  it('radius factors and gray levels are the original ones', () => {
    expect(NIVEAUX[1].radiusFactor).toBe(0.2)
    expect(NIVEAUX[5].radiusFactor).toBe(1.0)
    expect(NIVEAUX[3].nom).toBe('Maîtrise')
    expect(RENVOI_RADIUS_FACTOR).toBe(0.35)
    expect(GRAY_LEVELS[1]).toBe('#000000')
    expect(GRAY_LEVELS[5]).toBe('#cbd5e1')
  })
})

describe('getMaxDepth', () => {
  it('counts the deepest chain of children', () => {
    const leaf = { children: [] }
    const mid = { children: [leaf] }
    const root = { children: [mid, { children: [] }] }
    expect(getMaxDepth(root)).toBe(2)
    expect(getMaxDepth(leaf)).toBe(0)
    expect(getMaxDepth({})).toBe(0)
  })
})
