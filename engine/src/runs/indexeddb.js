// Adaptateur de stockage IndexedDB (navigateur) — base « humanome-runs ».
// Même contrat que memory.js : { get, set, delete, keys } asynchrones.
//
// IMPORTANT : aucun accès DOM/IndexedDB au chargement du module — `indexedDB`
// n'est résolu (via globalThis) qu'au premier appel d'une opération. Le module
// s'importe donc sans erreur sous Node/jsdom ; seules les OPÉRATIONS échouent
// (avec un message explicite) hors navigateur. Les tests ne vérifient que la
// forme du module (cf. storage.test.js).

const DB_NAME = 'humanome-runs'
const STORE_NAME = 'kv'
const DB_VERSION = 1

/**
 * Crée un adaptateur de stockage IndexedDB. L'ouverture de la base est
 * paresseuse (au premier get/set/delete/keys) et partagée entre opérations.
 * @param {{dbName?: string, storeName?: string}} [options]
 * @returns {{get: Function, set: Function, delete: Function, keys: Function}}
 */
export function createIndexedDbStorage ({ dbName = DB_NAME, storeName = STORE_NAME } = {}) {
  let dbPromise = null

  function factory () {
    const idb = globalThis.indexedDB
    if (!idb) {
      throw new Error(
        'createIndexedDbStorage : indexedDB indisponible dans cet environnement — ' +
        'adaptateur navigateur uniquement, utiliser createMemoryStorage() pour les tests'
      )
    }
    return idb
  }

  function open () {
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        let request
        try {
          request = factory().open(dbName, DB_VERSION)
        } catch (err) {
          dbPromise = null
          reject(err)
          return
        }
        request.onupgradeneeded = () => {
          if (!request.result.objectStoreNames.contains(storeName)) {
            request.result.createObjectStore(storeName)
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

  /** Exécute une requête IDB dans une transaction et la promisifie. */
  async function withStore (mode, operation) {
    const db = await open()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, mode)
      const request = operation(tx.objectStore(storeName))
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  }

  return {
    async get (key) {
      const value = await withStore('readonly', (store) => store.get(key))
      return value === undefined ? undefined : value
    },
    async set (key, value) {
      await withStore('readwrite', (store) => store.put(value, key))
    },
    async delete (key) {
      await withStore('readwrite', (store) => store.delete(key))
    },
    async keys (prefix = '') {
      const range = prefix
        ? globalThis.IDBKeyRange.bound(prefix, prefix + '\uffff')
        : undefined
      const result = await withStore('readonly', (store) => store.getAllKeys(range))
      // getAllKeys renvoie déjà en ordre de clé croissant ; tri défensif.
      return [...result].sort()
    }
  }
}
