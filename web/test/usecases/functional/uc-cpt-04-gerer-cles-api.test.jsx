// UC-CPT-04 — Gérer ses clés API personnelles : tests FONCTIONNELS (IHM).
// Fiche : docs/cas-utilisation/compte/UC-CPT-04-gerer-cles-api.md
//
// Deux surfaces :
//  - la section « Clés API personnelles » du profil, jouée dans <App/> (#/compte)
//    contre le faux serveur du lot (web/test/usecases/support/cpt.js) ;
//  - l'étape « Fournisseur » de l'assistant de run (RunWizard), où la clé vit
//    en localStorage par défaut et n'est synchronisée qu'en opt-in. L'assistant
//    est rendu seul avec ses coutures (portfolio en mémoire, référentiel et
//    journée des fixtures versionnées, fournisseur LLM simulé) ; ses appels
//    API passent par le vrai client vers le même faux serveur.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import App from '../../../src/App.jsx'
import RunWizard from '../../../src/components/RunWizard.jsx'
import { fetchMe, resetApiClient } from '../../../src/api/client.js'
import * as fakeLib from '../../../src/test/fake-sunburst-lib.js'
import { createMockProvider } from '@engine/providers/mock.js'
import { createMemoryStorage } from '@engine/runs/memory.js'
import { createMemoryAdapter, createPortfolioStore } from '../../../src/lib/portfolio-store.js'
import referentiel from '../../../../schemas/fixtures/referentiel-respire-v7.json'
import day05 from '../../../../schemas/fixtures/cartographie-jour-2026-01-05.json'
import { clearLocalStorage, installFakeAccountApi, jsonResponse } from '../support/cpt.js'

const ADA = { id: 7, email: 'ada@example.org', password: 'correct horse battery', displayName: 'Ada' }

beforeEach(() => {
  resetApiClient()
  clearLocalStorage()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  window.location.hash = ''
  resetApiClient()
  clearLocalStorage()
})

// --- Profil (#/compte) --------------------------------------------------------

async function openKeysSection(apiOptions = {}) {
  const api = installFakeAccountApi({ users: [ADA], loggedInAs: ADA.email, ...apiOptions })
  window.location.hash = '#/compte'
  render(<App lib={fakeLib} />)
  const section = within(await screen.findByRole('region', { name: 'Clés API personnelles' }))
  return { api, section }
}

async function submitKey(section, providerLabel, key) {
  fireEvent.change(section.getByLabelText('Fournisseur'), {
    target: { value: section.getByRole('option', { name: providerLabel }).value },
  })
  fireEvent.change(section.getByLabelText('Clé API'), { target: { value: key } })
  await act(async () => {
    fireEvent.click(section.getByRole('button', { name: 'Enregistrer la clé' }))
  })
}

// --- Assistant de run (étape Fournisseur) -------------------------------------

function memoryKeyStorage(initial = {}) {
  const map = new Map(Object.entries(initial))
  return { map, getItem: (k) => map.get(k) ?? null, setItem: (k, v) => map.set(k, v) }
}

async function renderWizard({ connected, keyStorage = memoryKeyStorage(), bundleCalls = [] }) {
  const portfolioStore = createPortfolioStore(createMemoryAdapter(), { id: () => 'p-1' })
  await portfolioStore.create({
    titre: 'Mon journal',
    segments: [{ date: '2026-01-05', texte: 'Texte de la journée.', debut: 0, fin: 10 }],
  })
  const deps = {
    portfolioStore,
    keyStorage,
    loadReferentiel: async () => ({ doc: referentiel, origin: 'bundled' }),
    providerBundleFactory: (options) => {
      bundleCalls.push(options)
      return {
        provider: createMockProvider({
          responses: ({ prompt }) =>
            prompt.includes('SYNTHÈSE KAIROS')
              ? JSON.stringify(day05.kairos)
              : JSON.stringify(day05.poles[Number(prompt.match(/# Pôle (\d) — /)[1]) - 1]),
        }),
        prime: null,
        model: 'mock-cartographe',
        maxTokens: 8192,
      }
    },
    runStorageFactory: () => createMemoryStorage(),
    cartoStoreLoader: async () => ({ saveCartography: async () => ({ id: 'c' }), listCartographies: async () => [] }),
    navigate: vi.fn(),
  }
  const session = connected ? { status: 'authenticated', user: ADA } : { status: 'anonymous', user: null }
  render(<RunWizard session={session} deps={deps} />)

  // (a) portfolio, (b) version de prompt (repli embarqué : le faux serveur n'a pas de paquets).
  fireEvent.click(await screen.findByRole('radio', { name: /Mon journal/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Continuer' }))
  await screen.findByTestId('packages-fallback')
  fireEvent.click(screen.getByRole('button', { name: 'Continuer' }))
  await screen.findByTestId('step-fournisseur')
  return { keyStorage, bundleCalls }
}

async function launchFromProviderStep() {
  fireEvent.click(screen.getByRole('button', { name: 'Continuer' }))
  await screen.findByTestId('run-estimate')
  fireEvent.click(screen.getByRole('button', { name: 'Continuer' }))
  await screen.findByTestId('step-execution')
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Lancer le run' }))
  })
}

describe('UC-CPT-04 — section « Clés API personnelles » du profil', () => {
  it('UC-CPT-04-F11 — nominal : enregistrer une clé (opt-in chiffré) → PUT + CSRF, confirmation, liste sans la clé', async () => {
    const { api, section } = await openKeysSection()
    expect(await section.findByText('Aucune clé enregistrée.')).toBeDefined()
    const field = section.getByLabelText('Clé API')
    expect(field.getAttribute('type')).toBe('password')
    expect(field.getAttribute('autocomplete')).toBe('off')

    fireEvent.change(field, { target: { value: 'sk-1234' } })
    expect(section.getByRole('button', { name: 'Enregistrer la clé' }).disabled).toBe(true) // < 8 caractères

    await submitKey(section, 'OpenAI (GPT)', '  sk-openai-perso  ')

    expect(await section.findByText('Clé OpenAI (GPT) enregistrée (chiffrée).')).toBeDefined()
    const [put] = api.callsTo('keys', 'PUT')
    expect(put.body).toEqual({ provider: 'openai', apiKey: 'sk-openai-perso' })
    expect(put.headers['X-CSRF-Token']).toBe(api.session.csrf)
    const item = await section.findByText('OpenAI (GPT)', { selector: '.account-keys-provider' })
    expect(item.parentElement.textContent).toContain('enregistrée le 2026-09-28')
    expect(section.getByLabelText('Clé API').value).toBe('') // jamais réaffichée
    expect(screen.queryByText(/sk-openai-perso/)).toBeNull()
  })

  it('UC-CPT-04-F12 — A5 : supprimer la clé serveur → DELETE, confirmation, liste vide', async () => {
    const { api, section } = await openKeysSection({
      users: [{ ...ADA, keys: { anthropic: 'sk-ant-serveur' } }],
    })
    await section.findByText('Anthropic (Claude)', { selector: '.account-keys-provider' })

    await act(async () => {
      fireEvent.click(section.getByRole('button', { name: 'Supprimer' }))
    })

    expect(await section.findByText('Clé Anthropic (Claude) supprimée.')).toBeDefined()
    expect(await section.findByText('Aucune clé enregistrée.')).toBeDefined()
    expect(api.callsTo('keys/anthropic', 'DELETE')).toHaveLength(1)
  })

  it('UC-CPT-04-F13 — E1 : stockage serveur non configuré (503) → message explicite dans la section', async () => {
    const api = installFakeAccountApi({ users: [ADA], loggedInAs: ADA.email })
    api.override('GET keys', () => jsonResponse(503, { error: 'Stockage de clés non configuré' }))
    window.location.hash = '#/compte'
    render(<App lib={fakeLib} />)
    const section = within(await screen.findByRole('region', { name: 'Clés API personnelles' }))

    expect((await section.findByRole('alert')).textContent).toBe('Stockage de clés non configuré')
    expect(section.getByText('Aucune clé enregistrée.')).toBeDefined()
  })

  it('UC-CPT-04-F14 — E3 : clé refusée par le serveur (422) → message du serveur, rien n’est listé', async () => {
    const { section } = await openKeysSection()
    await submitKey(section, 'xAI (Grok)', 'x'.repeat(4097)) // au-delà de 4096 caractères

    expect((await section.findByRole('alert')).textContent).toBe('Validation échouée')
    expect(section.getByText('Aucune clé enregistrée.')).toBeDefined()
  })
})

describe('UC-CPT-04 — clé dans l’assistant de run', () => {
  it('UC-CPT-04-F15 — A1 : sans compte, la clé mémorisée localement est pré-remplie, sert au run et ne part jamais vers humanome', async () => {
    const api = installFakeAccountApi()
    const { keyStorage, bundleCalls } = await renderWizard({
      connected: false,
      keyStorage: memoryKeyStorage({ 'humanome-keys': JSON.stringify({ anthropic: 'sk-ant-locale' }) }),
    })

    expect(screen.getByLabelText('Clé API').value).toBe('sk-ant-locale')
    expect(screen.getByRole('checkbox', { name: /Mémoriser la clé dans ce navigateur/ }).checked).toBe(true)
    const sync = screen.getByRole('checkbox', { name: /Synchroniser sur le serveur/ })
    expect(sync.disabled).toBe(true)
    expect(screen.getByRole('link', { name: 'connectez-vous' }).getAttribute('href')).toBe('#/compte')
    expect(screen.queryByRole('button', { name: 'Récupérer la clé depuis le serveur' })).toBeNull()

    // Nouvelle clé saisie : mémorisée au lancement, transmise au seul fournisseur.
    fireEvent.change(screen.getByLabelText('Clé API'), { target: { value: 'sk-ant-nouvelle' } })
    await launchFromProviderStep()
    await screen.findByTestId('run-success', {}, { timeout: 15000 })

    expect(JSON.parse(keyStorage.map.get('humanome-keys'))).toEqual({ anthropic: 'sk-ant-nouvelle' })
    expect(bundleCalls[0]).toMatchObject({ mode: 'cle', provider: 'anthropic', apiKey: 'sk-ant-nouvelle' })
    expect(api.calls.filter((c) => c.path.startsWith('keys'))).toHaveLength(0)
  }, 20000)

  it('UC-CPT-04-F16 — A2 : connecté, « Synchroniser sur le serveur » coché → PUT keys AVANT le run, clé aussi gardée localement', async () => {
    const api = installFakeAccountApi({ users: [ADA], loggedInAs: ADA.email })
    await fetchMe() // le shell a déjà vérifié la session : jeton CSRF en mémoire
    const order = []
    api.override('PUT keys', () => {
      order.push('sync')
    })
    const bundleCalls = { push: (o) => order.push(`bundle:${o.apiKey}`) }
    const { keyStorage } = await renderWizard({ connected: true, bundleCalls })

    fireEvent.change(screen.getByLabelText('Clé API'), { target: { value: 'sk-ant-sync' } })
    fireEvent.click(screen.getByRole('checkbox', { name: /Synchroniser sur le serveur/ }))
    await launchFromProviderStep()
    await screen.findByTestId('run-success', {}, { timeout: 15000 })

    const [put] = api.callsTo('keys', 'PUT')
    expect(put.body).toEqual({ provider: 'anthropic', apiKey: 'sk-ant-sync' })
    expect(put.headers['X-CSRF-Token']).toBe(api.session.csrf)
    expect(order).toEqual(['sync', 'bundle:sk-ant-sync'])
    expect(JSON.parse(keyStorage.map.get('humanome-keys')).anthropic).toBe('sk-ant-sync')
  }, 20000)

  it('UC-CPT-04-F17 — A3 : sur un autre navigateur, « Récupérer la clé depuis le serveur » remplit le champ', async () => {
    installFakeAccountApi({ users: [{ ...ADA, keys: { anthropic: 'sk-ant-du-serveur' } }], loggedInAs: ADA.email })
    await fetchMe()
    await renderWizard({ connected: true })
    expect(screen.getByLabelText('Clé API').value).toBe('') // rien en local ici

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Récupérer la clé depuis le serveur' }))
    })

    expect(await screen.findByText('Clé récupérée depuis le serveur.')).toBeDefined()
    expect(screen.getByLabelText('Clé API').value).toBe('sk-ant-du-serveur')
  })

  it('UC-CPT-04-F18 — E4 : aucune clé sur le serveur pour ce fournisseur → message, champ inchangé', async () => {
    installFakeAccountApi({ users: [ADA], loggedInAs: ADA.email })
    await fetchMe()
    await renderWizard({ connected: true })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Récupérer la clé depuis le serveur' }))
    })

    expect(await screen.findByText('Aucune clé enregistrée pour ce fournisseur')).toBeDefined()
    expect(screen.getByLabelText('Clé API').value).toBe('')
  })

  it('UC-CPT-04-F19 — E1 : synchronisation impossible (503) → le run ne démarre pas, message affiché', async () => {
    const api = installFakeAccountApi({ users: [ADA], loggedInAs: ADA.email })
    await fetchMe()
    api.override('PUT keys', () => jsonResponse(503, { error: 'Stockage de clés non configuré' }))
    const bundleCalls = []
    await renderWizard({ connected: true, bundleCalls })

    fireEvent.change(screen.getByLabelText('Clé API'), { target: { value: 'sk-ant-sync' } })
    fireEvent.click(screen.getByRole('checkbox', { name: /Synchroniser sur le serveur/ }))
    await launchFromProviderStep()

    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Stockage de clés non configuré'))
    expect(bundleCalls).toHaveLength(0) // aucun appel au fournisseur
  })
})
