// Interface ultime — état affiché (spec §5.1 à §5.6).
//
// état(S, t) : calcul sur les journées de S dont la date est ≤ t et dont une
// variante CONTRIBUE (variante active, journée ni « à arbitrer » ni « à
// examiner »). La date t est unique pour toute l'application ; t = null (ou la
// dernière date) donne l'état complet.
//
// Choix documentés (journal, D-6) :
// - seuls les verdicts « établie » ou « renvoi au cartographe » fournissent des
//   traces ; une « non établie » ou un court-circuit n'en fournissent pas (un
//   court-circuit est compté à part, jamais comme une absence) ;
// - C(c) est la moyenne des confiances des verdicts qui ont fourni au moins
//   une trace (la confiance d'un verdict de NON-présence ne dit rien de la
//   présence et n'entre donc pas dans la hauteur) ;
// - une compétence hors référentiel n'a ni angle ni secteur (elle n'a pas de
//   pôle) : elle est listée à part (point ouvert 8).
// - l'intensité d'une compétence est son nombre de points, Σ w avec w = 1 par
//   preuve et α par indice (D-8, décisions du 2026-10-14) ; l'angle en est la
//   part. La confiance du jury ne fait que la hauteur.

import { contributingVariant } from './model.js'
import {
  TRACE_PROVIDING_STATUSES,
  anglesFromPoints,
  displayedOuterRadius,
  meanConfidence,
  widenNarrowSectors,
  poleConfidence,
  resolveParams,
  tracePoints,
  traceWeight,
} from './formulas.js'
import { daysBetween } from './dates.js'

/** Nombre écrit à la française (virgule décimale), pour les formules affichées. */
const frNumber = (n) => String(n).replace('.', ',')

/**
 * @param {object} dataset index du jeu de données
 * @param {{
 *   ref: ReturnType<import('./referential.js').normalizeReferential>,
 *   dates?: Iterable<string> | null,  // ensemble S ; null = journées cochées
 *   until?: string | null,            // date t incluse ; null = sans borne
 *   params?: object,
 *   variantOf?: (day: object) => object | null, // variante qui compte (comparaison de deux analyses, §9)
 * }} opts
 */
export function computeState(dataset, { ref, dates = null, until = null, params, variantOf = contributingVariant } = {}) {
  const p = resolveParams(params)
  const selected = dates === null ? new Set(dataset.days.filter((d) => d.active).map((d) => d.date)) : new Set(dates)

  /** @type {Map<string, any>} */
  const comps = new Map()
  const retainedDates = []
  const excluded = { notEstablished: 0, courtCircuit: 0, unknownStatus: 0, withoutConfidence: 0 }
  const outOfReferential = new Set()

  for (const day of dataset.days) {
    if (!selected.has(day.date)) continue
    if (until !== null && day.date > until) continue
    const variant = variantOf(day)
    if (!variant) continue
    retainedDates.push(day.date)
    for (const v of variant.verdicts) {
      if (v.courtCircuit) {
        excluded.courtCircuit++
        continue
      }
      if (v.status === 'not_established') {
        excluded.notEstablished++
        continue
      }
      if (!TRACE_PROVIDING_STATUSES.has(v.status)) {
        excluded.unknownStatus++
        continue
      }
      if (!v.traces || v.traces.length === 0) continue
      // Confiance inconnue : les traces comptent pour l'angle (points), la
      // hauteur l'ignore (moyenne des seules confiances connues).
      if (v.confidence === null || v.confidence === undefined) excluded.withoutConfidence++
      if (!ref.compByCode.has(v.code)) {
        outOfReferential.add(v.code)
        continue
      }
      let entry = comps.get(v.code)
      if (!entry) {
        entry = { code: v.code, pole: ref.compByCode.get(v.code).pole, traces: [], verdicts: [], days: new Set(), established: false }
        comps.set(v.code, entry)
      }
      const ageDays = until !== null ? daysBetween(day.date, until) : 0
      for (const t of v.traces) {
        entry.traces.push({
          id: t.id,
          date: day.date,
          variantId: variant.id,
          role: t.role,
          confidence: v.confidence,
          weight: traceWeight(t.role, p, ageDays),
        })
      }
      entry.verdicts.push({
        date: day.date,
        variantId: variant.id,
        status: v.status,
        confidence: v.confidence,
        proofs: v.proofs,
        hints: v.hints,
      })
      entry.days.add(day.date)
      if (v.status === 'established') entry.established = true
    }
  }

  const intensities = new Map()
  for (const [code, e] of comps) intensities.set(code, tracePoints(e.traces.map((t) => t.weight)))
  const thetas = anglesFromPoints(intensities)

  const competencies = new Map()
  let totalIntensity = 0
  for (const c of ref.competencies) {
    const e = comps.get(c.code)
    if (!e) continue
    const intensity = intensities.get(c.code) ?? 0
    totalIntensity += intensity
    competencies.set(c.code, {
      code: c.code,
      pole: c.pole,
      intensity,
      theta: thetas.get(c.code) ?? 0,
      confidence: meanConfidence(e.verdicts.map((v) => v.confidence)),
      status: e.established ? 'established' : 'needs_review',
      traces: e.traces,
      verdicts: e.verdicts,
      days: [...e.days].sort(),
      proofs: e.traces.filter((t) => t.role === 'preuve').length,
      hints: e.traces.filter((t) => t.role !== 'preuve').length,
    })
  }

  const poles = new Map()
  for (const pole of ref.poles) {
    const members = [...competencies.values()].filter((c) => c.pole === pole.num && c.theta > 0)
    if (members.length === 0) continue
    poles.set(pole.num, {
      num: pole.num,
      theta: members.reduce((s, c) => s + c.theta, 0),
      intensity: members.reduce((s, c) => s + c.intensity, 0),
      confidence: poleConfidence(members.map((c) => ({ theta: c.theta, confidence: c.confidence }))),
      codes: members.map((c) => c.code),
      needsReviewOnly: members.every((c) => c.status === 'needs_review'),
    })
  }

  return {
    until,
    params: p,
    selectedCount: selected.size,
    dates: retainedDates.sort(),
    competencies,
    poles,
    totalIntensity,
    outOfReferential: [...outOfReferential].sort(),
    excluded,
  }
}

/**
 * État d'UNE journée seule (modale du jour, §6.2) : angles, confiance et
 * traces de ce seul jour.
 */
export function computeDayState(dataset, date, { ref, params } = {}) {
  return computeState(dataset, { ref, params, dates: [date], until: date })
}

/**
 * Disposition du soleil (§5.4, §5.6, §6.1) : secteurs dans l'ORDRE DU
 * RÉFÉRENTIEL (jamais par taille), départ à −90°, sens horaire. Les angles
 * sont en radians dans le repère SVG (y vers le bas).
 *
 * @param {ReturnType<typeof computeState>} state
 * @param {ReturnType<import('./referential.js').normalizeReferential>} ref
 * @param {{k: number, poles: {rIn: number, rOut: number}, competencies: {rIn: number, rOut: number}}} geometry
 *   géométrie (ringGeometry) exprimée en pixels
 * @param {{minThickness?: number, minArc?: number}} [opts] minThickness : épaisseur
 *   minimale (px) ; minArc : largeur minimale au bord extérieur (px) — un
 *   secteur élargi est marqué `widened`, son θ reste exact
 * @returns {{
 *   poles: Array<{num: number, a0: number, a1: number, rIn: number, rOut: number, rOutExact: number, floored: boolean, widened: boolean, confidence: number, theta: number}>,
 *   competencies: Array<{code: string, pole: number, a0: number, a1: number, rIn: number, rOut: number, rOutExact: number, floored: boolean, widened: boolean, confidence: number, theta: number, status: string}>,
 * }}
 */
export function layoutSun(state, ref, geometry, { minThickness = 0, minArc = 0 } = {}) {
  const START = -Math.PI / 2
  const rad = (deg) => (deg * Math.PI) / 180
  // Ordre du dessin : celui du référentiel ; largeurs dessinées (un secteur
  // trop étroit pour être vu reçoit la largeur minimale, prise sur les autres).
  const drawnOrder = []
  for (const pole of ref.poles) {
    if (!state.poles.get(pole.num)) continue
    for (const code of ref.codesByPole.get(pole.num)) {
      const c = state.competencies.get(code)
      if (c && c.theta > 0) drawnOrder.push(code)
    }
  }
  const outer = geometry.competencies.rOut
  const drawn = widenNarrowSectors(
    drawnOrder.map((code) => rad(state.competencies.get(code).theta)),
    minArc > 0 && outer > 0 ? minArc / outer : 0,
  )
  const drawnByCode = new Map(drawnOrder.map((code, i) => [code, { angle: drawn.angles[i], widened: drawn.widened[i] }]))

  const comps = []
  const poles = []
  let cursor = START
  for (const pole of ref.poles) {
    const pState = state.poles.get(pole.num)
    if (!pState) continue
    const poleStart = cursor
    for (const code of ref.codesByPole.get(pole.num)) {
      const c = state.competencies.get(code)
      if (!c || !(c.theta > 0)) continue
      const d = drawnByCode.get(code)
      const a0 = cursor
      const a1 = cursor + d.angle
      cursor = a1
      // Un secteur qui a des points ne disparaît jamais, même d'une confiance
      // nulle ou inconnue : il reçoit l'épaisseur minimale, signalée.
      const { rOut, rOutExact, floored } = displayedOuterRadius(geometry.competencies.rIn, geometry.k, c.confidence, minThickness)
      comps.push({
        code,
        pole: pole.num,
        a0,
        a1,
        rIn: geometry.competencies.rIn,
        rOut,
        rOutExact,
        floored,
        widened: d.widened,
        confidence: c.confidence ?? 0,
        theta: c.theta,
        status: c.status,
      })
    }
    const ring = displayedOuterRadius(geometry.poles.rIn, geometry.k, pState.confidence, minThickness)
    poles.push({
      num: pole.num,
      a0: poleStart,
      a1: cursor,
      rIn: geometry.poles.rIn,
      rOut: ring.rOut,
      rOutExact: ring.rOutExact,
      floored: ring.floored,
      // Au moins une de ses compétences est dessinée à la largeur minimale.
      widened: ref.codesByPole.get(pole.num).some((code) => drawnByCode.get(code)?.widened),
      confidence: pState.confidence ?? 0,
      theta: pState.theta,
      needsReviewOnly: pState.needsReviewOnly,
    })
  }
  return { poles, competencies: comps }
}

/**
 * Explication « Pourquoi cette surface ? » (§1.7, §6.1) pour une compétence ou
 * un pôle : traces et journées qui fondent l'angle, confiances qui fondent la
 * hauteur, formules, et signalement de l'épaisseur minimale.
 *
 * @param {ReturnType<typeof computeState>} state
 * @param {{type: 'competency', code: string} | {type: 'pole', num: number}} target
 */
export function explainSurface(state, target) {
  const p = state.params
  if (target.type === 'competency') {
    const c = state.competencies.get(target.code)
    if (!c) return null
    return {
      type: 'competency',
      code: c.code,
      theta: c.theta,
      intensity: c.intensity,
      totalIntensity: state.totalIntensity,
      confidence: c.confidence,
      traces: [...c.traces].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : b.weight - a.weight)),
      verdicts: c.verdicts,
      days: c.days,
      formulas: {
        weight: `points d’une trace : preuve = ${frNumber(p.proofBase)}, indice = α = ${frNumber(p.alpha)} (la confiance du jury n’entre pas dans l’angle)`,
        intensity: 'points = Σ w (chaque trace compte)',
        angle: 'θ = 360° × points / Σ points',
        confidence: 'C = moyenne des confiances des verdicts qui fournissent des traces',
        area: 'surface = θ · k · C / 2 (anneaux fixes : r_ext² = r_int² + k·C)',
      },
    }
  }
  const pole = state.poles.get(target.num)
  if (!pole) return null
  return {
    type: 'pole',
    num: pole.num,
    theta: pole.theta,
    intensity: pole.intensity,
    totalIntensity: state.totalIntensity,
    confidence: pole.confidence,
    members: pole.codes.map((code) => {
      const c = state.competencies.get(code)
      return { code, theta: c.theta, confidence: c.confidence, days: c.days.length }
    }),
    formulas: {
      angle: 'θ(pôle) = Σ θ(compétences du pôle)',
      confidence: 'C(pôle) = Σ θ(c)·C(c) / Σ θ(c)',
      area: 'surface(pôle) = Σ surfaces de ses compétences',
    },
  }
}
