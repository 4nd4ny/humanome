// UC-VIS-03 — Essayer la cartographie en direct, sans compte : tests UNITAIRES (front).
// Fiche : docs/cas-utilisation/visiteur/UC-VIS-03-essayer-cartographie-en-direct.md
//
// Code sollicité côté navigateur, appelé directement : solveur de preuve de
// travail (parité avec la règle PHP PowChallenge), client de la démo
// (défi à usage unique, champ piège, une preuve par appel, nouvel essai unique
// sur incident transitoire), traduction des refus serveur en messages, bornes
// de saisie, date locale. Les anomalies AN1 (difficulté admissible côté admin
// > difficulté soluble côté client), AN2 (le moteur réessaie contre le quota et
// le budget) et AN3 (borne de 12 000 caractères + gabarit > plafond serveur)
// sont figées ici.
import { createHash } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { leadingZeroBits, MAX_DIFFICULTY_BITS, solvePow } from '../../../src/lib/pow.js'
import {
  createDemoProvider,
  DEMO_CHALLENGE_URL,
  DEMO_PROXY_URL,
  DEMO_TEXT_MAX_CHARS,
  DEMO_TEXT_MIN_CHARS,
  describeDemoError,
  fetchChallenge,
  localIsoToday,
  UPSTREAM_RETRY_DELAY_MS,
} from '../../../src/lib/demo-llm.js'
import { ProviderError } from '../../../../engine/src/providers/errors.js'
import { buildExtractionPrompt, extractDay } from '../../../../engine/src/pipeline/extract.js'
import referentiel from '../../../../schemas/fixtures/referentiel-respire-v7.json'
import { fakeDemoServer, jsonResponse } from '../support/vis.js'

afterEach(() => {
  vi.useRealTimers()
})

const DAY_TEXT =
  'Aujourd’hui j’ai animé la réunion de l’atelier vélo : j’ai préparé l’ordre du jour, ' +
  'écouté les désaccords sur le budget et proposé un vote.'

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
    await expect(solvePow({ challenge: SERVER_CHALLENGE, difficultyBits: 20, signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' })
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
    expect(describeDemoError(new Error('JSON illisible')).message).toContain('(détail technique : JSON illisible)')
  })

  it('UC-VIS-03-U14 — bornes de saisie de la page : 80 caractères utiles au moins, 12 000 caractères bruts au plus (voir AN3 pour le plafond serveur)', () => {
    expect(DEMO_TEXT_MIN_CHARS).toBe(80)
    expect(DEMO_TEXT_MAX_CHARS).toBe(12000)
  })

  // ANOMALIE AN1 de la fiche — test qui FIGE le comportement ACTUEL : l'admin
  // peut régler la difficulté jusqu'à 24 bits (DemoConfigService INT_BOUNDS
  // powDifficultyBits [8, 24]) mais le solveur du navigateur refuse au-delà
  // de 22 (MAX_DIFFICULTY_BITS) : toute cartographie échouerait avec un
  // message générique. À inverser quand les deux bornes seront alignées.
  it('UC-VIS-03-U15 — [comportement actuel, anomalie AN1] difficulté 23 ou 24 (admissible côté admin) : insoluble côté navigateur', async () => {
    expect(MAX_DIFFICULTY_BITS).toBe(22)
    const failure = await solvePow({ challenge: SERVER_CHALLENGE, difficultyBits: 23 }).catch((e) => e)
    expect(failure).toBeInstanceOf(TypeError)
    expect(failure.message).toContain('entre 0 et 22')
    expect(describeDemoError(failure).kind).toBe('llm') // message générique « l'analyse a échoué »
  })

  it('UC-VIS-03-U21 — createDemoProvider : UN nouvel essai après 2,5 s, défi neuf, sur 504 / erreur réseau / défi expiré ; jamais sur 429, 503, preuve invalide ni après annulation', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const ok = (text) => jsonResponse(200, { text, usage: { inputTokens: 1, outputTokens: 1 }, model: 'mock' })
    /** Premier POST → `first`, les suivants → 200. */
    const run = async (first) => {
      const phases = []
      const server = fakeDemoServer({ createHash, difficultyBits: 2, answer: (body, n) => (n === 1 ? first() : ok(`réponse ${n}`)) })
      const { provider } = createDemoProvider({ fetchFn: server.mock, onPhase: (p) => phases.push(p) })
      const pending = provider.complete({ model: 'demo', prompt: 'P' }).then((r) => ({ ok: r }), (e) => ({ error: e }))
      await vi.advanceTimersByTimeAsync(UPSTREAM_RETRY_DELAY_MS - 100)
      const postsBeforeDelay = server.posts.length
      await vi.advanceTimersByTimeAsync(200)
      return { outcome: await pending, server, phases, postsBeforeDelay }
    }
    expect(UPSTREAM_RETRY_DELAY_MS).toBe(2500)

    const transient = await run(() => jsonResponse(504, { error: 'injoignable' }))
    expect(transient.outcome.ok.text).toBe('réponse 2')
    expect(transient.postsBeforeDelay).toBe(1) // pas avant 2,5 s…
    expect(transient.server.posts).toHaveLength(2) // … puis un seul nouvel essai
    expect(new Set(transient.server.posts.map((p) => p.challenge)).size).toBe(2)
    expect(transient.phases).toEqual(['challenge', 'pow', 'llm', 'retry', 'challenge', 'pow', 'llm'])

    const network = await run(() => Promise.reject(new TypeError('Failed to fetch')))
    expect(network.server.posts).toHaveLength(2)
    const expired = await run(() => jsonResponse(400, { error: 'Défi expiré : demandez un nouveau défi.', code: 'pow_expired' }))
    expect(expired.server.posts).toHaveLength(2)

    for (const [label, first] of [
      ['429', () => jsonResponse(429, { error: 'Quota horaire atteint, réessayez plus tard.' })],
      ['503', () => jsonResponse(503, { error: 'Démo épuisée pour aujourd’hui, revenez demain.' })],
      ['preuve invalide', () => jsonResponse(400, { error: 'Preuve de travail invalide.', code: 'pow_invalid' })],
    ]) {
      const refused = await run(first)
      expect(refused.outcome.error, label).toBeInstanceOf(Error)
      expect(refused.server.posts, label).toHaveLength(1)
      expect(refused.phases, label).not.toContain('retry')
    }

    // Annulation : aucun nouvel essai.
    const controller = new AbortController()
    const server = fakeDemoServer({
      createHash,
      difficultyBits: 2,
      answer: () => {
        controller.abort()
        return jsonResponse(504, { error: 'injoignable' })
      },
    })
    const { provider } = createDemoProvider({ fetchFn: server.mock })
    const aborted = provider.complete({ model: 'demo', prompt: 'P', signal: controller.signal }).catch((e) => e)
    await vi.advanceTimersByTimeAsync(3000)
    expect(await aborted).toBeInstanceOf(Error)
    expect(server.posts).toHaveLength(1)
  })

  // ANOMALIE AN2 de la fiche — comportement ACTUEL figé : extractDay refait UNE
  // fois tout appel pôle (ou kairos) en échec, quel que soit le statut. Dans la
  // pile de la page (createDemoProvider + extractDay), un 429 de quota ou un
  // 503 de budget au POST coûte donc DEUX POST (deux défis, deux unités de
  // quota), sans attendre le Retry-After ; un 5xx persistant coûte QUATRE POST
  // par pôle (nouvel essai de la démo × nouvel essai du moteur). À inverser
  // quand le moteur ne réessaiera plus les refus de quota/budget.
  it('UC-VIS-03-U22 — [comportement actuel, anomalie AN2] pile de la page : 429 ou 503 au POST → 2 POST ; 504 persistant → 4 POST sur le pôle 1', async () => {
    const stack = async (status) => {
      const server = fakeDemoServer({ createHash, difficultyBits: 2, answer: () => jsonResponse(status, { error: `refus ${status}` }) })
      const { provider } = createDemoProvider({ fetchFn: server.mock })
      const failure = extractDay({ dayText: DAY_TEXT, date: '2026-09-28', referentiel, provider, model: 'demo', kairosOptional: true }).catch((e) => e)
      await vi.advanceTimersByTimeAsync(3 * UPSTREAM_RETRY_DELAY_MS)
      return { failure: await failure, server }
    }
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })

    const quota = await stack(429)
    expect(quota.server.posts).toHaveLength(2) // attendu : 1 (pas de réessai contre un quota, RG5)
    expect(quota.server.issuedCount()).toBe(2) // deux défis résolus
    expect(describeDemoError(quota.failure).kind).toBe('quota')

    const budget = await stack(503)
    expect(budget.server.posts).toHaveLength(2) // attendu : 1
    expect(describeDemoError(budget.failure).kind).toBe('unavailable')

    const gateway = await stack(504)
    expect(gateway.server.posts).toHaveLength(4) // 2 (démo) × 2 (moteur) sur le pôle 1
    expect(gateway.failure.message).toContain('extractDay : pôle 1')
  })

  // ANOMALIE AN3 de la fiche — comportement ACTUEL figé : la page accepte
  // 12 000 caractères, mais le gabarit du prompt d'extraction ajoute ≈ 8 600
  // caractères au texte ; le serveur plafonne system + prompt à 20 000
  // (maxInputChars) et répond 413 au-delà d'environ 11 428 caractères de texte.
  it('UC-VIS-03-U23 — [comportement actuel, anomalie AN3] au maximum de la page (12 000 caractères), le prompt d’un pôle dépasse le plafond serveur de 20 000', () => {
    const lengths = [1, 2, 3, 4, 5, 6, 7].map(
      (poleNum) => buildExtractionPrompt({ referentiel, poleNum, dayText: 'x'.repeat(DEMO_TEXT_MAX_CHARS), date: '2026-01-01' }).length,
    )
    expect(Math.max(...lengths)).toBeGreaterThan(20000) // attendu : ≤ 20 000
    const template = Math.max(...lengths) - DEMO_TEXT_MAX_CHARS
    expect(20000 - template).toBeLessThan(DEMO_TEXT_MAX_CHARS) // texte réellement admissible < borne affichée
  })

  it('UC-VIS-03-U24 — localIsoToday : la journée est datée du jour LOCAL du navigateur (pas du jour UTC)', () => {
    const previous = process.env.TZ
    try {
      process.env.TZ = 'Pacific/Kiritimati' // UTC+14
      const localMidnightThirty = new Date(2026, 0, 1, 0, 30) // 31/12/2025 10:30 UTC
      expect(localMidnightThirty.toISOString().slice(0, 10)).toBe('2025-12-31')
      expect(localIsoToday(localMidnightThirty)).toBe('2026-01-01')
    } finally {
      if (previous === undefined) delete process.env.TZ
      else process.env.TZ = previous
    }
  })
})
