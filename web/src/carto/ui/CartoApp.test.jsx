// Interface ultime — P1 : soleil, heatmap, gestionnaire à cases, date t, liste,
// modale du jour. Critères d'acceptation (spec §14) : cocher / décocher change
// le soleil et la heatmap ; le double-clic ouvre la modale du jour.
import { useEffect, useState } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import CartoApp from './CartoApp.jsx'
import { Sun, sectorPath } from './Sun.jsx'
import { WhyDialog } from './WhyDialog.jsx'
import { DayModal } from './DayModal.jsx'
import { createCartoStore, createMemoryAdapter } from '../core/store.js'
import { importFiles } from '../core/import.js'
import { createDataset } from '../core/model.js'
import { normalizeReferential } from '../core/referential.js'
import { computeState, layoutSun } from '../core/state.js'
import { resolveParams, ringGeometry, sunGeometry } from '../core/formulas.js'
import { parseHash, subscribe } from '../../router.js'
import { isPristineDemo } from '../../lib/archive.js'
import { buildArchive } from '../core/archive.js'
import { DEMO_ARCHIVE, DEMO_DIR, DEMO_INDEX } from './useCartoData.js'
import { splitArchive } from '../core/split.js'
import { LOU_PORTFOLIO, indexDataset, kairosDoc, louDays, miniReferential } from '../test/fixtures.js'
import { showCartoTiles } from '../test/tiles.js'

const NOW = '2026-10-13T12:00:00.000Z'

async function louStore({ withPortfolio = true } = {}) {
  const store = createCartoStore({ adapter: createMemoryAdapter() })
  const ds = createDataset({ datasetId: 'ds-lou', title: 'Lou', referential: miniReferential(), now: NOW })
  const files = withPortfolio ? [{ path: 'lou.md', text: LOU_PORTFOLIO }] : []
  for (const [date, poles] of Object.entries(louDays())) {
    for (const p of poles) files.push({ path: `${date}/carto_P${p.poleNum}.json`, text: JSON.stringify(p) })
    files.push({ path: `${date}/kairos.json`, text: JSON.stringify(kairosDoc(date)) })
  }
  await store.commit(await importFiles(files, ds, { now: NOW }))
  return store
}

/** Monte l'application comme le site : la route suit le fragment d'URL. */
function Harness({ store }) {
  const [route, setRoute] = useState(() => parseHash(window.location.hash))
  useEffect(() => subscribe(setRoute), [])
  return <CartoApp route={route} deps={{ store, loadReferential: async () => ({ doc: miniReferential() }) }} />
}

const sunSectors = () => [...document.querySelectorAll('[data-tile="sun"] .carto-sun [role="button"][aria-label^="1."], [data-tile="sun"] .carto-sun [role="button"][aria-label^="2."], [data-tile="sun"] .carto-sun [role="button"][aria-label^="3."]')]
const sectorCodes = () => sunSectors().map((el) => el.getAttribute('aria-label').slice(0, 4))
const cell = (date) => document.getElementById(`carto-hm-${date}`)

beforeEach(() => {
  window.location.hash = '#/cartographie'
  try {
    localStorage.clear()
    // Ces tests manipulent la liste, la heatmap… : toutes les tuiles affichées (D-53).
    showCartoTiles()
  } catch {
    /* rien */
  }
})
afterEach(cleanup)

describe('accueil', () => {
  it('sans données : invitation à importer ou à explorer la démonstration', async () => {
    render(<Harness store={createCartoStore({ adapter: createMemoryAdapter() })} />)
    expect(await screen.findByRole('heading', { name: 'Votre cartographie' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Explorer la démonstration' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Choisir des fichiers' })).toBeTruthy()
  })
})

describe('démonstration', () => {
  it('la démonstration chargée est marquée comme telle : intacte, elle n’entre pas dans l’archive de compte ; enrichie, si', async () => {
    const store = createCartoStore({ adapter: createMemoryAdapter() })
    const days = louDays()
    const fetchFn = async (url) => {
      if (url === 'data/demo/jours/index.json') return { ok: true, status: 200, json: async () => Object.keys(days).map((date) => ({ date })) }
      const m = /^data\/demo\/jours\/(\d{4}-\d{2}-\d{2})\.json$/.exec(url)
      if (m) return { ok: true, status: 200, text: async () => JSON.stringify({ date: m[1], poles: days[m[1]], kairos: kairosDoc(m[1]) }) }
      return { ok: false, status: 404, text: async () => '' }
    }
    function DemoHarness() {
      const [route, setRoute] = useState(() => parseHash(window.location.hash))
      useEffect(() => subscribe(setRoute), [])
      return <CartoApp route={route} deps={{ store, fetchFn, loadReferential: async () => ({ doc: miniReferential() }) }} />
    }
    render(<DemoHarness />)
    fireEvent.click(await screen.findByRole('button', { name: 'Explorer la démonstration' }))
    await screen.findByRole('heading', { name: 'Démonstration' })
    const [summary] = await store.listDatasets()
    const demo = await store.loadDataset(summary.datasetId)
    expect(demo.origin).toBe('demo')
    expect(isPristineDemo(demo)).toBe(true)
    // La personne y importe son portfolio (cible par défaut du gestionnaire :
    // le jeu ouvert) : ce sont ses données, elles partiront avec l'archive.
    await store.commit(await importFiles([{ path: 'lou.md', text: LOU_PORTFOLIO }], demo, { now: NOW }))
    expect(isPristineDemo(await store.loadDataset(summary.datasetId))).toBe(false)
  })
})

describe('démonstration intacte : mise à jour d’elle-même (D-57)', () => {
  const V1 = 'Wed, 14 Oct 2026 16:25:46 GMT'
  const V2 = 'Thu, 15 Oct 2026 09:00:00 GMT'

  /** Démonstration chargée avant le dépôt du portfolio de démonstration : sans portfolio. */
  async function staleDemoStore({ mutate } = {}) {
    const store = createCartoStore({ adapter: createMemoryAdapter() })
    const ds = { ...createDataset({ datasetId: 'ds-demo-old', title: 'Démonstration', referential: miniReferential(), now: NOW }), origin: 'demo' }
    const files = []
    for (const [date, poles] of Object.entries(louDays())) {
      for (const p of poles) files.push({ path: `${date}/carto_P${p.poleNum}.json`, text: JSON.stringify(p) })
    }
    const res = await importFiles(files, ds, { now: NOW })
    if (mutate) res.dataset = mutate(res.dataset)
    await store.commit(res)
    return store
  }

  /**
   * La démonstration déposée sur le site, portfolio compris : découpée (D-67),
   * son index et ses fichiers ; `whole` : l'archive entière (archive.json).
   */
  async function siteArchive({ whole = false } = {}) {
    const store = await louStore()
    const archive = buildArchive(await store.exportAll('ds-lou'), { now: NOW })
    if (whole) return { [DEMO_ARCHIVE]: JSON.stringify(archive) }
    const { index, files } = splitArchive(archive)
    return { [DEMO_INDEX]: JSON.stringify(index), ...Object.fromEntries(files.map((f) => [`${DEMO_DIR}${f.path}`, JSON.stringify(f.value)])) }
  }

  /**
   * Le site : les fichiers de la démonstration (HEAD ou GET) avec leur date de
   * dépôt ; chaque requête est notée. `fail` : réseau coupé (toutes) ;
   * `failGet` : le téléchargement de l'index (ou de l'archive) échoue ;
   * `onGet` : appelé pendant ce téléchargement (un autre onglet agit).
   */
  function siteFetch({ text = null, version = V1, calls = [], fail = false, failGet = false, onGet = null }) {
    return async (url, init = {}) => {
      const method = init.method ?? 'GET'
      calls.push(`${method} ${url}`)
      const entry = url === DEMO_INDEX || url === DEMO_ARCHIVE
      if (fail || (failGet && method === 'GET' && entry)) throw new TypeError('Failed to fetch')
      const body = text?.[url] ?? null
      if (body === null) return { ok: false, status: 404, headers: { get: () => null }, text: async () => '', json: async () => null }
      if (method === 'GET' && entry && onGet) await onGet()
      const headers = { get: (k) => ({ 'content-type': 'application/json', 'last-modified': version })[k.toLowerCase()] ?? null }
      return { ok: true, status: 200, headers, text: async () => (method === 'HEAD' ? '' : body), json: async () => JSON.parse(body) }
    }
  }

  /** Les requêtes de l'index et de l'archive entière, sans celles des fichiers lus ensuite à la demande. */
  const entryCalls = (calls) => calls.filter((c) => c.endsWith(DEMO_INDEX) || c.endsWith(DEMO_ARCHIVE))

  function SiteHarness({ store, fetchFn }) {
    const [route, setRoute] = useState(() => parseHash(window.location.hash))
    useEffect(() => subscribe(setRoute), [])
    return <CartoApp route={route} deps={{ store, fetchFn, loadReferential: async () => ({ doc: miniReferential() }) }} />
  }

  const sources = () => JSON.parse(localStorage.getItem('humanome-carto-demo-source') ?? '{}')
  const ids = async (store) => (await store.listDatasets()).map((d) => d.datasetId)

  it('chargée avant le dépôt du portfolio : affichée tout de suite, puis remplacée en arrière-plan par la démo du site, portfolio compris', async () => {
    const store = await staleDemoStore()
    expect(isPristineDemo(await store.loadDataset('ds-demo-old'))).toBe(true)
    const calls = []
    // Le téléchargement prend un peu de temps : l'ancienne démonstration se voit d'abord.
    const onGet = () => new Promise((r) => setTimeout(r, 150))
    render(<SiteHarness store={store} fetchFn={siteFetch({ text: await siteArchive(), calls, onGet })} />)
    // La démonstration en place s'affiche sans attendre le réseau…
    await screen.findByRole('heading', { name: 'Démonstration' })
    // … puis la nouvelle version (l'archive porte son propre titre, ici « Lou ») la remplace.
    await screen.findByRole('heading', { name: 'Lou' })
    await waitFor(async () => expect(await ids(store)).not.toContain('ds-demo-old'))
    const [freshId] = await ids(store)
    const fresh = await store.loadDataset(freshId)
    expect(fresh.origin).toBe('demo')
    expect(fresh.portfolio).not.toBeNull()
    expect(sources()).toEqual({ [freshId]: { version: V1, baseline: expect.objectContaining({ importLog: 1, sets: 0 }) } })
    expect(localStorage.getItem('humanome-carto-current')).toBe(freshId)
    expect(entryCalls(calls)).toEqual([`HEAD ${DEMO_INDEX}`, `GET ${DEMO_INDEX}`])
    // Aucun rapport d'import ne s'ouvre pour une mise à jour silencieuse.
    expect(screen.queryByText(/Rapport d.import/)).toBeNull()
  })

  it('même version que le site : rien n’est téléchargé ; nouvelle version : elle remplace l’ancienne', async () => {
    const store = await staleDemoStore()
    localStorage.setItem('humanome-carto-demo-source', JSON.stringify({ 'ds-demo-old': { version: V1 } }))
    const text = await siteArchive()
    const calls = []
    const { unmount } = render(<SiteHarness store={store} fetchFn={siteFetch({ text, calls })} />)
    await screen.findByRole('heading', { name: 'Démonstration' })
    await waitFor(() => expect(calls).toEqual([`HEAD ${DEMO_INDEX}`]))
    await new Promise((r) => setTimeout(r, 30))
    expect(await ids(store)).toEqual(['ds-demo-old'])
    unmount()
    const later = []
    render(<SiteHarness store={store} fetchFn={siteFetch({ text, version: V2, calls: later })} />)
    await waitFor(async () => expect(await ids(store)).not.toContain('ds-demo-old'))
    expect(entryCalls(later)).toEqual([`HEAD ${DEMO_INDEX}`, `GET ${DEMO_INDEX}`])
    expect(Object.values(sources()).map((s) => s.version)).toEqual([V2])
  })

  it('une démonstration enrichie par la personne n’est jamais remplacée (ni même vérifiée)', async () => {
    const store = await staleDemoStore({ mutate: (ds) => ({ ...ds, markers: [{ id: 'm1', date: '2025-12-23', label: 'Mon repère' }] }) })
    const calls = []
    render(<SiteHarness store={store} fetchFn={siteFetch({ text: await siteArchive(), calls })} />)
    await screen.findByRole('heading', { name: 'Démonstration' })
    await new Promise((r) => setTimeout(r, 30))
    expect(calls).toEqual([])
    expect(await ids(store)).toEqual(['ds-demo-old'])
  })

  it('enrichie PENDANT le téléchargement (un autre onglet) : gardée, la copie neuve s’en va', async () => {
    const store = await staleDemoStore()
    const onGet = async () => {
      const ds = await store.loadDataset('ds-demo-old')
      await store.saveDataset({ ...ds, markers: [{ id: 'm1', date: '2025-12-23', label: 'Repère posé ailleurs' }] })
    }
    const calls = []
    render(<SiteHarness store={store} fetchFn={siteFetch({ text: await siteArchive(), calls, onGet })} />)
    await screen.findByRole('heading', { name: 'Démonstration' })
    await waitFor(() => expect(calls).toContain(`GET ${DEMO_INDEX}`))
    await waitFor(async () => expect(await ids(store)).toEqual(['ds-demo-old']))
    await new Promise((r) => setTimeout(r, 50))
    expect(await ids(store)).toEqual(['ds-demo-old'])
    expect((await store.loadDataset('ds-demo-old')).markers).toHaveLength(1)
    expect(screen.getByRole('heading', { name: 'Démonstration' })).toBeTruthy()
  })

  it('site injoignable ou démo absente : la démonstration en place s’ouvre telle quelle', async () => {
    for (const fetchFn of [siteFetch({ fail: true }), siteFetch({ text: null })]) {
      const store = await staleDemoStore()
      const { unmount } = render(<SiteHarness store={store} fetchFn={fetchFn} />)
      await screen.findByRole('heading', { name: 'Démonstration' })
      await new Promise((r) => setTimeout(r, 30))
      expect(await ids(store)).toEqual(['ds-demo-old'])
      unmount()
    }
  })

  it('téléchargement en échec : retenté seulement un jour plus tard, jamais à chaque visite', async () => {
    const store = await staleDemoStore()
    const text = await siteArchive()
    const first = []
    const a = render(<SiteHarness store={store} fetchFn={siteFetch({ text, calls: first, failGet: true })} />)
    await screen.findByRole('heading', { name: 'Démonstration' })
    // L'index ne se télécharge pas : l'archive entière est essayée, absente.
    await waitFor(() => expect(first).toEqual([`HEAD ${DEMO_INDEX}`, `GET ${DEMO_INDEX}`, `GET ${DEMO_ARCHIVE}`]))
    a.unmount()
    const second = []
    const b = render(<SiteHarness store={store} fetchFn={siteFetch({ text, calls: second })} />)
    await screen.findByRole('heading', { name: 'Démonstration' })
    await waitFor(() => expect(second).toEqual([`HEAD ${DEMO_INDEX}`]))
    await new Promise((r) => setTimeout(r, 30))
    expect(second).toEqual([`HEAD ${DEMO_INDEX}`])
    b.unmount()
    // Un jour plus tard, la même version est retentée.
    const tried = JSON.parse(localStorage.getItem('humanome-carto-demo-tried'))
    localStorage.setItem('humanome-carto-demo-tried', JSON.stringify({ ...tried, at: tried.at - 25 * 3600 * 1000 }))
    render(<SiteHarness store={store} fetchFn={siteFetch({ text })} />)
    await waitFor(async () => expect(await ids(store)).not.toContain('ds-demo-old'))
    expect(localStorage.getItem('humanome-carto-demo-tried')).toBeNull()
  })

  it('« Explorer la démonstration » retient la version chargée : à la visite suivante, une simple vérification', async () => {
    const store = createCartoStore({ adapter: createMemoryAdapter() })
    const text = await siteArchive()
    const { unmount } = render(<SiteHarness store={store} fetchFn={siteFetch({ text })} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Explorer la démonstration' }))
    await screen.findByRole('heading', { name: 'Lou' })
    const [summary] = await store.listDatasets()
    expect((await store.loadDataset(summary.datasetId)).portfolio).not.toBeNull()
    expect(sources()[summary.datasetId].version).toBe(V1)
    unmount()
    const calls = []
    render(<SiteHarness store={store} fetchFn={siteFetch({ text, calls })} />)
    await screen.findByRole('heading', { name: 'Lou' })
    await waitFor(() => expect(entryCalls(calls)).toEqual([`HEAD ${DEMO_INDEX}`]))
    expect(await ids(store)).toEqual([summary.datasetId])
  })

  it('archive déposée mais impossible à télécharger : les journées publiques, et le visiteur le sait', async () => {
    const store = createCartoStore({ adapter: createMemoryAdapter() })
    const days = louDays()
    const base = siteFetch({ text: await siteArchive(), failGet: true })
    const fetchFn = async (url, init) => {
      if (url === 'data/demo/jours/index.json') return { ok: true, status: 200, json: async () => Object.keys(days).map((date) => ({ date })) }
      const m = /^data\/demo\/jours\/(\d{4}-\d{2}-\d{2})\.json$/.exec(url)
      if (m) return { ok: true, status: 200, text: async () => JSON.stringify({ date: m[1], poles: days[m[1]], kairos: kairosDoc(m[1]) }) }
      return base(url, init)
    }
    render(<SiteHarness store={store} fetchFn={fetchFn} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Explorer la démonstration' }))
    await screen.findByRole('heading', { name: 'Démonstration' })
    expect((await screen.findByRole('alert')).textContent).toMatch(/Le portfolio de la démonstration n’a pas pu être téléchargé/)
  })

  it('lue à la demande (D-67) : l’index d’abord, puis seulement ce qu’on ouvre — le portrait du dernier jour, une compétence, un pôle', async () => {
    const calls = []
    const fetchFn = siteFetch({ text: await siteArchive(), calls })
    const store = createCartoStore({ adapter: createMemoryAdapter(), fetchFn })
    render(<SiteHarness store={store} fetchFn={fetchFn} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Explorer la démonstration' }))
    await screen.findByRole('heading', { name: 'Lou' })
    const files = () => calls.filter((c) => !c.endsWith(DEMO_INDEX)).map((c) => c.replace(/^GET data\/demo\/carto\/v-[0-9a-f]+\//, ''))
    // Sans sélection : le portrait (kairos) du dernier jour coché, rien d'autre.
    await screen.findByRole('region', { name: 'Portrait kairos' })
    expect(calls[0]).toBe(`GET ${DEMO_INDEX}`)
    expect(files()).toEqual(['jours/2025-12-24.json'])
    // Une compétence : le fichier de ses verdicts, une fois, pour toutes ses journées.
    fireEvent.click(document.querySelector('[data-tile="sun"] .carto-sun [role="button"][aria-label^="3.02 "]'))
    const obs = await screen.findByRole('region', { name: 'Verdicts par journée' })
    await waitFor(() => expect(document.querySelectorAll('[data-tile="detail"] .carto-trace-quote').length).toBeGreaterThan(0))
    expect(obs).toBeTruthy()
    expect(files()).toEqual(['jours/2025-12-24.json', 'competences/3.02.json'])
    // Un pôle : le fichier de ses rapports.
    fireEvent.click(document.querySelector('[data-tile="sun"] .carto-sun [role="button"][aria-label^="Pôle MAIN"]'))
    await screen.findByRole('region', { name: 'Rapports du pôle' })
    await waitFor(() => expect(files()).toEqual(['jours/2025-12-24.json', 'competences/3.02.json', 'poles/3.json']))
    // Rien n'est rangé dans ce navigateur que l'index.
    const [summary] = await store.listDatasets()
    expect(await store.loadDayDetails(summary.datasetId, ['2025-12-22', '2025-12-23', '2025-12-24'])).toEqual(new Map())
  })

  it('une archive entière déposée (archive.json) se lit encore, d’un bloc', async () => {
    const store = createCartoStore({ adapter: createMemoryAdapter() })
    const calls = []
    render(<SiteHarness store={store} fetchFn={siteFetch({ text: await siteArchive({ whole: true }), calls })} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Explorer la démonstration' }))
    await screen.findByRole('heading', { name: 'Lou' })
    expect(calls.slice(0, 2)).toEqual([`GET ${DEMO_INDEX}`, `GET ${DEMO_ARCHIVE}`])
    const [summary] = await store.listDatasets()
    const ds = await store.loadDataset(summary.datasetId)
    expect(ds.remote).toBeUndefined()
    expect((await store.loadDayDetails(summary.datasetId, ['2025-12-22'])).get('2025-12-22').portfolio.text).toMatch(/deux sources/)
  })
})

describe('un jeu supprimé dans un autre onglet n’est jamais recréé', () => {
  it('l’enregistrement différé le dit au lieu de recréer le jeu sans ses journées', async () => {
    const store = await louStore()
    render(<Harness store={store} />)
    await screen.findByRole('heading', { name: 'Cartographie' })
    await store.deleteDataset('ds-lou') // un autre onglet
    fireEvent.click(within(screen.getByRole('radiogroup', { name: 'Calendrier' })).getByRole('radio', { name: 'Année scolaire' }))
    expect((await screen.findByRole('alert')).textContent).toMatch(/n’existe plus dans ce navigateur/)
    expect(await store.loadDataset('ds-lou')).toBeNull()
  })
})

describe('suppression d’un jeu', () => {
  it('supprimer un jeu efface aussi les brouillons de ses versions partagées (extraits, noms remplacés)', async () => {
    const store = await louStore()
    localStorage.setItem('humanome-carto-share-draft:ds-lou:10', JSON.stringify({ title: 'v', chosen: [{ text: 'un extrait' }] }))
    localStorage.setItem('humanome-carto-share-draft:ds-autre:11', JSON.stringify({ title: 'w' }))
    window.location.hash = '#/cartographie/gestionnaire'
    render(<Harness store={store} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Supprimer « Lou » de ce navigateur' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirmer : tout supprimer' }))
    await waitFor(() => expect(localStorage.getItem('humanome-carto-share-draft:ds-lou:10')).toBeNull())
    expect(localStorage.getItem('humanome-carto-share-draft:ds-autre:11')).not.toBeNull()
    expect(await store.loadDataset('ds-lou')).toBeNull()
  })
})

describe('P1 — soleil, heatmap, gestionnaire', () => {
  it('le soleil montre les compétences observées des journées cochées, dans l’ordre du référentiel', async () => {
    render(<Harness store={await louStore()} />)
    await screen.findByRole('heading', { name: 'Cartographie' })
    expect(sectorCodes()).toEqual(['1.01', '2.01', '3.01', '3.02'])
    expect(screen.getByRole('heading', { name: 'Lou' })).toBeTruthy()
  })

  it('décocher une journée change le soleil ET la heatmap (critère P1)', async () => {
    render(<Harness store={await louStore()} />)
    await screen.findByRole('heading', { name: 'Cartographie' })
    expect(cell('2025-12-23').getAttribute('aria-label')).toMatch(/cochée/)
    fireEvent.click(screen.getByRole('checkbox', { name: 'Cocher le 23 décembre 2025' }))
    await waitFor(() => expect(sectorCodes()).toEqual(['1.01', '3.01', '3.02']))
    expect(cell('2025-12-23').getAttribute('aria-label')).toMatch(/décochée/)
    expect(cell('2025-12-23').getAttribute('class')).toMatch(/is-inactive/)
    // Recocher restaure l'état.
    fireEvent.click(screen.getByRole('checkbox', { name: 'Cocher le 23 décembre 2025' }))
    await waitFor(() => expect(sectorCodes()).toEqual(['1.01', '2.01', '3.01', '3.02']))
  })

  it('« Aucune » vide le soleil ; « Tout » le restaure ; Maj+clic coche une plage', async () => {
    render(<Harness store={await louStore()} />)
    await screen.findByRole('heading', { name: 'Cartographie' })
    const toolbar = screen.getByRole('toolbar', { name: 'Sélection des journées' })
    fireEvent.click(within(toolbar).getByRole('button', { name: 'Aucune' }))
    await waitFor(() => expect(sectorCodes()).toEqual([]))
    expect(screen.getByText('Aucune compétence observée pour cette sélection de journées.')).toBeTruthy()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Cocher le 22 décembre 2025' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Cocher le 24 décembre 2025' }), { shiftKey: true })
    await waitFor(() => expect(sectorCodes()).toEqual(['1.01', '2.01', '3.01', '3.02']))
    fireEvent.click(within(toolbar).getByRole('button', { name: 'Aucune' }))
    fireEvent.click(within(toolbar).getByRole('button', { name: 'Tout' }))
    await waitFor(() => expect(sectorCodes()).toHaveLength(4))
  })

  it('cases tri-états par mois', async () => {
    render(<Harness store={await louStore()} />)
    await screen.findByRole('heading', { name: 'Cartographie' })
    fireEvent.change(screen.getByRole('combobox', { name: 'Regrouper les journées' }), { target: { value: 'month' } })
    const month = screen.getByRole('checkbox', { name: 'Cocher décembre 2025' })
    expect(month.checked).toBe(true)
    fireEvent.click(screen.getByRole('checkbox', { name: 'Cocher le 22 décembre 2025' }))
    await waitFor(() => expect(screen.getByRole('checkbox', { name: 'Cocher décembre 2025' }).indeterminate).toBe(true))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Cocher décembre 2025' }))
    await waitFor(() => expect(sectorCodes()).toHaveLength(4))
  })

  it('clic sur un jour : fixe t (état cumulé jusqu’à ce jour) et filtre la liste des compétences', async () => {
    render(<Harness store={await louStore()} />)
    await screen.findByRole('heading', { name: 'Cartographie' })
    fireEvent.click(cell('2025-12-22'))
    await waitFor(() => expect(sectorCodes()).toEqual(['1.01', '3.01']))
    expect(screen.getByText('Observées le lun. 22 déc. 2025')).toBeTruthy()
    const list = screen.getByRole('navigation', { name: 'Compétences observées' })
    expect(within(list).getByRole('button', { name: /1\.01 Pensée critique/ })).toBeTruthy()
    expect(within(list).queryByRole('button', { name: /2\.01 Écoute/ })).toBeNull()
    expect(cell('2025-12-23').getAttribute('class')).toMatch(/is-after-t/)
    fireEvent.click(screen.getByRole('button', { name: 'revenir à l’état complet' }))
    await waitFor(() => expect(sectorCodes()).toHaveLength(4))
  })

  it('double-clic sur un jour : la cartographie du jour seul s’ouvre en fenêtre modale (critère P1)', async () => {
    render(<Harness store={await louStore()} />)
    await screen.findByRole('heading', { name: 'Cartographie' })
    fireEvent.doubleClick(cell('2025-12-23'))
    const dialog = await screen.findByRole('dialog', { name: /23 décembre 2025/ })
    expect(within(dialog).getByText(/Compétences observées ce jour \(2\)/)).toBeTruthy()
    expect(within(dialog).getByText(/Non instruites ce jour \(court-circuit\) \(1\)/)).toBeTruthy()
    // Le soleil du jour seul : 2.01 et 3.02 seulement.
    const daySun = dialog.querySelectorAll('[role="button"][aria-label^="2.01"], [role="button"][aria-label^="3.02"], [role="button"][aria-label^="1.01"]')
    expect([...daySun].map((el) => el.getAttribute('aria-label').slice(0, 4))).toEqual(['2.01', '3.02'])
    // Navigation jour suivant, puis retour.
    fireEvent.click(within(dialog).getByRole('button', { name: /^mer\. 24 déc\. →$/ }))
    await screen.findByRole('dialog', { name: /24 décembre 2025/ })
    fireEvent.click(screen.getByRole('button', { name: 'Retour' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(window.location.hash).toBe('#/cartographie')
  })

  it('modale du jour : une compétence dépliée un jour est refermée le jour suivant, et se déplie avec son contenu', async () => {
    render(<Harness store={await louStore()} />)
    await screen.findByRole('heading', { name: 'Cartographie' })
    fireEvent.doubleClick(cell('2025-12-23'))
    let dialog = await screen.findByRole('dialog', { name: /23 décembre 2025/ })
    const row = () => [...screen.getByRole('dialog').querySelectorAll('details.carto-day-verdict')].find((d) => d.querySelector('summary').textContent.includes('3.02'))
    fireEvent.click(row().querySelector('summary'))
    await within(row()).findByText('Réflexions du jury')
    fireEvent.click(within(dialog).getByRole('button', { name: /^mer\. 24 déc\. →$/ }))
    dialog = await screen.findByRole('dialog', { name: /24 décembre 2025/ })
    // Une autre journée repart de lignes fermées, sans rien lire.
    expect(row().open).toBe(false)
    expect(within(row()).queryByText('Réflexions du jury')).toBeNull()
    fireEvent.click(row().querySelector('summary'))
    await within(row()).findByText('Réflexions du jury')
  })

  it('modale du jour : la date d’une voisine ne redit l’année que si elle change (D-71)', () => {
    const ds = indexDataset([
      { date: '2025-12-31', verdicts: [{ code: '1.01', confidence: 0.8, roles: ['preuve'] }] },
      { date: '2026-01-01', verdicts: [{ code: '1.01', confidence: 0.7, roles: ['preuve'] }] },
      { date: '2026-01-02', verdicts: [{ code: '2.01', confidence: 0.6, roles: ['preuve'] }] },
    ])
    const params = resolveParams({})
    const props = { dataset: ds, refl: normalizeReferential(miniReferential()), params, geometry: sunGeometry(params), activeDates: ds.days.map((d) => d.date), onClose: () => {}, onNavigate: () => {} }
    const labels = () => within(screen.getByRole('navigation', { name: 'Journées actives' })).getAllByRole('button').map((b) => b.textContent)
    const { rerender } = render(<DayModal {...props} date="2026-01-01" />)
    expect(labels()).toEqual(['← mer. 31 déc. 2025', 'ven. 2 janv. →', 'Retour'])
    rerender(<DayModal {...props} date="2025-12-31" />)
    expect(labels()).toEqual(['← précédente', 'jeu. 1er janv. 2026 →', 'Retour'])
  })

  it('la tête de lecture et l’inspection sont distinctes : ouvrir un jour ne déplace pas t', async () => {
    render(<Harness store={await louStore()} />)
    await screen.findByRole('heading', { name: 'Cartographie' })
    fireEvent.doubleClick(cell('2025-12-22'))
    await screen.findByRole('dialog')
    expect(sectorCodes()).toEqual(['1.01', '2.01', '3.01', '3.02'])
  })

  it('clic sur une compétence : les jours où elle est observée s’allument sur la heatmap', async () => {
    render(<Harness store={await louStore()} />)
    await screen.findByRole('heading', { name: 'Cartographie' })
    fireEvent.click(sunSectors().find((el) => el.getAttribute('aria-label').startsWith('3.02')))
    await waitFor(() => expect(cell('2025-12-23').getAttribute('class')).toMatch(/is-observed/))
    expect(cell('2025-12-24').getAttribute('class')).toMatch(/is-observed/)
    expect(cell('2025-12-22').getAttribute('class')).toMatch(/is-unobserved/)
    const detail = screen.getByRole('article', { name: /3\.02 Itération/ })
    // Les journées se lisent une fois, avec leur verdict (D-66) : plus de liste de dates à part.
    expect(await within(detail).findByRole('region', { name: 'Verdicts par journée' })).toBeTruthy()
    expect(within(detail).queryByText('Journées observées')).toBeNull()
    // Échap désélectionne.
    fireEvent.keyDown(document.body, { key: 'Escape' })
    await waitFor(() => expect(screen.getByRole('article', { name: 'Résumé du profil' })).toBeTruthy())
  })

  it('heatmap au clavier : un seul arrêt de tabulation, flèches ±1 / ±7, Entrée fixe t, Maj+Entrée ouvre le jour', async () => {
    render(<Harness store={await louStore()} />)
    await screen.findByRole('heading', { name: 'Cartographie' })
    // « Tout voir » par défaut (D-59) : du 22 au 24 décembre, la grille s'arrête au dernier jour.
    const grid = screen.getByRole('grid', { name: /^Heatmap 2025–2026/ })
    act(() => grid.focus())
    await waitFor(() => expect(grid.getAttribute('aria-activedescendant')).toBe('carto-hm-2025-12-22'))
    fireEvent.keyDown(grid, { key: 'ArrowDown' })
    await waitFor(() => expect(grid.getAttribute('aria-activedescendant')).toBe('carto-hm-2025-12-23'))
    fireEvent.keyDown(grid, { key: 'ArrowRight' }) // une semaine plus loin : hors de la période, on reste
    expect(grid.getAttribute('aria-activedescendant')).toBe('carto-hm-2025-12-23')
    fireEvent.keyDown(grid, { key: 'End' })
    await waitFor(() => expect(grid.getAttribute('aria-activedescendant')).toBe('carto-hm-2025-12-24'))
    fireEvent.keyDown(grid, { key: 'ArrowUp' })
    fireEvent.keyDown(grid, { key: 'Enter' })
    await waitFor(() => expect(sectorCodes()).toEqual(['1.01', '2.01', '3.01', '3.02']))
    fireEvent.keyDown(grid, { key: 'Enter', shiftKey: true })
    await screen.findByRole('dialog', { name: /23 décembre 2025/ })
  })

  it('heatmap : « Tout voir » par défaut, puis année scolaire et période libre ; plus de case de contraste (D-59)', async () => {
    const store = await louStore()
    render(<Harness store={store} />)
    await screen.findByRole('heading', { name: 'Cartographie' })
    const calendar = screen.getByRole('radiogroup', { name: 'Calendrier' })
    expect(within(calendar).getAllByRole('radio').map((r) => [r.textContent, r.getAttribute('aria-checked')])).toEqual([
      ['Tout voir', 'true'],
      ['Année scolaire', 'false'],
      ['Période libre', 'false'],
    ])
    expect(screen.queryByRole('checkbox', { name: /contraste/ })).toBeNull()
    // Du premier au dernier jour : une semaine, trois cases documentées.
    expect(document.querySelectorAll('[data-tile="timeline"] svg.carto-hm .carto-hm-cell')).toHaveLength(3)
    // La légende ne dit que ce que la période contient : pas de silence (trois jours de suite, tous écrits), rien de décoché.
    const legend = () => screen.getByLabelText('Légende de la heatmap').textContent
    expect(legend()).not.toMatch(/silence|décochée|sans portfolio/)
    fireEvent.click(within(calendar).getByRole('radio', { name: 'Année scolaire' }))
    await screen.findByRole('grid', { name: /^Heatmap Année scolaire 2025–2026/ })
    // Choisir l'année scolaire la fixe : c'est un choix, gardé tel quel.
    await waitFor(async () => expect((await store.loadDataset('ds-lou')).preferences).toMatchObject({ calendarMode: 'school', schoolYearStart: 2025 }))
    expect(document.querySelectorAll('[data-tile="timeline"] svg.carto-hm .carto-hm-cell').length).toBeGreaterThan(300)
    expect(legend()).toMatch(/silence/) // l'année entière : des jours sans rien
    fireEvent.click(within(calendar).getByRole('radio', { name: 'Période libre' }))
    await waitFor(() => expect(screen.getByLabelText('du')).toBeTruthy())
    // Le pinceau ne survit pas à un changement de calendrier.
    fireEvent.click(screen.getByRole('button', { name: 'Choisir au pinceau' }))
    expect(screen.getByRole('button', { name: /Pinceau actif/ }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(within(calendar).getByRole('radio', { name: 'Tout voir' }))
    await screen.findByRole('grid', { name: /^Heatmap 2025–2026/ })
    expect(screen.queryByLabelText('du')).toBeNull()
    expect(document.querySelector('[data-tile="timeline"] svg.carto-hm--brush')).toBeNull()
  })

  it('heatmap : une année scolaire jamais choisie (ancien défaut) s’affiche en « Tout voir »', async () => {
    const store = await louStore()
    const ds = await store.loadDataset('ds-lou')
    await store.saveDataset({ ...ds, preferences: { ...ds.preferences, calendarMode: 'school', schoolYearStart: null, highContrast: true } })
    render(<Harness store={store} />)
    await screen.findByRole('heading', { name: 'Cartographie' })
    expect(within(screen.getByRole('radiogroup', { name: 'Calendrier' })).getByRole('radio', { name: 'Tout voir' }).getAttribute('aria-checked')).toBe('true')
    await screen.findByRole('grid', { name: /^Heatmap 2025–2026/ })
  })

  it('« Pourquoi cette surface ? » (touche w) liste les traces, leurs poids et les formules', async () => {
    render(<Harness store={await louStore()} />)
    await screen.findByRole('heading', { name: 'Cartographie' })
    fireEvent.click(sunSectors().find((el) => el.getAttribute('aria-label').startsWith('3.02')))
    fireEvent.keyDown(document.body, { key: 'w' })
    const dialog = await screen.findByRole('dialog', { name: /3\.02 Itération/ })
    expect(within(dialog).getByText('Traces qui fondent l’angle (3)')).toBeTruthy()
    expect(within(dialog).getByText('points = Σ w (chaque trace compte)')).toBeTruthy()
    expect(within(dialog).getByText('θ = 360° × points / Σ points')).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Fermer' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('la liste cherche sans accents ni casse et garde les ancêtres', async () => {
    render(<Harness store={await louStore()} />)
    await screen.findByRole('heading', { name: 'Cartographie' })
    const list = screen.getByRole('navigation', { name: 'Compétences observées' })
    fireEvent.change(within(list).getByRole('searchbox'), { target: { value: 'ECOUTE' } })
    await waitFor(() => expect(within(list).getByRole('button', { name: /2\.01 Écoute/ })).toBeTruthy())
    expect(within(list).getByRole('button', { name: /^CŒUR — Relier ·/ })).toBeTruthy()
    expect(within(list).queryByRole('button', { name: /1\.01/ })).toBeNull()
  })
})

describe('soleil (composant)', () => {
  it('une seule compétence : anneau complet tracé avec deux arcs, jamais un arc unique', () => {
    const ref = normalizeReferential(miniReferential())
    const geometry = ringGeometry({ outerRadius: 190, centerRadius: 30, gap: 5 })
    const state = computeState(indexDataset([{ date: '2025-12-22', verdicts: [{ code: '2.01' }] }]), { ref })
    const layout = layoutSun(state, ref, geometry)
    render(<Sun refl={ref} state={state} layout={layout} geometry={geometry} />)
    const path = document.querySelector('[aria-label^="2.01"]').getAttribute('d')
    expect(path.match(/A /g)).toHaveLength(4) // deux arcs extérieurs + deux arcs intérieurs
    expect(sectorPath(10, 20, 0, 1)).toMatch(/^M .* A 10 10 0 0 1 .* L .* A 20 20 0 0 0 .* Z$/)
  })

  it('presque un tour (fin de l’ouverture d’un pôle) : un anneau, jamais un arc dont les extrémités se confondent', () => {
    const nearly = sectorPath(140, 190, -Math.PI / 2, (3 * Math.PI) / 2 - 2e-5)
    expect(nearly.match(/A /g)).toHaveLength(4)
    expect(nearly).not.toMatch(/ L /)
    // Un arc encore visiblement ouvert garde son tracé ordinaire.
    expect(sectorPath(140, 190, -Math.PI / 2, (3 * Math.PI) / 2 - 1e-2)).toMatch(/ L /)
  })
})

describe('« Pourquoi cette surface ? » (composant)', () => {
  const ref = normalizeReferential(miniReferential())
  const geometry = ringGeometry({ outerRadius: 190, centerRadius: 30, gap: 5 })
  const why = (state, layout, selection, g = geometry) =>
    render(<WhyDialog refl={ref} state={state} selection={selection} layout={layout} origin={g.origin} onClose={() => {}} onOpenDay={() => {}} />)

  it('l’épaisseur minimale dit sa raison : confiance trop faible, ou confiance inconnue', () => {
    const state = computeState(indexDataset([{ date: '2025-12-22', verdicts: [{ code: '1.01', confidence: null }, { code: '2.01', confidence: 0.001 }] }]), { ref })
    const layout = layoutSun(state, ref, geometry, { minThickness: 2 })
    why(state, layout, { type: 'competency', code: '1.01' })
    expect(screen.getByText(/la confiance du jury n’est pas connue/)).toBeTruthy()
    expect(screen.queryByText(/sa confiance est si faible/)).toBeNull()
    cleanup()
    why(state, layout, { type: 'competency', code: '2.01' })
    expect(screen.getByText(/sa confiance est si faible/)).toBeTruthy()
    // Sans départ de la hauteur, une confiance nulle ne parle pas de départ.
    cleanup()
    const zero = computeState(indexDataset([{ date: '2025-12-22', verdicts: [{ code: '1.01', confidence: 0 }] }]), { ref })
    why(zero, layoutSun(zero, ref, geometry, { minThickness: 2 }), { type: 'competency', code: '1.01' })
    expect(screen.getByText(/sa confiance est si faible/)).toBeTruthy()
    expect(screen.queryByText(/départ de la hauteur/)).toBeNull()
  })

  it('la hauteur part du départ réglable (D-65) : dite, calculée, et une confiance qui ne le dépasse pas reçoit l’épaisseur minimale', () => {
    const state = computeState(indexDataset([{ date: '2025-12-22', verdicts: [{ code: '1.01', confidence: 0.2 }, { code: '2.01', confidence: 0.7 }] }]), { ref })
    const g = sunGeometry(state.params) // départ par défaut : 0,25
    expect(g.origin).toBe(0.25)
    const layout = layoutSun(state, ref, g, { minThickness: 2 })
    why(state, layout, { type: 'competency', code: '1.01' }, g)
    expect(screen.getByText(/sa confiance \(0,20\) ne dépasse pas le départ de la hauteur \(0,25\)/)).toBeTruthy()
    cleanup()
    why(state, layout, { type: 'competency', code: '2.01' }, g)
    // Confiance 0,7 : hauteur (0,7 − 0,25) / 0,75 = 0,6.
    const stats = [...document.querySelectorAll('.carto-stats > div')].map((d) => d.textContent)
    expect(stats).toContain('Confiance0,70')
    expect(stats).toContain('Hauteur0,60')
    expect(screen.getByText(/hauteur h = \(C − 0,25\) \/ \(1 − 0,25\)/)).toBeTruthy()
    // La hauteur dessinée lui est proportionnelle (D-70).
    expect(screen.getByText(/rayon r_ext = r_int \+ h · \(R − r_int\) : la hauteur dessinée est proportionnelle à h/)).toBeTruthy()
    expect(screen.queryByText(/surface =/)).toBeNull()
    expect(screen.queryByText(/Épaisseur minimale/)).toBeNull()
    // Une confiance qui dépasse à peine le départ : invisible, et dite comme telle.
    cleanup()
    const near = computeState(indexDataset([{ date: '2025-12-22', verdicts: [{ code: '1.01', confidence: 0.252 }, { code: '2.01', confidence: 0.7 }] }]), { ref })
    why(near, layoutSun(near, ref, g, { minThickness: 2 }), { type: 'competency', code: '1.01' }, g)
    expect(screen.getByText(/sa confiance \(0,252\) dépasse à peine le départ de la hauteur \(0,25\)/)).toBeTruthy()
  })

  it('le pôle d’une compétence élargie le signale ; un pôle sans compétence élargie, non', () => {
    const state = computeState(
      indexDataset([{ date: '2025-12-22', verdicts: [{ code: '1.01', confidence: 0.8, roles: Array(400).fill('preuve') }, { code: '2.01', confidence: 0.8, roles: ['indice'] }] }]),
      { ref },
    )
    const layout = layoutSun(state, ref, geometry, { minArc: 4 })
    why(state, layout, { type: 'pole', num: 2 })
    expect(screen.getByText(/appliquée à au moins une de ses compétences/)).toBeTruthy()
    cleanup()
    why(state, layout, { type: 'pole', num: 1 })
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(screen.queryByText(/Largeur minimale/)).toBeNull()
  })
})
