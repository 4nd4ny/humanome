// Clés API personnelles (cahier §4.5, ADR-004) — exigence : « section Clés API
// personnelles dans #/compte : lister (fournisseur + date, JAMAIS la clé),
// ajouter, supprimer ; fournisseurs anthropic/openai/google/openrouter/xai/
// ollama ; clé révélée à la demande via revealKey ». Ce fichier prouve le
// contrat HTTP du client fin web/src/api/keys.js avec /api/keys : chemins,
// méthodes, forme du corps, encodage du fournisseur et liste des fournisseurs.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { KEY_PROVIDERS, providerLabel, listKeys, storeKey, revealKey, deleteKey } from './keys.js'
import { resetApiClient } from './client.js'

function jsonResponse(body, { ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
    headers: { get: (h) => (String(h).toLowerCase() === 'content-type' ? 'application/json' : null) },
    json: async () => body,
  }
}

/** 204 No Content (PUT et DELETE répondent sans corps). */
function noContent() {
  return { ok: true, status: 204, headers: { get: () => null }, json: async () => null }
}

beforeEach(() => resetApiClient())

describe('listKeys', () => {
  it('émet GET api/keys et retourne la liste [{provider, createdAt}] telle quelle (jamais la clé)', async () => {
    const list = [
      { provider: 'anthropic', createdAt: '2026-07-15T10:00:00' },
      { provider: 'ollama', createdAt: '2026-07-14T09:00:00' },
    ]
    const calls = []
    const fetchFn = vi.fn(async (url, init) => {
      calls.push({ url, init })
      return jsonResponse(list)
    })

    const out = await listKeys({ fetchFn })

    expect(calls[0].url).toBe('api/keys')
    expect(calls[0].init.method).toBe('GET')
    expect(out).toEqual(list)
    // Le contrat serveur ne porte JAMAIS de matériel de clé dans la liste.
    expect(Object.keys(out[0])).toEqual(['provider', 'createdAt'])
  })
})

describe('storeKey', () => {
  it('émet PUT api/keys avec le corps JSON {provider, apiKey}', async () => {
    const calls = []
    const fetchFn = vi.fn(async (url, init) => {
      calls.push({ url, init })
      return noContent()
    })

    const out = await storeKey({ provider: 'openai', apiKey: 'sk-openai-0123456789' }, { fetchFn })

    expect(calls[0].url).toBe('api/keys')
    expect(calls[0].init.method).toBe('PUT')
    expect(JSON.parse(calls[0].init.body)).toEqual({ provider: 'openai', apiKey: 'sk-openai-0123456789' })
    expect(out).toBeNull() // 204 No Content
  })
})

describe('revealKey', () => {
  it('émet GET api/keys/{provider} et retourne {apiKey} (révélation à la demande)', async () => {
    const calls = []
    const fetchFn = vi.fn(async (url, init) => {
      calls.push({ url, init })
      return jsonResponse({ apiKey: 'sk-ant-secret-0123456789' })
    })

    const out = await revealKey('anthropic', { fetchFn })

    expect(calls[0].url).toBe('api/keys/anthropic')
    expect(calls[0].init.method).toBe('GET')
    expect(out).toEqual({ apiKey: 'sk-ant-secret-0123456789' })
  })

  it('passe le fournisseur par encodeURIComponent dans le chemin', async () => {
    const calls = []
    const fetchFn = vi.fn(async (url, init) => {
      calls.push({ url, init })
      return jsonResponse({ apiKey: 'x' })
    })

    await revealKey('a/b', { fetchFn })

    expect(calls[0].url).toBe('api/keys/a%2Fb')
  })
})

describe('deleteKey', () => {
  it('émet DELETE api/keys/{provider}', async () => {
    const calls = []
    const fetchFn = vi.fn(async (url, init) => {
      calls.push({ url, init })
      return noContent()
    })

    const out = await deleteKey('ollama', { fetchFn })

    expect(calls[0].url).toBe('api/keys/ollama')
    expect(calls[0].init.method).toBe('DELETE')
    expect(out).toBeNull() // 204 No Content
  })
})

describe('KEY_PROVIDERS', () => {
  it('propose exactement les 6 fournisseurs de l’exigence, sans « mock »', () => {
    expect(KEY_PROVIDERS.map((p) => p.id)).toEqual([
      'anthropic',
      'openai',
      'google',
      'openrouter',
      'xai',
      'ollama',
    ])
  })

  it('providerLabel donne le libellé lisible et retombe sur l’id pour un fournisseur inconnu', () => {
    expect(providerLabel('anthropic')).toBe('Anthropic (Claude)')
    expect(providerLabel('ollama')).toBe('Ollama (local)')
    expect(providerLabel('inconnu')).toBe('inconnu')
  })
})
