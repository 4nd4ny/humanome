// Formules du soleil (spec §5.2 à §5.6) — cas chiffrés.
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PARAMS,
  POLE_RING_MAX,
  annularSectorArea,
  anglesFromPoints,
  decayFactor,
  displayedOuterRadius,
  encodedArea,
  meanConfidence,
  outerRadiusFor,
  poleConfidence,
  resolveParams,
  ringGeometry,
  ringShown,
  sunGeometry,
  tracePoints,
  widenNarrowSectors,
  toRadians,
  traceWeight,
} from './formulas.js'

describe('points d’une trace (décision du 2026-10-14) : la confiance du jury n’y entre pas', () => {
  it('preuve : 1 point', () => {
    expect(traceWeight('preuve')).toBe(1)
  })
  it('indice : α = 0,5 par défaut', () => {
    expect(DEFAULT_PARAMS.alpha).toBe(0.5)
    expect(traceWeight('indice')).toBe(0.5)
  })
  it('α est réglable', () => {
    expect(traceWeight('indice', resolveParams({ alpha: 0.25 }))).toBe(0.25)
  })
  it('aucune borne : une preuve vaut un point entier', () => {
    expect(DEFAULT_PARAMS).not.toHaveProperty('maxWeight')
    expect(traceWeight('preuve', DEFAULT_PARAMS, 0)).toBe(1)
  })
  it('rejette un α hors de [0 ; 1[', () => {
    expect(() => resolveParams({ alpha: 1 })).toThrow(/α/)
    expect(() => resolveParams({ alpha: -0.1 })).toThrow(/α/)
  })
  it('la décote temporelle existe mais est désactivée par défaut (§1.6)', () => {
    expect(DEFAULT_PARAMS.temporalDecay).toBe(0)
    expect(decayFactor(3650)).toBe(1)
    expect(decayFactor(365.25, { ...DEFAULT_PARAMS, temporalDecay: 0.05 })).toBeCloseTo(0.95)
  })
})

describe('intensité = points (décision du 2026-10-14, D-8) : P = Σ w', () => {
  it('aucune trace : 0 point', () => {
    expect(tracePoints([])).toBe(0)
  })
  it('deux traces de 0,5 : 1 point', () => {
    expect(tracePoints([0.5, 0.5])).toBeCloseTo(1)
  })
  it('plus il y a de traces, plus il y a de points : chaque trace compte autant que la précédente', () => {
    const g1 = tracePoints([0.4]) - tracePoints([])
    const g2 = tracePoints([0.4, 0.4]) - tracePoints([0.4])
    const g3 = tracePoints([0.4, 0.4, 0.4]) - tracePoints([0.4, 0.4])
    expect(g1).toBeCloseTo(0.4)
    expect(g2).toBeCloseTo(g1)
    expect(g3).toBeCloseTo(g1)
  })
  it('rien ne plafonne : cent preuves valent cent points (le cumul saturant les ramenait à 1)', () => {
    expect(tracePoints(Array(100).fill(traceWeight('preuve')))).toBe(100)
  })
  it('une preuve vaut deux indices (α = 0,5)', () => {
    expect(tracePoints([traceWeight('preuve')])).toBe(tracePoints([traceWeight('indice'), traceWeight('indice')]))
  })
})

describe('largeur minimale d’affichage', () => {
  it('élargit le seul secteur trop étroit, prend la différence aux autres au prorata, somme inchangée', () => {
    const { angles, widened } = widenNarrowSectors([0.001, 2, 4], 0.1)
    expect(widened).toEqual([true, false, false])
    expect(angles[0]).toBeCloseTo(0.1)
    expect(angles[1] / angles[2]).toBeCloseTo(0.5)
    expect(angles.reduce((s, a) => s + a, 0)).toBeCloseTo(6.001)
  })
  it('un secteur que l’élargissement des autres rend trop étroit est élargi à son tour', () => {
    const { angles, widened } = widenNarrowSectors([0.01, 0.01, 0.105, 1], 0.1)
    expect(widened).toEqual([true, true, true, false])
    expect(angles.slice(0, 3).every((a) => Math.abs(a - 0.1) < 1e-9)).toBe(true)
    expect(angles.reduce((s, a) => s + a, 0)).toBeCloseTo(1.125)
  })
  it('sans minimum, ou si tous ne peuvent pas l’avoir : les angles exacts', () => {
    expect(widenNarrowSectors([0.001, 1], 0).angles).toEqual([0.001, 1])
    expect(widenNarrowSectors([0.1, 0.1], 0.2).widened).toEqual([false, false])
  })
})

describe('angles (§5.4) : parts d’un tout', () => {
  it('une seule compétence occupe 360°', () => {
    expect(anglesFromPoints(new Map([['1.01', 0.3]])).get('1.01')).toBeCloseTo(360)
  })
  it('l’ajout d’une deuxième compétence d’autant de points la fait passer à 180°', () => {
    const a = anglesFromPoints(new Map([['1.01', 0.3], ['2.01', 0.3]]))
    expect(a.get('1.01')).toBeCloseTo(180)
    expect(a.get('2.01')).toBeCloseTo(180)
  })
  it('proportionnel aux points, somme = 360°', () => {
    const a = anglesFromPoints(new Map([['a', 0.5], ['b', 0.25], ['c', 0.25], ['d', 0]]))
    expect(a.get('a')).toBeCloseTo(180)
    expect(a.get('b')).toBeCloseTo(90)
    expect(a.has('d')).toBe(false)
    expect([...a.values()].reduce((s, x) => s + x, 0)).toBeCloseTo(360)
  })
  it('aucun point : aucun angle', () => {
    expect(anglesFromPoints(new Map([['a', 0]])).size).toBe(0)
  })
})

describe('confiance moyenne du jury (« cumulée » au §5.5)', () => {
  it('moyenne continue des confiances, valeurs absentes ignorées', () => {
    expect(meanConfidence([0.8, 0.6, null])).toBeCloseTo(0.7)
    expect(meanConfidence([])).toBeNull()
  })
  it('confiance d’un pôle pondérée par θ', () => {
    expect(poleConfidence([{ theta: 90, confidence: 1 }, { theta: 270, confidence: 0.2 }])).toBeCloseTo((90 + 54) / 360)
  })
})

describe('anneaux fixes et surface (§5.6)', () => {
  const g = ringGeometry({ outerRadius: 200, centerRadius: 24, gap: 4 })

  it('anneau des pôles : par défaut de l’épaisseur du centre ; les compétences prennent le reste après l’écart (D-58)', () => {
    expect(g.poles).toEqual({ rIn: 24, rOut: 48 })
    expect(g.competencies).toEqual({ rIn: 52, rOut: 200 })
    expect(g.k).toBeCloseTo(200 ** 2 - 52 ** 2, 6)
  })
  it('C = 1 atteint le bord de l’anneau des compétences, C = 0 reste au rayon intérieur', () => {
    expect(outerRadiusFor(g.competencies.rIn, g.k, 1)).toBeCloseTo(g.competencies.rOut)
    expect(outerRadiusFor(g.competencies.rIn, g.k, 0)).toBeCloseTo(g.competencies.rIn)
  })
  it('aire d’une compétence = θ·k·C/2', () => {
    for (const [deg, c] of [[360, 1], [180, 0.5], [37.5, 0.83], [1, 0.05]]) {
      const theta = toRadians(deg)
      const area = annularSectorArea(theta, g.competencies.rIn, outerRadiusFor(g.competencies.rIn, g.k, c))
      expect(area).toBeCloseTo(encodedArea(theta, g.k, c), 6)
    }
  })
  it('épaisseur réglable de l’anneau des pôles : 0 le masque (sans écart), le maximum masque les compétences', () => {
    const none = ringGeometry({ outerRadius: 190, centerRadius: 30, poleRing: 0, gap: 5 })
    expect(ringShown(none.poles)).toBe(false)
    expect(none.competencies).toEqual({ rIn: 30, rOut: 190 })
    const all = ringGeometry({ outerRadius: 190, centerRadius: 30, poleRing: 160, gap: 5 })
    expect(all.poles).toEqual({ rIn: 30, rOut: 190 })
    expect(ringShown(all.competencies)).toBe(false)
    expect(all.k).toBe(0)
    // L'écart avalerait les compétences : l'anneau des pôles va jusqu'au bord, sans bande vide.
    const almost = ringGeometry({ outerRadius: 190, centerRadius: 30, poleRing: 155, gap: 5 })
    expect(almost.poles.rOut).toBe(190)
    expect(ringShown(almost.competencies)).toBe(false)
    expect(ringGeometry({ outerRadius: 190, centerRadius: 30, poleRing: 150, gap: 5 }).competencies).toEqual({ rIn: 185, rOut: 190 })
    // Hors bornes : ramenée dans les bornes.
    expect(ringGeometry({ outerRadius: 190, centerRadius: 30, poleRing: 500 }).poles.rOut).toBe(190)
    expect(ringGeometry({ outerRadius: 190, centerRadius: 30, poleRing: -8 }).poles.rOut).toBe(30)
  })
  it('le soleil de l’interface : 190 de rayon, centre de 30, anneau des pôles de 30 → feuilles de 65 à 190', () => {
    const sun = sunGeometry(DEFAULT_PARAMS)
    expect([sun.center, sun.poles.rIn, sun.poles.rOut, sun.competencies.rIn, sun.competencies.rOut]).toEqual([30, 30, 60, 65, 190])
    expect(POLE_RING_MAX).toBe(160)
    expect(sunGeometry(resolveParams({ poleRingPx: 160 })).poles.rOut).toBe(190)
    // Un réglage d'affichage illisible revient au défaut au lieu de bloquer l'affichage.
    expect(resolveParams({ poleRingPx: Number.NaN }).poleRingPx).toBe(30)
    expect(resolveParams({ poleRingPx: 999 }).poleRingPx).toBe(160)
  })
  it('épaisseur minimale d’affichage : signalée, jamais silencieuse', () => {
    const tiny = displayedOuterRadius(g.competencies.rIn, g.k, 0.0005, 2)
    expect(tiny.floored).toBe(true)
    expect(tiny.rOut).toBeCloseTo(g.competencies.rIn + 2)
    const normal = displayedOuterRadius(g.competencies.rIn, g.k, 0.5, 2)
    expect(normal.floored).toBe(false)
    // Un secteur dessiné a des points : confiance nulle ou inconnue, il ne disparaît pas pour autant.
    expect(displayedOuterRadius(g.competencies.rIn, g.k, 0, 2)).toEqual({ rOut: g.competencies.rIn + 2, rOutExact: g.competencies.rIn, floored: true })
    expect(displayedOuterRadius(g.competencies.rIn, g.k, null, 2).floored).toBe(true)
    expect(displayedOuterRadius(g.competencies.rIn, g.k, 0, 0)).toEqual({ rOut: g.competencies.rIn, rOutExact: g.competencies.rIn, floored: false })
  })
  it('refuse une géométrie impossible', () => {
    expect(() => ringGeometry({ outerRadius: 10, centerRadius: 10 })).toThrow()
  })
})
