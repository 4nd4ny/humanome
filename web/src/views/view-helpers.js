// Shared hooks for the merge and day views.
import { useEffect, useState } from 'react'
import { loadSunburstLib } from '../data/sunburst.js'

/** Level labels of the original prototype (niveaux 1..5). */
export const NIVEAU_LABELS = {
  1: 'Découverte',
  2: 'Application',
  3: 'Maîtrise',
  4: 'Expertise',
  5: 'Excellence',
}

/**
 * Provides the sunburst lib: the injected one (tests) or the lazily loaded
 * module. Returns { lib, error } — both null while loading.
 */
export function useSunburstLib(injected) {
  const [state, setState] = useState({ lib: injected ?? null, error: null })

  useEffect(() => {
    if (injected) {
      setState({ lib: injected, error: null })
      return undefined
    }
    let active = true
    loadSunburstLib().then(
      (lib) => active && setState({ lib, error: null }),
      (error) => active && setState({ lib: null, error }),
    )
    return () => {
      active = false
    }
  }, [injected])

  return state
}

/**
 * Square diagram size adapted to the viewport (min 280, max 620). Under
 * 768px (mobile tabs) the sunburst takes the full container width; the SVG
 * itself scales through its viewBox (width: 100% in CSS).
 */
export function useDiagramSize() {
  const compute = () => {
    const width = window.innerWidth || 620
    const target = width < 768 ? width - 64 : width * 0.42
    return Math.max(280, Math.min(620, Math.floor(target)))
  }
  const [size, setSize] = useState(compute)

  useEffect(() => {
    const onResize = () => setSize(compute())
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  return size
}
