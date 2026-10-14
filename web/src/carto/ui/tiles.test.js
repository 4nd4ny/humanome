// La disposition de l'espace Cartographie en tuiles (journal carto D-53) :
// règles pures, sans DOM ni stockage réel.
import { describe, expect, it } from 'vitest'
import { CARTO_TILES, DEFAULT_SHOWN, TILES_KEY, arrangeTiles, defaultTileSizes, defaultTilesLayout, isDefaultTilesLayout, normalizeTilesLayout, readTilesLayout, setTileShown, writeTilesLayout } from './tiles.js'

const ALL = CARTO_TILES.map(([id]) => id)
const memory = (initial = {}) => {
  const data = new Map(Object.entries(initial))
  return { getItem: (k) => (data.has(k) ? data.get(k) : null), setItem: (k, v) => data.set(k, String(v)), data }
}

describe('disposition de départ', () => {
  it('le soleil et le détail, tous les autres masqués, dans l’ordre des tuiles', () => {
    const d = defaultTilesLayout()
    expect(DEFAULT_SHOWN).toEqual(['sun', 'detail'])
    expect(d).toEqual({ v: 1, shown: ['sun', 'detail'], order: ALL, sizes: {} })
    expect(isDefaultTilesLayout(d)).toBe(true)
  })
  it('tailles par défaut : soleil et détail en pleine largeur ; le soleil tient dans la hauteur de l’écran (2 à 4 rangées)', () => {
    expect(defaultTileSizes(3, 600).sun).toEqual({ w: 99, h: 2 })
    expect(defaultTileSizes(3, 950).sun).toEqual({ w: 99, h: 3 })
    expect(defaultTileSizes(3, 1400).sun).toEqual({ w: 99, h: 4 })
    expect(defaultTileSizes(3, 950).detail).toEqual({ w: 99, h: 2 })
    // Sur une seule colonne (téléphone), rien ne demande plus de place qu'il n'y en a.
    expect(defaultTileSizes(1, 800).legend.w).toBe(1)
  })
})

describe('afficher, masquer, ranger', () => {
  it('une tuile affichée se place à la suite des tuiles affichées ; masquée, elle garde sa place parmi les masquées', () => {
    let l = setTileShown(defaultTilesLayout(), 'tags', true)
    expect(l.shown).toEqual(['sun', 'detail', 'tags'])
    expect(l.order.slice(0, 3)).toEqual(['sun', 'detail', 'tags'])
    l = setTileShown(l, 'days', true)
    expect(l.order.slice(0, 4)).toEqual(['sun', 'detail', 'tags', 'days'])
    l = setTileShown(l, 'tags', false)
    expect(l.shown).toEqual(['sun', 'detail', 'days'])
    expect(l.order.slice(0, 4)).toEqual(['sun', 'detail', 'tags', 'days']) // masquée, elle garde sa place
    expect(setTileShown(l, 'days', true)).toBe(l) // déjà affichée : rien ne change
    expect(setTileShown(l, 'inconnue', true)).toBe(l)
  })
  it('la grille ne rend que les tuiles affichées : les masquées gardent leur ordre relatif, à la suite', () => {
    const l = setTileShown(defaultTilesLayout(), 'days', true)
    const next = arrangeTiles(l, { order: ['days', 'sun', 'detail'], sizes: { days: { w: 2, h: 3 } } })
    expect(next.order.slice(0, 3)).toEqual(['days', 'sun', 'detail'])
    expect(next.order).toEqual(['days', 'sun', 'detail', ...ALL.filter((id) => !['sun', 'detail', 'days'].includes(id))])
    expect(next.sizes).toEqual({ days: { w: 2, h: 3 } })
    expect(isDefaultTilesLayout(next)).toBe(false)
  })
})

describe('stockage du navigateur', () => {
  it('écrite puis relue à l’identique', () => {
    const store = memory()
    const l = arrangeTiles(setTileShown(defaultTilesLayout(), 'competencies', true), { order: ['competencies', 'sun', 'detail'], sizes: { sun: { w: 2, h: 3 } } })
    writeTilesLayout(l, store)
    expect(store.data.has(TILES_KEY)).toBe(true)
    expect(readTilesLayout(store)).toEqual(l)
  })
  it('absente, illisible, d’une autre version ou stockage bloqué : la vue de départ', () => {
    expect(readTilesLayout(memory())).toEqual(defaultTilesLayout())
    expect(readTilesLayout(memory({ [TILES_KEY]: '{pas du json' }))).toEqual(defaultTilesLayout())
    expect(readTilesLayout(memory({ [TILES_KEY]: JSON.stringify({ v: 9, shown: ['days'] }) }))).toEqual(defaultTilesLayout())
    const blocked = { getItem: () => { throw new Error('SecurityError') }, setItem: () => { throw new Error('SecurityError') } }
    expect(readTilesLayout(blocked)).toEqual(defaultTilesLayout())
    expect(() => writeTilesLayout(defaultTilesLayout(), blocked)).not.toThrow()
  })
  it('nettoyée : tuiles inconnues écartées, tuile nouvelle ajoutée masquée en fin d’ordre, tailles bornées ou écartées', () => {
    const l = normalizeTilesLayout({
      v: 1,
      shown: ['sun', 'fantome', 'sun', 'days'],
      order: ['days', 'fantome', 'sun'],
      sizes: { sun: { w: 500, h: 40 }, days: { w: 0, h: 2 }, detail: { w: 'x', h: 1 }, fantome: { w: 1, h: 1 } },
    })
    expect(l.shown).toEqual(['sun', 'days'])
    expect(l.order.slice(0, 2)).toEqual(['days', 'sun'])
    expect(l.order).toHaveLength(ALL.length)
    expect(l.sizes).toEqual({ sun: { w: 99, h: 6 } })
  })
})
