// Banc d'essai promptologue (P10.4).
//
// Sélection d'UNE version (publiée, ou MON brouillon — un brouillon ne tourne
// que chez son auteur : la liste vient de GET drafts qui ne renvoie que les
// miens), d'un portfolio de test (fixture 3 jours embarquée, ou portfolio
// local) et d'un fournisseur (service humanome — mock en dev — ou clé perso).
//
// Modes : run simple, multi-run de consistance (2..5 runs -> compareRuns),
// A/B entre deux versions (tableau comparatif + rapport JSON téléchargeable).

import { useEffect, useMemo, useRef, useState } from 'react'
import { segmentText } from '@engine/portfolio/segment.js'
import { getReferentiel } from '../../data/load.js'
import {
  BUILTIN_PACKAGE,
  PROVIDERS,
  buildEstimate,
  computeDayGroups,
  createProviderBundle,
} from '../../lib/run-launcher.js'
import { createPortfolioStore } from '../../lib/portfolio-store.js'
import { buildConsistencyView } from '../../lib/consistency-view.js'
import { normalizeDraftEntry } from './api.js'
import {
  buildAbReport,
  buildMultiRunReport,
  reportDataUrl,
  runVersionOnDays,
  summarizeDocument,
} from './bench.js'
import fixtureRaw from '../../../../schemas/fixtures/portfolio-3-jours.md?raw'

export const FIXTURE_LABEL = 'Fixture embarquée : Maya, 3 journées'

/** Journées de la fixture embarquée (segmentation du moteur). */
export function fixtureDayGroups() {
  const segments = segmentText(fixtureRaw).filter((seg) => seg.date !== null)
  return computeDayGroups(segments)
}

const RUN_COUNTS = [2, 3, 4, 5]

/**
 * @param {object} props
 * @param {object} props.api client createPromptologueApi
 * @param {object|null} props.user utilisateur connecté (auteur des brouillons)
 * @param {object} [props.deps] coutures de test : {portfolioStore, runFn,
 *   getReferentielFn, createBundleFn, sandboxRunner, extractDayFn}
 */
export default function BancEssaiSection({ api, user, deps = {} }) {
  const runFn = deps.runFn ?? runVersionOnDays
  const createBundleFn = deps.createBundleFn ?? createProviderBundle
  const getReferentielFn = deps.getReferentielFn ?? getReferentiel
  const portfolioStore = useMemo(
    () => deps.portfolioStore ?? createPortfolioStore(),
    [deps.portfolioStore],
  )

  const [versions, setVersions] = useState({ published: [], drafts: [] })
  const [portfolios, setPortfolios] = useState([])
  const [mode, setMode] = useState('simple') // 'simple' | 'multi' | 'ab'
  const [selA, setSelA] = useState('builtin')
  const [selB, setSelB] = useState('builtin')
  const [nRuns, setNRuns] = useState(2)
  const [portfolioChoice, setPortfolioChoice] = useState('fixture')
  const [providerMode, setProviderMode] = useState('humanome') // 'humanome' | 'cle'
  const [providerId, setProviderId] = useState(PROVIDERS[0].id)
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState('')
  const [running, setRunning] = useState(null) // {text}
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null) // {mode, ...}
  const abortRef = useRef(null)

  useEffect(() => {
    let alive = true
    Promise.all([
      api.listPublished().catch(() => []),
      // GET drafts renvoie des métadonnées ; le document de chaque brouillon
      // vient de GET drafts/{draftId} (« un brouillon AVEC document »).
      api
        .listDrafts()
        .then((list) =>
          Promise.all(
            (Array.isArray(list) ? list : [])
              .map((d) => d?.draftId)
              .filter((id) => id !== undefined && id !== null)
              .map((id) => api.getDraft(id).catch(() => null)),
          ),
        )
        .catch(() => []),
      portfolioStore.list().catch(() => []),
    ]).then(([published, drafts, records]) => {
      if (!alive) return
      setVersions({
        published: (Array.isArray(published) ? published : []).filter(
          (p) => typeof p?.id === 'string' && typeof p?.version === 'string',
        ),
        drafts: (Array.isArray(drafts) ? drafts : [])
          .map(normalizeDraftEntry)
          .filter((d) => d !== null && d.document !== null),
      })
      setPortfolios(records)
    })
    return () => {
      alive = false
    }
  }, [api, portfolioStore])

  /** Options du sélecteur de version : embarquée, publiées, MES brouillons. */
  const versionOptions = useMemo(() => {
    const options = [
      { key: 'builtin', label: `${BUILTIN_PACKAGE.id}@${BUILTIN_PACKAGE.version} (moteur embarqué)` },
      ...versions.published.map((p) => ({
        key: `pub:${p.id}@${p.version}`,
        label: `${p.id}@${p.version} (publiée)`,
      })),
      ...versions.drafts.map((d) => ({
        key: `draft:${d.draftId}`,
        label: `${d.document.id}@${d.document.version} (mon brouillon)`,
      })),
    ]
    return options
  }, [versions])

  /** Résout une clé de sélection en document prompt-package complet. */
  async function resolvePackage(key) {
    if (key === 'builtin') return BUILTIN_PACKAGE
    if (key.startsWith('draft:')) {
      const draft = versions.drafts.find((d) => `draft:${d.draftId}` === key)
      if (!draft) throw new Error('Brouillon introuvable (rechargez la page).')
      return draft.document
    }
    const m = /^pub:(.+)@([^@]+)$/.exec(key)
    if (!m) throw new Error(`Sélection invalide : ${key}`)
    const doc = await api.getPackage(m[1], m[2])
    return doc?.document ?? doc
  }

  async function resolveDayGroups() {
    if (portfolioChoice === 'fixture') {
      return { label: FIXTURE_LABEL, dayGroups: fixtureDayGroups() }
    }
    const record = portfolios.find((p) => String(p.id) === portfolioChoice)
    if (!record) throw new Error('Portfolio local introuvable.')
    const dayGroups = computeDayGroups(record.segments ?? [])
    if (dayGroups.length === 0) {
      throw new Error('Ce portfolio local n’a aucun segment daté.')
    }
    return { label: record.titre ?? 'Portfolio local', dayGroups }
  }

  function buildBundle() {
    return createBundleFn(
      providerMode === 'humanome'
        ? { mode: 'humanome' }
        : { mode: 'cle', provider: providerId, apiKey, model: model || undefined },
    )
  }

  async function execute() {
    setError(null)
    setResult(null)
    const controller = new AbortController()
    abortRef.current = controller
    try {
      const { label, dayGroups } = await resolveDayGroups()
      const bundle = buildBundle()
      const referentiel = getReferentielFn()
      const baseParams = {
        dayGroups,
        referentiel,
        provider: bundle.provider,
        model: bundle.model,
        maxTokens: bundle.maxTokens,
        signal: controller.signal,
        extractDayFn: deps.extractDayFn,
        sandboxRunner: deps.sandboxRunner,
        onProgress: ({ iso, position, total, calls }) =>
          setRunning({ text: `Jour ${position}/${total} (${iso}) — ${calls} appel(s) LLM` }),
      }
      if (bundle.prime) await bundle.prime()

      if (mode === 'simple') {
        setRunning({ text: 'Exécution…' })
        const run = await runFn({ ...baseParams, pkg: await resolvePackage(selA) })
        setResult({ mode: 'simple', label, run })
      } else if (mode === 'multi') {
        const pkg = await resolvePackage(selA)
        const runs = []
        for (let i = 0; i < nRuns; i++) {
          setRunning({ text: `Run ${i + 1}/${nRuns}…` })
          runs.push(await runFn({ ...baseParams, pkg }))
        }
        const competenceNames = Object.fromEntries(
          (referentiel.competences ?? []).map((c) => [c.code, c.nom]),
        )
        setResult({
          mode: 'multi',
          label,
          pkg: runs[0].pkg,
          report: buildMultiRunReport(runs),
          competenceNames,
        })
      } else {
        const [pkgA, pkgB] = await Promise.all([resolvePackage(selA), resolvePackage(selB)])
        setRunning({ text: 'Exécution de la version A…' })
        const runA = await runFn({ ...baseParams, pkg: pkgA })
        setRunning({ text: 'Exécution de la version B…' })
        const runB = await runFn({ ...baseParams, pkg: pkgB })
        const estimate = (() => {
          try {
            return buildEstimate({ dayGroups, referentiel, model: bundle.estimationModel })
          } catch {
            return null
          }
        })()
        const report = buildAbReport({
          portfolioLabel: label,
          a: runA,
          b: runB,
          estimates: { a: estimate, b: estimate },
        })
        setResult({ mode: 'ab', label, report })
      }
    } catch (err) {
      setError(err?.message ?? String(err))
    } finally {
      setRunning(null)
      abortRef.current = null
    }
  }

  const versionSelect = (value, onChange, label) => (
    <label className="promptologue-field">
      {label}
      <select value={value} onChange={(event) => onChange(event.target.value)} aria-label={label}>
        {versionOptions.map((o) => (
          <option key={o.key} value={o.key}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  )

  return (
    <div className="promptologue-banc">
      <h2>Banc d’essai</h2>
      <p className="privacy-note">
        Les brouillons listés sont les vôtres uniquement : un brouillon ne s’exécute que chez son
        auteur ; seules les versions publiées sont exécutables par autrui.
      </p>

      <fieldset>
        <legend>Mode</legend>
        <label>
          <input type="radio" checked={mode === 'simple'} onChange={() => setMode('simple')} /> Run
          simple
        </label>{' '}
        <label>
          <input type="radio" checked={mode === 'multi'} onChange={() => setMode('multi')} />{' '}
          Multi-run (consistance)
        </label>{' '}
        <label>
          <input type="radio" checked={mode === 'ab'} onChange={() => setMode('ab')} /> A/B (deux
          versions)
        </label>
      </fieldset>

      {versionSelect(selA, setSelA, mode === 'ab' ? 'Version A' : 'Version à tester')}
      {mode === 'ab' ? versionSelect(selB, setSelB, 'Version B') : null}
      {mode === 'multi' ? (
        <label className="promptologue-field">
          Nombre de runs
          <select
            value={nRuns}
            onChange={(event) => setNRuns(Number(event.target.value))}
            aria-label="Nombre de runs"
          >
            {RUN_COUNTS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <label className="promptologue-field">
        Portfolio de test
        <select
          value={portfolioChoice}
          onChange={(event) => setPortfolioChoice(event.target.value)}
          aria-label="Portfolio de test"
        >
          <option value="fixture">{FIXTURE_LABEL}</option>
          {portfolios.map((p) => (
            <option key={p.id} value={String(p.id)}>
              {p.titre ?? `Portfolio ${p.id}`} (local)
            </option>
          ))}
        </select>
      </label>

      <fieldset>
        <legend>Fournisseur LLM</legend>
        <label>
          <input
            type="radio"
            checked={providerMode === 'humanome'}
            onChange={() => setProviderMode('humanome')}
          />{' '}
          Service humanome (mock en développement)
        </label>{' '}
        <label>
          <input type="radio" checked={providerMode === 'cle'} onChange={() => setProviderMode('cle')} />{' '}
          Clé personnelle
        </label>
        {providerMode === 'cle' ? (
          <div className="promptologue-cle">
            <label>
              Fournisseur{' '}
              <select value={providerId} onChange={(event) => setProviderId(event.target.value)}>
                {PROVIDERS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>{' '}
            <label>
              Clé API{' '}
              <input
                type="password"
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                autoComplete="off"
              />
            </label>{' '}
            <label>
              Modèle (vide = défaut){' '}
              <input value={model} onChange={(event) => setModel(event.target.value)} />
            </label>
          </div>
        ) : null}
      </fieldset>

      <p>
        <button type="button" onClick={execute} disabled={running !== null}>
          Lancer
        </button>{' '}
        {running !== null ? (
          <button type="button" onClick={() => abortRef.current?.abort()}>
            Interrompre
          </button>
        ) : null}
      </p>

      {running ? <p role="status">{running.text}</p> : null}
      {error ? (
        <p role="alert" className="load-error">
          {error}
        </p>
      ) : null}

      {result?.mode === 'simple' ? <SimpleResult result={result} /> : null}
      {result?.mode === 'multi' ? <MultiRunResult result={result} /> : null}
      {result?.mode === 'ab' ? <AbResult result={result} /> : null}
    </div>
  )
}

function SimpleResult({ result }) {
  const { run, label } = result
  return (
    <section aria-label="Résultat du run" data-testid="banc-simple">
      <h3>
        {run.pkg.id}@{run.pkg.version} sur « {label} »
      </h3>
      <p>
        {run.days.length} journée(s), {run.llmCalls} appel(s) LLM, {Math.round(run.durationMs / 1000)}{' '}
        s — exécution {run.engine ? 'moteur embarqué' : 'sandbox'}.
      </p>
      <table className="promptologue-table">
        <thead>
          <tr>
            <th scope="col">Jour</th>
            <th scope="col">Établies</th>
            <th scope="col">Renvois cartographe</th>
          </tr>
        </thead>
        <tbody>
          {run.days.map(({ iso, document }) => {
            const resume = summarizeDocument(document)
            return (
              <tr key={iso}>
                <td>{iso}</td>
                <td>
                  {resume.etablies.length} — {resume.etablies.join(', ')}
                </td>
                <td>{resume.renvois.length}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </section>
  )
}

function MultiRunResult({ result }) {
  // Rendu partagé avec l'espace cartographe (chantier C) : le modèle
  // d'affichage vient de lib/consistency-view.js (accord %, badges).
  const { report, pkg, label, competenceNames } = result
  return (
    <section aria-label="Consistance multi-run" data-testid="banc-multi">
      <h3>
        Consistance : {report.nbRuns} runs de {pkg.id}@{pkg.version} sur « {label} »
      </h3>
      <p>
        Distance structurelle moyenne :{' '}
        <strong>{report.distanceMoyenne.toFixed(3)}</strong> (0 = runs identiques, 1 = désaccord
        maximal).
      </p>
      {report.parJour.map(({ iso, comparison }) => {
        const view = buildConsistencyView(comparison, { competenceNames })
        return (
          <details key={iso} open={report.parJour.length === 1}>
            <summary>
              {iso} — accord {view.accordPourcent} %, {view.stables.length} stable(s),{' '}
              {view.divergentes.length} divergente(s)
            </summary>
            <table className="promptologue-table">
              <thead>
                <tr>
                  <th scope="col">Compétence</th>
                  <th scope="col">Statuts observés</th>
                </tr>
              </thead>
              <tbody>
                {view.stables.map((item) => (
                  <tr key={item.code}>
                    <td>
                      {item.code}
                      {item.nom ? ` — ${item.nom}` : ''}
                    </td>
                    <td>
                      <span className={`verdict-badge ${item.badge}`}>{item.statut}</span> (tous
                      les runs)
                    </td>
                  </tr>
                ))}
                {view.divergentes.map((item) => (
                  <tr key={item.code}>
                    <td>
                      {item.code}
                      {item.nom ? ` — ${item.nom}` : ''}
                    </td>
                    <td>
                      {item.statuts.map((s, i) => (
                        <span key={i}>
                          <span className={`verdict-badge ${s.badge}`}>{s.label}</span> (run
                          {s.runs.length > 1 ? 's' : ''} {s.runs.join(', ')}){' '}
                        </span>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        )
      })}
    </section>
  )
}

function AbResult({ result }) {
  const { report } = result
  const { a, b } = report.versions
  return (
    <section aria-label="Comparaison A/B" data-testid="banc-ab">
      <h3>
        A/B : {a.version} vs {b.version}
      </h3>
      <table className="promptologue-table">
        <thead>
          <tr>
            <th scope="col"></th>
            <th scope="col">A — {a.version}</th>
            <th scope="col">B — {b.version}</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row">Compétences établies (total)</th>
            <td>{a.etabliesTotal}</td>
            <td>{b.etabliesTotal}</td>
          </tr>
          <tr>
            <th scope="row">Appels LLM</th>
            <td>{a.llmCalls}</td>
            <td>{b.llmCalls}</td>
          </tr>
          <tr>
            <th scope="row">Durée mesurée</th>
            <td>{Math.round(a.durationMs / 1000)} s</td>
            <td>{Math.round(b.durationMs / 1000)} s</td>
          </tr>
          <tr>
            <th scope="row">Estimation (coût / durée)</th>
            <td>
              {report.estimations.a
                ? `${report.estimations.a.costUsd ?? '?'} $ / ~${report.estimations.a.durationMin} min`
                : 'indisponible'}
            </td>
            <td>
              {report.estimations.b
                ? `${report.estimations.b.costUsd ?? '?'} $ / ~${report.estimations.b.durationMin} min`
                : 'indisponible'}
            </td>
          </tr>
        </tbody>
      </table>
      <h4>Par journée</h4>
      <table className="promptologue-table">
        <thead>
          <tr>
            <th scope="col">Jour</th>
            <th scope="col">Communes</th>
            <th scope="col">Seulement A</th>
            <th scope="col">Seulement B</th>
          </tr>
        </thead>
        <tbody>
          {report.parJour.map((row) => (
            <tr key={row.iso}>
              <td>{row.iso}</td>
              <td>{row.communes.join(', ') || '—'}</td>
              <td>{row.seulementA.join(', ') || '—'}</td>
              <td>{row.seulementB.join(', ') || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>
        <a
          href={reportDataUrl(report)}
          download={`rapport-ab-${a.version.replace(/[@/]/g, '_')}-vs-${b.version.replace(/[@/]/g, '_')}.json`}
        >
          Télécharger le rapport JSON
        </a>
      </p>
    </section>
  )
}
