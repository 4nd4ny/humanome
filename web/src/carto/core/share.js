// Interface ultime — version partagée (spec §12, phase 2, adultes uniquement).
//
// Ce qui part sur le serveur quand un apprenant adulte partage sa cartographie :
// un INSTANTANÉ FIGÉ, en LISTE POSITIVE. Seules les compétences retenues y
// figurent, avec leurs chiffres RECALCULÉS sur cette seule liste (un retrait
// ne laisse ni trou ni trace dans le soleil) ; les journées qui comptent sont
// celles où une compétence retenue est observée ; les dates sont arrondies à
// la précision choisie (jour, mois, ou masquées) ; les extraits sont ceux que
// la personne a choisis, relus, passés au masque des courriels, liens,
// téléphones et adresses, et aux remplacements de noms qu'elle a décidés.
//
// Jamais : le portfolio, les délibérations du jury, les réponses au jury, les
// notes, les étiquettes, les ensembles, les métriques. Le serveur le vérifie
// à son tour par liste blanche de champs (api/src/Share/SharedVersion.php) :
// les deux listes doivent rester identiques.

import { anglesFromIntensities, poleConfidence } from './formulas.js'
import { levelOf, levelThresholds } from './heatmap.js'
import { formatLong, monthKey, monthName } from './dates.js'
import { stripMarkdownMarks } from './highlight.js'
import { makeReplacer } from './anonymize.js'
import { normalizeReferential } from './referential.js'

export const SHARE_KIND = 'carto-partage'
export const SHARE_SCHEMA_VERSION = '1.0.0'
export const DATE_PRECISIONS = Object.freeze(['day', 'month', 'none'])
export const PRECISION_LABELS = Object.freeze({ day: 'au jour près', month: 'au mois près', none: 'masquées' })
export const MAX_EXTRACTS = 300
export const MAX_EXTRACT_CHARS = 2000
export const MAX_TITLE_CHARS = 190
/** Durée de validité proposée pour un lien (jours) — celle du serveur par défaut. */
export const DEFAULT_LINK_DAYS = 90
export const LINK_PASSWORD_MIN = 8

/** Masques appliqués par défaut aux extraits d'une version partagée. */
export const DEFAULT_SHARE_PATTERNS = Object.freeze({ emails: true, urls: true, phones: true, addresses: true })

/**
 * Configuration du module (spec §12.2) : `serverEnabled` active la copie
 * serveur et le lien (faux par défaut : la phase 1 et la copie autonome n'en
 * ont pas besoin) ; `adultOnly` réserve la fonction aux comptes qui ont
 * attesté leur majorité (vrai par défaut). Le serveur de humanome.xyz exige
 * l'attestation de toute façon (`required`) : le client ne peut qu'ajouter
 * une restriction, jamais en retirer une.
 * @param {{serverEnabled?: boolean, adultOnly?: boolean} | null | undefined} config
 */
export function normalizeShareConfig(config) {
  return { serverEnabled: config?.serverEnabled === true, adultOnly: config?.adultOnly !== false }
}

/**
 * L'attestation est-elle exigée avant d'offrir la fonction ?
 * @param {{adultOnly: boolean}} config
 * @param {{required?: boolean} | null} [server] réponse de GET api/auth/me/adult
 */
export function attestationRequired(config, server = null) {
  return config.adultOnly || server?.required === true
}

/** Une date AAAA-MM-JJ à la précision choisie (null quand les dates sont masquées). */
export function dateAtPrecision(iso, precision) {
  if (precision === 'none' || typeof iso !== 'string') return null
  return precision === 'month' ? monthKey(iso) : iso
}

/** Libellé lisible d'une date de version partagée (« 14 septembre 2025 », « septembre 2025 »). */
export function formatSharedDate(key, precision) {
  if (typeof key !== 'string' || precision === 'none') return ''
  if (precision === 'month') return `${monthName(key)} ${key.slice(0, 4)}`
  return formatLong(key)
}

const round = (n, d = 4) => (typeof n === 'number' && Number.isFinite(n) ? Math.round(n * 10 ** d) / 10 ** d : null)

/**
 * Coupe une chaîne à `max` caractères (points de code, jamais au milieu d'un
 * émoji : une moitié de paire de substitution rendrait le JSON illisible pour
 * le serveur), avec « … » si elle était plus longue.
 */
export function cut(text, max) {
  const chars = Array.from(String(text ?? ''))
  return chars.length > max ? `${chars.slice(0, max - 1).join('').trimEnd()}…` : chars.join('')
}

/** Longueur en points de code (celle que compte le serveur, mb_strlen). */
export const charLength = (text) => Array.from(String(text ?? '')).length

/** Texte d'un extrait tel qu'il sera publié : sans Markdown, blancs réduits, borné. */
export function cleanExtractText(text, replacer = null) {
  // Marques imbriquées (« > ### titre ») : on retire jusqu'à stabilité.
  let out = String(text ?? '')
  for (let i = 0; i < 4; i++) {
    const next = stripMarkdownMarks(out)
    if (next === out) break
    out = next
  }
  out = out.replace(/\s+/gu, ' ').trim()
  if (replacer) out = replacer.apply(out)
  return cut(out, MAX_EXTRACT_CHARS)
}

/** Titre tel qu'il sera publié : blancs réduits, mêmes masques et remplacements de noms que les extraits. */
export function cleanTitle(title, replacer = null) {
  let out = String(title ?? '').replace(/\s+/gu, ' ').trim()
  if (replacer) out = replacer.apply(out)
  return out
}

/**
 * Traces des compétences retenues, candidates au statut d'extrait (le texte
 * vient du détail de la journée, chargé à la demande par l'interface).
 * @param {object} state computeState(...)
 * @param {object} ref référentiel normalisé
 * @param {Iterable<string>} codes compétences retenues
 * @returns {Array<{key: string, code: string, date: string, variantId: string, traceId: string, role: string}>}
 */
export function extractCandidates(state, ref, codes) {
  const wanted = new Set(codes)
  const out = []
  for (const c of ref.competencies) {
    if (!wanted.has(c.code)) continue
    const s = state.competencies.get(c.code)
    if (!s) continue
    const traces = [...s.traces].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.role === b.role ? 0 : a.role === 'preuve' ? -1 : 1))
    for (const t of traces) {
      out.push({ key: `${c.code}|${t.date}|${t.variantId}|${t.id}`, code: c.code, date: t.date, variantId: t.variantId, traceId: t.id, role: t.role === 'preuve' ? 'preuve' : 'indice' })
    }
  }
  return out
}

/**
 * Construit la version partagée (objet JSON prêt à être publié).
 *
 * @param {{
 *   state: object,                 // computeState(...) : ensemble coché jusqu'à t
 *   ref: object,                   // référentiel normalisé
 *   title: string,
 *   codes: Iterable<string>,       // compétences retenues (liste positive)
 *   precision?: 'day' | 'month' | 'none',
 *   extracts?: Array<{code: string, date: string, role: string, text: string}>,
 *   dictionary?: Array<{from: string, to: string}>, // remplacements de noms décidés à la relecture
 *   patterns?: Record<string, boolean>,             // masques (courriels, liens, téléphones, adresses)
 *   now?: string,
 * }} input
 * @returns {object} version partagée (kind « carto-partage »)
 * @throws {Error} message français si la version serait vide ou sans titre
 */
export function buildSharedVersion({ state, ref, title, codes, precision = 'month', extracts = [], dictionary = [], patterns = DEFAULT_SHARE_PATTERNS, now = new Date().toISOString() }) {
  if (!DATE_PRECISIONS.includes(precision)) throw new Error('Précision des dates inconnue.')
  // Les mêmes masques et remplacements de noms que pour les extraits.
  const replacer = makeReplacer({ dictionary, patterns })
  const publishedTitle = cleanTitle(title, replacer)
  if (publishedTitle === '') throw new Error('Donnez un titre à la version partagée.')
  if (charLength(publishedTitle) > MAX_TITLE_CHARS) throw new Error(`Le titre compte ${MAX_TITLE_CHARS} caractères au plus.`)

  // 1. Compétences retenues, dans l'ordre du référentiel, chiffres recalculés.
  const wanted = new Set(codes)
  const retained = ref.competencies.map((c) => state.competencies.get(c.code)).filter((s) => s && wanted.has(s.code) && s.intensity > 0)
  if (retained.length === 0) throw new Error('Gardez au moins une compétence dans la version partagée.')
  const thetas = anglesFromIntensities(new Map(retained.map((s) => [s.code, s.intensity])))
  const competencies = retained.map((s) => ({
    code: s.code,
    pole: s.pole,
    theta: round(thetas.get(s.code) ?? 0),
    intensity: round(s.intensity),
    confidence: round(s.confidence),
    status: s.status === 'established' ? 'established' : 'needs_review',
    days: s.days.length,
    proofs: s.proofs,
    hints: s.hints,
  }))
  const poles = []
  for (const pole of ref.poles) {
    const members = competencies.filter((c) => c.pole === pole.num && c.theta > 0)
    if (members.length === 0) continue
    poles.push({
      num: pole.num,
      theta: round(members.reduce((sum, c) => sum + c.theta, 0)),
      intensity: round(members.reduce((sum, c) => sum + c.intensity, 0)),
      confidence: round(poleConfidence(members)),
      codes: members.map((c) => c.code),
      needsReviewOnly: members.every((c) => c.status === 'needs_review'),
    })
  }

  // 2. Journées : celles où une compétence retenue est observée.
  const days = [...new Set(retained.flatMap((s) => s.days))].sort()
  const keyOf = (iso) => dateAtPrecision(iso, precision)
  const dates = precision === 'none' ? [] : [...new Set(days.map(keyOf))]
  const period = precision === 'none' || days.length === 0 ? null : { from: keyOf(days[0]), to: keyOf(days.at(-1)) }

  // 3. Heatmap : poids des traces des seules compétences retenues, par jour
  //    ou par mois, en cinq niveaux ipsatifs (jamais le volume du portfolio).
  let heatmap = null
  if (precision !== 'none') {
    const value = new Map()
    const dayCount = new Map()
    for (const s of retained) {
      for (const t of s.traces) {
        const k = keyOf(t.date)
        value.set(k, (value.get(k) ?? 0) + (t.weight ?? 0))
      }
    }
    for (const d of days) dayCount.set(keyOf(d), (dayCount.get(keyOf(d)) ?? 0) + 1)
    const thresholds = levelThresholds([...value.values()])
    heatmap = {
      precision,
      cells: dates.map((k) => ({ key: k, level: levelOf(value.get(k) ?? 0, thresholds), days: dayCount.get(k) ?? 0 })),
    }
  }

  // 4. Extraits choisis : relus, masqués, bornés ; jamais d'une compétence retirée.
  const seen = new Set()
  const cleanExtracts = []
  for (const e of extracts) {
    if (!competencies.some((c) => c.code === e?.code)) continue
    const text = cleanExtractText(e.text, replacer)
    if (text === '') continue
    const item = { code: e.code, date: keyOf(e.date), role: e.role === 'preuve' ? 'preuve' : 'indice', text }
    const id = `${item.code}|${item.date}|${item.text}`
    if (seen.has(id)) continue
    seen.add(id)
    cleanExtracts.push(item)
    if (cleanExtracts.length >= MAX_EXTRACTS) break
  }

  // 5. Référentiel embarqué : tous les pôles (donnée publique, symboles
  //    stables), les seules compétences retenues.
  const kept = new Set(competencies.map((c) => c.code))
  const color = (c) => (typeof c === 'string' && /^#[0-9A-Fa-f]{3,8}$/u.test(c) ? c : null)
  const referential = {
    id: cut(ref.id ?? 'referentiel', 100),
    version: cut(ref.version ?? '0.0.0', 40),
    label: cut(ref.label ?? ref.id ?? 'Référentiel', 300),
    poles: ref.poles.map((p) => ({ num: p.num, nom: cut(p.name, 300), couleur: color(p.color) })),
    competences: ref.competencies
      .filter((c) => kept.has(c.code))
      .map((c) => ({ code: c.code, nom: cut(c.name, 300), pole: c.pole, description: cut(c.description ?? '', 4000) })),
  }

  return {
    kind: SHARE_KIND,
    schemaVersion: SHARE_SCHEMA_VERSION,
    title: publishedTitle,
    publishedAt: now,
    datePrecision: precision,
    period,
    referential,
    state: { dayCount: days.length, dates, competencies, poles },
    heatmap,
    extracts: cleanExtracts,
  }
}

/** Le document ressemble-t-il à une version partagée lisible par ce client ? */
export function isSharedVersion(doc) {
  return Boolean(doc && doc.kind === SHARE_KIND && typeof doc.schemaVersion === 'string' && doc.schemaVersion.startsWith('1.') && doc.state && doc.referential)
}

/**
 * Ce que dessinent le soleil et la liste à partir d'une version partagée :
 * référentiel normalisé et état au format de computeState (les journées n'y
 * sont que comptées).
 * @param {object} doc version partagée
 * @returns {{ref: object, state: object}}
 */
export function sharedState(doc) {
  const ref = normalizeReferential(doc.referential)
  const competencies = new Map()
  let totalIntensity = 0
  for (const c of doc.state.competencies ?? []) {
    totalIntensity += c.intensity ?? 0
    competencies.set(c.code, {
      ...c,
      days: Array.from({ length: Number(c.days) || 0 }, () => null),
      traces: [],
      verdicts: [],
    })
  }
  const poles = new Map(
    (doc.state.poles ?? []).map((p) => [p.num, { ...p, codes: (Array.isArray(p.codes) ? p.codes : []).filter((code) => competencies.has(code)) }]),
  )
  return {
    ref,
    state: {
      until: null,
      dates: Array.from({ length: Number(doc.state.dayCount) || 0 }, () => null),
      competencies,
      poles,
      totalIntensity,
      outOfReferential: [],
      excluded: {},
    },
  }
}

/**
 * Lien absolu à transmettre, depuis l'URL relative renvoyée par l'API
 * (« /#/partage/<jeton>[/ouvert] ») et l'adresse de la page courante.
 */
export function absoluteShareUrl(url, location = globalThis.location) {
  const hash = String(url ?? '').slice(String(url ?? '').indexOf('#'))
  const base = location ? `${location.origin}${location.pathname}` : ''
  return `${base}${hash}`
}

/**
 * Points de relecture avant publication (§12.2 : « les contenus tiers
 * présents dans un portfolio exigent une étape de revue ») : mots à
 * majuscule qui pourraient être des noms, et motifs repérés, dans le titre
 * et les extraits retenus.
 * @param {{title: string, extracts: Array<{text: string}>}} draft
 * @param {Array<{from: string}>} [dictionary] noms déjà remplacés (exclus des propositions)
 */
export function reviewPoints({ title, extracts }, dictionary = []) {
  const texts = [String(title ?? ''), ...extracts.map((e) => String(e.text ?? ''))]
  const done = new Set(dictionary.map((d) => String(d.from).toLowerCase()))
  const names = []
  for (const text of texts) {
    // Toute majuscule compte ici, même en début de phrase : un extrait est
    // court, mieux vaut une proposition de trop qu'un nom publié.
    for (const m of text.normalize('NFC').matchAll(/\p{Lu}[\p{Ll}\p{M}]+(?:-\p{Lu}[\p{Ll}\p{M}]+)*/gu)) {
      const w = m[0]
      if (done.has(w.toLowerCase()) || names.includes(w) || COMMON_STARTS.has(w.toLowerCase())) continue
      names.push(w)
    }
  }
  return { names }
}

// Mots courants en début de phrase, jamais proposés comme noms.
const COMMON_STARTS = new Set(
  `je j tu il elle on nous vous ils elles le la les l un une des ce cet cette ces c ça cela mon ma mes ton ta tes son sa ses notre votre leur leurs
  mais et ou donc or ni car puis alors ensuite enfin après avant pendant depuis quand comme si oui non ah oh bon bref aujourd hier demain
  en au aux du de d dans pour par sur sous avec sans chez vers entre selon malgré qui que quoi où dont lorsque parce
  lundi mardi mercredi jeudi vendredi samedi dimanche janvier février mars avril mai juin juillet août septembre octobre novembre décembre
  ce cette c est ai a été était avais avait suis sommes sont fut fait faire j'ai voilà ici là tout tous toute toutes très plus moins aussi encore déjà
  premier première deuxième dernier dernière`.split(/\s+/u).filter(Boolean),
)
