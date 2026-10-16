// Données de l'interface (D-67) : une lecture commencée avant une écriture
// (un import, un passage rattaché) portait l'ancien index ; elle n'est pas
// rangée, et la journée se relit avec ce que l'écriture a apporté. Un renvoi
// hors du site n'est jamais suivi.
import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DEMO_DIR, DEMO_INDEX, useCartoData } from './useCartoData.js'
import { buildArchive } from '../core/archive.js'
import { importFiles } from '../core/import.js'
import { createDataset } from '../core/model.js'
import { NEED_DAY, NEED_PORTFOLIO, codesOfDay, needCode, needPole, splitArchive } from '../core/split.js'
import { createCartoStore, createMemoryAdapter } from '../core/store.js'
import { LOU_PORTFOLIO, cartoPole, kairosDoc, louDays, miniReferential } from '../test/fixtures.js'

const NOW = '2026-10-13T12:00:00.000Z'

/** La démonstration de Lou déposée sur le site, découpée : url → JSON. */
async function siteFiles({ base = null } = {}) {
  const store = createCartoStore({ adapter: createMemoryAdapter() })
  const files = [{ path: 'lou.md', text: LOU_PORTFOLIO }]
  for (const [date, poles] of Object.entries(louDays())) {
    for (const p of poles) files.push({ path: `${date}/carto_P${p.poleNum}.json`, text: JSON.stringify(p) })
    files.push({ path: `${date}/kairos.json`, text: JSON.stringify(kairosDoc(date)) })
  }
  await store.commit(await importFiles(files, createDataset({ datasetId: 'ds-lou', title: 'Lou', referential: miniReferential(), now: NOW }), { now: NOW }))
  const { index, files: parts } = splitArchive(buildArchive(await store.exportAll('ds-lou'), { now: NOW }))
  if (base) index.remote.base = base
  return new Map([[DEMO_INDEX, index], ...parts.map((f) => [`${DEMO_DIR}${f.path}`, f.value])])
}

function siteFetch(served, { gate = null, calls = [] } = {}) {
  return async (url, init = {}) => {
    calls.push(url)
    if (gate && url.endsWith(gate.path)) await gate.promise
    const value = served.get(url)
    if (value === undefined) return { ok: false, status: 404, headers: { get: () => null }, text: async () => '', json: async () => null }
    const headers = { get: (k) => ({ 'content-type': 'application/json', 'last-modified': 'Fri, 16 Oct 2026 07:00:00 GMT' })[k.toLowerCase()] ?? null }
    return { ok: true, status: 200, headers, text: async () => (init.method === 'HEAD' ? '' : JSON.stringify(value)), json: async () => structuredClone(value) }
  }
}

async function openDemo(fetchFn) {
  const store = createCartoStore({ adapter: createMemoryAdapter(), fetchFn })
  const hook = renderHook(() => useCartoData({ store, fetchFn, loadReferential: async () => ({ doc: miniReferential() }) }))
  await waitFor(() => expect(hook.result.current.status).not.toBe('loading'))
  await act(() => hook.result.current.loadDemo())
  expect(hook.result.current.dataset.remote).toBeTruthy()
  hook.store = store
  return hook
}

describe('useCartoData — un jeu lu à la demande', () => {
  it('une lecture commencée avant un import n’est pas rangée : la journée se relit avec la nouvelle analyse', async () => {
    let release
    const gate = { path: 'competences/1.01.json', promise: new Promise((r) => (release = r)) }
    const { result } = await openDemo(siteFetch(await siteFiles(), { gate }))
    let pendingLoad
    act(() => {
      pendingLoad = result.current.ensureDetails(['2025-12-22'], needCode('1.01'))
    })
    // Pendant ce temps, une seconde analyse du 22 décembre est importée dans la démonstration.
    const other = cartoPole(1, [{ code: '1.01', confiance: 0.3, traces: [{ role: 'indice corroboratif', extrait: 'Ce matin j’ai relu mes notes' }] }], { date: '2025-12-22' })
    await act(() => result.current.importInto([{ path: 'run2/2025-12-22/carto_P1.json', text: JSON.stringify(other) }]))
    release()
    await act(() => pendingLoad)
    // Rien de périmé n'a été rangé : la journée n'est pas « lue ».
    expect(result.current.getDetail('2025-12-22', needCode('1.01'))).toBeUndefined()
    await act(() => result.current.ensureDetails(['2025-12-22'], needCode('1.01')))
    const day = result.current.dataset.days.find((d) => d.date === '2025-12-22')
    expect(day.variants).toHaveLength(2)
    const detail = result.current.getDetail('2025-12-22', needCode('1.01'))
    for (const v of day.variants) expect(detail.variants[v.id].verdicts['1.01'].traces).toBeDefined()
  })

  it('une journée sans texte n’a pas de texte à attendre : son portrait se lit sans lui', async () => {
    const served = await siteFiles()
    const index = served.get(DEMO_INDEX)
    served.delete(`${DEMO_DIR}${index.remote.base}${index.remote.portfolio['2025-12-24']}`)
    delete index.remote.portfolio['2025-12-24']
    const { result } = await openDemo(siteFetch(served))
    await act(() => result.current.ensureDetails(['2025-12-24'], NEED_DAY))
    const detail = result.current.getDetail('2025-12-24', [NEED_DAY, NEED_PORTFOLIO])
    expect(detail).toBeDefined()
    expect(detail.portfolio).toBeNull()
  })

  it('intacte, elle reste lue à la demande ; la personne y met quelque chose à elle : elle devient d’ici, en arrière-plan', async () => {
    const calls = []
    const served = await siteFiles()
    const { result, store } = await openDemo(siteFetch(served, { calls }))
    const id = result.current.dataset.datasetId
    await new Promise((r) => setTimeout(r, 50))
    expect(result.current.dataset.remote).toBeTruthy()
    act(() => result.current.update((ds) => ({ ...ds, markers: [{ id: 'mk-1', date: '2025-12-22', label: 'Mon repère' }] })))
    await waitFor(() => expect(result.current.dataset.remote).toBeUndefined())
    expect(result.current.dataset.markers).toHaveLength(1)
    // Enregistré sans renvoi au site, son repère compris ; chaque fichier lu une fois.
    await waitFor(async () => expect((await store.loadDataset(id)).markers).toHaveLength(1))
    expect((await store.loadDataset(id)).remote).toBeUndefined()
    const files = calls.filter((u) => u !== DEMO_INDEX)
    expect(new Set(files).size).toBe(files.length)
    expect(files).toHaveLength(served.size - 1)
  })

  it('une démonstration qui apporte ses passages sans date n’est pas copiée à l’ouverture : sa version et ce qu’elle apporte sont retenus avant qu’elle s’affiche', async () => {
    const served = await siteFiles()
    served.get(DEMO_INDEX).portfolio = { ...served.get(DEMO_INDEX).portfolio, undated: [{ text: 'Un passage sans date.', source: 'lou.md' }] }
    const fetchFn = siteFetch(served)
    const store = createCartoStore({ adapter: createMemoryAdapter(), fetchFn })
    const copies = []
    const materialize = store.materialize
    store.materialize = (id) => {
      copies.push(id)
      return materialize(id)
    }
    // La liste des jeux tarde (base du navigateur) : la démonstration s'affiche avant qu'elle revienne.
    const listDatasets = store.listDatasets
    let slow = false
    store.listDatasets = async () => {
      if (slow) await new Promise((r) => setTimeout(r, 100))
      return listDatasets()
    }
    const { result } = renderHook(() => useCartoData({ store, fetchFn, loadReferential: async () => ({ doc: miniReferential() }) }))
    await waitFor(() => expect(result.current.status).not.toBe('loading'))
    slow = true
    const loading = result.current.loadDemo()
    await waitFor(() => expect(result.current.dataset?.remote).toBeTruthy())
    await act(() => loading)
    await new Promise((r) => setTimeout(r, 50))
    expect(result.current.dataset.portfolio.undated).toHaveLength(1)
    expect(copies).toEqual([])
    expect(result.current.dataset.remote).toBeTruthy()
  })

  it('devenue d’ici, ce qu’elle avait lu par morceaux se relit en entier : un pôle ouvert ensuite s’affiche', async () => {
    const { result } = await openDemo(siteFetch(await siteFiles()))
    // Comme le tableau de bord : la journée, son texte et chacune de ses compétences — pas ses pôles.
    const codes = codesOfDay(result.current.dataset, '2025-12-22')
    await act(() => result.current.ensureDetails(['2025-12-22'], [NEED_DAY, NEED_PORTFOLIO, ...codes.map(needCode)]))
    act(() => result.current.update((ds) => ({ ...ds, markers: [{ id: 'mk-1', date: '2025-12-22', label: 'Mon repère' }] })))
    await waitFor(() => expect(result.current.dataset.remote).toBeUndefined())
    expect(result.current.getDetail('2025-12-22', needPole(1))).toBeUndefined()
    await act(() => result.current.ensureDetails(['2025-12-22'], needPole(1)))
    expect(result.current.getDetail('2025-12-22', needPole(1)).variants).toBeDefined()
    expect(Object.keys(Object.values(result.current.getDetail('2025-12-22', needPole(1)).variants)[0].poleReports)).toContain('1')
  })

  it('un index qui renvoie hors du site n’est pas suivi : la démonstration se rabat sur les journées publiques', async () => {
    const calls = []
    const served = await siteFiles({ base: 'https://ailleurs.example/v-0/' })
    const fetchFn = siteFetch(served, { calls })
    const store = createCartoStore({ adapter: createMemoryAdapter(), fetchFn })
    const { result } = renderHook(() => useCartoData({ store, fetchFn, loadReferential: async () => ({ doc: miniReferential() }) }))
    await waitFor(() => expect(result.current.status).not.toBe('loading'))
    await act(() => result.current.loadDemo())
    expect(result.current.dataset?.remote).toBeFalsy()
    expect(calls.some((c) => c.includes('ailleurs.example'))).toBe(false)
  })
})

describe('useCartoData — un jeu d’ici', () => {
  it('lu en entier, une journée ne se lit qu’une fois, quels que soient les besoins de ses lecteurs', async () => {
    const store = createCartoStore({ adapter: createMemoryAdapter() })
    const files = Object.entries(louDays()).flatMap(([date, poles]) => poles.map((p) => ({ path: `${date}/carto_P${p.poleNum}.json`, text: JSON.stringify(p) })))
    await store.commit(await importFiles(files, createDataset({ datasetId: 'ds-lou', title: 'Lou', referential: miniReferential(), now: NOW }), { now: NOW }))
    const loads = []
    const loadDays = store.loadDays
    store.loadDays = (id, dates, opts) => {
      loads.push(dates)
      return loadDays(id, dates, opts)
    }
    const { result } = renderHook(() => useCartoData({ store, loadReferential: async () => ({ doc: miniReferential() }) }))
    await waitFor(() => expect(result.current.dataset?.datasetId).toBe('ds-lou'))
    await act(() => Promise.all([result.current.ensureDetails(['2025-12-22'], needCode('1.01')), result.current.ensureDetails(['2025-12-22'], needPole(3)), result.current.ensureDetails(['2025-12-22'], NEED_DAY)]))
    expect(loads).toEqual([['2025-12-22']])
    expect(result.current.getDetail('2025-12-22', needPole(3))).toBeDefined()
  })
})
