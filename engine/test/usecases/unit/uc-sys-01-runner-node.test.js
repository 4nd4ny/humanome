// UC-SYS-01 — Traiter la file de jobs de masse : tests UNITAIRES du runner Node.
// Fiche : docs/cas-utilisation/systeme/UC-SYS-01-traiter-file-jobs.md
//
// Le runner de l'établissement (scripts/runner-node/runner.mjs) est appelé
// directement, face à une API worker SIMULÉE qui reproduit la sémantique de
// api/src/routes/worker.php : réservation (jobs passés « running »), charge
// utile de la forme réelle (referentielVersion par job, référentiel COMPLET au
// niveau de la réponse, config LLM sans clé), 409 sur un document posté pour un
// job qui n'est plus en cours, 200 « recorded » pour toute erreur. Fournisseur
// LLM = mock du moteur rejouant les fixtures versionnées (schemas/fixtures).
// Complète scripts/runner-node/runner.test.mjs (options, journaux, relances).
import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMockProvider, validateDocument } from '../../../src/index.js'
import {
  createRunner,
  main,
  parseArgs,
  resolveProviderConfig,
  RunnerConfigError,
} from '../../../../scripts/runner-node/runner.mjs'

const TOKEN = 'hwk_0123456789abcdef0123456789abcdef'
const ENDPOINT = 'http://192.168.1.50:11434'
const DAY_TEXT = 'Aujourd’hui j’ai animé le conseil de classe puis rangé l’atelier avec Léa.'

/** Fixture versionnée (lecture paresseuse, dans les tests seulement). */
function fixture(name) {
  return JSON.parse(readFileSync(new URL(`../../../../schemas/fixtures/${name}`, import.meta.url), 'utf8'))
}

/** Job tel que construit par GET /api/worker/jobs pour un établissement « endpoint ». */
function phpJob(id, date, overrides = {}) {
  return {
    id,
    runId: 45,
    cohorteId: 7,
    userId: 12,
    date,
    dayText: DAY_TEXT,
    checkpoint: null,
    promptPackage: { id: 'aurora-v3-reconstruit', version: '1.0.0' },
    referentielVersion: { id: 'respire', version: '7.0.0' },
    provider: { provider: 'endpoint', endpointUrl: ENDPOINT, model: 'claude-sonnet-4-5' },
    model: 'claude-sonnet-4-5',
    leaseSeconds: 300,
    ...overrides,
  }
}

function jsonResponse(status, data) {
  return { ok: status >= 200 && status < 300, status, headers: { get: () => null }, json: async () => data }
}

/**
 * API worker simulée, fidèle à routes/worker.php : file en mémoire, statuts
 * queued → running → done ; `cancelOnResult` : jobs annulés par
 * l'établissement pendant leur extraction (le document reçoit alors 409).
 */
function phpLikeWorkerApi({ jobs, cancelOnResult = [] }) {
  const referentiel = fixture('referentiel-respire-v7.json')
  const status = new Map(jobs.map((job) => [job.id, 'queued']))
  const requests = []
  const posts = []
  const fetchFn = async (url, init = {}) => {
    const { pathname, searchParams } = new URL(url)
    requests.push({ method: init.method, pathname, search: searchParams.toString(), headers: init.headers ?? {} })
    if (init.headers?.['x-worker-token'] !== TOKEN) return jsonResponse(401, { error: 'Jeton worker invalide' })
    if (init.method === 'GET' && pathname === '/api/worker/jobs') {
      const limit = Math.max(1, Math.min(20, Number(searchParams.get('limit') ?? 1)))
      const batch = jobs.filter((job) => status.get(job.id) === 'queued').slice(0, limit)
      for (const job of batch) status.set(job.id, 'running')
      return jsonResponse(200, batch.length > 0 ? { jobs: batch, referentiel } : { jobs: [] })
    }
    const match = pathname.match(/^\/api\/worker\/jobs\/(\d+)\/result$/)
    if (init.method === 'POST' && match) {
      const id = Number(match[1])
      const body = JSON.parse(init.body)
      posts.push({ id, body })
      if (cancelOnResult.includes(id) && status.get(id) === 'running') status.set(id, 'cancelled')
      if (body.erreur !== undefined) {
        if (status.get(id) === 'running') status.set(id, 'queued') // fail() : tentative + 1, retour en file
        return jsonResponse(200, { id, status: 'recorded' }) // 200 même hors « running »
      }
      if (status.get(id) !== 'running') {
        return jsonResponse(409, { error: 'Job plus en cours (annulé ou bail repris)' })
      }
      status.set(id, 'done')
      return jsonResponse(200, { id, status: 'done' })
    }
    return jsonResponse(404, { error: 'Not found' })
  }
  return { fetchFn, requests, posts, status }
}

/** Mock LLM : rejoue la fixture du jour demandé (pôle lu dans le prompt, kairos reconnu). */
function fixtureProviderFactory() {
  const days = { '2026-01-05': fixture('cartographie-jour-2026-01-05.json'), '2026-01-06': fixture('cartographie-jour-2026-01-06.json') }
  const created = []
  const factory = (config) => {
    created.push(config)
    return createMockProvider({
      usage: { inputTokens: 1000, outputTokens: 250 },
      responses: ({ prompt }) => {
        const day = prompt.includes('2026-01-06') ? days['2026-01-06'] : days['2026-01-05']
        if (prompt.includes('SYNTHÈSE KAIROS')) return JSON.stringify(day.kairos)
        const num = Number(prompt.match(/# Pôle (\d) — /)[1])
        return JSON.stringify(day.poles[num - 1])
      },
    })
  }
  factory.created = created
  return factory
}

function runnerFor(api, logs = []) {
  const factory = fixtureProviderFactory()
  const runner = createRunner({
    options: parseArgs(['--api', 'https://humanome.xyz', '--token', TOKEN], {}),
    fetchFn: api.fetchFn,
    createProviderFn: factory,
    log: (line) => logs.push(line),
    sleepFn: async () => {},
    env: { LLM_API_KEY: 'local' },
  })
  return { runner, factory, logs }
}

describe('UC-SYS-01 — runner Node : contrat avec l’API worker', () => {
  it('UC-SYS-01-U16 — resolveProviderConfig : job « endpoint » réel → adaptateur openai ; job « humanome » → RunnerConfigError', () => {
    expect(resolveProviderConfig(phpJob(1, '2026-01-05'), { maxTokens: 8192 }, { LLM_API_KEY: 'local' })).toEqual({
      provider: 'openai',
      baseUrl: ENDPOINT,
      model: 'claude-sonnet-4-5',
      apiKey: 'local',
      maxTokens: 8192,
      temperature: undefined,
    })

    const platformJob = phpJob(2, '2026-01-05', { provider: { provider: 'humanome' }, model: null })
    expect(() => resolveProviderConfig(platformJob, { maxTokens: 8192 }, { LLM_API_KEY: 'local' })).toThrow(RunnerConfigError)
    expect(() => resolveProviderConfig(platformJob, {}, {})).toThrow(/clé plateforme reste sur le serveur/)
  })

  it('UC-SYS-01-U17 — runOnce : réserve, extrait avec le référentiel partagé du lot, poste des documents valides ; jamais de checkpoint', async () => {
    const api = phpLikeWorkerApi({ jobs: [phpJob(1, '2026-01-05'), phpJob(2, '2026-01-06')] })
    const { runner, factory, logs } = runnerFor(api)

    const stats = await runner.runOnce()

    expect(stats).toMatchObject({ reserved: 2, ok: 2, errors: 0 })
    expect(api.status.get(1)).toBe('done')
    expect(api.status.get(2)).toBe('done')
    expect(factory.created[0]).toMatchObject({ provider: 'openai', baseUrl: ENDPOINT, apiKey: 'local' })
    for (const { id, body } of api.posts) {
      expect(body.document.date).toBe(id === 1 ? '2026-01-05' : '2026-01-06')
      expect(validateDocument('cartographie-jour', body.document).valid).toBe(true)
      // Forme ACTUELLE des compteurs postés (voir « Anomalies constatées » :
      // la route lit tokens.input / tokens.output).
      expect(body.tokens).toEqual({ inputTokens: 8000, outputTokens: 2000 })
      expect(body.coutUsd).toBe(0.054) // 8 × (1 000 × 3 $ + 250 × 15 $) / 1e6
    }
    // Le runner est sans état : il ne parle qu'aux routes de réservation et de résultat.
    expect([...new Set(api.requests.map((r) => `${r.method} ${r.pathname.replace(/\d+/, '{id}')}`))]).toEqual([
      'GET /api/worker/jobs',
      'POST /api/worker/jobs/{id}/result',
    ])
    expect(api.requests[0].search).toBe('limit=5')
    expect(api.requests.every((r) => !r.search.includes(TOKEN) && !r.pathname.includes(TOKEN))).toBe(true)
    expect(logs.join('\n')).not.toContain('conseil de classe')
  })

  it('UC-SYS-01-U18 — job annulé pendant l’extraction : 409 sur le document, erreur postée (200 « recorded »), la passe continue', async () => {
    const api = phpLikeWorkerApi({ jobs: [phpJob(1, '2026-01-05'), phpJob(2, '2026-01-06')], cancelOnResult: [1] })
    const { runner } = runnerFor(api)

    const stats = await runner.runOnce()

    expect(stats).toMatchObject({ reserved: 2, ok: 1, errors: 1 })
    const forJob1 = api.posts.filter((p) => p.id === 1).map((p) => p.body)
    expect(forJob1).toHaveLength(2)
    expect(forJob1[0].document).toBeDefined()
    expect(forJob1[1].erreur).toContain('HTTP 409 — Job plus en cours (annulé ou bail repris)')
    // Le coût de la journée est redéclaré avec l'erreur : la route le facture.
    expect(forJob1[1].coutUsd).toBe(0.054)
    expect(api.status.get(1)).toBe('cancelled')
    expect(api.status.get(2)).toBe('done')
  })
})

describe('UC-SYS-01 — runner Node : point d’entrée CLI (main)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('UC-SYS-01-U22 — main : jeton refusé → code 3 ; job « humanome » sans --provider → code 4, rien posté ; avec --provider, le job humanome devient exécutable', async () => {
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    const argv = ['--api', 'https://humanome.xyz', '--token', TOKEN]

    // E1 : 401 sur la réservation → WorkerAuthError → code 3.
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(401, { error: 'Jeton worker invalide' })))
    expect(await main(argv, {})).toBe(3)

    // RG9 : job d'un établissement « humanome » sans fournisseur CLI →
    // RunnerConfigError → code 4, aucun résultat posté.
    const referentiel = fixture('referentiel-respire-v7.json')
    const platformJob = phpJob(7, '2026-01-05', { provider: { provider: 'humanome' }, model: null })
    const calls = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url, init = {}) => {
        calls.push(`${init.method ?? 'GET'} ${new URL(url).pathname}`)
        return jsonResponse(200, { jobs: [platformJob], referentiel })
      }),
    )
    expect(await main(argv, {})).toBe(4)
    expect(calls).toEqual(['GET /api/worker/jobs'])
    expect(stderr.mock.calls.map(([line]) => String(line)).join('')).toContain('ERREUR de configuration')

    // Avec --provider/--endpoint/--model, les options CLI priment : le même
    // job « humanome » est exécuté avec le LLM de l'établissement (la clé
    // plateforme ne quitte toujours pas le serveur).
    expect(
      resolveProviderConfig(platformJob, { provider: 'openai', endpoint: ENDPOINT, model: 'llama3', maxTokens: 8192 }, { LLM_API_KEY: 'local' }),
    ).toMatchObject({ provider: 'openai', baseUrl: ENDPOINT, model: 'llama3', apiKey: 'local' })
  })
})
