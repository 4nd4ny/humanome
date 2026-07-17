// Interface V3 — réimport d'un JSON employeur (spec §19.5).
//
// Deux commandes : « Ouvrir en lecture seule » (reproduction autonome de la
// vue) et « Dupliquer pour réduire ou personnaliser » (l'instantané devient
// une nouvelle source immuable ; les autorisations du projet dérivé restent
// un SOUS-ENSEMBLE MONOTONE de son contenu — AC-SHARE-18). Avant tout
// affichage, le digest canonique est recalculé : une divergence bloque les
// deux commandes et met le fichier en quarantaine (AC-SHARE-20).

import { verifyIntegrity } from './canonical-json.js'
import { uuidV4 } from './ids.js'
import { PROJECT_SCHEMA_VERSION } from './share.js'

/**
 * Vérifie et ouvre un instantané employeur.
 * @param {object} snapshot JSON parsé
 * @returns {{ok: true, snapshot: object} | {ok: false, error: string}}
 */
export function openShareSnapshot(snapshot) {
  if (snapshot?.kind !== 'competency-map-share') {
    return { ok: false, error: 'Ce fichier n’est pas un instantané employeur V3 (kind attendu : competency-map-share).' }
  }
  const integrity = verifyIntegrity(snapshot)
  if (!integrity.valid) {
    return {
      ok: false,
      error: 'Erreur d’intégrité : l’empreinte recalculée ne correspond pas à integrity.contentDigest. Le fichier est mis en quarantaine (ni visualisation, ni duplication).',
    }
  }
  return { ok: true, snapshot }
}

/**
 * Duplique un instantané public en NOUVEAU projet privé « réduire ou
 * personnaliser » : aucune donnée du master d'origine ne réapparaît, aucun
 * élargissement possible (le contenu de l'instantané EST le nouvel univers).
 *
 * @param {object} snapshot instantané VÉRIFIÉ (openShareSnapshot)
 * @param {{name: string, now?: string}} opts
 * @returns {{project: object, sourceSnapshot: object}}
 */
export function duplicateAsProject(snapshot, { name, now = new Date().toISOString() }) {
  // L'instantané devient la source immuable ; toutes ses associations sont
  // initialement AUTORISÉES (conserver = sous-ensemble maximal), l'utilisateur
  // ne peut ensuite que retirer.
  const project = {
    kind: 'competency-map-project',
    schemaVersion: PROJECT_SCHEMA_VERSION,
    private: true,
    id: uuidV4(),
    name,
    state: 'draft',
    masterDatasetId: null, // AUCUN lien avec le master d'origine (§19.5)
    masterRevisionId: null,
    masterDigest: snapshot.integrity.contentDigest, // la source est l'instantané
    sourceKind: 'competency-map-share',
    temporalPrecision: snapshot.temporal?.precision ?? 'hidden',
    allowed: {
      evidenceLinkIds: snapshot.evidenceLinks.map((l) => l.id),
      passageIds: snapshot.passages.map((p) => p.id),
      documentModes: Object.fromEntries(snapshot.portfolioDocuments.map((d) => [d.id, d.type === 'learner-summary' ? 'summary' : 'extracts'])),
      fields: { learnerRole: true, outcome: true, tags: true, contexte: true, auteur: true },
    },
    summaries: snapshot.portfolioDocuments
      .filter((d) => d.type === 'learner-summary')
      .map((d) => ({ id: d.id, code: d.competencyCode, text: d.summary, provenance: d.provenance })),
    journal: [{ at: now, action: 'duplicated', summary: 'Dupliqué depuis un instantané public (réduction seule possible)' }],
    previewLock: null,
    publishedRevisions: [],
  }
  return { project, sourceSnapshot: snapshot }
}

/**
 * Convertit un instantané vérifié en « pseudo-master » LECTURE SEULE pour le
 * moteur de rendu (même moteur pour prévisualisation et vue employeur §18.8).
 * Les identifiants sont déjà publics ; aucune donnée privée n'existe ici.
 */
export function snapshotToViewModel(snapshot) {
  const precision = snapshot.temporal?.precision ?? 'hidden'
  const dayDates = new Map((snapshot.temporal?.days ?? []).map((d) => [d.id, d.date]))
  const monthDates = new Map((snapshot.temporal?.months ?? []).map((m) => [m.id, m.month]))

  const days = []
  const seen = new Set()
  const dateOfObservation = (o) => {
    if (precision === 'day') return dayDates.get(o.dayId) ?? null
    if (precision === 'month') return monthDates.get(o.monthId) ?? null
    return null
  }
  for (const o of snapshot.observations) {
    const date = dateOfObservation(o)
    const key = date ?? 'sans-date'
    if (!seen.has(key)) {
      seen.add(key)
      days.push({ id: precision === 'day' ? o.dayId : precision === 'month' ? o.monthId : 'hidden', effectiveDate: date, activeVariantId: 'public', provenance: [] })
    }
  }

  return {
    kind: 'share-view-model',
    precision,
    metricDefinition: snapshot.metricDefinition,
    referential: snapshot.referential,
    days,
    observations: snapshot.observations.map((o) => ({
      ...o,
      rawCode: o.competencyCode,
      normalizedStatus: 'established',
      courtCircuit: false,
      variantId: 'public',
      date: dateOfObservation(o),
    })),
    evidenceLinks: snapshot.evidenceLinks.map((l) => ({ ...l, linkState: 'resolved', reviewState: 'unreviewed' })),
    passages: snapshot.passages,
    portfolioDocuments: snapshot.portfolioDocuments,
    portfolioOccurrences: snapshot.portfolioOccurrences,
  }
}
