// @vitest-environment node
// Import du corpus RÉEL déjà public du dépôt (assets-existants/merge-prototype :
// 59 journées Aurora v3, 2025-12-22 → 2026-03-29) — lecture seule.
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { importFiles, severityCounts } from './import.js'
import { createDataset, contributingVariant } from './model.js'
import { computeState, layoutSun } from './state.js'
import { normalizeReferential } from './referential.js'
import { buildHeatmap } from './heatmap.js'
import { ringGeometry } from './formulas.js'

const root = fileURLToPath(new URL('../../../../assets-existants/merge-prototype/extracted/', import.meta.url))
const referentialPath = fileURLToPath(new URL('../../../../web/public/data/referentiel/respire-v7.json', import.meta.url))
const available = existsSync(root) && existsSync(referentialPath)

describe.skipIf(!available)('corpus réel (59 journées Aurora v3)', () => {
  let result
  let ref

  it('importe les 59 journées sans élément bloquant', async () => {
    const files = []
    for (const date of readdirSync(root).sort()) {
      for (const name of readdirSync(`${root}${date}`)) files.push({ path: `${date}/${name}`, text: readFileSync(`${root}${date}/${name}`, 'utf8') })
    }
    const referential = JSON.parse(readFileSync(referentialPath, 'utf8'))
    const ds = createDataset({ datasetId: 'reel', title: 'Corpus réel', referential, now: '2026-10-13T00:00:00Z' })
    const t0 = performance.now()
    result = await importFiles(files, ds, { now: '2026-10-13T00:00:00Z' })
    const ms = performance.now() - t0
    ref = normalizeReferential(result.dataset.referential)
    expect(result.dataset.days).toHaveLength(59)
    expect(result.dataset.days[0].date).toBe('2025-12-22')
    expect(result.dataset.days[58].date).toBe('2026-03-29')
    expect(severityCounts(result.report).blocking).toBe(0)
    expect(ms).toBeLessThan(15000)
    // Chaque journée a exactement une variante, active ; 61 verdicts au plus
    // (une journée du corpus n'en porte que 52).
    for (const d of result.dataset.days) {
      expect(d.variants).toHaveLength(1)
      expect(contributingVariant(d).verdicts.length).toBeGreaterThan(50)
      expect(contributingVariant(d).verdicts.length).toBeLessThanOrEqual(61)
    }
  })

  it('l’état complet est cohérent : somme des angles 360°, sept pôles, confiances dans [0 ; 1]', () => {
    const state = computeState(result.dataset, { ref })
    expect(state.poles.size).toBe(7)
    const total = [...state.competencies.values()].reduce((s, c) => s + c.theta, 0)
    expect(total).toBeCloseTo(360, 6)
    for (const c of state.competencies.values()) {
      expect(c.confidence).toBeGreaterThanOrEqual(0)
      expect(c.confidence).toBeLessThanOrEqual(1)
      expect(c.intensity).toBeGreaterThan(0)
      // Points : un par preuve, α par indice — la confiance n'y entre pas (D-8).
      expect(c.intensity).toBeCloseTo(c.proofs + 0.5 * c.hints, 6)
    }
    const layout = layoutSun(state, ref, ringGeometry({ outerRadius: 200, centerRadius: 24, gap: 4 }), { minThickness: 2 })
    expect(layout.competencies.at(-1).a1).toBeCloseTo(-Math.PI / 2 + 2 * Math.PI, 6)
  })

  it('D-8 : sur toute la période, l’angle distingue encore les compétences (plus de traces, plus d’angle)', () => {
    const state = computeState(result.dataset, { ref })
    const th = [...state.competencies.values()].map((c) => c.theta).sort((a, b) => a - b)
    const median = th[Math.floor((th.length - 1) / 2)]
    // Le cumul saturant donnait ici max = médiane = 6,6° : 52 compétences sur 56 au plafond.
    expect(th.at(-1)).toBeGreaterThan(3 * median)
    for (const c of state.competencies.values()) expect(c.theta / 360).toBeCloseTo(c.intensity / state.totalIntensity, 9)
    // Les secteurs trop étroits pour être vus sont élargis au dessin, et signalés.
    const layout = layoutSun(state, ref, ringGeometry({ outerRadius: 200, centerRadius: 24, gap: 4 }), { minThickness: 2, minArc: 2 })
    const widened = layout.competencies.filter((c) => c.widened)
    expect(widened.length).toBeGreaterThan(0)
    expect(widened.every((c) => c.theta < 1)).toBe(true)
  })

  it('l’état à une date intermédiaire ne retient que les journées antérieures', () => {
    const state = computeState(result.dataset, { ref, until: '2026-01-31' })
    expect(state.dates.every((d) => d <= '2026-01-31')).toBe(true)
    expect(state.dates.length).toBeGreaterThan(10)
  })

  it('heatmap sans portfolio : repli sur les poids, une case documentée par journée', () => {
    const h = buildHeatmap(result.dataset, { ref, period: { from: '2025-08-01', to: '2026-07-31' } })
    expect(h.mode).toBe('weights')
    expect(h.cells.size).toBe(59)
    expect([...h.cells.values()].every((c) => c.level >= 1 && c.level <= 5)).toBe(true)
  })

  it('les traces du corpus sont presque toutes résolues vers un extrait', () => {
    let total = 0
    let resolved = 0
    for (const [, patch] of result.detailPatches) {
      for (const v of Object.values(patch.variants)) {
        for (const verdict of Object.values(v.verdicts)) {
          for (const t of Object.values(verdict.traces)) {
            total++
            if (t.resolved) resolved++
          }
        }
      }
    }
    expect(total).toBeGreaterThan(1000)
    expect(resolved / total).toBeGreaterThan(0.95)
  })
})
