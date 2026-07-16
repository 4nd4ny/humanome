// Banc d'essai promptologue (P10.4) — logique pure, sans React.
//
// Exécution d'UNE version (publiée ou MON brouillon) sur un portfolio de test :
//   - paquet « moteur » (orchestration engine://) -> extractDay direct ;
//   - paquet avec code d'orchestration personnalisé -> sandbox (P10.3).
// Multi-run de consistance (engine compareRuns) et comparaison A/B avec
// rapport JSON téléchargeable.

import { extractDay } from '@engine/pipeline/extract.js'
import { compareRuns } from '@engine/consistency.js'
import { executerTwin6 } from '@engine/twin6/index.js'
import { runPackageInSandbox, usesEngineOrchestration } from '../../lib/sandbox/index.js'

export const STATUT_ETABLIE = 'présence établie'
export const STATUT_RENVOI = 'renvoi au cartographe'

/**
 * Paquet « Cartographie ouverte Twin6 » (ou un fork) : l'orchestration porte le
 * marqueur engine://…(twin6). Son exécution n'est PAS une extraction par jour
 * (aurora) mais un run Twin6 sur le portfolio ENTIER (7 scan-pole + kairos ->
 * cartographie-merge), comme la page publique #/twin6-ouverte (D1/AD-D1).
 * @param {object} pkg prompt-package (complet ou métadonnées)
 * @returns {boolean}
 */
export function usesTwin6Engine(pkg) {
  const orchestration = pkg?.code?.orchestration
  return typeof orchestration === 'string' && orchestration.includes('(twin6)')
}

/**
 * Extrait les gabarits Twin6 (scanPole, kairos, fiches{1..7}) des prompts[] d'un
 * paquet Twin6, dans la forme attendue par executerTwin6.
 * @param {{prompts: Array<{role: string, texte: string}>}} pkg
 * @returns {{scanPole: string, kairos: string, fiches: Record<string, string>}}
 */
export function extractTwin6Templates(pkg) {
  const byRole = {}
  for (const p of pkg?.prompts ?? []) {
    if (p && typeof p.role === 'string' && typeof p.texte === 'string') byRole[p.role] = p.texte
  }
  const scanPole = byRole['twin6-scan-pole']
  const kairos = byRole['twin6-kairos']
  const fiches = {}
  for (let n = 1; n <= 7; n += 1) {
    const t = byRole[`twin6-fiche-${n}`]
    if (typeof t === 'string') fiches[String(n)] = t
  }
  if (!scanPole || !kairos || Object.keys(fiches).length === 0) {
    throw new Error(
      'Paquet Twin6 incomplet : gabarits twin6-scan-pole, twin6-kairos et twin6-fiche-1..7 attendus.',
    )
  }
  return { scanPole, kairos, fiches }
}

/**
 * Assemble un portfolio markdown (feuilles `### AAAA-MM-JJ`) depuis les journées
 * du banc d'essai — Twin6 tourne sur le portfolio entier, pas jour par jour.
 * @param {Array<{iso: string, texte: string}>} dayGroups
 * @returns {string}
 */
export function dayGroupsToPortfolio(dayGroups) {
  return (dayGroups ?? []).map((g) => `### ${g.iso}\n\n${g.texte}`).join('\n\n')
}

/**
 * Résumé structurel d'un document cartographie-jour : codes par statut.
 * @param {object} doc document cartographie-jour
 * @returns {{etablies: string[], renvois: string[], nonEtablies: string[]}}
 */
export function summarizeDocument(doc) {
  const etablies = []
  const renvois = []
  const nonEtablies = []
  for (const pole of doc?.poles ?? []) {
    for (const comp of pole.competences ?? []) {
      const statut = comp?.verdict?.statut
      if (statut === STATUT_ETABLIE) etablies.push(comp.code)
      else if (statut === STATUT_RENVOI) renvois.push(comp.code)
      else nonEtablies.push(comp.code)
    }
  }
  return { etablies: etablies.sort(), renvois: renvois.sort(), nonEtablies: nonEtablies.sort() }
}

/**
 * Compare deux listes de codes établis.
 * @param {string[]} a @param {string[]} b
 * @returns {{communes: string[], seulementA: string[], seulementB: string[]}}
 */
export function compareCodes(a, b) {
  const setA = new Set(a)
  const setB = new Set(b)
  return {
    communes: a.filter((c) => setB.has(c)),
    seulementA: a.filter((c) => !setB.has(c)),
    seulementB: b.filter((c) => !setA.has(c)),
  }
}

/**
 * Exécute une version d'un paquet sur les journées données (séquentiel).
 *
 * @param {object} params
 * @param {object} params.pkg document prompt-package (ou paquet embarqué)
 * @param {Array<{iso: string, texte: string}>} params.dayGroups
 * @param {object} params.referentiel
 * @param {{complete: Function}} params.provider
 * @param {string} params.model
 * @param {number} [params.maxTokens]
 * @param {AbortSignal} [params.signal]
 * @param {(info: {iso: string, position: number, total: number, calls: number}) => void} [params.onProgress]
 * @param {typeof extractDay} [params.extractDayFn] couture de test
 * @param {typeof runPackageInSandbox} [params.sandboxRunner] couture de test
 * @returns {Promise<{pkg: {id: string, version: string}, engine: boolean,
 *   days: Array<{iso: string, document: object}>, llmCalls: number, durationMs: number}>}
 */
export async function runVersionOnDays({
  pkg,
  dayGroups,
  referentiel,
  provider,
  model,
  maxTokens,
  signal,
  onProgress,
  extractDayFn = extractDay,
  sandboxRunner = runPackageInSandbox,
  executerTwin6Fn = executerTwin6,
} = {}) {
  // Twin6 (ou un fork) : run sur le portfolio ENTIER -> cartographie-merge.
  if (usesTwin6Engine(pkg)) {
    const startedAt = Date.now()
    const templates = extractTwin6Templates(pkg)
    const portfolio = dayGroupsToPortfolio(dayGroups)
    let calls = 0
    const { document } = await executerTwin6Fn({
      portfolio,
      templates,
      referentiel,
      provider,
      model,
      options: {
        maxTokens,
        signal,
        onProgress: (p) => {
          if (p?.phase === 'scan-pole' || p?.phase === 'kairos') {
            calls = (p.done ?? 0) + 1
            onProgress?.({ iso: '', position: calls, total: p.total ?? 8, calls })
          }
        },
      },
    })
    return {
      pkg: { id: pkg.id, version: pkg.version },
      engine: true,
      twin6: true,
      mergeDoc: document,
      days: [],
      llmCalls: calls || 8,
      durationMs: Date.now() - startedAt,
    }
  }

  const engine = usesEngineOrchestration(pkg)
  const startedAt = Date.now()
  const days = []
  let llmCalls = 0

  for (let i = 0; i < dayGroups.length; i++) {
    const { iso, texte } = dayGroups[i]
    const report = (calls) =>
      onProgress?.({ iso, position: i + 1, total: dayGroups.length, calls })
    report(llmCalls)
    let document
    if (engine) {
      document = await extractDayFn({
        dayText: texte,
        date: iso,
        referentiel,
        provider,
        model,
        maxTokens,
        signal,
        kairosOptional: true,
        onProgress: () => {
          llmCalls += 1
          report(llmCalls)
        },
      })
    } else {
      const result = await sandboxRunner({
        pkg,
        dayText: texte,
        date: iso,
        referentiel,
        provider,
        model,
        maxTokens,
        signal,
        onLlmCall: ({ calls }) => report(llmCalls + calls),
      })
      llmCalls += result.llmCalls
      document = result.document
    }
    days.push({ iso, document })
  }

  return {
    pkg: { id: pkg.id, version: pkg.version },
    engine,
    days,
    llmCalls,
    durationMs: Date.now() - startedAt,
  }
}

/**
 * Rapport de consistance multi-run : pour chaque journée, engine compareRuns
 * sur les N documents produits par les N runs.
 *
 * @param {Array<{days: Array<{iso: string, document: object}>}>} runs ≥ 2 runs
 *   de la MÊME version sur le MÊME portfolio
 * @returns {{nbRuns: number, parJour: Array<{iso: string, comparison: object}>,
 *   distanceMoyenne: number}}
 */
export function buildMultiRunReport(runs) {
  if (!Array.isArray(runs) || runs.length < 2) {
    throw new TypeError('buildMultiRunReport : au moins 2 runs requis')
  }
  const isos = runs[0].days.map((d) => d.iso)
  const parJour = []
  let distanceSum = 0
  for (const iso of isos) {
    const docs = runs.map((run) => run.days.find((d) => d.iso === iso)?.document).filter(Boolean)
    if (docs.length !== runs.length) continue
    const comparison = compareRuns(docs)
    parJour.push({ iso, comparison })
    distanceSum += comparison.distanceStructurelle
  }
  return {
    nbRuns: runs.length,
    parJour,
    distanceMoyenne: parJour.length > 0 ? distanceSum / parJour.length : 0,
  }
}

/**
 * Rapport A/B : deux versions sur le MÊME portfolio — compétences détectées,
 * statuts, coûts/temps mesurés et estimés. Sérialisable en JSON (téléchargeable).
 *
 * @param {object} params
 * @param {string} params.portfolioLabel
 * @param {{pkg: object, days: Array, llmCalls: number, durationMs: number}} params.a
 * @param {{pkg: object, days: Array, llmCalls: number, durationMs: number}} params.b
 * @param {{a: object|null, b: object|null}} [params.estimates] sorties buildEstimate
 * @param {() => string} [params.now] horloge injectable
 * @returns {object} rapport JSON
 */
export function buildAbReport({ portfolioLabel, a, b, estimates = {}, now = () => new Date().toISOString() }) {
  const parJour = a.days.map(({ iso, document }) => {
    const docB = b.days.find((d) => d.iso === iso)?.document
    const resumeA = summarizeDocument(document)
    const resumeB = docB ? summarizeDocument(docB) : { etablies: [], renvois: [], nonEtablies: [] }
    const diff = compareCodes(resumeA.etablies, resumeB.etablies)
    return { iso, a: resumeA, b: resumeB, ...diff }
  })
  const totals = (runResult) => ({
    version: `${runResult.pkg.id}@${runResult.pkg.version}`,
    llmCalls: runResult.llmCalls,
    durationMs: runResult.durationMs,
    etabliesTotal: runResult.days.reduce(
      (sum, d) => sum + summarizeDocument(d.document).etablies.length,
      0,
    ),
  })
  return {
    kind: 'rapport-ab-prompt-packages',
    genereLe: now(),
    portfolio: { label: portfolioLabel, jours: a.days.map((d) => d.iso) },
    versions: { a: totals(a), b: totals(b) },
    estimations: {
      a: estimates.a ?? null,
      b: estimates.b ?? null,
    },
    parJour,
  }
}

/**
 * URL data: du rapport JSON (téléchargement sans Blob — fonctionne aussi en
 * environnement de test jsdom et sur copie statique).
 * @param {object} report
 * @returns {string}
 */
export function reportDataUrl(report) {
  return `data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(report, null, 2))}`
}
