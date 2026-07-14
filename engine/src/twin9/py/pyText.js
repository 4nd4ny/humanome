// Sémantiques de chaînes Python (CPython 3) nécessaires au noyau Twin_v9 :
// str.isspace()/strip()/splitlines(), classe regex \s Python, universal
// newlines, et index par POINTS DE CODE (sémantique len/slice Python — les
// offsets persistés dans les artefacts sont en points de code, pas en unités
// UTF-16). Les ensembles de caractères ci-dessous ont été énumérés en scannant
// tout l'espace Unicode avec CPython (0x0..0x10FFFF) — ne pas « simplifier ».

// Ensemble str.isspace() — IDENTIQUE à la classe \s du module re de Python
// (vérifié par énumération exhaustive : mêmes 29 points de code).
const PY_SPACE_CODEPOINTS = [
  0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x1c, 0x1d, 0x1e, 0x1f, 0x20,
  0x85, 0xa0, 0x1680,
  0x2000, 0x2001, 0x2002, 0x2003, 0x2004, 0x2005, 0x2006, 0x2007,
  0x2008, 0x2009, 0x200a, 0x2028, 0x2029, 0x202f, 0x205f, 0x3000,
];

const PY_SPACE_SET = new Set(PY_SPACE_CODEPOINTS.map((c) => String.fromCodePoint(c)));

/**
 * Classe de caractères regex équivalente au \s de Python (à insérer dans un
 * littéral de classe : `[${PY_WS_CLASS}]`). Le \s de JS diverge (pas de
 * U+001C–001F ni U+0085, mais U+FEFF en plus) : ne jamais utiliser \s dans
 * les regex portées.
 */
export const PY_WS_CLASS =
  "\\t\\n\\x0b\\f\\r\\x1c\\x1d\\x1e\\x1f \\x85\\xa0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000";

/**
 * str.isspace() Python pour UN caractère (point de code).
 * @param {string} ch
 * @returns {boolean}
 */
export function pyIsSpace(ch) {
  return PY_SPACE_SET.has(ch);
}

/** @param {string} s @param {string|undefined} chars @returns {Set<string>|null} */
function stripSet(chars) {
  return chars === undefined ? null : new Set(Array.from(chars));
}

/** @param {string} ch @param {Set<string>|null} set */
function inStripSet(ch, set) {
  return set === null ? PY_SPACE_SET.has(ch) : set.has(ch);
}

/**
 * str.strip([chars]) Python : sans argument, retire les espaces au sens
 * isspace() ; avec `chars`, retire tout caractère de l'ensemble, répétitivement,
 * aux deux extrémités. Travaille en points de code.
 * @param {string} s @param {string} [chars] @returns {string}
 */
export function pyStrip(s, chars) {
  const cp = Array.from(s);
  const set = stripSet(chars);
  let i = 0;
  let j = cp.length;
  while (i < j && inStripSet(cp[i], set)) i++;
  while (j > i && inStripSet(cp[j - 1], set)) j--;
  return cp.slice(i, j).join("");
}

/**
 * str.lstrip([chars]) Python.
 * @param {string} s @param {string} [chars] @returns {string}
 */
export function pyLStrip(s, chars) {
  const cp = Array.from(s);
  const set = stripSet(chars);
  let i = 0;
  while (i < cp.length && inStripSet(cp[i], set)) i++;
  return cp.slice(i).join("");
}

/**
 * str.rstrip([chars]) Python.
 * @param {string} s @param {string} [chars] @returns {string}
 */
export function pyRStrip(s, chars) {
  const cp = Array.from(s);
  const set = stripSet(chars);
  let j = cp.length;
  while (j > 0 && inStripSet(cp[j - 1], set)) j--;
  return cp.slice(0, j).join("");
}

// Terminateurs de str.splitlines() (énumérés avec CPython) : \r\n compte pour
// UN saut ; terminateurs simples \n \v \f \r \x1c \x1d \x1e \x85 U+2028 U+2029.
const SPLITLINES_SET = new Set(
  [0x0a, 0x0b, 0x0c, 0x0d, 0x1c, 0x1d, 0x1e, 0x85, 0x2028, 0x2029].map((c) =>
    String.fromCodePoint(c),
  ),
);

/**
 * str.splitlines() Python (keepends=False) : pas de chaîne vide finale si le
 * texte se termine par un terminateur ; \r\n = un seul saut.
 * @param {string} s @returns {string[]}
 */
export function pySplitlines(s) {
  const cp = Array.from(s);
  const out = [];
  let start = 0;
  let i = 0;
  while (i < cp.length) {
    if (SPLITLINES_SET.has(cp[i])) {
      out.push(cp.slice(start, i).join(""));
      if (cp[i] === "\r" && i + 1 < cp.length && cp[i + 1] === "\n") i++;
      i++;
      start = i;
    } else {
      i++;
    }
  }
  if (start < cp.length) out.push(cp.slice(start).join(""));
  return out;
}

/**
 * Universal newlines de Python (open(..., "r") mode texte) : \r\n et \r → \n.
 * À appliquer AVANT toute regex ^/$ et tout calcul d'offsets.
 * @param {string} s @returns {string}
 */
export function universalNewlines(s) {
  return s.replace(/\r\n?/g, "\n");
}

/**
 * len(s) Python : nombre de points de code (pas d'unités UTF-16).
 * @param {string} s @returns {number}
 */
export function cpLen(s) {
  let n = 0;
  // eslint-disable-next-line no-unused-vars
  for (const _ch of s) n++;
  return n;
}

/**
 * s[start:end] Python : tranche par POINTS DE CODE (bornes non négatives,
 * `end` omis = fin de chaîne, bornes hors limites tolérées comme en Python).
 * Chemin rapide sans allocation quand la chaîne est entièrement dans le BMP.
 * @param {string} s @param {number} start @param {number} [end]
 * @returns {string}
 */
export function cpSlice(s, start, end) {
  let hasAstral = false;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      hasAstral = true;
      break;
    }
  }
  if (!hasAstral) return s.slice(start, end === undefined ? s.length : end);
  return Array.from(s)
    .slice(start, end === undefined ? undefined : end)
    .join("");
}

/**
 * Convertisseur d'index UTF-16 → index point de code pour `s`. Retourne une
 * fonction (rapide : identité si la chaîne est entièrement dans le BMP).
 * Les index convertis DOIVENT pointer sur un début de point de code.
 * @param {string} s @returns {(u16: number) => number}
 */
export function u16ToCpIndexer(s) {
  // Chaîne sans caractère astral : index identiques.
  let hasAstral = false;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      hasAstral = true;
      break;
    }
  }
  if (!hasAstral) return (u16) => u16;
  // Table croissante des débuts de points de code (index UTF-16).
  /** @type {number[]} */
  const starts = [];
  for (let i = 0; i < s.length; i++) {
    starts.push(i);
    const c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) i++; // paire de substitution
  }
  return (u16) => {
    if (u16 >= s.length) return starts.length + (u16 - s.length);
    // Recherche dichotomique du début de point de code.
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid] <= u16) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  };
}
