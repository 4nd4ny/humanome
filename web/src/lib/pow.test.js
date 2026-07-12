import { describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { MAX_DIFFICULTY_BITS, leadingZeroBits, sha256Bytes, solvePow } from './pow.js'

/** Recomputes the digest with node:crypto — independent implementation. */
function sha256(input) {
  return new Uint8Array(createHash('sha256').update(input, 'utf8').digest())
}

describe('sha256Bytes (implémentation synchrone maison)', () => {
  it('coïncide avec node:crypto sur les vecteurs classiques et les tailles limites', () => {
    const vectors = [
      '', // bloc vide (padding pur)
      'abc', // vecteur FIPS 180-4
      'a'.repeat(55), // dernier octet avant un 2e bloc de padding
      'a'.repeat(56), // force le 2e bloc
      'a'.repeat(64), // exactement un bloc
      'a'.repeat(119),
      'défi-héhé-ключ-鍵', // multi-octets UTF-8
      'v1.1783825352.907bb85434fc8ff0.8a873b41337d901b:12345', // forme réelle challenge:nonce
    ]
    for (const vector of vectors) {
      expect(Buffer.from(sha256Bytes(vector)).toString('hex')).toBe(
        Buffer.from(sha256(vector)).toString('hex'),
      )
    }
    // Vecteur de référence publié (FIPS) pour "abc".
    expect(Buffer.from(sha256Bytes('abc')).toString('hex')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    )
  })
})

describe('leadingZeroBits', () => {
  it('compte les bits de poids fort à zéro', () => {
    expect(leadingZeroBits(new Uint8Array([0xff]))).toBe(0)
    expect(leadingZeroBits(new Uint8Array([0b01000000]))).toBe(1)
    expect(leadingZeroBits(new Uint8Array([0b00010000]))).toBe(3)
    expect(leadingZeroBits(new Uint8Array([0x01]))).toBe(7)
    expect(leadingZeroBits(new Uint8Array([0x00, 0xff]))).toBe(8)
    expect(leadingZeroBits(new Uint8Array([0x00, 0x00, 0x01]))).toBe(23)
    expect(leadingZeroBits(new Uint8Array([0x00, 0x00]))).toBe(16)
  })
})

describe('solvePow', () => {
  it('résout un défi à 8 bits — nonce vérifiable indépendamment (node:crypto)', async () => {
    const challenge = 'defi-de-test-P6'
    const { nonce, attempts } = await solvePow({ challenge, difficultyBits: 8 })

    // Convention du contrat api : SHA-256(`${challenge}:${nonce}`), bits de
    // poids fort à zéro. Vérification croisée hors Web Crypto.
    const digest = sha256(`${challenge}:${nonce}`)
    expect(digest[0]).toBe(0) // >= 8 bits à zéro
    expect(leadingZeroBits(digest)).toBeGreaterThanOrEqual(8)
    expect(Number(nonce)).toBe(attempts - 1) // nonces essayés dans l'ordre 0..n
  })

  it('retourne le premier nonce valide (déterministe pour un même défi)', async () => {
    const a = await solvePow({ challenge: 'stable', difficultyBits: 4 })
    const b = await solvePow({ challenge: 'stable', difficultyBits: 4 })
    expect(a.nonce).toBe(b.nonce)
  })

  it('difficulté 0 : premier essai accepté', async () => {
    const { nonce, attempts } = await solvePow({ challenge: 'x', difficultyBits: 0 })
    expect(nonce).toBe('0')
    expect(attempts).toBe(1)
  })

  it('s’interrompt sur AbortSignal', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(
      solvePow({ challenge: 'y', difficultyBits: 8, signal: controller.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('tient la difficulté serveur réelle (20 bits) en temps raisonnable', async () => {
    // config/demo.php fixe powDifficultyBits à 20 (~2^20 hachages) : le
    // solveur doit rester nettement sous les 30 s du timeout de test.
    const t0 = performance.now()
    const { nonce } = await solvePow({ challenge: 'bench-20-bits', difficultyBits: 20 })
    const digest = sha256(`bench-20-bits:${nonce}`)
    expect(leadingZeroBits(digest)).toBeGreaterThanOrEqual(20)
    expect(performance.now() - t0).toBeLessThan(25_000)
  }, 30_000)

  it('refuse une difficulté hostile ou un défi invalide', async () => {
    await expect(
      solvePow({ challenge: 'z', difficultyBits: MAX_DIFFICULTY_BITS + 1 }),
    ).rejects.toThrow(/difficultyBits/)
    await expect(solvePow({ challenge: 'z', difficultyBits: -1 })).rejects.toThrow(
      /difficultyBits/,
    )
    await expect(solvePow({ challenge: 'z', difficultyBits: 2.5 })).rejects.toThrow(
      /difficultyBits/,
    )
    await expect(solvePow({ challenge: '', difficultyBits: 1 })).rejects.toThrow(/challenge/)
  })
})
