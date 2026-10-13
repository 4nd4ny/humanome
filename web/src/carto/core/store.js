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
  return {
    date,
    portfolio: patchValue.portfolio !== undefined ? patchValue.portfolio : detail.portfolio,
    variants: { ...detail.variants, ...(patchValue.variants ?? {}) },
  }
}

/**
 * @param {{adapter?: ReturnType<typeof createMemoryAdapter>}} [opts]
 */
export function createCartoStore({ adapter } = {}) {
  const a = adapter ?? defaultAdapter()
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

    async loadDayDetail(datasetId, date) {
      const rec = await a.transaction(['details'], 'readonly', (t) => t.get('details', detailKey(datasetId, date)))
      return rec?.detail ?? null
    },

    async loadDayDetails(datasetId, dates) {
      const wanted = new Set(dates)
      const recs = await a.transaction(['details'], 'readonly', (t) => t.range('details', rangeOf(datasetId)))
      return new Map(recs.filter((r) => wanted.has(r.date)).map((r) => [r.date, r.detail]))
    },

    async loadRunDetail(datasetId, key) {
      const rec = await a.transaction(['runs'], 'readonly', (t) => t.get('runs', runKey(datasetId, key)))
      return rec?.value ?? null
    },

    /**
     * Écrit le résultat d'un import en UNE transaction : index, retouches des
     * détails (lecture-modification-écriture) et détails de run.
     * @param {{dataset: object, detailPatches?: Map<string, object>, runDetails?: Array<{key: string, value: object}>}} input
     */
    async commit({ dataset, detailPatches = new Map(), runDetails = [] }) {
      const id = dataset.datasetId
      await a.transaction(STORES, 'readwrite', async (t) => {
        for (const [date, p] of detailPatches) {
          const existing = await t.get('details', detailKey(id, date))
          await t.put('details', { key: detailKey(id, date), datasetId: id, date, detail: applyDetailPatch(existing?.detail ?? null, date, p) })
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

    /** Tout le contenu d'un jeu (archive JSON, §11). */
    async exportAll(datasetId) {
      return a.transaction(STORES, 'readonly', async (t) => {
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
    },
  }
}
