// Interface ultime — tête de lecture et animation de croissance (spec §6.2).
//
// Une trame par journée active (ensemble S). Lecture avant et arrière, pause,
// pas à pas, début / fin, curseur, vitesses ×0,5 / ×1 / ×2. L'animation se
// met en pause dès qu'un secteur est sélectionné ou survolé (`hold`), et elle
// est désactivée sous prefers-reduced-motion (la navigation manuelle reste).
// Annonce aria-live seulement à la pause et en fin de plage.

import { useEffect, useRef, useState } from 'react'
import { formatLong, formatShort } from '../core/dates.js'

const BASE_INTERVAL = 900 // ms par trame à ×1

/** Icônes de lecture (SVG : jamais d'emoji, rendu identique partout). */
const ICONS = {
  first: 'M3 2h2v12H3zM14 2v12L6 8z',
  prev: 'M12 2v12L4 8z',
  back: 'M8 2v12L1 8zM15 2v12L8 8z',
  play: 'M4 2v12l10-6z',
  pause: 'M3 2h3.5v12H3zM9.5 2H13v12H9.5z',
  next: 'M4 2v12l8-6z',
  last: 'M11 2h2v12h-2zM2 2v12l8-6z',
}
function Icon({ name }) {
  return (
    <svg className="carto-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d={ICONS[name]} />
    </svg>
  )
}

/** Préférence système de mouvement réduit (lue une fois, écoutée ensuite). */
export function usePrefersReducedMotion(override = 'system') {
  const query = typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-reduced-motion: reduce)') : null
  const [system, setSystem] = useState(() => Boolean(query?.matches))
  useEffect(() => {
    if (!query) return undefined
    const on = (e) => setSystem(e.matches)
    query.addEventListener?.('change', on)
    return () => query.removeEventListener?.('change', on)
  }, [query])
  if (override === 'reduce') return true
  if (override === 'no-preference') return false
  return system
}

/**
 * @param {{
 *   frames: string[], t: string | null, onSetT: (d: string | null) => void,
 *   hold?: boolean, reducedMotion?: boolean, speed?: number, onSpeed?: (s: number) => void,
 * }} props
 */
export function Player({ frames, t, onSetT, hold = false, reducedMotion = false, speed = 1, onSpeed }) {
  const [playing, setPlaying] = useState(0) // 0 = pause, 1 = avant, -1 = arrière
  const [announce, setAnnounce] = useState('')
  const tRef = useRef(t)
  tRef.current = t

  // Trame courante : dernière journée active ≤ t (t = null : la dernière).
  const upto = t === null ? frames.length : frames.filter((d) => d <= t).length
  const index = Math.max(0, upto - 1)
  const atStart = index <= 0
  const atEnd = t === null || index >= frames.length - 1

  // Pause automatique : sélection / survol d'un secteur, mouvement réduit.
  useEffect(() => {
    if (playing !== 0 && (hold || reducedMotion)) {
      setPlaying(0)
      setAnnounce(`Pause au ${formatLong(tRef.current ?? frames.at(-1))}`)
    }
  }, [hold, reducedMotion, playing, frames])

  useEffect(() => {
    if (playing === 0 || frames.length === 0) return undefined
    const timer = setInterval(() => {
      const cur = tRef.current === null ? frames.length - 1 : frames.filter((d) => d <= tRef.current).length - 1
      const next = cur + playing
      if (next < 0 || next >= frames.length) {
        setPlaying(0)
        setAnnounce(`Fin de la plage : ${formatLong(frames[Math.min(frames.length - 1, Math.max(0, cur))])}`)
        return
      }
      onSetT(frames[next])
    }, BASE_INTERVAL / speed)
    return () => clearInterval(timer)
  }, [playing, frames, speed, onSetT])

  if (frames.length === 0) {
    return <p className="carto-muted carto-player-empty">Aucune journée active : cochez des journées pour voir l’état dans le temps.</p>
  }

  const go = (i) => onSetT(frames[Math.min(frames.length - 1, Math.max(0, i))])
  const start = (dir) => {
    if (reducedMotion) return
    if (dir === 1 && atEnd) go(0)
    if (dir === -1 && atStart) go(frames.length - 1)
    setAnnounce('')
    setPlaying(dir)
  }
  const pause = () => {
    setPlaying(0)
    setAnnounce(`Pause au ${formatLong(t ?? frames.at(-1))}`)
  }

  return (
    <div className="carto-player" role="toolbar" aria-label="Tête de lecture">
      <button type="button" onClick={() => go(0)} disabled={atStart} aria-label="Début">
        <Icon name="first" />
      </button>
      <button type="button" onClick={() => go(index - 1)} disabled={atStart} aria-label="Journée précédente">
        <Icon name="prev" />
      </button>
      {playing === -1 ? (
        <button type="button" onClick={pause} aria-label="Pause">
          <Icon name="pause" />
        </button>
      ) : (
        <button type="button" onClick={() => start(-1)} disabled={reducedMotion} aria-label="Lecture arrière">
          <Icon name="back" />
        </button>
      )}
      {playing === 1 ? (
        <button type="button" onClick={pause} aria-label="Pause">
          <Icon name="pause" />
        </button>
      ) : (
        <button type="button" onClick={() => start(1)} disabled={reducedMotion} aria-label="Lecture : voir l’arbre croître">
          <Icon name="play" />
        </button>
      )}
      <button type="button" onClick={() => go(index + 1)} disabled={atEnd} aria-label="Journée suivante">
        <Icon name="next" />
      </button>
      <button type="button" onClick={() => onSetT(null)} disabled={t === null} aria-label="Fin : état complet">
        <Icon name="last" />
      </button>
      <input
        type="range"
        min={0}
        max={Math.max(0, frames.length - 1)}
        value={Math.max(0, index)}
        aria-label="Date t"
        aria-valuetext={t === null ? `état complet (${formatLong(frames.at(-1))})` : formatLong(frames[index])}
        onChange={(e) => go(Number(e.target.value))}
      />
      <label className="carto-player-speed">
        <span className="carto-visually-hidden">Vitesse</span>
        <select value={speed} onChange={(e) => onSpeed?.(Number(e.target.value))} disabled={reducedMotion}>
          <option value={0.5}>×0,5</option>
          <option value={1}>×1</option>
          <option value={2}>×2</option>
        </select>
      </label>
      <span className="carto-player-date">
        {t === null ? 'état complet' : `jusqu’au ${formatShort(frames[index])}`} · {index + 1}/{frames.length}
      </span>
      {reducedMotion ? <span className="carto-small carto-muted">Animation désactivée (mouvement réduit)</span> : null}
      <span className="carto-visually-hidden" aria-live="polite">
        {announce}
      </span>
    </div>
  )
}
