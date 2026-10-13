// Formules du soleil (spec §5.2 à §5.6) — cas chiffrés.
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PARAMS,
  annularSectorArea,
  anglesFromIntensities,
  decayFactor,
  displayedOuterRadius,
  encodedArea,
  meanConfidence,
  outerRadiusFor,
  poleConfidence,
  resolveParams,
  ringGeometry,
  saturatingIntensity,
  toRadians,
  traceWeight,
} from './formulas.js'

describe('poids d’une trace (§5.2)', () => {
  it('preuve : base 1 × confiance du verdict', () => {
    expect(traceWeight('preuve', 0.8)).toBeCloseTo(0.8)
  })
  it('indice : base α = 0,5 par défaut', () => {
    expect(DEFAULT_PARAMS.alpha).toBe(0.5)
    expect(traceWeight('indice', 0.8)).toBeCloseTo(0.4)
  })
  it('α est réglable', () => {
    expect(traceWeight('indice', 0.8, resolveParams({ alpha: 0.25 }))).toBeCloseTo(0.2)
  })
  it('borné à 0,99 : une trace ne sature jamais seule le cumul', () => {
    expect(traceWeight('preuve', 1)).toBe(0.99)
  })
  it('confiance absente ou illisible : poids nul (jamais inventé)', () => {
    expect(traceWeight('preuve', null)).toBe(0)
    expect(traceWeight('preuve', undefined)).toBe(0)
    expect(traceWeight('preuve', Number.NaN)).toBe(0)
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

describe('intensité (§5.3) : cumul saturant 1 − Π(1 − w)', () => {
  it('aucune trace : 0', () => {
    expect(saturatingIntensity([])).toBe(0)
  })
  it('deux traces de 0,5 : 0,75', () => {
    expect(saturatingIntensity([0.5, 0.5])).toBeCloseTo(0.75)
  })
  it('une trace très claire pèse plus que dix traces vagues', () => {
    expect(saturatingIntensity([0.95])).toBeGreaterThan(saturatingIntensity(Array(10).fill(0.05)))
  })
  it('les traces suivantes comptent de moins en moins', () => {
    const g1 = saturatingIntensity([0.4]) - saturatingIntensity([])
    const g2 = saturatingIntensity([0.4, 0.4]) - saturatingIntensity([0.4])
    const g3 = saturatingIntensity([0.4, 0.4, 0.4]) - saturatingIntensity([0.4, 0.4])
    expect(g1).toBeGreaterThan(g2)
    expect(g2).toBeGreaterThan(g3)
  })
})

describe('angles (§5.4) : parts d’un tout', () => {
  it('une seule compétence occupe 360°', () => {
    expect(anglesFromIntensities(new Map([['1.01', 0.3]])).get('1.01')).toBeCloseTo(360)
  })
  it('l’ajout d’une deuxième compétence d’intensité égale la fait passer à 180°', () => {
    const a = anglesFromIntensities(new Map([['1.01', 0.3], ['2.01', 0.3]]))
    expect(a.get('1.01')).toBeCloseTo(180)
    expect(a.get('2.01')).toBeCloseTo(180)
  })
  it('proportionnel aux intensités, somme = 360°', () => {
    const a = anglesFromIntensities(new Map([['a', 0.5], ['b', 0.25], ['c', 0.25], ['d', 0]]))
    expect(a.get('a')).toBeCloseTo(180)
    expect(a.get('b')).toBeCloseTo(90)
    expect(a.has('d')).toBe(false)
    expect([...a.values()].reduce((s, x) => s + x, 0)).toBeCloseTo(360)
  })
  it('aucune intensité : aucun angle', () => {
    expect(anglesFromIntensities(new Map([['a', 0]])).size).toBe(0)
  })
})

describe('confiance cumulée (§5.5)', () => {
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

  it('les deux anneaux ont la même capacité k', () => {
    expect(g.poles.rOut ** 2 - g.poles.rIn ** 2).toBeCloseTo(g.k, 6)
    expect(g.competencies.rOut ** 2 - g.competencies.rIn ** 2).toBeCloseTo(g.k, 6)
    expect(g.competencies.rIn - g.poles.rOut).toBeCloseTo(4)
    expect(g.competencies.rOut).toBe(200)
  })
  it('C = 1 atteint le bord de l’anneau, C = 0 reste au rayon intérieur', () => {
    expect(outerRadiusFor(g.competencies.rIn, g.k, 1)).toBeCloseTo(g.competencies.rOut)
    expect(outerRadiusFor(g.poles.rIn, g.k, 1)).toBeCloseTo(g.poles.rOut)
    expect(outerRadiusFor(g.poles.rIn, g.k, 0)).toBeCloseTo(g.poles.rIn)
  })
  it('aire = θ·k·C/2 quel que soit l’anneau', () => {
    for (const [deg, c] of [[360, 1], [180, 0.5], [37.5, 0.83], [1, 0.05]]) {
      const theta = toRadians(deg)
      for (const ring of [g.poles, g.competencies]) {
        const area = annularSectorArea(theta, ring.rIn, outerRadiusFor(ring.rIn, g.k, c))
        expect(area).toBeCloseTo(encodedArea(theta, g.k, c), 6)
      }
    }
  })
  it('épaisseur minimale d’affichage : signalée, jamais silencieuse', () => {
    const tiny = displayedOuterRadius(g.competencies.rIn, g.k, 0.0005, 2)
    expect(tiny.floored).toBe(true)
    expect(tiny.rOut).toBeCloseTo(g.competencies.rIn + 2)
    const normal = displayedOuterRadius(g.competencies.rIn, g.k, 0.5, 2)
    expect(normal.floored).toBe(false)
    expect(displayedOuterRadius(g.competencies.rIn, g.k, 0, 2)).toEqual({ rOut: g.competencies.rIn, floored: false })
  })
  it('refuse une géométrie impossible', () => {
    expect(() => ringGeometry({ outerRadius: 10, centerRadius: 10 })).toThrow()
  })
})
