// Interface V3 — parcours d'import et assemblage du master privé (spec §8, §9).
//
// L'import : inventorier → adapter → résoudre/signaler → normaliser → recalculer
// → rapporter → enregistrer une révision privée. Un fichier invalide est mis en
// quarantaine sans empêcher les autres journées (AC-DATA-01). Deux runs d'une
// même date ne sont JAMAIS additionnés : la journée est « à arbitrer » tant que
// l'utilisateur n'a pas choisi (AC-DATA-02, §8.2).

import { sha256Hex, sourceDocumentId, uuidV4, uuidV5 } from './ids.js'
import { ADAPTER_VERSION, adaptJourDocument } from './adapters.js'

export const SCHEMA_VERSION = '3.0.0'
export const METRIC_DAYS = { id: 'documented-days-v1', referenceDays: 64 }

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** Enveloppe master vide (spec §9.1). */
export function emptyMaster({ datasetId, referential, now }) {
  return {
    kind: 'competency-map-master',
    schemaVersion: SCHEMA_VERSION,
    datasetId,
    revision: { id: uuidV4(), parentId: null, number: 1, createdAt: now },
    referential: { id: referential.id, version: referential.version },
    metricDefinition: { ...METRIC_DAYS },
    sources: { importBatches: [], dayVariants: [], sourceDocuments: [] },
    days: [],
    portfolioDocuments: [],
    portfolioOccurrences: [],
    passages: [],
    observations: [],
    evidenceLinks: [],
    derivedNarratives: [],
    annotations: [],
    legacyExtensions: [],
  }
}

/**
 * Importe un lot de documents-jour (format du site ou contenu d'un ZIP
 * journalier décomposé) dans un master NEUF.
 *
 * @param {Array<{run: string, sourceDate: string, effectiveDate?: string, payload: object, rawBytes?: Uint8Array | string}>} entries
 *   run = identifiant de provenance ('site', 'Chris300-run#1', …) ;
 *   sourceDate = date historique immuable (nom du ZIP ou champ date) ;
 *   payload = document-jour parsé {date?, poles[], kairos?}.
 * @param {{referential: ReturnType<import('./referentiel.js').normalizeReferential>,
 *   datasetId?: string, now?: string}} opts
 * @returns {{master: object, report: Array}}
 */
export function importJourDocuments(entries, { referential, datasetId = uuidV4(), now = new Date().toISOString() }) {
  const master = emptyMaster({ datasetId, referential, now })
  const report = []
  const batchId = uuidV4()
  master.sources.importBatches.push({
    id: batchId,
    createdAt: now,
    adapter: 'jour-document',
    adapterVersion: ADAPTER_VERSION,
    entryCount: entries.length,
  })

  /** @type {Map<string, Array<object>>} variantes par date effective */
  const variantsByDate = new Map()

  for (const e of entries) {
    const sourceDate = e.sourceDate
    if (typeof sourceDate !== 'string' || !DATE_RE.test(sourceDate)) {
      report.push({ severity: 'blocking', code: 'date-absente', message: `Date source absente ou invalide (${String(sourceDate)}) — journée en quarantaine`, run: e.run })
      continue
    }
    const bytes = e.rawBytes ?? JSON.stringify(e.payload)
    const payloadDigest = sha256Hex(typeof bytes === 'string' ? bytes : bytes)
    const variantId = uuidV5(datasetId, ['variant', e.run, sourceDate, payloadDigest])
    const variant = {
      id: variantId,
      run: e.run,
      sourceDate,
      effectiveDate: e.effectiveDate ?? sourceDate,
      payloadDigest,
      state: 'active', // ajusté après regroupement (à arbitrer si concurrentes)
      documents: [],
    }
    // Un sourceDocument par pôle + un pour le kairos (mêmes octets d'origine :
    // l'empreinte du document-jour sert de payloadDigest partagé, la position
    // — pôle ou type — distingue les identifiants, §9.3).
    const docIdForPole = (poleNum) =>
      sourceDocumentId(datasetId, { sourceRun: e.run, sourceDate, sourcePoleOrType: `P${poleNum}`, payloadDigest })
    const docIdForKairos = () =>
      sourceDocumentId(datasetId, { sourceRun: e.run, sourceDate, sourcePoleOrType: 'kairos', payloadDigest })

    const adapted = adaptJourDocument(e.payload, { docIdForPole, docIdForKairos, dayKey: variantId })
    const blocking = adapted.report.filter((r) => r.severity === 'blocking')
    if (blocking.length > 0) {
      variant.state = 'quarantined'
      report.push(...adapted.report.map((r) => ({ ...r, run: e.run, sourceDate })))
      master.sources.dayVariants.push(variant)
      continue
    }
    report.push(...adapted.report.map((r) => ({ ...r, run: e.run, sourceDate })))

    for (const pole of e.payload.poles ?? []) {
      const poleNum = Number(pole?.poleNum)
      variant.documents.push({
        id: docIdForPole(poleNum),
        type: 'cartoPole',
        poleNum,
        payloadDigest,
        validation: 'valid',
        legacyAudit: pole?.auditPole ?? null,
      })
    }
    if (e.payload.kairos) {
      variant.documents.push({ id: docIdForKairos(), type: 'kairos', payloadDigest, validation: 'valid' })
    }
    master.sources.dayVariants.push(variant)
    variant.adapted = adapted // provisoire, consommé ci-dessous
    const list = variantsByDate.get(variant.effectiveDate) ?? []
    list.push(variant)
    variantsByDate.set(variant.effectiveDate, list)
  }

  // Regroupement par date : une seule variante = active ; plusieurs = à arbitrer
  // (aucune ne contribue tant que l'utilisateur n'a pas choisi, §8.2).
  for (const [date, variants] of [...variantsByDate.entries()].sort()) {
    const day = {
      id: uuidV5(datasetId, ['day', date]), // opaque et stable au premier import
      effectiveDate: date,
      sourceDate: date,
      activeVariantId: null,
      provenance: variants.map((v) => ({ variantId: v.id, run: v.run })),
    }
    if (variants.length === 1) {
      day.activeVariantId = variants[0].id
    } else {
      for (const v of variants) v.state = 'arbitrate'
      report.push({
        severity: 'arbitrate',
        code: 'variantes-concurrentes',
        message: `${variants.length} variantes pour la journée ${date} — à arbitrer, aucune ne contribue encore`,
        sourceDate: date,
      })
    }
    master.days.push(day)

    for (const v of variants) {
      const adapted = v.adapted
      delete v.adapted
      // Document de portfolio SYNTHÉTIQUE de provenance (§9.5) : le document
      // réel du portfolio n'est pas dans le corpus, seuls les extraits le sont.
      const docId = uuidV5(datasetId, ['portfolio-doc', v.id])
      master.portfolioDocuments.push({
        id: docId,
        type: 'provenance-synthetique',
        title: `Journée ${date} (${v.run})`,
        author: null,
        content: null,
        uri: null,
      })
      const occId = uuidV5(datasetId, ['occurrence', v.id])
      master.portfolioOccurrences.push({ id: occId, documentId: docId, dayId: day.id })

      for (const p of adapted.passages) {
        master.passages.push({ ...p, documentId: docId, occurrenceId: occId, dayId: day.id, variantId: v.id })
      }
      for (const o of adapted.observations) {
        master.observations.push({ ...o, dayId: day.id, variantId: v.id })
      }
      master.evidenceLinks.push(...adapted.evidenceLinks)
      for (const n of adapted.narratives) {
        master.derivedNarratives.push({ ...n, dayId: day.id, variantId: v.id })
      }
      for (const a of adapted.legacyAudits ?? []) {
        master.legacyExtensions.push({
          sourceDocumentId: v.documents.find((d) => d.poleNum === a.poleNum)?.id ?? null,
          jsonPointer: '/auditPole',
          value: a.audit,
          adapterVersion: ADAPTER_VERSION,
        })
      }
      master.sources.sourceDocuments.push(...v.documents.map((d) => ({ ...d, variantId: v.id, batchId })))
    }
  }

  // Codes hors référentiel : signalés, jamais supprimés.
  for (const obs of master.observations) {
    if (!referential.competencyByCode.has(obs.rawCode)) {
      report.push({
        severity: 'warning',
        code: 'code-hors-referentiel',
        message: `Code ${obs.rawCode} absent du référentiel ${referential.id}@${referential.version}`,
      })
    }
  }

  return { master, report }
}

/**
 * Arbitre la variante active d'une journée (spec §8.2). Retourne un NOUVEAU
 * master (la source n'est jamais réécrite — les révisions sont gérées par
 * master.js). Corriger la variante active ne modifie aucun identifiant source
 * (AC-DATA-09).
 *
 * @param {object} master
 * @param {string} dayId
 * @param {string | null} variantId variante choisie, ou null = « à examiner »
 */
export function chooseVariant(master, dayId, variantId) {
  const next = structuredClone(master)
  const day = next.days.find((d) => d.id === dayId)
  if (!day) throw new Error('Journée introuvable')
  const candidates = new Set(day.provenance.map((p) => p.variantId))
  if (variantId !== null && !candidates.has(variantId)) {
    throw new Error('Variante étrangère à cette journée')
  }
  day.activeVariantId = variantId
  for (const v of next.sources.dayVariants) {
    if (!candidates.has(v.id)) continue
    if (v.state === 'quarantined') continue
    v.state = variantId === null ? 'arbitrate' : v.id === variantId ? 'active' : 'inactive'
  }
  return next
}

/**
 * Corrige la date EFFECTIVE d'une journée (jamais sourceDate ni aucun
 * identifiant — AC-DATA-09). La justification est conservée en annotation.
 */
export function correctEffectiveDate(master, dayId, effectiveDate, justification, now = new Date().toISOString()) {
  if (!DATE_RE.test(effectiveDate)) throw new Error('Date attendue au format AAAA-MM-JJ')
  const next = structuredClone(master)
  const day = next.days.find((d) => d.id === dayId)
  if (!day) throw new Error('Journée introuvable')
  day.effectiveDate = effectiveDate
  next.annotations.push({
    id: uuidV4(),
    targetType: 'day',
    targetId: dayId,
    note: `Date corrigée : ${justification}`,
    tags: [],
    createdAt: now,
    updatedAt: now,
    effectiveDay: effectiveDate,
    originRevisionId: next.revision.id,
  })
  return next
}

/** Résumé du rapport par gravité (pour l'UI et les tests). */
export function summarizeReport(report) {
  const counts = { blocking: 0, arbitrate: 0, warning: 0, info: 0 }
  for (const r of report) counts[r.severity] = (counts[r.severity] ?? 0) + 1
  return counts
}
