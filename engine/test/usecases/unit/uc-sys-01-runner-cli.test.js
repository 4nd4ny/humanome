// UC-SYS-01 — Traiter la file de jobs de masse : tests FONCTIONNELS du runner
// Node (scripts/runner-node/runner.mjs) exécuté en SOUS-PROCESSUS, comme le
// lance un établissement (`node runner.mjs --api … --token … --loop s`).
// Fiche : docs/cas-utilisation/systeme/UC-SYS-01-traiter-file-jobs.md
//
// Scénarios A10 (boucle et pause réelles), A11 (arrêt par VRAIS signaux
// SIGINT/SIGTERM envoyés au processus) et E7 (API en erreur, codes de sortie).
// L'API worker est un serveur HTTP LOCAL (127.0.0.1, port éphémère) fidèle à
// api/src/routes/worker.php (file en mémoire queued → running → done, 401
// sans le bon jeton, 409 sur un document posté hors « running », 200
// « recorded » pour toute erreur) ; le même serveur tient lieu de point
// d'accès LLM compatible OpenAI de l'établissement (`/v1/chat/completions`),
// qui rejoue les fixtures versionnées. Aucun réseau externe, aucune écriture
// de fichier ; les instants d'envoi des signaux sont synchronisés sur le
// journal stderr du runner (pas de délai arbitraire).
import { spawn } from 'node:child_process'
import { readFileSync, realpathSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { validateDocument } from '../../../src/index.js'
import { USAGE } from '../../../../scripts/runner-node/runner.mjs'

const REPO = fileURLToPath(new URL('../../../../', import.meta.url))
const TIMEOUT = 60_000
const TOKEN = 'hwk_test_runner_cli'
const MODEL = 'claude-sonnet-4-5' // tarif moteur : 3 $ / 15 $ par million de tokens
const JOB_COST = 0.054 // 8 appels × (1 000 × 3 $ + 250 × 15 $) / 1e6
const DAY_TEXT = 'Aujourd’hui j’ai préparé la kermesse et arbitré le tournoi avec Noé.'

/** Fixture versionnée (lecture paresseuse, dans les tests seulement). */
function fixture(name) {
  return JSON.parse(readFileSync(new URL(`../../../../schemas/fixtures/${name}`, import.meta.url), 'utf8'))
}

/**
 * API worker + point d'accès LLM simulés, sur un seul serveur local.
 * `scriptReserve(...)` : réponses des prochaines réservations ({status, body}
 * ou 'network' = connexion coupée) ; `hooks.reserve(n)` / `hooks.llm(n)` sont
 * attendus AVANT de répondre à la n-ième réservation / au n-ième appel LLM.
 */
async function startWorkerApi() {
  const referentiel = fixture('referentiel-respire-v7.json')
  const day = fixture('cartographie-jour-2026-01-05.json')
  const queue = new Map()
  const plan = []
  const cancelOnResult = new Set()
  const hooks = { reserve: async () => {}, llm: async () => {} }
  const reservations = []
  const posts = []
  let llmCalls = 0

  async function handle(req, body, send) {
    const { pathname, searchParams } = new URL(req.url, 'http://127.0.0.1')
    if (req.method === 'POST' && pathname === '/v1/chat/completions') {
      llmCalls += 1
      await hooks.llm(llmCalls)
      const payload = JSON.parse(body)
      const prompt = payload.messages.map((m) => m.content).join('\n')
      const text = prompt.includes('SYNTHÈSE KAIROS')
        ? JSON.stringify(day.kairos)
        : JSON.stringify(day.poles[Number(prompt.match(/# Pôle (\d) — /)[1]) - 1])
      return send(200, {
        model: payload.model,
        choices: [{ index: 0, message: { role: 'assistant', content: text }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 1000, completion_tokens: 250 },
      })
    }
    if (req.headers['x-worker-token'] !== TOKEN) return send(401, { error: 'Jeton worker invalide' })
    if (req.method === 'GET' && pathname === '/api/worker/jobs') {
      reservations.push(Date.now())
      const step = plan.shift()
      await hooks.reserve(reservations.length)
      if (step === 'network') return send(null)
      if (step) return send(step.status, step.body)
      const limit = Math.max(1, Math.min(20, Number(searchParams.get('limit') ?? 1)))
      const batch = [...queue.values()].filter((e) => e.status === 'queued').slice(0, limit)
      for (const entry of batch) entry.status = 'running'
      return send(200, batch.length > 0 ? { jobs: batch.map((e) => e.job), referentiel } : { jobs: [] })
    }
    const match = pathname.match(/^\/api\/worker\/jobs\/(\d+)\/result$/)
    if (req.method === 'POST' && match) {
      const id = Number(match[1])
      const payload = JSON.parse(body)
      const entry = queue.get(id)
      if (cancelOnResult.has(id) && entry.status === 'running') entry.status = 'cancelled'
      if (payload.erreur !== undefined) {
        if (entry.status === 'running') entry.status = 'queued'
        posts.push({ id, body: payload, status: 200 })
        return send(200, { id, status: 'recorded' })
      }
      if (entry.status !== 'running') {
        posts.push({ id, body: payload, status: 409 })
        return send(409, { error: 'Job plus en cours (annulé ou bail repris)' })
      }
      entry.status = 'done'
      posts.push({ id, body: payload, status: 200 })
      return send(200, { id, status: 'done' })
    }
    return send(404, { error: 'Not found' })
  }

  const server = createServer((req, res) => {
    let body = ''
    req.on('data', (chunk) => (body += chunk))
    req.on('end', () => {
      const send = (status, data) => {
        if (status === null) return req.socket.destroy() // panne réseau simulée
        if (res.destroyed || res.writableEnded) return // requête coupée par le client
        res.writeHead(status, { 'content-type': 'application/json', connection: 'close' })
        res.end(JSON.stringify(data))
      }
      handle(req, body, send).catch((err) => send(500, { error: `serveur de test : ${err.message}` }))
    })
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${server.address().port}`

  return {
    base,
    hooks,
    reservations,
    posts,
    llmCalls: () => llmCalls,
    /** Job tel que servi à un établissement « endpoint » (le LLM = ce serveur). */
    job: (id, overrides = {}) => ({
      id,
      runId: 45,
      cohorteId: 7,
      userId: 12,
      date: '2026-01-05',
      dayText: DAY_TEXT,
      checkpoint: null,
      promptPackage: { id: 'aurora-v3-reconstruit', version: '1.0.0' },
      referentielVersion: { id: 'respire', version: '7.0.0' },
      provider: { provider: 'endpoint', endpointUrl: base, model: MODEL },
      model: MODEL,
      leaseSeconds: 300,
      ...overrides,
    }),
    enqueue(...jobs) { for (const job of jobs) queue.set(job.id, { job, status: 'queued' }) },
    status: (id) => queue.get(id)?.status,
    scriptReserve: (...steps) => plan.push(...steps),
    cancelOnResult: (id) => cancelOnResult.add(id),
    close: () => new Promise((resolve) => server.close(resolve)),
  }
}

/**
 * Lance `node scripts/runner-node/runner.mjs <args>` ; `waitFor(re)` attend
 * qu'une ligne du journal stderr corresponde ; `exited` rend le code, stdout,
 * stderr et l'instant de sortie.
 */
function startRunner(args, env = {}) {
  const child = spawn(process.execPath, [realpathSync(join(REPO, 'scripts/runner-node/runner.mjs')), ...args], {
    cwd: tmpdir(),
    env: { PATH: process.env.PATH ?? '', NO_PROXY: '127.0.0.1,localhost', ...env },
  })
  const out = { stdout: '', stderr: '' }
  const waiters = []
  child.stdout.on('data', (chunk) => (out.stdout += chunk))
  child.stderr.on('data', (chunk) => {
    out.stderr += chunk
    for (const waiter of [...waiters]) {
      if (waiter.re.test(out.stderr)) {
        waiters.splice(waiters.indexOf(waiter), 1)
        waiter.resolve()
      }
    }
  })
  const exited = new Promise((resolve, reject) => {
    child.on('error', reject)
    child.on('close', (code, signal) => resolve({ code, signal, at: Date.now(), ...out }))
  })
  return {
    child,
    exited,
    waitFor: (re) => (re.test(out.stderr) ? Promise.resolve() : new Promise((resolve) => waiters.push({ re, resolve }))),
  }
}

const runnerArgs = (api, ...extra) => ['--api', api.base, '--token', TOKEN, ...extra]
const LLM_ENV = { LLM_API_KEY: 'local' } // point d'accès local sans authentification : toute valeur
/** Lignes du journal sans l'horodatage. */
const logLines = (stderr) => stderr.split('\n').filter(Boolean).map((line) => line.replace(/^\[[^\]]+\] /, ''))

async function withApi(run) {
  const api = await startWorkerApi()
  try {
    return await run(api)
  } finally {
    await api.close()
  }
}

describe('UC-SYS-01 — runner Node en sous-processus (boucle, signaux, erreurs d’API)', () => {
  it('UC-SYS-01-F22 — A10 : --loop 1 réel — passe, pause d’1 s, job mis en file pendant la pause traité à la passe suivante, 409 (job annulé) posté en erreur sans arrêter la boucle ; SIGINT pendant la pause : pause menée à son terme, aucune passe de plus, code 0', async () => {
    await withApi(async (api) => {
      api.enqueue(api.job(1), api.job(2))
      api.cancelOnResult(2) // annulé par l'établissement pendant son extraction
      const runner = startRunner(runnerArgs(api, '--loop', '1'), LLM_ENV)

      await runner.waitFor(/passe terminée : 1 OK, 1 en erreur sur 2 réservé\(s\)/)
      api.enqueue(api.job(3)) // nouveau job pendant la pause
      await runner.waitFor(/passe terminée : 1 OK, 0 en erreur sur 1 réservé\(s\)/)
      runner.child.kill('SIGINT') // pendant la seconde pause
      const result = await runner.exited

      expect(result.code).toBe(0)
      expect(result.stdout).toBe('')
      // Passe 1 : [1, 2] puis vide ; passe 2 : [3] puis vide ; aucune réservation après l'arrêt.
      expect(api.reservations).toHaveLength(4)
      expect(api.reservations[2] - api.reservations[1]).toBeGreaterThanOrEqual(950) // pause de 1 000 ms
      expect(result.at - api.reservations[3]).toBeGreaterThanOrEqual(950) // pause en cours non écourtée
      expect([api.status(1), api.status(2), api.status(3)]).toEqual(['done', 'cancelled', 'done'])
      expect(api.posts.map((p) => [p.id, p.body.document ? 'document' : 'erreur', p.status])).toEqual([
        [1, 'document', 200], [2, 'document', 409], [2, 'erreur', 200], [3, 'document', 200],
      ])
      expect(api.posts[2].body).toMatchObject({
        erreur: 'API POST /api/worker/jobs/2/result : HTTP 409 — Job plus en cours (annulé ou bail repris)',
        coutUsd: JOB_COST,
      })
      for (const post of api.posts.filter((p) => p.body.document)) {
        expect(validateDocument('cartographie-jour', post.body.document).valid).toBe(true)
      }
      expect(api.llmCalls()).toBe(24)
      const lines = logLines(result.stderr)
      expect(lines[0]).toMatch(/^runner humanome v\S+ — API http:\/\/127\.0\.0\.1:\d+, boucle \(pause 1 s\), fournisseur porté par les jobs$/)
      expect(lines.at(-1)).toBe('arrêt demandé — fin du job en cours puis envoi du résultat (Ctrl-C à nouveau pour couper immédiatement)')
      // Journal sans contenu de portfolio.
      expect(result.stderr).not.toContain('kermesse')
    })
  }, TIMEOUT)

  it('UC-SYS-01-F23 — A11 : vrais signaux — SIGINT ×1 pendant un job → job terminé et posté, reste du lot « running », aucune pause ; SIGINT ×1 pendant la réservation → lot entier « running », aucun job traité ; SIGTERM ×2 pendant la pause → sortie immédiate ; SIGINT ×2 pendant un appel LLM → rien posté, code 0 en --loop, (comportement actuel) code 1 en --once', async () => {
    // (a) SIGINT ×1 au 3e appel LLM du job 1 (lot [1, 2], --loop 30).
    await withApi(async (api) => {
      api.enqueue(api.job(1), api.job(2))
      const runner = startRunner(runnerArgs(api, '--loop', '30'), LLM_ENV)
      api.hooks.llm = async (n) => {
        if (n !== 3) return
        runner.child.kill('SIGINT')
        await runner.waitFor(/arrêt demandé/)
      }
      const result = await runner.exited
      expect(result.code).toBe(0)
      expect(api.posts.map((p) => [p.id, p.status])).toEqual([[1, 200]])
      expect([api.status(1), api.status(2)]).toEqual(['done', 'running']) // job 2 : rendu par le bail
      expect(api.llmCalls()).toBe(8)
      expect(api.reservations).toHaveLength(1)
      expect(result.at - api.reservations[0]).toBeLessThan(20_000) // pas de pause de 30 s
      expect(logLines(result.stderr)).toContain(`passe terminée : 1 OK, 0 en erreur sur 2 réservé(s) — 8000 tokens entrée / 2000 sortie, ${JOB_COST} $US`)
    })

    // (b) SIGINT ×1 PENDANT la réservation : le lot [1, 2] est reçu mais aucun job n'est traité.
    await withApi(async (api) => {
      api.enqueue(api.job(1), api.job(2))
      const runner = startRunner(runnerArgs(api, '--loop', '30'), LLM_ENV)
      api.hooks.reserve = async () => {
        runner.child.kill('SIGINT')
        await runner.waitFor(/arrêt demandé/)
      }
      const result = await runner.exited
      expect(result.code).toBe(0)
      expect(api.posts).toEqual([])
      expect(api.llmCalls()).toBe(0)
      expect([api.status(1), api.status(2)]).toEqual(['running', 'running']) // tout le lot attend le bail
      expect(logLines(result.stderr).slice(-2)).toEqual([
        '2 job(s) réservé(s)',
        'passe terminée : 0 OK, 0 en erreur sur 2 réservé(s) — 0 tokens entrée / 0 sortie, 0 $US',
      ])
    })

    // (c) SIGTERM ×2 pendant la pause de 30 s (file vide) : sortie immédiate, code 0.
    await withApi(async (api) => {
      const runner = startRunner(runnerArgs(api, '--loop', '30'), LLM_ENV)
      await runner.waitFor(/file vide — aucun job en attente/)
      runner.child.kill('SIGTERM')
      await runner.waitFor(/arrêt demandé/)
      const secondSignal = Date.now()
      runner.child.kill('SIGTERM')
      const result = await runner.exited
      expect(result.code).toBe(0)
      expect(result.at - secondSignal).toBeLessThan(5000)
      expect(api.reservations).toHaveLength(1)
      expect(logLines(result.stderr).at(-1)).toBe('interruption immédiate — le lease serveur rendra les jobs en cours à la file')
    })

    // (d) SIGINT ×2 pendant le 3e appel LLM, en --loop puis en --once.
    for (const [mode, code, journal] of [['--loop', 0, 'erreur API transitoire'], ['--once', 1, 'ERREUR']]) {
      await withApi(async (api) => {
        api.enqueue(api.job(1))
        const runner = startRunner(runnerArgs(api, mode), LLM_ENV)
        api.hooks.llm = async (n) => {
          if (n !== 3) return
          runner.child.kill('SIGINT')
          await runner.waitFor(/arrêt demandé/)
          runner.child.kill('SIGINT')
          await runner.waitFor(/interruption immédiate/)
        }
        const result = await runner.exited
        // COMPORTEMENT ACTUEL (anomalie « interruption immédiate mal classée ») :
        // en --once, l'AbortError enveloppée par extractDay donne le code 1.
        expect(result.code, mode).toBe(code)
        expect(api.posts, mode).toEqual([])
        expect(api.status(1), mode).toBe('running')
        expect(logLines(result.stderr).at(-1), mode).toMatch(new RegExp(`^${journal} : extractDay : pôle \\d \\(2026-01-05\\) — This operation was aborted$`))
      })
    }
  }, TIMEOUT)

  it('UC-SYS-01-F24 — E7 : --once + 503 → code 1 ; --loop : 503, coupure réseau et 404 journalisés « transitoires » puis retentés après la pause, 401 → code 3 ; job « humanome » sans --provider → code 4, rien posté ; arguments invalides → 2 ; --help → 0', async () => {
    await withApi(async (api) => {
      api.scriptReserve({ status: 503, body: { error: 'Service indisponible' } })
      const once = await startRunner(runnerArgs(api, '--once')).exited
      expect(once.code).toBe(1)
      expect(logLines(once.stderr).at(-1)).toBe('ERREUR : API GET /api/worker/jobs?limit=5 : HTTP 503 — Service indisponible')
      expect(api.reservations).toHaveLength(1) // pas de nouvel essai en --once

      api.reservations.length = 0
      api.scriptReserve(
        { status: 503, body: { error: 'Service indisponible' } },
        'network',
        { status: 404, body: { error: 'Not found' } },
        { status: 401, body: { error: 'Jeton worker invalide' } },
      )
      const loop = await startRunner(runnerArgs(api, '--loop', '1')).exited
      expect(loop.code).toBe(3)
      expect(logLines(loop.stderr).filter((l) => /^(erreur API transitoire|ERREUR)/.test(l))).toEqual([
        'erreur API transitoire : API GET /api/worker/jobs?limit=5 : HTTP 503 — Service indisponible',
        'erreur API transitoire : API GET /api/worker/jobs?limit=5 : erreur réseau (fetch failed)',
        'erreur API transitoire : API GET /api/worker/jobs?limit=5 : HTTP 404 — Not found',
        `ERREUR : jeton worker refusé par ${api.base} (HTTP 401) — vérifiez --token et le jeton généré dans la configuration de l'établissement`,
      ])
      expect(api.reservations).toHaveLength(4)
      for (let i = 1; i < 4; i += 1) expect(api.reservations[i] - api.reservations[i - 1]).toBeGreaterThanOrEqual(950)

      // Job « humanome » (clé plateforme) sans --provider : configuration impossible.
      api.enqueue(api.job(9, { provider: { provider: 'humanome' }, model: null }))
      const config = await startRunner(runnerArgs(api, '--loop', '1'), LLM_ENV).exited
      expect(config.code).toBe(4)
      expect(logLines(config.stderr).at(-1)).toMatch(/^ERREUR de configuration : job 9 : fournisseur « humanome » inexécutable par le runner/)
      expect(api.posts).toEqual([])
      expect(api.status(9)).toBe('running')
      expect(api.llmCalls()).toBe(0)

      const usage = await startRunner(runnerArgs(api, '--loop', '0')).exited
      expect(usage.code).toBe(2)
      expect(usage.stderr).toBe(`Erreur : --loop attend un nombre de secondes >= 1\n\n${USAGE}\n`)
      const help = await startRunner(['--help']).exited
      expect([help.code, help.stdout, help.stderr]).toEqual([0, `${USAGE}\n`, ''])
    })
  }, TIMEOUT)
})
