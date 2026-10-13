// Interface ultime — conversion d'un master V3 (`competency-map-master` 3.x,
// interface `#/cartographie-v3`) vers le modèle par journée (journal D-3).
//
// V3 range ses entités à plat : journées, variantes (sources.dayVariants),
// observations (une par compétence et par variante), liens de preuve
// (observation → passage, avec rôle argumentatif et droit de réponse),
// passages (extraits verbatim), narratifs dérivés (rapports de pôle, kairos).
// La conversion regroupe tout par journée et par variante, sans rien deviner :
// un lien non résolu garde son rôle (et son poids) mais n'a pas d'extrait.
// Le droit de réponse V3 porte sur chaque LIEN ; ici il porte sur
// l'observation : un état commun à tous les liens est repris tel quel, des
// états différents deviennent « nuancée » avec une note qui le dit.

import { canonicalJson, contentHash, normalizeRole, observationKey, stableId } from '../model.js'
import { splitExtract } from '../highlight.js'
import { isIsoDate } from '../dates.js'

const STATUSES = new Set(['established', 'not_established', 'needs_review', 'unknown'])
const REVIEWS = new Set(['unreviewed', 'confirmed', 'nuanced', 'contested'])

/** Le document est-il un master V3 ? */
export function looksLikeV3Master(doc) {
  return Boolean(doc && doc.kind === 'competency-map-master' && String(doc.schemaVersion ?? '').startsWith('3.') && Array.isArray(doc.days) && Array.isArray(doc.observations))
}

/**
 * @param {object} master master V3
 * @param {{fileName?: string, now?: string}} [opts]
 * @returns {{variants: Array<{date: string, summary: object, detail: object}>, extras: object, report: Array<object>}}
 */
export function importV3Master(master, { fileName = 'master-v3.json', now = new Date().toISOString() } = {}) {
  const report = []
  const dayOfVariant = new Map()
  for (const day of master.days ?? []) {
    for (const p of day.provenance ?? []) dayOfVariant.set(p.variantId, day)
  }
  const variantsMeta = new Map((master.sources?.dayVariants ?? []).map((v) => [v.id, v]))
  const passages = new Map((master.passages ?? []).map((p) => [p.id, p]))
  const linksByObs = new Map()
  for (const l of master.evidenceLinks ?? []) {
    if (!linksByObs.has(l.observationId)) linksByObs.set(l.observationId, [])
    linksByObs.get(l.observationId).push(l)
  }
  const obsByVariant = new Map()
  for (const o of master.observations ?? []) {
    if (!obsByVariant.has(o.variantId)) obsByVariant.set(o.variantId, [])
    obsByVariant.get(o.variantId).push(o)
  }
  const narrByVariant = new Map()
  for (const n of master.derivedNarratives ?? []) {
    if (!narrByVariant.has(n.variantId)) narrByVariant.set(n.variantId, [])
    narrByVariant.get(n.variantId).push(n)
  }

  const variants = []
  const reviews = {}
  const days = []
  let unresolved = 0
  const idMap = new Map() // id de variante V3 → id ici

  for (const [v3Id, observations] of obsByVariant) {
    const meta = variantsMeta.get(v3Id)
    const day = dayOfVariant.get(v3Id)
    const date = day?.effectiveDate ?? meta?.effectiveDate ?? null
    if (!isIsoDate(date)) {
      report.push({ severity: 'blocking', code: 'date-absente', message: `${fileName} : variante ${String(v3Id).slice(0, 8)} sans date valide — ignorée` })
      continue
    }
    if (meta?.state === 'quarantined') continue
    const digest = contentHash(canonicalJson(observations.map((o) => [o.rawCode, o.normalizedStatus, o.verdictConfidence, (linksByObs.get(o.id) ?? []).map((l) => [l.evidentialRole, passages.get(l.passageId)?.verbatim ?? null])])))
    const variantId = stableId('v', [date, 'v3-master', v3Id, digest])
    idMap.set(v3Id, variantId)
    const summaryVerdicts = []
    const detailVerdicts = {}
    for (const o of observations) {
      const code = typeof o.rawCode === 'string' ? o.rawCode : null
      if (!code) continue
      const links = linksByObs.get(o.id) ?? []
      const status = STATUSES.has(o.normalizedStatus) ? o.normalizedStatus : 'unknown'
      const provides = (status === 'established' || status === 'needs_review') && !o.courtCircuit
      const tSummaries = []
      const tDetails = {}
      if (provides) {
        links.forEach((l, i) => {
          const id = `${variantId}:${code}:${i}`
          const { role } = normalizeRole(l.evidentialRole)
          const p = l.passageId ? passages.get(l.passageId) : null
          const extract = typeof p?.verbatim === 'string' ? p.verbatim : ''
          if (!extract) unresolved++
          const anchors = splitExtract(extract)
          tSummaries.push({ id, role })
          tDetails[id] = {
            role,
            rawRole: l.evidentialRole || null,
            pieceType: null,
            pieceId: l.sourcePieceRef ?? null,
            pid: p?.sourcePid ?? null,
            extract,
            start: anchors.start,
            end: anchors.end,
            context: p?.contexte ?? '',
            author: p?.auteur ?? null,
            sourceDate: isIsoDate(p?.feuille) ? p.feuille : date,
            resolved: Boolean(extract),
          }
        })
      }
      summaryVerdicts.push({
        code,
        status,
        rawStatus: o.rawStatus ?? null,
        courtCircuit: o.courtCircuit === true,
        confidence: typeof o.verdictConfidence === 'number' ? o.verdictConfidence : null,
        proofs: tSummaries.filter((t) => t.role === 'preuve').length,
        hints: tSummaries.filter((t) => t.role !== 'preuve').length,
        traces: tSummaries,
      })
      detailVerdicts[code] = { motif: o.motif ?? null, prescription: o.prescription ?? null, pedagogue: null, jury: null, president: null, pieces: [], traces: tDetails }

      // Droit de réponse : de l'état par lien à l'état par observation.
      const states = [...new Set(links.map((l) => (REVIEWS.has(l.reviewState) ? l.reviewState : 'unreviewed')))].filter((s) => s !== 'unreviewed')
      const notes = links.map((l) => l.learnerNote).filter((n) => typeof n === 'string' && n.trim())
      if (states.length > 0 || notes.length > 0) {
        const state = states.length === 1 ? states[0] : states.length > 1 ? 'nuanced' : 'unreviewed'
        const note = [states.length > 1 ? `États différents selon les traces dans V3 : ${states.join(', ')}.` : null, ...notes].filter(Boolean).join('\n')
        reviews[observationKey(date, variantId, code)] = { state, note: note.slice(0, 2000), updatedAt: now }
      }
    }

    // Rapports de pôle et kairos (narratifs dérivés V3).
    const poleReports = {}
    const kairos = {}
    for (const n of narrByVariant.get(v3Id) ?? []) {
      if (n.scope?.type === 'pole' && Number.isInteger(Number(n.scope.poleNum))) poleReports[Number(n.scope.poleNum)] = { portrait: null, denseTerritories: [], unvisited: null, emergences: null, leads: [], markdown: n.text ?? null }
      if (n.scope?.type === 'kairos') kairos[n.scope.field] = n.text
    }
    const kairosDetail = Object.keys(kairos).length
      ? {
          portrait: kairos.portrait ?? null,
          profileShape: kairos.formeProfil ?? null,
          linksAcrossPoles: kairos.ceQuiRelieLesPoles ?? null,
          betweenTheLines: kairos.ceQuiEmergeEntreLesLignes ?? null,
          invitations: [],
          markdown: kairos.syntheseCompleteMarkdown ?? null,
        }
      : null

    variants.push({
      date,
      summary: {
        id: variantId,
        digest,
        provenance: { source: 'v3-master', run: meta?.run ?? null, files: [fileName], model: null, prompt: null, analysedAt: null, importedAt: now },
        verdicts: summaryVerdicts,
        anomalies: [],
      },
      detail: { verdicts: detailVerdicts, passages: [], poleReports, audits: {}, kairos: kairosDetail, kairosRaw: null, emergences: null },
    })
  }

  // Choix de variante de chaque journée (V3 : activeVariantId, ou aucune = à arbitrer / à examiner).
  for (const day of master.days ?? []) {
    if (!isIsoDate(day.effectiveDate)) continue
    const chosen = day.activeVariantId ? idMap.get(day.activeVariantId) ?? null : null
    const many = (day.provenance ?? []).length > 1
    days.push({
      date: day.effectiveDate,
      active: true,
      tags: [],
      variantChoice: chosen ? (many ? 'learner' : 'auto') : many ? 'pending' : 'examine',
      activeVariantId: chosen,
      portfolio: null,
    })
  }

  if (unresolved > 0) report.push({ severity: 'warning', code: 'traces-sans-extrait', message: `${fileName} : ${unresolved} lien(s) de preuve non résolu(s) dans V3 — comptés, sans extrait` })
  report.push({ severity: 'info', code: 'master-v3', message: `${fileName} : master V3 converti — ${variants.length} variante(s) sur ${days.length} journée(s)` })
  if (master.referential?.id) report.push({ severity: 'info', code: 'referentiel-v3', message: `Le master V3 référence ${master.referential.id}@${master.referential.version ?? '?'} ; le référentiel du jeu courant est conservé` })
  return { variants, extras: { title: null, preferences: null, portfolioMeta: null, days, sets: [], reviews, markers: [], comparisons: [] }, report }
}
