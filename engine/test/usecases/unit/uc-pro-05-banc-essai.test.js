// UC-PRO-05 — Évaluer un paquet au banc d'essai : tests UNITAIRES (moteur).
// Fiche : docs/cas-utilisation/promptologue/UC-PRO-05-banc-essai.md
//
// Briques du moteur (ESM sans DOM, ADR-001) sur lesquelles le banc calcule ses
// mesures : consistance multi-run (compareRuns), estimation paramétrable
// (estimateRun), table de prix du coût réel (getModelPricing) et fournisseur
// factice (createMockProvider). Données : fixtures VERSIONNÉES uniquement
// (schemas/fixtures/) — ce fichier tourne dans la CI « Tests moteur ».
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { compareRuns } from '../../../src/consistency.js'
import { estimateRun, getModelPricing } from '../../../src/providers/estimate.js'
import { createMockProvider } from '../../../src/providers/mock.js'

const fixture = (name) =>
  JSON.parse(readFileSync(new URL(`../../../../schemas/fixtures/${name}`, import.meta.url), 'utf8'))

const jour05 = fixture('cartographie-jour-2026-01-05.json')

/** Copie du document avec le statut d'une compétence forcé. */
function withStatut(doc, code, statut) {
  const copy = structuredClone(doc)
  for (const pole of copy.poles) {
    for (const comp of pole.competences) {
      if (comp.code === code) comp.verdict.statut = statut
    }
  }
  return copy
}

const nbCodes = jour05.poles.reduce((n, p) => n + p.competences.length, 0)

describe('UC-PRO-05 — consistance multi-run (mode « Multi-run »)', () => {
  it('UC-PRO-05-U18 — compareRuns : un basculement établie → non établie au run 2 sur 3', () => {
    const runs = [jour05, withStatut(jour05, '2.01', 'présence non établie'), jour05]
    const result = compareRuns(runs)

    expect(result.nbRuns).toBe(3)
    expect(result.competencesCommunes).not.toContain('2.01')
    expect(result.competencesDivergentes).toEqual([
      {
        code: '2.01',
        statuts: ['présence établie', 'présence non établie', 'présence établie'],
        presenteDans: [0, 2],
        absenteDans: [1],
      },
    ])
    // Paires (1,2) et (2,3) à distance 1, (1,3) à 0 : 2 / (3 paires × N codes).
    expect(result.distanceStructurelle).toBeCloseTo(2 / (3 * nbCodes), 12)
  })

  it('UC-PRO-05-U19 — compareRuns : un « renvoi au cartographe » compte pour une demi-distance', () => {
    const renvoi = compareRuns([jour05, withStatut(jour05, '2.01', 'renvoi au cartographe')])
    const oppose = compareRuns([jour05, withStatut(jour05, '2.01', 'présence non établie')])
    expect(renvoi.distanceStructurelle).toBeCloseTo(0.5 / nbCodes, 12)
    expect(oppose.distanceStructurelle).toBeCloseTo(1 / nbCodes, 12)
    expect(compareRuns([jour05, structuredClone(jour05)]).distanceStructurelle).toBe(0)
  })
})

describe('UC-PRO-05 — estimation et coût', () => {
  it('UC-PRO-05-U20 — estimateRun : surcharges callsPerDay / mergeCalls du banc (périmètre restreint, sans fusion)', () => {
    const base = { days: 3, avgDayChars: 3600, promptOverheadChars: 7200, model: 'claude-sonnet-5' }
    const complet = estimateRun(base)
    const banc = estimateRun({ ...base, mergeCalls: 0 })
    const uneCompetence = estimateRun({ ...base, days: 1, callsPerDay: 1, mergeCalls: 0 })

    expect(complet.totalCalls).toBe(3 * 8 + 69)
    expect(banc.totalCalls).toBe(24)
    expect(uneCompetence.totalCalls).toBe(1)
    // 1 appel : (3600+7200)/3,6 = 3000 tokens entrée, 1000 sortie -> 0,009 + 0,015 $.
    expect(uneCompetence).toMatchObject({ tokensIn: 3000, tokensOut: 1000, costUsd: 0.02, durationMin: 1 })
    expect(banc.costUsd).toBeLessThan(complet.costUsd)
  })

  it('UC-PRO-05-U21 — getModelPricing : modèles tarifés du coût réel, indice « demo » du service non tarifé', () => {
    expect(getModelPricing('claude-sonnet-5')).toEqual({ input: 3, output: 15 })
    expect(getModelPricing('claude-haiku-4-5')).toEqual({ input: 1, output: 5 })
    expect(getModelPricing('claude-sonnet-4-5-20250929')).toEqual({ input: 3, output: 15 }) // famille
    expect(getModelPricing('llama3.1')).toEqual({ input: 0, output: 0 }) // local : coût marginal nul
    expect(getModelPricing('demo')).toBeNull()
    expect(getModelPricing('')).toBeNull()
  })

  it('UC-PRO-05-U22 — createMockProvider : température transmise et usage fixe mesurable', async () => {
    const provider = createMockProvider({ responses: '{}', usage: { inputTokens: 1000, outputTokens: 200 } })
    const res = await provider.complete({ model: 'demo', prompt: 'pôle 1', temperature: 0.7 })
    expect(res).toEqual({ text: '{}', usage: { inputTokens: 1000, outputTokens: 200 }, model: 'demo' })
    expect(provider.calls[0]).toMatchObject({ model: 'demo', prompt: 'pôle 1', temperature: 0.7 })
    await expect(provider.complete({ model: '', prompt: 'x' })).rejects.toThrow('"model" est requis')
  })
})
