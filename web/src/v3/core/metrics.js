// Interface V3 — métriques versionnées et langage du soleil (spec §11, §18.7).
//
// Le format historique ne contient PAS de niveau de maîtrise comparable dans
// le temps : la V3 n'en invente pas. Le soleil encode :
//   angle  = emplacement FIXE et égal par compétence (famille = somme) ;
//   rayon  = journées distinctes avec observation positive admissible ≤ tête
//            de lecture, via une transformation VERSIONNÉE ;
//   halo   = contribution de la journée inspectée ;
//   fantôme = observation postérieure à la tête de lecture.
//
// La métrique publique change avec la précision temporelle pour ne pas révéler
// indirectement un nombre de jours (§18.7) :
//   day    → documented-days-v1    (référence graphique 64)
//   month  → documented-months-v1  (référence graphique 24)
//   hidden → public-presence-v1    (présence binaire, aucun compte temporel)

export const METRICS = {
  'documented-days-v1': { id: 'documented-days-v1', reference: 64, unit: 'jour' },
  'documented-months-v1': { id: 'documented-months-v1', reference: 24, unit: 'mois' },
  'public-presence-v1': { id: 'public-presence-v1', reference: 1, unit: 'présence' },
}

/** Métrique par défaut d'une précision temporelle (§18.7). */
export function metricForPrecision(precision) {
  if (precision === 'day') return METRICS['documented-days-v1']
  if (precision === 'month') return METRICS['documented-months-v1']
  if (precision === 'hidden') return METRICS['public-presence-v1']
  throw new Error(`Précision temporelle inconnue : ${precision}`)
}

/**
 * Proportion radiale versionnée (documented-days-v1 et documented-months-v1) :
 *   proportion = min(1, log2(1 + n) / log2(reference + 1))
 * `reference` est un PLAFOND GRAPHIQUE, pas un niveau : le nombre exact reste
 * toujours affiché, au-delà le rayon reste maximal (§11.1).
 *
 * @param {number} n unités distinctes (jours ou mois)
 * @param {number} reference 64 (jours) ou 24 (mois)
 */
export function radialProportion(n, reference) {
  if (n <= 0) return 0
  return Math.min(1, Math.log2(1 + n) / Math.log2(reference + 1))
}

/** Libellé du compte (« 64+ journées documentées » au-delà du plafond, §11.1). */
export function countLabel(n, metric) {
  const unite = metric.unit === 'mois' ? 'mois' : `journée${n > 1 ? 's' : ''}`
  if (metric.id === 'public-presence-v1') {
    return n > 0 ? 'au moins un soutien public' : 'aucun soutien public'
  }
  if (n > metric.reference) return `${metric.reference}+ ${unite} documentées (${n} au total)`
  return `${n} ${unite} documentée${n > 1 && metric.unit !== 'mois' ? 's' : ''}`
}

/**
 * Valeurs du soleil pour une audience et une tête de lecture données.
 *
 * @param {Map<string, Set<string>>} daysByCompetency code → dates effectives
 * @param {{playheadDay?: string | null, metric?: object}} opts
 *   playheadDay = borne incluse ; null = tout.
 * @returns {Map<string, {count: number, proportion: number, futureCount: number}>}
 */
export function sunValues(daysByCompetency, { playheadDay = null, metric = METRICS['documented-days-v1'] } = {}) {
  const out = new Map()
  for (const [code, dates] of daysByCompetency) {
    let count = 0
    let futureCount = 0
    for (const d of dates) {
      if (playheadDay === null || d <= playheadDay) count++
      else futureCount++
    }
    out.set(code, {
      count,
      proportion: metric.id === 'public-presence-v1' ? (count > 0 ? 1 : 0) : radialProportion(count, metric.reference),
      futureCount,
    })
  }
  return out
}

/**
 * Densités de heatmap (spec §11.3) — seuils FIXES pendant le filtrage :
 * 0 neutre · 1 faible · 2–3 moyenne · 4–7 forte · ≥8 très forte.
 * @param {number} n compétences positives admissibles du jour dans la portée
 * @returns {0|1|2|3|4}
 */
export function heatmapLevel(n) {
  if (n <= 0) return 0
  if (n === 1) return 1
  if (n <= 3) return 2
  if (n <= 7) return 3
  return 4
}

/** AAAA-MM d'une date civile AAAA-MM-JJ. */
export function monthOf(date) {
  return date.slice(0, 7)
}

/** Agrège des dates en mois distincts (précision month, §18.7). */
export function distinctMonths(dates) {
  return new Set([...dates].map(monthOf))
}

/**
 * Explication « Pourquoi ce rayon ? » (spec §11.2) : nom et version de la
 * métrique, compte exact, unités contributrices — et rien d'autre sous une
 * précision restreinte (AC-SYNC-05).
 *
 * @param {string} code
 * @param {Set<string>} dates dates effectives admissibles et AUTORISÉES
 * @param {{playheadDay?: string | null, metric: object}} opts
 */
export function whyRadius(code, dates, { playheadDay = null, metric }) {
  const retained = [...dates].filter((d) => playheadDay === null || d <= playheadDay).sort()
  if (metric.id === 'documented-months-v1') {
    const months = [...new Set(retained.map(monthOf))].sort()
    return { code, metric: metric.id, count: months.length, units: months, label: countLabel(months.length, metric) }
  }
  if (metric.id === 'public-presence-v1') {
    const present = retained.length > 0
    return { code, metric: metric.id, count: present ? 1 : 0, units: [], label: countLabel(present ? 1 : 0, metric) }
  }
  return { code, metric: metric.id, count: retained.length, units: retained, label: countLabel(retained.length, metric) }
}
