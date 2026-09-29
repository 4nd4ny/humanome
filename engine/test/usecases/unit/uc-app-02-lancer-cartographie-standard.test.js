// UC-APP-02 — Lancer une cartographie standard : tests UNITAIRES (moteur).
// Fiche : docs/cas-utilisation/apprenant/UC-APP-02-lancer-cartographie-standard.md
//
// Le moteur exécuté dans le navigateur (ADR-001) est appelé directement,
// sans IHM ni réseau : estimation avant lancement, extraction d'une journée
// (7 pôles + kairos) sur un fournisseur mock rejouant les fixtures
// versionnées, machine à états du run (checkpoints, échec, interruption,
// reprise, journal), adaptateur IndexedDB « humanome-runs » (sur un faux
// IndexedDB minimal défini ICI : ce fichier n'importe rien hors engine/),
// fusion chronologique et transports des fournisseurs (clé personnelle
// directe, proxy humanome sans clé, reprises sur 429).
import { afterEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  CALLS_PER_DAY,
  MERGE_NARRATIVE_CALLS,
  estimateRun,
} from '../../../src/providers/estimate.js'
import { createMockProvider } from '../../../src/providers/mock.js'
import { createProvider } from '../../../src/providers/index.js'
import { extractDay } from '../../../src/pipeline/extract.js'
import { mergeDays } from '../../../src/pipeline/merge.js'
import { buildMergeDocument } from '../../../src/pipeline/merge-document.js'
import { createRun } from '../../../src/runs/run.js'
import { createMemoryStorage } from '../../../src/runs/memory.js'
import { createIndexedDbStorage } from '../../../src/runs/indexeddb.js'
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
const ISOS = ['2026-01-05', '2026-01-06', '2026-01-07']

/** Réponse « modèle » pour un prompt d'extraction : pôle ou kairos du jour cité. */
function fixtureAnswer(prompt) {
  const iso = /\((\d{4}-\d{2}-\d{2})\)/.exec(prompt)[1]
  const doc = dayDoc(iso)
  if (prompt.includes('SYNTHÈSE KAIROS')) return JSON.stringify(doc.kairos)
  const num = Number(/# Pôle (\d) — /.exec(prompt)[1])
  return JSON.stringify(doc.poles[num - 1])
}

/** Narratifs minimaux (une fente par compétence rendue, par pôle, kairos). */
function narratives(merged) {
  return {
    competences: Object.fromEntries(Object.keys(merged.agrege.par_competence).map((c) => [c, `Récit ${c}.`])),
    poles: Object.fromEntries(Object.keys(merged.agrege.par_pole).map((p) => [p, `Pôle ${p}.`])),
    kairos: 'Synthèse de la période.',
  }
}

// --- IndexedDB minimal (sous-ensemble utilisé par runs/indexeddb.js) --------
function installMiniIndexedDb() {
  const dbs = new Map()
  const later = (request, result) =>
    queueMicrotask(() => {
      request.result = result
      request.onsuccess?.()
    })
  const storeOf = (records) => ({
    get: (key) => { const r = {}; later(r, structuredClone(records.get(key))); return r },
    put: (value, key) => { const r = {}; records.set(key, structuredClone(value)); later(r, key); return r },
    delete: (key) => { const r = {}; records.delete(key); later(r, undefined); return r },
    getAllKeys: (range) => {
      const r = {}
      later(r, [...records.keys()].sort().filter((k) => !range || (k >= range.lower && k <= range.upper)))
      return r
    },
  })
  globalThis.IDBKeyRange = { bound: (lower, upper) => ({ lower, upper }) }
  globalThis.indexedDB = {
    open(name) {
      const request = {}
      queueMicrotask(() => {
        const fresh = !dbs.has(name)
        if (fresh) dbs.set(name, new Map())
        const stores = dbs.get(name)
        request.result = {
          objectStoreNames: { contains: (s) => stores.has(s) },
          createObjectStore: (s) => stores.set(s, new Map()),
          transaction: (s) => ({ objectStore: () => storeOf(stores.get(s)) }),
        }
        if (fresh) request.onupgradeneeded?.()
        request.onsuccess?.()
      })
      return request
    },
  }
  return { keys: (db, store) => [...(dbs.get(db)?.get(store)?.keys() ?? [])].sort() }
}

afterEach(() => {
  delete globalThis.indexedDB
  delete globalThis.IDBKeyRange
})

describe('UC-APP-02 — estimation avant lancement (étape 5)', () => {
  it('UC-APP-02-U01 — 3 journées : 3 × 8 appels + 69 récits de fusion, coût et durée ; modèle inconnu refusé', () => {
    expect(CALLS_PER_DAY).toBe(8)
    expect(MERGE_NARRATIVE_CALLS).toBe(69)
    const estimate = estimateRun({ days: 3, avgDayChars: 3600, promptOverheadChars: 36000, model: 'claude-sonnet-5' })

    expect(estimate.totalCalls).toBe(93)
    expect(estimate.tokensIn).toBe(24 * Math.ceil(39600 / 3.6) + 69 * Math.ceil(36000 / 3.6))
    expect(estimate.tokensOut).toBe(93 * 1000)
    expect(estimate.costUsd).toBe(Math.round(((estimate.tokensIn * 3) / 1e6 + (93000 * 15) / 1e6) * 100) / 100)
    expect(estimate.durationMin).toBe(Math.ceil((93 * 20) / 60))
    expect(estimate.disclaimer).toContain('INDICATIFS')
    expect(() => estimateRun({ days: 3, avgDayChars: 10, model: 'mon-modele-maison' })).toThrow(
      /modèle inconnu de la table de prix/,
    )
  })
})

describe('UC-APP-02 — extraction d’une journée (étape 6)', () => {
  it('UC-APP-02-U02 — 7 appels de pôle puis 1 synthèse kairos ; document cartographie-jour valide', async () => {
    const provider = createMockProvider({ responses: ({ prompt }) => fixtureAnswer(prompt) })
    const progress = []

    const document = await extractDay({
      dayText: 'Atelier photo avec les CM2, vernissage le soir.',
      date: '2026-01-05',
      referentiel: referentiel(),
      provider,
      model: 'mock-cartographe',
      onProgress: (p) => progress.push(`${p.step}:${p.poleNum ?? '-'}:${p.done}/${p.total}`),
    })

    expect(provider.callCount).toBe(8)
    expect(provider.calls.map((c) => /# Pôle (\d) — /.exec(c.prompt)?.[1] ?? 'kairos')).toEqual([
      '1', '2', '3', '4', '5', '6', '7', 'kairos',
    ])
    expect(provider.calls.every((c) => c.prompt.includes('Atelier photo avec les CM2'))).toBe(true)
    expect(progress.at(-1)).toBe('kairos:-:8/8')
    expect(validateDocument('cartographie-jour', document)).toEqual({ valid: true, errors: [] })
  })

  it('UC-APP-02-U03 — réponse illisible : un seul nouvel essai par pôle ; kairos en échec dégradé en null (kairosOptional)', async () => {
    let brokenOnce = false
    const provider = createMockProvider({
      responses: ({ prompt }) => {
        if (prompt.includes('SYNTHÈSE KAIROS')) return 'pas du JSON'
        if (prompt.includes('# Pôle 3 — ') && !brokenOnce) {
          brokenOnce = true
          return '{"poleNum": "3", "competences": [tronqué'
        }
        return fixtureAnswer(prompt)
      },
    })
    const progress = []

    const document = await extractDay({
      dayText: 'Journée de médiation.',
      date: '2026-01-06',
      referentiel: referentiel(),
      provider,
      model: 'mock-cartographe',
      kairosOptional: true,
      onProgress: (p) => progress.push(p),
    })

    expect(provider.callCount).toBe(7 + 1 + 2) // 7 pôles + 1 nouvel essai pôle 3 + 2 kairos
    expect(document.kairos).toBeNull()
    expect(progress.at(-1)).toMatchObject({ step: 'kairos', skipped: true, done: 8 })
    expect(validateDocument('cartographie-jour', document).valid).toBe(true)
  })

  it('UC-APP-02-U04 — pôle en échec deux fois : la journée échoue avec son contexte (pôle, date)', async () => {
    const provider = createMockProvider({
      responses: ({ prompt }) => (prompt.includes('# Pôle 2 — ') ? 'null' : fixtureAnswer(prompt)),
    })
    await expect(
      extractDay({
        dayText: 'Journée.',
        date: '2026-01-07',
        referentiel: referentiel(),
        provider,
        model: 'mock-cartographe',
      }),
    ).rejects.toThrow('extractDay : pôle 2 (2026-01-07) — réponse null, objet pôle attendu')
    expect(provider.callCount).toBe(1 + 2)
  })
})

describe('UC-APP-02 — run : checkpoints, échec, interruption, reprise (étape 6, A4, A5, E4)', () => {
  const days = () => ISOS.map((iso) => ({ iso }))

  it('UC-APP-02-U05 — un checkpoint par journée, journal horodaté, fusion finale sur les 3 journées', async () => {
    const storage = createMemoryStorage()
    const run = createRun({
      runId: 'p-1::aurora-v3-reconstruit@1.0.0',
      days: days(),
      storage,
      referentiel: referentiel(),
      now: () => '2026-01-08T12:00:00.000Z',
      processDay: async (day) => dayDoc(day.iso),
    })

    const result = await run.start()

    expect(result.aborted).toBe(false)
    expect(result.status).toEqual({ total: 3, done: 3, remaining: 0, failed: [] })
    expect(result.document.periode).toMatchObject({ nb_feuilles: 3, premiere: '2026-01-05', derniere: '2026-01-07' })
    expect(await storage.keys('run:p-1::aurora-v3-reconstruit@1.0.0:checkpoint:')).toEqual(
      ISOS.map((iso) => `run:p-1::aurora-v3-reconstruit@1.0.0:checkpoint:${iso}`),
    )
    const journal = await run.journal.entries()
    expect(journal.map((e) => e.type)).toEqual([
      'run_started',
      'day_started', 'day_completed',
      'day_started', 'day_completed',
      'day_started', 'day_completed',
      'run_completed',
    ])
    expect(journal.every((e) => e.ts === '2026-01-08T12:00:00.000Z')).toBe(true)
  })

  it('UC-APP-02-U06 — journée en échec : marquée, le run continue ; la reprise ne retente QUE celle-ci', async () => {
    const storage = createMemoryStorage()
    const processed = []
    let fail = true
    const make = () =>
      createRun({
        runId: 'r-echec',
        days: days(),
        storage,
        referentiel: referentiel(),
        processDay: async (day) => {
          processed.push(day.iso)
          if (day.iso === '2026-01-06' && fail) throw new Error('HTTP 500 du fournisseur')
          return dayDoc(day.iso)
        },
      })

    const first = await make().start()
    expect(first.document).toBeNull()
    expect(first.status.done).toBe(2)
    expect(first.status.failed).toEqual([
      expect.objectContaining({ iso: '2026-01-06', error: 'HTTP 500 du fournisseur' }),
    ])

    fail = false
    const second = make()
    const result = await second.start()
    expect(processed).toEqual([...ISOS, '2026-01-06'])
    expect(result.status).toEqual({ total: 3, done: 3, remaining: 0, failed: [] })
    expect(result.document).not.toBeNull()
    expect((await second.journal.entries()).map((e) => e.type)).toContain('run_resumed')
  })

  it('UC-APP-02-U07 — moteur seul (createRun) : interruption coopérative entre deux journées, la journée en cours se termine, la suivante n’est pas entamée', async () => {
    // L'assistant, lui, transmet aussi le signal aux appels du fournisseur :
    // l'appel en cours y est abandonné et la journée refaite (F05).
    const storage = createMemoryStorage()
    const controller = new AbortController()
    const run = createRun({
      runId: 'r-stop',
      days: days(),
      storage,
      referentiel: referentiel(),
      processDay: async (day) => {
        if (day.iso === '2026-01-05') controller.abort() // clic « Interrompre » pendant la journée 1
        return dayDoc(day.iso)
      },
    })

    const result = await run.start({ signal: controller.signal })

    expect(result.aborted).toBe(true)
    expect(result.status.done).toBe(1)
    expect(await run.getDayDocuments()).toHaveLength(1)
  })

  it('UC-APP-02-U08 — IndexedDB « humanome-runs » : checkpoints relus après rechargement, journées sautées', async () => {
    const fake = installMiniIndexedDb()
    const processed = []
    const make = (storage, stopAfterFirst) => {
      const controller = new AbortController()
      return {
        controller,
        run: createRun({
          runId: 'p-9::aurora-v3-reconstruit@1.0.0',
          days: days(),
          storage,
          referentiel: referentiel(),
          processDay: async (day) => {
            processed.push(day.iso)
            if (stopAfterFirst) controller.abort()
            return dayDoc(day.iso)
          },
        }),
      }
    }

    const tab1 = make(createIndexedDbStorage(), true)
    await tab1.run.start({ signal: tab1.controller.signal })
    expect(fake.keys('humanome-runs', 'kv')).toContain('run:p-9::aurora-v3-reconstruit@1.0.0:checkpoint:2026-01-05')

    // Rechargement de l'onglet : nouvel adaptateur, même base.
    const tab2 = make(createIndexedDbStorage(), false)
    expect(await tab2.run.status()).toMatchObject({ done: 1, remaining: 2 })
    const result = await tab2.run.start()

    expect(processed).toEqual(['2026-01-05', '2026-01-06', '2026-01-07'])
    expect(result.document).not.toBeNull()
    const journalKeys = fake.keys('humanome-runs', 'kv').filter((k) => k.startsWith('journal:'))
    expect(journalKeys.length).toBeGreaterThanOrEqual(8)
  })
})

describe('UC-APP-02 — fusion chronologique (étape 7, A6)', () => {
  it('UC-APP-02-U09 — 3 journées : document merge valide ; 2 journées : fusion non constructible (7 pôles exigés)', () => {
    const ref = referentiel()
    const merged = mergeDays(ISOS.map(dayDoc), ref)
    const document = buildMergeDocument(
      { ...merged, date_construction: '2026-01-08T12:00:00' },
      narratives(merged),
      {
        journalId: 'p-1::aurora-v3-reconstruit@1.0.0',
        sourceProtocole: 'Aurora v3 reconstruit — run local',
        generatedAt: '2026-01-08T12:00:00',
      },
    )
    expect(validateDocument('cartographie-merge', document)).toEqual({ valid: true, errors: [] })

    const short = mergeDays(ISOS.slice(0, 2).map(dayDoc), ref)
    const partial = buildMergeDocument({ ...short, date_construction: '2026-01-08T12:00:00' }, narratives(short), {
      journalId: 'p-2::aurora-v3-reconstruit@1.0.0',
      sourceProtocole: 'Aurora v3 reconstruit — run local',
      generatedAt: '2026-01-08T12:00:00',
    })
    const { valid, errors } = validateDocument('cartographie-merge', partial)
    expect(valid).toBe(false)
    // Motif : un domaine (pôle) sans aucune compétence établie sur la période.
    expect(errors.some((e) => /^\/domains\/\d+\/competences$/.test(e.path))).toBe(true)
  })
})

describe('UC-APP-02 — fournisseurs (étape 4, A1)', () => {
  function recordingFetch(answers) {
    const calls = []
    const fetchFn = async (url, init) => {
      calls.push({ url, init })
      const [status, body, headers = {}] = answers.shift()
      return {
        ok: status >= 200 && status < 300,
        status,
        headers: { get: (n) => headers[n.toLowerCase()] ?? null },
        json: async () => body,
      }
    }
    return { calls, fetchFn }
  }

  it('UC-APP-02-U10 — clé personnelle : appel DIRECT au fournisseur, clé en en-tête seulement', async () => {
    const { calls, fetchFn } = recordingFetch([
      [200, { content: [{ type: 'text', text: '{}' }], usage: { input_tokens: 12, output_tokens: 3 }, model: 'claude-sonnet-4-6' }],
    ])
    const provider = createProvider({ provider: 'anthropic', transport: 'direct', apiKey: 'sk-ant-perso', fetchFn })

    const result = await provider.complete({ model: 'claude-sonnet-4-6', prompt: 'Pôle 1', maxTokens: 8192 })

    expect(result).toMatchObject({ text: '{}', usage: { inputTokens: 12, outputTokens: 3 } })
    expect(calls[0].url).toBe('https://api.anthropic.com/v1/messages')
    expect(calls[0].init.headers['x-api-key']).toBe('sk-ant-perso')
    expect(calls[0].url).not.toContain('sk-ant-perso')
    expect(calls[0].init.body).not.toContain('sk-ant-perso')
    expect(JSON.parse(calls[0].init.body)).toMatchObject({ model: 'claude-sonnet-4-6', max_tokens: 8192 })
    expect(() => createProvider({ provider: 'openai', transport: 'direct' })).toThrow(/apiKey requise/)
  })

  it('UC-APP-02-U11 — transport proxy générique du moteur (politique par défaut, que le Service humanome n’utilise pas) : pas de clé, 429 réessayé après Retry-After, 413 jamais', async () => {
    // Le Service humanome construit ce transport avec maxAttempts: 1 (aucune
    // reprise sur quota, RG5) : voir UC-APP-02-U26 côté web.
    const waits = []
    const { calls, fetchFn } = recordingFetch([
      [429, { error: 'Quota' }, { 'retry-after': '2' }],
      [200, { text: 'ok', usage: { inputTokens: 5, outputTokens: 1 }, model: 'mock', stopReason: 'end_turn' }],
    ])
    const proxy = createProvider({
      provider: 'anthropic',
      transport: 'proxy',
      proxyUrl: 'api/llm',
      fetchFn,
      sleepFn: async (ms) => waits.push(ms),
    })

    const result = await proxy.complete({ model: 'demo', prompt: 'Pôle 1', maxTokens: 8192 })

    expect(result).toMatchObject({ text: 'ok', model: 'mock', stopReason: 'end_turn' })
    expect(waits).toEqual([2000])
    expect(calls.map((c) => c.url)).toEqual(['api/llm', 'api/llm'])
    expect(JSON.parse(calls[1].init.body)).toEqual({
      provider: 'anthropic', model: 'demo', system: null, prompt: 'Pôle 1', maxTokens: 8192,
    })
    expect(calls[1].init.headers).not.toHaveProperty('x-api-key')

    const refused = recordingFetch([[413, { error: 'Texte trop long' }]])
    const strict = createProvider({ provider: 'anthropic', transport: 'proxy', fetchFn: refused.fetchFn })
    await expect(strict.complete({ model: 'demo', prompt: 'x' })).rejects.toThrow('HTTP 413 — Texte trop long')
    expect(refused.calls).toHaveLength(1)
  })
})
