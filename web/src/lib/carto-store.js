// Local cartography persistence (P8, chantier C) — IndexedDB database
// 'humanome-cartographies'.
//
// RGPD by design (cahier §3.2/§6): cartographies live in the browser by
// default — this module has ZERO network I/O. The server copy is a separate,
// explicit opt-in handled by the UI (CartographiesPanel), which only records
// the resulting `serverId` here.
//
// Record shape (contract with chantier B, see plan M6):
//   {id, type: 'jour' | 'merge', titre,
//    visibility: 'privee' | 'cartographe' | 'publique',
//    document,                          // cartographie-jour | cartographie-merge
//    promptPackage: {id, version} | null,
//    referentiel:   {id, version} | null,
//    runMeta: object | null,            // {modele, dateRun, tokens?, coutEstime?}
//    serverId: number | null,           // id of the opt-in server copy, if any
//    createdAt, updatedAt}
//
// Same injectable-adapter pattern as lib/portfolio-store.js: the IndexedDB
// access sits behind a tiny {getAll, get, put, delete} adapter so the store
// logic is tested with the in-memory adapter. Lazy-open discipline: importing
// this module touches nothing; only OPERATIONS fail outside a browser.

const DB_NAME = 'humanome-cartographies'
const STORE_NAME = 'cartographies'
const DB_VERSION = 1

/** Visibility values accepted by the API contract (docs/autorisations.md P8). */
export const VISIBILITIES = Object.freeze(['privee', 'cartographe', 'publique'])

/** @returns {string} random cartography id */
function randomId() {
  const uuid = globalThis.crypto?.randomUUID?.()
  if (uuid) return uuid
  return `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
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
 * IndexedDB adapter over the 'humanome-cartographies' database. Lazy: the
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
              'IndexedDB est indisponible dans ce navigateur : les cartographies ne peuvent pas être conservées localement.',
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

/** Normalizes an entry into a full record (defaults applied, id preserved). */
function normalize(entry, id, stamp) {
  return {
    id,
    type: entry.type === 'merge' ? 'merge' : 'jour',
    titre: entry.titre ?? 'Cartographie sans titre',
    visibility: VISIBILITIES.includes(entry.visibility) ? entry.visibility : 'privee',
    document: entry.document ?? null,
    promptPackage: entry.promptPackage ?? null,
    referentiel: entry.referentiel ?? null,
    runMeta: entry.runMeta ?? null,
    serverId: entry.serverId ?? null,
    createdAt: entry.createdAt ?? stamp,
    updatedAt: stamp,
  }
}

/**
 * Cartography CRUD over an injectable adapter — the LOCAL half of the M6
 * contract (chantier C provides, chantier B consumes).
 *
 * @param {ReturnType<typeof createMemoryAdapter>} [adapter]
 * @param {{now?: () => string, id?: () => string}} [options] test seams
 */
export function createCartoStore(adapter = createIndexedDbAdapter(), options = {}) {
  const now = options.now ?? (() => new Date().toISOString())
  const nextId = options.id ?? randomId

  return {
    /** @returns {Promise<object[]>} all cartographies, most recently updated first */
    async listCartographies() {
      const records = await adapter.getAll()
      return records.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
    },

    /** @returns {Promise<object | undefined>} one cartography by id */
    async getCartography(id) {
      return adapter.get(id)
    },

    /**
     * Creates (or overwrites, when entry.id is provided) a cartography.
     * @param {object} entry partial entry; defaults applied (visibility 'privee',
     *   serverId null, promptPackage/referentiel/runMeta null)
     * @returns {Promise<{id: string}>}
     */
    async saveCartography(entry = {}) {
      const id = typeof entry.id === 'string' && entry.id !== '' ? entry.id : nextId()
      await adapter.put(normalize(entry, id, now()))
      return { id }
    },

    /**
     * Merges a patch into an existing cartography (bumps updatedAt).
     * @param {string} id
     * @param {object} patch fields to overwrite ({serverId}, {visibility}, ...)
     * @returns {Promise<object>} the updated record
     * @throws {Error} French message when the id is unknown
     */
    async updateCartography(id, patch = {}) {
      const record = await adapter.get(id)
      if (record === undefined) {
        throw new Error(`Cartographie introuvable (id ${id}).`)
      }
      const updated = { ...record, ...patch, id, updatedAt: now() }
      await adapter.put(updated)
      return updated
    },

    /** Deletes a cartography (local data only — the server copy is the UI's job). */
    async removeCartography(id) {
      await adapter.delete(id)
    },
  }
}

// ---------------------------------------------------------------------------
// Default singleton (lazy) — lets chantier B import plain functions:
//   import { listCartographies, saveCartography } from '../lib/carto-store.js'
// The IndexedDB adapter is only created on first use (import stays side-effect
// free, same discipline as the adapters above).
let defaultStore = null

function store() {
  if (!defaultStore) defaultStore = createCartoStore()
  return defaultStore
}

/** @see createCartoStore */
export function listCartographies() {
  return store().listCartographies()
}

/** @see createCartoStore */
export function getCartography(id) {
  return store().getCartography(id)
}

/** @see createCartoStore */
export function saveCartography(entry) {
  return store().saveCartography(entry)
}

/** @see createCartoStore */
export function updateCartography(id, patch) {
  return store().updateCartography(id, patch)
}

/** @see createCartoStore */
export function removeCartography(id) {
  return store().removeCartography(id)
}
