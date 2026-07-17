// Banc d'essai promptologue (P10.4, refondu D15).
//
// Sélection d'UNE version (publiée, ou MON brouillon — un brouillon ne tourne
// que chez son auteur : la liste vient de GET drafts qui ne renvoie que les
// miens), d'un portfolio de test (fixture 3 jours embarquée, ou portfolio
// local), du PÉRIMÈTRE (journées : tout / une journée / une période ;
// référentiel : entier / un pôle / UNE compétence), de la VERSION du
// référentiel (embarquée ou publiée — les paquets à référentiel en dur sont
// signalés), et d'un fournisseur LLM PAR BRANCHE en A/B.
//
// Modes : run simple (téléchargeable, réimportable comme référence), multi-run
// de consistance (2..5 runs -> compareRuns), A/B entre deux versions —
// fournisseurs et référentiels éventuellement distincts —, et comparaison à
// une RÉFÉRENCE JSON importée. Les comparaisons produisent un diff de
// compétences avec traces de délibération du jury (CompetenceDiff).
//
// Carnet du banc (méta-page, carnet.js) : markdown éditable + configurations
// emblématiques rechargeables — stockage local, export/import JSON.

import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { restreindreReferentiel } from '@engine/pipeline/extract.js'
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
import { renderMarkdown } from '../../lib/md.js'
import { normalizeDraftEntry } from './api.js'
import {
  buildAbReport,
  buildCompetenceDiff,
  buildMultiRunReport,
  buildRunReport,
  detectReferentielEnDur,
  filterDayGroups,
  normalizeReferenceImport,
  reportDataUrl,
  runVersionOnDays,
  summarizeDocument,
  usesTwin6Engine,
} from './bench.js'
import {
  addConfig,
  exportCarnet,
  importCarnet,
  readCarnet,
  removeConfig,
  writeCarnet,
} from './carnet.js'
import CompetenceDiff from './CompetenceDiff.jsx'
import fixtureRaw from '../../../../schemas/fixtures/portfolio-3-jours.md?raw'

export const FIXTURE_LABEL = 'Fixture embarquée : Maya, 3 journées'

/** Twin6 produit une cartographie-merge globale (pas des documents par jour). */
export const TWIN6_MODE_NOTE =
  'Les paquets Twin6 produisent une cartographie globale (merge) sur le portfolio entier : ' +
  'seul le mode « Run simple » est disponible (les autres modes comparent des documents par jour).'

/** Journées de la fixture embarquée (segmentation du moteur). */
export function fixtureDayGroups() {
  const segments = segmentText(fixtureRaw).filter((seg) => seg.date !== null)
  return computeDayGroups(segments)
}

const RUN_COUNTS = [2, 3, 4, 5]

const EMBARQUE = 'embarque'

function emptyProviderChoice() {
  return { mode: 'humanome', provider: PROVIDERS[0].id, apiKey: '', model: '' }
}

/** Sélecteur de fournisseur LLM (réutilisé pour chaque branche en A/B). */
function ProviderPicker({ legend, value, onChange }) {
  const uid = useId() // name unique par instance : groupes radio corrects (a11y)
  const set = (patch) => onChange({ ...value, ...patch })
  return (
    <fieldset>
      <legend>{legend}</legend>
      <label>
        <input
          type="radio"
          name={`banc-prov-${uid}`}
          checked={value.mode === 'humanome'}
          onChange={() => set({ mode: 'humanome' })}
        />{' '}
        Service humanome (mock en développement)
      </label>{' '}
      <label>
        <input
          type="radio"
          name={`banc-prov-${uid}`}
          checked={value.mode === 'cle'}
          onChange={() => set({ mode: 'cle' })}
        />{' '}
        Clé personnelle
      </label>
      {value.mode === 'cle' ? (
        <div className="promptologue-cle">
          <label>
            Fournisseur{' '}
            <select value={value.provider} onChange={(event) => set({ provider: event.target.value })}>
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
              value={value.apiKey}
              onChange={(event) => set({ apiKey: event.target.value })}
              autoComplete="off"
            />
          </label>{' '}
          <label>
            Modèle (vide = défaut){' '}
            <input value={value.model} onChange={(event) => set({ model: event.target.value })} />
          </label>
        </div>
      ) : null}
    </fieldset>
  )
}

/**
 * @param {object} props
 * @param {object} props.api client createPromptologueApi
 * @param {object|null} props.user utilisateur connecté (auteur des brouillons)
 * @param {object} [props.deps] coutures de test : {portfolioStore, runFn,
 *   getReferentielFn, createBundleFn, sandboxRunner, extractDayFn,
 *   readFileTextFn, carnetStorage}
 */
export default function BancEssaiSection({ api, user, deps = {} }) {
  const runFn = deps.runFn ?? runVersionOnDays
  const createBundleFn = deps.createBundleFn ?? createProviderBundle
  const getReferentielFn = deps.getReferentielFn ?? getReferentiel
  const readFileTextFn = deps.readFileTextFn ?? ((file) => file.text())
  const portfolioStore = useMemo(
    () => deps.portfolioStore ?? createPortfolioStore(),
    [deps.portfolioStore],
  )

  const [versions, setVersions] = useState({ published: [], drafts: [] })
  const [portfolios, setPortfolios] = useState([])
  const [mode, setMode] = useState('simple') // 'simple' | 'multi' | 'ab' | 'reference'
  const [selA, setSelA] = useState('builtin')
  const [selB, setSelB] = useState('builtin')
  const [nRuns, setNRuns] = useState(2)
  const [portfolioChoice, setPortfolioChoice] = useState('fixture')
  const [daySel, setDaySel] = useState({ type: 'tous', jour: '', du: '', au: '' })
  const [perimetreChoice, setPerimetreChoice] = useState('tout')
  const [refVersions, setRefVersions] = useState([])
  const [refChoice, setRefChoice] = useState(EMBARQUE)
  const [refChoiceB, setRefChoiceB] = useState(EMBARQUE)
  const [dualRef, setDualRef] = useState(false)
  const [refDocA, setRefDocA] = useState(null)
  const [provA, setProvA] = useState(emptyProviderChoice)
  const [provB, setProvB] = useState(emptyProviderChoice)
  const [dualProvider, setDualProvider] = useState(false)
  const [temperature, setTemperature] = useState('')
  const [refImport, setRefImport] = useState(null) // {run, fileName}
  const [running, setRunning] = useState(null) // {text}
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null) // statut neutre (interruption…)
  const [result, setResult] = useState(null) // {mode, ...}
  const abortRef = useRef(null)

  // Carnet du banc (méta-page) — stockage local, jamais de clé API dedans.
  const [carnet, setCarnet] = useState(() => readCarnet(deps.carnetStorage))
  const [carnetEditing, setCarnetEditing] = useState(false)
  const [carnetDraft, setCarnetDraft] = useState('')
  const [carnetNom, setCarnetNom] = useState('')
  const [carnetNote, setCarnetNote] = useState('')
  const [carnetInfo, setCarnetInfo] = useState(null)

  function persistCarnet(next) {
    setCarnet(next)
    writeCarnet(next, deps.carnetStorage)
  }

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
      Promise.resolve()
        .then(() => api.listReferentielVersions())
        .catch(() => []),
    ]).then(([published, drafts, records, referentielVersions]) => {
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
      setRefVersions(
        (Array.isArray(referentielVersions) ? referentielVersions : []).filter(
          (v) => typeof v?.version === 'string',
        ),
      )
    })
    return () => {
      alive = false
    }
  }, [api, portfolioStore])

  // Document référentiel de la branche A : pilote les options de périmètre.
  useEffect(() => {
    let alive = true
    if (refChoice === EMBARQUE) {
      setRefDocA(getReferentielFn())
      return undefined
    }
    setRefDocA(null)
    Promise.resolve()
      .then(() => api.getReferentielVersion(refChoice))
      .then((data) => alive && setRefDocA(data?.document ?? data))
      .catch(() => alive && setRefDocA(null))
    return () => {
      alive = false
    }
  }, [refChoice, api, getReferentielFn])

  // Le périmètre choisi doit exister dans le référentiel affiché : changer de
  // version peut retirer un pôle ou une compétence — on retombe sur « entier »
  // plutôt que de laisser un sélecteur incohérent (et un run qui échouerait).
  useEffect(() => {
    if (perimetreChoice === 'tout' || refDocA === null) return
    const pole = /^pole:(\d+)$/.exec(perimetreChoice)
    const ok = pole
      ? (refDocA.poles ?? []).some((p) => String(p.num) === pole[1])
      : (refDocA.competences ?? []).some((c) => `comp:${c.code}` === perimetreChoice)
    if (!ok) setPerimetreChoice('tout')
  }, [refDocA, perimetreChoice])

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

  /** Journées disponibles pour le portfolio choisi (sélection du périmètre). */
  const availableDays = useMemo(() => {
    if (portfolioChoice === 'fixture') return fixtureDayGroups().map((g) => g.iso)
    const record = portfolios.find((p) => String(p.id) === portfolioChoice)
    return record ? computeDayGroups(record.segments ?? []).map((g) => g.iso) : []
  }, [portfolioChoice, portfolios])

  /** Avertissements « référentiel en dur » AVANT run (brouillons + Twin6). */
  const referentielHints = useMemo(() => {
    const keys = mode === 'ab' ? [selA, selB] : [selA]
    const hints = []
    for (const key of keys) {
      if (key.startsWith('draft:')) {
        const draft = versions.drafts.find((d) => `draft:${d.draftId}` === key)
        if (draft?.document) {
          const det = detectReferentielEnDur(draft.document)
          if (det.enDur) hints.push(`${draft.document.id}@${draft.document.version} : ${det.motif}`)
        }
      } else if (key.startsWith('pub:')) {
        // Le drapeau `reserved` de l'API désigne les paquets pipeline Twin6 ;
        // sans lui (API ancienne), le nom ne vaut qu'une PRÉSOMPTION — le
        // détecteur définitif tourne au lancement, sur le document complet.
        const entry = versions.published.find((p) => `pub:${p.id}@${p.version}` === key)
        if (entry?.reserved === true) {
          hints.push(
            `${entry.id}@${entry.version} : paquet Twin6 réservé — le référentiel est en dur dans les fiches embarquées, la version choisie ne pilote pas le contenu instruit.`,
          )
        } else if (entry?.reserved === undefined && key.includes('twin6')) {
          hints.push(
            `${key.slice(4)} : le nom suggère un paquet Twin6 (fiches embarquées) — l’alerte définitive sera posée au lancement, une fois le paquet chargé.`,
          )
        }
      }
    }
    return hints
  }, [mode, selA, selB, versions])

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

  /** Référentiel d'une branche : embarqué, ou version publiée via l'API. */
  async function resolveReferentiel(choice) {
    if (choice === EMBARQUE) return getReferentielFn()
    const data = await api.getReferentielVersion(choice)
    const doc = data?.document ?? data
    if (!doc || !Array.isArray(doc.poles)) {
      throw new Error(`Version du référentiel « ${choice} » indisponible.`)
    }
    return doc
  }

  /** Périmètre du référentiel : entier, un pôle, ou une compétence. */
  function resolvePerimetre() {
    if (perimetreChoice === 'tout') return undefined
    const pole = /^pole:(\d+)$/.exec(perimetreChoice)
    if (pole) return { poles: [Number(pole[1])] }
    const comp = /^comp:(.+)$/.exec(perimetreChoice)
    if (comp) return { competences: [comp[1]] }
    throw new Error(`Périmètre inconnu : ${perimetreChoice}`)
  }

  function buildBundle(prov) {
    return createBundleFn(
      prov.mode === 'humanome'
        ? { mode: 'humanome', onPhase: (phase) => setRunning({ text: `Préparation (${phase})…` }) }
        : { mode: 'cle', provider: prov.provider, apiKey: prov.apiKey, model: prov.model || undefined },
    )
  }

  /** Température saisie -> nombre (virgule décimale française acceptée). */
  function parseTemperature() {
    if (temperature.trim() === '') return undefined
    const value = Number(temperature.trim().replace(',', '.'))
    if (!Number.isFinite(value) || value < 0 || value > 2) {
      throw new Error('Température invalide : nombre entre 0 et 2 attendu (vide = défaut).')
    }
    return value
  }

  /** Description sérialisable d'une branche (rapport + traçabilité). */
  function describeBranch(versionKey, prov, bundle, referentielChoice) {
    return {
      version: versionKey,
      fournisseur: prov.mode === 'humanome' ? 'service humanome' : prov.provider,
      modele: bundle.model,
      referentiel: referentielChoice === EMBARQUE ? 'embarqué (RESPIRE v7)' : referentielChoice,
      perimetre: perimetreChoice,
      journees: daySel.type,
      ...(temperature.trim() !== ''
        ? { temperature: Number(temperature.trim().replace(',', '.')) }
        : {}),
    }
  }

  async function onReferenceFile(event) {
    const file = event.target.files?.[0]
    setRefImport(null)
    if (!file) return
    try {
      const text = await readFileTextFn(file)
      const run = normalizeReferenceImport(JSON.parse(text))
      setRefImport({ run, fileName: file.name })
      setError(null)
    } catch (err) {
      setError(err?.message ?? String(err))
    }
  }

  // Runs du mode multi déjà achevés (avec leur contexte d'affichage) :
  // conservés hors du try pour proposer un rapport partiel après interruption.
  const multiRunsRef = useRef(null)

  async function execute() {
    // Verrou SYNCHRONE anti double-clic : disabled={running} ne protège pas la
    // fenêtre avant le premier rendu (resolveReferentiel/prime sont des awaits).
    if (abortRef.current) return
    const controller = new AbortController()
    abortRef.current = controller
    setError(null)
    setNotice(null)
    setRunning({ text: 'Préparation…' })
    multiRunsRef.current = null
    try {
      const { label, dayGroups: allDays } = await resolveDayGroups()
      const dayGroups = filterDayGroups(allDays, daySel)
      const perimetre = resolvePerimetre()
      const temp = parseTemperature()
      const referentielA = await resolveReferentiel(refChoice)
      const referentielB =
        mode === 'ab' && dualRef ? await resolveReferentiel(refChoiceB) : referentielA
      // Pré-vol du périmètre sur CHAQUE référentiel : en A/B à double
      // référentiel, un code absent de la version B doit échouer ICI (message
      // clair), pas après que la branche A a consommé ses appels LLM.
      if (perimetre) {
        for (const [branche, referentiel, choix] of [
          ['A', referentielA, refChoice],
          ...(referentielB !== referentielA ? [['B', referentielB, refChoiceB]] : []),
        ]) {
          try {
            restreindreReferentiel(referentiel, perimetre)
          } catch {
            throw new Error(
              `Le périmètre choisi (« ${perimetreChoice} ») n’existe pas dans le référentiel ` +
                `de la branche ${branche} (${choix === EMBARQUE ? 'embarqué' : choix}) : ` +
                'choisissez un périmètre commun aux deux versions, ou « Référentiel entier ».',
            )
          }
        }
      }
      const bundleA = buildBundle(provA)
      const bundleB = mode === 'ab' && dualProvider ? buildBundle(provB) : bundleA
      const progressText = ({ iso, position, total, calls, phase }, prefix = '') => {
        if (phase) {
          const nom = phase === 'kairos' ? 'kairos' : 'scan pôle'
          return `${prefix}Phase ${position}/${total} (${nom}) — ${calls} appel(s) LLM`
        }
        return `${prefix}Jour ${position}/${total} (${iso}) — ${calls} appel(s) LLM`
      }
      const baseParams = {
        dayGroups,
        perimetre,
        temperature: temp,
        signal: controller.signal,
        extractDayFn: deps.extractDayFn,
        sandboxRunner: deps.sandboxRunner,
        onProgress: (info) => setRunning({ text: progressText(info) }),
      }
      if (bundleA.prime) await bundleA.prime()
      if (bundleB !== bundleA && bundleB.prime) await bundleB.prime()

      const competenceNames = Object.fromEntries(
        [...(referentielA.competences ?? []), ...(referentielB.competences ?? [])].map((c) => [
          c.code,
          c.nom,
        ]),
      )
      // Estimation fidèle à ce que le banc exécute VRAIMENT : référentiel
      // restreint au périmètre, appels/jour = pôles retenus (+ kairos si
      // périmètre entier), et JAMAIS de récits de fusion (mergeCalls: 0).
      const estimateFor = (bundle, referentiel) => {
        try {
          const restriction = perimetre
            ? restreindreReferentiel(referentiel, perimetre)
            : { referentiel, partiel: false }
          const poleCount = restriction.referentiel.poles.length
          return buildEstimate({
            dayGroups,
            referentiel: restriction.referentiel,
            model: bundle.estimationModel,
            callsPerDay: poleCount + (restriction.partiel ? 0 : 1),
            mergeCalls: 0,
          })
        } catch {
          return null
        }
      }

      if (mode === 'simple') {
        setRunning({ text: 'Exécution…' })
        const pkg = await resolvePackage(selA)
        const alertes = [detectReferentielEnDur(pkg)].filter((d) => d.enDur).map((d) => d.motif)
        const run = await runFn({
          ...baseParams,
          pkg,
          referentiel: referentielA,
          provider: bundleA.provider,
          model: bundleA.model,
          maxTokens: bundleA.maxTokens,
        })
        setResult({
          mode: 'simple',
          label,
          run,
          alertes,
          config: describeBranch(selA, provA, bundleA, refChoice),
        })
      } else if (mode === 'multi') {
        const pkg = await resolvePackage(selA)
        if (usesTwin6Engine(pkg)) throw new Error(TWIN6_MODE_NOTE)
        const alertes = [detectReferentielEnDur(pkg)].filter((d) => d.enDur).map((d) => d.motif)
        const salvage = { runs: [], label, competenceNames }
        multiRunsRef.current = salvage
        const runs = salvage.runs
        for (let i = 0; i < nRuns; i++) {
          const prefix = `Run ${i + 1}/${nRuns} — `
          setRunning({ text: `${prefix}exécution…` })
          runs.push(
            await runFn({
              ...baseParams,
              onProgress: (info) => setRunning({ text: progressText(info, prefix) }),
              pkg,
              referentiel: referentielA,
              provider: bundleA.provider,
              model: bundleA.model,
              maxTokens: bundleA.maxTokens,
            }),
          )
        }
        setResult({
          mode: 'multi',
          label,
          pkg: runs[0].pkg,
          report: buildMultiRunReport(runs),
          competenceNames,
          alertes,
        })
      } else if (mode === 'ab') {
        const [pkgA, pkgB] = await Promise.all([resolvePackage(selA), resolvePackage(selB)])
        if (usesTwin6Engine(pkgA) || usesTwin6Engine(pkgB)) throw new Error(TWIN6_MODE_NOTE)
        const alertes = [
          { pkg: pkgA, det: detectReferentielEnDur(pkgA) },
          { pkg: pkgB, det: detectReferentielEnDur(pkgB) },
        ]
          .filter((x) => x.det.enDur)
          .map((x) => `${x.pkg.id}@${x.pkg.version} : ${x.det.motif}`)
        setRunning({ text: 'Exécution de la version A…' })
        const runA = await runFn({
          ...baseParams,
          pkg: pkgA,
          referentiel: referentielA,
          provider: bundleA.provider,
          model: bundleA.model,
          maxTokens: bundleA.maxTokens,
        })
        setRunning({ text: 'Exécution de la version B…' })
        const runB = await runFn({
          ...baseParams,
          pkg: pkgB,
          referentiel: referentielB,
          provider: bundleB.provider,
          model: bundleB.model,
          maxTokens: bundleB.maxTokens,
        })
        const configs = {
          a: describeBranch(selA, provA, bundleA, refChoice),
          b: describeBranch(selB, dualProvider ? provB : provA, bundleB, dualRef ? refChoiceB : refChoice),
        }
        const report = buildAbReport({
          portfolioLabel: label,
          a: runA,
          b: runB,
          estimates: { a: estimateFor(bundleA, referentielA), b: estimateFor(bundleB, referentielB) },
          configs,
        })
        setResult({
          mode: 'ab',
          label,
          report,
          diff: buildCompetenceDiff(runA, runB),
          labels: { a: 'A', b: 'B' },
          competenceNames,
          alertes,
        })
      } else {
        // mode 'reference' : run A généré, côté B = JSON de référence importé.
        if (!refImport) {
          throw new Error('Importez d’abord un JSON de référence (côté B).')
        }
        const pkgA = await resolvePackage(selA)
        if (usesTwin6Engine(pkgA)) throw new Error(TWIN6_MODE_NOTE)
        const alertes = [detectReferentielEnDur(pkgA)].filter((d) => d.enDur).map((d) => d.motif)
        setRunning({ text: 'Exécution de la version testée…' })
        const runA = await runFn({
          ...baseParams,
          pkg: pkgA,
          referentiel: referentielA,
          provider: bundleA.provider,
          model: bundleA.model,
          maxTokens: bundleA.maxTokens,
        })
        const runB = refImport.run
        const generatedIsos = new Set(runA.days.map((d) => d.iso))
        if (!runB.days.some((d) => generatedIsos.has(d.iso))) {
          alertes.push(
            'Aucune journée commune entre le run généré et la référence importée : le diff liste chaque côté séparément.',
          )
        }
        const report = buildAbReport({
          portfolioLabel: label,
          a: runA,
          b: runB,
          estimates: { a: estimateFor(bundleA, referentielA), b: null },
          configs: {
            a: describeBranch(selA, provA, bundleA, refChoice),
            b: { version: 'référence importée', fichier: refImport.fileName },
          },
        })
        setResult({
          mode: 'ab',
          label,
          report,
          diff: buildCompetenceDiff(runA, runB),
          labels: { a: 'Généré', b: 'Référence' },
          competenceNames,
          alertes,
        })
      }
    } catch (err) {
      if (controller.signal.aborted) {
        // Interruption VOLONTAIRE : statut neutre, pas une erreur — et en
        // multi-run, les runs déjà achevés valent un rapport partiel.
        const salvage = multiRunsRef.current
        if (mode === 'multi' && salvage && salvage.runs.length >= 2) {
          setResult({
            mode: 'multi',
            label: salvage.label,
            pkg: salvage.runs[0].pkg,
            report: buildMultiRunReport(salvage.runs),
            competenceNames: salvage.competenceNames,
            alertes: [
              `Run interrompu : rapport partiel sur les ${salvage.runs.length} runs achevés.`,
            ],
          })
          setNotice('Run interrompu — rapport partiel affiché.')
        } else {
          setNotice('Run interrompu.')
        }
      } else {
        setError(err?.message ?? String(err))
      }
    } finally {
      setRunning(null)
      abortRef.current = null
    }
  }

  // ---- Carnet : configurations emblématiques -------------------------------

  function snapshotConfig() {
    return {
      mode,
      selA,
      selB,
      nRuns,
      portfolioChoice,
      daySelection: daySel,
      perimetre: perimetreChoice,
      referentiel: refChoice,
      referentielB: refChoiceB,
      dualRef,
      fournisseurA: { mode: provA.mode, provider: provA.provider, model: provA.model },
      fournisseurB: { mode: provB.mode, provider: provB.provider, model: provB.model },
      dualProvider,
      temperature,
    }
  }

  function applyConfig(config) {
    if (!config || typeof config !== 'object') return
    // Une configuration emblématique peut référencer des cibles disparues
    // (brouillon supprimé, portfolio local effacé, version de référentiel
    // retirée) : chaque référence introuvable retombe sur le défaut et est
    // SIGNALÉE — jamais de sélection silencieusement fausse.
    const reserves = []
    const pick = (value, valides, fallback, libelle) => {
      if (typeof value !== 'string' || value === '') return null
      if (valides.has(value)) return value
      reserves.push(`${libelle} « ${value} » introuvable`)
      return fallback
    }
    const versionKeys = new Set(versionOptions.map((o) => o.key))
    const portfolioKeys = new Set(['fixture', ...portfolios.map((p) => String(p.id))])
    const refKeys = new Set([EMBARQUE, ...refVersions.map((v) => v.version)])

    if (['simple', 'multi', 'ab', 'reference'].includes(config.mode)) setMode(config.mode)
    const selAValue = pick(config.selA, versionKeys, 'builtin', 'version')
    if (selAValue !== null) setSelA(selAValue)
    const selBValue = pick(config.selB, versionKeys, 'builtin', 'version')
    if (selBValue !== null) setSelB(selBValue)
    if (RUN_COUNTS.includes(config.nRuns)) setNRuns(config.nRuns)
    const portfolioValue = pick(config.portfolioChoice, portfolioKeys, 'fixture', 'portfolio')
    if (portfolioValue !== null) setPortfolioChoice(portfolioValue)
    if (config.daySelection && typeof config.daySelection === 'object') {
      // Les journées mémorisées doivent exister dans le portfolio appliqué.
      const applied = portfolioValue ?? portfolioChoice
      const record = portfolios.find((p) => String(p.id) === applied)
      const jours = new Set(
        (applied === 'fixture'
          ? fixtureDayGroups()
          : computeDayGroups(record?.segments ?? [])
        ).map((g) => g.iso),
      )
      const sel = { type: 'tous', jour: '', du: '', au: '', ...config.daySelection }
      const refsJours = [sel.jour, sel.du, sel.au].filter((j) => j !== '')
      if (sel.type !== 'tous' && refsJours.some((j) => !jours.has(j))) {
        reserves.push('journées mémorisées absentes du portfolio (sélection remise sur « tout »)')
        setDaySel({ type: 'tous', jour: '', du: '', au: '' })
      } else {
        setDaySel(sel)
      }
    }
    if (typeof config.perimetre === 'string') setPerimetreChoice(config.perimetre)
    const refValue = pick(config.referentiel, refKeys, EMBARQUE, 'référentiel')
    if (refValue !== null) setRefChoice(refValue)
    const refBValue = pick(config.referentielB, refKeys, EMBARQUE, 'référentiel B')
    if (refBValue !== null) setRefChoiceB(refBValue)
    setDualRef(config.dualRef === true)
    // Les clés API restent celles de la session : jamais dans le carnet.
    if (config.fournisseurA && typeof config.fournisseurA === 'object') {
      setProvA((prev) => ({
        ...prev,
        mode: config.fournisseurA.mode === 'cle' ? 'cle' : 'humanome',
        provider: typeof config.fournisseurA.provider === 'string' ? config.fournisseurA.provider : prev.provider,
        model: typeof config.fournisseurA.model === 'string' ? config.fournisseurA.model : '',
      }))
    }
    if (config.fournisseurB && typeof config.fournisseurB === 'object') {
      setProvB((prev) => ({
        ...prev,
        mode: config.fournisseurB.mode === 'cle' ? 'cle' : 'humanome',
        provider: typeof config.fournisseurB.provider === 'string' ? config.fournisseurB.provider : prev.provider,
        model: typeof config.fournisseurB.model === 'string' ? config.fournisseurB.model : '',
      }))
    }
    setDualProvider(config.dualProvider === true)
    if (typeof config.temperature === 'string') setTemperature(config.temperature)
    setCarnetInfo(
      reserves.length > 0
        ? `Configuration chargée avec réserves : ${reserves.join(' ; ')}.`
        : 'Configuration chargée.',
    )
  }

  function saveCurrentConfig() {
    try {
      const next = addConfig(carnet, { nom: carnetNom, note: carnetNote, config: snapshotConfig() })
      persistCarnet(next)
      setCarnetNom('')
      setCarnetNote('')
      setCarnetInfo(`Configuration « ${carnetNom.trim()} » mémorisée.`)
    } catch (err) {
      setCarnetInfo(err?.message ?? String(err))
    }
  }

  async function onCarnetImport(event) {
    const file = event.target.files?.[0]
    if (!file) return
    try {
      persistCarnet(importCarnet(await readFileTextFn(file)))
      setCarnetInfo(`Carnet importé depuis ${file.name}.`)
    } catch (err) {
      setCarnetInfo(err?.message ?? String(err))
    }
  }

  const carnetExportUrl = `data:application/json;charset=utf-8,${encodeURIComponent(exportCarnet(carnet))}`

  // ---- Rendu ---------------------------------------------------------------

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

  const daysOptions = (value, onChange, label, extra = null) => (
    <label className="promptologue-field">
      {label}
      <select value={value} onChange={(event) => onChange(event.target.value)} aria-label={label}>
        {extra}
        {availableDays.map((iso) => (
          <option key={iso} value={iso}>
            {iso}
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

      <details className="banc-carnet" data-testid="banc-carnet">
        <summary>Carnet du banc — méta-page et configurations emblématiques</summary>
        {carnetEditing ? (
          <div>
            <label className="promptologue-field">
              Texte du carnet (markdown)
              <textarea
                className="code-editor"
                rows={16}
                value={carnetDraft}
                onChange={(event) => setCarnetDraft(event.target.value)}
                aria-label="Texte du carnet (markdown)"
              />
            </label>
            <p>
              <button
                type="button"
                onClick={() => {
                  persistCarnet({ ...carnet, texte: carnetDraft })
                  setCarnetEditing(false)
                }}
              >
                Enregistrer la méta-page
              </button>{' '}
              <button type="button" onClick={() => setCarnetEditing(false)}>
                Annuler
              </button>
            </p>
          </div>
        ) : (
          <div>
            <div
              className="banc-carnet-texte"
              // renderMarkdown : conversion maison + DOMPurify (ADR-007).
              dangerouslySetInnerHTML={{ __html: renderMarkdown(carnet.texte) }}
            />
            <p>
              <button
                type="button"
                onClick={() => {
                  setCarnetDraft(carnet.texte)
                  setCarnetEditing(true)
                }}
              >
                Modifier la méta-page
              </button>
            </p>
          </div>
        )}

        <h3>Configurations emblématiques</h3>
        {carnet.configs.length === 0 ? (
          <p>Aucune configuration mémorisée pour l’instant.</p>
        ) : (
          <ul className="banc-carnet-configs">
            {carnet.configs.map((c) => (
              <li key={c.nom}>
                <strong>{c.nom}</strong>
                {c.note ? ` — ${c.note}` : ''}
                {c.creeLe ? ` (${c.creeLe.slice(0, 10)})` : ''}{' '}
                <button type="button" onClick={() => applyConfig(c.config)} aria-label={`Charger ${c.nom}`}>
                  Charger
                </button>{' '}
                <button
                  type="button"
                  onClick={() => persistCarnet(removeConfig(carnet, c.nom))}
                  aria-label={`Supprimer ${c.nom}`}
                >
                  Supprimer
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="banc-carnet-actions">
          <label>
            Nom{' '}
            <input
              value={carnetNom}
              onChange={(event) => setCarnetNom(event.target.value)}
              aria-label="Nom de la configuration"
            />
          </label>{' '}
          <label>
            Note{' '}
            <input
              value={carnetNote}
              onChange={(event) => setCarnetNote(event.target.value)}
              aria-label="Note de la configuration"
            />
          </label>{' '}
          <button type="button" onClick={saveCurrentConfig}>
            Mémoriser la configuration actuelle
          </button>
        </p>
        <p>
          <a href={carnetExportUrl} download="carnet-banc.json">
            Exporter le carnet (JSON)
          </a>{' '}
          <label>
            Importer un carnet{' '}
            <input
              type="file"
              accept="application/json,.json"
              onChange={onCarnetImport}
              aria-label="Importer un carnet"
            />
          </label>
        </p>
        {carnetInfo ? <p role="status">{carnetInfo}</p> : null}
      </details>

      <fieldset>
        <legend>Mode</legend>
        <label>
          <input
            type="radio"
            name="banc-mode"
            checked={mode === 'simple'}
            onChange={() => setMode('simple')}
          />{' '}
          Run simple
        </label>{' '}
        <label>
          <input
            type="radio"
            name="banc-mode"
            checked={mode === 'multi'}
            onChange={() => setMode('multi')}
          />{' '}
          Multi-run (consistance)
        </label>{' '}
        <label>
          <input type="radio" name="banc-mode" checked={mode === 'ab'} onChange={() => setMode('ab')} />{' '}
          A/B (deux versions)
        </label>{' '}
        <label>
          <input
            type="radio"
            name="banc-mode"
            checked={mode === 'reference'}
            onChange={() => setMode('reference')}
          />{' '}
          Vs référence importée
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
      {mode === 'reference' ? (
        <div className="promptologue-field">
          <label>
            JSON de référence (côté B){' '}
            <input
              type="file"
              accept="application/json,.json"
              onChange={onReferenceFile}
              aria-label="JSON de référence"
            />
          </label>
          {refImport ? (
            <p>
              {refImport.run.label} — {refImport.run.days.length} journée(s), fichier «{' '}
              {refImport.fileName} ».
            </p>
          ) : (
            <p>
              Formats acceptés : document cartographie-jour, tableau de documents, ou export JSON
              d’un run du banc.
            </p>
          )}
        </div>
      ) : null}

      <label className="promptologue-field">
        Portfolio de test
        <select
          value={portfolioChoice}
          onChange={(event) => {
            setPortfolioChoice(event.target.value)
            setDaySel({ type: 'tous', jour: '', du: '', au: '' })
          }}
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
        <legend>Journées évaluées</legend>
        {availableDays.length === 0 ? (
          <p className="banc-alerte" role="note">
            Ce portfolio local n’a aucun segment daté — datez ses journées dans l’atelier
            portfolio avant de le lancer sur le banc.
          </p>
        ) : null}
        <label>
          <input
            type="radio"
            name="banc-jours"
            checked={daySel.type === 'tous'}
            onChange={() => setDaySel({ ...daySel, type: 'tous' })}
          />{' '}
          Tout le journal ({availableDays.length} journée(s))
        </label>{' '}
        <label>
          <input
            type="radio"
            name="banc-jours"
            disabled={availableDays.length === 0}
            checked={daySel.type === 'jour'}
            onChange={() =>
              setDaySel({ ...daySel, type: 'jour', jour: daySel.jour || availableDays[0] || '' })
            }
          />{' '}
          Une journée
        </label>{' '}
        <label>
          <input
            type="radio"
            name="banc-jours"
            disabled={availableDays.length === 0}
            checked={daySel.type === 'periode'}
            onChange={() =>
              setDaySel({
                ...daySel,
                type: 'periode',
                du: daySel.du || availableDays[0] || '',
                au: daySel.au || availableDays[availableDays.length - 1] || '',
              })
            }
          />{' '}
          Une période
        </label>
        {daySel.type === 'jour'
          ? daysOptions(daySel.jour, (jour) => setDaySel({ ...daySel, jour }), 'Journée')
          : null}
        {daySel.type === 'periode' ? (
          <>
            {daysOptions(daySel.du, (du) => setDaySel({ ...daySel, du }), 'Du')}
            {daysOptions(daySel.au, (au) => setDaySel({ ...daySel, au }), 'Au')}
          </>
        ) : null}
      </fieldset>

      <label className="promptologue-field">
        Périmètre du référentiel
        <select
          value={perimetreChoice}
          onChange={(event) => setPerimetreChoice(event.target.value)}
          aria-label="Périmètre du référentiel"
        >
          <option value="tout">
            Référentiel entier ({refDocA?.competences?.length ?? '…'} compétences)
          </option>
          {(refDocA?.poles ?? []).map((pole) => (
            <optgroup key={pole.num} label={`Pôle ${pole.num} — ${pole.nom}`}>
              <option value={`pole:${pole.num}`}>Tout le pôle {pole.num}</option>
              {(refDocA?.competences ?? [])
                .filter((c) => c.pole === pole.num)
                .map((c) => (
                  <option key={c.code} value={`comp:${c.code}`}>
                    {c.code} — {c.nom}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
      </label>

      <label className="promptologue-field">
        Version du référentiel{mode === 'ab' && dualRef ? ' (A)' : ''}
        <select
          value={refChoice}
          onChange={(event) => setRefChoice(event.target.value)}
          aria-label="Version du référentiel"
        >
          <option value={EMBARQUE}>Embarquée — RESPIRE v7</option>
          {refVersions.map((v) => (
            <option key={v.version} value={v.version}>
              {v.version}
              {v.label ? ` — ${v.label}` : ''}
            </option>
          ))}
        </select>
      </label>
      {mode === 'ab' ? (
        <label>
          <input
            type="checkbox"
            checked={dualRef}
            onChange={(event) => setDualRef(event.target.checked)}
          />{' '}
          Référentiel distinct pour B
        </label>
      ) : null}
      {mode === 'ab' && dualRef ? (
        <label className="promptologue-field">
          Version du référentiel (B)
          <select
            value={refChoiceB}
            onChange={(event) => setRefChoiceB(event.target.value)}
            aria-label="Version du référentiel (B)"
          >
            <option value={EMBARQUE}>Embarquée — RESPIRE v7</option>
            {refVersions.map((v) => (
              <option key={v.version} value={v.version}>
                {v.version}
                {v.label ? ` — ${v.label}` : ''}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {referentielHints.length > 0 ? (
        <p className="banc-alerte" role="note">
          ⚠ Référentiel en dur : {referentielHints.join(' • ')}
        </p>
      ) : null}

      <ProviderPicker
        legend={mode === 'ab' && dualProvider ? 'Fournisseur LLM — branche A' : 'Fournisseur LLM'}
        value={provA}
        onChange={setProvA}
      />
      {mode === 'ab' ? (
        <label>
          <input
            type="checkbox"
            checked={dualProvider}
            onChange={(event) => setDualProvider(event.target.checked)}
          />{' '}
          Fournisseur/modèle distinct pour B (comparer les LLM)
        </label>
      ) : null}
      {mode === 'ab' && dualProvider ? (
        <ProviderPicker legend="Fournisseur LLM — branche B" value={provB} onChange={setProvB} />
      ) : null}

      <label className="promptologue-field">
        Température (vide = défaut du fournisseur)
        <input
          value={temperature}
          onChange={(event) => setTemperature(event.target.value)}
          aria-label="Température"
          inputMode="decimal"
          placeholder="ex. 0.7"
        />
      </label>

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
      {notice ? <p role="status">{notice}</p> : null}
      {error ? (
        <p role="alert" className="load-error">
          {error}
        </p>
      ) : null}

      {result?.alertes?.length > 0 ? (
        <p className="banc-alerte" role="note">
          ⚠ {result.alertes.join(' • ')}
        </p>
      ) : null}
      {result?.mode === 'simple' ? <SimpleResult result={result} /> : null}
      {result?.mode === 'multi' ? <MultiRunResult result={result} /> : null}
      {result?.mode === 'ab' ? (
        <>
          <AbResult result={result} />
          <CompetenceDiff
            diff={result.diff}
            labelA={result.labels?.a ?? 'A'}
            labelB={result.labels?.b ?? 'B'}
            competenceNames={result.competenceNames ?? {}}
          />
        </>
      ) : null}
    </div>
  )
}

function SimpleResult({ result }) {
  const { run, label, config } = result
  if (run.twin6) return <Twin6Result run={run} label={label} />
  const runReport = buildRunReport({ portfolioLabel: label, run, config })
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
      <p>
        <a
          href={reportDataUrl(runReport)}
          download={`run-${run.pkg.id}-${run.pkg.version}.json`}
        >
          Télécharger le run (JSON — réimportable comme référence)
        </a>
      </p>
    </section>
  )
}

function Twin6Result({ run, label }) {
  const doc = run.mergeDoc ?? {}
  const nbFeuilles = doc.periode?.nbFeuilles ?? doc.feuilles?.length ?? 0
  const nbCompetences = (doc.domains ?? []).reduce(
    (sum, d) => sum + (d.competences?.length ?? 0),
    0,
  )
  return (
    <section aria-label="Résultat du run Twin6" data-testid="banc-twin6">
      <h3>
        {run.pkg.id}@{run.pkg.version} sur « {label} » — cartographie ouverte (Twin6)
      </h3>
      <p>
        {nbFeuilles} feuille(s), {nbCompetences} compétence(s) cartographiée(s),{' '}
        {run.llmCalls} appel(s) LLM, {Math.round(run.durationMs / 1000)} s — run sur le portfolio
        entier (7 scan-pôle + kairos), mappé en cartographie globale.
      </p>
      <p>
        <a href={reportDataUrl(doc)} download={`twin6-${run.pkg.id}-${run.pkg.version}.json`}>
          Télécharger la cartographie (JSON)
        </a>
      </p>
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
  const { report, labels } = result
  const { a, b } = report.versions
  const labelA = labels?.a ?? 'A'
  const labelB = labels?.b ?? 'B'
  const configs = report.configurations ?? {}
  const configLine = (config) =>
    config
      ? [config.fournisseur, config.modele, config.referentiel && `réf. ${config.referentiel}`]
          .filter(Boolean)
          .join(' · ') || '—'
      : '—'
  return (
    <section aria-label="Comparaison A/B" data-testid="banc-ab">
      <h3>
        {labelA === 'A' ? 'A/B' : `${labelA} vs ${labelB}`} : {a.version} vs {b.version}
      </h3>
      <table className="promptologue-table">
        <thead>
          <tr>
            <th scope="col"></th>
            <th scope="col">
              {labelA} — {a.version}
            </th>
            <th scope="col">
              {labelB} — {b.version}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row">Configuration</th>
            <td>{configLine(configs.a)}</td>
            <td>{configs.b?.fichier ? `fichier ${configs.b.fichier}` : configLine(configs.b)}</td>
          </tr>
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
            <th scope="col">Seulement {labelA}</th>
            <th scope="col">Seulement {labelB}</th>
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
