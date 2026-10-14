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
 * avec la correspondance vers les index d'origine (bornes incluses), UNE
 * entrée par unité de code du texte replié — un émoji (deux unités de code)
 * en a donc deux : sans quoi tout passage situé après un émoji serait
 * surligné décalé.
 * @param {string} text
 * @returns {{collapsed: string, origStart: number[], origEnd: number[]}}
 */
export function collapseText(text) {
  const chars = []
  const origStart = []
  const origEnd = []
  const push = (n, from, to) => {
    chars.push(n)
    for (let k = 0; k < n.length; k++) {
      origStart.push(from)
      origEnd.push(to)
    }
  }
  let inSpace = false
  let i = 0
  for (const cp of text) {
    const len = cp.length
    if (COMBINING.test(cp) && chars.length > 0 && !inSpace) {
      // Accent combinant : on le compose avec la lettre précédente (NFC).
      const prev = chars[chars.length - 1]
      const composed = (prev + cp).normalize('NFC')
      if (composed.length === prev.length) chars[chars.length - 1] = composed
      for (let k = origEnd.length - prev.length; k < origEnd.length; k++) origEnd[k] = i + len - 1
      i += len
      continue
    }
    const n = normChar(cp.normalize('NFC'))
    if (n === ' ') {
      if (!inSpace) {
        push(' ', i, i + len - 1)
        inSpace = true
      } else {
        origEnd[origEnd.length - 1] = i + len - 1
      }
    } else {
      push(n, i, i + len - 1)
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
 * Image Markdown (« ![texte](url) », « ![texte][ref] ») : le texte affiché
 * porte « [image] » ou « [image : texte] » à sa place — même règle que
 * `imagePlaceholder` dans `web/src/lib/md.js`.
 */
const IMAGE_RE = /(?<!\\)!\[([^\]]*)\](?:\[[^\]]*\]|\([^)]*\))/gu

/**
 * Retire d'une ancre la ponctuation Markdown qu'un extrait recopié du texte
 * brut peut contenir (`**gras**`, `_italique_`, `` `code` ``, `### titre`,
 * `> citation`, puces, échappements `\!` `\*` des exports de Google Docs) :
 * le texte AFFICHÉ, lui, ne la contient plus ; une image y est « [image] ».
 * @param {string} s
 */
export function stripMarkdownMarks(s) {
  if (typeof s !== 'string') return s
  return s
    .replace(IMAGE_RE, (_, alt) => (alt.trim() ? `[image : ${alt.trim()}]` : '[image]'))
    .replace(/\\([!-/:-@[-`{-~])/gu, '$1')
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

// ---------------------------------------------------------------------------
// Surlignage APPROCHÉ (décision du 2026-10-14, question 9 du journal) : pour
// un extrait que l'analyse a reformulé (défaut connu d'AuroraCore, D-12), si
// la feuille du jour contient au moins 75 % de ses mots pleins, on encadre les
// phrases d'où ils viennent (au plus quatre) — toujours signalé comme
// approché, jamais comme retrouvé. Sur les journaux réels, un extrait
// reformulé résume souvent plusieurs phrases : d'où des phrases, pas une
// fenêtre d'un seul tenant.

const APPROX_WORD_RE = /[\p{L}\p{N}]+/gu
const APPROX_MIN_LETTERS = 4
/** Mots-outils de 4 lettres ou plus : ils ne disent rien du passage. */
const APPROX_STOPWORDS = new Set(
  'avec pour dans mais plus sont cette comme tout tous toute toutes elle elles nous vous leur leurs même aussi bien très fait faire être avoir avait était sans sous entre après avant encore alors donc ainsi quand chaque autre autres cela ceci celle celui ceux dont quoi puis déjà peut vers chez parce lors étais avais avons ayant étant'.split(' '),
)

/** Mots pleins d'une chaîne REPLIÉE, avec leurs positions. */
function approxTokens(collapsed) {
  const out = []
  for (const m of collapsed.matchAll(APPROX_WORD_RE)) {
    if ([...m[0]].length >= APPROX_MIN_LETTERS && !APPROX_STOPWORDS.has(m[0])) out.push({ word: m[0], start: m.index, end: m.index + m[0].length })
  }
  return out
}

/**
 * Phrases d'où vient un extrait reformulé : couverture gloutonne des mots
 * pleins de l'extrait par les phrases de la feuille (chaque phrase retenue
 * apporte au moins deux mots), si elle atteint `minShare`.
 * Une « phrase » s'arrête à une ponctuation forte ou à une limite de bloc
 * (`breaks` : un paragraphe, un élément de liste, un titre — sans quoi une
 * liste sans point final formerait une seule phrase). Une phrase démesurée
 * au regard de l'extrait (plus de quatre fois ses mots pleins, et plus de 24)
 * n'est jamais retenue : l'encadrer ne localiserait rien.
 * @param {string} text texte affiché
 * @param {string} extract extrait du jury
 * @param {{minShare?: number, minWords?: number, maxSentences?: number, breaks?: number[]}} [opts]
 *   breaks : positions, dans `text`, des sauts de ligne qui séparent deux blocs
 * @returns {{ranges: Array<{from: number, to: number}>, share: number} | null} plages en
 *   index d'ORIGINE (`to` exclu), dans l'ordre du texte
 */
export function locateApproximate(text, extract, { minShare = 0.75, minWords = 4, maxSentences = 4, breaks = [] } = {}) {
  const wanted = approxTokens(normalizeNeedle(String(extract ?? '').replace(TRUNCATION_RE, ' ')))
  if (wanted.length < minWords) return null
  const remaining = new Map()
  for (const t of wanted) remaining.set(t.word, (remaining.get(t.word) ?? 0) + 1)
  const map = collapseText(String(text ?? ''))
  const hay = map.collapsed
  const breakSet = new Set(breaks)
  const atBreak = (k) => {
    for (let o = map.origStart[k]; o <= map.origEnd[k]; o++) if (breakSet.has(o)) return true
    return false
  }
  const maxTokens = Math.max(24, 4 * wanted.length)
  const sentences = []
  let from = 0
  const close = (to) => {
    if (to > from) {
      const tokens = approxTokens(hay.slice(from, to)).map((t) => ({ ...t, start: t.start + from, end: t.end + from }))
      if (tokens.length > 0 && tokens.length <= maxTokens) sentences.push({ tokens, used: false })
    }
    from = to
  }
  for (let k = 0; k < hay.length; k++) {
    if ('.!?…'.includes(hay[k])) {
      let e = k + 1
      while (e < hay.length && '.!?…'.includes(hay[e])) e++
      close(e)
      k = e - 1
    } else if (hay[k] === ' ' && breakSet.size > 0 && atBreak(k)) {
      close(k + 1)
    }
  }
  close(hay.length)
  const gainOf = (s) => {
    const seen = new Map()
    let gain = 0
    for (const t of s.tokens) {
      const left = (remaining.get(t.word) ?? 0) - (seen.get(t.word) ?? 0)
      if (left > 0) {
        gain++
        seen.set(t.word, (seen.get(t.word) ?? 0) + 1)
      }
    }
    return gain
  }
  const chosen = []
  let covered = 0
  while (chosen.length < maxSentences) {
    let best = null
    let bestGain = 1
    for (const s of sentences) {
      if (s.used) continue
      const g = gainOf(s)
      if (g > bestGain) {
        best = s
        bestGain = g
      }
    }
    if (!best) break
    best.used = true
    chosen.push(best)
    covered += bestGain
    for (const t of best.tokens) {
      const n = remaining.get(t.word)
      if (n > 0) remaining.set(t.word, n - 1)
    }
  }
  const share = covered / wanted.length
  if (share < minShare) return null
  // Chaque phrase retenue : de son premier à son dernier mot de l'extrait.
  const words = new Set(wanted.map((t) => t.word))
  const ranges = chosen
    .map((s) => {
      const hits = s.tokens.filter((t) => words.has(t.word))
      return { from: map.origStart[hits[0].start], to: map.origEnd[hits.at(-1).end - 1] + 1 }
    })
    .sort((a, b) => a.from - b.from)
  return { ranges, share }
}

/**
 * Le passage d'une trace est-il retrouvable dans un texte ? (utilisé par les
 * tests et par l'outil d'anonymisation pour vérifier que les substitutions
 * n'ont pas cassé le surlignage, §11.1).
 */
export function isLocatable(text, anchors) {
  return locateExtract(text, anchors).length > 0
}
