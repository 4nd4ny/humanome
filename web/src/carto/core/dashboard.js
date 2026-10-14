// Interface ultime — tableau de bord des métriques (spec §10) : données de
// chaque carte, calculées à la volée, et disponibilité. Une carte dont les
// données manquent renvoie null : l'interface la masque seule (critère P4).
// Règles : valeur manquante ≠ 0, aucune comparaison à une autre personne,
// aucune norme ; les normalisations se font au sein de la personne.

import { daysBetween } from './dates.js'
import { hasAnalysis, hasPortfolio } from './model.js'
import { tracePoints } from './formulas.js'
import { STYLE_METRICS, lexicalDistance, lexicalProfile, styleMetrics } from './stylometry.js'
import { COGNITIVE_FUNCTIONS } from './importers/metrics.js'

export const DASHBOARD_CARDS = Object.freeze([
  { id: 'profile', label: 'Profil' },
  { id: 'rhythm', label: 'Rythme' },
  { id: 'phases', label: 'Phases et repères' },
  { id: 'constancy', label: 'Constance' },
  { id: 'moments', label: 'Moments remarquables' },
  { id: 'style', label: 'Style (local)' },
  { id: 'cognitive', label: 'Fonctions cognitives' },
  { id: 'lexical', label: 'Rupture lexicale' },
  { id: 'anomalies', label: 'Ruptures et anomalies d’import' },
])

/** Médiane d'une liste de nombres (null si vide). */
export function median(values) {
  const v = values.filter((x) => typeof x === 'number' && Number.isFinite(x)).sort((a, b) => a - b)
  if (v.length === 0) return null
  const m = Math.floor(v.length / 2)
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2
}

/** Profil : parts des pôles et des compétences, concentration (5 plus grandes parts). */
export function profileData(state, ref) {
  if (!state || state.competencies.size === 0) return null
  const comps = ref.competencies
    .filter((c) => state.competencies.has(c.code))
    .map((c) => {
      const s = state.competencies.get(c.code)
      return { code: c.code, pole: c.pole, share: s.theta / 360, proofs: s.proofs, hints: s.hints, confidence: s.confidence, days: s.days.length }
    })
  const poles = ref.poles.map((p) => ({ num: p.num, share: (state.poles.get(p.num)?.theta ?? 0) / 360 }))
  const concentration = [...comps].map((c) => c.share).sort((a, b) => b - a).slice(0, 5).reduce((s, x) => s + x, 0)
  return { comps, poles, concentration }
}

/** Rythme : volume du portfolio par jour (les jours sans texte n'ont pas de barre). */
export function rhythmData(dataset) {
  const days = dataset.days.filter(hasPortfolio).map((d) => ({ date: d.date, chars: d.portfolio.chars, words: d.portfolio.words ?? null }))
  if (days.length === 0) return null
  const words = days.map((d) => d.words).filter((w) => typeof w === 'number')
  return {
    days,
    from: days[0].date,
    to: days.at(-1).date,
    totalWords: words.reduce((s, w) => s + w, 0),
    medianWords: median(words),
    longest: [...days].sort((a, b) => b.chars - a.chars)[0],
    silences: Math.max(0, daysBetween(days[0].date, days.at(-1).date) + 1 - days.length),
  }
}

/** Phases et repères : la frise des journées et les marques posées par l'apprenant. */
export function phasesData(dataset) {
  if (dataset.days.length === 0) return null
  const markers = (dataset.markers ?? []).filter((m) => m.kind !== 'phase')
  const phases = (dataset.markers ?? []).filter((m) => m.kind === 'phase')
  return { from: dataset.days[0].date, to: dataset.days.at(-1).date, days: dataset.days.map((d) => d.date), markers, phases }
}

/**
 * Constance : pour chaque compétence observée, ses journées, l'intervalle
 * entre deux observations, et la trajectoire de ses points cumulés et de la
 * confiance du verdict de chaque jour.
 */
export function constancyData(state, ref) {
  if (!state || state.competencies.size === 0) return null
  const rows = []
  for (const c of ref.competencies) {
    const s = state.competencies.get(c.code)
    if (!s) continue
    const byDate = new Map()
    for (const t of s.traces) {
      if (!byDate.has(t.date)) byDate.set(t.date, { weights: [], confidence: t.confidence })
      byDate.get(t.date).weights.push(t.weight)
    }
    const dates = [...byDate.keys()].sort()
    const all = []
    const series = dates.map((date) => {
      all.push(...byDate.get(date).weights)
      return { date, intensity: tracePoints(all), confidence: byDate.get(date).confidence }
    })
    const gaps = dates.slice(1).map((d, i) => daysBetween(dates[i], d))
    rows.push({
      code: c.code,
      pole: c.pole,
      days: dates.length,
      first: dates[0],
      last: dates.at(-1),
      interval: gaps.length ? { mean: gaps.reduce((a, b) => a + b, 0) / gaps.length, min: Math.min(...gaps), max: Math.max(...gaps) } : null,
      series,
    })
  }
  return { rows, from: state.dates[0], to: state.dates.at(-1) }
}

/** Seuil de poids d'une trace selon la sensibilité 0–100 (pas de 5). */
export function sensitivityThreshold(s) {
  const x = Math.max(0, Math.min(100, Math.round(Number(s) / 5) * 5))
  return Math.round((0.9 - (0.6 * x) / 100) * 100) / 100
}

/** Libellé de la sensibilité (repères du PROTO miroir_demo). */
export function sensitivityLabel(s) {
  if (s < 35) return 'signaux forts seulement'
  if (s > 65) return 'signaux faibles inclus'
  return 'seuils par défaut'
}

/**
 * Moments remarquables : traces dont la force du signal (rôle × confiance du
 * verdict, `traceSignal` — distincte des points de l'angle) atteint le seuil
 * de la sensibilité, avec un extrait.
 * @param {Array<{id: string, date: string, code: string, role: string, confidence: number | null, weight: number, extract: string}>} items
 * @param {number} sensitivity 0..100
 */
export function selectMoments(items, sensitivity) {
  const threshold = sensitivityThreshold(sensitivity)
  return items
    .filter((m) => m.extract && m.weight >= threshold - 1e-9)
    .sort((a, b) => b.weight - a.weight || (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id < b.id ? -1 : 1))
}

/**
 * Style : mesures par jour (jours d'au moins `minWords` mots), normalisées
 * LIGNE PAR LIGNE au sein de la personne (min–max de ses propres journées).
 * @param {Map<string, string>} texts date → texte du portfolio
 */
export function styleData(texts, { minWords = 50 } = {}) {
  const per = new Map()
  for (const [date, text] of [...texts.entries()].sort()) {
    const m = styleMetrics(text)
    if (m.words >= minWords) per.set(date, m)
  }
  if (per.size < 2) return null
  const dates = [...per.keys()]
  const rows = STYLE_METRICS.map((def) => {
    const values = new Map(dates.map((d) => [d, per.get(d)[def.key]]))
    const nums = [...values.values()].filter((v) => typeof v === 'number')
    const min = nums.length ? Math.min(...nums) : null
    const max = nums.length ? Math.max(...nums) : null
    const norm = (v) => (typeof v !== 'number' ? null : max === min ? 0.5 : (v - min) / (max - min))
    return { ...def, values, norm, min, max, median: median(nums) }
  })
  return { dates, rows, words: new Map(dates.map((d) => [d, per.get(d).words])) }
}

/** Fonctions cognitives (fichier HumanoTwin importé). */
export function cognitiveData(metrics) {
  if (!metrics?.byDate) return null
  const dates = Object.keys(metrics.byDate).sort()
  const functions = COGNITIVE_FUNCTIONS.map((f) => ({
    ...f,
    points: dates.filter((d) => typeof metrics.byDate[d]?.[f.key] === 'number').map((d) => ({ date: d, value: metrics.byDate[d][f.key] })),
  })).filter((f) => f.points.length > 0)
  if (functions.length === 0) return null
  return { functions, from: dates[0], to: dates.at(-1), signatures: metrics.signatures ?? [], firstImpressions: metrics.firstImpressions ?? {} }
}

/** Rupture lexicale : distance entre journées écrites consécutives (sans seuil fixe). */
export function lexicalData(texts) {
  const dates = [...texts.keys()].sort()
  const profiles = new Map(dates.map((d) => [d, lexicalProfile(texts.get(d))]))
  const transitions = dates.slice(1).map((to, i) => {
    const from = dates[i]
    return { from, to, gapDays: daysBetween(from, to), distance: lexicalDistance(profiles.get(from), profiles.get(to)) }
  })
  const valued = transitions.filter((t) => t.distance !== null)
  if (valued.length < 2) return null
  return { transitions, median: median(valued.map((t) => t.distance)), from: dates[0], to: dates.at(-1) }
}

/** Ruptures et anomalies d'import : ce qui demande une action dans le gestionnaire. */
export function anomaliesData(dataset) {
  const pending = dataset.days.filter((d) => d.variantChoice === 'pending' && d.variants.length > 0).map((d) => d.date)
  const examine = dataset.days.filter((d) => d.variantChoice === 'examine').map((d) => d.date)
  const flagged = dataset.days
    .map((d) => ({ date: d.date, items: (d.anomalies ?? []).filter((a) => a.severity === 'blocking' || a.severity === 'arbitrate') }))
    .filter((x) => x.items.length > 0)
  const anyPortfolio = dataset.days.some(hasPortfolio)
  const analysisWithoutPortfolio = anyPortfolio ? dataset.days.filter((d) => hasAnalysis(d) && !hasPortfolio(d)).map((d) => d.date) : []
  const portfolioWithoutAnalysis = dataset.days.filter((d) => hasPortfolio(d) && !hasAnalysis(d)).map((d) => d.date)
  const undated = dataset.portfolio?.undated?.length ?? 0
  const noPortfolioAtAll = !anyPortfolio && dataset.days.length > 0
  const total = pending.length + examine.length + flagged.length + analysisWithoutPortfolio.length + portfolioWithoutAnalysis.length + undated + (noPortfolioAtAll ? 1 : 0)
  if (total === 0) return null
  return { pending, examine, flagged, analysisWithoutPortfolio, portfolioWithoutAnalysis, undated, noPortfolioAtAll }
}
