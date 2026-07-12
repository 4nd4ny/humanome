import { describe, it, expect, vi } from 'vitest'
import { createMockProvider } from './mock.js'

describe('createMockProvider', () => {
  it('expose la même interface que createProvider ({complete, name})', async () => {
    const mock = createMockProvider()
    expect(mock.name).toBe('mock')
    const result = await mock.complete({ model: 'mock-model', prompt: 'Bonjour' })
    expect(result.model).toBe('mock-model')
    expect(typeof result.text).toBe('string')
    expect(result.usage.inputTokens).toBeGreaterThan(0)
    expect(result.usage.outputTokens).toBeGreaterThan(0)
  })

  it('est déterministe : mêmes entrées → mêmes sorties', async () => {
    const a = await createMockProvider().complete({ model: 'm', prompt: 'texte' })
    const b = await createMockProvider().complete({ model: 'm', prompt: 'texte' })
    expect(a).toEqual(b)
  })

  it('réponses par table (clé = prompt, * en repli)', async () => {
    const mock = createMockProvider({
      responses: { 'Pôle 1 ?': '{"poleNum": 1}', '*': 'défaut' }
    })
    expect((await mock.complete({ model: 'm', prompt: 'Pôle 1 ?' })).text).toBe('{"poleNum": 1}')
    expect((await mock.complete({ model: 'm', prompt: 'autre' })).text).toBe('défaut')
  })

  it('réponses par fonction (params + index d’appel)', async () => {
    const mock = createMockProvider({
      responses: ({ model }, i) => `${model}#${i}`
    })
    expect((await mock.complete({ model: 'm', prompt: 'p' })).text).toBe('m#0')
    expect((await mock.complete({ model: 'm', prompt: 'p' })).text).toBe('m#1')
  })

  it('réponses par tableau (la dernière se répète)', async () => {
    const mock = createMockProvider({ responses: ['un', 'deux'] })
    expect((await mock.complete({ model: 'm', prompt: 'p' })).text).toBe('un')
    expect((await mock.complete({ model: 'm', prompt: 'p' })).text).toBe('deux')
    expect((await mock.complete({ model: 'm', prompt: 'p' })).text).toBe('deux')
  })

  it('compte et enregistre les appels, reset() remet à zéro', async () => {
    const mock = createMockProvider()
    await mock.complete({ model: 'm', prompt: 'a', maxTokens: 10 })
    await mock.complete({ model: 'm', prompt: 'b', system: 's' })
    expect(mock.callCount).toBe(2)
    expect(mock.calls[0]).toMatchObject({ prompt: 'a', maxTokens: 10 })
    expect(mock.calls[1]).toMatchObject({ prompt: 'b', system: 's' })
    mock.reset()
    expect(mock.callCount).toBe(0)
    expect(mock.calls).toHaveLength(0)
  })

  it('latence simulée optionnelle (et annulable via signal)', async () => {
    // Fake timers : mesurer 1 ms à l'horloge murale est non déterministe
    // (setTimeout peut se résoudre dans le même tick de Date.now — flake
    // constatée sous charge CPU pendant l'intégration M6).
    vi.useFakeTimers()
    try {
      const mock = createMockProvider({ latencyMs: 50 })
      let resolved = false
      const withLatency = mock.complete({ model: 'm', prompt: 'p' }).then((r) => {
        resolved = true
        return r
      })
      await vi.advanceTimersByTimeAsync(49)
      expect(resolved).toBe(false)
      await vi.advanceTimersByTimeAsync(1)
      await withLatency
      expect(resolved).toBe(true)
    } finally {
      vi.useRealTimers()
    }

    const slow = createMockProvider({ latencyMs: 60000 })
    const controller = new AbortController()
    const pending = slow
      .complete({ model: 'm', prompt: 'p', signal: controller.signal })
      .catch((e) => e)
    controller.abort()
    expect((await pending).name).toBe('AbortError')
  })

  it('usage fixe injectable', async () => {
    const mock = createMockProvider({ usage: { inputTokens: 111, outputTokens: 22 } })
    const result = await mock.complete({ model: 'm', prompt: 'p' })
    expect(result.usage).toEqual({ inputTokens: 111, outputTokens: 22 })
  })

  it('valide model et prompt comme les vrais providers', async () => {
    const mock = createMockProvider()
    await expect(mock.complete({ prompt: 'p' })).rejects.toThrow(/"model" est requis/)
    await expect(mock.complete({ model: 'm' })).rejects.toThrow(/"prompt" est requis/)
  })
})
