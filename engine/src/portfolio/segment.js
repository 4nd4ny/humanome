// Portfolio segmentation (P7.2) — splits a raw portfolio text into day
// segments using date-header heuristics, plus manual adjustment helpers
// (merge / split) for the UI.
//
// Pure DOM-free ESM (ADR-001): no I/O, no Date surprises (the fallback date is
// injectable). Output segments carry character offsets (`debut` inclusive,
// `fin` exclusive) into the ORIGINAL text, compatible with the
// archive-export.segmentation contract ({date, debut, fin} per segment —
// see schemas/archive-export.schema.json); `toArchiveSegmentation()` performs
// the exact projection.
//
// Detection heuristics (documented behaviour, see segment.test.js):
// - A DATE HEADER is a line that is essentially just a date, optionally:
//   markdown heading marks (`#` .. `######`), a French weekday, a leading
//   « le », and a short trailing title after `:`, `—`, `–` or `-`.
//   Supported date formats: ISO « 2025-12-22 », numeric FR « 22/12/2025 »
//   (also `.` or `-` as separator), textual FR « 22 décembre 2025 »
//   (« 1er » accepted, accents optional). A textual date WITHOUT a year is
//   accepted only when anchored by a weekday or a heading mark
//   (« Lundi 22 décembre ») and yields `date: null` (the user names it).
// - A date in the middle of a sentence NEVER splits: the pattern is anchored
//   at line start and the remainder after the date must be empty or a short
//   title introduced by separator punctuation (so « 22/12/2025, nous sommes
//   partis tôt… » is prose, not a header).
// - SEPARATOR lines (---, ===, ***, ___ — 3+ chars alone on their line) also
//   split; the resulting segment is undated. A separator glued under a date
//   header (setext style) is decoration, not a new boundary.
// - Text before the first boundary: attached to the first segment when it is
//   only document headings/blank lines (a document title), otherwise kept as
//   an undated preamble segment.
// - Consecutive segments bearing the SAME date are merged (duplicate headers).
// - No boundary at all: single segment dated "today" (injectable).

const WEEKDAY_RE = /^(?:lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\s*,?\s+/i

const MONTHS = {
  janvier: 1,
  fevrier: 2,
  mars: 3,
  avril: 4,
  mai: 5,
  juin: 6,
  juillet: 7,
  aout: 8,
  septembre: 9,
  octobre: 10,
  novembre: 11,
  decembre: 12
}

const MONTH_RE = /^(\d{1,2})(?:er)?\s+(janvier|f[ée]vrier|mars|avril|mai|juin|juillet|ao[ûu]t|septembre|octobre|novembre|d[ée]cembre)(?:\s+(\d{4}))?\b/i
const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})\b/
const NUMERIC_RE = /^(\d{1,2})([/.-])(\d{1,2})\2(\d{4})\b/
const SEPARATOR_RE = /^\s{0,3}(?:-{3,}|={3,}|\*{3,}|_{3,})\s*$/
const HEADING_RE = /^\s{0,3}(#{1,6})\s+(.*)$/

const MAX_TITLE_LENGTH = 80

/** Removes accents to key into MONTHS ('décembre' -> 'decembre'). */
function unaccent (word) {
  return word.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

/** @returns {boolean} true when (y, m, d) is a real calendar date */
function isRealDate (y, m, d) {
  const date = new Date(Date.UTC(y, m - 1, d))
  return (
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === m - 1 &&
    date.getUTCDate() === d
  )
}

/** @returns {string} 'AAAA-MM-JJ' */
function toIso (y, m, d) {
  const pad = (n) => String(n).padStart(2, '0')
  return `${y}-${pad(m)}-${pad(d)}`
}

/** @returns {string} today's local date as 'AAAA-MM-JJ' */
function localToday () {
  const now = new Date()
  return toIso(now.getFullYear(), now.getMonth() + 1, now.getDate())
}

/**
 * Tries to read a date anchored at the start of `str`.
 * @returns {{iso: string | null, length: number, needsAnchor: boolean} | null}
 *   `iso` is null for year-less textual dates; `needsAnchor` marks matches only
 *   valid when backed by a weekday or heading mark.
 */
function matchDateAtStart (str) {
  let m = ISO_RE.exec(str)
  if (m) {
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
    if (!isRealDate(y, mo, d)) return null
    return { iso: toIso(y, mo, d), length: m[0].length, needsAnchor: false }
  }

  m = NUMERIC_RE.exec(str)
  if (m) {
    const [d, mo, y] = [Number(m[1]), Number(m[3]), Number(m[4])]
    if (!isRealDate(y, mo, d)) return null
    return { iso: toIso(y, mo, d), length: m[0].length, needsAnchor: false }
  }

  m = MONTH_RE.exec(str)
  if (m) {
    const d = Number(m[1])
    const mo = MONTHS[unaccent(m[2])]
    if (m[3] === undefined) {
      // « 22 décembre » without a year: plausible date, unknown year — only a
      // header when anchored (weekday or heading mark), and never an ISO date.
      if (d < 1 || d > 31) return null
      return { iso: null, length: m[0].length, needsAnchor: true }
    }
    const y = Number(m[3])
    if (!isRealDate(y, mo, d)) return null
    return { iso: toIso(y, mo, d), length: m[0].length, needsAnchor: false }
  }

  return null
}

/**
 * Decides whether a LINE is a date header.
 * @param {string} line raw line content (no trailing newline)
 * @returns {{date: string | null, titre: string} | null}
 */
function matchDateHeader (line) {
  if (!line.trim()) return null

  const headingMatch = HEADING_RE.exec(line)
  const isHeading = headingMatch !== null
  let content = (isHeading ? headingMatch[2] : line).trim()
  // Strip symmetric bold/emphasis decoration (« **Lundi 22 décembre 2025** »).
  const decorated = /^([*_]{1,3})(.+)\1$/.exec(content)
  if (decorated) content = decorated[2].trim()

  const titre = content
  let rest = content

  const weekday = WEEKDAY_RE.exec(rest)
  const hasWeekday = weekday !== null
  if (hasWeekday) rest = rest.slice(weekday[0].length)
  rest = rest.replace(/^le\s+/i, '')

  const date = matchDateAtStart(rest)
  if (!date) return null
  if (date.needsAnchor && !hasWeekday && !isHeading) return null

  const remainder = rest.slice(date.length).trim()
  if (remainder === '') return { date: date.iso, titre }
  if (isHeading && remainder.length <= 120) return { date: date.iso, titre }
  // Plain line: a short title is allowed only after separator punctuation —
  // « 22/12/2025, nous sommes partis tôt » stays prose.
  if (/^[:—–-]/.test(remainder) && remainder.length <= MAX_TITLE_LENGTH + 1) {
    return { date: date.iso, titre }
  }
  return null
}

/** Iterates lines with their offsets in `text`. */
function * iterateLines (text) {
  let start = 0
  let index = 0
  while (start <= text.length) {
    let end = text.indexOf('\n', start)
    if (end === -1) end = text.length
    yield {
      index,
      start,
      content: text.slice(start, end),
      nextStart: Math.min(end + 1, text.length)
    }
    if (end === text.length) break
    start = end + 1
    index += 1
  }
}

/** @returns {boolean} true when the slice holds only blank/heading lines */
function isDocumentTitleOnly (slice) {
  return slice
    .split('\n')
    .every((line) => line.trim() === '' || /^\s{0,3}#{1,6}\s/.test(line))
}

/** Builds a segment object, omitting `titre` when absent. */
function makeSegment (text, { date, titre, debut, fin }) {
  const segment = { date: date ?? null }
  if (titre !== undefined) segment.titre = titre
  segment.texte = text.slice(debut, fin)
  segment.debut = debut
  segment.fin = fin
  return segment
}

/**
 * Segments a portfolio text into day segments.
 *
 * @param {string} text full portfolio text
 * @param {{today?: string}} [options] fallback ISO date for undatable texts
 *   (defaults to the local calendar date — injectable for tests)
 * @returns {Array<{date: string | null, titre?: string, texte: string,
 *   debut: number, fin: number}>} offsets index into `text`
 */
export function segmentText (text, { today } = {}) {
  if (typeof text !== 'string') {
    throw new TypeError('segmentText: text must be a string')
  }
  if (text.trim() === '') return []

  // 1. Boundary detection, line by line.
  const boundaries = []
  for (const line of iterateLines(text)) {
    if (SEPARATOR_RE.test(line.content)) {
      const previous = boundaries[boundaries.length - 1]
      if (previous && previous.lineIndex === line.index - 1) {
        if (previous.type === 'header') continue // setext underline decoration
        if (previous.type === 'separator') {
          previous.nextStart = line.nextStart // run of separator lines
          previous.lineIndex = line.index
          continue
        }
      }
      boundaries.push({
        type: 'separator',
        lineIndex: line.index,
        lineStart: line.start,
        nextStart: line.nextStart
      })
      continue
    }
    const header = matchDateHeader(line.content)
    if (header) {
      boundaries.push({
        type: 'header',
        lineIndex: line.index,
        lineStart: line.start,
        date: header.date,
        titre: header.titre
      })
    }
  }

  // 2. No boundary: single block dated "today" (P7.2 fallback).
  if (boundaries.length === 0) {
    return [
      makeSegment(text, {
        date: today ?? localToday(),
        debut: 0,
        fin: text.length
      })
    ]
  }

  // 3. Segments between boundaries.
  const segments = []
  for (let i = 0; i < boundaries.length; i++) {
    const boundary = boundaries[i]
    const debut = boundary.type === 'header' ? boundary.lineStart : boundary.nextStart
    const fin = i + 1 < boundaries.length ? boundaries[i + 1].lineStart : text.length
    if (fin <= debut) continue
    segments.push(
      makeSegment(text, {
        date: boundary.type === 'header' ? boundary.date : null,
        titre: boundary.type === 'header' ? boundary.titre : undefined,
        debut,
        fin
      })
    )
  }

  // 4. Preamble (text before the first boundary): document title -> attached
  //    to the first segment; real content -> undated preamble segment.
  const preambleEnd = boundaries[0].lineStart
  if (text.slice(0, preambleEnd).trim() !== '') {
    if (segments.length > 0 && isDocumentTitleOnly(text.slice(0, preambleEnd))) {
      segments[0] = makeSegment(text, {
        date: segments[0].date,
        titre: segments[0].titre,
        debut: 0,
        fin: segments[0].fin
      })
    } else {
      segments.unshift(makeSegment(text, { date: null, debut: 0, fin: preambleEnd }))
    }
  }

  // 5. Drop whitespace-only segments (e.g. trailing separator), then merge
  //    consecutive duplicates of the same date.
  const kept = segments.filter((segment) => segment.texte.trim() !== '')
  const merged = []
  for (const segment of kept) {
    const previous = merged[merged.length - 1]
    if (previous && previous.date !== null && previous.date === segment.date) {
      merged[merged.length - 1] = makeSegment(text, {
        date: previous.date,
        titre: previous.titre,
        debut: previous.debut,
        fin: segment.fin
      })
    } else {
      merged.push(segment)
    }
  }
  return merged
}

/**
 * Merges segments[index] into segments[index - 1] (UI action « fusionner avec
 * la précédente »). Pure: returns a new array.
 *
 * @param {ReturnType<typeof segmentText>} segments
 * @param {number} index 1 <= index < segments.length
 * @param {string} [fullText] original text — when provided, the merged
 *   `texte` is re-sliced from it (covers any gap, e.g. a separator line)
 * @returns {ReturnType<typeof segmentText>}
 */
export function mergeSegments (segments, index, fullText) {
  if (!Array.isArray(segments)) {
    throw new TypeError('mergeSegments: segments must be an array')
  }
  if (!Number.isInteger(index) || index < 1 || index >= segments.length) {
    throw new RangeError(
      `mergeSegments: index must be between 1 and ${segments.length - 1}, got ${index}`
    )
  }
  const previous = segments[index - 1]
  const current = segments[index]
  const merged = { date: previous.date ?? current.date }
  const titre = previous.titre ?? current.titre
  if (titre !== undefined) merged.titre = titre
  merged.texte =
    typeof fullText === 'string'
      ? fullText.slice(previous.debut, current.fin)
      : previous.texte + current.texte
  merged.debut = previous.debut
  merged.fin = current.fin
  return [...segments.slice(0, index - 1), merged, ...segments.slice(index + 1)]
}

/**
 * Splits segments[index] at `offset` (character offset INSIDE that segment's
 * `texte`, e.g. a textarea cursor position). The first part keeps the date and
 * title; the second part starts undated. Pure: returns a new array.
 *
 * @param {ReturnType<typeof segmentText>} segments
 * @param {number} index 0 <= index < segments.length
 * @param {number} offset 0 < offset < segments[index].texte.length
 * @returns {ReturnType<typeof segmentText>}
 */
export function splitSegment (segments, index, offset) {
  if (!Array.isArray(segments)) {
    throw new TypeError('splitSegment: segments must be an array')
  }
  if (!Number.isInteger(index) || index < 0 || index >= segments.length) {
    throw new RangeError(
      `splitSegment: index must be between 0 and ${segments.length - 1}, got ${index}`
    )
  }
  const segment = segments[index]
  if (!Number.isInteger(offset) || offset <= 0 || offset >= segment.texte.length) {
    throw new RangeError(
      `splitSegment: offset must be strictly inside the segment text (1..${segment.texte.length - 1}), got ${offset}`
    )
  }
  const first = { date: segment.date }
  if (segment.titre !== undefined) first.titre = segment.titre
  first.texte = segment.texte.slice(0, offset)
  first.debut = segment.debut
  first.fin = segment.debut + offset
  const second = {
    date: null,
    texte: segment.texte.slice(offset),
    debut: segment.debut + offset,
    fin: segment.fin
  }
  return [...segments.slice(0, index), first, second, ...segments.slice(index + 1)]
}

/**
 * Projects segments onto the archive-export `segmentation` contract
 * (schemas/archive-export.schema.json): dated segments only, exactly
 * {date, debut, fin} (additionalProperties: false in the schema).
 *
 * @param {ReturnType<typeof segmentText>} segments
 * @returns {Array<{date: string, debut: number, fin: number}>}
 */
export function toArchiveSegmentation (segments) {
  return segments
    .filter((segment) => typeof segment.date === 'string' && segment.date !== '')
    .map(({ date, debut, fin }) => ({ date, debut, fin }))
}
