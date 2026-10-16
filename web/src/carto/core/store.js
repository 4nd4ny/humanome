// Interface ultime — persistance locale (spec §1.4, §4.2 ; journal D-4).
//
// IndexedDB « humanome-carto-v4 », trois magasins :
//   datasets  un enregistrement par jeu de données : l'INDEX léger (tous les
//             calculs du §5 n'utilisent que lui) ;
//   details   un enregistrement par journée : extraits, jury, portfolio du
//             jour… — chargé à la demande (chargement paresseux) ;
//   runs      détails de run AuroraCore (jury complet, délibération, débat,
//             pièces), rangés une fois et référencés par les journées.
//
// L'import est écrit en UNE transaction (tout ou rien) : V3 ne le garantissait
// pas (défaut relevé dans RunWizard). Rien ne quitte le navigateur ;
// `localStorage` n'est jamais utilisé pour des données.
//
// Un jeu LU À LA DEMANDE (la démonstration du site, journal D-67) n'a ici que
// son index : ses détails sont des fichiers statiques du site (`remote`,
// core/split.js), lus quand on ouvre ce qu'ils contiennent et gardés le temps
// de la session. Ce que la personne y ajoute (un passage rattaché, une
// analyse importée) est rangé ici, par-dessus.

import { NEED_ALL, assembleDay, expandNeed, isLocalBase, partPath, withOverlay } from './split.js'

const DB_NAME = 'humanome-carto-v4'
const DB_VERSION = 1
export const STORES = ['datasets', 'details', 'runs']

const detailKey = (datasetId, date) => `${datasetId}|${date}`
const runKey = (datasetId, key) => `${datasetId}|${key}`
const rangeOf = (datasetId) => ({ lower: `${datasetId}|`, upper: `${datasetId}|￿` })

// ---- Adaptateur mémoire (tests, navigateurs sans IndexedDB) --------------------

/** Adaptateur mémoire transactionnel : en cas d'erreur, rien n'est écrit. */
export function createMemoryAdapter() {
  const data = new Map(STORES.map((s) => [s, new Map()]))
  return {
    kind: 'memory',
    async transaction(stores, mode, fn) {
      const staging = new Map(stores.map((s) => [s, new Map(data.get(s))]))
      const api = {
        get: async (store, key) => structuredClone(staging.get(store).get(key)),
        put: async (store, value) => void staging.get(store).set(value.key, structuredClone(value)),
        delete: async (store, key) => void staging.get(store).delete(key),
        range: async (store, { lower, upper }) =>
          [...staging.get(store).entries()].filter(([k]) => k >= lower && k <= upper).sort(([a], [b]) => (a < b ? -1 : 1)).map(([, v]) => structuredClone(v)),
        all: async (store) => [...staging.get(store).values()].map((v) => structuredClone(v)),
      }
      const result = await fn(api)
      if (mode === 'readwrite') for (const s of stores) data.set(s, staging.get(s))
      return result
    },
  }
}

// ---- Adaptateur IndexedDB -------------------------------------------------------------

function openDb(name = DB_NAME) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(name, DB_VERSION)
    req.onupgradeneeded = () => {
      for (const s of STORES) if (!req.result.objectStoreNames.contains(s)) req.result.createObjectStore(s, { keyPath: 'key' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('IndexedDB indisponible'))
    req.onblocked = () => reject(new Error('IndexedDB bloquée par un autre onglet'))
  })
}

const asPromise = (request) =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })

/** Adaptateur IndexedDB : une transaction réelle couvrant tous les magasins demandés. */
export function createIndexedDbAdapter({ dbName = DB_NAME } = {}) {
  return {
    kind: 'indexeddb',
    async transaction(stores, mode, fn) {
      const db = await openDb(dbName)
      try {
        const tx = db.transaction(stores, mode)
        const done = new Promise((resolve, reject) => {
          tx.oncomplete = () => resolve()
          tx.onerror = () => reject(tx.error ?? new Error('Transaction IndexedDB en échec'))
          tx.onabort = () => reject(tx.error ?? new Error('Transaction IndexedDB annulée'))
        })
        const api = {
          get: (store, key) => asPromise(tx.objectStore(store).get(key)),
          put: (store, value) => asPromise(tx.objectStore(store).put(value)),
          delete: (store, key) => asPromise(tx.objectStore(store).delete(key)),
          range: (store, { lower, upper }) => asPromise(tx.objectStore(store).getAll(IDBKeyRange.bound(lower, upper))),
          all: (store) => asPromise(tx.objectStore(store).getAll()),
        }
        let result
        try {
          result = await fn(api)
        } catch (err) {
          done.catch(() => {}) // l'annulation est voulue : seule l'erreur d'origine remonte
          try {
            tx.abort()
          } catch {
            /* déjà terminée */
          }
          throw err
        }
        await done
        return result
      } finally {
        db.close()
      }
    },
  }
}

/** Adaptateur par défaut : IndexedDB si disponible, sinon mémoire (session seulement). */
export function defaultAdapter() {
  return typeof indexedDB !== 'undefined' ? createIndexedDbAdapter() : createMemoryAdapter()
}

// ---- Magasin --------------------------------------------------------------------------

/** Fusionne une retouche dans un détail de journée existant. */
export function applyDetailPatch(existing, date, patchValue) {
  const detail = existing ?? { date, portfolio: null, variants: {} }
  let portfolio = patchValue.portfolio !== undefined ? patchValue.portfolio : detail.portfolio
  if (patchValue.portfolioAppend) {
    // Passage rattaché à une journée qui a déjà du texte : ajouté à la suite.
    const add = patchValue.portfolioAppend
    portfolio = portfolio?.text
      ? { ...portfolio, text: `${portfolio.text.replace(/\s+$/u, '')}\n\n${add.text}` }
      : { title: add.title ?? null, text: add.text, source: add.source ?? null }
  }
  return {
    date,
    portfolio,
    variants: { ...detail.variants, ...(patchValue.variants ?? {}) },
  }
}

/** Variantes d'une journée d'après l'index. */
const variantIdsOf = (dataset, date) => (dataset.days.find((d) => d.date === date)?.variants ?? []).map((v) => v.id)

/**
 * @param {{adapter?: ReturnType<typeof createMemoryAdapter>, fetchFn?: typeof fetch}} [opts]
 *   fetchFn : lecture des fichiers d'un jeu lu à la demande (défaut : fetch)
 */
export function createCartoStore({ adapter, fetchFn } = {}) {
  const a = adapter ?? defaultAdapter()
  const fetchUrl = fetchFn ?? ((...args) => globalThis.fetch(...args))

  // ---- Jeux lus à la demande : fichiers lus, par dossier de version ----------
  // Un fichier n'est demandé qu'une fois par session ; un échec se retente.
  const requests = new Map() // url → Promise<object>
  const loaded = new Map() // base → {days, portfolio, codes, poles: Map}

  const shelf = (base) => {
    if (!loaded.has(base)) loaded.set(base, { days: new Map(), portfolio: new Map(), codes: new Map(), poles: new Map() })
    return loaded.get(base)
  }

  /** Lit un fichier d'un jeu lu à la demande et le range. */
  function remoteFile(dataset, path) {
    // Seulement des fichiers de ce site, à côté de l'index (D-67).
    if (!isLocalBase(dataset.remote.base) || !/^[A-Za-z0-9._/-]+$/.test(path) || path.split('/').includes('..')) {
      return Promise.reject(new Error(`${path} : renvoi hors du site, non suivi`))
    }
    const url = `${dataset.remote.base}${path}`
    if (!requests.has(url)) {
      const request = (async () => {
        let res
        try {
          res = await fetchUrl(url)
        } catch {
          throw new Error(`${path} : site injoignable`)
        }
        if (!res?.ok) throw new Error(res?.status === 404 ? `${path} introuvable sur le site` : `${path} illisible (HTTP ${res?.status ?? '?'})`)
        let value
        try {
          value = await res.json()
        } catch {
          throw new Error(`${path} illisible (JSON invalide)`)
        }
        const s = shelf(dataset.remote.base)
        const r = dataset.remote
        for (const [date, p] of Object.entries(r.days ?? {})) if (p === path) s.days.set(date, value)
        for (const [date, p] of Object.entries(r.portfolio ?? {})) if (p === path) s.portfolio.set(date, value)
        for (const [code, p] of Object.entries(r.codes ?? {})) if (p === path) s.codes.set(code, value)
        for (const [n, p] of Object.entries(r.poles ?? {})) if (p === path) s.poles.set(Number(n), value)
        return value
      })()
      requests.set(url, request)
      request.catch(() => requests.delete(url))
    }
    return requests.get(url)
  }

  /** Clés satisfaites pour une journée : leur fichier est lu, ou il n'y en a pas. */
  function satisfied(dataset, date, keys) {
    const s = shelf(dataset.remote.base)
    const r = dataset.remote
    const done = (k) => {
      const path = partPath(r, date, k)
      if (!path) return true
      if (k === 'day') return s.days.has(date)
      if (k === 'portfolio') return s.portfolio.has(date)
      if (k.startsWith('code:')) return s.codes.has(k.slice(5))
      if (k.startsWith('pole:')) return s.poles.has(Number(k.slice(5)))
      return false
    }
    const out = keys.filter(done)
    if (expandNeed(dataset, date, NEED_ALL).every(done)) out.push(NEED_ALL)
    return out
  }

  /** Détails rangés ici (un jeu lu à la demande : ce que la personne y a ajouté). */
  async function loadDayDetails(datasetId, dates) {
    const wanted = new Set(dates)
    const recs = await a.transaction(['details'], 'readonly', (t) => t.range('details', rangeOf(datasetId)))
    return new Map(recs.filter((r) => wanted.has(r.date)).map((r) => [r.date, r.detail]))
  }

  /** Une journée remontée avec tout ce qui est lu de ce jeu, et ce que la personne y a mis. */
  function assembled(dataset, date, overlay) {
    const s = shelf(dataset.remote.base)
    const record = assembleDay(date, variantIdsOf(dataset, date), { day: s.days.get(date), portfolio: s.portfolio.get(date), codes: s.codes, poles: s.poles })
    return withOverlay(record, overlay)
  }

  return {
    adapterKind: a.kind,

    /** Résumés des jeux de données (accueil, choix du jeu). */
    async listDatasets() {
      const all = await a.transaction(['datasets'], 'readonly', (t) => t.all('datasets'))
      return all
        .map(({ dataset }) => ({
          datasetId: dataset.datasetId,
          title: dataset.title,
          updatedAt: dataset.updatedAt,
          dayCount: dataset.days.length,
          referential: dataset.referential?.label ?? '—',
        }))
        .sort((x, y) => (x.updatedAt < y.updatedAt ? 1 : -1))
    },

    async loadDataset(datasetId) {
      const rec = await a.transaction(['datasets'], 'readonly', (t) => t.get('datasets', datasetId))
      return rec?.dataset ?? null
    },

    /** Enregistre l'INDEX seul (cases cochées, étiquettes, ensembles, revues…). */
    async saveDataset(dataset) {
      await a.transaction(['datasets'], 'readwrite', (t) => t.put('datasets', { key: dataset.datasetId, dataset }))
    },

    /**
     * Enregistre l'index d'un jeu SEULEMENT s'il existe encore : un autre
     * onglet a pu le supprimer (ou remplacer la démonstration, D-57) ; un
     * enregistrement différé ne doit pas le recréer sans ses journées.
     * @returns {Promise<boolean>} faux si le jeu n'existe plus
     */
    async saveExistingDataset(dataset) {
      return a.transaction(['datasets'], 'readwrite', async (t) => {
        if (!(await t.get('datasets', dataset.datasetId))) return false
        await t.put('datasets', { key: dataset.datasetId, dataset })
        return true
      })
    },

    async loadDayDetail(datasetId, date) {
      const rec = await a.transaction(['details'], 'readonly', (t) => t.get('details', detailKey(datasetId, date)))
      return rec?.detail ?? null
    },

    loadDayDetails,

    /**
     * Journées d'un jeu, avec ce qu'elles satisfont : un jeu d'ici est lu en
     * entier (`all`) ; un jeu lu à la demande, seulement les fichiers que le
     * besoin demande (une compétence, un pôle, le texte, la journée), lus ou
     * déjà lus, plus ce que la personne y a ajouté ici. Un fichier qui ne se
     * lit pas fait échouer l'appel (réessayable) ; l'erreur porte ce qui a pu
     * être lu (`partial`), que l'on garde : un fichier absent ne prive pas les
     * autres journées des leurs.
     * @param {string} datasetId
     * @param {string[]} dates
     * @param {{dataset?: object | null, need?: string | string[]}} [opts] dataset : l'index (jeu lu à la demande)
     * @returns {Promise<Map<string, {detail: object | null, parts: string[]}>>}
     */
    async loadDays(datasetId, dates, { dataset = null, need = NEED_ALL } = {}) {
      const local = await loadDayDetails(datasetId, dates)
      if (!dataset?.remote) return new Map(dates.map((d) => [d, { detail: local.get(d) ?? null, parts: [NEED_ALL] }]))
      const wanted = new Map(dates.map((d) => [d, expandNeed(dataset, d, need)]))
      const paths = new Set()
      for (const [d, keys] of wanted) for (const k of keys) {
        const p = partPath(dataset.remote, d, k)
        if (p) paths.add(p)
      }
      const results = await Promise.allSettled([...paths].map((p) => remoteFile(dataset, p)))
      const out = new Map(dates.map((d) => [d, { detail: assembled(dataset, d, local.get(d)), parts: satisfied(dataset, d, wanted.get(d)) }]))
      const failed = results.filter((r) => r.status === 'rejected').map((r) => r.reason?.message ?? String(r.reason))
      if (failed.length > 0) {
        const err = new Error(failed.length === 1 ? failed[0] : `${failed[0]}, et ${failed.length - 1} autre(s) fichier(s)`)
        err.partial = out
        throw err
      }
      return out
    },

    /** Délibération d'un run ; d'un jeu lu à la demande, lue sur le site si elle n'est pas ici. */
    async loadRunDetail(datasetId, key, { dataset = null } = {}) {
      const rec = await a.transaction(['runs'], 'readonly', (t) => t.get('runs', runKey(datasetId, key)))
      if (rec) return rec.value ?? null
      const path = dataset?.remote?.runs?.[key]
      return path ? ((await remoteFile(dataset, path))?.value ?? null) : null
    },

    /**
     * Écrit le résultat d'un import en UNE transaction : index, retouches des
     * détails (lecture-modification-écriture) et détails de run.
     * @param {{dataset: object, detailPatches?: Map<string, object>, runDetails?: Array<{key: string, value: object}>}} input
     */
    async commit({ dataset, detailPatches = new Map(), runDetails = [] }) {
      const id = dataset.datasetId
      // Jeu lu à la demande : ce qui s'ajoute ici se range par-dessus les
      // fichiers du site (sans texte propre, `portfolio` reste indéfini) ; un
      // ajout au texte d'une journée part du texte du site, lu d'abord.
      const remote = dataset.remote ?? null
      const siteText = new Map()
      if (remote) {
        for (const [date, p] of detailPatches) {
          if (p.portfolioAppend && remote.portfolio?.[date]) siteText.set(date, (await remoteFile(dataset, remote.portfolio[date]))?.portfolio ?? null)
        }
      }
      await a.transaction(STORES, 'readwrite', async (t) => {
        for (const [date, p] of detailPatches) {
          const existing = await t.get('details', detailKey(id, date))
          let base = existing?.detail ?? null
          if (remote) {
            base ??= { date, portfolio: undefined, variants: {} }
            if (base.portfolio === undefined && p.portfolioAppend) base = { ...base, portfolio: siteText.get(date) ?? null }
          }
          await t.put('details', { key: detailKey(id, date), datasetId: id, date, detail: applyDetailPatch(base, date, p) })
        }
        for (const rd of runDetails) await t.put('runs', { key: runKey(id, rd.key), datasetId: id, value: rd.value })
        await t.put('datasets', { key: id, dataset })
      })
    },

    /** Supprime un jeu de données et tout ce qui lui appartient (une transaction). */
    async deleteDataset(datasetId) {
      await a.transaction(STORES, 'readwrite', async (t) => {
        for (const store of ['details', 'runs']) {
          for (const rec of await t.range(store, rangeOf(datasetId))) await t.delete(store, rec.key)
        }
        await t.delete('datasets', datasetId)
      })
    },

    /**
     * Tout le contenu d'un jeu (archive JSON, §11). Un jeu lu à la demande
     * est lu en entier sur le site d'abord : l'archive est complète, sans
     * renvoi au site.
     */
    async exportAll(datasetId) {
      const out = await a.transaction(STORES, 'readonly', async (t) => {
        const rec = await t.get('datasets', datasetId)
        if (!rec) return null
        const details = await t.range('details', rangeOf(datasetId))
        const runs = await t.range('runs', rangeOf(datasetId))
        return {
          dataset: rec.dataset,
          details: Object.fromEntries(details.map((r) => [r.date, r.detail])),
          runDetails: Object.fromEntries(runs.map((r) => [r.key.slice(datasetId.length + 1), r.value])),
        }
      })
      const remote = out?.dataset?.remote
      if (!remote) return out
      const ds = out.dataset
      const paths = new Set([remote.days, remote.portfolio, remote.codes, remote.poles, remote.runs].flatMap((m) => Object.values(m ?? {})))
      await Promise.all([...paths].map((p) => remoteFile(ds, p)))
      const dates = [...new Set([...ds.days.map((d) => d.date), ...Object.keys(remote.days ?? {}), ...Object.keys(remote.portfolio ?? {}), ...Object.keys(out.details)])].sort()
      const details = {}
      for (const date of dates) {
        const record = assembled(ds, date, out.details[date])
        if (record.portfolio || Object.keys(record.variants).length > 0) details[date] = record
      }
      const runDetails = {}
      for (const [key, path] of Object.entries(remote.runs ?? {})) runDetails[key] = (await remoteFile(ds, path))?.value ?? null
      const dataset = { ...ds }
      delete dataset.remote
      return { dataset, details, runDetails: { ...runDetails, ...out.runDetails } }
    },
  }
}
