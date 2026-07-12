// Journal de run (plan-portage-moteur §Runs) : entrées horodatées accumulées
// via l'adaptateur de stockage injecté (une clé par entrée, séquence
// lexicographique), exportables en JSON. Le journal survit donc au
// rechargement d'onglet exactement comme les checkpoints.
//
// Entrée : { ts, type, iso?, model?, tokensIn?, tokensOut?, costEstimate?, ... }
// (champs supplémentaires libres, ex. `error` sur day_failed).

export const JOURNAL_ENTRY_TYPES = Object.freeze([
  'run_started',
  'run_resumed',
  'day_started',
  'day_completed',
  'day_failed',
  'run_completed'
])

const SEQ_PAD = 8

/**
 * Crée un journal adossé au stockage, sous le préfixe `journal:<runId>:`.
 * La séquence reprend après le dernier numéro existant (reprise de run).
 * @param {{runId: string, storage: object, now?: () => string}} options
 *   `now` injectable pour les tests (défaut : ISO 8601 UTC courant)
 * @returns {{runId: string, append: Function, entries: Function, exportJSON: Function}}
 */
export function createJournal ({ runId, storage, now = () => new Date().toISOString() } = {}) {
  if (typeof runId !== 'string' || runId === '') throw new TypeError('createJournal : runId (string non vide) requis')
  if (!storage || typeof storage.set !== 'function') throw new TypeError('createJournal : storage requis')

  const prefix = `journal:${runId}:`
  let nextSeq = null // découvert paresseusement depuis le stockage

  async function claimSeq () {
    if (nextSeq === null) {
      const existing = await storage.keys(prefix)
      nextSeq = existing.reduce((max, key) => {
        const n = Number.parseInt(key.slice(prefix.length), 10)
        return Number.isFinite(n) && n + 1 > max ? n + 1 : max
      }, 0)
    }
    return nextSeq++
  }

  async function entries () {
    const keys = (await storage.keys(prefix)).sort()
    const out = []
    for (const key of keys) out.push(await storage.get(key))
    return out
  }

  return {
    runId,

    /**
     * Ajoute une entrée { type, ...champs } ; `ts` est posé par le journal.
     * @param {{type: string}} entry
     * @returns {Promise<object>} l'entrée telle que stockée
     */
    async append (entry) {
      if (!entry || typeof entry.type !== 'string') {
        throw new TypeError('journal.append : entrée { type } requise')
      }
      if (!JOURNAL_ENTRY_TYPES.includes(entry.type)) {
        throw new TypeError(`journal.append : type inconnu « ${entry.type} »`)
      }
      const seq = await claimSeq()
      const stored = { ts: now(), ...entry }
      await storage.set(`${prefix}${String(seq).padStart(SEQ_PAD, '0')}`, stored)
      return stored
    },

    /** @returns {Promise<Array<object>>} entrées en ordre d'écriture */
    entries,

    /** @returns {Promise<string>} export JSON (tableau indenté) */
    async exportJSON () {
      return JSON.stringify(await entries(), null, 2)
    }
  }
}
