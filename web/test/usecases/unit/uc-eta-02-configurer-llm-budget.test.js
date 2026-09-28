// UC-ETA-02 — Configurer le moteur LLM, le budget et le jeton worker :
// tests UNITAIRES (front).
// Fiche : docs/cas-utilisation/etablissement/UC-ETA-02-configurer-llm-budget.md
//
// Code sollicité appelé directement : fetchConfig (normalisation de la
// projection — jamais de clé), saveConfig (PUT JSON avec jeton CSRF, erreurs
// typées) et le formatage des montants. Réseau simulé par la couture fetchFn.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, apiFetch, resetApiClient } from '../../../src/api/client.js'
import { fetchConfig, money, saveConfig } from '../../../src/views/etablissement/etablissement-api.js'
import { CSRF, configProjection, jsonResponse } from '../support/eta.js'

afterEach(() => resetApiClient())

describe('UC-ETA-02 — lecture de la configuration', () => {
  it('UC-ETA-02-U09 — fetchConfig normalise la projection réelle (null → "", fournisseur inconnu → humanome)', async () => {
    const humanome = vi.fn().mockResolvedValue(jsonResponse(200, configProjection()))
    expect(await fetchConfig(humanome)).toEqual({
      provider: 'humanome',
      endpointUrl: '',
      model: '',
      budgetCapUsd: 100,
      spentUsd: 12.5,
      hasApiKey: false,
    })
    expect(humanome.mock.calls[0][0]).toBe('api/etablissement/config')

    const endpoint = vi.fn().mockResolvedValue(
      jsonResponse(
        200,
        configProjection({ provider: 'endpoint', endpointUrl: 'http://10.0.0.12:11434', model: 'llama3', hasApiKey: true }),
      ),
    )
    const normalized = await fetchConfig(endpoint)
    expect(normalized).toMatchObject({ provider: 'endpoint', endpointUrl: 'http://10.0.0.12:11434', hasApiKey: true })
    expect(normalized).not.toHaveProperty('apiKey')

    const odd = vi.fn().mockResolvedValue(jsonResponse(200, { provider: 'openai', budgetCapUsd: '10' }))
    expect(await fetchConfig(odd)).toMatchObject({ provider: 'humanome', budgetCapUsd: null, spentUsd: 0 })
  })
})

describe('UC-ETA-02 — enregistrement de la configuration', () => {
  it('UC-ETA-02-U10 — saveConfig : PUT JSON avec X-CSRF-Token ; 422/503 → ApiError au message serveur', async () => {
    await apiFetch('auth/me', { fetchFn: async () => jsonResponse(200, { user: {}, csrfToken: CSRF }) })
    const ok = vi.fn().mockResolvedValue(jsonResponse(200, configProjection({ budgetCapUsd: 80 })))
    const body = { provider: 'humanome', budgetCapUsd: 80 }

    expect((await saveConfig(body, ok)).budgetCapUsd).toBe(80)
    const [url, init] = ok.mock.calls[0]
    expect(url).toBe('api/etablissement/config')
    expect(init.method).toBe('PUT')
    expect(init.headers['X-CSRF-Token']).toBe(CSRF)
    expect(JSON.parse(init.body)).toEqual(body)

    const invalid = vi.fn().mockResolvedValue(
      jsonResponse(422, { error: 'Validation échouée', fields: { budgetCapUsd: 'budgetCapUsd requis' } }),
    )
    const failure = await saveConfig(body, invalid).catch((e) => e)
    expect(failure).toBeInstanceOf(ApiError)
    expect(failure.status).toBe(422)
    expect(failure.fields).toEqual({ budgetCapUsd: 'budgetCapUsd requis' })

    const noVault = vi.fn().mockResolvedValue(
      jsonResponse(503, { error: 'Chiffrement des clés non configuré sur ce serveur' }),
    )
    await expect(saveConfig({ ...body, apiKey: 'sk' }, noVault)).rejects.toMatchObject({
      status: 503,
      message: 'Chiffrement des clés non configuré sur ce serveur',
    })
  })

  it('UC-ETA-02-U11 — money : deux décimales et symbole $, valeur absente ou non finie → « — »', () => {
    expect(money(12.5)).toBe('12.50 $')
    expect(money(0)).toBe('0.00 $')
    expect(money(null)).toBe('—')
    expect(money(Number.NaN)).toBe('—')
    expect(money('10')).toBe('—')
  })
})
