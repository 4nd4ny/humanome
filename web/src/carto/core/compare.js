// Interface ultime — comparaison de soi à soi (spec §9).
//
// Deux ensembles A et B de journées de la MÊME personne : deux périodes, deux
// étiquettes, deux sélections, deux ensembles nommés, ou deux analyses du même
// portfolio. Rien ici ne dit lequel est « meilleur » : pas de rang de
// compétences, pas de couleur de verdict, pas de mot de valence ; seulement
// des parts ipsatives (à somme nulle), des points absolus, des
// confiances, des nombres de journées et des écarts B − A.

import { computeState } from './state.js'
import { contributingVariant } from './model.js'
import { resolveDefinition, resolveSetDates, describeDefinition, overlap } from './sets.js'
import { TRACE_PROVIDING_STATUSES, resolveParams, tracePoints, traceWeight } from './formulas.js'
import { addDays, formatLong, formatShort, schoolYearOf } from './dates.js'

export const COMPARE_KINDS = ['selection', 'set', 'period', 'tags', 'run']

/** Échelle commune d'un radar : max(A, B) arrondi au point supérieur (1 % sous 10 %, sinon 5 %), sans plafond fixe. */
export function radarScale(values) {
  const m = Math.max(0.01, ...values)
  const step = m < 0.1 ? 0.01 : 0.05
  return Math.round(Math.ceil(m / step - 1e-9) * step * 100) / 100
}

/** Planchers sous lesquels un écart relatif n'a pas de sens (Δ absolu seulement). */
export const RELATIVE_FLOOR = Object.freeze({ share: 0.02, intensity: 0.1 })

/** Analyses distinctes du jeu (source + run), pour comparer deux analyses du même portfolio. */
export function analysisRuns(dataset) {
  const runs = new Map()
  for (const day of dataset.days) {
    for (const v of day.variants ?? []) {
      const source = v.provenance?.source ?? 'inconnue'
      const run = v.provenance?.run ?? null
      const key = `${source}|${run ?? ''}`
      if (!runs.has(key)) runs.set(key, { key, source, run, dates: new Set() })
      runs.get(key).dates.add(day.date)
    }
  }
  return [...runs.values()].map((r) => ({ key: r.key, source: r.source, run: r.run, days: r.dates.size })).sort((a, b) => (a.key < b.key ? -1 : 1))
}

/**
 * Résout un côté de la comparaison.
 * @param {object} dataset
 * @param {{name?: string, def: object}} side def : {kind: 'selection'} | {kind: 'set', id} | {kind: 'period', from, to, onlyActive?}
 *   | {kind: 'tags', tags, match?} | {kind: 'run', source, run}
 * @returns {{name: string, def: object, dates: string[], variantOf: (day: object) => object | null, label: string}}
 */
export function resolveSide(dataset, side) {
  const def = side?.def ?? { kind: 'selection' }
  let dates = []
  let variantOf = contributingVariant
  let label = describeDefinition(def)
  if (def.kind === 'set') {
    const set = dataset.sets.find((s) => s.id === def.id)
    dates = set ? resolveSetDates(set, dataset) : []
    label = set ? `ensemble « ${set.name} »${set.frozenDates ? ' (figé)' : ''}` : 'ensemble introuvable'
  } else if (def.kind === 'run') {
    const pick = (day) => (day.variants ?? []).find((v) => (v.provenance?.source ?? 'inconnue') === def.source && (v.provenance?.run ?? null) === (def.run ?? null)) ?? null
    dates = dataset.days.filter((d) => pick(d)).map((d) => d.date)
    variantOf = pick
    label = `analyse ${def.source}${def.run ? ` — ${def.run}` : ''}`
  } else {
    dates = resolveDefinition(def, dataset)
  }
  return { name: String(side?.name ?? '').trim() || label, def, dates, variantOf, label }
}

/** Début du trimestre civil d'une date. */
function quarterStart(date) {
  const [y, m] = date.split('-').map(Number)
  const q = m <= 3 ? 1 : m <= 6 ? 4 : m <= 9 ? 7 : 10
  return `${y}-${String(q).padStart(2, '0')}-01`
}

/**
 * Préréglages (V3 `resolveBaselinePreset`, ramené à deux ensembles) :
 * « première et seconde moitié » coupe en deux les journées analysées, dans
 * l'ordre du temps — le début du portfolio face à sa fin ; A prend la journée
 * de plus quand leur nombre est impair (comparaison par défaut, journal carto
 * D-51 ; la date de référence n'y joue pas) ; les trois suivants comparent
 * l'état cumulé à une date repère et l'état cumulé à la date de référence
 * (B contient A : c'est signalé) ; le dernier compare deux années scolaires
 * disjointes. Seules les journées cochées comptent.
 * @param {object} dataset
 * @param {'halves' | 'last-evaluation' | 'quarter-start' | 'school-year-start' | 'previous-school-year'} preset
 * @param {{refDate?: string | null}} [opts] date de référence (t), sinon la dernière journée cochée analysée
 * @returns {{a: {name: string, def: object}, b: {name: string, def: object}} | {unavailable: string}}
 */
export function comparePreset(dataset, preset, { refDate = null } = {}) {
  const analysed = dataset.days.filter((d) => d.active && contributingVariant(d)).map((d) => d.date).sort()
  if (analysed.length === 0) return { unavailable: 'Aucune journée cochée avec une analyse : rien à comparer.' }
  if (preset === 'halves') {
    if (analysed.length < 2) return { unavailable: 'Il faut au moins deux journées analysées et cochées pour les couper en deux.' }
    const cut = Math.ceil(analysed.length / 2)
    const half = (name, dates) => ({ name, def: { kind: 'period', from: dates[0], to: dates.at(-1), onlyActive: true } })
    return { a: half('Première moitié', analysed.slice(0, cut)), b: half('Seconde moitié', analysed.slice(cut)) }
  }
  const ref = refDate ?? analysed.at(-1)
  const until = (to, name) => ({ name, def: { kind: 'period', from: null, to, onlyActive: true } })
  const cumulative = (baseline, what) => {
    if (!analysed.some((d) => d <= baseline)) return { unavailable: `Aucune journée analysée avant ${what} : ce préréglage est indisponible.` }
    return { a: until(baseline, `Jusqu’au ${formatShort(baseline)}`), b: until(ref, `Jusqu’au ${formatShort(ref)}`) }
  }
  if (preset === 'last-evaluation') {
    const prev = analysed.filter((d) => d < ref).at(-1)
    if (!prev) return { unavailable: 'Aucune journée analysée avant la date de référence : « depuis la dernière évaluation » est indisponible.' }
    return cumulative(prev, 'la dernière évaluation')
  }
  if (preset === 'quarter-start') return cumulative(addDays(quarterStart(ref), -1), `le début du trimestre (${formatLong(quarterStart(ref))})`)
  if (preset === 'school-year-start') {
    const sy = schoolYearOf(ref)
    return cumulative(addDays(sy.start, -1), `le début de l’année scolaire ${sy.label}`)
  }
  if (preset === 'previous-school-year') {
    const cur = schoolYearOf(ref)
    const prev = schoolYearOf(addDays(cur.start, -1))
    if (!analysed.some((d) => d >= prev.start && d <= prev.end)) return { unavailable: `Aucune journée analysée pendant l’année scolaire ${prev.label}.` }
    return {
      a: { name: `Année ${prev.label}`, def: { kind: 'period', from: prev.start, to: prev.end, onlyActive: true } },
      b: { name: `Année ${cur.label}`, def: { kind: 'period', from: cur.start, to: ref, onlyActive: true } },
    }
  }
  throw new Error(`Préréglage inconnu : ${preset}`)
}

/**
 * Points de chaque compétence, journée par journée (traces de ce seul jour).
 * @returns {Map<string, Array<{date: string, intensity: number}>>}
 */
export function dayIntensities(dataset, ref, dates, variantOf = contributingVariant, params) {
  const p = resolveParams(params)
  const wanted = new Set(dates)
  const out = new Map()
  for (const day of dataset.days) {
    if (!wanted.has(day.date)) continue
    const variant = variantOf(day)
    if (!variant) continue
    for (const v of variant.verdicts) {
      if (v.courtCircuit || !TRACE_PROVIDING_STATUSES.has(v.status) || !v.traces?.length || !ref.compByCode.has(v.code)) continue
      const intensity = tracePoints(v.traces.map((t) => traceWeight(t.role, p, 0)))
      if (!out.has(v.code)) out.set(v.code, [])
      out.get(v.code).push({ date: day.date, intensity })
    }
  }
  return out
}

/** Moyenne, min, max et écart-type (population) sur les journées observées. */
export function describe(values) {
  const n = values.length
  if (n === 0) return { n: 0, mean: null, min: null, max: null, sd: null }
  const mean = values.reduce((s, x) => s + x, 0) / n
  const sd = Math.sqrt(values.reduce((s, x) => s + (x - mean) ** 2, 0) / n)
  return { n, mean, min: Math.min(...values), max: Math.max(...values), sd }
}

function sideStats(entry, perDay) {
  if (!entry) return null
  return {
    share: entry.theta / 360,
    intensity: entry.intensity,
    confidence: entry.confidence,
    days: entry.days?.length ?? entry.n ?? 0,
    ...describe(perDay.map((x) => x.intensity)),
  }
}

function deltas(a, b) {
  const d = {
    share: (b?.share ?? 0) - (a?.share ?? 0),
    intensity: (b?.intensity ?? 0) - (a?.intensity ?? 0),
    confidence: a && b && a.confidence !== null && b.confidence !== null ? b.confidence - a.confidence : null,
    days: (b?.days ?? 0) - (a?.days ?? 0),
  }
  return {
    ...d,
    shareRel: a && a.share >= RELATIVE_FLOOR.share ? d.share / a.share : null,
    intensityRel: a && a.intensity >= RELATIVE_FLOOR.intensity ? d.intensity / a.intensity : null,
  }
}

/**
 * Compare deux côtés.
 * @param {object} dataset
 * @param {ReturnType<import('./referential.js').normalizeReferential>} ref
 * @param {{name?: string, def: object}} sideA
 * @param {{name?: string, def: object}} sideB
 * @param {{params?: object}} [opts]
 */
export function compareSets(dataset, ref, sideA, sideB, { params } = {}) {
  const A = resolveSide(dataset, sideA)
  const B = resolveSide(dataset, sideB)
  const stateA = computeState(dataset, { ref, dates: A.dates, params, variantOf: A.variantOf })
  const stateB = computeState(dataset, { ref, dates: B.dates, params, variantOf: B.variantOf })
  const perDayA = dayIntensities(dataset, ref, stateA.dates, A.variantOf, params)
  const perDayB = dayIntensities(dataset, ref, stateB.dates, B.variantOf, params)

  const rows = []
  for (const c of ref.competencies) {
    const ea = stateA.competencies.get(c.code)
    const eb = stateB.competencies.get(c.code)
    if (!ea && !eb) continue
    const a = sideStats(ea, perDayA.get(c.code) ?? [])
    const b = sideStats(eb, perDayB.get(c.code) ?? [])
    rows.push({ code: c.code, pole: c.pole, a, b, delta: deltas(a, b) })
  }

  const poleRows = []
  for (const pole of ref.poles) {
    const pa = stateA.poles.get(pole.num)
    const pb = stateB.poles.get(pole.num)
    if (!pa && !pb) continue
    const poleSide = (st, ps, perDay) => {
      if (!ps) return null
      const byDate = new Map()
      for (const code of ps.codes) for (const x of perDay.get(code) ?? []) byDate.set(x.date, (byDate.get(x.date) ?? 0) + x.intensity)
      return { share: ps.theta / 360, intensity: ps.intensity, confidence: ps.confidence, days: byDate.size, ...describe([...byDate.values()]) }
    }
    const a = poleSide(stateA, pa, perDayA)
    const b = poleSide(stateB, pb, perDayB)
    poleRows.push({ num: pole.num, a, b, delta: deltas(a, b) })
  }

  const codesA = new Set(stateA.competencies.keys())
  const codesB = new Set(stateB.competencies.keys())
  const inOrder = (pred) => ref.competencies.map((c) => c.code).filter(pred)
  const top5 = (st) => [...st.competencies.values()].map((c) => c.theta / 360).sort((x, y) => y - x).slice(0, 5).reduce((s, x) => s + x, 0)
  const ov = overlap(stateA.dates, stateB.dates)
  const warnings = []
  if (stateA.dates.length === 0) warnings.push({ code: 'empty-a', text: `A (« ${A.name} ») ne contient aucune journée analysée.` })
  if (stateB.dates.length === 0) warnings.push({ code: 'empty-b', text: `B (« ${B.name} ») ne contient aucune journée analysée.` })
  if (stateA.dates.length > 0 && stateB.dates.length > 0 && stateA.dates.length !== stateB.dates.length) {
    warnings.push({
      code: 'sizes',
      text: `A et B n’ont pas la même taille : ${stateA.dates.length} journée${stateA.dates.length > 1 ? 's' : ''} analysée${stateA.dates.length > 1 ? 's' : ''} dans A, ${stateB.dates.length} dans B. Les parts restent relatives à chaque ensemble ; les points et les nombres de journées dépendent de sa taille.`,
    })
  }
  if (ov.count > 0) warnings.push({ code: 'overlap', text: `A et B se recouvrent : ${ov.count} journée${ov.count > 1 ? 's' : ''} en commun.` })

  return {
    a: { ...A, state: stateA, perDay: perDayA },
    b: { ...B, state: stateB, perDay: perDayB },
    rows,
    poleRows,
    common: inOrder((c) => codesA.has(c) && codesB.has(c)),
    onlyA: inOrder((c) => codesA.has(c) && !codesB.has(c)),
    onlyB: inOrder((c) => !codesA.has(c) && codesB.has(c)),
    concentration: { a: top5(stateA), b: top5(stateB) },
    radar: { max: radarScale(poleRows.flatMap((r) => [r.a?.share ?? 0, r.b?.share ?? 0])), poles: poleRows.map((r) => ({ num: r.num, a: r.a?.share ?? 0, b: r.b?.share ?? 0 })) },
    overlap: ov,
    warnings,
  }
}

/**
 * Les 5 journées d'un côté où un pôle pèse le plus (somme des points du
 * jour de ses compétences) : des repères pour choisir quelles journées
 * relire, jamais une note de la personne.
 * @returns {Array<{date: string, score: number, codes: string[]}>}
 */
export function topDays(side, ref, poleNum, n = 5) {
  const byDate = new Map()
  for (const code of ref.codesByPole.get(poleNum) ?? []) {
    for (const x of side.perDay.get(code) ?? []) {
      if (!byDate.has(x.date)) byDate.set(x.date, { date: x.date, score: 0, codes: [] })
      const e = byDate.get(x.date)
      e.score += x.intensity
      e.codes.push(code)
    }
  }
  return [...byDate.values()].sort((x, y) => y.score - x.score || (x.date < y.date ? -1 : 1)).slice(0, n)
}

const plural = (n, one, many) => `${n} ${n > 1 ? many : one}`
const pct = (x) => `${(x * 100).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %`

/**
 * Récit « ce qui a changé » (§9.2 vue 8) : phrases factuelles et datées, sans
 * valence (jamais « progression », « mieux », « recul »…). Chaque phrase porte
 * les références qui la justifient.
 * @param {ReturnType<typeof compareSets>} cmp
 * @param {{nameOf: (code: string) => string, group?: number}} opts group : au-delà de ce
 *   nombre, les compétences propres à un ensemble sont citées en une seule phrase
 * @returns {Array<{text: string, refs: {codes?: string[], dates?: string[]}}>}
 */
export function changeNarrative(cmp, { nameOf, group = 5 }) {
  const out = []
  const da = cmp.a.state.dates
  const db = cmp.b.state.dates
  const span = (d) => (d.length ? ` (du ${formatLong(d[0])} au ${formatLong(d.at(-1))})` : '')
  out.push({
    text: `A, « ${cmp.a.name} » : ${plural(da.length, 'journée analysée', 'journées analysées')}${span(da)}. B, « ${cmp.b.name} » : ${plural(db.length, 'journée analysée', 'journées analysées')}${span(db)}.`,
    refs: { dates: [...da, ...db] },
  })
  const setA = new Set(da)
  const extension = da.length > 0 && da.every((d) => db.includes(d)) && db.length > da.length
  const added = db.filter((d) => !setA.has(d))
  const since = extension ? added[0] : null
  if (extension) out.push({ text: `B reprend les journées de A et en ajoute ${added.length}, depuis le ${formatLong(since)}.`, refs: { dates: added } })
  else if (cmp.overlap.count > 0) out.push({ text: `A et B ont ${plural(cmp.overlap.count, 'journée', 'journées')} en commun.`, refs: { dates: cmp.overlap.common } })

  const row = new Map(cmp.rows.map((r) => [r.code, r]))
  const label = (code) => `« ${nameOf(code)} » (${code})`
  const listed = (codes, side) => codes.map((c) => `« ${nameOf(c)} » (${c}, ${row.get(c)[side].days} j.)`).join(', ')
  if (cmp.onlyB.length > group) {
    out.push({
      text: since
        ? `Depuis le ${formatLong(since)}, ${plural(cmp.onlyB.length, 'compétence apparaît', 'compétences apparaissent')} : ${listed(cmp.onlyB, 'b')}.`
        : `${plural(cmp.onlyB.length, 'compétence apparaît', 'compétences apparaissent')} dans B et dans aucune journée de A : ${listed(cmp.onlyB, 'b')}.`,
      refs: { codes: cmp.onlyB },
    })
  } else {
    for (const code of cmp.onlyB) {
      const n = row.get(code).b.days
      out.push({
        text: since ? `Depuis le ${formatLong(since)}, ${label(code)} apparaît dans ${plural(n, 'journée', 'journées')}.` : `${label(code)} apparaît dans ${plural(n, 'journée', 'journées')} de B et dans aucune de A.`,
        refs: { codes: [code] },
      })
    }
  }
  if (since) {
    const more = cmp.common
      .map((code) => row.get(code))
      .filter((r) => r.delta.days > 0)
      .sort((x, y) => y.delta.days - x.delta.days)
      .slice(0, 5)
    for (const r of more) out.push({ text: `Depuis le ${formatLong(since)}, ${label(r.code)} apparaît dans ${plural(r.delta.days, 'journée', 'journées')} de plus.`, refs: { codes: [r.code] } })
  }
  if (cmp.onlyA.length > group) {
    out.push({ text: `${plural(cmp.onlyA.length, 'compétence apparaît', 'compétences apparaissent')} dans A et dans aucune journée de B : ${listed(cmp.onlyA, 'a')}.`, refs: { codes: cmp.onlyA } })
  } else {
    for (const code of cmp.onlyA) {
      const n = row.get(code).a.days
      out.push({ text: `${label(code)} apparaît dans ${plural(n, 'journée', 'journées')} de A et dans aucune de B.`, refs: { codes: [code] } })
    }
  }
  const shares = cmp.common
    .map((code) => row.get(code))
    .filter((r) => Math.abs(r.delta.share) >= 0.005)
    .sort((x, y) => Math.abs(y.delta.share) - Math.abs(x.delta.share))
    .slice(0, 3)
  for (const r of shares) out.push({ text: `${label(r.code)} : ${pct(r.a.share)} du soleil de A, ${pct(r.b.share)} de celui de B.`, refs: { codes: [r.code] } })
  if (cmp.onlyA.length === 0 && cmp.onlyB.length === 0 && cmp.common.length > 0) out.push({ text: 'Les mêmes compétences sont observées dans A et dans B.', refs: { codes: cmp.common } })
  return out
}
