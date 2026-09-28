// UC-ADM-04 — Configurer la démo publique : tests UNITAIRES (front).
// Fiche : docs/cas-utilisation/administration/UC-ADM-04-configurer-demo.md
//
// Code sollicité appelé directement : les appels de admin-api.js
// (GET/PUT/DELETE api/admin/demo-config, geste « interrupteur »), la
// construction du PUT partiel par le formulaire de ReglagesSection (rendu
// isolé, réseau injecté par fetchFn) et l'affichage de la configuration
// serveur par ConfigSection (secrets réduits à « configuré / absent »).
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { fetchMe, resetApiClient } from '../../../src/api/client.js'
import {
  fetchDemoConfig,
  resetDemoConfig,
  saveDemoConfig,
  toggleDemo,
} from '../../../src/views/admin/admin-api.js'
import ReglagesSection from '../../../src/views/admin/ReglagesSection.jsx'
import ConfigSection from '../../../src/views/admin/ConfigSection.jsx'
import { jsonResponse } from '../support/adm.js'

afterEach(() => {
  cleanup()
  resetApiClient()
})

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
  sources: { model: 'fichier', enabled: 'fichier' },
  allowedModels: ['claude-haiku-4-5-20251001', 'claude-sonnet-5'],
  apiKeyConfigured: true,
}

const SETTINGS = {
  defaultPackage: { stored: null, proposal: null, effective: null },
  worker: { jobsInQueue: 0, byStatus: {}, activeRuns: 0, lastActivity: null },
  config: {},
}

/** Réseau de ReglagesSection : chargement + PUT observé. */
function reglagesFetch(demo = DEMO, onPut = () => jsonResponse(200, demo)) {
  return vi.fn(async (url, init = {}) => {
    const key = `${init.method ?? 'GET'} ${url}`
    if (key === 'GET api/admin/settings') return jsonResponse(200, SETTINGS)
    if (key === 'GET api/prompt-packages') return jsonResponse(200, [])
    if (key === 'GET api/admin/demo-config') return jsonResponse(200, demo)
    if (key === 'PUT api/admin/demo-config') return onPut(init)
    throw new Error(`route non mockée : ${key}`)
  })
}

async function renderReglages(fetchFn) {
  render(<ReglagesSection fetchFn={fetchFn} />)
  return screen.findByRole('switch')
}

const puts = (fetchFn) => fetchFn.mock.calls.filter(([, init]) => init?.method === 'PUT')

describe('UC-ADM-04 — client admin-api.js', () => {
  it('UC-ADM-04-U13 — GET / PUT {patch} / DELETE sur api/admin/demo-config, jeton CSRF sur les mutations', async () => {
    await fetchMe({ fetchFn: async () => jsonResponse(200, { user: { id: 1 }, csrfToken: 'csrf-demo' }) })
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(200, DEMO))

    await fetchDemoConfig(fetchFn)
    await saveDemoConfig({ perIpPerHour: 5 }, fetchFn)
    await resetDemoConfig(fetchFn)

    const [[getUrl, getInit], [putUrl, putInit], [delUrl, delInit]] = fetchFn.mock.calls
    expect([getUrl, getInit.method]).toEqual(['api/admin/demo-config', 'GET'])
    expect(getInit.headers['X-CSRF-Token']).toBeUndefined()
    expect([putUrl, putInit.method, JSON.parse(putInit.body)]).toEqual(['api/admin/demo-config', 'PUT', { perIpPerHour: 5 }])
    expect(putInit.headers['X-CSRF-Token']).toBe('csrf-demo')
    expect([delUrl, delInit.method, delInit.body]).toEqual(['api/admin/demo-config', 'DELETE', undefined])
    expect(delInit.headers['X-CSRF-Token']).toBe('csrf-demo')
  })

  it('UC-ADM-04-U14 — toggleDemo : le geste envoie un PUT {enabled} booléen et rien d’autre', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(200, DEMO))

    await toggleDemo(0, fetchFn)
    await toggleDemo('oui', fetchFn)

    expect(fetchFn.mock.calls.map(([, init]) => JSON.parse(init.body))).toEqual([{ enabled: false }, { enabled: true }])
  })
})

describe('UC-ADM-04 — formulaire de la démo (ReglagesSection isolé)', () => {
  it('UC-ADM-04-U15 — PUT partiel : seuls les champs modifiés partent, convertis en nombres', async () => {
    const fetchFn = reglagesFetch()
    await renderReglages(fetchFn)

    fireEvent.change(screen.getByLabelText('Tokens max par requête'), { target: { value: '4096' } })
    fireEvent.change(screen.getByLabelText('Budget quotidien (USD)'), { target: { value: '2.5' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    })

    expect(puts(fetchFn)).toHaveLength(1)
    expect(JSON.parse(puts(fetchFn)[0][1].body)).toEqual({ maxTokensPerRequest: 4096, dailyBudgetUsd: 2.5 })
    expect(await screen.findByText('Réglages de la démo enregistrés (effet immédiat).')).toBeTruthy()
  })

  it('UC-ADM-04-U16 — modèle hors liste : « autre… » présélectionné avec la valeur ; sans modification, aucun PUT', async () => {
    const fetchFn = reglagesFetch({ ...DEMO, effective: { ...DEMO.effective, model: 'claude-fable-5' } })
    await renderReglages(fetchFn)

    expect(screen.getByLabelText('Modèle').value).toBe('__autre__')
    expect(screen.getByLabelText('Identifiant de modèle libre').value).toBe('claude-fable-5')
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))

    expect(await screen.findByText('Aucune modification à enregistrer.')).toBeTruthy()
    expect(puts(fetchFn)).toHaveLength(0)
  })

  it('UC-ADM-04-U17 — pendant l’enregistrement, interrupteur et boutons sont inactifs (pas de double envoi)', async () => {
    let release
    const pending = new Promise((resolve) => {
      release = resolve
    })
    const fetchFn = reglagesFetch(DEMO, () => pending)
    const toggle = await renderReglages(fetchFn)

    fireEvent.click(toggle)

    expect(screen.getByRole('switch').disabled).toBe(true)
    expect(screen.getByRole('button', { name: 'Enregistrer' }).disabled).toBe(true)
    expect(screen.getByRole('button', { name: /Réinitialiser/ }).disabled).toBe(true)
    await act(async () => {
      release(jsonResponse(200, { ...DEMO, effective: { ...DEMO.effective, enabled: false } }))
    })
    expect(await screen.findByText('Démo publique désactivée.')).toBeTruthy()
    expect(screen.getByRole('switch').disabled).toBe(false)
  })

  it('UC-ADM-04-U18 — (comportement actuel, limite L2) une décimale dans un champ entier est tronquée avant l’envoi', async () => {
    const fetchFn = reglagesFetch()
    await renderReglages(fetchFn)

    fireEvent.change(screen.getByLabelText('Requêtes / IP / heure'), { target: { value: '12.7' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    })

    expect(JSON.parse(puts(fetchFn)[0][1].body)).toEqual({ perIpPerHour: 12 })
  })
})

describe('UC-ADM-04 — configuration serveur (ConfigSection isolé)', () => {
  const CONFIG = {
    application: {
      APP_ENV: { env: 'APP_ENV', description: 'Environnement.', secret: false, default: 'production', value: '' },
    },
    secrets: {
      MIGRATE_TOKEN: { env: 'MIGRATE_TOKEN', description: 'Jeton de déploiement.', secret: true, configured: true },
      ANTHROPIC_API_KEY: { env: 'ANTHROPIC_API_KEY', description: 'Clé plateforme.', secret: true, configured: false },
    },
    llm: { DEMO_ENABLED: { env: 'DEMO_ENABLED', description: 'Interrupteur.', secret: false, default: '', value: '0' } },
  }

  it('UC-ADM-04-U19 — groupes libellés en français, secrets « configuré / absent » seulement, défaut affiché si vide', async () => {
    const fetchFn = vi.fn(async () => jsonResponse(200, { ...SETTINGS, config: CONFIG }))
    render(<ConfigSection fetchFn={fetchFn} />)

    expect(await screen.findByRole('heading', { name: 'Configuration serveur' })).toBeTruthy()
    for (const label of ['Application', 'Secrets (hors git)', 'LLM / démo']) {
      expect(screen.getByRole('heading', { name: label })).toBeTruthy()
    }
    expect(screen.getByTestId('secret-MIGRATE_TOKEN').textContent).toBe('configuré')
    expect(screen.getByTestId('secret-ANTHROPIC_API_KEY').textContent).toBe('absent')
    expect(screen.getByText('(défaut : production)')).toBeTruthy()
    expect(screen.getByText('0')).toBeTruthy() // DEMO_ENABLED=0 : la couche env de la démo
    expect(fetchFn.mock.calls[0][0]).toBe('api/admin/settings')
  })

  it('UC-ADM-04-U20 — erreurs de chargement : message de copie statique, sinon « Chargement impossible. »', async () => {
    render(<ConfigSection fetchFn={vi.fn().mockRejectedValue(new TypeError('offline'))} />)
    expect((await screen.findByRole('alert')).textContent).toMatch(/copie statique/)
    cleanup()

    render(<ConfigSection fetchFn={vi.fn().mockResolvedValue(jsonResponse(500, { error: 'Erreur interne' }))} />)
    expect((await screen.findByRole('alert')).textContent).toBe('Chargement impossible.')
  })
})
