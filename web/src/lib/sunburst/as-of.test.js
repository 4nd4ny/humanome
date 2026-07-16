// Tests de buildMergeTreeAsOf sur le merge.json RÉEL (59 feuilles, 54
// compétences établies au final) : parité stricte de la dernière trame avec
// buildMergeTree(doc), et monotonie (les secteurs n'apparaissent que, ne
// disparaissent jamais).
import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'

import { quantilesExclusive } from '@engine/pipeline/merge-document.js'
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

// --- Cas ajoutés (jeu de tests timeline animée) -----------------------------
// Traçabilité : « seuils de quintile FIXES sur le doc final » (anti-
// scintillement des niveaux pendant l'animation) — le cœur de la spec, prouvé
// sur un document synthétique où des quintiles recalculés PAR TRAME donneraient
// d'autres niveaux ; plus le cas dégénéré (1 compétence -> niveau 3) traversé
// via mergeDocAsOf, et l'omission de l'option thresholds (recalcul interne).

const ETABLIE = 'présence établie'
const D1 = '2026-01-05'
const D2 = '2026-02-01'

/**
 * Compétence synthétique : chaque feuille apporte `preuves` preuves et aucune
 * indice (score de la feuille == preuves, donc score_moyen_par_feuille final
 * == moyenne des preuves — des valeurs exactes, faciles à raisonner).
 */
function syntheticComp(code, finalScoreMoyen, sheets) {
  return {
    id: `${code} — Compétence ${code}`,
    code,
    statut: ETABLIE,
    description: `Compétence ${code}`,
    feedback: `<p>Feedback ${code}.</p>`,
    points: sheets.length,
    niveau: 3,
    score_moyen_par_feuille: finalScoreMoyen,
    parFeuille: sheets.map(({ date, preuves }) => ({
      date,
      statut: ETABLIE,
      preuves,
      indices: 0,
      confiance: 0.5,
      score: preuves,
    })),
  }
}

describe('seuils FIXES du document final (anti-scintillement)', () => {
  // A et B sont établies à D1 (scores moyens 1 et 2), C/D/E seulement à D2
  // (scores moyens 3, 4, 5) : la population finale est [1..5].
  const doc = {
    kind: 'cartographie-merge',
    domains: [
      {
        id: 'POLE — Synthétique',
        color: '#2563eb',
        competences: [
          syntheticComp('A', 1, [{ date: D1, preuves: 1 }]),
          syntheticComp('B', 2, [{ date: D1, preuves: 2 }]),
          syntheticComp('C', 3, [{ date: D2, preuves: 3 }]),
          syntheticComp('D', 4, [{ date: D2, preuves: 4 }]),
          syntheticComp('E', 5, [{ date: D2, preuves: 5 }]),
        ],
      },
    ],
  }

  it('les trames intermédiaires utilisent les seuils FINAUX, pas des quintiles recalculés par trame', () => {
    const th = finalThresholds(doc)
    expect(th).toEqual([1.2, 2.4, 3.6, 4.8]) // quintiles exclusifs de [1..5]

    const frame = mergeDocAsOf(doc, D1, { thresholds: th })
    const byCode = new Map(frame.domains[0].competences.map((c) => [c.code, c]))
    expect([...byCode.keys()]).toEqual(['A', 'B'])
    // Seuils FIXES du final : A (1) sous tous les seuils -> niveau 1 ;
    // B (2) ne dépasse que le premier -> niveau 2.
    expect(byCode.get('A').niveau).toBe(1)
    expect(byCode.get('B').niveau).toBe(2)

    // Contre-modèle : des quintiles recalculés sur la POPULATION DE LA TRAME
    // ([1, 2]) attribueraient d'AUTRES niveaux aux deux compétences — le
    // comportement anti-scintillement est donc observable, pas un hasard.
    const perFrame = quantilesExclusive([1, 2], 5)
    const recomputed = (v) => 1 + perFrame.filter((t) => v >= t).length
    expect(recomputed(1)).not.toBe(byCode.get('A').niveau)
    expect(recomputed(2)).not.toBe(byCode.get('B').niveau)
  })

  it('cas dégénéré via mergeDocAsOf : une seule compétence -> niveau 3 sur toutes les trames', () => {
    const single = {
      kind: 'cartographie-merge',
      domains: [
        {
          id: 'POLE — Synthétique',
          color: '#2563eb',
          competences: [
            syntheticComp('A', 2.5, [
              { date: D1, preuves: 2 },
              { date: D2, preuves: 3 },
            ]),
          ],
        },
      ],
    }
    expect(finalThresholds(single)).toEqual([])
    for (const iso of [D1, D2]) {
      const frame = mergeDocAsOf(single, iso) // sans seuils précalculés
      expect(frame.domains[0].competences[0].niveau).toBe(3)
    }
  })

  it('option thresholds omise : mergeDocAsOf recalcule les seuils finaux en interne (même résultat)', () => {
    const mid = feuilles[Math.floor(feuilles.length / 2)]
    expect(mergeDocAsOf(mergeDoc, mid)).toEqual(mergeDocAsOf(mergeDoc, mid, { thresholds }))
  })
})
