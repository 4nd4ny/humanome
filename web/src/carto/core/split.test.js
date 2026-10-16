// Un jeu lu à la demande (journal D-67) : l'archive se découpe en fichiers
// statiques, chaque information dans un seul ; l'interface ne lit que ce
// qu'on ouvre ; une archive refaite à partir des fichiers est l'archive.
import { describe, expect, it } from 'vitest'
import { NEED_ALL, NEED_DAY, NEED_PORTFOLIO, assembleDay, codesOfDay, expandNeed, isSplitIndex, needCode, needPole, partPath, splitArchive } from './split.js'
import { buildArchive } from './archive.js'
import { importFiles } from './import.js'
import { canonicalJson, createDataset } from './model.js'
import { createCartoStore, createMemoryAdapter } from './store.js'
import { masterContractArchive } from '../test/master-contract.js'
import { miniReferential } from '../test/fixtures.js'

const NOW = '2026-10-16T09:00:00.000Z'
const BASE = 'data/demo/carto/'

const READING = {
  id: 'LOU@2026-04-25',
  source: 'aurora-core',
  journal: 'LOU',
  analysedAt: '2026-04-25',
  importedAt: NOW,
  codes: { '1.01': { status: 'established', rawStatus: 'présence établie', confidence: 0.75, proofs: 1, hints: 0 } },
  poles: [],
}

/** L'archive du jeu « Lou », avec une seconde lecture et sa délibération (D-68). */
async function louArchive() {
  const archive = await masterContractArchive()
  archive.readings = [READING]
  archive.runDetails = { 'LOU@2026-04-25|1.01': { code: '1.01', president: { verdict_argumente: 'Le jury converge.' } } }
  return archive
}

/** Le site : les fichiers découpés, servis et comptés. */
function site(index, files) {
  const served = new Map([[`${BASE}index.json`, index], ...files.map((f) => [`${BASE}${f.path}`, f.value])])
  const calls = []
  const fetchFn = async (url) => {
    calls.push(url)
    if (!served.has(url)) return { ok: false, status: 404, json: async () => null }
    return { ok: true, status: 200, json: async () => structuredClone(served.get(url)) }
  }
  return { fetchFn, calls }
}

/** Ouvre l'index découpé comme la démonstration (base relative au site). */
async function openSplit(index, fetchFn) {
  const store = createCartoStore({ adapter: createMemoryAdapter(), fetchFn })
  const doc = { ...index, remote: { ...index.remote, base: `${BASE}${index.remote.base}` } }
  const res = await importFiles([{ path: `${BASE}index.json`, text: JSON.stringify(doc) }], { ...createDataset({ title: 'Démonstration', referential: miniReferential(), now: NOW }), origin: 'demo' }, { now: NOW, allowRemote: true })
  await store.commit(res)
  return { store, dataset: res.dataset, res }
}

describe('découpage d’une archive', () => {
  it('un index sans détails, des fichiers par journée, texte, compétence, pôle et délibération, sous un dossier de version', async () => {
    const archive = await louArchive()
    const { index, files } = splitArchive(archive)
    expect(isSplitIndex(index)).toBe(true)
    expect(index.details).toEqual({})
    expect(index.runDetails).toEqual({})
    expect(index.remote.version).toMatch(/^v-[0-9a-f]{12}$/)
    expect(index.remote.base).toBe(`${index.remote.version}/`)
    const paths = files.map((f) => f.path)
    expect(paths.every((p) => p.startsWith(index.remote.base))).toBe(true)
    expect(Object.keys(index.remote.days)).toEqual(['2025-12-22', '2025-12-23', '2025-12-24'])
    expect(Object.keys(index.remote.portfolio)).toEqual(['2025-12-22', '2025-12-23', '2025-12-24'])
    expect(Object.keys(index.remote.codes).sort()).toEqual(['1.01', '1.02', '2.01', '2.02', '3.01', '3.02'])
    expect(Object.keys(index.remote.poles)).toEqual(['1', '2', '3'])
    expect(index.remote.runs).toEqual({ 'LOU@2026-04-25|1.01': 'lectures/LOU_2026-04-25_1.01.json' })
    // Même contenu, même version ; autre contenu, autre version.
    expect(splitArchive(archive).index.remote.version).toBe(index.remote.version)
    expect(splitArchive({ ...archive, title: 'Autre' }).index.remote.version).not.toBe(index.remote.version)
  })

  it('chaque information une fois : refaite à partir de tous les fichiers, chaque journée est celle de l’archive', async () => {
    const archive = await louArchive()
    const { index, files } = splitArchive(archive)
    const byPath = new Map(files.map((f) => [f.path.slice(index.remote.base.length), f.value]))
    const codes = new Map(Object.entries(index.remote.codes).map(([c, p]) => [c, byPath.get(p)]))
    const poles = new Map(Object.entries(index.remote.poles).map(([n, p]) => [Number(n), byPath.get(p)]))
    for (const [date, detail] of Object.entries(archive.details)) {
      const ids = index.days.find((d) => d.date === date).variants.map((v) => v.id)
      const day = byPath.get(index.remote.days[date])
      const portfolio = byPath.get(index.remote.portfolio[date])
      expect(canonicalJson(assembleDay(date, ids, { day, portfolio, codes, poles }))).toBe(canonicalJson({ date, portfolio: detail.portfolio, variants: detail.variants }))
    }
    // Le découpage ne redit rien : les fichiers pèsent ce que pesaient les détails, à leurs étiquettes près.
    const split = files.reduce((n, f) => n + JSON.stringify(f.value).length, 0)
    const whole = JSON.stringify(archive.details).length + JSON.stringify(archive.runDetails).length
    expect(split / whole).toBeGreaterThan(0.9)
    expect(split / whole).toBeLessThan(1.1)
  })

  it('besoins : une compétence, un pôle, le texte, la journée — et « tout »', async () => {
    const { index } = splitArchive(await louArchive())
    expect(codesOfDay(index, '2025-12-23')).toEqual(['2.01', '2.02', '3.01', '3.02'])
    expect(expandNeed(index, '2025-12-22', needCode('1.01'))).toEqual(['code:1.01'])
    expect(expandNeed(index, '2025-12-22', [NEED_DAY, needPole(1)])).toEqual(['day', 'pole:1'])
    expect(expandNeed(index, '2025-12-22', NEED_ALL)).toEqual(['day', 'portfolio', 'pole:1', 'pole:2', 'pole:3', 'code:1.01', 'code:1.02', 'code:3.01'])
    expect(partPath(index.remote, '2025-12-22', needCode('1.01'))).toBe('competences/1.01.json')
    expect(partPath(index.remote, '2025-12-22', needCode('9.99'))).toBeNull()
    expect(partPath(index.remote, '2025-12-22', NEED_PORTFOLIO)).toBe('portfolio/2025-12-22.json')
  })
})

describe('un jeu lu à la demande', () => {
  it('ouvert depuis son index : ni détail ni délibération rangés ici, le portfolio et ses passages sans date là', async () => {
    const { index, files } = splitArchive(await louArchive())
    const { fetchFn, calls } = site(index, files)
    const { store, dataset, res } = await openSplit(index, fetchFn)
    expect(res.detailPatches.size).toBe(0)
    expect(res.runDetails).toEqual([])
    expect(dataset.remote.base).toBe(`${BASE}${index.remote.version}/`)
    expect(dataset.portfolio).toMatchObject({ title: expect.any(String), undated: [expect.objectContaining({ text: expect.stringContaining('vacances') })] })
    expect(dataset.days.map((d) => d.date)).toEqual(['2025-12-22', '2025-12-23', '2025-12-24'])
    // La seconde lecture est dans l'index ; sa délibération, sur le site.
    expect(index.readings).toEqual([READING])
    expect(dataset.readings).toEqual([READING])
    expect(await store.loadDayDetails(dataset.datasetId, ['2025-12-22'])).toEqual(new Map())
    expect(calls).toEqual([])
  })

  it('une compétence ouverte : son seul fichier est lu, une fois, et la journée dit ce qu’elle contient', async () => {
    const { index, files } = splitArchive(await louArchive())
    const { fetchFn, calls } = site(index, files)
    const { store, dataset } = await openSplit(index, fetchFn)
    const got = await store.loadDays(dataset.datasetId, ['2025-12-22'], { dataset, need: needCode('1.01') })
    const { detail, parts } = got.get('2025-12-22')
    const vid = dataset.days[0].activeVariantId
    expect(detail.variants[vid].verdicts['1.01'].motif).toBe('Vérification explicite.')
    expect(detail.variants[vid].verdicts['1.02']).toBeUndefined()
    expect(detail.portfolio).toBeNull()
    expect(parts).toEqual(['code:1.01'])
    expect(calls).toEqual([`${dataset.remote.base}competences/1.01.json`])
    await store.loadDays(dataset.datasetId, ['2025-12-22', '2025-12-23'], { dataset, need: needCode('1.01') })
    expect(calls).toHaveLength(1)
    // Le texte, puis tout : ce qui est lu s'ajoute, sans relire.
    const text = (await store.loadDays(dataset.datasetId, ['2025-12-22'], { dataset, need: NEED_PORTFOLIO })).get('2025-12-22')
    expect(text.detail.portfolio.text).toMatch(/deux sources contradictoires/)
    expect(text.detail.variants[vid].verdicts['1.01']).toBeDefined()
    const all = (await store.loadDays(dataset.datasetId, ['2025-12-22'], { dataset })).get('2025-12-22')
    expect(all.parts).toContain(NEED_ALL)
    expect(calls.filter((c) => c.endsWith('competences/1.01.json'))).toHaveLength(1)
  })

  it('un fichier qui ne se lit pas fait échouer la lecture, qui se retente ensuite', async () => {
    const { index, files } = splitArchive(await louArchive())
    const { fetchFn: serve } = site(index, files)
    let down = true
    const fetchFn = async (url) => (down ? Promise.reject(new TypeError('Failed to fetch')) : serve(url))
    const { store, dataset } = await openSplit(index, fetchFn)
    await expect(store.loadDays(dataset.datasetId, ['2025-12-22'], { dataset, need: needCode('1.01') })).rejects.toThrow('competences/1.01.json : site injoignable')
    down = false
    const got = await store.loadDays(dataset.datasetId, ['2025-12-22'], { dataset, need: needCode('1.01') })
    expect(got.get('2025-12-22').parts).toEqual(['code:1.01'])
  })

  it('un fichier absent ne prive pas les autres de ce qu’ils portent : l’erreur le dit, en français, et garde le reste', async () => {
    const { index, files } = splitArchive(await louArchive())
    const { fetchFn: serve } = site(index, files)
    const fetchFn = async (url) => (url.endsWith('competences/1.01.json') ? { ok: false, status: 404, json: async () => null } : serve(url))
    const { store, dataset } = await openSplit(index, fetchFn)
    const err = await store.loadDays(dataset.datasetId, ['2025-12-22'], { dataset, need: [needCode('1.01'), needPole(1)] }).catch((e) => e)
    expect(err.message).toBe('competences/1.01.json introuvable sur le site')
    const got = err.partial.get('2025-12-22')
    expect(got.parts).toEqual(['pole:1'])
    expect(Object.keys(got.detail.variants[dataset.days[0].activeVariantId].poleReports)).toEqual(['1'])
  })

  it('une délibération se lit sur le site quand on l’ouvre', async () => {
    const { index, files } = splitArchive(await louArchive())
    const { fetchFn } = site(index, files)
    const { store, dataset } = await openSplit(index, fetchFn)
    expect(await store.loadRunDetail(dataset.datasetId, 'LOU@2026-04-25|1.01', { dataset })).toEqual({ code: '1.01', president: { verdict_argumente: 'Le jury converge.' } })
    expect(await store.loadRunDetail(dataset.datasetId, 'inconnue', { dataset })).toBeNull()
  })

  it('ce que la personne ajoute est rangé ici, par-dessus : un passage rattaché part du texte du site', async () => {
    const { index, files } = splitArchive(await louArchive())
    const { fetchFn } = site(index, files)
    const { store, dataset } = await openSplit(index, fetchFn)
    await store.commit({ dataset, detailPatches: new Map([['2025-12-22', { variants: {}, portfolioAppend: { text: 'Un passage rattaché.' } }]]) })
    const got = (await store.loadDays(dataset.datasetId, ['2025-12-22'], { dataset, need: [NEED_PORTFOLIO, needCode('1.01')] })).get('2025-12-22')
    expect(got.detail.portfolio.text).toMatch(/deux sources contradictoires[\s\S]*Un passage rattaché\.$/)
    expect(got.detail.variants[dataset.days[0].activeVariantId].verdicts['1.01']).toBeDefined()
    // Sans texte propre, le texte du site reste celui de la journée.
    await store.commit({ dataset, detailPatches: new Map([['2025-12-23', { variants: {} }]]) })
    const d23 = (await store.loadDays(dataset.datasetId, ['2025-12-23'], { dataset, need: NEED_PORTFOLIO })).get('2025-12-23')
    expect(d23.detail.portfolio.text).toMatch(/Sam/)
  })

  it('devenu d’ici (la personne y a mis quelque chose) : tout est rangé, rien n’est plus demandé au site, et il ne lui revient jamais', async () => {
    const archive = await louArchive()
    const { index, files } = splitArchive(archive)
    const { fetchFn, calls } = site(index, files)
    const { store, dataset } = await openSplit(index, fetchFn)
    // Ce que la personne y a mis : un passage rattaché, une journée à elle, une délibération à elle.
    await store.commit({
      dataset,
      detailPatches: new Map([
        ['2025-12-22', { variants: {}, portfolioAppend: { text: 'Un passage rattaché.' } }],
        ['2026-01-10', { variants: {}, portfolio: { title: null, text: 'Ma journée à moi.', source: 'moi.md' } }],
      ]),
      runDetails: [{ key: 'LOU@2026-04-25|1.01', value: { code: '1.01', mine: true } }],
    })
    const stored = await store.materialize(dataset.datasetId)
    expect(stored.remote).toBeUndefined()
    const asked = calls.length
    const exported = await store.exportAll(dataset.datasetId)
    expect(calls.length).toBe(asked)
    expect(exported.details['2025-12-22'].portfolio.text).toMatch(/deux sources contradictoires[\s\S]*Un passage rattaché\.$/)
    expect(canonicalJson(exported.details['2025-12-23'])).toBe(canonicalJson(archive.details['2025-12-23']))
    expect(exported.details['2026-01-10'].portfolio.text).toBe('Ma journée à moi.')
    expect(exported.runDetails).toEqual({ 'LOU@2026-04-25|1.01': { code: '1.01', mine: true } })
    expect(exported.dataset.readings).toEqual([READING])
    // Un enregistrement préparé avant (l'index portait encore son renvoi) ne le rend pas au site.
    expect(await store.saveExistingDataset(dataset)).toBe(true)
    expect((await store.loadDataset(dataset.datasetId)).remote).toBeUndefined()
    await store.commit({ dataset, detailPatches: new Map() })
    expect((await store.loadDataset(dataset.datasetId)).remote).toBeUndefined()
    // Déjà d'ici (copié, par exemple, dans un autre onglet) : l'index tel qu'il est.
    expect((await store.materialize(dataset.datasetId)).remote).toBeUndefined()
    expect(calls.length).toBe(asked)
  })

  it('un fichier qui manque pendant la copie : rien n’est écrit, le jeu reste lu à la demande', async () => {
    const { index, files } = splitArchive(await louArchive())
    const { fetchFn: serve } = site(index, files)
    const fetchFn = async (url) => (url.endsWith('poles/3.json') ? { ok: false, status: 404, json: async () => null } : serve(url))
    const { store, dataset } = await openSplit(index, fetchFn)
    await expect(store.materialize(dataset.datasetId)).rejects.toThrow('poles/3.json introuvable sur le site')
    expect((await store.loadDataset(dataset.datasetId)).remote).toBeTruthy()
    expect(await store.loadDayDetails(dataset.datasetId, ['2025-12-22', '2025-12-23', '2025-12-24'])).toEqual(new Map())
  })

  it('exporté : l’archive est complète, sans renvoi au site — celle d’origine', async () => {
    const archive = await louArchive()
    const { index, files } = splitArchive(archive)
    const { fetchFn } = site(index, files)
    const { store, dataset } = await openSplit(index, fetchFn)
    const exported = await store.exportAll(dataset.datasetId)
    expect(exported.dataset.remote).toBeUndefined()
    expect(canonicalJson(exported.details)).toBe(canonicalJson(archive.details))
    expect(exported.runDetails).toEqual(archive.runDetails)
    const rebuilt = buildArchive(exported, { now: NOW })
    expect(rebuilt.days.map((d) => d.variants.map((v) => v.id))).toEqual(archive.days.map((d) => d.variants.map((v) => v.id)))
    expect(rebuilt.readings).toEqual(archive.readings)
  })

  it('passages rangés dans un autre ordre que les pôles : l’archive refaite est la même', async () => {
    const archive = await louArchive()
    const d22 = archive.details['2025-12-22']
    const vid = Object.keys(d22.variants)[0]
    const passages = d22.variants[vid].passages
    expect(new Set(passages.map((p) => p.pole)).size).toBeGreaterThan(1)
    d22.variants[vid].passages = [...passages].reverse()
    const { index, files } = splitArchive(archive)
    const { fetchFn } = site(index, files)
    const { store, dataset } = await openSplit(index, fetchFn)
    const exported = await store.exportAll(dataset.datasetId)
    expect(canonicalJson(exported.details)).toBe(canonicalJson(archive.details))
  })

  it('un index importé depuis un fichier (et non depuis le site) est refusé, même dans un jeu vide', async () => {
    const { index } = splitArchive(await louArchive())
    const res = await importFiles([{ path: 'index.json', text: JSON.stringify(index) }], createDataset({ title: 'Moi', referential: miniReferential(), now: NOW }), { now: NOW })
    expect(res.report.find((r) => r.code === 'index-a-la-demande')).toMatchObject({ severity: 'blocking' })
    expect(res.dataset.remote).toBeUndefined()
    expect(res.dataset.days).toEqual([])
    expect(res.dataset.readings).toEqual([])
  })

  it('un jeu qui a déjà quelque chose (un passage sans date) ne prend rien d’un index : ni journées, ni synthèses, ni métriques', async () => {
    const archive = await louArchive()
    archive.narratives = [{ id: 'n-1', kind: 'kairos-evolutif', scope: {}, sourceDates: ['2025-12-22'], html: '<p>Du site.</p>' }]
    archive.metrics = { source: 'site', fields: { mots: { label: 'Mots' } }, byDate: { '2025-12-22': { mots: 10 } } }
    const { index } = splitArchive(archive)
    const mine = await importFiles([{ path: 'notes.md', text: 'Un passage sans aucune date.\n' }], createDataset({ title: 'Moi', referential: miniReferential(), now: NOW }), { now: NOW })
    expect(mine.dataset.days).toEqual([])
    const res = await importFiles([{ path: 'index.json', text: JSON.stringify(index) }], mine.dataset, { now: NOW, allowRemote: true })
    expect(res.report.some((r) => r.code === 'index-a-la-demande' && r.severity === 'blocking')).toBe(true)
    expect(res.dataset.remote).toBeUndefined()
    expect(res.dataset.days).toEqual([])
    expect(res.dataset.narratives).toEqual([])
    expect(res.dataset.metrics).toBeNull()
    expect(res.dataset.portfolio.undated.map((u) => u.text.trim())).toEqual(['Un passage sans aucune date.'])
    expect(res.counts.narratives).toBe(0)
  })

  it('un index lu à la demande ne se fusionne pas dans un jeu qui a ses données', async () => {
    const { index } = splitArchive(await louArchive())
    const store = createCartoStore({ adapter: createMemoryAdapter() })
    const mine = await importFiles([{ path: 'lou.md', text: '### 2025-12-22\n\nMon texte.' }], createDataset({ title: 'Moi', referential: miniReferential(), now: NOW }), { now: NOW })
    await store.commit(mine)
    const res = await importFiles([{ path: 'index.json', text: JSON.stringify(index) }], mine.dataset, { now: NOW, allowRemote: true })
    expect(res.report.some((r) => r.code === 'index-a-la-demande' && r.severity === 'blocking')).toBe(true)
    expect(res.dataset.remote).toBeUndefined()
    expect(res.dataset.days.every((d) => d.variants.length === 0)).toBe(true)
  })
})
