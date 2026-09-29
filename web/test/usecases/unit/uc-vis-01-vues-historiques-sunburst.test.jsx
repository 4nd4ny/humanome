// UC-VIS-01 — Explorer la cartographie de démonstration : tests UNITAIRES de la
// VRAIE bibliothèque sunburst et des composants des vues historiques (front).
// Fiche : docs/cas-utilisation/visiteur/UC-VIS-01-explorer-cartographie-demonstration.md
//
// Code sollicité appelé directement — jamais le faux module de test
// (web/src/test/fake-sunburst-lib.js). Les documents passés aux fonctions sont
// les fixtures versionnées (schemas/fixtures/cartographie-*.json,
// referentiel-respire-v7.json), MAIS ce fichier dépend aussi de données
// GÉNÉRÉES : DayView.jsx importe web/src/data/load.js, qui importe
// statiquement web/public/data/demo/merge.json et
// web/public/data/referentiel/respire-v7.json (gitignorés, produits par
// scripts/convert/carto-data-to-merge-json.mjs et
// scripts/extract-referentiel.mjs — UC-SYS-04). Sans eux, l'import échoue et
// tout le fichier tombe (raison pour laquelle la suite front n'est pas en CI).
// - web/src/lib/sunburst/geometry.js : constantes NIVEAUX / GRAY_LEVELS /
//   RENVOI_RADIUS_FACTOR, trigonométrie correctement arrondie, createSectorPath,
//   getMaxDepth ;
// - web/src/lib/sunburst/build-tree.js : confidenceQuintile, buildDayTree,
//   buildMergeTree ; layout.js : layoutSunburst ; index.js : API publique ;
//   web/src/data/sunburst.js : loadSunburstLib ; web/src/views/view-helpers.js :
//   useSunburstLib (bibliothèque reçue par les vues sans injection) ;
// - web/src/components/TimelinePlayer.jsx : lecture automatique (faux
//   minuteurs), vitesses, pause, scrubber, prefers-reduced-motion ;
// - web/src/views/DayView.jsx : panneau d'un pôle (rapport, audit, passages
//   saillants) — rendu atteignable seulement hors schéma, voir anomalie AN1.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useState } from 'react'
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react'
import * as realLib from '../../../src/lib/sunburst/index.js'
import * as geometry from '../../../src/lib/sunburst/geometry.js'
import * as buildTree from '../../../src/lib/sunburst/build-tree.js'
import * as layoutModule from '../../../src/lib/sunburst/layout.js'
import { loadSunburstLib } from '../../../src/data/sunburst.js'
import { useSunburstLib } from '../../../src/views/view-helpers.js'
import { finalThresholds, mergeDocAsOf } from '../../../src/lib/sunburst/as-of.js'
import TimelinePlayer, { SPEEDS } from '../../../src/components/TimelinePlayer.jsx'
import DayView from '../../../src/views/DayView.jsx'
import referentielDoc from '../../../../schemas/fixtures/referentiel-respire-v7.json'
import mergeFixture from '../../../../schemas/fixtures/cartographie-merge-3-jours.json'
import { FIXTURE_DAYS, FIXTURE_FACTS } from '../support/vis.js'

const {
  NIVEAUX,
  GRAY_LEVELS,
  RENVOI_RADIUS_FACTOR,
  crCos,
  crSin,
  createSectorPath,
  getMaxDepth,
  buildDayTree,
  buildMergeTree,
  confidenceQuintile,
  layoutSunburst,
} = { ...geometry, ...buildTree, ...layoutModule }

// --- Outillage local ---------------------------------------------------------

/**
 * Décompose un chemin produit par createSectorPath
 * (« M x1 y1 L x2 y2 A rO rO 0 la 1 x3 y3 L x4 y4 A rI rI 0 la 0 x1 y1 Z ») :
 * rayons lus dans les arcs, coins, angles de début/fin (degrés, via atan2
 * autour du centre) des coins extérieurs (start/end) et intérieurs
 * (startIn/endIn), étendue angulaire (0..360).
 */
function parseSector(d, cx, cy) {
  const n = d.replace(/[MLAZ]/g, ' ').trim().split(/\s+/).map(Number)
  const [x1, y1, x2, y2, rOut, rOut2, , largeArc, sweepOut, x3, y3, x4, y4, rIn, rIn2, , largeArc2, sweepIn, xe, ye] = n
  const angle = (x, y) => (Math.atan2(y - cy, x - cx) * 180) / Math.PI
  const start = angle(x2, y2)
  const end = angle(x3, y3)
  return {
    startIn: angle(x1, y1),
    endIn: angle(x4, y4),
    rIn,
    rOut,
    rIn2,
    rOut2,
    largeArc,
    largeArc2,
    sweepOut,
    sweepIn,
    corners: [[x1, y1], [x2, y2], [x3, y3], [x4, y4]],
    closes: xe === x1 && ye === y1,
    start,
    end,
    span: (((end - start) % 360) + 360) % 360,
  }
}

const dist = ([x, y], cx, cy) => Math.hypot(x - cx, y - cy)

/** Feuilles de l'arbre (compétences), dans l'ordre du document. */
const leaves = (tree) => tree.root.children.flatMap((pole) => pole.children)

/** Nombre de compétences sur la carte par trame, compté comme MergeView (dernière trame = document publié). */
function cumulativeCounts(doc) {
  const thresholds = finalThresholds(doc)
  const count = (d) => d.domains.reduce((n, domain) => n + domain.competences.length, 0)
  return doc.feuilles.map((f, i) => (i === doc.feuilles.length - 1 ? count(doc) : count(mergeDocAsOf(doc, f.iso, { thresholds }))))
}

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  delete window.matchMedia
})

// --- Géométrie ---------------------------------------------------------------

describe('UC-VIS-01 — bibliothèque sunburst : géométrie des secteurs', () => {
  it('UC-VIS-01-U18 — geometry : niveaux radiaux, bandes grises, rayon de renvoi ; createSectorPath trace un secteur annulaire exact ; trigonométrie correctement arrondie ; profondeur de l’arbre', () => {
    // Cinq niveaux, du plus court au plus long rayon (part de l'anneau occupée).
    expect(Object.keys(NIVEAUX).map(Number)).toEqual([1, 2, 3, 4, 5])
    expect(Object.values(NIVEAUX).map((n) => n.nom)).toEqual(['Découverte', 'Application', 'Maîtrise', 'Expertise', 'Excellence'])
    expect(Object.values(NIVEAUX).map((n) => n.radiusFactor)).toEqual([0.2, 0.4, 0.6, 0.8, 1.0])
    // Un renvoi au cartographe est plus court qu'une présence de niveau 2, plus long qu'un niveau 1.
    expect(RENVOI_RADIUS_FACTOR).toBe(0.35)
    expect(RENVOI_RADIUS_FACTOR).toBeGreaterThan(NIVEAUX[1].radiusFactor)
    expect(RENVOI_RADIUS_FACTOR).toBeLessThan(NIVEAUX[2].radiusFactor)
    // Cinq gris de fond, du noir (niveau 1) au gris clair (niveau 5).
    expect(GRAY_LEVELS).toEqual({ 1: '#000000', 2: '#1f2937', 3: '#374151', 4: '#6b7280', 5: '#cbd5e1' })

    // Secteur annulaire : les 4 coins sont sur les cercles rIn / rOut aux angles demandés.
    const d = createSectorPath(200, 200, 112, 192, -90, 12.857142857142858)
    const s = parseSector(d, 200, 200)
    expect([s.rIn, s.rIn2, s.rOut, s.rOut2]).toEqual([112, 112, 192, 192])
    expect(s.corners.map((c) => dist(c, 200, 200))).toEqual([
      expect.closeTo(112, 9),
      expect.closeTo(192, 9),
      expect.closeTo(192, 9),
      expect.closeTo(112, 9),
    ])
    // Coins extérieurs (2, 3) ET intérieurs (1, 4) aux angles de début et de fin.
    expect(s.start).toBeCloseTo(-90, 9)
    expect(s.end).toBeCloseTo(12.857142857142858, 9)
    expect(s.startIn).toBeCloseTo(-90, 9)
    expect(s.endIn).toBeCloseTo(12.857142857142858, 9)
    expect(s.closes).toBe(true)
    // Arc extérieur dans le sens horaire, arc intérieur en retour ; petit arc.
    expect([s.sweepOut, s.sweepIn, s.largeArc, s.largeArc2]).toEqual([1, 0, 0, 0])
    // Au-delà de 180° (strictement), les DEUX arcs (extérieur et intérieur) passent en « grand arc ».
    const wide = parseSector(createSectorPath(0, 0, 10, 20, -90, 90.0001), 0, 0)
    const half = parseSector(createSectorPath(0, 0, 10, 20, -90, 90), 0, 0)
    expect([wide.largeArc, wide.largeArc2]).toEqual([1, 1])
    expect([half.largeArc, half.largeArc2]).toEqual([0, 0])

    // crCos / crSin : correctement arrondis (indépendants du moteur JS). Sur
    // l'angle de fin de 2.09 du corpus réel, V8 est à 1 ulp de la vraie valeur.
    expect(crCos(0.8408380337549153)).toBe(0.6668385554647013)
    expect(crSin(0.8408380337549153)).toBe(0.7452022148019626)
    expect(crSin(-Math.PI / 2)).toBe(-1)
    expect(crCos(0)).toBe(1)
    for (let deg = -90; deg <= 270; deg += 7.5) {
      const t = (deg * Math.PI) / 180
      expect(Math.abs(crCos(t) - Math.cos(t))).toBeLessThanOrEqual(Number.EPSILON)
      expect(Math.abs(crSin(t) - Math.sin(t))).toBeLessThanOrEqual(Number.EPSILON)
    }

    // Profondeur : racine → pôles → compétences = 2 anneaux.
    const tree = buildMergeTree(mergeFixture)
    expect(getMaxDepth(tree.root)).toBe(2)
    expect(getMaxDepth(tree.root.children[0])).toBe(1)
    expect(getMaxDepth(leaves(tree)[0])).toBe(0)
  })
})

// --- Construction des arbres -------------------------------------------------

describe('UC-VIS-01 — bibliothèque sunburst : arbres de la vue journée et de la vue chronologique', () => {
  it('UC-VIS-01-U19 — confidenceQuintile : la confiance du verdict (0..1) donne le niveau 1..5 par quintile, bornes incluses à gauche, 1 reste au 5e quintile', () => {
    const cases = [
      [0, 1], [0.19, 1], [0.2, 2], [0.39, 2], [0.4, 3], [0.55, 3], [0.58, 3],
      [0.6, 4], [0.78, 4], [0.79, 4], [0.8, 5], [0.99, 5], [1, 5],
    ]
    for (const [confiance, niveau] of cases) expect([confiance, confidenceQuintile(confiance)]).toEqual([confiance, niveau])
    // Bornes : jamais hors 1..5, même sur des valeurs hors domaine.
    expect(confidenceQuintile(-0.3)).toBe(1)
    expect(confidenceQuintile(1.7)).toBe(5)
  })

  it('UC-VIS-01-U20 — buildDayTree sur les trois journées de fixtures : 7 pôles du référentiel, feuilles = présences établies + renvois, largeur = 2·preuves + indices, niveau = quintile, exclus à part', () => {
    const byDay = Object.fromEntries(FIXTURE_FACTS.dates.map((date) => [date, buildDayTree(FIXTURE_DAYS[date], referentielDoc)]))
    for (const [date, built] of Object.entries(byDay)) {
      // Un nœud par pôle du document, nommé et coloré par le référentiel.
      expect(built.tree.root.id).toBe('Compétences RESPIRE')
      expect(built.tree.root.children.map((p) => p.id)).toEqual(referentielDoc.poles.map((p) => p.nom))
      expect(built.tree.root.children.map((p) => p.color)).toEqual(referentielDoc.poles.map((p) => p.couleur))
      // Les présences établies du diagramme sont exactement celles que le moteur V3 documente ce jour-là.
      const established = leaves(built.tree).filter((l) => l.statut === 'présence établie').map((l) => l.code).sort()
      expect([date, established]).toEqual([date, FIXTURE_FACTS.byDate[date]])
      // Aucun court-circuit ni « présence non établie » dans le diagramme.
      expect(leaves(built.tree).every((l) => ['présence établie', 'renvoi au cartographe'].includes(l.statut))).toBe(true)
    }

    // 7 janvier : largeur, niveau et libellé de chaque feuille.
    const day07 = byDay['2026-01-07']
    const shape = leaves(day07.tree).map((l) => [l.code, l.points, l.niveau, l.id])
    expect(shape).toEqual([
      ['1.01', 1, -1, '1.01 — Pensée Critique & Anti-Hallucination'], // renvoi : 0·2 + 1 indice
      ['2.01', 5, 4, '2.01 — Intelligence Émotionnelle & Sollicitude Active'], // 2 preuves, 1 indice, confiance 0.78
      ['3.07', 4, 4, '3.07 — Présence & Performance Live'], // 1 preuve, 2 indices, 0.74
      ['4.05', 2, 3, '4.05 — Décision & Tolérance à l\'Incertitude'], // 0 preuve, 2 indices, 0.58
      ['5.03', 3, 4, '5.03 — Narration Réflexive'], // 1 preuve, 1 indice, 0.75
      ['6.07', 2, 3, '6.07 — Facilitation & Gouvernance Collective'], // 0.55
      ['7.01', 3, 5, '7.01 — Maïeutique & Facilitation d\'Apprentissage'], // confiance 0.8 → 5e quintile
    ])
    // Pôle : points = somme, niveau = max des |niveaux|, niveau moyen = moyenne des niveaux > 0 (renvois exclus).
    const tete = day07.tree.root.children[0]
    expect([tete.points, tete.niveau, tete.niveau_moyen]).toEqual([1, 1, 0])
    expect(day07.tree.root.points).toBe(20)
    expect(day07.exclus.nonEtablies).toEqual([])
    expect(day07.exclus.courtCircuits.map((e) => e.code)).toEqual(['1.03', '2.02', '2.06', '3.04', '4.06', '5.01', '6.05', '7.03'])

    // 6 janvier : une « présence non établie » SANS court-circuit (4.06) va dans nonEtablies.
    const day06 = byDay['2026-01-06']
    expect(day06.exclus.nonEtablies.map((e) => [e.code, e.nom, e.poleNum])).toEqual([['4.06', 'Responsabilité, Courage & Intégrité', '4']])
    expect(day06.exclus.courtCircuits).toHaveLength(9)
    expect(leaves(day06.tree).find((l) => l.code === '2.02').niveau).toBe(-1)
    // 5 janvier : AME et CITE sans feuille restent des pôles de largeur nulle.
    expect(byDay['2026-01-05'].tree.root.children.filter((p) => p.points === 0).map((p) => p.poleNum)).toEqual(['4', '6'])

    // Largeur plancher à 1 ; pôle et compétence inconnus du référentiel : repli lisible.
    const odd = structuredClone(FIXTURE_DAYS['2026-01-07'])
    const c201 = odd.poles[1].competences[0]
    c201.verdict.nombrePreuves = 0
    c201.verdict.nombreIndices = 0
    odd.poles.push({ poleNum: '9', competences: [{ code: '9.99', courtCircuit: false, verdict: { statut: 'présence établie', confiance: 0.1, nombrePreuves: 1, nombreIndices: 0 } }] })
    const oddTree = buildDayTree(odd, referentielDoc).tree
    expect(leaves(oddTree).find((l) => l.code === '2.01').points).toBe(1)
    const unknown = oddTree.root.children.at(-1)
    expect([unknown.id, unknown.color, unknown.children[0].id, unknown.children[0].niveau]).toEqual(['Pôle 9', '#94a3b8', '9.99 — 9.99', 1])
  })

  it('UC-VIS-01-U21 — buildMergeTree sur le merge 3 jours : racine → 7 pôles → 10 compétences établies, agrégats de pôle, statut par défaut, document sans domaines refusé', () => {
    const tree = buildMergeTree(mergeFixture)
    expect(tree.root.id).toBe('Compétences RESPIRE')
    expect(tree.root.children.map((p) => [p.id, p.color, p.points, p.niveau, p.niveau_moyen])).toEqual([
      ['TETE — Penser & Comprendre', '#2563eb', 1, 1, 1],
      ['COEUR — Relier & Naviguer', '#10b981', 4, 5, 4],
      ['MAIN — Créer & Incarner', '#ec4899', 2, 5, 3],
      ['AME — Discerner & Juger', '#8b5cf6', 1, 2, 2],
      ['RACINES — Évoluer & Résister', '#f59e0b', 3, 4, 3.5],
      ["CITE — Gouverner & S'ouvrir", '#06b6d4', 1, 2, 2],
      ['FLAMBEAU — Transmettre & Piloter', '#f97316', 2, 4, 4],
    ])
    expect(tree.root.points).toBe(14)
    expect(leaves(tree).map((l) => l.code).sort()).toEqual(FIXTURE_FACTS.documentedCodes)
    const c201 = leaves(tree).find((l) => l.code === '2.01')
    expect([c201.niveau, c201.points, c201.statut, c201.archetype_titre, c201.color]).toEqual([5, 3, 'présence établie', 'Trait fondateur', '#10b981'])
    // Tendance temporelle du pôle et rapport évolutif conservés pour le panneau de détails.
    expect(tree.root.children[1].tendance_titre).toBe('Pic au milieu')
    expect(tree.root.children[1].rapport_html).toContain('Rapport évolutif du pôle 2')

    // Un renvoi (niveau -1) compte dans le niveau max (valeur absolue) mais pas dans le niveau moyen ;
    // un statut absent vaut « présence établie ».
    const doc = structuredClone(mergeFixture)
    doc.domains[0].competences.push({ id: '1.03 — Synthèse Intégrative', code: '1.03', niveau: -1, points: 2, statut: 'renvoi au cartographe' })
    Object.assign(doc.domains[3].competences[0], { niveau: -1, statut: 'renvoi au cartographe' })
    delete doc.domains[5].competences[0].statut
    const mutated = buildMergeTree(doc)
    const agg = (i) => [mutated.root.children[i].points, mutated.root.children[i].niveau, mutated.root.children[i].niveau_moyen]
    expect(agg(0)).toEqual([3, 1, 1]) // TETE : 1.01 (niveau 1) + renvoi 1.03 → moyenne sur 1.01 seule
    expect(agg(3)).toEqual([1, 1, 0]) // AME : renvoi seul → niveau |−1| = 1, aucune moyenne
    expect(mutated.root.children[5].children[0].statut).toBe('présence établie')
    expect(buildMergeTree({ domains: 'x' })).toBeNull()
    expect(buildMergeTree(null)).toBeNull()
  })
})

// --- Mise en page ------------------------------------------------------------

describe('UC-VIS-01 — bibliothèque sunburst : mise en page des secteurs', () => {
  it('UC-VIS-01-U22 — layoutSunburst (merge 3 jours, 400 px) : anneaux, ordre d’émission, angles ∝ points de -90° à 270°, rayon coloré = niveau, 5 bandes grises par compétence', () => {
    const tree = buildMergeTree(mergeFixture)
    const layout = layoutSunburst(tree, { size: 400 })
    expect([layout.cx, layout.cy, layout.innerRadius, layout.maxRadius, layout.ringWidth, layout.maxDepth]).toEqual([200, 200, 32, 192, 80, 2])
    // 7 pôles + 10 compétences × (5 bandes grises + 1 secteur coloré).
    expect(layout.sectors).toHaveLength(7 + 10 * 6)
    // Ordre d'émission de l'original : le pôle, puis pour chacune de ses compétences 5 gris et le secteur coloré.
    expect(layout.sectors.slice(0, 7).map((s) => s.meta.kind)).toEqual(['pole', 'gray', 'gray', 'gray', 'gray', 'gray', 'competence'])

    const poles = layout.sectors.filter((s) => s.meta.kind === 'pole')
    expect(poles.map((s) => s.meta.id)).toEqual(mergeFixture.domains.map((d) => d.id))
    const poleGeo = poles.map((s) => parseSector(s.d, 200, 200))
    // Anneau des pôles : 32 → 112 ; étendue ∝ points (COEUR : 4/14 du cercle) ; secteurs jointifs depuis -90°.
    for (const g of poleGeo) expect([g.rIn, g.rOut]).toEqual([32, 112])
    expect(poleGeo[0].start).toBeCloseTo(-90, 9)
    poleGeo.forEach((g, i) => {
      expect(g.span).toBeCloseTo((tree.root.children[i].points / 14) * 360, 9)
      if (i > 0) expect(g.start).toBeCloseTo(poleGeo[i - 1].end, 9)
    })
    expect(poleGeo.reduce((sum, g) => sum + g.span, 0)).toBeCloseTo(360, 9)
    expect(poles.map((s) => [s.fill, s.fillOpacity, s.stroke])).toEqual(mergeFixture.domains.map((d) => [d.color, '0.8', '#fff']))

    // Secteur coloré d'une compétence : 112 → 112 + 80 × facteur du niveau ; métadonnées d'interaction.
    const coloured = layout.sectors.filter((s) => s.meta.kind === 'competence')
    expect(coloured).toHaveLength(10)
    for (const s of coloured) {
      const comp = mergeFixture.domains.flatMap((d) => d.competences).find((c) => c.code === s.meta.code)
      const g = parseSector(s.d, 200, 200)
      expect([s.meta.code, g.rIn, g.rOut]).toEqual([comp.code, 112, expect.closeTo(112 + 80 * NIVEAUX[comp.niveau].radiusFactor, 9)])
      expect(s.meta).toMatchObject({ id: comp.id, niveau: comp.niveau, domainId: mergeFixture.domains.find((d) => d.competences.includes(comp)).id })
      expect([s.class, s.fillOpacity, s.stroke, s.strokeDasharray]).toEqual(['sector', '1', '#fff', undefined])
    }
    const radius = (code) => parseSector(coloured.find((s) => s.meta.code === code).d, 200, 200).rOut
    expect(radius('2.01')).toBe(192) // niveau 5 : anneau plein
    expect(radius('1.01')).toBe(128) // niveau 1 : un cinquième

    // Bandes grises : 5 par compétence, jointives de 112 à 192, du noir au gris clair, non interactives.
    const grays = layout.sectors.filter((s) => s.meta.kind === 'gray' && s.meta.code === '2.01')
    expect(grays.map((s) => s.fill)).toEqual(Object.values(GRAY_LEVELS))
    expect(grays.map((s) => { const g = parseSector(s.d, 200, 200); return [g.rIn, g.rOut] })).toEqual([
      [112, 128], [128, 144], [144, 160], [160, 176], [176, 192],
    ])
    expect(grays.every((s) => s.class === 'gray-sector' && s.fillOpacity === '0.4')).toBe(true)
    // La compétence et ses bandes grises partagent exactement la même ouverture angulaire.
    const c201 = parseSector(coloured.find((s) => s.meta.code === '2.01').d, 200, 200)
    for (const s of grays) expect(parseSector(s.d, 200, 200).span).toBeCloseTo(c201.span, 9)

    // Arbre absent ou taille nulle : aucun secteur.
    expect(layoutSunburst(null).sectors).toEqual([])
    expect(layoutSunburst(tree, { size: 0 }).sectors).toEqual([])
    // La taille met tout à l'échelle (rayons proportionnels).
    const big = layoutSunburst(tree, { size: 800 })
    expect([big.innerRadius, big.maxRadius, big.ringWidth]).toEqual([64, 384, 160])
  })

  it('UC-VIS-01-U23 — layoutSunburst (journée du 7 janvier) : renvoi hachuré à rayon réduit (0,35), longueur du secteur = quintile de confiance ; compétence orpheline du merge en pointillés', () => {
    const { tree } = buildDayTree(FIXTURE_DAYS['2026-01-07'], referentielDoc)
    const layout = layoutSunburst(tree, { size: 400 })
    // 7 pôles + 1 renvoi (sans gris) + 6 présences établies × 6.
    expect(layout.sectors).toHaveLength(7 + 1 + 6 * 6)

    const renvoi = layout.sectors.filter((s) => s.class === 'renvoi-sector')
    expect(renvoi).toHaveLength(1)
    expect(renvoi[0]).toMatchObject({
      fill: 'url(#hatch)',
      stroke: '#2563eb', // couleur du pôle TETE
      strokeWidth: '1',
      strokeDasharray: '4,3',
      fillOpacity: '0.6',
      meta: { kind: 'competence', code: '1.01', niveau: -1, domainId: 'TETE — Penser & Comprendre' },
    })
    const rg = parseSector(renvoi[0].d, 200, 200)
    expect([rg.rIn, rg.rOut]).toEqual([112, expect.closeTo(112 + 80 * RENVOI_RADIUS_FACTOR, 9)])
    expect(layout.sectors.some((s) => s.meta.kind === 'gray' && s.meta.code === '1.01')).toBe(false)

    // Longueur = quintile de la confiance du verdict.
    const outer = (code) => parseSector(layout.sectors.find((s) => s.meta.kind === 'competence' && s.meta.code === code).d, 200, 200).rOut
    expect(outer('7.01')).toBeCloseTo(192, 9) // 0.80 → Excellence
    expect(outer('2.01')).toBeCloseTo(176, 9) // 0.78 → Expertise
    expect(outer('4.05')).toBeCloseTo(160, 9) // 0.58 → Maîtrise
    // Largeur : le pôle COEUR (seule feuille 2.01, 5 points sur 20) occupe un quart du cercle.
    const coeur = layout.sectors.find((s) => s.meta.kind === 'pole' && s.meta.id === 'COEUR — Relier & Naviguer')
    expect(parseSector(coeur.d, 200, 200).span).toBeCloseTo(90, 9)

    // Merge : une compétence « orpheline » (émergente) est translucide et en pointillés.
    const doc = structuredClone(mergeFixture)
    doc.domains[1].competences[1].statut = 'orpheline'
    const orphan = layoutSunburst(buildMergeTree(doc), { size: 400 }).sectors.find((s) => s.meta.kind === 'competence' && s.meta.code === '2.06')
    expect([orphan.fillOpacity, orphan.strokeDasharray]).toEqual(['0.7', '3,2'])
  })

  it('UC-VIS-01-U24 — API publique (index.js) : les vues reçoivent exactement la géométrie, les constructeurs d’arbres et la mise en page ; sans injection, useSunburstLib la fournit via loadSunburstLib', async () => {
    expect(Object.keys(realLib).sort()).toEqual([
      'GRAY_LEVELS', 'NIVEAUX', 'RENVOI_RADIUS_FACTOR', 'buildDayTree', 'buildMergeTree',
      'confidenceQuintile', 'createSectorPath', 'getMaxDepth', 'layoutSunburst',
    ])
    expect(realLib.createSectorPath).toBe(geometry.createSectorPath)
    expect(realLib.buildDayTree).toBe(buildTree.buildDayTree)
    expect(realLib.layoutSunburst).toBe(layoutModule.layoutSunburst)
    // crCos / crSin restent internes à la géométrie.
    expect(realLib.crCos).toBeUndefined()
    // loadSunburstLib fournit CETTE bibliothèque…
    const loaded = await loadSunburstLib()
    expect(loaded.buildMergeTree).toBe(realLib.buildMergeTree)
    expect(loaded.layoutSunburst).toBe(realLib.layoutSunburst)
    // … et c'est elle que reçoivent les vues sans module injecté (hook de DayView / MergeView).
    const { result } = renderHook(() => useSunburstLib(undefined))
    expect(result.current).toEqual({ lib: null, error: null }) // chargement en cours
    await waitFor(() => expect(result.current.lib).not.toBeNull())
    expect(result.current.error).toBeNull()
    expect(result.current.lib.buildDayTree).toBe(realLib.buildDayTree)
    expect(result.current.lib.buildMergeTree).toBe(realLib.buildMergeTree)
    expect(result.current.lib.layoutSunburst).toBe(realLib.layoutSunburst)
  })
})

// --- Lecteur de construction (TimelinePlayer) --------------------------------

const FEUILLES = mergeFixture.feuilles
const EVOLUTION = mergeFixture.profilMeta.evolution_globale

/** Hôte contrôlé, comme MergeView : la trame vit chez le parent. */
function Host({ initial = 0, suspended = false, onChange, cumulative, feuilles = FEUILLES }) {
  const [frameIndex, setFrameIndex] = useState(initial)
  return (
    <TimelinePlayer
      feuilles={feuilles}
      frameIndex={frameIndex}
      onFrameChange={(i) => {
        setFrameIndex(i)
        onChange?.(i)
      }}
      evolution={EVOLUTION}
      cumulative={cumulative ?? cumulativeCounts(mergeFixture)}
      suspended={suspended}
    />
  )
}

const playButton = () => screen.getByRole('button', { name: /Lancer la lecture|Mettre la lecture en pause/ })
const slider = () => screen.getByRole('slider', { name: 'Position dans les feuilles du portfolio' })
const liveRegion = () => document.querySelector('.timeline-player [aria-live="polite"]')
const status = () => document.querySelector('.timeline-date').textContent

/** matchMedia simulé : seule la requête prefers-reduced-motion est pilotée ; `set(v)` émet « change ». */
function stubReducedMotion(initial) {
  const listeners = new Set()
  let matches = initial
  window.matchMedia = vi.fn((query) => ({
    media: query,
    get matches() {
      return query === '(prefers-reduced-motion: reduce)' ? matches : false
    },
    addEventListener: (type, fn) => type === 'change' && query === '(prefers-reduced-motion: reduce)' && listeners.add(fn),
    removeEventListener: (type, fn) => listeners.delete(fn),
  }))
  return {
    set(value) {
      matches = value
      act(() => listeners.forEach((fn) => fn({ matches: value })))
    },
  }
}

describe('UC-VIS-01 — lecteur de construction de la vue chronologique (TimelinePlayer, faux minuteurs)', () => {
  it('UC-VIS-01-U25 — lecture automatique (vitesse par défaut « Normale », 400 ms) : une feuille par tick, compteur cumulé, arrêt et annonce en fin de lecture ; relancer depuis la fin repart de la première feuille', () => {
    vi.useFakeTimers()
    expect(cumulativeCounts(mergeFixture)).toEqual([4, 7, 10])
    const onChange = vi.fn()
    render(<Host initial={0} onChange={onChange} />)
    expect(screen.getByRole('combobox', { name: 'Vitesse de lecture' }).value).toBe('400')
    expect(status()).toBe('Feuille 1 / 3 — 05/01/2026')
    expect(screen.getByTestId('timeline-counter').textContent).toBe('4 compétences sur la carte · score du jour 6')

    fireEvent.click(playButton())
    expect(playButton().getAttribute('aria-pressed')).toBe('true')
    expect(playButton().getAttribute('aria-label')).toBe('Mettre la lecture en pause')
    act(() => vi.advanceTimersByTime(399))
    expect(onChange).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(1))
    expect(onChange).toHaveBeenLastCalledWith(1)
    expect(status()).toBe('Feuille 2 / 3 — 06/01/2026')
    expect(slider().getAttribute('aria-valuetext')).toBe('06/01/2026')
    expect(screen.getByTestId('timeline-counter').textContent).toBe('7 compétences sur la carte · score du jour 6')
    expect(liveRegion().textContent).toBe('') // jamais d'annonce à chaque tick
    // La région annoncée est masquée visuellement (classe CSS ; masquage à l'écran non vérifiable sous jsdom).
    expect(liveRegion().className).toBe('timeline-sr-only')
    expect(liveRegion().getAttribute('role')).toBe('status')

    act(() => vi.advanceTimersByTime(400))
    expect(status()).toBe('Feuille 3 / 3 — 07/01/2026')
    expect(screen.getByTestId('timeline-counter').textContent).toBe('10 compétences sur la carte · score du jour 11')
    // Dernière feuille atteinte : la lecture s'arrête d'elle-même et l'annonce.
    expect(playButton().getAttribute('aria-pressed')).toBe('false')
    expect(liveRegion().textContent).toBe('Fin de la lecture : 07/01/2026 — 10 compétences sur la carte')
    act(() => vi.advanceTimersByTime(5000))
    expect(onChange).toHaveBeenCalledTimes(2)

    // Relancer depuis la dernière feuille : retour immédiat à la première, puis lecture.
    fireEvent.click(playButton())
    expect(onChange).toHaveBeenLastCalledWith(0)
    act(() => vi.advanceTimersByTime(400))
    expect(onChange).toHaveBeenLastCalledWith(1)
  })

  it('UC-VIS-01-U26 — vitesses SPEEDS : Rapide 150 ms, Normale 400 ms, Lente 800 ms par feuille ; changer de vitesse en cours de lecture repart d’un tick complet à la nouvelle cadence', () => {
    vi.useFakeTimers()
    expect(SPEEDS).toEqual([
      { ms: 150, label: 'Rapide' },
      { ms: 400, label: 'Normale' },
      { ms: 800, label: 'Lente' },
    ])
    for (const { ms, label } of SPEEDS) {
      const onChange = vi.fn()
      render(<Host initial={0} onChange={onChange} />)
      const select = screen.getByRole('combobox', { name: 'Vitesse de lecture' })
      expect([...select.options].map((o) => o.textContent)).toEqual(['Rapide (150 ms/feuille)', 'Normale (400 ms/feuille)', 'Lente (800 ms/feuille)'])
      fireEvent.change(select, { target: { value: String(ms) } })
      expect(select.selectedOptions[0].textContent).toBe(`${label} (${ms} ms/feuille)`)
      fireEvent.click(playButton())
      act(() => vi.advanceTimersByTime(ms - 1))
      expect([label, onChange.mock.calls.length]).toEqual([label, 0])
      act(() => vi.advanceTimersByTime(1))
      expect([label, onChange.mock.calls.length]).toEqual([label, 1])
      cleanup()
    }

    // Changement de vitesse pendant la lecture : le minuteur est recréé.
    const onChange = vi.fn()
    render(<Host initial={0} onChange={onChange} />)
    fireEvent.change(screen.getByRole('combobox', { name: 'Vitesse de lecture' }), { target: { value: '800' } })
    fireEvent.click(playButton())
    act(() => vi.advanceTimersByTime(500))
    fireEvent.change(screen.getByRole('combobox', { name: 'Vitesse de lecture' }), { target: { value: '150' } })
    act(() => vi.advanceTimersByTime(149))
    expect(onChange).not.toHaveBeenCalled() // les 500 ms déjà écoulées ne comptent pas
    act(() => vi.advanceTimersByTime(1))
    expect(onChange).toHaveBeenLastCalledWith(1)
  })

  it('UC-VIS-01-U27 — pause (bouton ou secteur sélectionné par le parent), scrubber et pas à pas : la lecture s’arrête ; l’annonce polie donne la feuille et le cumul à chaque déplacement manuel et à la pause par le bouton, pas à la pause imposée par le parent', () => {
    vi.useFakeTimers()
    const onChange = vi.fn()
    const { rerender } = render(<Host initial={0} onChange={onChange} />)

    // Pause par le bouton.
    fireEvent.click(playButton())
    act(() => vi.advanceTimersByTime(400))
    fireEvent.click(playButton())
    expect(playButton().getAttribute('aria-pressed')).toBe('false')
    expect(liveRegion().textContent).toBe('Pause : 06/01/2026 — 7 compétences sur la carte')
    act(() => vi.advanceTimersByTime(5000))
    expect(onChange).toHaveBeenCalledTimes(1)

    // Scrubber : déplace, met en pause, annonce la feuille (aria-valuetext = libellé, pas un %).
    fireEvent.click(playButton())
    fireEvent.change(slider(), { target: { value: '0' } })
    expect(playButton().getAttribute('aria-pressed')).toBe('false')
    expect([slider().value, slider().max, slider().getAttribute('aria-valuetext')]).toEqual(['0', '2', '05/01/2026'])
    expect(liveRegion().textContent).toBe('05/01/2026 — 4 compétences sur la carte')
    act(() => vi.advanceTimersByTime(5000))
    expect(onChange).toHaveBeenLastCalledWith(0)

    // Pas à pas borné ; chaque déplacement manuel est annoncé.
    fireEvent.click(screen.getByRole('button', { name: 'Feuille précédente' }))
    expect(slider().value).toBe('0')
    fireEvent.click(screen.getByRole('button', { name: 'Dernière feuille' }))
    expect(liveRegion().textContent).toBe('07/01/2026 — 10 compétences sur la carte')
    fireEvent.click(screen.getByRole('button', { name: 'Feuille suivante' }))
    expect(slider().value).toBe('2')
    fireEvent.click(screen.getByRole('button', { name: 'Première feuille' }))
    expect(liveRegion().textContent).toBe('05/01/2026 — 4 compétences sur la carte')
    fireEvent.click(screen.getByRole('button', { name: 'Feuille suivante' }))
    expect(status()).toBe('Feuille 2 / 3 — 06/01/2026')
    expect(liveRegion().textContent).toBe('06/01/2026 — 7 compétences sur la carte')

    // Pause imposée par le parent (secteur sélectionné ou survolé) : arrêt, et « Lecture » refusée.
    fireEvent.click(playButton())
    expect(playButton().getAttribute('aria-pressed')).toBe('true')
    rerender(<Host initial={0} onChange={onChange} suspended />)
    expect(playButton().getAttribute('aria-pressed')).toBe('false')
    // Cette pause-là n'est pas annoncée : la région garde la dernière annonce.
    expect(liveRegion().textContent).toBe('06/01/2026 — 7 compétences sur la carte')
    const calls = onChange.mock.calls.length
    act(() => vi.advanceTimersByTime(5000))
    fireEvent.click(playButton())
    act(() => vi.advanceTimersByTime(5000))
    expect(playButton().getAttribute('aria-pressed')).toBe('false')
    expect(onChange).toHaveBeenCalledTimes(calls)

    // Moins de deux feuilles : pas de lecteur.
    cleanup()
    const { container } = render(<Host feuilles={FEUILLES.slice(0, 1)} />)
    expect(container.innerHTML).toBe('')
  })

  // La seconde moitié de ce test FIGE un comportement ACTUEL (anomalie AN4 de
  // la fiche) : quand la préférence « mouvement réduit » s'active PENDANT une
  // lecture, le minuteur s'arrête mais l'état « en lecture » est conservé
  // (bouton désactivé mais aria-pressed="true", libellé « Mettre la lecture en
  // pause ») et la lecture reprend seule si la préférence est levée. À
  // inverser quand l'activation de la préférence mettra la lecture en pause.
  it('UC-VIS-01-U28 — prefers-reduced-motion : lecture automatique désactivée (bouton inactif et expliqué), navigation manuelle conservée ; [comportement actuel, anomalie AN4] activée en cours de lecture, l’état « en lecture » persiste', () => {
    vi.useFakeTimers()
    stubReducedMotion(true)
    const onChange = vi.fn()
    render(<Host initial={0} onChange={onChange} />)
    expect(playButton().disabled).toBe(true)
    expect(playButton().getAttribute('title')).toBe('Lecture automatique désactivée (préférence système : mouvement réduit)')
    fireEvent.click(playButton())
    act(() => vi.advanceTimersByTime(5000))
    expect(onChange).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Feuille suivante' }))
    expect(onChange).toHaveBeenLastCalledWith(1)
    fireEvent.change(slider(), { target: { value: '2' } })
    expect(status()).toBe('Feuille 3 / 3 — 07/01/2026')
    cleanup()

    // Préférence qui change en cours de lecture (événement « change » du media query).
    const media = stubReducedMotion(false)
    const onChange2 = vi.fn()
    render(<Host initial={0} onChange={onChange2} />)
    expect(playButton().disabled).toBe(false)
    fireEvent.click(playButton())
    act(() => vi.advanceTimersByTime(400))
    expect(onChange2).toHaveBeenCalledTimes(1)
    media.set(true)
    expect(playButton().disabled).toBe(true)
    act(() => vi.advanceTimersByTime(5000))
    expect(onChange2).toHaveBeenCalledTimes(1) // plus aucun tick…
    // … mais l'état « en lecture » est conservé (attendu : pause).
    expect(playButton().getAttribute('aria-pressed')).toBe('true')
    expect(playButton().getAttribute('aria-label')).toBe('Mettre la lecture en pause')
    // Préférence levée : la lecture reprend d'elle-même, sans action du visiteur.
    media.set(false)
    act(() => vi.advanceTimersByTime(400))
    expect(onChange2).toHaveBeenLastCalledWith(2)
  })
})

// --- Vue journée : panneau d'un pôle ------------------------------------------

describe('UC-VIS-01 — vue journée : panneau d’un pôle (vraie bibliothèque)', () => {
  // Le panneau d'un PÔLE n'est atteignable qu'avec un poleNum NUMÉRIQUE, hors
  // schéma (anomalie AN1 : sur un document conforme, findDayNode ne résout pas
  // le pôle — figé par U17 et F17). Ce test exerce le RENDU du panneau
  // (audit, rapport, passages saillants), qui s'affichera tel quel une fois
  // AN1 corrigée.
  it('UC-VIS-01-U29 — DayView, pôle sélectionné (poleNum numérique, hors schéma — AN1) : audit du pôle, portrait, territoires denses et non visités, émergences, pistes, passages saillants', async () => {
    const numeric = structuredClone(FIXTURE_DAYS['2026-01-07'])
    for (const pole of numeric.poles) pole.poleNum = Number(pole.poleNum)
    render(<DayView date="2026-01-07" referentiel={referentielDoc} getDay={async () => numeric} lib={realLib} />)
    const svg = await screen.findByRole('group', { name: 'Cartographie de la journée du 07/01/2026' })

    fireEvent.click(within(svg).getByRole('button', { name: 'COEUR — Relier & Naviguer' }))
    expect(screen.getByRole('heading', { level: 2, name: 'COEUR — Relier & Naviguer' })).toBeDefined()
    expect(document.querySelector('.details-description').textContent).toBe(
      '1 présence(s) établie(s), 0 renvoi(s), 2 non établie(s), 2 court-circuit(s).',
    )
    const rapport = document.querySelector('.pole-rapport')
    expect([...rapport.querySelectorAll('h3')].map((h) => h.textContent)).toEqual(['Territoires denses', 'Territoires non visités', 'Émergences', 'Pistes'])
    const pole = numeric.poles[1]
    expect(rapport.querySelector('p').textContent).toBe(pole.rapport.portraitPole)
    expect(rapport.querySelector('ul li').textContent).toBe(
      `${pole.rapport.territoiresDenses[0].competence} — ${pole.rapport.territoiresDenses[0].description}`,
    )
    expect(rapport.textContent).toContain(pole.rapport.territoiresNonVisites)
    expect(rapport.textContent).toContain(pole.rapport.emergencesPole)
    expect([...rapport.querySelectorAll('ul')].at(-1).textContent).toBe(pole.rapport.pistes[0])
    const passages = screen.getByTestId('passages')
    expect(passages.querySelector('summary').textContent).toBe('Passages saillants (3)')
    expect([...passages.querySelectorAll('li')].map((li) => li.textContent)).toEqual(
      pole.passagesSaillants.map((p) => `« ${p.extraitVerbatim} » — ${p.contexte}`),
    )

    // Un pôle sans rapport rédigé : audit et passages seulement.
    fireEvent.click(within(svg).getByRole('button', { name: 'TETE — Penser & Comprendre' }))
    expect(document.querySelector('.details-description').textContent).toBe(
      '0 présence(s) établie(s), 1 renvoi(s), 1 non établie(s), 1 court-circuit(s).',
    )
    expect(document.querySelector('.pole-rapport')).toBeNull()
    expect(screen.getByTestId('passages').querySelector('summary').textContent).toBe('Passages saillants (1)')
    // Aucun verdict de compétence dans le panneau d'un pôle.
    expect(screen.queryByTestId('verdict-block')).toBeNull()
  })
})
