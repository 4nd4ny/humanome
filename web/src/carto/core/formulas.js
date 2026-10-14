// Interface ultime — formules du soleil (spec §5.2 à §5.6). Fonctions PURES,
// sans React ni DOM : la vue ne fait que dessiner ce qu'elles calculent.
//
//   points d'une trace     w = base(rôle) : preuve = 1, indice = α (défaut 0,5)
//   intensité = points     P(c) = Σ wᵢ                      (chaque trace compte)
//   angle                  θ(c) = 360° × P(c) / Σ P(c')     (parts d'un tout)
//
// Décisions de Christian du 2026-10-14 (journal, D-8) : l'angle représente le
// nombre de points — plus une compétence a de traces, plus elle prend de
// place — et la confiance du jury n'y entre PAS : elle fait la hauteur, et
// seulement la hauteur. Le cumul saturant 1 − Π(1 − wᵢ) du §5.3 et le
// facteur « × confiance du verdict » du §5.2 sont abandonnés (le cumul
// plafonnait à 1 en quelques semaines : les compétences fréquentes
// recevaient toutes le même angle).
//   confiance moyenne      C(c) = moyenne des confiances des verdicts retenus
//                          (« confiance cumulée » au §5.5 ; à l'écran : « confiance
//                          moyenne du jury », les mots de Christian)
//   confiance d'un pôle    C(p) = Σ θ(c)·C(c) / Σ θ(c)
//   rayon (anneaux fixes)  r_ext² = r_int² + k·C   (k : C = 1 atteint le bord)
//   aire d'un secteur      A = θ·k·C / 2  (θ en radians) — identique dans les
//                          deux anneaux, donc A(pôle) = Σ A(compétences).

/** Paramètres par défaut (§5, §15 points ouverts 1 et 2). */
export const DEFAULT_PARAMS = Object.freeze({
  /** base(indice) = α < 1 — point ouvert 1, valeur proposée 0,5. */
  alpha: 0.5,
  /** base(preuve). */
  proofBase: 1,
  /** Épaisseur minimale d'affichage d'un secteur, en pixels (§5.6, point ouvert 2). */
  minThicknessPx: 2,
  /**
   * Largeur minimale d'affichage d'un secteur, en pixels mesurés au bord
   * extérieur : même principe que l'épaisseur minimale (un secteur ne
   * disparaît jamais), signalée de même dans « Pourquoi cette surface ? ».
   */
  minArcPx: 2,
  /** Décote temporelle annuelle — le paramètre existe, DÉSACTIVÉ (§1.6, décision 4). */
  temporalDecay: 0,
})

/** Statuts normalisés qui FOURNISSENT des traces (§5.2) : établie et renvoi. */
export const TRACE_PROVIDING_STATUSES = new Set(['established', 'needs_review'])

/** Fusionne des paramètres partiels avec les valeurs par défaut (validées). */
export function resolveParams(partial = {}) {
  const p = { ...DEFAULT_PARAMS, ...(partial ?? {}) }
  if (!(p.alpha >= 0 && p.alpha < 1)) throw new Error(`α doit être dans [0 ; 1[ (reçu ${p.alpha})`)
  if (!(p.proofBase > 0 && p.proofBase <= 1)) throw new Error(`base(preuve) doit être dans ]0 ; 1]`)
  if (!(p.temporalDecay >= 0)) throw new Error('temporalDecay doit être ≥ 0')
  return p
}

/** base(rôle) : preuve → base(preuve), tout autre rôle → α. */
export function traceBase(role, params = DEFAULT_PARAMS) {
  return role === 'preuve' ? params.proofBase : params.alpha
}

/**
 * Facteur de décote temporelle (1 tant que le paramètre est désactivé).
 * @param {number} ageDays âge de la trace à la date t, en jours (≥ 0)
 */
export function decayFactor(ageDays, params = DEFAULT_PARAMS) {
  if (!params.temporalDecay) return 1
  return Math.max(0, 1 - params.temporalDecay * (Math.max(0, ageDays) / 365.25))
}

/**
 * Points d'une trace : 1 pour une preuve, α pour un indice. La confiance du
 * verdict n'y entre pas — elle fait la hauteur du secteur, pas son angle
 * (décision du 2026-10-14).
 * @param {'preuve'|'indice'|string} role
 * @param {object} [params]
 * @param {number} [ageDays] âge de la trace (décote, inactive par défaut)
 */
export function traceWeight(role, params = DEFAULT_PARAMS, ageDays = 0) {
  return Math.max(0, traceBase(role, params) * decayFactor(ageDays, params))
}

/**
 * Force du SIGNAL d'une trace pour les moments remarquables du tableau de
 * bord (D-24) : rôle × confiance du verdict. Elle trie des moments à relire ;
 * elle n'entre jamais dans l'angle (qui ne compte que les points).
 * @param {'preuve'|'indice'|string} role
 * @param {number | null | undefined} confidence
 */
export function traceSignal(role, confidence, params = DEFAULT_PARAMS) {
  if (typeof confidence !== 'number' || !Number.isFinite(confidence)) return 0
  return traceBase(role, params) * Math.min(1, Math.max(0, confidence))
}

/**
 * Intensité d'une compétence, en points : somme des points de ses traces.
 * Chaque trace compte (une preuve plus qu'un indice) ; rien ne plafonne
 * (décision du 2026-10-14, qui remplace le cumul saturant du §5.3).
 * @param {Iterable<number>} weights
 */
export function tracePoints(weights) {
  let sum = 0
  for (const w of weights) if (w > 0) sum += w
  return sum
}

/**
 * Angles (§5.4) : part des points de chaque compétence dans le total, en
 * degrés (somme 360). Une compétence sans point n'a pas d'angle (aucun secteur).
 * @param {Map<string, number>} points code → P(c)
 * @returns {Map<string, number>} code → θ en degrés (uniquement P > 0)
 */
export function anglesFromPoints(points) {
  let total = 0
  for (const v of points.values()) if (v > 0) total += v
  const out = new Map()
  if (total <= 0) return out
  for (const [code, v] of points) if (v > 0) out.set(code, (360 * v) / total)
  return out
}

/**
 * Largeurs DESSINÉES des secteurs : la part exacte, sauf pour un secteur si
 * étroit qu'il disparaîtrait (moins de `minAngle`) ; il reçoit cette largeur
 * minimale, prise sur les autres au prorata, si bien que la somme ne change
 * pas. Les angles exacts (θ) restent ceux des calculs et des explications.
 * @param {number[]} angles angles exacts (radians), dans l'ordre du dessin
 * @param {number} minAngle largeur minimale (radians)
 * @returns {{angles: number[], widened: boolean[]}}
 */
export function widenNarrowSectors(angles, minAngle) {
  const n = angles.length
  const out = angles.slice()
  const widened = angles.map(() => false)
  const total = angles.reduce((s, a) => s + a, 0)
  if (!(minAngle > 0) || n === 0 || n * minAngle >= total) return { angles: out, widened }
  for (;;) {
    let fixed = 0
    let free = 0
    for (let i = 0; i < n; i++) {
      if (widened[i]) fixed += minAngle
      else free += angles[i]
    }
    const scale = free > 0 ? (total - fixed) / free : 1
    let changed = false
    for (let i = 0; i < n; i++) {
      out[i] = widened[i] ? minAngle : angles[i] * scale
      if (!widened[i] && out[i] < minAngle) {
        widened[i] = true
        changed = true
      }
    }
    if (!changed) return { angles: out, widened }
  }
}

/** Moyenne des confiances numériques (null si aucune). */
export function meanConfidence(confidences) {
  let sum = 0
  let n = 0
  for (const c of confidences) {
    if (typeof c === 'number' && Number.isFinite(c)) {
      sum += Math.min(1, Math.max(0, c))
      n++
    }
  }
  return n === 0 ? null : sum / n
}

/**
 * Confiance d'un pôle (§5.5) : moyenne des C(c) pondérée par θ(c).
 * @param {Array<{theta: number, confidence: number}>} items
 */
export function poleConfidence(items) {
  let num = 0
  let den = 0
  for (const { theta, confidence } of items) {
    if (!(theta > 0) || typeof confidence !== 'number') continue
    num += theta * confidence
    den += theta
  }
  return den === 0 ? null : num / den
}

/**
 * Géométrie des deux anneaux fixes (§5.6) : centre, anneau des pôles
 * (intérieur), anneau des compétences (extérieur). Les deux anneaux ont la
 * même « capacité » k = R_ext² − R_int², condition pour que l'aire d'un
 * secteur vaille θ·k·C/2 dans les deux anneaux (et donc que l'aire d'un pôle
 * égale la somme des aires de ses compétences).
 *
 * @param {{outerRadius: number, centerRadius: number, gap?: number}} opts
 * @returns {{k: number, center: number,
 *   poles: {rIn: number, rOut: number}, competencies: {rIn: number, rOut: number}}}
 */
export function ringGeometry({ outerRadius, centerRadius, gap = 0 }) {
  const R = outerRadius
  const r0 = centerRadius
  if (!(R > 0) || !(r0 >= 0) || !(gap >= 0) || r0 + gap >= R) {
    throw new Error('Géométrie impossible : il faut 0 ≤ centre, centre + écart < rayon extérieur')
  }
  // r1² − r0² = R² − (r1 + g)²  ⇒  2r1² + 2g·r1 + g² − r0² − R² = 0
  const r1 = (-gap + Math.sqrt(2 * R * R + 2 * r0 * r0 - gap * gap)) / 2
  const r2 = r1 + gap
  return {
    k: r1 * r1 - r0 * r0,
    center: r0,
    poles: { rIn: r0, rOut: r1 },
    competencies: { rIn: r2, rOut: R },
  }
}

/** Rayon extérieur d'un secteur : r_ext = √(r_int² + k·C). */
export function outerRadiusFor(rIn, k, confidence) {
  const c = Math.min(1, Math.max(0, confidence ?? 0))
  return Math.sqrt(rIn * rIn + k * c)
}

/** Aire exacte d'un secteur annulaire de r_int à r_ext sur θ radians. */
export function annularSectorArea(thetaRad, rIn, rOut) {
  return (thetaRad * (rOut * rOut - rIn * rIn)) / 2
}

/** Aire prévue par l'encodage : θ·k·C/2 (θ en radians). */
export function encodedArea(thetaRad, k, confidence) {
  return (thetaRad * k * confidence) / 2
}

/**
 * Rayon AFFICHÉ avec l'épaisseur minimale (§5.6) : un secteur de confiance
 * positive ne disparaît jamais. `floored` signale l'écart au strict
 * proportionnel (affiché dans « Pourquoi cette surface ? »).
 * @returns {{rOut: number, floored: boolean}}
 */
export function displayedOuterRadius(rIn, k, confidence, minThickness) {
  const exact = outerRadiusFor(rIn, k, confidence)
  if (!(confidence > 0)) return { rOut: rIn, floored: false }
  if (exact - rIn < minThickness) return { rOut: rIn + minThickness, floored: true }
  return { rOut: exact, floored: false }
}

/** Degrés → radians. */
export function toRadians(deg) {
  return (deg * Math.PI) / 180
}
