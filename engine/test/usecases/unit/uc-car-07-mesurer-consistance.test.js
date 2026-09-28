// UC-CAR-07 — Mesurer la consistance multi-run : tests UNITAIRES (moteur).
// Fiche : docs/cas-utilisation/cartographe/UC-CAR-07-mesurer-consistance.md
//
// Code sollicité appelé directement : engine/src/consistency.js
// (statutDistance, compareRuns) et son export public (engine/src/index.js).
// Données : fixtures VERSIONNÉES seulement (schemas/fixtures/), lues dans les
// tests eux-mêmes (contrainte CI « Tests moteur »).
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { compareRuns, statutDistance } from '../../../src/consistency.js'
import * as engine from '../../../src/index.js'

const ETABLIE = 'présence établie'
const NON_ETABLIE = 'présence non établie'
const RENVOI = 'renvoi au cartographe'

/** Lecture d'une fixture versionnée (appelée DANS les tests). */
function fixture(name) {
  const url = new URL(`../../../../schemas/fixtures/${name}`, import.meta.url)
  return JSON.parse(readFileSync(url, 'utf8'))
}

const jour = () => fixture('cartographie-jour-2026-01-05.json')

/** Force le statut (et éventuellement la confiance) d'une compétence d'un run. */
function withVerdict(doc, code, statut, confiance) {
  for (const pole of doc.poles) {
    for (const comp of pole.competences) {
      if (comp.code === code) {
        comp.verdict.statut = statut
        if (confiance !== undefined) comp.verdict.confiance = confiance
      }
    }
  }
  return doc
}

describe('UC-CAR-07 — statutDistance', () => {
  it('UC-CAR-07-U01 — échelle ordinale non établie < renvoi < établie ; absente ou inconnue ≡ non établie', () => {
    expect(statutDistance(ETABLIE, ETABLIE)).toBe(0)
    expect(statutDistance(ETABLIE, RENVOI)).toBe(0.5)
    expect(statutDistance(RENVOI, NON_ETABLIE)).toBe(0.5)
    expect(statutDistance(ETABLIE, NON_ETABLIE)).toBe(1)
    expect(statutDistance(NON_ETABLIE, ETABLIE)).toBe(1) // symétrique
    expect(statutDistance(null, NON_ETABLIE)).toBe(0)
    expect(statutDistance('statut inventé', NON_ETABLIE)).toBe(0)
    expect(statutDistance('statut inventé', ETABLIE)).toBe(1)
  })
})

describe('UC-CAR-07 — compareRuns : entrées', () => {
  it('UC-CAR-07-U02 — au moins 2 documents cartographie-jour ; sinon TypeError explicite', () => {
    expect(() => compareRuns([jour()])).toThrow('compareRuns : au moins 2 documents cartographie-jour requis')
    expect(() => compareRuns('pas une liste')).toThrow(TypeError)
    expect(() => compareRuns([jour(), fixture('cartographie-merge-3-jours.json')])).toThrow(
      "compareRuns : docs[1] n'est pas un document cartographie-jour (poles[] manquant)",
    )
  })

  it('UC-CAR-07-U03 — export public du moteur : compareRuns et statutDistance', () => {
    expect(engine.compareRuns).toBe(compareRuns)
    expect(engine.statutDistance).toBe(statutDistance)
  })
})

describe('UC-CAR-07 — compareRuns : mesures sur la journée réelle du 5 janvier', () => {
  it('UC-CAR-07-U04 — deux runs identiques : distance 0, stables = compétences établies, aucune divergente', () => {
    const result = compareRuns([jour(), jour()])

    expect(result.nbRuns).toBe(2)
    expect(result.distanceStructurelle).toBe(0)
    expect(result.competencesCommunes).toEqual(['2.01', '3.04', '5.03', '7.01'])
    expect(result.competencesDivergentes).toEqual([])
    expect(Object.keys(result.parCompetence)).toHaveLength(15)
    expect(result.parCompetence['1.03']).toEqual({ statuts: [RENVOI, RENVOI], confiances: [0.4, 0.4], ecartType: 0 })
  })

  it('UC-CAR-07-U05 — trois runs : divergence détaillée, distance moyenne sur codes × paires', () => {
    const runs = [jour(), withVerdict(jour(), '1.03', ETABLIE, 0.8), withVerdict(jour(), '1.03', NON_ETABLIE, 1)]

    const result = compareRuns(runs)

    expect(result.competencesDivergentes).toEqual([
      { code: '1.03', statuts: [RENVOI, ETABLIE, NON_ETABLIE], presenteDans: [1], absenteDans: [0, 2] },
    ])
    // 15 codes × 3 paires ; seule 1.03 diffère : 0.5 + 0.5 + 1 = 2.
    expect(result.distanceStructurelle).toBeCloseTo(2 / 45, 12)
    // Écart-type de population des confiances 0.4 / 0.8 / 1.
    const mean = (0.4 + 0.8 + 1) / 3
    const sd = Math.sqrt(((0.4 - mean) ** 2 + (0.8 - mean) ** 2 + (1 - mean) ** 2) / 3)
    expect(result.parCompetence['1.03'].ecartType).toBeCloseTo(sd, 12)
  })

  it('UC-CAR-07-U06 — confiance non numérique ou compétence absente : null, exclue de l’écart-type', () => {
    const b = jour()
    for (const pole of b.poles) pole.competences = pole.competences.filter((c) => c.code !== '7.03')
    withVerdict(b, '2.01', ETABLIE, 'haute')

    const result = compareRuns([jour(), b])

    expect(result.parCompetence['7.03']).toEqual({ statuts: [NON_ETABLIE, null], confiances: [1, null], ecartType: 0 })
    expect(result.parCompetence['2.01'].confiances).toEqual([0.7, null])
    expect(result.distanceStructurelle).toBe(0) // absente ≡ non établie
  })

  it('UC-CAR-07-U07 — limite : « non établie » contre « renvoi » n’est ni stable ni divergente (compte 0.5 dans la distance)', () => {
    const result = compareRuns([jour(), withVerdict(jour(), '1.01', RENVOI)])

    expect(result.competencesDivergentes).toEqual([]) // « divergente » = établie dans certains runs seulement
    expect(result.competencesCommunes).not.toContain('1.01')
    expect(result.distanceStructurelle).toBeCloseTo(0.5 / 15, 12)
  })

  it('UC-CAR-07-U08 — limite : aucune vérification de la journée — deux dates différentes sont comparées', () => {
    const autreJour = fixture('cartographie-jour-2026-01-06.json')
    expect(autreJour.date).not.toBe(jour().date)

    const result = compareRuns([jour(), autreJour])

    expect(result.nbRuns).toBe(2)
    expect(result.distanceStructurelle).toBeGreaterThan(0)
  })
})
