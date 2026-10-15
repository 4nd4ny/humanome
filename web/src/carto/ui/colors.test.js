// Couleurs des visualisations dans les deux thèmes (journal D-60, D-63) :
// marches sélectionnées pour le référentiel RESPIRE v7, en sombre et en clair,
// rampe de la heatmap ancrée sur la surface du thème, encres lisibles.
import { describe, expect, it } from 'vitest'
import { DARK_BAND, HEAT_STEPS, VIZ_SURFACE, contrast, heatColor, hexToOklch, inkOn, labelInk, luminance, oklchToHex, poleFill, poleTone, poleVars, themeColor, themed, themedSwatch } from './colors.js'

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
    expect(poleVars('#f59e0b')).toEqual({ '--pole-light': '#c88007', '--pole-dark': '#c88007' })
    expect(poleTone(undefined)).toBeUndefined()
    expect(poleVars(null)).toBeUndefined()
  })
})
