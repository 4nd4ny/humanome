// Interface ultime — cartographie d'UNE journée en fenêtre modale (spec §6.2) :
// angles, confiance et traces de ce seul jour ; navigation jour précédent /
// suivant parmi les journées actives ; retour. Dialogue modal accessible :
// piège de focus, Échap pour fermer, focus rendu à l'élément d'origine.

import { useEffect, useMemo, useRef } from 'react'
import { computeDayState, layoutSun } from '../core/state.js'
import { contributingVariant, hasPortfolio } from '../core/model.js'
import { formatLong, formatShort, weekdayName } from '../core/dates.js'
import { Sun } from './Sun.jsx'
import { provenanceLabel } from './Manager.jsx'

const fmt = (n) => (typeof n === 'number' && Number.isFinite(n) ? n.toLocaleString('fr-FR', { maximumFractionDigits: 2 }) : '—')

/**
 * Piège de focus d'un dialogue (Tab / Maj+Tab restent à l'intérieur).
 * Le focus est rendu, à la fermeture, à l'élément qui l'avait avant
 * l'ouverture. Le piège peut être suspendu (`active` = false) pendant qu'un
 * volet non modal ouvert depuis le dialogue a la main (lecteur de portfolio) ;
 * à la reprise, le focus reste où il est s'il est déjà dans le dialogue.
 */
export function useFocusTrap(containerRef, active, onEscape) {
  const returnTo = useRef(null)

  // Ouverture / fermeture du dialogue : mémoriser puis rendre le focus.
  useEffect(() => {
    const prev = document.activeElement
    returnTo.current = prev && !containerRef.current?.contains(prev) ? prev : null
    return () => {
      const el = returnTo.current
      if (el && el.isConnected && typeof el.focus === 'function') el.focus()
    }
  }, [containerRef])

  useEffect(() => {
    if (!active) return undefined
    const root = containerRef.current
    const focusables = () =>
      [...(root?.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])') ?? [])].filter(
        (el) => !el.hasAttribute('disabled') && el.getAttribute('aria-hidden') !== 'true',
      )
    if (!root?.contains(document.activeElement)) focusables()[0]?.focus()
    function onKey(e) {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onEscape()
        return
      }
      if (e.key !== 'Tab') return
      const items = focusables()
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    root?.addEventListener('keydown', onKey)
    return () => root?.removeEventListener('keydown', onKey)
  }, [containerRef, active, onEscape])
}

const STATUS_GROUPS = [
  ['observed', 'Compétences observées ce jour'],
  ['not_established', 'Examinées sans trace retenue (présence non établie)'],
  ['court', 'Non instruites ce jour (court-circuit)'],
  ['unknown', 'Statut inconnu'],
]

/**
 * @param {{
 *   date: string, dataset: object, refl: object, params: object, geometry: object,
 *   activeDates: string[], focusCode?: string | null, reinforced?: boolean,
 *   onClose: () => void, onNavigate: (d: string) => void, onSelect?: (t: object) => void,
 *   renderVerdict?: (v: object, variant: object) => React.ReactNode,
 *   trapActive?: boolean,
 *   children?: (ctx: {date: string, state: object, variant: object | null}) => React.ReactNode,
 * }} props
 *   renderVerdict : contenu dépliable de chaque compétence du jour (traces, motif, jury) ;
 *   trapActive : false pendant que le lecteur de portfolio (volet non modal) a la main ;
 *   children : rendu supplémentaire en bas de la modale
 */
export function DayModal({ date, dataset, refl, params, geometry, activeDates, focusCode = null, reinforced = false, onClose, onNavigate, renderVerdict, trapActive = true, children }) {
  const ref = useRef(null)
  useFocusTrap(ref, trapActive, onClose)
  const day = dataset.days.find((d) => d.date === date)
  const variant = day ? contributingVariant(day) : null
  const state = useMemo(() => computeDayState(dataset, date, { ref: refl, params }), [dataset, date, refl, params])
  const layout = useMemo(() => layoutSun(state, refl, geometry, { minThickness: params?.minThicknessPx ?? 2 }), [state, refl, geometry, params])
  const nav = activeDates.includes(date) ? activeDates : [...activeDates, date].sort()
  const i = nav.indexOf(date)
  const prev = i > 0 ? nav[i - 1] : null
  const next = i >= 0 && i < nav.length - 1 ? nav[i + 1] : null

  const groups = useMemo(() => {
    const out = { observed: [], not_established: [], court: [], unknown: [] }
    for (const v of variant?.verdicts ?? []) {
      if (v.courtCircuit) out.court.push(v)
      else if (v.status === 'not_established') out.not_established.push(v)
      else if (v.status === 'unknown') out.unknown.push(v)
      else if (v.traces?.length) out.observed.push(v)
      else out.not_established.push(v)
    }
    const order = (a, b) => (refl.compByCode.get(a.code)?.order ?? 999) - (refl.compByCode.get(b.code)?.order ?? 999)
    for (const k of Object.keys(out)) out[k].sort(order)
    return out
  }, [variant, refl])

  return (
    <div className="carto-modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} className="carto-modal" role="dialog" aria-modal="true" aria-labelledby="carto-day-title">
        <header className="carto-modal-head">
          <div>
            <p className="carto-detail-kicker">Cartographie du jour seul</p>
            <h2 id="carto-day-title">
              {weekdayName(date)} {formatLong(date)}
            </h2>
          </div>
          <nav className="carto-modal-nav" aria-label="Journées actives">
            <button type="button" className="carto-btn carto-btn--quiet" disabled={!prev} onClick={() => prev && onNavigate(prev)}>
              ← {prev ? formatShort(prev) : 'précédente'}
            </button>
            <button type="button" className="carto-btn carto-btn--quiet" disabled={!next} onClick={() => next && onNavigate(next)}>
              {next ? formatShort(next) : 'suivante'} →
            </button>
            <button type="button" className="carto-btn" onClick={onClose}>
              Retour
            </button>
          </nav>
        </header>
        <div className="carto-modal-body">
          <div className="carto-modal-sun">
            <Sun refl={refl} state={state} layout={layout} geometry={geometry} reinforced={reinforced} compact label={`Soleil du ${formatLong(date)}`} highlightCodes={focusCode ? new Set([focusCode]) : null} />
            <dl className="carto-day-facts">
              <div>
                <dt>État</dt>
                <dd>{day?.active ? 'cochée' : 'décochée (ne compte pas dans l’ensemble actif)'}</dd>
              </div>
              <div>
                <dt>Portfolio</dt>
                <dd>{day && hasPortfolio(day) ? `${day.portfolio.chars.toLocaleString('fr-FR')} caractères` : 'aucun texte pour ce jour'}</dd>
              </div>
              <div>
                <dt>Analyse</dt>
                <dd>{variant ? provenanceLabel(variant) : day?.variants.length ? 'variante à choisir ou « à examiner »' : 'aucune'}</dd>
              </div>
              {day?.tags.length ? (
                <div>
                  <dt>Étiquettes</dt>
                  <dd>{day.tags.join(', ')}</dd>
                </div>
              ) : null}
            </dl>
          </div>
          <div className="carto-modal-verdicts">
            {STATUS_GROUPS.map(([key, title]) =>
              groups[key].length ? (
                <details key={key} className="carto-section" open={key === 'observed' || undefined}>
                  <summary>
                    {title} ({groups[key].length})
                  </summary>
                  <ul className="carto-verdict-list">
                    {groups[key].map((v) => {
                      const meta = refl.compByCode.get(v.code)
                      const s = state.competencies.get(v.code)
                      const line = (
                        <>
                          <span className="carto-code">{v.code}</span> {meta?.name ?? '(hors référentiel)'}
                          <span className="carto-count">
                            {' '}
                            · confiance {fmt(v.confidence)} · {v.proofs} preuve{v.proofs > 1 ? 's' : ''}, {v.hints} indice{v.hints > 1 ? 's' : ''}
                            {s ? ` · ${((s.theta / 360) * 100).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} % du jour` : ''}
                            {v.status === 'needs_review' ? ' · renvoi' : ''}
                          </span>
                        </>
                      )
                      return (
                        <li key={v.code} className={v.code === focusCode ? 'is-focus' : ''} style={{ '--pole-color': refl.poleByNum.get(meta?.pole)?.color ?? '#78716c' }}>
                          {renderVerdict && variant ? (
                            <details className="carto-day-verdict" open={v.code === focusCode || undefined}>
                              <summary>{line}</summary>
                              {renderVerdict(v, variant)}
                            </details>
                          ) : (
                            line
                          )}
                        </li>
                      )
                    })}
                  </ul>
                </details>
              ) : null,
            )}
            {!variant ? <p className="carto-muted">Pas d’analyse qui contribue pour ce jour.</p> : null}
            {typeof children === 'function' ? children({ date, state, variant }) : null}
          </div>
        </div>
      </div>
    </div>
  )
}
