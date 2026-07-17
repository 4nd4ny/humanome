// Interface V3 — outils : « Pourquoi ce rayon ? » (§11.2), comparaison
// ipsative + récit (§17.2-3), rapport d'import (§8.3), éditeurs (§16).

import { useMemo, useState } from 'react'
import { whyRadius } from '../core/metrics.js'
import { resolveBaselinePreset, compareStates, whatChanged } from '../core/compare.js'
import { validateMasterShape } from '../core/master.js'

export function WhyRadiusDialog({ code, referential, snapshot, uiState, audience, onClose, onInspect }) {
  const comp = referential.competencyByCode.get(code)
  const dates = snapshot.datesByCompetency.get(code) ?? new Set()
  const why = whyRadius(code, dates, { playheadDay: uiState.playheadDay, metric: snapshot.metric })
  const excluded = audience === 'learner' ? snapshot.excludedByCompetency?.get(code) ?? [] : []
  return (
    <div className="v3-dialog" role="dialog" aria-label={`Pourquoi ce rayon ? ${code}`}>
      <div className="v3-dialog-head">
        <h3>Pourquoi ce rayon ? — {code} {comp ? `· ${comp.name}` : ''}</h3>
        <button type="button" onClick={onClose} aria-label="Fermer">×</button>
      </div>
      <p>
        Métrique <strong>{why.metric}</strong> : {why.label}.
      </p>
      {why.units.length > 0 ? (
        <ul className="v3-why-days">
          {why.units.map((u) => (
            <li key={u}>
              {snapshot.metric.id === 'documented-days-v1' ? (
                <button type="button" className="v3-link" onClick={() => onInspect(u)}>{u}</button>
              ) : (
                u
              )}
            </li>
          ))}
        </ul>
      ) : null}
      {uiState.baselineDay ? (
        <p className="v3-note">
          Depuis la référence ({uiState.baselineDay}) :{' '}
          {[...dates].filter((d) => d > uiState.baselineDay && (!uiState.playheadDay || d <= uiState.playheadDay)).length} nouvelle(s) journée(s).
        </p>
      ) : null}
      {excluded.length > 0 ? (
        <details>
          <summary>Éléments écartés (espace privé uniquement)</summary>
          <ul>{excluded.map((x, i) => <li key={i}>{x}</li>)}</ul>
        </details>
      ) : null}
      <p className="v3-note">
        La confiance du verdict est une confiance dans le verdict — jamais une force ni un niveau.
      </p>
    </div>
  )
}

export function ComparePanel({ snapshot, uiState, referential, onSetBaseline, onClearBaseline }) {
  const activeDates = [...snapshot.competenciesByDate.keys()].sort()
  const playhead = uiState.playheadDay ?? activeDates[activeDates.length - 1] ?? null
  const [message, setMessage] = useState(null)

  const diff = useMemo(() => {
    if (!uiState.baselineDay || !playhead) return null
    return compareStates(snapshot.datesByCompetency, {
      baselineDay: uiState.baselineDay,
      playheadDay: playhead,
      annotations: snapshot.annotations ?? [],
    })
  }, [uiState.baselineDay, playhead, snapshot])

  function preset(name) {
    setMessage(null)
    const res = resolveBaselinePreset(name, { playheadDay: playhead, activeDates })
    if (res.unavailable) setMessage(res.unavailable)
    else onSetBaseline(res.baselineDay, name)
  }

  return (
    <section className="v3-panel v3-compare" aria-label="Comparaison ipsative">
      <h3>Comparaison (avec vous-même, jamais avec une cohorte)</h3>
      <div className="v3-compare-presets">
        <button type="button" onClick={() => preset('last-evaluation')}>Depuis la dernière évaluation</button>
        <button type="button" onClick={() => preset('quarter-start')}>Depuis le début du trimestre</button>
        <button type="button" onClick={() => preset('year-start')}>Depuis le début de l’année</button>
        {uiState.baselineDay ? (
          <button type="button" onClick={onClearBaseline}>Retirer la comparaison</button>
        ) : null}
      </div>
      {message ? <p role="status">{message}</p> : null}
      {diff ? (
        <>
          <p>
            Référence <strong>{uiState.baselineDay}</strong> → état courant <strong>{playhead}</strong>.
          </p>
          <ul className="v3-recit">
            {whatChanged(diff, { nameOf: (c) => referential.competencyByCode.get(c)?.name ?? c }).map((p, i) => (
              <li key={i}>
                {p.text}
                {p.refs.dates?.length ? <span className="v3-note"> [{p.refs.dates.join(' · ')}]</span> : null}
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="v3-note">Choisissez un préréglage pour comparer deux de vos états.</p>
      )}
    </section>
  )
}

export function ImportReportPanel({ report }) {
  if (!report?.length) {
    return (
      <section className="v3-panel v3-report" aria-label="Rapport d’import">
        <h3>Rapport d’import</h3>
        <p>Aucune anomalie.</p>
      </section>
    )
  }
  const bySeverity = { blocking: [], arbitrate: [], warning: [], info: [] }
  for (const r of report) (bySeverity[r.severity] ?? bySeverity.info).push(r)
  const labels = { blocking: 'Bloquant', arbitrate: 'À arbitrer', warning: 'Avertissement', info: 'Information' }
  return (
    <section className="v3-panel v3-report" aria-label="Rapport d’import">
      <h3 tabIndex={-1}>Rapport d’import</h3>
      <p role="status">
        {Object.entries(bySeverity).filter(([, list]) => list.length).map(([s, list]) => `${labels[s]} : ${list.length}`).join(' · ')}
      </p>
      {Object.entries(bySeverity).map(([severity, list]) =>
        list.length ? (
          <details key={severity} open={severity === 'blocking' || severity === 'arbitrate'}>
            <summary>{labels[severity]} ({list.length})</summary>
            <ul>
              {list.slice(0, 100).map((r, i) => (
                <li key={i}>
                  <code>{r.code}</code> — {r.message}
                  {r.sourceDate ? ` (${r.sourceDate}${r.run ? `, ${r.run}` : ''})` : ''}
                </li>
              ))}
              {list.length > 100 ? <li>… et {list.length - 100} autres entrées de même gravité.</li> : null}
            </ul>
          </details>
        ) : null,
      )}
    </section>
  )
}

export function ArbitragePanel({ master, onChooseVariant }) {
  const contested = master.days.filter((d) => d.provenance.length > 1)
  if (contested.length === 0) return null
  return (
    <section className="v3-panel v3-arbitrage" aria-label="Arbitrage des variantes">
      <h3>Variantes à arbitrer</h3>
      {contested.map((day) => (
        <div key={day.id} className="v3-arbitrage-day">
          <strong>{day.effectiveDate}</strong> — {day.provenance.length} variantes :
          {day.provenance.map((p) => (
            <label key={p.variantId}>
              <input
                type="radio"
                name={`variant-${day.id}`}
                checked={day.activeVariantId === p.variantId}
                onChange={() => onChooseVariant(day.id, p.variantId)}
              />{' '}
              {p.run}
            </label>
          ))}
          <label>
            <input
              type="radio"
              name={`variant-${day.id}`}
              checked={day.activeVariantId === null}
              onChange={() => onChooseVariant(day.id, null)}
            />{' '}
            À examiner (ne contribue pas)
          </label>
        </div>
      ))}
    </section>
  )
}

export function JsonEditorPanel({ master, onApply }) {
  const [draft, setDraft] = useState(null)
  const [errors, setErrors] = useState([])
  const text = draft ?? JSON.stringify(master, null, 2)
  return (
    <section className="v3-panel v3-json-editor" aria-label="Éditeur JSON expert">
      <h3>Éditeur JSON (copie de travail)</h3>
      <textarea
        rows={14}
        spellCheck={false}
        value={text}
        onChange={(e) => {
          setDraft(e.target.value)
          try {
            setErrors(validateMasterShape(JSON.parse(e.target.value)))
          } catch (err) {
            setErrors([`JSON invalide : ${err.message}`])
          }
        }}
        aria-label="Copie de travail du master (JSON)"
      />
      {errors.length > 0 ? (
        <ul role="alert" className="v3-errors">{errors.slice(0, 8).map((e, i) => <li key={i}>{e}</li>)}</ul>
      ) : null}
      <div>
        <button
          type="button"
          disabled={draft === null || errors.length > 0}
          onClick={() => {
            const res = onApply(JSON.parse(draft))
            if (res.ok) setDraft(null)
            else setErrors(res.errors)
          }}
        >
          Valider (nouvelle révision)
        </button>{' '}
        <button type="button" disabled={draft === null} onClick={() => { setDraft(null); setErrors([]) }}>
          Abandonner le brouillon
        </button>
      </div>
      <p className="v3-note">Un JSON invalide ne peut jamais remplacer une révision valide ; le brouillon reste ici pour correction.</p>
    </section>
  )
}
