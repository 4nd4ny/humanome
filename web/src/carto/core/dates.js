// Interface ultime de cartographie — dates civiles (spec §3, §5.8 ; journal D-5).
//
// Un jour est TOUJOURS une chaîne « AAAA-MM-JJ », comparée comme chaîne (l'ordre
// lexicographique est l'ordre chronologique). On ne construit jamais
// `new Date("AAAA-MM-JJ")` pour une clé de jour : cette forme est lue en UTC et
// décale d'un jour en Suisse (défaut des prototypes de 2025). Les seuls calculs
// calendaires (jour de la semaine, ajout de jours) passent par Date.UTC, sans
// aucun fuseau.

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/
const DAY_MS = 86_400_000

const MONTHS_FR = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
]
const MONTHS_FR_SHORT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']
const WEEKDAYS_FR = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche']

/**
 * Date civile valide au format strict AAAA-MM-JJ (rejette 2026-02-30).
 * @param {unknown} value
 * @returns {boolean}
 */
export function isIsoDate(value) {
  if (typeof value !== 'string') return false
  const m = ISO_RE.exec(value)
  if (!m) return false
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const t = new Date(Date.UTC(y, mo - 1, d))
  return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d
}

/** @param {string} iso @returns {number} millisecondes UTC à minuit */
function toUtc(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}

/** @param {number} ms @returns {string} AAAA-MM-JJ */
function fromUtc(ms) {
  const t = new Date(ms)
  const pad = (n) => String(n).padStart(2, '0')
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`
}

/** Ajoute n jours (n négatif possible). */
export function addDays(iso, n) {
  return fromUtc(toUtc(iso) + n * DAY_MS)
}

/** Nombre de jours de a à b (b − a), entier. */
export function daysBetween(a, b) {
  return Math.round((toUtc(b) - toUtc(a)) / DAY_MS)
}

/** Jour de la semaine, lundi = 0 … dimanche = 6. */
export function weekdayIndex(iso) {
  return (new Date(toUtc(iso)).getUTCDay() + 6) % 7
}

/** Lundi de la semaine contenant `iso`. */
export function mondayOf(iso) {
  return addDays(iso, -weekdayIndex(iso))
}

/**
 * Tous les jours de `from` à `to` inclus (tableau vide si to < from).
 * @returns {string[]}
 */
export function eachDay(from, to) {
  const out = []
  if (to < from) return out
  for (let ms = toUtc(from), end = toUtc(to); ms <= end; ms += DAY_MS) out.push(fromUtc(ms))
  return out
}

/** « AAAA-MM » du jour. */
export function monthKey(iso) {
  return iso.slice(0, 7)
}

/**
 * Semaine ISO 8601 (« AAAA-Wnn », lundi premier ; la semaine appartient à
 * l'année de son jeudi).
 */
export function isoWeekKey(iso) {
  const thursday = addDays(mondayOf(iso), 3)
  const year = Number(thursday.slice(0, 4))
  const firstThursday = addDays(mondayOf(`${year}-01-04`), 3)
  const week = 1 + Math.round(daysBetween(firstThursday, thursday) / 7)
  return `${year}-W${String(week).padStart(2, '0')}`
}

/**
 * Année scolaire contenant `iso` : du 1er août au 31 juillet (spec §5.8 — les
 * bornes 30 juin et 2024-12-31 des prototypes de 2025 ne sont PAS reprises).
 * @returns {{start: string, end: string, label: string, key: string}}
 */
export function schoolYearOf(iso) {
  const y = Number(iso.slice(0, 4))
  const startYear = iso.slice(5) >= '08-01' ? y : y - 1
  return {
    start: `${startYear}-08-01`,
    end: `${startYear + 1}-07-31`,
    label: `${startYear}–${startYear + 1}`,
    key: `${startYear}-${startYear + 1}`,
  }
}

/** Année scolaire désignée par son année de début (2025 → 2025–2026). */
export function schoolYearStarting(startYear) {
  return schoolYearOf(`${startYear}-08-01`)
}

/** « 27 décembre 2025 » */
export function formatLong(iso) {
  if (!isIsoDate(iso)) return '—'
  const [y, m, d] = iso.split('-').map(Number)
  return `${d === 1 ? '1er' : d} ${MONTHS_FR[m - 1]} ${y}`
}

/** « sam. 27 déc. 2025 » (libellé compact des listes). */
export function formatShort(iso) {
  if (!isIsoDate(iso)) return '—'
  const [y, m, d] = iso.split('-').map(Number)
  return `${WEEKDAYS_FR[weekdayIndex(iso)].slice(0, 3)}. ${d} ${MONTHS_FR_SHORT[m - 1]} ${y}`
}

/** « 27.12.2025 » */
export function formatNumeric(iso) {
  if (!isIsoDate(iso)) return '—'
  const [y, m, d] = iso.split('-')
  return `${d}.${m}.${y}`
}

/** Nom du mois (« décembre ») d'une clé AAAA-MM ou d'un jour. */
export function monthName(isoOrMonth, { short = false } = {}) {
  const m = Number(isoOrMonth.slice(5, 7))
  return (short ? MONTHS_FR_SHORT : MONTHS_FR)[m - 1] ?? '—'
}

/** Nom du jour de la semaine. */
export function weekdayName(iso) {
  return WEEKDAYS_FR[weekdayIndex(iso)]
}

/** Aujourd'hui en date LOCALE (injectable dans les tests via `now`). */
export function todayIso(now = new Date()) {
  const pad = (n) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

/** Bornes min/max d'une liste de jours (null si vide). */
export function dateRange(dates) {
  let min = null
  let max = null
  for (const d of dates) {
    if (min === null || d < min) min = d
    if (max === null || d > max) max = d
  }
  return min === null ? null : { from: min, to: max }
}
