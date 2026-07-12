// Tests du runner CLI de masse (ADR-005, chantier C de M8) : API mockée
// (fetch injectable) + provider mock → réserve/exécute/poste ; erreur LLM →
// job posté en erreur ; jeton refusé → sortie claire ; résolution du
// fournisseur ; RGPD (aucun contenu dans le journal local).
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { createMockProvider } from '../../engine/src/index.js'
import {
  API_KEY_ENV_BY_PROVIDER,
  DEFAULT_LIMIT,
  DEFAULT_LOOP_SECONDS,
  DEFAULT_MAX_TOKENS,
  RunnerConfigError,
  UsageError,
  WorkerApiError,
  WorkerAuthError,
  computeCostUsd,
  createApiClient,
  createRunner,
  parseArgs,
  resolveProviderConfig,
  sanitizeForLog,
} from './runner.mjs'

// --- Fixtures réelles du dépôt (mêmes que engine/src/integration.test.js) ----

const fixture = (name) =>
  readFileSync(new URL(`../../schemas/fixtures/${name}`, import.meta.url), 'utf8')

const referentiel = JSON.parse(fixture('referentiel-respire-v7.json'))
const dayDoc = JSON.parse(fixture('cartographie-jour-2026-01-05.json'))

const DAY_TEXT = 'Aujourd’hui j’ai monté le stand du marché et tenu la caisse avec Léa.'

/**
 * Réponses LLM mock : rejoue le document jour fixture (pôle demandé lu dans
 * le prompt, kairos reconnu à son marqueur) — même technique que le test
 * d'intégration du moteur.
 */
function extractionResponses({ prompt }) {
  if (prompt.includes('SYNTHÈSE KAIROS')) return JSON.stringify(dayDoc.kairos)
  const num = Number(prompt.match(/# Pôle (\d) — /)[1])
  return JSON.stringify(dayDoc.poles[num - 1])
}

const FIXED_USAGE = { inputTokens: 1000, outputTokens: 250 }

/** Provider factory injectable : ignore la config, répond depuis la fixture. */
function mockProviderFactory({ responses = extractionResponses, usage = FIXED_USAGE } = {}) {
  const created = []
  const factory = (config) => {
    created.push(config)
    return createMockProvider({ responses, usage })
  }
  factory.created = created
  return factory
}

// --- API worker mockée ---------------------------------------------------------

function jsonResponse(status, data) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    json: async () => data,
  }
}

/**
 * fetch mock du contrat worker : GET /api/worker/jobs sert les lots de
 * `batches` (puis file vide) ; POST …/result est enregistré dans `posts`.
 */
function createApiMock({ batches = [], referentiel: sharedReferentiel, reserveStatus = null, postStatuses = [] } = {}) {
  const posts = []
  const requests = []
  let reserveCalls = 0
  let postCalls = 0
  const fetchFn = async (url, init = {}) => {
    const { pathname, searchParams } = new URL(url)
    requests.push({ method: init.method, pathname, headers: init.headers ?? {}, search: searchParams })
    if (init.method === 'GET' && pathname === '/api/worker/jobs') {
      if (reserveStatus) return jsonResponse(reserveStatus, { erreur: 'refus simulé' })
      const batch = batches[reserveCalls] ?? []
      reserveCalls += 1
      return jsonResponse(200, { jobs: batch, ...(sharedReferentiel ? { referentiel: sharedReferentiel } : {}) })
    }
    const match = pathname.match(/^\/api\/worker\/jobs\/([^/]+)\/result$/)
    if (init.method === 'POST' && match) {
      const status = postStatuses[postCalls] ?? 200
      postCalls += 1
      if (status !== 200) return jsonResponse(status, { erreur: 'panne simulée' })
      posts.push({ jobId: match[1], body: JSON.parse(init.body) })
      return jsonResponse(200, { ok: true })
    }
    throw new Error(`route mock inconnue : ${init.method} ${pathname}`)
  }
  return {
    fetchFn,
    posts,
    requests,
    get reserveCalls() { return reserveCalls },
  }
}

function baseOptions(overrides = {}) {
  const options = parseArgs(
    ['--api', 'https://humanome.xyz', '--token', 'tok-etab',
      '--provider', 'ollama', '--model', 'claude-sonnet-5'],
    {},
  )
  return Object.assign(options, overrides)
}

function makeRunner({ api, options = baseOptions(), providerFactory = mockProviderFactory(), logs = [] } = {}) {
  const log = (msg) => logs.push(msg)
  const runner = createRunner({
    options,
    fetchFn: api.fetchFn,
    createProviderFn: providerFactory,
    log,
    sleepFn: async () => {},
    env: {},
    now: () => 0,
  })
  return { runner, logs }
}

const job = (id, extra = {}) => ({ id, runId: 1, date: '2026-01-05', dayText: DAY_TEXT, ...extra })

// --- parseArgs -------------------------------------------------------------------

describe('parseArgs', () => {
  it('exige --api et --token, avec des messages clairs', () => {
    expect(() => parseArgs([], {})).toThrow(UsageError)
    expect(() => parseArgs([], {})).toThrow(/--api/)
    expect(() => parseArgs(['--api', 'https://humanome.xyz'], {})).toThrow(/--token/)
  })

  it('accepte le jeton par variable d’environnement HUMANOME_WORKER_TOKEN', () => {
    const options = parseArgs(['--api', 'https://humanome.xyz'], { HUMANOME_WORKER_TOKEN: 'tok-env' })
    expect(options.token).toBe('tok-env')
  })

  it('applique les défauts : une passe, limit, maxTokens, loopSeconds', () => {
    const options = parseArgs(['--api', 'https://humanome.xyz', '--token', 't'], {})
    expect(options.mode).toBe('once')
    expect(options.limit).toBe(DEFAULT_LIMIT)
    expect(options.maxTokens).toBe(DEFAULT_MAX_TOKENS)
    expect(options.loopSeconds).toBe(DEFAULT_LOOP_SECONDS)
  })

  it('parse --loop avec et sans valeur', () => {
    expect(parseArgs(['--api', 'https://x.tld', '--token', 't', '--loop'], {}).loopSeconds)
      .toBe(DEFAULT_LOOP_SECONDS)
    const options = parseArgs(['--api', 'https://x.tld', '--token', 't', '--loop', '10'], {})
    expect(options.mode).toBe('loop')
    expect(options.loopSeconds).toBe(10)
  })

  it('rejette fournisseur inconnu, URL invalide et option inconnue', () => {
    const base = ['--api', 'https://x.tld', '--token', 't']
    expect(() => parseArgs([...base, '--provider', 'skynet'], {})).toThrow(/fournisseur inconnu/)
    expect(() => parseArgs(['--api', 'pas une url', '--token', 't'], {})).toThrow(/URL invalide/)
    expect(() => parseArgs([...base, '--turbo'], {})).toThrow(/option inconnue/)
    expect(() => parseArgs([...base, '--limit', 'zéro'], {})).toThrow(/entier/)
  })
})

// --- Résolution du fournisseur ---------------------------------------------------

describe('resolveProviderConfig', () => {
  it('les options CLI priment sur la configuration du job', () => {
    const cfg = resolveProviderConfig(
      job(1, { provider: { provider: 'endpoint', endpointUrl: 'http://gpu.interne:8000', model: 'droit-du-job' } }),
      { provider: 'ollama', endpoint: 'http://localhost:11434', model: 'qwen3:32b', maxTokens: 8192 },
      {},
    )
    expect(cfg).toMatchObject({
      provider: 'ollama',
      baseUrl: 'http://localhost:11434',
      model: 'qwen3:32b',
    })
  })

  it('provider « endpoint » du job → adaptateur openai sur endpointUrl', () => {
    const cfg = resolveProviderConfig(
      job(2, { provider: { provider: 'endpoint', endpointUrl: 'http://gpu.interne:8000', model: 'mistral-large' } }),
      { apiKey: 'k-local', maxTokens: 8192 },
      {},
    )
    expect(cfg).toMatchObject({
      provider: 'openai',
      baseUrl: 'http://gpu.interne:8000',
      model: 'mistral-large',
      apiKey: 'k-local',
    })
  })

  it('job « humanome » sans options CLI → RunnerConfigError (clé plateforme serveur uniquement)', () => {
    expect(() => resolveProviderConfig(job(3, { provider: { provider: 'humanome', model: 'claude-sonnet-5' } }), {}, {}))
      .toThrow(RunnerConfigError)
    expect(() => resolveProviderConfig(job(3, { provider: { provider: 'humanome', model: 'claude-sonnet-5' } }), {}, {}))
      .toThrow(/clé plateforme/)
  })

  it('exige un modèle et une clé API (sauf ollama), lues aussi dans l’environnement', () => {
    expect(() => resolveProviderConfig(job(4), { provider: 'ollama' }, {}))
      .toThrow(/aucun modèle/)
    expect(() => resolveProviderConfig(job(5), { provider: 'anthropic', model: 'claude-sonnet-5' }, {}))
      .toThrow(/clé API absente/)
    const cfg = resolveProviderConfig(
      job(6),
      { provider: 'anthropic', model: 'claude-sonnet-5' },
      { [API_KEY_ENV_BY_PROVIDER.anthropic]: 'k-env' },
    )
    expect(cfg.apiKey).toBe('k-env')
    const viaGeneric = resolveProviderConfig(
      job(7),
      { provider: 'openai', model: 'gpt-4o' },
      { LLM_API_KEY: 'k-generique' },
    )
    expect(viaGeneric.apiKey).toBe('k-generique')
  })
})

// --- Coût ------------------------------------------------------------------------

describe('computeCostUsd', () => {
  it('applique la table de prix du moteur (getModelPricing)', () => {
    // claude-sonnet-5 : 3 $ entrée / 15 $ sortie par Mtok.
    expect(computeCostUsd('claude-sonnet-5', { inputTokens: 1_000_000, outputTokens: 100_000 }))
      .toBe(4.5)
  })

  it('modèle local/inconnu → coût marginal 0', () => {
    expect(computeCostUsd('qwen3:32b', { inputTokens: 5000, outputTokens: 800 })).toBe(0)
    expect(computeCostUsd('modele-mystere', { inputTokens: 5000, outputTokens: 800 })).toBe(0)
  })
})

// --- Réserve / exécute / poste -----------------------------------------------------

describe('runOnce : réserve, exécute via le moteur, poste les résultats', () => {
  it('traite un lot, poste des documents cartographie-jour valides avec tokens et coût', async () => {
    const api = createApiMock({ batches: [[job(101), job(102)]], referentiel })
    const { runner, logs } = makeRunner({ api })

    const stats = await runner.runOnce()

    expect(stats).toMatchObject({ reserved: 2, ok: 2, errors: 0 })
    expect(api.posts).toHaveLength(2)
    expect(api.posts.map((p) => p.jobId)).toEqual(['101', '102'])
    for (const { body } of api.posts) {
      expect(body.erreur).toBeUndefined()
      expect(body.document.kind).toBe('cartographie-jour')
      expect(body.document.date).toBe('2026-01-05')
      expect(body.document.poles).toHaveLength(7)
      // 8 appels × usage fixe {1000, 250}.
      expect(body.tokens).toEqual({ inputTokens: 8000, outputTokens: 2000 })
      // 8000×3/1e6 + 2000×15/1e6 = 0.054 $ (modèle claude-sonnet-5).
      expect(body.coutUsd).toBe(0.054)
      expect(body.model).toBe('claude-sonnet-5')
    }
    expect(stats.coutUsd).toBe(0.108)
    // Le jeton worker accompagne chaque requête.
    for (const req of api.requests) {
      expect(req.headers['x-worker-token']).toBe('tok-etab')
    }
    expect(logs.join('\n')).toContain('2 job(s) réservé(s)')
  })

  it('enchaîne les lots jusqu’à file vide (--once draine la file)', async () => {
    const api = createApiMock({ batches: [[job(1)], [job(2)]], referentiel })
    const { runner } = makeRunner({ api })

    const stats = await runner.runOnce()

    expect(stats.reserved).toBe(2)
    expect(stats.ok).toBe(2)
    expect(api.reserveCalls).toBe(3) // lot 1, lot 2, puis file vide
  })

  it('utilise le referentiel porté par le job quand il n’est pas partagé', async () => {
    const api = createApiMock({ batches: [[job(11, { referentiel })]] })
    const { runner } = makeRunner({ api })
    const stats = await runner.runOnce()
    expect(stats.ok).toBe(1)
  })

  it('retombe sur le referentiel partagé quand le job ne porte que des métadonnées de version', async () => {
    // Contrat API M8 : le job porte referentielVersion {id, version}, le
    // document COMPLET est partagé au niveau réponse — un objet non
    // exploitable sous job.referentiel ne doit pas masquer le partagé.
    const api = createApiMock({
      batches: [[job(12, { referentiel: { id: 'respire', version: '7.0.0' } })]],
      referentiel,
    })
    const { runner } = makeRunner({ api })
    const stats = await runner.runOnce()
    expect(stats.ok).toBe(1)
    expect(stats.errors).toBe(0)
  })

  it('garde-fou de facturation : un lot re-servi déjà accepté interrompt la passe', async () => {
    // Serveur défectueux : re-sert le job 1 alors que son résultat a été accepté.
    const api = createApiMock({ batches: [[job(1)], [job(1)]], referentiel })
    const { runner, logs } = makeRunner({ api })

    const stats = await runner.runOnce()

    expect(stats.ok).toBe(1)
    expect(api.posts).toHaveLength(1) // pas de second paiement LLM
    expect(api.reserveCalls).toBe(2)
    expect(logs.join('\n')).toContain('ANOMALIE serveur')
  })

  it('charge utile invalide → postée en erreur, la passe continue', async () => {
    const api = createApiMock({ batches: [[job(21, { dayText: '   ' }), job(22)]], referentiel })
    const { runner } = makeRunner({ api })

    const stats = await runner.runOnce()

    expect(stats).toMatchObject({ reserved: 2, ok: 1, errors: 1 })
    const failed = api.posts.find((p) => p.jobId === '21')
    expect(failed.body.erreur).toMatch(/dayText absent ou vide/)
    expect(failed.body.coutUsd).toBe(0)
  })
})

// --- Erreur LLM ---------------------------------------------------------------------

describe('runOnce : erreur LLM', () => {
  it('extraction en échec → job posté en erreur avec les tokens consommés, les autres jobs continuent', async () => {
    const api = createApiMock({ batches: [[job(31), job(32, { date: '2026-01-06' })]], referentiel })
    // La journée du job 32 ne reçoit que du bruit : échec après l'unique retry.
    const responses = (params) =>
      params.prompt.includes('(2026-01-06)') ? 'BRUIT ILLISIBLE sans JSON' : extractionResponses(params)
    const { runner, logs } = makeRunner({ api, providerFactory: mockProviderFactory({ responses }) })

    const stats = await runner.runOnce()

    expect(stats).toMatchObject({ reserved: 2, ok: 1, errors: 1 })
    const failed = api.posts.find((p) => p.jobId === '32')
    expect(failed.body.document).toBeUndefined()
    expect(failed.body.erreur).toMatch(/pôle 1 \(2026-01-06\)/)
    // 2 tentatives (retry stochastique du moteur) × usage fixe.
    expect(failed.body.tokens).toEqual({ inputTokens: 2000, outputTokens: 500 })
    expect(failed.body.coutUsd).toBeGreaterThan(0)
    expect(logs.join('\n')).toContain('job 32 : ÉCHEC')
  })

  it('un envoi de résultat raté (5xx) est retenté puis aboutit', async () => {
    const api = createApiMock({ batches: [[job(41)]], referentiel, postStatuses: [500] })
    const { runner } = makeRunner({ api })

    const stats = await runner.runOnce()

    expect(stats.ok).toBe(1)
    expect(api.posts).toHaveLength(1) // le 2e essai a abouti
  })
})

// --- Jeton refusé ---------------------------------------------------------------------

describe('jeton worker refusé', () => {
  it('401 → WorkerAuthError avec message actionnable', async () => {
    const api = createApiMock({ reserveStatus: 401 })
    const { runner } = makeRunner({ api })
    await expect(runner.runOnce()).rejects.toThrow(WorkerAuthError)
    await expect(runner.runOnce()).rejects.toThrow(/jeton worker refusé/)
    expect(api.posts).toHaveLength(0)
  })

  it('la boucle ne survit PAS à un jeton refusé (fatal), mais survit au réseau', async () => {
    const api = createApiMock({ reserveStatus: 403 })
    const { runner } = makeRunner({ api })
    await expect(runner.runLoop()).rejects.toThrow(WorkerAuthError)

    // Erreur réseau transitoire : la boucle continue puis s'arrête proprement.
    let calls = 0
    const flakyFetch = async () => {
      calls += 1
      if (calls === 1) throw new TypeError('fetch failed')
      return jsonResponse(200, { jobs: [] })
    }
    const logs = []
    const runner2 = createRunner({
      options: baseOptions(),
      fetchFn: flakyFetch,
      createProviderFn: mockProviderFactory(),
      log: (m) => logs.push(m),
      sleepFn: async () => { if (calls >= 2) runner2.requestStop() },
      env: {},
    })
    const totals = await runner2.runLoop()
    expect(totals.passes).toBeGreaterThanOrEqual(1)
    expect(logs.join('\n')).toContain('erreur API transitoire')
  })
})

// --- Configuration fournisseur fatale ---------------------------------------------------

describe('job inexécutable par le runner', () => {
  it('job humanome sans --provider → RunnerConfigError, rien n’est posté (le lease rendra le job)', async () => {
    const options = parseArgs(['--api', 'https://humanome.xyz', '--token', 'tok-etab'], {})
    const api = createApiMock({
      batches: [[job(51, { provider: { provider: 'humanome', model: 'claude-sonnet-5' } })]],
      referentiel,
    })
    const { runner } = makeRunner({ api, options })

    await expect(runner.runOnce()).rejects.toThrow(RunnerConfigError)
    expect(api.posts).toHaveLength(0)
  })
})

// --- RGPD : journal local sans contenu ---------------------------------------------------

describe('RGPD — journal local', () => {
  it('ne journalise jamais le texte du portfolio ni les extraits de réponse LLM', async () => {
    const marqueurPortfolio = 'SECRET-PORTFOLIO-RGPD'
    const marqueurSortie = 'SECRET-SORTIE-LLM'
    const api = createApiMock({
      batches: [[job(61, { dayText: `Journée avec ${marqueurPortfolio} dedans.` }), job(62)]],
      referentiel,
    })
    // Le job 61 échoue avec une réponse LLM contenant un marqueur : le message
    // d'erreur du moteur cite la réponse entre « … » — masqué dans le journal.
    const responses = (params) =>
      params.prompt.includes(marqueurPortfolio) ? `${marqueurSortie} pas de JSON ici` : extractionResponses(params)
    const { runner, logs } = makeRunner({ api, providerFactory: mockProviderFactory({ responses }) })

    await runner.runOnce()

    const journal = logs.join('\n')
    expect(journal).not.toContain(marqueurPortfolio)
    expect(journal).not.toContain(marqueurSortie)
    expect(journal).toContain('extrait masqué (RGPD)')
    // L'erreur complète, elle, est bien partie au serveur (rapport de run).
    const failed = api.posts.find((p) => p.jobId === '61')
    expect(failed.body.erreur).toContain(marqueurSortie)
  })

  it('sanitizeForLog masque tous les extraits cités', () => {
    expect(sanitizeForLog('échec (début : « contenu sensible »), suite « autre »'))
      .toBe('échec (début : « extrait masqué (RGPD) »), suite « extrait masqué (RGPD) »')
  })
})

// --- Client API ----------------------------------------------------------------------------

describe('createApiClient', () => {
  it('n’envoie jamais le jeton dans l’URL et abandonne après 3 envois ratés', async () => {
    const seen = []
    let postAttempts = 0
    const fetchFn = async (url, init) => {
      seen.push(url)
      if (init.method === 'POST') {
        postAttempts += 1
        return jsonResponse(503, {})
      }
      return jsonResponse(200, { jobs: [] })
    }
    const client = createApiClient({ apiBase: 'https://humanome.xyz/', token: 'tok', fetchFn, sleepFn: async () => {} })
    await client.reserveJobs(3)
    expect(seen[0]).toBe('https://humanome.xyz/api/worker/jobs?limit=3')
    expect(seen[0]).not.toContain('tok')
    await expect(client.postResult(9, { erreur: 'x' })).rejects.toThrow(WorkerApiError)
    expect(postAttempts).toBe(3)
  })
})
