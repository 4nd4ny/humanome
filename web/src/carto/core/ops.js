// Interface ultime — opérations sur le jeu de données (gestionnaire §7,
// droit de réponse §8.2, ensembles §7/§9, repères §10, notes §9.4).
//
// Toutes les opérations sont PURES : elles renvoient un nouveau jeu de données
// (copie superficielle, seules les journées touchées sont recopiées) et ne
// mutent jamais l'entrée. Aucune ne touche aux verdicts importés : la source
// n'est jamais réécrite.

import { REVIEW_STATES, createDay, stableId } from './model.js'
import { portfolioSummary } from './importers/portfolio.js'
import { isIsoDate } from './dates.js'
import { resolveDefinition } from './sets.js'

const touch = (ds, now) => ({ ...ds, updatedAt: now ?? new Date().toISOString() })

/** Remplace les journées dont la date est dans `dates` par `fn(day)`. */
function mapDays(ds, dates, fn, now) {
  const wanted = dates instanceof Set ? dates : new Set(dates)
  return touch({ ...ds, days: ds.days.map((d) => (wanted.has(d.date) ? fn(d) : d)) }, now)
}

// ---- Cases à cocher (§7) -------------------------------------------------------

/** Coche (true) ou décoche (false) les journées données. */
export function setActive(ds, dates, active, { now } = {}) {
  return mapDays(ds, dates, (d) => (d.active === active ? d : { ...d, active }), now)
}

/** Bascule une journée. */
export function toggleDay(ds, date, { now } = {}) {
  const day = ds.days.find((d) => d.date === date)
  if (!day) return ds
  return setActive(ds, [date], !day.active, { now })
}

/** Tout cocher / ne rien cocher. */
export function checkAll(ds, active = true, { now } = {}) {
  return touch({ ...ds, days: ds.days.map((d) => (d.active === active ? d : { ...d, active })) }, now)
}

/** Inverser les cases. */
export function invertChecks(ds, { now } = {}) {
  return touch({ ...ds, days: ds.days.map((d) => ({ ...d, active: !d.active })) }, now)
}

/**
 * « Cocher jusqu'à ce jour » (ancien pivot) : coche les journées ≤ date et
 * décoche les suivantes. « Depuis ce jour » : l'inverse.
 * @param {'until'|'since'} direction
 */
export function checkRelativeTo(ds, date, direction, { now } = {}) {
  const on = direction === 'until' ? (d) => d.date <= date : (d) => d.date >= date
  return touch({ ...ds, days: ds.days.map((d) => (d.active === on(d) ? d : { ...d, active: on(d) })) }, now)
}

/** Remplace la sélection par exactement ces dates (rappel d'un ensemble nommé). */
export function selectExactly(ds, dates, { now } = {}) {
  const wanted = new Set(dates)
  return touch({ ...ds, days: ds.days.map((d) => (d.active === wanted.has(d.date) ? d : { ...d, active: wanted.has(d.date) })) }, now)
}

// ---- Étiquettes (§7) -------------------------------------------------------------

const cleanTag = (t) => String(t ?? '').replace(/\s+/g, ' ').trim().slice(0, 60)

/** Pose une étiquette libre sur des journées. */
export function addTag(ds, dates, tag, { now } = {}) {
  const t = cleanTag(tag)
  if (!t) return ds
  return mapDays(ds, dates, (d) => (d.tags.includes(t) ? d : { ...d, tags: [...d.tags, t].sort((a, b) => a.localeCompare(b, 'fr')) }), now)
}

/** Retire une étiquette des journées données (toutes si `dates` est null). */
export function removeTag(ds, tag, dates = null, { now } = {}) {
  const target = dates ?? ds.days.map((d) => d.date)
  return mapDays(ds, target, (d) => (d.tags.includes(tag) ? { ...d, tags: d.tags.filter((x) => x !== tag) } : d), now)
}

/** Renomme une étiquette partout (et dans les ensembles qui la citent). */
export function renameTag(ds, from, to, { now } = {}) {
  const t = cleanTag(to)
  if (!t || t === from) return ds
  const days = ds.days.map((d) =>
    d.tags.includes(from) ? { ...d, tags: [...new Set(d.tags.map((x) => (x === from ? t : x)))].sort((a, b) => a.localeCompare(b, 'fr')) } : d,
  )
  const sets = ds.sets.map((s) =>
    s.definition?.kind === 'tags' && s.definition.tags.includes(from)
      ? { ...s, definition: { ...s.definition, tags: s.definition.tags.map((x) => (x === from ? t : x)) } }
      : s,
  )
  return touch({ ...ds, days, sets }, now)
}

// ---- Variantes (§3, §7 arbitrage) ---------------------------------------------------

/**
 * Choisit la variante qui contribue, ou « à examiner » (variantId = null).
 * La source n'est jamais réécrite : seul le choix change.
 */
export function chooseVariant(ds, date, variantId, { now } = {}) {
  const day = ds.days.find((d) => d.date === date)
  if (!day) throw new Error(`Journée ${date} introuvable`)
  if (variantId !== null && !day.variants.some((v) => v.id === variantId)) {
    throw new Error('Variante étrangère à cette journée')
  }
  return mapDays(
    ds,
    [date],
    (d) => ({
      ...d,
      activeVariantId: variantId,
      variantChoice: variantId === null ? 'examine' : 'learner',
    }),
    now,
  )
}

// ---- Ensembles nommés (§7, §9) ----------------------------------------------------

/**
 * Enregistre un ensemble nommé. `freeze` fige l'instantané de ses dates.
 * @param {{name: string, definition: object, freeze?: boolean, id?: string}} input
 */
export function saveSet(ds, { name, definition, freeze = false, id = null }, { now } = {}) {
  const clean = String(name ?? '').trim().slice(0, 80)
  if (!clean) throw new Error('Un ensemble doit porter un nom')
  if (definition?.kind === 'dates' && !(definition.dates ?? []).every(isIsoDate)) throw new Error('Dates invalides')
  const at = now ?? new Date().toISOString()
  const record = {
    id: id ?? stableId('set', [clean, at, Math.random()]),
    name: clean,
    definition: structuredClone(definition),
    frozenDates: freeze ? resolveDefinition(definition, ds) : null,
    createdAt: at,
  }
  const sets = ds.sets.some((s) => s.id === record.id)
    ? ds.sets.map((s) => (s.id === record.id ? { ...record, createdAt: s.createdAt } : s))
    : [...ds.sets, record]
  return touch({ ...ds, sets }, at)
}

export function deleteSet(ds, id, { now } = {}) {
  return touch({ ...ds, sets: ds.sets.filter((s) => s.id !== id) }, now)
}

// ---- Droit de réponse (§8.2) ---------------------------------------------------------

/**
 * Confirmer / Nuancer / Contester une observation, avec note privée. Stocké,
 * jamais envoyé. Ne modifie aucun calcul (le miroir montre l'analyse ; la
 * réponse de l'apprenant est posée à côté).
 */
export function setReview(ds, key, state, note = undefined, { now } = {}) {
  if (!REVIEW_STATES.includes(state)) throw new Error(`État de revue inconnu : ${state}`)
  const at = now ?? new Date().toISOString()
  const prev = ds.reviews[key] ?? {}
  const next = { state, note: note === undefined ? prev.note ?? '' : String(note).slice(0, 2000), updatedAt: at }
  return touch({ ...ds, reviews: { ...ds.reviews, [key]: next } }, at)
}

// ---- Repères et phases (§10) ------------------------------------------------------------

/** Ajoute un repère (moment de bascule) ou une phase (période nommée). */
export function addMarker(ds, { date, label, kind = 'repere', to = null }, { now } = {}) {
  if (!isIsoDate(date) || (to !== null && !isIsoDate(to))) throw new Error('Date de repère invalide')
  const at = now ?? new Date().toISOString()
  const marker = { id: stableId('mk', [date, label, at, Math.random()]), date, to, kind, label: String(label ?? '').trim().slice(0, 80) || 'Repère' }
  return touch({ ...ds, markers: [...ds.markers, marker].sort((a, b) => (a.date < b.date ? -1 : 1)) }, at)
}

export function deleteMarker(ds, id, { now } = {}) {
  return touch({ ...ds, markers: ds.markers.filter((m) => m.id !== id) }, now)
}

// ---- Notes de comparaison (§9.4) -----------------------------------------------------------

/** Note libre de l'apprenant sur une comparaison A/B (clé = identifiants des ensembles). */
export function setComparisonNote(ds, { a, b, note }, { now } = {}) {
  const at = now ?? new Date().toISOString()
  const key = `${a}|${b}`
  const others = ds.comparisons.filter((c) => c.key !== key)
  return touch({ ...ds, comparisons: [...others, { key, a, b, note: String(note ?? '').slice(0, 10000), updatedAt: at }] }, at)
}

// ---- Préférences ------------------------------------------------------------------------------

export function setPreferences(ds, patch, { now } = {}) {
  const prefs = { ...ds.preferences, ...patch }
  if (patch.params) prefs.params = { ...ds.preferences.params, ...patch.params }
  return touch({ ...ds, preferences: prefs }, now)
}

/** Renomme le jeu de données (pseudonyme choisi par l'apprenant, §11). */
export function renameDataset(ds, title, { now } = {}) {
  const t = String(title ?? '').trim().slice(0, 120)
  return t ? touch({ ...ds, title: t }, now) : ds
}

// ---- Rapport d'import et passages sans date ------------------------------------------

/** Marque le dernier rapport d'import comme lu (le badge ne compte plus ses entrées). */
export function acknowledgeLastImport(ds, { now } = {}) {
  if (!ds.importLog?.length) return ds
  const log = ds.importLog.map((e, i) => (i === ds.importLog.length - 1 ? { ...e, acknowledged: true } : e))
  return touch({ ...ds, importLog: log }, now)
}

/**
 * Rattache un passage du portfolio resté sans date à une journée (§3.1). Si la
 * journée a déjà du texte, le passage est ajouté à la suite.
 * @returns {{dataset: object, detailPatches: Map<string, object>}}
 */
export function attachUndatedSegment(ds, index, date, { now } = {}) {
  if (!isIsoDate(date)) throw new Error('Date attendue au format AAAA-MM-JJ')
  const undated = ds.portfolio?.undated ?? []
  const seg = undated[index]
  if (!seg) throw new Error('Passage introuvable')
  const days = ds.days.map((d) => ({ ...d }))
  let day = days.find((d) => d.date === date)
  if (!day) {
    day = createDay(date)
    days.push(day)
    days.sort((a, b) => (a.date < b.date ? -1 : 1))
  }
  const added = portfolioSummary(seg.text)
  day.portfolio = day.portfolio ? { chars: day.portfolio.chars + 2 + added.chars, words: day.portfolio.words + added.words } : added
  const portfolio = { ...ds.portfolio, undated: undated.filter((_, i) => i !== index) }
  return {
    dataset: touch({ ...ds, days, portfolio }, now),
    detailPatches: new Map([[date, { portfolioAppend: { title: seg.title, text: seg.text, source: seg.source } }]]),
  }
}

/** Écarte un passage sans date (il n'est plus proposé au rattachement). */
export function discardUndatedSegment(ds, index, { now } = {}) {
  const undated = ds.portfolio?.undated ?? []
  return touch({ ...ds, portfolio: { ...ds.portfolio, undated: undated.filter((_, i) => i !== index) } }, now)
}
