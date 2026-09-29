// UC-CPT-04 — Gérer ses clés API personnelles : tests UNITAIRES (front).
// Fiche : docs/cas-utilisation/compte/UC-CPT-04-gerer-cles-api.md
//
// Code sollicité appelé directement : stockage LOCAL par défaut des clés
// (run-launcher : localStorage 'humanome-keys', ADR-004), synchronisation
// opt-in avec le serveur (syncKeyToServer / fetchKeyFromServer), listes de
// fournisseurs (interface de profil, assistant de run, coffre serveur — liste
// PHP lue dans le fichier versionné), le client /api/keys (keys.js) et la
// section de profil ApiKeysSection rendue seule avec ses coutures deps.
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import ApiKeysSection from '../../../src/views/account/ApiKeysSection.jsx'
import { ApiError, login, resetApiClient } from '../../../src/api/client.js'
import {
  KEYS_STORAGE_KEY,
  PROVIDERS,
  fetchKeyFromServer,
  getLocalKey,
  readLocalKeys,
  setLocalKey,
  syncKeyToServer,
} from '../../../src/lib/run-launcher.js'
import { KEY_PROVIDERS, deleteKey, listKeys, providerLabel, revealKey, storeKey } from '../../../src/api/keys.js'
import { jsonResponse, noContentResponse } from '../support/cpt.js'

afterEach(() => {
  cleanup()
  resetApiClient()
})

/** Stockage façon localStorage, en mémoire. */
function memoryStorage(initial = {}) {
  const map = new Map(Object.entries(initial))
  return {
    map,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: vi.fn((k, v) => map.set(k, String(v))),
    removeItem: (k) => map.delete(k),
  }
}

/** KeyVault::PROVIDERS, lu dans le fichier PHP versionné (appelé dans un it()). */
function serverProviders() {
  const here = dirname(fileURLToPath(import.meta.url))
  const php = readFileSync(resolve(here, '../../../../api/src/Keys/KeyVault.php'), 'utf8')
  const block = /PROVIDERS\s*=\s*\[([^\]]*)\]/.exec(php)
  if (!block) throw new Error('KeyVault::PROVIDERS introuvable')
  return [...block[1].matchAll(/'([^']+)'/g)].map((m) => m[1])
}

describe('UC-CPT-04 — clés locales (défaut ADR-004)', () => {
  it('UC-CPT-04-U08 — setLocalKey / getLocalKey : table fournisseur → clé sous « humanome-keys », effacement par chaîne vide', () => {
    const storage = memoryStorage()
    expect(KEYS_STORAGE_KEY).toBe('humanome-keys')
    expect(getLocalKey('anthropic', storage)).toBe('')

    setLocalKey('anthropic', 'sk-ant-local', storage)
    setLocalKey('openai', 'sk-openai-local', storage)
    expect(JSON.parse(storage.map.get('humanome-keys'))).toEqual({ anthropic: 'sk-ant-local', openai: 'sk-openai-local' })
    expect(getLocalKey('anthropic', storage)).toBe('sk-ant-local')

    setLocalKey('anthropic', '', storage)
    expect(readLocalKeys(storage)).toEqual({ openai: 'sk-openai-local' })
  })

  it('UC-CPT-04-U09 — stockage corrompu ou plein : lecture vide, écriture silencieuse (la clé reste utilisable en mémoire)', () => {
    const corrupted = memoryStorage({ 'humanome-keys': '{pas du json' })
    expect(readLocalKeys(corrupted)).toEqual({})
    expect(getLocalKey('anthropic', corrupted)).toBe('')
    expect(readLocalKeys(memoryStorage({ 'humanome-keys': '42' }))).toEqual({})

    const full = memoryStorage()
    full.setItem = vi.fn(() => {
      throw new DOMException('QuotaExceededError')
    })
    expect(() => setLocalKey('anthropic', 'sk-x', full)).not.toThrow()
    expect(getLocalKey('anthropic', { getItem: () => JSON.stringify({ anthropic: 42 }) })).toBe('')
  })
})

describe('UC-CPT-04 — synchronisation serveur (opt-in)', () => {
  it('UC-CPT-04-U10 — syncKeyToServer → PUT keys {provider, apiKey} ; fetchKeyFromServer → GET keys/<fournisseur encodé>', async () => {
    const apiFetchFn = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce({ apiKey: 'sk-du-serveur' })

    await syncKeyToServer('anthropic', 'sk-perso', { apiFetchFn })
    await expect(fetchKeyFromServer('open router', { apiFetchFn })).resolves.toBe('sk-du-serveur')

    expect(apiFetchFn.mock.calls[0]).toEqual(['keys', { method: 'PUT', body: { provider: 'anthropic', apiKey: 'sk-perso' } }])
    expect(apiFetchFn.mock.calls[1]).toEqual(['keys/open%20router'])
  })

  it('UC-CPT-04-U11 — fetchKeyFromServer : réponse sans clé → erreur française ; erreur API propagée telle quelle', async () => {
    await expect(fetchKeyFromServer('openai', { apiFetchFn: vi.fn().mockResolvedValue({ apiKey: '' }) })).rejects.toThrow(
      'Aucune clé enregistrée sur le serveur pour ce fournisseur.',
    )
    const notFound = Object.assign(new Error('Aucune clé enregistrée pour ce fournisseur'), { status: 404 })
    await expect(fetchKeyFromServer('openai', { apiFetchFn: vi.fn().mockRejectedValue(notFound) })).rejects.toBe(notFound)
  })
})

describe('UC-CPT-04 — fournisseurs', () => {
  it('UC-CPT-04-U12 — profil et assistant proposent les mêmes six fournisseurs, tous acceptés par le coffre serveur (KeyVault.php lu)', () => {
    const profileIds = KEY_PROVIDERS.map((p) => p.id)
    const wizardIds = PROVIDERS.map((p) => p.id)
    const vault = serverProviders()
    expect(vault).toContain('mock')
    expect([...profileIds].sort()).toEqual([...wizardIds].sort())
    expect(profileIds).toHaveLength(6)
    for (const id of profileIds) expect(vault).toContain(id)
    expect(profileIds).not.toContain('mock')
    // Ollama tourne en local : aucune clé à gérer dans l'assistant.
    expect(PROVIDERS.filter((p) => !p.requiresKey).map((p) => p.id)).toEqual(['ollama'])
    expect(providerLabel('xai')).toBe('xAI (Grok)')
    expect(providerLabel('inconnu')).toBe('inconnu')
  })
})

describe('UC-CPT-04 — ApiKeysSection (composant seul)', () => {
  it('UC-CPT-04-U13 — messages : message serveur d’une ApiError, repli générique sinon ; clé envoyée sans espaces, liste rechargée ; alerte de chargement jamais effacée (anomalie AN1)', async () => {
    const listKeys = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new ApiError('Erreur serveur (HTTP 503).', 503), { serverMessage: 'Stockage de clés non configuré' }))
      .mockResolvedValue([{ provider: 'google', createdAt: '2026-09-28T12:00:00' }])
    const storeKey = vi.fn().mockRejectedValueOnce(new TypeError('boom')).mockResolvedValue(null)
    render(<ApiKeysSection deps={{ listKeys, storeKey, deleteKey: vi.fn() }} />)

    expect((await screen.findByRole('alert')).textContent).toBe('Stockage de clés non configuré')

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'google' } })
    fireEvent.change(screen.getByLabelText('Clé API'), { target: { value: '  AIza-cle-google  ' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Enregistrer la clé' }))
    })
    expect(screen.getAllByRole('alert').map((a) => a.textContent)).toContain('Une erreur est survenue. Réessayez.')
    expect(listKeys).toHaveBeenCalledTimes(1) // pas de rechargement après un échec

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Enregistrer la clé' }))
    })
    expect(storeKey).toHaveBeenLastCalledWith({ provider: 'google', apiKey: 'AIza-cle-google' })
    expect(await screen.findByText('Clé Google (Gemini) enregistrée (chiffrée).')).toBeDefined()
    expect(listKeys).toHaveBeenCalledTimes(2)
    expect(await screen.findByText('enregistrée le 2026-09-28')).toBeDefined()
    // Comportement ACTUEL figé (« Anomalies constatées », AN1) : loadError n'est
    // jamais remis à null — l'alerte du premier chargement reste à côté de la
    // liste rechargée avec succès.
    expect(screen.getAllByRole('alert').map((a) => a.textContent)).toContain('Stockage de clés non configuré')
  })
})

describe('UC-CPT-04 — client /api/keys', () => {
  it('UC-CPT-04-U14 — listKeys, storeKey, revealKey, deleteKey : URL (fournisseur encodé), méthode, corps, X-CSRF-Token sur PUT et DELETE', async () => {
    await login({ email: 'a', password: 'b' }, { fetchFn: vi.fn().mockResolvedValue(jsonResponse(200, { user: {}, csrfToken: 'tok-k' })) })

    const list = vi.fn().mockResolvedValue(jsonResponse(200, [{ provider: 'openai', createdAt: '2026-09-28T12:00:00' }]))
    await expect(listKeys({ fetchFn: list })).resolves.toEqual([{ provider: 'openai', createdAt: '2026-09-28T12:00:00' }])
    const put = vi.fn().mockResolvedValue(noContentResponse())
    await expect(storeKey({ provider: 'openai', apiKey: 'sk-openai-perso' }, { fetchFn: put })).resolves.toBeNull()
    const reveal = vi.fn().mockResolvedValue(jsonResponse(200, { apiKey: 'sk-du-serveur' }, { 'cache-control': 'no-store' }))
    await expect(revealKey('open router', { fetchFn: reveal })).resolves.toEqual({ apiKey: 'sk-du-serveur' })
    const del = vi.fn().mockResolvedValue(noContentResponse())
    await expect(deleteKey('open router', { fetchFn: del })).resolves.toBeNull()

    expect(list.mock.calls[0][0]).toBe('api/keys')
    expect(list.mock.calls[0][1].method).toBe('GET')
    expect(put.mock.calls[0][0]).toBe('api/keys')
    expect(put.mock.calls[0][1].method).toBe('PUT')
    expect(JSON.parse(put.mock.calls[0][1].body)).toEqual({ provider: 'openai', apiKey: 'sk-openai-perso' })
    expect(reveal.mock.calls[0][0]).toBe('api/keys/open%20router')
    expect(reveal.mock.calls[0][1].method).toBe('GET')
    expect(del.mock.calls[0][0]).toBe('api/keys/open%20router')
    expect(del.mock.calls[0][1].method).toBe('DELETE')
    expect(del.mock.calls[0][1].body).toBeUndefined()
    for (const fn of [put, del]) expect(fn.mock.calls[0][1].headers['X-CSRF-Token']).toBe('tok-k')
    for (const fn of [list, reveal]) expect(fn.mock.calls[0][1].headers['X-CSRF-Token']).toBeUndefined()
  })
})
