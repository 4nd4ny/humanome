// humanome sunburst lib — geometry primitives.
//
// Function-by-function port of assets-existants/merge-prototype/cartographie.html
// (read-only reference): configuration l.743-753, createSectorPath() l.1028-1041,
// getMaxDepth() l.838-841. The math is replicated VERBATIM — same operations, same
// order, default JS number-to-string formatting — so that the generated `d`
// attributes are byte-identical to the original render (see parity.test.js).
// DOM-free ESM module.
//
// One deliberate exception, documented below: sin/cos are evaluated with a
// deterministic, correctly-rounded implementation (crSin/crCos) instead of
// Math.sin/Math.cos. ECMAScript does not require correctly-rounded trig, and
// engines disagree in the last ulp: on the real merge corpus, V8's Math.cos and
// Math.sin are both 1 ulp above the correctly-rounded value for the end angle
// of competence 2.09 (t = 0.8408380337549153 rad), while the engine that
// rendered the reference capture returns the correctly-rounded values. crSin/
// crCos make the lib's output engine-independent AND byte-identical to the
// original render; every other operation stays plain IEEE-754 double
// arithmetic, exactly as in the original.

// Radial levels (l.743-749): niveau 1..5 -> share of the ring occupied.
export const NIVEAUX = {
  1: { nom: 'Découverte', radiusFactor: 0.2 },
  2: { nom: 'Application', radiusFactor: 0.4 },
  3: { nom: 'Maîtrise', radiusFactor: 0.6 },
  4: { nom: 'Expertise', radiusFactor: 0.8 },
  5: { nom: 'Excellence', radiusFactor: 1.0 },
}

// Reduced radial extent of "renvoi au cartographe" sectors (l.751).
export const RENVOI_RADIUS_FACTOR = 0.35

// Background gray bands, one per niveau (l.753).
export const GRAY_LEVELS = { 1: '#000000', 2: '#1f2937', 3: '#374151', 4: '#6b7280', 5: '#cbd5e1' }

// --- Correctly-rounded sin/cos (deterministic across JS engines) ---
//
// Exact Taylor evaluation in BigInt fixed point with 192 fractional bits,
// then a single round-to-nearest-even to double. The accumulated fixed-point
// error (~2^-185) is far below the half-ulp threshold (2^-54 relative), so the
// result is the correctly-rounded double for every |t| <= 3*pi/2 — the full
// range used by the sunburst (angles -90..270 degrees).

const FRAC = 192n
const FIXED_ONE = 1n << FRAC
const F64 = new DataView(new ArrayBuffer(8))

// Exact conversion double -> BigInt scaled by 2^192 (|x| < 2^63, no rounding).
function doubleToFixed(x) {
  F64.setFloat64(0, x)
  const bits = F64.getBigUint64(0)
  const sign = bits >> 63n ? -1n : 1n
  const biasedExp = Number((bits >> 52n) & 0x7ffn)
  let mant = bits & 0xfffffffffffffn
  if (biasedExp !== 0) mant |= 1n << 52n
  const exp = (biasedExp === 0 ? 1 : biasedExp) - 1075
  const shift = BigInt(exp) + FRAC
  const mag = shift >= 0n ? mant << shift : mant >> -shift
  return sign * mag
}

// Round-to-nearest-even conversion BigInt (scaled by 2^192) -> double.
function fixedToDouble(v) {
  if (v === 0n) return 0
  const neg = v < 0n
  const a = neg ? -v : v
  const drop = BigInt(a.toString(2).length) - 53n
  let q
  if (drop <= 0n) {
    q = a << -drop
  } else {
    q = a >> drop
    const rest = a & ((1n << drop) - 1n)
    const half = 1n << (drop - 1n)
    if (rest > half || (rest === half && (q & 1n) === 1n)) q += 1n
    // q may overflow to 2^53: still exactly representable, no adjustment needed
  }
  const res = Number(q) * Math.pow(2, Number(drop - FRAC))
  return neg ? -res : res
}

const CR_CACHE_MAX = 4096
const crCosCache = new Map()
const crSinCache = new Map()

/** Correctly-rounded cos of a double t (|t| <= 3*pi/2), engine-independent. */
export function crCos(t) {
  const hit = crCosCache.get(t)
  if (hit !== undefined) return hit
  const x = doubleToFixed(t)
  const t2 = (x * x) >> FRAC
  let term = FIXED_ONE
  let sum = 0n
  for (let k = 0; term !== 0n; k++) {
    sum += term
    term = -((term * t2) >> FRAC) / BigInt((2 * k + 1) * (2 * k + 2))
  }
  const res = fixedToDouble(sum)
  if (crCosCache.size >= CR_CACHE_MAX) crCosCache.clear()
  crCosCache.set(t, res)
  return res
}

/** Correctly-rounded sin of a double t (|t| <= 3*pi/2), engine-independent. */
export function crSin(t) {
  const hit = crSinCache.get(t)
  if (hit !== undefined) return hit
  const x = doubleToFixed(t)
  const t2 = (x * x) >> FRAC
  let term = x
  let sum = 0n
  for (let k = 0; term !== 0n; k++) {
    sum += term
    term = -((term * t2) >> FRAC) / BigInt((2 * k + 2) * (2 * k + 3))
  }
  const res = fixedToDouble(sum)
  if (crSinCache.size >= CR_CACHE_MAX) crSinCache.clear()
  crSinCache.set(t, res)
  return res
}

/**
 * SVG path of an annular sector (l.1028-1041). Angles are in degrees,
 * 0 = 3 o'clock, growing clockwise (SVG y-axis points down).
 * Exact copy of the original — no rounding, template-literal number
 * formatting — except sin/cos, evaluated correctly rounded (see header).
 */
export function createSectorPath(cx, cy, rIn, rOut, startAngle, endAngle) {
  const rad = Math.PI / 180
  const x1 = cx + rIn * crCos(startAngle * rad)
  const y1 = cy + rIn * crSin(startAngle * rad)
  const x2 = cx + rOut * crCos(startAngle * rad)
  const y2 = cy + rOut * crSin(startAngle * rad)
  const x3 = cx + rOut * crCos(endAngle * rad)
  const y3 = cy + rOut * crSin(endAngle * rad)
  const x4 = cx + rIn * crCos(endAngle * rad)
  const y4 = cy + rIn * crSin(endAngle * rad)
  const largeArc = endAngle - startAngle > 180 ? 1 : 0
  return `M ${x1} ${y1} L ${x2} ${y2} A ${rOut} ${rOut} 0 ${largeArc} 1 ${x3} ${y3} L ${x4} ${y4} A ${rIn} ${rIn} 0 ${largeArc} 0 ${x1} ${y1} Z`
}

/** Depth of the deepest leaf below `node` (l.838-841). */
export function getMaxDepth(node, currentDepth = 0) {
  if (!node.children || node.children.length === 0) return currentDepth
  return Math.max(...node.children.map((child) => getMaxDepth(child, currentDepth + 1)))
}
