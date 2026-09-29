// UC-SYS-01 — Traiter la file de jobs de masse : tests UNITAIRES du runner Node
// en mode BOUCLE (runLoop), de son arrêt (requestStop / abort) et du point
// d'entrée CLI (main : codes de sortie, signaux).
// Fiche : docs/cas-utilisation/systeme/UC-SYS-01-traiter-file-jobs.md
//
// Le runner (scripts/runner-node/runner.mjs) est appelé directement, face à
// une API worker SIMULÉE fidèle à api/src/routes/worker.php : file en mémoire
// (queued → running → done), 401 sans le bon jeton, 409 sur un document posté
// pour un job qui n'est plus « running », 200 « recorded » pour toute erreur,
// réponse `{jobs: [], budget: "exceeded"}` au plafond, pannes scriptées
// (503 « Service indisponible », 500 « Erreur interne », réseau, 404).
// LLM = mock du moteur rejouant les fixtures versionnées (schemas/fixtures) ;
// pour main, l'adaptateur OpenAI RÉEL du moteur sur un fetch simulé.
// Contraintes CI moteur : fixtures versionnées lues dans les tests seulement,
// aucun réseau, aucune écriture de fichier.
import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMockProvider, sleep, validateDocument } from '../../../src/index.js'
import {
  createRunner,
  main,
  parseArgs,
  RunnerConfigError,
  USAGE,
  WorkerAuthError,
} from '../../../../scripts/runner-node/runner.mjs'

const TOKEN = 'hwk_test_runner_loop'
const ENDPOINT = 'http://llm.etablissement.test:8000'
const MODEL = 'claude-sonnet-4-5' // tarif moteur : 3 $ / 15 $ par million de tokens
const DAY_TEXT = 'Aujourd’hui j’ai préparé la kermesse et arbitré le tournoi avec Noé.'
const JOB_COST = 0.054 // 8 appels × (1 000 × 3 $ + 250 × 15 $) / 1e6

/** Fixture versionnée (lecture paresseuse, dans les tests seulement). */
function fixture(name) {
  return JSON.parse(readFileSync(new URL(`../../../../schemas/fixtures/${name}`, import.meta.url), 'utf8'))
}

/** Job tel que servi par GET /api/worker/jobs à un établissement « endpoint ». */
function phpJob(id, overrides = {}) {
  return {
    id,
    runId: 45,
    cohorteId: 7,
    userId: 12,
    date: '2026-01-05',
    dayText: DAY_TEXT,
    checkpoint: null,
    promptPackage: { id: 'aurora-v3-reconstruit', version: '1.0.0' },
    referentielVersion: { id: 'respire', version: '7.0.0' },
    provider: { provider: 'endpoint', endpointUrl: ENDPOINT, model: MODEL },
    model: MODEL,
    leaseSeconds: 300,
    ...overrides,
  }
}

function jsonResponse(status, data) {
  return { ok: status >= 200 && status < 300, status, headers: { get: () => null }, json: async () => data }
}

/**
 * API worker simulée (routes/worker.php). `scriptReserve(...)` programme les
 * réponses des prochaines réservations : {status, body} (erreur HTTP),
 * 'network' (fetch rejeté) ou 'budget' (plafond atteint : `{jobs: [],
 * budget: "exceeded"}`, file de l'établissement marquée). `failResults(n)` :
 * les n prochains POST …/result répondent 500 « Erreur interne ».
 */
function workerApi() {
  const referentiel = fixture('referentiel-respire-v7.json')
  const queue = new Map()
  const reservePlan = []
  const requests = []
  const posts = []
  const cancelOnResult = new Set()
  let resultFailures = 0

  const fetchFn = async (url, init = {}) => {
    const { pathname, searchParams } = new URL(url)
    requests.push({ method: init.method, pathname })
    if (init.headers?.['x-worker-token'] !== TOKEN) return jsonResponse(401, { error: 'Jeton worker invalide' })
    if (init.method === 'GET' && pathname === '/api/worker/jobs') {
      const step = reservePlan.shift()
      if (step === 'network') throw new TypeError('fetch failed')
      if (step === 'budget') {
        for (const entry of queue.values()) if (entry.status === 'queued') entry.status = 'budget_exceeded'
        return jsonResponse(200, { jobs: [], budget: 'exceeded' })
      }
      if (step) return jsonResponse(step.status, step.body)
      const limit = Math.max(1, Math.min(20, Number(searchParams.get('limit') ?? 1)))
      const batch = [...queue.values()].filter((e) => e.status === 'queued').slice(0, limit)
      for (const entry of batch) entry.status = 'running'
      return jsonResponse(200, batch.length > 0 ? { jobs: batch.map((e) => e.job), referentiel } : { jobs: [] })
    }
    const match = pathname.match(/^\/api\/worker\/jobs\/(\d+)\/result$/)
    if (init.method === 'POST' && match) {
      const id = Number(match[1])
      const body = JSON.parse(init.body)
      if (resultFailures > 0) {
        resultFailures -= 1
        posts.push({ id, body, status: 500 })
        return jsonResponse(500, { error: 'Erreur interne' })
      }
      const entry = queue.get(id)
      if (cancelOnResult.has(id) && entry.status === 'running') entry.status = 'cancelled'
      if (body.erreur !== undefined) {
        if (entry.status === 'running') entry.status = 'queued' // fail() : tentative + 1, retour en file
        posts.push({ id, body, status: 200 })
        return jsonResponse(200, { id, status: 'recorded' }) // 200 même hors « running »
      }
      if (entry.status !== 'running') {
        posts.push({ id, body, status: 409 })
        return jsonResponse(409, { error: 'Job plus en cours (annulé ou bail repris)' })
      }
      entry.status = 'done'
      posts.push({ id, body, status: 200 })
      return jsonResponse(200, { id, status: 'done' })
    }
    return jsonResponse(404, { error: 'Not found' })
  }

  return {
    fetchFn,
    requests,
    posts,
    enqueue: (...jobs) => jobs.forEach((job) => queue.set(job.id, { job, status: 'queued' })),
    status: (id) => queue.get(id)?.status,
    scriptReserve: (...steps) => reservePlan.push(...steps),
    cancelOnResult: (id) => cancelOnResult.add(id),
    failResults: (n) => { resultFailures = n },
    reservations: () => requests.filter((r) => r.method === 'GET').length,
  }
}

/**
 * Mock LLM du moteur : rejoue la fixture (pôle lu dans le prompt, kairos
 * reconnu à son marqueur). `onCall(n)` est appelé à chaque appel (n global,
 * à partir de 1, tous jobs confondus) ; `latencyMs` > 0 rend l'appel sensible
 * au signal d'interruption (comme un vrai fetch).
 */
function llmFactory({ onCall = () => {}, latencyMs = 0 } = {}) {
  const day = fixture('cartographie-jour-2026-01-05.json')
  let calls = 0
  return () => createMockProvider({
    latencyMs,
    usage: { inputTokens: 1000, outputTokens: 250 },
    responses: ({ prompt }) => {
      calls += 1
      onCall(calls)
      if (prompt.includes('SYNTHÈSE KAIROS')) return JSON.stringify(day.kairos)
      return JSON.stringify(day.poles[Number(prompt.match(/# Pôle (\d) — /)[1]) - 1])
    },
  })
}

function loopRunner(api, { argv = [], llm = llmFactory(), sleepFn = async () => {}, env = { LLM_API_KEY: 'local' } } = {}) {
  const logs = []
  const runner = createRunner({
    options: parseArgs(['--api', 'https://humanome.xyz', '--token', TOKEN, ...argv], {}),
    fetchFn: api.fetchFn,
    createProviderFn: llm,
    log: (line) => logs.push(line),
    sleepFn,
    env,
  })
  return { runner, logs }
}

describe('UC-SYS-01 — runner Node : boucle (--loop)', () => {
  it('UC-SYS-01-U23 — runLoop : passes successives séparées par la pause --loop (s × 1000 ms, signal du runner) ; job arrivé pendant la pause traité à la passe suivante ; 409 (job annulé) posté en erreur sans arrêter la boucle ; totaux cumulés', async () => {
    const api = workerApi()
    api.enqueue(phpJob(1), phpJob(2))
    api.cancelOnResult(2) // annulé par l'établissement pendant son extraction
    const pauses = []
    let runner
    const sleepFn = async (ms, signal) => {
      pauses.push({ ms, signal, abortedBefore: signal.aborted })
      if (pauses.length === 1) {
        api.enqueue(phpJob(3)) // nouveau run lancé pendant la pause
      } else {
        runner.requestStop() // arrêt coopératif demandé PENDANT la pause
        pauses.at(-1).abortedAfterStop = signal.aborted
      }
    }
    let logs
    ;({ runner, logs } = loopRunner(api, { argv: ['--loop', '7'], sleepFn }))

    const totals = await runner.runLoop()

    expect(totals).toEqual({
      passes: 2,
      reserved: 3,
      ok: 2,
      errors: 1,
      tokens: { inputTokens: 24000, outputTokens: 6000 },
      coutUsd: 0.162, // le coût de la journée annulée est compté (et redéclaré au serveur)
    })
    // Une pause après CHAQUE passe, de --loop × 1000 ms, interruptible par le
    // signal du runner ; requestStop() n'interrompt pas la pause en cours.
    expect(pauses.map((p) => p.ms)).toEqual([7000, 7000])
    expect(pauses.every((p) => p.signal instanceof AbortSignal && p.abortedBefore === false)).toBe(true)
    expect(pauses[1].abortedAfterStop).toBe(false)
    // Passe 1 : lot [1, 2] puis file vide ; passe 2 : [3] puis file vide ; plus rien après l'arrêt.
    expect(api.reservations()).toBe(4)
    expect([api.status(1), api.status(2), api.status(3)]).toEqual(['done', 'cancelled', 'done'])
    const job2 = api.posts.filter((p) => p.id === 2)
    expect(job2.map((p) => p.status)).toEqual([409, 200])
    expect(job2[1].body.erreur).toBe('API POST /api/worker/jobs/2/result : HTTP 409 — Job plus en cours (annulé ou bail repris)')
    expect(job2[1].body.coutUsd).toBe(JOB_COST)
    for (const post of api.posts.filter((p) => p.body.document)) {
      expect(validateDocument('cartographie-jour', post.body.document).valid).toBe(true)
    }
    expect(logs.filter((l) => l.startsWith('passe terminée'))).toEqual([
      'passe terminée : 1 OK, 1 en erreur sur 2 réservé(s) — 16000 tokens entrée / 4000 sortie, 0.108 $US',
      'passe terminée : 1 OK, 0 en erreur sur 1 réservé(s) — 8000 tokens entrée / 2000 sortie, 0.054 $US',
    ])
  })

  it('UC-SYS-01-U24 — arrêt : requestStop() pendant un job → ce job est terminé et posté, le reste du lot reste réservé (bail), aucune pause ; abort() pendant la pause → pause réelle coupée aussitôt ; (comportement actuel) abort() pendant l’extraction → rien posté, journalisé « erreur API transitoire », boucle terminée', async () => {
    // (a) Arrêt coopératif au milieu d'un lot de 2.
    const api = workerApi()
    api.enqueue(phpJob(1), phpJob(2))
    let runner
    const pauses = []
    const llm = llmFactory({ onCall: (n) => { if (n === 3) runner.requestStop() } })
    ;({ runner } = loopRunner(api, { argv: ['--loop'], llm, sleepFn: async (ms) => { pauses.push(ms) } }))

    const totals = await runner.runLoop()

    expect(totals).toMatchObject({ passes: 1, reserved: 2, ok: 1, errors: 0 })
    expect(api.status(1)).toBe('done')
    expect(api.posts.map((p) => p.id)).toEqual([1])
    expect(api.status(2)).toBe('running') // réservé, jamais traité : rendu par l'expiration du bail (300 s)
    expect(pauses).toEqual([])
    expect(api.reservations()).toBe(1)

    // (b) abort() pendant la pause : la VRAIE pause du moteur (30 s par défaut)
    // est interrompue par le signal ; la boucle rend ses totaux.
    const idle = workerApi()
    let slept = null
    const started = Date.now()
    const { runner: sleeper } = loopRunner(idle, {
      sleepFn: (ms, signal) => {
        slept = { ms, signal }
        setTimeout(() => sleeper.abort(), 10)
        return sleep(ms, signal)
      },
    })

    const idleTotals = await sleeper.runLoop()

    expect(slept.ms).toBe(30000) // DEFAULT_LOOP_SECONDS × 1000
    expect(slept.signal.aborted).toBe(true)
    expect(Date.now() - started).toBeLessThan(5000)
    expect(idleTotals).toMatchObject({ passes: 1, reserved: 0 })
    expect(sleeper.stopping).toBe(true)

    // (c) abort() pendant l'extraction (appel LLM sensible au signal).
    const busy = workerApi()
    busy.enqueue(phpJob(1))
    let cutter
    const cutLlm = llmFactory({ latencyMs: 1, onCall: (n) => { if (n === 3) cutter.abort() } })
    const cut = loopRunner(busy, { llm: cutLlm, sleepFn: async () => { throw new Error('aucune pause attendue') } })
    cutter = cut.runner

    const cutTotals = await cutter.runLoop()

    // COMPORTEMENT ACTUEL : extractDay enveloppe l'AbortError dans une Error
    // ordinaire ; la boucle la classe en « erreur API transitoire » (et non en
    // interruption), puis sort car le runner est arrêté.
    expect(cutTotals).toMatchObject({ passes: 0, reserved: 0, ok: 0 })
    expect(busy.posts).toEqual([])
    expect(busy.status(1)).toBe('running')
    expect(cut.logs.at(-1)).toMatch(/^erreur API transitoire : extractDay : pôle 4 \(2026-01-05\) — .*abort/i)
  })

  it('UC-SYS-01-U25 — erreurs en boucle : 503, réseau et même 404 journalisés « transitoires » puis pause ; plafond atteint ({budget: "exceeded"}) vu comme une file vide ; passe interrompue par un résultat impossible à poster non comptée ; 401 et configuration impossible arrêtent la boucle', async () => {
    const api = workerApi()
    api.scriptReserve(
      { status: 503, body: { error: 'Service indisponible' } },
      'network',
      { status: 404, body: { error: 'Not found' } },
      'budget',
    )
    const pauses = []
    let runner
    const sleepFn = async (ms) => {
      pauses.push(ms)
      if (ms !== 7000) return // pauses de relance d'envoi (2 s, 4 s)
      const loopPauses = pauses.filter((p) => p === 7000).length
      if (loopPauses === 4) {
        api.enqueue(phpJob(1)) // plafond relevé, nouveau job en file…
        api.failResults(6) // … mais l'API ne peut plus enregistrer de résultat
      }
      if (loopPauses === 5) runner.requestStop()
    }
    let logs
    ;({ runner, logs } = loopRunner(api, { argv: ['--loop', '7'], sleepFn }))

    const totals = await runner.runLoop()

    expect(logs.filter((l) => l.startsWith('erreur API transitoire'))).toEqual([
      'erreur API transitoire : API GET /api/worker/jobs?limit=5 : HTTP 503 — Service indisponible',
      'erreur API transitoire : API GET /api/worker/jobs?limit=5 : erreur réseau (fetch failed)',
      // 404 n'est pas « retentable » pour le client, mais la boucle le retente quand même.
      'erreur API transitoire : API GET /api/worker/jobs?limit=5 : HTTP 404 — Not found',
      'erreur API transitoire : API POST /api/worker/jobs/1/result : HTTP 500 — Erreur interne',
    ])
    // Plafond : même journal qu'une file vide, aucune mention du budget.
    expect(logs).toContain('file vide — aucun job en attente')
    expect(logs.join('\n')).not.toMatch(/budget|plafond/i)
    // Document puis erreur : 3 envois chacun (relances à 2 s puis 4 s), tous refusés.
    expect(api.posts.map((p) => [p.body.document ? 'document' : 'erreur', p.status])).toEqual([
      ['document', 500], ['document', 500], ['document', 500],
      ['erreur', 500], ['erreur', 500], ['erreur', 500],
    ])
    expect(api.posts[3].body).toMatchObject({ erreur: 'API POST /api/worker/jobs/1/result : HTTP 500 — Erreur interne', coutUsd: JOB_COST })
    expect(pauses).toEqual([7000, 7000, 7000, 7000, 2000, 4000, 2000, 4000, 7000])
    expect(api.status(1)).toBe('running') // rendu à la file par le bail
    // Seule la passe « plafond » s'est terminée : la journée extraite (et payée) n'apparaît pas.
    expect(totals).toEqual({ passes: 1, reserved: 0, ok: 0, errors: 0, tokens: { inputTokens: 0, outputTokens: 0 }, coutUsd: 0 })

    // Fatal : jeton refusé, même après des erreurs transitoires — aucune pause de plus.
    const revoked = workerApi()
    revoked.scriptReserve({ status: 503, body: { error: 'Service indisponible' } }, { status: 401, body: { error: 'Jeton worker invalide' } })
    const revokedPauses = []
    const { runner: r401 } = loopRunner(revoked, { sleepFn: async (ms) => { revokedPauses.push(ms) } })
    await expect(r401.runLoop()).rejects.toThrow(WorkerAuthError)
    expect(revokedPauses).toEqual([30000])

    // Fatal : job « humanome » sans --provider (RG9) — rien n'est posté.
    const platform = workerApi()
    platform.enqueue(phpJob(9, { provider: { provider: 'humanome' }, model: null }))
    const { runner: rCfg } = loopRunner(platform, { sleepFn: async () => { throw new Error('aucune pause attendue') } })
    await expect(rCfg.runLoop()).rejects.toThrow(RunnerConfigError)
    expect(platform.posts).toEqual([])
    expect(platform.status(9)).toBe('running')
  })
})

describe('UC-SYS-01 — runner Node : main (codes de sortie, signaux)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  /** Écouteur SIGINT posé par main (différence avec ceux présents avant l'appel). */
  function mainSigint(before) {
    return process.listeners('SIGINT').find((listener) => !before.includes(listener))
  }

  it('UC-SYS-01-U26 — main : --help → 0 ; arguments invalides → 2 ; --once et API en panne → 1 ; --loop + Ctrl-C ×1 → arrêt coopératif, 0, écouteurs retirés ; Ctrl-C ×2 pendant la pause → 0 ; (comportement actuel) Ctrl-C ×2 pendant un appel LLM en --once → 1', async () => {
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    const errText = () => stderr.mock.calls.map(([chunk]) => String(chunk)).join('')
    const base = ['--api', 'https://humanome.xyz', '--token', TOKEN]
    const sigintBefore = process.listeners('SIGINT')
    const sigtermBefore = process.listeners('SIGTERM')

    expect(await main(['--help'], {})).toBe(0)
    expect(String(stdout.mock.calls[0][0])).toBe(`${USAGE}\n`)

    expect(await main([...base, '--loop', '0'], {})).toBe(2)
    expect(errText()).toContain(`Erreur : --loop attend un nombre de secondes >= 1\n\n${USAGE}`)

    // --once : une panne de l'API n'est pas retentée → code 1, message sur stderr.
    stderr.mockClear()
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(503, { error: 'Service indisponible' })))
    expect(await main([...base, '--once'], {})).toBe(1)
    expect(errText()).toContain('ERREUR : API GET /api/worker/jobs?limit=5 : HTTP 503 — Service indisponible')

    // --loop : Ctrl-C ×1 pendant la réservation → fin de passe, pas de pause, code 0.
    stderr.mockClear()
    const reservations = []
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      reservations.push(new URL(url).pathname)
      mainSigint(sigintBefore)()
      return jsonResponse(200, { jobs: [] })
    }))
    expect(await main([...base, '--loop', '1'], {})).toBe(0)
    expect(reservations).toEqual(['/api/worker/jobs'])
    expect(errText()).toContain('arrêt demandé — fin du job en cours puis envoi du résultat')
    expect(process.listeners('SIGINT')).toEqual(sigintBefore)
    expect(process.listeners('SIGTERM')).toEqual(sigtermBefore)

    // --loop : Ctrl-C ×2 pendant la pause réelle (1 s) → interruption immédiate, code 0.
    stderr.mockClear()
    vi.stubGlobal('fetch', vi.fn(async () => {
      const onSignal = mainSigint(sigintBefore)
      setTimeout(() => { onSignal(); onSignal() }, 10)
      return jsonResponse(503, { error: 'Service indisponible' })
    }))
    const started = Date.now()
    expect(await main([...base, '--loop', '1'], {})).toBe(0)
    expect(Date.now() - started).toBeLessThan(900)
    expect(errText()).toContain('interruption immédiate — le lease serveur rendra les jobs en cours à la file')

    // --once : Ctrl-C ×2 pendant le 1er appel LLM (adaptateur OpenAI réel du
    // moteur, fetch simulé qui honore le signal comme le vrai) → rien posté,
    // mais code 1 et « ERREUR » : l'AbortError arrive enveloppée par extractDay.
    stderr.mockClear()
    const referentiel = fixture('referentiel-respire-v7.json')
    const seen = []
    vi.stubGlobal('fetch', vi.fn(async (url, init = {}) => {
      const { pathname } = new URL(url)
      seen.push(`${init.method ?? 'GET'} ${pathname}`)
      if (pathname === '/api/worker/jobs') return jsonResponse(200, { jobs: [phpJob(5)], referentiel })
      if (pathname === '/v1/chat/completions') {
        const onSignal = mainSigint(sigintBefore)
        onSignal()
        onSignal()
        if (init.signal?.aborted) throw new DOMException('This operation was aborted', 'AbortError')
      }
      throw new Error(`requête inattendue ${pathname}`)
    }))
    expect(await main([...base, '--once'], { LLM_API_KEY: 'local' })).toBe(1)
    expect(seen).toEqual(['GET /api/worker/jobs', 'POST /v1/chat/completions'])
    expect(errText()).toMatch(/ERREUR : extractDay : pôle 1 \(2026-01-05\) — This operation was aborted/)
    expect(process.listeners('SIGINT')).toEqual(sigintBefore)
  })
})
