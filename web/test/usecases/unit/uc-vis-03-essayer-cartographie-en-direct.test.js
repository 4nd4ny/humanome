// UC-VIS-03 — Essayer la cartographie en direct, sans compte : tests UNITAIRES (front).
// Fiche : docs/cas-utilisation/visiteur/UC-VIS-03-essayer-cartographie-en-direct.md
//
// Code sollicité côté navigateur, appelé directement : solveur de preuve de
// travail (parité avec la règle PHP PowChallenge), client de la démo
// (défi à usage unique, champ piège, une preuve par appel), traduction des
// refus serveur en messages, bornes de saisie. L'anomalie A1 (difficulté
// admissible côté admin > difficulté soluble côté client) est figée ici.
import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { leadingZeroBits, MAX_DIFFICULTY_BITS, solvePow } from '../../../src/lib/pow.js'
import {
  createDemoProvider,
  DEMO_CHALLENGE_URL,
  DEMO_PROXY_URL,
  DEMO_TEXT_MAX_CHARS,
  DEMO_TEXT_MIN_CHARS,
  describeDemoError,
  fetchChallenge,
} from '../../../src/lib/demo-llm.js'
import { ProviderError } from '../../../../engine/src/providers/errors.js'
import { fakeDemoServer, jsonResponse } from '../support/vis.js'

const hexToBytes = (hex) => Uint8Array.from(hex.match(/../g).map((b) => parseInt(b, 16)))

/** Défi au format EXACT de PowChallenge::issue (v1.<exp>.<aléa16>.<hmac64>). */
const SERVER_CHALLENGE = `v1.1800000300.0123456789abcdef.${'c'.repeat(64)}`

describe('UC-VIS-03 — preuve de travail : parité navigateur / serveur', () => {
  it('UC-VIS-03-U09 — leadingZeroBits compte comme PowChallenge::leadingZeroBits (mêmes vecteurs que le test PHP U03)', () => {
    const pad = (hex) => hex.padEnd(64, 'f')
    expect(leadingZeroBits(hexToBytes(pad('f')))).toBe(0)
    expect(leadingZeroBits(hexToBytes(pad('1abc')))).toBe(3)
    expect(leadingZeroBits(hexToBytes(pad('03ff')))).toBe(6)
    expect(leadingZeroBits(hexToBytes(pad('004f')))).toBe(9)
    expect(leadingZeroBits(hexToBytes('0'.repeat(64)))).toBe(256)
  })

  it('UC-VIS-03-U10 — solvePow sur un défi serveur : sha256(défi + ":" + nonce) satisfait la difficulté (vérifié par node:crypto)', async () => {
    const { nonce, attempts } = await solvePow({ challenge: SERVER_CHALLENGE, difficultyBits: 10 })
    const digest = createHash('sha256').update(`${SERVER_CHALLENGE}:${nonce}`, 'utf8').digest()
    expect(leadingZeroBits(new Uint8Array(digest))).toBeGreaterThanOrEqual(10)
    expect(Number(nonce)).toBe(attempts - 1)
    const controller = new AbortController()
    controller.abort()
    await expect(solvePow({ challenge: SERVER_CHALLENGE, difficultyBits: 20, signal: controller.signal })).rejects.toThrow()
  })
})

describe('UC-VIS-03 — client de la démo', () => {
  it('UC-VIS-03-U11 — fetchChallenge : URL relative api/llm/challenge ; refus serveur → ProviderError portant le statut', async () => {
    const ok = vi.fn().mockResolvedValue(jsonResponse(200, { challenge: SERVER_CHALLENGE, difficultyBits: 8, expiresAt: 1800000300 }))
    expect(await fetchChallenge({ fetchFn: ok })).toEqual({ challenge: SERVER_CHALLENGE, difficultyBits: 8, expiresAt: 1800000300 })
    expect(ok.mock.calls[0][0]).toBe(DEMO_CHALLENGE_URL)
    expect(DEMO_CHALLENGE_URL).toBe('api/llm/challenge')

    const disabled = vi.fn().mockResolvedValue(jsonResponse(503, { error: 'La démonstration est désactivée pour le moment.' }))
    const failure = await fetchChallenge({ fetchFn: disabled }).catch((e) => e)
    expect(failure).toBeInstanceOf(ProviderError)
    expect(failure.status).toBe(503)
    const empty = vi.fn().mockResolvedValue(jsonResponse(200, {}))
    await expect(fetchChallenge({ fetchFn: empty })).rejects.toThrow('champ challenge absent')
  })

  it('UC-VIS-03-U12 — createDemoProvider : chaque appel consomme un défi NEUF, résout sa preuve et envoie le champ piège vide', async () => {
    const server = fakeDemoServer({
      createHash,
      difficultyBits: 6,
      answer: (body, n) => jsonResponse(200, { text: `réponse ${n}`, usage: { inputTokens: 1, outputTokens: 1 }, model: 'mock' }),
    })
    const phases = []
    const { provider, prime } = createDemoProvider({ fetchFn: server.mock, onPhase: (p) => phases.push(p) })
    await prime()
    const first = await provider.complete({ model: 'demo', system: 'S', prompt: 'P1' })
    const second = await provider.complete({ model: 'demo', system: 'S', prompt: 'P2' })

    expect([first.text, second.text]).toEqual(['réponse 1', 'réponse 2'])
    expect(server.rejected).toEqual([]) // le faux serveur n'a rien refusé : preuves valides, défis uniques
    expect(server.issuedCount()).toBe(2)
    expect(server.posts.map((b) => b.website)).toEqual(['', ''])
    expect(new Set(server.posts.map((b) => b.challenge)).size).toBe(2)
    expect(server.mock.mock.calls.filter(([u]) => u === DEMO_PROXY_URL)).toHaveLength(2)
    expect(phases).toEqual(['challenge', 'pow', 'llm', 'challenge', 'pow', 'llm'])
  })

  it('UC-VIS-03-U13 — describeDemoError : 429 → délai en minutes et réessai ; 503 → démo épuisée, sans réessai ; autre → détail technique', () => {
    const quota = new ProviderError('HTTP 429', { status: 429 })
    quota.retryAfterMs = 120000
    expect(describeDemoError(quota)).toEqual({
      kind: 'quota',
      canRetry: true,
      message: 'La démo est très demandée en ce moment : réessayez dans 2 minutes.',
    })
    const wrapped = new Error('run', { cause: new ProviderError('HTTP 503', { status: 503 }) })
    expect(describeDemoError(wrapped)).toMatchObject({ kind: 'unavailable', canRetry: false })
    expect(describeDemoError(wrapped).message).toContain('créez un compte pour cartographier sans ces limites')
    expect(describeDemoError(new Error('JSON illisible'))).toMatchObject({ kind: 'llm', canRetry: true })
  })

  it('UC-VIS-03-U14 — bornes de saisie : 80 à 12 000 caractères côté page, sous le plafond serveur par défaut (20 000)', () => {
    expect(DEMO_TEXT_MIN_CHARS).toBe(80)
    expect(DEMO_TEXT_MAX_CHARS).toBe(12000)
    expect(DEMO_TEXT_MAX_CHARS).toBeLessThan(20000)
  })

  // ANOMALIE A1 de la fiche — test qui FIGE le comportement ACTUEL : l'admin
  // peut régler la difficulté jusqu'à 24 bits (DemoConfigService INT_BOUNDS
  // powDifficultyBits [8, 24]) mais le solveur du navigateur refuse au-delà
  // de 22 (MAX_DIFFICULTY_BITS) : toute cartographie échouerait avec un
  // message générique. À inverser quand les deux bornes seront alignées.
  it('UC-VIS-03-U15 — [comportement actuel, anomalie A1] difficulté 23 ou 24 (admissible côté admin) : insoluble côté navigateur', async () => {
    expect(MAX_DIFFICULTY_BITS).toBe(22)
    const failure = await solvePow({ challenge: SERVER_CHALLENGE, difficultyBits: 23 }).catch((e) => e)
    expect(failure).toBeInstanceOf(TypeError)
    expect(failure.message).toContain('entre 0 et 22')
    expect(describeDemoError(failure).kind).toBe('llm') // message générique « l'analyse a échoué »
  })
})
