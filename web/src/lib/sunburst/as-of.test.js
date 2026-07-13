// Tests de buildMergeTreeAsOf sur le merge.json RÉEL (59 feuilles, 54
// compétences établies au final) : parité stricte de la dernière trame avec
// buildMergeTree(doc), et monotonie (les secteurs n'apparaissent que, ne
// disparaissent jamais).
import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'

import { buildMergeTree } from './build-tree.js'
import { buildMergeTreeAsOf, finalThresholds, mergeDocAsOf } from './as-of.js'

// Helper with a VARIABLE argument (like parity.test.js): a string literal in
// `new URL('…', import.meta.url)` would be rewritten by Vite into a served
// asset URL (http://localhost:3000/…) that readFileSync rejects.
const read = (relative) => JSON.parse(readFileSync(new URL(relative, import.meta.url), 'utf8'))

const mergeDoc = read('../../../public/data/demo/merge.json')
const feuilles = mergeDoc.feuilles.map((f) => f.iso)
const lastDate = feuilles[feuilles.length - 1]
const thresholds = finalThresholds(mergeDoc)

/** Aplati un arbre {root} en Map id -> {points, niveau} des compétences. */
function competenceMap(tree) {
  const map = new Map()
  for (const pole of tree.root.children) {
    for (const comp of pole.children) {
      map.set(comp.id, { points: comp.points, niveau: comp.niveau })
    }
  }
  return map
}

describe('finalThresholds', () => {
  it('renvoie 4 seuils croissants sur les 54 compétences finales', () => {
    expect(thresholds).toHaveLength(4)
    const sorted = [...thresholds].sort((a, b) => a - b)
    expect(thresholds).toEqual(sorted)
  })

  it('cas dégénéré : moins de 2 compétences -> pas de seuils', () => {
    expect(finalThresholds({ domains: [] })).toEqual([])
    expect(
      finalThresholds({ domains: [{ competences: [{ score_moyen_par_feuille: 2 }] }] }),
    ).toEqual([])
  })
})

describe('parité de la dernière trame', () => {
  const finalTree = buildMergeTree(mergeDoc)
  const lastFrame = buildMergeTreeAsOf(mergeDoc, lastDate, { thresholds })

  it('mêmes pôles, mêmes compétences, dans le même ordre', () => {
    expect(lastFrame.root.children.map((p) => p.id)).toEqual(
      finalTree.root.children.map((p) => p.id),
    )
    expect([...competenceMap(lastFrame).keys()]).toEqual([...competenceMap(finalTree).keys()])
  })

  it('points et niveaux par compétence identiques au document publié (0 écart)', () => {
    const expected = competenceMap(finalTree)
    const actual = competenceMap(lastFrame)
    const diffs = []
    for (const [id, exp] of expected) {
      const act = actual.get(id)
      if (!act || act.points !== exp.points || act.niveau !== exp.niveau) {
        diffs.push({ id, expected: exp, actual: act })
      }
    }
    expect(diffs).toEqual([])
  })

  it('agrégats numériques recalculés == agrégats publiés (score, cumuls, confiance)', () => {
    const asOfDoc = mergeDocAsOf(mergeDoc, lastDate, { thresholds })
    const diffs = []
    mergeDoc.domains.forEach((domain, di) => {
      domain.competences.forEach((comp, ci) => {
        const recomputed = asOfDoc.domains[di].competences[ci]
        for (const key of [
          'code',
          'points',
          'niveau',
          'score_cumule',
          'score_moyen_par_feuille',
          'cumul_preuves',
          'cumul_indices',
          'confiance_moyenne',
          'nb_feuilles_etablies',
          'nb_feuilles_renvois',
        ]) {
          if (recomputed?.[key] !== comp[key]) {
            diffs.push({ code: comp.code, key, expected: comp[key], actual: recomputed?.[key] })
          }
        }
      })
    })
    expect(diffs).toEqual([])
  })
})

describe('trames intermédiaires', () => {
  it('à une date intermédiaire, moins de compétences qu au final', () => {
    const mid = feuilles[Math.floor(feuilles.length / 2)]
    const midTree = buildMergeTreeAsOf(mergeDoc, mid, { thresholds })
    const finalCount = competenceMap(buildMergeTree(mergeDoc)).size
    const midCount = competenceMap(midTree).size
    expect(midCount).toBeGreaterThan(0)
    expect(midCount).toBeLessThan(finalCount)
  })

  it('monotonie : les compétences n apparaissent que, ne disparaissent jamais', () => {
    let previous = new Set()
    for (const iso of feuilles) {
      const tree = buildMergeTreeAsOf(mergeDoc, iso, { thresholds })
      const current = new Set(tree ? competenceMap(tree).keys() : [])
      for (const id of previous) expect(current.has(id), `${id} disparaît à ${iso}`).toBe(true)
      previous = current
    }
  })

  it('les points (nb de feuilles établies) ne décroissent jamais', () => {
    let previous = new Map()
    for (const iso of feuilles) {
      const current = competenceMap(buildMergeTreeAsOf(mergeDoc, iso, { thresholds }))
      for (const [id, prev] of previous) {
        expect(current.get(id).points).toBeGreaterThanOrEqual(prev.points)
      }
      previous = current
    }
  })

  it('exclut les pôles vides et les compétences sans feuille établie', () => {
    // Avant la première feuille : aucune donnée, arbre nul (0 domaine).
    const before = mergeDocAsOf(mergeDoc, '1970-01-01', { thresholds })
    expect(before.domains).toHaveLength(0)
    // Première feuille : chaque pôle rendu contient au moins une compétence.
    const first = mergeDocAsOf(mergeDoc, feuilles[0], { thresholds })
    for (const domain of first.domains) {
      expect(domain.competences.length).toBeGreaterThan(0)
      for (const comp of domain.competences) {
        expect(comp.nb_feuilles_etablies).toBeGreaterThan(0)
        expect(comp.parFeuille.every((e) => e.date <= feuilles[0])).toBe(true)
      }
    }
  })

  it('les métadonnées non numériques sont reportées du document final', () => {
    const mid = feuilles[Math.floor(feuilles.length / 2)]
    const asOfDoc = mergeDocAsOf(mergeDoc, mid, { thresholds })
    const finalByCode = new Map(
      mergeDoc.domains.flatMap((d) => d.competences.map((c) => [c.code, { c, d }])),
    )
    for (const domain of asOfDoc.domains) {
      expect(domain.color).toMatch(/^#/)
      for (const comp of domain.competences) {
        const ref = finalByCode.get(comp.code)
        expect(comp.id).toBe(ref.c.id)
        expect(comp.description).toBe(ref.c.description)
        expect(comp.feedback).toBe(ref.c.feedback)
        expect(comp.archetype_titre).toBe(ref.c.archetype_titre)
        expect(domain.id).toBe(ref.d.id)
      }
    }
  })
})
