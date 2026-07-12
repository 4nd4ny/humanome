// Progression de formation (P8.2, cahier §4.6).
//
// Deux sources, une seule vérité à la fois :
//  - ANONYME : localStorage (clé 'humanome-training'), même forme que la
//    réponse serveur ({apprenant: {chapitresTermines: [...]}}) ;
//  - CONNECTÉ : GET/PUT api/training/progress (session + CSRF via apiFetch).
//    À la connexion, la progression locale est MIGRÉE vers le serveur (un PUT
//    par chapitre), puis le localStorage est vidé — le serveur devient la
//    source de vérité, le local ne sert plus que de repli hors-ligne.
//
// RGPD : seuls des identifiants de chapitre transitent (ex.
// '01-pourquoi-un-portfolio-reflexif'), jamais de contenu.

import { apiFetch } from '../api/client.js'

export const TRAINING_STORAGE_KEY = 'humanome-training'
export const TRAINING_PARCOURS = 'apprenant'

/** Stockage mémoire de secours quand localStorage est indisponible. */
function createMemoryStorage() {
  const map = new Map()
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => {
      map.set(k, String(v))
    },
    removeItem: (k) => {
      map.delete(k)
    },
  }
}

/**
 * Crée le store de progression. Les deux dépendances (storage façon
 * localStorage et api {get, put}) sont injectables pour les tests.
 *
 * @param {object} [options]
 * @param {{getItem: Function, setItem: Function, removeItem: Function}} [options.storage]
 * @param {{get: () => Promise<object>, put: (body: object) => Promise<object|null>}} [options.api]
 * @param {string} [options.parcours='apprenant']
 */
export function createTrainingStore(options = {}) {
  const storage = options.storage ?? globalThis.localStorage ?? createMemoryStorage()
  const parcours = options.parcours ?? TRAINING_PARCOURS
  const api = options.api ?? {
    get: () => apiFetch('training/progress'),
    put: (body) => apiFetch('training/progress', { method: 'PUT', body }),
  }

  function readLocal() {
    try {
      const raw = storage.getItem(TRAINING_STORAGE_KEY)
      if (!raw) return []
      const data = JSON.parse(raw)
      const list = data?.[parcours]?.chapitresTermines
      return Array.isArray(list) ? list.filter((c) => typeof c === 'string') : []
    } catch {
      return []
    }
  }

  function writeLocal(chapitres) {
    try {
      storage.setItem(
        TRAINING_STORAGE_KEY,
        JSON.stringify({ [parcours]: { chapitresTermines: [...chapitres] } }),
      )
    } catch {
      // Stockage plein/indisponible : la progression reste en mémoire de session.
    }
  }

  return {
    /** @returns {string[]} chapitres terminés selon le localStorage */
    listLocal() {
      return readLocal()
    },

    /** Coche/décoche un chapitre côté LOCAL (anonyme). */
    setLocal(chapitre, completed) {
      const set = new Set(readLocal())
      if (completed) set.add(chapitre)
      else set.delete(chapitre)
      writeLocal([...set])
    },

    /** Vide la progression locale (après migration réussie). */
    clearLocal() {
      try {
        storage.removeItem(TRAINING_STORAGE_KEY)
      } catch {
        /* sans conséquence */
      }
    },

    /** @returns {Promise<string[]>} chapitres terminés selon le serveur */
    async fetchServer() {
      const data = await api.get()
      const list = data?.[parcours]?.chapitresTermines
      return Array.isArray(list) ? list.filter((c) => typeof c === 'string') : []
    },

    /** Coche/décoche un chapitre côté SERVEUR (connecté, session + CSRF). */
    async setServer(chapitre, completed) {
      await api.put({ parcours, chapitre, completed: Boolean(completed) })
    },

    /**
     * Migre la progression locale vers le serveur (appelée quand une session
     * est détectée). Le localStorage n'est vidé QUE si tous les PUT réussissent.
     * @returns {Promise<{migrated: number}>}
     */
    async migrateLocalToServer() {
      const local = readLocal()
      if (local.length === 0) return { migrated: 0 }
      for (const chapitre of local) {
        await api.put({ parcours, chapitre, completed: true })
      }
      this.clearLocal()
      return { migrated: local.length }
    },

    /**
     * Charge la progression selon l'état de session : connecté -> migration
     * locale puis lecture serveur ; anonyme (ou API en échec) -> local.
     * @param {{connected: boolean}} params
     * @returns {Promise<{chapitres: string[], source: 'serveur'|'local'}>}
     */
    async load({ connected }) {
      if (connected) {
        try {
          await this.migrateLocalToServer()
          return { chapitres: await this.fetchServer(), source: 'serveur' }
        } catch {
          // API momentanément injoignable : la progression locale reste lisible.
          return { chapitres: readLocal(), source: 'local' }
        }
      }
      return { chapitres: readLocal(), source: 'local' }
    },

    /**
     * Coche/décoche un chapitre selon l'état de session.
     * @param {string} chapitre identifiant (slug du fichier Markdown)
     * @param {boolean} completed
     * @param {{connected: boolean}} params
     */
    async setChapter(chapitre, completed, { connected }) {
      if (connected) await this.setServer(chapitre, completed)
      else this.setLocal(chapitre, completed)
    },
  }
}
