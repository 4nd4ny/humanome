import { describe, it, expect, vi } from 'vitest'
import { createProvider, ProviderError, DEFAULT_MAX_TOKENS, SUPPORTED_PROVIDERS } from './index.js'

// ---------------------------------------------------------------------------
// Outillage : fetch mocké (aucun appel réseau réel dans toute la suite).
// ---------------------------------------------------------------------------

function jsonResponse(data, { status = 200, headers = {} } = {}) {
  const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]))
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => lower[name.toLowerCase()] ?? null },
    json: async () => data
  }
}

/** fetch mocké : rejoue la liste de réponses, enregistre chaque appel. */
function makeFetch(...responses) {
  const calls = []
  const fetchFn = vi.fn(async (url, options) => {
    calls.push({ url, options, body: JSON.parse(options.body) })
    const next = responses[Math.min(calls.length - 1, responses.length - 1)]
    if (next instanceof Error) throw next
    return next
  })
  fetchFn.calls = calls
  return fetchFn
}

const noSleep = async () => {}

// ---------------------------------------------------------------------------
// Construction des requêtes par fournisseur (transport direct)
// ---------------------------------------------------------------------------

describe('anthropic (Messages API, transport direct)', () => {
  const payload = {
    content: [{ type: 'text', text: 'Bonjour !' }],
    usage: { input_tokens: 12, output_tokens: 7 },
    model: 'claude-haiku-4-5'
  }

  it('construit la bonne requête (URL, headers navigateur, body)', async () => {
    const fetchFn = makeFetch(jsonResponse(payload))
    const provider = createProvider({ provider: 'anthropic', apiKey: 'sk-ant-test', fetchFn })
    expect(provider.name).toBe('anthropic')

    const result = await provider.complete({
      model: 'claude-haiku-4-5',
      system: 'Tu es un pédagogue.',
      prompt: 'Analyse cette journée.',
      maxTokens: 2000,
      temperature: 0.2
    })

    const call = fetchFn.calls[0]
    expect(call.url).toBe('https://api.anthropic.com/v1/messages')
    expect(call.options.method).toBe('POST')
    expect(call.options.headers['x-api-key']).toBe('sk-ant-test')
    expect(call.options.headers['anthropic-version']).toBe('2023-06-01')
    expect(call.options.headers['anthropic-dangerous-direct-browser-access']).toBe('true')
    expect(call.options.headers['content-type']).toBe('application/json')
    expect(call.body).toEqual({
      model: 'claude-haiku-4-5',
      max_tokens: 2000,
      system: 'Tu es un pédagogue.',
      messages: [{ role: 'user', content: 'Analyse cette journée.' }],
      temperature: 0.2
    })
    // la clé ne fuit jamais dans l'URL
    expect(call.url).not.toContain('sk-ant-test')

    expect(result).toEqual({
      text: 'Bonjour !',
      usage: { inputTokens: 12, outputTokens: 7 },
      model: 'claude-haiku-4-5'
    })
  })

  it('applique maxTokens par défaut et omet system/temperature absents', async () => {
    const fetchFn = makeFetch(jsonResponse(payload))
    const provider = createProvider({ provider: 'anthropic', apiKey: 'k', fetchFn })
    await provider.complete({ model: 'claude-haiku-4-5', prompt: 'p' })
    expect(fetchFn.calls[0].body.max_tokens).toBe(DEFAULT_MAX_TOKENS)
    expect(fetchFn.calls[0].body).not.toHaveProperty('system')
    expect(fetchFn.calls[0].body).not.toHaveProperty('temperature')
  })

  it('concatène les blocs texte multiples de la réponse', async () => {
    const fetchFn = makeFetch(
      jsonResponse({
        content: [
          { type: 'thinking', thinking: 'hum' },
          { type: 'text', text: 'A' },
          { type: 'text', text: 'B' }
        ],
        usage: { input_tokens: 1, output_tokens: 2 },
        model: 'm'
      })
    )
    const provider = createProvider({ provider: 'anthropic', apiKey: 'k', fetchFn })
    const result = await provider.complete({ model: 'm', prompt: 'p' })
    expect(result.text).toBe('AB')
  })
})

describe('openai (chat completions, transport direct)', () => {
  it('construit la bonne requête et parse la réponse', async () => {
    const fetchFn = makeFetch(
      jsonResponse({
        choices: [{ message: { role: 'assistant', content: 'Réponse.' } }],
        usage: { prompt_tokens: 20, completion_tokens: 5 },
        model: 'gpt-4o-mini'
      })
    )
    const provider = createProvider({ provider: 'openai', apiKey: 'sk-oa-test', fetchFn })
    const result = await provider.complete({
      model: 'gpt-4o-mini',
      system: 'Sois bref.',
      prompt: 'Question ?',
      maxTokens: 800
    })

    const call = fetchFn.calls[0]
    expect(call.url).toBe('https://api.openai.com/v1/chat/completions')
    expect(call.options.headers.authorization).toBe('Bearer sk-oa-test')
    expect(call.body).toEqual({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'Sois bref.' },
        { role: 'user', content: 'Question ?' }
      ],
      max_tokens: 800
    })
    expect(result).toEqual({
      text: 'Réponse.',
      usage: { inputTokens: 20, outputTokens: 5 },
      model: 'gpt-4o-mini'
    })
  })
})

describe('google (generateContent, transport direct)', () => {
  it('construit la bonne requête — clé en header x-goog-api-key, jamais dans l’URL', async () => {
    const fetchFn = makeFetch(
      jsonResponse({
        candidates: [{ content: { role: 'model', parts: [{ text: 'Texte ' }, { text: 'généré' }] } }],
        usageMetadata: { promptTokenCount: 30, candidatesTokenCount: 9 },
        modelVersion: 'gemini-2.5-flash-002'
      })
    )
    const provider = createProvider({ provider: 'google', apiKey: 'AIza-test', fetchFn })
    const result = await provider.complete({
      model: 'gemini-2.5-flash',
      system: 'Contexte.',
      prompt: 'Question ?',
      maxTokens: 1000,
      temperature: 0
    })

    const call = fetchFn.calls[0]
    expect(call.url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent'
    )
    expect(call.url).not.toContain('AIza-test')
    expect(call.options.headers['x-goog-api-key']).toBe('AIza-test')
    expect(call.body).toEqual({
      systemInstruction: { parts: [{ text: 'Contexte.' }] },
      contents: [{ role: 'user', parts: [{ text: 'Question ?' }] }],
      generationConfig: { maxOutputTokens: 1000, temperature: 0 }
    })
    expect(result).toEqual({
      text: 'Texte généré',
      usage: { inputTokens: 30, outputTokens: 9 },
      model: 'gemini-2.5-flash-002'
    })
  })
})

describe('xai / openrouter (compatibles OpenAI)', () => {
  const payload = {
    choices: [{ message: { content: 'ok' } }],
    usage: { prompt_tokens: 1, completion_tokens: 1 },
    model: 'x'
  }

  it('xai vise api.x.ai avec Bearer', async () => {
    const fetchFn = makeFetch(jsonResponse(payload))
    const provider = createProvider({ provider: 'xai', apiKey: 'xai-test', fetchFn })
    await provider.complete({ model: 'grok-4', prompt: 'p' })
    expect(fetchFn.calls[0].url).toBe('https://api.x.ai/v1/chat/completions')
    expect(fetchFn.calls[0].options.headers.authorization).toBe('Bearer xai-test')
  })

  it('openrouter vise openrouter.ai/api avec Bearer', async () => {
    const fetchFn = makeFetch(jsonResponse(payload))
    const provider = createProvider({ provider: 'openrouter', apiKey: 'or-test', fetchFn })
    await provider.complete({ model: 'meta-llama/llama-3.3-70b', prompt: 'p' })
    expect(fetchFn.calls[0].url).toBe('https://openrouter.ai/api/v1/chat/completions')
    expect(fetchFn.calls[0].options.headers.authorization).toBe('Bearer or-test')
  })
})

describe('ollama (api/chat local, transport direct)', () => {
  it('construit la bonne requête sans clé et parse la réponse', async () => {
    const fetchFn = makeFetch(
      jsonResponse({
        model: 'llama3.1:8b',
        message: { role: 'assistant', content: 'Réponse locale.' },
        prompt_eval_count: 40,
        eval_count: 12
      })
    )
    const provider = createProvider({ provider: 'ollama', fetchFn })
    const result = await provider.complete({
      model: 'llama3.1:8b',
      system: 'Sys.',
      prompt: 'Question ?',
      maxTokens: 500
    })

    const call = fetchFn.calls[0]
    expect(call.url).toBe('http://localhost:11434/api/chat')
    expect(call.options.headers).not.toHaveProperty('authorization')
    expect(call.options.headers).not.toHaveProperty('x-api-key')
    expect(call.body).toEqual({
      model: 'llama3.1:8b',
      messages: [
        { role: 'system', content: 'Sys.' },
        { role: 'user', content: 'Question ?' }
      ],
      stream: false,
      options: { num_predict: 500 }
    })
    expect(result).toEqual({
      text: 'Réponse locale.',
      usage: { inputTokens: 40, outputTokens: 12 },
      model: 'llama3.1:8b'
    })
  })

  it('accepte un baseUrl personnalisé (slash final toléré)', async () => {
    const fetchFn = makeFetch(jsonResponse({ message: { content: '' }, model: 'm' }))
    const provider = createProvider({ provider: 'ollama', baseUrl: 'http://gpu-box:11434/', fetchFn })
    await provider.complete({ model: 'm', prompt: 'p' })
    expect(fetchFn.calls[0].url).toBe('http://gpu-box:11434/api/chat')
  })
})

// ---------------------------------------------------------------------------
// Transport proxy (POST /api/llm, la clé reste côté serveur M5)
// ---------------------------------------------------------------------------

describe('transport proxy', () => {
  const proxyPayload = {
    text: 'Réponse via proxy.',
    usage: { inputTokens: 100, outputTokens: 25 },
    model: 'claude-haiku-4-5'
  }

  it('POSTe {provider, model, system, prompt, maxTokens} vers /api/llm par défaut', async () => {
    const fetchFn = makeFetch(jsonResponse(proxyPayload))
    const provider = createProvider({ provider: 'anthropic', transport: 'proxy', fetchFn })
    expect(provider.name).toBe('anthropic')
    expect(provider.transport).toBe('proxy')

    const result = await provider.complete({
      model: 'claude-haiku-4-5',
      system: 'Sys.',
      prompt: 'Analyse.',
      maxTokens: 1500
    })

    const call = fetchFn.calls[0]
    expect(call.url).toBe('/api/llm')
    expect(call.body).toEqual({
      provider: 'anthropic',
      model: 'claude-haiku-4-5',
      system: 'Sys.',
      prompt: 'Analyse.',
      maxTokens: 1500
    })
    expect(result).toEqual({
      text: 'Réponse via proxy.',
      usage: { inputTokens: 100, outputTokens: 25 },
      model: 'claude-haiku-4-5'
    })
  })

  it('respecte proxyUrl et ne fait JAMAIS fuiter la clé (ni header, ni body, ni URL)', async () => {
    const fetchFn = makeFetch(jsonResponse(proxyPayload))
    const provider = createProvider({
      provider: 'openai',
      transport: 'proxy',
      proxyUrl: 'https://humanome.xyz/api/llm',
      apiKey: 'sk-secret-ne-doit-pas-fuiter', // fournie par erreur : ignorée en proxy
      fetchFn
    })
    await provider.complete({ model: 'gpt-4o', prompt: 'p' })

    const call = fetchFn.calls[0]
    expect(call.url).toBe('https://humanome.xyz/api/llm')
    const serialized = JSON.stringify({ url: call.url, headers: call.options.headers, body: call.options.body })
    expect(serialized).not.toContain('sk-secret-ne-doit-pas-fuiter')
    expect(call.body.provider).toBe('openai')
  })

  it('sérialise system absent en null (contrat proxy M5)', async () => {
    const fetchFn = makeFetch(jsonResponse(proxyPayload))
    const provider = createProvider({ provider: 'google', transport: 'proxy', fetchFn })
    await provider.complete({ model: 'gemini-2.5-flash', prompt: 'p' })
    expect(fetchFn.calls[0].body.system).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Erreurs typées, retry, abort
// ---------------------------------------------------------------------------

describe('erreurs typées et retry', () => {
  it('erreur 400 : ProviderError non retryable, un seul appel', async () => {
    const fetchFn = makeFetch(
      jsonResponse({ error: { message: 'bad request' } }, { status: 400 })
    )
    const provider = createProvider({ provider: 'openai', apiKey: 'k', fetchFn, sleepFn: noSleep })
    const failure = await provider.complete({ model: 'm', prompt: 'p' }).catch((e) => e)
    expect(failure).toBeInstanceOf(ProviderError)
    expect(failure.status).toBe(400)
    expect(failure.retryable).toBe(false)
    expect(failure.provider).toBe('openai')
    expect(failure.message).toContain('bad request')
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })

  it('HTTP 200 au corps non-JSON : ProviderError contextualisée, non retryable', async () => {
    const fetchFn = makeFetch({
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => {
        throw new SyntaxError('Unexpected token < in JSON at position 0')
      }
    })
    const provider = createProvider({ provider: 'openai', apiKey: 'k', fetchFn, sleepFn: noSleep })
    const failure = await provider.complete({ model: 'm', prompt: 'p' }).catch((e) => e)
    expect(failure).toBeInstanceOf(ProviderError)
    expect(failure.status).toBe(200)
    expect(failure.retryable).toBe(false)
    expect(failure.provider).toBe('openai')
    expect(failure.message).toContain('non-JSON')
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })

  it('retry sur 429 en respectant Retry-After, puis succès', async () => {
    const fetchFn = makeFetch(
      jsonResponse({ error: { message: 'rate limited' } }, { status: 429, headers: { 'Retry-After': '2' } }),
      jsonResponse({
        choices: [{ message: { content: 'ok' } }],
        usage: { prompt_tokens: 1, completion_tokens: 1 },
        model: 'm'
      })
    )
    const sleepFn = vi.fn(async () => {})
    const provider = createProvider({ provider: 'openai', apiKey: 'k', fetchFn, sleepFn })
    const result = await provider.complete({ model: 'm', prompt: 'p' })
    expect(result.text).toBe('ok')
    expect(fetchFn).toHaveBeenCalledTimes(2)
    expect(sleepFn).toHaveBeenCalledTimes(1)
    expect(sleepFn.mock.calls[0][0]).toBe(2000) // Retry-After: 2 s respecté tel quel
  })

  it('retry exponentiel borné sur 5xx : 3 essais puis échec typé', async () => {
    const fetchFn = makeFetch(jsonResponse({ error: 'boom' }, { status: 503 }))
    const sleepFn = vi.fn(async () => {})
    const provider = createProvider({
      provider: 'anthropic',
      apiKey: 'k',
      fetchFn,
      sleepFn,
      random: () => 1 // jitter déterministe : délai = backoff plein
    })
    const failure = await provider.complete({ model: 'm', prompt: 'p' }).catch((e) => e)
    expect(failure).toBeInstanceOf(ProviderError)
    expect(failure.status).toBe(503)
    expect(failure.retryable).toBe(true)
    expect(fetchFn).toHaveBeenCalledTimes(3) // 3 essais au total
    expect(sleepFn).toHaveBeenCalledTimes(2) // 2 attentes intermédiaires
    expect(sleepFn.mock.calls[0][0]).toBe(500) // base 500 ms
    expect(sleepFn.mock.calls[1][0]).toBe(1000) // doublé
  })

  it('retry sur erreur réseau (fetch rejeté), puis succès', async () => {
    const fetchFn = makeFetch(
      new TypeError('fetch failed'),
      jsonResponse({
        content: [{ type: 'text', text: 'ok' }],
        usage: { input_tokens: 1, output_tokens: 1 },
        model: 'm'
      })
    )
    const provider = createProvider({ provider: 'anthropic', apiKey: 'k', fetchFn, sleepFn: noSleep })
    const result = await provider.complete({ model: 'm', prompt: 'p' })
    expect(result.text).toBe('ok')
    expect(fetchFn).toHaveBeenCalledTimes(2)
  })

  it('signal déjà annulé : rejette AbortError sans aucun appel réseau', async () => {
    const fetchFn = makeFetch(jsonResponse({}))
    const provider = createProvider({ provider: 'openai', apiKey: 'k', fetchFn })
    const controller = new AbortController()
    controller.abort()
    const failure = await provider
      .complete({ model: 'm', prompt: 'p', signal: controller.signal })
      .catch((e) => e)
    expect(failure.name).toBe('AbortError')
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('abort pendant le backoff : interrompt le retry (pas de 2e appel)', async () => {
    const fetchFn = makeFetch(jsonResponse({ error: 'down' }, { status: 500 }))
    const controller = new AbortController()
    const provider = createProvider({
      provider: 'openai',
      apiKey: 'k',
      fetchFn,
      retryBaseMs: 60000 // backoff long : l'abort arrive pendant l'attente
    })
    const pending = provider.complete({ model: 'm', prompt: 'p', signal: controller.signal })
    const guarded = pending.catch((e) => e)
    await new Promise((resolve) => setTimeout(resolve, 10))
    controller.abort()
    const failure = await guarded
    expect(failure.name).toBe('AbortError')
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })

  it('propage le signal à fetch (annulation en vol)', async () => {
    const fetchFn = makeFetch(jsonResponse({}))
    const provider = createProvider({ provider: 'ollama', fetchFn })
    const controller = new AbortController()
    await provider
      .complete({ model: 'm', prompt: 'p', signal: controller.signal })
      .catch(() => {})
    expect(fetchFn.calls[0].options.signal).toBe(controller.signal)
  })
})

// ---------------------------------------------------------------------------
// Validation de la configuration
// ---------------------------------------------------------------------------

describe('validation createProvider / complete', () => {
  it('liste les six fournisseurs supportés', () => {
    expect(SUPPORTED_PROVIDERS).toEqual([
      'anthropic',
      'openai',
      'google',
      'xai',
      'openrouter',
      'ollama'
    ])
  })

  it('rejette un fournisseur inconnu', () => {
    expect(() => createProvider({ provider: 'mistral-api' })).toThrow(/fournisseur inconnu/)
  })

  it('rejette un transport inconnu', () => {
    expect(() => createProvider({ provider: 'openai', apiKey: 'k', transport: 'websocket' })).toThrow(
      /transport inconnu/
    )
  })

  it('exige une apiKey en direct (sauf ollama)', () => {
    expect(() => createProvider({ provider: 'anthropic' })).toThrow(/apiKey requise/)
    expect(() => createProvider({ provider: 'ollama' })).not.toThrow()
  })

  it('n’exige pas de clé en transport proxy', () => {
    expect(() => createProvider({ provider: 'anthropic', transport: 'proxy' })).not.toThrow()
  })

  it('complete() exige model et prompt', async () => {
    const provider = createProvider({ provider: 'ollama', fetchFn: makeFetch(jsonResponse({})) })
    await expect(provider.complete({ prompt: 'p' })).rejects.toThrow(/"model" est requis/)
    await expect(provider.complete({ model: 'm' })).rejects.toThrow(/"prompt" est requis/)
  })
})
