// Interface ultime — copie autonome (spec §11, point 2) : insertion de
// l'archive dans le modèle HTML construit par scripts/build-viewer.mjs.

/** Emplacement des données dans le modèle. */
export const DATA_SLOT = '<script type="application/json" id="carto-data">null</script>'

/**
 * JSON sûr dans un <script> : aucun « </script> », aucun séparateur de ligne
 * Unicode brut (U+2028, U+2029).
 */
export function scriptSafeJson(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029')
}

/**
 * @param {string} template modèle HTML (public/carto/viewer-template.html)
 * @param {object} archive archive (buildArchive)
 * @returns {string} un fichier HTML autonome
 */
export function injectArchive(template, archive) {
  if (typeof template !== 'string' || !template.includes(DATA_SLOT)) throw new Error('modèle de copie autonome invalide')
  // Remplacement par fonction : le JSON peut contenir « $& », « $' »…
  return template.replace(DATA_SLOT, () => `<script type="application/json" id="carto-data">${scriptSafeJson(archive)}</script>`)
}
