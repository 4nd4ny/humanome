// humanome engine — providers: bounded exponential retry (docs/plan-portage-moteur.md).
// DOM-free ESM module (ADR-001). Policy (cahier §5): retry only retryable
// ProviderErrors (429 / 5xx / network), 3 attempts total, exponential backoff
// with equal jitter, a Retry-After header (carried as err.retryAfterMs) is
// honoured up to MAX_RETRY_AFTER_MS (a hostile/misconfigured server must not
// be able to park a run for hours), and an AbortSignal cancels both the
// attempts and the waits.

import { ProviderError } from './errors.js'

/** Total attempts (1 initial + 2 retries) — "3 essais" in the spec. */
export const DEFAULT_ATTEMPTS = 3
export const DEFAULT_BASE_MS = 500
export const DEFAULT_MAX_MS = 8000
/** Upper bound applied to a server-provided Retry-After delay (5 min). */
export const MAX_RETRY_AFTER_MS = 300_000

function abortError(signal) {
  const reason = signal?.reason
  if (reason instanceof Error) return reason
  return new DOMException('The operation was aborted.', 'AbortError')
}

export function throwIfAborted(signal) {
  if (signal?.aborted) throw abortError(signal)
}

/** setTimeout-based sleep that rejects with an AbortError when the signal fires. */
export function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError(signal))
      return
    }
    const onAbort = () => {
      clearTimeout(timer)
      reject(abortError(signal))
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener?.('abort', onAbort)
      resolve()
    }, ms)
    signal?.addEventListener?.('abort', onAbort, { once: true })
  })
}

/**
 * Parse a Retry-After header value into milliseconds.
 * Accepts delta-seconds ("2") and HTTP-dates; returns null when absent/invalid.
 */
export function parseRetryAfter(value, now = Date.now()) {
  if (value == null || value === '') return null
  const trimmed = String(value).trim()
  if (/^\d+$/.test(trimmed)) return Number(trimmed) * 1000
  const date = Date.parse(trimmed)
  if (Number.isNaN(date)) return null
  return Math.max(0, date - now)
}

/**
 * Run `fn` with the retry policy above.
 *
 * @param {(attempt: number) => Promise<any>} fn
 * @param {object} [options]
 * @param {number} [options.attempts=3] total attempts
 * @param {number} [options.baseMs=500] first backoff step
 * @param {number} [options.maxMs=8000] backoff ceiling
 * @param {AbortSignal} [options.signal]
 * @param {(ms: number, signal?: AbortSignal) => Promise<void>} [options.sleepFn] injectable (tests)
 * @param {() => number} [options.random] injectable jitter source (tests)
 */
export async function withRetry(fn, options = {}) {
  const {
    attempts = DEFAULT_ATTEMPTS,
    baseMs = DEFAULT_BASE_MS,
    maxMs = DEFAULT_MAX_MS,
    signal,
    sleepFn = sleep,
    random = Math.random
  } = options

  let lastError
  for (let attempt = 0; attempt < attempts; attempt++) {
    throwIfAborted(signal)
    try {
      return await fn(attempt)
    } catch (err) {
      if (err?.name === 'AbortError') throw err
      lastError = err
      const retryable = err instanceof ProviderError && err.retryable
      if (!retryable || attempt === attempts - 1) throw err
      const backoff = Math.min(maxMs, baseMs * 2 ** attempt)
      // Retry-After is honoured up to MAX_RETRY_AFTER_MS; otherwise equal
      // jitter in [backoff/2, backoff].
      const delayMs =
        err.retryAfterMs != null
          ? Math.min(err.retryAfterMs, MAX_RETRY_AFTER_MS)
          : backoff / 2 + random() * (backoff / 2)
      await sleepFn(delayMs, signal)
    }
  }
  throw lastError
}
