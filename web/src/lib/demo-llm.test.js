import { describe, expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'
import { ProviderError } from '@engine/providers/errors.js'
import { leadingZeroBits } from './pow.js'
import {
  DEMO_CHALLENGE_URL,
  DEMO_PROXY_URL,
  createDemoProvider,
  describeDemoError,
  fetchChallenge,
  isAbortError,
  localIsoToday,
} from './demo-llm.js'

function jsonResponse(status, data, headers = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => headers[String(name).toLowerCase()] ?? null },
    json: async () => data,
  }
}

/**
 * Fake fetch implementing the announced /api/llm contract:
 * GET api/llm/challenge -> one-time challenge ; POST api/llm -> {text, usage, model}.
 */
function makeFetch({ difficultyBits = 4, llm } = {}) {
  const issued = []
  const posts = []
  const fetchFn = vi.fn(async (url, init = {}) => {
    if (String(url) === DEMO_CHALLENGE_URL) {
      const challenge = `ch-${issued.length + 1}`
      issued.push(challenge)
      return jsonResponse(200, {
        challenge,
        difficultyBits,
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      })
    }
    if (String(url) === DEMO_PROXY_URL) {
      const body = JSON.parse(init.body)
      posts.push(body)
      return (
        llm?.(body, posts.length, init) ??
        jsonResponse(200, {
          text: `réponse ${posts.length}`,
          usage: { inputTokens: 10, outputTokens: 5 },
          model: 'demo-haiku',
        })
      )
    }
    throw new Error(`URL inattendue : ${url}`)
  })
  return { fetchFn, issued, posts }
}

describe('fetchChallenge', () => {
  it('retourne le défi annoncé par le serveur', async () => {
    const { fetchFn } = makeFetch({ difficultyBits: 12 })
    const challenge = await fetchChallenge({ fetchFn })
    expect(challenge.challenge).toBe('ch-1')
    expect(challenge.difficultyBits).toBe(12)
    expect(typeof challenge.expiresAt).toBe('string')
  })

  it('propage le statut HTTP et Retry-After en erreur typée', async () => {
    const fetchFn = async () => jsonResponse(429, { error: 'quota' }, { 'retry-after': '120' })
    const error = await fetchChallenge({ fetchFn }).catch((e) => e)
    expect(error).toBeInstanceOf(ProviderError)
    expect(error.status).toBe(429)
    expect(error.retryAfterMs).toBe(120_000)
  })
})

describe('createDemoProvider', () => {
  it('résout une preuve de travail par appel et poste {challenge, nonce, website: ""}', async () => {
    const { fetchFn, posts } = makeFetch({ difficultyBits: 4 })
    const { provider } = createDemoProvider({ fetchFn })

    const result = await provider.complete({ model: 'demo', prompt: 'Bonjour' })
    expect(result.text).toBe('réponse 1')
    expect(result.model).toBe('demo-haiku')
    expect(result.usage).toEqual({ inputTokens: 10, outputTokens: 5 })

    expect(posts).toHaveLength(1)
    const body = posts[0]
    expect(body.website).toBe('') // honeypot toujours vide
    expect(body.challenge).toBe('ch-1')
    expect(body.prompt).toBe('Bonjour')
    expect(typeof body.nonce).toBe('string')
    // Le nonce satisfait la convention SHA-256(`${challenge}:${nonce}`).
    const digest = new Uint8Array(
      createHash('sha256').update(`${body.challenge}:${body.nonce}`, 'utf8').digest(),
    )
    expect(leadingZeroBits(digest)).toBeGreaterThanOrEqual(4)
  })

  it('consomme UN défi frais par appel LLM (défis one-time)', async () => {
    const { fetchFn, issued, posts } = makeFetch({ difficultyBits: 0 })
    const { provider } = createDemoProvider({ fetchFn })

    await provider.complete({ model: 'demo', prompt: 'a' })
    await provider.complete({ model: 'demo', prompt: 'b' })

    expect(issued).toEqual(['ch-1', 'ch-2'])
    expect(posts.map((p) => p.challenge)).toEqual(['ch-1', 'ch-2'])
  })

  it('prime() résout la preuve de travail AVANT le premier appel', async () => {
    const { fetchFn, issued, posts } = makeFetch({ difficultyBits: 0 })
    const phases = []
    const { provider, prime } = createDemoProvider({ fetchFn, onPhase: (p) => phases.push(p) })

    await prime()
    expect(issued).toEqual(['ch-1']) // défi déjà obtenu et résolu
    expect(phases).toEqual(['challenge', 'pow'])

    await provider.complete({ model: 'demo', prompt: 'a' })
    expect(issued).toEqual(['ch-1']) // aucun défi supplémentaire pour ce premier appel
    expect(posts[0].challenge).toBe('ch-1')
    expect(phases).toEqual(['challenge', 'pow', 'llm'])
  })

  it('jette un défi pré-résolu expiré (expiresAt en secondes epoch, format API réel)', async () => {
    let issuedCount = 0
    const posts = []
    const fetchFn = vi.fn(async (url, init = {}) => {
      if (String(url) === DEMO_CHALLENGE_URL) {
        issuedCount += 1
        return jsonResponse(200, {
          challenge: `ch-${issuedCount}`,
          difficultyBits: 0,
          // 1er défi : déjà expiré (epoch SECONDES, comme PowChallenge.php) ;
          // suivants : valides 120 s.
          expiresAt: Math.floor(Date.now() / 1000) + (issuedCount === 1 ? -5 : 120),
        })
      }
      posts.push(JSON.parse(init.body))
      return jsonResponse(200, { text: 'ok', usage: {}, model: 'demo' })
    })
    const { provider, prime } = createDemoProvider({ fetchFn })

    await prime() // résout ch-1… qui expire avant l'appel
    await provider.complete({ model: 'demo', prompt: 'a' })

    expect(issuedCount).toBe(2) // ch-1 écarté, ch-2 obtenu à la volée
    expect(posts[0].challenge).toBe('ch-2')
  })

  it('ne réessaie pas automatiquement un 429 (quota démo) et porte Retry-After', async () => {
    const { fetchFn } = makeFetch({
      difficultyBits: 0,
      llm: () => jsonResponse(429, { error: 'quota atteint' }, { 'retry-after': '300' }),
    })
    const { provider } = createDemoProvider({ fetchFn })

    const error = await provider.complete({ model: 'demo', prompt: 'a' }).catch((e) => e)
    expect(error).toBeInstanceOf(ProviderError)
    expect(error.status).toBe(429)
    expect(error.retryAfterMs).toBe(300_000)
    // 1 GET défi + 1 POST, pas de martèlement du quota.
    expect(fetchFn).toHaveBeenCalledTimes(2)
  })

  it('réessaie UNE fois un 504 amont transitoire, avec un défi frais', async () => {
    vi.useFakeTimers()
    try {
      let calls = 0
      const { fetchFn, posts } = makeFetch({
        difficultyBits: 0,
        llm: () =>
          ++calls === 1
            ? jsonResponse(504, { error: 'Le fournisseur LLM est injoignable' })
            : jsonResponse(200, {
                text: 'ok',
                usage: { inputTokens: 1, outputTokens: 1 },
                model: 'demo',
              }),
      })
      const { provider } = createDemoProvider({ fetchFn })

      const pending = provider.complete({ model: 'demo', prompt: 'a' })
      await vi.advanceTimersByTimeAsync(10_000)
      const result = await pending

      expect(result.text).toBe('ok')
      expect(posts).toHaveLength(2)
      // défi frais au second essai (les défis sont one-time côté serveur)
      expect(posts[1].challenge).not.toBe(posts[0].challenge)
    } finally {
      vi.useRealTimers()
    }
  })

  it('un second 5xx après le retry unique est propagé (pas de boucle)', async () => {
    vi.useFakeTimers()
    try {
      const { fetchFn, posts } = makeFetch({
        difficultyBits: 0,
        llm: () => jsonResponse(502, { error: 'bad gateway' }),
      })
      const { provider } = createDemoProvider({ fetchFn })

      const pending = provider.complete({ model: 'demo', prompt: 'a' }).catch((e) => e)
      await vi.advanceTimersByTimeAsync(10_000)
      const error = await pending

      expect(error).toBeInstanceOf(ProviderError)
      expect(error.status).toBe(502)
      expect(posts).toHaveLength(2)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('describeDemoError (messages P6.4)', () => {
  it('429 -> « démo très demandée » avec le délai en minutes', () => {
    const cause = new ProviderError('HTTP 429', { status: 429, retryable: true })
    cause.retryAfterMs = 600_000
    const wrapped = new Error('extractDay : pôle 1 — HTTP 429', { cause })
    const described = describeDemoError(wrapped)
    expect(described.kind).toBe('quota')
    expect(described.message).toContain('très demandée')
    expect(described.message).toContain('10 minutes')
    expect(described.canRetry).toBe(true)
  })

  it('429 sans Retry-After -> « quelques minutes »', () => {
    const error = new ProviderError('HTTP 429', { status: 429 })
    expect(describeDemoError(error).message).toContain('quelques minutes')
  })

  it('503 -> démo épuisée ou désactivée, sans bouton réessayer', () => {
    const cause = new ProviderError('HTTP 503', { status: 503, retryable: true })
    const wrapped = new Error('extractDay : pôle 3 — HTTP 503', { cause })
    const described = describeDemoError(wrapped)
    expect(described.kind).toBe('unavailable')
    expect(described.message).toMatch(/épuisée|désactivée/)
    expect(described.canRetry).toBe(false)
  })

  it('autre erreur -> message générique avec détail et retry proposé', () => {
    const described = describeDemoError(new Error('JSON invalide'))
    expect(described.kind).toBe('llm')
    expect(described.message).toContain('JSON invalide')
    expect(described.canRetry).toBe(true)
  })
})

describe('aides', () => {
  it('isAbortError remonte la chaîne des causes', () => {
    const abort = new DOMException('stop', 'AbortError')
    expect(isAbortError(abort)).toBe(true)
    expect(isAbortError(new Error('enveloppe', { cause: abort }))).toBe(true)
    expect(isAbortError(new Error('autre'))).toBe(false)
  })

  it('localIsoToday date la journée en fuseau LOCAL', () => {
    // 23h59 le 15/03 heure locale : la journée reste le 15/03, pas le 16 UTC.
    const late = new Date(2026, 2, 15, 23, 59, 0)
    expect(localIsoToday(late)).toBe('2026-03-15')
  })
})
