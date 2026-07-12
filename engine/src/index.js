// humanome engine — public entry point.
// DOM-free ESM package (ADR-001) : the whole engine runs in the browser (or in
// Node for tests/scripts) with zero server I/O of its own (P5).

export const ENGINE_VERSION = '0.1.0'

// --- Validation (ajv, schemas/ at the repo root) ---------------------------
export { validateDocument, SUPPORTED_KINDS } from './validation.js'

// --- Providers (unified LLM abstraction, mock, retry, estimate) ------------
export {
  createProvider,
  createMockProvider,
  ProviderError,
  SUPPORTED_PROVIDERS,
  DEFAULT_MAX_TOKENS,
  DEFAULT_PROXY_URL,
  withRetry,
  parseRetryAfter,
  sleep,
  MAX_RETRY_AFTER_MS,
  estimateTokens,
  estimateRun,
  getModelPricing,
  MODEL_PRICING_USD_PER_MTOK,
  PRICING_DISCLAIMER,
  CHARS_PER_TOKEN_FR
} from './providers/index.js'
export { CALLS_PER_DAY, MERGE_NARRATIVE_CALLS } from './providers/estimate.js'

// --- Runs (checkpoints, journal, reprise, storage adapters) ----------------
export {
  createRun,
  createJournal,
  JOURNAL_ENTRY_TYPES,
  createMemoryStorage,
  createIndexedDbStorage
} from './runs/index.js'

// --- Pipeline — étage C : extraction journalière ---------------------------
export {
  extractDay,
  buildExtractionPrompt,
  buildKairosExtractionPrompt,
  parseExtractionResponse,
  ATTAQUES,
  VERDICTS_ATTAQUE,
  STATUTS,
  RAISON_COURT_CIRCUIT
} from './pipeline/extract.js'

// --- Pipeline — étage A : merge numérique ----------------------------------
export { mergeDays, pythonRound, feuilleScore } from './pipeline/merge.js'

// --- Pipeline — étage B1 : prompts narratifs -------------------------------
export {
  buildNarrativePrompts,
  buildCompetencePrompt,
  buildPolePrompt,
  buildKairosPrompt,
  formatDateFr,
  formatFixed2
} from './pipeline/narrative-prompts.js'

// --- Pipeline — étage B2 : document merge final -----------------------------
export { buildMergeDocument } from './pipeline/merge-document.js'

// --- Consistance multi-run ---------------------------------------------------
export { compareRuns, statutDistance } from './consistency.js'
