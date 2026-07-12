// humanome engine — providers: unified LLM provider abstraction (cahier §5,
// docs/plan-portage-moteur.md). DOM-free ESM module (ADR-001), zero npm
// dependency: raw fetch, injectable for tests (fetchFn).
//
// Two transports:
//  - 'direct': fetch straight to the provider's API with the USER's key
//    (key lives in the request headers only, never in a URL — P5).
//  - 'proxy': POST {provider, model, system, prompt, maxTokens} to the M5
//    server endpoint (default /api/llm) WITHOUT any key — the server holds it.
//
// P5 constraints honoured here: no hard-coded key, no telemetry, the engine
// never reads/writes anything server-side on its own initiative.

import { ProviderError } from './errors.js'
import { withRetry, parseRetryAfter, throwIfAborted } from './retry.js'
import { anthropicAdapter } from './anthropic.js'
import { openaiAdapter } from './openai.js'
import { xaiAdapter } from './xai.js'
import { openrouterAdapter } from './openrouter.js'
import { googleAdapter } from './google.js'
import { ollamaAdapter } from './ollama.js'

export { ProviderError } from './errors.js'
export { withRetry, parseRetryAfter, sleep, MAX_RETRY_AFTER_MS } from './retry.js'
export { createMockProvider } from './mock.js'
export {
  estimateTokens,
  estimateRun,
  getModelPricing,
  MODEL_PRICING_USD_PER_MTOK,
  PRICING_DISCLAIMER,
  CHARS_PER_TOKEN_FR
} from './estimate.js'

export const DEFAULT_MAX_TOKENS = 4096
export const DEFAULT_PROXY_URL = '/api/llm'

const ADAPTERS = {
  anthropic: anthropicAdapter,
  openai: openaiAdapter,
  google: googleAdapter,
  xai: xaiAdapter,
  openrouter: openrouterAdapter,
  ollama: ollamaAdapter
}

export const SUPPORTED_PROVIDERS = Object.freeze(Object.keys(ADAPTERS))

function stripTrailingSlash(url) {
  return url.endsWith('/') ? url.slice(0, -1) : url
}

async function readErrorDetail(response) {
  try {
    const data = await response.json()
    const detail = data?.error?.message ?? data?.error ?? data?.message ?? ''
    return typeof detail === 'string' ? detail : JSON.stringify(detail)
  } catch {
    return ''
  }
}

/**
 * POST a JSON body and return the parsed JSON response, applying the retry
 * policy (429/5xx/network, Retry-After honoured, abortable).
 */
async function requestJson({ url, headers, body, signal, fetchFn, retryOptions, provider }) {
  return withRetry(async () => {
    throwIfAborted(signal)
    let response
    try {
      response = await fetchFn(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...headers },
        body: JSON.stringify(body),
        signal
      })
    } catch (err) {
      if (err?.name === 'AbortError') throw err
      throw new ProviderError(`${provider}: erreur réseau (${err?.message ?? err})`, {
        status: 0,
        retryable: true,
        provider,
        cause: err
      })
    }
    if (!response.ok) {
      const status = response.status
      const retryable = status === 429 || status >= 500
      const detail = await readErrorDetail(response)
      const error = new ProviderError(
        `${provider}: HTTP ${status}${detail ? ` — ${detail}` : ''}`,
        { status, retryable, provider }
      )
      const retryAfterMs = parseRetryAfter(response.headers?.get?.('retry-after'))
      if (retryAfterMs != null) error.retryAfterMs = retryAfterMs
      throw error
    }
    try {
      return await response.json()
    } catch (err) {
      // 200 avec un corps non-JSON (page HTML d'une passerelle, proxy mal
      // configuré…) : erreur typée et contextualisée plutôt qu'un SyntaxError nu.
      throw new ProviderError(
        `${provider}: réponse HTTP ${response.status} au corps non-JSON (${err?.message ?? err})`,
        { status: response.status, retryable: false, provider, cause: err }
      )
    }
  }, { ...retryOptions, signal })
}

function validateCompleteParams(params) {
  const { model, prompt } = params ?? {}
  if (typeof model !== 'string' || model === '') {
    throw new TypeError('complete(): "model" est requis')
  }
  if (typeof prompt !== 'string' || prompt === '') {
    throw new TypeError('complete(): "prompt" est requis')
  }
}

/**
 * Create a provider handle with a unified completion interface.
 *
 * @param {object} config
 * @param {'anthropic'|'openai'|'google'|'xai'|'openrouter'|'ollama'} config.provider
 * @param {'direct'|'proxy'} [config.transport='direct']
 * @param {string} [config.apiKey] required for direct transport (except ollama); NEVER sent in proxy transport
 * @param {string} [config.baseUrl] override of the provider API base URL (direct)
 * @param {string} [config.proxyUrl='/api/llm'] proxy endpoint (proxy transport)
 * @param {typeof fetch} [config.fetchFn] injectable fetch (tests)
 * @param {number} [config.maxAttempts] retry policy override (tests)
 * @param {number} [config.retryBaseMs] retry policy override (tests)
 * @param {number} [config.retryMaxMs] retry policy override (tests)
 * @param {(ms: number, signal?: AbortSignal) => Promise<void>} [config.sleepFn] injectable (tests)
 * @param {() => number} [config.random] injectable jitter source (tests)
 * @returns {{ complete: (params: {model: string, system?: string, prompt: string,
 *   maxTokens?: number, temperature?: number, signal?: AbortSignal}) =>
 *   Promise<{text: string, usage: {inputTokens: number, outputTokens: number}, model: string}>,
 *   name: string, transport: 'direct'|'proxy' }}
 */
export function createProvider(config = {}) {
  const {
    provider,
    transport = 'direct',
    apiKey,
    baseUrl,
    proxyUrl,
    fetchFn,
    maxAttempts,
    retryBaseMs,
    retryMaxMs,
    sleepFn,
    random
  } = config

  const adapter = ADAPTERS[provider]
  if (!adapter) {
    throw new TypeError(
      `createProvider(): fournisseur inconnu "${provider}" (supportés : ${SUPPORTED_PROVIDERS.join(', ')})`
    )
  }
  if (transport !== 'direct' && transport !== 'proxy') {
    throw new TypeError(`createProvider(): transport inconnu "${transport}" ('direct' ou 'proxy')`)
  }
  if (transport === 'direct' && adapter.requiresApiKey && !apiKey) {
    throw new TypeError(`createProvider(): apiKey requise pour ${provider} en transport direct`)
  }

  const doFetch = fetchFn ?? ((...args) => globalThis.fetch(...args))
  const retryOptions = {}
  if (maxAttempts !== undefined) retryOptions.attempts = maxAttempts
  if (retryBaseMs !== undefined) retryOptions.baseMs = retryBaseMs
  if (retryMaxMs !== undefined) retryOptions.maxMs = retryMaxMs
  if (sleepFn !== undefined) retryOptions.sleepFn = sleepFn
  if (random !== undefined) retryOptions.random = random

  if (transport === 'proxy') {
    const endpoint = proxyUrl ?? DEFAULT_PROXY_URL
    return {
      name: provider,
      transport,
      async complete(params = {}) {
        validateCompleteParams(params)
        const { model, system, prompt, maxTokens = DEFAULT_MAX_TOKENS, temperature, signal } = params
        // Proxy contract (M5): the key stays on the server, none travels here.
        const body = { provider, model, system: system ?? null, prompt, maxTokens }
        if (temperature !== undefined) body.temperature = temperature
        const data = await requestJson({
          url: endpoint,
          headers: {},
          body,
          signal,
          fetchFn: doFetch,
          retryOptions,
          provider
        })
        return {
          text: data.text ?? '',
          usage: {
            inputTokens: data.usage?.inputTokens ?? 0,
            outputTokens: data.usage?.outputTokens ?? 0
          },
          model: data.model ?? model,
          // 'max_tokens' = truncated generation (relayed by the proxy when
          // the upstream exposes it); consumers use it to fail loudly rather
          // than parse a fragment.
          stopReason: data.stopReason || null
        }
      }
    }
  }

  const resolvedBaseUrl = stripTrailingSlash(baseUrl ?? adapter.defaultBaseUrl)
  return {
    name: provider,
    transport,
    async complete(params = {}) {
      validateCompleteParams(params)
      const { model, system, prompt, maxTokens = DEFAULT_MAX_TOKENS, temperature, signal } = params
      const { url, headers, body } = adapter.buildRequest(
        { baseUrl: resolvedBaseUrl, apiKey },
        { model, system, prompt, maxTokens, temperature }
      )
      const data = await requestJson({
        url,
        headers,
        body,
        signal,
        fetchFn: doFetch,
        retryOptions,
        provider
      })
      return adapter.parseResponse(data, model)
    }
  }
}
