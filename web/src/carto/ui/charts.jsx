// Interface ultime — graphiques SVG maison (spec §10 : aucun CDN, aucune
// bibliothèque). Axe temporel RÉEL (les silences se voient, une courbe est
// coupée au-delà d'un trou), valeur manquante ≠ 0, info-bulles au survol, au
// toucher ET au clavier (un seul arrêt de tabulation, ← → pour se déplacer,
// Entrée pour ouvrir la journée), équivalent textuel par point.

import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { addDays, daysBetween, formatLong, formatShort, monthName } from '../core/dates.js'

/** Maximum « rond » au-dessus d'une valeur (1, 2, 2,5, 5 × 10ⁿ). */
export function niceMax(v) {
  if (!(v > 0)) return 1
  const p = 10 ** Math.floor(Math.log10(v))
  const n = v / p
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10
  return step * p
}

const DEFAULT_W = 640
const L = 44
const R = 12
const T = 20
const B = 22

/**
 * Largeur réelle d'un conteneur (px), pour dessiner le SVG à l'échelle 1 : les
 * textes gardent leur taille quelle que soit la largeur de la tuile.
 */
export function useWidth(ref, fallback = DEFAULT_W) {
  const [width, setWidth] = useState(fallback)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return undefined
    const update = () => {
      const w = Math.round(el.clientWidth)
      if (w > 0) setWidth(Math.max(280, w))
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref])
  return width
}

/** Débuts de mois compris dans [from, to]. */
function monthStarts(from, to) {
  const out = []
  let d = `${from.slice(0, 7)}-01`
  if (d < from) d = addDays(`${from.slice(0, 7)}-28`, 4).slice(0, 7) + '-01'
  while (d <= to) {
    out.push(d)
    d = addDays(`${d.slice(0, 7)}-28`, 4).slice(0, 7) + '-01'
  }
  return out
}

/**
 * Graphique temporel : barres (une série) ou lignes (plusieurs séries).
 * @param {{
 *   label: string,
 *   series: Array<{key: string, label: string, color?: string, points: Array<{date: string, value: number}>}>,
 *   from: string, to: string, kind?: 'bars' | 'lines', height?: number, yMax?: number | null,
 *   format?: (v: number) => string, markers?: Array<{id?: string, date: string, label: string}>,
 *   phases?: Array<{id?: string, date: string, to: string | null, label: string}>,
 *   reference?: {value: number, label: string} | null, maxGap?: number,
 *   onPick?: (date: string) => void, describePoint?: (date: string) => string,
 * }} props
 */
export function TimeChart({ label, series, from, to, kind = 'bars', height = 150, yMax = null, format = (v) => String(v), markers = [], phases = [], reference = null, maxGap = 7, onPick, describePoint }) {
  const uid = useId().replace(/:/g, '')
  const svgRef = useRef(null)
  const boxRef = useRef(null)
  const W = useWidth(boxRef)
  const [active, setActive] = useState(null)
  const span = Math.max(1, daysBetween(from, to) + 1)
  const plotW = W - L - R
  const H = T + height + B
  const x = (d) => L + ((daysBetween(from, d) + 0.5) / span) * plotW
  const max = yMax ?? niceMax(Math.max(0, ...series.flatMap((s) => s.points.map((p) => p.value)), reference?.value ?? 0))
  const y = (v) => T + height - (Math.max(0, Math.min(v, max)) / max) * height
  const dates = useMemo(() => [...new Set(series.flatMap((s) => s.points.map((p) => p.date)))].filter((d) => d >= from && d <= to).sort(), [series, from, to])
  const values = (d) => series.map((s) => ({ s, p: s.points.find((p) => p.date === d) })).filter((v) => v.p)
  const describe = (d) => describePoint?.(d) ?? `${formatLong(d)} : ${values(d).map(({ s, p }) => `${series.length > 1 ? `${s.label} ` : ''}${format(p.value)}`).join(', ')}`
  const barW = Math.max(1.5, Math.min(10, (plotW / span) * 0.8))
  const activeDate = active !== null ? dates[active] : null

  const pick = (clientX) => {
    const svg = svgRef.current
    if (!svg || dates.length === 0) return
    const rect = svg.getBoundingClientRect()
    if (!rect.width) return
    const vx = ((clientX - rect.left) / rect.width) * W
    let best = 0
    for (let i = 1; i < dates.length; i++) if (Math.abs(x(dates[i]) - vx) < Math.abs(x(dates[best]) - vx)) best = i
    setActive(best)
  }

  const onKeyDown = (e) => {
    if (dates.length === 0) return
    const i = active ?? -1
    let next = null
    if (e.key === 'ArrowRight') next = Math.min(dates.length - 1, i + 1)
    else if (e.key === 'ArrowLeft') next = Math.max(0, i < 0 ? dates.length - 1 : i - 1)
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = dates.length - 1
    else if (e.key === 'Enter' && activeDate && onPick) {
      e.preventDefault()
      onPick(activeDate)
      return
    }
    if (next === null) return
    e.preventDefault()
    setActive(next)
  }

  const lines = (s) => {
    const pts = [...s.points].filter((p) => p.date >= from && p.date <= to).sort((a, b) => (a.date < b.date ? -1 : 1))
    const segs = []
    let cur = []
    for (const p of pts) {
      if (cur.length && daysBetween(cur.at(-1).date, p.date) > maxGap) {
        segs.push(cur)
        cur = []
      }
      cur.push(p)
    }
    if (cur.length) segs.push(cur)
    return segs
  }

  return (
    <figure className="carto-chart">
      <div className="carto-chart-box" ref={boxRef}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          role="listbox"
          aria-label={`${label} — flèches gauche et droite pour parcourir les journées${onPick ? ', Entrée pour ouvrir' : ''}`}
          aria-activedescendant={activeDate ? `${uid}-${activeDate}` : undefined}
          tabIndex={0}
          onKeyDown={onKeyDown}
          onPointerMove={(e) => pick(e.clientX)}
          onPointerDown={(e) => pick(e.clientX)}
          onPointerLeave={() => setActive(null)}
          onBlur={() => setActive(null)}
          onClick={() => activeDate && onPick?.(activeDate)}
        >
          {phases.map((p) => {
            const a = x(p.date) - (plotW / span) * 0.5
            const b = x(p.to ?? p.date) + (plotW / span) * 0.5
            return (
              <g key={p.id ?? `${p.date}-${p.label}`} className="carto-chart-phase" aria-hidden="true">
                <rect x={a} y={T} width={Math.max(2, b - a)} height={height} />
                <text x={a + 3} y={T + 11}>
                  {p.label.slice(0, 24)}
                </text>
              </g>
            )
          })}
          {[0, 0.5, 1].map((f) => (
            <g key={f} className="carto-chart-grid" aria-hidden="true">
              <line x1={L} x2={W - R} y1={y(max * f)} y2={y(max * f)} />
              <text x={L - 4} y={y(max * f) + 3} textAnchor="end">
                {format(max * f)}
              </text>
            </g>
          ))}
          <g className="carto-chart-month" aria-hidden="true">
            <text x={L} y={T + height + 15}>
              {shortDate(from)}
            </text>
            {span > 1 ? (
              <text x={W - R} y={T + height + 15} textAnchor="end">
                {shortDate(to)}
              </text>
            ) : null}
          </g>
          {monthStarts(from, to)
            .filter((m) => x(m) > L + 70 && x(m) < W - R - 70)
            .map((m) => (
            <g key={m} className="carto-chart-month" aria-hidden="true">
              <line x1={x(m)} x2={x(m)} y1={T + height} y2={T + height + 4} />
              <text x={x(m) + 2} y={T + height + 15}>
                {monthName(m, { short: true })}
              </text>
            </g>
          ))}
          {kind === 'bars'
            ? series.flatMap((s) =>
                s.points
                  .filter((p) => p.date >= from && p.date <= to)
                  .map((p) => (
                    <rect
                      key={`${s.key}-${p.date}`}
                      className={`carto-chart-bar${activeDate === p.date ? ' is-active' : ''}`}
                      x={x(p.date) - barW / 2}
                      y={y(p.value)}
                      width={barW}
                      height={Math.max(0.5, T + height - y(p.value))}
                      fill={s.color}
                      aria-hidden="true"
                    />
                  )),
              )
            : series.map((s) => (
                <g key={s.key} className="carto-chart-series" aria-hidden="true">
                  {lines(s).map((seg) =>
                    seg.length > 1 ? <polyline key={seg[0].date} points={seg.map((p) => `${x(p.date).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ')} stroke={s.color} /> : null,
                  )}
                  {s.points
                    .filter((p) => p.date >= from && p.date <= to)
                    .map((p) => (
                      <circle key={p.date} cx={x(p.date)} cy={y(p.value)} r={activeDate === p.date ? 4 : 2.5} fill={s.color} />
                    ))}
                </g>
              ))}
          {reference ? (
            <g className="carto-chart-ref" aria-hidden="true">
              <line x1={L} x2={W - R} y1={y(reference.value)} y2={y(reference.value)} />
              <text x={W - R} y={y(reference.value) - 3} textAnchor="end">
                {reference.label}
              </text>
            </g>
          ) : null}
          {markers.map((m) => (
            <g key={m.id ?? `${m.date}-${m.label}`} className="carto-chart-marker" aria-hidden="true">
              <line x1={x(m.date)} x2={x(m.date)} y1={T - 4} y2={T + height} />
              <text x={x(m.date) + 2} y={T - 7}>
                {m.label.slice(0, 22)}
              </text>
            </g>
          ))}
          {dates.map((d, i) => (
            <rect
              key={d}
              id={`${uid}-${d}`}
              role="option"
              aria-selected={active === i}
              aria-label={describe(d)}
              className={`carto-chart-hit${active === i ? ' is-active' : ''}`}
              x={x(d) - Math.max(3, plotW / span / 2)}
              y={T}
              width={Math.max(6, plotW / span)}
              height={height}
            />
          ))}
        </svg>
        {activeDate ? (
          <div className="carto-chart-tip" style={{ left: `${(x(activeDate) / W) * 100}%` }} role="presentation">
            {describe(activeDate)}
          </div>
        ) : null}
      </div>
      <p className="carto-visually-hidden" aria-live="polite">
        {activeDate ? describe(activeDate) : ''}
      </p>
    </figure>
  )
}

/**
 * Petite courbe sans interaction (tableaux) : axe temporel réel, coupée aux trous.
 * Les pastilles (`dots`) ont leur propre échelle (`dotsMax`, 1 par défaut :
 * une confiance), indépendante de celle du trait (`max`).
 * @param {{points: Array<{date: string, value: number}>, from: string, to: string, max?: number,
 *   color?: string, dots?: Array<{date: string, value: number}>, dotsMax?: number, label: string, maxGap?: number}} props
 */
export function Sparkline({ points, from, to, max = 1, color = 'currentColor', dots = [], dotsMax = 1, label, maxGap = 14 }) {
  const w = 160
  const h = 28
  const span = Math.max(1, daysBetween(from, to) + 1)
  const sx = (d) => 2 + ((daysBetween(from, d) + 0.5) / span) * (w - 4)
  const scaleY = (top) => (v) => h - 3 - (Math.max(0, Math.min(v, top)) / top) * (h - 6)
  const sy = scaleY(max > 0 ? max : 1)
  const syDot = scaleY(dotsMax > 0 ? dotsMax : 1)
  const segs = []
  let cur = []
  for (const p of [...points].sort((a, b) => (a.date < b.date ? -1 : 1))) {
    if (cur.length && daysBetween(cur.at(-1).date, p.date) > maxGap) {
      segs.push(cur)
      cur = []
    }
    cur.push(p)
  }
  if (cur.length) segs.push(cur)
  return (
    <svg className="carto-spark" viewBox={`0 0 ${w} ${h}`} role="img" aria-label={label}>
      <line x1={0} x2={w} y1={h - 3} y2={h - 3} className="carto-spark-base" />
      {segs.map((seg) =>
        seg.length > 1 ? (
          <polyline key={seg[0].date} points={seg.map((p) => `${sx(p.date).toFixed(1)},${sy(p.value).toFixed(1)}`).join(' ')} stroke={color} fill="none" strokeWidth={1.5} />
        ) : (
          <circle key={seg[0].date} cx={sx(seg[0].date)} cy={sy(seg[0].value)} r={1.8} fill={color} />
        ),
      )}
      {dots.map((p) => (
        <circle key={`d${p.date}`} cx={sx(p.date)} cy={syDot(p.value)} r={1.6} className="carto-spark-dot" />
      ))}
    </svg>
  )
}

/**
 * Radar (parts ipsatives) : une ou deux séries, échelle commune sans plafond fixe.
 * @param {{axes: Array<{key: string, label: string}>, series: Array<{key: string, label: string, className: string, values: Record<string, number>}>,
 *   max: number, label: string, format?: (v: number) => string}} props
 */
export function RadarChart({ axes, series, max, label, format = (v) => `${(v * 100).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %` }) {
  const n = Math.max(axes.length, 3)
  const Rr = 120
  const pt = (i, value) => {
    const a = -Math.PI / 2 + (2 * Math.PI * i) / n
    const r = (Math.max(0, value) / max) * Rr
    return [r * Math.cos(a), r * Math.sin(a)]
  }
  const ring = (f) => Array.from({ length: n }, (_, i) => pt(i, max * f).map((c) => c.toFixed(1)).join(',')).join(' ')
  return (
    <svg className="carto-radar" viewBox="-215 -150 430 300" role="img" aria-label={`${label}. ${axes.map((a) => `${a.label} : ${series.map((s) => format(s.values[a.key] ?? 0)).join(' / ')}`).join(' ; ')}.`}>
      {[0.5, 1].map((f) => (
        <polygon key={f} points={ring(f)} className="carto-radar-grid" />
      ))}
      {axes.map((a, i) => {
        const [ex, ey] = pt(i, max)
        const [lx, ly] = pt(i, max * 1.16)
        return (
          <g key={a.key}>
            <line x1={0} y1={0} x2={ex} y2={ey} className="carto-radar-grid" />
            <text x={lx} y={ly} textAnchor={Math.abs(lx) < 8 ? 'middle' : lx > 0 ? 'start' : 'end'} dominantBaseline="middle" className="carto-radar-label">
              {a.label}
            </text>
          </g>
        )
      })}
      {series.map((s) => (
        <polygon key={s.key} points={axes.map((a, i) => pt(i, s.values[a.key] ?? 0).map((c) => c.toFixed(1)).join(',')).join(' ')} className={s.className} />
      ))}
      <text x={4} y={-Rr - 4} className="carto-radar-tick">
        {format(max)}
      </text>
    </svg>
  )
}

/** Barre de confiance : vert > 0,6, orange > 0,3, gris sinon (spec §10). */
export function ConfidenceBar({ value }) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return <span className="carto-muted carto-small">confiance inconnue</span>
  const tier = value > 0.6 ? 'high' : value > 0.3 ? 'mid' : 'low'
  return (
    <span className="carto-conf" title={`confiance ${value.toLocaleString('fr-FR', { maximumFractionDigits: 2 })}`}>
      <span className="carto-conf-track" aria-hidden="true">
        <span className={`carto-conf-fill is-${tier}`} style={{ width: `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%` }} />
      </span>
      <span className="carto-small">confiance {value.toLocaleString('fr-FR', { maximumFractionDigits: 2 })}</span>
    </span>
  )
}

/** Libellé court d'une date pour les en-têtes de tableau. */
export const shortDate = (d) => formatShort(d).replace(/^\S+\s/u, '')
