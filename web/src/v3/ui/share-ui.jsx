// Interface V3 — constructeur de projection (§18) et vue employeur (§20).
// La prévisualisation et la vue employeur utilisent le MÊME fichier
// matérialisé et le même moteur de rendu (§18.8).

import { useMemo, useState } from 'react'
import {
  addLearnerSummary,
  applyScopeInclusion,
  buildShareSnapshot,
  configureProject,
  lockPreview,
  planScopeInclusion,
  publishSnapshot,
  removeScope,
  scopeTriState,
  shareFilename,
} from '../core/share.js'
import { masterDigest } from '../core/master.js'
import { policyDigest } from '../core/share.js'
import { snapshotToViewModel } from '../core/reimport.js'
import { radialProportion, countLabel, METRICS } from '../core/metrics.js'
import { downloadJson } from '../../lib/download-json.js'

export function ShareBuilder({ master, project, referential, onProjectChange, onPreview }) {
  const [pendingPlan, setPendingPlan] = useState(null)
  const [result, setResult] = useState(null)

  const tri = (scope) => scopeTriState(project, master, scope)

  function planAll() {
    const plan = planScopeInclusion(project, master, { type: 'all' })
    setPendingPlan({ scope: { type: 'all' }, plan })
  }
  function planScope(scope) {
    const plan = planScopeInclusion(project, master, scope)
    setPendingPlan({ scope, plan })
  }
  function confirmPlan() {
    onProjectChange(applyScopeInclusion(project, master, pendingPlan.plan))
    setPendingPlan(null)
  }

  function buildPreview() {
    const res = buildShareSnapshot(master, project, { referential })
    setResult(res)
    if (res.ok) {
      onProjectChange(lockPreview(project, res.digests))
      onPreview(res.snapshot)
    }
  }

  function exportSnapshot() {
    const res = buildShareSnapshot(master, project, { referential })
    if (!res.ok) {
      setResult(res)
      return
    }
    const current = { sourceDigest: masterDigest(master), policyDigest: policyDigest(project), outputDigest: res.digests.outputDigest }
    const confirmed = window.confirm(
      'Un fichier transmis ne peut pas être révoqué ni rappelé : une copie envoyée reste chez son destinataire. Exporter quand même ?',
    )
    const pub = publishSnapshot(project, master, current, { confirmedStaticExportWarning: confirmed })
    if (!pub.ok) {
      setResult({ ok: false, blockers: [{ code: 'publication', message: pub.error }] })
      return
    }
    onProjectChange(pub.project)
    downloadJson(res.snapshot, shareFilename(project))
  }

  return (
    <section className="v3-panel v3-share" aria-label="Préparer un partage">
      <h3>Préparer un partage — {project.name}</h3>
      <p className="v3-note">
        Liste positive : rien n’est partagé sans autorisation explicite. L’action est
        « Retirer de cette version partagée », jamais « Supprimer » du dossier privé.
      </p>

      <div className="v3-share-grid">
        <div>
          <h4>Familles</h4>
          <ul>
            {referential.families.map((f) => {
              const state = tri({ type: 'family', familyNum: f.num })
              return (
                <li key={f.id}>
                  <label>
                    <input
                      type="checkbox"
                      checked={state === 'included'}
                      ref={(el) => el && (el.indeterminate = state === 'partial')}
                      onChange={(e) =>
                        e.target.checked
                          ? planScope({ type: 'family', familyNum: f.num })
                          : onProjectChange(removeScope(project, master, { type: 'family', familyNum: f.num }))
                      }
                    />{' '}
                    {f.symbol} {f.name} <span className="v3-note">({state === 'partial' ? 'partiel' : state === 'included' ? 'inclus' : 'exclu'})</span>
                  </label>
                </li>
              )
            })}
          </ul>
          <button type="button" onClick={planAll}>Inclure les éléments visibles…</button>
        </div>

        <div>
          <h4>Précision temporelle</h4>
          {['day', 'month', 'hidden'].map((p) => (
            <label key={p}>
              <input
                type="radio"
                name="precision"
                checked={project.temporalPrecision === p}
                onChange={() => onProjectChange(configureProject(project, { temporalPrecision: p }))}
              />{' '}
              {p === 'day' ? 'Jour (heatmap et animation possibles)' : p === 'month' ? 'Mois (agrégé, jours non reconstructibles)' : 'Masquée (aucune date)'}
            </label>
          ))}
          <h4>Champs partagés</h4>
          {[['contexte', 'Contexte des passages'], ['learnerRole', 'Rôle réel'], ['outcome', 'Résultat'], ['tags', 'Tags de contexte'], ['auteur', 'Auteur']].map(([field, label]) => (
            <label key={field}>
              <input
                type="checkbox"
                checked={project.allowed.fields[field]}
                onChange={(e) => onProjectChange(configureProject(project, { fields: { [field]: e.target.checked } }))}
              />{' '}
              {label}
            </label>
          ))}
        </div>
      </div>

      <details>
        <summary>Ajouter une synthèse sans source (ne compte aucune journée)</summary>
        <SummaryForm referential={referential} onAdd={(s) => onProjectChange(addLearnerSummary(project, s))} />
      </details>

      {pendingPlan ? (
        <div className="v3-plan" role="alertdialog" aria-label="Confirmation d’inclusion groupée">
          <p>
            Cette action ajoutera <strong>{pendingPlan.plan.count}</strong> association{pendingPlan.plan.count > 1 ? 's' : ''} passage–compétence au brouillon.
            Documents intégraux, URI et champs sensibles restent non partagés tant que vous ne les activez pas.
          </p>
          <button type="button" onClick={confirmPlan}>Confirmer</button>{' '}
          <button type="button" onClick={() => setPendingPlan(null)}>Annuler</button>
        </div>
      ) : null}

      {result && !result.ok ? (
        <ul role="alert" className="v3-errors">
          {result.blockers.slice(0, 6).map((b, i) => <li key={i}><code>{b.code}</code> — {b.message}</li>)}
        </ul>
      ) : null}

      <div className="v3-share-actions">
        <span className="v3-note">
          {project.allowed.evidenceLinkIds.length} association(s) autorisée(s) · précision {project.temporalPrecision}
          {project.previewLock ? ' · prévisualisation verrouillée' : ' · prévisualisation requise avant publication'}
        </span>
        <button type="button" onClick={buildPreview}>Prévisualiser (vue employeur exacte)</button>
        <button type="button" onClick={exportSnapshot} disabled={!project.previewLock}>
          Publier et exporter le JSON employeur
        </button>
      </div>
    </section>
  )
}

function SummaryForm({ referential, onAdd }) {
  const [code, setCode] = useState(referential.competencies[0]?.code ?? '')
  const [text, setText] = useState('')
  return (
    <div className="v3-summary-form">
      <label>
        Compétence{' '}
        <select value={code} onChange={(e) => setCode(e.target.value)}>
          {referential.competencies.map((c) => <option key={c.code} value={c.code}>{c.code} — {c.name}</option>)}
        </select>
      </label>
      <textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} aria-label="Synthèse déclarée (sans document source)" />
      <button type="button" disabled={!text.trim()} onClick={() => { onAdd({ code, text: text.trim() }); setText('') }}>
        Ajouter la synthèse
      </button>
    </div>
  )
}

// ---- Vue employeur (§20) — aussi utilisée pour la prévisualisation ------------

export function EmployerView({ snapshot, isPreview = false }) {
  const vm = useMemo(() => snapshotToViewModel(snapshot), [snapshot])
  const metric = METRICS[vm.metricDefinition.id] ?? METRICS['public-presence-v1']
  const [filter, setFilter] = useState(null)

  const byCode = new Map()
  for (const o of vm.observations) {
    const list = byCode.get(o.rawCode) ?? []
    list.push(o)
    byCode.set(o.rawCode, list)
  }
  const linksByObs = new Map()
  for (const l of vm.evidenceLinks) {
    const list = linksByObs.get(l.observationId) ?? []
    list.push(l)
    linksByObs.set(l.observationId, list)
  }
  const passageById = new Map(vm.passages.map((p) => [p.id, p]))
  const summaries = vm.portfolioDocuments.filter((d) => d.type === 'learner-summary')

  const units = (code) => {
    const dates = new Set(byCode.get(code)?.map((o) => o.date).filter(Boolean))
    return metric.id === 'public-presence-v1' ? (byCode.get(code)?.length ? 1 : 0) : dates.size
  }

  const competencies = vm.referential.competencies.filter((c) => byCode.has(c.code) || summaries.some((s) => s.competencyCode === c.code))

  return (
    <section className={`v3-panel v3-employer${isPreview ? ' v3-preview' : ''}`} aria-label={isPreview ? 'Prévisualisation employeur' : 'Cartographie partagée'}>
      {isPreview ? <p className="v3-preview-banner" role="note">Prévisualisation : exactement ce que recevra l’employeur — même fichier, même moteur de rendu.</p> : null}
      <header>
        <h3>Forces documentées partagées</h3>
        <p className="v3-note">
          Référentiel {vm.referential.id} {vm.referential.version} · métrique {vm.metricDefinition.id} ·
          généré le {snapshot.projection.createdAt?.slice(0, 10)} (date technique de génération) ·
          périmètre choisi par la personne candidate.
        </p>
      </header>
      <ul className="v3-employer-list">
        {competencies.map((c) => {
          const family = vm.referential.families.find((f) => f.num === c.familyNum)
          const n = units(c.code)
          const active = filter === c.code
          return (
            <li key={c.code} className={active ? 'v3-active' : ''}>
              <button type="button" className="v3-link" onClick={() => setFilter(active ? null : c.code)}>
                <span className="v3-swatch" style={{ background: family?.color }} aria-hidden="true" />
                {family?.symbol} {c.code} — {c.name}
              </button>
              <span className="v3-bar" aria-hidden="true">
                <span style={{ width: `${Math.round(radialProportion(n, metric.reference) * 100)}%`, background: family?.color }} />
              </span>
              <span>{countLabel(n, metric)}</span>
            </li>
          )
        })}
      </ul>

      {summaries.length > 0 ? (
        <section aria-label="Synthèses déclarées">
          <h4>Synthèses déclarées (sans document source)</h4>
          <ul>
            {summaries.map((s) => (
              <li key={s.id}>
                <strong>{s.competencyCode}</strong> — {s.summary} <span className="v3-note">({s.provenance})</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-label="Preuves partagées">
        <h4>Preuves</h4>
        {vm.observations
          .filter((o) => !filter || o.rawCode === filter)
          .map((o) => (
            <article key={o.id} className="v3-observation">
              <h5>
                {o.rawCode}
                {o.date ? ` · ${o.date}` : ''}
                {o.learnerRole ? ` · rôle : ${o.learnerRole}` : ''}
                {o.outcome ? ` · résultat : ${o.outcome}` : ''}
              </h5>
              {(linksByObs.get(o.id) ?? []).map((l) => {
                const p = passageById.get(l.passageId)
                return p ? (
                  <blockquote key={l.id} className="v3-passage">
                    <p>{p.verbatim}</p>
                    {p.contexte ? <footer>{p.contexte}</footer> : null}
                  </blockquote>
                ) : null
              })}
            </article>
          ))}
      </section>
    </section>
  )
}
