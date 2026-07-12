// Strict parity test: buildMergeTree + layoutSunburst({ size: 400 }) on the real
// merge.json must reproduce the 331 <path> elements of the ORIGINAL prototype
// render (assets-existants/merge-prototype/cartographie.html, 400x400 viewport),
// captured in reference/original-render-400x400.json — same DOM order, `d` and
// `fill` strictly identical as strings, other attributes identical when present.
import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'

import { buildMergeTree, layoutSunburst } from './index.js'

const read = (relative) => JSON.parse(readFileSync(new URL(relative, import.meta.url), 'utf8'))

const mergeDoc = read('../../../public/data/demo/merge.json')
const reference = read('./reference/original-render-400x400.json')

// Attributes captured by the reference dump beyond d/fill/class. `opacity` is
// never set by the original (it uses fill-opacity), so it must stay absent.
const OPTIONAL_ATTRS = ['opacity', 'stroke', 'strokeDasharray', 'fillOpacity']

describe('parité stricte avec le rendu original (merge.json réel, 400x400)', () => {
  const layout = layoutSunburst(buildMergeTree(mergeDoc), { size: 400 })

  it('reference dump is the expected 400x400 capture', () => {
    expect(reference.svg.width).toBe('400')
    expect(reference.svg.height).toBe('400')
    expect(reference.paths).toHaveLength(331)
  })

  it('emits exactly the 331 paths of the original, in DOM order', () => {
    expect(layout.sectors).toHaveLength(reference.paths.length)
  })

  it('geometry frame matches the original (center, radii)', () => {
    expect(layout.size).toBe(400)
    expect(layout.cx).toBe(200)
    expect(layout.cy).toBe(200)
    expect(layout.innerRadius).toBe(400 * 0.08)
    expect(layout.maxRadius).toBe(400 * 0.48)
  })

  it('every path matches the original: d and fill strictly, other attributes when present', () => {
    const mismatches = []
    reference.paths.forEach((ref, i) => {
      const sector = layout.sectors[i]
      const diff = {}
      if (sector.d !== ref.d) diff.d = { expected: ref.d, actual: sector.d }
      if (sector.fill !== ref.fill) diff.fill = { expected: ref.fill, actual: sector.fill }
      if (sector.class !== ref.class) diff.class = { expected: ref.class, actual: sector.class }
      for (const attr of OPTIONAL_ATTRS) {
        const expected = ref[attr] ?? null
        const actual = sector[attr] ?? null
        if (expected !== actual) diff[attr] = { expected, actual }
      }
      if (Object.keys(diff).length > 0) mismatches.push({ index: i, diff })
    })
    expect(mismatches).toEqual([])
  })

  it('stroke-width matches the original source (attribute not captured by the dump)', () => {
    // The reference dump does not record stroke-width, so it is asserted here
    // against the original source (cartographie.html): competence sectors get
    // stroke-width 0.5 (l.966), renvoi sectors 1 (l.929), pole sectors and
    // gray bands none (l.998 sets stroke only).
    for (const sector of layout.sectors) {
      const expected =
        sector.class === 'renvoi-sector'
          ? '1'
          : sector.class === 'sector' && sector.meta.kind === 'competence'
            ? '0.5'
            : undefined
      expect(sector.strokeWidth).toBe(expected)
    }
  })

  it('parity score is 331/331', () => {
    const matching = reference.paths.filter((ref, i) => {
      const sector = layout.sectors[i]
      return (
        sector &&
        sector.d === ref.d &&
        sector.fill === ref.fill &&
        sector.class === ref.class &&
        OPTIONAL_ATTRS.every((attr) => (sector[attr] ?? null) === (ref[attr] ?? null))
      )
    }).length
    expect(`${matching}/${reference.paths.length}`).toBe('331/331')
  })
})
