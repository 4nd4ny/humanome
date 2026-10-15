// Interface ultime — espaces en tuiles : la Cartographie (journal carto D-53)
// et le Tableau de bord (D-61).
//
// Chaque zone est une tuile de la grille de V3 (TileGrid) : masquable,
// déplaçable, redimensionnable. Au départ, peu de tuiles sont affichées (le
// soleil et le détail ; le profil et le rythme) ; le reste attend dans le menu
// « Panneaux ». La disposition est une préférence de PRÉSENTATION propre à ce
// navigateur (localStorage), une par espace : jamais dans le jeu de données,
// elle ne change ni calcul, ni filtre.

import { DASHBOARD_CARDS } from '../core/dashboard.js'

const VERSION = 1

function localStore() {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null
  } catch {
    return null
  }
}

/**
 * Règles d'une disposition en tuiles : vue de départ, nettoyage, stockage,
 * affichage, rangement.
 * @param {{tiles: ReadonlyArray<readonly [string, string]>, shown: ReadonlyArray<string>, key: string}} spec
 *   tiles : [id, libellé] dans l'ordre de départ (une tuile réaffichée se place à la suite des autres) ;
 *   shown : tuiles affichées au départ ; key : clé du stockage local
 */
export function createTileSet({ tiles, shown, key }) {
  const known = new Set(tiles.map(([id]) => id))

  /** Disposition de départ : les tuiles de départ, dans l'ordre des tuiles, tailles par défaut. */
  const defaultLayout = () => ({ v: VERSION, shown: [...shown], order: tiles.map(([id]) => id), sizes: {} })

  /**
   * Disposition valide à partir d'un document lu : tuiles inconnues écartées,
   * tuiles nouvelles ajoutées masquées en fin d'ordre, tailles bornées.
   * @param {unknown} doc
   */
  const normalize = (doc) => {
    if (!doc || typeof doc !== 'object' || doc.v !== VERSION) return defaultLayout()
    const ids = (list) => (Array.isArray(list) ? list.filter((id) => typeof id === 'string' && known.has(id)) : [])
    const visible = [...new Set(ids(doc.shown))]
    const order = [...new Set([...ids(doc.order), ...known])]
    const sizes = {}
    for (const [id, s] of Object.entries(doc.sizes && typeof doc.sizes === 'object' ? doc.sizes : {})) {
      const w = Number(s?.w)
      const h = Number(s?.h)
      if (known.has(id) && Number.isFinite(w) && Number.isFinite(h) && w >= 1 && h >= 1) sizes[id] = { w: Math.min(99, Math.round(w)), h: Math.min(6, Math.round(h)) }
    }
    return { v: VERSION, shown: visible, order, sizes }
  }

  /** Disposition gardée dans ce navigateur, ou celle de départ (absente, illisible, stockage bloqué). */
  const read = (storage = localStore()) => {
    try {
      const raw = storage?.getItem(key)
      return raw ? normalize(JSON.parse(raw)) : defaultLayout()
    } catch {
      return defaultLayout()
    }
  }

  /** Garde la disposition (sans effet si le stockage est bloqué : copie ouverte depuis le disque, navigation privée). */
  const write = (layout, storage = localStore()) => {
    try {
      storage?.setItem(key, JSON.stringify(layout))
    } catch {
      /* préférence de présentation seulement */
    }
  }

  /** Affiche ou masque une tuile. */
  const setShown = (layout, id, on) => {
    if (!known.has(id)) return layout
    const has = layout.shown.includes(id)
    if (on === has) return layout
    // Réaffichée, elle se place à la suite des tuiles affichées.
    const order = on ? [...layout.order.filter((x) => x !== id && layout.shown.includes(x)), id, ...layout.order.filter((x) => x !== id && !layout.shown.includes(x))] : layout.order
    return { ...layout, shown: on ? [...layout.shown, id] : layout.shown.filter((x) => x !== id), order }
  }

  /**
   * Ordre et tailles rendus par la grille (qui ne voit que les tuiles affichées) :
   * les tuiles masquées gardent leur place relative, à la suite.
   * @param {{order: string[], sizes: object}} layout
   * @param {{order: string[], sizes: object}} change
   */
  const arrange = (layout, change) => {
    const visible = (change.order ?? []).filter((id) => known.has(id))
    const order = [...new Set([...visible, ...layout.order.filter((id) => !visible.includes(id))])]
    return normalize({ ...layout, order, sizes: change.sizes ?? layout.sizes })
  }

  /** La disposition est-elle celle de départ ? */
  const isDefault = (layout) => {
    const d = defaultLayout()
    return (
      layout.shown.length === d.shown.length &&
      d.shown.every((id) => layout.shown.includes(id)) &&
      layout.order.join() === d.order.join() &&
      Object.keys(layout.sizes ?? {}).length === 0
    )
  }

  return { tiles, key, defaultLayout, normalize, read, write, setShown, arrange, isDefault }
}

// ---- Cartographie (D-53) ------------------------------------------------------------------------

/** Les tuiles, dans l'ordre de départ (une tuile réaffichée se place à la suite des autres). */
export const CARTO_TILES = [
  ['sun', 'Soleil'],
  ['detail', 'Détail'],
  ['days', 'Journées'],
  ['competencies', 'Compétences'],
  ['timeline', 'Heatmap et lecture'],
  ['legend', 'Légende'],
  ['table', 'Tableau équivalent'],
  ['import', 'Importer'],
  ['tags', 'Étiquettes'],
  ['sets', 'Ensembles nommés'],
  ['datasets', 'Jeux de données'],
  ['settings', 'Réglages'],
]

/** Tuiles affichées au départ. */
export const DEFAULT_SHOWN = Object.freeze(['sun', 'detail'])

/** Clé du stockage local (une disposition par navigateur, pour tous les jeux de données). */
export const TILES_KEY = 'humanome-carto-tiles'

export const CARTO_TILE_SET = createTileSet({ tiles: CARTO_TILES, shown: DEFAULT_SHOWN, key: TILES_KEY })

export const defaultTilesLayout = CARTO_TILE_SET.defaultLayout
export const normalizeTilesLayout = CARTO_TILE_SET.normalize
export const readTilesLayout = CARTO_TILE_SET.read
export const writeTilesLayout = CARTO_TILE_SET.write
export const setTileShown = CARTO_TILE_SET.setShown
export const arrangeTiles = CARTO_TILE_SET.arrange
export const isDefaultTilesLayout = CARTO_TILE_SET.isDefault

/**
 * Tailles par défaut (en colonnes × rangées de 236 px) : le soleil occupe la
 * hauteur de l'écran sans la dépasser (2 à 4 rangées), le reste est compact.
 * @param {number} columns colonnes de la grille
 * @param {number} [viewportHeight]
 */
export function defaultTileSizes(columns, viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 800) {
  const sunRows = Math.max(2, Math.min(4, Math.floor(((viewportHeight || 800) - 200) / 248)))
  return {
    sun: { w: 99, h: sunRows },
    detail: { w: 99, h: 2 },
    days: { w: 1, h: 3 },
    competencies: { w: 1, h: 3 },
    timeline: { w: 99, h: 2 },
    legend: { w: Math.min(2, columns), h: 2 },
    table: { w: Math.min(2, columns), h: 2 },
    import: { w: 1, h: 2 },
    tags: { w: 1, h: 2 },
    sets: { w: 1, h: 2 },
    datasets: { w: 1, h: 1 },
    // Les curseurs et la palette côte à côte ; sur une seule colonne, l'un sous l'autre (D-64).
    settings: columns >= 2 ? { w: 2, h: 2 } : { w: 1, h: 3 },
  }
}

// ---- Tableau de bord (D-61) ---------------------------------------------------------------------

/** Les cartes du tableau de bord, dans l'ordre de départ. */
export const DASHBOARD_TILES = DASHBOARD_CARDS.map((c) => [c.id, c.label])

/** Cartes affichées au départ : le profil et le rythme. */
export const DASHBOARD_SHOWN = Object.freeze(['profile', 'rhythm'])

/** Clé du stockage local du tableau de bord. */
export const DASHBOARD_TILES_KEY = 'humanome-carto-dashboard-tiles'

export const DASHBOARD_TILE_SET = createTileSet({ tiles: DASHBOARD_TILES, shown: DASHBOARD_SHOWN, key: DASHBOARD_TILES_KEY })

/**
 * Tailles par défaut des cartes : le profil et le rythme côte à côte sur un
 * écran large (le rythme, une frise, jamais plus étroit), l'un sous l'autre
 * sur un téléphone ; seul affiché, l'un ou l'autre prend toute la largeur. Les
 * cartes chargées (frises, tableaux) en pleine largeur.
 * @param {number} columns colonnes de la grille
 * @param {{pair?: boolean}} [opts] pair : le profil et le rythme sont affichés tous deux
 */
export function dashboardTileSizes(columns, { pair = true } = {}) {
  const profile = pair ? Math.max(1, Math.floor(columns / 2)) : 99
  return {
    profile: { w: profile, h: 2 },
    rhythm: { w: pair ? Math.max(1, columns - profile) : 99, h: 2 },
    phases: { w: 99, h: 2 },
    constancy: { w: Math.min(2, columns), h: 2 },
    moments: { w: Math.min(2, columns), h: 2 },
    style: { w: 99, h: 2 },
    cognitive: { w: Math.min(2, columns), h: 2 },
    lexical: { w: 99, h: 1 },
    anomalies: { w: 1, h: 2 },
  }
}
