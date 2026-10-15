// Interface ultime — panneau de la heatmap : choix du calendrier (« Tout voir »
// du premier au dernier jour, par défaut ; année scolaire août–juillet ;
// période libre, éventuellement au pinceau), bandes empilées, légende, statut
// de la case active et bouton « Ouvrir ce jour » (indispensable au tactile, où
// le double-clic n'existe pas). Contraste renforcé toujours appliqué (D-59).

import { useState } from 'react'
import { HeatmapBand, HeatmapLegend, cellLabel } from './Heatmap.jsx'
import { periodBands } from '../core/heatmap.js'
import { calendarModeOf } from '../core/model.js'
import { formatShort, isIsoDate, schoolYearStarting } from '../core/dates.js'

const MODES = [
  ['all', 'Tout voir'],
  ['school', 'Année scolaire'],
  ['free', 'Période libre'],
]

/**
 * @param {{
 *   model: object, prefs: object, period: {from: string, to: string}, schoolYear: number,
 *   t: string | null, focusDate: string | null, observed: Set<string> | null, inspected?: string | null,
 *   markers?: Array<object>, onPrefs: (patch: object) => void,
 *   onFocusDate: (d: string) => void, onSetT: (d: string) => void, onOpenDay: (d: string) => void,
 * }} props
 */
export function HeatmapPanel({ model, prefs, period, schoolYear, t, focusDate, observed, inspected = null, markers = [], onPrefs, onFocusDate, onSetT, onOpenDay }) {
  const [brush, setBrush] = useState(false)
  const mode = calendarModeOf(prefs)
  // « Tout voir » se range par années scolaires, coupées au premier et au dernier jour.
  const bands =
    mode === 'school'
      ? [schoolYearStarting(schoolYear)].map((sy) => ({ from: sy.start, to: sy.end, label: `Année scolaire ${sy.label}` }))
      : periodBands(period, mode === 'all' ? 'school' : 'free')
  // Choisir l'année scolaire fixe l'année affichée : c'est ce qui la distingue de l'ancien défaut.
  const choose = (m) => {
    // Le pinceau n'existe qu'en période libre : il ne survit pas à un changement de calendrier.
    setBrush(false)
    onPrefs(m === 'school' ? { calendarMode: 'school', schoolYearStart: schoolYear } : { calendarMode: m })
  }
  const status = focusDate ? cellLabel(focusDate, model.cells.get(focusDate) ?? null, { mode: model.mode, t, observed: observed?.has(focusDate) ?? false }) : 'Choisissez un jour : clic pour fixer la date t, double-clic pour l’ouvrir.'

  return (
    <section className="carto-heatmap" aria-label="Heatmap des journées">
      <div className="carto-heatmap-controls">
        <div role="radiogroup" aria-label="Calendrier" className="carto-seg">
          {MODES.map(([m, label]) => (
            <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => choose(m)}>
              {label}
            </button>
          ))}
        </div>
        {mode === 'all' ? null : mode === 'school' ? (
          <div className="carto-year-nav">
            <button type="button" className="carto-btn carto-btn--quiet" aria-label="Année scolaire précédente" onClick={() => onPrefs({ schoolYearStart: schoolYear - 1 })}>
              ←
            </button>
            <span>{schoolYearStarting(schoolYear).label}</span>
            <button type="button" className="carto-btn carto-btn--quiet" aria-label="Année scolaire suivante" onClick={() => onPrefs({ schoolYearStart: schoolYear + 1 })}>
              →
            </button>
          </div>
        ) : (
          <div className="carto-inline-form">
            <label>
              du{' '}
              <input type="date" value={period.from} onChange={(e) => isIsoDate(e.target.value) && onPrefs({ freeRange: { from: e.target.value, to: period.to < e.target.value ? e.target.value : period.to } })} />
            </label>
            <label>
              au <input type="date" value={period.to} onChange={(e) => isIsoDate(e.target.value) && onPrefs({ freeRange: { from: period.from > e.target.value ? e.target.value : period.from, to: e.target.value } })} />
            </label>
            <button type="button" className="carto-btn carto-btn--quiet" aria-pressed={brush} onClick={() => setBrush((b) => !b)}>
              {brush ? 'Pinceau actif : glissez sur les jours' : 'Choisir au pinceau'}
            </button>
          </div>
        )}
      </div>
      {bands.map((band) => (
        <HeatmapBand
          key={band.from}
          band={band}
          model={model}
          t={t}
          focusDate={focusDate}
          observed={observed}
          inspected={inspected}
          markers={markers}
          brush={brush}
          onBrush={(range) => {
            onPrefs({ calendarMode: 'free', freeRange: range })
            setBrush(false)
          }}
          onFocusDate={onFocusDate}
          onSetT={onSetT}
          onOpenDay={onOpenDay}
        />
      ))}
      <div className="carto-heatmap-foot">
        <p className="carto-small" role="status">
          {status}
        </p>
        <button type="button" className="carto-btn carto-btn--quiet" disabled={!(focusDate ?? t)} onClick={() => onOpenDay(focusDate ?? t)}>
          Ouvrir ce jour{focusDate ?? t ? ` (${formatShort(focusDate ?? t)})` : ''}
        </button>
      </div>
      <HeatmapLegend model={model} period={mode === 'school' ? { from: bands[0].from, to: bands[0].to } : period} />
    </section>
  )
}
