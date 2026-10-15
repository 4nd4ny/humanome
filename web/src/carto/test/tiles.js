// Tests de l'interface : tuiles des espaces Cartographie (journal D-53) et
// Tableau de bord (D-61).
import { CARTO_TILES, DASHBOARD_TILES, DASHBOARD_TILES_KEY, TILES_KEY } from '../ui/tiles.js'

/**
 * Affiche toutes les tuiles (ou celles données) avant le rendu, comme si la
 * personne les avait choisies dans « Panneaux » : pour les tests qui
 * manipulent la liste des journées, des compétences, la heatmap…
 * @param {string[]} [ids]
 */
export function showCartoTiles(ids = CARTO_TILES.map(([id]) => id)) {
  localStorage.setItem(TILES_KEY, JSON.stringify({ v: 1, shown: ids, order: CARTO_TILES.map(([id]) => id), sizes: {} }))
}

/**
 * Affiche toutes les cartes du tableau de bord (ou celles données) avant le
 * rendu, comme si la personne les avait choisies dans « Panneaux » (D-61).
 * @param {string[]} [ids]
 */
export function showDashboardCards(ids = DASHBOARD_TILES.map(([id]) => id)) {
  localStorage.setItem(DASHBOARD_TILES_KEY, JSON.stringify({ v: 1, shown: ids, order: DASHBOARD_TILES.map(([id]) => id), sizes: {} }))
}
