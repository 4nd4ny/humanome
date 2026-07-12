// Modèle de comparaison de deux cartographies (P9.4) : divergences par
// compétence, champs divergents identifiés pour le surlignage.
import { describe, expect, it } from 'vitest'
import dayFixture from '../../../../schemas/fixtures/cartographie-jour-2026-01-05.json'
import mergeFixture from '../../../../schemas/fixtures/cartographie-merge-3-jours.json'
import { compareCartographies, extractComparable } from './compare-model.js'

const clone = (doc) => JSON.parse(JSON.stringify(doc))

describe('extractComparable', () => {
  it('extrait statut + confiance d’un document jour (niveau/points absents)', () => {
    const map = extractComparable(dayFixture)
    const entry = map.get('1.01')
    expect(entry.statut).toBe('présence non établie')
    expect(entry.confiance).toBe(1)
    expect(entry.niveau).toBeNull()
    expect(entry.points).toBeNull()
  })

  it('extrait statut + niveau + points d’un document merge', () => {
    const map = extractComparable(mergeFixture)
    const entry = map.get('1.01')
    expect(entry.statut).toBe('présence établie')
    expect(entry.niveau).toBe(1)
    expect(entry.points).toBe(1)
  })
})

describe('compareCartographies', () => {
  it('deux documents identiques : zéro divergence', () => {
    const result = compareCartographies(dayFixture, clone(dayFixture))
    expect(result.nbDivergences).toBe(0)
    expect(result.rows.every((row) => row.divergent === false)).toBe(true)
  })

  it('signale la compétence dont le statut diverge (documents jour)', () => {
    const other = clone(dayFixture)
    const comp = other.poles[0].competences.find((c) => c.code === '1.01')
    comp.verdict.statut = 'présence établie'
    comp.verdict.confiance = 0.7

    const result = compareCartographies(dayFixture, other)
    const row = result.rows.find((r) => r.code === '1.01')
    expect(row.divergent).toBe(true)
    expect(row.champs).toContain('statut')
    expect(row.champs).toContain('confiance')
    expect(row.a.statut).toBe('présence non établie')
    expect(row.b.statut).toBe('présence établie')
    expect(result.nbDivergences).toBe(1)
  })

  it('signale niveau et points divergents (documents merge)', () => {
    const other = clone(mergeFixture)
    const comp = other.domains[0].competences.find((c) => c.code === '1.01')
    comp.niveau = 3
    comp.points = 9

    const result = compareCartographies(mergeFixture, other)
    const row = result.rows.find((r) => r.code === '1.01')
    expect(row.divergent).toBe(true)
    expect(row.champs).toEqual(expect.arrayContaining(['niveau', 'points']))
  })

  it('compétence absente d’un des deux documents : ligne divergente', () => {
    const other = clone(dayFixture)
    other.poles[0].competences = other.poles[0].competences.filter((c) => c.code !== '1.03')

    const result = compareCartographies(dayFixture, other)
    const row = result.rows.find((r) => r.code === '1.03')
    expect(row.divergent).toBe(true)
    expect(row.b.statut).toBeNull()
  })
})
