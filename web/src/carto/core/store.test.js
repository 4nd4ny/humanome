// @vitest-environment node
// Persistance locale (spec §1.4, §4.2) : transaction unique, chargement paresseux.
import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { applyDetailPatch, createCartoStore, createIndexedDbAdapter, createMemoryAdapter } from './store.js'
import { importFiles } from './import.js'
import { createDataset } from './model.js'
import { setActive } from './ops.js'
import { LOU_PORTFOLIO, kairosDoc, louDays, miniReferential } from '../test/fixtures.js'

const NOW = '2026-10-13T12:00:00.000Z'

async function louImport(datasetId = 'ds-lou') {
  const ds = createDataset({ datasetId, title: 'Lou', referential: miniReferential(), now: NOW })
  const files = [{ path: 'lou.md', text: LOU_PORTFOLIO }]
  for (const [date, poles] of Object.entries(louDays())) {
    for (const p of poles) files.push({ path: `${date}/carto_P${p.poleNum}.json`, text: JSON.stringify(p) })
    files.push({ path: `${date}/kairos.json`, text: JSON.stringify(kairosDoc(date)) })
  }
  return importFiles(files, ds, { now: NOW })
}

for (const [name, make] of [
  ['mémoire', () => createMemoryAdapter()],
  ['IndexedDB', () => createIndexedDbAdapter({ dbName: `test-${Math.random()}` })],
]) {
  describe(`magasin (${name})`, () => {
    it('écrit un import en une transaction, recharge l’index puis les détails à la demande', async () => {
      const store = createCartoStore({ adapter: make() })
      const res = await louImport()
      await store.commit(res)
      expect(await store.listDatasets()).toEqual([expect.objectContaining({ datasetId: 'ds-lou', dayCount: 3, title: 'Lou' })])
      const ds = await store.loadDataset('ds-lou')
      expect(ds.days.map((d) => d.date)).toEqual(['2025-12-22', '2025-12-23', '2025-12-24'])
      const detail = await store.loadDayDetail('ds-lou', '2025-12-23')
      expect(detail.portfolio.text).toMatch(/J’ai écouté Sam/)
      expect(Object.keys(detail.variants)).toHaveLength(1)
      const many = await store.loadDayDetails('ds-lou', ['2025-12-22', '2025-12-24'])
      expect([...many.keys()].sort()).toEqual(['2025-12-22', '2025-12-24'])
    })

    it('l’index seul se réenregistre sans toucher aux détails', async () => {
      const store = createCartoStore({ adapter: make() })
      await store.commit(await louImport())
      const ds = setActive(await store.loadDataset('ds-lou'), ['2025-12-22'], false)
      await store.saveDataset(ds)
      expect((await store.loadDataset('ds-lou')).days[0].active).toBe(false)
      expect((await store.loadDayDetail('ds-lou', '2025-12-22')).portfolio).not.toBeNull()
    })

    it('un jeu supprimé ailleurs n’est jamais recréé par un enregistrement de son index (D-57)', async () => {
      const store = createCartoStore({ adapter: make() })
      await store.commit(await louImport())
      const ds = await store.loadDataset('ds-lou')
      expect(await store.saveExistingDataset({ ...ds, title: 'Lou 2' })).toBe(true)
      expect((await store.loadDataset('ds-lou')).title).toBe('Lou 2')
      await store.deleteDataset('ds-lou')
      expect(await store.saveExistingDataset(ds)).toBe(false)
      expect(await store.loadDataset('ds-lou')).toBeNull()
    })

    it('suppression complète et export intégral', async () => {
      const store = createCartoStore({ adapter: make() })
      await store.commit(await louImport('ds-a'))
      await store.commit(await louImport('ds-b'))
      const all = await store.exportAll('ds-a')
      expect(Object.keys(all.details).sort()).toEqual(['2025-12-22', '2025-12-23', '2025-12-24'])
      await store.deleteDataset('ds-a')
      expect(await store.loadDataset('ds-a')).toBeNull()
      expect(await store.loadDayDetail('ds-a', '2025-12-22')).toBeNull()
      expect((await store.loadDayDetail('ds-b', '2025-12-22')).portfolio).not.toBeNull()
    })
  })
}

describe('atomicité', () => {
  it('mémoire : une erreur en cours de transaction n’écrit rien', async () => {
    const adapter = createMemoryAdapter()
    await expect(
      adapter.transaction(['datasets'], 'readwrite', async (t) => {
        await t.put('datasets', { key: 'x', dataset: {} })
        throw new Error('panne')
      }),
    ).rejects.toThrow('panne')
    expect(await adapter.transaction(['datasets'], 'readonly', (t) => t.all('datasets'))).toEqual([])
  })

  it('IndexedDB : une erreur en cours de transaction annule tout', async () => {
    const adapter = createIndexedDbAdapter({ dbName: `atomic-${Math.random()}` })
    await expect(
      adapter.transaction(['datasets', 'details'], 'readwrite', async (t) => {
        await t.put('details', { key: 'ds|2025-12-22', detail: {} })
        await t.put('datasets', { key: 'ds', dataset: {} })
        throw new Error('panne')
      }),
    ).rejects.toThrow('panne')
    expect(await adapter.transaction(['datasets', 'details'], 'readonly', async (t) => [...(await t.all('datasets')), ...(await t.all('details'))])).toEqual([])
  })

  it('une retouche ajoute des variantes sans écraser les précédentes', () => {
    const merged = applyDetailPatch({ date: 'd', portfolio: { text: 'a' }, variants: { v1: 1 } }, 'd', { variants: { v2: 2 } })
    expect(merged).toEqual({ date: 'd', portfolio: { text: 'a' }, variants: { v1: 1, v2: 2 } })
  })
})
