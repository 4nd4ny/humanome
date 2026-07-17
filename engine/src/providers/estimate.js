// humanome engine — providers: token/cost/duration estimation (cahier §5, §8).
// DOM-free ESM module (ADR-001).
//
// Token heuristic: French prose tokenizes at roughly 3.6 characters per token
// on current frontier tokenizers (English ≈ 4 chars/token; French pays a
// premium for accents and longer words). estimateTokens is an ORDER OF
// MAGNITUDE tool for pre-run estimates — the authoritative count is the
// usage {inputTokens, outputTokens} returned by each provider.

export const CHARS_PER_TOKEN_FR = 3.6

function tokensFromChars(chars) {
  return chars > 0 ? Math.ceil(chars / CHARS_PER_TOKEN_FR) : 0
}

/** Heuristic token count for French text (~chars / 3.6, rounded up). */
export function estimateTokens(text) {
  if (!text) return 0
  return tokensFromChars(String(text).length)
}

export const PRICING_DISCLAIMER =
  'Prix INDICATIFS (ordres de grandeur 2026, USD par million de tokens) : '
  + 'les tarifs réels varient selon le fournisseur, le contexte et la date — '
  + 'à vérifier avant tout run payant.'

/**
 * Indicative price table, USD per million tokens (2026 orders of magnitude).
 * Keys are model-id prefixes: getModelPricing matches the longest prefix, so
 * dated variants ('gpt-4o-mini-2026…') resolve to their family entry.
 * 'llama'/'mistral'/'qwen' entries cover local Ollama models (marginal cost 0).
 */
export const MODEL_PRICING_USD_PER_MTOK = Object.freeze({
  'claude-haiku-4-5': { input: 1, output: 5 },
  // Family prefixes mirror api/src/Llm/Pricing.php (billing basis of the
  // mass worker, M8): intermediate variants (claude-sonnet-4-5…) resolve
  // to their family rates instead of falling out of the table.
  'claude-sonnet': { input: 3, output: 15 },
  'claude-sonnet-4-6': { input: 3, output: 15 },
  'claude-sonnet-5': { input: 3, output: 15 },
  'claude-opus': { input: 5, output: 25 },
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'gpt-4o': { input: 2.5, output: 10 },
  'gemini-2.5-flash': { input: 0.3, output: 2.5 },
  'gemini-2.5-pro': { input: 1.25, output: 10 },
  'grok-4': { input: 3, output: 15 },
  llama: { input: 0, output: 0 },
  mistral: { input: 0, output: 0 },
  qwen: { input: 0, output: 0 }
})

/** Longest-prefix lookup in the price table; null when the model is unknown. */
export function getModelPricing(model) {
  if (typeof model !== 'string' || model === '') return null
  let best = null
  for (const [prefix, pricing] of Object.entries(MODEL_PRICING_USD_PER_MTOK)) {
    if (model === prefix || model.startsWith(prefix)) {
      if (best === null || prefix.length > best.prefix.length) best = { prefix, pricing }
    }
  }
  return best?.pricing ?? null
}

/** Structure of one full run: 7 pole calls + 1 kairos call per day… */
export const CALLS_PER_DAY = 8
/** …plus the merge narratives: 61 competences + 7 poles + 1 kairos. */
export const MERGE_NARRATIVE_CALLS = 69

/**
 * Pre-run estimate of a full cartography run (extraction of every day, then
 * the merge narratives).
 *
 * Assumptions (documented, overridable):
 *  - each of the 8 daily calls reads the whole day (avgDayChars) plus the
 *    fixed prompt overhead (promptOverheadChars: referentiel + protocol);
 *  - each of the 69 merge-narrative calls reads promptOverheadChars
 *    (aggregates + template — same order of magnitude);
 *  - outputTokensPerCall (default 1000) per call — JSON verdicts and
 *    narratives are of comparable size;
 *  - secondsPerCall (default 20 s) of end-to-end latency per sequential call.
 *
 * @param {object} params
 * @param {number} params.days number of portfolio days
 * @param {number} params.avgDayChars average characters of one day's text
 * @param {number} [params.promptOverheadChars=0] fixed prompt chars per call
 * @param {string} params.model model id (looked up in the price table)
 * @param {number} [params.outputTokensPerCall=1000]
 * @param {number} [params.secondsPerCall=20]
 * @param {number} [params.callsPerDay=CALLS_PER_DAY] override for runs that
 *   do not follow the full 7-poles + kairos protocol (restricted perimeter)
 * @param {number} [params.mergeCalls=MERGE_NARRATIVE_CALLS] override for runs
 *   that never generate merge narratives (bench day-extraction runs: 0)
 * @returns {{tokensIn: number, tokensOut: number, costUsd: number,
 *   durationMin: number, totalCalls: number, disclaimer: string}}
 */
export function estimateRun(params = {}) {
  const {
    days,
    avgDayChars,
    promptOverheadChars = 0,
    model,
    outputTokensPerCall = 1000,
    secondsPerCall = 20,
    callsPerDay = CALLS_PER_DAY,
    mergeCalls = MERGE_NARRATIVE_CALLS
  } = params
  if (!Number.isFinite(days) || days < 0) {
    throw new TypeError('estimateRun(): "days" doit être un nombre >= 0')
  }
  if (!Number.isFinite(avgDayChars) || avgDayChars < 0) {
    throw new TypeError('estimateRun(): "avgDayChars" doit être un nombre >= 0')
  }
  const pricing = getModelPricing(model)
  if (pricing === null) {
    throw new TypeError(
      `estimateRun(): modèle inconnu de la table de prix "${model}" `
      + `(préfixes connus : ${Object.keys(MODEL_PRICING_USD_PER_MTOK).join(', ')})`
    )
  }

  const dayCalls = days * callsPerDay
  const totalCalls = dayCalls + mergeCalls
  const tokensIn =
    dayCalls * tokensFromChars(avgDayChars + promptOverheadChars)
    + mergeCalls * tokensFromChars(promptOverheadChars)
  const tokensOut = totalCalls * outputTokensPerCall
  const costUsd =
    Math.round(((tokensIn * pricing.input) / 1e6 + (tokensOut * pricing.output) / 1e6) * 100) / 100
  const durationMin = Math.ceil((totalCalls * secondsPerCall) / 60)

  return { tokensIn, tokensOut, costUsd, durationMin, totalCalls, disclaimer: PRICING_DISCLAIMER }
}
