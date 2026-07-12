// Machine à états de run : run mock complet, interruption/reprise (AbortSignal),
// échec d'une journée + retry, cohérence du journal.

import { describe, it, expect } from 'vitest'
import { createRun } from './run.js'
import { createMemoryStorage } from './memory.js'

const DAYS = [
  { iso: '2025-01-01', getText: async () => 'texte du 1er janvier' },
  { iso: '2025-01-02', getText: async () => 'texte du 2 janvier' },
  { iso: '2025-01-03', getText: async () => 'texte du 3 janvier' }
]

/** processDay mock : document jour minimal déterministe + compteur d'appels. */
function mockProcessDay ({ failOn = [], onDay = null } = {}) {
  const calls = []
  const processDay = async (day, ctx) => {
    calls.push(day.iso)
    const text = await day.getText()
    if (failOn.includes(day.iso)) throw new Error(`LLM en erreur sur ${day.iso}`)
    ctx.reportUsage({ model: 'mock-1', tokensIn: text.length, tokensOut: 10, costEstimate: 0.001 })
    if (onDay) await onDay(day, ctx)
    return { kind: 'cartographie-jour', date: day.iso, poles: [], kairos: null }
  }
  return { processDay, calls }
}

/** merge mock injecté (l'oracle de mergeDays réel est testé dans pipeline/merge.test.js). */
const mockMerge = (dayDocs) => ({ merged: true, nb: dayDocs.length, dates: dayDocs.map((d) => d.date) })

describe('createRun — run mock complet (3 jours)', () => {
  it('traite chaque jour, checkpointe, merge et produit le document final via le callback', async () => {
    const storage = createMemoryStorage()
    const { processDay, calls } = mockProcessDay()
    const validated = []

    const run = createRun({
      runId: 'run-complet',
      days: DAYS,
      processDay,
      storage,
      validateDay: async (document) => { validated.push(document.date) },
      merge: mockMerge,
      finalize: (merged, { runId, dayDocs }) => ({ kind: 'cartographie-merge', runId, ...merged, docs: dayDocs.length })
    })

    const result = await run.start()

    expect(calls).toEqual(['2025-01-01', '2025-01-02', '2025-01-03'])
    expect(validated).toEqual(['2025-01-01', '2025-01-02', '2025-01-03'])
    expect(result.aborted).toBe(false)
    expect(result.status).toEqual({ total: 3, done: 3, remaining: 0, failed: [] })
    expect(result.document).toEqual({
      kind: 'cartographie-merge',
      runId: 'run-complet',
      merged: true,
      nb: 3,
      dates: ['2025-01-01', '2025-01-02', '2025-01-03'],
      docs: 3
    })

    // Checkpoints persistés { runId, iso, document, completedAt }.
    const checkpoint = await storage.get('run:run-complet:checkpoint:2025-01-02')
    expect(checkpoint.runId).toBe('run-complet')
    expect(checkpoint.iso).toBe('2025-01-02')
    expect(checkpoint.document.date).toBe('2025-01-02')
    expect(typeof checkpoint.completedAt).toBe('string')

    // Journal cohérent, avec les usages remontés par ctx.reportUsage.
    const entries = await run.journal.entries()
    expect(entries.map((e) => e.type)).toEqual([
      'run_started',
      'day_started', 'day_completed',
      'day_started', 'day_completed',
      'day_started', 'day_completed',
      'run_completed'
    ])
    const completed = entries.find((e) => e.type === 'day_completed' && e.iso === '2025-01-01')
    expect(completed).toMatchObject({ model: 'mock-1', tokensOut: 10, costEstimate: 0.001 })
    expect(entries.every((e) => typeof e.ts === 'string')).toBe(true)
  })
})

describe('createRun — interruption (AbortSignal) puis reprise', () => {
  it('s’arrête proprement entre deux jours puis reprend au jour 3 uniquement', async () => {
    const storage = createMemoryStorage()
    const controller = new AbortController()

    // Premier run : abort déclenché pendant le jour 2 → le jour 2 se termine
    // et se checkpointe, le jour 3 n'est jamais démarré.
    const first = mockProcessDay({
      onDay: (day) => { if (day.iso === '2025-01-02') controller.abort() }
    })
    const run1 = createRun({ runId: 'run-abort', days: DAYS, processDay: first.processDay, storage, merge: mockMerge })
    const r1 = await run1.start({ signal: controller.signal })

    expect(first.calls).toEqual(['2025-01-01', '2025-01-02'])
    expect(r1.aborted).toBe(true)
    expect(r1.document).toBeNull()
    expect(r1.status).toEqual({ total: 3, done: 2, remaining: 1, failed: [] })

    // NOUVEAU createRun, même runId + même stockage (= rechargement d'onglet) :
    // reprend au jour 3 uniquement — le compteur d'appels le prouve.
    const second = mockProcessDay()
    const run2 = createRun({ runId: 'run-abort', days: DAYS, processDay: second.processDay, storage, merge: mockMerge })
    const r2 = await run2.start()

    expect(second.calls).toEqual(['2025-01-03'])
    expect(r2.aborted).toBe(false)
    expect(r2.status).toEqual({ total: 3, done: 3, remaining: 0, failed: [] })
    expect(r2.document).toEqual({ merged: true, nb: 3, dates: ['2025-01-01', '2025-01-02', '2025-01-03'] })

    // Journal : run_started puis run_resumed, aucune ré-exécution des jours 1-2.
    const types = (await run2.journal.entries()).map((e) => e.type)
    expect(types).toEqual([
      'run_started',
      'day_started', 'day_completed',
      'day_started', 'day_completed',
      'run_resumed',
      'day_started', 'day_completed',
      'run_completed'
    ])
  })

  it('un signal déjà abandonné ne traite aucun jour et ne corrompt rien', async () => {
    const storage = createMemoryStorage()
    const { processDay, calls } = mockProcessDay()
    const controller = new AbortController()
    controller.abort()

    const run = createRun({ runId: 'run-preabort', days: DAYS, processDay, storage, merge: mockMerge })
    const result = await run.start({ signal: controller.signal })

    expect(calls).toEqual([])
    expect(result.aborted).toBe(true)
    expect(result.status).toEqual({ total: 3, done: 0, remaining: 3, failed: [] })
    expect(await storage.keys('run:run-preabort:checkpoint:')).toEqual([])
  })

  it('une exception levée alors que le signal est abandonné est une interruption, pas un échec', async () => {
    const storage = createMemoryStorage()
    const controller = new AbortController()
    const { processDay, calls } = mockProcessDay({
      onDay: (day) => {
        if (day.iso === '2025-01-02') {
          controller.abort()
          throw new DOMException('The operation was aborted.', 'AbortError')
        }
      }
    })

    const run = createRun({ runId: 'run-abort-err', days: DAYS, processDay, storage, merge: mockMerge })
    const result = await run.start({ signal: controller.signal })

    expect(calls).toEqual(['2025-01-01', '2025-01-02'])
    expect(result.aborted).toBe(true)
    // Le jour 2 n'est ni checkpointé ni marqué failed : il sera retraité.
    expect(result.status).toEqual({ total: 3, done: 1, remaining: 2, failed: [] })
  })
})

describe('createRun — échec d’un jour, run continue, retry', () => {
  it('marque le jour failed, continue, puis un nouveau start() ne retente que lui', async () => {
    const storage = createMemoryStorage()

    // Premier passage : le jour 2 échoue, les jours 1 et 3 aboutissent.
    const first = mockProcessDay({ failOn: ['2025-01-02'] })
    const run1 = createRun({ runId: 'run-fail', days: DAYS, processDay: first.processDay, storage, merge: mockMerge })
    const r1 = await run1.start()

    expect(first.calls).toEqual(['2025-01-01', '2025-01-02', '2025-01-03'])
    expect(r1.aborted).toBe(false)
    expect(r1.document).toBeNull() // pas de merge tant qu'il reste des jours
    expect(r1.status.total).toBe(3)
    expect(r1.status.done).toBe(2)
    expect(r1.status.remaining).toBe(1)
    expect(r1.status.failed).toHaveLength(1)
    expect(r1.status.failed[0]).toMatchObject({ iso: '2025-01-02', error: 'LLM en erreur sur 2025-01-02' })

    // Retry (même createRun ou nouveau — ici le même) : seul le jour 2 est retraité.
    const second = mockProcessDay()
    const run2 = createRun({ runId: 'run-fail', days: DAYS, processDay: second.processDay, storage, merge: mockMerge })
    const r2 = await run2.start()

    expect(second.calls).toEqual(['2025-01-02'])
    expect(r2.status).toEqual({ total: 3, done: 3, remaining: 0, failed: [] }) // marqueur failed purgé
    expect(r2.document).toEqual({ merged: true, nb: 3, dates: ['2025-01-01', '2025-01-02', '2025-01-03'] })

    const types = (await run2.journal.entries()).map((e) => e.type)
    expect(types).toEqual([
      'run_started',
      'day_started', 'day_completed',
      'day_started', 'day_failed',
      'day_started', 'day_completed',
      'run_resumed',
      'day_started', 'day_completed',
      'run_completed'
    ])
    const failedEntry = (await run2.journal.entries()).find((e) => e.type === 'day_failed')
    expect(failedEntry).toMatchObject({ iso: '2025-01-02', error: 'LLM en erreur sur 2025-01-02' })
  })

  it('un rejet de la validation externe marque le jour failed sans checkpoint', async () => {
    const storage = createMemoryStorage()
    const { processDay } = mockProcessDay()
    const run = createRun({
      runId: 'run-invalid',
      days: DAYS,
      processDay,
      storage,
      validateDay: async (document) => {
        if (document.date === '2025-01-03') throw new Error('document jour invalide : poles manquants')
      },
      merge: mockMerge
    })

    const result = await run.start()
    expect(result.document).toBeNull()
    expect(result.status.done).toBe(2)
    expect(result.status.failed[0]).toMatchObject({ iso: '2025-01-03', error: 'document jour invalide : poles manquants' })
    expect(await storage.get('run:run-invalid:checkpoint:2025-01-03')).toBeUndefined()
  })
})

describe('createRun — garde-fous', () => {
  it('valide ses options', () => {
    const storage = createMemoryStorage()
    const processDay = async () => ({})
    expect(() => createRun({ days: DAYS, processDay, storage })).toThrow(/runId/)
    expect(() => createRun({ runId: 'r', days: [], processDay, storage })).toThrow(/days/)
    expect(() => createRun({ runId: 'r', days: DAYS, storage })).toThrow(/processDay/)
    expect(() => createRun({ runId: 'r', days: DAYS, processDay, storage: {} })).toThrow(/storage/)
    expect(() => createRun({ runId: 'r', days: [{ iso: 'a' }, { iso: 'a' }], processDay, storage })).toThrow(/double/)
  })

  it('refuse deux start() concurrents sur la même instance', async () => {
    const storage = createMemoryStorage()
    const { processDay } = mockProcessDay()
    const run = createRun({ runId: 'run-concurrent', days: DAYS, processDay, storage, merge: mockMerge })
    const p = run.start()
    await expect(run.start()).rejects.toThrow(/déjà en cours/)
    await p
  })

  it('status() et getDayDocuments() reflètent le stockage à tout moment', async () => {
    const storage = createMemoryStorage()
    const { processDay } = mockProcessDay({ failOn: ['2025-01-03'] })
    const run = createRun({ runId: 'run-status', days: DAYS, processDay, storage, merge: mockMerge })

    expect(await run.status()).toEqual({ total: 3, done: 0, remaining: 3, failed: [] })
    await run.start()
    expect((await run.status()).done).toBe(2)
    const docs = await run.getDayDocuments()
    expect(docs.map((d) => d.date)).toEqual(['2025-01-01', '2025-01-02'])
  })
})
