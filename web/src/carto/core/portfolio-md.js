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
// la main dans le gestionnaire, titre du document) reçoit `## AAAA-MM-JJ`.
// Une ligne qui y ouvrirait une autre journée — une date seule sur sa ligne —
// est précédée d'un tiret « — » ; c'est fréquent quand le portfolio vient de
// feuilles séparées (AuroraCore : une feuille par journée, datée par son nom
// de fichier). Les traits (`---`, `***`…) restent tels quels : après l'en-tête
// d'une journée, ils ne coupent plus rien (journal carto D-55).
// Les passages restés sans date viennent en tête du fichier, chacun après un
// trait `***` : avant la première journée, un trait coupe encore, et ils
// restent sans date ; leurs propres traits y deviennent le même trait espacé
// (`- - -`…), qui s'affiche pareil sans rien couper, et leurs dates seules sur
// leur ligne sont précédées d'un « — ».

import { segmentText } from '@engine/portfolio/segment.js'
import { isIsoDate } from './dates.js'
import { reflectionIsoDay, versedDialogueMarkdown } from './dialogue.js'

const NO_DATE = '0000-00-00'

/**
 * Ce que le découpage du portfolio lirait sur cette ligne, entre deux lignes
 * de texte, avant toute journée : `undefined` si elle ne coupe rien ; sinon la
 * date de la journée qu'elle ouvrirait (`null` pour un séparateur ou une date
 * sans année).
 * @param {string} line
 * @returns {string | null | undefined}
 */
export function boundaryDate(line) {
  const segs = segmentText(`texte\n${line}\ntexte\n`, { today: NO_DATE })
  return segs.length < 2 ? undefined : segs[1].date
}

/**
 * La ligne ouvrirait-elle une journée au milieu d'une autre ? Une date, oui ;
 * un trait, non (D-55). L'en-tête de départ est une date sans année : jamais
 * fusionnée avec la ligne essayée.
 */
function opensDayWithin(line) {
  return segmentText(`## Lundi 1 janvier\ntexte\n${line}\ntexte\n`, { today: NO_DATE }).length > 1
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

/** Neutralise chaque ligne qui ouvrirait une autre journée que `date` (« — » devant). */
function keepInDay(text, date) {
  return text
    .split('\n')
    .map((line) => (line.trim() === '' || !opensDayWithin(line) || boundaryDate(line) === date ? line : `— ${line}`))
    .join('\n')
}

const SEPARATOR_RE = /^(\s{0,3})([-=*_])\2{2,}\s*$/u

/**
 * Le même trait, espacé (« - - - », « * * * », « _ _ _ » ; « * * * » pour
 * « === ») : il s'affiche pareil et ne coupe rien ; `null` si la ligne n'est
 * pas un séparateur.
 */
function spacedRule(line) {
  const sep = line.match(SEPARATOR_RE)
  return sep ? `${sep[1]}${sep[2] === '=' ? '* * *' : `${sep[2]} ${sep[2]} ${sep[2]}`}` : null
}

/**
 * Un passage sans date, placé avant toute journée : chaque ligne qui y
 * couperait est neutralisée — un séparateur devient le même trait espacé,
 * une date seule est précédée d'un « — ».
 */
function keepUndated(text) {
  return text
    .split('\n')
    .map((line) => {
      if (line.trim() === '' || boundaryDate(line) === undefined) return line
      const spaced = spacedRule(line)
      return spaced !== null && boundaryDate(spaced) === undefined ? spaced : `— ${line}`
    })
    .join('\n')
}

/**
 * Le dialogue tel que l'export d'avant D-55 l'écrivait (traits espacés) : un
 * portfolio exporté alors, puis réimporté, le porte sous cette forme.
 */
const legacyBlock = (block) => block.split('\n').map((line) => spacedRule(line) ?? line).join('\n')

/** Le bloc d'une journée : son texte, ouvert par son en-tête, qui ne coupe rien. */
function dayBlock(text, date) {
  if (opensAndStaysInDay(text, date)) return text
  const first = text.split('\n').find((l) => l.trim() !== '')
  const body = keepInDay(text, date)
  return first !== undefined && boundaryDate(first) === date ? body : `## ${date}\n\n${body}`
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
    if (text.trim() !== '') parts.push(dayBlock(text, date))
    const mine = (versed.get(date) ?? [])
      .slice()
      .sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0))
      .map((r) => keepInDay(versedDialogueMarkdown(r).trim(), date))
      .filter(Boolean)
    // Un portfolio déjà exporté puis réimporté (avec les analyses de
    // l'évaluation suivante) porte le dialogue dans le texte de sa journée :
    // il n'est pas ajouté une seconde fois.
    const fresh = mine.filter((block) => !text.includes(block) && !text.includes(legacyBlock(block)))
    if (parts.length === 0 && fresh.length === 0) continue
    if (parts.length === 0) parts.push(`## ${date}`)
    for (const block of fresh) parts.push(block)
    dialogues += mine.length
    days++
    blocks.push(parts.join('\n\n'))
  }
  const undated = (ds.portfolio?.undated ?? []).map((u) => String(u?.text ?? '').trim()).filter(Boolean)
  // En tête : avant la première journée, un trait coupe encore (D-55).
  blocks.unshift(...undated.map((u) => `***\n\n${keepUndated(u)}`))
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
