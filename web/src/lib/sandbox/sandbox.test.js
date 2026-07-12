// Sandbox promptologue (P10.3) : protocole postMessage avec un FAUX hôte —
// le vrai test d'isolation navigateur (fetch/localStorage/parent bloqués)
// arrive en phase e2e (docs/securite-prompts.md §7).
import { afterEach, describe, expect, it, vi } from 'vitest'
import jourFixture from '../../../../schemas/fixtures/cartographie-jour-2026-01-05.json'
import pkgFixture from '../../../../schemas/fixtures/prompt-package-exemple.json'
import referentielFixture from '../../../../schemas/fixtures/referentiel-respire-v7.json'
import {
  MAX_LLM_CALLS_PER_RUN,
  SANDBOX_CSP,
  buildPromptsMap,
  buildSrcdoc,
  buildWorkerSource,
} from './protocol.js'
import { createIframeHost, runPackageInSandbox } from './sandbox.js'
import { usesEngineOrchestration } from './index.js'

/** Faux hôte : enregistre les envois, laisse le test émettre des messages. */
function createFakeHost() {
  const sent = []
  let handler = () => {}
  const host = {
    sent,
    started: false,
    terminated: false,
    onMessage(cb) {
      handler = cb
    },
    start() {
      host.started = true
    },
    send(msg) {
      sent.push(msg)
    },
    terminate() {
      host.terminated = true
    },
    emit(msg) {
      handler(msg)
    },
  }
  return host
}

const fakeProvider = () => ({
  complete: vi.fn(async ({ prompt }) => ({ text: `echo:${prompt}` })),
})

function launch(overrides = {}) {
  const host = createFakeHost()
  const provider = overrides.provider ?? fakeProvider()
  const promise = runPackageInSandbox({
    pkg: pkgFixture,
    dayText: 'Texte de la journée.',
    date: '2026-01-05',
    referentiel: referentielFixture,
    provider,
    model: 'test-model',
    maxTokens: 1024,
    hostFactory: () => host,
    ...overrides.params,
  })
  // Évite un unhandled rejection quand le test n'attend la promesse que plus tard.
  promise.catch(() => {})
  return { host, provider, promise }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('protocol.js — constructeurs de sources', () => {
  it('buildPromptsMap indexe par rôle et par role/nom', () => {
    const map = buildPromptsMap(pkgFixture.prompts)
    expect(map['extraction-pole']).toContain('Greffier')
    expect(map['kairos']).toContain('kairos')
    expect(map["extraction-pole/Extraction des traces d'un pôle"]).toBe(map['extraction-pole'])
  })

  it('buildWorkerSource embarque le code par JSON.stringify (jamais brut)', () => {
    const source = buildWorkerSource(pkgFixture)
    expect(source).toContain(JSON.stringify(pkgFixture.code.orchestration))
    expect(source).toContain(JSON.stringify(pkgFixture.code.entrypoint))
    // L'interface du worker : les 3 types de sortie du protocole.
    expect(source).toContain("type: 'llm'")
    expect(source).toContain("type: 'result'")
    expect(source).toContain("type: 'error'")
  })

  it('buildWorkerSource refuse un paquet sans code', () => {
    expect(() => buildWorkerSource({ code: { orchestration: '', entrypoint: 'run' } })).toThrow(
      /orchestration/,
    )
    expect(() => buildWorkerSource({ code: { orchestration: 'x', entrypoint: '' } })).toThrow(
      /entrypoint/,
    )
  })

  it('le srcdoc est FIGÉ, porte la CSP sandbox et ne contient aucun code de paquet', () => {
    const srcdoc = buildSrcdoc()
    expect(srcdoc).toContain(`content="${SANDBOX_CSP}"`)
    expect(SANDBOX_CSP).toBe(
      "default-src 'none'; script-src 'unsafe-inline' blob:; worker-src blob:",
    )
    // Chaîne identique à chaque appel (hashable pour la CSP de production) :
    expect(buildSrcdoc()).toBe(srcdoc)
    // Le code du paquet ne transite jamais par le HTML (anti-évasion </script>).
    expect(srcdoc).not.toContain('Greffier')
  })
})

describe('runPackageInSandbox — protocole complet (faux hôte)', () => {
  it('boot -> init(workerSource), ready -> run{dayText, date, referentiel}', async () => {
    const { host } = launch()
    expect(host.started).toBe(true)
    host.emit({ type: 'boot' })
    expect(host.sent[0].type).toBe('init')
    expect(host.sent[0].workerSource).toContain('PKG_CODE')
    host.emit({ type: 'ready' })
    expect(host.sent[1]).toEqual({
      type: 'run',
      dayText: 'Texte de la journée.',
      date: '2026-01-05',
      referentiel: referentielFixture,
    })
  })

  it("route les demandes 'llm' vers le provider et renvoie llm-ok", async () => {
    const { host, provider, promise } = launch()
    host.emit({ type: 'boot' })
    host.emit({ type: 'ready' })
    host.emit({ type: 'llm', id: 1, prompt: 'Bonjour' })
    await vi.waitFor(() => {
      expect(host.sent.some((m) => m.type === 'llm-ok')).toBe(true)
    })
    expect(provider.complete).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'test-model', prompt: 'Bonjour', maxTokens: 1024 }),
    )
    expect(host.sent.find((m) => m.type === 'llm-ok')).toEqual({
      type: 'llm-ok',
      id: 1,
      text: 'echo:Bonjour',
    })
    host.emit({ type: 'result', document: jourFixture })
    const result = await promise
    expect(result.document).toBe(jourFixture)
    expect(result.llmCalls).toBe(1)
    expect(host.terminated).toBe(true)
  })

  it('un échec provider renvoie llm-error au worker sans tuer le run', async () => {
    const provider = { complete: vi.fn(async () => { throw new Error('429 quota fournisseur') }) }
    const { host, promise } = launch({ provider })
    host.emit({ type: 'boot' })
    host.emit({ type: 'ready' })
    host.emit({ type: 'llm', id: 4, prompt: 'x' })
    await vi.waitFor(() => {
      expect(host.sent.some((m) => m.type === 'llm-error')).toBe(true)
    })
    expect(host.sent.find((m) => m.type === 'llm-error')).toEqual({
      type: 'llm-error',
      id: 4,
      message: '429 quota fournisseur',
    })
    expect(host.terminated).toBe(false) // le paquet peut dégrader et continuer
    host.emit({ type: 'result', document: jourFixture })
    await expect(promise).resolves.toBeTruthy()
  })

  it(`applique le quota d'appels LLM (défaut ${MAX_LLM_CALLS_PER_RUN}, ici 2) puis interrompt`, async () => {
    const { host, promise } = launch({ params: { maxLlmCalls: 2 } })
    host.emit({ type: 'boot' })
    host.emit({ type: 'ready' })
    host.emit({ type: 'llm', id: 1, prompt: 'a' })
    host.emit({ type: 'llm', id: 2, prompt: 'b' })
    host.emit({ type: 'llm', id: 3, prompt: 'c' })
    await expect(promise).rejects.toThrow(/quota d'appels LLM dépassé \(2 max/)
    expect(host.sent.find((m) => m.type === 'llm-error' && m.id === 3)).toBeTruthy()
    expect(host.terminated).toBe(true)
  })

  it('timeout global : terminate + rejet', async () => {
    vi.useFakeTimers()
    const { host, promise } = launch({ params: { timeoutMs: 60000 } })
    host.emit({ type: 'boot' })
    vi.advanceTimersByTime(60001)
    await expect(promise).rejects.toThrow(/délai global/)
    expect(host.terminated).toBe(true)
  })

  it('signal : une annulation termine la sandbox', async () => {
    const controller = new AbortController()
    const { host, promise } = launch({ params: { signal: controller.signal } })
    host.emit({ type: 'boot' })
    controller.abort()
    await expect(promise).rejects.toThrow(/annulée/)
    expect(host.terminated).toBe(true)
  })

  it('valide le document final au schéma (document invalide -> rejet)', async () => {
    const { host, promise } = launch()
    host.emit({ type: 'result', document: { kind: 'cartographie-jour', date: 'x' } })
    await expect(promise).rejects.toThrow(/invalide au schéma cartographie-jour/)
    expect(host.terminated).toBe(true)
  })

  it('refuse un document d’un autre kind que celui attendu', async () => {
    const { host, promise } = launch()
    host.emit({ type: 'result', document: pkgFixture })
    await expect(promise).rejects.toThrow(/« prompt-package » au lieu de « cartographie-jour »/)
  })

  it("propage l'erreur du paquet ({type:'error'})", async () => {
    const { host, promise } = launch()
    host.emit({ type: 'error', message: 'entrypoint introuvable' })
    await expect(promise).rejects.toThrow(/Sandbox : entrypoint introuvable/)
  })

  it('ignore les messages hors protocole et les prompts non textuels', async () => {
    const { host, promise } = launch()
    host.emit({ type: 'boot' })
    host.emit({ type: 'exfiltrate', data: 'x' })
    host.emit(null)
    host.emit({ type: 'llm', id: 9, prompt: 42 })
    await vi.waitFor(() => {
      expect(host.sent.some((m) => m.type === 'llm-error' && m.id === 9)).toBe(true)
    })
    host.emit({ type: 'result', document: jourFixture })
    const result = await promise
    // Le prompt refusé compte dans le quota (anti-spam) mais n'appelle pas le provider.
    expect(result.llmCalls).toBe(1)
  })
})

describe('createIframeHost — attributs de la pièce de sécurité', () => {
  it('iframe sandbox="allow-scripts" (origine opaque), srcdoc avec CSP, terminate retire tout', () => {
    const host = createIframeHost()
    host.onMessage(() => {})
    host.start()
    const iframe = document.querySelector('iframe[title="Sandbox prompt-package"]')
    expect(iframe).toBeTruthy()
    expect(iframe.getAttribute('sandbox')).toBe('allow-scripts')
    expect(iframe.getAttribute('srcdoc')).toContain('Content-Security-Policy')
    host.terminate()
    expect(document.querySelector('iframe[title="Sandbox prompt-package"]')).toBeNull()
  })
})

describe('usesEngineOrchestration — paquet moteur vs code personnalisé', () => {
  it('reconnaît le paquet embarqué et le marqueur engine://', () => {
    expect(usesEngineOrchestration({ builtin: true })).toBe(true)
    expect(
      usesEngineOrchestration({
        code: { orchestration: '// engine://humanome-engine@0.1.0\nexport const engineRef = 1' },
      }),
    ).toBe(true)
    expect(usesEngineOrchestration(pkgFixture)).toBe(false)
    expect(usesEngineOrchestration(null)).toBe(false)
  })
})
