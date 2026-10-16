// Interface ultime — panneau de détail d'une compétence, partie « preuves »
// (spec §6.4, §8) : traces avec date et extrait (« Ouvrir dans le
// portfolio »), verdict de chaque journée (sa ligne : statut, confiance,
// preuves — le statut seul quand la compétence n'a que cette journée ;
// dépliée : motif, prescription), réflexions du jury, droit de réponse de
// l'apprenant. Chaque information une fois (journal D-66).

import { REVIEW_LABELS, REVIEW_STATES, observationKey, verdictStatusLabel } from '../core/model.js'
import { setReview } from '../core/ops.js'
import { formatLong, formatShort } from '../core/dates.js'
import { JuryReflections, RunJury, VerdictFacts } from './Jury.jsx'
import { SOURCE_LABELS } from './Manager.jsx'

const fmt = (n) => (typeof n === 'number' && Number.isFinite(n) ? n.toLocaleString('fr-FR', { maximumFractionDigits: 2 }) : '—')
const SNIPPET = 220
const same = (a, b) => String(a ?? '').trim() === String(b ?? '').trim()

/**
 * Le motif et la prescription d'une journée sont-ils ceux que la délibération
 * de son run dit déjà (verdict AuroraCore réparti sur les journées de ses
 * traces) ? Seulement si la délibération est là et les dit vraiment (D-66).
 */
export function saidByRun(run, vd) {
  const p = run?.president
  if (!vd?.runRef || !p) return false
  return (!vd.motif || same(vd.motif, p.verdict_argumente)) && (!vd.prescription || same(vd.prescription, p.prescription))
}

/**
 * La ligne d'une journée redirait-elle le panneau ? Oui quand c'est la seule
 * journée de la compétence et qu'elle en a la confiance et les preuves, déjà
 * lues dans ses chiffres (D-66).
 * @param {{confidence: number | null, proofs: number, hints: number}} v verdict de la journée
 * @param {{days: string[], confidence: number | null, proofs: number, hints: number}} comp
 */
export function sameAsCompetency(v, comp) {
  return comp?.days?.length === 1 && v.confidence === comp.confidence && v.proofs === comp.proofs && v.hints === comp.hints
}

/** Analyse qui a produit une variante : « journée du site », « AuroraCore — run »… */
function provenanceLabel(variant) {
  const p = variant?.provenance
  return `${SOURCE_LABELS[p?.source] ?? p?.source ?? 'source inconnue'}${p?.run ? ` — ${p.run}` : ''}`
}

/** Détail (verdict) d'une observation, ou undefined tant que la journée n'est pas chargée. */
export function verdictDetailOf(getDetail, date, variantId, code) {
  const d = getDetail(date)
  if (d === undefined) return undefined
  return d?.variants?.[variantId]?.verdicts?.[code] ?? null
}

/** Extrait d'une trace (détail chargé), ou undefined. */
function traceExtract(getDetail, t, code) {
  const vd = verdictDetailOf(getDetail, t.date, t.variantId, code)
  if (vd === undefined) return undefined
  return vd?.traces?.[t.id]?.extract ?? ''
}

/**
 * Liste des traces d'une compétence (ordre : journées, puis ordre du jury).
 * Le nombre de traces se lit dans les preuves et indices, plus haut ; dans la
 * modale d'un jour, la date de chaque trace est celle du jour (`dated` faux).
 * @param {{traces: Array<{id: string, date: string, variantId: string, role: string}>, code: string,
 *   getDetail: Function, onOpenTrace: (index: number) => void, onOpenDay?: (d: string, code?: string) => void,
 *   dated?: boolean}} props
 */
export function TraceList({ traces, code, getDetail, onOpenTrace, onOpenDay, dated = true }) {
  if (traces.length === 0) return null
  return (
    <section className="carto-traces" aria-label="Traces de la compétence">
      <h3>Traces</h3>
      <ol className="carto-trace-list">
        {traces.map((t, i) => {
          const extract = traceExtract(getDetail, t, code)
          const short = typeof extract === 'string' && extract.length > SNIPPET ? `${extract.slice(0, SNIPPET).trimEnd()}…` : extract
          return (
            <li key={t.id} className={`carto-trace carto-trace--${t.role}`}>
              <div className="carto-trace-meta">
                {!dated ? null : onOpenDay ? (
                  <button type="button" className="carto-link-btn" onClick={() => onOpenDay(t.date, code)} title={`Ouvrir la cartographie du ${formatLong(t.date)}`}>
                    {formatShort(t.date)}
                  </button>
                ) : (
                  <span>{formatShort(t.date)}</span>
                )}
                <span className="carto-role">{t.role === 'preuve' ? 'preuve' : 'indice'}</span>
              </div>
              {extract === undefined ? (
                <p className="carto-muted carto-small">Chargement de l’extrait…</p>
              ) : extract ? (
                <blockquote className="carto-trace-quote">{short}</blockquote>
              ) : (
                <p className="carto-muted carto-small">Trace sans extrait (reconstituée depuis des compteurs).</p>
              )}
              <button type="button" className="carto-btn carto-btn--quiet carto-btn--small" onClick={() => onOpenTrace(i)} disabled={extract === ''}>
                Ouvrir dans le portfolio
              </button>
            </li>
          )
        })}
      </ol>
    </section>
  )
}

const ANSWERS = [
  ['confirmed', 'Confirmer'],
  ['nuanced', 'Nuancer'],
  ['contested', 'Contester'],
]

/**
 * Droit de réponse de l'apprenant sur une observation (V3 PortfolioPanel) :
 * Confirmer / Nuancer / Contester + note privée. Stocké dans ce navigateur,
 * jamais envoyé, et sans effet sur les calculs (journal D-6). Un état
 * inconnu s'affiche « pas encore donnée », jamais « Contestée » (défaut V3).
 */
export function ReviewControls({ dataset, obsKey, update }) {
  const rev = dataset.reviews?.[obsKey]
  const state = REVIEW_STATES.includes(rev?.state) ? rev.state : 'unreviewed'
  return (
    <div className="carto-review" role="group" aria-label="Votre réponse à cette observation">
      <p className="carto-small">
        Votre réponse : <strong>{state === 'unreviewed' ? 'pas encore donnée' : REVIEW_LABELS[state]}</strong>
      </p>
      <div className="carto-review-buttons">
        {ANSWERS.map(([s, label]) => (
          <button
            key={s}
            type="button"
            className="carto-btn carto-btn--quiet carto-btn--small"
            aria-pressed={state === s}
            onClick={() => update((ds) => setReview(ds, obsKey, state === s ? 'unreviewed' : s))}
          >
            {label}
          </button>
        ))}
      </div>
      <label className="carto-review-note">
        <span className="carto-small">Note privée (reste dans ce navigateur)</span>
        <textarea
          key={obsKey}
          rows={2}
          defaultValue={rev?.note ?? ''}
          maxLength={2000}
          onBlur={(e) => {
            const note = e.target.value
            if (note === (rev?.note ?? '')) return
            update((ds) => {
              const cur = ds.reviews?.[obsKey]?.state
              return setReview(ds, obsKey, REVIEW_STATES.includes(cur) ? cur : 'unreviewed', note)
            })
          }}
        />
      </label>
    </div>
  )
}

/**
 * Verdicts par journée d'une compétence, avec jury et droit de réponse.
 * @param {{
 *   code: string, comp: object, dataset: object, t: string | null,
 *   getDetail: Function, getRunDetail: Function, update: Function,
 *   onOpenDay: (d: string, code?: string) => void,
 *   onOpenPassage: (p: {date: string, extract: string, label?: string}) => void,
 * }} props comp : entrée de state.competencies
 */
export function ObservationDays({ code, comp, dataset, t, getDetail, getRunDetail, update, onOpenDay, onOpenPassage }) {
  const byDate = new Map(dataset.days.map((d) => [d.date, d]))
  const verdicts = comp.verdicts
  const lastDate = verdicts.at(-1)?.date ?? null
  // Délibérations de run (AuroraCore) : une seule fois, pour tout le journal.
  const runRefs = []
  for (const v of verdicts) {
    const vd = verdictDetailOf(getDetail, v.date, v.variantId, code)
    if (vd?.runRef && !runRefs.includes(vd.runRef)) runRefs.push(vd.runRef)
  }
  const variantOf = (v) => byDate.get(v.date)?.variants.find((x) => x.id === v.variantId)
  // Une seule analyse pour toutes les journées : dite une fois, ici (D-66).
  const sources = new Set(verdicts.map((v) => provenanceLabel(variantOf(v))))
  const oneSource = sources.size === 1 ? [...sources][0] : null
  return (
    <section className="carto-observations" aria-label="Verdicts par journée">
      <h3>Verdicts par journée</h3>
      <p className="carto-small carto-muted">
        Niveau de preuve : exploratoire — chaque verdict vient d’une analyse automatique (un seul codeur, un modèle de langage).
        {oneSource ? ` Analyse : ${oneSource}.` : ''}
      </p>
      {runRefs.map((key) => {
        const run = getRunDetail(key)
        return (
          <details key={key} className="carto-run-jury">
            <summary>Délibération du jury — {key.split('|')[0]} (porte sur tout le journal)</summary>
            {run === undefined ? <p className="carto-muted">Chargement…</p> : run ? <RunJury run={run} /> : <p className="carto-muted">Délibération absente de l’import.</p>}
          </details>
        )
      })}
      {verdicts.map((v) => {
        const variant = variantOf(v)
        const summary = variant?.verdicts.find((x) => x.code === code) ?? { ...v, courtCircuit: false, rawStatus: null }
        const vd = verdictDetailOf(getDetail, v.date, v.variantId, code)
        const obsKey = observationKey(v.date, v.variantId, code)
        const rev = dataset.reviews?.[obsKey]
        return (
          <details key={obsKey} className="carto-observation" open={v.date === (t ?? lastDate) || undefined}>
            <summary title={summary.rawStatus ?? undefined}>
              <span className="carto-observation-date">{formatShort(v.date)}</span> · {verdictStatusLabel(summary)}
              {sameAsCompetency(v, comp)
                ? null
                : ` · confiance ${fmt(v.confidence)} · ${v.proofs} preuve${v.proofs > 1 ? 's' : ''}, ${v.hints} indice${v.hints > 1 ? 's' : ''}`}
              {REVIEW_STATES.includes(rev?.state) && rev.state !== 'unreviewed' ? ` · ${REVIEW_LABELS[rev.state].toLowerCase()} par vous` : ''}
            </summary>
            {vd === undefined ? (
              <p className="carto-muted">Chargement…</p>
            ) : (
              <>
                {/* La ligne de la journée dit déjà statut, confiance et preuves ; un verdict
                    AuroraCore porte le motif du président, dit une fois dans la délibération,
                    plus haut, quand elle est là (D-66). */}
                <VerdictFacts verdict={summary} detail={vd} summary={false} texts={!saidByRun(vd?.runRef ? getRunDetail(vd.runRef) : null, vd)} />
                <p className="carto-small carto-muted">
                  {oneSource ? null : <>Analyse : {provenanceLabel(variant)} · </>}
                  <button type="button" className="carto-link-btn" onClick={() => onOpenDay(v.date, code)}>
                    ouvrir la journée
                  </button>
                </p>
                <ReviewControls dataset={dataset} obsKey={obsKey} update={update} />
                {vd && !vd.runRef ? (
                  <details className="carto-jury-wrap">
                    <summary>Réflexions du jury</summary>
                    <JuryReflections detail={vd} date={v.date} confidence={v.confidence} onOpenPassage={onOpenPassage} />
                  </details>
                ) : null}
              </>
            )}
          </details>
        )
      })}
    </section>
  )
}

/**
 * Contenu dépliable d'une compétence dans la modale du jour : traces du jour,
 * verdict, droit de réponse, réflexions du jury (non établies et
 * court-circuits compris : c'est le seul endroit où leur raisonnement se lit,
 * point ouvert 4).
 * @param {{v: object, variant: object, date: string, dataset: object, getDetail: Function, getRunDetail: Function,
 *   ensureRunDetail: (key: string) => void, update: Function,
 *   onOpenTrace: (code: string, list: object[], index: number) => void,
 *   onOpenPassage: (p: {date: string, extract: string, label?: string}) => void}} props
 */
export function DayVerdictDetail({ v, variant, date, dataset, getDetail, getRunDetail, ensureRunDetail, update, onOpenTrace, onOpenPassage }) {
  const vd = verdictDetailOf(getDetail, date, variant.id, v.code)
  if (vd === undefined) return <p className="carto-muted">Chargement…</p>
  const list = (v.traces ?? []).map((t) => ({ id: t.id, date, variantId: variant.id, role: t.role }))
  const run = vd?.runRef ? getRunDetail(vd.runRef) : null
  return (
    <div className="carto-day-verdict-body">
      {/* La journée est celle de la modale : ses traces ne redisent pas la date (D-66). */}
      <TraceList traces={list} code={v.code} getDetail={getDetail} onOpenTrace={(i) => onOpenTrace(v.code, list, i)} dated={false} />
      {/* La ligne de la compétence dit déjà confiance, preuves et statut (D-66). */}
      <VerdictFacts verdict={v} detail={vd} summary={false} />
      <ReviewControls dataset={dataset} obsKey={observationKey(date, variant.id, v.code)} update={update} />
      <details
        className="carto-jury-wrap"
        onToggle={(e) => {
          if (e.currentTarget.open && vd?.runRef) ensureRunDetail(vd.runRef)
        }}
      >
        <summary>Réflexions du jury</summary>
        {vd?.runRef && run === undefined ? <p className="carto-muted">Chargement de la délibération…</p> : null}
        <JuryReflections detail={vd} run={run ?? null} date={date} confidence={v.confidence} onOpenPassage={onOpenPassage} />
      </details>
    </div>
  )
}
