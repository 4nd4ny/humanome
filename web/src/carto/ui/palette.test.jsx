// Palette des pôles (journal D-64) : préférence de ce navigateur, lue et
// gardée sans jamais bloquer l'affichage ; la vue partagée (et son aperçu dans
// l'espace Partage) garde la palette par défaut, quelle que soit celle choisie.
import { cleanup, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { PALETTE_KEY, PaletteContext, readPalette, writePalette } from './palette.js'
import { SharedView } from './SharedView.jsx'
import sharedDoc from '../../../../schemas/fixtures/partage/carto-partage-exemple.json'

afterEach(cleanup)

/** Un stockage en mémoire, ou un stockage qui refuse tout (copie ouverte depuis le disque). */
const memoryStorage = (initial = {}) => {
  const data = new Map(Object.entries(initial))
  return { getItem: (k) => (data.has(k) ? data.get(k) : null), setItem: (k, v) => data.set(k, String(v)), removeItem: (k) => data.delete(k), data }
}
const blocked = {
  getItem: () => {
    throw new Error('bloqué')
  },
  setItem: () => {
    throw new Error('bloqué')
  },
  removeItem: () => {
    throw new Error('bloqué')
  },
}

describe('préférence de palette (D-64)', () => {
  it('lit la palette gardée ; une valeur inconnue, absente ou un stockage bloqué donnent la palette par défaut', () => {
    expect(readPalette(memoryStorage({ [PALETTE_KEY]: 'terre' }))).toBe('terre')
    expect(readPalette(memoryStorage({ [PALETTE_KEY]: 'arc-en-ciel' }))).toBe('contrastee')
    expect(readPalette(memoryStorage())).toBe('contrastee')
    expect(readPalette(blocked)).toBe('contrastee')
    expect(readPalette(null)).toBe('contrastee')
  })

  it('garde un choix ; la palette par défaut efface la clé ; un stockage bloqué ne lève rien', () => {
    const store = memoryStorage()
    writePalette('vive', store)
    expect(store.data.get(PALETTE_KEY)).toBe('vive')
    writePalette('contrastee', store)
    expect(store.data.has(PALETTE_KEY)).toBe(false)
    expect(() => writePalette('pastel', blocked)).not.toThrow()
  })
})

describe('la vue partagée garde la palette par défaut (D-64)', () => {
  it('rendue sous une autre palette (l’aperçu de l’espace Partage), ses secteurs restent dans la palette Contrastée', async () => {
    render(
      <PaletteContext.Provider value="pastel">
        <SharedView doc={sharedDoc} />
      </PaletteContext.Provider>,
    )
    const sector = () => document.querySelector('.carto-sun [role="button"][aria-label^="2.01 "]')
    await waitFor(() => expect(sector()).toBeTruthy())
    expect(sector().style.getPropertyValue('--c')).toBe('#047857') // CŒUR, Contrastée (Pastel : #8ee5bf)
    // Et la lecture du soleil dit d'où part la hauteur.
    expect(document.querySelector('.carto-shared-howto').textContent).toMatch(/de 0,25 au pied du secteur à 1 au bord extérieur/)
  })
})
