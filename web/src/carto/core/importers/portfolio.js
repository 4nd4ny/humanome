// Interface ultime — import du portfolio (spec §3.1) : texte `.md` / `.txt`
// découpé en journées par ses en-têtes de date (`### AAAA-MM-JJ`,
// `## AAAA-MM-JJ`, dates françaises « 27.12.2025 », « 27 décembre 2025 »…).
// La segmentation est celle du module Portfolio du site
// (`engine/src/portfolio/segment.js`) ; fusion / scission / renommage de date
// se font ensuite dans le gestionnaire. Le texte reste dans le navigateur.

import { segmentText } from '@engine/portfolio/segment.js'
import { isIsoDate } from '../dates.js'

const NO_DATE = '0000-00-00'

/** Nombre de mots (espaces comme séparateurs). */
export function wordCount(text) {
  const t = String(text ?? '').trim()
  return t === '' ? 0 : t.split(/\s+/u).length
}

/**
 * Segmente un portfolio.
 * @param {string} text
 * @param {{fileName?: string}} [opts]
 * @returns {{
 *   segments: Array<{date: string, title: string | null, text: string, source: string}>,
 *   undated: Array<{title: string | null, text: string, source: string}>,
 *   report: Array<object>,
 * }}
 */
export function importPortfolioText(text, { fileName = 'portfolio.md' } = {}) {
  const report = []
  const raw = segmentText(String(text ?? '').replace(/\r\n?/g, '\n'), { today: NO_DATE })
  const byDate = new Map()
  const undated = []
  for (const s of raw) {
    const body = s.texte
    if (s.date === null || s.date === NO_DATE || !isIsoDate(s.date)) {
      undated.push({ title: s.titre ?? null, text: body, source: fileName })
      continue
    }
    if (byDate.has(s.date)) {
      const prev = byDate.get(s.date)
      prev.text = `${prev.text.replace(/\s+$/u, '')}\n\n${body}`
      report.push({ severity: 'info', code: 'date-repetee', message: `${s.date} : deux passages non contigus réunis`, date: s.date })
    } else {
      byDate.set(s.date, { date: s.date, title: s.titre ?? null, text: body, source: fileName })
    }
  }
  if (byDate.size === 0) {
    report.push({ severity: 'arbitrate', code: 'portfolio-sans-date', message: `${fileName} : aucune date reconnue — à découper et dater dans le gestionnaire` })
  } else if (undated.length > 0) {
    report.push({ severity: 'arbitrate', code: 'segment-sans-date', message: `${fileName} : ${undated.length} passage(s) sans date — à dater dans le gestionnaire` })
  }
  return { segments: [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1)), undated, report }
}

/** Résumé d'index d'un segment (volume pour la heatmap §5.7). */
export function portfolioSummary(text) {
  const t = String(text ?? '')
  return { chars: t.length, words: wordCount(t) }
}
