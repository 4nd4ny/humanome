// Lecteur de timeline (chantier C) : rejoue la construction de la cartographie
// merge feuille par feuille. Composant CONTRÔLÉ : la trame courante vit chez le
// parent (frameIndex / onFrameChange), le lecteur ne possède que l'état de
// lecture (play/pause, vitesse). Indexé sur les FEUILLES (0..N-1), pas sur les
// jours calendaires. Le compteur live lit profilMeta.evolution_globale[frame]
// (aucun recalcul ici).
//
// Accessibilité : vrais <button> (aria-pressed sur Lecture/Pause), scrubber
// <input type=range> avec aria-valuetext = label de la feuille (pas un %),
// prefers-reduced-motion coupe la lecture automatique (navigation manuelle
// conservée), région aria-live polite mise à jour à la pause et au scrub —
// jamais à chaque tick.
import { useEffect, useRef, useState } from 'react'
import '../styles/timeline.css'

export const SPEEDS = [
  { ms: 150, label: 'Rapide' },
  { ms: 400, label: 'Normale' },
  { ms: 800, label: 'Lente' },
]

/** prefers-reduced-motion, avec garde jsdom (matchMedia absent -> false). */
function useReducedMotion() {
  const query = '(prefers-reduced-motion: reduce)'
  const [reduced, setReduced] = useState(
    () => typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia(query).matches
      : false,
  )
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined
    const mql = window.matchMedia(query)
    const onChange = (event) => setReduced(event.matches)
    mql.addEventListener?.('change', onChange)
    return () => mql.removeEventListener?.('change', onChange)
  }, [])
  return reduced
}

/** Accord français simple : « 1 compétence », « 12 compétences ». */
function plural(n, noun) {
  return `${n} ${noun}${n > 1 ? 's' : ''}`
}

/**
 * @param {{
 *   feuilles: Array<{iso: string, label?: string, ordre?: number}>,
 *   frameIndex: number,
 *   onFrameChange: (index: number) => void,
 *   evolution?: Array<{date: string, score_total: number, etablies: number}>,
 *   cumulative?: number[], // nb de compétences SUR LA CARTE par trame (cumul)
 *   suspended?: boolean, // vrai quand un secteur est sélectionné/survolé -> pause
 * }} props
 */
export default function TimelinePlayer({
  feuilles,
  frameIndex,
  onFrameChange,
  evolution = [],
  cumulative = [],
  suspended = false,
}) {
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(400)
  const [announcement, setAnnouncement] = useState('')
  const reducedMotion = useReducedMotion()

  const lastIndex = Math.max(0, (feuilles?.length ?? 0) - 1)
  const frame = Math.min(Math.max(0, frameIndex), lastIndex)
  const current = feuilles?.[frame]
  const label = current?.label ?? current?.iso ?? ''
  const stats = evolution[frame] ?? null

  // Refs lues par l'intervalle (évite de recréer le timer à chaque trame).
  const frameRef = useRef(frame)
  frameRef.current = frame
  const onFrameChangeRef = useRef(onFrameChange)
  onFrameChangeRef.current = onFrameChange

  /** Annonce lecteur d'écran (pause/scrub uniquement, jamais par tick). */
  function announce(index, extra = '') {
    const f = feuilles?.[index]
    const l = f?.label ?? f?.iso ?? ''
    const n = cumulative[index]
    const counter = typeof n === 'number' ? ` — ${plural(n, 'compétence')} sur la carte` : ''
    setAnnouncement(`${extra}${l}${counter}`)
  }

  const announceRef = useRef(null)
  announceRef.current = announce

  // Boucle de lecture : un setInterval nettoyé à la pause et au démontage.
  useEffect(() => {
    if (!playing || reducedMotion) return undefined
    const id = setInterval(() => {
      const next = frameRef.current + 1
      if (next > lastIndex) {
        setPlaying(false)
        announceRef.current(lastIndex, 'Fin de la lecture : ')
        return
      }
      onFrameChangeRef.current(next)
      if (next === lastIndex) {
        setPlaying(false)
        announceRef.current(lastIndex, 'Fin de la lecture : ')
      }
    }, speed)
    return () => clearInterval(id)
  }, [playing, speed, reducedMotion, lastIndex])

  // Pause imposée par le parent (secteur sélectionné/survolé : le re-render à
  // chaque trame ferait perdre le focus et la lecture du panneau de détails).
  useEffect(() => {
    if (suspended) setPlaying(false)
  }, [suspended])

  if (!feuilles || feuilles.length < 2) return null

  function togglePlay() {
    if (reducedMotion || suspended) return
    if (playing) {
      setPlaying(false)
      announce(frame, 'Pause : ')
      return
    }
    // Relire depuis le début quand on est déjà sur la dernière trame.
    if (frame >= lastIndex) onFrameChange(0)
    setPlaying(true)
  }

  function goTo(index) {
    const clamped = Math.min(Math.max(0, index), lastIndex)
    setPlaying(false)
    onFrameChange(clamped)
    announce(clamped)
  }

  return (
    <div className="timeline-player" role="group" aria-label="Timeline de construction de la cartographie">
      <div className="timeline-controls">
        <button type="button" aria-label="Première feuille" onClick={() => goTo(0)}>
          ⏮
        </button>
        <button type="button" aria-label="Feuille précédente" onClick={() => goTo(frame - 1)}>
          ◀
        </button>
        <button
          type="button"
          className="timeline-play"
          aria-pressed={playing}
          aria-label={playing ? 'Mettre la lecture en pause' : 'Lancer la lecture'}
          disabled={reducedMotion}
          title={
            reducedMotion
              ? 'Lecture automatique désactivée (préférence système : mouvement réduit)'
              : undefined
          }
          onClick={togglePlay}
        >
          {playing ? '⏸' : '▶'}
        </button>
        <button type="button" aria-label="Feuille suivante" onClick={() => goTo(frame + 1)}>
          ▶▶
        </button>
        <button type="button" aria-label="Dernière feuille" onClick={() => goTo(lastIndex)}>
          ⏭
        </button>
        <select
          className="timeline-speed"
          aria-label="Vitesse de lecture"
          value={speed}
          onChange={(event) => setSpeed(Number(event.target.value))}
        >
          {SPEEDS.map(({ ms, label: speedLabel }) => (
            <option key={ms} value={ms}>
              {speedLabel} ({ms} ms/feuille)
            </option>
          ))}
        </select>
      </div>
      <input
        type="range"
        className="timeline-scrubber"
        min={0}
        max={lastIndex}
        step={1}
        value={frame}
        aria-label="Position dans les feuilles du portfolio"
        aria-valuetext={label}
        onChange={(event) => goTo(Number(event.target.value))}
      />
      <p className="timeline-status">
        <span className="timeline-date">
          Feuille {frame + 1} / {feuilles.length} — {label}
        </span>
        {typeof cumulative[frame] === 'number' || stats ? (
          <span className="timeline-counter" data-testid="timeline-counter">
            {typeof cumulative[frame] === 'number'
              ? `${plural(cumulative[frame], 'compétence')} sur la carte`
              : `${plural(stats.etablies, 'compétence')} établies`}
            {stats ? ` · score du jour ${Math.round(stats.score_total)}` : ''}
          </span>
        ) : null}
      </p>
      <p className="timeline-sr-only" aria-live="polite" role="status">
        {announcement}
      </p>
    </div>
  )
}
