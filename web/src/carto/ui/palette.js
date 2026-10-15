// Interface ultime — la palette des pôles (journal D-64), au choix dans la
// tuile « Réglages ». Une préférence de PRÉSENTATION propre à ce navigateur,
// comme la disposition des tuiles (D-61) : jamais dans le jeu de données, elle
// ne change ni calcul ni filtre, et suit la personne d'un jeu à l'autre. Le
// rapport imprimé et la vue partagée (et son aperçu) gardent la palette par
// défaut : des documents lus par d'autres, comme l'anneau des pôles (D-58).

import { createContext, useCallback, useContext, useState } from 'react'
import { DEFAULT_PALETTE, isPalette } from './colors.js'

/** Clé du stockage local. */
export const PALETTE_KEY = 'humanome-carto-palette'

/** Palette des dessins sous ce fournisseur (la palette par défaut, sans fournisseur). */
export const PaletteContext = createContext(DEFAULT_PALETTE)

/** Identifiant de la palette en vigueur. */
export function usePalette() {
  return useContext(PaletteContext)
}

function localStore() {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null
  } catch {
    return null
  }
}

/** Palette gardée dans ce navigateur, ou celle par défaut (absente, inconnue, stockage bloqué). */
export function readPalette(storage = localStore()) {
  try {
    const id = storage?.getItem(PALETTE_KEY)
    return isPalette(id) ? id : DEFAULT_PALETTE
  } catch {
    return DEFAULT_PALETTE
  }
}

/** Garde la palette ; la palette par défaut efface la clé (sans effet si le stockage est bloqué). */
export function writePalette(id, storage = localStore()) {
  try {
    if (id === DEFAULT_PALETTE) storage?.removeItem(PALETTE_KEY)
    else storage?.setItem(PALETTE_KEY, id)
  } catch {
    /* préférence de présentation seulement */
  }
}

/** [palette, choisir une palette] : l'état de la session, gardé dans ce navigateur. */
export function usePalettePreference() {
  const [palette, setState] = useState(() => readPalette())
  const setPalette = useCallback((id) => {
    const next = isPalette(id) ? id : DEFAULT_PALETTE
    setState(next)
    writePalette(next)
  }, [])
  return [palette, setPalette]
}
