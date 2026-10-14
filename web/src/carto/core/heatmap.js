// Interface ultime — heatmap et calendrier (spec §5.7, §5.8).
//
// Valeur d'une journée : VOLUME DU PORTFOLIO du jour (caractères). Repli quand
// aucun portfolio n'a été importé : somme des poids des traces du jour. Le
// mode est choisi pour TOUT le jeu de données (on ne mélange jamais des
// caractères et des poids dans les mêmes quantiles).
//
// Couleur : cinq niveaux par quantiles des journées DE LA PERSONNE dans la
// période affichée (ipsatif). Le silence est une donnée, pas un zéro : une
// journée sans rien est une case vide (niveau 0), distincte d'une journée à
// intensité faible (niveau 1). Teinte de la famille si une seule famille est
// observée ce jour-là (comportement V3), teinte neutre sinon. Aucune couleur
// de verdict.

import { contributingVariant, hasAnalysis, hasPortfolio } from './model.js'
import { TRACE_PROVIDING_STATUSES, resolveParams, traceWeight } from './formulas.js'
import { addDays, eachDay, mondayOf, monthKey, monthName, schoolYearOf, weekdayIndex } from './dates.js'

export const HEATMAP_LEVELS = 5

/** 'volume' si au moins une journée a un portfolio, sinon 'weights'. */
export function heatmapValueMode(dataset) {
  return dataset.days.some((d) => hasPortfolio(d)) ? 'volume' : 'weights'
}

/** Somme des poids des traces de la variante qui contribue. */
export function dayWeightSum(day, params) {
  const p = resolveParams(params)
  const v = contributingVariant(day)
  if (!v) return 0
  let sum = 0
  for (const verdict of v.verdicts) {
    if (verdict.courtCircuit || !TRACE_PROVIDING_STATUSES.has(verdict.status)) continue
    for (const t of verdict.traces ?? []) sum += traceWeight(t.role, p)
  }
  return sum
}

/** Pôles observés (au moins une trace) dans la variante qui contribue. */
export function dayPoles(day, ref) {
  const out = new Set()
  const v = contributingVariant(day)
  if (!v) return out
  for (const verdict of v.verdicts) {
    if (verdict.courtCircuit || !TRACE_PROVIDING_STATUSES.has(verdict.status)) continue
    if (!verdict.traces?.length) continue
    const c = ref.compByCode.get(verdict.code)
    if (c) out.add(c.pole)
  }
  return out
}

/** Codes observés (au moins une trace) dans la variante qui contribue. */
export function dayCodes(day) {
  const out = new Set()
  const v = contributingVariant(day)
  if (!v) return out
  for (const verdict of v.verdicts) {
    if (verdict.courtCircuit || !TRACE_PROVIDING_STATUSES.has(verdict.status)) continue
    if (verdict.traces?.length) out.add(verdict.code)
  }
  return out
}

/**
 * Journées (cochées ou non) où une compétence est observée — pour « allumer »
 * la heatmap au clic sur une compétence (§6.1).
 * @returns {Set<string>}
 */
export function datesObserving(dataset, code) {
  const out = new Set()
  for (const d of dataset.days) if (dayCodes(d).has(code)) out.add(d.date)
  return out
}

/**
 * Quantile (interpolation linéaire, type 7) d'une liste TRIÉE.
 * @param {number[]} sorted @param {number} q ∈ [0 ; 1]
 */
export function quantile(sorted, q) {
  if (sorted.length === 0) return 0
  const pos = (sorted.length - 1) * q
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo)
}

/**
 * Seuils ipsatifs des niveaux 1..5 (aux quantiles 20/40/60/80 %).
 * @param {number[]} values valeurs > 0 des journées de la période
 */
export function levelThresholds(values) {
  const sorted = [...values].filter((v) => v > 0).sort((a, b) => a - b)
  return [0.2, 0.4, 0.6, 0.8].map((q) => quantile(sorted, q))
}

/** Niveau 1..5 d'une valeur (> 0) selon les seuils ; 1 pour une valeur nulle mais documentée. */
export function levelOf(value, thresholds) {
  if (!(value > 0)) return 1
  let level = 1
  for (const t of thresholds) if (value > t) level++
  return Math.min(HEATMAP_LEVELS, level)
}

/**
 * Modèle de la heatmap pour une période.
 *
 * @param {object} dataset
 * @param {{ref: object, period: {from: string, to: string}, selected?: Set<string> | null, params?: object}} opts
 *   selected = ensemble actif S (null = journées cochées)
 * @returns {{
 *   mode: 'volume'|'weights',
 *   thresholds: number[],
 *   cells: Map<string, {date: string, value: number, level: number, active: boolean, hasAnalysis: boolean,
 *     hasPortfolio: boolean, analysisWithoutPortfolio: boolean, poles: number[], tint: string | null}>,
 * }}
 */
export function buildHeatmap(dataset, { ref, period, selected = null, params } = {}) {
  const mode = heatmapValueMode(dataset)
  const active = selected ?? new Set(dataset.days.filter((d) => d.active).map((d) => d.date))
  const inPeriod = dataset.days.filter((d) => d.date >= period.from && d.date <= period.to)
  const valueOf = (d) => (mode === 'volume' ? d.portfolio?.chars ?? 0 : dayWeightSum(d, params))
  const thresholds = levelThresholds(inPeriod.map(valueOf))
  const cells = new Map()
  for (const d of inPeriod) {
    const analysis = hasAnalysis(d)
    const portfolio = hasPortfolio(d)
    const documented = mode === 'volume' ? portfolio || analysis : analysis
    const value = valueOf(d)
    const poles = [...dayPoles(d, ref)].sort((a, b) => a - b)
    cells.set(d.date, {
      date: d.date,
      value,
      // En mode volume, une analyse sans portfolio reste une case documentée
      // (signalée) mais n'a pas de volume : niveau 1, jamais « silence ».
      level: documented ? levelOf(value, thresholds) : 0,
      active: active.has(d.date),
      hasAnalysis: analysis,
      hasPortfolio: portfolio,
      analysisWithoutPortfolio: mode === 'volume' && analysis && !portfolio,
      poles,
      tint: poles.length === 1 ? ref.poleByNum.get(poles[0])?.color ?? null : null,
    })
  }
  return { mode, thresholds, cells }
}

/**
 * Grille calendaire d'une période : colonnes par semaine (lundi premier),
 * mois étiquetés (§5.8).
 *
 * @param {{from: string, to: string}} period
 * @returns {{
 *   weeks: Array<{monday: string, days: Array<string | null>}>,
 *   months: Array<{key: string, label: string, week: number}>,
 * }}
 */
export function calendarGrid({ from, to }) {
  const weeks = []
  const months = []
  if (to < from) return { weeks, months }
  let monday = mondayOf(from)
  const seenMonths = new Set()
  while (monday <= to) {
    const days = []
    for (let i = 0; i < 7; i++) {
      const d = addDays(monday, i)
      days.push(d >= from && d <= to ? d : null)
    }
    for (const d of days) {
      if (d && !seenMonths.has(monthKey(d))) {
        seenMonths.add(monthKey(d))
        months.push({ key: monthKey(d), label: monthName(d, { short: true }), week: weeks.length })
      }
    }
    weeks.push({ monday, days })
    monday = addDays(monday, 7)
  }
  return { weeks, months }
}

/**
 * Bandes empilées d'une période longue (§5.8 « plusieurs années empilées ») :
 * une bande par année scolaire (mode scolaire) ou par année civile (mode
 * libre), chacune coupée à la période.
 * @param {{from: string, to: string}} period
 * @param {'school'|'free'} mode
 * @returns {Array<{from: string, to: string, label: string}>}
 */
export function periodBands(period, mode) {
  const bands = []
  if (period.to < period.from) return bands
  let cursor = period.from
  while (cursor <= period.to) {
    let end
    let label
    if (mode === 'school') {
      const sy = schoolYearOf(cursor)
      end = sy.end
      label = sy.label
    } else {
      end = `${cursor.slice(0, 4)}-12-31`
      label = cursor.slice(0, 4)
    }
    const bandEnd = end < period.to ? end : period.to
    bands.push({ from: cursor, to: bandEnd, label })
    cursor = addDays(bandEnd, 1)
  }
  return bands
}

/**
 * Navigation clavier dans la grille (flèches ±1 jour, ±7 jours), bornée à la
 * période ; renvoie le jour cible ou le jour courant si hors période.
 */
export function moveFocus(current, key, { from, to }) {
  const delta = { ArrowLeft: -7, ArrowRight: 7, ArrowUp: -1, ArrowDown: 1, Home: null, End: null }[key]
  if (key === 'Home') return from
  if (key === 'End') return to
  if (delta === undefined || delta === null) return current
  const target = addDays(current, delta)
  return target < from || target > to ? current : target
}

/** Rang de la ligne (jour de la semaine, lundi = 0) d'un jour. */
export { weekdayIndex, eachDay }
