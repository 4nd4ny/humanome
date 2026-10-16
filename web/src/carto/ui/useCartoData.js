// Interface ultime — données de l'application : jeux de données en IndexedDB,
// index courant, cache des détails par journée (chargement paresseux), import
// transactionnel, démonstration. Rien ne quitte le navigateur.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createCartoStore, createMemoryAdapter } from '../core/store.js'
import { importFiles } from '../core/import.js'
import { createDataset, demoBaseline, isPristineDemo, upgradeDataset } from '../core/model.js'
import { normalizeReferential } from '../core/referential.js'
import { looksLikeArchive } from '../core/archive.js'
import { NEED_ALL, expandNeed, isLocalBase, isSplitIndex, partPath } from '../core/split.js'
import { dropDatasetDrafts } from './shareDrafts.js'

const CURRENT_KEY = 'humanome-carto-current'
/**
 * Origine de chaque jeu de démonstration : {datasetId: {version, baseline}} —
 * la version de l'archive (son en-tête Last-Modified) et ce qu'elle apportait
 * d'elle-même (`demoBaseline`), pour savoir si la personne y a touché.
 */
const DEMO_SOURCE_KEY = 'humanome-carto-demo-source'
/** Dernière version de la démo qui n'a pas pu être chargée : {version, at}. */
const DEMO_TRIED_KEY = 'humanome-carto-demo-tried'
const DEMO_CHECK_TIMEOUT = 4000
/** Une archive entière pèse plusieurs mégaoctets : au-delà de deux minutes, on renonce. */
const DEMO_FETCH_TIMEOUT = 120000
/** Une version qui n'a pas pu être chargée n'est retentée qu'un jour plus tard. */
const DEMO_RETRY_DELAY = 24 * 3600 * 1000
const SAVE_DELAY = 250
/**
 * Démonstration déposée sur le serveur (facultative), de préférence découpée
 * (D-67) : son index, lu d'abord, et un dossier de fichiers lus à la demande ;
 * sinon une archive entière, lue d'un bloc.
 */
export const DEMO_DIR = 'data/demo/carto/'
export const DEMO_INDEX = `${DEMO_DIR}index.json`
export const DEMO_ARCHIVE = `${DEMO_DIR}archive.json`

/** Un signal qui s'arrête au bout de `ms`, ou quand `outer` s'arrête. */
function timedSignal(ms, outer = null) {
  if (typeof AbortController !== 'function') return { signal: undefined, done: () => {} }
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), ms)
  const stop = () => ctrl.abort()
  if (outer?.aborted) ctrl.abort()
  else outer?.addEventListener?.('abort', stop)
  return {
    signal: ctrl.signal,
    done: () => {
      clearTimeout(timer)
      outer?.removeEventListener?.('abort', stop)
    },
  }
}

/**
 * Démonstration déposée sur le serveur : son index découpé (D-67), sinon une
 * archive entière.
 * @returns {Promise<{status: 'ok', path: string, text: string, version: string | null} | {status: 'absent'} | {status: 'failed', error: Error}>}
 *   absent : pas déposée (404, page d'accueil d'un serveur de développement,
 *   pas une archive) ; failed : déposée, mais le téléchargement a échoué
 *   (réseau, délai, réponse tronquée). L'index rend ses fichiers relatifs au
 *   site (`remote.base`).
 */
async function fetchDemoArchive(fetchFn, { signal = null } = {}) {
  let failed = null
  for (const path of [DEMO_INDEX, DEMO_ARCHIVE]) {
    const timed = timedSignal(DEMO_FETCH_TIMEOUT, signal)
    try {
      // Revalidée auprès du serveur : une copie en cache peut dater d'avant le dernier dépôt.
      const res = await fetchFn(path, { cache: 'no-cache', signal: timed.signal })
      if (!res?.ok) continue
      const type = res.headers?.get?.('content-type') ?? ''
      if (/html/i.test(type)) continue
      const text = await res.text()
      let doc
      try {
        doc = JSON.parse(text)
      } catch (error) {
        if (/json/i.test(type)) failed ??= error
        continue
      }
      if (!looksLikeArchive(doc)) continue
      const version = res.headers?.get?.('last-modified') ?? null
      if (!isSplitIndex(doc)) return { status: 'ok', path, text, version }
      // Ses fichiers sont à côté de lui, sur ce site : un renvoi ailleurs n'est pas suivi.
      if (!isLocalBase(doc.remote.base)) continue
      return { status: 'ok', path, text: JSON.stringify({ ...doc, remote: { ...doc.remote, base: `${DEMO_DIR}${doc.remote.base}` } }), version }
    } catch (error) {
      failed ??= error
    } finally {
      timed.done()
    }
  }
  return failed ? { status: 'failed', error: failed } : { status: 'absent' }
}

/**
 * Version de la démo déposée (Last-Modified d'une requête HEAD sur son index,
 * sinon sur l'archive entière, sans la télécharger), ou null : absente,
 * injoignable dans le délai, sans date, ou page d'accueil d'un serveur de
 * développement.
 */
async function fetchDemoVersion(fetchFn, signal = null) {
  for (const path of [DEMO_INDEX, DEMO_ARCHIVE]) {
    const timed = timedSignal(DEMO_CHECK_TIMEOUT, signal)
    try {
      const res = await fetchFn(path, { method: 'HEAD', cache: 'no-store', signal: timed.signal })
      if (!res?.ok || /html/i.test(res.headers?.get?.('content-type') ?? '')) continue
      return res.headers?.get?.('last-modified') ?? null
    } catch {
      return null
    } finally {
      timed.done()
    }
  }
  return null
}

function readJsonPref(key) {
  try {
    const value = JSON.parse(readPref(key) ?? 'null')
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null
  } catch {
    return null
  }
}

const readDemoSources = () => readJsonPref(DEMO_SOURCE_KEY) ?? {}

/** Retient (ou oublie, `source` nul) l'origine d'un jeu de démonstration. */
function writeDemoSource(datasetId, source) {
  const all = readDemoSources()
  if (source) all[datasetId] = source
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
      // Les fichiers d'un jeu lu à la demande se lisent avec le même fetch que la démonstration (D-67).
      try {
        s = createCartoStore({ fetchFn: deps.fetchFn })
      } catch {
        s = createCartoStore({ adapter: createMemoryAdapter(), fetchFn: deps.fetchFn })
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
  // qui lisent un détail se réaffichent quand il arrive. Une journée d'un jeu
  // lu à la demande se complète au fil de ce qu'on ouvre : `parts` dit ce
  // qu'elle contient déjà (D-67).
  const [detailCache, setDetailCache] = useState(() => new Map()) // `${datasetId}|${date}` → {detail, parts: Set}
  const [runCache, setRunCache] = useState(() => new Map())
  const pending = useRef(new Set())
  // Génération des données : chaque écriture qui invalide des détails
  // l'avance ; une lecture commencée avant n'est pas rangée (elle portait
  // l'ancien index), et ne retient pas celles qui la suivent.
  const generation = useRef(0)
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
  // Un jeu supprimé (ou une démonstration remplacée) dans un autre onglet n'est
  // jamais recréé par un enregistrement d'ici : on le dit.
  const save = useCallback(
    async (ds) => {
      if (!(await store.saveExistingDataset(ds))) {
        setError('Ce jeu de données n’existe plus dans ce navigateur : il a été supprimé ou remplacé dans un autre onglet. Rechargez la page.')
      }
    },
    [store],
  )

  // Seulement s'il reste un changement à écrire : réécrire le jeu tel qu'il est
  // en mémoire effacerait ce qu'un autre onglet y a mis entre-temps.
  const flush = useCallback(async () => {
    if (!saveTimer.current) return
    clearTimeout(saveTimer.current)
    saveTimer.current = null
    if (latest.current) await save(latest.current)
  }, [save])

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
          save(next).catch((err) => setError(`Enregistrement impossible : ${err.message}`))
        }, SAVE_DELAY)
        return next
      })
    },
    [save],
  )

  useEffect(() => () => clearTimeout(saveTimer.current), [])

  // Une démonstration lue à la demande où la personne a mis quelque chose à
  // elle (une réponse, un repère, un import…) devient un jeu d'ici : ses
  // fichiers sont copiés dans ce navigateur, en arrière-plan, et elle ne
  // dépend plus du dossier de sa version sur le site, qui peut alors s'en
  // retirer (D-67). Un échec (hors ligne) se retente à la prochaine ouverture.
  const materializing = useRef(new Set())
  const [online, setOnline] = useState(0)
  useEffect(() => {
    const again = () => setOnline((n) => n + 1)
    window.addEventListener?.('online', again)
    return () => window.removeEventListener?.('online', again)
  }, [])
  useEffect(() => {
    if (!dataset?.remote || materializing.current.has(dataset.datasetId)) return
    if (isPristineDemo(dataset, readDemoSources()[dataset.datasetId]?.baseline ?? null)) return
    const id = dataset.datasetId
    materializing.current.add(id)
    store
      .materialize(id)
      .then((stored) => {
        if (!stored) return
        // L'index en mémoire ne renvoie plus au site, sans perdre ce qui n'est pas encore enregistré.
        setDataset((prev) => {
          if (prev?.datasetId !== id || !prev.remote) return prev
          const next = { ...prev }
          delete next.remote
          latest.current = next
          return next
        })
      })
      // Retentée au prochain changement, ou dès le retour du réseau.
      .catch(() => materializing.current.delete(id))
  }, [dataset, store, online])

  // ---- Détails par journée (chargement paresseux) -----------------------------
  const datasetId = dataset?.datasetId ?? null

  /**
   * La journée contient-elle ce que le besoin demande ? Un jeu d'ici : tout,
   * une fois lue ; un jeu lu à la demande : chaque fichier demandé, lu — une
   * clé sans fichier (une journée sans texte) n'a rien à attendre.
   */
  const covers = useCallback((entry, date, need) => {
    if (!entry) return false
    if (entry.parts.has(NEED_ALL)) return true
    const ds = latest.current
    // Un jeu d'ici (une démonstration devenue d'ici, avec ce qu'elle avait lu) se relit en entier.
    if (!ds?.remote) return false
    return expandNeed(ds, date, need).every((k) => entry.parts.has(k) || partPath(ds.remote, date, k) === null)
  }, [])

  /**
   * Détail d'une journée, ou undefined tant qu'il n'est pas lu. `need` dit ce
   * dont le lecteur a besoin (une compétence, un pôle, le texte, la journée :
   * core/split.js) : un jeu lu à la demande ne lit que cela (D-67) ; un jeu
   * d'ici est lu en entier.
   * @param {string} date
   * @param {string | string[]} [need]
   */
  const getDetail = useCallback(
    (date, need = NEED_ALL) => {
      if (!datasetId) return undefined
      const entry = detailCache.get(`${datasetId}|${date}`)
      return covers(entry, date, need) ? entry.detail : undefined
    },
    [datasetId, detailCache, covers],
  )

  const ensureDetails = useCallback(
    async (dates, need = NEED_ALL) => {
      if (!datasetId) return
      const ds = latest.current
      // Un jeu d'ici se lit en entier, journée par journée : un seul chargement, quel que soit le besoin.
      const want = ds?.remote ? need : NEED_ALL
      const gen = generation.current
      const tag = `${gen}|${[want].flat().join(',')}`
      const missing = [...new Set(dates)].filter((d) => !covers(detailCache.get(`${datasetId}|${d}`), d, want) && !pending.current.has(`${datasetId}|${d}|${tag}`))
      if (missing.length === 0) return
      for (const d of missing) pending.current.add(`${datasetId}|${d}|${tag}`)
      // Ce qui est lu se range, sauf si les données ont changé entre-temps ;
      // une journée qui n'a rien de neuf (un fichier qui ne se lit toujours
      // pas) ne réveille personne : pas de relecture en boucle.
      const keep = (loaded) => {
        if (generation.current !== gen) return
        setDetailCache((prev) => {
          let changed = false
          const next = new Map(prev)
          for (const d of missing) {
            const got = loaded.get(d)
            if (!got) continue
            const key = `${datasetId}|${d}`
            const before = prev.get(key)
            const parts = new Set([...(before?.parts ?? []), ...got.parts])
            if (before && parts.size === before.parts.size) continue
            next.set(key, { detail: got.detail, parts })
            changed = true
          }
          return changed ? next : prev
        })
      }
      try {
        keep(await store.loadDays(datasetId, missing, { dataset: ds, need: want }))
      } catch (err) {
        if (err?.partial) keep(err.partial)
        if (generation.current === gen) setError(`Une partie des données n’a pas pu être lue (${err.message}). Elle sera redemandée à la prochaine ouverture.`)
      } finally {
        for (const d of missing) pending.current.delete(`${datasetId}|${d}|${tag}`)
      }
    },
    [datasetId, detailCache, covers, store],
  )

  const getRunDetail = useCallback((key) => (datasetId ? runCache.get(`${datasetId}|${key}`) : undefined), [datasetId, runCache])

  const ensureRunDetail = useCallback(
    async (key) => {
      const gen = generation.current
      const tag = `${datasetId}|run|${gen}|${key}`
      if (!datasetId || runCache.has(`${datasetId}|${key}`) || pending.current.has(tag)) return
      pending.current.add(tag)
      try {
        const value = await store.loadRunDetail(datasetId, key, { dataset: latest.current })
        if (generation.current === gen) setRunCache((prev) => new Map(prev).set(`${datasetId}|${key}`, value))
      } catch (err) {
        if (generation.current === gen) setError(`Une délibération n’a pas pu être lue (${err.message}). Elle sera redemandée à la prochaine ouverture.`)
      } finally {
        pending.current.delete(tag)
      }
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
    async (files, { title, newDataset = false, origin = null, demoVersion } = {}) => {
      await flush()
      let base = newDataset || !latest.current ? null : latest.current
      if (!base) {
        const { doc } = await loadReferential()
        base = createDataset({ title: title ?? 'Ma cartographie', referential: doc })
        // La démonstration publique est marquée : elle n'entre pas dans
        // l'archive de compte (elle se recharge depuis le site).
        if (origin) base = { ...base, origin }
      }
      const res = await importFiles(files, base, { allowRemote: origin === 'demo' })
      await store.commit(res)
      // La démonstration retient sa version et ce qu'elle apporte d'elle-même
      // AVANT de s'afficher : intacte, elle n'est jamais copiée ici (D-67).
      if (origin === 'demo' && demoVersion !== undefined) writeDemoSource(res.dataset.datasetId, { version: demoVersion, baseline: demoBaseline(res.dataset) })
      // Les détails touchés sont relus depuis la base au prochain besoin.
      const id = res.dataset.datasetId
      generation.current++
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
      setLastReport(report)
      return { report, dataset: res.dataset }
    },
    [flush, loadReferential, refreshList, store],
  )

  /**
   * Importe des fichiers dans un NOUVEAU jeu, sans l'ouvrir ni toucher à
   * l'affichage (mise à jour de la démonstration en arrière-plan).
   * @returns {Promise<object>} le jeu enregistré
   */
  const importDetached = useCallback(
    async (files, { title, origin = null }) => {
      const { doc } = await loadReferential()
      let base = createDataset({ title, referential: doc })
      if (origin) base = { ...base, origin }
      const res = await importFiles(files, base, { allowRemote: origin === 'demo' })
      await store.commit(res)
      return res.dataset
    },
    [loadReferential, store],
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
      generation.current++
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
   * si elle existe, sinon les 59 journées publiques du site. Déposée mais
   * impossible à télécharger : les journées publiques, et on le dit.
   */
  const loadDemo = useCallback(async () => {
    setBusy('Chargement de la démonstration…')
    try {
      const archive = await fetchDemoArchive(fetchFn)
      if (archive.status === 'ok') {
        const { report } = await runImport([{ path: archive.path, text: archive.text }], { title: 'Démonstration', newDataset: true, origin: 'demo', demoVersion: archive.version })
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
      const { report } = await runImport(files, { title: 'Démonstration', newDataset: true, origin: 'demo' })
      if (archive.status === 'failed') {
        setError(`Le portfolio de la démonstration n’a pas pu être téléchargé (${archive.error?.message ?? 'réseau'}) : ses passages ne se surlignent pas. Il sera retéléchargé à la prochaine visite.`)
      }
      return report
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
      generation.current++
      setDetailCache((prev) => new Map([...prev].filter(([k]) => !k.startsWith(`${id}|`))))
    },
    [store],
  )

  /**
   * Une démonstration intacte se met à jour d'elle-même quand le site en
   * dépose une nouvelle version (journal D-57). Sans cela, un navigateur qui
   * l'avait ouverte avant le dépôt du portfolio de démonstration la gardait
   * sans portfolio : « Aucun portfolio importé » sur Chrome Android, alors que
   * Firefox, qui ne l'avait jamais ouverte, la chargeait complète.
   *
   * En arrière-plan, la démonstration en place restant affichée : une requête
   * HEAD lit la version déposée ; différente, l'archive est téléchargée (deux
   * minutes au plus) et importée dans un nouveau jeu, qui remplace l'ancien
   * — à l'écran aussi s'il y était — seulement si l'ancien est TOUJOURS
   * intact, relu juste avant (un autre onglet a pu y toucher). Une version qui
   * n'a pas pu être chargée n'est retentée qu'un jour plus tard. Rien ne
   * change si la démo du site est injoignable, absente ou de même version.
   * @param {string} staleId
   * @param {AbortSignal} signal arrêt (la page se ferme)
   */
  const refreshDemo = async (staleId, signal) => {
    try {
      const sources = readDemoSources()
      const own = sources[staleId] ?? null
      const version = await fetchDemoVersion(fetchFn, signal)
      if (signal.aborted || !version || own?.version === version) return
      // Une copie à jour est peut-être déjà là (onglet voisin, remplacement inachevé).
      let freshId = Object.entries(sources).find(([id, src]) => id !== staleId && src?.version === version)?.[0] ?? null
      const ready = freshId ? await store.loadDataset(freshId) : null
      if (!ready || !isPristineDemo(ready, sources[freshId]?.baseline)) freshId = null
      if (!freshId) {
        const tried = readJsonPref(DEMO_TRIED_KEY)
        if (tried?.version === version && Date.now() - (tried.at ?? 0) < DEMO_RETRY_DELAY) return
        writePref(DEMO_TRIED_KEY, JSON.stringify({ version, at: Date.now() }))
        const archive = await fetchDemoArchive(fetchFn, { signal })
        if (signal.aborted || archive.status !== 'ok') return
        const fresh = await importDetached([{ path: archive.path, text: archive.text }], { title: 'Démonstration', origin: 'demo' })
        if ((fresh.days?.length ?? 0) === 0) {
          // Archive déposée mais illisible : la démonstration en place reste.
          await purgeDataset(fresh.datasetId)
          await refreshList()
          return
        }
        writeDemoSource(fresh.datasetId, { version: archive.version ?? version, baseline: demoBaseline(fresh) })
        writePref(DEMO_TRIED_KEY, null)
        freshId = fresh.datasetId
      }
      // Ce qui est en mémoire ici, puis la base (un autre onglet) : l'ancienne
      // démonstration est-elle toujours intacte ?
      await flush()
      const here = latest.current?.datasetId === staleId ? latest.current : null
      const stale = await store.loadDataset(staleId)
      const touched = [here, stale].some((ds) => ds && !isPristineDemo(ds, own?.baseline))
      if (touched) {
        // Elle est à la personne désormais : on la garde, la copie neuve s'en va.
        await purgeDataset(freshId)
        await refreshList()
        return
      }
      if (latest.current?.datasetId === staleId) showDataset(await store.loadDataset(freshId))
      if (stale) await purgeDataset(staleId)
      await refreshList()
    } catch (err) {
      console.warn('Mise à jour de la démonstration impossible :', err)
    }
  }
  // Lue par l'effet de chargement initial, qui ne dépend pas de ses coutures.
  const refreshDemoRef = useRef(refreshDemo)
  refreshDemoRef.current = refreshDemo
  const refreshing = useRef(null)
  useEffect(() => () => refreshing.current?.abort(), [])

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
        showDataset(stored)
        // Une démonstration intacte se met à jour en arrière-plan (D-57).
        if (stored && isPristineDemo(stored, readDemoSources()[stored.datasetId]?.baseline) && typeof AbortController === 'function') {
          refreshing.current?.abort()
          const ctrl = new AbortController()
          refreshing.current = ctrl
          refreshDemoRef.current(stored.datasetId, ctrl.signal).finally(() => {
            if (refreshing.current === ctrl) refreshing.current = null
          })
        }
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
