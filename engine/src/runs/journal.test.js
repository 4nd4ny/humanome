// Journal de run : accumulation via storage, ordre, reprise de séquence, export JSON.

import { describe, it, expect } from 'vitest'
import { createJournal, JOURNAL_ENTRY_TYPES } from './journal.js'
import { createMemoryStorage } from './memory.js'

const fixedClock = () => {
  let t = 0
  return () => `2026-07-12T10:00:0${t++}`
}

describe('createJournal', () => {
  it('accumule des entrées horodatées, relues dans l’ordre d’écriture', async () => {
    const storage = createMemoryStorage()
    const journal = createJournal({ runId: 'r1', storage, now: fixedClock() })

    await journal.append({ type: 'run_started' })
    await journal.append({ type: 'day_started', iso: '2025-01-01' })
    await journal.append({
      type: 'day_completed',
      iso: '2025-01-01',
      model: 'mock-1',
      tokensIn: 1200,
      tokensOut: 340,
      costEstimate: 0.0042
    })

    const entries = await journal.entries()
    expect(entries).toEqual([
      { ts: '2026-07-12T10:00:00', type: 'run_started' },
      { ts: '2026-07-12T10:00:01', type: 'day_started', iso: '2025-01-01' },
      {
        ts: '2026-07-12T10:00:02',
        type: 'day_completed',
        iso: '2025-01-01',
        model: 'mock-1',
        tokensIn: 1200,
        tokensOut: 340,
        costEstimate: 0.0042
      }
    ])
  })

  it('refuse un type inconnu et une entrée sans type', async () => {
    const journal = createJournal({ runId: 'r1', storage: createMemoryStorage() })
    await expect(journal.append({ type: 'day_skipped' })).rejects.toThrow(/type inconnu/)
    await expect(journal.append({})).rejects.toThrow(/\{ type \} requise/)
    expect(JOURNAL_ENTRY_TYPES).toContain('run_resumed')
  })

  it('reprend la séquence après recréation sur le même stockage (pas d’écrasement)', async () => {
    const storage = createMemoryStorage()
    const j1 = createJournal({ runId: 'r1', storage })
    await j1.append({ type: 'run_started' })
    await j1.append({ type: 'day_completed', iso: '2025-01-01' })

    const j2 = createJournal({ runId: 'r1', storage }) // « rechargement d'onglet »
    await j2.append({ type: 'run_resumed' })

    const types = (await j2.entries()).map((e) => e.type)
    expect(types).toEqual(['run_started', 'day_completed', 'run_resumed'])
  })

  it('isole les runs par runId sur un stockage partagé', async () => {
    const storage = createMemoryStorage()
    const jA = createJournal({ runId: 'run-A', storage })
    const jB = createJournal({ runId: 'run-B', storage })
    await jA.append({ type: 'run_started' })
    await jB.append({ type: 'run_started' })
    await jA.append({ type: 'run_completed' })

    expect((await jA.entries()).map((e) => e.type)).toEqual(['run_started', 'run_completed'])
    expect((await jB.entries()).map((e) => e.type)).toEqual(['run_started'])
  })

  it('exporte un JSON parsable identique aux entrées', async () => {
    const journal = createJournal({ runId: 'r1', storage: createMemoryStorage(), now: fixedClock() })
    await journal.append({ type: 'run_started' })
    await journal.append({ type: 'run_completed' })
    const exported = JSON.parse(await journal.exportJSON())
    expect(exported).toEqual(await journal.entries())
    expect(exported).toHaveLength(2)
  })
})
