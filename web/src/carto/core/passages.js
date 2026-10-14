// Interface ultime — où lire le passage d'une trace (spec §8.1).
//
// Une trace garde sa journée et la date de son passage (`sourceDate`) : c'est
// ce qui permet le surlignage dans une cartographie FUSIONNÉE (AuroraCore le
// désactivait). La recherche commence donc par la journée du passage, puis la
// journée de la trace. Sur les journaux réels, une partie des extraits figure
// pourtant dans la feuille d'un AUTRE jour (décalage de date d'AuroraCore,
// journal D-12) : on cherche alors dans les autres journées du portfolio, par
// distance croissante, mais seulement une correspondance EXACTE (ancres non
// raccourcies) — une ancre raccourcie à deux mots peut se trouver n'importe où,
// elle ne suffit pas à déplacer le lecteur vers un autre jour.
//
// Fonctions pures : le texte d'une journée est fourni par `locate(date)`
// (texte affiché du portfolio rendu, côté interface).

import { daysBetween } from './dates.js'

/**
 * Ordre de recherche : journée du passage, journée de la trace, puis les
 * autres journées par distance croissante à la journée du passage (à distance
 * égale, la plus ancienne d'abord).
 * @param {string} primary journée du passage (sourceDate)
 * @param {string | null} secondary journée de la trace
 * @param {string[]} dates journées du portfolio
 * @returns {string[]}
 */
export function searchOrder(primary, secondary, dates) {
  const head = [primary]
  if (secondary && secondary !== primary) head.push(secondary)
  const rest = [...new Set(dates)]
    .filter((d) => !head.includes(d))
    .sort((a, b) => {
      const da = Math.abs(daysBetween(primary, a))
      const db = Math.abs(daysBetween(primary, b))
      return da - db || (a < b ? -1 : a > b ? 1 : 0)
    })
  return [...head, ...rest]
}

/**
 * Cherche le passage d'une trace.
 *
 * @param {{
 *   primary: string,                 // journée du passage (sourceDate)
 *   secondary?: string | null,       // journée de la trace
 *   dates: string[],                 // journées dont le portfolio est connu
 *   locate: (date: string) => Array<{from: number, to: number, complete: boolean, exact?: boolean}> | null,
 *                                    // null = pas de texte pour ce jour
 *   approximate?: (date: string) => {ranges: Array<{from: number, to: number}>, share: number} | null,
 *                                    // phrases d'où vient un extrait reformulé
 * }} input
 * @returns {{
 *   date: string,                    // journée à afficher
 *   ranges: Array<{from: number, to: number, complete: boolean, exact?: boolean, approximate?: boolean}>,
 *   status: 'found' | 'partial' | 'relocated' | 'approximate' | 'not-found' | 'no-text',
 *   searchedDays: number,
 *   share?: number,                  // part des mots de l'extrait (approximate)
 * }}
 *   - found : début et fin retrouvés dans la journée de la trace ;
 *   - partial : un seul bout retrouvé (orange) dans la journée de la trace ;
 *   - relocated : retrouvé tel quel dans la feuille d'un autre jour ;
 *   - approximate : rien de tel quel, mais la feuille de la journée de la
 *     trace contient au moins 75 % des mots de l'extrait (reformulé par
 *     l'analyse) : les phrases d'où ils viennent sont encadrées — toujours
 *     présenté comme approché, jamais comme retrouvé (décision du 2026-10-14) ;
 *   - not-found : nulle part ; no-text : aucune journée n'a de texte.
 */
export function findPassage({ primary, secondary = null, dates, locate, approximate = null }) {
  const order = searchOrder(primary, secondary, dates)
  const headCount = secondary && secondary !== primary ? 2 : 1
  let searched = 0
  const own = []
  for (const d of order.slice(0, headCount)) {
    const r = locate(d)
    if (r === null) continue
    searched++
    own.push({ date: d, ranges: r })
    if (r.some((x) => x.complete)) return { date: d, ranges: r, status: 'found', searchedDays: searched }
  }
  // Ailleurs : seulement une correspondance complète ET exacte.
  for (const d of order.slice(headCount)) {
    const r = locate(d)
    if (r === null) continue
    searched++
    const strong = r.filter((x) => x.complete && x.exact)
    if (strong.length > 0) return { date: d, ranges: strong, status: 'relocated', searchedDays: searched }
  }
  const partial = own.find((o) => o.ranges.length > 0)
  if (partial) return { date: partial.date, ranges: partial.ranges, status: 'partial', searchedDays: searched }
  // Approché : seulement dans la journée de la trace (ailleurs, ce serait deviner).
  if (approximate) {
    for (const o of own) {
      const near = approximate(o.date)
      if (near) {
        return {
          date: o.date,
          ranges: near.ranges.map((r) => ({ from: r.from, to: r.to, complete: false, exact: false, approximate: true })),
          status: 'approximate',
          share: near.share,
          searchedDays: searched,
        }
      }
    }
  }
  return { date: own[0]?.date ?? primary, ranges: [], status: searched > 0 ? 'not-found' : 'no-text', searchedDays: searched }
}
