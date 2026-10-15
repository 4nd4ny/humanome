// Interface ultime — commandes des espaces en tuiles, dans l'en-tête : le menu
// « Panneaux » et « Réinitialiser l'affichage » (Cartographie, D-52 et D-53 ;
// Tableau de bord, D-61). Mêmes mots, même place, même comportement.

import { useEffect, useId, useRef } from 'react'
import { TwoStepButton } from './Manager.jsx'

/**
 * Menu « Panneaux » : une case par tuile. Une tuile qui n'a rien à montrer
 * (une carte du tableau de bord sans données) reste dans la liste, sans case
 * à cocher active, avec une phrase qui dit pourquoi : on sait qu'elle existe
 * et ce qui lui manque.
 * @param {{tiles: Array<[string, string, (string | null)?]>, shown: string[],
 *   onToggle: (id: string, on: boolean) => void, summaryRef?: import('react').Ref<HTMLElement>}} props
 *   tiles : [id, libellé, pourquoi elle n'est pas proposée ?]
 */
export function PanelsMenu({ tiles, shown, onToggle, summaryRef = null }) {
  const ref = useRef(null)
  const uid = useId()
  // Se referme au clic ailleurs, et sur Échap (le focus revient au bouton).
  useEffect(() => {
    const onDown = (e) => {
      if (ref.current?.open && !ref.current.contains(e.target)) ref.current.open = false
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [])
  const offered = tiles.filter(([, , why]) => !why)
  const count = offered.filter(([id]) => shown.includes(id)).length
  return (
    <details
      ref={ref}
      className="carto-panels-menu"
      onKeyDown={(e) => {
        if (e.key !== 'Escape' || !ref.current?.open) return
        e.preventDefault()
        ref.current.open = false
        ref.current.querySelector('summary')?.focus()
      }}
    >
      <summary ref={summaryRef}>
        Panneaux{' '}
        <span className="carto-count">
          {count}/{offered.length}
        </span>
      </summary>
      <ul className="carto-panels-list" aria-label="Panneaux affichés">
        {tiles.map(([id, label, why]) => (
          <li key={id} className={why ? 'is-empty' : undefined}>
            <label>
              <input
                type="checkbox"
                checked={!why && shown.includes(id)}
                disabled={Boolean(why)}
                aria-describedby={why ? `${uid}-${id}` : undefined}
                onChange={(e) => onToggle(id, e.target.checked)}
              />{' '}
              {label}
            </label>
            {why ? (
              <span id={`${uid}-${id}`} className="carto-panels-why">
                {why}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </details>
  )
}

/**
 * « Panneaux » et « Réinitialiser l'affichage » (en deux temps), côte à côte.
 * @param {{tiles: Array<[string, string, (string | null)?]>, shown: string[],
 *   onToggle: (id: string, on: boolean) => void, onReset: () => void,
 *   summaryRef?: import('react').Ref<HTMLElement>}} props
 */
export function PanelTools({ tiles, shown, onToggle, onReset, summaryRef = null }) {
  return (
    <>
      <PanelsMenu tiles={tiles} shown={shown} onToggle={onToggle} summaryRef={summaryRef} />
      <TwoStepButton label="Réinitialiser l’affichage" confirmLabel="Revenir à la vue de départ" onConfirm={onReset} />
    </>
  )
}
