// Merge CÔTÉ CLIENT des documents jour d'un membre (décision M8, ADR-005) :
// le worker serveur n'exécute que l'extraction LLM ; la fusion déterministe
// (parité oracle, P5) reste au moteur JS et se calcule ICI, au moment de
// l'affichage par l'établissement — même motif que run-launcher.executeRun
// (mergeDays + buildMergeDocument avec narratifs LOCAUX, sans appel LLM).

import { mergeDays } from '@engine/pipeline/merge.js'
import { buildMergeDocument } from '@engine/pipeline/merge-document.js'
import { validateDocument } from '@engine/validation.js'
import { buildLocalNarratives } from '../../lib/run-launcher.js'

/**
 * Déduplique les documents jour par date (garde le dernier reçu) et les trie —
 * mergeDays exige des dates uniques ; un membre peut appartenir à plusieurs
 * cohortes du même établissement avec des extractions rejouées.
 *
 * @param {Array<{date: string, document: object}>} entries
 * @returns {object[]} documents cartographie-jour, dates uniques, triés
 */
export function uniqueDayDocuments(entries) {
  const byDate = new Map()
  for (const entry of entries ?? []) {
    if (entry?.document && typeof entry.date === 'string') {
      byDate.set(entry.date, entry.document)
    }
  }
  return [...byDate.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([, doc]) => doc)
}

/**
 * Construit la cartographie-merge d'un membre à partir de ses documents jour.
 * Échec NON destructif : le schéma exige au moins une compétence établie dans
 * chacun des 7 pôles — un portfolio court peut rendre la fusion non
 * constructible ; les documents jour restent alors consultables un à un.
 *
 * @param {object[]} dayDocs documents cartographie-jour (dates uniques)
 * @param {object} referentiel document référentiel publié
 * @param {{journalId?: string, now?: () => string}} [options]
 * @returns {{document: object|null, error: string|null}}
 */
export function buildMemberMerge(dayDocs, referentiel, options = {}) {
  const now = options.now ?? (() => new Date().toISOString())
  if (!Array.isArray(dayDocs) || dayDocs.length === 0) {
    return { document: null, error: 'Aucun document jour à fusionner.' }
  }
  try {
    const merged = mergeDays(dayDocs, referentiel)
    const stamp = String(now()).slice(0, 19) // schéma : AAAA-MM-JJThh:mm:ss
    const document = buildMergeDocument(
      { ...merged, date_construction: stamp },
      buildLocalNarratives(merged),
      {
        journalId: options.journalId ?? 'cohorte',
        sourceProtocole:
          'Extraction de masse M8 — merge déterministe calculé côté client (moteur JS)',
        generatedAt: stamp,
      },
    )
    const { valid, errors } = validateDocument('cartographie-merge', document)
    if (!valid) {
      const detail = errors.slice(0, 3).map((e) => `${e.path} ${e.message}`).join(' ; ')
      throw new Error(`${errors.length} erreur(s) de schéma : ${detail}`)
    }
    return { document, error: null }
  } catch (err) {
    return {
      document: null,
      error:
        'La cartographie fusionnée n’a pas pu être construite : le format exige au moins ' +
        'une compétence établie dans chacun des 7 pôles sur la période. Les documents ' +
        'journaliers restent consultables individuellement. Détail technique : ' +
        (err instanceof Error ? err.message : String(err)),
    }
  }
}
