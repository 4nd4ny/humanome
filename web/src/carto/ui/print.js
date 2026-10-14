// Interface ultime — impression (spec §8.2) : tous les <details> s'ouvrent
// avant l'impression et ceux qu'on a ouverts se referment après.

import { useEffect } from 'react'

/** @param {{current: HTMLElement | null}} rootRef conteneur dont les <details> s'ouvrent */
export function usePrintExpand(rootRef) {
  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    let opened = []
    const before = () => {
      const root = rootRef.current
      if (!root) return
      opened = [...root.querySelectorAll('details:not([open])')]
      for (const d of opened) d.open = true
    }
    const after = () => {
      for (const d of opened) if (d.isConnected) d.open = false
      opened = []
    }
    window.addEventListener('beforeprint', before)
    window.addEventListener('afterprint', after)
    return () => {
      window.removeEventListener('beforeprint', before)
      window.removeEventListener('afterprint', after)
    }
  }, [rootRef])
}
