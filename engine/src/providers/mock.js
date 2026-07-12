// humanome engine — providers: deterministic mock provider (docs/plan-portage-moteur.md).
// DOM-free ESM module (ADR-001). Used by tests and by the pipeline dry runs:
// same {complete, name} interface as createProvider, responses by table or
// function, optional simulated latency, call counter.

import { sleep } from './retry.js'
import { estimateTokens } from './estimate.js'

function defaultResponse({ model, prompt }, callIndex) {
  return `[mock:${model}] réponse déterministe #${callIndex + 1} (${prompt.length} caractères de prompt)`
}

/**
 * @param {object} [options]
 * @param {string
 *   | string[]
 *   | Record<string, string>
 *   | ((params: object, callIndex: number) => string)} [options.responses]
 *   - string: always the same text
 *   - array: indexed by call order (last entry repeats)
 *   - object: keyed by exact prompt, '*' as fallback
 *   - function: (params, callIndex) => text
 * @param {number} [options.latencyMs=0] simulated latency (abortable)
 * @param {{inputTokens: number, outputTokens: number}} [options.usage]
 *   fixed usage; defaults to the estimateTokens() heuristic on prompt/text
 * @returns mock provider: {complete, name: 'mock', calls, callCount, reset()}
 */
export function createMockProvider(options = {}) {
  const { responses, latencyMs = 0, usage } = options
  const calls = []

  function resolveText(params, callIndex) {
    if (typeof responses === 'function') return responses(params, callIndex)
    if (typeof responses === 'string') return responses
    if (Array.isArray(responses)) {
      return responses[Math.min(callIndex, responses.length - 1)] ?? ''
    }
    if (responses && typeof responses === 'object') {
      return responses[params.prompt] ?? responses['*'] ?? defaultResponse(params, callIndex)
    }
    return defaultResponse(params, callIndex)
  }

  return {
    name: 'mock',
    transport: 'mock',
    calls,
    get callCount() {
      return calls.length
    },
    reset() {
      calls.length = 0
    },
    async complete(params = {}) {
      const { model, system, prompt, maxTokens, temperature, signal } = params
      if (typeof model !== 'string' || model === '') {
        throw new TypeError('complete(): "model" est requis')
      }
      if (typeof prompt !== 'string' || prompt === '') {
        throw new TypeError('complete(): "prompt" est requis')
      }
      const callIndex = calls.length
      calls.push({ model, system, prompt, maxTokens, temperature })
      if (latencyMs > 0) await sleep(latencyMs, signal)
      const text = resolveText(params, callIndex)
      return {
        text,
        usage: usage ?? {
          inputTokens: estimateTokens(`${system ?? ''}${prompt}`),
          outputTokens: estimateTokens(text)
        },
        model
      }
    }
  }
}
