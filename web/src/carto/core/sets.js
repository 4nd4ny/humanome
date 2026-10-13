// Interface ultime — ensembles de journées (spec §4.1 « ensemble », §7, §9.1).
//
// Un ensemble est défini par une liste de dates, une période, des étiquettes
// ou la sélection courante (cases cochées) ; il peut FIGER un instantané de
// ses dates (§4.1 « fige un instantané si demandé »). Les cases tri-états du
// gestionnaire (mois, semaine, année scolaire, étiquette) se calculent ici.

import { formatShort, isoWeekKey, monthKey, monthName, schoolYearOf } from './dates.js'

export const SET_KINDS = ['dates', 'period', 'tags', 'selection']

/**
 * Dates (triées, existantes) d'un ensemble.
 * @param {{definition: object, frozenDates?: string[] | null}} set
 * @param {object} dataset
 * @returns {string[]}
 */
export function resolveSetDates(set, dataset) {
  const existing = new Set(dataset.days.map((d) => d.date))
  if (Array.isArray(set.frozenDates)) return set.frozenDates.filter((d) => existing.has(d)).sort()
  return resolveDefinition(set.definition, dataset)
}

/** Résout une définition d'ensemble sur le jeu de données courant. */
export function resolveDefinition(def, dataset) {
  if (!def) return []
  switch (def.kind) {
    case 'dates': {
      const wanted = new Set(def.dates ?? [])
      return dataset.days.filter((d) => wanted.has(d.date)).map((d) => d.date).sort()
    }
    case 'period':
      return dataset.days
        .filter((d) => (!def.from || d.date >= def.from) && (!def.to || d.date <= def.to) && (!def.onlyActive || d.active))
        .map((d) => d.date)
        .sort()
    case 'tags': {
      const tags = def.tags ?? []
      const match = def.match === 'all'
        ? (d) => tags.every((t) => d.tags.includes(t))
        : (d) => tags.some((t) => d.tags.includes(t))
      return dataset.days.filter((d) => tags.length > 0 && match(d)).map((d) => d.date).sort()
    }
    case 'selection':
      return dataset.days.filter((d) => d.active).map((d) => d.date).sort()
    default:
      return []
  }
}

/** Libellé humain d'une définition (« du 1er sept. au 31 déc. », « étiquette projet X »…). */
export function describeDefinition(def) {
  switch (def?.kind) {
    case 'dates':
      return `${def.dates?.length ?? 0} journée${(def.dates?.length ?? 0) > 1 ? 's' : ''} choisie${(def.dates?.length ?? 0) > 1 ? 's' : ''}`
    case 'period': {
      const only = def.onlyActive ? ' (journées cochées)' : ''
      if (def.from && def.to) return `du ${formatShort(def.from)} au ${formatShort(def.to)}${only}`
      if (def.to) return `jusqu’au ${formatShort(def.to)}${only}`
      if (def.from) return `depuis le ${formatShort(def.from)}${only}`
      return `toutes les journées${only}`
    }
    case 'tags':
      return `${def.match === 'all' ? 'toutes les étiquettes' : 'étiquette'} ${(def.tags ?? []).map((t) => `« ${t} »`).join(def.match === 'all' ? ' et ' : ' ou ')}`
    case 'selection':
      return 'sélection courante (cases cochées)'
    default:
      return '—'
  }
}

/**
 * État tri-état d'un groupe de dates par rapport à la sélection.
 * @returns {'all'|'none'|'mixed'}
 */
export function triState(dates, selected) {
  let on = 0
  for (const d of dates) if (selected.has(d)) on++
  if (on === 0) return 'none'
  if (on === dates.length) return 'all'
  return 'mixed'
}

/**
 * Groupes de journées pour les cases tri-états (§7).
 * @param {object} dataset
 * @param {'month'|'week'|'schoolYear'|'tag'} kind
 * @returns {Array<{key: string, label: string, dates: string[]}>}
 */
export function groupDays(dataset, kind) {
  const groups = new Map()
  const add = (key, label, date) => {
    if (!groups.has(key)) groups.set(key, { key, label, dates: [] })
    groups.get(key).dates.push(date)
  }
  for (const d of [...dataset.days].sort((a, b) => (a.date < b.date ? -1 : 1))) {
    if (kind === 'month') add(monthKey(d.date), `${monthName(d.date)} ${d.date.slice(0, 4)}`, d.date)
    else if (kind === 'week') {
      const k = isoWeekKey(d.date)
      add(k, `semaine ${k.slice(6)} (${k.slice(0, 4)})`, d.date)
    } else if (kind === 'schoolYear') {
      const sy = schoolYearOf(d.date)
      add(sy.key, `année scolaire ${sy.label}`, d.date)
    } else if (kind === 'tag') {
      for (const t of d.tags) add(`tag:${t}`, t, d.date)
    }
  }
  return [...groups.values()]
}

/** Toutes les étiquettes utilisées, triées (insensible à la casse et aux accents). */
export function allTags(dataset) {
  const set = new Set()
  for (const d of dataset.days) for (const t of d.tags) set.add(t)
  return [...set].sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' }))
}

/**
 * Recouvrement de deux listes de dates (§9.1 « si les ensembles se
 * recouvrent, l'interface l'indique »).
 */
export function overlap(a, b) {
  const sb = new Set(b)
  const common = a.filter((d) => sb.has(d))
  return { common, count: common.length }
}

/**
 * Plage de dates entre deux journées (shift-clic du gestionnaire), dans
 * l'ordre des journées existantes.
 */
export function rangeBetween(dataset, a, b) {
  const [lo, hi] = a <= b ? [a, b] : [b, a]
  return dataset.days.filter((d) => d.date >= lo && d.date <= hi).map((d) => d.date)
}
