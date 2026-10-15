// Couleurs des visualisations dans les deux thèmes (journal D-60, D-63) :
// marches sélectionnées pour le référentiel RESPIRE v7, en sombre et en clair,
// rampe de la heatmap ancrée sur la surface du thème, encres lisibles.
import { describe, expect, it } from 'vitest'
import {
  DARK_BAND,
  DEFAULT_PALETTE,
  HEAT_STEPS,
  PALETTES,
  RESPIRE_COLORS,
  VIZ_SURFACE,
  contrast,
  heatColor,
  hexToOklch,
  inkOn,
  isPalette,
  labelInk,
  luminance,
  mix,
  oklchToHex,
  paletteOf,
  poleFill,
  poleText,
  poleTone,
  poleVars,
  themeColor,
  themed,
  themedSwatch,
} from './colors.js'

const RESPIRE = ['#2563eb', '#10b981', '#ec4899', '#8b5cf6', '#f59e0b', '#06b6d4', '#f97316']
const hueGap = (a, b) => Math.abs(Math.atan2(Math.sin(hexToOklch(a).H - hexToOklch(b).H), Math.cos(hexToOklch(a).H - hexToOklch(b).H)))

describe('marches claires des couleurs du référentiel (D-63)', () => {
  it('CŒUR, RACINES, CITÉ et FLAMBEAU plus sombres ; TÊTE, MAIN et ÂME telles quelles', () => {
    expect(RESPIRE.map((c) => themeColor(c))).toEqual(['#2563eb', '#047857', '#ec4899', '#8b5cf6', '#c88007', '#0891b2', '#c2410c'])
    expect(themeColor('#10B981')).toBe('#047857') // la casse du fichier n'y change rien
  })
  it('même teinte (à 10° près), jamais plus claire, au moins 3:1 sur le blanc', () => {
    for (const c of RESPIRE) {
      const l = themeColor(c)
      expect(hueGap(l, c)).toBeLessThan(0.18)
      expect(luminance(l)).toBeLessThanOrEqual(luminance(c))
      expect(contrast(l, VIZ_SURFACE.light)).toBeGreaterThanOrEqual(3)
    }
  })
  it('une couleur inconnue trop claire est assombrie, même teinte, jusqu’à 3:1 ; une couleur assez sombre reste telle quelle', () => {
    for (const c of ['#fde047', '#a3e635', '#ffffff']) expect(contrast(themeColor(c), VIZ_SURFACE.light)).toBeGreaterThanOrEqual(3)
    expect(hueGap(themeColor('#fde047'), '#fde047')).toBeLessThan(0.12)
    expect(themeColor('#1e3a8a')).toBe('#1e3a8a')
    expect(themeColor(undefined)).toBeUndefined()
  })
})

describe('marches sombres des couleurs du référentiel', () => {
  it('en sombre : même teinte, luminance dans la bande, au moins 3:1 sur la surface sombre', () => {
    for (const c of RESPIRE) {
      const d = themeColor(c, 'dark')
      const [o, od] = [hexToOklch(c), hexToOklch(d)]
      expect(od.L).toBeGreaterThanOrEqual(DARK_BAND.min - 0.01)
      expect(od.L).toBeLessThanOrEqual(DARK_BAND.max + 0.01)
      expect(Math.abs(Math.atan2(Math.sin(od.H - o.H), Math.cos(od.H - o.H)))).toBeLessThan(0.05)
      expect(contrast(d, VIZ_SURFACE.dark)).toBeGreaterThanOrEqual(3)
    }
  })
  it('CŒUR et MAIN, voisins confondus par les daltoniens avec les couleurs du référentiel, sont séparés par la luminance dans les deux thèmes', () => {
    expect(hexToOklch('#ec4899').L - hexToOklch('#10b981').L).toBeLessThan(0.05) // le référentiel : même luminance
    for (const theme of ['light', 'dark']) {
      const [coeur, main] = [themeColor('#10b981', theme), themeColor('#ec4899', theme)]
      expect(hexToOklch(main).L - hexToOklch(coeur).L).toBeGreaterThan(0.1)
    }
  })
  it('une couleur inconnue est ramenée dans la bande sombre, lisible sur la surface', () => {
    for (const c of ['#fde047', '#1e3a8a', '#000000', '#ffffff']) {
      const d = themeColor(c, 'dark')
      expect(hexToOklch(d).L).toBeGreaterThanOrEqual(DARK_BAND.min - 0.01)
      expect(hexToOklch(d).L).toBeLessThanOrEqual(DARK_BAND.max + 0.01)
    }
    expect(contrast(themeColor('#1e3a8a', 'dark'), VIZ_SURFACE.dark)).toBeGreaterThanOrEqual(3)
  })
  it('OKLCH aller-retour', () => {
    for (const c of RESPIRE) expect(oklchToHex(hexToOklch(c))).toBe(c)
  })
})

describe('heatmap et anneau des pôles dans les deux thèmes', () => {
  it('la rampe part de la surface du thème : plus foncée en clair, plus claire en sombre, à chaque niveau', () => {
    for (const tint of [null, '#2563eb', '#f59e0b']) {
      const light = [1, 2, 3, 4, 5].map((l) => luminance(heatColor(l, tint)))
      const dark = [1, 2, 3, 4, 5].map((l) => luminance(heatColor(l, tint, 'dark')))
      for (let i = 1; i < 5; i++) {
        expect(light[i]).toBeLessThan(light[i - 1])
        expect(dark[i]).toBeGreaterThan(dark[i - 1])
      }
    }
    expect(heatColor(5, '#f59e0b', 'dark')).toBe(themeColor('#f59e0b', 'dark'))
    expect(HEAT_STEPS).toHaveLength(5)
  })
  it('l’anneau des pôles se fond un peu dans la surface : plus clair que la couleur en clair, plus sombre en sombre', () => {
    for (const c of RESPIRE) {
      expect(luminance(poleFill(c))).toBeGreaterThan(luminance(themeColor(c)))
      expect(luminance(poleFill(c, 'dark'))).toBeLessThan(luminance(themeColor(c, 'dark')))
      // Le nom du pôle et le code d'une compétence se lisent comme du texte courant (4,5:1), dans les deux thèmes.
      for (const fill of [poleFill(c), poleFill(c, 'dark'), themeColor(c), themeColor(c, 'dark')]) expect(contrast(labelInk(fill), fill)).toBeGreaterThanOrEqual(4.5)
    }
  })
  it('RACINES et FLAMBEAU, non voisins, restent distincts pour les daltoniens : la luminance les sépare en clair', () => {
    expect(hexToOklch(themeColor('#f59e0b')).L - hexToOklch(themeColor('#f97316')).L).toBeGreaterThan(0.08)
  })
  it('la heatmap d’un seul pôle prend sa marche claire au niveau le plus fort', () => {
    expect(heatColor(5, '#10b981')).toBe('#047857')
  })
  it('les deux valeurs voyagent en propriétés CSS', () => {
    expect(themed('#fff', '#000')).toEqual({ '--c': '#fff', '--c-dark': '#000' })
    expect(themedSwatch('#ffffff', '#141d31')).toEqual({ '--c': '#ffffff', '--c-dark': '#141d31', '--c-ink': '#1e293b', '--c-ink-dark': '#ffffff' })
    // Un pôle : ses deux marches, en dessin SVG (carto-c-fill) ou sur un élément HTML (carto-pole).
    expect(poleTone('#10b981')).toEqual({ '--c': '#047857', '--c-dark': '#03835a' })
    expect(poleVars('#f59e0b')).toMatchObject({ '--pole-light': '#c88007', '--pole-dark': '#c88007' })
    // …et son encre de texte (D-64).
    expect(poleVars('#f59e0b')['--pole-text-light']).toBe(poleText('#f59e0b'))
    expect(poleVars('#f59e0b')['--pole-text-dark']).toBe(poleText('#f59e0b', 'dark'))
    expect(poleTone(undefined)).toBeUndefined()
    expect(poleVars(null)).toBeUndefined()
  })
})

// ---- Palettes (journal D-64) --------------------------------------------------------------

// Simulation des daltonismes de Machado, Oliveira et Fernandes (2009), sévérité 1,
// et écart OKLab × 100 : la mesure du script validate_palette de la skill dataviz.
const MACHADO = {
  protan: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deutan: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
}
const linear = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
const oklab = ([r, g, b]) => {
  const [l, m, s] = [0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b, 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b, 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b].map(Math.cbrt)
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.782771766 * m - 0.808675766 * s]
}
const simulate = (hex, kind) => {
  const v = linear(hex)
  return MACHADO[kind].map((row) => Math.min(1, Math.max(0, row[0] * v[0] + row[1] * v[1] + row[2] * v[2])))
}
const deltaE = (a, b, kind = null) => {
  const [x, y] = [a, b].map((h) => oklab(kind ? simulate(h, kind) : linear(h)))
  return 100 * Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2])
}
/** Voisins dans le soleil : les pôles dans l'ordre, et FLAMBEAU contre TÊTE. */
const neighbours = (list) => list.map((c, i) => [c, list[(i + 1) % list.length]])

describe('palettes des pôles (D-64)', () => {
  it('cinq palettes, Contrastée par défaut : sept couleurs par thème, une par pôle du référentiel', () => {
    expect(PALETTES.map((p) => p.id)).toEqual(['contrastee', 'vive', 'pastel', 'terre', 'profonde'])
    expect(DEFAULT_PALETTE).toBe('contrastee')
    for (const p of PALETTES) {
      for (const theme of ['light', 'dark']) {
        expect(p[theme]).toHaveLength(RESPIRE_COLORS.length)
        for (const c of p[theme]) expect(c).toMatch(/^#[0-9a-f]{6}$/)
        expect(RESPIRE_COLORS.map((c) => themeColor(c, theme, p.id))).toEqual([...p[theme]])
      }
    }
    expect(isPalette('pastel')).toBe(true)
    expect(isPalette('arc-en-ciel')).toBe(false)
    expect(paletteOf('arc-en-ciel').id).toBe('contrastee')
    expect(themeColor('#10b981', 'light', 'arc-en-ciel')).toBe('#047857')
  })

  it('validées pour les daltoniens : voisins du soleil distincts (ΔE ≥ 8), et en vision normale (ΔE ≥ 15), dans les deux thèmes', () => {
    for (const p of PALETTES) {
      for (const theme of ['light', 'dark']) {
        for (const [a, b] of neighbours(p[theme])) {
          expect(Math.min(deltaE(a, b, 'protan'), deltaE(a, b, 'deutan')), `${p.id} ${theme} ${a}/${b}`).toBeGreaterThanOrEqual(8)
          expect(deltaE(a, b), `${p.id} ${theme} ${a}/${b}`).toBeGreaterThanOrEqual(15)
        }
      }
    }
  })

  it('Contrastée, Terre et Profonde atteignent 3:1 sur la surface dans les deux thèmes ; Vive et Pastel, plus claires, en sombre seulement', () => {
    for (const id of ['contrastee', 'terre', 'profonde', 'vive', 'pastel']) {
      const p = paletteOf(id)
      const themes = id === 'vive' || id === 'pastel' ? ['dark'] : ['light', 'dark']
      for (const theme of themes) for (const c of p[theme]) expect(contrast(c, VIZ_SURFACE[theme]), `${id} ${theme} ${c}`).toBeGreaterThanOrEqual(3)
    }
  })

  it('une couleur inconnue prend le ton de la palette, dans sa teinte ; un gris reste gris', () => {
    const pastel = paletteOf('pastel').light.map(hexToOklch)
    const meanL = pastel.reduce((sum, o) => sum + o.L, 0) / pastel.length
    const out = themeColor('#7c3aed', 'light', 'pastel')
    expect(Math.abs(hexToOklch(out).L - meanL)).toBeLessThan(0.02)
    expect(hueGap(out, '#7c3aed')).toBeLessThan(0.1)
    expect(hexToOklch(themeColor('#808080', 'dark', 'vive')).C).toBeLessThan(0.03)
  })

  it('une rampe de heatmap atteint 3:1 au niveau le plus fort, quelle que soit la palette (Pastel assombrie dans sa teinte)', () => {
    for (const p of PALETTES) {
      for (const theme of ['light', 'dark']) {
        for (const c of RESPIRE_COLORS) {
          const top = heatColor(5, c, theme, p.id)
          expect(contrast(top, VIZ_SURFACE[theme]), `${p.id} ${theme} ${c}`).toBeGreaterThanOrEqual(3)
          expect(hueGap(top, themeColor(c, theme, p.id))).toBeLessThan(0.12)
        }
      }
    }
    // Contrastée : la marche elle-même (rien ne change pour la palette par défaut).
    expect(heatColor(5, '#10b981', 'light', 'contrastee')).toBe('#047857')
  })

  it('le texte coloré par son pôle se lit (4,5:1) dans toutes les palettes ; Contrastée garde son mélange à 62 %', () => {
    for (const p of PALETTES) {
      for (const theme of ['light', 'dark']) {
        for (const c of RESPIRE_COLORS) expect(contrast(poleText(c, theme, p.id), VIZ_SURFACE[theme]), `${p.id} ${theme} ${c}`).toBeGreaterThanOrEqual(4.5)
      }
    }
    expect(poleText('#2563eb')).toBe(mix('#2563eb', '#1e293b', 0.38))
  })

  it('le dessin et les éléments HTML prennent la palette demandée', () => {
    expect(poleTone('#10b981', 'pastel')).toEqual({ '--c': '#8ee5bf', '--c-dark': '#8ee5bf' })
    expect(poleVars('#2563eb', 'profonde')).toMatchObject({ '--pole-light': '#0454bd', '--pole-dark': '#2b7ee6' })
    expect(poleFill('#2563eb', 'light', 'vive')).toBe(mix(VIZ_SURFACE.light, '#2084f7', 0.78))
  })
})
