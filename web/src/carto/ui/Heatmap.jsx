// Interface ultime — heatmap (spec §5.7, §5.8, §6.2).
//
// Rendu SVG UNIQUE par bande (année scolaire ou civile), et non 365 boutons
// (défaut de V3) : la grille est un seul arrêt de tabulation ; les flèches
// déplacent la case active (±1 jour verticalement, ±7 horizontalement), la
// case active est désignée par aria-activedescendant et annoncée dans une
// zone de statut. Clic = fixe la date t ; double-clic (ou Maj+Entrée, ou le
// bouton « Ouvrir ce jour ») = cartographie du jour seul.

import { useEffect, useMemo, useRef, useState } from 'react'
import { calendarGrid, moveFocus } from '../core/heatmap.js'
import { daysBetween, formatLong, weekdayName } from '../core/dates.js'
import { heatColor, themed } from './colors.js'
import { usePalette } from './palette.js'

/** Remplissage d'une case pour les deux thèmes (D-60), dans la palette des pôles (D-64). */
const cellFill = (level, tint, palette) => themed(heatColor(level, tint, 'light', palette), heatColor(level, tint, 'dark', palette))

const CELL = 12
const GAP = 2
const STEP = CELL + GAP
const LEFT = 22
const TOP = 16
const WEEKDAY_LABELS = ['L', 'M', 'M', 'J', 'V', 'S', 'D']

const nf = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 })

/** Libellé accessible d'une case. */
export function cellLabel(date, cell, { mode, t, observed }) {
  const head = `${weekdayName(date)} ${formatLong(date)}`
  if (!cell) return `${head} : aucune donnée (silence)`
  const parts = []
  if (mode === 'volume') parts.push(cell.hasPortfolio ? `${nf.format(cell.value)} caractères` : 'analyse sans portfolio')
  else parts.push(`poids des traces ${nf.format(cell.value)}`)
  parts.push(`niveau ${cell.level} sur 5`)
  if (!cell.hasAnalysis) parts.push('sans analyse')
  parts.push(cell.active ? 'cochée' : 'décochée')
  if (observed) parts.push('compétence sélectionnée observée')
  if (t === date) parts.push('date t')
  return `${head} : ${parts.join(', ')}`
}

/**
 * Une bande de calendrier.
 * @param {{
 *   band: {from: string, to: string, label: string}, model: ReturnType<import('../core/heatmap.js').buildHeatmap>,
 *   t: string | null, focusDate: string | null, observed?: Set<string> | null, inspected?: string | null,
 *   markers?: Array<{date: string, label: string}>,
 *   brush?: boolean, onBrush?: (range: {from: string, to: string}) => void,
 *   onFocusDate: (d: string) => void, onSetT: (d: string) => void, onOpenDay: (d: string) => void,
 * }} props
 */
export function HeatmapBand({ band, model, t, focusDate, observed = null, inspected = null, markers = [], brush = false, onBrush, onFocusDate, onSetT, onOpenDay }) {
  const { weeks, months } = useMemo(() => calendarGrid(band), [band])
  const palette = usePalette()
  const svgRef = useRef(null)
  const [drag, setDrag] = useState(null)
  const idOf = (d) => `carto-hm-${d}`
  // Le nom du dernier mois a sa place, même commencé la dernière semaine.
  const width = LEFT + Math.max(weeks.length, (months.at(-1)?.week ?? 0) + 2) * STEP
  const height = TOP + 7 * STEP
  const active = focusDate && focusDate >= band.from && focusDate <= band.to ? focusDate : null
  const firstDocumented = useMemo(() => [...model.cells.keys()].find((d) => d >= band.from && d <= band.to) ?? band.from, [model, band])
  const lastDocumented = useMemo(() => [...model.cells.keys()].filter((d) => d >= band.from && d <= band.to).sort().at(-1) ?? null, [model, band])
  const scrollRef = useRef(null)

  // Sur un écran étroit, la bande défile horizontalement : on amène à la vue
  // la semaine utile (case active, sinon date t, sinon dernière journée
  // documentée) au lieu de laisser l'apprenant devant des semaines vides.
  const target = active ?? (t && t >= band.from && t <= band.to ? t : null) ?? lastDocumented
  const targetWeek = target ? weeks.findIndex((w) => w.days.includes(target)) : -1
  useEffect(() => {
    const el = scrollRef.current
    if (!el || targetWeek < 0 || el.scrollWidth <= el.clientWidth) return
    const x = LEFT + targetWeek * STEP
    if (x >= el.scrollLeft + STEP && x <= el.scrollLeft + el.clientWidth - 2 * STEP) return
    el.scrollLeft = Math.max(0, x - el.clientWidth / 2)
  }, [targetWeek])

  function onKeyDown(e) {
    const current = active ?? firstDocumented
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) {
      e.preventDefault()
      onFocusDate(moveFocus(current, e.key, band))
    } else if (e.key === 'Enter' && e.shiftKey) {
      e.preventDefault()
      onOpenDay(current)
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onSetT(current)
    } else if (e.key.toLowerCase() === 'o') {
      e.preventDefault()
      onOpenDay(current)
    }
  }

  const range = drag ? (drag.a <= drag.b ? [drag.a, drag.b] : [drag.b, drag.a]) : null

  return (
    <div className="carto-hm-band">
      <div className="carto-hm-band-label">{band.label}</div>
      <div className="carto-hm-scroll" ref={scrollRef}>
        <svg
          ref={svgRef}
          className={`carto-hm${brush ? ' carto-hm--brush' : ''}`}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="grid"
          aria-label={`Heatmap ${band.label} : flèches pour se déplacer, Entrée pour fixer la date, Maj+Entrée ou O pour ouvrir la journée`}
          aria-activedescendant={active && model.cells.has(active) ? idOf(active) : active ? idOf(active) : undefined}
          tabIndex={0}
          onKeyDown={onKeyDown}
          onFocus={() => {
            if (!active) onFocusDate(firstDocumented)
          }}
          onPointerUp={() => {
            if (drag && onBrush) onBrush({ from: range[0], to: range[1] })
            setDrag(null)
          }}
          onPointerLeave={() => setDrag(null)}
        >
          {months.map((m) => (
            <text key={m.key} className="carto-hm-month" x={LEFT + m.week * STEP} y={TOP - 5}>
              {m.label}
            </text>
          ))}
          {WEEKDAY_LABELS.map((l, i) => (i % 2 === 0 ? (
            <text key={i} className="carto-hm-weekday" x={0} y={TOP + i * STEP + CELL - 2}>
              {l}
            </text>
          ) : null))}
          {markers
            .filter((m) => m.date >= band.from && m.date <= band.to)
            .map((m) => {
              const wi = weeks.findIndex((w) => w.days.includes(m.date))
              if (wi < 0) return null
              const x = LEFT + wi * STEP - GAP / 2
              return (
                <g key={m.id ?? m.date} className="carto-hm-marker" aria-hidden="true">
                  <line x1={x} x2={x} y1={TOP - 2} y2={height} />
                  <title>{`${m.label} (${formatLong(m.date)})`}</title>
                </g>
              )
            })}
          {[0, 1, 2, 3, 4, 5, 6].map((row) => (
            <g key={row} role="row">
              {weeks.map((w, wi) => {
                const date = w.days[row]
                const x = LEFT + wi * STEP
                const y = TOP + row * STEP
                if (!date) return <rect key={wi} role="gridcell" aria-hidden="true" x={x} y={y} width={CELL} height={CELL} className="carto-hm-void" />
                const cell = model.cells.get(date) ?? null
                const isObserved = observed ? observed.has(date) : false
                const classes = ['carto-hm-cell']
                if (!cell) classes.push('is-silent')
                else if (!cell.active) classes.push('is-inactive')
                if (cell?.analysisWithoutPortfolio) classes.push('is-no-portfolio')
                if (cell && !cell.hasAnalysis) classes.push('is-no-analysis')
                if (observed && cell) classes.push(isObserved ? 'is-observed' : 'is-unobserved')
                if (t && date > t && cell) classes.push('is-after-t')
                if (t === date) classes.push('is-t')
                if (inspected === date) classes.push('is-inspected')
                if (active === date) classes.push('is-focus')
                if (range && date >= range[0] && date <= range[1]) classes.push('is-brushed')
                if (cell) classes.push('carto-c-fill')
                return (
                  <rect
                    key={wi}
                    id={idOf(date)}
                    role="gridcell"
                    aria-selected={t === date}
                    aria-label={cellLabel(date, cell, { mode: model.mode, t, observed: isObserved })}
                    x={x}
                    y={y}
                    width={CELL}
                    height={CELL}
                    rx={2}
                    className={classes.join(' ')}
                    style={cell ? cellFill(cell.level, cell.tint, palette) : undefined}
                    onClick={() => {
                      onFocusDate(date)
                      if (!brush) onSetT(date)
                    }}
                    onDoubleClick={() => {
                      if (!brush) onOpenDay(date)
                    }}
                    onPointerDown={(e) => {
                      if (!brush) return
                      e.preventDefault()
                      setDrag({ a: date, b: date })
                    }}
                    onPointerEnter={() => {
                      if (drag) setDrag((d) => ({ ...d, b: date }))
                    }}
                  >
                    <title>{cellLabel(date, cell, { mode: model.mode, t, observed: isObserved })}</title>
                  </rect>
                )
              })}
            </g>
          ))}
        </svg>
      </div>
    </div>
  )
}

/**
 * Légende de la heatmap (§5.7 : niveaux ipsatifs, silence) : seulement ce que
 * la période affichée contient (D-59) — les niveaux présents, le silence s'il
 * y a des jours sans rien, les analyses sans portfolio, les journées décochées.
 * @param {{model: object, period?: {from: string, to: string} | null}} props
 */
export function HeatmapLegend({ model, period = null }) {
  const unit = model.mode === 'volume' ? 'caractères du portfolio' : 'poids des traces (aucun portfolio importé)'
  const th = model.thresholds
  const bounds = [`≤ ${nf.format(th[0])}`, `≤ ${nf.format(th[1])}`, `≤ ${nf.format(th[2])}`, `≤ ${nf.format(th[3])}`, `> ${nf.format(th[3])}`]
  const cells = [...model.cells.values()]
  const levels = [1, 2, 3, 4, 5].filter((l) => cells.some((c) => c.level === l))
  const silent = period ? daysBetween(period.from, period.to) + 1 > model.cells.size : true
  const noPortfolio = cells.some((c) => c.analysisWithoutPortfolio)
  const unchecked = cells.some((c) => !c.active)
  return (
    <div className="carto-hm-legend" aria-label="Légende de la heatmap">
      <span className="carto-hm-legend-unit">Couleur : {unit}, en niveaux relatifs à vos propres journées</span>
      <ul>
        {silent ? (
          <li>
            <svg width="12" height="12" aria-hidden="true"><rect width="12" height="12" rx="2" className="carto-hm-cell is-silent" fill="transparent" /></svg>
            silence
          </li>
        ) : null}
        {levels.map((l) => (
          <li key={l}>
            <svg width="12" height="12" aria-hidden="true"><rect width="12" height="12" rx="2" className="carto-c-fill" style={cellFill(l, null)} /></svg>
            {bounds[l - 1]}
          </li>
        ))}
        {noPortfolio ? (
          <li>
            <svg width="12" height="12" aria-hidden="true"><rect width="12" height="12" rx="2" className="carto-hm-cell is-no-portfolio carto-c-fill" style={cellFill(1, null)} /></svg>
            analyse sans portfolio
          </li>
        ) : null}
        {unchecked ? (
          <li>
            <svg width="12" height="12" aria-hidden="true"><rect width="12" height="12" rx="2" className="carto-hm-cell is-inactive carto-c-fill" style={cellFill(3, null)} /></svg>
            décochée
          </li>
        ) : null}
      </ul>
    </div>
  )
}
