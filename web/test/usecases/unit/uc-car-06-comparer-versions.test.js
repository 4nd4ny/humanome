// UC-CAR-06 — Comparer des versions de cartographie : tests UNITAIRES (front).
// Fiche : docs/cas-utilisation/cartographe/UC-CAR-06-comparer-versions.md
//
// Code sollicité appelé directement : le modèle pur du tableau des
// divergences (web/src/views/cartographe/compare-model.js) — champs comparés,
// extraction par type de document, comparaison ligne à ligne.
import { describe, expect, it } from 'vitest'
import {
  COMPARE_FIELDS,
  compareCartographies,
  extractComparable,
} from '../../../src/views/cartographe/compare-model.js'
import { dayDoc, mergeDoc } from '../support/car.js'

const dayComp = (doc, code) => doc.poles.flatMap((p) => p.competences).find((c) => c.code === code)
const mergeComp = (doc, code) => doc.domains.flatMap((d) => d.competences).find((c) => c.code === code)

describe('UC-CAR-06 — champs comparés', () => {
  it('UC-CAR-06-U01 — COMPARE_FIELDS : statut, niveau, points, confiance (ordre des colonnes), figé', () => {
    expect(COMPARE_FIELDS).toEqual(['statut', 'niveau', 'points', 'confiance'])
    expect(Object.isFrozen(COMPARE_FIELDS)).toBe(true)
  })
})

describe('UC-CAR-06 — extractComparable', () => {
  it('UC-CAR-06-U02 — journée : statut + confiance du verdict, niveau/points absents ; confiance non numérique -> null', () => {
    const doc = dayDoc()
    dayComp(doc, '2.01').verdict.confiance = 'haute'
    delete dayComp(doc, '3.04').verdict

    const map = extractComparable(doc)

    expect(map.size).toBe(15)
    expect(map.get('1.03')).toEqual({ statut: 'renvoi au cartographe', niveau: null, points: null, confiance: 0.4 })
    expect(map.get('2.01').confiance).toBeNull()
    expect(map.get('3.04')).toEqual({ statut: null, niveau: null, points: null, confiance: null })
  })

  it('UC-CAR-06-U03 — parcours (merge) : statut, niveau, points, confiance_moyenne ; valeurs non numériques -> null', () => {
    const doc = mergeDoc()
    mergeComp(doc, '2.06').niveau = 'trois'

    const map = extractComparable(doc)

    expect(map.size).toBe(10)
    expect(map.get('2.01')).toEqual({ statut: 'présence établie', niveau: 5, points: 3, confiance: 0.7433 })
    expect(map.get('2.06').niveau).toBeNull()
    expect(extractComparable({ kind: 'autre' }).size).toBe(0)
    expect(extractComparable(null).size).toBe(0)
  })
})

describe('UC-CAR-06 — compareCartographies', () => {
  it('UC-CAR-06-U04 — une ligne par code (union triée), champs divergents nommés, champs absents des deux ignorés', () => {
    const b = dayDoc()
    dayComp(b, '1.03').verdict.statut = 'présence établie'
    dayComp(b, '1.03').verdict.confiance = 0.8

    const result = compareCartographies(dayDoc(), b)

    expect(result.nbCompetences).toBe(15)
    expect(result.rows.map((r) => r.code)).toEqual([...result.rows.map((r) => r.code)].sort())
    expect(result.nbDivergences).toBe(1)
    const row = result.rows.find((r) => r.code === '1.03')
    expect(row).toMatchObject({ divergent: true, champs: ['statut', 'confiance'] })
    expect(row.a.statut).toBe('renvoi au cartographe')
    expect(row.b.confiance).toBe(0.8)
    // niveau/points null des deux côtés : jamais une divergence.
    expect(result.rows.filter((r) => r.code !== '1.03').every((r) => r.champs.length === 0)).toBe(true)
  })

  it('UC-CAR-06-U05 — compétence présente d’un seul côté : ligne divergente, côté manquant entièrement vide', () => {
    const b = mergeDoc()
    b.domains[0].competences = [] // 1.01 disparaît du second parcours

    const row = compareCartographies(mergeDoc(), b).rows.find((r) => r.code === '1.01')

    expect(row.divergent).toBe(true)
    expect(row.b).toEqual({ statut: null, niveau: null, points: null, confiance: null })
    expect(row.champs).toEqual(['statut', 'niveau', 'points', 'confiance'])
  })

  it('UC-CAR-06-U06 — limite : journée contre parcours → niveau/points toujours divergents (comportement actuel)', () => {
    const result = compareCartographies(dayDoc(), mergeDoc())

    const row = result.rows.find((r) => r.code === '2.01') // établie des deux côtés
    expect(row.a.statut).toBe(row.b.statut)
    expect(row.champs).toEqual(expect.arrayContaining(['niveau', 'points']))
    expect(result.nbCompetences).toBe(15) // union : les 10 codes du merge sont inclus dans les 15 de la journée
  })
})
