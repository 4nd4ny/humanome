// Interface ultime de cartographie — application (spec §2) : cinq espaces
// autour d'un état partagé unique. Chaîne de commande :
//   gestionnaire (cases cochées = ensemble S) → heatmap (date t) → soleil (état(S, t)).
// Routes (journal D-2) : #/cartographie, #/cartographie/gestionnaire,
// #/cartographie/comparaison, #/cartographie/tableau-de-bord,
// #/cartographie/dialogue (dialogue d'accompagnement scripté, P7),
// #/cartographie/export, #/cartographie/partage (phase 2 : adultes, compte
// apprenant, module activé par configuration), #/cartographie/jour/<date>.

import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react'
import { useCartoData } from './useCartoData.js'
import { computeState, layoutSun } from '../core/state.js'
import { buildHeatmap, datesObserving, dayCodes } from '../core/heatmap.js'
import { resolveParams, ringGeometry } from '../core/formulas.js'
import { contributingVariant, todoCount } from '../core/model.js'
import { selectExactly, setPreferences } from '../core/ops.js'
import { dateRange, formatShort, schoolYearOf } from '../core/dates.js'
import { Sun, SunTable } from './Sun.jsx'
import { HeatmapPanel } from './HeatmapPanel.jsx'
import { CompetencyList } from './CompetencyList.jsx'
import { DetailPanel } from './DetailPanel.jsx'
import { DayModal } from './DayModal.jsx'
import { WhyDialog } from './WhyDialog.jsx'
import { Player, usePrefersReducedMotion } from './Player.jsx'
import { Manager } from './Manager.jsx'
import { ImportPanel, ImportReport } from './ImportPanel.jsx'
import { PortfolioReader } from './PortfolioReader.jsx'
import { DayVerdictDetail, ObservationDays, TraceList, verdictDetailOf } from './Observations.jsx'
import { PoleReports } from './PoleReports.jsx'
import { DayKairos, EvolutiveNarratives } from './Narratives.jsx'
import { usePrintExpand } from './print.js'
import { ComparePanel } from './ComparePanel.jsx'
import { Dashboard } from './Dashboard.jsx'
import { ExportPanel } from './ExportPanel.jsx'
import { SharePanel } from './SharePanel.jsx'
import { DialoguePanel } from './DialoguePanel.jsx'
import { createShareApi } from './shareApi.js'
import { normalizeShareConfig } from '../core/share.js'
import './carto.css'

export const SPACES = [
  ['cartographie', 'Cartographie', '#/cartographie'],
  ['gestionnaire', 'Gestionnaire', '#/cartographie/gestionnaire'],
  ['comparaison', 'Comparaison', '#/cartographie/comparaison'],
  ['tableau-de-bord', 'Tableau de bord', '#/cartographie/tableau-de-bord'],
  ['dialogue', 'Dialogue', '#/cartographie/dialogue'],
  ['export', 'Export', '#/cartographie/export'],
  ['partage', 'Partage', '#/cartographie/partage'],
]

const GEOMETRY = ringGeometry({ outerRadius: 190, centerRadius: 30, gap: 5 })

const initialUi = {
  t: null,
  selection: null,
  hover: null,
  dayFilter: null,
  focusDate: null,
  mobileTab: 'diagram',
  why: false,
  expert: false,
  reader: null, // cible du lecteur de portfolio (trace ou passage)
}

function reducer(state, action) {
  switch (action.type) {
    case 'setT':
      return { ...state, t: action.t }
    case 'select':
      return { ...state, selection: action.selection }
    case 'hover':
      return { ...state, hover: action.hover }
    case 'focusDate':
      return { ...state, focusDate: action.date }
    case 'dayFilter':
      return { ...state, dayFilter: action.filter }
    case 'tab':
      return { ...state, mobileTab: action.tab }
    case 'why':
      return { ...state, why: action.open }
    case 'expert':
      return { ...state, expert: action.on }
    case 'openReader':
      return { ...state, reader: action.target }
    case 'readerIndex':
      return state.reader?.kind === 'trace' ? { ...state, reader: { ...state.reader, index: action.index } } : state
    case 'closeReader':
      return { ...state, reader: null }
    case 'reset':
      return { ...initialUi, expert: state.expert }
    default:
      return state
  }
}

const go = (hash) => {
  if (typeof window !== 'undefined') window.location.hash = hash
}

/**
 * @param {{route?: {sub?: string | null, date?: string, focus?: string | null},
 *   deps?: {store?: object, fetchFn?: typeof fetch, loadReferential?: () => Promise<{doc: object}>,
 *     share?: {serverEnabled?: boolean, adultOnly?: boolean}, shareApi?: object},
 *   session?: {roles?: string[]},
 *   slots?: Record<string, (ctx: object) => React.ReactNode>}} props
 *   slots : espaces fournis par les phases suivantes (comparaison, tableau de bord, export…)
 *   deps.share : module de partage (spec §12.2) — absent ou serverEnabled faux, l'espace
 *   n'existe pas ; session.roles : il n'est offert qu'à un compte apprenant connecté.
 *   deps.llm : relances facultatives du dialogue (P7) par un modèle de langage — absent,
 *   le dialogue reste entièrement scripté et local (copie autonome).
 */
export default function CartoApp({ route = {}, deps = {}, slots = {}, mode = 'site', session = null }) {
  const viewer = mode === 'viewer'
  const data = useCartoData(deps)
  const shareConfig = useMemo(() => normalizeShareConfig(deps.share), [deps.share])
  const canShare = !viewer && shareConfig.serverEnabled && (session?.roles ?? []).includes('apprenant')
  const shareApi = useMemo(() => deps.shareApi ?? createShareApi(deps.fetchFn ? { fetchFn: deps.fetchFn } : {}), [deps.shareApi, deps.fetchFn])
  const [ui, dispatch] = useReducer(reducer, initialUi)
  const rootRef = useRef(null)
  usePrintExpand(rootRef)
  const space = route.sub === 'jour' || !route.sub ? 'cartographie' : route.sub
  const modalDate = route.sub === 'jour' ? route.date : null
  const { dataset, ref: refl } = data

  // Changer de jeu de données remet l'interface à zéro.
  useEffect(() => {
    dispatch({ type: 'reset' })
  }, [dataset?.datasetId])

  const prefs = dataset?.preferences
  const params = useMemo(() => resolveParams(prefs?.params ?? {}), [prefs?.params])
  const reducedMotion = usePrefersReducedMotion(prefs?.reducedMotion ?? 'system')

  const frames = useMemo(
    () => (dataset ? dataset.days.filter((d) => d.active && contributingVariant(d)).map((d) => d.date) : []),
    [dataset],
  )
  const activeDates = useMemo(() => (dataset ? dataset.days.filter((d) => d.active).map((d) => d.date) : []), [dataset])

  const state = useMemo(() => (dataset && refl ? computeState(dataset, { ref: refl, until: ui.t, params }) : null), [dataset, refl, ui.t, params])
  const layout = useMemo(() => (state ? layoutSun(state, refl, GEOMETRY, { minThickness: params.minThicknessPx, minArc: params.minArcPx }) : null), [state, refl, params])

  const allDates = useMemo(() => (dataset ? dataset.days.map((d) => d.date) : []), [dataset])
  const span = useMemo(() => dateRange(allDates), [allDates])
  const schoolYear = prefs?.schoolYearStart ?? Number(schoolYearOf(span?.to ?? new Date().toISOString().slice(0, 10)).start.slice(0, 4))
  const period = useMemo(() => {
    if (prefs?.calendarMode === 'free') return prefs.freeRange ?? span ?? { from: `${schoolYear}-08-01`, to: `${schoolYear + 1}-07-31` }
    return { from: `${schoolYear}-08-01`, to: `${schoolYear + 1}-07-31` }
  }, [prefs?.calendarMode, prefs?.freeRange, span, schoolYear])

  const heat = useMemo(() => (dataset && refl ? buildHeatmap(dataset, { ref: refl, period, params }) : null), [dataset, refl, period, params])

  const observed = useMemo(() => {
    if (!dataset || !ui.selection) return null
    if (ui.selection.type === 'competency') return datesObserving(dataset, ui.selection.code)
    const codes = refl.codesByPole.get(ui.selection.num) ?? []
    const out = new Set()
    for (const c of codes) for (const d of datesObserving(dataset, c)) out.add(d)
    return out
  }, [dataset, refl, ui.selection])

  const setT = useCallback((t) => dispatch({ type: 'setT', t }), [])
  const select = useCallback((selection) => dispatch({ type: 'select', selection }), [])
  const hover = useCallback((h) => dispatch({ type: 'hover', hover: h }), [])
  const openDay = useCallback((date, code) => go(`#/cartographie/jour/${date}${code ? `?focus=${encodeURIComponent(code)}` : ''}`), [])
  const closeDay = useCallback(() => go('#/cartographie'), [])
  const onPrefs = useCallback((patch) => data.update((ds) => setPreferences(ds, patch)), [data])
  const openTrace = useCallback((code, list, index) => dispatch({ type: 'openReader', target: { kind: 'trace', code, list, index } }), [])
  const openPassage = useCallback(({ date, extract, label }) => dispatch({ type: 'openReader', target: { kind: 'passage', date, extract, label } }), [])
  const closeReader = useCallback(() => dispatch({ type: 'closeReader' }), [])
  const showSourceSet = useCallback(
    (dates) => {
      data.update((ds) => selectExactly(ds, dates))
      setT(null)
    },
    [data, setT],
  )

  // Détails par journée nécessaires au panneau de détail (chargement paresseux).
  const { ensureDetails, ensureRunDetail, getDetail, getRunDetail } = data
  const selectionDates = useMemo(() => {
    if (!state) return []
    if (ui.selection?.type === 'competency') return state.competencies.get(ui.selection.code)?.days ?? []
    if (ui.selection?.type === 'pole') {
      const out = new Set()
      for (const code of state.poles.get(ui.selection.num)?.codes ?? []) for (const d of state.competencies.get(code).days) out.add(d)
      return [...out].sort()
    }
    return state.dates.slice(-1)
  }, [state, ui.selection])
  useEffect(() => {
    if (selectionDates.length > 0) ensureDetails(selectionDates)
  }, [selectionDates, ensureDetails])
  useEffect(() => {
    if (modalDate) ensureDetails([modalDate])
  }, [modalDate, ensureDetails])

  // Délibérations de run (AuroraCore) de la sélection et de la compétence en focus de la modale.
  const runKeys = useMemo(() => {
    const keys = new Set()
    if (!dataset) return []
    const byDate = new Map(dataset.days.map((d) => [d.date, d]))
    if (ui.selection?.type === 'competency' && state) {
      for (const v of state.competencies.get(ui.selection.code)?.verdicts ?? []) {
        const vd = verdictDetailOf(getDetail, v.date, v.variantId, ui.selection.code)
        if (vd?.runRef) keys.add(vd.runRef)
      }
    }
    if (ui.selection?.type === 'pole') {
      for (const d of selectionDates) {
        const variant = contributingVariant(byDate.get(d))
        const runId = getDetail(d)?.variants?.[variant?.id]?.runId
        if (runId) keys.add(`${runId}|pole:${ui.selection.num}`)
      }
    }
    if (modalDate && route.focus) {
      const variant = contributingVariant(byDate.get(modalDate))
      const vd = variant ? verdictDetailOf(getDetail, modalDate, variant.id, route.focus) : null
      if (vd?.runRef) keys.add(vd.runRef)
    }
    return [...keys]
  }, [dataset, state, ui.selection, selectionDates, modalDate, route.focus, getDetail])
  useEffect(() => {
    for (const k of runKeys) ensureRunDetail(k)
  }, [runKeys, ensureRunDetail])

  const onHeatmapSetT = useCallback(
    (date) => {
      setT(date)
      const day = dataset?.days.find((d) => d.date === date)
      dispatch({ type: 'dayFilter', filter: day ? { date, codes: dayCodes(day) } : null })
    },
    [dataset, setT],
  )

  // Raccourcis : w = « Pourquoi cette surface ? », Échap = désélection.
  useEffect(() => {
    function onKey(e) {
      const tag = e.target?.tagName
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag) || e.target?.isContentEditable || e.ctrlKey || e.metaKey || e.altKey) return
      if (e.key === 'Escape' && ui.reader) {
        dispatch({ type: 'closeReader' })
        return
      }
      if (modalDate || ui.why) return
      if (e.key === 'w' && ui.selection) {
        e.preventDefault()
        dispatch({ type: 'why', open: true })
      } else if (e.key === 'Escape' && ui.selection) {
        select(null)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [modalDate, ui.why, ui.selection, ui.reader, select])

  if (data.status === 'loading') {
    return (
      <div className="carto-app carto-app--center" aria-busy="true">
        <p role="status">Ouverture de vos cartographies…</p>
      </div>
    )
  }

  if (data.status === 'empty' || !dataset || !refl) {
    return <Onboarding data={data} />
  }

  const ctx = { data, dataset, refl, ui, dispatch, state, layout, params, geometry: GEOMETRY, frames, activeDates, heat, period, openDay, setT, select }

  return (
    <div ref={rootRef} className={`carto-app carto-tab-${ui.mobileTab}${ui.reader ? ' has-reader' : ''}`}>
      <ContextBar dataset={dataset} state={state} t={ui.t} activeCount={activeDates.length} expert={ui.expert} viewer={viewer} onExpert={(on) => dispatch({ type: 'expert', on })} onResetT={() => setT(null)} />
      <nav className="carto-spaces" aria-label="Espaces de la cartographie">
        {SPACES.filter(([id]) => !(viewer && id === 'export') && (id !== 'partage' || canShare)).map(([id, label, hash]) => (
          <a key={id} href={hash} aria-current={space === id ? 'page' : undefined}>
            {label}
            {id === 'gestionnaire' && todoCount(dataset) > 0 ? <span className="carto-dot" aria-label={`${todoCount(dataset)} anomalies à traiter`} /> : null}
          </a>
        ))}
      </nav>
      {data.error ? (
        <p role="alert" className="carto-error carto-banner">
          {data.error}{' '}
          <button type="button" className="carto-btn carto-btn--quiet" onClick={() => data.setError(null)}>
            Fermer
          </button>
        </p>
      ) : null}

      {space === 'cartographie' ? (
        <>
          <div className="carto-tabs" role="tablist" aria-label="Vues (écran étroit)">
            {[
              ['diagram', 'Diagramme'],
              ['details', 'Détails'],
              ['days', 'Journées'],
            ].map(([id, label]) => (
              <button key={id} type="button" role="tab" aria-selected={ui.mobileTab === id} onClick={() => dispatch({ type: 'tab', tab: id })}>
                {label}
              </button>
            ))}
          </div>
          <div className="carto-grid">
            <aside className="carto-col carto-col-left" aria-label="Journées et compétences">
              <details className="carto-col-section" open>
                <summary>Journées</summary>
                <Manager
                  dataset={dataset}
                  refl={refl}
                  t={ui.t}
                  readOnly={viewer}
                  layout="side"
                  update={data.update}
                  commitWithDetails={data.commitWithDetails}
                  importInto={data.importInto}
                  busy={data.busy}
                  lastReport={data.lastReport}
                  onCloseReport={() => data.setLastReport(null)}
                  datasets={data.datasets}
                  onOpenDataset={data.openDataset}
                  onDeleteDataset={data.deleteDataset}
                  onSetT={onHeatmapSetT}
                  onOpenDay={openDay}
                />
              </details>
              <details className="carto-col-section" open>
                <summary>Compétences</summary>
                <CompetencyList
                  refl={refl}
                  state={state}
                  selection={ui.selection}
                  dayFilter={ui.dayFilter}
                  onSelect={select}
                  onOpenDay={openDay}
                  onClearDayFilter={() => dispatch({ type: 'dayFilter', filter: null })}
                />
              </details>
            </aside>
            <section className="carto-col carto-col-center" aria-label="Soleil et heatmap">
              <Sun
                refl={refl}
                state={state}
                layout={layout}
                geometry={GEOMETRY}
                selection={ui.selection}
                hover={ui.hover}
                reinforced={Boolean(prefs.reinforced)}
                highlightCodes={ui.dayFilter?.codes ?? null}
                caption={ui.t ? `État cumulé jusqu’au ${formatShort(ui.t)}` : 'État complet des journées cochées'}
                onSelect={select}
                onHover={hover}
              />
              <div className="carto-sun-options">
                <label className="carto-small">
                  <input type="checkbox" checked={Boolean(prefs.reinforced)} onChange={(e) => onPrefs({ reinforced: e.target.checked })} /> distinctions renforcées (motifs par pôle)
                </label>
              </div>
              <Player
                frames={frames}
                t={ui.t}
                onSetT={setT}
                hold={Boolean(ui.selection || ui.hover)}
                reducedMotion={reducedMotion}
                speed={prefs.speed ?? 1}
                onSpeed={(speed) => onPrefs({ speed })}
              />
              <HeatmapPanel
                model={heat}
                prefs={prefs}
                period={period}
                schoolYear={schoolYear}
                t={ui.t}
                focusDate={ui.focusDate}
                observed={observed}
                inspected={modalDate}
                markers={dataset.markers}
                onPrefs={onPrefs}
                onFocusDate={(d) => dispatch({ type: 'focusDate', date: d })}
                onSetT={onHeatmapSetT}
                onOpenDay={openDay}
              />
              <SunTable refl={refl} state={state} />
            </section>
            <aside className="carto-col carto-col-right" aria-label="Détail">
              <DetailPanel
                refl={refl}
                dataset={dataset}
                state={state}
                selection={ui.selection}
                t={ui.t}
                onSelect={select}
                onOpenDay={openDay}
                onWhy={() => dispatch({ type: 'why', open: true })}
              >
                <SelectionDetails
                  dataset={dataset}
                  state={state}
                  selection={ui.selection}
                  t={ui.t}
                  data={data}
                  selectionDates={selectionDates}
                  onOpenDay={openDay}
                  onOpenTrace={openTrace}
                  onOpenPassage={openPassage}
                  onShowSourceSet={showSourceSet}
                />
                {slots.detail ? slots.detail(ctx) : null}
              </DetailPanel>
              {ui.expert ? <EncodingSettings params={params} onPrefs={onPrefs} prefs={prefs} /> : null}
            </aside>
          </div>
        </>
      ) : space === 'gestionnaire' ? (
        <Manager
          dataset={dataset}
          refl={refl}
          t={ui.t}
          readOnly={viewer}
          layout="full"
          update={data.update}
          commitWithDetails={data.commitWithDetails}
          importInto={data.importInto}
          busy={data.busy}
          lastReport={data.lastReport}
          onCloseReport={() => data.setLastReport(null)}
          datasets={data.datasets}
          onOpenDataset={data.openDataset}
          onDeleteDataset={data.deleteDataset}
          onSetT={(d) => {
            onHeatmapSetT(d)
            go('#/cartographie')
          }}
          onOpenDay={openDay}
        />
      ) : space === 'comparaison' && !slots.comparaison ? (
        <ComparePanel dataset={dataset} refl={refl} params={params} geometry={GEOMETRY} t={ui.t} update={data.update} onOpenDay={openDay} />
      ) : space === 'tableau-de-bord' && !slots['tableau-de-bord'] ? (
        <Dashboard
          dataset={dataset}
          refl={refl}
          state={state}
          params={params}
          getDetail={getDetail}
          ensureDetails={ensureDetails}
          update={data.update}
          onOpenDay={openDay}
          onOpenTrace={openTrace}
        />
      ) : space === 'export' && !slots.export ? (
        viewer ? (
          <p className="carto-muted carto-pad">L’export n’est pas disponible dans une copie autonome.</p>
        ) : (
          <ExportPanel
            dataset={dataset}
            refl={refl}
            state={state}
            layout={layout}
            geometry={GEOMETRY}
            params={params}
            t={ui.t}
            data={data}
            fetchFn={deps.fetchFn}
            onOpenDataset={() => go('#/cartographie')}
          />
        )
      ) : space === 'dialogue' && !slots.dialogue ? (
        <DialoguePanel
          dataset={dataset}
          refl={refl}
          state={state}
          data={data}
          params={params}
          readOnly={viewer}
          llm={viewer ? null : deps.llm ?? null}
          onOpenDay={openDay}
          onOpenPassage={openPassage}
        />
      ) : space === 'partage' && !slots.partage ? (
        canShare ? (
          <SharePanel refl={refl} state={state} data={data} t={ui.t} api={shareApi} config={shareConfig} />
        ) : (
          <p className="carto-muted carto-pad">
            {viewer
              ? 'Le partage n’est pas disponible dans une copie autonome.'
              : !shareConfig.serverEnabled
                ? 'Le partage par lien n’est pas activé sur ce site : votre cartographie reste dans ce navigateur.'
                : 'Le partage par lien est réservé aux comptes apprenants connectés, et aux adultes. Tout le reste fonctionne sans compte, dans ce navigateur.'}
            {!viewer && shareConfig.serverEnabled ? (
              <>
                {' '}
                <a href="#/compte">Se connecter</a>
              </>
            ) : null}
          </p>
        )
      ) : slots[space] ? (
        slots[space](ctx)
      ) : (
        <p className="carto-muted carto-pad">Cet espace arrive dans une prochaine étape.</p>
      )}

      {modalDate ? (
        <DayModal
          date={modalDate}
          dataset={dataset}
          refl={refl}
          params={params}
          geometry={GEOMETRY}
          activeDates={frames}
          focusCode={route.focus ?? null}
          reinforced={Boolean(prefs.reinforced)}
          onClose={closeDay}
          onNavigate={(d) => openDay(d, route.focus ?? undefined)}
          trapActive={!ui.reader}
          renderVerdict={(v, variant) => (
            <DayVerdictDetail
              v={v}
              variant={variant}
              date={modalDate}
              dataset={dataset}
              getDetail={getDetail}
              getRunDetail={getRunDetail}
              ensureRunDetail={ensureRunDetail}
              update={data.update}
              onOpenTrace={openTrace}
              onOpenPassage={openPassage}
            />
          )}
        >
          {slots.day ? (dayCtx) => slots.day({ ...ctx, ...dayCtx }) : undefined}
        </DayModal>
      ) : null}
      {ui.why && ui.selection ? (
        <WhyDialog
          refl={refl}
          state={state}
          selection={ui.selection}
          layout={layout}
          onClose={() => dispatch({ type: 'why', open: false })}
          onOpenDay={(d, code) => {
            dispatch({ type: 'why', open: false })
            openDay(d, code)
          }}
        />
      ) : null}
      {ui.reader ? (
        <PortfolioReader
          target={ui.reader}
          dataset={dataset}
          refl={refl}
          getDetail={getDetail}
          ensureDetails={ensureDetails}
          reducedMotion={reducedMotion}
          onClose={closeReader}
          onIndex={(index) => dispatch({ type: 'readerIndex', index })}
          onBackToCompetency={(code) => {
            dispatch({ type: 'closeReader' })
            if (modalDate) closeDay()
            select({ type: 'competency', code })
            dispatch({ type: 'tab', tab: 'details' })
          }}
        />
      ) : null}
    </div>
  )
}

/**
 * Sections du panneau de détail qui lisent les détails par journée (P2) :
 * traces, verdicts, jury, droit de réponse (compétence) ; rapports et
 * passages (pôle) ; portrait kairos et synthèses évolutives (profil).
 */
function SelectionDetails({ dataset, state, selection, t, data, selectionDates, onOpenDay, onOpenTrace, onOpenPassage, onShowSourceSet }) {
  if (selection?.type === 'competency') {
    const comp = state.competencies.get(selection.code)
    return (
      <>
        {comp ? (
          <>
            <TraceList traces={comp.traces} code={selection.code} getDetail={data.getDetail} onOpenTrace={(i) => onOpenTrace(selection.code, comp.traces, i)} onOpenDay={onOpenDay} />
            <ObservationDays
              code={selection.code}
              comp={comp}
              dataset={dataset}
              t={t}
              getDetail={data.getDetail}
              getRunDetail={data.getRunDetail}
              update={data.update}
              onOpenDay={onOpenDay}
              onOpenPassage={onOpenPassage}
            />
          </>
        ) : null}
        <EvolutiveNarratives
          dataset={dataset}
          kind="competence-evolutive"
          scope={{ code: selection.code }}
          shownDates={state.dates}
          title="Synthèse évolutive de la compétence"
          onShowSourceSet={onShowSourceSet}
        />
      </>
    )
  }
  if (selection?.type === 'pole') {
    return (
      <>
        <EvolutiveNarratives dataset={dataset} kind="pole-evolutif" scope={{ pole: selection.num }} shownDates={state.dates} title="Synthèse évolutive du pôle" onShowSourceSet={onShowSourceSet} />
        <PoleReports num={selection.num} dates={selectionDates} dataset={dataset} getDetail={data.getDetail} getRunDetail={data.getRunDetail} onOpenPassage={onOpenPassage} />
      </>
    )
  }
  const last = state.dates.at(-1) ?? null
  const day = last ? dataset.days.find((d) => d.date === last) : null
  const variant = day ? contributingVariant(day) : null
  const kairos = last && variant ? data.getDetail(last)?.variants?.[variant.id]?.kairos ?? null : null
  return (
    <>
      <EvolutiveNarratives dataset={dataset} kind="kairos-evolutif" scope={{}} shownDates={state.dates} title="Synthèse évolutive (kairos)" onShowSourceSet={onShowSourceSet} />
      {kairos ? <DayKairos kairos={kairos} date={last} /> : null}
    </>
  )
}

function ContextBar({ dataset, state, t, activeCount, expert, viewer = false, onExpert, onResetT }) {
  const first = state.dates[0]
  const last = state.dates.at(-1)
  return (
    <header className="carto-context" aria-label="Contexte">
      <div className="carto-context-title">
        <h1>Cartographie</h1>
        <span className="carto-context-dataset">{dataset.title}</span>
      </div>
      <dl className="carto-context-facts">
        <div>
          <dt>Période</dt>
          <dd>{first ? `${formatShort(first)} → ${formatShort(last)}` : '—'}</dd>
        </div>
        <div>
          <dt>Date t</dt>
          <dd>
            {t ? formatShort(t) : 'état complet'}
            {t ? (
              <button type="button" className="carto-link-btn" onClick={onResetT}>
                revenir à l’état complet
              </button>
            ) : null}
          </dd>
        </div>
        <div>
          <dt>Ensemble actif</dt>
          <dd>
            {activeCount} / {dataset.days.length} journées cochées
          </dd>
        </div>
      </dl>
      <div className="carto-context-actions">
        <a className="carto-btn carto-btn--quiet" href="#/cartographie/comparaison">
          Comparer A / B
        </a>
        {viewer ? null : (
          <a className="carto-btn carto-btn--quiet" href="#/cartographie/export">
            Exporter
          </a>
        )}
        <label className="carto-small">
          <input type="checkbox" checked={expert} onChange={(e) => onExpert(e.target.checked)} /> mode expert
        </label>
      </div>
    </header>
  )
}

function EncodingSettings({ params, onPrefs, prefs }) {
  return (
    <details className="carto-section" open>
      <summary>Réglages de l’encodage</summary>
      <label className="carto-setting">
        Poids d’un indice α : <strong>{params.alpha.toLocaleString('fr-FR')}</strong>
        <input
          type="range"
          min={0.1}
          max={0.9}
          step={0.05}
          value={params.alpha}
          onChange={(e) => onPrefs({ params: { ...prefs.params, alpha: Number(e.target.value) } })}
        />
      </label>
      <label className="carto-setting">
        Épaisseur minimale d’un secteur : <strong>{params.minThicknessPx} px</strong>
        <input
          type="range"
          min={0}
          max={6}
          step={1}
          value={params.minThicknessPx}
          onChange={(e) => onPrefs({ params: { ...prefs.params, minThicknessPx: Number(e.target.value) } })}
        />
      </label>
      <p className="carto-small carto-muted">Points ouverts 1 et 2 de la spécification : valeurs proposées 0,5 et 2 px.</p>
    </details>
  )
}

function Onboarding({ data }) {
  return (
    <div className="carto-app carto-onboarding">
      <header className="carto-onboarding-head">
        <h1>Votre cartographie</h1>
        <p>
          Importez les analyses de votre portfolio et, si vous le souhaitez, le portfolio lui-même : la cartographie se construit ici, dans ce navigateur, et
          n’est envoyée nulle part.
        </p>
      </header>
      {data.error ? (
        <p role="alert" className="carto-error">
          {data.error}
        </p>
      ) : null}
      <ImportPanel onImport={(files) => data.importInto(files, { newDataset: true })} busy={data.busy} />
      {data.lastReport ? <ImportReport entries={data.lastReport.entries} onClose={() => data.setLastReport(null)} /> : null}
      <p className="carto-onboarding-demo">
        Pas encore de fichiers ?{' '}
        <button type="button" className="carto-btn" onClick={() => data.loadDemo()} disabled={Boolean(data.busy)}>
          Explorer la démonstration
        </button>
      </p>
    </div>
  )
}
