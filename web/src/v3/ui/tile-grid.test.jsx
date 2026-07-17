// Grille de tuiles du mode expert : colonnes adaptées à la largeur,
// réordonnancement (boutons ◀ ▶ = chemin tactile/clavier du glisser-déposer),
// tailles prédéterminées, empans bornés par les colonnes disponibles.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { TileGrid, columnsForWidth, moveTile, orderedTiles, TILE_SIZES } from './tile-grid.jsx'

afterEach(cleanup)

describe('tile-grid — logique', () => {
  it('colonnes adaptées à l’espace : téléphone 1, tablette 2-3, large 4+, 4K bornée à 12', () => {
    expect(columnsForWidth(375)).toBe(1) // téléphone portrait
    expect(columnsForWidth(812)).toBe(2) // téléphone paysage
    expect(columnsForWidth(1024)).toBe(3) // tablette
    expect(columnsForWidth(1680)).toBe(4) // moniteur
    expect(columnsForWidth(3840)).toBe(11) // 4K
    expect(columnsForWidth(7680)).toBe(12) // 8K : plafonné
  })

  it('moveTile insère avant la cible sans dupliquer', () => {
    expect(moveTile(['a', 'b', 'c'], 'c', 'a')).toEqual(['c', 'a', 'b'])
    expect(moveTile(['a', 'b', 'c'], 'a', null)).toEqual(['b', 'c', 'a'])
  })

  it('orderedTiles respecte l’ordre mémorisé, les inconnues à la fin', () => {
    const tiles = [{ id: 'x' }, { id: 'y' }, { id: 'z' }]
    expect(orderedTiles(tiles, { order: ['z', 'x'] }).map((t) => t.id)).toEqual(['z', 'x', 'y'])
  })

  it('les tailles proposées incluent les préréglages demandés', () => {
    const ids = TILE_SIZES.map((s) => s.id)
    for (const attendu of ['1x1', '2x1', '1x2', '3x1', '3x2', '3x3']) expect(ids).toContain(attendu)
  })
})

describe('tile-grid — composant', () => {
  const tiles = [
    { id: 'sun', label: 'Soleil', node: <p>contenu soleil</p> },
    { id: 'tree', label: 'Arbre', node: <p>contenu arbre</p> },
  ]

  it('rend les tuiles avec poignée, boutons de déplacement et choix de taille', () => {
    const onChange = vi.fn()
    render(<TileGrid tiles={tiles} layout={{ order: [], sizes: {} }} onLayoutChange={onChange} defaultSizes={{ sun: { w: 2, h: 2 } }} />)
    expect(screen.getByText('contenu soleil')).toBeTruthy()
    expect(screen.getByLabelText(/Déplacer le panneau Soleil/)).toBeTruthy()
    // Reculer « Soleil » = échange avec « Arbre » (chemin tactile/clavier).
    fireEvent.click(screen.getByLabelText('Reculer Soleil'))
    expect(onChange).toHaveBeenCalledWith({ order: ['tree', 'sun'], sizes: {} })
  })

  it('changer la taille enregistre l’empan prédéterminé', () => {
    const onChange = vi.fn()
    render(<TileGrid tiles={tiles} layout={{ order: [], sizes: {} }} onLayoutChange={onChange} />)
    fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: '3x2' } })
    expect(onChange).toHaveBeenCalledWith({ order: ['sun', 'tree'], sizes: { sun: { w: 3, h: 2 } } })
  })

  it('l’empan est borné par les colonnes disponibles (pleine largeur = 99 → span colonnes)', () => {
    render(
      <TileGrid
        tiles={tiles}
        layout={{ order: [], sizes: { sun: { w: 99, h: 1 } } }}
        onLayoutChange={() => {}}
      />,
    )
    const tile = screen.getByText('contenu soleil').closest('.v3-tile')
    // jsdom : pas de ResizeObserver → 3 colonnes par défaut ; 99 → span 3.
    expect(tile.style.gridColumn).toBe('span 3')
  })
})
