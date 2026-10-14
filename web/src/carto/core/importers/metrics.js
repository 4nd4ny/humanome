// Interface ultime — import d'un fichier de métriques (spec §3.4, §10) :
// format pivot `metrics[date][champ]` (empreinte_cognitive_integrale,
// HumanoTwin). Dates ISO ou « JJ.MM.AAAA » (converties), valeurs numériques.
// Une valeur manquante reste manquante (jamais 0, §10).

import { isIsoDate } from '../dates.js'

const FR_DATE = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/

function toIso(key) {
  if (isIsoDate(key)) return key
  const m = FR_DATE.exec(String(key).trim())
  if (!m) return null
  const iso = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  return isIsoDate(iso) ? iso : null
}

/** Les sept fonctions cognitives du Miroir (HumanoTwin) : libellés et couleurs fixes (couleur = fonction, §10). */
export const COGNITIVE_FUNCTIONS = Object.freeze([
  { key: 'metacognition', label: 'Métacognition', color: '#b45309' },
  { key: 'inhibition', label: 'Inhibition', color: '#b91c1c' },
  { key: 'flexibilite', label: 'Flexibilité', color: '#15803d' },
  { key: 'memoire_travail', label: 'Mémoire de travail', color: '#1d4ed8' },
  { key: 'pensee_dialectique', label: 'Pensée dialectique', color: '#7e22ce' },
  { key: 'attention_soutenue', label: 'Attention soutenue', color: '#0e7490' },
  { key: 'regulation_emotionnelle', label: 'Régulation émotionnelle', color: '#c2410c' },
])

/** Fichier « miroir » d'HumanoTwin (trajectoire par jour + signatures par sensibilité). */
export function looksLikeMirror(doc) {
  const t = doc?.trajectoire
  return Boolean(t && (Array.isArray(t.trajectoire) || Array.isArray(t)))
}

/** Le document ressemble-t-il à un fichier de métriques ? */
export function looksLikeMetrics(doc) {
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return false
  if (looksLikeMirror(doc)) return true
  if (doc.kind === 'carto-metrics' || (doc.metrics && typeof doc.metrics === 'object')) return true
  const keys = Object.keys(doc)
  return keys.length > 0 && keys.every((k) => toIso(k) !== null || k === 'aggregate') && keys.some((k) => toIso(k) !== null)
}

/**
 * @param {object} doc
 * @param {{fileName?: string}} [opts]
 * @returns {{metrics: {source: string, fields: Record<string, {label: string, unit?: string, group?: string}>, byDate: Record<string, Record<string, number>>}, report: Array<object>}}
 */
export function importMetrics(doc, { fileName = 'metrics.json' } = {}) {
  if (looksLikeMirror(doc)) return importMirror(doc, { fileName })
  const report = []
  const table = doc.kind === 'carto-metrics' || doc.metrics ? doc.metrics : doc
  const byDate = {}
  const fields = {}
  let ignored = 0
  for (const [key, row] of Object.entries(table ?? {})) {
    if (key === 'aggregate') continue
    const date = toIso(key)
    if (!date || !row || typeof row !== 'object') {
      ignored++
      continue
    }
    for (const [field, value] of Object.entries(row)) {
      const n = typeof value === 'string' ? Number(value.replace(',', '.')) : value
      if (typeof n !== 'number' || !Number.isFinite(n)) {
        ignored++
        continue
      }
      byDate[date] ??= {}
      byDate[date][field] = n
      fields[field] ??= { label: doc.fields?.[field]?.label ?? field, unit: doc.fields?.[field]?.unit, group: doc.fields?.[field]?.group }
    }
  }
  if (ignored > 0) report.push({ severity: 'warning', code: 'metriques-ignorees', message: `${fileName} : ${ignored} valeur(s) non numériques ou dates illisibles ignorées` })
  report.push({ severity: 'info', code: 'metriques', message: `${fileName} : ${Object.keys(byDate).length} journée(s), ${Object.keys(fields).length} champ(s)` })
  return { metrics: { source: doc.source ?? fileName, fields, byDate }, report }
}

const FUNCTION_KEYS = new Set(COGNITIVE_FUNCTIONS.map((f) => f.key))
const clip = (t, n) => (typeof t === 'string' ? (t.length > n ? `${t.slice(0, n).trimEnd()}…` : t) : null)

/**
 * Fichier miroir d'HumanoTwin (`run_id`, `trajectoire.trajectoire[]` =
 * {date, profil{7 fonctions}, n_caracteres, premiere_impression},
 * `signatures_par_sensibilite["0".."100"]`). Les signatures sont dédoublonnées
 * et gardent la plus petite sensibilité à laquelle elles apparaissent : le
 * curseur de l'interface les filtre ensuite à la volée.
 */
export function importMirror(doc, { fileName = 'miroir.json' } = {}) {
  const report = []
  const rows = Array.isArray(doc.trajectoire?.trajectoire) ? doc.trajectoire.trajectoire : Array.isArray(doc.trajectoire) ? doc.trajectoire : []
  const byDate = {}
  const fields = {}
  const firstImpressions = {}
  let ignored = 0
  for (const row of rows) {
    const date = toIso(row?.date)
    if (!date) {
      ignored++
      continue
    }
    for (const [k, v] of Object.entries(row.profil ?? {})) {
      if (typeof v !== 'number' || !Number.isFinite(v)) continue
      byDate[date] ??= {}
      byDate[date][k] = v
      const known = COGNITIVE_FUNCTIONS.find((f) => f.key === k)
      fields[k] ??= { label: known?.label ?? k, group: FUNCTION_KEYS.has(k) ? 'fonctions' : 'autres' }
    }
    if (typeof row.n_caracteres === 'number') {
      byDate[date] ??= {}
      byDate[date].n_caracteres = row.n_caracteres
      fields.n_caracteres ??= { label: 'Caractères (miroir)', group: 'volume' }
    }
    const fi = clip(row.premiere_impression, 1200)
    if (fi) firstImpressions[date] = fi
  }
  const seen = new Map()
  const levels = Object.entries(doc.signatures_par_sensibilite ?? {})
    .map(([k, list]) => [Number(k), list])
    .filter(([k, list]) => Number.isFinite(k) && Array.isArray(list))
    .sort((a, b) => a[0] - b[0])
  for (const [level, list] of levels) {
    for (const sig of list) {
      const date = toIso(sig?.date)
      if (!date || typeof sig?.type !== 'string') continue
      const key = `${sig.type}|${date}|${sig.question ?? ''}`
      if (seen.has(key)) continue
      seen.set(key, {
        type: sig.type,
        date,
        question: clip(sig.question, 300) ?? '',
        confidence: typeof sig.confiance === 'number' ? sig.confiance : null,
        minSensitivity: level,
      })
    }
  }
  const signatures = [...seen.values()].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  if (ignored > 0) report.push({ severity: 'warning', code: 'metriques-ignorees', message: `${fileName} : ${ignored} journée(s) sans date lisible ignorée(s)` })
  report.push({ severity: 'info', code: 'miroir', message: `${fileName} : miroir HumanoTwin, ${Object.keys(byDate).length} journée(s), ${signatures.length} signature(s)` })
  return { metrics: { source: doc.run_id ? `miroir ${doc.run_id}` : fileName, fields, byDate, firstImpressions, signatures }, report }
}
