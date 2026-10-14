// Remise d'une cartographie du site à l'interface de cartographie (journal
// de la cartographie D-43) : « Partager depuis l'interface » (Mes
// cartographies, apprenant) et « Ouvrir dans l'interface » (relecture,
// cartographe). L'interface lit telles quelles les journées et parcours du
// site ; une analyse Twin9 (carto_evolutive natif) passe d'abord par
// l'adaptateur du moteur, comme dans la visionneuse « Voir ». Rien ne quitte
// le navigateur : les fichiers sont remis à l'interface, qui les importe dans
// un nouveau jeu.
import { twin9ToMergeDocument } from '@engine/twin9/mapper.js'
import { loadPublishedReferentiel } from '../data/referentiel.js'

/**
 * Nom du fichier d'une cartographie du site (téléchargement, rapport d'import).
 * @param {{type: string, document?: object, updatedAt?: string}} entry
 */
export function cartographyFileName({ type, document, updatedAt }) {
  const day = document?.date ?? document?.periode?.derniere ?? null
  const suffix = day ?? (String(updatedAt ?? '').slice(0, 10) || 'export')
  return `cartographie-${type}-${suffix}.json`
}

/**
 * Fichiers à remettre à l'interface pour une cartographie du site.
 * @param {{type: string, document: object, updatedAt?: string}} entry
 * @param {{getReferentiel?: () => Promise<object>}} [seams]
 * @returns {Promise<Array<{path: string, text: string}>>}
 * @throws {Error} analyse Twin9 sans journée datée (rien à placer sur la ligne de temps)
 */
export async function interfaceFiles(entry, { getReferentiel = loadPublishedReferentiel } = {}) {
  let document = entry.document
  if (entry.type === 'twin9') {
    const loaded = await getReferentiel()
    document = twin9ToMergeDocument(entry.document, loaded?.doc ?? loaded ?? null, {
      generatedAt: entry.document?.date ?? null,
    })
  }
  return [{ path: cartographyFileName(entry), text: JSON.stringify(document) }]
}
