// Interface V3 — révisions et droit de réponse (spec §16–17).
//
// Toute sauvegarde crée une RÉVISION (identifiant, parent, date, résumé,
// empreinte) ; la source importée n'est jamais réécrite (AC-EDIT-01) et une
// révision publiée est immuable. Le droit de réponse (§17.4) porte sur chaque
// EvidenceLink : unreviewed | confirmed | nuanced | contested — contester
// retire UNIQUEMENT cette association du soutien actif.

import { uuidV4, sha256Hex } from './ids.js'
import { canonicalStringify } from './canonical-json.js'

export const REVIEW_STATES = ['unreviewed', 'confirmed', 'nuanced', 'contested']

/** Empreinte de contenu d'un master (pour les journaux et AC-EDIT-01). */
export function masterDigest(master) {
  return sha256Hex(canonicalStringify(master))
}

/**
 * Crée une NOUVELLE révision à partir d'un master et d'une fonction de
 * transformation. Le master d'entrée n'est jamais muté.
 *
 * @param {object} master
 * @param {(draft: object) => void} mutate transformation appliquée à la copie
 * @param {{summary: string, now?: string}} meta
 * @returns {object} nouveau master (révision suivante)
 */
export function withRevision(master, mutate, { summary, now = new Date().toISOString() }) {
  const draft = structuredClone(master)
  mutate(draft)
  draft.revision = {
    id: uuidV4(),
    parentId: master.revision.id,
    number: master.revision.number + 1,
    createdAt: now,
    summary,
  }
  return draft
}

/**
 * Change l'état de revue d'un lien de preuve (confirmer / nuancer / contester,
 * §17.4). Retourne le nouveau master en révision suivante.
 * Une action groupée au niveau d'une observation applique explicitement le
 * même état à chacun de ses liens (§16.2) via `allLinksOfObservation`.
 */
export function reviewEvidenceLink(master, linkId, reviewState, { note = null, now } = {}) {
  if (!REVIEW_STATES.includes(reviewState)) throw new Error(`État de revue inconnu : ${reviewState}`)
  return withRevision(
    master,
    (draft) => {
      const link = draft.evidenceLinks.find((l) => l.id === linkId)
      if (!link) throw new Error('Lien de preuve introuvable')
      link.reviewState = reviewState
      if (note !== null) link.learnerNote = note
      markStaleNarratives(draft, link.observationId)
    },
    { summary: `Revue du lien ${linkId.slice(0, 8)} : ${reviewState}`, now },
  )
}

/** Action groupée : applique le même état à TOUS les liens d'une observation. */
export function reviewObservation(master, observationId, reviewState, { now } = {}) {
  if (!REVIEW_STATES.includes(reviewState)) throw new Error(`État de revue inconnu : ${reviewState}`)
  return withRevision(
    master,
    (draft) => {
      const links = draft.evidenceLinks.filter((l) => l.observationId === observationId)
      if (links.length === 0) throw new Error('Observation sans lien de preuve')
      for (const l of links) l.reviewState = reviewState
      markStaleNarratives(draft, observationId)
    },
    { summary: `Revue groupée de l'observation ${observationId.slice(0, 8)} : ${reviewState}`, now },
  )
}

/**
 * Annotation apprenant (note privée courte, rôle réel, résultat, tags —
 * §17.4-5). `learnerRole` et `outcome` sont SAISIS, jamais déduits du rôle
 * argumentatif historique (§6.6). `effectiveDay` détermine à partir de quel
 * état temporel l'annotation contribue à une comparaison.
 */
export function annotate(master, { targetType, targetId, learnerRole = null, outcome = null, tags = [], note = null, effectiveDay = null, now = new Date().toISOString() }) {
  return withRevision(
    master,
    (draft) => {
      const existing = draft.annotations.find((a) => a.targetType === targetType && a.targetId === targetId)
      if (existing) {
        if (learnerRole !== null) existing.learnerRole = learnerRole
        if (outcome !== null) existing.outcome = outcome
        if (tags.length) existing.tags = [...tags]
        if (note !== null) existing.note = note
        if (effectiveDay !== null) existing.effectiveDay = effectiveDay
        existing.updatedAt = now
      } else {
        draft.annotations.push({
          id: uuidV4(),
          targetType,
          targetId,
          learnerRole,
          outcome,
          tags: [...tags],
          note,
          createdAt: now,
          updatedAt: now,
          effectiveDay,
          originRevisionId: master.revision.id,
        })
      }
    },
    { summary: `Annotation ${targetType} ${String(targetId).slice(0, 8)}`, now },
  )
}

/**
 * Marque `stale` les narratifs dépendant d'une observation modifiée (§16.4,
 * AC-EDIT-03). Un narratif obsolète n'est jamais exporté (share.js).
 */
export function markStaleNarratives(draft, observationId) {
  const obs = draft.observations.find((o) => o.id === observationId)
  for (const n of draft.derivedNarratives) {
    const dependsOnObs = Array.isArray(n.dependsOn) && n.dependsOn.includes(observationId)
    const dependsOnDay = Array.isArray(n.dependsOn) && n.dependsOn.includes('*day*') && obs && n.dayId === obs.dayId
    if (dependsOnObs || dependsOnDay) n.freshness = 'stale'
  }
}

/**
 * Applique un JSON complet proposé par l'éditeur expert (§16.3) : refuse de
 * remplacer une révision valide par un document invalide (AC-EDIT-02).
 * La validation minimale porte sur l'enveloppe et les invariants structurels.
 */
export function applyExpertJson(master, candidate, { now } = {}) {
  const errors = validateMasterShape(candidate)
  if (errors.length > 0) {
    return { ok: false, errors, master } // le brouillon invalide reste à l'éditeur
  }
  const next = withRevision(master, (draft) => {
    for (const key of ['days', 'observations', 'evidenceLinks', 'passages', 'annotations', 'derivedNarratives', 'portfolioDocuments', 'portfolioOccurrences']) {
      draft[key] = structuredClone(candidate[key])
    }
    // Toute modification structurelle marque l'ensemble des narratifs à revoir.
    for (const n of draft.derivedNarratives) if (n.freshness === 'current') n.freshness = 'stale'
  }, { summary: 'Édition JSON experte', now })
  return { ok: true, errors: [], master: next }
}

/** Validation de forme d'un master (utilisée par l'éditeur JSON expert). */
export function validateMasterShape(doc) {
  const errors = []
  if (!doc || typeof doc !== 'object') return ['Document illisible (objet attendu)']
  if (doc.kind !== 'competency-map-master') errors.push('kind ≠ competency-map-master')
  if (typeof doc.schemaVersion !== 'string') errors.push('schemaVersion manquant')
  for (const key of ['days', 'observations', 'evidenceLinks', 'passages']) {
    if (!Array.isArray(doc[key])) errors.push(`${key} : tableau attendu`)
  }
  if (errors.length > 0) return errors
  const dayIds = new Set(doc.days.map((d) => d.id))
  const obsIds = new Set()
  for (const o of doc.observations) {
    if (obsIds.has(o.id)) errors.push(`observation dupliquée : ${o.id}`)
    obsIds.add(o.id)
    if (!dayIds.has(o.dayId)) errors.push(`observation ${o.id} : journée inconnue`)
    if (!['established', 'not_established', 'needs_review', 'unknown'].includes(o.normalizedStatus)) {
      errors.push(`observation ${o.id} : statut invalide ${o.normalizedStatus}`)
    }
  }
  const passageIds = new Set(doc.passages.map((p) => p.id))
  for (const l of doc.evidenceLinks) {
    if (!obsIds.has(l.observationId)) errors.push(`lien ${l.id} : observation inconnue`)
    if (l.passageId !== null && !passageIds.has(l.passageId)) errors.push(`lien ${l.id} : passage inconnu`)
    if (!REVIEW_STATES.includes(l.reviewState)) errors.push(`lien ${l.id} : reviewState invalide`)
  }
  return errors
}
