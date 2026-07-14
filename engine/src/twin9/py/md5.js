// MD5 pur JS (RFC 1321) opérant sur des octets UTF-8 — aucune dépendance,
// aucune API DOM/Node (crypto.subtle ne fait pas MD5). Fondation de stable_hash.
// Table K littérale (générée depuis CPython : int(abs(sin(i+1)) * 2**32)) —
// on n'utilise PAS Math.sin, dont la précision n'est pas garantie entre moteurs.

const K = new Uint32Array([
  0xd76aa478, 0xe8c7b756, 0x242070db, 0xc1bdceee, 0xf57c0faf, 0x4787c62a,
  0xa8304613, 0xfd469501, 0x698098d8, 0x8b44f7af, 0xffff5bb1, 0x895cd7be,
  0x6b901122, 0xfd987193, 0xa679438e, 0x49b40821, 0xf61e2562, 0xc040b340,
  0x265e5a51, 0xe9b6c7aa, 0xd62f105d, 0x02441453, 0xd8a1e681, 0xe7d3fbc8,
  0x21e1cde6, 0xc33707d6, 0xf4d50d87, 0x455a14ed, 0xa9e3e905, 0xfcefa3f8,
  0x676f02d9, 0x8d2a4c8a, 0xfffa3942, 0x8771f681, 0x6d9d6122, 0xfde5380c,
  0xa4beea44, 0x4bdecfa9, 0xf6bb4b60, 0xbebfbc70, 0x289b7ec6, 0xeaa127fa,
  0xd4ef3085, 0x04881d05, 0xd9d4d039, 0xe6db99e5, 0x1fa27cf8, 0xc4ac5665,
  0xf4292244, 0x432aff97, 0xab9423a7, 0xfc93a039, 0x655b59c3, 0x8f0ccc92,
  0xffeff47d, 0x85845dd1, 0x6fa87e4f, 0xfe2ce6e0, 0xa3014314, 0x4e0811a1,
  0xf7537e82, 0xbd3af235, 0x2ad7d2bb, 0xeb86d391,
]);

// Rotations par ronde (4 valeurs répétées 4 fois par groupe de 16).
const S = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
  5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
  4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
  6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
];

/**
 * Encode une chaîne JS en octets UTF-8 (sémantique identique à
 * `s.encode("utf-8")` Python pour toute chaîne bien formée ; un substitut
 * isolé — impossible côté Python — est remplacé par U+FFFD comme TextEncoder).
 * Implémentation locale pour rester indépendant de toute API d'environnement.
 * @param {string} s
 * @returns {Uint8Array}
 */
export function utf8Encode(s) {
  const out = [];
  for (let i = 0; i < s.length; i++) {
    let c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) {
      const c2 = s.charCodeAt(i + 1);
      if (c2 >= 0xdc00 && c2 <= 0xdfff) {
        c = 0x10000 + ((c - 0xd800) << 10) + (c2 - 0xdc00);
        i++;
      }
    }
    if (c >= 0xd800 && c <= 0xdfff) c = 0xfffd; // substitut isolé
    if (c < 0x80) {
      out.push(c);
    } else if (c < 0x800) {
      out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    } else if (c < 0x10000) {
      out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    } else {
      out.push(
        0xf0 | (c >> 18),
        0x80 | ((c >> 12) & 63),
        0x80 | ((c >> 6) & 63),
        0x80 | (c & 63),
      );
    }
  }
  return Uint8Array.from(out);
}

/**
 * Condensat MD5 (16 octets) d'un tableau d'octets.
 * @param {Uint8Array} bytes
 * @returns {Uint8Array} 16 octets
 */
export function md5Bytes(bytes) {
  const n = bytes.length;
  // Bourrage : 0x80, zéros jusqu'à 56 mod 64, puis longueur en bits (64 bits LE).
  const total = ((n + 8) >> 6) * 64 + 64;
  const buf = new Uint8Array(total);
  buf.set(bytes);
  buf[n] = 0x80;
  const bitLen = n * 8; // exact tant que n < 2^50 octets
  const lenLo = bitLen % 4294967296;
  const lenHi = Math.floor(bitLen / 4294967296);
  buf[total - 8] = lenLo & 0xff;
  buf[total - 7] = (lenLo >>> 8) & 0xff;
  buf[total - 6] = (lenLo >>> 16) & 0xff;
  buf[total - 5] = (lenLo >>> 24) & 0xff;
  buf[total - 4] = lenHi & 0xff;
  buf[total - 3] = (lenHi >>> 8) & 0xff;
  buf[total - 2] = (lenHi >>> 16) & 0xff;
  buf[total - 1] = (lenHi >>> 24) & 0xff;

  let a0 = 0x67452301 | 0;
  let b0 = 0xefcdab89 | 0;
  let c0 = 0x98badcfe | 0;
  let d0 = 0x10325476 | 0;
  const M = new Int32Array(16);

  for (let off = 0; off < total; off += 64) {
    for (let i = 0; i < 16; i++) {
      const p = off + i * 4;
      M[i] = buf[p] | (buf[p + 1] << 8) | (buf[p + 2] << 16) | (buf[p + 3] << 24);
    }
    let A = a0;
    let B = b0;
    let C = c0;
    let D = d0;
    for (let i = 0; i < 64; i++) {
      let F;
      let g;
      if (i < 16) {
        F = (B & C) | (~B & D);
        g = i;
      } else if (i < 32) {
        F = (D & B) | (~D & C);
        g = (5 * i + 1) & 15;
      } else if (i < 48) {
        F = B ^ C ^ D;
        g = (3 * i + 5) & 15;
      } else {
        F = C ^ (B | ~D);
        g = (7 * i) & 15;
      }
      // Sommes en arithmétique Number (exactes < 2^53) puis troncature 32 bits.
      let x = (A + F + K[i] + M[g]) | 0;
      const s = S[i];
      x = (x << s) | (x >>> (32 - s));
      A = D;
      D = C;
      C = B;
      B = (B + x) | 0;
    }
    a0 = (a0 + A) | 0;
    b0 = (b0 + B) | 0;
    c0 = (c0 + C) | 0;
    d0 = (d0 + D) | 0;
  }

  // Sortie : a, b, c, d en little-endian.
  const out = new Uint8Array(16);
  const words = [a0, b0, c0, d0];
  for (let w = 0; w < 4; w++) {
    out[w * 4] = words[w] & 0xff;
    out[w * 4 + 1] = (words[w] >>> 8) & 0xff;
    out[w * 4 + 2] = (words[w] >>> 16) & 0xff;
    out[w * 4 + 3] = (words[w] >>> 24) & 0xff;
  }
  return out;
}

const HEX = "0123456789abcdef";

/**
 * Hexdigest MD5 (32 caractères hex minuscules), équivalent à
 * `hashlib.md5(input).hexdigest()` — une chaîne est d'abord encodée en UTF-8.
 * @param {string|Uint8Array} input
 * @returns {string}
 */
export function md5Hex(input) {
  const bytes = typeof input === "string" ? utf8Encode(input) : input;
  const digest = md5Bytes(bytes);
  let hex = "";
  for (let i = 0; i < 16; i++) {
    hex += HEX[digest[i] >>> 4] + HEX[digest[i] & 15];
  }
  return hex;
}
