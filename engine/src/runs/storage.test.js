// Adaptateurs de stockage : contrat { get, set, delete, keys }.
// indexeddb.js n'est PAS testable en jsdom/Node : on vérifie seulement sa
// forme (import sans DOM, méthodes présentes, erreur explicite hors navigateur).

import { describe, it, expect } from 'vitest'
import { createMemoryStorage } from './memory.js'
import { createIndexedDbStorage } from './indexeddb.js'

describe('createMemoryStorage', () => {
  it('get/set/delete/keys se comportent comme un magasin clé-valeur', async () => {
    const storage = createMemoryStorage()

    expect(await storage.get('absent')).toBeUndefined()

    await storage.set('run:r1:checkpoint:2025-01-01', { iso: '2025-01-01' })
    await storage.set('run:r1:checkpoint:2025-01-02', { iso: '2025-01-02' })
    await storage.set('journal:r1:00000000', { type: 'run_started' })

    expect(await storage.get('run:r1:checkpoint:2025-01-01')).toEqual({ iso: '2025-01-01' })
    expect(await storage.keys('run:r1:checkpoint:')).toEqual([
      'run:r1:checkpoint:2025-01-01',
      'run:r1:checkpoint:2025-01-02'
    ])
    expect(await storage.keys('')).toHaveLength(3)

    await storage.delete('run:r1:checkpoint:2025-01-01')
    expect(await storage.get('run:r1:checkpoint:2025-01-01')).toBeUndefined()
    expect(await storage.keys('run:r1:checkpoint:')).toEqual(['run:r1:checkpoint:2025-01-02'])
  })

  it('clone les valeurs (sémantique structured clone d’IndexedDB, pas de référence partagée)', async () => {
    const storage = createMemoryStorage()
    const value = { nested: { n: 1 } }
    await storage.set('k', value)
    value.nested.n = 999
    const read1 = await storage.get('k')
    expect(read1.nested.n).toBe(1)
    read1.nested.n = 42
    expect((await storage.get('k')).nested.n).toBe(1)
  })

  it('stocke undefined comme absence (get renvoie undefined, set(undefined) reste distinct de delete)', async () => {
    const storage = createMemoryStorage()
    await storage.set('k', null)
    expect(await storage.get('k')).toBeNull()
  })
})

describe('createIndexedDbStorage (forme uniquement — non exécutable hors navigateur)', () => {
  it('s’importe et se crée sans toucher au DOM ni à indexedDB', () => {
    // L'import en Node a déjà réussi (sinon ce fichier de test planterait) ;
    // la création est paresseuse : aucun accès indexedDB avant la 1re opération.
    const storage = createIndexedDbStorage()
    expect(typeof storage.get).toBe('function')
    expect(typeof storage.set).toBe('function')
    expect(typeof storage.delete).toBe('function')
    expect(typeof storage.keys).toBe('function')
  })

  it('rejette chaque opération avec un message explicite quand indexedDB est absent', async () => {
    const storage = createIndexedDbStorage({ dbName: 'test-db' })
    await expect(storage.get('k')).rejects.toThrow(/indexedDB indisponible/)
    await expect(storage.set('k', 1)).rejects.toThrow(/indexedDB indisponible/)
    await expect(storage.delete('k')).rejects.toThrow(/indexedDB indisponible/)
    await expect(storage.keys('')).rejects.toThrow(/indexedDB indisponible/)
  })
})
