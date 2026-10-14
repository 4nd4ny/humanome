// Tests de l'interface : tuiles de l'espace Cartographie (journal D-53).
import { CARTO_TILES, TILES_KEY } from '../ui/tiles.js'

/**
 * Affiche toutes les tuiles (ou celles données) avant le rendu, comme si la
 * personne les avait choisies dans « Panneaux » : pour les tests qui
 * manipulent la liste des journées, des compétences, la heatmap…
 * @param {string[]} [ids]
 */
export function showCartoTiles(ids = CARTO_TILES.map(([id]) => id)) {
  localStorage.setItem(TILES_KEY, JSON.stringify({ v: 1, shown: ids, order: CARTO_TILES.map(([id]) => id), sizes: {} }))
}
