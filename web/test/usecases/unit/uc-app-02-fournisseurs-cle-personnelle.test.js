// UC-APP-02 — Lancer une cartographie standard : tests UNITAIRES (front),
// voie « Clé personnelle » (scénario A1, RG9).
// Fiche : docs/cas-utilisation/apprenant/UC-APP-02-lancer-cartographie-standard.md
//
// createProviderBundle (web/src/lib/run-launcher.js) est la seule couture
// entre l'étape « Fournisseur » de l'assistant et les adaptateurs du moteur
// (engine/src/providers/*.js, choisis par createProvider). On vérifie, pour
// CHACUN des 6 fournisseurs proposés à l'écran, que le modèle par défaut et
// le budget de sortie du run (8 192) arrivent au bon endpoint, dans le champ
// propre à chaque API, clé dans l'en-tête attendu — fetch simulé, aucun
// appel réseau réel, clés factices.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SUPPORTED_PROVIDERS } from '@engine/providers/index.js'
import { PROVIDERS, RUN_MAX_TOKENS, createProviderBundle } from '../../../src/lib/run-launcher.js'
import { bodyOf, jsonResponse, routedFetch } from '../support/appl-http.js'

afterEach(() => {
  vi.unstubAllGlobals()
})

// Endpoint, en-tête portant la clé, et lecture du modèle / du budget dans la requête.
const EXPECTED = {
  anthropic: {
    url: 'https://api.anthropic.com/v1/messages',
    keyHeader: ['x-api-key', 'sk-ant-test'],
    model: (call) => bodyOf(call).model,
    maxTokens: (call) => bodyOf(call).max_tokens,
  },
  openai: {
    url: 'https://api.openai.com/v1/chat/completions',
    keyHeader: ['authorization', 'Bearer sk-test-openai'],
    model: (call) => bodyOf(call).model,
    maxTokens: (call) => bodyOf(call).max_tokens,
  },
  google: {
    url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
    keyHeader: ['x-goog-api-key', 'goog-test'],
    model: (call) => /\/models\/([^:]+):generateContent$/.exec(call.url)[1],
    maxTokens: (call) => bodyOf(call).generationConfig.maxOutputTokens,
  },
  xai: {
    url: 'https://api.x.ai/v1/chat/completions',
    keyHeader: ['authorization', 'Bearer xai-test'],
    model: (call) => bodyOf(call).model,
    maxTokens: (call) => bodyOf(call).max_tokens,
  },
  openrouter: {
    url: 'https://openrouter.ai/api/v1/chat/completions',
    keyHeader: ['authorization', 'Bearer or-test'],
    model: (call) => bodyOf(call).model,
    maxTokens: (call) => bodyOf(call).max_tokens,
  },
  ollama: {
    url: 'http://localhost:11434/api/chat',
    keyHeader: null,
    model: (call) => bodyOf(call).model,
    maxTokens: (call) => bodyOf(call).options.num_predict,
  },
}
const KEYS = { anthropic: 'sk-ant-test', openai: 'sk-test-openai', google: 'goog-test', xai: 'xai-test', openrouter: 'or-test' }

describe('UC-APP-02 — clé personnelle : de l’assistant au fournisseur (A1, RG9)', () => {
  it('UC-APP-02-U39 — createProviderBundle × 6 fournisseurs : liste de l’écran = fournisseurs du moteur ; modèle par défaut et budget 8 192 envoyés en direct, clé dans l’en-tête du fournisseur, rien vers humanome', async () => {
    vi.stubGlobal('fetch', () => {
      throw new Error('appel réseau réel interdit dans ce test')
    })
    expect(PROVIDERS.map((p) => p.id)).toEqual([...SUPPORTED_PROVIDERS])
    expect(RUN_MAX_TOKENS).toBe(8192)

    for (const def of PROVIDERS) {
      const expected = EXPECTED[def.id]
      const fetchFn = routedFetch([[expected.url, () => jsonResponse(200, {})]])
      const bundle = createProviderBundle({ mode: 'cle', provider: def.id, apiKey: KEYS[def.id] ?? '', fetchFn })

      // L'appel tel que le fait extractDay pour un pôle.
      await bundle.provider.complete({ model: bundle.model, prompt: '# Pôle 1 — (2026-01-05)', maxTokens: bundle.maxTokens })

      expect(bundle).toMatchObject({ model: def.defaultModel, maxTokens: 8192, estimationModel: def.defaultModel, prime: null })
      expect(fetchFn.calls).toHaveLength(1)
      const [call] = fetchFn.calls
      expect(call.url).toBe(expected.url)
      expect(expected.model(call)).toBe(def.defaultModel)
      expect(expected.maxTokens(call)).toBe(8192)
      const headers = call.init.headers
      if (expected.keyHeader) {
        expect(headers[expected.keyHeader[0]]).toBe(expected.keyHeader[1])
        expect(call.url).not.toContain(KEYS[def.id])
        expect(call.init.body).not.toContain(KEYS[def.id])
      } else {
        expect(Object.keys(headers)).toEqual(['content-type']) // Ollama : aucune clé
      }
      expect(call.url).not.toMatch(/^(\/)?api\/llm|humanome/)
    }
  })
})
