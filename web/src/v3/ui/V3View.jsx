// Interface V3 de cartographie ipsative — vue principale (#/cartographie).
// Spec : prototype cartographies/specifications-fonctionnelles-interface-v3.md.
//
// Remplace l'interface de consultation précédente (#/merge) : mêmes données de
// démonstration (corpus de 59 journées), mais arbre + soleil + heatmap +
// portfolio + animation SYNCHRONISÉS, métriques versionnées et explicables,
// droit de réponse, projets de partage par liste positive et vue employeur.
// Tout est CLIENT-FIRST (ADR-001) : le master privé vit dans le navigateur.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { loadPublishedReferentiel } from '../../data/referentiel.js'
import { normalizeReferential } from '../core/referentiel.js'
import { importJourDocuments, chooseVariant, summarizeReport } from '../core/import.js'
import { computeEvents } from '../core/events.js'
import { metricForPrecision, sunValues } from '../core/metrics.js'
import { reviewEvidenceLink, annotate, applyExpertJson } from '../core/master.js'
import { newShareProject, setLinkShared } from '../core/share.js'
import { openShareSnapshot } from '../core/reimport.js'
import { inventoryZip } from '../core/zip.js'
import {
  initialState, availablePanels, renderedPanels, switchMode, selectScope, clearScope,
  inspectDay, setPlayhead, play, pause, effectiveExpandedTreeNodeIds, ALL_PANELS,
} from '../core/state.js'
import { TreePanel, SunPanel, HeatmapPanel, TimelineBar, PortfolioPanel, LegendPanel, StatsPanel } from './panels.jsx'
import { TileGrid } from './tile-grid.jsx'
import { WhyRadiusDialog, ComparePanel, ImportReportPanel, ArbitragePanel, JsonEditorPanel } from './tools.jsx'
import { ShareBuilder, EmployerView } from './share-ui.jsx'
import '../v3.css'

const PANEL_LABELS = {
  tree: 'Arbre', sun: 'Soleil', heatmap: 'Heatmap', timeline: 'Timeline', legend: 'Légende',
  stats: 'Indicateurs', comparison: 'Comparaison', portfolio: 'Portfolio',
  importAudit: 'Audit d’import', jsonEditor: 'Éditeur JSON', shareInspector: 'Partage',
}

const TILES_STORAGE_KEY = 'humanome-v3-tiles-expert'

/** Tailles par défaut des tuiles du mode expert (l × h sur la grille). */
const DEFAULT_TILE_SIZES = {
  tree: { w: 1, h: 3 },
  sun: { w: 2, h: 2 },
  heatmap: { w: 2, h: 1 },
  timeline: { w: 99, h: 1 }, // pleine largeur
  comparison: { w: 2, h: 1 },
  stats: { w: 1, h: 1 },
  legend: { w: 1, h: 1 },
  portfolio: { w: 2, h: 2 },
  importAudit: { w: 1, h: 2 },
  jsonEditor: { w: 2, h: 2 },
  shareInspector: { w: 2, h: 2 },
}

/** Charge le corpus de démonstration (59 journées réelles du site). */
async function loadDemoCorpus(fetchFn) {
  const index = await (await fetchFn('data/demo/jours/index.json')).json()
  const days = await Promise.all(
    index.map(async (e) => ({
      run: 'démonstration',
      sourceDate: e.date,
      payload: await (await fetchFn(`data/demo/jours/${e.date}.json`)).json(),
    })),
  )
  return days
}

export default function V3View({ deps = {} }) {
  const fetchFn = deps.fetchFn ?? ((...a) => fetch(...a))
  const getReferentiel = deps.getReferentiel ?? loadPublishedReferentiel
  const [referential, setReferential] = useState(null)
  const [master, setMaster] = useState(null)
  const [report, setReport] = useState([])
  const [ui, setUi] = useState(() => initialState({ audience: 'learner' }))
  const [project, setProject] = useState(null)
  const [previewSnapshot, setPreviewSnapshot] = useState(null)
  const [openedShare, setOpenedShare] = useState(null) // fichier employeur réimporté
  const [why, setWhy] = useState(null)
  const [status, setStatus] = useState('Chargement du référentiel…')
  const fileRef = useRef(null)

  // Disposition des tuiles du mode expert : préférence de présentation (§14.4),
  // persistée à part des données d'évaluation.
  const [tileLayout, setTileLayout] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(TILES_STORAGE_KEY)) ?? { order: [], sizes: {} }
    } catch {
      return { order: [], sizes: {} }
    }
  })
  const saveTileLayout = useCallback((layout) => {
    setTileLayout(layout)
    try {
      localStorage.setItem(TILES_STORAGE_KEY, JSON.stringify(layout))
    } catch {
      /* stockage indisponible : la disposition reste en mémoire */
    }
  }, [])

  // Référentiel versionné (obligatoire, §6.3) puis corpus de démonstration.
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const loaded = await getReferentiel()
        const ref = normalizeReferential(loaded?.doc ?? loaded)
        if (!alive) return
        setReferential(ref)
        setStatus('Chargement du corpus de démonstration…')
        const entries = await loadDemoCorpus(fetchFn)
        if (!alive) return
        const { master: m, report: r } = importJourDocuments(entries, { referential: ref })
        setMaster(m)
        setReport(r)
        setStatus(null)
      } catch (err) {
        if (alive) setStatus(`Chargement impossible : ${err?.message ?? err}`)
      }
    })()
    return () => {
      alive = false
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // --- Instantané unique consommé par toutes les vues (§3.3) ----------------
  const snapshot = useMemo(() => {
    if (!master || !referential) return null
    const events = computeEvents(master)
    const metric = metricForPrecision('day')
    const sun = sunValues(events.daysByCompetency, { playheadDay: ui.playheadDay, metric })
    return {
      metric,
      sun,
      admissible: events.admissible,
      needsReview: events.needsReview,
      datesByCompetency: events.daysByCompetency,
      competenciesByDate: events.competenciesByDate,
      annotations: master.annotations,
    }
  }, [master, referential, ui.playheadDay])

  // --- Panneaux (§14) --------------------------------------------------------
  const audience = openedShare ? 'employer' : previewSnapshot && ui.audience === 'preview' ? 'preview' : 'learner'
  const available = availablePanels({ format: { temporalPrecision: 'day' }, audience, interfaceMode: ui.interfaceMode })
  const rendered = renderedPanels(ui.visiblePanels, available)
  const reinforced = ui.colorVisionSupport === 'reinforced'
  const reducedMotion = ui.motionPreference === 'reduced' ||
    (ui.motionPreference === 'system' && typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches)

  // --- Animation temporelle (§13.5) : d'une journée admissible à la suivante -
  useEffect(() => {
    if (!ui.playback.playing || !snapshot) return undefined
    const dates = [...snapshot.competenciesByDate.keys()].sort()
    if (dates.length === 0) return undefined
    const t = setInterval(() => {
      setUi((s) => {
        const cur = s.playheadDay ?? dates[dates.length - 1]
        const i = dates.indexOf(cur)
        const next = dates[i + s.playback.direction]
        if (!next) return pause(s)
        return { ...s, playheadDay: next }
      })
    }, (reducedMotion ? 900 : 700) / ui.playback.speed)
    return () => clearInterval(t)
  }, [ui.playback, snapshot, reducedMotion])

  // --- Actions ----------------------------------------------------------------
  const toggleBranch = useCallback((id) => {
    setUi((s) => {
      const manual = new Set(s.manuallyExpandedTreeNodeIds)
      manual.has(id) ? manual.delete(id) : manual.add(id)
      return { ...s, manuallyExpandedTreeNodeIds: manual }
    })
  }, [])

  const doSelectScope = useCallback((nodeId, opts = {}) => {
    setUi((s) => {
      let next = nodeId === null ? clearScope(s) : selectScope(s, nodeId)
      if ('viewport' in opts) next = { ...next, sunViewportNodeId: opts.viewport }
      if (nodeId?.startsWith('comp-')) {
        // Révélation temporaire du chemin (ne ferme jamais une branche manuelle §12).
        const code = nodeId.slice(5)
        const familyNum = code.split('.')[0]
        next = { ...next, temporarilyRevealedTreeNodeIds: new Set([`family-${familyNum}`]) }
      }
      return next
    })
  }, [])

  const doReview = useCallback((linkId, state) => {
    setMaster((m) => reviewEvidenceLink(m, linkId, state))
  }, [])

  const doAnnotate = useCallback((observationId, fields) => {
    setMaster((m) => annotate(m, { targetType: 'observation', targetId: observationId, ...fields }))
  }, [])

  const doToggleShare = useCallback((linkId, shared) => {
    setProject((p) => {
      const base = p ?? newShareProject({ master, name: 'Partage' })
      return setLinkShared(base, master, linkId, shared)
    })
  }, [master])

  async function handleImportFiles(files) {
    if (!files?.length || !referential) return
    setStatus('Import en cours…')
    const entries = []
    const newReport = []
    for (const file of files) {
      const bytes = new Uint8Array(await file.arrayBuffer())
      try {
        if (file.name.endsWith('.zip')) {
          const m = file.name.match(/(\d{4}-\d{2}-\d{2})\.zip$/)
          const inv = await inventoryZip(bytes, { fallbackRun: 'import' })
          for (const e of inv.entries) entries.push(m && !e.sourceDate ? { ...e, sourceDate: m[1] } : e)
          newReport.push(...inv.report)
        } else {
          const parsed = JSON.parse(new TextDecoder().decode(bytes))
          if (parsed.kind === 'competency-map-share') {
            const res = openShareSnapshot(parsed)
            if (res.ok) setOpenedShare(res.snapshot)
            else newReport.push({ severity: 'blocking', code: 'integrite', message: res.error })
            continue
          }
          if (parsed.kind === 'competency-map-master') {
            setMaster(parsed)
            newReport.push({ severity: 'info', code: 'master-charge', message: 'Master V3 chargé (révision existante)' })
            continue
          }
          if (Array.isArray(parsed.poles) && parsed.date) {
            entries.push({ run: 'import', sourceDate: parsed.date, payload: parsed })
          } else if (parsed.poleNum != null) {
            const date = window.prompt('Date de la journée analysée (AAAA-MM-JJ) — jamais devinée depuis dateGeneration :')
            entries.push({ run: 'import', sourceDate: date ?? '', payload: { date, poles: [parsed] } })
          } else {
            newReport.push({ severity: 'blocking', code: 'schema-inconnu', message: `${file.name} : format non reconnu` })
          }
        }
      } catch (err) {
        newReport.push({ severity: 'blocking', code: 'fichier-invalide', message: `${file.name} : ${err.message}` })
      }
    }
    if (entries.length > 0) {
      const { master: m, report: r } = importJourDocuments(entries, { referential })
      setMaster(m)
      setProject(null)
      newReport.push(...r)
    }
    setReport(newReport)
    setStatus(null)
    setUi((s) => ({ ...s, visiblePanels: new Set([...s.visiblePanels, 'importAudit']) }))
  }

  // --- Rendu -------------------------------------------------------------------
  if (status) {
    return (
      <div className="v3-root" data-surface={ui.surfaceTheme}>
        <p role="status">{status}</p>
      </div>
    )
  }

  // Vue employeur (fichier réimporté) : lecture seule, rien d'autre (§20).
  if (openedShare) {
    return (
      <div className="v3-root" data-surface={ui.surfaceTheme} data-vision={ui.colorVisionSupport}>
        <div className="v3-context-bar" role="toolbar" aria-label="Barre de contexte">
          <strong>Cartographie partagée (lecture seule)</strong>
          <button type="button" onClick={() => setOpenedShare(null)}>Fermer</button>
        </div>
        <EmployerView snapshot={openedShare} />
      </div>
    )
  }

  const summary = summarizeReport(report)
  const shareStatus = project ? { linkIds: new Set(project.allowed.evidenceLinkIds) } : { linkIds: new Set() }

  return (
    <div
      className={`v3-root v3-mode-${ui.interfaceMode}`}
      data-surface={ui.surfaceTheme}
      data-vision={ui.colorVisionSupport}
    >
      {/* Barre de contexte : TOUJOURS accessible (§14.3) */}
      <div className="v3-context-bar" role="toolbar" aria-label="Barre de contexte">
        <strong>Cartographie ipsative</strong>
        <span className="v3-note">
          {ui.activeScopeNodeId ? `Filtre : ${ui.activeScopeNodeId}` : 'Toutes les compétences'} ·
          audience {audience === 'learner' ? 'apprenant (privé)' : audience} ·
          {ui.playheadDay ? ` tête de lecture ${ui.playheadDay}` : ' état complet'}
        </span>
        {ui.activeScopeNodeId ? <button type="button" onClick={() => setUi(clearScope)}>Toutes les compétences</button> : null}
        {!rendered.has('timeline') && ui.playback.playing ? (
          <button type="button" onClick={() => setUi(pause)}>⏸ Pause</button>
        ) : null}
        {!rendered.has('portfolio') && ui.inspection ? (
          <button type="button" onClick={() => setUi((s) => ({ ...s, visiblePanels: new Set([...s.visiblePanels, 'portfolio']) }))}>
            Réouvrir le portfolio ({ui.inspection.day})
          </button>
        ) : null}
        <label>
          Mode{' '}
          <select value={ui.interfaceMode} onChange={(e) => setUi((s) => switchMode(s, e.target.value))}>
            <option value="simplified">Simplifié</option>
            <option value="expert">Expert</option>
          </select>
        </label>
        <label>
          Surface{' '}
          <select value={ui.surfaceTheme} onChange={(e) => setUi((s) => ({ ...s, surfaceTheme: e.target.value }))}>
            <option value="system">Système</option>
            <option value="light">Clair</option>
            <option value="dark">Sombre</option>
          </select>
        </label>
        <label>
          <input
            type="checkbox"
            checked={reinforced}
            onChange={(e) => setUi((s) => ({ ...s, colorVisionSupport: e.target.checked ? 'reinforced' : 'standard' }))}
          />{' '}
          Renforcer les distinctions (daltonisme)
        </label>
        <button type="button" onClick={() => window.print()}>Aperçu avant impression</button>
        <details className="v3-panels-menu">
          <summary>Panneaux</summary>
          <ul>
            {ALL_PANELS.filter((p) => available.has(p)).map((p) => (
              <li key={p}>
                <label>
                  <input
                    type="checkbox"
                    checked={ui.visiblePanels.has(p)}
                    onChange={(e) => {
                      setUi((s) => {
                        const v = new Set(s.visiblePanels)
                        e.target.checked ? v.add(p) : v.delete(p)
                        return { ...s, visiblePanels: v }
                      })
                    }}
                  />{' '}
                  {PANEL_LABELS[p]}
                </label>
              </li>
            ))}
            <li>
              <button type="button" onClick={() => setUi((s) => ({ ...s, visiblePanels: new Set(ALL_PANELS) }))}>
                Réafficher les panneaux
              </button>
            </li>
          </ul>
        </details>
        <button type="button" onClick={() => fileRef.current?.click()}>Importer…</button>
        <input
          ref={fileRef}
          type="file"
          accept=".json,.zip"
          multiple
          hidden
          onChange={(e) => handleImportFiles([...e.target.files])}
        />
        {summary.blocking + summary.arbitrate > 0 ? (
          <span className="v3-badge" role="status">{summary.blocking + summary.arbitrate} anomalie(s) à traiter</span>
        ) : null}
      </div>

      {previewSnapshot ? (
        <div className="v3-preview-wrap">
          <div className="v3-context-bar">
            <strong>Prévisualisation employeur</strong>
            <button type="button" onClick={() => setPreviewSnapshot(null)}>Revenir à l’espace privé</button>
          </div>
          <EmployerView snapshot={previewSnapshot} isPreview />
        </div>
      ) : (
        <V3Panels
          rendered={rendered}
          interfaceMode={ui.interfaceMode}
          tileLayout={tileLayout}
          onTileLayout={saveTileLayout}
          panels={{
            tree: rendered.has('tree') ? (
              <TreePanel
                referential={referential}
                snapshot={snapshot}
                uiState={{ ...ui, effectiveExpanded: effectiveExpandedTreeNodeIds(ui) }}
                onToggleBranch={toggleBranch}
                onSelectScope={(id) => doSelectScope(id)}
                onSelectLeaf={(code, date) => {
                  doSelectScope(`comp-${code}`)
                  setUi((s) => inspectDay(s, { day: date, source: 'tree', pinnedCompetencyIds: [code] }))
                }}
              />
            ) : null,
            sun: rendered.has('sun') ? (
              <SunPanel
                referential={referential}
                snapshot={snapshot}
                uiState={ui}
                reinforced={reinforced}
                onSelectScope={(id, opts) => doSelectScope(id, opts)}
                onClearScope={() => setUi(clearScope)}
                onWhy={setWhy}
                onHover={(code) => setUi((s) => ({ ...s, hoverPreview: code }))}
              />
            ) : null,
            heatmap: rendered.has('heatmap') ? (
              <HeatmapPanel
                snapshot={snapshot}
                uiState={ui}
                referential={referential}
                reinforced={reinforced}
                onInspect={(date) => setUi((s) => inspectDay(s, { day: date, source: 'heatmap' }))}
                onSetPlayhead={(date) => setUi((s) => setPlayhead(s, date))}
                onChangeYear={(y) => setUi((s) => ({ ...s, visibleHeatmapPeriod: y }))}
              />
            ) : null,
            timeline: rendered.has('timeline') ? (
              <TimelineBar
                snapshot={snapshot}
                uiState={ui}
                reducedMotion={reducedMotion}
                onSetPlayhead={(d) => setUi((s) => setPlayhead(s, d))}
                onPlay={(dir) => setUi((s) => play(s, dir))}
                onPause={() => setUi(pause)}
                onStep={(delta) => {
                  const dates = [...snapshot.competenciesByDate.keys()].sort()
                  setUi((s) => {
                    const cur = s.playheadDay ?? dates[dates.length - 1]
                    const i = Math.max(0, Math.min(dates.length - 1, dates.indexOf(cur) + delta))
                    return setPlayhead(s, dates[i])
                  })
                }}
                onSpeed={(speed) => setUi((s) => ({ ...s, playback: { ...s.playback, speed } }))}
              />
            ) : null,
            comparison: rendered.has('comparison') ? (
              <ComparePanel
                snapshot={snapshot}
                uiState={ui}
                referential={referential}
                onSetBaseline={(day, mode) => setUi((s) => ({ ...s, baselineDay: day, comparisonMode: mode }))}
                onClearBaseline={() => setUi((s) => ({ ...s, baselineDay: null, comparisonMode: null }))}
              />
            ) : null,
            stats: rendered.has('stats') ? <StatsPanel snapshot={snapshot} /> : null,
            legend: rendered.has('legend') ? <LegendPanel referential={referential} reinforced={reinforced} /> : null,
            portfolio: rendered.has('portfolio') ? (
              <PortfolioPanel
                snapshot={snapshot}
                master={master}
                uiState={ui}
                referential={referential}
                audience={audience}
                shareStatus={shareStatus}
                onReview={doReview}
                onAnnotate={doAnnotate}
                onToggleShare={doToggleShare}
                onPin={(pinned) => setUi((s) => ({ ...s, inspection: { ...s.inspection, portfolioPinned: pinned } }))}
                onSelectScope={doSelectScope}
              />
            ) : null,
            importAudit: rendered.has('importAudit') ? (
              <>
                <ImportReportPanel report={report} />
                <ArbitragePanel master={master} onChooseVariant={(dayId, variantId) => setMaster((m) => chooseVariant(m, dayId, variantId))} />
              </>
            ) : null,
            jsonEditor: rendered.has('jsonEditor') ? (
              <JsonEditorPanel master={master} onApply={(candidate) => {
                const res = applyExpertJson(master, candidate)
                if (res.ok) setMaster(res.master)
                return res
              }} />
            ) : null,
            shareInspector: rendered.has('shareInspector') || ui.interfaceMode === 'simplified' ? (
              <details className="v3-panel v3-share-details" open={rendered.has('shareInspector')}>
                <summary>Préparer un partage</summary>
                <ShareBuilder
                  master={master}
                  project={project ?? newShareProject({ master, name: 'Partage' })}
                  referential={referential}
                  onProjectChange={setProject}
                  onPreview={(snap) => setPreviewSnapshot(snap)}
                />
              </details>
            ) : null,
          }}
        />
      )}


      {why ? (
        <WhyRadiusDialog
          code={why}
          referential={referential}
          snapshot={snapshot}
          uiState={ui}
          audience={audience}
          onClose={() => setWhy(null)}
          onInspect={(date) => {
            setUi((s) => inspectDay(s, { day: date, source: 'why' }))
            setWhy(null)
          }}
        />
      ) : null}

      {/* Équivalent textuel du soleil (accessibilité §21 + impression §15.4). */}
      <table className="v3-sun-table">
        <caption>Tableau équivalent au soleil — journées documentées par compétence</caption>
        <thead>
          <tr><th scope="col">Compétence</th><th scope="col">Famille</th><th scope="col">Journées documentées</th></tr>
        </thead>
        <tbody>
          {referential.competencies
            .filter((c) => (snapshot.sun.get(c.code)?.count ?? 0) > 0)
            .map((c) => (
              <tr key={c.code}>
                <td>{c.code} — {c.name}</td>
                <td>{referential.familyByNum.get(c.familyNum)?.name}</td>
                <td>{snapshot.sun.get(c.code).count}</td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  )
}

/**
 * Dispose les panneaux selon le mode : GRILLE DE TUILES éditable en expert
 * (glisser-déposer + tailles prédéterminées, colonnes adaptées à la largeur —
 * téléphone, tablette, moniteur 4K/8K), disposition simple bornée en simplifié.
 */
function V3Panels({ rendered, interfaceMode, tileLayout, onTileLayout, panels }) {
  if (interfaceMode === 'expert') {
    const tiles = Object.entries(panels)
      .filter(([, node]) => node !== null)
      .map(([id, node]) => ({ id, label: PANEL_LABELS[id] ?? id, node }))
    return (
      <TileGrid
        tiles={tiles}
        layout={tileLayout}
        onLayoutChange={onTileLayout}
        defaultSizes={DEFAULT_TILE_SIZES}
      />
    )
  }
  return (
    <div className="v3-layout">
      {panels.tree}
      <div className="v3-center">
        {panels.sun}
        {panels.heatmap}
        {panels.timeline}
        {panels.comparison}
      </div>
      <div className="v3-side">
        {panels.stats}
        {panels.legend}
        {panels.portfolio}
        {panels.importAudit}
        {panels.jsonEditor}
        {panels.shareInspector}
      </div>
    </div>
  )
}
