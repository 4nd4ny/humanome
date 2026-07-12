import { describe, it, expect } from 'vitest'
import {
  estimateTokens,
  estimateRun,
  getModelPricing,
  MODEL_PRICING_USD_PER_MTOK,
  PRICING_DISCLAIMER,
  CALLS_PER_DAY,
  MERGE_NARRATIVE_CALLS
} from './estimate.js'

describe('estimateTokens (heuristique ~3,6 caractères/token pour le français)', () => {
  it('applique chars / 3.6 arrondi au supérieur', () => {
    expect(estimateTokens('a'.repeat(360))).toBe(100)
    expect(estimateTokens('a'.repeat(361))).toBe(101)
    expect(estimateTokens('abc')).toBe(1)
  })

  it('gère vide et null', () => {
    expect(estimateTokens('')).toBe(0)
    expect(estimateTokens(null)).toBe(0)
    expect(estimateTokens(undefined)).toBe(0)
  })
})

describe('table de prix (indicative, ordres de grandeur 2026)', () => {
  it('couvre Claude Haiku/Sonnet, GPT-4o-mini/4o, Gemini Flash/Pro, Grok', () => {
    for (const key of [
      'claude-haiku-4-5',
      'claude-sonnet-4-6',
      'gpt-4o-mini',
      'gpt-4o',
      'gemini-2.5-flash',
      'gemini-2.5-pro',
      'grok-4'
    ]) {
      const p = MODEL_PRICING_USD_PER_MTOK[key]
      expect(p, key).toBeDefined()
      expect(p.input).toBeGreaterThanOrEqual(0)
      expect(p.output).toBeGreaterThanOrEqual(p.input)
    }
  })

  it('résout par préfixe le plus long (variantes datées, gpt-4o vs gpt-4o-mini)', () => {
    expect(getModelPricing('gpt-4o-mini-2026-01-01')).toEqual(
      MODEL_PRICING_USD_PER_MTOK['gpt-4o-mini']
    )
    expect(getModelPricing('gpt-4o-2026-01-01')).toEqual(MODEL_PRICING_USD_PER_MTOK['gpt-4o'])
    expect(getModelPricing('claude-haiku-4-5-20251001')).toEqual(
      MODEL_PRICING_USD_PER_MTOK['claude-haiku-4-5']
    )
    // Variantes intermédiaires : résolues au tarif de la FAMILLE (parité
    // avec api/src/Llm/Pricing.php, base de facturation du worker M8).
    expect(getModelPricing('claude-sonnet-4-5')).toEqual(
      MODEL_PRICING_USD_PER_MTOK['claude-sonnet']
    )
    expect(getModelPricing('claude-opus-4-6')).toEqual(MODEL_PRICING_USD_PER_MTOK['claude-opus'])
  })

  it('les modèles locaux (ollama) sont à coût marginal nul', () => {
    expect(getModelPricing('llama3.1:8b')).toEqual({ input: 0, output: 0 })
  })

  it('retourne null pour un modèle inconnu', () => {
    expect(getModelPricing('modele-inconnu')).toBeNull()
    expect(getModelPricing('')).toBeNull()
  })

  it('porte l’avertissement « indicatif »', () => {
    expect(PRICING_DISCLAIMER).toMatch(/INDICATIFS/i)
    expect(PRICING_DISCLAIMER).toMatch(/2026/)
  })
})

describe('estimateRun (7 appels pôle + 1 kairos par jour + 69 narratifs de merge)', () => {
  const base = {
    days: 59,
    avgDayChars: 15000,
    promptOverheadChars: 18000,
    model: 'claude-haiku-4-5'
  }

  it('compte les appels : days × 8 + 69', () => {
    expect(CALLS_PER_DAY).toBe(8)
    expect(MERGE_NARRATIVE_CALLS).toBe(69)
    expect(estimateRun(base).totalCalls).toBe(59 * 8 + 69) // 541
  })

  it('tokensIn = appels jour × (jour + surcharge) + narratifs × surcharge, via l’heuristique', () => {
    const { tokensIn } = estimateRun(base)
    const perDayCall = Math.ceil((15000 + 18000) / 3.6)
    const perMergeCall = Math.ceil(18000 / 3.6)
    expect(tokensIn).toBe(59 * 8 * perDayCall + 69 * perMergeCall)
  })

  it('tokensOut = totalCalls × outputTokensPerCall (défaut 1000, surchargeable)', () => {
    expect(estimateRun(base).tokensOut).toBe(541 * 1000)
    expect(estimateRun({ ...base, outputTokensPerCall: 500 }).tokensOut).toBe(541 * 500)
  })

  it('costUsd cohérent avec la table de prix (Haiku ≪ Sonnet, ratio prix respecté)', () => {
    const haiku = estimateRun(base)
    const sonnet = estimateRun({ ...base, model: 'claude-sonnet-4-6' })
    // Haiku 1/5 vs Sonnet 3/15 : facteur 3 exact sur ce profil
    expect(sonnet.costUsd / haiku.costUsd).toBeCloseTo(3, 1)
    // ordre de grandeur plausible pour 59 jours en Haiku : quelques dollars
    expect(haiku.costUsd).toBeGreaterThan(1)
    expect(haiku.costUsd).toBeLessThan(50)
  })

  it('un run local (ollama) coûte 0 USD mais prend du temps', () => {
    const local = estimateRun({ ...base, model: 'llama3.1:8b' })
    expect(local.costUsd).toBe(0)
    expect(local.durationMin).toBeGreaterThan(0)
  })

  it('durationMin = ceil(totalCalls × secondsPerCall / 60) — plusieurs heures (cahier §8)', () => {
    const run = estimateRun(base)
    expect(run.durationMin).toBe(Math.ceil((541 * 20) / 60)) // 181 min ≈ 3 h
    expect(estimateRun({ ...base, secondsPerCall: 60 }).durationMin).toBe(541)
  })

  it('joint l’avertissement indicatif au résultat', () => {
    expect(estimateRun(base).disclaimer).toBe(PRICING_DISCLAIMER)
  })

  it('rejette un modèle absent de la table et des paramètres invalides', () => {
    expect(() => estimateRun({ ...base, model: 'inconnu' })).toThrow(/modèle inconnu/)
    expect(() => estimateRun({ ...base, days: -1 })).toThrow(/"days"/)
    expect(() => estimateRun({ ...base, avgDayChars: NaN })).toThrow(/"avgDayChars"/)
  })
})
