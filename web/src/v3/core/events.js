// Interface V3 — règle de création des événements (spec §10).
//
// Une entrée dans competences[] n'est PAS automatiquement un événement : le
// format historique contient généralement tout le référentiel. Une observation
// positive ADMISSIBLE respecte TOUTES les conditions :
//   1. normalizedStatus = established ;
//   2. courtCircuit = false ;
//   3. ≥ 1 EvidenceLink RÉSOLU vers un passage admissible (indépendamment de
//      verdict.nombrePreuves et du libellé historique du rôle) ;
//   4. ≥ 1 lien de soutien non contesté sans résolution ;
//   5. la variante de la journée est active ;
//   6. l'observation est autorisée pour l'audience courante.
//
// `verdict.confiance` est la confiance dans le VERDICT (y compris de
// non-présence) : elle n'entre jamais dans l'admissibilité ni dans le rayon
// (AC-DATA-05).

/**
 * Index des liens de preuve par observation.
 * @param {Array} evidenceLinks
 * @returns {Map<string, Array>}
 */
export function linksByObservation(evidenceLinks) {
  const map = new Map()
  for (const link of evidenceLinks) {
    const list = map.get(link.observationId) ?? []
    list.push(link)
    map.set(link.observationId, list)
  }
  return map
}

/**
 * Liens de SOUTIEN ACTIF d'une observation : résolus, non contestés, et
 * autorisés par l'audience (allowedLinkIds = null en espace privé).
 * Contester un lien retire UNIQUEMENT cette association (§17.4, AC-EDIT-04).
 */
export function supportingLinks(links, { allowedLinkIds = null } = {}) {
  return (links ?? []).filter(
    (l) =>
      l.linkState === 'resolved' &&
      l.reviewState !== 'contested' &&
      (allowedLinkIds === null || allowedLinkIds.has(l.id)),
  )
}

/**
 * Une observation est-elle positive et admissible ?
 *
 * @param {object} observation
 * @param {{links: Array, activeVariantIds: Set<string>,
 *   allowedObservationIds?: Set<string> | null, allowedLinkIds?: Set<string> | null}} ctx
 */
export function isAdmissible(observation, { links, activeVariantIds, allowedObservationIds = null, allowedLinkIds = null }) {
  if (observation.normalizedStatus !== 'established') return false
  if (observation.courtCircuit) return false
  if (!activeVariantIds.has(observation.variantId)) return false
  if (allowedObservationIds !== null && !allowedObservationIds.has(observation.id)) return false
  return supportingLinks(links, { allowedLinkIds }).length > 0
}

/**
 * Calcule l'ensemble des ÉVÉNEMENTS admissibles du master pour une audience.
 *
 * @param {object} master
 * @param {{allowedObservationIds?: Set<string> | null, allowedLinkIds?: Set<string> | null}} [audience]
 *   null = espace privé (tout autorisé).
 * @returns {{
 *   admissible: Array<{observation: object, day: object, date: string, links: Array}>,
 *   needsReview: Array<object>,
 *   daysByCompetency: Map<string, Set<string>>,   // code → dates effectives distinctes
 *   competenciesByDate: Map<string, Set<string>>, // date → codes distincts
 * }}
 */
export function computeEvents(master, { allowedObservationIds = null, allowedLinkIds = null } = {}) {
  const activeVariantIds = new Set(master.days.map((d) => d.activeVariantId).filter(Boolean))
  const dayById = new Map(master.days.map((d) => [d.id, d]))
  const byObs = linksByObservation(master.evidenceLinks)

  const admissible = []
  const needsReview = []
  const daysByCompetency = new Map()
  const competenciesByDate = new Map()

  for (const obs of master.observations) {
    const links = byObs.get(obs.id) ?? []
    const day = dayById.get(obs.dayId)
    if (!day) continue
    if (obs.normalizedStatus === 'needs_review' && activeVariantIds.has(obs.variantId)) {
      needsReview.push(obs)
    }
    if (!isAdmissible(obs, { links, activeVariantIds, allowedObservationIds, allowedLinkIds })) continue
    const date = day.effectiveDate
    admissible.push({ observation: obs, day, date, links: supportingLinks(links, { allowedLinkIds }) })
    const dates = daysByCompetency.get(obs.rawCode) ?? new Set()
    dates.add(date)
    daysByCompetency.set(obs.rawCode, dates)
    const codes = competenciesByDate.get(date) ?? new Set()
    codes.add(obs.rawCode)
    competenciesByDate.set(date, codes)
  }

  return { admissible, needsReview, daysByCompetency, competenciesByDate }
}
