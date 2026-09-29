// UC-APP-02 — Lancer une cartographie standard : tests UNITAIRES (front).
// Fiche : docs/cas-utilisation/apprenant/UC-APP-02-lancer-cartographie-standard.md
//
// La logique non-UI de l'assistant (web/src/lib/run-launcher.js) et le
// fournisseur « Service humanome » (web/src/lib/demo-llm.js : preuve de
// travail par appel, pot de miel, messages d'erreur) sont appelés
// directement. Le run complet tourne sur l'adaptateur IndexedDB RÉEL du
// moteur (« humanome-runs ») posé sur un IndexedDB factice.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'
import { segmentText } from '@engine/portfolio/segment.js'
import { createIndexedDbStorage } from '@engine/runs/index.js'
import { createMockProvider } from '@engine/providers/mock.js'
import { ProviderError } from '@engine/providers/errors.js'
import referentiel from '../../../../schemas/fixtures/referentiel-respire-v7.json'
import {
  BUILTIN_PACKAGE,
  KEYS_STORAGE_KEY,
  PROVIDERS,
  RUN_MAX_TOKENS,
  SERVICE_ESTIMATION_MODEL,
  buildEstimate,
  computeDayGroups,
  createProviderBundle,
  executeRun,
  fetchKeyFromServer,
  fetchPromptPackages,
  makeRunId,
  readLocalKeys,
  setLocalKey,
  syncKeyToServer,
} from '../../../src/lib/run-launcher.js'
import {
  DEMO_MODEL,
  UPSTREAM_RETRY_DELAY_MS,
  createDemoProvider,
  describeDemoError,
} from '../../../src/lib/demo-llm.js'
import { ApiError } from '../../../src/api/client.js'
import { createFakeIndexedDb } from '../support/appl-fake-indexeddb.js'
import { bodyOf, jsonResponse, routedFetch } from '../support/appl-http.js'
import { fixtureAnswer, portfolioText } from '../support/appl-llm.js'

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

/** Bits nuls en tête du sha256 (hex) de `challenge:nonce` — calcul indépendant de pow.js. */
function leadingZeroBitsOf(challenge, nonce) {
  const digest = createHash('sha256').update(`${challenge}:${nonce}`, 'utf8').digest()
  let bits = 0
  for (const byte of digest) {
    if (byte === 0) {
      bits += 8
      continue
    }
    bits += Math.clz32(byte) - 24
    break
  }
  return bits
}

function memoryKeyStorage(initial = {}) {
  const map = new Map(Object.entries(initial))
  return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => map.set(k, v), map }
}

describe('UC-APP-02 — étape 2 : portfolio et journées', () => {
  it('UC-APP-02-U12 — computeDayGroups sur un vrai découpage : préambule non daté ignoré, journées triées, textes d’une même date concaténés', () => {
    const texte = `Notes en vrac sans date.\n\n${portfolioText(['2026-01-07', '2026-01-05'])}`
    const segments = segmentText(texte, { today: '2026-07-12' })
    expect(segments[0].date).toBeNull() // préambule non daté

    const groups = computeDayGroups(segments)
    expect(groups.map((g) => g.iso)).toEqual(['2026-01-05', '2026-01-07'])
    expect(groups[0].texte).toContain('Journée du 2026-01-05')

    // Deux segments de même date (après ajustement manuel) : un seul groupe.
    const a = 'Matin : atelier.'
    const b = 'Soir : bilan.'
    const sameDay = computeDayGroups([
      { date: '2026-01-05', texte: a, debut: 0, fin: a.length },
      { date: null, texte: 'non daté', debut: a.length, fin: a.length + 8 },
      { date: '2026-01-05', texte: b, debut: a.length + 8, fin: a.length + 8 + b.length },
    ])
    expect(sameDay).toEqual([{ iso: '2026-01-05', texte: `${a}\n\n${b}` }])
  })

  it('UC-APP-02-U13 — makeRunId : même portfolio + même version de prompt = même run (clé de reprise)', () => {
    expect(makeRunId('p-1', BUILTIN_PACKAGE)).toBe('p-1::aurora-v3-reconstruit@1.0.0')
    expect(makeRunId('p-1', { id: 'aurora-lab', version: '2.0.0' })).toBe('p-1::aurora-lab@2.0.0')
    expect(makeRunId('p-1', BUILTIN_PACKAGE)).toBe(makeRunId('p-1', { ...BUILTIN_PACKAGE }))
  })
})

describe('UC-APP-02 — étape 3 : versions de prompt', () => {
  it('UC-APP-02-U14 — ordre des appels (default puis liste), paquet embarqué en tête et jamais dupliqué', async () => {
    const apiFetchFn = vi.fn(async (path) =>
      path === 'prompt-packages/default'
        ? { id: 'aurora-lab', version: '2.0.0' }
        : [
            { id: 'aurora-v3-reconstruit', version: '1.0.0', description: 'copie serveur' },
            { id: 'aurora-lab', version: '2.0.0' },
            { id: 'sans-version' },
          ],
    )
    const { packages, origin, defaut } = await fetchPromptPackages({ apiFetchFn })

    expect(apiFetchFn.mock.calls.map(([path]) => path)).toEqual(['prompt-packages/default', 'prompt-packages'])
    expect(origin).toBe('api')
    expect(defaut).toEqual({ id: 'aurora-lab', version: '2.0.0' })
    expect(packages.map((p) => `${p.id}@${p.version}`)).toEqual([
      'aurora-v3-reconstruit@1.0.0',
      'aurora-lab@2.0.0',
    ])
    expect(packages[0]).toBe(BUILTIN_PACKAGE)
    expect(packages[1].defaut).toBe(true)
  })
})

describe('UC-APP-02 — étape 4 : fournisseur et clés', () => {
  it('UC-APP-02-U15 — createProviderBundle : service humanome (modèle imposé), clé requise sauf Ollama', () => {
    const humanome = createProviderBundle({ mode: 'humanome', fetchFn: vi.fn() })
    expect(humanome).toMatchObject({ model: DEMO_MODEL, maxTokens: 8192, estimationModel: SERVICE_ESTIMATION_MODEL })
    expect(typeof humanome.prime).toBe('function')

    const cle = createProviderBundle({ mode: 'cle', provider: 'openai', apiKey: 'sk-x', fetchFn: vi.fn() })
    expect(cle).toMatchObject({ model: 'gpt-4o-mini', maxTokens: RUN_MAX_TOKENS, prime: null })
    expect(cle.provider.transport).toBe('direct')

    expect(() => createProviderBundle({ mode: 'cle', provider: 'google' })).toThrow(
      'Une clé API Google (Gemini) est requise pour lancer ce run.',
    )
    expect(() => createProviderBundle({ mode: 'cle', provider: 'inconnu', apiKey: 'k' })).toThrow(
      'Fournisseur inconnu : « inconnu ».',
    )
    const ollama = createProviderBundle({ mode: 'cle', provider: 'ollama', fetchFn: vi.fn() })
    expect(ollama.model).toBe('llama3.1')
    expect(PROVIDERS.filter((p) => !p.requiresKey).map((p) => p.id)).toEqual(['ollama'])
  })

  it('UC-APP-02-U16 — clés locales (localStorage « humanome-keys ») : mémoriser, effacer, JSON corrompu toléré', () => {
    const storage = memoryKeyStorage({ [KEYS_STORAGE_KEY]: '{corrompu' })
    expect(readLocalKeys(storage)).toEqual({})

    setLocalKey('anthropic', 'sk-ant-1', storage)
    setLocalKey('openai', 'sk-oa-1', storage)
    setLocalKey('anthropic', '', storage)
    expect(JSON.parse(storage.map.get(KEYS_STORAGE_KEY))).toEqual({ openai: 'sk-oa-1' })
  })

  it('UC-APP-02-U17 — synchronisation opt-in : PUT api/keys ; récupération GET api/keys/{fournisseur} ; clé absente (404 du serveur)', async () => {
    const apiFetchFn = vi.fn(async (path) => {
      if (path === 'keys/openai') {
        // Réponse RÉELLE de l'API pour une clé absente (api/src/routes/keys.php).
        throw new ApiError('Aucune clé enregistrée pour ce fournisseur', 404)
      }
      return path === 'keys/google' ? { apiKey: '' } : { apiKey: 'sk-ant-2' }
    })
    await syncKeyToServer('anthropic', 'sk-ant-2', { apiFetchFn })
    expect(apiFetchFn).toHaveBeenCalledWith('keys', {
      method: 'PUT',
      body: { provider: 'anthropic', apiKey: 'sk-ant-2' },
    })
    await expect(fetchKeyFromServer('anthropic', { apiFetchFn })).resolves.toBe('sk-ant-2')
    // Clé absente : le message du SERVEUR est propagé tel quel.
    await expect(fetchKeyFromServer('openai', { apiFetchFn })).rejects.toThrow(
      'Aucune clé enregistrée pour ce fournisseur',
    )
    // Garde défensive (réponse 200 sans clé, jamais produite par l'API actuelle).
    await expect(fetchKeyFromServer('google', { apiFetchFn })).rejects.toThrow(
      'Aucune clé enregistrée sur le serveur pour ce fournisseur.',
    )
  })

  it('UC-APP-02-U18 — service humanome : un défi par appel, résolu puis joint au POST avec le pot de miel vide', async () => {
    let n = 0
    const fetchFn = routedFetch([
      ['api/llm/challenge', () => jsonResponse(200, { challenge: `v1.c${++n}`, difficultyBits: 4, expiresAt: null })],
      ['api/llm', (url, init) => jsonResponse(200, { text: fixtureAnswer(JSON.parse(init.body).prompt), usage: { inputTokens: 1, outputTokens: 1 }, model: 'mock' })],
    ])
    const phases = []
    const { provider, prime } = createDemoProvider({ fetchFn, onPhase: (p) => phases.push(p) })

    await prime()
    await provider.complete({ model: DEMO_MODEL, prompt: '# Pôle 1 — (2026-01-05)' })
    await provider.complete({ model: DEMO_MODEL, prompt: '# Pôle 2 — (2026-01-05)' })

    const posts = fetchFn.calls.filter((c) => c.url === 'api/llm').map(bodyOf)
    expect(posts.map((b) => b.challenge)).toEqual(['v1.c1', 'v1.c2'])
    for (const body of posts) {
      expect(body.website).toBe('')
      expect(typeof body.nonce).toBe('string')
      // Le nonce satisfait VRAIMENT la difficulté (sha256 recalculé ici,
      // indépendamment de pow.js) : sinon le serveur répondrait pow_invalid.
      expect(leadingZeroBitsOf(body.challenge, body.nonce)).toBeGreaterThanOrEqual(4)
      expect(body).not.toHaveProperty('apiKey')
    }
    expect(phases).toEqual(['challenge', 'pow', 'llm', 'challenge', 'pow', 'llm'])
  })

  it('UC-APP-02-U19 — describeDemoError : 429 → attente en minutes, 503 → service épuisé, autre → détail technique', () => {
    const quota = new ProviderError('HTTP 429', { status: 429, retryable: true, provider: 'demo' })
    quota.retryAfterMs = 90_000
    expect(describeDemoError(quota)).toEqual({
      kind: 'quota',
      canRetry: true,
      message: 'La démo est très demandée en ce moment : réessayez dans 2 minutes.',
    })
    const wrapped = new Error('extractDay : pôle 1 (2026-01-05) — HTTP 503', {
      cause: new ProviderError('HTTP 503', { status: 503, retryable: false, provider: 'demo' }),
    })
    expect(describeDemoError(wrapped)).toMatchObject({ kind: 'unavailable', canRetry: false })
    expect(describeDemoError(new Error('JSON invalide')).message).toContain('détail technique : JSON invalide')
  })
})

describe('UC-APP-02 — étapes 5 et 6 : estimation et exécution', () => {
  it('UC-APP-02-U20 — buildEstimate : service humanome estimé sur le modèle de référence, modèle hors table → coût inconnu', () => {
    const dayGroups = [
      { iso: '2026-01-05', texte: 'a'.repeat(1000) },
      { iso: '2026-01-06', texte: 'b'.repeat(3000) },
    ]
    const service = buildEstimate({ dayGroups, referentiel, model: SERVICE_ESTIMATION_MODEL })
    expect(service).toMatchObject({ days: 2, avgDayChars: 2000, totalCalls: 2 * 8 + 69, model: 'claude-sonnet-5' })
    expect(service.costUsd).toBeGreaterThan(0)

    const maison = buildEstimate({ dayGroups, referentiel, model: 'modele-maison' })
    expect(maison.costUsd).toBeNull()
    expect(maison.tokensIn).toBe(service.tokensIn)

    const banc = buildEstimate({ dayGroups, referentiel, model: SERVICE_ESTIMATION_MODEL, callsPerDay: 2, mergeCalls: 0 })
    expect(banc.totalCalls).toBe(4)
  })

  it('UC-APP-02-U21 — executeRun sur IndexedDB « humanome-runs » : checkpoints persistés, reprise après rechargement', async () => {
    const idb = createFakeIndexedDb()
    vi.stubGlobal('indexedDB', idb.factory)
    vi.stubGlobal('IDBKeyRange', { bound: (lower, upper) => ({ includes: (k) => k >= lower && k <= upper }) })
    const runId = makeRunId('p-maya', BUILTIN_PACKAGE)
    const dayGroups = computeDayGroups(segmentText(portfolioText(), { today: '2026-07-12' }))

    const controller = new AbortController()
    const first = await executeRun({
      runId,
      dayGroups,
      referentiel,
      provider: createMockProvider({ responses: ({ prompt }) => fixtureAnswer(prompt) }),
      model: 'mock',
      storage: createIndexedDbStorage(),
      signal: controller.signal,
      onCall: ({ iso, done, total }) => iso === '2026-01-05' && done === total && controller.abort(),
    })
    expect(first).toMatchObject({ aborted: true, document: null, resumedFrom: 0 })
    expect(idb.entries('humanome-runs', 'kv').map(([k]) => k)).toContain(`run:${runId}:checkpoint:2026-01-05`)

    const provider = createMockProvider({ responses: ({ prompt }) => fixtureAnswer(prompt) })
    const resumed = []
    const second = await executeRun({
      runId,
      dayGroups,
      referentiel,
      provider,
      model: 'mock',
      storage: createIndexedDbStorage(), // nouvel onglet
      onResume: (before) => resumed.push(before),
      now: () => '2026-07-12T10:00:00.000Z',
    })
    expect(resumed).toEqual([{ done: 1, total: 3 }])
    expect(provider.callCount).toBe(16)
    expect(second.usage.mesures).toBe(16) // compteurs de CETTE session seulement
    expect(second.mergeError).toBeNull()
    expect(second.document.kind).toBe('cartographie-merge')
    expect(second.dayDocuments.map((d) => d.date)).toEqual(['2026-01-05', '2026-01-06', '2026-01-07'])
    // Étape 7 : résumés LOCAUX à la place des récits narratifs (buildLocalNarratives).
    expect(second.document.source.protocole).toContain('narratifs de fusion différés (P10)')
    const feedbacks = second.document.domains.flatMap((d) => d.competences.map((c) => c.feedback))
    expect(feedbacks.length).toBeGreaterThan(0)
    expect(feedbacks.every((html) => html.includes('Résumé local.'))).toBe(true)
  })
})

describe('UC-APP-02 — Service humanome : politique de reprise (RG5)', () => {
  const PROMPT = { model: DEMO_MODEL, prompt: '# Pôle 1 — (2026-01-05)' }
  const OK = () => jsonResponse(200, { text: '{}', usage: { inputTokens: 1, outputTokens: 1 }, model: 'mock' })

  /** Défis de difficulté 0 ; `answers` = réponses successives du POST (Error = exception réseau). */
  function demoNetwork(answers) {
    let n = 0
    const queue = [...answers]
    return routedFetch([
      ['api/llm/challenge', () => jsonResponse(200, { challenge: `v1.c${++n}`, difficultyBits: 0, expiresAt: null })],
      [
        'api/llm',
        () => {
          const next = queue.shift()
          if (next instanceof Error) throw next
          return next()
        },
      ],
    ])
  }
  const count = (fetchFn, url) => fetchFn.calls.filter((c) => c.url === url).length

  it('UC-APP-02-U26 — aucune reprise automatique sur quota (429) ni sur service épuisé (503) : 1 défi, 1 POST', async () => {
    const cases = [
      [429, 'Quota horaire atteint, réessayez plus tard.', { 'Retry-After': '30' }, 'quota'],
      [503, 'Démo épuisée pour aujourd’hui, revenez demain.', {}, 'unavailable'],
    ]
    for (const [status, error, headers, kind] of cases) {
      const fetchFn = demoNetwork([() => jsonResponse(status, { error }, headers)])
      const { provider } = createDemoProvider({ fetchFn })

      const failure = await provider.complete(PROMPT).then(
        () => null,
        (err) => err,
      )

      expect(failure).not.toBeNull()
      expect(describeDemoError(failure).kind).toBe(kind)
      expect(count(fetchFn, 'api/llm')).toBe(1)
      expect(count(fetchFn, 'api/llm/challenge')).toBe(1)
    }
  })

  it('UC-APP-02-U27 — une seule reprise, après 2,5 s et avec un défi NEUF, sur 5xx transitoire, erreur réseau ou défi refusé', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] })
    const cases = [
      ['502', () => jsonResponse(502, { error: 'Erreur du fournisseur LLM : passerelle' })],
      ['réseau', new TypeError('Failed to fetch')],
      ['pow_reused', () => jsonResponse(429, { error: 'Défi déjà utilisé : demandez un nouveau défi.', code: 'pow_reused' }, { 'Retry-After': '1' })],
      ['pow_expired', () => jsonResponse(400, { error: 'Défi expiré : demandez un nouveau défi.', code: 'pow_expired' })],
    ]
    for (const [label, first] of cases) {
      const fetchFn = demoNetwork([first, OK])
      const { provider } = createDemoProvider({ fetchFn })

      const pending = provider.complete(PROMPT)
      await vi.advanceTimersByTimeAsync(UPSTREAM_RETRY_DELAY_MS - 1)
      expect(count(fetchFn, 'api/llm'), label).toBe(1) // pas encore de reprise
      await vi.advanceTimersByTimeAsync(1)
      await expect(pending).resolves.toMatchObject({ text: '{}' })

      const posts = fetchFn.calls.filter((c) => c.url === 'api/llm').map(bodyOf)
      expect(posts.map((b) => b.challenge), label).toEqual(['v1.c1', 'v1.c2'])
    }

    // Une seule reprise : deux échecs transitoires de suite => erreur propagée.
    const twice = demoNetwork([
      () => jsonResponse(502, { error: 'passerelle' }),
      () => jsonResponse(502, { error: 'passerelle' }),
      OK,
    ])
    const { provider } = createDemoProvider({ fetchFn: twice })
    const pending = provider.complete(PROMPT).then(
      () => null,
      (err) => err,
    )
    await vi.advanceTimersByTimeAsync(UPSTREAM_RETRY_DELAY_MS)
    expect(await pending).not.toBeNull()
    expect(count(twice, 'api/llm')).toBe(2)
  })
})
