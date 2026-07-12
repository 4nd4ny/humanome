// Local portfolio persistence (P7.4) — IndexedDB database 'humanome-portfolios'.
//
// RGPD by design (cahier §4.2/§6): portfolios NEVER leave the browser — this
// module has zero network I/O. The IndexedDB access is isolated behind a tiny
// injectable adapter ({getAll, get, put, delete}) so the store logic is tested
// with the in-memory adapter (no new dependency, no fake-indexeddb).
//
// Record shape: {id, titre, source, texte, segments, createdAt, updatedAt}
// - `segments` follows engine/src/portfolio/segment.js output
//   ({date, titre?, texte, debut, fin}).
// - `source`: 'colle' | 'gdocs' | 'fichier' (archive-export enum).
//
// Same lazy-open discipline as engine/src/runs/indexeddb.js: importing this
// module touches nothing; only OPERATIONS fail outside a browser.

const DB_NAME = 'humanome-portfolios'
const STORE_NAME = 'portfolios'
const DB_VERSION = 1

/** @returns {string} random portfolio id */
function randomId() {
  const uuid = globalThis.crypto?.randomUUID?.()
  if (uuid) return uuid
  return `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

/** Deep-copies a record so callers cannot mutate stored state. */
function clone(value) {
  return value === undefined ? undefined : structuredClone(value)
}

/**
 * In-memory adapter — same contract as the IndexedDB one. Used by tests and
 * as a graceful degradation seam.
 * @returns {{getAll: Function, get: Function, put: Function, delete: Function}}
 */
export function createMemoryAdapter() {
  const records = new Map()
  return {
    async getAll() {
      return [...records.values()].map(clone)
    },
    async get(id) {
      return clone(records.get(id))
    },
    async put(record) {
      records.set(record.id, clone(record))
    },
    async delete(id) {
      records.delete(id)
    },
  }
}

/**
 * IndexedDB adapter over the 'humanome-portfolios' database. Lazy: the
 * database is only opened on the first operation, never at import time.
 * @param {{dbName?: string, storeName?: string}} [options]
 * @returns {{getAll: Function, get: Function, put: Function, delete: Function}}
 */
export function createIndexedDbAdapter({ dbName = DB_NAME, storeName = STORE_NAME } = {}) {
  let dbPromise = null

  function open() {
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        const idb = globalThis.indexedDB
        if (!idb) {
          dbPromise = null
          reject(
            new Error(
              'IndexedDB est indisponible dans ce navigateur : les portfolios ne peuvent pas être conservés localement.',
            ),
          )
          return
        }
        const request = idb.open(dbName, DB_VERSION)
        request.onupgradeneeded = () => {
          if (!request.result.objectStoreNames.contains(storeName)) {
            request.result.createObjectStore(storeName, { keyPath: 'id' })
          }
        }
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => {
          dbPromise = null
          reject(request.error)
        }
      })
    }
    return dbPromise
  }

  async function withStore(mode, operation) {
    const db = await open()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, mode)
      const request = operation(tx.objectStore(storeName))
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  }

  return {
    async getAll() {
      return withStore('readonly', (store) => store.getAll())
    },
    async get(id) {
      const value = await withStore('readonly', (store) => store.get(id))
      return value === undefined ? undefined : value
    },
    async put(record) {
      await withStore('readwrite', (store) => store.put(record))
    },
    async delete(id) {
      await withStore('readwrite', (store) => store.delete(id))
    },
  }
}

/**
 * Portfolio CRUD over an injectable adapter.
 *
 * @param {ReturnType<typeof createMemoryAdapter>} [adapter]
 * @param {{now?: () => string, id?: () => string}} [options] test seams
 */
export function createPortfolioStore(adapter = createIndexedDbAdapter(), options = {}) {
  const now = options.now ?? (() => new Date().toISOString())
  const nextId = options.id ?? randomId

  return {
    /** @returns {Promise<object[]>} all portfolios, most recently updated first */
    async list() {
      const records = await adapter.getAll()
      return records.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
    },

    /** @returns {Promise<object | undefined>} one portfolio by id */
    async get(id) {
      return adapter.get(id)
    },

    /**
     * Creates and persists a new portfolio.
     * @param {{titre?: string, texte?: string, source?: string, segments?: object[]}} [init]
     * @returns {Promise<object>} the created record
     */
    async create(init = {}) {
      const stamp = now()
      const record = {
        id: nextId(),
        titre: init.titre ?? 'Portfolio sans titre',
        source: init.source ?? 'colle',
        texte: init.texte ?? '',
        segments: init.segments ?? [],
        createdAt: stamp,
        updatedAt: stamp,
      }
      await adapter.put(record)
      return record
    },

    /**
     * Persists an updated portfolio (bumps updatedAt).
     * @param {object} record full record (must carry its id)
     * @returns {Promise<object>} the saved record
     */
    async save(record) {
      if (!record || typeof record.id !== 'string' || record.id === '') {
        throw new TypeError('portfolio-store.save: record.id manquant')
      }
      const saved = { ...record, updatedAt: now() }
      await adapter.put(saved)
      return saved
    },

    /** Deletes a portfolio (local data only). */
    async remove(id) {
      await adapter.delete(id)
    },
  }
}
