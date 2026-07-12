import { describe, expect, it } from 'vitest'
import * as engine from './index.js'

describe('engine entry point', () => {
  it('exposes a semver version', () => {
    expect(engine.ENGINE_VERSION).toMatch(/^\d+\.\d+\.\d+$/)
  })

  it('exposes the full public API of the engine', () => {
    const functions = [
      // validation
      'validateDocument',
      // providers
      'createProvider', 'createMockProvider', 'withRetry', 'parseRetryAfter', 'sleep',
      // estimate
      'estimateTokens', 'estimateRun', 'getModelPricing',
      // runs
      'createRun', 'createJournal', 'createMemoryStorage', 'createIndexedDbStorage',
      // pipeline — étage C
      'extractDay', 'buildExtractionPrompt', 'buildKairosExtractionPrompt', 'parseExtractionResponse',
      // pipeline — étages A, B1, B2
      'mergeDays', 'pythonRound', 'feuilleScore',
      'buildNarrativePrompts', 'buildCompetencePrompt', 'buildPolePrompt', 'buildKairosPrompt',
      'formatDateFr', 'formatFixed2',
      'buildMergeDocument',
      // consistance
      'compareRuns', 'statutDistance',
    ]
    for (const name of functions) {
      expect(engine[name], name).toBeTypeOf('function')
    }

    expect(engine.ProviderError.prototype).toBeInstanceOf(Error)
    expect(engine.SUPPORTED_KINDS).toContain('cartographie-jour')
    expect(engine.SUPPORTED_PROVIDERS).toContain('anthropic')
    expect(Object.keys(engine.ATTAQUES)).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'])
    expect(engine.STATUTS).toHaveLength(3)
    expect(engine.VERDICTS_ATTAQUE).toHaveLength(3)
    expect(engine.RAISON_COURT_CIRCUIT).toBe('aucune pièce extraite par le Greffier')
    expect(engine.JOURNAL_ENTRY_TYPES).toContain('day_completed')
    expect(engine.CALLS_PER_DAY).toBe(8)
    expect(engine.MERGE_NARRATIVE_CALLS).toBe(69)
    expect(engine.MODEL_PRICING_USD_PER_MTOK).toBeTypeOf('object')
    expect(engine.PRICING_DISCLAIMER).toBeTypeOf('string')
    expect(engine.CHARS_PER_TOKEN_FR).toBeGreaterThan(0)
    expect(engine.DEFAULT_MAX_TOKENS).toBeGreaterThan(0)
    expect(engine.DEFAULT_PROXY_URL).toBe('/api/llm')
  })
})
