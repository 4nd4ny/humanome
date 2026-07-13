// humanome sunburst lib — cumulative "as of" reconstruction (timeline player).
//
// buildMergeTreeAsOf(mergeDoc, isoDate, { thresholds }) rebuilds the merged
// cartography as it stood after the sheets dated <= isoDate, by recomputing
// the per-competence aggregates from `parFeuille` with the VERBATIM rules of
// the engine (engine/src/pipeline/merge.js l.244-262) and feeding the result
// to the unchanged buildMergeTree().
//
// Levels use FIXED thresholds (the 4 quintile cut points computed ONCE on the
// finally-established competences, finalThresholds()): the last frame then
// reproduces the published merge document exactly (same niveaux, same points),
// and intermediate frames do not flicker with the shifting peer distribution.
//
// Non-numeric metadata (id, description, color, feedback, archetype, tendance…)
// is carried over from the FINAL document by `code`: the narratives are final
// outputs, only the numbers are historicized. DOM-free ESM module.

import { pythonRound } from '@engine/pipeline/merge.js'
import { quantilesExclusive } from '@engine/pipeline/merge-document.js'
import { buildMergeTree } from './build-tree.js'

const STATUT_ETABLIE = 'présence établie'
const STATUT_RENVOI = 'renvoi au cartographe'

/**
 * The 4 fixed quintile thresholds of the FINAL document: quantiles exclusifs
 * (statistics.quantiles de Python, comme computeNiveaux du moteur) des
 * score_moyen_par_feuille de toutes les compétences rendues.
 * Returns [] when fewer than 2 competences are rendered (degenerate case,
 * mirrored on computeNiveaux: the single competence gets the neutral level 3).
 * @param {object} mergeDoc document `cartographie-merge`
 * @returns {number[]} 4 seuils croissants (ou [])
 */
export function finalThresholds(mergeDoc) {
  const values = (mergeDoc?.domains ?? []).flatMap((d) =>
    (d.competences ?? []).map((c) => c.score_moyen_par_feuille),
  )
  if (values.length < 2) return []
  return quantilesExclusive(values, 5)
}

/** niveau = 1 + (nb de seuils <= valeur), comme computeNiveaux (moteur). */
function niveauFromThresholds(scoreMoyenParFeuille, thresholds) {
  if (!thresholds || thresholds.length === 0) return 3 // cas dégénéré (computeNiveaux)
  return 1 + thresholds.filter((t) => scoreMoyenParFeuille >= t).length
}

/**
 * Cumulative aggregates of one competence restricted to the sheets dated
 * <= isoDate — verbatim port of the per-competence rules of mergeDays()
 * (engine/src/pipeline/merge.js l.244-262). Returns null when no sheet is
 * established yet (the competence is excluded from the frame).
 */
function competenceAsOf(comp, isoDate, thresholds) {
  const entries = (comp.parFeuille ?? []).filter((e) => e.date <= isoDate)
  const etablies = entries.filter((e) => e.statut === STATUT_ETABLIE)
  if (etablies.length === 0) return null

  const cumulPreuves = etablies.reduce((s, e) => s + e.preuves, 0)
  const cumulIndices = etablies.reduce((s, e) => s + e.indices, 0)
  const confianceMoyenne = pythonRound(
    etablies.reduce((s, e) => s + e.confiance, 0) / etablies.length,
    4,
  )
  const score = pythonRound(cumulPreuves + cumulIndices * confianceMoyenne, 2)
  const scoreMoyenParFeuille = pythonRound(score / etablies.length, 4)

  return {
    // Métadonnées non numériques reportées du document final (par code).
    id: comp.id,
    code: comp.code,
    statut: STATUT_ETABLIE,
    description: comp.description,
    feedback: comp.feedback,
    archetype: comp.archetype ?? null,
    archetype_titre: comp.archetype_titre ?? '',
    archetype_description: comp.archetype_description ?? '',
    // Agrégats recalculés à date.
    points: etablies.length,
    niveau: niveauFromThresholds(scoreMoyenParFeuille, thresholds),
    parFeuille: entries.map((e) => ({ ...e })),
    nb_feuilles_etablies: etablies.length,
    nb_feuilles_renvois: entries.filter((e) => e.statut === STATUT_RENVOI).length,
    score_cumule: score,
    score_moyen_par_feuille: scoreMoyenParFeuille,
    cumul_preuves: cumulPreuves,
    cumul_indices: cumulIndices,
    confiance_moyenne: confianceMoyenne,
  }
}

/**
 * Merge document restricted to the sheets dated <= isoDate: same shape as the
 * input document, with recomputed competences, competences without any
 * established sheet EXCLUDED, and poles left empty EXCLUDED. Usable both by
 * buildMergeTree() and by the selection resolution of the merge view
 * (findMergeNode walks doc.domains).
 *
 * @param {object} mergeDoc document `cartographie-merge` final
 * @param {string} isoDate date ISO (YYYY-MM-DD) incluse
 * @param {{thresholds?: number[]}} [options] seuils fixes (finalThresholds par
 *   défaut — les précalculer pour une série de trames)
 * @returns {object} document filtré (domains recalculés, reste partagé)
 */
export function mergeDocAsOf(mergeDoc, isoDate, { thresholds } = {}) {
  const th = thresholds ?? finalThresholds(mergeDoc)
  const domains = (mergeDoc?.domains ?? [])
    .map((domain) => {
      const competences = (domain.competences ?? [])
        .map((comp) => competenceAsOf(comp, isoDate, th))
        .filter(Boolean)
      if (competences.length === 0) return null // pôle vide exclu
      return {
        ...domain, // id, color, rapport_html, tendance_* reportés du final
        competences,
        parFeuille: (domain.parFeuille ?? []).filter((e) => e.date <= isoDate),
      }
    })
    .filter(Boolean)
  return { ...mergeDoc, domains }
}

/**
 * Cumulative sunburst tree as of isoDate.
 * @param {object} mergeDoc document `cartographie-merge` final
 * @param {string} isoDate date ISO (YYYY-MM-DD) incluse
 * @param {{thresholds?: number[], buildTree?: Function}} [options] seuils fixes
 *   et constructeur d'arbre (buildMergeTree réel par défaut ; injectable en test)
 * @returns {{root: object} | null} arbre au format de buildMergeTree()
 */
export function buildMergeTreeAsOf(mergeDoc, isoDate, { thresholds, buildTree } = {}) {
  const build = buildTree ?? buildMergeTree
  return build(mergeDocAsOf(mergeDoc, isoDate, { thresholds }))
}
