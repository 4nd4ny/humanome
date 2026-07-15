import { describe, it, expect, vi, beforeEach } from 'vitest'
import { loadTwin6Package, makeCreditsProvider, makeOwnKeyProvider, fetchTwin6Offer } from './twin6.js'
import { resetApiClient } from './client.js'

function jsonResponse(body, { ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
    headers: { get: (h) => (String(h).toLowerCase() === 'content-type' ? 'application/json' : null) },
    json: async () => body,
  }
}

beforeEach(() => resetApiClient())

describe('loadTwin6Package', () => {
  it('charge et met en forme le paquet public pour le moteur', async () => {
    const pkg = {
      id: 'twin6-ouverte',
      version: '1.0.0',
      nom: 'Cartographie ouverte Twin6',
      licence: 'AGPL-3.0-only',
      modeleCibleDefaut: 'claude-sonnet-5',
      scanPole: 'SCAN ${POLE}',
      kairos: 'KAIROS',
      fiches: { 1: 'F1', 2: 'F2', 3: 'F3', 4: 'F4', 5: 'F5', 6: 'F6', 7: 'F7' },
    }
    const fetchFn = vi.fn(async () => jsonResponse(pkg))
    const out = await loadTwin6Package({ fetchFn, url: 'data/twin6/x.json' })
    expect(fetchFn).toHaveBeenCalledWith('data/twin6/x.json')
    expect(out.id).toBe('twin6-ouverte')
    expect(out.templates.scanPole).toBe('SCAN ${POLE}')
    expect(out.templates.kairos).toBe('KAIROS')
    expect(Object.keys(out.templates.fiches)).toHaveLength(7)
  })

  it('rejette un paquet incomplet', async () => {
    const fetchFn = vi.fn(async () => jsonResponse({ id: 'x' }))
    await expect(loadTwin6Package({ fetchFn })).rejects.toThrow(/invalide/)
  })
})

describe('makeCreditsProvider', () => {
  it('appelle POST api/twin6/appel et mappe la réponse au contrat moteur', async () => {
    const calls = []
    const fetchFn = vi.fn(async (url, init) => {
      calls.push({ url, init })
      return jsonResponse({
        text: 'carto_P1 { ... }',
        usage: { inputTokens: 1200, outputTokens: 300 },
        model: 'claude-sonnet-5',
        stopReason: 'end_turn',
        cout_microusd: 6602,
      })
    })
    const couts = []
    const provider = makeCreditsProvider({ onCout: (c) => couts.push(c), fetchFn })

    const res = await provider.complete({ model: 'claude-sonnet-5', prompt: 'Analyse pôle 1', maxTokens: 4096 })

    expect(calls[0].url).toBe('api/twin6/appel')
    expect(calls[0].init.method).toBe('POST')
    expect(JSON.parse(calls[0].init.body)).toEqual({
      model: 'claude-sonnet-5',
      prompt: 'Analyse pôle 1',
      system: null,
      max_tokens: 4096,
    })
    expect(res).toEqual({
      text: 'carto_P1 { ... }',
      usage: { inputTokens: 1200, outputTokens: 300 },
      model: 'claude-sonnet-5',
      stopReason: 'end_turn',
    })
    expect(couts).toEqual([6602])
  })
})

describe('makeOwnKeyProvider', () => {
  it('crée un provider direct (clé perso, appel navigateur)', () => {
    const provider = makeOwnKeyProvider({ provider: 'anthropic', apiKey: 'sk-ant-user' })
    expect(typeof provider.complete).toBe('function')
    expect(provider.transport).toBe('direct')
    expect(provider.name).toBe('anthropic')
  })
})

describe('fetchTwin6Offer', () => {
  it('lit les prix Twin6 (+10 %) et l’état de la promo depuis /twin9/meta', async () => {
    const fetchFn = vi.fn(async () =>
      jsonResponse({
        modeles: { 'claude-sonnet-5': { prix_usd_mtok: [3.6, 18] } },
        modeles_twin6: { 'claude-sonnet-5': [3.3, 16.5] },
        twin9_cle_perso_ouverte: true,
        referentiel: [{ num: 1, nom: 'TÊTE' }],
      }),
    )
    const offer = await fetchTwin6Offer({ fetchFn })
    expect(offer.modeles['claude-sonnet-5']).toEqual([3.3, 16.5])
    expect(offer.twin9PromoOuverte).toBe(true)
    expect(offer.referentiel).toHaveLength(1)
  })
})
