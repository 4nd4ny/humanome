// UC-ETA-02 — Configurer le moteur LLM, le budget et le jeton worker :
// tests UNITAIRES (front).
// Fiche : docs/cas-utilisation/etablissement/UC-ETA-02-configurer-llm-budget.md
//
// Code sollicité appelé directement : fetchConfig (normalisation de la
// projection — jamais de clé), saveConfig (PUT JSON avec jeton CSRF, erreurs
// typées), le formatage des montants, et le formulaire ConfigForm rendu
// isolément dans AccueilSection (couture fetchFn : corps réellement envoyés).
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { ApiError, apiFetch, resetApiClient } from '../../../src/api/client.js'
import { fetchConfig, money, saveConfig } from '../../../src/views/etablissement/etablissement-api.js'
import AccueilSection from '../../../src/views/etablissement/AccueilSection.jsx'
import { CSRF, configProjection, fakeFetch, jsonResponse } from '../support/eta.js'

afterEach(() => {
  cleanup()
  resetApiClient()
})

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

describe('UC-ETA-02 — formulaire de configuration (ConfigForm) rendu isolément', () => {
  /** AccueilSection sur une configuration donnée ; les PUT reçus sont journalisés. */
  async function renderForm(initial) {
    let current = initial
    const net = fakeFetch({
      'GET api/etablissement/cohortes': jsonResponse(200, []),
      'GET api/etablissement/config': () => jsonResponse(200, current),
      'PUT api/etablissement/config': (init) => {
        const body = JSON.parse(init.body)
        current = { ...current, provider: body.provider, budgetCapUsd: body.budgetCapUsd }
        return jsonResponse(200, current)
      },
    })
    render(createElement(AccueilSection, { fetchFn: net.fetchMock }))
    await screen.findByLabelText('Plafond de dépense (USD)')
    return net
  }

  async function submit() {
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Enregistrer la configuration' }))
    })
    await screen.findByText('Configuration enregistrée.')
  }

  it('UC-ETA-02-U12 — ConfigForm : plafond vidé → 0 (RG7), modèle nettoyé ou omis, clé non ressaisie → apiKey absent (conservée)', async () => {
    // RG7 : champ plafond vidé → Number('') = 0 envoyé.
    let net = await renderForm(configProjection())
    fireEvent.change(screen.getByLabelText('Plafond de dépense (USD)'), { target: { value: '' } })
    await submit()
    expect(net.callsTo('PUT api/etablissement/config')[0].body).toEqual({ provider: 'humanome', budgetCapUsd: 0 })
    cleanup()

    // Mode endpoint : modèle nettoyé ; clé déjà stockée non ressaisie → pas d'apiKey.
    const endpoint = configProjection({ provider: 'endpoint', endpointUrl: 'http://10.0.0.12:11434', model: 'llama3', hasApiKey: true })
    net = await renderForm(endpoint)
    fireEvent.change(screen.getByLabelText('Modèle'), { target: { value: '  llama3  ' } })
    await submit()
    expect(net.callsTo('PUT api/etablissement/config')[0].body).toEqual({
      provider: 'endpoint',
      endpointUrl: 'http://10.0.0.12:11434',
      model: 'llama3',
      budgetCapUsd: 100,
    })
    cleanup()

    // Modèle fait d'espaces : non envoyé (le serveur remet alors model à null).
    net = await renderForm(endpoint)
    fireEvent.change(screen.getByLabelText('Modèle'), { target: { value: '   ' } })
    await submit()
    const [put] = net.callsTo('PUT api/etablissement/config')
    expect(put.body).not.toHaveProperty('model')
    expect(put.body).not.toHaveProperty('apiKey')
  })
})
