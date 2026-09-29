// Support du lot « apprenant, parcours local » (UC-APP-01/02/03/06) :
// IndexedDB FACTICE, en mémoire, sans dépendance.
//
// Les trois magasins locaux de l'apprenant — portfolios (web/src/lib/
// portfolio-store.js, base « humanome-portfolios »), checkpoints de run
// (engine/src/runs/indexeddb.js, « humanome-runs ») et cartographies
// (web/src/lib/carto-store.js, « humanome-cartographies ») — passent par
// `globalThis.indexedDB`. jsdom n'en fournit pas : sans ce faux, leurs
// adaptateurs IndexedDB ne sont jamais exécutés dans les tests.
//
// Ce faux reproduit le SOUS-ENSEMBLE d'API réellement utilisé par ces
// adaptateurs : open(name, version) + onupgradeneeded/onsuccess/onerror,
// objectStoreNames.contains, createObjectStore(name, {keyPath?}),
// transaction(store, mode).objectStore(store) -> get/put/delete/getAll/
// getAllKeys(range), IDBKeyRange.bound. Les valeurs sont clonées
// (structuredClone, comme le « structured clone » d'IndexedDB) et les
// réponses arrivent de façon ASYNCHRONE (micro-tâche), jamais en synchrone.
//
// Important : un seul faux par fichier de test. `reset()` vide les données
// SANS détruire les bases, car carto-store.js garde un singleton dont la
// connexion ouverte doit rester valide d'un test à l'autre.

function clone(value) {
  return value === undefined ? undefined : structuredClone(value)
}

function makeRequest() {
  return { result: undefined, error: null, onsuccess: null, onerror: null, onupgradeneeded: null }
}

function settle(request, { result, error }) {
  queueMicrotask(() => {
    if (error) {
      request.error = error
      request.onerror?.({ target: request })
    } else {
      request.result = result
      request.onsuccess?.({ target: request })
    }
  })
}

/** IDBKeyRange minimal : seul `bound` est utilisé (engine/src/runs/indexeddb.js). */
export const FakeIDBKeyRange = {
  bound(lower, upper) {
    return { lower, upper, includes: (key) => key >= lower && key <= upper }
  },
}

/**
 * @returns {{
 *   factory: {open: Function},
 *   reset: () => void,
 *   failNextOpen: (message?: string) => void,
 *   failNextRequest: (op: 'get' | 'getAll' | 'put' | 'delete', message?: string) => void,
 *   databases: () => string[],
 *   values: (dbName: string, storeName: string) => object[],
 *   entries: (dbName: string, storeName: string) => Array<[string, object]>,
 *   openCount: () => number,
 * }}
 */
export function createFakeIndexedDb() {
  /** name -> {version, stores: Map<name, {keyPath, records: Map}>} */
  const databases = new Map()
  let pendingOpenFailure = null
  /** op ('get' | 'getAll' | 'put' | 'delete') -> message de l'échec à injecter */
  const pendingRequestFailures = new Map()
  let opens = 0

  /** Consomme l'échec injecté pour `op` (failNextRequest), s'il y en a un. */
  function takeRequestFailure(op) {
    if (!pendingRequestFailures.has(op)) return null
    const message = pendingRequestFailures.get(op)
    pendingRequestFailures.delete(op)
    return Object.assign(new Error(message), { name: 'UnknownError' })
  }

  function storeApi(db, storeName, mode) {
    const store = db.stores.get(storeName)
    const readonlyError = () =>
      Object.assign(new Error(`ReadOnlyError: ${storeName} ouvert en lecture seule`), {
        name: 'ReadOnlyError',
      })
    return {
      get(key) {
        const request = makeRequest()
        const failure = takeRequestFailure('get')
        if (failure) {
          settle(request, { error: failure })
          return request
        }
        settle(request, { result: clone(store.records.get(key)) })
        return request
      },
      getAll() {
        const request = makeRequest()
        const failure = takeRequestFailure('getAll')
        if (failure) {
          settle(request, { error: failure })
          return request
        }
        const keys = [...store.records.keys()].sort()
        settle(request, { result: keys.map((k) => clone(store.records.get(k))) })
        return request
      },
      getAllKeys(range) {
        const request = makeRequest()
        const keys = [...store.records.keys()].sort().filter((k) => !range || range.includes(k))
        settle(request, { result: keys })
        return request
      },
      put(value, key) {
        const request = makeRequest()
        const failure = takeRequestFailure('put')
        if (failure) {
          settle(request, { error: failure })
          return request
        }
        if (mode !== 'readwrite') {
          settle(request, { error: readonlyError() })
          return request
        }
        const effectiveKey = store.keyPath ? value?.[store.keyPath] : key
        if (effectiveKey === undefined) {
          settle(request, {
            error: Object.assign(new Error('DataError: clé absente'), { name: 'DataError' }),
          })
          return request
        }
        store.records.set(effectiveKey, clone(value))
        settle(request, { result: effectiveKey })
        return request
      },
      delete(key) {
        const request = makeRequest()
        const failure = takeRequestFailure('delete')
        if (failure) {
          settle(request, { error: failure })
          return request
        }
        if (mode !== 'readwrite') {
          settle(request, { error: readonlyError() })
          return request
        }
        store.records.delete(key)
        settle(request, { result: undefined })
        return request
      },
    }
  }

  function handle(db) {
    return {
      name: db.name,
      get version() {
        return db.version
      },
      objectStoreNames: { contains: (name) => db.stores.has(name) },
      createObjectStore(name, options = {}) {
        db.stores.set(name, { keyPath: options.keyPath ?? null, records: new Map() })
        return storeApi(db, name, 'readwrite')
      },
      transaction(storeName, mode = 'readonly') {
        if (!db.stores.has(storeName)) {
          throw Object.assign(new Error(`NotFoundError: ${storeName}`), { name: 'NotFoundError' })
        }
        return { objectStore: () => storeApi(db, storeName, mode) }
      },
      close() {},
    }
  }

  const factory = {
    open(name, version = 1) {
      opens += 1
      const request = makeRequest()
      queueMicrotask(() => {
        if (pendingOpenFailure) {
          const error = Object.assign(new Error(pendingOpenFailure), { name: 'UnknownError' })
          pendingOpenFailure = null
          request.error = error
          request.onerror?.({ target: request })
          return
        }
        let db = databases.get(name)
        const upgrade = !db || version > db.version
        if (!db) {
          db = { name, version: 0, stores: new Map() }
          databases.set(name, db)
        }
        request.result = handle(db)
        if (upgrade) {
          db.version = version
          request.onupgradeneeded?.({ target: request, oldVersion: 0, newVersion: version })
        }
        request.onsuccess?.({ target: request })
      })
      return request
    },
  }

  return {
    factory,
    /** Vide toutes les données (les bases et leurs magasins restent ouverts). */
    reset() {
      for (const db of databases.values()) {
        for (const store of db.stores.values()) store.records.clear()
      }
      pendingOpenFailure = null
      pendingRequestFailures.clear()
      opens = 0
    },
    /** La prochaine ouverture échoue (quota dépassé, navigation privée stricte…). */
    failNextOpen(message = 'ouverture refusée par le navigateur') {
      pendingOpenFailure = message
    },
    /**
     * La prochaine requête `op` ('get' | 'getAll' | 'put' | 'delete'), toutes
     * bases confondues, échoue (disque plein, base corrompue…) ; la base reste
     * ouverte et les requêtes suivantes réussissent.
     */
    failNextRequest(op, message = 'requête refusée par le navigateur') {
      pendingRequestFailures.set(op, message)
    },
    databases: () => [...databases.keys()].sort(),
    values(dbName, storeName) {
      const store = databases.get(dbName)?.stores.get(storeName)
      if (!store) return []
      return [...store.records.keys()].sort().map((k) => clone(store.records.get(k)))
    },
    entries(dbName, storeName) {
      const store = databases.get(dbName)?.stores.get(storeName)
      if (!store) return []
      return [...store.records.keys()].sort().map((k) => [k, clone(store.records.get(k))])
    },
    openCount: () => opens,
  }
}
