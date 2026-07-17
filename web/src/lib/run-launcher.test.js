// Tests de la logique de lancement de run (P8.3) — moteur RÉEL (extraction
// mock rejouant les fixtures), stockage mémoire : l'exécution, les
// checkpoints et la REPRISE sont exercés de bout en bout, sans réseau.
import { describe, expect, it, vi } from 'vitest'
import { createMockProvider } from '@engine/providers/mock.js'
import { createMemoryStorage } from '@engine/runs/memory.js'
import { validateDocument } from '@engine/validation.js'
import referentiel from '../../../schemas/fixtures/referentiel-respire-v7.json'
import day05 from '../../../schemas/fixtures/cartographie-jour-2026-01-05.json'
import day06 from '../../../schemas/fixtures/cartographie-jour-2026-01-06.json'
import day07 from '../../../schemas/fixtures/cartographie-jour-2026-01-07.json'
import { ApiUnavailableError } from '../api/client.js'
import {
  BUILTIN_PACKAGE,
  buildEstimate,
  buildLocalNarratives,
  computeDayGroups,
  executeRun,
  fetchPromptPackages,
  getLocalKey,
  makeRunId,
  setLocalKey,
} from './run-launcher.js'

const DAY_DOCS = { '2026-01-05': day05, '2026-01-06': day06, '2026-01-07': day07 }

/** Provider mock : rejoue les fixtures jour comme réponses LLM (motif M4). */
function extractionMock() {
  return createMockProvider({
    responses: ({ prompt }) => {
      const iso = prompt.match(/\((\d{4}-\d{2}-\d{2})\)/)[1]
      const doc = DAY_DOCS[iso]
      if (prompt.includes('SYNTHÈSE KAIROS')) return JSON.stringify(doc.kairos)
      const num = Number(prompt.match(/# Pôle (\d) — /)[1])
      return JSON.stringify(doc.poles[num - 1])
    },
  })
}

const GROUPS = [
  { iso: '2026-01-05', texte: 'Texte de la journée un.' },
  { iso: '2026-01-06', texte: 'Texte de la journée deux.' },
  { iso: '2026-01-07', texte: 'Texte de la journée trois.' },
]

describe('computeDayGroups', () => {
  it('regroupe par date, concatène et trie', () => {
    const groups = computeDayGroups([
      { date: '2026-01-06', texte: 'soir' },
      { date: '2026-01-05', texte: 'matin' },
      { date: '2026-01-06', texte: 'nuit' },
    ])
    expect(groups).toEqual([
      { iso: '2026-01-05', texte: 'matin' },
      { iso: '2026-01-06', texte: 'soir\n\nnuit' },
    ])
  })

  it('ignore les segments malformés', () => {
    expect(computeDayGroups([{ date: '2026-01-05' }, null])).toEqual([])
  })
})

describe('buildEstimate', () => {
  it('estime tokens, coût et durée pour un modèle connu', () => {
    const estimate = buildEstimate({
      dayGroups: GROUPS,
      referentiel,
      model: 'claude-sonnet-4-6',
    })
    expect(estimate.days).toBe(3)
    expect(estimate.totalCalls).toBe(3 * 8 + 69)
    expect(estimate.tokensIn).toBeGreaterThan(0)
    expect(typeof estimate.costUsd).toBe('number')
    expect(estimate.costUsd).toBeGreaterThan(0)
    expect(estimate.durationMin).toBeGreaterThan(0)
  })

  it('rend costUsd null (tokens quand même estimés) pour un modèle hors table', () => {
    const estimate = buildEstimate({
      dayGroups: GROUPS,
      referentiel,
      model: 'mon-modele-maison',
    })
    expect(estimate.costUsd).toBeNull()
    expect(estimate.tokensIn).toBeGreaterThan(0)
  })
})

describe('fetchPromptPackages', () => {
  it('place le paquet embarqué en tête des versions publiées', async () => {
    const apiFetchFn = vi.fn(async () => [
      { id: 'aurora-lab', version: '2.0.0', description: 'essai', publishedAt: 'x' },
    ])
    const { packages, origin } = await fetchPromptPackages({ apiFetchFn })
    expect(origin).toBe('api')
    expect(packages[0]).toEqual(BUILTIN_PACKAGE)
    expect(packages[1].id).toBe('aurora-lab')
  })

  it('replie sur le paquet embarqué quand l’API est indisponible', async () => {
    const apiFetchFn = vi.fn(async () => {
      throw new ApiUnavailableError()
    })
    const { packages, origin, defaut } = await fetchPromptPackages({ apiFetchFn })
    expect(origin).toBe('embarque')
    expect(packages).toEqual([BUILTIN_PACKAGE])
    expect(defaut).toBeNull()
  })

  it('préfère GET api/prompt-packages/default et MARQUE la version par défaut (M7)', async () => {
    const apiFetchFn = vi.fn(async (path) => {
      if (path === 'prompt-packages/default') return { id: 'aurora-lab', version: '2.0.0' }
      return [
        { id: 'aurora-lab', version: '1.0.0' },
        { id: 'aurora-lab', version: '2.0.0' },
      ]
    })
    const { packages, defaut } = await fetchPromptPackages({ apiFetchFn })
    expect(apiFetchFn).toHaveBeenCalledWith('prompt-packages/default')
    expect(defaut).toEqual({ id: 'aurora-lab', version: '2.0.0' })
    expect(packages.find((p) => p.version === '2.0.0').defaut).toBe(true)
    expect(packages.find((p) => p.version === '1.0.0').defaut).toBeUndefined()
  })

  it('endpoint default absent (API pré-M7) : comportement M6 inchangé', async () => {
    const apiFetchFn = vi.fn(async (path) => {
      if (path === 'prompt-packages/default') throw new Error('404')
      return [{ id: 'aurora-lab', version: '2.0.0' }]
    })
    const { packages, defaut } = await fetchPromptPackages({ apiFetchFn })
    expect(defaut).toBeNull()
    expect(packages[0]).toEqual(BUILTIN_PACKAGE)
    expect(packages[1].defaut).toBeUndefined()
  })
})

describe('clés locales (localStorage humanome-keys)', () => {
  it('mémorise, relit et efface une clé par fournisseur', () => {
    const map = new Map()
    const storage = {
      getItem: (k) => map.get(k) ?? null,
      setItem: (k, v) => map.set(k, v),
    }
    setLocalKey('anthropic', 'sk-test', storage)
    expect(getLocalKey('anthropic', storage)).toBe('sk-test')
    expect(getLocalKey('openai', storage)).toBe('')
    setLocalKey('anthropic', '', storage)
    expect(getLocalKey('anthropic', storage)).toBe('')
  })
})

describe('executeRun — moteur réel, stockage mémoire', () => {
  it('exécute 3 journées, produit un document merge VALIDE avec résumés locaux', async () => {
    const storage = createMemoryStorage()
    const provider = extractionMock()
    const calls = { days: [], resume: null }

    const result = await executeRun({
      runId: makeRunId('p-1', BUILTIN_PACKAGE),
      dayGroups: GROUPS,
      referentiel,
      provider,
      model: 'mock-cartographe',
      storage,
      now: () => '2026-01-08T12:00:00',
      onResume: (before) => {
        calls.resume = before
      },
      onDayStart: (info) => calls.days.push(info),
    })

    expect(calls.resume).toEqual({ done: 0, total: 3 })
    expect(calls.days.map((d) => d.iso)).toEqual(['2026-01-05', '2026-01-06', '2026-01-07'])
    expect(result.aborted).toBe(false)
    expect(result.resumedFrom).toBe(0)
    expect(result.mergeError).toBeNull()
    expect(result.dayDocuments).toHaveLength(3)
    expect(provider.callCount).toBe(24) // 3 journées × (7 pôles + kairos)
    // Usage RÉEL cumulé sur les appels de la session (mock : estimateTokens).
    expect(result.usage.mesures).toBe(24)
    expect(result.usage.inputTokens).toBeGreaterThan(0)
    expect(result.usage.outputTokens).toBeGreaterThan(0)

    const { valid, errors } = validateDocument('cartographie-merge', result.document)
    expect(errors ?? []).toEqual([])
    expect(valid).toBe(true)
    // v1 : la fente narrative reçoit le résumé local, la limite est documentée.
    const html = JSON.stringify(result.document)
    expect(html).toContain('Résumé local')
    expect(html).toContain('promptologue (P10)')
  })

  it('REPREND un run interrompu : les journées checkpointées sont sautées', async () => {
    const storage = createMemoryStorage()
    const runId = makeRunId('p-1', BUILTIN_PACKAGE)

    // Interruption coopérative après la première journée.
    const controller = new AbortController()
    const first = await executeRun({
      runId,
      dayGroups: GROUPS,
      referentiel,
      provider: extractionMock(),
      model: 'mock-cartographe',
      storage,
      signal: controller.signal,
      onCall: ({ iso, done, total }) => {
        if (iso === '2026-01-05' && done === total) controller.abort()
      },
    })
    expect(first.aborted).toBe(true)
    expect(first.document).toBeNull()
    expect(first.status.done).toBe(1)

    // Reprise : nouveau provider — seules les journées 2 et 3 sont traitées.
    const provider = extractionMock()
    const second = await executeRun({
      runId,
      dayGroups: GROUPS,
      referentiel,
      provider,
      model: 'mock-cartographe',
      storage,
    })
    expect(second.resumedFrom).toBe(1)
    expect(second.aborted).toBe(false)
    expect(second.document).not.toBeNull()
    expect(second.dayDocuments).toHaveLength(3)
    expect(provider.callCount).toBe(16) // journées 2026-01-06 et 2026-01-07
  })

  it('portfolio trop creux : documents jour conservés, fusion expliquée (mergeError)', async () => {
    // Avec 2 journées seulement, certains pôles n'ont AUCUNE compétence
    // établie sur la période : le schéma cartographie-merge (7 pôles, chacun
    // >= 1 compétence) rend la fusion non constructible — dégradation propre.
    const result = await executeRun({
      runId: makeRunId('p-2', BUILTIN_PACKAGE),
      dayGroups: GROUPS.slice(0, 2),
      referentiel,
      provider: extractionMock(),
      model: 'mock-cartographe',
      storage: createMemoryStorage(),
    })
    expect(result.aborted).toBe(false)
    expect(result.status.remaining).toBe(0)
    expect(result.dayDocuments).toHaveLength(2)
    expect(result.document).toBeNull()
    expect(result.mergeError).toContain('7 pôles')
  })
})

describe('buildLocalNarratives', () => {
  it('fournit un texte par compétence, par pôle et pour kairos', () => {
    const merged = {
      periode: { nb_feuilles: 2, premiere: '2026-01-05', derniere: '2026-01-06' },
      agrege: {
        par_competence: {
          '1.01': { nb_feuilles_etablies: 2, cumul_preuves: 3, cumul_indices: 1 },
        },
        par_pole: {
          1: {
            evolution_par_feuille: [
              { date: '2026-01-05', score: 4.5, etablies: 2, renvois: 1 },
            ],
          },
        },
      },
    }
    const narratives = buildLocalNarratives(merged)
    expect(narratives.competences['1.01']).toContain('2 feuille(s)')
    expect(narratives.poles['1']).toContain('4.50')
    expect(narratives.kairos).toContain('2 feuille(s)')
  })
})
