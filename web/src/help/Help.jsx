// Bouton « ? » d'aide contextuelle (item 4) + panneau modal accessible.
// Le contenu vient de help/registry.js selon la route courante et le rôle.

import { useEffect, useRef } from 'react'
import { helpFor } from './registry.js'

/**
 * @param {object} props
 * @param {string} props.route nom de route courante (router.js)
 * @param {{roles?: string[]}} props.session
 * @param {boolean} props.open
 * @param {() => void} props.onToggle bascule l'ouverture
 * @param {() => void} props.onClose
 */
export default function Help({ route, session, open, onToggle, onClose }) {
  const panelRef = useRef(null)
  const closeRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    // Fermeture au clavier (Échap) et focus initial sur le bouton fermer.
    closeRef.current?.focus()
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const entry = helpFor(route, session)

  return (
    <>
      <button
        type="button"
        className="help-button"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={onToggle}
        title="Aide sur cette rubrique"
      >
        <span aria-hidden="true">?</span>
        <span className="visually-hidden">Aide sur cette rubrique</span>
      </button>
      {open ? (
        <div
          className="help-overlay"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) onClose()
          }}
        >
          <div
            className="help-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="help-title"
            ref={panelRef}
          >
            <div className="help-panel-head">
              <h2 id="help-title">{entry.titre}</h2>
              <button
                type="button"
                className="help-close"
                onClick={onClose}
                ref={closeRef}
                aria-label="Fermer l’aide"
              >
                ✕
              </button>
            </div>
            <p className="help-intro">{entry.intro}</p>
            {entry.points && entry.points.length > 0 ? (
              <ul className="help-points">
                {entry.points.map((point, i) => (
                  <li key={i}>{point}</li>
                ))}
              </ul>
            ) : null}
            <p className="help-foot">
              Besoin d’aide plus poussée ? Les <a href="#/guides">guides de prise en main</a>{' '}
              détaillent chaque rôle, pas à pas.
            </p>
          </div>
        </div>
      ) : null}
    </>
  )
}
