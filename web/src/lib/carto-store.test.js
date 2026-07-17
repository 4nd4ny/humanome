import { describe, expect, it } from 'vitest'
import { createCartoStore, createMemoryAdapter, VISIBILITIES } from './carto-store.js'

/** Store sur adaptateur mémoire avec horloge et ids déterministes. */
function makeStore() {
  let tick = 0
  let seq = 0
  return createCartoStore(createMemoryAdapter(), {
    now: () => new Date(2026, 6, 1, 12, 0, tick++).toISOString(),
    id: () => `id-${++seq}`,
  })
}

const dayDocument = { kind: 'cartographie-jour', date: '2026-01-05', poles: [] }

describe('carto-store — CRUD (contrat M6)', () => {
  it('saveCartography retourne {id} et applique les défauts', async () => {
    const store = makeStore()
    const { id } = await store.saveCartography({ titre: 'Journée test', document: dayDocument })
    expect(id).toBe('id-1')

    const record = await store.getCartography(id)
    expect(record.type).toBe('jour')
    expect(record.titre).toBe('Journée test')
    expect(record.visibility).toBe('privee') // privé par défaut (cahier §6.2)
    expect(record.document).toEqual(dayDocument)
    expect(record.promptPackage).toBeNull()
    expect(record.referentiel).toBeNull()
    expect(record.runMeta).toBeNull()
    expect(record.serverId).toBeNull()
    expect(record.createdAt).toBeDefined()
    expect(record.updatedAt).toBeDefined()
  })

  it('conserve la traçabilité fournie (promptPackage, referentiel, runMeta)', async () => {
    const store = makeStore()
    const { id } = await store.saveCartography({
      type: 'merge',
      titre: 'Parcours',
      visibility: 'cartographe',
      document: { kind: 'cartographie-merge' },
      promptPackage: { id: 'aurora-demo', version: '1.0.0' },
      referentiel: { id: 'respire', version: '7.0.0' },
      runMeta: { modele: 'claude-sonnet-4-5', dateRun: '2026-07-01T10:00:00Z' },
    })
    const record = await store.getCartography(id)
    expect(record.type).toBe('merge')
    expect(record.visibility).toBe('cartographe')
    expect(record.promptPackage).toEqual({ id: 'aurora-demo', version: '1.0.0' })
    expect(record.referentiel).toEqual({ id: 'respire', version: '7.0.0' })
    expect(record.runMeta.modele).toBe('claude-sonnet-4-5')
  })

  it('normalise un type ou une visibilité inconnus vers les défauts sûrs', async () => {
    const store = makeStore()
    const { id } = await store.saveCartography({ type: 'zorg', visibility: 'tout-le-monde' })
    const record = await store.getCartography(id)
    expect(record.type).toBe('jour')
    expect(record.visibility).toBe('privee')
    expect(VISIBILITIES).toEqual(['privee', 'cartographe', 'publique'])
  })

  it('accepte le type twin9 (D12 : carto_evolutive native d’une analyse)', async () => {
    const store = makeStore()
    const { id } = await store.saveCartography({ type: 'twin9', titre: 'Twin9 — demo' })
    const record = await store.getCartography(id)
    expect(record.type).toBe('twin9')
  })

  it('listCartographies trie par updatedAt décroissant', async () => {
    const store = makeStore()
    const a = await store.saveCartography({ titre: 'Ancienne' })
    await store.saveCartography({ titre: 'Récente' })
    await store.updateCartography(a.id, { titre: 'Ancienne retouchée' })

    const list = await store.listCartographies()
    expect(list.map((r) => r.titre)).toEqual(['Ancienne retouchée', 'Récente'])
  })

  it('updateCartography fusionne le patch, bump updatedAt et préserve l’id', async () => {
    const store = makeStore()
    const { id } = await store.saveCartography({ titre: 'Avant', document: dayDocument })
    const before = await store.getCartography(id)

    const updated = await store.updateCartography(id, { serverId: 42, visibility: 'publique' })
    expect(updated.id).toBe(id)
    expect(updated.serverId).toBe(42)
    expect(updated.visibility).toBe('publique')
    expect(updated.titre).toBe('Avant')
    expect(updated.document).toEqual(dayDocument)
    expect(updated.updatedAt > before.updatedAt).toBe(true)
  })

  it('updateCartography rejette un id inconnu avec un message français', async () => {
    const store = makeStore()
    await expect(store.updateCartography('fantome', {})).rejects.toThrow(
      /Cartographie introuvable/,
    )
  })

  it('removeCartography supprime la ligne locale', async () => {
    const store = makeStore()
    const { id } = await store.saveCartography({ titre: 'À supprimer' })
    await store.removeCartography(id)
    expect(await store.getCartography(id)).toBeUndefined()
    expect(await store.listCartographies()).toEqual([])
  })

  it('l’adaptateur mémoire isole les mutations (deep copy)', async () => {
    const store = makeStore()
    const document = { kind: 'cartographie-jour', date: '2026-01-05', poles: [] }
    const { id } = await store.saveCartography({ titre: 'Isolée', document })
    document.date = '1999-01-01' // mutation externe après sauvegarde

    const record = await store.getCartography(id)
    expect(record.document.date).toBe('2026-01-05')
    record.titre = 'mutée' // mutation du résultat
    expect((await store.getCartography(id)).titre).toBe('Isolée')
  })

  it('saveCartography avec entry.id réécrit la même ligne (import contrôlé)', async () => {
    const store = makeStore()
    const { id } = await store.saveCartography({ titre: 'V1' })
    const again = await store.saveCartography({ id, titre: 'V2' })
    expect(again.id).toBe(id)
    const list = await store.listCartographies()
    expect(list).toHaveLength(1)
    expect(list[0].titre).toBe('V2')
  })
})
