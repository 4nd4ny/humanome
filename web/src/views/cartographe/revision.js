// Construction d'une RÉVISION de cartographie par le cartographe (P9, cahier
// §3.3) : champs de verdict contrôlés (statut / confiance / motif /
// prescription) appliqués compétence par compétence à un document
// « cartographie-jour », SANS édition de JSON brut. Le document révisé est
// validé côté client (engine validateDocument) avant tout POST — le serveur
// revalide de son côté (Validation.php, contrat M7).
//
// Module pur (zéro DOM, zéro E/S) : testé unitairement.

/** Statuts de verdict admis par le schéma cartographie-jour. */
export const VERDICT_STATUTS = Object.freeze([
  'présence établie',
  'présence non établie',
  'renvoi au cartographe',
])

/**
 * Codes des compétences instruites dans un document (jour OU merge), avec le
 * verdict/valeurs utiles à l'éditeur. Trié par code.
 * @param {object} doc document cartographie-jour ou cartographie-merge
 * @returns {Array<{code: string, verdict: object | null}>}
 */
export function listCompetences(doc) {
  const out = []
  if (doc?.kind === 'cartographie-jour') {
    for (const pole of doc.poles ?? []) {
      for (const comp of pole.competences ?? []) {
        out.push({ code: comp.code, verdict: comp.verdict ?? null })
      }
    }
  } else if (doc?.kind === 'cartographie-merge') {
    for (const domain of doc.domains ?? []) {
      for (const comp of domain.competences ?? []) {
        out.push({ code: comp.code, verdict: null })
      }
    }
  }
  return out.sort((a, b) => a.code.localeCompare(b.code))
}

/**
 * Valeurs initiales de l'éditeur de verdict pour une compétence d'un document
 * jour (motif <- motif ?? raison ; prescription <- prescription ??
 * prescriptionMinimale, mêmes replis que l'affichage DayView).
 * @param {object} doc document cartographie-jour
 * @param {string} code
 * @returns {{statut: string, confiance: number, motif: string, prescription: string} | null}
 */
export function verdictFields(doc, code) {
  const verdict = listCompetences(doc).find((c) => c.code === code)?.verdict
  if (!verdict) return null
  return {
    statut: verdict.statut ?? 'renvoi au cartographe',
    confiance: typeof verdict.confiance === 'number' ? verdict.confiance : 0.5,
    motif: verdict.motif ?? verdict.raison ?? '',
    prescription: verdict.prescription ?? verdict.prescriptionMinimale ?? '',
  }
}

/** Compteurs auditPole recomputés depuis les verdicts (cohérence après correction). */
function recomputeAudit(pole) {
  const audit = { ...pole.auditPole }
  let etablies = 0
  let nonEtablies = 0
  let renvois = 0
  for (const comp of pole.competences ?? []) {
    switch (comp.verdict?.statut) {
      case 'présence établie':
        etablies += 1
        break
      case 'renvoi au cartographe':
        renvois += 1
        break
      default:
        nonEtablies += 1
    }
  }
  audit.presencesEtablies = etablies
  audit.nonEtablies = nonEtablies
  audit.renvoisCartographe = renvois
  return audit
}

/**
 * Construit le document RÉVISÉ : clone profond du document de base + verdicts
 * corrigés + compteurs d'audit recalculés. Le type reste identique (contrat
 * M7) ; seule la cartographie-jour est corrigeable par verdict.
 *
 * @param {object} doc document cartographie-jour de base (ou révision servie)
 * @param {Map<string, {statut: string, confiance: number, motif?: string,
 *   prescription?: string}> | Record<string, object>} corrections par code
 * @returns {object} nouveau document (le document d'entrée n'est pas modifié)
 * @throws {Error} si le document n'est pas une cartographie-jour, si un code
 *   est inconnu ou si un statut/confiance corrigé est hors bornes
 */
export function buildRevision(doc, corrections) {
  if (doc?.kind !== 'cartographie-jour') {
    throw new Error(
      'La correction par verdict s’applique aux cartographies de journée (cartographie-jour).',
    )
  }
  const byCode = corrections instanceof Map ? corrections : new Map(Object.entries(corrections ?? {}))
  const revised = JSON.parse(JSON.stringify(doc))
  const seen = new Set()

  for (const pole of revised.poles ?? []) {
    for (const comp of pole.competences ?? []) {
      const patch = byCode.get(comp.code)
      if (!patch) continue
      seen.add(comp.code)
      if (!VERDICT_STATUTS.includes(patch.statut)) {
        throw new Error(`Statut de verdict invalide pour ${comp.code} : « ${patch.statut} »`)
      }
      const confiance = Number(patch.confiance)
      if (!Number.isFinite(confiance) || confiance < 0 || confiance > 1) {
        throw new Error(`Confiance hors bornes (0..1) pour ${comp.code}`)
      }
      const verdict = { ...(comp.verdict ?? { nombrePreuves: 0, nombreIndices: 0 }) }
      verdict.statut = patch.statut
      verdict.confiance = confiance
      if (typeof patch.motif === 'string' && patch.motif.trim() !== '') {
        verdict.motif = patch.motif.trim()
      }
      if (typeof patch.prescription === 'string' && patch.prescription.trim() !== '') {
        verdict.prescription = patch.prescription.trim()
      }
      comp.verdict = verdict
    }
    pole.auditPole = recomputeAudit(pole)
  }

  for (const code of byCode.keys()) {
    if (!seen.has(code)) {
      throw new Error(`Compétence inconnue dans le document : ${code}`)
    }
  }
  return revised
}
