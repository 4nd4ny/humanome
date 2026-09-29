// UC-APP-02 — Lancer une cartographie standard : tests UNITAIRES (moteur),
// voie « Clé personnelle » (scénario A1, erreurs E3/E4/E7, RG9, anomalie A-06).
// Fiche : docs/cas-utilisation/apprenant/UC-APP-02-lancer-cartographie-standard.md
//
// Les adaptateurs de fournisseurs (engine/src/providers/{anthropic,openai,
// xai,openrouter,google,ollama}.js), choisis par createProvider
// (providers/index.js), sont exercés sur un fetch SIMULÉ injecté (fetchFn) :
// URL, en-têtes d'authentification, corps, extraction du texte et de
// l'usage, erreurs HTTP typées (ProviderError, providers/errors.js) et
// reprises (providers/retry.js). Aucun appel réseau réel : le fetch global
// est remplacé par un piège pendant chaque test. Les clés sont factices.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  MAX_RETRY_AFTER_MS,
  ProviderError,
  SUPPORTED_PROVIDERS,
  createProvider,
} from '../../../src/providers/index.js'
import { extractDay } from '../../../src/pipeline/extract.js'
import { validateDocument } from '../../../src/validation.js'

// --- Fixtures versionnées, lues paresseusement (contrainte CI moteur) -------
const cache = new Map()
function fixture(name) {
  if (!cache.has(name)) {
    const url = new URL(`../../../../schemas/fixtures/${name}`, import.meta.url)
    cache.set(name, JSON.parse(readFileSync(url, 'utf8')))
  }
  return structuredClone(cache.get(name))
}
const referentiel = () => fixture('referentiel-respire-v7.json')
const dayDoc = (iso) => fixture(`cartographie-jour-${iso}.json`)

/** Réponse « modèle » (JSON texte) au prompt d'extraction : pôle ou kairos du jour cité. */
function fixtureAnswer(prompt) {
  const iso = /\((\d{4}-\d{2}-\d{2})\)/.exec(prompt)[1]
  const doc = dayDoc(iso)
  if (prompt.includes('SYNTHÈSE KAIROS')) return JSON.stringify(doc.kairos)
  const num = Number(/# Pôle (\d) — /.exec(prompt)[1])
  return JSON.stringify(doc.poles[num - 1])
}

// --- fetch simulé ------------------------------------------------------------
/**
 * `answers` : réponses successives — [status, corps, en-têtes?], une Error
 * (échec réseau levé par fetch) ou une fonction (url, init) => [status, corps].
 * Un corps de type string simule un corps NON JSON (json() lève).
 */
function fakeFetch(answers) {
  const calls = []
  const fetchFn = async (url, init) => {
    calls.push({ url, init, body: init?.body ? JSON.parse(init.body) : null })
    let next = answers.length > 1 ? answers.shift() : answers[0]
    if (typeof next === 'function') next = next(url, init)
    if (next instanceof Error) throw next
    const [status, body, headers = {}] = next
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: { get: (name) => headers[name.toLowerCase()] ?? null },
      json: async () => {
        if (typeof body === 'string') throw new SyntaxError(`Unexpected token '<', "${body.slice(0, 20)}" is not valid JSON`)
        return structuredClone(body)
      },
    }
  }
  return { calls, fetchFn }
}

async function caught(promise) {
  try {
    await promise
  } catch (err) {
    return err
  }
  throw new Error('une erreur était attendue')
}

const noWait = () => {
  const waits = []
  return { waits, sleepFn: async (ms) => { waits.push(ms) } }
}

beforeEach(() => {
  // Piège : tout appel au fetch global (réseau réel) fait échouer le test.
  vi.stubGlobal('fetch', () => {
    throw new Error('appel réseau réel interdit dans ce test')
  })
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('UC-APP-02 — clé personnelle : sélection du fournisseur (A1, E3)', () => {
  it('UC-APP-02-U28 — createProvider : 6 fournisseurs, clé exigée en direct sauf Ollama, fournisseur ou transport inconnu refusé avant tout appel', async () => {
    expect(SUPPORTED_PROVIDERS).toEqual(['anthropic', 'openai', 'google', 'xai', 'openrouter', 'ollama'])
    for (const id of ['anthropic', 'openai', 'google', 'xai', 'openrouter']) {
      expect(() => createProvider({ provider: id, transport: 'direct' })).toThrow(
        `createProvider(): apiKey requise pour ${id} en transport direct`,
      )
    }
    const ollama = createProvider({ provider: 'ollama' }) // transport direct par défaut, sans clé
    expect(ollama).toMatchObject({ name: 'ollama', transport: 'direct' })

    expect(() => createProvider({ provider: 'mistral', apiKey: 'cle-test' })).toThrow(
      'createProvider(): fournisseur inconnu "mistral" (supportés : anthropic, openai, google, xai, openrouter, ollama)',
    )
    expect(() => createProvider({ provider: 'openai', transport: 'websocket', apiKey: 'cle-test' })).toThrow(
      /transport inconnu "websocket"/,
    )

    // Paramètres d'appel contrôlés AVANT tout envoi.
    const { calls, fetchFn } = fakeFetch([[200, {}]])
    const openai = createProvider({ provider: 'openai', apiKey: 'sk-test-openai', fetchFn })
    await expect(openai.complete({ prompt: 'Pôle 1' })).rejects.toThrow('complete(): "model" est requis')
    await expect(openai.complete({ model: 'gpt-4o-mini', prompt: '' })).rejects.toThrow('complete(): "prompt" est requis')
    expect(calls).toHaveLength(0)
  })
})

describe('UC-APP-02 — clé personnelle : format de chaque fournisseur (A1, RG9)', () => {
  it('UC-APP-02-U29 — OpenAI : POST /v1/chat/completions, « Authorization: Bearer », messages system/user, max_tokens ; texte, usage et modèle extraits', async () => {
    const { calls, fetchFn } = fakeFetch([
      [200, {
        choices: [{ index: 0, message: { role: 'assistant', content: '{"poleNum":"1"}' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 1200, completion_tokens: 340, total_tokens: 1540 },
        model: 'gpt-4o-mini-2024-07-18',
      }],
      [200, {}],
    ])
    const provider = createProvider({ provider: 'openai', apiKey: 'sk-test-openai', fetchFn })

    const result = await provider.complete({
      model: 'gpt-4o-mini', system: 'Tu es cartographe.', prompt: 'Pôle 1', maxTokens: 8192, temperature: 0,
    })

    expect(result).toEqual({
      text: '{"poleNum":"1"}',
      usage: { inputTokens: 1200, outputTokens: 340 },
      model: 'gpt-4o-mini-2024-07-18',
    })
    expect(calls[0].url).toBe('https://api.openai.com/v1/chat/completions')
    expect(calls[0].init.method).toBe('POST')
    expect(calls[0].init.headers).toEqual({
      'content-type': 'application/json',
      authorization: 'Bearer sk-test-openai',
    })
    expect(calls[0].body).toEqual({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'Tu es cartographe.' },
        { role: 'user', content: 'Pôle 1' },
      ],
      max_tokens: 8192,
      temperature: 0,
    })

    // Appel tel que le fait extractDay (ni system ni temperature) ; réponse vide.
    const empty = await provider.complete({ model: 'gpt-4o-mini', prompt: 'Pôle 2' })
    expect(calls[1].body).toEqual({ model: 'gpt-4o-mini', messages: [{ role: 'user', content: 'Pôle 2' }], max_tokens: 4096 })
    expect(empty).toEqual({ text: '', usage: { inputTokens: 0, outputTokens: 0 }, model: 'gpt-4o-mini' })
  })

  it('UC-APP-02-U30 — xAI et OpenRouter : même format compatible OpenAI, seule l’URL de base change ; identifiant de modèle à barre oblique transmis tel quel', async () => {
    const cases = [
      ['xai', 'xai-test', 'grok-4', 'https://api.x.ai/v1/chat/completions'],
      ['openrouter', 'or-test', 'anthropic/claude-sonnet-4.6', 'https://openrouter.ai/api/v1/chat/completions'],
    ]
    for (const [id, key, model, url] of cases) {
      const { calls, fetchFn } = fakeFetch([
        [200, { choices: [{ message: { content: `réponse ${id}` } }], usage: { prompt_tokens: 50, completion_tokens: 7 }, model }],
      ])
      const provider = createProvider({ provider: id, apiKey: key, fetchFn })

      const result = await provider.complete({ model, prompt: 'Pôle 3', maxTokens: 8192 })

      expect(provider.name).toBe(id)
      expect(result).toEqual({ text: `réponse ${id}`, usage: { inputTokens: 50, outputTokens: 7 }, model })
      expect(calls).toHaveLength(1)
      expect(calls[0].url).toBe(url)
      expect(calls[0].init.headers).toEqual({ 'content-type': 'application/json', authorization: `Bearer ${key}` })
      expect(calls[0].body).toEqual({ model, messages: [{ role: 'user', content: 'Pôle 3' }], max_tokens: 8192 })
    }
  })

  it('UC-APP-02-U31 — Google Gemini : modèle encodé dans le chemin, clé en « x-goog-api-key » (jamais ?key=), generationConfig ; parties concaténées, usageMetadata, modelVersion', async () => {
    const { calls, fetchFn } = fakeFetch([
      [200, {
        candidates: [{ content: { role: 'model', parts: [{ text: '{"pole' }, { text: 'Num":"1"}' }] }, finishReason: 'STOP' }],
        // thoughtsTokenCount (réflexion des modèles 2.5) : non compté — comportement ACTUEL, voir « Limites ».
        usageMetadata: { promptTokenCount: 900, candidatesTokenCount: 120, thoughtsTokenCount: 700, totalTokenCount: 1720 },
        modelVersion: 'gemini-2.5-flash-001',
      }],
      // Réponse bloquée (filtre de sécurité) : 200 sans candidat.
      [200, { promptFeedback: { blockReason: 'SAFETY' } }],
    ])
    const provider = createProvider({ provider: 'google', apiKey: 'goog-test', fetchFn })

    const result = await provider.complete({
      model: 'gemini-2.5-flash', system: 'Consigne', prompt: 'Pôle 1', maxTokens: 8192, temperature: 0.2,
    })

    expect(result).toEqual({
      text: '{"poleNum":"1"}',
      usage: { inputTokens: 900, outputTokens: 120 },
      model: 'gemini-2.5-flash-001',
    })
    expect(calls[0].url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
    )
    expect(calls[0].url).not.toContain('key=')
    expect(calls[0].init.headers).toEqual({ 'content-type': 'application/json', 'x-goog-api-key': 'goog-test' })
    expect(calls[0].body).toEqual({
      contents: [{ role: 'user', parts: [{ text: 'Pôle 1' }] }],
      generationConfig: { maxOutputTokens: 8192, temperature: 0.2 },
      systemInstruction: { parts: [{ text: 'Consigne' }] },
    })

    // Un identifiant de modèle ne peut pas injecter de paramètre d'URL ; réponse bloquée = texte vide.
    const blocked = await provider.complete({ model: 'gemini-2.5-flash?alt=sse', prompt: 'Pôle 2' })
    expect(calls[1].url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash%3Falt%3Dsse:generateContent',
    )
    expect(calls[1].body).toEqual({
      contents: [{ role: 'user', parts: [{ text: 'Pôle 2' }] }],
      generationConfig: { maxOutputTokens: 4096 },
    })
    expect(blocked).toEqual({ text: '', usage: { inputTokens: 0, outputTokens: 0 }, model: 'gemini-2.5-flash?alt=sse' })
  })

  it('UC-APP-02-U32 — Ollama (local) : POST http://localhost:11434/api/chat sans en-tête d’authentification — une clé saisie n’est jamais envoyée — stream: false, num_predict ; compteurs prompt_eval_count/eval_count', async () => {
    const { calls, fetchFn } = fakeFetch([
      [200, {
        model: 'llama3.1:8b',
        message: { role: 'assistant', content: '{"poleNum":"4"}' },
        done: true,
        prompt_eval_count: 812,
        eval_count: 97,
      }],
      [200, { message: { content: 'ok' } }],
    ])
    const provider = createProvider({ provider: 'ollama', apiKey: 'cle-saisie-par-erreur', fetchFn })

    const result = await provider.complete({ model: 'llama3.1', system: 'Consigne', prompt: 'Pôle 4', maxTokens: 8192 })

    expect(result).toEqual({ text: '{"poleNum":"4"}', usage: { inputTokens: 812, outputTokens: 97 }, model: 'llama3.1:8b' })
    expect(calls[0].url).toBe('http://localhost:11434/api/chat')
    expect(calls[0].init.headers).toEqual({ 'content-type': 'application/json' })
    expect(JSON.stringify(calls[0].init)).not.toContain('cle-saisie-par-erreur')
    expect(calls[0].body).toEqual({
      model: 'llama3.1',
      messages: [
        { role: 'system', content: 'Consigne' },
        { role: 'user', content: 'Pôle 4' },
      ],
      stream: false,
      options: { num_predict: 8192 },
    })

    // URL de base surchargeable côté moteur (barre finale retirée) — l'assistant ne l'expose pas.
    const remote = createProvider({ provider: 'ollama', baseUrl: 'http://127.0.0.1:11434/', fetchFn })
    await remote.complete({ model: 'llama3.1', prompt: 'Pôle 5' })
    expect(calls[1].url).toBe('http://127.0.0.1:11434/api/chat')
  })

  it('UC-APP-02-U40 — Anthropic : POST /v1/messages, « x-api-key » + « anthropic-version » + « anthropic-dangerous-direct-browser-access » (CORS navigateur), max_tokens, system seulement s’il est fourni ; seuls les blocs de type text concaténés, usage et modèle extraits', async () => {
    const { calls, fetchFn } = fakeFetch([
      [200, {
        id: 'msg_test',
        type: 'message',
        role: 'assistant',
        model: 'claude-sonnet-4-6-20260101',
        // Des blocs non textuels encadrent le texte : ils ne doivent pas polluer
        // le JSON attendu. Le dernier porte (cas défensif) un champ `text` : seul
        // le type du bloc décide (filtre type === 'text').
        content: [
          { type: 'thinking', thinking: 'Je relis la feuille…', signature: 'sig-test' },
          { type: 'text', text: '{"a"' },
          { type: 'text', text: ':1}' },
          { type: 'tool_use', id: 'toolu_test', name: 'noter', input: {}, text: 'bruit' },
        ],
        stop_reason: 'end_turn',
        usage: { input_tokens: 1500, output_tokens: 420 },
      }],
      [200, { content: [] }],
    ])
    const provider = createProvider({ provider: 'anthropic', apiKey: 'sk-ant-test', fetchFn })

    // Appel tel que le fait extractDay via l'assistant : ni system ni temperature, budget 8 192.
    const result = await provider.complete({ model: 'claude-sonnet-4-6', prompt: 'Pôle 1', maxTokens: 8192 })

    expect(result).toEqual({
      text: '{"a":1}',
      usage: { inputTokens: 1500, outputTokens: 420 },
      model: 'claude-sonnet-4-6-20260101',
    })
    expect(calls[0].url).toBe('https://api.anthropic.com/v1/messages')
    expect(calls[0].init.method).toBe('POST')
    expect(calls[0].init.headers).toEqual({
      'content-type': 'application/json',
      'x-api-key': 'sk-ant-test',
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    })
    expect(calls[0].url).not.toContain('sk-ant-test')
    expect(calls[0].body).toEqual({
      model: 'claude-sonnet-4-6',
      max_tokens: 8192,
      messages: [{ role: 'user', content: 'Pôle 1' }],
    })
    expect(calls[0].body).not.toHaveProperty('system')

    // system fourni : champ de premier niveau (pas un message) ; réponse vide → '' et 0, modèle demandé.
    const empty = await provider.complete({ model: 'claude-sonnet-4-6', system: 'Consigne', prompt: 'Pôle 2', temperature: 0 })
    expect(calls[1].body).toEqual({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      messages: [{ role: 'user', content: 'Pôle 2' }],
      system: 'Consigne',
      temperature: 0,
    })
    expect(empty).toEqual({ text: '', usage: { inputTokens: 0, outputTokens: 0 }, model: 'claude-sonnet-4-6' })
  })
})

describe('UC-APP-02 — clé personnelle : erreurs typées et reprises (A1, E4, E7)', () => {
  it('UC-APP-02-U33 — erreurs HTTP typées (ProviderError) : 4xx jamais réessayé, message « <fournisseur>: HTTP <code> — <détail> » selon le format d’erreur de chaque API ; 200 non JSON refusé', async () => {
    const cases = [
      ['openai', 'sk-test-openai', 'gpt-4o-mini', [401, { error: { message: 'Incorrect API key provided', type: 'invalid_request_error' } }],
        'openai: HTTP 401 — Incorrect API key provided'],
      ['google', 'goog-test', 'gemini-2.5-flash', [400, { error: { code: 400, message: 'API key not valid. Please pass a valid API key.', status: 'INVALID_ARGUMENT' } }],
        'google: HTTP 400 — API key not valid. Please pass a valid API key.'],
      ['ollama', undefined, 'llama3.1', [404, { error: 'model "llama3.1" not found, try pulling it first' }],
        'ollama: HTTP 404 — model "llama3.1" not found, try pulling it first'],
      ['xai', 'xai-test', 'grok-4', [403, '<html>Forbidden</html>'], 'xai: HTTP 403'],
    ]
    for (const [id, key, model, answer, message] of cases) {
      const { calls, fetchFn } = fakeFetch([answer])
      const { waits, sleepFn } = noWait()
      const provider = createProvider({ provider: id, apiKey: key, fetchFn, sleepFn })

      const err = await caught(provider.complete({ model, prompt: 'Pôle 1' }))

      expect(err).toBeInstanceOf(ProviderError)
      expect(err).toMatchObject({ name: 'ProviderError', message, status: answer[0], retryable: false, provider: id })
      expect(calls).toHaveLength(1) // aucune reprise sur 4xx
      expect(waits).toEqual([])
    }

    // 200 au corps non JSON (page HTML d'une passerelle) : erreur typée, non réessayée.
    const html = fakeFetch([[200, '<!doctype html><title>Portail</title>']])
    const openrouter = createProvider({ provider: 'openrouter', apiKey: 'or-test', fetchFn: html.fetchFn })
    const err = await caught(openrouter.complete({ model: 'anthropic/claude-sonnet-4.6', prompt: 'Pôle 1' }))
    expect(err).toBeInstanceOf(ProviderError)
    expect(err).toMatchObject({ status: 200, retryable: false, provider: 'openrouter' })
    expect(err.message).toMatch(/^openrouter: réponse HTTP 200 au corps non-JSON \(/)
    expect(html.calls).toHaveLength(1)
  })

  it('UC-APP-02-U34 — reprises (retry.js) : 3 essais au total sur 429/5xx/réseau, Retry-After respecté et plafonné à 5 min, attente exponentielle sinon ; interruption pendant l’attente', async () => {
    // 429 + Retry-After : attente demandée par le fournisseur, puis succès.
    const quota = fakeFetch([
      [429, { error: { message: 'Rate limit reached' } }, { 'retry-after': '7' }],
      [200, { choices: [{ message: { content: 'ok' } }], usage: { prompt_tokens: 1, completion_tokens: 1 } }],
    ])
    const w1 = noWait()
    const openai = createProvider({ provider: 'openai', apiKey: 'sk-test-openai', fetchFn: quota.fetchFn, sleepFn: w1.sleepFn })
    expect((await openai.complete({ model: 'gpt-4o-mini', prompt: 'Pôle 1' })).text).toBe('ok')
    expect(w1.waits).toEqual([7000])
    expect(quota.calls).toHaveLength(2)

    // 503 persistant sans Retry-After : 3 essais, attentes 250 puis 500 ms (gigue nulle), erreur typée réessayable.
    const down = fakeFetch([[503, { error: { code: 503, message: 'The model is overloaded.' } }]])
    const w2 = noWait()
    const google = createProvider({
      provider: 'google', apiKey: 'goog-test', fetchFn: down.fetchFn, sleepFn: w2.sleepFn, random: () => 0,
    })
    const err = await caught(google.complete({ model: 'gemini-2.5-flash', prompt: 'Pôle 1' }))
    expect(err).toMatchObject({ status: 503, retryable: true, provider: 'google', message: 'google: HTTP 503 — The model is overloaded.' })
    expect(down.calls).toHaveLength(3)
    expect(w2.waits).toEqual([250, 500])

    // Erreur réseau (fetch lève) : typée status 0, réessayée, puis succès au 3e essai.
    const flaky = fakeFetch([
      new TypeError('Failed to fetch'),
      new TypeError('Failed to fetch'),
      [200, { content: [{ type: 'text', text: 'ok' }], usage: { input_tokens: 3, output_tokens: 1 } }],
    ])
    const w3 = noWait()
    const anthropic = createProvider({ provider: 'anthropic', apiKey: 'sk-ant-test', fetchFn: flaky.fetchFn, sleepFn: w3.sleepFn, random: () => 1 })
    expect(await anthropic.complete({ model: 'claude-sonnet-4-6', prompt: 'Pôle 1' })).toMatchObject({ text: 'ok' })
    expect(flaky.calls).toHaveLength(3)
    expect(w3.waits).toEqual([500, 1000]) // gigue maximale
    const offline = fakeFetch([new TypeError('Failed to fetch')])
    const offErr = await caught(
      createProvider({ provider: 'anthropic', apiKey: 'sk-ant-test', fetchFn: offline.fetchFn, sleepFn: noWait().sleepFn })
        .complete({ model: 'claude-sonnet-4-6', prompt: 'Pôle 1' }),
    )
    expect(offErr).toMatchObject({ status: 0, retryable: true, message: 'anthropic: erreur réseau (Failed to fetch)' })
    expect(offline.calls).toHaveLength(3)

    // Retry-After démesuré (1 h) : plafonné à MAX_RETRY_AFTER_MS (5 min).
    const hostile = fakeFetch([[429, {}, { 'retry-after': '3600' }], [200, { choices: [{ message: { content: 'ok' } }] }]])
    const w4 = noWait()
    await createProvider({ provider: 'xai', apiKey: 'xai-test', fetchFn: hostile.fetchFn, sleepFn: w4.sleepFn })
      .complete({ model: 'grok-4', prompt: 'Pôle 1' })
    expect(MAX_RETRY_AFTER_MS).toBe(300_000)
    expect(w4.waits).toEqual([300_000])

    // « Interrompre » PENDANT l'attente avant reprise (Retry-After de 30 s,
    // attente RÉELLE : sleep par défaut, pas de sleepFn) : l'attente déjà en
    // cours est abandonnée aussitôt (AbortError, aucun 2e envoi) ; le signal
    // a aussi été transmis à fetch.
    const controller = new AbortController()
    const stopped = fakeFetch([[429, {}, { 'retry-after': '30' }]])
    const openrouter = createProvider({ provider: 'openrouter', apiKey: 'or-test', fetchFn: stopped.fetchFn })
    const pending = openrouter
      .complete({ model: 'anthropic/claude-sonnet-4.6', prompt: 'Pôle 1', signal: controller.signal })
      .catch((e) => e)
    await new Promise((r) => setTimeout(r, 20))
    expect(stopped.calls).toHaveLength(1) // 1er envoi fait (429), l'attente de 30 s est en cours
    const t0 = Date.now()
    controller.abort()
    const abortErr = await pending
    expect(abortErr.name).toBe('AbortError')
    expect(Date.now() - t0).toBeLessThan(1000)
    expect(stopped.calls).toHaveLength(1)
    expect(stopped.calls[0].init.signal).toBe(controller.signal)
  }, 5000)

  it('UC-APP-02-U35 — extractDay sur un fournisseur direct : journée nominale sur Gemini (8 requêtes) ; 503 persistant → 6 requêtes pour le pôle 1 puis journée en échec ; clé refusée (401) → 2 requêtes', async () => {
    // Nominal : le moteur réel sur l'adaptateur Google, réponses tirées des fixtures.
    const gemini = fakeFetch([
      (url, init) => [200, {
        candidates: [{ content: { parts: [{ text: fixtureAnswer(JSON.parse(init.body).contents[0].parts[0].text) }] } }],
        usageMetadata: { promptTokenCount: 5000, candidatesTokenCount: 800 },
      }],
    ])
    const document = await extractDay({
      dayText: 'Atelier photo avec les CM2, vernissage le soir.',
      date: '2026-01-05',
      referentiel: referentiel(),
      provider: createProvider({ provider: 'google', apiKey: 'goog-test', fetchFn: gemini.fetchFn }),
      model: 'gemini-2.5-flash',
      maxTokens: 8192,
      kairosOptional: true,
    })
    expect(gemini.calls).toHaveLength(8)
    expect(gemini.calls.every((c) => c.url.startsWith('https://generativelanguage.googleapis.com/'))).toBe(true)
    expect(gemini.calls.every((c) => c.body.generationConfig.maxOutputTokens === 8192)).toBe(true)
    expect(validateDocument('cartographie-jour', document)).toEqual({ valid: true, errors: [] })

    // 503 persistant : 3 essais du transport × 2 essais d'extractDay, puis échec contextualisé.
    const down = fakeFetch([[503, { error: { message: 'The server is overloaded' } }]])
    const w = noWait()
    const failed = await caught(extractDay({
      dayText: 'Journée.',
      date: '2026-01-05',
      referentiel: referentiel(),
      provider: createProvider({ provider: 'openai', apiKey: 'sk-test-openai', fetchFn: down.fetchFn, sleepFn: w.sleepFn }),
      model: 'gpt-4o-mini',
      kairosOptional: true,
    }))
    expect(failed.message).toBe('extractDay : pôle 1 (2026-01-05) — openai: HTTP 503 — The server is overloaded')
    expect(failed.cause).toBeInstanceOf(ProviderError)
    expect(down.calls).toHaveLength(6)
    expect(down.calls.every((c) => c.body.messages[0].content.includes('# Pôle 1 — '))).toBe(true)
    expect(w.waits).toHaveLength(4) // 2 attentes par série de 3 essais

    // Clé refusée : pas de reprise du transport, un seul nouvel essai d'extractDay.
    const refused = fakeFetch([[401, { error: { message: 'Incorrect API key provided' } }]])
    const denied = await caught(extractDay({
      dayText: 'Journée.',
      date: '2026-01-05',
      referentiel: referentiel(),
      provider: createProvider({ provider: 'openai', apiKey: 'sk-test-openai', fetchFn: refused.fetchFn }),
      model: 'gpt-4o-mini',
      kairosOptional: true,
    }))
    expect(denied.message).toBe('extractDay : pôle 1 (2026-01-05) — openai: HTTP 401 — Incorrect API key provided')
    expect(denied.cause).toMatchObject({ status: 401, retryable: false })
    expect(refused.calls).toHaveLength(2)
  })
})

describe('UC-APP-02 — clé personnelle : anomalie A-06 (troncature non signalée)', () => {
  it('UC-APP-02-U36 — comportement ACTUEL : les adaptateurs directs ne remontent pas la fin par budget de sortie (stopReason absent) ; extractDay ne peut pas dire « réponse tronquée » en clé personnelle', async () => {
    const truncatedAnswers = [
      ['anthropic', 'sk-ant-test', { content: [{ type: 'text', text: '{"poleNum":' }], stop_reason: 'max_tokens', usage: { input_tokens: 1, output_tokens: 8192 } }],
      ['openai', 'sk-test-openai', { choices: [{ message: { content: '{"poleNum":' }, finish_reason: 'length' }], usage: { prompt_tokens: 1, completion_tokens: 8192 } }],
      ['google', 'goog-test', { candidates: [{ content: { parts: [{ text: '{"poleNum":' }] }, finishReason: 'MAX_TOKENS' }] }],
      ['ollama', undefined, { message: { content: '{"poleNum":' }, done_reason: 'length', eval_count: 8192 }],
    ]
    for (const [id, key, body] of truncatedAnswers) {
      const { fetchFn } = fakeFetch([[200, body]])
      const result = await createProvider({ provider: id, apiKey: key, fetchFn }).complete({ model: 'm', prompt: 'Pôle 1' })
      expect(result.text).toBe('{"poleNum":')
      expect(result).not.toHaveProperty('stopReason') // comportement ACTUEL (A-06)
    }
    // Le transport proxy, lui, relaie le signal (même contrat que le Service humanome).
    const relayed = fakeFetch([[200, { text: '{"poleNum":', stopReason: 'max_tokens' }]])
    const viaProxy = await createProvider({ provider: 'anthropic', transport: 'proxy', fetchFn: relayed.fetchFn })
      .complete({ model: 'm', prompt: 'Pôle 1' })
    expect(viaProxy.stopReason).toBe('max_tokens')

    // Conséquence dans extractDay : même journée tronquée (réponse coupée à 60 %).
    const full = JSON.stringify(dayDoc('2026-01-05').poles[0])
    const cut = full.slice(0, Math.floor(full.length * 0.6))
    const direct = fakeFetch([[200, { content: [{ type: 'text', text: cut }], stop_reason: 'max_tokens' }]])
    const directErr = await caught(extractDay({
      dayText: 'Journée.',
      date: '2026-01-05',
      referentiel: referentiel(),
      provider: createProvider({ provider: 'anthropic', apiKey: 'sk-ant-test', fetchFn: direct.fetchFn }),
      model: 'claude-sonnet-4-6',
    }))
    expect(directErr.message).toMatch(/^extractDay : pôle 1 \(2026-01-05\) — réponse sans tableau competences \(objet /)
    expect(directErr.message).not.toContain('tronquée')
    expect(direct.calls).toHaveLength(2)

    const proxied = fakeFetch([[200, { text: cut, stopReason: 'max_tokens' }]])
    const proxyErr = await caught(extractDay({
      dayText: 'Journée.',
      date: '2026-01-05',
      referentiel: referentiel(),
      provider: createProvider({ provider: 'anthropic', transport: 'proxy', fetchFn: proxied.fetchFn }),
      model: 'claude-sonnet-4-6',
    }))
    expect(proxyErr.message).toBe(
      'extractDay : pôle 1 (2026-01-05) — réponse tronquée (budget de sortie atteint) — réduisez le texte de la journée',
    )
  })
})
