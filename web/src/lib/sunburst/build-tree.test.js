import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'

import { buildMergeTree, buildDayTree, confidenceQuintile } from './build-tree.js'
import { layoutSunburst } from './layout.js'
import { RENVOI_RADIUS_FACTOR } from './geometry.js'

const read = (relative) => JSON.parse(readFileSync(new URL(relative, import.meta.url), 'utf8'))

const mergeDoc = read('../../../public/data/demo/merge.json')
const dayDoc = read('../../../../schemas/fixtures/cartographie-jour-2026-01-05.json')
const referentiel = read('../../../public/data/referentiel/respire-v7.json')

describe('confidenceQuintile', () => {
  it('maps confiance 0..1 onto quintiles 1..5', () => {
    expect(confidenceQuintile(0)).toBe(1)
    expect(confidenceQuintile(0.19)).toBe(1)
    expect(confidenceQuintile(0.2)).toBe(2)
    expect(confidenceQuintile(0.4)).toBe(3)
    expect(confidenceQuintile(0.6)).toBe(4)
    expect(confidenceQuintile(0.79)).toBe(4)
    expect(confidenceQuintile(0.8)).toBe(5)
    expect(confidenceQuintile(1)).toBe(5)
  })
})

describe('buildMergeTree (merge.json réel)', () => {
  const tree = buildMergeTree(mergeDoc)

  it('replicates the generateData() structure: root -> 7 poles -> 54 competences', () => {
    expect(tree.root.id).toBe('Compétences RESPIRE')
    expect(tree.root.children).toHaveLength(7)
    const leaves = tree.root.children.flatMap((d) => d.children)
    expect(leaves).toHaveLength(54)
    expect(leaves.every((c) => c.isLeaf)).toBe(true)
  })

  it('accumulates points and niveaux like the original', () => {
    const pole = tree.root.children[0]
    expect(pole.points).toBe(pole.children.reduce((s, c) => s + c.points, 0))
    expect(pole.niveau).toBe(Math.max(...pole.children.map((c) => Math.abs(c.niveau))))
    const positifs = pole.children.filter((c) => c.niveau > 0)
    expect(pole.niveau_moyen).toBe(positifs.reduce((s, c) => s + c.niveau, 0) / positifs.length)
    expect(tree.root.points).toBe(tree.root.children.reduce((s, d) => s + d.points, 0))
  })

  it('carries the narrative and v3 fields (feedback, archetype, tendance, rapport_html)', () => {
    const pole = tree.root.children[0]
    expect(pole.rapport_html).toBe(mergeDoc.domains[0].rapport_html)
    expect(pole.tendance_titre).toBe(mergeDoc.domains[0].tendance_titre)
    const comp = pole.children[0]
    expect(comp.feedback).toBe(mergeDoc.domains[0].competences[0].feedback)
    expect(comp.archetype).toBe(mergeDoc.domains[0].competences[0].archetype)
    expect(comp.code).toBe('1.01')
    expect(comp.color).toBe(mergeDoc.domains[0].color)
  })

  it('returns null when the document has no domains (original guard)', () => {
    expect(buildMergeTree({})).toBeNull()
    expect(buildMergeTree(null)).toBeNull()
  })
})

describe('buildDayTree (fixture cartographie-jour-2026-01-05)', () => {
  const { tree, exclus } = buildDayTree(dayDoc, referentiel)

  it('builds the 7 poles in day order, named and colored from the referentiel', () => {
    expect(tree.root.children).toHaveLength(7)
    expect(tree.root.children[0].id).toBe('TETE — Penser & Comprendre')
    expect(tree.root.children[0].color).toBe('#2563eb')
    expect(tree.root.children[6].id).toBe('FLAMBEAU — Transmettre & Piloter')
    expect(tree.root.children[6].color).toBe('#f97316')
  })

  it('keeps only établies and renvois in the diagram (fixture: 4 + 1)', () => {
    const leaves = tree.root.children.flatMap((d) => d.children)
    expect(leaves).toHaveLength(5)
    expect(leaves.map((c) => c.code).sort()).toEqual(['1.03', '2.01', '3.04', '5.03', '7.01'])
  })

  it('renvoi au cartographe -> niveau -1, angular width still counted', () => {
    // 1.03: renvoi, 0 preuves, 1 indice -> points max(1, 0*2+1) = 1
    const renvoi = tree.root.children[0].children[0]
    expect(renvoi.code).toBe('1.03')
    expect(renvoi.niveau).toBe(-1)
    expect(renvoi.points).toBe(1)
    expect(renvoi.statut).toBe('renvoi au cartographe')
  })

  it('établies: width = preuves*2 + indices, niveau = quintile de confiance', () => {
    const byCode = new Map(tree.root.children.flatMap((d) => d.children).map((c) => [c.code, c]))
    // 2.01: 1 preuve, 1 indice, confiance 0.7 -> points 3, niveau 4
    expect(byCode.get('2.01').points).toBe(3)
    expect(byCode.get('2.01').niveau).toBe(4)
    // 3.04: 1 preuve, 0 indice, confiance 0.6 -> points 2, niveau 4
    expect(byCode.get('3.04').points).toBe(2)
    expect(byCode.get('3.04').niveau).toBe(4)
    // 7.01: 0 preuve, 2 indices, confiance 0.68 -> points 2, niveau 4
    expect(byCode.get('7.01').points).toBe(2)
    expect(byCode.get('7.01').niveau).toBe(4)
  })

  it('competence names come from the referentiel', () => {
    const comp201 = tree.root.children[1].children[0]
    expect(comp201.id).toBe('2.01 — Intelligence Émotionnelle & Sollicitude Active')
  })

  it('court-circuits are excluded and listed apart (fixture: 10)', () => {
    expect(exclus.courtCircuits).toHaveLength(10)
    expect(exclus.courtCircuits.every((e) => e.verdict.statut === 'présence non établie')).toBe(true)
    expect(exclus.courtCircuits[0]).toMatchObject({
      code: '1.01',
      nom: 'Pensée Critique & Anti-Hallucination',
      poleNum: '1',
    })
    expect(exclus.nonEtablies).toHaveLength(0)
  })

  it('poles without included competences stay in the tree with 0 points', () => {
    const pole4 = tree.root.children[3]
    expect(pole4.children).toHaveLength(0)
    expect(pole4.points).toBe(0)
  })

  it('layout renders renvois hatched at RENVOI_RADIUS_FACTOR and établies with gray bands', () => {
    const layout = layoutSunburst(tree, { size: 400 })
    // 7 pole sectors + 4 établies * (5 gray + 1) + 1 renvoi = 32
    expect(layout.sectors).toHaveLength(32)
    const renvois = layout.sectors.filter((s) => s.class === 'renvoi-sector')
    expect(renvois).toHaveLength(1)
    expect(renvois[0].fill).toBe('url(#hatch)')
    expect(renvois[0].strokeDasharray).toBe('4,3')
    expect(renvois[0].meta).toMatchObject({ kind: 'competence', code: '1.03', niveau: -1 })
    // reduced radial extent: outer radius = 112 + 80 * 0.35 = 140 (ring 112..192)
    expect(renvois[0].d).toContain(`A ${112 + 80 * RENVOI_RADIUS_FACTOR} `)
    expect(layout.sectors.filter((s) => s.class === 'gray-sector')).toHaveLength(20)
    expect(layout.sectors.filter((s) => s.meta.kind === 'pole')).toHaveLength(7)
  })
})

describe('buildDayTree (règles limites, document synthétique)', () => {
  const miniRef = {
    poles: [{ num: 1, nom: 'TETE — Penser & Comprendre', couleur: '#2563eb' }],
    competences: [
      { code: '1.01', nom: 'A', pole: 1 },
      { code: '1.02', nom: 'B', pole: 1 },
      { code: '1.03', nom: 'C', pole: 1 },
      { code: '1.04', nom: 'D', pole: 1 },
    ],
  }
  const verdict = (statut, confiance, nombrePreuves, nombreIndices) => ({
    statut,
    confiance,
    nombrePreuves,
    nombreIndices,
  })
  const dayDoc = {
    poles: [
      {
        poleNum: '1',
        competences: [
          // non établie NON court-circuitée -> exclue, listée dans nonEtablies
          { code: '1.01', courtCircuit: false, verdict: verdict('présence non établie', 0.9, 0, 0) },
          // renvoi sans preuve ni indice -> largeur plancher 1
          { code: '1.02', courtCircuit: false, verdict: verdict('renvoi au cartographe', 0.5, 0, 0) },
          // établie aux bornes des quintiles
          { code: '1.03', courtCircuit: false, verdict: verdict('présence établie', 1, 2, 3) },
          { code: '1.04', courtCircuit: true, verdict: verdict('présence non établie', 1, 0, 0) },
        ],
      },
    ],
  }
  const { tree, exclus } = buildDayTree(dayDoc, miniRef)

  it('non établie non court-circuitée va dans exclus.nonEtablies', () => {
    expect(exclus.nonEtablies).toHaveLength(1)
    expect(exclus.nonEtablies[0].code).toBe('1.01')
    expect(exclus.courtCircuits).toHaveLength(1)
    expect(exclus.courtCircuits[0].code).toBe('1.04')
  })

  it('largeur plancher: 0 preuve + 0 indice -> points 1', () => {
    const renvoi = tree.root.children[0].children.find((c) => c.code === '1.02')
    expect(renvoi.points).toBe(1)
    expect(renvoi.niveau).toBe(-1)
  })

  it('confiance 1 -> niveau 5 (borne haute), points = 2*2+3 = 7', () => {
    const comp = tree.root.children[0].children.find((c) => c.code === '1.03')
    expect(comp.niveau).toBe(5)
    expect(comp.points).toBe(7)
    expect(tree.root.children[0].points).toBe(8)
    expect(tree.root.children[0].niveau_moyen).toBe(5) // renvois écartés de la moyenne
  })
})
