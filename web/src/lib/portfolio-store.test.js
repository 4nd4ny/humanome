import { describe, expect, it } from 'vitest'
import {
  createIndexedDbAdapter,
  createMemoryAdapter,
  createPortfolioStore,
} from './portfolio-store.js'

/** Store on the memory adapter with a controllable clock and stable ids. */
function makeStore() {
  let tick = 0
  let serial = 0
  const clock = { advance: (n = 1) => (tick += n) }
  const store = createPortfolioStore(createMemoryAdapter(), {
    now: () => `2026-07-12T00:00:${String(tick).padStart(2, '0')}.000Z`,
    id: () => `id-${++serial}`,
  })
  return { store, clock }
}

describe('createPortfolioStore (CRUD, adaptateur mémoire)', () => {
  it('create : enregistre un portfolio complet avec valeurs par défaut', async () => {
    const { store } = makeStore()
    const record = await store.create()
    expect(record).toEqual({
      id: 'id-1',
      titre: 'Portfolio sans titre',
      source: 'colle',
      texte: '',
      segments: [],
      createdAt: '2026-07-12T00:00:00.000Z',
      updatedAt: '2026-07-12T00:00:00.000Z',
    })
    expect(await store.get('id-1')).toEqual(record)
  })

  it('list : trie du plus récemment modifié au plus ancien', async () => {
    const { store, clock } = makeStore()
    const a = await store.create({ titre: 'A' })
    clock.advance()
    await store.create({ titre: 'B' })
    clock.advance()
    await store.save({ ...a, texte: 'A modifié en dernier' })

    const titles = (await store.list()).map((p) => p.titre)
    expect(titles).toEqual(['A', 'B'])
  })

  it('save : met à jour updatedAt et le contenu, conserve createdAt', async () => {
    const { store, clock } = makeStore()
    const record = await store.create({ titre: 'Journal' })
    clock.advance(5)
    const saved = await store.save({
      ...record,
      texte: 'Nouveau texte',
      segments: [{ date: '2026-01-05', texte: 'Nouveau texte', debut: 0, fin: 13 }],
    })
    expect(saved.updatedAt).toBe('2026-07-12T00:00:05.000Z')
    expect(saved.createdAt).toBe(record.createdAt)

    const reloaded = await store.get(record.id)
    expect(reloaded.texte).toBe('Nouveau texte')
    expect(reloaded.segments).toHaveLength(1)
  })

  it('save : refuse un enregistrement sans id', async () => {
    const { store } = makeStore()
    await expect(store.save({ titre: 'sans id' })).rejects.toThrow(TypeError)
  })

  it('remove : supprime réellement l’enregistrement', async () => {
    const { store } = makeStore()
    const record = await store.create()
    await store.remove(record.id)
    expect(await store.get(record.id)).toBeUndefined()
    expect(await store.list()).toEqual([])
  })

  it('get : renvoie undefined pour un id inconnu', async () => {
    const { store } = makeStore()
    expect(await store.get('inconnu')).toBeUndefined()
  })

  it('l’adaptateur mémoire isole ses copies (pas de mutation partagée)', async () => {
    const { store } = makeStore()
    const record = await store.create({ titre: 'Original' })
    record.titre = 'Muté hors store'
    const reloaded = await store.get(record.id)
    expect(reloaded.titre).toBe('Original')
  })
})

describe('createIndexedDbAdapter (hors navigateur)', () => {
  it('s’importe et se crée sans toucher IndexedDB ; seules les opérations échouent', async () => {
    const adapter = createIndexedDbAdapter()
    expect(typeof adapter.getAll).toBe('function')
    // jsdom n'expose pas indexedDB : l'opération échoue avec un message clair.
    if (!globalThis.indexedDB) {
      await expect(adapter.getAll()).rejects.toThrow(/IndexedDB est indisponible/)
    }
  })
})
