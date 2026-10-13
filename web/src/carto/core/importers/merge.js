// Interface ultime — importeurs « Merge » (spec §3).
//
// 1. `carto_merge.json` (sortie `extract` de Merge v2) : `feuilles[date]` porte
//    les `carto_par_pole` et le `kairos` bruts de chaque journée → chaque
//    feuille passe par l'adaptateur Aurora v3 (aucune perte).
// 2. Document `cartographie-merge` du site (forme de `carto-data.js`) : il ne
//    porte, par journée et par compétence, que le statut, les compteurs et la
//    confiance (`parFeuille`) — les traces sont reconstituées depuis les
//    compteurs, SANS extrait (surlignage indisponible, signalé). Ses textes de
//    synthèse évolutive (kairos, pôles, compétences) sont importés comme
//    narratifs dont l'ensemble source est la liste de ses feuilles : ils ne
//    s'affichent que si cet ensemble est exactement l'ensemble actif (§6.4).

import { adaptAuroraDay } from './aurora-day.js'
import { canonicalJson, contentHash, normalizeConfidence, normalizeStatus, stableId, toCount } from '../model.js'
import { isIsoDate } from '../dates.js'

/** Le document est-il un carto_merge.json (Merge v2) ? */
export function looksLikeCartoMerge(doc) {
  if (!doc || typeof doc !== 'object' || !doc.feuilles || typeof doc.feuilles !== 'object' || Array.isArray(doc.feuilles)) return false
  const first = Object.values(doc.feuilles)[0]
  return Boolean(first && typeof first === 'object' && first.carto_par_pole)
}

/** Le document est-il un `cartographie-merge` du site ? */
export function looksLikeSiteMerge(doc) {
  return Boolean(doc && typeof doc === 'object' && doc.kind === 'cartographie-merge' && Array.isArray(doc.domains))
}

/**
 * @param {object} doc carto_merge.json parsé
 * @param {{fileName?: string, now?: string}} [opts]
 */
export function importCartoMerge(doc, { fileName = 'carto_merge.json', now = new Date().toISOString() } = {}) {
  const report = []
  const variants = []
  for (const [key, feuille] of Object.entries(doc.feuilles)) {
    const date = isIsoDate(feuille?.date) ? feuille.date : key
    if (!isIsoDate(date)) {
      report.push({ severity: 'blocking', code: 'date-absente', message: `Feuille « ${key} » sans date valide — en quarantaine` })
      continue
    }
    const poles = Object.values(feuille.carto_par_pole ?? {})
    const res = adaptAuroraDay({
      date,
      poles,
      kairos: feuille.kairos ?? null,
      provenance: { source: 'merge-v2', run: doc.version ?? null, files: [fileName], analysedAt: doc.date_construction ?? null },
      now,
    })
    report.push(...res.report)
    variants.push({ date, summary: res.summary, detail: res.detail })
  }
  return { variants, narratives: [], report }
}

/**
 * @param {object} doc cartographie-merge parsé
 * @param {{fileName?: string, now?: string}} [opts]
 */
export function importSiteMerge(doc, { fileName = 'merge.json', now = new Date().toISOString() } = {}) {
  const report = []
  const byDate = new Map() // date → Map(code → entrée parFeuille)
  const feuilleDates = (Array.isArray(doc.feuilles) ? doc.feuilles : [])
    .map((f) => f?.iso ?? f?.date)
    .filter(isIsoDate)
  for (const d of feuilleDates) byDate.set(d, new Map())

  const narratives = []
  const sourceDates = [...feuilleDates].sort()
  for (const [di, domain] of (doc.domains ?? []).entries()) {
    let poleNum = null
    for (const comp of domain?.competences ?? []) {
      const code = typeof comp?.code === 'string' ? comp.code : null
      if (!code) continue
      poleNum ??= Number(code.split('.')[0]) || null
      for (const pf of Array.isArray(comp.parFeuille) ? comp.parFeuille : []) {
        if (!isIsoDate(pf?.date)) continue
        if (!byDate.has(pf.date)) byDate.set(pf.date, new Map())
        byDate.get(pf.date).set(code, pf)
      }
      if (typeof comp.feedback === 'string' && comp.feedback.trim()) {
        narratives.push({ id: `site-merge:competence:${code}`, kind: 'competence-evolutive', scope: { code }, sourceDates, html: comp.feedback })
      }
    }
    if (typeof domain?.rapport_html === 'string' && domain.rapport_html.trim()) {
      narratives.push({ id: `site-merge:pole:${poleNum ?? di + 1}`, kind: 'pole-evolutif', scope: { pole: poleNum ?? di + 1 }, sourceDates, html: domain.rapport_html })
    }
  }
  const kairosHtml = doc.narratifs?.kairosHtml ?? doc.narratifs?.rapportHtml ?? null
  if (typeof kairosHtml === 'string' && kairosHtml.trim()) {
    narratives.push({ id: 'site-merge:kairos', kind: 'kairos-evolutif', scope: {}, sourceDates, html: kairosHtml })
  }

  const variants = []
  for (const [date, codes] of [...byDate.entries()].sort()) {
    if (codes.size === 0) continue
    const entries = [...codes.entries()].sort()
    const digest = contentHash(canonicalJson(entries))
    const variantId = stableId('v', [date, 'site-merge', digest])
    const verdicts = entries.map(([code, pf]) => {
      const status = normalizeStatus(pf.statut)
      const proofs = toCount(pf.preuves)
      const hints = toCount(pf.indices)
      const provides = status === 'established' || status === 'needs_review'
      const roles = provides ? [...Array(proofs).fill('preuve'), ...Array(hints).fill('indice')] : []
      return {
        code,
        status,
        rawStatus: typeof pf.statut === 'string' ? pf.statut : null,
        courtCircuit: false,
        confidence: normalizeConfidence(pf.confiance),
        proofs,
        hints,
        traces: roles.map((role, k) => ({ id: `${variantId}:${code}:c${k}`, role })),
      }
    })
    const detailVerdicts = {}
    for (const v of verdicts) {
      detailVerdicts[v.code] = {
        motif: null,
        prescription: null,
        pedagogue: null,
        jury: null,
        president: null,
        pieces: [],
        traces: Object.fromEntries(v.traces.map((t) => [t.id, { role: t.role, rawRole: null, pieceType: null, pieceId: null, pid: null, extract: '', start: '', end: null, context: '', author: null, sourceDate: date, resolved: false, synthetic: true }])),
      }
    }
    variants.push({
      date,
      summary: {
        id: variantId,
        digest,
        provenance: { source: 'site-merge', run: doc.source?.journalId ?? null, files: [fileName], model: null, prompt: doc.source?.protocole ?? null, analysedAt: doc.generatedAt ?? null, importedAt: now },
        verdicts,
        anomalies: [{ severity: 'info', code: 'merge-sans-extraits', message: 'Importé d’un document de fusion : compteurs sans extraits (surlignage indisponible)' }],
      },
      detail: { verdicts: detailVerdicts, passages: [], poleReports: {}, audits: {}, kairos: null, kairosRaw: null, emergences: null },
    })
  }
  report.push({
    severity: 'warning',
    code: 'merge-sans-extraits',
    message: `Document de fusion : ${variants.length} journée(s) reconstituées depuis les compteurs ; les extraits manquent (préférer les journées Aurora d'origine)`,
  })
  return { variants, narratives, report }
}
