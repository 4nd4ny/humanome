// Interface ultime — P3 : comparaison de soi à soi (spec §9). Critère
// d'acceptation (§14) : A et B de tailles différentes avertissent ; aucun rang
// ni verdict.
import { useEffect, useState } from 'react'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import CartoApp from './CartoApp.jsx'
import { createCartoStore, createMemoryAdapter } from '../core/store.js'
import { importFiles } from '../core/import.js'
import { createDataset } from '../core/model.js'
import { parseHash, subscribe } from '../../router.js'
import { LOU_PORTFOLIO, kairosDoc, louDays, miniReferential } from '../test/fixtures.js'

const NOW = '2026-10-13T12:00:00.000Z'
const VALENCE = /progr|amélior|régress|meilleur|pire|mieux|recul|déclin|classement|\brang\b|\b1er\b|\b2e\b/i

async function louStore() {
  const store = createCartoStore({ adapter: createMemoryAdapter() })
  const ds = createDataset({ datasetId: 'ds-lou', title: 'Lou', referential: miniReferential(), now: NOW })
  const files = [{ path: 'lou.md', text: LOU_PORTFOLIO }]
  for (const [date, poles] of Object.entries(louDays())) {
    for (const p of poles) files.push({ path: `${date}/carto_P${p.poleNum}.json`, text: JSON.stringify(p) })
    files.push({ path: `${date}/kairos.json`, text: JSON.stringify(kairosDoc(date)) })
  }
  await store.commit(await importFiles(files, ds, { now: NOW }))
  return store
}

function Harness({ store }) {
  const [route, setRoute] = useState(() => parseHash(window.location.hash))
  useEffect(() => subscribe(setRoute), [])
  return <CartoApp route={route} deps={{ store, loadReferential: async () => ({ doc: miniReferential() }) }} />
}

async function openCompare(store) {
  window.location.hash = '#/cartographie/comparaison'
  render(<Harness store={store} />)
  return screen.findByRole('region', { name: 'Comparer deux ensembles de vos journées' })
}

const panelsText = (root) => [...root.querySelectorAll('[role="tabpanel"]')].map((p) => p.textContent).join(' ')

beforeEach(() => {
  try {
    localStorage.clear()
  } catch {
    /* rien */
  }
})
afterEach(cleanup)

describe('P3 — comparaison de soi à soi', () => {
  it('par défaut « depuis la dernière évaluation » : tailles différentes et recouvrement sont signalés (critère P3)', async () => {
    const page = await openCompare(await louStore())
    const warnings = await within(page).findByRole('list', { name: 'Avertissements' })
    expect(within(warnings).getByText(/A et B n’ont pas la même taille : 2 journées analysées dans A, 3 dans B/)).toBeTruthy()
    expect(within(warnings).getByText(/se recouvrent : 2 journées en commun/)).toBeTruthy()
    expect(within(page).getByRole('group', { name: 'Ensemble A' }) ?? null).toBeTruthy()
  })

  it('les huit vues existent, au clavier ; aucune ne contient de rang ni de mot de verdict (critère P3)', async () => {
    const page = await openCompare(await louStore())
    const tabs = within(page).getAllByRole('tab')
    expect(tabs.map((t) => t.textContent)).toEqual(['Deux soleils', 'Superposition', 'Radar des pôles', 'Tableau', 'Communes / seulement A / B', 'Journées par pôle', 'Concentration', 'Ce qui a changé'])
    fireEvent.keyDown(tabs[0], { key: 'ArrowRight' })
    await waitFor(() => expect(within(page).getByRole('tab', { name: 'Superposition' }).getAttribute('aria-selected')).toBe('true'))
    fireEvent.click(within(page).getByRole('tab', { name: 'Tableau' }))
    const table = await within(page).findByRole('table')
    expect(within(table).getByRole('rowheader', { name: /3\.02 Itération/ })).toBeTruthy()
    fireEvent.click(within(page).getByRole('tab', { name: 'Ce qui a changé' }))
    const story = within(page).getByRole('tabpanel', { name: 'Ce qui a changé' })
    expect(within(story).getByText(/B reprend les journées de A et en ajoute 1, depuis le 24 décembre 2025\./)).toBeTruthy()
    const text = panelsText(page)
    const hit = VALENCE.exec(text)
    expect(hit ? text.slice(Math.max(0, hit.index - 60), hit.index + 40) : null).toBeNull()
  })

  it('communes / seulement A / seulement B ; deux périodes de même taille : plus d’avertissement de taille', async () => {
    const page = await openCompare(await louStore())
    const a = within(page).getByRole('group', { name: 'Ensemble A' })
    const b = within(page).getByRole('group', { name: 'Ensemble B' })
    fireEvent.change(within(a).getByRole('combobox', { name: 'Journées' }), { target: { value: 'period' } })
    fireEvent.change(within(b).getByRole('combobox', { name: 'Journées' }), { target: { value: 'period' } })
    await waitFor(() => expect(within(a).getByLabelText('Du')).toBeTruthy())
    fireEvent.change(within(a).getByLabelText('Du'), { target: { value: '2025-12-22' } })
    fireEvent.change(within(a).getByLabelText('Au'), { target: { value: '2025-12-22' } })
    fireEvent.change(within(b).getByLabelText('Du'), { target: { value: '2025-12-23' } })
    fireEvent.change(within(b).getByLabelText('Au'), { target: { value: '2025-12-23' } })
    await waitFor(() => expect(within(page).queryByRole('list', { name: 'Avertissements' })).toBeNull())
    fireEvent.click(within(page).getByRole('tab', { name: 'Communes / seulement A / B' }))
    const onlyA = within(page).getByRole('region', { name: /^Seulement dans A/ })
    expect(within(onlyA).getByText('Pensée critique')).toBeTruthy()
    const onlyB = within(page).getByRole('region', { name: /^Seulement dans B/ })
    expect(within(onlyB).getByText('Écoute')).toBeTruthy()
    expect(within(onlyB).getByText('Itération')).toBeTruthy()
    const common = within(page).getByRole('region', { name: 'Observées dans A et dans B' })
    expect(within(common).getByText('Aucune compétence commune.')).toBeTruthy()
  })

  it('préréglage indisponible : le dire, sans rien changer', async () => {
    const page = await openCompare(await louStore())
    fireEvent.click(within(page).getByRole('button', { name: 'Année scolaire précédente' }))
    expect(await within(page).findByText(/Aucune journée analysée pendant l’année scolaire 2024–2025/)).toBeTruthy()
  })

  it('la note de l’apprenant est enregistrée avec la comparaison, dans ce navigateur', async () => {
    const store = await louStore()
    const page = await openCompare(store)
    const note = within(page).getByRole('textbox', { name: /Votre lecture de cette comparaison/ })
    fireEvent.change(note, { target: { value: 'Je relirai les journées de décembre.' } })
    fireEvent.blur(note)
    await waitFor(async () => {
      const ds = await store.loadDataset('ds-lou')
      expect(ds.comparisons.map((c) => c.note)).toContain('Je relirai les journées de décembre.')
    })
  })
})
