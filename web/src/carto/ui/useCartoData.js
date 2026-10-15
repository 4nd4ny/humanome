// Interface ultime — données de l'application : jeux de données en IndexedDB,
// index courant, cache des détails par journée (chargement paresseux), import
// transactionnel, démonstration. Rien ne quitte le navigateur.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createCartoStore, createMemoryAdapter } from '../core/store.js'
import { importFiles } from '../core/import.js'
import { createDataset, isPristineDemo, upgradeDataset } from '../core/model.js'
import { normalizeReferential } from '../core/referential.js'
import { looksLikeArchive } from '../core/archive.js'
import { dropDatasetDrafts } from './shareDrafts.js'

const CURRENT_KEY = 'humanome-carto-current'
/** Version de la démo d'où vient chaque jeu de démonstration : {datasetId: Last-Modified}. */
const DEMO_SOURCE_KEY = 'humanome-carto-demo-source'
const DEMO_CHECK_TIMEOUT = 4000
const SAVE_DELAY = 250
/** Démo anonymisée déposée sur le serveur (facultative). */
export const DEMO_ARCHIVE = 'data/demo/carto/archive.json'

/**
 * Démo anonymisée déposée sur le serveur : son texte et sa version (en-tête
 * Last-Modified), ou null si elle n'est pas déposée (ou n'est pas une archive).
 */
async function fetchDemoArchive(fetchFn) {
  try {
    // Revalidée auprès du serveur : une copie en cache peut dater d'avant le dernier dépôt.
    const res = await fetchFn(DEMO_ARCHIVE, { cache: 'no-cache' })
    if (!res?.ok) return null
    const text = await res.text()
    // Un serveur de développement renvoie la page d'accueil pour un fichier absent.
    const doc = JSON.parse(text)
    return looksLikeArchive(doc) ? { text, version: res.headers?.get?.('last-modified') ?? null } : null
  } catch {
    return null
  }
}

/**
 * Version de la démo déposée (Last-Modified d'une requête HEAD, sans la
 * télécharger), ou null : absente, injoignable dans le délai, sans date, ou
 * page d'accueil d'un serveur de développement.
 */
async function fetchDemoVersion(fetchFn) {
  const ctrl = typeof AbortController === 'function' ? new AbortController() : null
  const timer = ctrl ? setTimeout(() => ctrl.abort(), DEMO_CHECK_TIMEOUT) : null
  try {
    const res = await fetchFn(DEMO_ARCHIVE, { method: 'HEAD', cache: 'no-store', signal: ctrl?.signal })
    if (!res?.ok) return null
    if (/html/i.test(res.headers?.get?.('content-type') ?? '')) return null
    return res.headers?.get?.('last-modified') ?? null
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

function readDemoSources() {
  try {
    const all = JSON.parse(readPref(DEMO_SOURCE_KEY) ?? '{}')
    return all && typeof all === 'object' && !Array.isArray(all) ? all : {}
  } catch {
    return {}
  }
}

/** Retient (ou oublie, version nulle) la version de la démo d'un jeu. */
function writeDemoSource(datasetId, version) {
  const all = readDemoSources()
  if (version) all[datasetId] = version
  else delete all[datasetId]
  writePref(DEMO_SOURCE_KEY, Object.keys(all).length > 0 ? JSON.stringify(all) : null)
}

function readPref(key) {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function writePref(key, value) {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    /* préférence d'affichage seulement : rien de grave */
  }
}

/**
 * @param {{store?: ReturnType<typeof createCartoStore>, fetchFn?: typeof fetch,
 *   loadReferential?: () => Promise<{doc: object}>}} [deps] coutures de test
 */
export function useCartoData(deps = {}) {
  const storeRef = useRef(null)
  if (storeRef.current === null) {
    let s = deps.store ?? null
    if (!s) {
      try {
        s = createCartoStore()
      } catch {
        s = createCartoStore({ adapter: createMemoryAdapter() })
      }
    }
    storeRef.current = s
  }
  const store = storeRef.current
  const fetchFn = deps.fetchFn ?? ((...a) => fetch(...a))
  // Le chargeur du référentiel est fourni par le site (App.jsx) : la copie
  // autonome n'en a pas besoin (son jeu embarque son référentiel).
  const loadReferential = deps.loadReferential ?? (() => Promise.reject(new Error('aucun référentiel disponible')))

  const [status, setStatus] = useState('loading') // loading | empty | ready | error
  const [error, setError] = useState(null)
  const [datasets, setDatasets] = useState([])
  const [dataset, setDataset] = useState(null)
  const [busy, setBusy] = useState(null) // libellé d'une opération longue en cours
  const [lastReport, setLastReport] = useState(null)
  // Caches immuables (une nouvelle Map à chaque chargement) : les composants
  // qui lisent un détail se réaffichent quand il arrive.
  const [detailCache, setDetailCache] = useState(() => new Map()) // `${datasetId}|${date}` → détail
  const [runCache, setRunCache] = useState(() => new Map())
  const pending = useRef(new Set())
  const saveTimer = useRef(null)
  const latest = useRef(null)

  // ---- Ouverture d'un jeu -----------------------------------------------------
  const refreshList = useCallback(async () => {
    const list = await store.listDatasets()
    setDatasets(list)
    return list
  }, [store])

  /** Affiche un jeu déjà lu de la base et le retient comme jeu courant. */
  const showDataset = useCallback((ds) => {
    if (!ds) return null
    const up = upgradeDataset(ds)
    latest.current = up
    setDataset(up)
    writePref(CURRENT_KEY, up.datasetId)
    setStatus('ready')
    return up
  }, [])

  const openDataset = useCallback(async (datasetId) => showDataset(await store.loadDataset(datasetId)), [store, showDataset])

  // ---- Mises à jour de l'index (enregistrement différé) ----------------------
  const flush = useCallback(async () => {
    clearTimeout(saveTimer.current)
    saveTimer.current = null
    if (latest.current) await store.saveDataset(latest.current)
  }, [store])

  const update = useCallback(
    (fn) => {
      setDataset((prev) => {
        if (!prev) return prev
        const next = fn(prev)
        if (next === prev) return prev
        latest.current = next
        clearTimeout(saveTimer.current)
        saveTimer.current = setTimeout(() => {
          saveTimer.current = null
          store.saveDataset(next).catch((err) => setError(`Enregistrement impossible : ${err.message}`))
        }, SAVE_DELAY)
        return next
      })
    },
    [store],
  )

  useEffect(() => () => clearTimeout(saveTimer.current), [])

  // ---- Détails par journée (chargement paresseux) -----------------------------
  const datasetId = dataset?.datasetId ?? null

  const getDetail = useCallback((date) => (datasetId ? detailCache.get(`${datasetId}|${date}`) : undefined), [datasetId, detailCache])

  const ensureDetails = useCallback(
    async (dates) => {
      if (!datasetId) return
      const missing = [...new Set(dates)].filter((d) => !detailCache.has(`${datasetId}|${d}`) && !pending.current.has(`${datasetId}|${d}`))
      if (missing.length === 0) return
      for (const d of missing) pending.current.add(`${datasetId}|${d}`)
      try {
        const loaded = await store.loadDayDetails(datasetId, missing)
        setDetailCache((prev) => {
          const next = new Map(prev)
          for (const d of missing) next.set(`${datasetId}|${d}`, loaded.get(d) ?? null)
          return next
        })
      } finally {
        for (const d of missing) pending.current.delete(`${datasetId}|${d}`)
      }
    },
    [datasetId, detailCache, store],
  )

  const getRunDetail = useCallback((key) => (datasetId ? runCache.get(`${datasetId}|${key}`) : undefined), [datasetId, runCache])

  const ensureRunDetail = useCallback(
    async (key) => {
      if (!datasetId || runCache.has(`${datasetId}|${key}`)) return
      const value = await store.loadRunDetail(datasetId, key)
      setRunCache((prev) => new Map(prev).set(`${datasetId}|${key}`, value))
    },
    [datasetId, runCache, store],
  )

  // ---- Import ------------------------------------------------------------------
  /**
   * Importe des fichiers dans le jeu courant (ou dans un nouveau jeu), sans
   * toucher au libellé d'attente (chaque appelant pose le sien).
   * @returns {Promise<{report: object, dataset: object}>}
   */
  const runImport = useCallback(
    async (files, { title, newDataset = false, origin = null, quiet = false } = {}) => {
      await flush()
      let base = newDataset || !latest.current ? null : latest.current
      if (!base) {
        const { doc } = await loadReferential()
        base = createDataset({ title: title ?? 'Ma cartographie', referential: doc })
        // La démonstration publique est marquée : elle n'entre pas dans
        // l'archive de compte (elle se recharge depuis le site).
        if (origin) base = { ...base, origin }
      }
      const res = await importFiles(files, base)
      await store.commit(res)
      // Les détails touchés sont relus depuis la base au prochain besoin.
      const id = res.dataset.datasetId
      setDetailCache((prev) => {
        const next = new Map(prev)
        for (const date of res.detailPatches.keys()) next.delete(`${id}|${date}`)
        return next
      })
      setRunCache((prev) => {
        const next = new Map(prev)
        for (const rd of res.runDetails) next.delete(`${id}|${rd.key}`)
        return next
      })
      latest.current = res.dataset
      setDataset(res.dataset)
      writePref(CURRENT_KEY, res.dataset.datasetId)
      setStatus('ready')
      await refreshList()
      const report = { at: new Date().toISOString(), entries: res.report, counts: res.counts, referentialCandidate: res.referentialCandidate }
      // Une mise à jour silencieuse (démonstration) n'ouvre pas de rapport d'import.
      if (!quiet) setLastReport(report)
      return { report, dataset: res.dataset }
    },
    [flush, loadReferential, refreshList, store],
  )

  /**
   * Importe des fichiers dans le jeu courant (ou dans un nouveau jeu).
   * @param {Array<{path: string, bytes?: Uint8Array, text?: string}>} files
   * @param {{title?: string, newDataset?: boolean, origin?: string | null}} [opts]
   */
  const importInto = useCallback(
    async (files, opts) => {
      setBusy('Import en cours…')
      try {
        return (await runImport(files, opts)).report
      } finally {
        setBusy(null)
      }
    },
    [runImport],
  )

  /**
   * Écrit un changement qui touche des détails de journée (passage rattaché,
   * etc.) en une transaction, puis invalide le cache de ces journées.
   * @param {{dataset: object, detailPatches: Map<string, object>}} result
   */
  const commitWithDetails = useCallback(
    async (result) => {
      clearTimeout(saveTimer.current)
      saveTimer.current = null
      await store.commit({ dataset: result.dataset, detailPatches: result.detailPatches, runDetails: [] })
      const id = result.dataset.datasetId
      setDetailCache((prev) => {
        const next = new Map(prev)
        for (const date of result.detailPatches.keys()) next.delete(`${id}|${date}`)
        return next
      })
      latest.current = result.dataset
      setDataset(result.dataset)
    },
    [store],
  )

  /**
   * Charge la démonstration : la démo anonymisée déposée sur le serveur
   * (« Préparer une démo », portfolio compris : les passages se surlignent)
   * si elle existe, sinon les 59 journées publiques du site.
   */
  const loadDemo = useCallback(async () => {
    setBusy('Chargement de la démonstration…')
    try {
      const archive = await fetchDemoArchive(fetchFn)
      if (archive) {
        const { report, dataset: demo } = await runImport([{ path: DEMO_ARCHIVE, text: archive.text }], { title: 'Démonstration', newDataset: true, origin: 'demo' })
        writeDemoSource(demo.datasetId, archive.version)
        return report
      }
      const res = await fetchFn('data/demo/jours/index.json')
      if (!res.ok) throw new Error(`index de démonstration introuvable (HTTP ${res.status})`)
      const index = await res.json()
      const files = []
      for (const e of index) {
        const date = e.date ?? e.iso ?? e
        const r = await fetchFn(`data/demo/jours/${date}.json`)
        if (r.ok) files.push({ path: `demonstration/${date}.json`, text: await r.text() })
      }
      return (await runImport(files, { title: 'Démonstration', newDataset: true, origin: 'demo' })).report
    } catch (err) {
      setError(
        `La démonstration n'a pas pu être chargée (${err.message}). Sur une copie ouverte directement depuis le disque, importez vos fichiers à la place.`,
      )
      return null
    } finally {
      setBusy(null)
    }
  }, [fetchFn, runImport])

  /** Efface un jeu de la base, avec ce qui s'y rattache dans ce navigateur. */
  const purgeDataset = useCallback(
    async (id) => {
      await store.deleteDataset(id)
      // Les brouillons de ses versions partagées (extraits, noms remplacés) partent avec lui.
      dropDatasetDrafts(id)
      writeDemoSource(id, null)
      setDetailCache((prev) => new Map([...prev].filter(([k]) => !k.startsWith(`${id}|`))))
    },
    [store],
  )

  /**
   * Une démonstration intacte se met à jour d'elle-même quand le site en
   * dépose une nouvelle version (journal D-57). Sans cela, un navigateur qui
   * l'avait ouverte avant le dépôt du portfolio de démonstration la gardait
   * sans portfolio : « Aucun portfolio importé » sur Chrome Android, alors que
   * Firefox, qui ne l'avait jamais ouverte, la chargeait complète. Rien ne
   * change si la démo du site est injoignable, absente ou de même version.
   * @returns {Promise<boolean>} vrai si la nouvelle version est chargée et ouverte
   */
  const refreshDemo = async (stale, isCancelled) => {
    const version = await fetchDemoVersion(fetchFn)
    if (isCancelled() || !version || readDemoSources()[stale.datasetId] === version) return false
    setBusy('Mise à jour de la démonstration…')
    try {
      const archive = await fetchDemoArchive(fetchFn)
      if (isCancelled() || !archive) return false
      const { dataset: fresh } = await runImport([{ path: DEMO_ARCHIVE, text: archive.text }], {
        title: stale.title || 'Démonstration',
        newDataset: true,
        origin: 'demo',
        quiet: true,
      })
      if ((fresh.days?.length ?? 0) === 0) {
        // Archive déposée mais illisible : la démonstration en place reste.
        await purgeDataset(fresh.datasetId)
        return false
      }
      writeDemoSource(fresh.datasetId, archive.version ?? version)
      await purgeDataset(stale.datasetId)
      await refreshList()
      return true
    } catch (err) {
      console.warn('Mise à jour de la démonstration impossible :', err)
      return false
    } finally {
      setBusy(null)
    }
  }
  // Lue par l'effet de chargement initial, qui ne dépend pas de ses coutures.
  const refreshDemoRef = useRef(refreshDemo)
  refreshDemoRef.current = refreshDemo

  // ---- Chargement initial : le jeu courant, ou le premier ---------------------
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const list = await refreshList()
        if (cancelled) return
        if (list.length === 0) {
          setStatus('empty')
          return
        }
        const wanted = readPref(CURRENT_KEY)
        const id = list.some((d) => d.datasetId === wanted) ? wanted : list[0].datasetId
        const stored = await store.loadDataset(id)
        if (cancelled) return
        // Une démonstration intacte se met à jour avant de s'afficher (D-57).
        if (isPristineDemo(stored) && (await refreshDemoRef.current(stored, () => cancelled))) return
        if (!cancelled) showDataset(stored)
      } catch (err) {
        if (!cancelled) {
          setError(err.message)
          setStatus('error')
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [refreshList, showDataset, store])

  /** Supprime un jeu de données (après confirmation en deux temps dans l'UI). */
  const deleteDataset = useCallback(
    async (id) => {
      await purgeDataset(id)
      const list = await refreshList()
      if (dataset?.datasetId === id) {
        latest.current = null
        setDataset(null)
        if (list.length > 0) await openDataset(list[0].datasetId)
        else {
          writePref(CURRENT_KEY, null)
          setStatus('empty')
        }
      }
    },
    [dataset, openDataset, purgeDataset, refreshList],
  )

  const referentialDoc = dataset?.referential ?? null
  const ref = useMemo(() => (referentialDoc ? normalizeReferential(referentialDoc) : null), [referentialDoc])

  return {
    store,
    status,
    error,
    setError,
    busy,
    datasets,
    dataset,
    ref,
    update,
    flush,
    openDataset: async (id) => {
      await flush()
      return openDataset(id)
    },
    deleteDataset,
    commitWithDetails,
    importInto,
    loadDemo,
    lastReport,
    setLastReport,
    getDetail,
    ensureDetails,
    getRunDetail,
    ensureRunDetail,
  }
}
