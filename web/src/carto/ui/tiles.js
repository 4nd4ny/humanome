// Interface ultime — l'espace Cartographie en tuiles (journal carto D-53).
//
// Chaque zone de la cartographie est une tuile de la grille du tableau de bord
// (TileGrid, V3) : masquable, déplaçable, redimensionnable. Au départ, seuls le
// soleil et, dessous, le détail sont affichés, en pleine largeur ; le reste
// attend dans le menu « Panneaux ». La disposition est une préférence de
// PRÉSENTATION propre à ce navigateur (localStorage) : jamais dans le jeu de
// données, elle ne change ni calcul, ni filtre.

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
  ['settings', 'Réglages de l’encodage'],
]

/** Tuiles affichées au départ. */
export const DEFAULT_SHOWN = Object.freeze(['sun', 'detail'])

/** Clé du stockage local (une disposition par navigateur, pour tous les jeux de données). */
export const TILES_KEY = 'humanome-carto-tiles'
const VERSION = 1
const KNOWN = new Set(CARTO_TILES.map(([id]) => id))

/** Disposition de départ : le soleil et le détail, dans l'ordre de CARTO_TILES, tailles par défaut. */
export function defaultTilesLayout() {
  return { v: VERSION, shown: [...DEFAULT_SHOWN], order: CARTO_TILES.map(([id]) => id), sizes: {} }
}

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
    settings: { w: 1, h: 2 },
  }
}

/**
 * Disposition valide à partir d'un document lu : tuiles inconnues écartées,
 * tuiles nouvelles ajoutées masquées en fin d'ordre, tailles bornées.
 * @param {unknown} doc
 */
export function normalizeTilesLayout(doc) {
  if (!doc || typeof doc !== 'object' || doc.v !== VERSION) return defaultTilesLayout()
  const ids = (list) => (Array.isArray(list) ? list.filter((id) => typeof id === 'string' && KNOWN.has(id)) : [])
  const shown = [...new Set(ids(doc.shown))]
  const order = [...new Set([...ids(doc.order), ...KNOWN])]
  const sizes = {}
  for (const [id, s] of Object.entries(doc.sizes && typeof doc.sizes === 'object' ? doc.sizes : {})) {
    const w = Number(s?.w)
    const h = Number(s?.h)
    if (KNOWN.has(id) && Number.isFinite(w) && Number.isFinite(h) && w >= 1 && h >= 1) sizes[id] = { w: Math.min(99, Math.round(w)), h: Math.min(6, Math.round(h)) }
  }
  return { v: VERSION, shown, order, sizes }
}

function localStore() {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null
  } catch {
    return null
  }
}

/** Disposition gardée dans ce navigateur, ou celle de départ (absente, illisible, stockage bloqué). */
export function readTilesLayout(storage = localStore()) {
  try {
    const raw = storage?.getItem(TILES_KEY)
    return raw ? normalizeTilesLayout(JSON.parse(raw)) : defaultTilesLayout()
  } catch {
    return defaultTilesLayout()
  }
}

/** Garde la disposition (sans effet si le stockage est bloqué : copie ouverte depuis le disque, navigation privée). */
export function writeTilesLayout(layout, storage = localStore()) {
  try {
    storage?.setItem(TILES_KEY, JSON.stringify(layout))
  } catch {
    /* préférence de présentation seulement */
  }
}

/** Affiche ou masque une tuile. */
export function setTileShown(layout, id, on) {
  if (!KNOWN.has(id)) return layout
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
export function arrangeTiles(layout, change) {
  const visible = (change.order ?? []).filter((id) => KNOWN.has(id))
  const order = [...new Set([...visible, ...layout.order.filter((id) => !visible.includes(id))])]
  return normalizeTilesLayout({ ...layout, order, sizes: change.sizes ?? layout.sizes })
}

/** La disposition est-elle celle de départ ? */
export function isDefaultTilesLayout(layout) {
  const d = defaultTilesLayout()
  return (
    layout.shown.length === d.shown.length &&
    d.shown.every((id) => layout.shown.includes(id)) &&
    layout.order.join() === d.order.join() &&
    Object.keys(layout.sizes ?? {}).length === 0
  )
}
