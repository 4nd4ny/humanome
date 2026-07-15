// Persistance locale du run Twin9 courant (ADR-010 §5) — permet de proposer
// une REPRISE après interruption/rechargement. Réutilise l'adaptateur IndexedDB
// de P7 (lib/portfolio-store.js) : même discipline d'ouverture paresseuse, zéro
// I/O à l'import, testable via un adaptateur mémoire injecté.
//
// IMPORTANT (fidélité) : on ne persiste PAS l'objet `etat` du moteur ici. Il
// contient des PyFloat/Map dont la reconstruction par la structured-clone
// d'IndexedDB N'EST PAS fidèle (les PyFloat deviennent des objets simples et la
// sortie re-sérialisée diffère — vérifié empiriquement). Réutiliser un tel état
// corromprait carto_evolutive.json. On persiste donc uniquement les PARAMÈTRES
// du run (portfolio, modèle, facturation, marqueur de progression) : au retour,
// on restaure les saisies et on RELANCE. La reprise fidèle « pause → recharge →
// suite » se fait, elle, EN MÉMOIRE dans la vue (l'objet `etat` vivant, jamais
// re-sérialisé) — cf. ADR-010 §5 (402 en cours).
//
// RGPD (ADR-010 §5) : ces données restent EN LOCAL (IndexedDB), jamais sur notre
// serveur — l'endpoint /twin9/appel est sans état. Un seul enregistrement
// « courant » à la fois (clé fixe).

import { createIndexedDbAdapter, createMemoryAdapter } from '../../lib/portfolio-store.js'

const RUN_COURANT = 'run-courant'

/**
 * @param {{getAll: Function, get: Function, put: Function, delete: Function}} [adapter]
 * @param {{now?: () => string}} [options]
 */
export function createTwin9Store(
  adapter = createIndexedDbAdapter({ dbName: 'humanome-twin9', storeName: 'runs' }),
  options = {},
) {
  const now = options.now ?? (() => new Date().toISOString())
  return {
    /**
     * Sauvegarde les paramètres du run courant (écrase le précédent). Ne JAMAIS
     * y mettre l'objet `etat` du moteur (voir en-tête : fidélité).
     * @param {{portfolioTexte: string, modele: string, facturation: string,
     *   phase: string, faits?: number, total?: number}} data
     */
    async save(data) {
      await adapter.put({ id: RUN_COURANT, ...data, updatedAt: now() })
    },
    /** @returns {Promise<object|undefined>} le run courant s'il existe */
    async charger() {
      return adapter.get(RUN_COURANT)
    },
    /** Efface le run courant (fin normale, annulation, ou nouveau départ). */
    async effacer() {
      await adapter.delete(RUN_COURANT)
    },
  }
}

/** Fabrique un store adossé à un adaptateur mémoire (tests, dégradation). */
export function createMemoryTwin9Store(options = {}) {
  return createTwin9Store(createMemoryAdapter(), options)
}
