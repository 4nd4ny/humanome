// round() de Python (half-to-even sur la valeur binaire exacte du double),
// y compris round(x, n) — CPython arrondit sur la représentation décimale
// EXACTE du double (David Gay) : round(2.675, 2) == 2.67 car 2.675 est en
// réalité 2.67499999… Idem formatFixed (« %.2f ») : arrondi correct half-even.
// Plus : pyFloor, pyDivmod, pyMod (signe du diviseur), pyInt (troncature).
// BigInt utilisé en interne pour l'arithmétique rationnelle exacte (pur ESM,
// disponible dans tous les navigateurs cibles) — jamais exposé en sortie.

/**
 * Décompose un double fini non nul : |x| = m * 2^e avec m entier (BigInt).
 * @param {number} x fini, non nul
 * @returns {{ m: bigint, e: number, neg: boolean }}
 */
function decompose(x) {
  const dv = new DataView(new ArrayBuffer(8));
  dv.setFloat64(0, x);
  const hi = dv.getUint32(0);
  const lo = dv.getUint32(4);
  const neg = (hi >>> 31) === 1;
  const biased = (hi >>> 20) & 0x7ff;
  let m = BigInt(hi & 0xfffff) * 4294967296n + BigInt(lo);
  let e;
  if (biased === 0) {
    e = 1 - 1075; // dénormalisé
  } else {
    m += 4503599627370496n; // bit implicite 2^52
    e = biased - 1075;
  }
  return { m, e, neg };
}

/**
 * Arrondi half-to-even du rationnel num/den (BigInt ≥ 0, den > 0) vers un entier.
 * @param {bigint} num @param {bigint} den
 * @returns {bigint}
 */
function roundHalfEvenRational(num, den) {
  const q = num / den;
  const r = num % den;
  const twice = r * 2n;
  if (twice > den) return q + 1n;
  if (twice < den) return q;
  return q % 2n === 0n ? q : q + 1n; // égalité exacte : vers le pair
}

/**
 * |x| * 10^n sous forme rationnelle exacte num/den (n peut être négatif).
 * @param {number} x fini non nul @param {number} n entier
 */
function scaledRational(x, n) {
  const { m, e, neg } = decompose(x);
  let num = m;
  let den = 1n;
  if (n >= 0) num *= 10n ** BigInt(n);
  else den *= 10n ** BigInt(-n);
  if (e >= 0) num *= 2n ** BigInt(e);
  else den *= 2n ** BigInt(-e);
  return { num, den, neg };
}

/**
 * round() Python.
 * - pyRound(x) : entier le plus proche, moitiés vers le pair (round(2.5) → 2).
 *   Retourne un Number entier (int Python).
 * - pyRound(x, n) : double le plus proche de la valeur décimale exacte de x
 *   arrondie à n décimales (n entier, éventuellement négatif). Retourne un
 *   double (float Python), signe de zéro conservé.
 * @param {number} x
 * @param {number} [ndigits]
 * @returns {number}
 */
export function pyRound(x, ndigits) {
  if (ndigits === undefined) {
    if (!Number.isFinite(x)) {
      throw new RangeError("pyRound : NaN/Infinity vers int (Python lèverait)");
    }
    if (Number.isInteger(x)) return x + 0; // +0 neutralise -0 (int Python)
    // |x| < 2^52 ici (sinon x serait entier) : x - floor(x) est exact.
    const f = Math.floor(x);
    const diff = x - f;
    if (diff > 0.5) return f + 1;
    if (diff < 0.5) return f;
    return f % 2 === 0 ? f : f + 1;
  }
  if (!Number.isInteger(ndigits)) {
    throw new TypeError("pyRound : ndigits entier requis");
  }
  if (!Number.isFinite(x) || x === 0) return x; // nan/inf/±0.0 inchangés
  const { num, den, neg } = scaledRational(x, ndigits);
  const q = roundHalfEvenRational(num, den);
  if (q === 0n) return neg ? -0 : 0;
  // Conversion décimal → double correctement arrondie (ties-to-even) par le
  // parseur Number de JS : q * 10^-ndigits sans double arrondi.
  const abs = Number(`${q.toString()}e${-ndigits}`);
  return neg ? -abs : abs;
}

/**
 * Formatage fixe « %.<prec>f » de Python (PyOS_double_to_string, arrondi
 * correct half-even sur la valeur exacte du double). prec ≥ 0.
 * '%.1f' % 0.25 → '0.2' ; '%.0f' % 2.5 → '2' ; -0.0 → '-0.0'.
 * @param {number} x
 * @param {number} prec
 * @returns {string}
 */
export function formatFixed(x, prec) {
  if (Number.isNaN(x)) return "nan";
  if (x === Infinity) return "inf";
  if (x === -Infinity) return "-inf";
  const neg = x < 0 || Object.is(x, -0);
  let digits;
  if (x === 0) {
    digits = "0";
  } else {
    const { num, den } = scaledRational(x, prec);
    digits = roundHalfEvenRational(num, den).toString();
  }
  if (prec === 0) return (neg ? "-" : "") + digits;
  if (digits.length <= prec) digits = "0".repeat(prec + 1 - digits.length) + digits;
  const cut = digits.length - prec;
  return (neg ? "-" : "") + digits.slice(0, cut) + "." + digits.slice(cut);
}

/** math.floor / opérateur // pour un seul argument. */
export function pyFloor(x) {
  return Math.floor(x);
}

/** int(x) Python : troncature vers zéro. */
export function pyInt(x) {
  return Math.trunc(x);
}

/**
 * Modulo Python : le reste a le signe du DIVISEUR (−7 % 3 == 2 ; 7 % −3 == −2).
 * Exact pour les entiers ; pour les floats, identique au float mod Python.
 * @param {number} a @param {number} b
 */
export function pyMod(a, b) {
  if (b === 0) throw new RangeError("pyMod : division par zéro");
  let r = a % b;
  if (r !== 0 && (r < 0) !== (b < 0)) r += b;
  return r;
}

/**
 * divmod(a, b) Python : [quotient plancher, reste au signe du diviseur].
 * @param {number} a @param {number} b
 * @returns {[number, number]}
 */
export function pyDivmod(a, b) {
  const r = pyMod(a, b);
  return [(a - r) / b, r];
}
