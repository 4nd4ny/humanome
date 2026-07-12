// Machine à états d'un run de cartographie (plan-portage-moteur §Runs).
//
// Un run traite N journées de portfolio ; chaque journée réussie est
// checkpointée { runId, iso, document, completedAt } via l'adaptateur de
// stockage injecté (IndexedDB côté web, mémoire côté tests). À la reprise
// (nouveau createRun avec le même runId + même stockage), les journées déjà
// checkpointées sont SAUTÉES : un run de plusieurs heures survit à un
// rechargement d'onglet.
//
// Interruption coopérative : le signal (AbortSignal) est consulté ENTRE deux
// journées — la journée en cours se termine (et se checkpointe) toujours
// entièrement, jamais d'état partiel. `processDay` reçoit le signal dans son
// contexte s'il veut interrompre plus finement ses propres appels réseau ; une
// exception levée alors que le signal est déjà abandonné compte comme
// interruption, pas comme échec.
//
// Échec d'une journée (exception de processDay ou de validateDay) : la journée
// est marquée `failed` (persistant), le run CONTINUE avec les suivantes ; un
// nouvel appel à start() retentera uniquement les journées non checkpointées.
//
// Le moteur ne lit/n'écrit rien de lui-même (P5) : tout passe par `storage`,
// `processDay` et les callbacks fournis par l'appelant.

import { mergeDays } from '../pipeline/merge.js'
import { createJournal } from './journal.js'

const checkpointKey = (runId, iso) => `run:${runId}:checkpoint:${iso}`
const failedKey = (runId, iso) => `run:${runId}:failed:${iso}`
const metaKey = (runId) => `run:${runId}:meta`

/**
 * Crée un run (sans le démarrer).
 *
 * @param {object} options
 * @param {string} options.runId identifiant stable du run (clé de reprise)
 * @param {Array<{iso: string, getText: Function}>} options.days journées à
 *   traiter, en ordre chronologique ; `iso` est la clé de checkpoint
 * @param {(day: object, ctx: object) => Promise<object>} options.processDay
 *   produit le document `cartographie-jour` d'une journée ; ctx =
 *   { runId, iso, signal, reportUsage({model, tokensIn, tokensOut, costEstimate}) }
 * @param {object} options.storage adaptateur { get, set, delete, keys }
 * @param {(document: object, day: object) => Promise<void>} [options.validateDay]
 *   validation externe (ex. validateDocument('cartographie-jour', doc)) ;
 *   une exception marque la journée `failed`, jamais de checkpoint invalide
 * @param {object} [options.journal] journal créé par createJournal ; défaut :
 *   journal automatique sur le même stockage
 * @param {object} [options.referentiel] document référentiel passé à mergeDays
 * @param {(dayDocs: Array<object>) => Promise<object>|object} [options.merge]
 *   agrégation finale ; défaut : mergeDays(dayDocs, referentiel)
 * @param {(merged: object, ctx: {runId: string, dayDocs: Array<object>}) => Promise<object>|object} [options.finalize]
 *   callback du document final (ex. buildMergeDocument) ; défaut : identité
 * @param {() => string} [options.now] horloge injectable (tests)
 * @returns {{runId: string, status: Function, start: Function, journal: object,
 *   getDayDocuments: Function}}
 */
export function createRun (options = {}) {
  const {
    runId,
    days,
    processDay,
    storage,
    validateDay = null,
    referentiel = null,
    merge = (dayDocs) => mergeDays(dayDocs, referentiel),
    finalize = null,
    now = () => new Date().toISOString()
  } = options

  if (typeof runId !== 'string' || runId === '') throw new TypeError('createRun : runId (string non vide) requis')
  if (!Array.isArray(days) || days.length === 0) throw new TypeError('createRun : days (tableau non vide) requis')
  if (typeof processDay !== 'function') throw new TypeError('createRun : processDay (fonction) requis')
  if (!storage || ['get', 'set', 'delete', 'keys'].some((m) => typeof storage[m] !== 'function')) {
    throw new TypeError('createRun : storage { get, set, delete, keys } requis')
  }
  const isos = new Set()
  for (const day of days) {
    if (!day || typeof day.iso !== 'string' || day.iso === '') throw new TypeError('createRun : chaque jour doit porter un iso (string non vide)')
    if (isos.has(day.iso)) throw new TypeError(`createRun : iso en double « ${day.iso} »`)
    isos.add(day.iso)
  }

  const journal = options.journal ?? createJournal({ runId, storage, now })
  let running = false

  /**
   * Statut courant, recalculé depuis le stockage (donc exact après reprise).
   * @returns {Promise<{total: number, done: number, remaining: number,
   *   failed: Array<{runId: string, iso: string, error: string, failedAt: string}>}>}
   */
  async function status () {
    let done = 0
    const failed = []
    for (const day of days) {
      if (await storage.get(checkpointKey(runId, day.iso)) !== undefined) {
        done += 1
        continue
      }
      const failure = await storage.get(failedKey(runId, day.iso))
      if (failure !== undefined) failed.push(failure)
    }
    return { total: days.length, done, remaining: days.length - done, failed }
  }

  /**
   * Documents jour checkpointés, dans l'ordre de `days` (les manquants sont omis).
   * @returns {Promise<Array<object>>}
   */
  async function getDayDocuments () {
    const docs = []
    for (const day of days) {
      const checkpoint = await storage.get(checkpointKey(runId, day.iso))
      if (checkpoint !== undefined) docs.push(checkpoint.document)
    }
    return docs
  }

  /**
   * Démarre (ou reprend) le run.
   * @param {{signal?: AbortSignal}} [opts]
   * @returns {Promise<{runId: string, aborted: boolean, status: object,
   *   document: object|null}>} `document` n'est non-nul que si TOUTES les
   *   journées sont checkpointées (merge + finalize exécutés)
   */
  async function start ({ signal = null } = {}) {
    if (running) throw new Error(`createRun : run « ${runId} » déjà en cours`)
    running = true
    try {
      const meta = await storage.get(metaKey(runId))
      if (meta === undefined) {
        await storage.set(metaKey(runId), { runId, startedAt: now(), total: days.length })
        await journal.append({ type: 'run_started' })
      } else {
        await journal.append({ type: 'run_resumed' })
      }

      let aborted = false
      for (const day of days) {
        // Point d'interruption coopératif : ENTRE deux journées uniquement.
        if (signal?.aborted) {
          aborted = true
          break
        }
        // Reprise : journée déjà checkpointée → sautée (processDay non appelé).
        if (await storage.get(checkpointKey(runId, day.iso)) !== undefined) continue

        await journal.append({ type: 'day_started', iso: day.iso })
        let usage = null
        const ctx = {
          runId,
          iso: day.iso,
          signal,
          reportUsage (u) {
            usage = { ...(usage ?? {}), ...u }
          }
        }
        try {
          const document = await processDay(day, ctx)
          if (validateDay) await validateDay(document, day)
          // Checkpoint atomique (une seule écriture) : jamais d'état corrompu.
          await storage.set(checkpointKey(runId, day.iso), {
            runId,
            iso: day.iso,
            document,
            completedAt: now()
          })
          await storage.delete(failedKey(runId, day.iso))
          await journal.append({ type: 'day_completed', iso: day.iso, ...(usage ?? {}) })
        } catch (err) {
          if (signal?.aborted) {
            // Exception pendant l'abandon (ex. fetch avorté) : interruption,
            // pas un échec — la journée sera retraitée à la reprise.
            aborted = true
            break
          }
          const message = err instanceof Error ? err.message : String(err)
          await storage.set(failedKey(runId, day.iso), {
            runId,
            iso: day.iso,
            error: message,
            failedAt: now()
          })
          await journal.append({ type: 'day_failed', iso: day.iso, error: message })
        }
      }

      const st = await status()
      if (aborted || st.remaining > 0) {
        return { runId, aborted, status: st, document: null }
      }

      // Toutes les journées sont checkpointées : merge puis document final.
      const dayDocs = await getDayDocuments()
      const merged = await merge(dayDocs)
      const document = finalize ? await finalize(merged, { runId, dayDocs }) : merged
      await journal.append({ type: 'run_completed' })
      return { runId, aborted: false, status: st, document }
    } finally {
      running = false
    }
  }

  return { runId, status, start, journal, getDayDocuments }
}
