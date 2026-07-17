// Interface V3 — grille de tuiles du mode expert (demande utilisateur du
// 2026-07-17, anticipe la « personnalisation avancée » prévue en V3.1 §25.2).
//
// Chaque panneau devient une TUILE aux dimensions PRÉDÉTERMINÉES sur la grille
// (1×1, 2×1, 1×2, 2×2, 3×1, 3×2, 3×3, toute la largeur), réordonnable par
// glisser-déposer (souris) ou par boutons ◀ ▶ (tactile et clavier — le DnD
// HTML5 n'existe pas au doigt). Le nombre de colonnes s'adapte à l'espace
// disponible (ResizeObserver) : ~1 colonne sur téléphone portrait, 2-3 sur
// tablette, 4+ sur moniteur large, jusqu'à 12 sur un 4K/8K. Les empans sont
// bornés par les colonnes disponibles au rendu.
//
// La disposition est une PRÉFÉRENCE DE PRÉSENTATION (spec §14.4) : elle est
// persistée à part (localStorage, par mode), jamais dans les données
// d'évaluation, et ne change ni calcul, ni filtre, ni autorisation.

import { useEffect, useMemo, useRef, useState } from 'react'

/** Tailles prédéterminées proposées (l = largeur en colonnes, h = rangées). */
export const TILE_SIZES = [
  { id: '1x1', w: 1, h: 1 },
  { id: '2x1', w: 2, h: 1 },
  { id: '1x2', w: 1, h: 2 },
  { id: '2x2', w: 2, h: 2 },
  { id: '1x3', w: 1, h: 3 },
  { id: '3x1', w: 3, h: 1 },
  { id: '3x2', w: 3, h: 2 },
  { id: '2x3', w: 2, h: 3 },
  { id: '3x3', w: 3, h: 3 },
  { id: 'pleine-largeur', w: Infinity, h: 1 },
  { id: 'pleine-largeur-x2', w: Infinity, h: 2 },
]

/** Largeur cible d'une colonne (px) → nombre de colonnes de la grille. */
export function columnsForWidth(width) {
  return Math.max(1, Math.min(12, Math.floor(width / 340)))
}

/** Applique ordre + tailles mémorisés à la liste des tuiles visibles. */
export function orderedTiles(tiles, layout) {
  const order = layout?.order ?? []
  const rank = new Map(order.map((id, i) => [id, i]))
  return [...tiles].sort((a, b) => (rank.get(a.id) ?? 999) - (rank.get(b.id) ?? 999))
}

/** Réordonne : place `id` juste avant `beforeId` (ou à la fin si null). */
export function moveTile(order, id, beforeId) {
  const rest = order.filter((x) => x !== id)
  if (beforeId === null) return [...rest, id]
  const i = rest.indexOf(beforeId)
  return i === -1 ? [...rest, id] : [...rest.slice(0, i), id, ...rest.slice(i)]
}

/**
 * @param {object} props
 * @param {Array<{id: string, label: string, node: import('react').ReactNode}>} props.tiles
 * @param {{order: string[], sizes: Record<string, {w: number, h: number}>}} props.layout
 * @param {(layout: object) => void} props.onLayoutChange
 * @param {Record<string, {w: number, h: number}>} props.defaultSizes
 */
export function TileGrid({ tiles, layout, onLayoutChange, defaultSizes = {} }) {
  const ref = useRef(null)
  const [columns, setColumns] = useState(3)
  const dragId = useRef(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return undefined
    const update = () => setColumns(columnsForWidth(el.clientWidth || window.innerWidth || 1024))
    update()
    // ResizeObserver pour les changements du CONTENEUR (tiroir de menu…) +
    // repli window.resize : rotations mobiles, et environnements où RO ne
    // délivre pas (observé dans certains panes embarqués).
    let ro = null
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(update)
      ro.observe(el)
    }
    window.addEventListener('resize', update)
    return () => {
      ro?.disconnect()
      window.removeEventListener('resize', update)
    }
  }, [])

  const ordered = useMemo(() => orderedTiles(tiles, layout), [tiles, layout])
  const fullOrder = ordered.map((t) => t.id)

  const sizeOf = (id) => layout?.sizes?.[id] ?? defaultSizes[id] ?? { w: 1, h: 1 }
  const setSize = (id, sizeId) => {
    const preset = TILE_SIZES.find((s) => s.id === sizeId)
    if (!preset) return
    onLayoutChange({
      order: fullOrder,
      sizes: { ...(layout?.sizes ?? {}), [id]: { w: preset.w === Infinity ? 99 : preset.w, h: preset.h } },
    })
  }
  const sizeIdOf = (id) => {
    const s = sizeOf(id)
    const w = s.w >= 99 ? Infinity : s.w
    return TILE_SIZES.find((p) => p.w === w && p.h === s.h)?.id ?? '1x1'
  }
  const shift = (id, delta) => {
    const i = fullOrder.indexOf(id)
    const j = i + delta
    if (j < 0 || j >= fullOrder.length) return
    const next = [...fullOrder]
    ;[next[i], next[j]] = [next[j], next[i]]
    onLayoutChange({ order: next, sizes: layout?.sizes ?? {} })
  }

  return (
    <div
      className="v3-tile-grid"
      ref={ref}
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      role="list"
      aria-label={`Disposition des panneaux (${columns} colonne${columns > 1 ? 's' : ''})`}
    >
      {ordered.map((tile) => {
        const s = sizeOf(tile.id)
        const w = Math.min(s.w >= 99 ? columns : s.w, columns)
        const h = Math.max(1, Math.min(s.h, 6))
        return (
          <div
            key={tile.id}
            role="listitem"
            className="v3-tile"
            style={{ gridColumn: `span ${w}`, gridRow: `span ${h}` }}
            onDragOver={(e) => {
              if (dragId.current && dragId.current !== tile.id) e.preventDefault()
            }}
            onDrop={(e) => {
              e.preventDefault()
              if (dragId.current && dragId.current !== tile.id) {
                onLayoutChange({ order: moveTile(fullOrder, dragId.current, tile.id), sizes: layout?.sizes ?? {} })
              }
              dragId.current = null
            }}
          >
            <div className="v3-tile-bar">
              <span
                className="v3-tile-handle"
                draggable
                aria-label={`Déplacer le panneau ${tile.label} (glisser, ou boutons flèches)`}
                title="Glisser pour déplacer"
                onDragStart={(e) => {
                  dragId.current = tile.id
                  e.dataTransfer.effectAllowed = 'move'
                  e.dataTransfer.setData('text/plain', tile.id)
                }}
                onDragEnd={() => {
                  dragId.current = null
                }}
              >
                ⠿
              </span>
              <strong className="v3-tile-label">{tile.label}</strong>
              <button type="button" onClick={() => shift(tile.id, -1)} aria-label={`Avancer ${tile.label}`}>◀</button>
              <button type="button" onClick={() => shift(tile.id, +1)} aria-label={`Reculer ${tile.label}`}>▶</button>
              <label className="v3-tile-size">
                <span className="v3-visually-hidden">Taille de {tile.label}</span>
                <select value={sizeIdOf(tile.id)} onChange={(e) => setSize(tile.id, e.target.value)}>
                  {TILE_SIZES.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.id === 'pleine-largeur' ? '↔ pleine largeur' : p.id === 'pleine-largeur-x2' ? '↔ pleine largeur ×2' : p.id.replace('x', '×')}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="v3-tile-content">{tile.node}</div>
          </div>
        )
      })}
    </div>
  )
}
