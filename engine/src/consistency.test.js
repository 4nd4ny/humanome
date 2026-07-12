// Tests de la consistance multi-run (plan-portage-moteur §Consistance).
import { describe, expect, it } from 'vitest'

import { compareRuns, statutDistance } from './consistency.js'

const ETABLIE = 'présence établie'
const NON_ETABLIE = 'présence non établie'
const RENVOI = 'renvoi au cartographe'

/** Document cartographie-jour minimal pour la comparaison (poles/competences/verdict). */
function doc(verdictsByCode) {
  return {
    poles: [
      {
        competences: Object.entries(verdictsByCode).map(([code, [statut, confiance]]) => ({
          code,
          verdict: { statut, confiance },
        })),
      },
    ],
  }
}

describe('statutDistance', () => {
  it('est nulle entre statuts identiques, 0.5 via le renvoi, 1 entre extrêmes', () => {
    expect(statutDistance(ETABLIE, ETABLIE)).toBe(0)
    expect(statutDistance(ETABLIE, RENVOI)).toBe(0.5)
    expect(statutDistance(RENVOI, NON_ETABLIE)).toBe(0.5)
    expect(statutDistance(ETABLIE, NON_ETABLIE)).toBe(1)
  })

  it('assimile une compétence absente (null) à « présence non établie »', () => {
    expect(statutDistance(null, NON_ETABLIE)).toBe(0)
    expect(statutDistance(null, ETABLIE)).toBe(1)
  })
})

describe('compareRuns', () => {
  it('exige au moins 2 documents cartographie-jour', () => {
    expect(() => compareRuns([doc({ '1.01': [ETABLIE, 0.7] })])).toThrow(/au moins 2/)
    expect(() => compareRuns([doc({}), { pasUnDoc: true }])).toThrow(/docs\[1\]/)
  })

  it('runs identiques : distance 0, aucune divergence, communes = établies', () => {
    const a = doc({ '1.01': [ETABLIE, 0.7], '1.02': [NON_ETABLIE, 1], '1.03': [RENVOI, 0.4] })
    const result = compareRuns([a, structuredClone(a)])
    expect(result.nbRuns).toBe(2)
    expect(result.distanceStructurelle).toBe(0)
    expect(result.competencesCommunes).toEqual(['1.01'])
    expect(result.competencesDivergentes).toEqual([])
    expect(result.parCompetence['1.03']).toEqual({
      statuts: [RENVOI, RENVOI],
      confiances: [0.4, 0.4],
      ecartType: 0,
    })
  })

  it('runs divergents : divergences détaillées, distance pondérée, écart-type des confiances', () => {
    const run1 = doc({ '1.01': [ETABLIE, 0.7], '1.02': [ETABLIE, 0.6], '1.03': [NON_ETABLIE, 1] })
    const run2 = doc({ '1.01': [ETABLIE, 0.9], '1.02': [NON_ETABLIE, 0.8], '1.03': [RENVOI, 0.4] })
    const result = compareRuns([run1, run2])

    expect(result.competencesCommunes).toEqual(['1.01'])
    expect(result.competencesDivergentes).toEqual([
      { code: '1.02', statuts: [ETABLIE, NON_ETABLIE], presenteDans: [0], absenteDans: [1] },
    ])
    // 1.01 : 0 ; 1.02 : 1 ; 1.03 : 0.5 → moyenne 0.5 sur 3 codes × 1 paire.
    expect(result.distanceStructurelle).toBeCloseTo(0.5, 10)
    expect(result.parCompetence['1.01'].ecartType).toBeCloseTo(0.1, 10)
  })

  it('gère une compétence absente d’un run (statut null, confiance exclue de l’écart-type)', () => {
    const run1 = doc({ '1.01': [ETABLIE, 0.7], '2.05': [ETABLIE, 0.8] })
    const run2 = doc({ '1.01': [ETABLIE, 0.7] })
    const result = compareRuns([run1, run2])
    expect(result.parCompetence['2.05']).toEqual({
      statuts: [ETABLIE, null],
      confiances: [0.8, null],
      ecartType: 0,
    })
    expect(result.competencesDivergentes).toEqual([
      { code: '2.05', statuts: [ETABLIE, null], presenteDans: [0], absenteDans: [1] },
    ])
    // 1.01 accord (0), 2.05 établie vs absente (1) → 0.5.
    expect(result.distanceStructurelle).toBeCloseTo(0.5, 10)
  })

  it('trois runs : toutes les paires comptent', () => {
    const a = doc({ '1.01': [ETABLIE, 0.7] })
    const b = doc({ '1.01': [RENVOI, 0.4] })
    const c = doc({ '1.01': [NON_ETABLIE, 1] })
    const result = compareRuns([a, b, c])
    // paires : (a,b)=0.5, (a,c)=1, (b,c)=0.5 → 2/3.
    expect(result.distanceStructurelle).toBeCloseTo(2 / 3, 10)
    expect(result.competencesCommunes).toEqual([])
    expect(result.competencesDivergentes[0].presenteDans).toEqual([0])
  })
})
