// Interface ultime — P1 : soleil, heatmap, gestionnaire à cases, date t, liste,
// modale du jour. Critères d'acceptation (spec §14) : cocher / décocher change
// le soleil et la heatmap ; le double-clic ouvre la modale du jour.
import { useEffect, useState } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import CartoApp from './CartoApp.jsx'
import { Sun, sectorPath } from './Sun.jsx'
import { createCartoStore, createMemoryAdapter } from '../core/store.js'
import { importFiles } from '../core/import.js'
import { createDataset } from '../core/model.js'
import { normalizeReferential } from '../core/referential.js'
import { computeState, layoutSun } from '../core/state.js'
import { ringGeometry } from '../core/formulas.js'
import { parseHash, subscribe } from '../../router.js'
import { LOU_PORTFOLIO, indexDataset, kairosDoc, louDays, miniReferential } from '../test/fixtures.js'

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

const sunSectors = () => [...document.querySelectorAll('.carto-col-center .carto-sun [role="button"][aria-label^="1."], .carto-col-center .carto-sun [role="button"][aria-label^="2."], .carto-col-center .carto-sun [role="button"][aria-label^="3."]')]
const sectorCodes = () => sunSectors().map((el) => el.getAttribute('aria-label').slice(0, 4))
const cell = (date) => document.getElementById(`carto-hm-${date}`)

beforeEach(() => {
  window.location.hash = '#/cartographie'
  try {
    localStorage.clear()
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
  it('la démonstration chargée est marquée comme telle (elle n’entre pas dans l’archive de compte)', async () => {
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
    expect((await store.loadDataset(summary.datasetId)).origin).toBe('demo')
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
    fireEvent.click(within(dialog).getByRole('button', { name: /mer\. 24 déc\. 2025/ }))
    await screen.findByRole('dialog', { name: /24 décembre 2025/ })
    fireEvent.click(screen.getByRole('button', { name: 'Retour' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(window.location.hash).toBe('#/cartographie')
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
    expect(within(detail).getByText('Journées observées')).toBeTruthy()
    // Échap désélectionne.
    fireEvent.keyDown(document.body, { key: 'Escape' })
    await waitFor(() => expect(screen.getByRole('article', { name: 'Résumé du profil' })).toBeTruthy())
  })

  it('heatmap au clavier : un seul arrêt de tabulation, flèches ±1 / ±7, Entrée fixe t, Maj+Entrée ouvre le jour', async () => {
    render(<Harness store={await louStore()} />)
    await screen.findByRole('heading', { name: 'Cartographie' })
    const grid = screen.getByRole('grid', { name: /Heatmap Année scolaire 2025–2026/ })
    act(() => grid.focus())
    await waitFor(() => expect(grid.getAttribute('aria-activedescendant')).toBe('carto-hm-2025-12-22'))
    fireEvent.keyDown(grid, { key: 'ArrowDown' })
    await waitFor(() => expect(grid.getAttribute('aria-activedescendant')).toBe('carto-hm-2025-12-23'))
    fireEvent.keyDown(grid, { key: 'ArrowRight' })
    await waitFor(() => expect(grid.getAttribute('aria-activedescendant')).toBe('carto-hm-2025-12-30'))
    fireEvent.keyDown(grid, { key: 'ArrowLeft' })
    fireEvent.keyDown(grid, { key: 'Enter' })
    await waitFor(() => expect(sectorCodes()).toEqual(['1.01', '2.01', '3.01', '3.02']))
    fireEvent.keyDown(grid, { key: 'Enter', shiftKey: true })
    await screen.findByRole('dialog', { name: /23 décembre 2025/ })
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
})
