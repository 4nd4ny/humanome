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

/** Le document ressemble-t-il à un fichier de métriques ? */
export function looksLikeMetrics(doc) {
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return false
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
