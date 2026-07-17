// Interface V3 — panneaux synchronisés (spec §13) : arbre, soleil, heatmap,
// lecteur temporel, portfolio, légende et indicateurs. Tous consomment le MÊME
// instantané calculé par V3View (même périmètre pour toutes les vues, §3.3).
// Le chevron et le libellé sont deux cibles distinctes (§13.1) ; inspecter une
// journée et déplacer la tête de lecture sont deux commandes différentes
// (§13.3, AC-SYNC-03/04).

import { useMemo, useRef, useState } from 'react'
import { heatmapLevel } from '../core/metrics.js'

// ---- Arbre du référentiel (§13.1) -------------------------------------------

export function TreePanel({ referential, snapshot, uiState, onToggleBranch, onSelectScope, onSelectLeaf }) {
  const expanded = uiState.effectiveExpanded
  return (
    <nav className="v3-panel v3-tree" aria-label="Référentiel de compétences">
      <h3>Référentiel</h3>
      <ul role="tree" aria-label={`${referential.id} ${referential.version}`}>
        {referential.families.map((f) => {
          const isOpen = expanded.has(f.id)
          const isScope = uiState.activeScopeNodeId === f.id
          return (
            <li key={f.id} role="treeitem" aria-expanded={isOpen} aria-selected={isScope}>
              <div className="v3-tree-row">
                <button
                  type="button"
                  className="v3-chevron"
                  aria-label={`${isOpen ? 'Fermer' : 'Ouvrir'} ${f.name}`}
                  onClick={() => onToggleBranch(f.id)}
                >
                  {isOpen ? '▾' : '▸'}
                </button>
                <button
                  type="button"
                  className={`v3-tree-label${isScope ? ' v3-active' : ''}`}
                  style={{ '--family-color': f.color }}
                  onClick={() => onSelectScope(f.id)}
                >
                  <span aria-hidden="true" className="v3-symbol">{f.symbol}</span> {f.name}
                </button>
              </div>
              {isOpen ? (
                <ul role="group">
                  {referential.competencies
                    .filter((c) => c.familyNum === f.num)
                    .map((c) => {
                      const value = snapshot.sun.get(c.code)
                      const cScope = uiState.activeScopeNodeId === `comp-${c.code}`
                      const dates = snapshot.datesByCompetency.get(c.code)
                      return (
                        <li key={c.code} role="treeitem" aria-selected={cScope} aria-expanded={expanded.has(`comp-${c.code}`) || undefined}>
                          <div className="v3-tree-row">
                            {dates?.size ? (
                              <button type="button" className="v3-chevron" aria-label={`${expanded.has(`comp-${c.code}`) ? 'Fermer' : 'Ouvrir'} les journées de ${c.name}`} onClick={() => onToggleBranch(`comp-${c.code}`)}>
                                {expanded.has(`comp-${c.code}`) ? '▾' : '▸'}
                              </button>
                            ) : (
                              <span className="v3-chevron" aria-hidden="true" />
                            )}
                            <button type="button" className={`v3-tree-label${cScope ? ' v3-active' : ''}`} onClick={() => onSelectScope(`comp-${c.code}`)}>
                              {c.code} — {c.name}
                              <span className="v3-count">{value?.count ? ` · ${value.count} j.` : ''}</span>
                            </button>
                          </div>
                          {expanded.has(`comp-${c.code}`) && dates?.size ? (
                            <ul role="group">
                              {[...dates].sort().map((d) => (
                                <li key={d} role="treeitem">
                                  <button type="button" className="v3-tree-leaf" onClick={() => onSelectLeaf(c.code, d)}>
                                    {d}
                                  </button>
                                </li>
                              ))}
                            </ul>
                          ) : null}
                        </li>
                      )
                    })}
                </ul>
              ) : null}
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

// ---- Soleil (§11.1, §13.2) ---------------------------------------------------

const TAU = Math.PI * 2

function sectorPath(cx, cy, r0, r1, a0, a1) {
  // Deux arcs SVG (grand-arc géré) — jamais un secteur de 360° d'un seul arc.
  if (a1 - a0 >= TAU - 1e-6) a1 = a0 + TAU - 1e-4
  const p = (r, a) => `${cx + r * Math.cos(a)} ${cy + r * Math.sin(a)}`
  const large = a1 - a0 > Math.PI ? 1 : 0
  return `M ${p(r0, a0)} A ${r0} ${r0} 0 ${large} 1 ${p(r0, a1)} L ${p(r1, a1)} A ${r1} ${r1} 0 ${large} 0 ${p(r1, a0)} Z`
}

export function SunPanel({ referential, snapshot, uiState, reinforced, onSelectScope, onClearScope, onWhy, onHover }) {
  const size = 420
  const cx = size / 2
  const cy = size / 2
  const r0 = 44
  const rMax = size / 2 - 8
  const comps = referential.competencies
  const slot = TAU / Math.max(1, comps.length)

  // Cadrage radial optionnel (sunViewportNodeId) : zoom sans effet filtrant (§13.2).
  const viewFamily = uiState.sunViewportNodeId?.startsWith('family-')
    ? Number(uiState.sunViewportNodeId.slice(7))
    : null
  const visible = viewFamily ? comps.filter((c) => c.familyNum === viewFamily) : comps
  const vSlot = TAU / Math.max(1, visible.length)

  const inspectedCodes = useMemo(() => {
    if (!uiState.inspection?.day) return new Set()
    const codes = snapshot.competenciesByDate.get(uiState.inspection.day)
    return codes ?? new Set()
  }, [uiState.inspection, snapshot])

  return (
    <section className="v3-panel v3-sun" aria-label="Soleil des compétences">
      <div className="v3-sun-head">
        <h3>Soleil</h3>
        {viewFamily ? (
          <button type="button" onClick={() => onSelectScope(null, { viewport: null })}>Vue complète</button>
        ) : null}
        {uiState.activeScopeNodeId ? (
          <span className="v3-chip">
            {uiState.activeScopeNodeId}
            <button type="button" aria-label="Retirer le filtre" onClick={onClearScope}>×</button>
          </span>
        ) : null}
      </div>
      <svg viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Diagramme radial : rayon = journées documentées par compétence (la liste équivalente est dans l’arbre et le tableau)">
        <circle cx={cx} cy={cy} r={r0 - 6} className="v3-sun-center" onClick={onClearScope} role="button" aria-label="Toutes les compétences" tabIndex={-1} />
        {visible.map((c, i) => {
          const family = referential.familyByNum.get(c.familyNum)
          const a0 = -Math.PI / 2 + i * vSlot
          const a1 = a0 + vSlot * 0.96
          const value = snapshot.sun.get(c.code)
          const proportion = value?.proportion ?? 0
          const r1 = r0 + (rMax - r0) * proportion
          const inScope =
            uiState.activeScopeNodeId === null ||
            uiState.activeScopeNodeId === `comp-${c.code}` ||
            uiState.activeScopeNodeId === family.id
          const inspected = inspectedCodes.has(c.code)
          return (
            <g key={c.code}>
              {/* Contour référentiel neutre : l'emplacement existe toujours (§13.2). */}
              <path d={sectorPath(cx, cy, r0, rMax, a0, a1)} className="v3-sector-ghost" />
              {value?.futureCount ? (
                <path d={sectorPath(cx, cy, r0, r0 + (rMax - r0) * Math.min(1, proportion + 0.08), a0, a1)} className="v3-sector-future" />
              ) : null}
              {proportion > 0 && inScope ? (
                <path
                  d={sectorPath(cx, cy, r0, r1, a0, a1)}
                  className={`v3-sector${inspected ? ' v3-halo' : ''}${reinforced ? ` v3-pattern-${family.pattern}` : ''}`}
                  fill={family.color}
                  tabIndex={0}
                  role="button"
                  aria-label={`${c.code} ${c.name} : ${value.count} journée${value.count > 1 ? 's' : ''} documentée${value.count > 1 ? 's' : ''}. Entrée : filtrer. w : pourquoi ce rayon ?`}
                  onClick={() => onSelectScope(`comp-${c.code}`)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') onSelectScope(`comp-${c.code}`)
                    if (e.key === 'w') onWhy(c.code)
                  }}
                  onMouseEnter={() => onHover(c.code)}
                  onMouseLeave={() => onHover(null)}
                  onFocus={() => onHover(c.code)}
                  onBlur={() => onHover(null)}
                />
              ) : null}
            </g>
          )
        })}
      </svg>
      <p className="v3-sun-note">
        Rayon = journées documentées (métrique {snapshot.metric.id}). L’angle est fixe par compétence ;
        l’absence de preuve n’est jamais « faible » — elle est « non documentée dans ce périmètre ».
      </p>
    </section>
  )
}

// ---- Heatmap (§11.3, §13.3) --------------------------------------------------

export function HeatmapPanel({ snapshot, uiState, referential, reinforced, onInspect, onSetPlayhead, onChangeYear }) {
  const gridRef = useRef(null)
  const dates = [...snapshot.competenciesByDate.keys()].sort()
  if (dates.length === 0) return null
  const years = [...new Set(dates.map((d) => d.slice(0, 4)))]
  const year = uiState.visibleHeatmapPeriod ?? years[years.length - 1]

  const start = new Date(`${year}-01-01T00:00:00Z`)
  const days = []
  for (let d = new Date(start); d.getUTCFullYear() === Number(year); d.setUTCDate(d.getUTCDate() + 1)) {
    days.push(d.toISOString().slice(0, 10))
  }

  const familiesOf = (date) => {
    const codes = snapshot.competenciesByDate.get(date)
    if (!codes) return []
    return [...new Set([...codes].map((c) => referential.competencyByCode.get(c)?.familyNum).filter(Boolean))]
  }

  const move = (e, index) => {
    const delta = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 7, ArrowUp: -7 }[e.key]
    if (!delta) return
    e.preventDefault()
    const next = gridRef.current?.querySelector(`[data-index="${index + delta}"]`)
    next?.focus()
  }

  return (
    <section className="v3-panel v3-heatmap" aria-label="Calendrier des journées documentées">
      <div className="v3-heatmap-head">
        <h3>Journées</h3>
        {years.length > 1 ? (
          <label>
            Année{' '}
            <select value={year} onChange={(e) => onChangeYear(e.target.value)}>
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </label>
        ) : null}
      </div>
      <div className="v3-heatmap-grid" role="grid" aria-label={`Heatmap ${year} : Entrée inspecte la journée`} ref={gridRef}>
        {days.map((date, i) => {
          const codes = snapshot.competenciesByDate.get(date)
          const n = codes?.size ?? 0
          const level = heatmapLevel(n)
          const isPlayhead = uiState.playheadDay === date
          const isInspected = uiState.inspection?.day === date
          const isFuture = uiState.playheadDay && date > uiState.playheadDay && n > 0
          const fams = n > 0 ? familiesOf(date) : []
          const color = fams.length === 1 ? referential.familyByNum.get(fams[0])?.color : null
          return (
            <button
              key={date}
              type="button"
              role="gridcell"
              data-index={i}
              tabIndex={i === 0 ? 0 : -1}
              className={[
                'v3-cell',
                `v3-level-${level}`,
                fams.length > 1 ? 'v3-multi' : '',
                isPlayhead ? 'v3-playhead' : '',
                isInspected ? 'v3-inspected' : '',
                isFuture ? 'v3-future' : '',
              ].filter(Boolean).join(' ')}
              style={color && !reinforced ? { '--cell-color': color } : undefined}
              aria-label={`${date} : ${n === 0 ? 'aucune observation documentée' : `${n} compétence${n > 1 ? 's' : ''} documentée${n > 1 ? 's' : ''}`}${isPlayhead ? '. Tête de lecture' : ''}`}
              onKeyDown={(e) => move(e, i)}
              onClick={() => (n > 0 ? onInspect(date) : null)}
            />
          )
        })}
      </div>
      {uiState.inspection?.day ? (
        <p className="v3-heatmap-actions">
          Journée inspectée : <strong>{uiState.inspection.day}</strong>{' '}
          <button type="button" onClick={() => onSetPlayhead(uiState.inspection.day)}>
            Voir l’état à cette date
          </button>
        </p>
      ) : null}
    </section>
  )
}

// ---- Lecteur temporel (§13.5) --------------------------------------------------

export function TimelineBar({ snapshot, uiState, onSetPlayhead, onPlay, onPause, onStep, onSpeed, reducedMotion }) {
  const dates = [...snapshot.competenciesByDate.keys()].sort()
  if (dates.length === 0) return null
  const current = uiState.playheadDay ?? dates[dates.length - 1]
  const index = Math.max(0, dates.indexOf(current))
  return (
    <section className="v3-panel v3-timeline" aria-label="Lecteur temporel">
      <div className="v3-timeline-controls">
        <button type="button" onClick={() => onSetPlayhead(dates[0])} aria-label="Aller au début">⏮</button>
        <button type="button" onClick={() => onStep(-1)} aria-label="Journée précédente">◀</button>
        {uiState.playback.playing ? (
          <button type="button" onClick={onPause} aria-label="Pause">⏸</button>
        ) : (
          <>
            <button type="button" onClick={() => onPlay(1)} aria-label="Lecture">▶</button>
            <button type="button" onClick={() => onPlay(-1)} aria-label="Lecture arrière — rejoue l’histoire antérieure, sans perte réelle">◀◀</button>
          </>
        )}
        <button type="button" onClick={() => onStep(1)} aria-label="Journée suivante">▶▶</button>
        <button type="button" onClick={() => onSetPlayhead(dates[dates.length - 1])} aria-label="Aller à la fin">⏭</button>
        <label>
          Vitesse{' '}
          <select value={uiState.playback.speed} onChange={(e) => onSpeed(Number(e.target.value))}>
            <option value="0.5">×0,5</option>
            <option value="1">×1</option>
            <option value="2">×2</option>
          </select>
        </label>
        {reducedMotion ? <span className="v3-note">mouvement réduit : transitions instantanées</span> : null}
      </div>
      <input
        type="range"
        min="0"
        max={dates.length - 1}
        value={index}
        aria-label={`Tête de lecture : ${current} (${index + 1}/${dates.length})`}
        aria-valuetext={current}
        onChange={(e) => onSetPlayhead(dates[Number(e.target.value)])}
      />
      <span className="v3-timeline-date">{current}</span>
    </section>
  )
}

// ---- Portfolio (§13.4) ---------------------------------------------------------

export function PortfolioPanel({ snapshot, master, uiState, referential, audience, onReview, onAnnotate, onToggleShare, onPin, onSelectScope, shareStatus }) {
  const day = uiState.inspection?.day
  const [note, setNote] = useState('')
  if (!day) {
    return (
      <section className="v3-panel v3-portfolio" aria-label="Portfolio">
        <h3>Portfolio</h3>
        <p>Sélectionnez une journée (heatmap ou feuille de l’arbre) pour lire ses passages.</p>
      </section>
    )
  }
  const events = snapshot.admissible.filter((e) => e.date === day)
  const isLearner = audience === 'learner'
  return (
    <section className="v3-panel v3-portfolio" aria-label={`Portfolio de la journée ${day}`}>
      <div className="v3-portfolio-head">
        <h3>Journée {day}</h3>
        <label>
          <input type="checkbox" checked={uiState.inspection.portfolioPinned} onChange={(e) => onPin(e.target.checked)} />{' '}
          Épingler pendant la lecture
        </label>
      </div>
      {events.length === 0 ? <p>Aucune observation documentée pour cette journée dans ce périmètre.</p> : null}
      {events.map((e) => {
        const comp = referential.competencyByCode.get(e.observation.rawCode)
        return (
          <article key={e.observation.id} className="v3-observation">
            <h4>
              <button type="button" className="v3-link" onClick={() => onSelectScope(`comp-${e.observation.rawCode}`)}>
                {e.observation.rawCode} — {comp?.name ?? 'hors référentiel'}
              </button>
            </h4>
            <p className="v3-provenance">
              Provenance : {e.day.provenance.map((p) => p.run).join(', ') || 'import'} · statut « {e.observation.rawStatus} » ·
              confiance du verdict {e.observation.verdictConfidence ?? '—'} (confiance dans le verdict, pas un niveau de maîtrise)
            </p>
            {e.links.map((l) => {
              const passage = master.passages.find((p) => p.id === l.passageId)
              if (!passage) return null
              return (
                <blockquote key={l.id} className="v3-passage">
                  <p>{passage.verbatim}</p>
                  {passage.contexte ? <footer>{passage.contexte}</footer> : null}
                  <p className="v3-review" aria-label="État de revue">
                    {l.reviewState === 'unreviewed' ? 'Non revue' : l.reviewState === 'confirmed' ? 'Confirmée' : l.reviewState === 'nuanced' ? 'Nuancée' : 'Contestée'}
                    {isLearner ? (
                      <>
                        {' — '}
                        <button type="button" onClick={() => onReview(l.id, 'confirmed')}>Confirmer</button>{' '}
                        <button type="button" onClick={() => onReview(l.id, 'nuanced')}>Nuancer</button>{' '}
                        <button type="button" onClick={() => onReview(l.id, 'contested')}>Contester</button>
                      </>
                    ) : null}
                  </p>
                  {isLearner && shareStatus ? (
                    <label className="v3-share-toggle">
                      <input
                        type="checkbox"
                        checked={shareStatus.linkIds.has(l.id)}
                        onChange={(ev) => onToggleShare(l.id, ev.target.checked)}
                      />{' '}
                      Inclure au partage (brouillon privé)
                    </label>
                  ) : null}
                </blockquote>
              )
            })}
            {isLearner ? (
              <details>
                <summary>Note privée, rôle et résultat</summary>
                <textarea rows={2} value={note} onChange={(ev) => setNote(ev.target.value)} aria-label="Note privée courte" />
                <button type="button" onClick={() => { onAnnotate(e.observation.id, { note, effectiveDay: day }); setNote('') }}>
                  Enregistrer (privé)
                </button>
              </details>
            ) : null}
          </article>
        )
      })}
    </section>
  )
}

// ---- Légende + indicateurs -----------------------------------------------------

export function LegendPanel({ referential, reinforced }) {
  return (
    <section className="v3-panel v3-legend" aria-label="Légende">
      <h3>Légende</h3>
      <ul>
        {referential.families.map((f) => (
          <li key={f.id}>
            <span className="v3-swatch" style={{ background: f.color }} aria-hidden="true" />
            <span aria-hidden="true">{f.symbol}</span> {f.name}
            {reinforced ? <span className="v3-note"> (motif {f.pattern})</span> : null}
          </li>
        ))}
      </ul>
      <p className="v3-note">Densité heatmap : 0 neutre · 1 faible · 2–3 moyenne · 4–7 forte · 8+ très forte.</p>
    </section>
  )
}

export function StatsPanel({ snapshot }) {
  const documented = [...snapshot.datesByCompetency.entries()].filter(([, d]) => d.size > 0)
  return (
    <section className="v3-panel v3-stats" aria-label="Indicateurs synthétiques">
      <h3>Indicateurs</h3>
      <dl>
        <dt>Compétences documentées</dt>
        <dd>{documented.length}</dd>
        <dt>Journées documentées</dt>
        <dd>{snapshot.competenciesByDate.size}</dd>
        <dt>Observations admissibles</dt>
        <dd>{snapshot.admissible.length}</dd>
        <dt>En attente de révision</dt>
        <dd>{snapshot.needsReview.length}</dd>
      </dl>
    </section>
  )
}
