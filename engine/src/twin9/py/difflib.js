// Port fidèle du sous-ensemble de difflib.SequenceMatcher (CPython, Lib/difflib.py)
// réellement utilisé par util.find_verbatim : find_longest_match(0, la, 0, lb),
// get_matching_blocks() et ratio(). isjunk n'est jamais fourni (bjunk vide) ;
// autojunk EXACT : si autojunk et len(b) >= 200, tout élément apparaissant
// strictement plus de floor(len(b)/100) + 1 fois dans b devient « populaire »
// et disparaît de b2j (mais PAS de bjunk : les boucles d'extension du
// find_longest_match traversent les éléments populaires — reproduites ici).
// Les chaînes sont comparées par POINTS DE CODE (sémantique Python), pas par
// unités UTF-16 : conversion interne via Array.from.

/**
 * @typedef {{ a: number, b: number, size: number }} Match
 */

export class SequenceMatcher {
  /**
   * SequenceMatcher(isjunk=None, a, b, autojunk) — isjunk non porté (jamais
   * utilisé par Twin9).
   * @param {string|string[]} a
   * @param {string|string[]} b
   * @param {{ autojunk?: boolean }} [opts]
   */
  constructor(a = "", b = "", { autojunk = true } = {}) {
    this.autojunk = autojunk;
    /** @type {string[]} */
    this.a = typeof a === "string" ? Array.from(a) : a;
    /** @type {string[]} */
    this.b = typeof b === "string" ? Array.from(b) : b;
    /** @type {Match[]|null} */
    this.matchingBlocks = null;
    this._chainB();
  }

  /** __chain_b : construit b2j puis retire les éléments populaires (autojunk). */
  _chainB() {
    const b = this.b;
    const n = b.length;
    /** @type {Map<string, number[]>} */
    const b2j = new Map();
    for (let i = 0; i < n; i++) {
      const elt = b[i];
      let idxs = b2j.get(elt);
      if (!idxs) {
        idxs = [];
        b2j.set(elt, idxs);
      }
      idxs.push(i);
    }
    // bjunk : vide (isjunk=None dans les deux usages de find_verbatim).
    /** @type {Set<string>} */
    this.bjunk = new Set();
    /** @type {Set<string>} */
    this.bpopular = new Set();
    if (this.autojunk && n >= 200) {
      const ntest = Math.floor(n / 100) + 1;
      for (const [elt, idxs] of b2j) {
        if (idxs.length > ntest) this.bpopular.add(elt);
      }
      for (const elt of this.bpopular) b2j.delete(elt);
    }
    this.b2j = b2j;
  }

  /**
   * find_longest_match(alo, ahi, blo, bhi) : plus long appariement dans
   * a[alo:ahi] × b[blo:bhi]. Départage CPython : premier k > bestsize gagne
   * (plus petit i, puis plus petit j) — strictement supérieur.
   * @param {number} [alo] @param {number} [ahi] @param {number} [blo] @param {number} [bhi]
   * @returns {Match}
   */
  findLongestMatch(alo = 0, ahi = this.a.length, blo = 0, bhi = this.b.length) {
    const { a, b, b2j, bjunk } = this;
    let besti = alo;
    let bestj = blo;
    let bestsize = 0;
    /** @type {Map<number, number>} */
    let j2len = new Map();
    for (let i = alo; i < ahi; i++) {
      /** @type {Map<number, number>} */
      const newj2len = new Map();
      const idxs = b2j.get(a[i]);
      if (idxs) {
        for (const j of idxs) {
          if (j < blo) continue;
          if (j >= bhi) break; // indices croissants : on peut s'arrêter
          const k = (j2len.get(j - 1) || 0) + 1;
          newj2len.set(j, k);
          if (k > bestsize) {
            besti = i - k + 1;
            bestj = j - k + 1;
            bestsize = k;
          }
        }
      }
      j2len = newj2len;
    }
    // Extensions CPython : d'abord par éléments NON junk (les « populaires »
    // de l'autojunk passent ce test, bjunk étant vide), puis par éléments junk
    // (sans effet ici, gardé pour fidélité à la source).
    while (
      besti > alo && bestj > blo &&
      !bjunk.has(b[bestj - 1]) &&
      a[besti - 1] === b[bestj - 1]
    ) {
      besti--;
      bestj--;
      bestsize++;
    }
    while (
      besti + bestsize < ahi && bestj + bestsize < bhi &&
      !bjunk.has(b[bestj + bestsize]) &&
      a[besti + bestsize] === b[bestj + bestsize]
    ) {
      bestsize++;
    }
    while (
      besti > alo && bestj > blo &&
      bjunk.has(b[bestj - 1]) &&
      a[besti - 1] === b[bestj - 1]
    ) {
      besti--;
      bestj--;
      bestsize++;
    }
    while (
      besti + bestsize < ahi && bestj + bestsize < bhi &&
      bjunk.has(b[bestj + bestsize]) &&
      a[besti + bestsize] === b[bestj + bestsize]
    ) {
      bestsize++;
    }
    return { a: besti, b: bestj, size: bestsize };
  }

  /**
   * get_matching_blocks() : blocs triés par (i, j), blocs adjacents fusionnés,
   * sentinelle (la, lb, 0) finale. Résultat mémorisé.
   * @returns {Match[]}
   */
  getMatchingBlocks() {
    if (this.matchingBlocks !== null) return this.matchingBlocks;
    const la = this.a.length;
    const lb = this.b.length;
    /** @type {[number, number, number, number][]} */
    const queue = [[0, la, 0, lb]];
    /** @type {Match[]} */
    const blocks = [];
    while (queue.length) {
      const [alo, ahi, blo, bhi] = /** @type {[number, number, number, number]} */ (queue.pop());
      const x = this.findLongestMatch(alo, ahi, blo, bhi);
      const { a: i, b: j, size: k } = x;
      if (k) {
        blocks.push(x);
        if (alo < i && blo < j) queue.push([alo, i, blo, j]);
        if (i + k < ahi && j + k < bhi) queue.push([i + k, ahi, j + k, bhi]);
      }
    }
    // Tri par tuples (i, j, size) — comparaison élément par élément.
    blocks.sort((x, y) => x.a - y.a || x.b - y.b || x.size - y.size);
    // Fusion des blocs adjacents.
    let i1 = 0;
    let j1 = 0;
    let k1 = 0;
    /** @type {Match[]} */
    const nonAdjacent = [];
    for (const { a: i2, b: j2, size: k2 } of blocks) {
      if (i1 + k1 === i2 && j1 + k1 === j2) {
        k1 += k2;
      } else {
        if (k1) nonAdjacent.push({ a: i1, b: j1, size: k1 });
        i1 = i2;
        j1 = j2;
        k1 = k2;
      }
    }
    if (k1) nonAdjacent.push({ a: i1, b: j1, size: k1 });
    nonAdjacent.push({ a: la, b: lb, size: 0 });
    this.matchingBlocks = nonAdjacent;
    return nonAdjacent;
  }

  /**
   * ratio() = 2·M / T, M = somme des tailles des matching blocks,
   * T = len(a) + len(b). Division flottante IEEE (identique Python/JS).
   * @returns {number}
   */
  ratio() {
    let matches = 0;
    for (const { size } of this.getMatchingBlocks()) matches += size;
    return (2.0 * matches) / (this.a.length + this.b.length);
  }
}
