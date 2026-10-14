// Interface ultime — tableau de bord des métriques (spec §10).
//
// Des cartes pour GÉRER ses cartographies : repérer les journées à ouvrir,
// les silences, les ruptures, les journées à arbitrer. Chaque carte n'apparaît
// que si ses données existent (critère P4 : elle se masque seule) et peut être
// masquée à la main ; grille de tuiles de V3 (glisser-déposer, tailles,
// colonnes automatiques). Couleur = fonction (jamais = personne), échelles
// séparées, valeur manquante ≠ 0, graphiques SVG maison.

import { useEffect, useMemo, useState } from 'react'
import '../../v3/v3.css'
import { TileGrid } from '../../v3/ui/tile-grid.jsx'
import {
  DASHBOARD_CARDS,
  anomaliesData,
  cognitiveData,
  constancyData,
  lexicalData,
  phasesData,
  profileData,
  rhythmData,
  selectMoments,
  sensitivityLabel,
  sensitivityThreshold,
  styleData,
} from '../core/dashboard.js'
import { STYLE_LEXICONS } from '../core/stylometry.js'
import { radarScale } from '../core/compare.js'
import { traceSignal } from '../core/formulas.js'
import { hasPortfolio } from '../core/model.js'
import { addMarker, deleteMarker, setPreferences } from '../core/ops.js'
import { formatLong, formatShort } from '../core/dates.js'
import { poleShortName } from '../core/referential.js'
import { ConfidenceBar, RadarChart, Sparkline, TimeChart, shortDate } from './charts.jsx'
import { TwoStepButton } from './Manager.jsx'

const nf0 = (v) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v).toLocaleString('fr-FR') : '—')
const nf2 = (v) => (typeof v === 'number' && Number.isFinite(v) ? v.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—')
const pct = (v) => (typeof v === 'number' && Number.isFinite(v) ? `${(v * 100).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %` : '—')

const DEFAULT_SIZES = {
  profile: { w: 2, h: 2 },
  rhythm: { w: 99, h: 1 },
  phases: { w: 99, h: 2 },
  constancy: { w: 2, h: 2 },
  moments: { w: 2, h: 2 },
  style: { w: 99, h: 2 },
  cognitive: { w: 2, h: 2 },
  lexical: { w: 99, h: 1 },
  anomalies: { w: 1, h: 2 },
}

const LLM = 'Niveau de preuve : exploratoire — analyse automatique, un seul codeur (modèle de langage).'
const LOCAL = 'Calcul local et déterministe, dans ce navigateur.'
const STYLE_COLOR = [15, 118, 110] // une seule teinte : la fonction « style »

const VOLUME_COLOR = '#475569'
const LEXICAL_COLOR = '#0f766e'

function Card({ id, label, source, onHide, children }) {
  return (
    <section className="carto-card" aria-label={label} data-card={id}>
      <div className="carto-card-tools">
        <span className="carto-small carto-muted">{source}</span>
        <button type="button" className="carto-link-btn" onClick={() => onHide(id)} aria-label={`Masquer la carte ${label}`}>
          Masquer
        </button>
      </div>
      {children}
    </section>
  )
}

// ---- Profil ---------------------------------------------------------------------------------
function ProfileCard({ data, refl }) {
  const [table, setTable] = useState(false)
  const max = radarScale(data.poles.map((p) => p.share))
  const barMax = radarScale(data.comps.map((c) => c.share))
  const n = data.comps.length
  return (
    <div className="carto-card-body">
      <RadarChart
        label="Radar des sept pôles : part de chaque pôle dans votre soleil"
        axes={refl.poles.map((p) => ({ key: String(p.num), label: `${p.symbol} ${poleShortName(p)}` }))}
        series={[{ key: 'profil', label: 'profil', className: 'carto-radar-a', values: Object.fromEntries(data.poles.map((p) => [String(p.num), p.share])) }]}
        max={max}
      />
      <p className="carto-small">
        Concentration : les cinq plus grandes parts font <strong>{pct(data.concentration)}</strong> du soleil.
      </p>
      <svg className="carto-hist" viewBox={`0 0 ${Math.max(60, n * 8)} 60`} preserveAspectRatio="none" role="img" aria-label={`Parts des ${n} compétences observées, dans l’ordre du référentiel`}>
        {data.comps.map((c, i) => (
          <rect key={c.code} x={i * 8 + 1} y={58 - (c.share / barMax) * 56} width={6} height={Math.max(0.5, (c.share / barMax) * 56)} fill={refl.poleByNum.get(c.pole)?.color}>
            <title>{`${c.code} ${refl.compByCode.get(c.code)?.name} : ${pct(c.share)}`}</title>
          </rect>
        ))}
      </svg>
      <button type="button" className="carto-btn carto-btn--quiet carto-btn--small" aria-expanded={table} onClick={() => setTable(!table)}>
        {table ? 'Masquer le tableau' : 'Afficher le tableau'}
      </button>
      {table ? (
        <table className="carto-mini-table">
          <thead>
            <tr>
              <th scope="col">Compétence</th>
              <th scope="col">Part</th>
              <th scope="col">Preuves</th>
              <th scope="col">Indices</th>
            </tr>
          </thead>
          <tbody>
            {data.comps.map((c) => (
              <tr key={c.code}>
                <th scope="row">
                  {c.code} {refl.compByCode.get(c.code)?.name}
                </th>
                <td className="carto-num">{pct(c.share)}</td>
                <td className="carto-num">{c.proofs}</td>
                <td className="carto-num">{c.hints}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </div>
  )
}

// ---- Rythme ---------------------------------------------------------------------------------
function RhythmCard({ data, phases, onOpenDay }) {
  const points = data.days.map((d) => ({ date: d.date, value: d.words ?? d.chars }))
  const unit = data.days.every((d) => typeof d.words === 'number') ? 'mots' : 'caractères'
  return (
    <div className="carto-card-body">
      <p className="carto-small">
        {data.days.length} journée{data.days.length > 1 ? 's' : ''} écrite{data.days.length > 1 ? 's' : ''} du {formatShort(data.from)} au {formatShort(data.to)} · {data.silences} jour
        {data.silences > 1 ? 's' : ''} de silence (une donnée, pas un zéro) · médiane {nf0(data.medianWords)} mots · la plus longue : {formatShort(data.longest.date)}.
      </p>
      <TimeChart
        label={`Volume du portfolio par journée (${unit})`}
        series={[{ key: 'volume', label: unit, color: VOLUME_COLOR, points }]}
        from={data.from}
        to={data.to}
        kind="bars"
        height={110}
        format={nf0}
        markers={phases?.markers ?? []}
        phases={phases?.phases ?? []}
        onPick={onOpenDay}
        describePoint={(d) => `${formatLong(d)} : ${nf0(points.find((p) => p.date === d)?.value)} ${unit}`}
      />
    </div>
  )
}

// ---- Phases et repères ------------------------------------------------------------------------
function PhasesCard({ data, update, onOpenDay }) {
  const [kind, setKind] = useState('repere')
  const [date, setDate] = useState(data.to)
  const [end, setEnd] = useState(data.to)
  const [label, setLabel] = useState('')
  const [error, setError] = useState(null)
  const add = (e) => {
    e.preventDefault()
    try {
      if (!label.trim()) throw new Error('Donnez un nom à ce repère.')
      if (kind === 'phase' && end < date) throw new Error('La fin de la phase précède son début.')
      update((ds) => addMarker(ds, { date, label, kind, to: kind === 'phase' ? end : null }))
      setLabel('')
      setError(null)
    } catch (err) {
      setError(err.message)
    }
  }
  const all = [...data.phases, ...data.markers].sort((a, b) => (a.date < b.date ? -1 : 1))
  return (
    <div className="carto-card-body">
      <TimeChart
        label="Frise : journées, phases et repères"
        series={[{ key: 'days', label: 'journée', color: VOLUME_COLOR, points: data.days.map((d) => ({ date: d, value: 1 })) }]}
        from={data.from}
        to={data.to}
        kind="bars"
        height={60}
        yMax={1}
        format={() => ''}
        markers={data.markers}
        phases={data.phases}
        onPick={onOpenDay}
        describePoint={(d) => `${formatLong(d)}${data.phases.some((p) => d >= p.date && d <= (p.to ?? p.date)) ? ` — phase « ${data.phases.find((p) => d >= p.date && d <= (p.to ?? p.date)).label} »` : ''}`}
      />
      {all.length > 0 ? (
        <ul className="carto-marker-list">
          {all.map((m) => (
            <li key={m.id}>
              <span>
                {m.kind === 'phase' ? `Phase du ${formatShort(m.date)} au ${formatShort(m.to ?? m.date)}` : `Repère du ${formatShort(m.date)}`} : <strong>{m.label}</strong>
              </span>
              <TwoStepButton label="Retirer" confirmLabel="Confirmer" className="carto-btn--small" onConfirm={() => update((ds) => deleteMarker(ds, m.id))} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="carto-small carto-muted">Posez vos repères (moments de bascule) et vos phases : ils apparaissent ici, sur le rythme et sur la heatmap.</p>
      )}
      <form className="carto-marker-form" onSubmit={add}>
        <label className="carto-field">
          <span>Type</span>
          <select value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="repere">Repère (un jour)</option>
            <option value="phase">Phase (une période)</option>
          </select>
        </label>
        <label className="carto-field">
          <span>{kind === 'phase' ? 'Début' : 'Date'}</span>
          <input type="date" value={date} min={data.from} max={data.to} onChange={(e) => setDate(e.target.value)} required />
        </label>
        {kind === 'phase' ? (
          <label className="carto-field">
            <span>Fin</span>
            <input type="date" value={end} min={date} max={data.to} onChange={(e) => setEnd(e.target.value)} required />
          </label>
        ) : null}
        <label className="carto-field carto-field--grow">
          <span>Nom</span>
          <input type="text" value={label} maxLength={80} onChange={(e) => setLabel(e.target.value)} placeholder="ex. début du projet pont" />
        </label>
        <button type="submit" className="carto-btn carto-btn--small">
          Ajouter
        </button>
      </form>
      {error ? (
        <p role="alert" className="carto-error carto-small">
          {error}
        </p>
      ) : null}
    </div>
  )
}

// ---- Constance --------------------------------------------------------------------------------
function ConstancyCard({ data, refl }) {
  return (
    <div className="carto-card-body">
      <p className="carto-small carto-muted">
        Pour chaque compétence observée : ses journées, l’écart entre deux observations, et les points cumulés (trait, à l’échelle de la compétence), avec la confiance du
        verdict de chaque jour (pastilles, de 0 à 1).
      </p>
      <table className="carto-mini-table">
        <thead>
          <tr>
            <th scope="col">Compétence</th>
            <th scope="col">Journées</th>
            <th scope="col">Écart moyen (min–max)</th>
            <th scope="col">Trajectoire</th>
          </tr>
        </thead>
        <tbody>
          {data.rows.map((r) => {
            const name = refl.compByCode.get(r.code)?.name ?? r.code
            return (
              <tr key={r.code}>
                <th scope="row">
                  <span className="carto-code">{r.code}</span> {name}
                </th>
                <td className="carto-num">{r.days}</td>
                <td className="carto-num">{r.interval ? `${nf0(r.interval.mean)} j (${r.interval.min}–${r.interval.max})` : '—'}</td>
                <td>
                  <Sparkline
                    points={r.series.map((s) => ({ date: s.date, value: s.intensity }))}
                    max={Math.max(1, ...r.series.map((s) => s.intensity))}
                    dots={r.series.filter((s) => typeof s.confidence === 'number').map((s) => ({ date: s.date, value: s.confidence }))}
                    dotsMax={1}
                    from={data.from}
                    to={data.to}
                    color={refl.poleByNum.get(r.pole)?.color}
                    label={`${r.code} ${name} : points cumulés de ${nf2(r.series[0].intensity)} (${formatShort(r.first)}) à ${nf2(r.series.at(-1).intensity)} (${formatShort(r.last)})`}
                  />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ---- Moments remarquables -----------------------------------------------------------------------
function MomentsCard({ candidates, loading, sensitivity, onSensitivity, refl, dataset, getDetail, firstImpressions, onOpenDay, onOpenTrace }) {
  const [limit, setLimit] = useState(15)
  const moments = useMemo(() => selectMoments(candidates, sensitivity), [candidates, sensitivity])
  const firstImpression = (date) => {
    if (firstImpressions?.[date]) return { source: 'Première impression du miroir', text: firstImpressions[date] }
    const day = dataset.days.find((d) => d.date === date)
    const det = getDetail(date)
    const variantId = day?.activeVariantId
    const k = det?.variants?.[variantId]?.kairos?.portrait
    if (k) return { source: 'Portrait du jour (kairos)', text: k }
    const t = det?.portfolio?.text
    if (t) return { source: 'Début du texte du jour', text: t.length > 500 ? `${t.slice(0, 500).trimEnd()}…` : t }
    return null
  }
  return (
    <div className="carto-card-body">
      <label className="carto-field">
        <span>
          Sensibilité : {sensitivity} — {sensitivityLabel(sensitivity)} (poids de trace ≥ {nf2(sensitivityThreshold(sensitivity))})
        </span>
        <input type="range" min={0} max={100} step={5} value={sensitivity} onChange={(e) => onSensitivity(Number(e.target.value))} />
      </label>
      {loading ? <p className="carto-muted carto-small">Chargement des extraits…</p> : null}
      <p className="carto-small" aria-live="polite">
        {moments.length} moment{moments.length > 1 ? 's' : ''} à cette sensibilité.
      </p>
      <ul className="carto-moments">
        {moments.slice(0, limit).map((m) => {
          const fi = firstImpression(m.date)
          return (
            <li key={m.id} className="carto-moment" style={{ '--pole-color': refl.poleByNum.get(refl.compByCode.get(m.code)?.pole)?.color }}>
              <p className="carto-moment-head">
                <button type="button" className="carto-link-btn" onClick={() => onOpenDay(m.date, m.code)}>
                  {formatShort(m.date)}
                </button>{' '}
                <span className="carto-code">{m.code}</span> {refl.compByCode.get(m.code)?.name} · {m.role}
              </p>
              <ConfidenceBar value={m.confidence} />
              <blockquote className="carto-trace-quote">{m.extract.length > 260 ? `${m.extract.slice(0, 260).trimEnd()}…` : m.extract}</blockquote>
              <button type="button" className="carto-btn carto-btn--quiet carto-btn--small" onClick={() => onOpenTrace(m.code, [{ id: m.id, date: m.date, variantId: m.variantId, role: m.role }], 0)}>
                Ouvrir dans le portfolio
              </button>
              {fi ? (
                <details>
                  <summary>{fi.source}</summary>
                  <p className="carto-small">{fi.text}</p>
                </details>
              ) : null}
            </li>
          )
        })}
      </ul>
      {moments.length > limit ? (
        <button type="button" className="carto-btn carto-btn--quiet carto-btn--small" onClick={() => setLimit(limit + 15)}>
          Afficher 15 moments de plus
        </button>
      ) : null}
    </div>
  )
}

// ---- Style ------------------------------------------------------------------------------------
function StyleCard({ data, onOpenDay }) {
  const cell = (row, d) => {
    const v = row.values.get(d)
    const n = row.norm(v)
    if (n === null) return <td key={d} className="carto-style-cell is-missing" title={`${row.label} : non mesurable le ${formatShort(d)}`} />
    const a = 0.08 + 0.82 * n
    return (
      <td key={d} className="carto-style-cell" style={{ background: `rgba(${STYLE_COLOR.join(',')}, ${a.toFixed(2)})` }} title={`${row.label} — ${formatShort(d)} : ${nf2(v)} ${row.unit}`}>
        <span className="carto-visually-hidden">{nf2(v)}</span>
      </td>
    )
  }
  return (
    <div className="carto-card-body">
      <p className="carto-small carto-muted">
        Chaque ligne est normalisée sur VOS journées : une case foncée est haute pour vous, pas dans l’absolu. Case vide : texte trop court pour mesurer.
      </p>
      <div className="carto-table-scroll">
        <table className="carto-style-table">
          <thead>
            <tr>
              <th scope="col">Mesure</th>
              {data.dates.map((d) => (
                <th key={d} scope="col">
                  <button type="button" className="carto-style-date" onClick={() => onOpenDay(d)} title={`${formatLong(d)} — ${nf0(data.words.get(d))} mots`}>
                    {shortDate(d)}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row) => (
              <tr key={row.key}>
                <th scope="row" title={`${row.unit} · vos valeurs de ${nf2(row.min)} à ${nf2(row.max)}`}>
                  {row.label}
                </th>
                {data.dates.map((d) => cell(row, d))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <details>
        <summary>Comment ces mesures sont calculées</summary>
        <p className="carto-small">
          Expressions régulières et comptes sur le texte du portfolio, dans ce navigateur, sans modèle de langage. Ce sont des indicateurs de surface : ils décrivent
          l’écriture d’une journée, pas la personne.
        </p>
        <ul className="carto-small">
          {Object.entries(STYLE_LEXICONS).map(([k, words]) => (
            <li key={k}>
              <strong>{k}</strong> : {words.join(', ')}
            </li>
          ))}
        </ul>
      </details>
    </div>
  )
}

// ---- Fonctions cognitives -----------------------------------------------------------------------
const SIGNATURE_LABELS = {
  recategorisation: 'recatégorisation',
  inhibition_deliberee: 'inhibition délibérée',
  monitoring_metacognitif: 'monitoring métacognitif',
  irruption_memorielle: 'irruption mémorielle',
  analogie_structurale: 'analogie structurale',
  inversion_vecteur: 'inversion de vecteur',
}

function CognitiveCard({ data, onOpenDay }) {
  const [hidden, setHidden] = useState(() => new Set())
  const [weak, setWeak] = useState(false)
  const shown = data.functions.filter((f) => !hidden.has(f.key))
  const signatures = data.signatures.filter((s) => s.minSensitivity <= (weak ? 100 : 50))
  return (
    <div className="carto-card-body">
      <div className="carto-legend-buttons" role="group" aria-label="Fonctions affichées">
        {data.functions.map((f) => (
          <button
            key={f.key}
            type="button"
            aria-pressed={!hidden.has(f.key)}
            className="carto-legend-btn"
            style={{ '--fn-color': f.color }}
            onClick={() => {
              const next = new Set(hidden)
              if (next.has(f.key)) next.delete(f.key)
              else next.add(f.key)
              setHidden(next)
            }}
          >
            {f.label}
          </button>
        ))}
      </div>
      <TimeChart
        label="Fonctions cognitives par journée (0 à 1)"
        series={shown.map((f) => ({ key: f.key, label: f.label, color: f.color, points: f.points }))}
        from={data.from}
        to={data.to}
        kind="lines"
        yMax={1}
        format={(v) => v.toLocaleString('fr-FR', { maximumFractionDigits: 2 })}
        markers={signatures.map((s) => ({ id: `${s.type}|${s.date}|${s.question}`, date: s.date, label: SIGNATURE_LABELS[s.type] ?? s.type }))}
        onPick={onOpenDay}
      />
      <p className="carto-small carto-muted">Interprétation calculée à partir des traces écrites : l’absence d’une trace ne signifie pas l’absence de la fonction.</p>
      <label className="carto-small">
        <input type="checkbox" checked={weak} onChange={(e) => setWeak(e.target.checked)} /> inclure les signaux faibles
      </label>
      {signatures.length > 0 ? (
        <ul className="carto-signatures">
          {signatures.map((s) => (
            <li key={`${s.type}|${s.date}|${s.question}`}>
              <button type="button" className="carto-link-btn" onClick={() => onOpenDay(s.date)}>
                {formatShort(s.date)}
              </button>{' '}
              <strong>{SIGNATURE_LABELS[s.type] ?? s.type}</strong> — {s.question} <ConfidenceBar value={s.confidence} />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

// ---- Rupture lexicale -----------------------------------------------------------------------------
function LexicalCard({ data, onOpenDay }) {
  const points = data.transitions.filter((t) => t.distance !== null).map((t) => ({ date: t.to, value: t.distance }))
  const byTo = new Map(data.transitions.map((t) => [t.to, t]))
  return (
    <div className="carto-card-body">
      <p className="carto-small carto-muted">
        Distance entre le vocabulaire d’une journée écrite et celui de la précédente (0 : mêmes mots, 1 : aucun mot commun). Pas de seuil fixe : la ligne pointillée est votre
        médiane.
      </p>
      <TimeChart
        label="Rupture lexicale entre journées écrites consécutives"
        series={[{ key: 'distance', label: 'distance', color: LEXICAL_COLOR, points }]}
        from={data.from}
        to={data.to}
        kind="bars"
        height={110}
        yMax={1}
        format={(v) => v.toLocaleString('fr-FR', { maximumFractionDigits: 2 })}
        reference={data.median !== null ? { value: data.median, label: `votre médiane ${nf2(data.median)}` } : null}
        onPick={onOpenDay}
        describePoint={(d) => {
          const t = byTo.get(d)
          return `Du ${formatShort(t.from)} au ${formatShort(t.to)} (${t.gapDays} jour${t.gapDays > 1 ? 's' : ''}) : distance ${nf2(t.distance)}`
        }}
      />
    </div>
  )
}

// ---- Anomalies ------------------------------------------------------------------------------------
function AnomaliesCard({ data, onOpenDay }) {
  const dayList = (dates) => (
    <ul className="carto-chips">
      {dates.slice(0, 40).map((d) => (
        <li key={d}>
          <button type="button" className="carto-chip-btn" onClick={() => onOpenDay(d)}>
            {formatShort(d)}
          </button>
        </li>
      ))}
      {dates.length > 40 ? <li className="carto-small carto-muted">… et {dates.length - 40} autres</li> : null}
    </ul>
  )
  return (
    <div className="carto-card-body">
      {data.pending.length ? (
        <>
          <h4>Journées à arbitrer ({data.pending.length})</h4>
          {dayList(data.pending)}
        </>
      ) : null}
      {data.examine.length ? (
        <>
          <h4>Mises « à examiner » ({data.examine.length})</h4>
          {dayList(data.examine)}
        </>
      ) : null}
      {data.flagged.length ? (
        <>
          <h4>Anomalies à traiter ({data.flagged.length} journées)</h4>
          {dayList(data.flagged.map((f) => f.date))}
        </>
      ) : null}
      {data.analysisWithoutPortfolio.length ? (
        <>
          <h4>Analyse sans portfolio ({data.analysisWithoutPortfolio.length}) — surlignage indisponible</h4>
          {dayList(data.analysisWithoutPortfolio)}
        </>
      ) : null}
      {data.portfolioWithoutAnalysis.length ? (
        <>
          <h4>Portfolio sans analyse ({data.portfolioWithoutAnalysis.length})</h4>
          {dayList(data.portfolioWithoutAnalysis)}
        </>
      ) : null}
      {data.undated ? <p className="carto-small">{data.undated} passage(s) de portfolio sans date.</p> : null}
      {data.noPortfolioAtAll ? <p className="carto-small">Aucun portfolio importé : le surlignage des traces et les cartes de style sont indisponibles.</p> : null}
      <a className="carto-btn carto-btn--quiet carto-btn--small" href="#/cartographie/gestionnaire">
        Ouvrir le gestionnaire
      </a>
    </div>
  )
}

/**
 * @param {{dataset: object, refl: object, state: object, params: object,
 *   getDetail: Function, ensureDetails: Function, update: Function,
 *   onOpenDay: (d: string, code?: string) => void, onOpenTrace: (code: string, list: object[], index: number) => void}} props
 */
export function Dashboard({ dataset, refl, state, getDetail, ensureDetails, update, onOpenDay, onOpenTrace }) {
  const prefs = dataset.preferences ?? {}
  const hidden = useMemo(() => new Set(prefs.dashboardHidden ?? []), [prefs.dashboardHidden])
  const sensitivity = typeof prefs.momentsSensitivity === 'number' ? prefs.momentsSensitivity : 50
  const setPrefs = (patch) => update((ds) => setPreferences(ds, patch))

  // Textes du portfolio et extraits : chargés pour les cartes qui en ont besoin.
  const portfolioDates = useMemo(() => dataset.days.filter(hasPortfolio).map((d) => d.date), [dataset])
  const neededDates = useMemo(() => [...new Set([...portfolioDates, ...state.dates])], [portfolioDates, state.dates])
  useEffect(() => {
    if (neededDates.length > 0) ensureDetails(neededDates)
  }, [neededDates, ensureDetails])
  const textsReady = portfolioDates.every((d) => getDetail(d) !== undefined)
  const detailsReady = state.dates.every((d) => getDetail(d) !== undefined)
  const texts = useMemo(() => {
    const m = new Map()
    for (const d of portfolioDates) {
      const t = getDetail(d)?.portfolio?.text
      if (typeof t === 'string' && t.trim()) m.set(d, t)
    }
    return m
  }, [portfolioDates, getDetail])

  const profile = useMemo(() => profileData(state, refl), [state, refl])
  const rhythm = useMemo(() => rhythmData(dataset), [dataset])
  const phases = useMemo(() => phasesData(dataset), [dataset])
  const constancy = useMemo(() => constancyData(state, refl), [state, refl])
  const style = useMemo(() => (textsReady ? styleData(texts) : null), [textsReady, texts])
  const lexical = useMemo(() => (textsReady ? lexicalData(texts) : null), [textsReady, texts])
  const cognitive = useMemo(() => cognitiveData(dataset.metrics), [dataset.metrics])
  const anomalies = useMemo(() => anomaliesData(dataset), [dataset])
  const candidates = useMemo(() => {
    const out = []
    for (const c of state.competencies.values()) {
      for (const t of c.traces) {
        const td = getDetail(t.date)?.variants?.[t.variantId]?.verdicts?.[c.code]?.traces?.[t.id]
        // Force du signal (rôle × confiance), propre aux moments : l'angle, lui, ne compte que les points.
        out.push({ id: t.id, date: t.date, variantId: t.variantId, code: c.code, role: t.role, confidence: t.confidence, weight: traceSignal(t.role, t.confidence, state.params), extract: td?.extract ?? '' })
      }
    }
    return out
  }, [state, getDetail])
  const anyExtract = candidates.some((c) => c.extract)

  /** Disponibilité de chaque carte : nœud, ou raison de l'absence. */
  const cards = {
    profile: profile ? { node: <ProfileCard data={profile} refl={refl} />, source: LLM } : { reason: 'aucune compétence observée dans les journées cochées' },
    rhythm: rhythm ? { node: <RhythmCard data={rhythm} phases={phases} onOpenDay={onOpenDay} />, source: LOCAL } : { reason: 'aucun portfolio importé' },
    phases: phases ? { node: <PhasesCard data={phases} update={update} onOpenDay={onOpenDay} />, source: 'Repères et phases posés par vous.' } : { reason: 'aucune journée' },
    constancy: constancy ? { node: <ConstancyCard data={constancy} refl={refl} />, source: LLM } : { reason: 'aucune compétence observée dans les journées cochées' },
    moments:
      candidates.length === 0
        ? { reason: 'aucune trace dans les journées cochées' }
        : detailsReady && !anyExtract
          ? { reason: 'aucune trace n’a d’extrait (analyses reconstituées depuis des compteurs)' }
          : {
              node: (
                <MomentsCard
                  candidates={candidates}
                  loading={!detailsReady}
                  sensitivity={sensitivity}
                  onSensitivity={(s) => setPrefs({ momentsSensitivity: s })}
                  refl={refl}
                  dataset={dataset}
                  getDetail={getDetail}
                  firstImpressions={dataset.metrics?.firstImpressions}
                  onOpenDay={onOpenDay}
                  onOpenTrace={onOpenTrace}
                />
              ),
              source: LLM,
            },
    style:
      portfolioDates.length < 2
        ? { reason: 'il faut au moins deux journées de portfolio' }
        : !textsReady
          ? { node: <p className="carto-muted carto-card-body">Chargement des textes…</p>, source: LOCAL }
          : style
            ? { node: <StyleCard data={style} onOpenDay={onOpenDay} />, source: LOCAL }
            : { reason: 'il faut au moins deux journées de portfolio d’au moins 50 mots' },
    cognitive: cognitive ? { node: <CognitiveCard data={cognitive} onOpenDay={onOpenDay} />, source: `${LLM} Source : ${dataset.metrics?.source ?? 'fichier importé'}.` } : { reason: 'aucun fichier de fonctions cognitives (HumanoTwin) importé' },
    lexical:
      portfolioDates.length < 3
        ? { reason: 'il faut au moins trois journées de portfolio' }
        : !textsReady
          ? { node: <p className="carto-muted carto-card-body">Chargement des textes…</p>, source: LOCAL }
          : lexical
            ? { node: <LexicalCard data={lexical} onOpenDay={onOpenDay} />, source: LOCAL }
            : { reason: 'pas assez de journées écrites assez longues pour mesurer un écart' },
    anomalies: anomalies ? { node: <AnomaliesCard data={anomalies} onOpenDay={onOpenDay} />, source: 'Index des journées importées.' } : { reason: 'rien à signaler' },
  }

  const hide = (id) => setPrefs({ dashboardHidden: [...hidden, id] })
  const show = (id) => setPrefs({ dashboardHidden: [...hidden].filter((x) => x !== id) })
  const tiles = DASHBOARD_CARDS.filter((c) => cards[c.id].node && !hidden.has(c.id)).map((c) => ({
    id: c.id,
    label: c.label,
    node: (
      <Card id={c.id} label={c.label} source={cards[c.id].source} onHide={hide}>
        {cards[c.id].node}
      </Card>
    ),
  }))
  const userHidden = DASHBOARD_CARDS.filter((c) => cards[c.id].node && hidden.has(c.id))
  const missing = DASHBOARD_CARDS.filter((c) => !cards[c.id].node)

  return (
    <section className="carto-dashboard" aria-labelledby="carto-dashboard-title">
      <header className="carto-dashboard-head">
        <h2 id="carto-dashboard-title">Tableau de bord</h2>
        <p className="carto-small carto-muted">
          Des repères pour gérer vos cartographies : journées à ouvrir, silences, ruptures, journées à arbitrer. Tout est calculé dans ce navigateur, sur vos seules
          journées.
        </p>
      </header>
      {tiles.length > 0 ? (
        <TileGrid tiles={tiles} layout={prefs.dashboardLayout ?? null} onLayoutChange={(layout) => setPrefs({ dashboardLayout: layout })} defaultSizes={DEFAULT_SIZES} />
      ) : (
        <p className="carto-muted">Aucune carte n’a de données à montrer pour l’instant.</p>
      )}
      {userHidden.length > 0 ? (
        <div className="carto-dashboard-hidden" role="group" aria-label="Cartes masquées">
          <span className="carto-small">Cartes masquées :</span>
          {userHidden.map((c) => (
            <button key={c.id} type="button" className="carto-btn carto-btn--quiet carto-btn--small" onClick={() => show(c.id)}>
              Afficher « {c.label} »
            </button>
          ))}
        </div>
      ) : null}
      {missing.length > 0 ? (
        <details className="carto-dashboard-missing">
          <summary>
            {missing.length} carte{missing.length > 1 ? 's' : ''} sans données
          </summary>
          <ul className="carto-small">
            {missing.map((c) => (
              <li key={c.id}>
                {c.label} : {cards[c.id].reason}.
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  )
}
