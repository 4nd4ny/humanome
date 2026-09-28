// UC-CPT-05 — Suivre sa progression de formation : tests UNITAIRES (front).
// Fiche : docs/cas-utilisation/compte/UC-CPT-05-suivre-progression-formation.md
//
// Code sollicité appelé directement : le store de progression
// (createTrainingStore : local anonyme, serveur connecté, migration) et le
// contenu embarqué des parcours (listChapters, getChapter, rewriteChapterLink),
// y compris le contrat « identifiants de chapitre acceptés par l'API », et
// FormationSection rendu seul avec un store injecté.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import FormationSection from '../../../src/views/espace/FormationSection.jsx'
import {
  TRAINING_PARCOURS,
  TRAINING_STORAGE_KEY,
  createTrainingStore,
} from '../../../src/lib/training-store.js'
import {
  FORMATION_BASE_HASH,
  FORMATION_PARCOURS,
  getChapter,
  guidesBaseHash,
  listChapters,
  rewriteChapterLink,
} from '../../../src/views/espace/formation-content.js'

/** Motif d'identifiant de la route PUT /api/training/progress (training.php). */
const API_SLUG = /^[a-z0-9][a-z0-9._-]{0,63}$/

function memoryStorage(initial = {}) {
  const map = new Map(Object.entries(initial))
  return {
    map,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  }
}

function fakeApi(server = {}) {
  const puts = []
  return {
    puts,
    get: vi.fn(async () => server),
    put: vi.fn(async (body) => {
      puts.push(body)
      return null
    }),
  }
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('UC-CPT-05 — progression anonyme (localStorage)', () => {
  it('UC-CPT-05-U02 — setLocal/listLocal/clearLocal : même forme que la réponse serveur, sous « humanome-training »', () => {
    const storage = memoryStorage()
    const store = createTrainingStore({ storage, api: fakeApi() })
    expect(TRAINING_STORAGE_KEY).toBe('humanome-training')
    expect(TRAINING_PARCOURS).toBe('apprenant')

    store.setLocal('02-ecrire', true)
    store.setLocal('01-pourquoi', true)
    store.setLocal('02-ecrire', true) // pas de doublon
    expect(JSON.parse(storage.map.get('humanome-training'))).toEqual({
      apprenant: { chapitresTermines: ['02-ecrire', '01-pourquoi'] },
    })
    store.setLocal('02-ecrire', false)
    expect(store.listLocal()).toEqual(['01-pourquoi'])
    store.clearLocal()
    expect(storage.map.has('humanome-training')).toBe(false)
  })

  it('UC-CPT-05-U03 — sans localStorage (navigation privée stricte) : repli en mémoire, rien ne casse', async () => {
    vi.stubGlobal('localStorage', undefined)
    const store = createTrainingStore({ api: fakeApi() })

    store.setLocal('01-pourquoi', true)
    expect(store.listLocal()).toEqual(['01-pourquoi'])
    await expect(store.load({ connected: false })).resolves.toEqual({ chapitres: ['01-pourquoi'], source: 'local' })
  })
})

describe('UC-CPT-05 — progression connectée et migration', () => {
  it('UC-CPT-05-U04 — load({connected: true}) : un PUT par chapitre local, vidage du local, puis lecture serveur', async () => {
    const storage = memoryStorage({ 'humanome-training': JSON.stringify({ apprenant: { chapitresTermines: ['01-a', '03-c'] } }) })
    const api = fakeApi({ apprenant: { chapitresTermines: ['01-a', '02-b', '03-c'] }, cartographe: { chapitresTermines: ['x'] } })
    const store = createTrainingStore({ storage, api })

    const loaded = await store.load({ connected: true })

    expect(api.puts).toEqual([
      { parcours: 'apprenant', chapitre: '01-a', completed: true },
      { parcours: 'apprenant', chapitre: '03-c', completed: true },
    ])
    expect(storage.map.has('humanome-training')).toBe(false)
    expect(loaded).toEqual({ chapitres: ['01-a', '02-b', '03-c'], source: 'serveur' })
  })

  it('UC-CPT-05-U05 — migration interrompue ou API en panne : le local est CONSERVÉ et fait foi (source « local »)', async () => {
    const initial = JSON.stringify({ apprenant: { chapitresTermines: ['01-a', '02-b'] } })
    const storage = memoryStorage({ 'humanome-training': initial })
    const api = fakeApi()
    api.put.mockResolvedValueOnce(null).mockRejectedValueOnce(new Error('réseau'))
    const store = createTrainingStore({ storage, api })

    await expect(store.load({ connected: true })).resolves.toEqual({ chapitres: ['01-a', '02-b'], source: 'local' })
    expect(storage.map.get('humanome-training')).toBe(initial)

    const down = createTrainingStore({ storage: memoryStorage(), api: { get: vi.fn().mockRejectedValue(new Error('500')), put: vi.fn() } })
    await expect(down.load({ connected: true })).resolves.toEqual({ chapitres: [], source: 'local' })
  })

  it('UC-CPT-05-U06 — setChapter : serveur si connecté (completed booléen), local sinon ; fetchServer ne garde que son parcours et des chaînes', async () => {
    const storage = memoryStorage()
    const api = fakeApi({ cartographe: { chapitresTermines: ['01-le-role', 42, null, '02-humain'] } })
    const store = createTrainingStore({ storage, api, parcours: 'cartographe' })

    await store.setChapter('01-le-role', 1, { connected: true })
    await store.setChapter('02-humain', 0, { connected: true })
    expect(api.puts).toEqual([
      { parcours: 'cartographe', chapitre: '01-le-role', completed: true },
      { parcours: 'cartographe', chapitre: '02-humain', completed: false },
    ])
    expect(storage.map.size).toBe(0)

    await store.setChapter('03-methode', true, { connected: false })
    expect(store.listLocal()).toEqual(['03-methode'])
    expect(api.puts).toHaveLength(2)
    await expect(store.fetchServer()).resolves.toEqual(['01-le-role', '02-humain'])
  })

  it('UC-CPT-05-U07 — ANOMALIE figée : en anonyme, cocher dans un 2e parcours ÉCRASE la progression locale du 1er', () => {
    // Comportement ACTUEL (voir « Anomalies constatées » de la fiche) :
    // writeLocal réécrit toute la clé 'humanome-training' avec le seul parcours courant.
    const storage = memoryStorage()
    const apprenant = createTrainingStore({ storage, api: fakeApi(), parcours: 'apprenant' })
    const cartographe = createTrainingStore({ storage, api: fakeApi(), parcours: 'cartographe' })

    apprenant.setLocal('01-pourquoi-un-portfolio-reflexif', true)
    cartographe.setLocal('01-le-role-du-cartographe', true)

    expect(cartographe.listLocal()).toEqual(['01-le-role-du-cartographe'])
    expect(apprenant.listLocal()).toEqual([]) // progression apprenant perdue
    expect(Object.keys(JSON.parse(storage.map.get('humanome-training')))).toEqual(['cartographe'])
  })
})

describe('UC-CPT-05 — contenu des parcours', () => {
  it('UC-CPT-05-U08 — listChapters(« apprenant ») : 7 chapitres triés, index exclu, titres du front-matter ; parcours inconnu refusé', () => {
    const chapters = listChapters('apprenant')
    expect(chapters.map((c) => c.ordre)).toEqual([1, 2, 3, 4, 5, 6, 7])
    expect(chapters[0]).toMatchObject({ slug: '01-pourquoi-un-portfolio-reflexif', titre: 'Pourquoi un portfolio réflexif' })
    expect(chapters.some((c) => c.slug === 'index')).toBe(false)
    expect(listChapters()).toBe(chapters) // parcours par défaut, mis en cache
    expect(() => listChapters('inconnu')).toThrow('Parcours de formation inconnu « inconnu »')
  })

  it('UC-CPT-05-U09 — getChapter et rewriteChapterLink : lien interne « 02-….md » → route du parcours (espace ou guides)', () => {
    expect(getChapter('05-relire-sa-cartographie')?.titre).toBe('Relire sa cartographie et travailler avec son cartographe')
    expect(getChapter('99-absent')).toBeNull()

    expect(rewriteChapterLink('02-ecrire-des-traces-exploitables.md')).toBe('#/espace/formation/02-ecrire-des-traces-exploitables')
    expect(rewriteChapterLink('./02-ecrire-des-traces-exploitables.md', 'apprenant', guidesBaseHash('apprenant'))).toBe(
      '#/guides/apprenant/02-ecrire-des-traces-exploitables',
    )
    expect(rewriteChapterLink('99-absent.md')).toBe('99-absent.md')
    expect(rewriteChapterLink('https://example.org/a.md')).toBe('https://example.org/a.md')
    expect(FORMATION_BASE_HASH).toEqual({
      apprenant: '#/espace/formation',
      cartographe: '#/cartographe/formation',
      promptologue: '#/promptologue/formation',
    })
  })

  it('UC-CPT-05-U10 — contrat front ↔ API : tout parcours et tout chapitre embarqué est un identifiant accepté par PUT /api/training/progress', () => {
    expect(FORMATION_PARCOURS.length).toBeGreaterThanOrEqual(8)
    for (const parcours of FORMATION_PARCOURS) {
      expect(parcours).toMatch(API_SLUG)
      const chapters = listChapters(parcours)
      expect(chapters.length).toBeGreaterThan(0)
      for (const chapter of chapters) expect(chapter.slug).toMatch(API_SLUG)
    }
  })
})

describe('UC-CPT-05 — FormationSection (composant seul, store injecté)', () => {
  it('UC-CPT-05-U11 — compteur arrondi, mention « synchronisée » selon la source, bascule optimiste annulée en cas d’échec', async () => {
    let fail = false
    const trainingStore = {
      load: vi.fn(async () => ({ chapitres: ['01-pourquoi-un-portfolio-reflexif', '02-ecrire-des-traces-exploitables'], source: 'serveur' })),
      setChapter: vi.fn(async () => {
        if (fail) throw new Error('La progression n’a pas pu être enregistrée.')
      }),
    }
    render(<FormationSection chapter={null} connected trainingStore={trainingStore} />)

    const progress = await screen.findByTestId('formation-progress')
    await vi.waitFor(() => expect(progress.textContent).toBe('Progression : 2 / 7 chapitres terminés (29 %) — synchronisée avec votre compte'))
    expect(trainingStore.load).toHaveBeenCalledWith({ connected: true })
    expect(screen.queryByText(/Sans compte, la progression reste/)).toBeNull()

    await act(async () => {
      fireEvent.click(screen.getByRole('checkbox', { name: 'Chapitre terminé : Les pièges à éviter' }))
    })
    expect(trainingStore.setChapter).toHaveBeenCalledWith('04-les-pieges-a-eviter', true, { connected: true })
    expect(progress.textContent).toContain('3 / 7 chapitres terminés (43 %)')

    fail = true
    await act(async () => {
      fireEvent.click(screen.getByRole('checkbox', { name: 'Chapitre terminé : Les pièges à éviter' }))
    })
    expect(screen.getByRole('alert').textContent).toBe('La progression n’a pas pu être enregistrée.')
    expect(screen.getByRole('checkbox', { name: 'Chapitre terminé : Les pièges à éviter' }).checked).toBe(true)
    expect(progress.textContent).toContain('3 / 7')
  })
})
