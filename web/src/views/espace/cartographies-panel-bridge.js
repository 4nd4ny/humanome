// Pont vers ./CartographiesPanel.jsx (chantier C, contrat M6).
//
// Même motif que carto-store-bridge.js : le panneau « Mes cartographies »
// (confidentialité, partage, export) est livré par le chantier C ; un import
// statique casserait le build tant qu'il n'existe pas. Le glob non-eager rend
// la présence du module détectable sans l'importer.

const modules = import.meta.glob('./CartographiesPanel.jsx')
const KEY = './CartographiesPanel.jsx'

/** @returns {boolean} vrai quand le panneau du chantier C est présent */
export function hasCartographiesPanel() {
  return Boolean(modules[KEY])
}

/**
 * Charge le composant CartographiesPanel s'il existe.
 * @returns {Promise<import('react').ComponentType | null>}
 */
export async function loadCartographiesPanel() {
  const loader = modules[KEY]
  if (!loader) return null
  const mod = await loader()
  return mod?.default ?? null
}
