// Interface V3 — comparaison ipsative et récit déterministe (spec §17.2-3).
//
// La comparaison confronte l'apprenant à SES états antérieurs, jamais à une
// cohorte (AC-REFL-01). Les états comparés sont l'état cumulatif à
// `baselineDay` et celui à `playheadDay` ; la période d'événements est
// inclusive. « Ce qui a changé » est construit uniquement depuis les
// différences structurées : aucune causalité inventée, chaque phrase renvoie
// aux journées et preuves concernées (AC-REFL-02).

/**
 * Préréglages personnels (§17.2). Jours civils du profil.
 * @param {string} preset 'last-evaluation' | 'quarter-start' | 'year-start'
 * @param {{playheadDay: string, activeDates: string[]}} ctx dates ACTIVES triées
 * @returns {{baselineDay: string} | {unavailable: string}}
 */
export function resolveBaselinePreset(preset, { playheadDay, activeDates }) {
  const sorted = [...activeDates].sort()
  if (preset === 'last-evaluation') {
    // Journée active immédiatement antérieure à la tête de lecture.
    const before = sorted.filter((d) => d < playheadDay)
    if (before.length === 0) {
      return { unavailable: 'Aucune journée active antérieure à la tête de lecture : « depuis la dernière évaluation » est indisponible.' }
    }
    return { baselineDay: before[before.length - 1] }
  }
  if (preset === 'quarter-start') {
    const [y, m] = playheadDay.split('-').map(Number)
    const qMonth = m <= 3 ? 1 : m <= 6 ? 4 : m <= 9 ? 7 : 10
    return { baselineDay: `${y}-${String(qMonth).padStart(2, '0')}-01` }
  }
  if (preset === 'year-start') {
    return { baselineDay: `${playheadDay.slice(0, 4)}-01-01` }
  }
  throw new Error(`Préréglage inconnu : ${preset}`)
}

/**
 * Compare deux états cumulatifs (baseline ≤ playhead).
 *
 * @param {Map<string, Set<string>>} daysByCompetency code → dates admissibles autorisées
 * @param {{baselineDay: string, playheadDay: string, annotations?: Array}} opts
 * @returns {{
 *   newlyDocumented: Array<{code: string, dates: string[]}>,   // 0 avant, ≥1 après
 *   reobserved: Array<{code: string, newDates: string[]}>,     // déjà documentée, revue
 *   stable: string[],                                          // aucune nouvelle journée
 *   newDays: string[],                                         // journées de la période
 *   newTags: Array<{tag: string, targetId: string}>,           // tags confirmés dans la période
 * }}
 */
export function compareStates(daysByCompetency, { baselineDay, playheadDay, annotations = [] }) {
  const newlyDocumented = []
  const reobserved = []
  const stable = []
  const newDaySet = new Set()

  for (const [code, dates] of daysByCompetency) {
    const before = [...dates].filter((d) => d <= baselineDay)
    const added = [...dates].filter((d) => d > baselineDay && d <= playheadDay).sort()
    for (const d of added) newDaySet.add(d)
    if (added.length === 0) {
      if (before.length > 0) stable.push(code)
      continue
    }
    if (before.length === 0) newlyDocumented.push({ code, dates: added })
    else reobserved.push({ code, newDates: added })
  }

  const newTags = []
  for (const a of annotations) {
    if (!Array.isArray(a.tags) || a.tags.length === 0) continue
    const day = a.effectiveDay ?? null
    if (day && day > baselineDay && day <= playheadDay) {
      for (const tag of a.tags) newTags.push({ tag, targetId: a.targetId })
    }
  }

  return {
    newlyDocumented: newlyDocumented.sort((a, b) => a.code.localeCompare(b.code)),
    reobserved: reobserved.sort((a, b) => a.code.localeCompare(b.code)),
    stable: stable.sort(),
    newDays: [...newDaySet].sort(),
    newTags,
  }
}

/**
 * Récit déterministe « Ce qui a changé » (§17.3) : chaque phrase porte les
 * références (codes, dates) qui la justifient — jamais de causalité inventée.
 *
 * @param {ReturnType<typeof compareStates>} diff
 * @param {{nameOf: (code: string) => string}} opts
 * @returns {Array<{text: string, refs: {codes?: string[], dates?: string[]}}>}
 */
export function whatChanged(diff, { nameOf }) {
  const phrases = []
  if (diff.newDays.length > 0) {
    phrases.push({
      text: `${diff.newDays.length} nouvelle${diff.newDays.length > 1 ? 's' : ''} journée${diff.newDays.length > 1 ? 's' : ''} documentée${diff.newDays.length > 1 ? 's' : ''} sur la période.`,
      refs: { dates: diff.newDays },
    })
  }
  for (const item of diff.newlyDocumented) {
    phrases.push({
      text: `« ${nameOf(item.code)} » (${item.code}) est documentée pour la première fois (${item.dates.join(', ')}).`,
      refs: { codes: [item.code], dates: item.dates },
    })
  }
  for (const item of diff.reobserved) {
    phrases.push({
      text: `« ${nameOf(item.code)} » (${item.code}) est observée de nouveau (${item.newDates.join(', ')}).`,
      refs: { codes: [item.code], dates: item.newDates },
    })
  }
  if (diff.newTags.length > 0) {
    const tags = [...new Set(diff.newTags.map((t) => t.tag))].sort()
    phrases.push({ text: `Nouveaux contextes confirmés : ${tags.join(', ')}.`, refs: {} })
  }
  if (diff.stable.length > 0) {
    phrases.push({
      text: `${diff.stable.length} compétence${diff.stable.length > 1 ? 's' : ''} déjà documentée${diff.stable.length > 1 ? 's' : ''} sans nouvelle journée sur la période.`,
      refs: { codes: diff.stable },
    })
  }
  if (phrases.length === 0) {
    phrases.push({ text: 'Aucune différence documentée entre les deux états.', refs: {} })
  }
  return phrases
}
