// Proof-of-work solver for the public demo (P6, cahier §3.1 — « garde-fous
// anti-abus », plan-prompts P6.2 « preuve de travail côté client »).
//
// Contract with /api/llm (api/src/Llm/PowChallenge.php, hashcash-like):
//   1. GET api/llm/challenge -> {challenge, difficultyBits, expiresAt}
//      (challenge opaque « v1.<epoch>.<random>.<hmac> », expiresAt en
//      SECONDES epoch, un défi est à usage unique côté serveur) ;
//   2. the client finds a `nonce` (any string; decimal counter here) such
//      that SHA-256(UTF-8(`${challenge}:${nonce}`)) has at least
//      `difficultyBits` leading zero BITS (big-endian bit order);
//   3. POST api/llm carries {challenge, nonce, …}.
//
// Implementation choice (measured, see EssayerView tests + bench notes):
// the server difficulty is 20 bits (config/demo.php) ≈ 2^20 hashes. One
// awaited crypto.subtle.digest costs ~9 µs -> ~9 s per challenge: unusable
// for 8 calls. A synchronous JS SHA-256 costs ~1 µs/hash -> ~1 s per
// challenge, which is what the server config assumes (« 20 bits ≈ 1 s »).
// So the hot loop uses the hand-rolled, dependency-free SHA-256 below
// (cross-checked against node:crypto in pow.test.js), sliced in chunks with
// a MessageChannel macrotask yield — setTimeout would suffer the 4 ms
// nested-timer clamp — so the UI keeps painting and aborts stay reactive.

/** Hard ceiling: a hostile/misconfigured server must not park the CPU. */
export const MAX_DIFFICULTY_BITS = 22

/** Hashes per synchronous slice (~1-3 ms) between two yields/abort checks. */
const CHUNK_SIZE = 1024

// --- SHA-256 (FIPS 180-4), synchronous, dependency-free --------------------
// Standard public constants: first 32 bits of the fractional parts of the
// cube roots of the first 64 primes (K) / square roots of the first 8 (H).

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
])

const W = new Uint32Array(64) // shared schedule buffer (single-threaded JS)

/**
 * Synchronous SHA-256 of a string (UTF-8) or byte array.
 * @param {string | Uint8Array} input
 * @returns {Uint8Array} 32-byte digest
 */
export function sha256Bytes(input) {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input
  const bitLen = bytes.length * 8
  // Padding: 0x80, zeros, 64-bit big-endian bit length, to a 64-byte multiple.
  const paddedLen = (((bytes.length + 8) >> 6) + 1) << 6
  const buf = new Uint8Array(paddedLen)
  buf.set(bytes)
  buf[bytes.length] = 0x80
  const view = new DataView(buf.buffer)
  view.setUint32(paddedLen - 8, Math.floor(bitLen / 0x100000000))
  view.setUint32(paddedLen - 4, bitLen >>> 0)

  let h0 = 0x6a09e667
  let h1 = 0xbb67ae85
  let h2 = 0x3c6ef372
  let h3 = 0xa54ff53a
  let h4 = 0x510e527f
  let h5 = 0x9b05688c
  let h6 = 0x1f83d9ab
  let h7 = 0x5be0cd19

  const rotr = (x, n) => (x >>> n) | (x << (32 - n))

  for (let offset = 0; offset < paddedLen; offset += 64) {
    for (let i = 0; i < 16; i++) W[i] = view.getUint32(offset + i * 4)
    for (let i = 16; i < 64; i++) {
      const x = W[i - 15]
      const y = W[i - 2]
      const s0 = rotr(x, 7) ^ rotr(x, 18) ^ (x >>> 3)
      const s1 = rotr(y, 17) ^ rotr(y, 19) ^ (y >>> 10)
      W[i] = (W[i - 16] + s0 + W[i - 7] + s1) >>> 0
    }
    let a = h0
    let b = h1
    let c = h2
    let d = h3
    let e = h4
    let f = h5
    let g = h6
    let h = h7
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)
      const ch = (e & f) ^ (~e & g)
      const t1 = (h + S1 + ch + K[i] + W[i]) >>> 0
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)
      const maj = (a & b) ^ (a & c) ^ (b & c)
      const t2 = (S0 + maj) >>> 0
      h = g
      g = f
      f = e
      e = (d + t1) >>> 0
      d = c
      c = b
      b = a
      a = (t1 + t2) >>> 0
    }
    h0 = (h0 + a) >>> 0
    h1 = (h1 + b) >>> 0
    h2 = (h2 + c) >>> 0
    h3 = (h3 + d) >>> 0
    h4 = (h4 + e) >>> 0
    h5 = (h5 + f) >>> 0
    h6 = (h6 + g) >>> 0
    h7 = (h7 + h) >>> 0
  }

  const out = new Uint8Array(32)
  const outView = new DataView(out.buffer)
  outView.setUint32(0, h0)
  outView.setUint32(4, h1)
  outView.setUint32(8, h2)
  outView.setUint32(12, h3)
  outView.setUint32(16, h4)
  outView.setUint32(20, h5)
  outView.setUint32(24, h6)
  outView.setUint32(28, h7)
  return out
}

// --- PoW ---------------------------------------------------------------------

function abortError(signal) {
  const reason = signal?.reason
  if (reason instanceof Error) return reason
  return new DOMException('The operation was aborted.', 'AbortError')
}

/**
 * Counts the leading zero bits of a digest (big-endian bit order).
 * @param {Uint8Array} bytes
 * @returns {number} number of leading zero bits (8 per full zero byte)
 */
export function leadingZeroBits(bytes) {
  let bits = 0
  for (const byte of bytes) {
    if (byte === 0) {
      bits += 8
      continue
    }
    // 32-bit clz on the byte placed in the low-order octet.
    bits += Math.clz32(byte) - 24
    break
  }
  return bits
}

// Macrotask yield WITHOUT the setTimeout 4 ms nested-timer clamp: a
// MessageChannel message is a macrotask the browser schedules immediately,
// letting paints and abort events through between hash slices.
let yieldChannel = null
const yieldWaiters = []
function yieldMacrotask() {
  if (typeof MessageChannel !== 'function') {
    return new Promise((resolve) => setTimeout(resolve, 0))
  }
  if (yieldChannel === null) {
    yieldChannel = new MessageChannel()
    yieldChannel.port1.onmessage = () => yieldWaiters.shift()?.()
    // Node (tests/scripts): an open MessagePort pins the event loop; unref
    // is a no-op / absent in browsers.
    yieldChannel.port1.unref?.()
    yieldChannel.port2.unref?.()
  }
  return new Promise((resolve) => {
    yieldWaiters.push(resolve)
    yieldChannel.port2.postMessage(0)
  })
}

/**
 * Solves a proof-of-work challenge (see module header for the convention).
 * Runs in the main thread by design: synchronous SHA-256 slices of
 * CHUNK_SIZE hashes (~1-3 ms) interleaved with macrotask yields, so a
 * 20-bit challenge takes ~1-2 s while the UI stays responsive and abortable.
 *
 * @param {object} params
 * @param {string} params.challenge server-issued opaque challenge
 * @param {number} params.difficultyBits required leading zero bits (0..22)
 * @param {AbortSignal} [params.signal] cancels the search (AbortError)
 * @returns {Promise<{nonce: string, attempts: number}>} first valid nonce
 * @throws {TypeError} invalid challenge/difficulty
 * @throws {DOMException} AbortError when the signal fires
 */
export async function solvePow({ challenge, difficultyBits, signal } = {}) {
  if (typeof challenge !== 'string' || challenge === '') {
    throw new TypeError('solvePow : challenge (string non vide) requis')
  }
  const bits = Number(difficultyBits)
  if (!Number.isInteger(bits) || bits < 0 || bits > MAX_DIFFICULTY_BITS) {
    throw new TypeError(
      `solvePow : difficultyBits entier entre 0 et ${MAX_DIFFICULTY_BITS} requis (reçu ${difficultyBits})`,
    )
  }

  // The UTF-8 prefix `${challenge}:` is encoded once; only the ASCII decimal
  // nonce varies, appended into a reusable buffer (hot loop, ~2^difficulty runs).
  const prefix = new TextEncoder().encode(`${challenge}:`)
  const buffer = new Uint8Array(prefix.length + 20)
  buffer.set(prefix)

  for (let nonce = 0; ; ) {
    if (signal?.aborted) throw abortError(signal)
    for (let step = 0; step < CHUNK_SIZE; step++, nonce++) {
      const digits = String(nonce)
      for (let i = 0; i < digits.length; i++) {
        buffer[prefix.length + i] = digits.charCodeAt(i)
      }
      const digest = sha256Bytes(buffer.subarray(0, prefix.length + digits.length))
      if (leadingZeroBits(digest) >= bits) {
        return { nonce: digits, attempts: nonce + 1 }
      }
    }
    await yieldMacrotask() // let the browser paint / dispatch abort
  }
}
