// Pont vers web/src/lib/carto-store.js (chantier C, contrat M6).
//
// Le module carto-store est livré par le chantier C EN PARALLÈLE de celui-ci :
// un import statique casserait le build tant qu'il n'a pas atterri. Le glob
// non-eager renvoie {} quand le fichier n'existe pas — l'espace apprenant se
// dégrade alors proprement (message + téléchargement JSON au lieu de la
// sauvegarde locale) sans jamais casser la suite de tests ni le bundle.
//
// Contrat consommé (fixé M6) :
//   listCartographies() ; saveCartography(entry) -> {id} ; getCartography(id) ;
//   removeCartography(id) ; updateCartography(id, patch) —
//   entry = {type: 'jour'|'merge', titre, visibility, document,
//            promptPackage, referentiel, runMeta, serverId, updatedAt}.

const modules = import.meta.glob('../../lib/carto-store.js')
const KEY = '../../lib/carto-store.js'

/** @returns {boolean} vrai quand le module du chantier C est présent */
export function hasCartoStore() {
  return Boolean(modules[KEY])
}

/**
 * Charge le module carto-store s'il existe.
 * @returns {Promise<object | null>} le module (fonctions du contrat), ou null
 */
export async function loadCartoStore() {
  const loader = modules[KEY]
  if (!loader) return null
  return loader()
}
