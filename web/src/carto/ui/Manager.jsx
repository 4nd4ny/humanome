// Interface ultime — gestionnaire de cartographies journalières (spec §7).
//
// L'espace Gestionnaire, et les tuiles de la cartographie (journal D-53 :
// Journées, Importer, Étiquettes, Ensembles nommés, Jeux de données) qui en
// reprennent les sections ; il pilote la heatmap, qui pilote le soleil :
// cases à cocher des journées (tout coché par défaut), cases tri-états par
// mois / semaine / année scolaire / étiquette, tout / rien / inverser,
// plage au Maj+clic, « cocher jusqu'à / depuis ce jour », étiquettes libres,
// arbitrage des variantes, ensembles nommés, import et rapport d'anomalies,
// suppression en deux temps (jamais window.confirm / window.prompt).

import { useEffect, useMemo, useRef, useState } from 'react'
import { contributingVariant, dayAnomalies, hasAnalysis, hasPortfolio, todoCount } from '../core/model.js'
import { dayCodes } from '../core/heatmap.js'
import { allTags, describeDefinition, groupDays, rangeBetween, resolveSetDates, triState } from '../core/sets.js'
import {
  acknowledgeLastImport, addTag, attachUndatedSegment, checkAll, checkRelativeTo, chooseVariant, deleteSet,
  discardUndatedSegment, invertChecks, removeTag, renameDataset, renameTag, saveSet, selectExactly, setActive,
} from '../core/ops.js'
import { formatLong, formatShort, isIsoDate } from '../core/dates.js'
import { ImportPanel, ImportReport } from './ImportPanel.jsx'

const nf = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 })
const kchars = (n) => (n >= 1000 ? `${nf.format(n / 1000)} k car.` : `${n} car.`)

/** Case à cocher tri-état (l'état « mixte » passe par la propriété indeterminate). */
export function TriStateCheckbox({ state, label, onChange }) {
  const ref = useRef(null)
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = state === 'mixed'
  }, [state])
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={state === 'all'}
      aria-checked={state === 'mixed' ? 'mixed' : state === 'all'}
      aria-label={label}
      onChange={() => onChange(state !== 'all')}
    />
  )
}

/** Bouton de suppression en deux temps : « Supprimer », puis « Confirmer ». */
export function TwoStepButton({ label = 'Supprimer', confirmLabel = 'Confirmer la suppression', onConfirm, className = '' }) {
  const [armed, setArmed] = useState(false)
  useEffect(() => {
    if (!armed) return undefined
    const timer = setTimeout(() => setArmed(false), 6000)
    return () => clearTimeout(timer)
  }, [armed])
  return armed ? (
    <span className="carto-two-step">
      <button type="button" className={`carto-btn carto-btn--danger ${className}`} onClick={() => { setArmed(false); onConfirm() }}>
        {confirmLabel}
      </button>
      <button type="button" className="carto-btn carto-btn--quiet" onClick={() => setArmed(false)}>
        Annuler
      </button>
    </span>
  ) : (
    <button type="button" className={`carto-btn carto-btn--quiet ${className}`} onClick={() => setArmed(true)}>
      {label}
    </button>
  )
}

const GROUPINGS = [
  ['none', 'Sans regroupement'],
  ['month', 'Par mois'],
  ['week', 'Par semaine'],
  ['schoolYear', 'Par année scolaire'],
  ['tag', 'Par étiquette'],
]

/**
 * @param {{
 *   dataset: object, refl: object, t: string | null, layout?: 'side' | 'full',
 *   update: (fn: (ds: object) => object) => void,
 *   commitWithDetails: (r: object) => Promise<void>,
 *   importInto: (files: Array<object>, opts?: object) => Promise<object>,
 *   busy?: string | null, lastReport?: object | null, onCloseReport?: () => void,
 *   datasets?: Array<object>, onOpenDataset?: (id: string) => void, onDeleteDataset?: (id: string) => void,
 *   onSetT: (d: string | null) => void, onOpenDay: (d: string) => void,
 * }} props
 */
/** Journées cochées du jeu (ensemble des dates). */
function useSelected(dataset) {
  return useMemo(() => new Set(dataset.days.filter((d) => d.active).map((d) => d.date)), [dataset.days])
}

/**
 * Section repliable du gestionnaire ; dans une tuile de la cartographie
 * (`bare`), simple bloc : la tuile porte déjà le titre.
 */
function Section({ title, bare = false, open = false, children }) {
  if (bare) return <div className="carto-section carto-section--bare">{children}</div>
  return (
    <details className="carto-section" open={open || undefined}>
      <summary>{title}</summary>
      {children}
    </details>
  )
}

export function Manager(props) {
  const { dataset, t, layout = 'full', update, onSetT, onOpenDay, readOnly = false } = props
  const [showReport, setShowReport] = useState(false)
  const selected = useSelected(dataset)

  return (
    <section className={`carto-manager carto-manager--${layout}`} aria-label="Gestionnaire des journées">
      <header className="carto-manager-head">
        <DatasetTitle dataset={dataset} onRename={(title) => update((ds) => renameDataset(ds, title))} />
        <DayCounts dataset={dataset} selected={selected} onShowReport={() => setShowReport(true)} />
      </header>

      <div className="carto-manager-body">
        <div className="carto-manager-main">
          <DayList dataset={dataset} t={t} selected={selected} update={update} onSetT={onSetT} onOpenDay={onOpenDay} />
        </div>

        <div className="carto-manager-tools">
          <DayAlerts dataset={dataset} update={update} commitWithDetails={props.commitWithDetails} readOnly={readOnly} />
          {readOnly ? null : (
            <ImportSection
              dataset={dataset}
              importInto={props.importInto}
              busy={props.busy ?? null}
              lastReport={props.lastReport ?? null}
              onCloseReport={props.onCloseReport}
              update={update}
              open={layout === 'full' || dataset.days.length === 0}
              compact={layout !== 'full'}
              showReport={showReport}
              setShowReport={setShowReport}
            />
          )}
          <TagsSection dataset={dataset} selected={selected} update={update} />
          <SetsSection dataset={dataset} selected={selected} update={update} />
          {readOnly ? null : <DatasetSection {...props} />}
        </div>
      </div>
    </section>
  )
}

/** « 67 journées · 59 cochées », et les anomalies à traiter (le bouton ouvre le rapport d'import). */
export function DayCounts({ dataset, selected: given = null, onShowReport }) {
  const own = useSelected(dataset)
  const selected = given ?? own
  const todo = todoCount(dataset)
  return (
    <p className="carto-manager-counts">
      {dataset.days.length} journée{dataset.days.length > 1 ? 's' : ''} · {selected.size} cochée{selected.size > 1 ? 's' : ''}
      {todo > 0 ? (
        <button type="button" className="carto-badge" onClick={onShowReport}>
          {todo} anomalie{todo > 1 ? 's' : ''} à traiter
        </button>
      ) : null}
    </p>
  )
}

/** Liste des journées : cases à cocher, regroupements, tout / aucune / inverser, plage au Maj+clic. */
export function DayList({ dataset, t, selected: given = null, update, onSetT, onOpenDay }) {
  const [grouping, setGrouping] = useState('none')
  const lastToggled = useRef(null)
  const own = useSelected(dataset)
  const selected = given ?? own
  const portfolioImported = Boolean(dataset.portfolio)

  const groups = useMemo(() => {
    if (grouping === 'none') return [{ key: 'all', label: null, dates: dataset.days.map((d) => d.date) }]
    const g = groupDays(dataset, grouping)
    if (grouping === 'tag') {
      const untagged = dataset.days.filter((d) => d.tags.length === 0).map((d) => d.date)
      if (untagged.length) g.push({ key: 'tag:', label: 'sans étiquette', dates: untagged })
    }
    return g
  }, [dataset, grouping])
  const byDate = useMemo(() => new Map(dataset.days.map((d) => [d.date, d])), [dataset.days])

  function toggle(date, shiftKey) {
    const day = byDate.get(date)
    const next = !day.active
    if (shiftKey && lastToggled.current && lastToggled.current !== date) {
      const range = rangeBetween(dataset, lastToggled.current, date)
      update((ds) => setActive(ds, range, next))
    } else {
      update((ds) => setActive(ds, [date], next))
    }
    lastToggled.current = date
  }

  function onListKey(e) {
    if (e.target?.type !== 'checkbox' || e.altKey || e.ctrlKey || e.metaKey) return
    if (e.key === 'a') update((ds) => checkAll(ds, true))
    else if (e.key === 'n') update((ds) => checkAll(ds, false))
    else if (e.key === 'i') update((ds) => invertChecks(ds))
    else return
    e.preventDefault()
  }

  return (
    <>
      <div className="carto-toolbar" role="toolbar" aria-label="Sélection des journées">
        <button type="button" className="carto-btn carto-btn--quiet" onClick={() => update((ds) => checkAll(ds, true))}>
          Tout
        </button>
        <button type="button" className="carto-btn carto-btn--quiet" onClick={() => update((ds) => checkAll(ds, false))}>
          Aucune
        </button>
        <button type="button" className="carto-btn carto-btn--quiet" onClick={() => update((ds) => invertChecks(ds))}>
          Inverser
        </button>
        <label className="carto-select">
          <span className="carto-visually-hidden">Regrouper les journées</span>
          <select value={grouping} onChange={(e) => setGrouping(e.target.value)}>
            {GROUPINGS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="carto-hint">Maj+clic : plage · a / n / i sur une case : tout, aucune, inverser</p>

      {dataset.days.length === 0 ? (
        <p className="carto-muted">Aucune journée : importez des analyses ou un portfolio.</p>
      ) : (
        <div className="carto-days" onKeyDown={onListKey}>
          {groups.map((g) => (
            <div key={g.key} className="carto-day-group">
              {g.label ? (
                <div className="carto-day-group-head">
                  <TriStateCheckbox state={triState(g.dates, selected)} label={`Cocher ${g.label}`} onChange={(on) => update((ds) => setActive(ds, g.dates, on))} />
                  <span>{g.label}</span>
                  <span className="carto-count">{g.dates.length} j.</span>
                </div>
              ) : null}
              <ul className="carto-day-list">
                {g.dates.map((date) => (
                  <DayRow
                    key={`${g.key}-${date}`}
                    day={byDate.get(date)}
                    t={t}
                    portfolioImported={portfolioImported}
                    onToggle={toggle}
                    onSetT={onSetT}
                    onOpenDay={onOpenDay}
                    update={update}
                  />
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </>
  )
}

/** Ce qui demande une décision : journées à arbitrer, passages du portfolio sans date. */
export function DayAlerts({ dataset, update, commitWithDetails, readOnly = false }) {
  const pending = dataset.days.filter((d) => d.variantChoice === 'pending')
  return (
    <>
      {pending.length > 0 ? <ArbitrationSection days={pending} update={update} /> : null}
      {readOnly ? null : <UndatedSection dataset={dataset} commitWithDetails={commitWithDetails} update={update} />}
    </>
  )
}

/**
 * Importer (dans ce jeu ou dans un nouveau) et rapport du dernier import. Le
 * rapport s'ouvre aussi depuis le compteur d'anomalies : son état est tenu
 * par le parent (`showReport`).
 */
export function ImportSection({ dataset, importInto, busy = null, lastReport = null, onCloseReport, update, open = false, compact = false, bare = false, showReport, setShowReport }) {
  const [importTarget, setImportTarget] = useState('current')

  async function doImport(files) {
    const report = await importInto(files, { newDataset: importTarget === 'new' || !dataset })
    if (report) setShowReport(true)
    return report
  }

  return (
    <>
      <Section title="Importer" bare={bare} open={open}>
        <div className="carto-import-target" role="radiogroup" aria-label="Destination de l’import">
          <label>
            <input type="radio" name="carto-import-target" checked={importTarget === 'current'} onChange={() => setImportTarget('current')} /> dans « {dataset.title} »
          </label>
          <label>
            <input type="radio" name="carto-import-target" checked={importTarget === 'new'} onChange={() => setImportTarget('new')} /> dans un nouveau jeu de données
          </label>
        </div>
        <ImportPanel onImport={doImport} busy={busy} compact={compact} />
      </Section>
      <LastImportReport dataset={dataset} lastReport={lastReport} update={update} onCloseReport={onCloseReport} showReport={showReport} setShowReport={setShowReport} />
    </>
  )
}

/**
 * Rapport du dernier import, ou le bouton qui l'ouvre (`withButton`). Le
 * fermer le marque comme lu. Hors de la tuile Importer, la cartographie le
 * montre en bandeau après un import (journal D-53).
 */
export function LastImportReport({ dataset, lastReport = null, update, onCloseReport, showReport, setShowReport, withButton = true }) {
  const lastLog = dataset.importLog?.at(-1) ?? null
  const reportEntries = lastReport?.entries ?? lastLog?.entries ?? null
  if (showReport && reportEntries) {
    return (
      <ImportReport
        entries={reportEntries}
        title={lastReport ? 'Rapport du dernier import' : `Rapport de l’import du ${formatShort((lastLog?.at ?? '').slice(0, 10))}`}
        onClose={() => {
          setShowReport(false)
          onCloseReport?.()
          update((ds) => acknowledgeLastImport(ds))
        }}
      />
    )
  }
  if (withButton && reportEntries?.length) {
    return (
      <button type="button" className="carto-btn carto-btn--quiet" onClick={() => setShowReport(true)}>
        Voir le rapport du dernier import
      </button>
    )
  }
  return null
}

export function DatasetTitle({ dataset, onRename }) {
  const [draft, setDraft] = useState(dataset.title)
  useEffect(() => setDraft(dataset.title), [dataset.title])
  return (
    <label className="carto-dataset-title">
      <span className="carto-visually-hidden">Nom du jeu de données (pseudonyme)</span>
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => draft.trim() && draft !== dataset.title && onRename(draft)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
          if (e.key === 'Escape') setDraft(dataset.title)
        }}
      />
    </label>
  )
}

function DayRow({ day, t, portfolioImported, onToggle, onSetT, onOpenDay, update }) {
  const [tagDraft, setTagDraft] = useState('')
  const codes = dayCodes(day)
  const anomalies = dayAnomalies(day, { portfolioImported })
  const v = contributingVariant(day)
  const classes = ['carto-day']
  if (!hasAnalysis(day)) classes.push('is-portfolio-only')
  if (!day.active) classes.push('is-off')
  if (t === day.date) classes.push('is-t')
  return (
    <li className={classes.join(' ')}>
      <input
        type="checkbox"
        checked={day.active}
        aria-label={`Cocher le ${formatLong(day.date)}`}
        // Le clic (souris ou barre d'espace) porte shiftKey : il fait la bascule.
        onChange={() => {}}
        onClick={(e) => onToggle(day.date, e.shiftKey)}
      />
      <button type="button" className="carto-day-date" onClick={() => onSetT(day.date)} title="Fixer la date t sur ce jour">
        {formatShort(day.date)}
      </button>
      <span className="carto-day-ind">
        {hasAnalysis(day) ? <span title="compétences observées">{codes.size} comp.</span> : <span className="carto-muted">sans analyse</span>}
        {hasPortfolio(day) ? <span title="volume du portfolio">{kchars(day.portfolio.chars)}</span> : portfolioImported && hasAnalysis(day) ? <span className="carto-flag" title="analyse sans portfolio : surlignage indisponible">sans portfolio</span> : null}
        {day.variants.length > 1 ? <span className={day.variantChoice === 'pending' ? 'carto-flag' : ''}>{day.variants.length} variantes</span> : null}
        {anomalies.some((a) => a.severity === 'blocking' || a.severity === 'arbitrate' || a.severity === 'warning') ? (
          <span className="carto-flag" title={anomalies.map((a) => a.message).join('\n')}>
            !
          </span>
        ) : null}
      </span>
      {day.tags.length ? (
        <span className="carto-day-tags">
          {day.tags.map((tag) => (
            <span key={tag} className="carto-tag">
              {tag}
            </span>
          ))}
        </span>
      ) : null}
      <details className="carto-day-more">
        <summary aria-label={`Actions pour le ${formatLong(day.date)}`}>⋯</summary>
        <div className="carto-day-actions">
          <button type="button" className="carto-btn carto-btn--quiet" onClick={() => onOpenDay(day.date)}>
            Ouvrir ce jour
          </button>
          <button type="button" className="carto-btn carto-btn--quiet" onClick={() => update((ds) => checkRelativeTo(ds, day.date, 'until'))}>
            Cocher jusqu’à ce jour
          </button>
          <button type="button" className="carto-btn carto-btn--quiet" onClick={() => update((ds) => checkRelativeTo(ds, day.date, 'since'))}>
            Cocher depuis ce jour
          </button>
          <form
            className="carto-inline-form"
            onSubmit={(e) => {
              e.preventDefault()
              if (!tagDraft.trim()) return
              update((ds) => addTag(ds, [day.date], tagDraft))
              setTagDraft('')
            }}
          >
            <label>
              Étiquette <input value={tagDraft} onChange={(e) => setTagDraft(e.target.value)} placeholder="projet, thème, lieu…" />
            </label>
            <button type="submit" className="carto-btn carto-btn--quiet">
              Ajouter
            </button>
          </form>
          {day.tags.map((tag) => (
            <button key={tag} type="button" className="carto-btn carto-btn--quiet" onClick={() => update((ds) => removeTag(ds, tag, [day.date]))}>
              Retirer « {tag} »
            </button>
          ))}
          {day.variants.length > 0 ? <VariantChooser day={day} update={update} /> : null}
          {v ? null : hasAnalysis(day) ? <p className="carto-muted carto-small">Cette journée ne contribue pas (variante à choisir ou « à examiner »).</p> : null}
        </div>
      </details>
    </li>
  )
}

/** Arbitrage radio des variantes d'une journée (V3 ArbitragePanel). */
export function VariantChooser({ day, update }) {
  const name = `carto-variant-${day.date}`
  const current = day.variantChoice === 'examine' ? '__examine__' : day.variantChoice === 'pending' ? null : day.activeVariantId
  return (
    <fieldset className="carto-variants">
      <legend>Analyse qui contribue — {formatShort(day.date)}</legend>
      {day.variants.map((v) => (
        <label key={v.id}>
          <input type="radio" name={name} checked={current === v.id} onChange={() => update((ds) => chooseVariant(ds, day.date, v.id))} />
          {provenanceLabel(v)}
        </label>
      ))}
      <label>
        <input type="radio" name={name} checked={current === '__examine__'} onChange={() => update((ds) => chooseVariant(ds, day.date, null))} /> À examiner (ne contribue pas)
      </label>
    </fieldset>
  )
}

/** Libellé de provenance d'une variante (modèle, prompt, date, source). */
export function provenanceLabel(v) {
  const p = v.provenance ?? {}
  const parts = [SOURCE_LABELS[p.source] ?? p.source ?? 'source inconnue']
  if (p.run) parts.push(p.run)
  if (p.model) parts.push(p.model)
  if (p.prompt) parts.push(p.prompt)
  if (p.analysedAt) parts.push(`analysée le ${String(p.analysedAt).slice(0, 10)}`)
  parts.push(`${v.verdicts.length} verdicts`)
  return parts.join(' — ')
}

export const SOURCE_LABELS = {
  'aurora-v3': 'Aurora v3',
  'aurora-core': 'AuroraCore',
  'site-jour': 'journée du site',
  'merge-v2': 'Merge v2',
  'site-merge': 'fusion du site',
  'v3-master': 'master V3',
  archive: 'archive',
}

function ArbitrationSection({ days, update }) {
  return (
    <section className="carto-section carto-section--alert" aria-label="Journées à arbitrer">
      <h3>
        {days.length} journée{days.length > 1 ? 's' : ''} à arbitrer
      </h3>
      <p className="carto-small">Plusieurs analyses existent pour ces dates : choisissez celle qui contribue, ou « à examiner ». Elles ne s’additionnent jamais.</p>
      {days.map((d) => (
        <VariantChooser key={d.date} day={d} update={update} />
      ))}
    </section>
  )
}

function UndatedSection({ dataset, commitWithDetails, update }) {
  const undated = dataset.portfolio?.undated ?? []
  const [dates, setDates] = useState({})
  if (undated.length === 0) return null
  return (
    <section className="carto-section carto-section--alert" aria-label="Passages du portfolio sans date">
      <h3>
        {undated.length} passage{undated.length > 1 ? 's' : ''} du portfolio sans date
      </h3>
      {undated.map((seg, i) => (
        <div key={i} className="carto-undated">
          <p className="carto-small">
            <strong>{seg.title ?? 'Sans titre'}</strong> — {seg.text.trim().slice(0, 140)}
            {seg.text.length > 140 ? '…' : ''}
          </p>
          <form
            className="carto-inline-form"
            onSubmit={async (e) => {
              e.preventDefault()
              const d = dates[i]
              if (!isIsoDate(d)) return
              await commitWithDetails(attachUndatedSegment(dataset, i, d))
              setDates({})
            }}
          >
            <label>
              Date <input type="date" value={dates[i] ?? ''} onChange={(e) => setDates((prev) => ({ ...prev, [i]: e.target.value }))} />
            </label>
            <button type="submit" className="carto-btn" disabled={!isIsoDate(dates[i])}>
              Rattacher
            </button>
            <TwoStepButton label="Écarter" confirmLabel="Confirmer" onConfirm={() => update((ds) => discardUndatedSegment(ds, i))} />
          </form>
        </div>
      ))}
    </section>
  )
}

export function TagsSection({ dataset, selected: given = null, update, bare = false }) {
  const [draft, setDraft] = useState('')
  const [renaming, setRenaming] = useState(null)
  const own = useSelected(dataset)
  const selected = given ?? own
  const tags = allTags(dataset)
  const counts = new Map(tags.map((tg) => [tg, dataset.days.filter((d) => d.tags.includes(tg)).length]))
  return (
    <Section title={`Étiquettes (${tags.length})`} bare={bare}>
      <form
        className="carto-inline-form"
        onSubmit={(e) => {
          e.preventDefault()
          if (!draft.trim() || selected.size === 0) return
          update((ds) => addTag(ds, [...selected], draft))
          setDraft('')
        }}
      >
        <label>
          Étiqueter les {selected.size} journée{selected.size > 1 ? 's' : ''} cochée{selected.size > 1 ? 's' : ''}
          <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="projet X, semestre 1…" />
        </label>
        <button type="submit" className="carto-btn" disabled={!draft.trim() || selected.size === 0}>
          Étiqueter
        </button>
      </form>
      <ul className="carto-tag-list">
        {tags.map((tg) => (
          <li key={tg}>
            {renaming?.from === tg ? (
              <form
                className="carto-inline-form"
                onSubmit={(e) => {
                  e.preventDefault()
                  update((ds) => renameTag(ds, tg, renaming.to))
                  setRenaming(null)
                }}
              >
                <input aria-label={`Nouveau nom pour « ${tg} »`} value={renaming.to} onChange={(e) => setRenaming({ from: tg, to: e.target.value })} />
                <button type="submit" className="carto-btn carto-btn--quiet">
                  Renommer
                </button>
              </form>
            ) : (
              <>
                <span className="carto-tag">{tg}</span> <span className="carto-count">{counts.get(tg)} j.</span>
                <button type="button" className="carto-btn carto-btn--quiet" onClick={() => update((ds) => selectExactly(ds, dataset.days.filter((d) => d.tags.includes(tg)).map((d) => d.date)))}>
                  Cocher ces journées
                </button>
                <button type="button" className="carto-btn carto-btn--quiet" onClick={() => setRenaming({ from: tg, to: tg })}>
                  Renommer
                </button>
                <TwoStepButton label="Retirer partout" confirmLabel="Confirmer" onConfirm={() => update((ds) => removeTag(ds, tg))} />
              </>
            )}
          </li>
        ))}
      </ul>
    </Section>
  )
}

export function SetsSection({ dataset, selected: given = null, update, bare = false }) {
  const own = useSelected(dataset)
  const selected = given ?? own
  const [name, setName] = useState('')
  const [kind, setKind] = useState('selection')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [tags, setTags] = useState([])
  const [freeze, setFreeze] = useState(false)
  const available = allTags(dataset)

  function definition() {
    if (kind === 'selection') return { kind: 'dates', dates: [...selected].sort() }
    if (kind === 'period') return { kind: 'period', from: from || null, to: to || null }
    return { kind: 'tags', tags, match: 'any' }
  }
  const canSave = name.trim() && (kind !== 'selection' || selected.size > 0) && (kind !== 'tags' || tags.length > 0) && (kind !== 'period' || from || to)

  return (
    <Section title={`Ensembles nommés (${dataset.sets.length})`} bare={bare}>
      <form
        className="carto-set-form"
        onSubmit={(e) => {
          e.preventDefault()
          if (!canSave) return
          update((ds) => saveSet(ds, { name, definition: definition(), freeze: kind !== 'selection' && freeze }))
          setName('')
        }}
      >
        <label>
          Nom <input value={name} onChange={(e) => setName(e.target.value)} placeholder="semestre 1, projet pont…" />
        </label>
        <fieldset>
          <legend>Contenu</legend>
          <label>
            <input type="radio" name="carto-set-kind" checked={kind === 'selection'} onChange={() => setKind('selection')} /> les {selected.size} journées cochées
          </label>
          <label>
            <input type="radio" name="carto-set-kind" checked={kind === 'period'} onChange={() => setKind('period')} /> une période
          </label>
          <label>
            <input type="radio" name="carto-set-kind" checked={kind === 'tags'} onChange={() => setKind('tags')} disabled={available.length === 0} /> une ou des étiquettes
          </label>
        </fieldset>
        {kind === 'period' ? (
          <div className="carto-inline-form">
            <label>
              du <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </label>
            <label>
              au <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </label>
          </div>
        ) : null}
        {kind === 'tags' ? (
          <div className="carto-tag-pick">
            {available.map((tg) => (
              <label key={tg}>
                <input type="checkbox" checked={tags.includes(tg)} onChange={(e) => setTags((prev) => (e.target.checked ? [...prev, tg] : prev.filter((x) => x !== tg)))} /> {tg}
              </label>
            ))}
          </div>
        ) : null}
        {kind !== 'selection' ? (
          <label className="carto-small">
            <input type="checkbox" checked={freeze} onChange={(e) => setFreeze(e.target.checked)} /> figer les journées d’aujourd’hui (les imports futurs n’y entreront pas)
          </label>
        ) : null}
        <button type="submit" className="carto-btn" disabled={!canSave}>
          Enregistrer l’ensemble
        </button>
      </form>
      <ul className="carto-set-list">
        {dataset.sets.map((s) => {
          const dates = resolveSetDates(s, dataset)
          return (
            <li key={s.id}>
              <strong>{s.name}</strong> <span className="carto-count">{dates.length} j.</span>
              <span className="carto-small carto-muted"> {s.frozenDates ? 'figé — ' : ''}{describeDefinition(s.definition)}</span>
              <span className="carto-set-actions">
                <button type="button" className="carto-btn carto-btn--quiet" onClick={() => update((ds) => selectExactly(ds, dates))}>
                  Cocher ces journées
                </button>
                <TwoStepButton onConfirm={() => update((ds) => deleteSet(ds, s.id))} />
              </span>
            </li>
          )
        })}
      </ul>
    </Section>
  )
}

export function DatasetSection({ dataset, datasets = [], onOpenDataset, onDeleteDataset, bare = false }) {
  return (
    <Section title="Jeux de données" bare={bare}>
      {datasets.length > 1 ? (
        <label className="carto-select">
          Ouvrir
          <select value={dataset.datasetId} onChange={(e) => onOpenDataset?.(e.target.value)}>
            {datasets.map((d) => (
              <option key={d.datasetId} value={d.datasetId}>
                {d.title} ({d.dayCount} j.)
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <p className="carto-small carto-muted">
        Référentiel : {dataset.referential.label}. Tout est enregistré dans ce navigateur (IndexedDB) ; l’export JSON en garde une copie.
      </p>
      <TwoStepButton label={`Supprimer « ${dataset.title} » de ce navigateur`} confirmLabel="Confirmer : tout supprimer" onConfirm={() => onDeleteDataset?.(dataset.datasetId)} />
    </Section>
  )
}
