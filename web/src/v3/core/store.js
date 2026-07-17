// Interface V3 — persistance locale (IndexedDB) des masters, révisions,
// projets de partage et préférences de présentation. Le master privé NE QUITTE
// JAMAIS le navigateur (RGPD by design, cahier §6 ; spec §3.1). Les
// préférences (§14.4) sont stockées SÉPARÉMENT des données d'évaluation.
//
// Même discipline que lib/carto-store.js : adaptateur injectable (mémoire pour
// les tests), import sans effet de bord.

const DB_NAME = 'humanome-carto-v3'
const DB_VERSION = 1
const STORES = ['masters', 'projects', 'prefs']

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      for (const name of STORES) {
        if (!req.result.objectStoreNames.contains(name)) req.result.createObjectStore(name, { keyPath: 'id' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('IndexedDB indisponible'))
  })
}

function createIndexedDbAdapter() {
  const run = async (store, mode, fn) => {
    const db = await openDb()
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(store, mode)
        const os = tx.objectStore(store)
        const req = fn(os)
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
      })
    } finally {
      db.close()
    }
  }
  return {
    get: (store, id) => run(store, 'readonly', (os) => os.get(id)),
    put: (store, value) => run(store, 'readwrite', (os) => os.put(value)),
    delete: (store, id) => run(store, 'readwrite', (os) => os.delete(id)),
    list: (store) => run(store, 'readonly', (os) => os.getAll()),
  }
}

/** Adaptateur mémoire (tests, environnements sans IndexedDB). */
export function createMemoryAdapter() {
  const data = new Map(STORES.map((s) => [s, new Map()]))
  return {
    get: async (store, id) => structuredClone(data.get(store).get(id)),
    put: async (store, value) => void data.get(store).set(value.id, structuredClone(value)),
    delete: async (store, id) => void data.get(store).delete(id),
    list: async (store) => [...data.get(store).values()].map((v) => structuredClone(v)),
  }
}

/**
 * @param {ReturnType<typeof createMemoryAdapter>} [adapter]
 */
export function createV3Store(adapter) {
  const a = adapter ?? createIndexedDbAdapter()
  return {
    /** Enregistre une révision de master (immuable : id = revision.id). */
    async saveMasterRevision(master) {
      await a.put('masters', {
        id: master.revision.id,
        datasetId: master.datasetId,
        revisionNumber: master.revision.number,
        parentId: master.revision.parentId,
        createdAt: master.revision.createdAt,
        master,
      })
      return { id: master.revision.id }
    },
    async getMasterRevision(revisionId) {
      const rec = await a.get('masters', revisionId)
      return rec?.master ?? null
    },
    /** Dernière révision de chaque dataset (pour la liste d'accueil). */
    async listMasters() {
      const all = await a.list('masters')
      const latest = new Map()
      for (const rec of all) {
        const cur = latest.get(rec.datasetId)
        if (!cur || rec.revisionNumber > cur.revisionNumber) latest.set(rec.datasetId, rec)
      }
      return [...latest.values()].sort((x, y) => (x.createdAt < y.createdAt ? 1 : -1))
    },
    async deleteDataset(datasetId) {
      const all = await a.list('masters')
      for (const rec of all) if (rec.datasetId === datasetId) await a.delete('masters', rec.id)
    },
    async saveProject(project) {
      await a.put('projects', project)
      return { id: project.id }
    },
    async getProject(id) {
      return (await a.get('projects', id)) ?? null
    },
    async listProjects(datasetId = null) {
      const all = await a.list('projects')
      return datasetId ? all.filter((p) => p.masterDatasetId === datasetId) : all
    },
    async deleteProject(id) {
      await a.delete('projects', id)
    },
    /** Préférences de présentation par mode (§14.4) — jamais dans les données. */
    async savePrefs(prefs) {
      await a.put('prefs', { id: 'presentation', ...prefs })
    },
    async getPrefs() {
      return (await a.get('prefs', 'presentation')) ?? null
    },
  }
}
