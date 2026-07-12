// Lancement d'un run de cartographie (P8.3) — logique pure, sans React.
//
// Le composant web/src/components/RunWizard.jsx n'est qu'une coquille UI
// autour de ce module : choix du paquet de prompts, gestion des clés API
// (localStorage par défaut, opt-in serveur chiffré AD-4), estimation avant
// lancement (engine estimateRun), exécution avec checkpoints/reprise
// (engine createRun + createIndexedDbStorage) et construction du document
// merge final SANS narratifs LLM (v1 : résumés locaux déterministes —
// les récits narratifs de fusion arrivent avec le banc promptologue, P10).
//
// RGPD : la clé API ne quitte JAMAIS ce module en clair vers un log ; elle vit
// dans localStorage ('humanome-keys') par défaut, et ne part au serveur (PUT
// api/keys, chiffrement sodium côté serveur) que sur opt-in explicite.

import {
  createProvider,
  estimateRun,
  getModelPricing,
} from '@engine/providers/index.js'
import { createRun, createIndexedDbStorage } from '@engine/runs/index.js'
import { extractDay, buildExtractionPrompt } from '@engine/pipeline/extract.js'
import { buildMergeDocument } from '@engine/pipeline/merge-document.js'
import { validateDocument } from '@engine/validation.js'
import { apiFetch } from '../api/client.js'
import { createDemoProvider, DEMO_MODEL, DEMO_MAX_TOKENS } from './demo-llm.js'

// --- Constantes ------------------------------------------------------------

export const KEYS_STORAGE_KEY = 'humanome-keys'

/** Budget de sortie par appel — leçon M5 : 8192 tokens en production. */
export const RUN_MAX_TOKENS = 8192

/** Fournisseurs proposés pour « Clé personnelle » (engine SUPPORTED_PROVIDERS). */
export const PROVIDERS = Object.freeze([
  { id: 'anthropic', label: 'Anthropic (Claude)', defaultModel: 'claude-sonnet-4-6', requiresKey: true },
  { id: 'openai', label: 'OpenAI (GPT)', defaultModel: 'gpt-4o-mini', requiresKey: true },
  { id: 'google', label: 'Google (Gemini)', defaultModel: 'gemini-2.5-flash', requiresKey: true },
  { id: 'xai', label: 'xAI (Grok)', defaultModel: 'grok-4', requiresKey: true },
  { id: 'openrouter', label: 'OpenRouter', defaultModel: 'anthropic/claude-sonnet-4.6', requiresKey: true },
  { id: 'ollama', label: 'Ollama (modèle local, sans clé)', defaultModel: 'llama3.1', requiresKey: false },
])

/**
 * Paquet de prompts embarqué : le protocole Aurora v3 reconstruit en P5
 * (engine/src/pipeline/extract.js) — repli garanti quand l'API est absente.
 */
export const BUILTIN_PACKAGE = Object.freeze({
  id: 'aurora-v3-reconstruit',
  version: '1.0.0',
  description: 'Protocole Aurora v3 reconstruit — embarqué dans le moteur (toujours disponible).',
  builtin: true,
})

/** Modèle de référence pour ESTIMER un run « Service humanome » (prod M5). */
export const SERVICE_ESTIMATION_MODEL = 'claude-sonnet-5'

// --- Clés API locales (localStorage 'humanome-keys') ------------------------

function keysStorage(storage) {
  return storage ?? globalThis.localStorage ?? null
}

/** @returns {Record<string, string>} table provider -> clé (localStorage) */
export function readLocalKeys(storage) {
  const s = keysStorage(storage)
  if (!s) return {}
  try {
    const data = JSON.parse(s.getItem(KEYS_STORAGE_KEY) ?? '{}')
    return data && typeof data === 'object' ? data : {}
  } catch {
    return {}
  }
}

/** @returns {string} clé locale du fournisseur ('' si absente) */
export function getLocalKey(provider, storage) {
  const value = readLocalKeys(storage)[provider]
  return typeof value === 'string' ? value : ''
}

/** Mémorise (ou efface avec '') la clé locale d'un fournisseur. */
export function setLocalKey(provider, apiKey, storage) {
  const s = keysStorage(storage)
  if (!s) return
  const keys = readLocalKeys(storage)
  if (apiKey) keys[provider] = apiKey
  else delete keys[provider]
  try {
    s.setItem(KEYS_STORAGE_KEY, JSON.stringify(keys))
  } catch {
    /* stockage indisponible : la clé reste en mémoire de session */
  }
}

// --- Clés API serveur (opt-in AD-4, chiffrées côté serveur) -----------------

/** PUT api/keys — opt-in explicite « synchroniser sur le serveur (chiffrée) ». */
export function syncKeyToServer(provider, apiKey, { apiFetchFn = apiFetch } = {}) {
  return apiFetchFn('keys', { method: 'PUT', body: { provider, apiKey } })
}

/** GET api/keys/{provider} — synchronisation AD-4 (propriétaire authentifié). */
export async function fetchKeyFromServer(provider, { apiFetchFn = apiFetch } = {}) {
  const data = await apiFetchFn(`keys/${encodeURIComponent(provider)}`)
  if (typeof data?.apiKey !== 'string' || data.apiKey === '') {
    throw new Error('Aucune clé enregistrée sur le serveur pour ce fournisseur.')
  }
  return data.apiKey
}

// --- Paquets de prompts ------------------------------------------------------

/**
 * Versions de prompts proposables : le paquet embarqué (toujours), puis les
 * paquets publiés par l'API (GET api/prompt-packages) quand elle répond.
 * @returns {Promise<{packages: object[], origin: 'api'|'embarque'}>}
 */
export async function fetchPromptPackages({ apiFetchFn = apiFetch } = {}) {
  try {
    const list = await apiFetchFn('prompt-packages')
    const published = (Array.isArray(list) ? list : []).filter(
      (p) => typeof p?.id === 'string' && typeof p?.version === 'string',
    )
    // Le paquet embarqué reste en tête : c'est lui que le moteur exécute (v1).
    const rest = published.filter((p) => !(p.id === BUILTIN_PACKAGE.id && p.version === BUILTIN_PACKAGE.version))
    return { packages: [BUILTIN_PACKAGE, ...rest], origin: 'api' }
  } catch {
    return { packages: [BUILTIN_PACKAGE], origin: 'embarque' }
  }
}

// --- Journées ----------------------------------------------------------------

/**
 * Regroupe les segments d'un portfolio par date (clé de checkpoint) : le moteur
 * exige des iso uniques ; plusieurs segments d'une même journée sont concaténés.
 * @param {Array<{date: string, texte: string}>} segments portfolio-store
 * @returns {Array<{iso: string, texte: string}>} trié par date croissante
 */
export function computeDayGroups(segments) {
  const byDate = new Map()
  for (const seg of segments ?? []) {
    if (!seg || typeof seg.date !== 'string' || typeof seg.texte !== 'string') continue
    const previous = byDate.get(seg.date)
    byDate.set(seg.date, previous ? `${previous}\n\n${seg.texte}` : seg.texte)
  }
  return [...byDate.entries()]
    .map(([iso, texte]) => ({ iso, texte }))
    .sort((a, b) => (a.iso < b.iso ? -1 : 1))
}

// --- Estimation ---------------------------------------------------------------

/**
 * Estimation AVANT lancement (engine estimateRun) : jours × taille moyenne,
 * surcoût fixe de prompt mesuré sur le vrai prompt d'extraction (référentiel
 * + protocole inclus). Modèle inconnu de la table de prix -> tokens/durée
 * estimés sur le modèle de référence, coût null (affiché « inconnu »).
 *
 * @param {{dayGroups: Array<{iso: string, texte: string}>, referentiel: object,
 *   model: string}} params
 * @returns {{tokensIn: number, tokensOut: number, costUsd: number|null,
 *   durationMin: number, totalCalls: number, disclaimer: string,
 *   days: number, avgDayChars: number, model: string}}
 */
export function buildEstimate({ dayGroups, referentiel, model }) {
  const days = dayGroups.length
  const totalChars = dayGroups.reduce((sum, g) => sum + g.texte.length, 0)
  const avgDayChars = days > 0 ? Math.round(totalChars / days) : 0
  const promptOverheadChars = buildExtractionPrompt({
    referentiel,
    poleNum: referentiel.poles[0].num,
    dayText: 'x', // placeholder : seul le gabarit fixe est mesuré
    date: '2026-01-01',
  }).length
  const pricing = getModelPricing(model)
  const estimate = estimateRun({
    days,
    avgDayChars,
    promptOverheadChars,
    model: pricing ? model : SERVICE_ESTIMATION_MODEL,
  })
  return {
    ...estimate,
    costUsd: pricing ? estimate.costUsd : null,
    days,
    avgDayChars,
    model,
  }
}

// --- Fournisseur ----------------------------------------------------------------

/**
 * Construit le provider du run selon le mode choisi.
 *
 * - 'cle' : transport DIRECT du moteur avec la clé personnelle (la clé ne
 *   transite que vers l'API du fournisseur, jamais vers humanome) ;
 * - 'humanome' : proxy plateforme api/llm avec preuve de travail (réutilise
 *   createDemoProvider — PoW one-time par appel, honeypot, quotas serveur).
 *
 * @param {object} choice
 * @param {'cle'|'humanome'} choice.mode
 * @param {string} [choice.provider] id PROVIDERS (mode 'cle')
 * @param {string} [choice.apiKey] clé personnelle (mode 'cle')
 * @param {string} [choice.model] modèle (mode 'cle', défaut du fournisseur sinon)
 * @param {typeof fetch} [choice.fetchFn] test seam
 * @param {(phase: string) => void} [choice.onPhase] progression fine (PoW…)
 * @returns {{provider: {complete: Function}, prime: Function|null,
 *   model: string, maxTokens: number, estimationModel: string}}
 */
export function createProviderBundle({ mode, provider, apiKey, model, fetchFn, onPhase } = {}) {
  if (mode === 'humanome') {
    const demo = createDemoProvider({ fetchFn, onPhase })
    return {
      provider: demo.provider,
      prime: demo.prime,
      model: DEMO_MODEL,
      maxTokens: DEMO_MAX_TOKENS,
      estimationModel: SERVICE_ESTIMATION_MODEL,
    }
  }
  const def = PROVIDERS.find((p) => p.id === provider)
  if (!def) {
    throw new Error(`Fournisseur inconnu : « ${provider} ».`)
  }
  if (def.requiresKey && !apiKey) {
    throw new Error(`Une clé API ${def.label} est requise pour lancer ce run.`)
  }
  const resolvedModel = model || def.defaultModel
  return {
    provider: createProvider({
      provider: def.id,
      transport: 'direct',
      apiKey: apiKey || undefined,
      fetchFn,
    }),
    prime: null,
    model: resolvedModel,
    maxTokens: RUN_MAX_TOKENS,
    estimationModel: resolvedModel,
  }
}

// --- Run ---------------------------------------------------------------------

/**
 * Identifiant STABLE du run : même portfolio + même paquet de prompts =
 * même runId, donc mêmes checkpoints — la reprise après rechargement est
 * automatique (les journées déjà checkpointées sont sautées).
 */
export function makeRunId(portfolioId, pkg) {
  return `${portfolioId}::${pkg.id}@${pkg.version}`
}

const NARRATIVE_NOTE =
  'Récit narratif non généré pour ce run : les récits de fusion (histoires ' +
  "d'apprentissage rédigées par le modèle) arrivent avec le banc d'essai " +
  'promptologue (P10). Ce résumé est calculé localement à partir des compteurs.'

/**
 * Narratifs LOCAUX du document merge (v1, P8) : buildMergeDocument exige un
 * texte par compétence rendue, par pôle et pour kairos — on lui fournit des
 * résumés déterministes (badge + compteurs sont déjà construits par l'engine ;
 * seule la fente « récit » reçoit ce texte de substitution).
 *
 * @param {{periode: object, agrege: object}} merged sortie de mergeDays
 * @returns {{competences: Record<string, string>, poles: Record<string, string>, kairos: string}}
 */
export function buildLocalNarratives(merged) {
  const { par_competence, par_pole } = merged.agrege
  const competences = {}
  for (const [code, comp] of Object.entries(par_competence)) {
    competences[code] =
      `**Résumé local.** Présence établie sur ${comp.nb_feuilles_etablies ?? 0} feuille(s), ` +
      `${comp.cumul_preuves ?? 0} preuve(s) décisive(s) et ${comp.cumul_indices ?? 0} indice(s) cumulés.\n\n` +
      `*${NARRATIVE_NOTE}*`
  }
  const poles = {}
  for (const [num, pole] of Object.entries(par_pole)) {
    const evolution = pole.evolution_par_feuille ?? []
    const last = evolution[evolution.length - 1]
    poles[num] =
      `**Résumé local du pôle.** ${evolution.length} feuille(s) cartographiée(s)` +
      (last ? `, dernier score ${last.score.toFixed(2)} (${last.etablies} établies, ${last.renvois} renvois).` : '.') +
      `\n\n*${NARRATIVE_NOTE}*`
  }
  const kairos =
    `**Synthèse locale.** ${merged.periode.nb_feuilles} feuille(s) cartographiée(s) ` +
    `entre ${merged.periode.premiere} et ${merged.periode.derniere}.\n\n*${NARRATIVE_NOTE}*`
  return { competences, poles, kairos }
}

/**
 * Exécute (ou REPREND) un run complet : extractDay par journée (7 pôles +
 * kairos, kairosOptional), checkpoints par journée, puis mergeDays +
 * buildMergeDocument (narratifs locaux, v1). Les journées déjà checkpointées
 * dans `storage` sont sautées — onResume est appelé AVANT le démarrage avec
 * l'état trouvé ({done, total}), pour afficher « repris à la journée k/n ».
 *
 * @param {object} params
 * @param {string} params.runId makeRunId(portfolioId, pkg)
 * @param {Array<{iso: string, texte: string}>} params.dayGroups computeDayGroups
 * @param {object} params.referentiel document référentiel
 * @param {{complete: Function}} params.provider provider LLM
 * @param {string} params.model
 * @param {number} [params.maxTokens=RUN_MAX_TOKENS]
 * @param {object} [params.storage] adaptateur {get,set,delete,keys} —
 *   défaut : IndexedDB 'humanome-runs' (reprise réelle après rechargement)
 * @param {AbortSignal} [params.signal] interruption coopérative
 * @param {(before: {done: number, total: number}) => void} [params.onResume]
 * @param {(info: {iso: string, position: number, total: number}) => void} [params.onDayStart]
 * @param {(info: {iso: string, step: string, poleNum: number|null, done: number,
 *   total: number, skipped?: boolean}) => void} [params.onCall] progression par appel
 * @param {() => string} [params.now] horloge injectable (tests)
 * @returns {Promise<{runId: string, aborted: boolean, resumedFrom: number,
 *   status: object, document: object|null, dayDocuments: object[],
 *   mergeError: string|null}>}
 *   `document` (cartographie-merge) n'est non-nul que si toutes les journées
 *   sont checkpointées ET que la fusion est constructible : le schéma
 *   cartographie-merge exige 7 pôles portant chacun AU MOINS une compétence
 *   établie sur la période — un portfolio court/creux peut produire des
 *   documents jour valides sans fusion possible (mergeError l'explique,
 *   les documents jour restent exploitables).
 */
export async function executeRun({
  runId,
  dayGroups,
  referentiel,
  provider,
  model,
  maxTokens = RUN_MAX_TOKENS,
  storage = createIndexedDbStorage(),
  signal,
  onResume,
  onDayStart,
  onCall,
  now = () => new Date().toISOString(),
} = {}) {
  const days = dayGroups.map((g) => ({ iso: g.iso, texte: g.texte }))
  const positions = new Map(days.map((d, i) => [d.iso, i + 1]))
  let mergeError = null

  const run = createRun({
    runId,
    days,
    storage,
    referentiel,
    now,
    processDay: (day, ctx) => {
      onDayStart?.({ iso: day.iso, position: positions.get(day.iso), total: days.length })
      return extractDay({
        dayText: day.texte,
        date: day.iso,
        referentiel,
        provider,
        model,
        maxTokens,
        signal: ctx.signal,
        // Les 7 documents de pôle portent la valeur : un échec de la synthèse
        // transversale dégrade la journée (kairos: null) au lieu de la perdre.
        kairosOptional: true,
        onProgress: (progress) => onCall?.({ ...progress, iso: day.iso }),
      })
    },
    finalize: (merged) => {
      // Schéma : AAAA-MM-JJThh:mm:ss sans millisecondes ni fuseau.
      const stamp = String(now()).slice(0, 19)
      try {
        const document = buildMergeDocument(
          { ...merged, date_construction: stamp },
          buildLocalNarratives(merged),
          {
            journalId: runId,
            sourceProtocole:
              'Aurora v3 reconstruit — run local, narratifs de fusion différés (P10)',
            generatedAt: stamp,
          },
        )
        const { valid, errors } = validateDocument('cartographie-merge', document)
        if (!valid) {
          const detail = errors.slice(0, 3).map((e) => `${e.path} ${e.message}`).join(' ; ')
          throw new Error(`${errors.length} erreur(s) de schéma : ${detail}`)
        }
        return document
      } catch (err) {
        // Fusion non constructible (cas typique : un pôle sans aucune
        // compétence établie sur la période — portfolio court ou traces
        // trop minces). Les documents JOUR checkpointés restent la valeur :
        // on dégrade au lieu de perdre le run.
        mergeError =
          'La cartographie fusionnée (merge) n’a pas pu être construite : ' +
          'le format exige au moins une compétence établie dans chacun des 7 pôles ' +
          'sur la période. Les documents journaliers, eux, sont complets et conservés. ' +
          `Détail technique : ${err instanceof Error ? err.message : String(err)}`
        return null
      }
    },
  })

  const before = await run.status()
  onResume?.({ done: before.done, total: before.total })

  const result = await run.start({ signal })
  return {
    runId,
    aborted: result.aborted,
    resumedFrom: before.done,
    status: result.status,
    document: result.document,
    dayDocuments: await run.getDayDocuments(),
    mergeError,
  }
}
