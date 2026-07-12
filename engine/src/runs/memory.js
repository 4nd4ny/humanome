// Adaptateur de stockage en mémoire (Map) — implémentation de référence pour
// les tests et Node. Même contrat que indexeddb.js :
//   { get(key), set(key, value), delete(key), keys(prefix) } — tout asynchrone.
// Les valeurs sont clonées à l'écriture ET à la lecture pour reproduire la
// sémantique « structured clone » d'IndexedDB (aucun partage de référence
// entre l'appelant et le stockage).

const clone = (value) => {
  if (value === undefined) return undefined
  if (typeof globalThis.structuredClone === 'function') return globalThis.structuredClone(value)
  return JSON.parse(JSON.stringify(value))
}

/**
 * Crée un adaptateur de stockage en mémoire.
 * @returns {{get: Function, set: Function, delete: Function, keys: Function}}
 */
export function createMemoryStorage () {
  const map = new Map()
  return {
    async get (key) {
      return map.has(key) ? clone(map.get(key)) : undefined
    },
    async set (key, value) {
      map.set(key, clone(value))
    },
    async delete (key) {
      map.delete(key)
    },
    async keys (prefix = '') {
      return [...map.keys()].filter((k) => k.startsWith(prefix)).sort()
    }
  }
}
