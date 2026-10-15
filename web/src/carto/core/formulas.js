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
//   hauteur                h = (C − c₀) / (1 − c₀), bornée à [0 ; 1]
//                          (c₀ : départ de la hauteur, 0,25 par défaut, D-65)
//   rayon (anneaux fixes)  r_ext² = r_int² + k·h   (k : C = 1 atteint le bord)
//   aire d'un secteur      A = θ·k·h / 2  (θ en radians)
//
// Depuis le journal D-58 (Christian, 2026-10-15), l'anneau des pôles est un
// élément d'interface et plus une mesure : chaque pôle en occupe toute la
// hauteur, réglable ; seules les compétences portent la confiance.
//
// Depuis D-65 (Christian, 2026-10-15), la hauteur part d'une confiance c₀
// réglable (0 à 0,5) : les confiances du jury se tiennent entre 0,3 et 0,7 ;
// compter la hauteur depuis 0 écrasait leurs écarts. Le bord intérieur de
// l'anneau des compétences vaut c₀, le bord extérieur 1 ; avec c₀ = 0, on
// retrouve h = C et l'aire θ·k·C/2.

/** Paramètres par défaut (§5, §15 points ouverts 1 et 2). */
export const DEFAULT_PARAMS = Object.freeze({
  /** base(indice) = α < 1 — point ouvert 1, valeur proposée 0,5. */
  alpha: 0.5,
  /** base(preuve). */
  proofBase: 1,
  /**
   * Épaisseur de l'anneau des pôles, en unités du dessin (soleil de rayon 190,
   * centre de 30) : celle du centre par défaut ; 0 = pas d'anneau des pôles,
   * 160 = plus de place pour les compétences (journal D-58).
   */
  poleRingPx: 30,
  /**
   * Départ de la hauteur : la confiance qui vaut le bord intérieur de l'anneau
   * des compétences, de 0 à 0,5 ; 0,25 par défaut, le premier cercle guide
   * (journal D-65).
   */
  heightOrigin: 0.25,
  /**
   * Épaisseur minimale d'affichage d'un secteur, en pixels (§5.6, point ouvert
   * 2) : de 1 à 6 — un secteur qui a des points ne disparaît jamais, même sous
   * le départ de la hauteur (D-65).
   */
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

/** Le soleil de l'interface : rayon extérieur, disque central, écart entre les anneaux (unités du dessin). */
export const SUN = Object.freeze({ outerRadius: 190, centerRadius: 30, gap: 5 })
/** Épaisseur maximale de l'anneau des pôles : toute la place hors du centre. */
export const POLE_RING_MAX = SUN.outerRadius - SUN.centerRadius
/** Départ de la hauteur le plus haut (D-65) : au-delà, on ne lirait plus que la moitié de l'échelle. */
export const HEIGHT_ORIGIN_MAX = 0.5
/** Bornes de l'épaisseur minimale d'un secteur (px) : jamais 0, un secteur ne disparaît pas (D-65). */
export const MIN_THICKNESS_RANGE = Object.freeze({ min: 1, max: 6 })
/** Confiances marquées par les cercles guides de l'anneau des compétences. */
export const GUIDE_LEVELS = Object.freeze([0.25, 0.5, 0.75, 1])

/** Statuts normalisés qui FOURNISSENT des traces (§5.2) : établie et renvoi. */
export const TRACE_PROVIDING_STATUSES = new Set(['established', 'needs_review'])

/** Fusionne des paramètres partiels avec les valeurs par défaut (validées). */
export function resolveParams(partial = {}) {
  const p = { ...DEFAULT_PARAMS, ...(partial ?? {}) }
  if (!(p.alpha >= 0 && p.alpha < 1)) throw new Error(`α doit être dans [0 ; 1[ (reçu ${p.alpha})`)
  if (!(p.proofBase > 0 && p.proofBase <= 1)) throw new Error(`base(preuve) doit être dans ]0 ; 1]`)
  if (!(p.temporalDecay >= 0)) throw new Error('temporalDecay doit être ≥ 0')
  // Des réglages d'affichage : ramenés dans leurs bornes plutôt que refusés.
  p.poleRingPx = Number.isFinite(p.poleRingPx) ? Math.min(POLE_RING_MAX, Math.max(0, p.poleRingPx)) : DEFAULT_PARAMS.poleRingPx
  p.heightOrigin = Number.isFinite(p.heightOrigin) ? clampOrigin(p.heightOrigin) : DEFAULT_PARAMS.heightOrigin
  p.minThicknessPx = Number.isFinite(p.minThicknessPx)
    ? Math.min(MIN_THICKNESS_RANGE.max, Math.max(MIN_THICKNESS_RANGE.min, p.minThicknessPx))
    : DEFAULT_PARAMS.minThicknessPx
  return p
}

/** Départ de la hauteur dans ses bornes [0 ; 0,5], au centième (0 s'il n'est pas un nombre). */
function clampOrigin(origin) {
  return Number.isFinite(origin) ? Math.round(Math.min(HEIGHT_ORIGIN_MAX, Math.max(0, origin)) * 100) / 100 : 0
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
 * (intérieur), anneau des compétences (extérieur).
 *
 * L'anneau des pôles est un élément d'interface (journal D-58) : son
 * épaisseur est un réglage (`poleRing`, par défaut le rayon du centre) et
 * chaque pôle l'occupe en entier. L'anneau des compétences prend le reste,
 * après l'écart `gap` (seulement entre deux anneaux présents) ; sa capacité
 * k = R² − r_int² fait toucher le bord à une confiance de 1. Un anneau
 * d'épaisseur nulle n'est pas dessiné : `poleRing` = 0, pas d'anneau des
 * pôles ; `poleRing` = R − centre, plus de compétences. (Avant D-58, les deux
 * anneaux avaient la même capacité, pour que l'aire d'un pôle égale la somme
 * des aires de ses compétences.)
 *
 * La hauteur des compétences part de la confiance `origin` (D-65) : le bord
 * intérieur de leur anneau la vaut, le bord extérieur vaut 1.
 *
 * @param {{outerRadius: number, centerRadius: number, poleRing?: number, gap?: number, origin?: number}} opts
 * @returns {{k: number, center: number, origin: number,
 *   poles: {rIn: number, rOut: number}, competencies: {rIn: number, rOut: number}}}
 */
export function ringGeometry({ outerRadius, centerRadius, poleRing = centerRadius, gap = 0, origin = 0 }) {
  const R = outerRadius
  const r0 = centerRadius
  if (!(R > 0) || !(r0 >= 0) || !(gap >= 0) || r0 >= R) {
    throw new Error('Géométrie impossible : il faut 0 ≤ centre < rayon extérieur et un écart positif')
  }
  let r1 = r0 + Math.min(R - r0, Math.max(0, Number(poleRing) || 0))
  // Plus de place pour les compétences après l'écart : l'anneau va jusqu'au bord.
  if (r1 > r0 && R - r1 <= gap) r1 = R
  const r2 = r1 > r0 ? Math.min(R, r1 + gap) : r0
  return {
    k: R * R - r2 * r2,
    center: r0,
    origin: clampOrigin(origin),
    poles: { rIn: r0, rOut: r1 },
    competencies: { rIn: r2, rOut: R },
  }
}

/** Géométrie du soleil de l'interface, anneau des pôles (D-58) et départ de la hauteur (D-65) selon les réglages. */
export function sunGeometry(params = DEFAULT_PARAMS) {
  return ringGeometry({ ...SUN, poleRing: params?.poleRingPx ?? DEFAULT_PARAMS.poleRingPx, origin: params?.heightOrigin ?? DEFAULT_PARAMS.heightOrigin })
}

/** Un anneau a-t-il une épaisseur (sinon il n'est pas dessiné) ? */
export function ringShown(ring) {
  return Boolean(ring) && ring.rOut - ring.rIn > 1e-9
}

/**
 * Hauteur d'une confiance (D-65) : la part de l'échelle au-dessus du départ,
 * h = (C − c₀) / (1 − c₀), bornée à [0 ; 1] (h = C quand c₀ = 0).
 * @param {number | null | undefined} confidence
 * @param {number} [origin] départ c₀
 */
export function heightOf(confidence, origin = 0) {
  const c = Math.min(1, Math.max(0, confidence ?? 0))
  const o = Math.min(HEIGHT_ORIGIN_MAX, Math.max(0, origin || 0))
  return Math.max(0, (c - o) / (1 - o))
}

/** Rayon extérieur d'un secteur : r_ext = √(r_int² + k·h), h la hauteur de la confiance au-dessus du départ. */
export function outerRadiusFor(rIn, k, confidence, origin = 0) {
  return Math.sqrt(rIn * rIn + k * heightOf(confidence, origin))
}

/** Aire exacte d'un secteur annulaire de r_int à r_ext sur θ radians. */
export function annularSectorArea(thetaRad, rIn, rOut) {
  return (thetaRad * (rOut * rOut - rIn * rIn)) / 2
}

/** Aire prévue par l'encodage : θ·k·h/2 (θ en radians ; h = C quand le départ est 0). */
export function encodedArea(thetaRad, k, confidence, origin = 0) {
  return (thetaRad * k * heightOf(confidence, origin)) / 2
}

/**
 * Rayon AFFICHÉ avec l'épaisseur minimale (§5.6). Un secteur n'est dessiné
 * que s'il a des points (son angle) ; il ne disparaît alors jamais, même d'une
 * confiance nulle, inconnue (null) ou sous le départ de la hauteur : il reçoit
 * l'épaisseur minimale. `floored` signale l'écart au strict proportionnel
 * (affiché dans « Pourquoi cette surface ? »).
 * @param {number | null} confidence
 * @param {number} [origin] départ de la hauteur (D-65)
 * @returns {{rOut: number, rOutExact: number, floored: boolean}}
 */
export function displayedOuterRadius(rIn, k, confidence, minThickness, origin = 0) {
  const exact = outerRadiusFor(rIn, k, confidence ?? 0, origin)
  const floored = exact - rIn < minThickness
  return { rOut: floored ? rIn + minThickness : exact, rOutExact: exact, floored }
}

/**
 * Cercles guides de l'anneau des compétences : les confiances 0,25 · 0,5 ·
 * 0,75 · 1 situées au-dessus du départ, et la base (le départ lui-même, au
 * bord intérieur) — une échelle de confiance, pas des niveaux. Rien si
 * l'anneau n'est pas dessiné.
 * @param {ReturnType<typeof ringGeometry>} geometry
 * @returns {Array<{c: number, r: number, base: boolean}>}
 */
export function confidenceGuides(geometry) {
  const ring = geometry.competencies
  if (!ringShown(ring)) return []
  const origin = geometry.origin ?? 0
  return [
    ...GUIDE_LEVELS.filter((c) => c > origin + 1e-9).map((c) => ({ c, r: outerRadiusFor(ring.rIn, geometry.k, c, origin), base: false })),
    { c: origin, r: ring.rIn, base: true },
  ]
}

/** Degrés → radians. */
export function toRadians(deg) {
  return (deg * Math.PI) / 180
}
