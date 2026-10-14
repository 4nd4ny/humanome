// Interface ultime — écran « Comparaison de soi à soi » (spec §9).
//
// Deux ensembles A et B de journées de la même personne, nommés par
// l'apprenant ; huit vues ; précautions de lecture ; note libre stockée dans
// le master. Aucune vue ne dit lequel est « meilleur » : pas de rang de
// compétences, pas de couleur de verdict, pas de mot de valence.

import { useMemo, useState } from 'react'
import { analysisRuns, changeNarrative, compareSets, comparePreset, radarScale, resolveSide, topDays } from '../core/compare.js'
import { layoutSun } from '../core/state.js'
import { buildHeatmap } from '../core/heatmap.js'
import { allTags } from '../core/sets.js'
import { canonicalJson } from '../core/model.js'
import { setComparisonNote, setPreferences } from '../core/ops.js'
import { formatLong, formatShort } from '../core/dates.js'
import { poleShortName } from '../core/referential.js'
import { Sun, sectorPath } from './Sun.jsx'
import { HeatmapBand } from './Heatmap.jsx'
import { SOURCE_LABELS } from './Manager.jsx'

const nf1 = (x) => (typeof x === 'number' && Number.isFinite(x) ? x.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : '—')
const nf2 = (x) => (typeof x === 'number' && Number.isFinite(x) ? x.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—')
const pct = (x) => (typeof x === 'number' && Number.isFinite(x) ? `${nf1(x * 100)} %` : '—')
const MINUS = '−'
const signed = (x, fmt) => (typeof x === 'number' && Number.isFinite(x) ? `${x > 0 ? '+' : x < 0 ? MINUS : '±'}${fmt(Math.abs(x))}` : '—')

export const PRESETS = [
  ['halves', 'Première et seconde moitié'],
  ['last-evaluation', 'Depuis la dernière évaluation'],
  ['quarter-start', 'Depuis le début du trimestre'],
  ['school-year-start', 'Depuis le début de l’année scolaire'],
  ['previous-school-year', 'Année scolaire précédente'],
]

/** Comparaison affichée tant que la personne n'en a choisi aucune : le premier préréglage disponible. */
const DEFAULT_PRESETS = ['halves', 'last-evaluation']

const VIEWS = [
  ['suns', 'Deux soleils'],
  ['overlay', 'Superposition'],
  ['radar', 'Radar des pôles'],
  ['table', 'Tableau'],
  ['sets', 'Communes / seulement A / B'],
  ['top', 'Journées par pôle'],
  ['concentration', 'Concentration'],
  ['story', 'Ce qui a changé'],
]

const KIND_LABELS = {
  selection: 'Sélection courante (cases cochées)',
  set: 'Ensemble nommé',
  period: 'Période',
  tags: 'Étiquette',
  run: 'Analyse (comparer deux analyses)',
}

/** Valeurs par défaut d'un type de définition. */
function defaultDef(kind, { dataset, runs, tags }) {
  const dates = dataset.days.map((d) => d.date)
  if (kind === 'set') return { kind, id: dataset.sets[0]?.id ?? null }
  if (kind === 'period') return { kind, from: dates[0] ?? null, to: dates.at(-1) ?? null }
  if (kind === 'tags') return { kind, tags: tags.slice(0, 1), match: 'any' }
  if (kind === 'run') return { kind, source: runs[0]?.source ?? null, run: runs[0]?.run ?? null }
  return { kind: 'selection' }
}

function SideEditor({ letter, side, onChange, dataset, runs, tags, summary }) {
  const def = side.def
  const id = `carto-cmp-${letter}`
  const set = (patch) => onChange({ ...side, def: { ...def, ...patch } })
  return (
    <fieldset className={`carto-cmp-side carto-cmp-side--${letter.toLowerCase()}`}>
      <legend>Ensemble {letter}</legend>
      <label className="carto-field">
        <span>Nom</span>
        <input type="text" value={side.name ?? ''} maxLength={60} onChange={(e) => onChange({ ...side, name: e.target.value })} placeholder={`Ensemble ${letter}`} />
      </label>
      <label className="carto-field">
        <span>Journées</span>
        <select value={def.kind} onChange={(e) => onChange({ ...side, def: defaultDef(e.target.value, { dataset, runs, tags }) })} aria-describedby={`${id}-summary`}>
          {Object.entries(KIND_LABELS).map(([k, label]) => (
            <option key={k} value={k} disabled={(k === 'set' && dataset.sets.length === 0) || (k === 'tags' && tags.length === 0) || (k === 'run' && runs.length < 2)}>
              {label}
            </option>
          ))}
        </select>
      </label>
      {def.kind === 'set' ? (
        <label className="carto-field">
          <span>Ensemble</span>
          <select value={def.id ?? ''} onChange={(e) => set({ id: e.target.value })}>
            {dataset.sets.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {def.kind === 'period' ? (
        <div className="carto-field-row">
          <label className="carto-field">
            <span>Du</span>
            <input type="date" value={def.from ?? ''} onChange={(e) => set({ from: e.target.value || null })} />
          </label>
          <label className="carto-field">
            <span>Au</span>
            <input type="date" value={def.to ?? ''} onChange={(e) => set({ to: e.target.value || null })} />
          </label>
          <label className="carto-small carto-field-check">
            <input type="checkbox" checked={Boolean(def.onlyActive)} onChange={(e) => set({ onlyActive: e.target.checked })} /> journées cochées seulement
          </label>
        </div>
      ) : null}
      {def.kind === 'tags' ? (
        <label className="carto-field">
          <span>Étiquette</span>
          <select value={def.tags?.[0] ?? ''} onChange={(e) => set({ tags: [e.target.value] })}>
            {tags.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {def.kind === 'run' ? (
        <label className="carto-field">
          <span>Analyse</span>
          <select
            value={`${def.source}|${def.run ?? ''}`}
            onChange={(e) => {
              const r = runs.find((x) => x.key === e.target.value)
              if (r) set({ source: r.source, run: r.run })
            }}
          >
            {runs.map((r) => (
              <option key={r.key} value={r.key}>
                {SOURCE_LABELS[r.source] ?? r.source}
                {r.run ? ` — ${r.run}` : ''} ({r.days} j.)
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <p id={`${id}-summary`} className="carto-small carto-muted">
        {summary}
      </p>
    </fieldset>
  )
}

/** Vue 2 : un soleil, A en plein, B en contour pointillé. */
function SunOverlay({ refl, layoutA, layoutB, geometry, nameA, nameB }) {
  const R = geometry.competencies.rOut + 6
  const guides = [0.25, 0.5, 0.75, 1].map((c) => Math.sqrt(geometry.competencies.rIn ** 2 + geometry.k * c))
  return (
    <figure className="carto-cmp-overlay">
      <svg viewBox={`${-R} ${-R} ${2 * R} ${2 * R}`} role="img" aria-label={`Superposition sur un même soleil : ${nameA} en secteurs pleins, ${nameB} en contours pointillés. Les valeurs sont dans le tableau.`}>
        {guides.map((r) => (
          <circle key={r} r={r} className="carto-sun-guide" />
        ))}
        {layoutA.poles.map((s) => (
          <path key={`pa${s.num}`} d={sectorPath(s.rIn, s.rOut, s.a0, s.a1)} fill={refl.poleByNum.get(s.num)?.color} fillOpacity={0.35} fillRule="evenodd" />
        ))}
        {layoutA.competencies.map((s) => (
          <path key={`ca${s.code}`} d={sectorPath(s.rIn, s.rOut, s.a0, s.a1)} fill={refl.poleByNum.get(s.pole)?.color} fillOpacity={0.8} fillRule="evenodd" />
        ))}
        {layoutB.poles.map((s) => (
          <path key={`pb${s.num}`} d={sectorPath(s.rIn, s.rOut, s.a0, s.a1)} className="carto-cmp-outline" fillRule="evenodd" />
        ))}
        {layoutB.competencies.map((s) => (
          <path key={`cb${s.code}`} d={sectorPath(s.rIn, s.rOut, s.a0, s.a1)} className="carto-cmp-outline" fillRule="evenodd" />
        ))}
      </svg>
      <figcaption className="carto-small">
        <span className="carto-cmp-key carto-cmp-key--a" aria-hidden="true" /> {nameA} : secteurs pleins · <span className="carto-cmp-key carto-cmp-key--b" aria-hidden="true" /> {nameB} : contours pointillés
      </figcaption>
    </figure>
  )
}

/** Vue 3 : radar des 7 pôles ou des compétences d'un pôle (parts ipsatives), échelle commune. */
function Radar({ refl, cmp, nameA, nameB }) {
  const [focus, setFocus] = useState('poles')
  const axes = useMemo(() => {
    if (focus === 'poles') {
      return refl.poles.map((p) => {
        const v = cmp.radar.poles.find((x) => x.num === p.num) ?? { a: 0, b: 0 }
        return { key: `p${p.num}`, label: `${p.symbol} ${poleShortName(p)}`, a: v.a, b: v.b }
      })
    }
    const num = Number(focus)
    return cmp.rows.filter((r) => r.pole === num).map((r) => ({ key: r.code, label: r.code, a: r.a?.share ?? 0, b: r.b?.share ?? 0 }))
  }, [focus, refl, cmp])
  const max = radarScale(axes.flatMap((x) => [x.a, x.b]))
  const n = Math.max(axes.length, 3)
  const R = 120
  const pt = (i, value) => {
    const a = -Math.PI / 2 + (2 * Math.PI * i) / n
    const r = (value / max) * R
    return [r * Math.cos(a), r * Math.sin(a)]
  }
  const poly = (key) => axes.map((x, i) => pt(i, x[key]).map((c) => c.toFixed(1)).join(',')).join(' ')
  const ring = (f) => Array.from({ length: n }, (_, i) => pt(i, max * f).map((c) => c.toFixed(1)).join(',')).join(' ')
  const what = focus === 'poles' ? 'des pôles' : `des compétences du pôle ${refl.poleByNum.get(Number(focus))?.name ?? ''}`
  return (
    <figure className="carto-cmp-radar">
      <label className="carto-field carto-field--inline">
        <span>Axes</span>
        <select value={focus} onChange={(e) => setFocus(e.target.value)}>
          <option value="poles">Les 7 pôles</option>
          {refl.poles.map((p) => (
            <option key={p.num} value={String(p.num)}>
              Compétences de {p.name}
            </option>
          ))}
        </select>
      </label>
      {axes.length < 3 ? (
        <p className="carto-muted carto-small">Moins de trois compétences de ce pôle sont observées dans A ou B : le tableau les montre mieux qu’un radar.</p>
      ) : (
        <svg viewBox="-215 -150 430 300" role="img" aria-label={`Radar ${what} : part dans ${nameA} (surface) et dans ${nameB} (contour pointillé), échelle commune jusqu’à ${pct(max)}.`}>
          {[0.5, 1].map((f) => (
            <polygon key={f} points={ring(f)} className="carto-cmp-radar-grid" />
          ))}
          {axes.map((x, i) => {
            const [ex, ey] = pt(i, max)
            const [lx, ly] = pt(i, max * 1.16)
            return (
              <g key={x.key}>
                <line x1={0} y1={0} x2={ex} y2={ey} className="carto-cmp-radar-grid" />
                <text x={lx} y={ly} textAnchor={Math.abs(lx) < 8 ? 'middle' : lx > 0 ? 'start' : 'end'} dominantBaseline="middle" className="carto-cmp-radar-label">
                  {x.label}
                </text>
              </g>
            )
          })}
          <polygon points={poly('a')} className="carto-cmp-radar-a" />
          <polygon points={poly('b')} className="carto-cmp-radar-b" />
          <text x={4} y={-R - 4} className="carto-cmp-radar-tick">
            {pct(max)}
          </text>
        </svg>
      )}
      <figcaption className="carto-small">
        <span className="carto-cmp-key carto-cmp-key--a" aria-hidden="true" /> {nameA} · <span className="carto-cmp-key carto-cmp-key--b" aria-hidden="true" /> {nameB} — échelle commune, sans plafond fixe
      </figcaption>
    </figure>
  )
}

function DeltaCell({ abs, rel, fmt }) {
  return (
    <td className="carto-num">
      {signed(abs, fmt)}
      {typeof rel === 'number' ? <span className="carto-muted"> ({signed(rel * 100, nf1)} %)</span> : null}
    </td>
  )
}

function StatCell({ s }) {
  if (!s || s.n === 0) return <td className="carto-num carto-muted">—</td>
  return (
    <td className="carto-num">
      {nf2(s.mean)} <span className="carto-muted">[{nf2(s.min)}–{nf2(s.max)}] σ {nf2(s.sd)}</span>
    </td>
  )
}

/** Vue 4 : tableau par pôle et compétence. */
function CompareTable({ refl, cmp, nameA, nameB }) {
  const byPole = new Map()
  for (const r of cmp.rows) {
    if (!byPole.has(r.pole)) byPole.set(r.pole, [])
    byPole.get(r.pole).push(r)
  }
  const line = (key, label, r, isPole) => (
    <tr key={key} className={isPole ? 'carto-cmp-pole-row' : undefined}>
      <th scope="row">{label}</th>
      <td className="carto-num">{pct(r.a?.share)}</td>
      <td className="carto-num">{pct(r.b?.share)}</td>
      <DeltaCell abs={r.delta.share * 100} rel={r.delta.shareRel} fmt={(x) => `${nf1(x)} pt`} />
      <td className="carto-num">{nf2(r.a?.intensity)}</td>
      <td className="carto-num">{nf2(r.b?.intensity)}</td>
      <DeltaCell abs={r.delta.intensity} rel={r.delta.intensityRel} fmt={nf2} />
      <td className="carto-num">{nf2(r.a?.confidence)}</td>
      <td className="carto-num">{nf2(r.b?.confidence)}</td>
      <td className="carto-num">{r.delta.confidence === null ? '—' : signed(r.delta.confidence, nf2)}</td>
      <td className="carto-num">{r.a?.days ?? 0}</td>
      <td className="carto-num">{r.b?.days ?? 0}</td>
      <StatCell s={r.a} />
      <StatCell s={r.b} />
    </tr>
  )
  return (
    <div className="carto-table-scroll">
      <table className="carto-cmp-table">
        <caption className="carto-small">
          A = {nameA} · B = {nameB} · Δ = B − A (Δ relatif entre parenthèses seulement quand A dépasse 2 % de part ou 0,1 point). Moyenne [min–max] σ :
          points du jour, sur les journées observées seulement.
        </caption>
        <thead>
          <tr>
            <th scope="col">Pôle / compétence</th>
            <th scope="col">Part A</th>
            <th scope="col">Part B</th>
            <th scope="col">Δ part</th>
            <th scope="col">Points A</th>
            <th scope="col">Points B</th>
            <th scope="col">Δ</th>
            <th scope="col">Confiance A</th>
            <th scope="col">Confiance B</th>
            <th scope="col">Δ</th>
            <th scope="col">n A</th>
            <th scope="col">n B</th>
            <th scope="col">Jour A : moyenne [min–max] σ</th>
            <th scope="col">Jour B : moyenne [min–max] σ</th>
          </tr>
        </thead>
        <tbody>
          {cmp.poleRows.flatMap((pr) => {
            const pole = refl.poleByNum.get(pr.num)
            return [
              line(`p${pr.num}`, `${pole.symbol} ${pole.name}`, pr, true),
              ...(byPole.get(pr.num) ?? []).map((r) => line(r.code, `${r.code} ${refl.compByCode.get(r.code)?.name ?? ''}`, r, false)),
            ]
          })}
        </tbody>
      </table>
    </div>
  )
}

function CodeList({ refl, codes, empty }) {
  if (codes.length === 0) return <p className="carto-muted carto-small">{empty}</p>
  return (
    <ul className="carto-cmp-codes">
      {codes.map((c) => (
        <li key={c} style={{ '--pole-color': refl.poleByNum.get(refl.compByCode.get(c)?.pole)?.color }}>
          <span className="carto-code">{c}</span> {refl.compByCode.get(c)?.name}
        </li>
      ))}
    </ul>
  )
}

/** Précautions de lecture d'une comparaison (§9.3), aussi imprimées dans le rapport. */
export function ComparePrecautions() {
  return (
    <aside className="carto-note carto-cmp-precautions" aria-label="Précautions de lecture">
      <h3>Précautions de lecture</h3>
      <ul>
        <li>Les parts sont à somme nulle : si une compétence gagne une part, les autres en perdent. Le tableau donne aussi les points absolus.</li>
        <li>Les points absolus dépendent du nombre de traces : un ensemble plus long en accumule davantage.</li>
        <li>Les moyennes se font sur les journées observées seulement ; les silences en sont exclus et comptés à part (n).</li>
        <li>Aucun écart à une norme : il n’y a pas de seuil « faible », « modéré » ou « élevé ».</li>
      </ul>
    </aside>
  )
}

/** Vue 6 : journées où un pôle pèse le plus, dans chaque ensemble, sur la heatmap. */
function TopDaysView({ dataset, refl, cmp, params, nameA, nameB, onOpenDay }) {
  const [pole, setPole] = useState(() => cmp.poleRows[0]?.num ?? refl.poles[0]?.num)
  const topA = useMemo(() => topDays(cmp.a, refl, pole), [cmp, refl, pole])
  const topB = useMemo(() => topDays(cmp.b, refl, pole), [cmp, refl, pole])
  const band = useMemo(() => {
    const all = [...cmp.a.state.dates, ...cmp.b.state.dates].sort()
    return all.length ? { from: all[0], to: all.at(-1), label: `Du ${formatLong(all[0])} au ${formatLong(all.at(-1))}` } : null
  }, [cmp])
  const model = useMemo(() => (band ? buildHeatmap(dataset, { ref: refl, period: band, params }) : null), [dataset, refl, band, params])
  const lit = useMemo(() => new Set([...topA, ...topB].map((d) => d.date)), [topA, topB])
  const [focus, setFocus] = useState(null)
  const list = (top, name) => (
    <div>
      <h4>{name}</h4>
      {top.length === 0 ? (
        <p className="carto-muted carto-small">Ce pôle n’est observé dans aucune journée de cet ensemble.</p>
      ) : (
        <ul className="carto-cmp-days">
          {top.map((d) => (
            <li key={d.date}>
              <button type="button" className="carto-link-btn" onClick={() => onOpenDay(d.date)}>
                {formatShort(d.date)}
              </button>{' '}
              <span className="carto-muted carto-small">
                points du jour {nf2(d.score)} · {d.codes.join(', ')}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
  return (
    <div className="carto-cmp-top">
      <label className="carto-field carto-field--inline">
        <span>Pôle</span>
        <select value={pole} onChange={(e) => setPole(Number(e.target.value))}>
          {refl.poles.map((p) => (
            <option key={p.num} value={p.num}>
              {p.symbol} {p.name}
            </option>
          ))}
        </select>
      </label>
      <p className="carto-small carto-muted">Les cinq journées où ce pôle pèse le plus dans chaque ensemble : des repères pour choisir quelles journées relire.</p>
      <div className="carto-cmp-two">
        {list(topA, nameA)}
        {list(topB, nameB)}
      </div>
      {band && model ? (
        <HeatmapBand band={band} model={model} t={null} focusDate={focus} observed={lit} onFocusDate={setFocus} onSetT={setFocus} onOpenDay={onOpenDay} />
      ) : null}
    </div>
  )
}

/**
 * @param {{dataset: object, refl: object, params: object, geometry: object, t: string | null,
 *   update: (fn: (ds: object) => object) => void, onOpenDay: (d: string) => void}} props
 */
export function ComparePanel({ dataset, refl, params, geometry, t, update, onOpenDay }) {
  const runs = useMemo(() => analysisRuns(dataset), [dataset])
  const tags = useMemo(() => allTags(dataset), [dataset])
  const [notice, setNotice] = useState(null)
  const saved = dataset.preferences?.compare ?? null
  // Par défaut (tant que rien n'est choisi) : la première moitié des journées
  // analysées face à la seconde (D-51), sinon la sélection courante des deux côtés.
  const fallback = useMemo(() => {
    for (const key of DEFAULT_PRESETS) {
      const p = comparePreset(dataset, key, { refDate: t })
      if (!p.unavailable) return p
    }
    return { a: { name: 'A', def: { kind: 'selection' } }, b: { name: 'B', def: { kind: 'selection' } } }
  }, [dataset, t])
  const sides = saved?.a && saved?.b ? saved : fallback
  const view = saved?.view ?? 'suns'
  // A et B ne sont gardés qu'une fois choisis (un côté, un préréglage) : changer
  // de vue ne fige pas la comparaison par défaut.
  const save = (patch) =>
    update((ds) => {
      const chosen = 'a' in patch || 'b' in patch ? { a: sides.a, b: sides.b } : {}
      return setPreferences(ds, { compare: { ...(ds.preferences?.compare ?? {}), view, ...chosen, ...patch } })
    })

  const cmp = useMemo(() => compareSets(dataset, refl, sides.a, sides.b, { params }), [dataset, refl, sides.a, sides.b, params])
  const nameA = cmp.a.name
  const nameB = cmp.b.name
  const layoutA = useMemo(() => layoutSun(cmp.a.state, refl, geometry, { minThickness: params.minThicknessPx, minArc: params.minArcPx }), [cmp, refl, geometry, params])
  const layoutB = useMemo(() => layoutSun(cmp.b.state, refl, geometry, { minThickness: params.minThicknessPx, minArc: params.minArcPx }), [cmp, refl, geometry, params])
  const story = useMemo(() => changeNarrative(cmp, { nameOf: (c) => refl.compByCode.get(c)?.name ?? c }), [cmp, refl])
  const noteKey = { a: canonicalJson(sides.a.def), b: canonicalJson(sides.b.def) }
  const note = dataset.comparisons.find((c) => c.key === `${noteKey.a}|${noteKey.b}`)?.note ?? ''

  const summary = (side) => {
    const r = resolveSide(dataset, side)
    const st = side === sides.a ? cmp.a.state : cmp.b.state
    return `${r.label} : ${r.dates.length} journée${r.dates.length > 1 ? 's' : ''}, dont ${st.dates.length} analysée${st.dates.length > 1 ? 's' : ''}${st.dates.length ? ` (du ${formatShort(st.dates[0])} au ${formatShort(st.dates.at(-1))})` : ''}.`
  }

  const applyPreset = (key) => {
    const p = comparePreset(dataset, key, { refDate: t })
    if (p.unavailable) {
      setNotice(p.unavailable)
      return
    }
    setNotice(null)
    save({ a: p.a, b: p.b })
  }

  const onTabKey = (e) => {
    const i = VIEWS.findIndex(([id]) => id === view)
    let next = null
    if (e.key === 'ArrowRight') next = VIEWS[(i + 1) % VIEWS.length][0]
    else if (e.key === 'ArrowLeft') next = VIEWS[(i - 1 + VIEWS.length) % VIEWS.length][0]
    else if (e.key === 'Home') next = VIEWS[0][0]
    else if (e.key === 'End') next = VIEWS.at(-1)[0]
    if (!next) return
    e.preventDefault()
    save({ view: next })
    document.getElementById(`carto-cmp-tab-${next}`)?.focus()
  }

  return (
    <section className="carto-compare" aria-labelledby="carto-compare-title">
      <header className="carto-compare-head">
        <h2 id="carto-compare-title">Comparer deux ensembles de vos journées</h2>
        <p className="carto-small carto-muted">A et B sont deux sélections de vos propres journées, nommées par vous. La comparaison montre des écarts ; elle ne dit jamais lequel est « meilleur ».</p>
      </header>
      <div className="carto-cmp-presets" role="group" aria-label="Préréglages">
        {PRESETS.map(([key, label]) => (
          <button key={key} type="button" className="carto-btn carto-btn--quiet carto-btn--small" onClick={() => applyPreset(key)}>
            {label}
          </button>
        ))}
      </div>
      {notice ? (
        <p role="status" className="carto-note">
          {notice}
        </p>
      ) : null}
      <div className="carto-cmp-sides">
        <SideEditor letter="A" side={sides.a} onChange={(a) => save({ a })} dataset={dataset} runs={runs} tags={tags} summary={summary(sides.a)} />
        <SideEditor letter="B" side={sides.b} onChange={(b) => save({ b })} dataset={dataset} runs={runs} tags={tags} summary={summary(sides.b)} />
      </div>
      {cmp.warnings.length > 0 ? (
        <ul className="carto-cmp-warnings" aria-label="Avertissements">
          {cmp.warnings.map((w) => (
            <li key={w.code} className="carto-note">
              {w.text}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="carto-cmp-tabs" role="tablist" aria-label="Vues de la comparaison" onKeyDown={onTabKey}>
        {VIEWS.map(([id, label]) => (
          <button
            key={id}
            id={`carto-cmp-tab-${id}`}
            type="button"
            role="tab"
            aria-selected={view === id}
            aria-controls={`carto-cmp-panel-${id}`}
            tabIndex={view === id ? 0 : -1}
            onClick={() => save({ view: id })}
          >
            {label}
          </button>
        ))}
      </div>

      <div id="carto-cmp-panel-suns" role="tabpanel" aria-labelledby="carto-cmp-tab-suns" hidden={view !== 'suns'} className="carto-cmp-panel">
        <div className="carto-cmp-two">
          {[
            [cmp.a, layoutA, 'a'],
            [cmp.b, layoutB, 'b'],
          ].map(([side, layout, key]) => (
            <Sun
              key={key}
              refl={refl}
              state={side.state}
              layout={layout}
              geometry={geometry}
              compact
              label={`Soleil de ${side.name}`}
              caption={`${side.name} — ${side.state.dates.length} journée${side.state.dates.length > 1 ? 's' : ''} analysée${side.state.dates.length > 1 ? 's' : ''}`}
            />
          ))}
        </div>
        <p className="carto-small carto-muted">Même échelle, même ordre des secteurs, mêmes anneaux.</p>
      </div>
      <div id="carto-cmp-panel-overlay" role="tabpanel" aria-labelledby="carto-cmp-tab-overlay" hidden={view !== 'overlay'} className="carto-cmp-panel">
        <SunOverlay refl={refl} layoutA={layoutA} layoutB={layoutB} geometry={geometry} nameA={nameA} nameB={nameB} />
      </div>
      <div id="carto-cmp-panel-radar" role="tabpanel" aria-labelledby="carto-cmp-tab-radar" hidden={view !== 'radar'} className="carto-cmp-panel">
        <Radar refl={refl} cmp={cmp} nameA={nameA} nameB={nameB} />
      </div>
      <div id="carto-cmp-panel-table" role="tabpanel" aria-labelledby="carto-cmp-tab-table" hidden={view !== 'table'} className="carto-cmp-panel">
        <CompareTable refl={refl} cmp={cmp} nameA={nameA} nameB={nameB} />
      </div>
      <div id="carto-cmp-panel-sets" role="tabpanel" aria-labelledby="carto-cmp-tab-sets" hidden={view !== 'sets'} className="carto-cmp-panel">
        <div className="carto-cmp-three">
          <section aria-label="Observées dans A et dans B">
            <h4>Dans A et dans B ({cmp.common.length})</h4>
            <CodeList refl={refl} codes={cmp.common} empty="Aucune compétence commune." />
          </section>
          <section aria-label={`Seulement dans A (${nameA})`}>
            <h4>
              Seulement dans A — {nameA} ({cmp.onlyA.length})
            </h4>
            <CodeList refl={refl} codes={cmp.onlyA} empty="Aucune." />
          </section>
          <section aria-label={`Seulement dans B (${nameB})`}>
            <h4>
              Seulement dans B — {nameB} ({cmp.onlyB.length})
            </h4>
            <CodeList refl={refl} codes={cmp.onlyB} empty="Aucune." />
          </section>
        </div>
      </div>
      <div id="carto-cmp-panel-top" role="tabpanel" aria-labelledby="carto-cmp-tab-top" hidden={view !== 'top'} className="carto-cmp-panel">
        <TopDaysView dataset={dataset} refl={refl} cmp={cmp} params={params} nameA={nameA} nameB={nameB} onOpenDay={onOpenDay} />
      </div>
      <div id="carto-cmp-panel-concentration" role="tabpanel" aria-labelledby="carto-cmp-tab-concentration" hidden={view !== 'concentration'} className="carto-cmp-panel">
        <p className="carto-small carto-muted">Part cumulée des cinq plus grandes parts du soleil : plus elle est haute, plus le soleil se concentre sur peu de compétences.</p>
        <dl className="carto-cmp-bars">
          {[
            [nameA, cmp.concentration.a, 'a'],
            [nameB, cmp.concentration.b, 'b'],
          ].map(([name, value, key]) => (
            <div key={key}>
              <dt>{name}</dt>
              <dd>
                <span className={`carto-cmp-bar carto-cmp-bar--${key}`} style={{ width: `${Math.round(value * 100)}%` }} aria-hidden="true" />
                {pct(value)}
              </dd>
            </div>
          ))}
        </dl>
      </div>
      <div id="carto-cmp-panel-story" role="tabpanel" aria-labelledby="carto-cmp-tab-story" hidden={view !== 'story'} className="carto-cmp-panel">
        <ul className="carto-cmp-story">
          {story.map((s) => (
            <li key={s.text}>{s.text}</li>
          ))}
        </ul>
      </div>

      <ComparePrecautions />

      <label className="carto-field carto-cmp-note">
        <span>Votre lecture de cette comparaison (reste dans ce navigateur)</span>
        <textarea
          key={`${noteKey.a}|${noteKey.b}`}
          rows={4}
          defaultValue={note}
          maxLength={10000}
          onBlur={(e) => {
            if (e.target.value !== note) update((ds) => setComparisonNote(ds, { a: noteKey.a, b: noteKey.b, note: e.target.value }))
          }}
        />
      </label>
    </section>
  )
}
