// Couleurs des visualisations dans les deux thèmes (journal D-60) : marches
// sombres sélectionnées pour le référentiel RESPIRE v7, rampe de la heatmap
// ancrée sur la surface du thème, encres lisibles.
import { describe, expect, it } from 'vitest'
import { DARK_BAND, HEAT_STEPS, VIZ_SURFACE, contrast, heatColor, hexToOklch, inkOn, luminance, oklchToHex, poleFill, themeColor, themed, themedSwatch } from './colors.js'

const RESPIRE = ['#2563eb', '#10b981', '#ec4899', '#8b5cf6', '#f59e0b', '#06b6d4', '#f97316']

describe('marches sombres des couleurs du référentiel', () => {
  it('en clair, la couleur du référentiel telle quelle', () => {
    for (const c of RESPIRE) expect(themeColor(c)).toBe(c)
  })
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
  it('CŒUR et MAIN, voisins confondus par les daltoniens en clair, sont séparés par la luminance en sombre', () => {
    const [coeur, main] = [themeColor('#10b981', 'dark'), themeColor('#ec4899', 'dark')]
    expect(hexToOklch(main).L - hexToOklch(coeur).L).toBeGreaterThan(0.1)
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
      expect(luminance(poleFill(c))).toBeGreaterThan(luminance(c))
      expect(luminance(poleFill(c, 'dark'))).toBeLessThan(luminance(themeColor(c, 'dark')))
      // Le nom du pôle reste lisible sur sa teinte, dans les deux thèmes.
      for (const fill of [poleFill(c), poleFill(c, 'dark')]) expect(contrast(inkOn(fill), fill)).toBeGreaterThanOrEqual(3)
    }
  })
  it('les deux valeurs voyagent en propriétés CSS', () => {
    expect(themed('#fff', '#000')).toEqual({ '--c': '#fff', '--c-dark': '#000' })
    expect(themedSwatch('#ffffff', '#141d31')).toEqual({ '--c': '#ffffff', '--c-dark': '#141d31', '--c-ink': '#1e293b', '--c-ink-dark': '#ffffff' })
  })
})
