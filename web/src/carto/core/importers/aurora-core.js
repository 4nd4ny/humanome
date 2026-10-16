// Interface ultime — importeur de l'arborescence AuroraCore (spec §3) :
// `portfolios/feuilles/<journal>/<pôle>/<code>/{verdict.json, deliberation.md,
// briefing.md, feuilles/<date>/*.md}` + `manifest.json` + feuilles du jour
// `<journal>/feuilles/AAAA-MM-JJ.md`.
//
// Un verdict AuroraCore porte sur TOUT le journal ; chacune de ses traces a sa
// propre date. Pour entrer dans le modèle par journée, le verdict est RÉPARTI
// sur les journées de ses traces : la journée d porte, pour la compétence c,
// un verdict de même statut et de même confiance, avec les seules traces
// datées de d (journal, D-7). Le jury complet, la délibération, le débat et
// les pièces du Greffier sont rangés UNE fois, au niveau du run (`runDetails`),
// et référencés depuis chaque journée. Les feuilles du jour du journal sont
// importées comme portfolio (elles portent le texte intégral : c'est ce qui
// rend le surlignage possible).
//
// Le run est aussi rendu comme SECONDE LECTURE (`readings`, journal D-68) :
// un résumé par compétence (statut, confiance, preuves, indices), ses
// délibérations restant au niveau du run. Joint à un jeu qui a déjà ses
// analyses par journée, c'est ainsi qu'il entre : il ne change pas le soleil
// (core/import.js décide).

import { canonicalJson, contentHash, normalizeConfidence, normalizeRole, normalizeStatus, stableId, toCount } from '../model.js'
import { splitExtract } from '../highlight.js'
import { isIsoDate } from '../dates.js'

const VERDICT_RE = /^(.*?)(?:^|\/)(\d+)\/(\d+\.\d+)\/verdict\.json$/
const nullableStr = (v) => (typeof v === 'string' && v.trim() !== '' ? v : null)

/** Libellés des voix (ordre d'affichage d'AuroraCore). */
export const JUROR_LABELS = {
  linguiste: 'Linguiste',
  historien: 'Historien',
  anthropologue: 'Anthropologue',
  philosophe: 'Philosophe',
  pedagogue: 'Pédagogue',
  sociologue: 'Sociologue',
  creatif: 'Créatif',
}

const INVOCATION_KEYS = {
  LINGUISTE: 'linguiste',
  HISTORIEN: 'historien',
  ANTHROPOLOGUE: 'anthropologue',
  PHILOSOPHE: 'philosophe',
  'PÉDAGOGUE': 'pedagogue',
  PEDAGOGUE: 'pedagogue',
  SOCIOLOGUE: 'sociologue',
  'CRÉATIF': 'creatif',
  CREATIF: 'creatif',
  'PRÉSIDENT DE SÉANCE': 'president',
  'PRESIDENT DE SEANCE': 'president',
  ACCUSATION: 'accusation',
  'DÉFENSE': 'defense',
  DEFENSE: 'defense',
  'RÉPLIQUE (ACCUSATION)': 'replique',
  'REPLIQUE (ACCUSATION)': 'replique',
  'BRIEFING NEUTRE': 'briefing',
}

/**
 * Découpe un fichier à blocs « INVOCATION — NOM » (deliberation.md,
 * briefing.md) en sections Markdown. Le préambule de chaque voix (bloc de code
 * d'invocation) est conservé à part ; la clôture « FIN DE LA VOIX » est retirée.
 * @param {string} md
 * @returns {{header: {journal?: string, date?: string, agent?: string}, sections: Record<string, {markdown: string, preamble: string}>}}
 */
export function parseInvocations(md) {
  const text = String(md ?? '').replace(/\r\n?/g, '\n')
  const header = {}
  const h = /Journal\s*:\s*([^|\n]+?)\s*\|\s*Date\s*:\s*(\d{4}-\d{2}-\d{2})(?:\s*\|\s*Agent\s*:\s*([^\n]+))?/.exec(text)
  if (h) Object.assign(header, { journal: h[1].trim(), date: h[2], agent: h[3]?.trim() })
  const re = /^INVOCATION\s+[—–-]\s+(.+?)\s*$/gm
  const marks = [...text.matchAll(re)]
  const sections = {}
  marks.forEach((m, i) => {
    const name = m[1].trim().toUpperCase()
    const key = INVOCATION_KEYS[name] ?? name.toLowerCase()
    const raw = text.slice(m.index + m[0].length, i + 1 < marks.length ? marks[i + 1].index : text.length)
    // Fin du préambule : la première ligne « ``` » qui ferme le bloc d'invocation.
    const lines = raw.split('\n')
    let k = 0
    const preamble = []
    while (k < lines.length && lines[k].trim() !== '```') {
      if (!/^=+$/.test(lines[k].trim())) preamble.push(lines[k])
      k++
    }
    const body = []
    for (k = k + 1; k < lines.length; k++) {
      // Clôture « FIN DE LA VOIX » ou ouverture de la voix suivante : « ``` » puis « ==== ».
      if (lines[k].trim() === '```' && /^=+$/.test((lines[k + 1] ?? '').trim())) break
      body.push(lines[k])
    }
    // Retire le séparateur « --- » final et les blancs.
    const markdown = body.join('\n').replace(/\n-{3,}\s*$/u, '').trim()
    sections[key] = { markdown, preamble: preamble.join('\n').trim() }
  })
  return { header, sections }
}

/**
 * Importe une ou plusieurs arborescences AuroraCore.
 *
 * @param {Array<{path: string, text: string}>} files fichiers TEXTE du lot (JSON non parsés)
 * @param {{now?: string}} [opts]
 * @returns {{
 *   variants: Array<{date: string, summary: object, detail: object}>,
 *   runDetails: Array<{key: string, value: object}>,
 *   portfolio: Array<{date: string, title: string | null, text: string, source: string}>,
 *   readings: Array<{id: string, source: string, journal: string, analysedAt: string | null, importedAt: string,
 *     codes: Record<string, {status: string, rawStatus: string | null, confidence: number | null, proofs: number, hints: number}>, poles: number[]}>,
 *   report: Array<object>,
 *   consumed: Set<string>,
 * }}
 */
export function importAuroraCoreTrees(files, { now = new Date().toISOString() } = {}) {
  const report = []
  const consumed = new Set()
  const byPath = new Map(files.map((f) => [f.path, f]))
  const variants = []
  const runDetails = []
  const portfolio = []
  const readings = []

  // Racines de journaux : préfixe commun des verdict.json.
  const roots = new Map()
  for (const f of files) {
    const m = VERDICT_RE.exec(f.path)
    if (!m) continue
    const root = m[1].replace(/\/$/, '')
    if (!roots.has(root)) roots.set(root, [])
    roots.get(root).push({ file: f, pole: Number(m[2]), code: m[3] })
  }

  for (const [root, verdictFiles] of roots) {
    const prefix = root ? `${root}/` : ''
    const manifestFile = byPath.get(`${prefix}manifest.json`)
    let manifest = null
    if (manifestFile) {
      consumed.add(manifestFile.path)
      try {
        manifest = JSON.parse(manifestFile.text)
      } catch {
        report.push({ severity: 'warning', code: 'manifest-invalide', message: `${manifestFile.path} : JSON invalide (ignoré)` })
      }
    }
    const journalId = nullableStr(manifest?.id_portfolio) ?? (root.split('/').pop() || 'journal')

    // Feuilles du jour du journal → portfolio.
    const sheetRe = new RegExp(`^${escapeRe(prefix)}feuilles/(\\d{4}-\\d{2}-\\d{2})\\.md$`)
    for (const f of files) {
      const m = sheetRe.exec(f.path)
      if (!m || !isIsoDate(m[1])) continue
      consumed.add(f.path)
      portfolio.push({ date: m[1], title: firstHeading(f.text), text: f.text, source: `${journalId}/feuilles/${m[1]}.md` })
    }
    // Fichiers techniques de l'arborescence : copies de feuilles par pôle et
    // par compétence (même sans verdict), lectures et rapports de pôle,
    // triage. Les rapports et lectures de pôle sont gardés au niveau du run.
    const treeRe = new RegExp(`^${escapeRe(prefix)}(\\d+)/(?:(lecteur|rapport)\\.md|feuilles/\\d{4}-\\d{2}-\\d{2}\\.md|\\d+\\.\\d+/(?:feuilles/.+\\.md|briefing\\.md|deliberation\\.md))$`)
    const poleTexts = new Map()
    for (const f of files) {
      const m = treeRe.exec(f.path)
      if (!m) continue
      consumed.add(f.path)
      if (m[2]) {
        if (!poleTexts.has(m[1])) poleTexts.set(m[1], {})
        poleTexts.get(m[1])[m[2] === 'rapport' ? 'report' : 'reading'] = f.text
      }
    }
    const triage = byPath.get(`${prefix}triage.json`)
    if (triage) consumed.add(triage.path)

    const perDate = new Map() // date → Map(code → {verdict, traces[]})
    const rootRunDetails = []
    let analysisDate = null
    for (const { file, pole, code } of verdictFiles) {
      consumed.add(file.path)
      let v
      try {
        v = JSON.parse(file.text)
      } catch {
        report.push({ severity: 'blocking', code: 'json-invalide', message: `${file.path} : JSON invalide — verdict en quarantaine` })
        continue
      }
      const dir = file.path.slice(0, -'verdict.json'.length)
      const delibFile = byPath.get(`${dir}deliberation.md`)
      const briefFile = byPath.get(`${dir}briefing.md`)
      if (delibFile) consumed.add(delibFile.path)
      if (briefFile) consumed.add(briefFile.path)
      const delib = delibFile ? parseInvocations(delibFile.text) : null
      const brief = briefFile ? parseInvocations(briefFile.text) : null
      analysisDate ??= delib?.header.date ?? null

      // Pièces du Greffier : <code>/feuilles/<date>/*.md
      const pieces = []
      const pieceRe = new RegExp(`^${escapeRe(dir)}feuilles/(\\d{4}-\\d{2}-\\d{2})/([^/]+\\.md)$`)
      const copyRe = new RegExp(`^${escapeRe(dir)}feuilles/(\\d{4}-\\d{2}-\\d{2})\\.md$`)
      for (const f of files) {
        const pm = pieceRe.exec(f.path)
        if (pm) {
          consumed.add(f.path)
          pieces.push({ date: pm[1], name: pm[2], text: f.text })
          continue
        }
        if (copyRe.test(f.path)) consumed.add(f.path) // copie de la feuille du jour (déjà dans le portfolio)
      }
      pieces.sort((a, b) => (a.date + a.name < b.date + b.name ? -1 : 1))

      const vCode = nullableStr(v.code) ?? code
      const status = normalizeStatus(v.statut)
      const confidence = normalizeConfidence(v.confiance)
      const traces = Array.isArray(v.traces_retenues) ? v.traces_retenues : Array.isArray(v.traces_probantes) ? v.traces_probantes : []
      rootRunDetails.push({
        value: {
          code: vCode,
          name: nullableStr(v.nom),
          pole,
          status,
          rawStatus: nullableStr(v.statut),
          confidence,
          scores: { proofs: toCount(v.score_preuves), hints: toCount(v.score_indices), score: typeof v.score === 'number' ? v.score : null },
          jury: v.jury ?? null,
          president: v.president ?? null,
          deliberation: delib?.sections ?? null,
          debate: brief?.sections ?? null,
          pieces,
          traces: traces.map((t) => ({ pieceId: t?.piece_id ?? null, role: normalizeRole(t?.role).role, pieceType: nullableStr(t?.type), extract: typeof t?.extrait === 'string' ? t.extrait : '', date: isIsoDate(t?.date) ? t.date : null })),
        },
      })

      let undated = 0
      for (const t of traces) {
        if (!isIsoDate(t?.date)) {
          undated++
          continue
        }
        if (!perDate.has(t.date)) perDate.set(t.date, new Map())
        const day = perDate.get(t.date)
        if (!day.has(vCode)) day.set(vCode, { v, status, confidence, traces: [] })
        day.get(vCode).traces.push(t)
      }
      if (undated > 0) report.push({ severity: 'warning', code: 'traces-non-datees', message: `${vCode} : ${undated} trace(s) sans date valide — non placées sur une journée` })
      if (traces.length === 0) report.push({ severity: 'info', code: 'verdict-sans-trace', message: `${vCode} (${nullableStr(v.statut) ?? 'statut ?'}) : aucune trace datée, visible seulement au niveau du run` })
    }

    analysisDate ??= nullableStr(manifest?.date_derniere_preparation)?.slice(0, 10) ?? null
    const runId = `${journalId}@${analysisDate ?? 'date-inconnue'}`
    for (const rd of rootRunDetails) runDetails.push({ key: `${runId}|${rd.value.code}`, value: rd.value })
    for (const [pole, texts] of poleTexts) runDetails.push({ key: `${runId}|pole:${pole}`, value: { pole: Number(pole), ...texts } })
    readings.push({
      id: runId,
      source: 'aurora-core',
      journal: journalId,
      analysedAt: analysisDate,
      importedAt: now,
      codes: Object.fromEntries(
        [...rootRunDetails]
          .sort((a, b) => (a.value.code < b.value.code ? -1 : 1))
          .map(({ value: v }) => [v.code, { status: v.status, rawStatus: v.rawStatus, confidence: v.confidence, proofs: v.traces.filter((t) => t.role === 'preuve').length, hints: v.traces.filter((t) => t.role !== 'preuve').length }]),
      ),
      poles: [...poleTexts.keys()].map(Number).sort((a, b) => a - b),
    })

    for (const [date, codes] of [...perDate.entries()].sort()) {
      const digest = contentHash(canonicalJson([...codes.entries()].map(([c, e]) => [c, e.status, e.confidence, e.traces])))
      const variantId = stableId('v', [date, 'aurora-core', runId, digest])
      const summaryVerdicts = []
      const detailVerdicts = {}
      for (const [code, e] of [...codes.entries()].sort()) {
        const tSummaries = []
        const tDetails = {}
        e.traces.forEach((t, i) => {
          const id = `${variantId}:${code}:${i}`
          const { role } = normalizeRole(t.role)
          const extract = typeof t.extrait === 'string' ? t.extrait : ''
          const anchors = splitExtract(extract)
          tSummaries.push({ id, role })
          tDetails[id] = { role, rawRole: nullableStr(t.role), pieceType: nullableStr(t.type), pieceId: t.piece_id ?? null, pid: null, extract, start: anchors.start, end: anchors.end, context: '', author: null, sourceDate: date, resolved: Boolean(extract) }
        })
        summaryVerdicts.push({
          code,
          status: e.status,
          rawStatus: nullableStr(e.v.statut),
          courtCircuit: false,
          confidence: e.confidence,
          proofs: tSummaries.filter((t) => t.role === 'preuve').length,
          hints: tSummaries.filter((t) => t.role !== 'preuve').length,
          traces: tSummaries,
        })
        detailVerdicts[code] = {
          motif: nullableStr(e.v.president?.verdict_argumente),
          prescription: nullableStr(e.v.president?.prescription),
          pedagogue: null,
          jury: null,
          president: null,
          pieces: [],
          traces: tDetails,
          runRef: `${runId}|${code}`,
        }
      }
      variants.push({
        date,
        summary: {
          id: variantId,
          digest,
          provenance: { source: 'aurora-core', run: runId, files: [`${journalId}/…/verdict.json`], model: null, prompt: null, analysedAt: analysisDate, importedAt: now },
          verdicts: summaryVerdicts,
          anomalies: [{ severity: 'info', code: 'verdict-de-run', message: 'Verdicts d’un run AuroraCore répartis sur les journées de leurs traces' }],
        },
        detail: { verdicts: detailVerdicts, passages: [], poleReports: {}, audits: {}, kairos: null, kairosRaw: null, emergences: null, runId },
      })
    }
    report.push({ severity: 'info', code: 'aurora-core', message: `Journal ${journalId} : ${verdictFiles.length} verdict(s) répartis sur ${perDate.size} journée(s)` })
  }

  return { variants, runDetails, portfolio, readings, report, consumed }
}

/** Le lot contient-il une arborescence AuroraCore ? */
export function hasAuroraCoreTree(files) {
  return files.some((f) => VERDICT_RE.test(f.path))
}

function firstHeading(text) {
  const m = /^\s{0,3}#{1,6}\s+(.+)$/m.exec(String(text ?? ''))
  return m ? m[1].trim() : null
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
