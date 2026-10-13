// Interface ultime — « Préparer une démo » (spec §11.1) : anonymisation DANS
// LE NAVIGATEUR d'une archive avant de la déposer sur le serveur.
//
// - Les noms propres sont remplacés selon un dictionnaire fourni par
//   l'utilisateur ; des propositions sont tirées des mots à majuscule
//   fréquents (hors début de phrase).
// - Courriels, téléphones, liens et adresses sont remplacés par des repères
//   neutres.
// - Les MÊMES substitutions s'appliquent à tout le texte de l'archive :
//   portfolio, extraits et ancres de surlignage (début, fin), textes du jury,
//   rapports, narratifs, identifiants de journal : sans quoi le surlignage ne
//   retrouverait plus les passages. Le rapport vérifie trace par trace, avec
//   la même recherche que le lecteur, que chaque passage retrouvé avant l'est
//   encore après, au même endroit.
// - Les champs techniques (identifiants, empreintes, dates, codes, états) ne
//   reçoivent que les noms du dictionnaire — un nom de journal peut figurer
//   dans un identifiant de run, de façon cohérente partout — et jamais les
//   motifs : un identifiant hexadécimal peut contenir dix chiffres qui
//   ressemblent à un numéro de téléphone.
// - Le référentiel n'est pas touché (ce n'est pas une donnée personnelle).
// - Les phrases qui parlent d'une personne tierce sont signalées pour revue ;
//   celles que l'utilisateur choisit de retirer sont remplacées par
//   « [passage retiré] » partout où elles figurent (portfolio, extraits,
//   jury), avant les substitutions.
// - La table de correspondance n'est JAMAIS écrite dans l'export.

import { locateExtract } from './highlight.js'
import { findPassage } from './passages.js'
import { portfolioSummary } from './importers/portfolio.js'
import { sentences } from './stylometry.js'

export const REMOVED = '[passage retiré]'

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export const PATTERNS = Object.freeze({
  emails: { label: 'courriels', placeholder: '[courriel]', re: /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.\p{L}{2,}/gu },
  urls: { label: 'liens', placeholder: '[lien]', re: /\bhttps?:\/\/[^\s<>()"']*[^\s<>()"'.,;:!?…]|\bwww\.[^\s<>()"']*[^\s<>()"'.,;:!?…]/gu },
  phones: {
    label: 'téléphones',
    placeholder: '[téléphone]',
    re: /\+\d{2,3}[\s.-]?(?:\(0\)[\s.-]?)?\d{1,3}(?:[\s.-]?\d{2,3}){2,4}(?!\d)|(?<!\d)0[1-9](?:[\s.-]?\d{2}){4}(?!\d)|(?<!\d)0\d{2}[\s.-]?\d{3}[\s.-]?\d{2}[\s.-]?\d{2}(?!\d)/gu,
  },
  addresses: {
    label: 'adresses',
    placeholder: '[adresse]',
    re: /\b\d{1,4}\s?(?:bis|ter)?,?\s+(?:rue|avenue|av\.|boulevard|bd|chemin|ch\.|route|rte|place|impasse|allée|quai|cours|square)\s+(?:de\s+la\s+|du\s+|des\s+|de\s+l['’]|d['’]|de\s+)?[\p{L}'’-]+(?:\s+\p{Lu}[\p{L}'’-]+)*/giu,
  },
})

/** Repères neutres posés par les motifs (jamais proposés comme noms à revoir). */
const PLACEHOLDERS = new Set(Object.values(PATTERNS).map((p) => p.placeholder))

/**
 * Clés techniques : identifiants, empreintes, dates, codes, états. Elles ne
 * reçoivent que les noms du dictionnaire, jamais les motifs ni les retraits.
 */
const TECHNICAL_KEY = /^(?:id|key|digest|kind|schemaVersion|date|dates|code|codes|role|status|state|variantChoice|severity|at|pid|numero|run)$|(?:Id|Ids|At|Date|Ref)$/u

const NOT_NAMES = new Set(
  `je tu il elle on nous vous ils elles le la les un une des ce cet cette ces mon ma mes ton ta tes son sa ses notre votre leur leurs
  mais et ou donc or ni car puis alors ensuite enfin après avant pendant depuis quand comme si oui non ah oh bon bref
  en au aux du de dans pour par sur sous avec sans chez vers entre selon malgré
  lundi mardi mercredi jeudi vendredi samedi dimanche janvier février mars avril mai juin juillet août septembre octobre novembre décembre
  aujourd hier demain ce matin soir midi`.split(/\s+/u).filter(Boolean),
)

/**
 * Propositions de noms : mots à majuscule rencontrés AILLEURS qu'en début de
 * phrase ou de ligne, au moins `min` fois.
 * @param {string[]} texts
 * @returns {Array<{word: string, count: number}>}
 */
export function suggestNames(texts, { min = 2 } = {}) {
  const counts = new Map()
  for (const text of texts) {
    for (const line of String(text ?? '').split('\n')) {
      const clean = line.replace(/^\s*(?:#{1,6}|[-*+>]|\d+[.)])\s+/u, '')
      for (const m of clean.matchAll(/(?<=[^\s.!?…:]\s+|[,;]\s*)(\p{Lu}[\p{Ll}\p{M}'’-]{1,})/gu)) {
        const w = m[1].replace(/['’-]+$/u, '')
        if (NOT_NAMES.has(w.toLowerCase())) continue
        counts.set(w, (counts.get(w) ?? 0) + 1)
      }
    }
  }
  return [...counts.entries()].filter(([, c]) => c >= min).map(([word, count]) => ({ word, count })).sort((a, b) => b.count - a.count || a.word.localeCompare(b.word, 'fr'))
}

/**
 * Fonctions de remplacement, avec leurs compteurs.
 * @param {{dictionary?: Array<{from: string, to: string}>, patterns?: Record<string, boolean>}} opts
 * @returns {{apply: (s: string) => string, applyNames: (s: string) => string, applyPatterns: (s: string) => string, counts: Map<string, number>}}
 */
export function makeReplacer({ dictionary = [], patterns = { emails: true, urls: true, phones: true, addresses: true } } = {}) {
  const counts = new Map()
  const bump = (label, n) => n > 0 && counts.set(label, (counts.get(label) ?? 0) + n)
  const entries = cleanDictionary(dictionary)
    .sort((a, b) => b.from.length - a.from.length)
    .map((d) => ({
      ...d,
      label: `${d.from} → ${d.to}`,
      re: new RegExp(`(?<![\\p{L}\\p{M}\\p{N}])(?:${escapeRe(d.from)}|${escapeRe(d.from.toUpperCase())})(?![\\p{L}\\p{M}\\p{N}])`, 'gu'),
    }))
  const active = Object.entries(PATTERNS).filter(([k]) => patterns?.[k])
  function applyPatterns(text) {
    if (typeof text !== 'string' || text === '') return text
    let out = text
    for (const [, p] of active) {
      out = out.replace(p.re, () => {
        bump(p.label, 1)
        return p.placeholder
      })
    }
    return out
  }
  function applyNames(text) {
    if (typeof text !== 'string' || text === '') return text
    let out = text
    for (const d of entries) {
      out = out.replace(d.re, (m) => {
        bump(d.label, 1)
        return m === d.from.toUpperCase() && m !== d.from ? d.to.toUpperCase() : d.to
      })
    }
    return out
  }
  return { apply: (text) => applyNames(applyPatterns(text)), applyNames, applyPatterns, counts }
}

/** Entrées valides du dictionnaire (au moins deux caractères ; remplacement par défaut « [nom] »). */
export function cleanDictionary(dictionary) {
  const seen = new Set()
  const out = []
  for (const d of dictionary ?? []) {
    if (!d || typeof d.from !== 'string') continue
    const from = d.from.trim()
    if (from.length < 2 || seen.has(from)) continue
    seen.add(from)
    out.push({ from, to: String(d.to ?? '').trim() || '[nom]' })
  }
  return out
}

/** Nombre d'occurrences de chaque motif dans des textes (avant toute substitution). */
export function patternCounts(texts) {
  const out = {}
  for (const [k, p] of Object.entries(PATTERNS)) {
    let n = 0
    for (const t of texts) n += (String(t ?? '').match(p.re) ?? []).length
    out[k] = n
  }
  return out
}

/** Applique `fn(chaîne, clé)` à toutes les chaînes d'une valeur JSON (les clés d'objet ne changent pas). */
function mapStrings(value, fn, key = null) {
  if (typeof value === 'string') return fn(value, key)
  if (Array.isArray(value)) return value.map((v) => mapStrings(v, fn, key))
  if (value && typeof value === 'object') {
    const out = {}
    for (const [k, v] of Object.entries(value)) out[k] = mapStrings(v, fn, k)
    return out
  }
  return value
}

/** Parcourt toutes les chaînes « texte » (hors clés techniques et hors référentiel). */
function eachText(archive, fn) {
  for (const [k, v] of Object.entries(archive)) {
    if (k === 'referential') continue
    mapStrings(
      v,
      (s, key) => {
        if (!TECHNICAL_KEY.test(key ?? '')) fn(s, key)
        return s
      },
      k,
    )
  }
}

/** Toutes les traces d'une archive (avec extrait), avec leurs ancres. */
function tracesOf(archive) {
  const out = []
  for (const [date, d] of Object.entries(archive.details ?? {})) {
    for (const [variantId, v] of Object.entries(d?.variants ?? {})) {
      for (const [code, verdict] of Object.entries(v?.verdicts ?? {})) {
        for (const [id, t] of Object.entries(verdict?.traces ?? {})) {
          if (!t?.extract) continue
          out.push({ id, date, variantId, code, sourceDate: t.sourceDate ?? null, extract: t.extract, anchors: t.start ? { start: t.start, end: t.end ?? null } : { extract: t.extract } })
        }
      }
    }
  }
  return out
}

/**
 * Textes où chercher des noms : le portfolio (journées et passages non datés)
 * ou, sans portfolio, les extraits des traces.
 */
export function archiveTexts(archive) {
  const texts = []
  for (const d of Object.values(archive.details ?? {})) if (typeof d?.portfolio?.text === 'string') texts.push(d.portfolio.text)
  for (const u of archive.portfolio?.undated ?? []) if (typeof u?.text === 'string') texts.push(u.text)
  if (texts.length > 0) return texts
  return tracesOf(archive).map((t) => t.extract)
}

/** Phrases du portfolio qui citent une personne tierce (pour revue). */
export function thirdPartySentences(archive, names) {
  const list = names.filter((n) => typeof n === 'string' && n.trim().length >= 2).map((n) => n.trim())
  const wanted = list.map((n) => new RegExp(`(?<![\\p{L}\\p{M}])${escapeRe(n)}(?![\\p{L}\\p{M}])`, 'u'))
  if (wanted.length === 0) return []
  const out = []
  for (const [date, d] of Object.entries(archive.details ?? {}).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    const text = d?.portfolio?.text
    if (typeof text !== 'string') continue
    for (const s of sentences(text)) {
      const hits = list.filter((n, i) => wanted[i].test(s))
      if (hits.length) out.push({ date, sentence: s, names: hits })
    }
  }
  return out
}

/**
 * Statut de surlignage de chaque trace, calculé comme le lecteur : trouvée
 * (ou partielle) dans sa journée, retrouvée dans la feuille d'un autre jour,
 * non retrouvée.
 * @param {object} archive
 * @param {(portfolio: {text: string}, anchors: object) => Array<{complete: boolean, exact?: boolean}>} [locate]
 *   recherche dans le texte d'une journée — par défaut dans le texte brut ;
 *   l'interface fournit la recherche dans le texte affiché (Markdown rendu)
 * @returns {Map<string, {status: string, date: string, trace: object}>}
 */
export function highlightStatuses(archive, locate = (p, a) => locateExtract(p.text, a)) {
  const withText = Object.entries(archive.details ?? {})
    .filter(([, d]) => typeof d?.portfolio?.text === 'string')
    .map(([date]) => date)
    .sort()
  const out = new Map()
  for (const tr of tracesOf(archive)) {
    const r = findPassage({
      primary: tr.sourceDate ?? tr.date,
      secondary: tr.date,
      dates: withText,
      locate: (d) => {
        const p = archive.details[d]?.portfolio
        return p && typeof p.text === 'string' ? locate(p, tr.anchors) : null
      },
    })
    out.set(tr.id, { status: r.status, date: r.date, trace: tr })
  }
  return out
}

const RANK = { found: 3, relocated: 2, partial: 1, 'not-found': 0, 'no-text': 0 }

function statusCounts(statuses) {
  const c = { found: 0, partial: 0, relocated: 0, notFound: 0 }
  for (const { status } of statuses.values()) {
    if (status === 'found') c.found++
    else if (status === 'partial') c.partial++
    else if (status === 'relocated') c.relocated++
    else c.notFound++
  }
  return c
}

/** Retire des phrases partout où elles figurent ; un extrait entièrement contenu dans une phrase retirée part aussi. */
function cutPassages(value, cuts) {
  const found = new Set()
  if (cuts.length === 0) return { value, found }
  const fn = (s, key) => {
    if (TECHNICAL_KEY.test(key ?? '')) return s
    let out = s
    for (const c of cuts) {
      if (out.includes(c)) {
        out = out.split(c).join(REMOVED)
        found.add(c)
      }
    }
    const t = out.trim()
    if (t.length >= 12 && t !== REMOVED) {
      const host = cuts.find((c) => c.includes(t))
      if (host) {
        found.add(host)
        return REMOVED
      }
    }
    return out
  }
  return { value: mapStrings(value, fn), found }
}

/**
 * Anonymise une archive (fonction pure : l'archive d'entrée n'est pas modifiée).
 * @param {object} archive archive (buildArchive)
 * @param {{dictionary?: Array<{from: string, to: string}>, patterns?: Record<string, boolean>, pseudonym?: string,
 *   remove?: Array<{date?: string, sentence: string}>, now?: string,
 *   locate?: (portfolio: {text: string}, anchors: object) => Array<{complete: boolean, exact?: boolean}>}} opts
 * @returns {{archive: object, report: {
 *   replacements: Array<{label: string, count: number}>,
 *   removed: number,
 *   highlight: {traces: number, before: number, after: number, kept: number,
 *     statusBefore: object, statusAfter: object,
 *     broken: Array<{date: string, code: string, id: string, reason: 'retrait' | 'substitution', before: string, after: string}>},
 * }}}
 *   highlight.before / after : traces dont le passage est retrouvé (en entier ou en partie) avant / après ;
 *   kept : retrouvées après au même statut et dans la même journée.
 */
export function anonymizeArchive(archive, { dictionary = [], patterns, pseudonym = 'Démonstration', remove = [], now = new Date().toISOString(), locate } = {}) {
  const before = highlightStatuses(archive, locate)

  // 1. Passages retirés à la demande (contenu de tiers), avant toute substitution.
  const cuts = [...new Set(remove.map((r) => (typeof r?.sentence === 'string' ? r.sentence.trim() : '')).filter((s) => s.length >= 8))]
  const { referential, ...rest } = structuredClone(archive)
  const { value: cut, found } = cutPassages(rest, cuts)

  // 2. Les mêmes substitutions partout ; les champs techniques ne reçoivent que les noms.
  const { applyNames, applyPatterns, counts } = makeReplacer({ dictionary, patterns })
  const out = mapStrings(cut, (s, key) => (TECHNICAL_KEY.test(key ?? '') ? applyNames(s) : applyNames(applyPatterns(s))))
  out.referential = referential
  out.runDetails = Object.fromEntries(Object.entries(out.runDetails ?? {}).map(([k, v]) => [applyNames(k), v]))
  out.title = String(pseudonym ?? '').trim() || 'Démonstration'
  out.importLog = []
  // Volumes du portfolio recalculés sur le texte anonymisé.
  for (const day of out.days ?? []) {
    const text = out.details?.[day.date]?.portfolio?.text
    if (typeof text === 'string') day.portfolio = portfolioSummary(text)
  }
  out.anonymizedAt = now

  // 3. Le surlignage tient-il ? Même statut, même journée, pour chaque trace.
  const after = highlightStatuses(out, locate)
  const located = (s) => s && RANK[s.status] > 0
  const broken = []
  let kept = 0
  for (const [id, b] of before) {
    if (!located(b)) continue
    const a = after.get(id)
    if (a && a.status === b.status && a.date === b.date) {
      kept++
      continue
    }
    const tr = b.trace
    const touched = cuts.some((c) => c.includes(tr.extract) || tr.extract.includes(c) || (tr.anchors.start && c.includes(tr.anchors.start)) || (tr.anchors.end && c.includes(tr.anchors.end)))
    broken.push({ date: tr.date, code: tr.code, id, reason: touched || a?.trace?.extract === REMOVED ? 'retrait' : 'substitution', before: b.status, after: a?.status ?? 'absente' })
  }
  return {
    archive: out,
    report: {
      replacements: [...counts.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'fr')),
      removed: found.size,
      highlight: {
        traces: before.size,
        before: [...before.values()].filter(located).length,
        after: [...after.values()].filter(located).length,
        kept,
        statusBefore: statusCounts(before),
        statusAfter: statusCounts(after),
        broken,
      },
    },
  }
}

/**
 * Revue manuelle : mots à majuscule qui restent dans l'archive anonymisée
 * (portfolio, extraits, jury, noms de fichiers et titres), hors remplacements
 * et repères neutres.
 * @param {object} archive archive ANONYMISÉE
 * @param {Array<{from: string, to: string}>} dictionary
 * @returns {Array<{word: string, count: number}>}
 */
export function remainingNames(archive, dictionary = [], { min = 1 } = {}) {
  const replacements = new Set()
  for (const d of cleanDictionary(dictionary)) for (const w of d.to.split(/[\s'’-]+/u)) if (w) replacements.add(w)
  for (const p of PLACEHOLDERS) replacements.add(p.replace(/[[\]]/g, ''))
  // Le titre de la démo (pseudonyme) n'est pas un nom à revoir.
  for (const w of String(archive.title ?? '').split(/[\s'’()-]+/u)) if (w) replacements.add(w)
  const texts = []
  eachText(archive, (s, key) => {
    // Noms de fichiers et titres : chaque mot à majuscule compte, même en tête.
    if (key === 'source' || key === 'sources' || key === 'files' || key === 'title') texts.push(`· ${s.replace(/[_/\\.-]+/gu, ' ')}`)
    else texts.push(s)
  })
  return suggestNames(texts, { min }).filter((x) => !replacements.has(x.word) && !replacements.has(x.word.replace(/^\[|\]$/gu, '')))
}
