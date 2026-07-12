import { describe, expect, it, vi } from 'vitest'
import { TRAINING_STORAGE_KEY, createTrainingStore } from './training-store.js'

function memoryStorage(initial = {}) {
  const map = new Map(Object.entries(initial))
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    _map: map,
  }
}

const localPayload = (chapitres) =>
  JSON.stringify({ apprenant: { chapitresTermines: chapitres } })

describe('training-store — progression locale (anonyme)', () => {
  it('coche et décoche un chapitre dans le localStorage', () => {
    const storage = memoryStorage()
    const store = createTrainingStore({ storage, api: {} })
    store.setLocal('01-pourquoi', true)
    store.setLocal('02-ecrire', true)
    expect(store.listLocal()).toEqual(['01-pourquoi', '02-ecrire'])
    store.setLocal('01-pourquoi', false)
    expect(store.listLocal()).toEqual(['02-ecrire'])
    expect(storage._map.has(TRAINING_STORAGE_KEY)).toBe(true)
  })

  it('load({connected: false}) lit le local sans toucher l’API', async () => {
    const api = { get: vi.fn(), put: vi.fn() }
    const store = createTrainingStore({
      storage: memoryStorage({ [TRAINING_STORAGE_KEY]: localPayload(['03-poles']) }),
      api,
    })
    await expect(store.load({ connected: false })).resolves.toEqual({
      chapitres: ['03-poles'],
      source: 'local',
    })
    expect(api.get).not.toHaveBeenCalled()
    expect(api.put).not.toHaveBeenCalled()
  })

  it('tolère un localStorage corrompu', () => {
    const store = createTrainingStore({
      storage: memoryStorage({ [TRAINING_STORAGE_KEY]: '{pas du json' }),
      api: {},
    })
    expect(store.listLocal()).toEqual([])
  })
})

describe('training-store — bascule serveur (connecté)', () => {
  it('migre la progression locale (un PUT par chapitre) puis lit le serveur', async () => {
    const storage = memoryStorage({ [TRAINING_STORAGE_KEY]: localPayload(['01-a', '02-b']) })
    const api = {
      get: vi.fn(async () => ({ apprenant: { chapitresTermines: ['01-a', '02-b', '05-e'] } })),
      put: vi.fn(async () => null),
    }
    const store = createTrainingStore({ storage, api })

    const { chapitres, source } = await store.load({ connected: true })

    expect(api.put.mock.calls.map(([body]) => body)).toEqual([
      { parcours: 'apprenant', chapitre: '01-a', completed: true },
      { parcours: 'apprenant', chapitre: '02-b', completed: true },
    ])
    expect(chapitres).toEqual(['01-a', '02-b', '05-e'])
    expect(source).toBe('serveur')
    // Migration réussie : le local est vidé, le serveur devient la vérité.
    expect(storage._map.has(TRAINING_STORAGE_KEY)).toBe(false)
  })

  it('ne vide PAS le local si la migration échoue, et retombe en local', async () => {
    const storage = memoryStorage({ [TRAINING_STORAGE_KEY]: localPayload(['01-a']) })
    const api = {
      get: vi.fn(),
      put: vi.fn(async () => {
        throw new Error('HTTP 500')
      }),
    }
    const store = createTrainingStore({ storage, api })

    const result = await store.load({ connected: true })
    expect(result).toEqual({ chapitres: ['01-a'], source: 'local' })
    expect(storage._map.has(TRAINING_STORAGE_KEY)).toBe(true)
  })

  it('setChapter route vers le serveur quand connecté, vers le local sinon', async () => {
    const storage = memoryStorage()
    const api = { get: vi.fn(), put: vi.fn(async () => null) }
    const store = createTrainingStore({ storage, api })

    await store.setChapter('04-pieges', true, { connected: true })
    expect(api.put).toHaveBeenCalledWith({
      parcours: 'apprenant',
      chapitre: '04-pieges',
      completed: true,
    })
    expect(store.listLocal()).toEqual([])

    await store.setChapter('04-pieges', true, { connected: false })
    expect(store.listLocal()).toEqual(['04-pieges'])
    expect(api.put).toHaveBeenCalledTimes(1)
  })
})
