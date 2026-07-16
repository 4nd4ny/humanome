// Section « Réglages » (chantier A) : la démo publique est éditable —
// interrupteur activé/désactivé (PUT {enabled}), modèle (menu + « autre… »
// texte libre), plafonds bornés avec badge d'origine (base/env/fichier/défaut),
// Enregistrer (PUT partiel, 422 hors bornes) et Réinitialiser (DELETE).
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import ReglagesSection from './ReglagesSection.jsx'
import { resetApiClient } from '../../api/client.js'

afterEach(() => {
  cleanup()
  resetApiClient()
})

function jsonResponse(status, data) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (n) => (n.toLowerCase() === 'content-type' ? 'application/json' : null) },
    json: async () => data,
  }
}

function routedFetch(routes) {
  return vi.fn(async (url, init = {}) => {
    const key = `${init.method ?? 'GET'} ${url}`
    const handler = routes[key]
    if (!handler) throw new Error(`route non mockée : ${key}`)
    return typeof handler === 'function' ? handler(init) : handler
  })
}

const SETTINGS = {
  defaultPackage: { stored: null, proposal: null, effective: { id: 'aurora-demo', version: '1.0.0' } },
  worker: { jobsInQueue: 0, byStatus: { done: 0, failed: 0 }, activeRuns: 0, lastActivity: null },
  config: {},
}

const DEMO = {
  effective: {
    enabled: true,
    provider: 'anthropic',
    model: 'claude-haiku-4-5-20251001',
    maxTokensPerRequest: 2048,
    maxInputChars: 20000,
    perIpPerHour: 20,
    dailyGlobalTokens: 2000000,
    dailyBudgetUsd: 5,
    powDifficultyBits: 20,
    upstreamTimeoutSeconds: 60,
  },
  sources: {
    enabled: 'fichier',
    provider: 'fichier',
    model: 'env',
    maxTokensPerRequest: 'fichier',
    maxInputChars: 'fichier',
    perIpPerHour: 'fichier',
    dailyGlobalTokens: 'fichier',
    dailyBudgetUsd: 'base',
    powDifficultyBits: 'fichier',
    upstreamTimeoutSeconds: 'defaut',
  },
  allowedModels: ['claude-haiku-4-5-20251001', 'claude-sonnet-5', 'claude-opus-4-8'],
  apiKeyConfigured: true,
}

const baseRoutes = {
  'GET api/admin/settings': jsonResponse(200, SETTINGS),
  'GET api/prompt-packages': jsonResponse(200, []),
  'GET api/admin/demo-config': jsonResponse(200, DEMO),
}

/** Attend la fin du chargement initial (l'interrupteur est rendu). */
async function renderReady(fetchFn) {
  render(<ReglagesSection fetchFn={fetchFn} />)
  return await screen.findByRole('switch')
}

describe('ReglagesSection — démo publique éditable', () => {
  it('affiche l’interrupteur, les valeurs effectives et les badges d’origine', async () => {
    const fetchFn = routedFetch(baseRoutes)
    const toggle = await renderReady(fetchFn)

    // Interrupteur activé, grand libellé clair.
    expect(toggle.getAttribute('aria-checked')).toBe('true')
    expect(toggle.textContent).toMatch(/Démo publique/i)
    expect(toggle.textContent).toMatch(/activée/i)

    // Valeurs effectives dans les champs, avec bornes indiquées.
    expect(screen.getByLabelText('Tokens max par requête').value).toBe('2048')
    expect(screen.getByText('256 – 16000')).toBeTruthy()

    // Badges d'origine : base / env / fichier / défaut.
    expect(screen.getByText('réglage base')).toBeTruthy() // dailyBudgetUsd
    expect(screen.getByText('env')).toBeTruthy() // model
    expect(screen.getByText('défaut')).toBeTruthy() // upstreamTimeoutSeconds
    expect(screen.getAllByText('fichier').length).toBeGreaterThan(0)

    // La clé API n'est jamais affichée : seulement l'état configurée/absente.
    expect(screen.getByText(/configurée/)).toBeTruthy()
    // Le fournisseur est affiché non modifiable.
    expect(screen.getByText(/non modifiable/i)).toBeTruthy()
  })

  it('active/désactive la démo d’un clic (PUT {enabled})', async () => {
    const fetchFn = routedFetch({
      ...baseRoutes,
      'PUT api/admin/demo-config': (init) => {
        expect(JSON.parse(init.body)).toEqual({ enabled: false })
        return jsonResponse(200, {
          ...DEMO,
          effective: { ...DEMO.effective, enabled: false },
          sources: { ...DEMO.sources, enabled: 'base' },
        })
      },
    })
    const toggle = await renderReady(fetchFn)

    fireEvent.click(toggle)

    await screen.findByText('Démo publique désactivée.')
    await waitFor(() => {
      expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('false')
    })
    expect(screen.getByRole('switch').textContent).toMatch(/désactivée/i)
  })

  it('enregistre un modèle choisi dans le menu (PUT partiel)', async () => {
    let putBody = null
    const fetchFn = routedFetch({
      ...baseRoutes,
      'PUT api/admin/demo-config': (init) => {
        putBody = JSON.parse(init.body)
        return jsonResponse(200, {
          ...DEMO,
          effective: { ...DEMO.effective, model: 'claude-opus-4-8' },
          sources: { ...DEMO.sources, model: 'base' },
        })
      },
    })
    await renderReady(fetchFn)

    fireEvent.change(screen.getByLabelText('Modèle'), { target: { value: 'claude-opus-4-8' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))

    await screen.findByText(/Réglages de la démo enregistrés/i)
    // PUT partiel : seul le champ modifié est envoyé.
    expect(putBody).toEqual({ model: 'claude-opus-4-8' })
  })

  it('accepte un modèle libre via « autre… »', async () => {
    let putBody = null
    const fetchFn = routedFetch({
      ...baseRoutes,
      'PUT api/admin/demo-config': (init) => {
        putBody = JSON.parse(init.body)
        return jsonResponse(200, {
          ...DEMO,
          effective: { ...DEMO.effective, model: 'claude-fable-5' },
          sources: { ...DEMO.sources, model: 'base' },
        })
      },
    })
    await renderReady(fetchFn)

    fireEvent.change(screen.getByLabelText('Modèle'), { target: { value: '__autre__' } })
    const libre = await screen.findByLabelText('Identifiant de modèle libre')
    fireEvent.change(libre, { target: { value: 'claude-fable-5' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))

    await screen.findByText(/Réglages de la démo enregistrés/i)
    expect(putBody).toEqual({ model: 'claude-fable-5' })
  })

  it('affiche le message d’erreur du serveur sur un 422 (hors bornes)', async () => {
    const fetchFn = routedFetch({
      ...baseRoutes,
      'PUT api/admin/demo-config': jsonResponse(422, {
        error: 'maxTokensPerRequest doit être compris entre 256 et 16000.',
      }),
    })
    await renderReady(fetchFn)

    fireEvent.change(screen.getByLabelText('Tokens max par requête'), { target: { value: '99999' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toMatch(/compris entre 256 et 16000/)
  })

  it('signale quand il n’y a rien à enregistrer (aucun PUT)', async () => {
    const fetchFn = routedFetch(baseRoutes) // aucun PUT mocké : il ne doit pas partir
    await renderReady(fetchFn)

    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))

    await screen.findByText('Aucune modification à enregistrer.')
  })

  it('affiche « absente » quand la clé API n’est pas configurée (jamais de valeur)', async () => {
    const fetchFn = routedFetch({
      ...baseRoutes,
      'GET api/admin/demo-config': jsonResponse(200, { ...DEMO, apiKeyConfigured: false }),
    })
    await renderReady(fetchFn)

    // Seulement l'état : « absente » — jamais une valeur de clé.
    expect(screen.getByText('absente')).toBeTruthy()
    expect(screen.queryByText('configurée')).toBeNull()
  })

  it('refuse d’enregistrer un champ numérique vide (erreur client, aucun PUT)', async () => {
    const fetchFn = routedFetch(baseRoutes) // aucun PUT mocké : il ne doit pas partir
    await renderReady(fetchFn)

    fireEvent.change(screen.getByLabelText('Tokens max par requête'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toMatch(/Champ vide : Tokens max par requête/)
    // Aucune mutation n'est partie vers l'API.
    expect(fetchFn.mock.calls.some(([, init]) => (init?.method ?? 'GET') === 'PUT')).toBe(false)
  })

  it('refuse un modèle libre vide via « autre… » (erreur client, aucun PUT)', async () => {
    const fetchFn = routedFetch(baseRoutes) // aucun PUT mocké : il ne doit pas partir
    await renderReady(fetchFn)

    fireEvent.change(screen.getByLabelText('Modèle'), { target: { value: '__autre__' } })
    const libre = await screen.findByLabelText('Identifiant de modèle libre')
    fireEvent.change(libre, { target: { value: '   ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toBe('Le modèle ne peut pas être vide.')
    expect(fetchFn.mock.calls.some(([, init]) => (init?.method ?? 'GET') === 'PUT')).toBe(false)
  })

  it('réinitialise les overrides (DELETE, retour env/fichier)', async () => {
    const fetchFn = routedFetch({
      ...baseRoutes,
      'DELETE api/admin/demo-config': jsonResponse(200, {
        ...DEMO,
        sources: { ...DEMO.sources, dailyBudgetUsd: 'fichier' },
      }),
    })
    await renderReady(fetchFn)

    fireEvent.click(screen.getByRole('button', { name: /Réinitialiser/i }))

    await screen.findByText(/Réglages de la démo réinitialisés/i)
    // Le badge « réglage base » a disparu (retour env/fichier).
    expect(screen.queryByText('réglage base')).toBeNull()
  })
})
