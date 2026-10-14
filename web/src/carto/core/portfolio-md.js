// Interface ultime — le portfolio exporté en Markdown (décision du
// 2026-10-14, question 20 : un chemin du carnet du dialogue vers le
// portfolio). Le texte de chaque journée, dans l'ordre des dates, suivi des
// dialogues que la personne y a versés : un fichier à relire, à transmettre
// à qui lit son portfolio, à réimporter, ou à faire analyser lors de
// l'évaluation suivante.
//
// Contrat : redécoupé par le module Portfolio du site (`segmentText`, le même
// découpage qu'à l'import), le fichier redonne les mêmes journées, chacune
// avec son texte et ses dialogues. Chaque journée s'ouvre sur son en-tête de
// date : celle dont le texte ne commence pas par le sien (passage rattaché à
// la main dans le gestionnaire, titre du document) reçoit `## AAAA-MM-JJ`, et
// une ligne qui y ouvrirait une autre journée (une date seule sur sa ligne, un
// séparateur `---`) est précédée d'un tiret « — ». Les passages restés sans date viennent à la
// fin, chacun après un séparateur : ils restent sans date.

import { segmentText } from '@engine/portfolio/segment.js'
import { isIsoDate } from './dates.js'
import { reflectionIsoDay, versedDialogueMarkdown } from './dialogue.js'

const NO_DATE = '0000-00-00'

/**
 * Ce que le découpage du portfolio lirait sur cette ligne, entre deux lignes
 * de texte : `undefined` si elle ne coupe rien ; sinon la date de la
 * journée qu'elle ouvrirait (`null` pour un séparateur ou une date sans
 * année).
 * @param {string} line
 * @returns {string | null | undefined}
 */
export function boundaryDate(line) {
  const segs = segmentText(`texte\n${line}\ntexte\n`, { today: NO_DATE })
  return segs.length < 2 ? undefined : segs[1].date
}

/**
 * Le texte s'ouvre-t-il sur l'en-tête de sa journée, et reste-t-il, redécoupé,
 * entièrement dans cette journée ? (Un préambule — le titre du document —
 * passerait sinon à la journée précédente du fichier.)
 */
function opensAndStaysInDay(text, date) {
  const first = text.split('\n').find((l) => l.trim() !== '')
  if (first === undefined || boundaryDate(first) !== date) return false
  const segs = segmentText(`${text}\n`, { today: NO_DATE })
  return segs.length > 0 && segs.every((s) => s.date === date)
}

/** Précède d'un « — » chaque ligne qui ouvrirait une autre journée que `date`. */
function keepInDay(text, date) {
  return text
    .split('\n')
    .map((line) => {
      if (line.trim() === '') return line
      const d = boundaryDate(line)
      return d === undefined || d === date ? line : `— ${line}`
    })
    .join('\n')
}

/**
 * Le portfolio en Markdown, avec les dialogues versés.
 * @param {{dataset: object, details?: Record<string, object>}} exported ce que le magasin exporte (`exportAll`)
 * @returns {{text: string, days: number, dialogues: number, undated: number}}
 */
export function buildPortfolioMarkdown(exported) {
  const ds = exported.dataset
  const details = exported.details ?? {}
  const textOf = (date) => String(details[date]?.portfolio?.text ?? '').replace(/\s+$/u, '')

  const versed = new Map()
  for (const r of ds.reflections ?? []) {
    if (!r?.versedAt) continue
    const day = reflectionIsoDay(r.at)
    if (!day) continue
    if (!versed.has(day)) versed.set(day, [])
    versed.get(day).push(r)
  }

  const written = Object.keys(details).filter((d) => isIsoDate(d) && textOf(d).trim() !== '')
  const dates = [...new Set([...written, ...versed.keys()])].sort()
  const blocks = []
  let dialogues = 0
  let days = 0
  for (const date of dates) {
    const text = textOf(date)
    const parts = []
    if (text.trim() !== '') parts.push(opensAndStaysInDay(text, date) ? text : `## ${date}\n\n${keepInDay(text, date)}`)
    const mine = (versed.get(date) ?? [])
      .slice()
      .sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0))
      .map((r) => versedDialogueMarkdown(r).trim())
      .filter(Boolean)
    if (parts.length === 0 && mine.length === 0) continue
    if (parts.length === 0) parts.push(`## ${date}`)
    for (const md of mine) parts.push(keepInDay(md, date))
    dialogues += mine.length
    days++
    blocks.push(parts.join('\n\n'))
  }
  const undated = (ds.portfolio?.undated ?? []).map((u) => String(u?.text ?? '').trim()).filter(Boolean)
  for (const u of undated) blocks.push(`---\n\n${u}`)
  return { text: blocks.length ? `${blocks.join('\n\n')}\n` : '', days, dialogues, undated: undated.length }
}

/** Y a-t-il quelque chose à exporter (texte du portfolio ou dialogue versé) ? */
export function hasPortfolioToExport(dataset) {
  return (
    (dataset.days ?? []).some((d) => d?.portfolio && d.portfolio.chars > 0) ||
    (dataset.reflections ?? []).some((r) => r?.versedAt) ||
    (dataset.portfolio?.undated ?? []).length > 0
  )
}
