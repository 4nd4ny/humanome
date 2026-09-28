// UC-ETA-02 — Configurer le moteur LLM, le budget et le jeton worker :
// tests FONCTIONNELS (IHM).
// Fiche : docs/cas-utilisation/etablissement/UC-ETA-02-configurer-llm-budget.md
//
// Le scénario est joué sur l'application ENTIÈRE (<App/>) ouverte sur
// #/etablissement, section « Configuration LLM et budget » : seule l'API est
// simulée (fetch global, projection réelle — jamais de clé), la session et le
// jeton CSRF viennent de GET api/auth/me.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, screen } from '@testing-library/react'
import { resetApiClient } from '../../../src/api/client.js'
import { CSRF, configProjection, jsonResponse, openApp, stubApi } from '../support/eta.js'

beforeEach(() => resetApiClient())

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  window.location.hash = ''
  resetApiClient()
})

/** Routes de l'accueil : la configuration servie évolue avec les PUT reçus. */
function accueilApi(initial, putHandler) {
  let current = initial
  return stubApi({
    'GET api/etablissement/cohortes': jsonResponse(200, []),
    'GET api/etablissement/config': () => jsonResponse(200, current),
    'PUT api/etablissement/config': (init) => {
      const answer = putHandler(JSON.parse(init.body), current)
      if (answer.status === 200) current = answer.next
      return jsonResponse(answer.status, answer.status === 200 ? answer.next : answer.body)
    },
  })
}

async function submitConfig() {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer la configuration' }))
  })
}

describe('UC-ETA-02 — l’établissement règle son moteur LLM et son budget', () => {
  it('UC-ETA-02-F09 — nominal : service humanome, nouveau plafond enregistré (CSRF) puis relu', async () => {
    const api = accueilApi(configProjection(), (body, current) => ({
      status: 200,
      next: { ...current, budgetCapUsd: body.budgetCapUsd },
    }))
    openApp('#/etablissement')

    // 1. Dépense courante face au plafond.
    const depense = await screen.findByTestId('etab-depense')
    expect(depense.textContent).toContain('Dépense courante : 12.50 $ sur un plafond de 100.00 $')
    expect(screen.getByLabelText(/Service humanome/).checked).toBe(true)
    // Aucune commande de jeton worker dans l'IHM (API seulement — voir Limites).
    expect(screen.queryByRole('button', { name: /jeton/i })).toBeNull()

    // 2-3. Nouveau plafond, enregistrement.
    fireEvent.change(screen.getByLabelText('Plafond de dépense (USD)'), { target: { value: '80' } })
    await submitConfig()

    expect(await screen.findByText('Configuration enregistrée.')).toBeDefined()
    const [put] = api.callsTo('PUT api/etablissement/config')
    expect(put.body).toEqual({ provider: 'humanome', budgetCapUsd: 80 })
    expect(put.headers['X-CSRF-Token']).toBe(CSRF)
    // 5. Relecture : la projection serveur fait foi.
    expect(api.callsTo('GET api/etablissement/config')).toHaveLength(2)
    expect(screen.getByTestId('etab-depense').textContent).toContain('sur un plafond de 80.00 $')
  })

  it('UC-ETA-02-F10 — A1 : infrastructure propre (URL, modèle, clé) ; la clé n’est jamais réaffichée', async () => {
    const api = accueilApi(configProjection(), (body, current) => ({
      status: 200,
      next: {
        ...current,
        provider: body.provider,
        endpointUrl: body.endpointUrl,
        model: body.model,
        budgetCapUsd: body.budgetCapUsd,
        hasApiKey: Boolean(body.apiKey) || current.hasApiKey,
      },
    }))
    openApp('#/etablissement')

    fireEvent.click(await screen.findByLabelText(/Mon infrastructure/))
    fireEvent.change(screen.getByLabelText('URL du point d’accès'), { target: { value: ' http://10.0.0.12:11434 ' } })
    fireEvent.change(screen.getByLabelText('Modèle'), { target: { value: 'llama3:70b' } })
    fireEvent.change(screen.getByLabelText('Clé API'), { target: { value: 'sk-etab-secret' } })
    fireEvent.change(screen.getByLabelText('Plafond de dépense (USD)'), { target: { value: '25.5' } })
    await submitConfig()

    await screen.findByText('Configuration enregistrée.')
    expect(api.callsTo('PUT api/etablissement/config')[0].body).toEqual({
      provider: 'endpoint',
      endpointUrl: 'http://10.0.0.12:11434',
      model: 'llama3:70b',
      apiKey: 'sk-etab-secret',
      budgetCapUsd: 25.5,
    })
    const keyInput = screen.getByLabelText('Clé API')
    expect(keyInput.value).toBe('')
    expect(keyInput.placeholder).toBe('Une clé est enregistrée (jamais réaffichée) — saisir pour remplacer')
    expect(document.body.textContent).not.toContain('sk-etab-secret')
  })

  it('UC-ETA-02-F11 — A2 : retour au service humanome, le site n’envoie ni URL, ni modèle, ni clé', async () => {
    const api = accueilApi(
      configProjection({ provider: 'endpoint', endpointUrl: 'http://10.0.0.12:11434', model: 'llama3', hasApiKey: true }),
      (body, current) => ({ status: 200, next: { ...current, provider: body.provider, endpointUrl: null, model: null } }),
    )
    openApp('#/etablissement')

    expect((await screen.findByLabelText('Clé API')).value).toBe('')
    fireEvent.click(screen.getByLabelText(/Service humanome/))
    expect(screen.queryByLabelText('URL du point d’accès')).toBeNull()
    await submitConfig()

    await screen.findByText('Configuration enregistrée.')
    expect(api.callsTo('PUT api/etablissement/config')[0].body).toEqual({ provider: 'humanome', budgetCapUsd: 100 })
  })

  it('UC-ETA-02-F12 — E0 : plafond négatif ou URL manquante refusés localement, aucun PUT', async () => {
    const api = accueilApi(configProjection(), () => ({ status: 500, body: {} }))
    openApp('#/etablissement')

    // Plafond négatif : la contrainte native du champ (min="0") bloque l'envoi
    // du formulaire avant même le contrôle JavaScript.
    const budget = await screen.findByLabelText('Plafond de dépense (USD)')
    fireEvent.change(budget, { target: { value: '-3' } })
    expect(budget.validity.rangeUnderflow).toBe(true)
    await submitConfig()
    expect(screen.queryByText('Configuration enregistrée.')).toBeNull()

    fireEvent.change(budget, { target: { value: '10' } })
    fireEvent.click(screen.getByLabelText(/Mon infrastructure/))
    await submitConfig()
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Indiquez l’URL de votre point d’accès compatible OpenAI.',
    )
    expect(api.callsTo('PUT api/etablissement/config')).toHaveLength(0)
  })

  it('UC-ETA-02-F13 — E1/E2 : refus du serveur (422, 503 sans clé maîtresse) affichés, configuration inchangée', async () => {
    let answer = { status: 422, body: { error: 'Validation échouée', fields: { endpointUrl: 'URL http(s) requise' } } }
    const api = accueilApi(configProjection(), () => answer)
    openApp('#/etablissement')

    fireEvent.click(await screen.findByLabelText(/Mon infrastructure/))
    fireEvent.change(screen.getByLabelText('URL du point d’accès'), { target: { value: 'ftp://llm.lycee.fr' } })
    await submitConfig()
    expect((await screen.findByRole('alert')).textContent).toBe('Validation échouée')

    answer = { status: 503, body: { error: 'Chiffrement des clés non configuré sur ce serveur' } }
    fireEvent.change(screen.getByLabelText('URL du point d’accès'), { target: { value: 'https://llm.lycee.fr' } })
    fireEvent.change(screen.getByLabelText('Clé API'), { target: { value: 'sk-x' } })
    await submitConfig()
    expect((await screen.findByRole('alert')).textContent).toBe('Chiffrement des clés non configuré sur ce serveur')
    expect(screen.queryByText('Configuration enregistrée.')).toBeNull()
    expect(api.callsTo('GET api/etablissement/config')).toHaveLength(1)
  })
})
