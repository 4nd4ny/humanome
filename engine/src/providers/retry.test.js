import { describe, it, expect, vi } from 'vitest'
import { withRetry, parseRetryAfter, MAX_RETRY_AFTER_MS } from './retry.js'
import { ProviderError } from './errors.js'

describe('parseRetryAfter', () => {
  it('parse les delta-seconds', () => {
    expect(parseRetryAfter('2')).toBe(2000)
    expect(parseRetryAfter('0')).toBe(0)
    expect(parseRetryAfter(' 30 ')).toBe(30000)
  })

  it('parse les dates HTTP relatives à maintenant', () => {
    const now = Date.parse('2026-07-12T10:00:00Z')
    expect(parseRetryAfter('Sun, 12 Jul 2026 10:00:05 GMT', now)).toBe(5000)
    // une date passée donne 0, jamais un délai négatif
    expect(parseRetryAfter('Sun, 12 Jul 2026 09:59:00 GMT', now)).toBe(0)
  })

  it('retourne null pour absent ou invalide', () => {
    expect(parseRetryAfter(null)).toBeNull()
    expect(parseRetryAfter('')).toBeNull()
    expect(parseRetryAfter('bientôt')).toBeNull()
  })
})

describe('withRetry', () => {
  const retryableError = () =>
    new ProviderError('HTTP 503', { status: 503, retryable: true })

  it('retourne le premier succès sans attendre', async () => {
    const sleepFn = vi.fn()
    const result = await withRetry(async () => 42, { sleepFn })
    expect(result).toBe(42)
    expect(sleepFn).not.toHaveBeenCalled()
  })

  it('ne retente pas une erreur non retryable', async () => {
    const fn = vi.fn(async () => {
      throw new ProviderError('HTTP 401', { status: 401, retryable: false })
    })
    await expect(withRetry(fn, { sleepFn: vi.fn() })).rejects.toMatchObject({ status: 401 })
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('ne retente pas une erreur non typée (bug de programmation)', async () => {
    const fn = vi.fn(async () => {
      throw new TypeError('undefined is not a function')
    })
    await expect(withRetry(fn, { sleepFn: vi.fn() })).rejects.toBeInstanceOf(TypeError)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('borne le retry à `attempts` essais', async () => {
    const fn = vi.fn(async () => {
      throw retryableError()
    })
    const sleepFn = vi.fn(async () => {})
    await expect(withRetry(fn, { attempts: 3, sleepFn })).rejects.toMatchObject({ status: 503 })
    expect(fn).toHaveBeenCalledTimes(3)
    expect(sleepFn).toHaveBeenCalledTimes(2)
  })

  it('backoff exponentiel avec jitter dans [backoff/2, backoff]', async () => {
    const fn = vi.fn(async () => {
      throw retryableError()
    })
    const sleepFn = vi.fn(async () => {})
    await withRetry(fn, { attempts: 3, baseMs: 400, sleepFn, random: () => 0.5 }).catch(() => {})
    expect(sleepFn.mock.calls[0][0]).toBe(300) // 400/2 + 0.5×200
    expect(sleepFn.mock.calls[1][0]).toBe(600) // 800/2 + 0.5×400
  })

  it('plafonne le backoff à maxMs', async () => {
    const fn = vi.fn(async () => {
      throw retryableError()
    })
    const sleepFn = vi.fn(async () => {})
    await withRetry(fn, { attempts: 5, baseMs: 4000, maxMs: 5000, sleepFn, random: () => 1 }).catch(
      () => {}
    )
    expect(Math.max(...sleepFn.mock.calls.map(([ms]) => ms))).toBe(5000)
  })

  it('respecte retryAfterMs (Retry-After) au lieu du backoff', async () => {
    const err = retryableError()
    err.retryAfterMs = 7000
    let first = true
    const sleepFn = vi.fn(async () => {})
    const result = await withRetry(
      async () => {
        if (first) {
          first = false
          throw err
        }
        return 'ok'
      },
      { sleepFn }
    )
    expect(result).toBe('ok')
    expect(sleepFn.mock.calls[0][0]).toBe(7000)
  })

  it('plafonne un Retry-After hostile à MAX_RETRY_AFTER_MS (pas de run gelé des heures)', async () => {
    const err = retryableError()
    err.retryAfterMs = 99_999_999_000 // « Retry-After: 99999999 »
    let first = true
    const sleepFn = vi.fn(async () => {})
    await withRetry(
      async () => {
        if (first) {
          first = false
          throw err
        }
        return 'ok'
      },
      { sleepFn }
    )
    expect(sleepFn.mock.calls[0][0]).toBe(MAX_RETRY_AFTER_MS)
  })
})
