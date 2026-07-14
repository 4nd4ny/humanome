// Mersenne Twister CPython complet — équivalent bit-à-bit de random.Random(seed_int).
// Reproduit _randommodule.c (init_genrand, init_by_array, genrand_uint32,
// genrand_res53, getrandbits) et random.py (_randbelow_with_getrandbits,
// randint/randrange, choice, shuffle, sample).
// Toute l'arithmétique 32 bits passe par Math.imul / >>> ; les valeurs > 32 bits
// (getrandbits ≤ 53, random()) restent en Number exact (< 2^53).

const N = 624;
const M = 397;
const MATRIX_A = 0x9908b0df;
const UPPER_MASK = 0x80000000;
const LOWER_MASK = 0x7fffffff;

/** Équivalent de int.bit_length() Python pour un entier Number ≥ 0. */
function bitLength(n) {
  let k = 0;
  while (n > 0) {
    n = Math.floor(n / 2);
    k++;
  }
  return k;
}

/**
 * Générateur pseudo-aléatoire identique à random.Random(seed) de CPython.
 * Seed : entier Number 0 ≤ seed < 2^53 (les seeds du pipeline sont des
 * stable_hash 48 bits ou des modulos 31 bits). Un seed négatif est pris en
 * valeur absolue (comme CPython).
 */
export class PyRandom {
  /** @param {number} seed entier */
  constructor(seed) {
    this.mt = new Uint32Array(N);
    this.mti = N + 1;
    this.seed(seed);
  }

  /** init_genrand(s) du C. */
  _initGenrand(s) {
    const mt = this.mt;
    mt[0] = s >>> 0;
    for (let i = 1; i < N; i++) {
      const prev = (mt[i - 1] ^ (mt[i - 1] >>> 30)) >>> 0;
      mt[i] = (Math.imul(1812433253, prev) + i) >>> 0;
    }
    this.mti = N;
  }

  /** init_by_array(key) du C (init 19650218, multiplicateurs 1664525/1566083941). */
  _initByArray(key) {
    this._initGenrand(19650218);
    const mt = this.mt;
    let i = 1;
    let j = 0;
    let k = Math.max(N, key.length);
    for (; k; k--) {
      const prev = (mt[i - 1] ^ (mt[i - 1] >>> 30)) >>> 0;
      mt[i] = ((((mt[i] ^ Math.imul(prev, 1664525)) >>> 0) + key[j] + j) >>> 0);
      i++;
      j++;
      if (i >= N) {
        mt[0] = mt[N - 1];
        i = 1;
      }
      if (j >= key.length) j = 0;
    }
    for (k = N - 1; k; k--) {
      const prev = (mt[i - 1] ^ (mt[i - 1] >>> 30)) >>> 0;
      mt[i] = ((((mt[i] ^ Math.imul(prev, 1566083941)) >>> 0) - i) >>> 0);
      i++;
      if (i >= N) {
        mt[0] = mt[N - 1];
        i = 1;
      }
    }
    mt[0] = 0x80000000;
  }

  /**
   * random_seed(arg entier) de CPython : |seed| découpé en mots de 32 bits
   * little-endian, puis init_by_array. seed 0 → clé [0].
   * @param {number} seed
   */
  seed(seed) {
    if (!Number.isInteger(seed)) {
      throw new TypeError("PyRandom.seed : seed entier requis (parité CPython)");
    }
    let n = Math.abs(seed);
    const key = [];
    if (n === 0) {
      key.push(0);
    } else {
      while (n > 0) {
        key.push(n % 4294967296);
        n = Math.floor(n / 4294967296);
      }
    }
    this._initByArray(key);
  }

  /** genrand_uint32 : mot de 32 bits tempéré. */
  _genrand() {
    const mt = this.mt;
    let y;
    if (this.mti >= N) {
      for (let kk = 0; kk < N - M; kk++) {
        y = ((mt[kk] & UPPER_MASK) | (mt[kk + 1] & LOWER_MASK)) >>> 0;
        mt[kk] = (mt[kk + M] ^ (y >>> 1) ^ (y & 1 ? MATRIX_A : 0)) >>> 0;
      }
      for (let kk = N - M; kk < N - 1; kk++) {
        y = ((mt[kk] & UPPER_MASK) | (mt[kk + 1] & LOWER_MASK)) >>> 0;
        mt[kk] = (mt[kk + (M - N)] ^ (y >>> 1) ^ (y & 1 ? MATRIX_A : 0)) >>> 0;
      }
      y = ((mt[N - 1] & UPPER_MASK) | (mt[0] & LOWER_MASK)) >>> 0;
      mt[N - 1] = (mt[M - 1] ^ (y >>> 1) ^ (y & 1 ? MATRIX_A : 0)) >>> 0;
      this.mti = 0;
    }
    y = mt[this.mti++];
    y = (y ^ (y >>> 11)) >>> 0;
    y = (y ^ ((y << 7) & 0x9d2c5680)) >>> 0;
    y = (y ^ ((y << 15) & 0xefc60000)) >>> 0;
    y = (y ^ (y >>> 18)) >>> 0;
    return y;
  }

  /** random() = genrand_res53 : double dans [0, 1) sur 53 bits. */
  random() {
    const a = this._genrand() >>> 5; // 27 bits de poids fort
    const b = this._genrand() >>> 6; // 26 bits
    return (a * 67108864 + b) / 9007199254740992; // (a*2^26 + b) / 2^53
  }

  /**
   * getrandbits(k) pour 1 ≤ k ≤ 53 (Number exact). Mots de 32 bits consommés
   * du poids faible vers le poids fort, dernier mot tronqué à droite (comme le C).
   * @param {number} k
   * @returns {number}
   */
  getrandbits(k) {
    if (!Number.isInteger(k) || k <= 0) {
      throw new RangeError("getrandbits : k > 0 requis");
    }
    if (k <= 32) {
      return this._genrand() >>> (32 - k);
    }
    if (k > 53) {
      throw new RangeError("getrandbits : k ≤ 53 seulement (Number exact)");
    }
    let result = 0;
    let shift = 1;
    while (k > 0) {
      let r = this._genrand();
      if (k < 32) r = r >>> (32 - k);
      result += r * shift;
      shift *= 4294967296;
      k -= 32;
    }
    return result;
  }

  /** _randbelow_with_getrandbits : entier uniforme dans [0, n) par rejet. */
  _randbelow(n) {
    const k = bitLength(n);
    let r = this.getrandbits(k);
    while (r >= n) {
      r = this.getrandbits(k);
    }
    return r;
  }

  /**
   * randint(a, b) = randrange(a, b+1) : entier dans [a, b] inclus.
   * @param {number} a @param {number} b
   */
  randint(a, b) {
    const width = b + 1 - a;
    if (width <= 0) {
      throw new RangeError(`randint : intervalle vide (${a}, ${b})`);
    }
    return a + this._randbelow(width);
  }

  /**
   * choice(seq) : un élément uniforme de la séquence.
   * @template T @param {T[]} seq @returns {T}
   */
  choice(seq) {
    if (seq.length === 0) throw new RangeError("choice : séquence vide");
    return seq[this._randbelow(seq.length)];
  }

  /**
   * shuffle(x) EN PLACE (Fisher-Yates descendant de CPython).
   * @param {unknown[]} x
   */
  shuffle(x) {
    for (let i = x.length - 1; i >= 1; i--) {
      const j = this._randbelow(i + 1);
      const tmp = x[i];
      x[i] = x[j];
      x[j] = tmp;
    }
  }

  /**
   * sample(population, k) : k éléments distincts, ordre de sélection —
   * algorithme CPython exact (bascule pool/set selon setsize).
   * @template T @param {T[]} population @param {number} k @returns {T[]}
   */
  sample(population, k) {
    const n = population.length;
    if (!(k >= 0 && k <= n)) {
      throw new RangeError("sample : k hors de [0, n]");
    }
    const result = new Array(k);
    // setsize = 21 ; si k > 5 : += 4 ** ceil(log(k*3, 4)).
    // ceil(log(k*3, 4)) recalculé en entier : plus petit m tel que 4^m ≥ 3k
    // (3k n'est jamais une puissance de 4, donc identique au flottant CPython).
    let setsize = 21;
    if (k > 5) {
      let m = 0;
      let v = 1;
      while (v < k * 3) {
        v *= 4;
        m++;
      }
      setsize += v; // 4^m
    }
    if (n <= setsize) {
      const pool = population.slice();
      for (let i = 0; i < k; i++) {
        const j = this._randbelow(n - i);
        result[i] = pool[j];
        pool[j] = pool[n - i - 1];
      }
    } else {
      const selected = new Set();
      for (let i = 0; i < k; i++) {
        let j = this._randbelow(n);
        while (selected.has(j)) {
          j = this._randbelow(n);
        }
        selected.add(j);
        result[i] = population[j];
      }
    }
    return result;
  }
}
