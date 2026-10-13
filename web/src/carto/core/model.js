// Interface ultime — conteneur de données (spec §4 ; journal D-3, D-4).
//
// Le conteneur est le master V3 ÉTENDU : même enveloppe
// (`kind: "competency-map-master"`), mêmes notions (variantes avec provenance,
// variante active ou « à examiner », droit de réponse, narratifs), mais
// `schemaVersion: "4.x"` et une organisation PAR JOURNÉE :
//
//   jeu de données (index léger, toujours chargé)
//     referential   référentiel embarqué (archive autoporteuse)
//     days[]        une entrée par date : case cochée, étiquettes, variantes
//                   (verdicts RÉSUMÉS : code, statut, confiance, rôles des
//                   traces), volume du portfolio, anomalies
//     sets[]        ensembles nommés (§7, §9)
//     reviews{}     droit de réponse par observation (§8.2)
//     markers[], comparisons[], narratives[], metrics, preferences
//
//   détail d'une journée (chargé à la demande, un enregistrement par date)
//     portfolio     texte du portfolio de ce jour
//     variants{id}  extraits verbatim, ancres de surlignage, jury, pédagogue,
//                   pièces, rapports de pôle, kairos, émergences
//
// Tous les calculs du §5 n'utilisent QUE l'index : le détail ne sert qu'à
// l'affichage (traces, portfolio, réflexions du jury).

import { sha256Hex } from '../../v3/core/ids.js'
import { isIsoDate } from './dates.js'
import { toEmbeddedReferential } from './referential.js'
import { DEFAULT_PARAMS } from './formulas.js'

export const KIND = 'competency-map-master'
export const SCHEMA_VERSION = '4.0.0'

/** Gravités du rapport d'import (§3, repris de V3 ImportReportPanel). */
export const SEVERITIES = ['blocking', 'arbitrate', 'warning', 'info']
export const SEVERITY_LABELS = {
  blocking: 'Bloquant',
  arbitrate: 'À arbitrer',
  warning: 'Avertissement',
  info: 'Information',
}

/** États du droit de réponse (§8.2) ; « unreviewed » n'est JAMAIS affiché « Contestée ». */
/** Libellés des statuts normalisés d'un verdict. */
export const STATUS_LABELS = {
  established: 'présence établie',
  needs_review: 'renvoi au cartographe',
  not_established: 'présence non établie',
  unknown: 'statut inconnu',
}

/** Libellé d'un verdict résumé (court-circuit compris). */
export function verdictStatusLabel(v) {
  if (v?.courtCircuit) return 'non instruite (court-circuit)'
  return STATUS_LABELS[v?.status] ?? STATUS_LABELS.unknown
}

export const REVIEW_STATES = ['unreviewed', 'confirmed', 'nuanced', 'contested']
export const REVIEW_LABELS = {
  unreviewed: 'Non revue',
  confirmed: 'Confirmée',
  nuanced: 'Nuancée',
  contested: 'Contestée',
}

/** Choix de variante d'une journée. */
export const VARIANT_CHOICES = ['auto', 'learner', 'pending', 'examine']

/** Préférences par défaut (§4.1 « preferences », §5.8). */
export const DEFAULT_PREFERENCES = Object.freeze({
  calendarMode: 'school', // 'school' (août–juillet) | 'free'
  schoolYearStart: null, // année de début affichée (null = celle de la dernière journée)
  freeRange: null, // {from, to}
  reinforced: false, // distinctions renforcées (motifs)
  highContrast: false, // écran de contraste renforcé de la heatmap
  reducedMotion: 'system', // 'system' | 'reduce' | 'no-preference'
  speed: 1,
  params: { alpha: DEFAULT_PARAMS.alpha, minThicknessPx: DEFAULT_PARAMS.minThicknessPx },
  dashboardHidden: [], // cartes masquées du tableau de bord
  compare: null, // dernière comparaison A/B : {a: {name, def}, b: {name, def}, view}
  dashboardLayout: null, // grille de tuiles du tableau de bord : {order, sizes}
  momentsSensitivity: 50, // curseur des moments remarquables (0–100, pas de 5)
})

// ---------------------------------------------------------------------------
// Normalisations

const unaccent = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

/**
 * Statut historique → statut normalisé. « Toutes variantes d'établissement »
 * (présence établie, établie (cumulée)…) donnent `established` (§5.2).
 * @param {unknown} raw
 * @returns {'established'|'needs_review'|'not_established'|'unknown'}
 */
export function normalizeStatus(raw) {
  if (typeof raw !== 'string' || raw.trim() === '') return 'unknown'
  const s = unaccent(raw)
  if (/non[\s-]*etabli/.test(s) || /\babsente?\b/.test(s)) return 'not_established'
  if (/renvoi|arbitr|cartographe|entretien/.test(s)) return 'needs_review'
  if (/etabli/.test(s)) return 'established'
  return 'unknown'
}

/**
 * Rôle d'une trace → « preuve » ou « indice » (§4.1 trace.type). Un rôle
 * inconnu est traité comme un indice (valeur la plus prudente) et signalé
 * par l'importeur.
 * @returns {{role: 'preuve'|'indice', known: boolean}}
 */
export function normalizeRole(raw) {
  if (typeof raw !== 'string') return { role: 'indice', known: false }
  const s = unaccent(raw)
  if (s.startsWith('preuve')) return { role: 'preuve', known: true }
  if (s.startsWith('indice')) return { role: 'indice', known: true }
  return { role: 'indice', known: false }
}

/** Confiance numérique bornée à [0 ; 1], ou null. */
export function normalizeConfidence(raw) {
  const n = typeof raw === 'string' ? Number(raw.replace(',', '.')) : raw
  if (typeof n !== 'number' || !Number.isFinite(n)) return null
  if (n > 1 && n <= 100) return n / 100 // pourcentage
  return Math.min(1, Math.max(0, n))
}

/** Entier ≥ 0 (un compteur n'est jamais « undefined », §4.2). */
export function toCount(raw) {
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0
}

/** Identifiant déterministe court (même contenu → même identifiant). */
export function stableId(prefix, parts) {
  return `${prefix}-${sha256Hex(parts.map((p) => String(p ?? '')).join('␟')).slice(0, 20)}`
}

/**
 * Empreinte RAPIDE (non cryptographique, 128 bits « cyrb128 ») d'un contenu
 * volumineux : sert uniquement à reconnaître une analyse déjà importée
 * (doublons ignorés, §11), jamais à une garantie d'intégrité.
 * @param {string} str
 * @returns {string} 32 caractères hexadécimaux
 */
export function contentHash(str) {
  let h1 = 1779033703
  let h2 = 3144134277
  let h3 = 1013904242
  let h4 = 2773480762
  for (let i = 0, k; i < str.length; i++) {
    k = str.charCodeAt(i)
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067)
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233)
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213)
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179)
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067)
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233)
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213)
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179)
  h1 ^= h2 ^ h3 ^ h4
  h2 ^= h1
  h3 ^= h1
  h4 ^= h1
  return [h1, h2, h3, h4].map((h) => (h >>> 0).toString(16).padStart(8, '0')).join('')
}

/**
 * JSON canonique (clés triées récursivement) : deux sérialisations d'un même
 * contenu donnent la même chaîne, donc la même empreinte.
 */
export function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  return `{${Object.keys(value)
    .filter((k) => value[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`)
    .join(',')}}`
}

// ---------------------------------------------------------------------------
// Création

/**
 * Jeu de données vide.
 * @param {{datasetId?: string, title?: string, referential: object, now?: string}} opts
 */
export function createDataset({ datasetId, title = 'Ma cartographie', referential, now = new Date().toISOString() }) {
  return {
    kind: KIND,
    schemaVersion: SCHEMA_VERSION,
    datasetId: datasetId ?? stableId('ds', [title, now, Math.random()]),
    title,
    createdAt: now,
    updatedAt: now,
    referential: toEmbeddedReferential(referential),
    portfolio: null, // {title, source, importedAt, segmentCount, undated: [{title, text}]}
    days: [],
    sets: [],
    reviews: {},
    comparisons: [],
    markers: [],
    narratives: [],
    metrics: null,
    preferences: structuredClone(DEFAULT_PREFERENCES),
    importLog: [],
  }
}

/** Journée vide (index). */
export function createDay(date) {
  if (!isIsoDate(date)) throw new Error(`Date invalide : ${date}`)
  return {
    date,
    active: true,
    tags: [],
    activeVariantId: null,
    variantChoice: 'auto',
    variants: [],
    portfolio: null, // {chars, words}
    anomalies: [],
  }
}

/** Détail vide d'une journée. */
export function createDayDetail(date) {
  return { date, portfolio: null, variants: {} }
}

// ---------------------------------------------------------------------------
// Lecture

/**
 * Variante qui CONTRIBUE aux calculs (§3) : la variante active, sauf si la
 * journée est à arbitrer ou mise « à examiner ».
 * @returns {object | null}
 */
export function contributingVariant(day) {
  if (!day || !day.activeVariantId) return null
  if (day.variantChoice === 'pending' || day.variantChoice === 'examine') return null
  return day.variants.find((v) => v.id === day.activeVariantId) ?? null
}

/** La journée a-t-elle au moins une analyse importée ? */
export function hasAnalysis(day) {
  return Array.isArray(day?.variants) && day.variants.length > 0
}

/** La journée a-t-elle un segment de portfolio ? */
export function hasPortfolio(day) {
  return Boolean(day?.portfolio && day.portfolio.chars > 0)
}

/** Clé d'une observation (droit de réponse) : jour + variante + compétence. */
export function observationKey(date, variantId, code) {
  return `${date}|${variantId}|${code}`
}

/** Index date → journée. */
export function dayIndex(dataset) {
  return new Map(dataset.days.map((d) => [d.date, d]))
}

/** Dates triées des journées. */
export function sortedDates(dataset) {
  return dataset.days.map((d) => d.date).sort()
}

/** Dates COCHÉES (ensemble actif S du gestionnaire). */
export function activeDates(dataset) {
  return new Set(dataset.days.filter((d) => d.active).map((d) => d.date))
}

/** Anomalies d'une journée recalculées depuis son état (variantes, portfolio). */
export function dayAnomalies(day, { portfolioImported = false } = {}) {
  const out = []
  if (day.variants.length > 1 && day.variantChoice === 'pending') {
    out.push({ severity: 'arbitrate', code: 'variantes-a-arbitrer', message: `${day.variants.length} variantes : choisir celle qui contribue` })
  }
  if (day.variantChoice === 'examine') {
    out.push({ severity: 'info', code: 'a-examiner', message: 'Journée « à examiner » : ne contribue pas' })
  }
  if (hasAnalysis(day) && !hasPortfolio(day) && portfolioImported) {
    out.push({ severity: 'warning', code: 'sans-portfolio', message: 'Analyse sans portfolio : le surlignage des traces est indisponible' })
  }
  if (!hasAnalysis(day) && hasPortfolio(day)) {
    out.push({ severity: 'info', code: 'sans-analyse', message: 'Portfolio sans analyse' })
  }
  for (const v of day.variants) for (const a of v.anomalies ?? []) out.push(a)
  return out
}

/**
 * Badge « N anomalie(s) à traiter » (§3) : journées à arbitrer, passages du
 * portfolio sans date, et éléments bloquants du dernier import tant qu'il n'a
 * pas été marqué comme lu.
 */
export function todoCount(dataset) {
  const last = dataset.importLog?.at(-1)
  const blocking = last && !last.acknowledged ? last.severities?.blocking ?? 0 : 0
  return pendingAnomalyCount(dataset) + (dataset.portfolio?.undated?.length ?? 0) + blocking
}

/** Nombre d'anomalies « à traiter » (Bloquant ou À arbitrer) d'un jeu de données. */
export function pendingAnomalyCount(dataset) {
  let n = 0
  const portfolioImported = Boolean(dataset.portfolio)
  for (const d of dataset.days) {
    for (const a of dayAnomalies(d, { portfolioImported })) if (a.severity === 'blocking' || a.severity === 'arbitrate') n++
  }
  return n
}

// ---------------------------------------------------------------------------
// Validation de forme et migrations

/**
 * Erreurs de forme d'un jeu de données v4 (vide si valide).
 * @param {unknown} doc
 * @returns {string[]}
 */
export function datasetErrors(doc) {
  const errors = []
  if (!doc || typeof doc !== 'object') return ['Document illisible (objet attendu)']
  if (doc.kind !== KIND) errors.push(`kind ≠ ${KIND}`)
  if (typeof doc.schemaVersion !== 'string' || !doc.schemaVersion.startsWith('4.')) errors.push('schemaVersion 4.x attendu')
  if (!Array.isArray(doc.days)) errors.push('days : tableau attendu')
  if (!doc.referential) errors.push('référentiel embarqué absent')
  if (errors.length) return errors
  const seen = new Set()
  for (const d of doc.days) {
    if (!isIsoDate(d?.date)) errors.push(`journée à date invalide (${JSON.stringify(d?.date)})`)
    else if (seen.has(d.date)) errors.push(`journée ${d.date} dupliquée`)
    seen.add(d?.date)
    if (!Array.isArray(d?.variants)) errors.push(`journée ${d?.date} : variants[] attendu`)
    else if (d.activeVariantId && !d.variants.some((v) => v.id === d.activeVariantId)) {
      errors.push(`journée ${d.date} : variante active inconnue`)
    }
  }
  return errors
}

/**
 * Complète un jeu de données 4.x avec les champs apparus depuis (migration
 * douce, idempotente). Les versions 3.x (master V3) passent par l'importeur
 * dédié (`importers/v3-master.js`), pas par ici.
 */
export function upgradeDataset(doc) {
  const ds = structuredClone(doc)
  ds.sets ??= []
  ds.reviews ??= {}
  ds.comparisons ??= []
  ds.markers ??= []
  ds.narratives ??= []
  ds.metrics ??= null
  ds.importLog ??= []
  ds.portfolio ??= null
  ds.preferences = { ...structuredClone(DEFAULT_PREFERENCES), ...(ds.preferences ?? {}) }
  ds.preferences.params = { ...DEFAULT_PREFERENCES.params, ...(ds.preferences.params ?? {}) }
  for (const d of ds.days) {
    d.tags ??= []
    d.active ??= true
    d.anomalies ??= []
    d.variantChoice ??= d.activeVariantId ? 'auto' : d.variants?.length > 1 ? 'pending' : 'auto'
    d.portfolio ??= null
  }
  ds.days.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  ds.schemaVersion = SCHEMA_VERSION
  return ds
}
