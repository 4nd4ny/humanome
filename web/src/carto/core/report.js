// Interface ultime — rapport imprimable (spec §11, point 3) : les données des
// pages, calculées sans React. Le rapport porte sur l'ensemble coché jusqu'à
// la date t, exactement ce que montre le soleil.

import { resolveSetDates } from './sets.js'
import { observationKey } from './model.js'

const sum = (xs) => xs.reduce((s, x) => s + x, 0)

/**
 * Pages 1 et 2 : période, ensemble, pôles, compétences et confiance cumulée.
 * @param {object} dataset
 * @param {object} state computeState(...) de l'ensemble coché jusqu'à t
 * @param {object} ref référentiel normalisé
 */
export function reportSummary(dataset, state, ref) {
  const active = dataset.days.filter((d) => d.active).map((d) => d.date)
  const activeKey = active.join(',')
  const named = (dataset.sets ?? []).find((s) => {
    try {
      return resolveSetDates(s, dataset).join(',') === activeKey
    } catch {
      return false
    }
  })
  const competencies = ref.competencies
    .filter((c) => state.competencies.has(c.code))
    .map((c) => {
      const s = state.competencies.get(c.code)
      return { code: c.code, name: c.name, pole: c.pole, share: s.theta / 360, confidence: s.confidence, proofs: s.proofs, hints: s.hints, days: s.days.length, status: s.status }
    })
  const poles = ref.poles
    .filter((p) => state.poles.has(p.num))
    .map((p) => {
      const s = state.poles.get(p.num)
      return { num: p.num, name: p.name, symbol: p.symbol, color: p.color, share: s.theta / 360, confidence: s.confidence, competencies: s.codes.length }
    })
  return {
    period: state.dates.length ? { from: state.dates[0], to: state.dates.at(-1) } : null,
    analysedDays: state.dates.length,
    activeDays: active.length,
    totalDays: dataset.days.length,
    setName: named?.name ?? null,
    competencies,
    poles,
    proofs: sum(competencies.map((c) => c.proofs)),
    hints: sum(competencies.map((c) => c.hints)),
    concentration: sum(
      competencies
        .map((c) => c.share)
        .sort((a, b) => b - a)
        .slice(0, 5),
    ),
  }
}

/**
 * Observations d'une compétence reprises dans les pages du jury : toutes ses
 * journées, ou la dernière seulement.
 * @param {object} dataset
 * @param {object} state
 * @param {string} code
 * @param {{scope?: 'last' | 'all'}} [opts]
 * @returns {Array<{date: string, variantId: string, verdict: object, key: string}>}
 */
export function reportObservations(dataset, state, code, { scope = 'last' } = {}) {
  const comp = state.competencies.get(code)
  if (!comp) return []
  const byDate = new Map(dataset.days.map((d) => [d.date, d]))
  const list = comp.verdicts.map((v) => {
    const variant = byDate.get(v.date)?.variants.find((x) => x.id === v.variantId)
    const verdict = variant?.verdicts.find((x) => x.code === code) ?? { ...v, code, courtCircuit: false, rawStatus: null }
    return { date: v.date, variantId: v.variantId, verdict, key: observationKey(v.date, v.variantId, code) }
  })
  return scope === 'all' ? list : list.slice(-1)
}

/**
 * Traces dont le rapport cite l'extrait : celles des journées reprises (la
 * dernière, ou toutes).
 */
export function reportTraces(dataset, state, code, { scope = 'last' } = {}) {
  const comp = state.competencies.get(code)
  if (!comp) return []
  if (scope === 'all') return comp.traces
  const days = new Set(reportObservations(dataset, state, code, { scope }).map((o) => o.date))
  return comp.traces.filter((t) => days.has(t.date))
}

/**
 * Journées dont le rapport a besoin (détails à charger) pour les compétences
 * choisies : celles des verdicts repris et, si les extraits sont inclus,
 * celles de leurs traces.
 */
export function reportDates(dataset, state, codes, { scope = 'last', extracts = true } = {}) {
  const out = new Set()
  for (const code of codes) {
    for (const o of reportObservations(dataset, state, code, { scope })) out.add(o.date)
    if (extracts) for (const t of reportTraces(dataset, state, code, { scope })) out.add(t.date)
  }
  return [...out].sort()
}
