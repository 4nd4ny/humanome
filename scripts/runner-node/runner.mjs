#!/usr/bin/env node
// humanome — runner CLI de cartographie de masse (ADR-005, AD-5 ; docs/runner-node.md).
//
// Consomme la MÊME file de jobs que le worker cron OVH, via l'API worker :
//   GET  /api/worker/jobs?limit=n        (en-tête X-Worker-Token) → réserve des
//        jobs (statut running, lease serveur 5 min) ;
//   POST /api/worker/jobs/{id}/result    {document | erreur, tokens, coutUsd}.
//
// Chaque job = (membre, journée) : le runner exécute l'extraction de la journée
// avec LE MOTEUR JS (engine extractDay, kairosOptional) contre le LLM choisi —
// options CLI (--provider/--endpoint/--model) ou configuration portée par le
// job. Le MERGE (déterministe, parité oracle) reste au moteur côté
// navigateur/Node à l'affichage : le runner ne produit que des documents
// `cartographie-jour`.
//
// SANS ÉTAT : aucun fichier local, aucune reprise propre — un job interrompu
// est rendu à la file par l'expiration du lease serveur. RGPD : le journal
// local ne contient JAMAIS le texte des portfolios ni d'extrait de réponse LLM
// (compteurs, identifiants, durées, coûts uniquement) ; le message d'erreur
// complet, lui, part au serveur (rapport de run de l'établissement, couvert
// par le consentement de cohorte).

import { pathToFileURL } from 'node:url'

import {
  createProvider,
  extractDay,
  getModelPricing,
  sleep,
  SUPPORTED_PROVIDERS,
} from '../../engine/src/index.js'

export const RUNNER_VERSION = '0.1.0'
export const DEFAULT_LIMIT = 5
export const DEFAULT_LOOP_SECONDS = 30
// Budget de sortie par appel : valeur fiabilisée en production (M5).
export const DEFAULT_MAX_TOKENS = 8192
export const RESULT_POST_ATTEMPTS = 3

/** Variable d'environnement de clé API par fournisseur (LLM_API_KEY = générique). */
export const API_KEY_ENV_BY_PROVIDER = Object.freeze({
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  google: 'GOOGLE_API_KEY',
  xai: 'XAI_API_KEY',
  openrouter: 'OPENROUTER_API_KEY',
  ollama: null,
})

export const USAGE = `runner humanome v${RUNNER_VERSION} — cartographie de masse via la file de jobs (ADR-005)

Usage :
  node scripts/runner-node/runner.mjs --api <url> --token <worker_token> [options]

Options :
  --api <url>        URL de la plateforme (ex. https://humanome.xyz)
  --token <token>    jeton worker de l'établissement (ou variable HUMANOME_WORKER_TOKEN)
  --provider <nom>   force le fournisseur LLM : ${SUPPORTED_PROVIDERS.join(' | ')}
  --endpoint <url>   URL de base du fournisseur (ex. http://localhost:11434 pour Ollama)
  --model <id>       modèle à utiliser (sinon celui porté par le job)
  --api-key <clé>    clé API du fournisseur (sinon LLM_API_KEY ou la variable dédiée :
                     ANTHROPIC_API_KEY, OPENAI_API_KEY, …)
  --max-tokens <n>   budget de sortie par appel LLM (défaut : ${DEFAULT_MAX_TOKENS})
  --limit <n>        jobs réservés par requête (défaut : ${DEFAULT_LIMIT})
  --once             une passe : vide la file puis s'arrête (défaut)
  --loop [s]         boucle : re-consulte la file toutes les <s> secondes (défaut : ${DEFAULT_LOOP_SECONDS})
  --help             affiche cette aide

Exemples :
  # Établissement avec Ollama local :
  node scripts/runner-node/runner.mjs --api https://humanome.xyz --token "$HUMANOME_WORKER_TOKEN" \\
    --provider ollama --endpoint http://localhost:11434 --model qwen3:32b --loop 30

  # Endpoint compatible OpenAI (vLLM, LM Studio, passerelle interne) :
  LLM_API_KEY=local node scripts/runner-node/runner.mjs --api https://humanome.xyz \\
    --token "$HUMANOME_WORKER_TOKEN" --provider openai --endpoint http://gpu.interne:8000 --model mistral-large

Codes de sortie : 0 passe/boucle terminée · 1 erreur d'exécution · 2 arguments invalides ·
3 jeton worker refusé · 4 configuration fournisseur impossible`

// --- Erreurs typées ----------------------------------------------------------

/** Arguments CLI invalides (code de sortie 2). */
export class UsageError extends Error {}

/** Jeton X-Worker-Token refusé par l'API (code de sortie 3). */
export class WorkerAuthError extends Error {}

/** Configuration fournisseur inexécutable par le runner (code de sortie 4). */
export class RunnerConfigError extends Error {}

/** Erreur HTTP/réseau de l'API worker (hors authentification). */
export class WorkerApiError extends Error {
  constructor(message, { status = 0, retryable = false, cause } = {}) {
    super(message)
    this.name = 'WorkerApiError'
    this.status = status
    this.retryable = retryable
    if (cause !== undefined) this.cause = cause
  }
}

// --- Arguments CLI -----------------------------------------------------------

/**
 * @param {string[]} argv arguments (sans node ni le chemin du script)
 * @param {Record<string, string|undefined>} env variables d'environnement
 * @returns {object} options du runner
 * @throws {UsageError}
 */
export function parseArgs(argv = [], env = {}) {
  const options = {
    api: null,
    token: env.HUMANOME_WORKER_TOKEN || null,
    provider: null,
    endpoint: null,
    model: null,
    apiKey: null,
    maxTokens: DEFAULT_MAX_TOKENS,
    limit: DEFAULT_LIMIT,
    mode: 'once',
    loopSeconds: DEFAULT_LOOP_SECONDS,
    help: false,
  }

  const next = (flag, i) => {
    const value = argv[i + 1]
    if (value === undefined || value.startsWith('--')) {
      throw new UsageError(`${flag} attend une valeur`)
    }
    return value
  }
  const nextInt = (flag, i, min) => {
    const n = Number(next(flag, i))
    if (!Number.isInteger(n) || n < min) {
      throw new UsageError(`${flag} attend un entier >= ${min}`)
    }
    return n
  }

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    switch (arg) {
      case '--api': options.api = next(arg, i); i += 1; break
      case '--token': options.token = next(arg, i); i += 1; break
      case '--provider': {
        const p = next(arg, i)
        if (!SUPPORTED_PROVIDERS.includes(p)) {
          throw new UsageError(`fournisseur inconnu « ${p} » (supportés : ${SUPPORTED_PROVIDERS.join(', ')})`)
        }
        options.provider = p
        i += 1
        break
      }
      case '--endpoint': options.endpoint = next(arg, i); i += 1; break
      case '--model': options.model = next(arg, i); i += 1; break
      case '--api-key': options.apiKey = next(arg, i); i += 1; break
      case '--max-tokens': options.maxTokens = nextInt(arg, i, 256); i += 1; break
      case '--limit': options.limit = nextInt(arg, i, 1); i += 1; break
      case '--once': options.mode = 'once'; break
      case '--loop': {
        options.mode = 'loop'
        const value = argv[i + 1]
        if (value !== undefined && !value.startsWith('--')) {
          const n = Number(value)
          if (!Number.isInteger(n) || n < 1) {
            throw new UsageError('--loop attend un nombre de secondes >= 1')
          }
          options.loopSeconds = n
          i += 1
        }
        break
      }
      case '--help':
      case '-h': options.help = true; break
      default:
        throw new UsageError(`option inconnue : ${arg}`)
    }
  }

  if (options.help) return options
  if (!options.api) throw new UsageError('--api <url> est requis (ex. https://humanome.xyz)')
  try {
    void new URL(options.api)
  } catch {
    throw new UsageError(`--api : URL invalide (« ${options.api} »)`)
  }
  if (!options.token) {
    throw new UsageError('--token <worker_token> est requis (ou variable HUMANOME_WORKER_TOKEN)')
  }
  if (options.endpoint) {
    try {
      void new URL(options.endpoint)
    } catch {
      throw new UsageError(`--endpoint : URL invalide (« ${options.endpoint} »)`)
    }
  }
  return options
}

// --- Résolution du fournisseur LLM ------------------------------------------

/**
 * Choisit le fournisseur d'un job : les options CLI priment, sinon la
 * configuration portée par le job ('endpoint' = dialecte OpenAI-compatible de
 * l'établissement ; 'humanome' = clé plateforme, qui ne quitte JAMAIS le
 * serveur → inexécutable ici, réservée au worker cron).
 *
 * @returns {{provider: string, baseUrl: ?string, model: string, apiKey: ?string,
 *   maxTokens: number, temperature: (number|undefined)}}
 * @throws {RunnerConfigError} erreur de CONFIGURATION (pas un défaut du job :
 *   on ne poste rien, le lease rendra le job à la file)
 */
export function resolveProviderConfig(job = {}, options = {}, env = {}) {
  const jobCfg = job.provider && typeof job.provider === 'object' ? job.provider : {}
  const model = options.model ?? job.model ?? jobCfg.model ?? null

  let provider = null
  let baseUrl = null
  if (options.provider) {
    provider = options.provider
    baseUrl = options.endpoint ?? null
  } else if (jobCfg.provider === 'endpoint') {
    if (typeof jobCfg.endpointUrl !== 'string' || jobCfg.endpointUrl === '') {
      throw new RunnerConfigError(
        `job ${job.id ?? '?'} : fournisseur « endpoint » sans endpointUrl — corrigez la `
        + "configuration LLM de l'établissement ou passez --provider/--endpoint/--model",
      )
    }
    provider = 'openai' // point d'accès établissement = dialecte chat-completions (§4.9)
    baseUrl = jobCfg.endpointUrl
  } else if (SUPPORTED_PROVIDERS.includes(jobCfg.provider)) {
    provider = jobCfg.provider
    baseUrl = typeof jobCfg.endpointUrl === 'string' && jobCfg.endpointUrl !== '' ? jobCfg.endpointUrl : null
  } else {
    throw new RunnerConfigError(
      `job ${job.id ?? '?'} : fournisseur « ${jobCfg.provider ?? 'non défini'} » inexécutable par le `
      + 'runner (la clé plateforme reste sur le serveur — worker cron uniquement) ; passez '
      + "--provider, --endpoint et --model pour utiliser l'infrastructure LLM de l'établissement",
    )
  }

  if (!model) {
    throw new RunnerConfigError(
      `job ${job.id ?? '?'} : aucun modèle (ni --model, ni job.model, ni provider.model du job)`,
    )
  }

  let apiKey = options.apiKey ?? null
  if (!apiKey) {
    const envName = API_KEY_ENV_BY_PROVIDER[provider]
    apiKey = env.LLM_API_KEY || (envName ? env[envName] : null) || null
  }
  if (!apiKey && provider !== 'ollama') {
    const envName = API_KEY_ENV_BY_PROVIDER[provider]
    throw new RunnerConfigError(
      `fournisseur ${provider} : clé API absente — utilisez --api-key ou la variable LLM_API_KEY`
      + (envName ? ` (ou ${envName})` : '')
      + ' ; pour un endpoint local sans authentification, toute valeur convient (ex. --api-key local)',
    )
  }

  return {
    provider,
    baseUrl,
    model,
    apiKey,
    maxTokens: Number.isInteger(job.maxTokens) && job.maxTokens > 0 ? job.maxTokens : options.maxTokens ?? DEFAULT_MAX_TOKENS,
    temperature: typeof job.temperature === 'number' ? job.temperature : undefined,
  }
}

// --- Coût et journalisation --------------------------------------------------

/**
 * Coût estimé en USD via la table de prix du moteur (getModelPricing).
 * Modèle inconnu de la table (LLM local…) → 0 (coût marginal nul).
 */
export function computeCostUsd(model, usage = {}) {
  const pricing = getModelPricing(model)
  if (!pricing) return 0
  const cost = ((usage.inputTokens ?? 0) * pricing.input + (usage.outputTokens ?? 0) * pricing.output) / 1e6
  return Math.round(cost * 1e6) / 1e6
}

/**
 * Expurge un message d'erreur pour le journal local : les extraits cités
 * « … » (réponses LLM, donc potentiellement des verbatims de portfolio) sont
 * masqués. Le message complet, lui, part au serveur avec le résultat du job.
 */
export function sanitizeForLog(message) {
  return String(message).replace(/«[^»]*»/g, '« extrait masqué (RGPD) »')
}

/** Journal horodaté sur stderr (compteurs et identifiants, jamais de contenu). */
export function createLogger(write = (line) => process.stderr.write(line)) {
  return (message) => write(`[${new Date().toISOString()}] ${message}\n`)
}

const round6 = (n) => Math.round(n * 1e6) / 1e6

// --- Client de l'API worker ---------------------------------------------------

/**
 * Client minimal de l'API worker (contrat M8) : réservation de jobs et dépôt
 * des résultats, authentifiés par X-Worker-Token. fetch injectable (tests).
 */
export function createApiClient({ apiBase, token, fetchFn = globalThis.fetch, sleepFn = sleep, signal } = {}) {
  const base = String(apiBase ?? '').replace(/\/+$/, '')

  async function request(method, path, body) {
    let response
    try {
      response = await fetchFn(`${base}${path}`, {
        method,
        headers: {
          'x-worker-token': token,
          accept: 'application/json',
          ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal,
      })
    } catch (err) {
      if (err?.name === 'AbortError') throw err
      throw new WorkerApiError(`API ${method} ${path} : erreur réseau (${err?.message ?? err})`, {
        status: 0,
        retryable: true,
        cause: err,
      })
    }
    if (response.status === 401 || response.status === 403) {
      throw new WorkerAuthError(
        `jeton worker refusé par ${base} (HTTP ${response.status}) — vérifiez --token `
        + "et le jeton généré dans la configuration de l'établissement",
      )
    }
    if (!response.ok) {
      let detail = ''
      try {
        const data = await response.json()
        detail = data?.erreur ?? data?.error ?? data?.message ?? ''
      } catch {
        /* corps non JSON : détail vide */
      }
      throw new WorkerApiError(
        `API ${method} ${path} : HTTP ${response.status}${detail ? ` — ${detail}` : ''}`,
        { status: response.status, retryable: response.status === 429 || response.status >= 500 },
      )
    }
    if (response.status === 204) return null
    try {
      return await response.json()
    } catch (err) {
      throw new WorkerApiError(`API ${method} ${path} : réponse non-JSON`, {
        status: response.status,
        cause: err,
      })
    }
  }

  return {
    /** Réserve jusqu'à `limit` jobs (le serveur pose le lease). */
    reserveJobs: (limit) => request('GET', `/api/worker/jobs?limit=${encodeURIComponent(limit)}`),

    /**
     * Poste le résultat (document ou erreur). Un résultat perdu = un job
     * recalculé (et repayé) au prochain lease : 3 tentatives sur
     * réseau/429/5xx avant d'abandonner.
     */
    async postResult(jobId, payload) {
      let lastErr
      for (let attempt = 1; attempt <= RESULT_POST_ATTEMPTS; attempt++) {
        try {
          return await request('POST', `/api/worker/jobs/${encodeURIComponent(jobId)}/result`, payload)
        } catch (err) {
          if (
            err instanceof WorkerAuthError
            || err?.name === 'AbortError'
            || (err instanceof WorkerApiError && !err.retryable)
          ) throw err
          lastErr = err
          if (attempt < RESULT_POST_ATTEMPTS) await sleepFn(attempt * 2000, signal)
        }
      }
      throw lastErr
    },
  }
}

// --- Runner --------------------------------------------------------------------

/**
 * Crée un runner : `runOnce()` vide la file puis rend la main, `runLoop()`
 * boucle avec pause. Tout est injectable pour les tests (fetchFn,
 * createProviderFn, log, sleepFn, env, now).
 */
export function createRunner({
  options,
  fetchFn = globalThis.fetch,
  createProviderFn = createProvider,
  log = createLogger(),
  sleepFn = sleep,
  env = process.env,
  now = () => Date.now(),
} = {}) {
  if (!options || typeof options !== 'object') {
    throw new TypeError('createRunner : options (résultat de parseArgs) requises')
  }
  const abortController = new AbortController()
  const state = { stopRequested: false }
  const api = createApiClient({
    apiBase: options.api,
    token: options.token,
    fetchFn,
    sleepFn,
    signal: abortController.signal,
  })

  const stopping = () => state.stopRequested || abortController.signal.aborted

  /** Document référentiel COMPLET (exploitable par extractDay) — par
   *  opposition aux métadonnées de version figée ({id, version}) que
   *  l'API sert par ailleurs sous referentielVersion. */
  function isFullReferentiel(ref) {
    return Boolean(ref) && Array.isArray(ref.poles) && Array.isArray(ref.competences)
  }

  /** Détecte une charge utile de job inexploitable (défaut serveur → posté en erreur). */
  function payloadProblem(job, referentiel) {
    if (typeof job.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(job.date)) {
      return 'date absente ou non ISO (AAAA-MM-JJ)'
    }
    if (typeof job.dayText !== 'string' || job.dayText.trim() === '') {
      return 'dayText absent ou vide'
    }
    if (!isFullReferentiel(referentiel)) {
      return 'referentiel absent (ni dans le job, ni partagé dans la réponse de réservation)'
    }
    return null
  }

  async function processJob(job, sharedReferentiel, stats) {
    const t0 = now()
    // Le document complet porté par le job prime ; toute autre forme (absente
    // ou métadonnées seules) retombe sur le document partagé du lot.
    const referentiel = isFullReferentiel(job.referentiel) ? job.referentiel : sharedReferentiel

    const problem = payloadProblem(job, referentiel)
    if (problem) {
      log(`job ${job.id} : charge utile invalide — ${problem}`)
      await api.postResult(job.id, {
        erreur: `runner : charge utile de job invalide — ${problem}`,
        tokens: { inputTokens: 0, outputTokens: 0 },
        coutUsd: 0,
      })
      stats.errors += 1
      return
    }

    // RunnerConfigError remonte telle quelle : défaut de configuration du
    // runner, pas du job — rien n'est posté, le lease rendra le job.
    const cfg = resolveProviderConfig(job, options, env)
    const provider = createProviderFn({
      provider: cfg.provider,
      ...(cfg.apiKey ? { apiKey: cfg.apiKey } : {}),
      ...(cfg.baseUrl ? { baseUrl: cfg.baseUrl } : {}),
      fetchFn,
    })

    // Enveloppe comptable : additionne l'usage réel déclaré par le provider
    // (extractDay ne retourne que le document).
    const usage = { inputTokens: 0, outputTokens: 0 }
    const countingProvider = {
      name: provider.name,
      async complete(params) {
        const res = await provider.complete(params)
        usage.inputTokens += res.usage?.inputTokens ?? 0
        usage.outputTokens += res.usage?.outputTokens ?? 0
        return res
      },
    }

    log(`job ${job.id} (journée ${job.date}) : extraction via ${cfg.provider}/${cfg.model} (8 appels LLM)`)
    try {
      const document = await extractDay({
        dayText: job.dayText,
        date: job.date,
        referentiel,
        provider: countingProvider,
        model: cfg.model,
        maxTokens: cfg.maxTokens,
        temperature: cfg.temperature,
        signal: abortController.signal,
        kairosOptional: true,
        onProgress: ({ step, poleNum, done, total, skipped }) => {
          if (step === 'pole') log(`job ${job.id} : pôle ${poleNum} extrait (${done}/${total})`)
          else log(`job ${job.id} : synthèse kairos ${skipped ? 'dégradée à null (kairosOptional)' : 'extraite'} (${done}/${total})`)
        },
      })
      const coutUsd = computeCostUsd(cfg.model, usage)
      await api.postResult(job.id, {
        document,
        tokens: { ...usage },
        coutUsd,
        model: cfg.model,
        durationMs: now() - t0,
      })
      stats.ok += 1
      stats.tokens.inputTokens += usage.inputTokens
      stats.tokens.outputTokens += usage.outputTokens
      stats.coutUsd = round6(stats.coutUsd + coutUsd)
      log(
        `job ${job.id} : OK en ${Math.round((now() - t0) / 1000)} s — `
        + `${usage.inputTokens} tokens entrée / ${usage.outputTokens} sortie, ${coutUsd} $US`,
      )
    } catch (err) {
      if (err?.name === 'AbortError' || abortController.signal.aborted) throw err
      const message = err instanceof Error ? err.message : String(err)
      const coutUsd = computeCostUsd(cfg.model, usage)
      // Les tokens consommés par un échec comptent aussi dans le budget de
      // l'établissement : ils partent avec l'erreur.
      await api.postResult(job.id, {
        erreur: message,
        tokens: { ...usage },
        coutUsd,
        model: cfg.model,
        durationMs: now() - t0,
      })
      stats.errors += 1
      stats.tokens.inputTokens += usage.inputTokens
      stats.tokens.outputTokens += usage.outputTokens
      stats.coutUsd = round6(stats.coutUsd + coutUsd)
      log(`job ${job.id} : ÉCHEC — ${sanitizeForLog(message)}`)
    }
  }

  /** Une passe : réserve et traite des jobs jusqu'à file vide, puis rend la main. */
  async function runOnce() {
    const stats = {
      reserved: 0,
      ok: 0,
      errors: 0,
      tokens: { inputTokens: 0, outputTokens: 0 },
      coutUsd: 0,
    }
    const postedIds = new Set()
    while (!stopping()) {
      const data = await api.reserveJobs(options.limit)
      const jobs = Array.isArray(data?.jobs) ? data.jobs : []
      if (jobs.length === 0) break
      // Garde-fou de facturation : un job dont le résultat a DÉJÀ été accepté
      // dans cette passe ne doit pas être repayé si le serveur (défectueux)
      // le re-sert — lot entièrement connu = anomalie, passe interrompue.
      const fresh = jobs.filter((j) => !postedIds.has(j?.id))
      if (fresh.length === 0) {
        log(`ANOMALIE serveur : lot re-servi alors que ses résultats ont été acceptés (jobs ${jobs.map((j) => j?.id).join(', ')}) — passe interrompue`)
        break
      }
      stats.reserved += fresh.length
      log(`${fresh.length} job(s) réservé(s)`)
      for (const job of fresh) {
        if (stopping()) break
        if (job?.id === undefined || job?.id === null) {
          log('job sans id ignoré (réponse serveur invalide)')
          stats.errors += 1
          continue
        }
        await processJob(job, data.referentiel ?? null, stats)
        postedIds.add(job.id)
      }
    }
    if (stats.reserved === 0) {
      log('file vide — aucun job en attente')
    } else {
      log(
        `passe terminée : ${stats.ok} OK, ${stats.errors} en erreur sur ${stats.reserved} réservé(s) — `
        + `${stats.tokens.inputTokens} tokens entrée / ${stats.tokens.outputTokens} sortie, ${stats.coutUsd} $US`,
      )
    }
    return stats
  }

  /** Boucle : passes successives avec pause ; survit aux erreurs API transitoires. */
  async function runLoop() {
    const totals = {
      passes: 0,
      reserved: 0,
      ok: 0,
      errors: 0,
      tokens: { inputTokens: 0, outputTokens: 0 },
      coutUsd: 0,
    }
    while (!stopping()) {
      try {
        const stats = await runOnce()
        totals.passes += 1
        totals.reserved += stats.reserved
        totals.ok += stats.ok
        totals.errors += stats.errors
        totals.tokens.inputTokens += stats.tokens.inputTokens
        totals.tokens.outputTokens += stats.tokens.outputTokens
        totals.coutUsd = round6(totals.coutUsd + stats.coutUsd)
      } catch (err) {
        // Fatal : jeton refusé, configuration impossible, interruption.
        if (
          err instanceof WorkerAuthError
          || err instanceof RunnerConfigError
          || err?.name === 'AbortError'
        ) throw err
        // Transitoire (réseau, 5xx…) : on journalise et on retentera après la pause.
        log(`erreur API transitoire : ${sanitizeForLog(err?.message ?? String(err))}`)
      }
      if (stopping()) break
      try {
        await sleepFn(options.loopSeconds * 1000, abortController.signal)
      } catch (err) {
        if (err?.name === 'AbortError') break
        throw err
      }
    }
    return totals
  }

  return {
    runOnce,
    runLoop,
    /** Arrêt coopératif : termine (et poste) le job en cours, puis s'arrête. */
    requestStop() { state.stopRequested = true },
    /** Arrêt immédiat : coupe les appels en cours (le lease rendra les jobs). */
    abort() { abortController.abort() },
    get stopping() { return stopping() },
  }
}

// --- Point d'entrée CLI ---------------------------------------------------------

/** @returns {Promise<number>} code de sortie */
export async function main(argv = process.argv.slice(2), env = process.env) {
  let options
  try {
    options = parseArgs(argv, env)
  } catch (err) {
    if (err instanceof UsageError) {
      process.stderr.write(`Erreur : ${err.message}\n\n${USAGE}\n`)
      return 2
    }
    throw err
  }
  if (options.help) {
    process.stdout.write(`${USAGE}\n`)
    return 0
  }

  const log = createLogger()
  const runner = createRunner({ options, log, env })

  let interrupts = 0
  const onSignal = () => {
    interrupts += 1
    if (interrupts === 1) {
      log('arrêt demandé — fin du job en cours puis envoi du résultat (Ctrl-C à nouveau pour couper immédiatement)')
      runner.requestStop()
    } else {
      log('interruption immédiate — le lease serveur rendra les jobs en cours à la file')
      runner.abort()
    }
  }
  process.on('SIGINT', onSignal)
  process.on('SIGTERM', onSignal)

  log(
    `runner humanome v${RUNNER_VERSION} — API ${options.api}, `
    + (options.mode === 'loop' ? `boucle (pause ${options.loopSeconds} s)` : 'une passe (--once)')
    + (options.provider ? `, fournisseur CLI ${options.provider}${options.model ? `/${options.model}` : ''}` : ', fournisseur porté par les jobs'),
  )
  try {
    if (options.mode === 'loop') await runner.runLoop()
    else await runner.runOnce()
    return 0
  } catch (err) {
    if (err?.name === 'AbortError') return 0
    if (err instanceof WorkerAuthError) {
      log(`ERREUR : ${err.message}`)
      return 3
    }
    if (err instanceof RunnerConfigError) {
      log(`ERREUR de configuration : ${err.message}`)
      return 4
    }
    log(`ERREUR : ${sanitizeForLog(err?.message ?? String(err))}`)
    return 1
  } finally {
    process.off('SIGINT', onSignal)
    process.off('SIGTERM', onSignal)
  }
}

const isMain = process.argv[1] !== undefined
  && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMain) {
  main().then((code) => {
    process.exitCode = code
  })
}
