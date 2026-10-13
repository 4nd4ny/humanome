// Interface ultime — moteur de recherche des passages à surligner (spec §8.1).
//
// Repris du `carto-viewer.html` d'AuroraCore (version GEN1) et de
// `split_extract_for_highlight` (`generate_carto_data.py`), réécrit en
// fonctions pures sur une CHAÎNE (le texte affiché du portfolio, c'est-à-dire
// la concaténation des nœuds texte) ; l'enveloppement DOM vit dans
// `ui/highlight-dom.js`. Améliorations par rapport à AuroraCore :
// - normalisation réellement caractère pour caractère (une lettre suivie d'un
//   accent combinant reste UNE lettre, l'index d'origine est conservé) ;
// - ponctuation d'ouverture (« guillemets ») retirée comme la ponctuation finale ;
// - TOUTES les occurrences sont trouvées (AuroraCore s'arrêtait à la première) ;
// - un extrait court (< 4 mots) retrouvé en entier compte comme complet.

const TRUNCATION_RE = /\s*(?:\[\.\.\.\]|\[…\]|…|\.\.\.)\s*/u
const TRAILING_PUNCT_RE = /[\s.,;:!?…»"'’`)\]}]+$/u
const LEADING_PUNCT_RE = /^[\s«"'‘“(\[{]+/u
const MIN_NEEDLE = 4

const QUOTE_SINGLE = /[‘’`´′]/u
const QUOTE_DOUBLE = /[“”«»″]/u
const COMBINING = /\p{M}/u
const SPACE = /\s/u

/** Normalise UN caractère (guillemets, apostrophes, espaces insécables, casse). */
function normChar(ch) {
  if (QUOTE_SINGLE.test(ch)) return "'"
  if (QUOTE_DOUBLE.test(ch)) return '"'
  if (SPACE.test(ch) || ch === ' ' || ch === ' ') return ' '
  const lower = ch.toLowerCase()
  return lower.length === ch.length ? lower : ch
}

/**
 * Texte « replié » : caractères normalisés, blancs repliés en une espace,
 * avec la correspondance vers les index d'origine (bornes incluses).
 * @param {string} text
 * @returns {{collapsed: string, origStart: number[], origEnd: number[]}}
 */
export function collapseText(text) {
  const chars = []
  const origStart = []
  const origEnd = []
  let inSpace = false
  let i = 0
  for (const cp of text) {
    const len = cp.length
    if (COMBINING.test(cp) && chars.length > 0 && !inSpace) {
      // Accent combinant : on le compose avec la lettre précédente (NFC).
      const composed = (chars[chars.length - 1] + cp).normalize('NFC')
      if (composed.length === 1) chars[chars.length - 1] = composed
      origEnd[origEnd.length - 1] = i + len - 1
      i += len
      continue
    }
    const n = normChar(cp.normalize('NFC'))
    if (n === ' ') {
      if (!inSpace) {
        chars.push(' ')
        origStart.push(i)
        origEnd.push(i + len - 1)
        inSpace = true
      } else {
        origEnd[origEnd.length - 1] = i + len - 1
      }
    } else {
      chars.push(n)
      origStart.push(i)
      origEnd.push(i + len - 1)
      inSpace = false
    }
    i += len
  }
  return { collapsed: chars.join(''), origStart, origEnd }
}

/** Normalise une aiguille (mêmes règles que le texte, ponctuation de bord retirée). */
export function normalizeNeedle(s) {
  if (typeof s !== 'string') return ''
  return collapseText(s.normalize('NFC'))
    .collapsed.trim()
    .replace(TRAILING_PUNCT_RE, '')
    .replace(LEADING_PUNCT_RE, '')
    .trim()
}

/**
 * Découpe un extrait du jury en ancres (début, fin) — `split_extract_for_highlight` :
 * - marqueurs de troncature `[...]`, `[…]`, `…`, `...` : premier et dernier segments ;
 * - sinon, ≥ 4 mots : deux moitiés ;
 * - sinon : début seul.
 * @param {string} extract
 * @returns {{start: string, end: string | null}}
 */
export function splitExtract(extract) {
  if (typeof extract !== 'string' || extract.trim() === '') return { start: '', end: null }
  const parts = extract.split(TRUNCATION_RE).map((p) => p.trim()).filter(Boolean)
  if (parts.length === 0) return { start: '', end: null }
  if (parts.length >= 2) return { start: parts[0], end: parts[parts.length - 1] }
  const words = parts[0].split(/\s+/u)
  if (words.length < 4) return { start: parts[0], end: null }
  const mid = Math.floor(words.length / 2)
  return { start: words.slice(0, mid).join(' '), end: words.slice(mid).join(' ') }
}

/** Rétrécit en gardant le DÉBUT (moitié des mots). */
function shrinkKeepStart(text) {
  const words = text.trim().split(/\s+/u).filter(Boolean)
  if (words.length <= 2) return null
  const n = Math.floor(words.length / 2)
  return n >= 2 ? words.slice(0, n).join(' ') : null
}

/** Rétrécit en gardant la FIN (moitié des mots). */
function shrinkKeepEnd(text) {
  const words = text.trim().split(/\s+/u).filter(Boolean)
  if (words.length <= 2) return null
  const n = Math.floor(words.length / 2)
  return n >= 2 ? words.slice(words.length - n).join(' ') : null
}

/**
 * Cherche une aiguille, en la réduisant de moitié en mots tant qu'elle n'est
 * pas trouvée (jusqu'à 4 caractères).
 * @returns {{needle: string, shrunk: boolean} | null} l'aiguille EFFECTIVE trouvée
 */
function effectiveNeedle(haystack, needle, shrink, from = 0) {
  let current = needle
  let shrunk = false
  while (current && current.length >= MIN_NEEDLE) {
    if (haystack.indexOf(current, from) >= 0) return { needle: current, shrunk }
    const shorter = shrink(current)
    if (!shorter || shorter === current) break
    current = normalizeNeedle(shorter)
    shrunk = true
  }
  return null
}

/** Toutes les positions d'une sous-chaîne (sans chevauchement). */
function allIndexes(haystack, needle, from = 0) {
  const out = []
  if (!needle) return out
  let idx = haystack.indexOf(needle, from)
  while (idx >= 0) {
    out.push(idx)
    idx = haystack.indexOf(needle, idx + needle.length)
  }
  return out
}

/**
 * Localise TOUTES les occurrences d'un extrait dans un texte.
 *
 * @param {string} text texte affiché (concaténation des nœuds texte)
 * @param {{extract?: string, start?: string, end?: string | null}} anchors
 *   ancres explicites (`start`/`end`) ou extrait à découper
 * @param {{maxSpan?: number}} [opts] écart maximal début→fin, en caractères repliés
 * @returns {Array<{from: number, to: number, complete: boolean, exact: boolean}>} plages en
 *   index d'ORIGINE (`to` exclu), dans l'ordre du texte ; `complete` = surlignage
 *   jaune (début et fin trouvés), sinon orange (un seul bout) ; `exact` = les
 *   ancres ont été trouvées SANS être raccourcies (preuve forte, utilisée pour
 *   retrouver un passage dans une autre journée que la sienne).
 */
export function locateExtract(text, anchors, { maxSpan = 6000 } = {}) {
  const { start: rawStart, end: rawEnd } =
    anchors && (anchors.start !== undefined || anchors.end !== undefined)
      ? { start: anchors.start ?? '', end: anchors.end ?? null }
      : splitExtract(anchors?.extract ?? '')
  const map = collapseText(String(text ?? ''))
  const hay = map.collapsed
  const startNeedle = normalizeNeedle(rawStart)
  const endNeedle = rawEnd ? normalizeNeedle(rawEnd) : ''

  const toOrig = (cFrom, cTo) => ({ from: map.origStart[cFrom], to: map.origEnd[cTo - 1] + 1 })
  const found = []

  const s = startNeedle ? effectiveNeedle(hay, startNeedle, shrinkKeepStart) : null

  if (s) {
    const starts = allIndexes(hay, s.needle)
    for (let i = 0; i < starts.length; i++) {
      const st = starts[i]
      const stEnd = st + s.needle.length
      if (!endNeedle) {
        // Extrait court : un seul bout existe ; complet s'il est trouvé en entier.
        found.push({ ...toOrig(st, stEnd), complete: !s.shrunk, exact: !s.shrunk })
        continue
      }
      // La fin est cherchée APRÈS ce début, avant le début suivant.
      const limit = Math.min(starts[i + 1] ?? Infinity, stEnd + maxSpan)
      const e = effectiveNeedle(hay, endNeedle, shrinkKeepEnd, stEnd)
      const endAt = e ? hay.indexOf(e.needle, stEnd) : -1
      if (e && endAt >= 0 && endAt < limit) {
        found.push({ ...toOrig(st, endAt + e.needle.length), complete: true, exact: !s.shrunk && !e.shrunk })
      } else {
        found.push({ ...toOrig(st, stEnd), complete: false, exact: false })
      }
    }
  } else if (endNeedle) {
    const e = effectiveNeedle(hay, endNeedle, shrinkKeepEnd)
    if (e) for (const idx of allIndexes(hay, e.needle)) found.push({ ...toOrig(idx, idx + e.needle.length), complete: false, exact: false })
  }
  return found
}

/**
 * Retire d'une ancre la ponctuation Markdown qu'un extrait recopié du texte
 * brut peut contenir (`**gras**`, `_italique_`, `` `code` ``, `### titre`,
 * `> citation`, puces) : le texte AFFICHÉ, lui, ne la contient plus.
 * @param {string} s
 */
export function stripMarkdownMarks(s) {
  if (typeof s !== 'string') return s
  return s
    .replace(/^\s*(?:#{1,6}|>|[-*+]|\d+[.)])\s+/gmu, '')
    .replace(/\*\*|__|`/gu, '')
    .replace(/(^|[\s(«"'‘“])[*_](?=\S)/gu, '$1')
    .replace(/(\S)[*_](?=$|[\s.,;:!?»"'’”)])/gu, '$1')
}

/**
 * Comme `locateExtract`, mais sur le texte AFFICHÉ d'un Markdown rendu : si
 * l'extrait n'est pas trouvé en entier tel quel, on réessaie sans ses marques
 * Markdown (le meilleur des deux résultats est gardé).
 */
export function locateRendered(text, anchors, opts) {
  const direct = locateExtract(text, anchors, opts)
  if (direct.some((r) => r.complete)) return direct
  const a = anchors ?? {}
  const stripped =
    a.start !== undefined || a.end !== undefined
      ? { start: stripMarkdownMarks(a.start ?? ''), end: a.end ? stripMarkdownMarks(a.end) : null }
      : { extract: stripMarkdownMarks(a.extract ?? '') }
  const same = stripped.extract !== undefined ? stripped.extract === a.extract : stripped.start === (a.start ?? '') && stripped.end === (a.end ?? null)
  if (same) return direct
  const retry = locateExtract(text, stripped, opts)
  if (retry.some((r) => r.complete)) return retry
  return direct.length > 0 ? direct : retry
}

/**
 * Le passage d'une trace est-il retrouvable dans un texte ? (utilisé par les
 * tests et par l'outil d'anonymisation pour vérifier que les substitutions
 * n'ont pas cassé le surlignage, §11.1).
 */
export function isLocatable(text, anchors) {
  return locateExtract(text, anchors).length > 0
}
