// Interface ultime — P4 : tableau de bord des métriques (spec §10). Critère
// d'acceptation (§14) : chaque carte se masque seule quand ses données manquent.
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

const LONG_PORTFOLIO = `### 2025-12-22

Ce matin j’ai relu mes notes avant d’écrire. J'ai vérifié deux sources contradictoires avant de conclure sur la date du chantier.
Ensuite nous avons construit la maquette du pont en carton, avec Sam et Noé. Le carton plie sous le poids des voitures miniatures, alors nous
avons doublé les longerons et collé des renforts en diagonale. Je pense que la structure tiendra mieux demain, mais je ne suis pas certain.

### 23.12.2025

J’ai écouté Sam expliquer son idée jusqu’au bout sans l’interrompre, puis j’ai reformulé ce que j’avais compris. Pourquoi ai-je eu envie de
couper la parole ? Peut-être par impatience. La maquette a cédé : nous avons recommencé en changeant les appuis. Noé a proposé des piles en
bouchons, et l’équipe a voté pour essayer cette solution dès le lendemain matin.

### 24 décembre 2025

Troisième essai de la maquette : cette fois, les appuis tiennent ! J'ai noté chaque modification dans un tableau, avec la date, la charge et
le résultat. Ah, quel soulagement de voir le tablier rester droit. Cette méthode me plaît : écrire chaque essai m’oblige à regarder ce qui change
vraiment, et à ne pas me raconter d’histoires sur nos progrès supposés.
`

const MIRROR = {
  run_id: 'demo',
  trajectoire: {
    trajectoire: [
      { date: '2025-12-22', profil: { metacognition: 0.4, inhibition: 0.3 }, n_caracteres: 500, premiere_impression: 'Une journée de chantier.' },
      { date: '2025-12-23', profil: { metacognition: 0.6, inhibition: 0.5 }, n_caracteres: 400, premiere_impression: 'Une journée d’écoute.' },
    ],
  },
  signatures_par_sensibilite: { 50: [{ type: 'monitoring_metacognitif', date: '2025-12-23', question: 'Qu’as-tu remarqué en toi ?', confiance: 0.7 }] },
}

async function store({ portfolio = LOU_PORTFOLIO, mirror = false } = {}) {
  const s = createCartoStore({ adapter: createMemoryAdapter() })
  const ds = createDataset({ datasetId: 'ds-lou', title: 'Lou', referential: miniReferential(), now: NOW })
  const files = portfolio ? [{ path: 'lou.md', text: portfolio }] : []
  for (const [date, poles] of Object.entries(louDays())) {
    for (const p of poles) files.push({ path: `${date}/carto_P${p.poleNum}.json`, text: JSON.stringify(p) })
    files.push({ path: `${date}/kairos.json`, text: JSON.stringify(kairosDoc(date)) })
  }
  if (mirror) files.push({ path: 'miroir.json', text: JSON.stringify(MIRROR) })
  await s.commit(await importFiles(files, ds, { now: NOW }))
  return s
}

function Harness({ store: st }) {
  const [route, setRoute] = useState(() => parseHash(window.location.hash))
  useEffect(() => subscribe(setRoute), [])
  return <CartoApp route={route} deps={{ store: st, loadReferential: async () => ({ doc: miniReferential() }) }} />
}

async function openDashboard(st) {
  window.location.hash = '#/cartographie/tableau-de-bord'
  render(<Harness store={st} />)
  return screen.findByRole('region', { name: 'Tableau de bord' })
}

const cardNames = (page) => [...page.querySelectorAll('section.carto-card')].map((c) => c.getAttribute('aria-label'))

beforeEach(() => {
  try {
    localStorage.clear()
  } catch {
    /* rien */
  }
})
afterEach(cleanup)

describe('P4 — chaque carte se masque seule quand ses données manquent (critère P4)', () => {
  it('portfolio court, sans fichier de métriques : style, rupture, fonctions et anomalies masquées, avec leur raison', async () => {
    const page = await openDashboard(await store())
    await waitFor(() => expect(cardNames(page)).toEqual(['Profil', 'Rythme', 'Phases et repères', 'Constance', 'Moments remarquables']))
    const missing = within(page).getByText(/cartes? sans données/).closest('details')
    expect(within(missing).getByText(/Style \(local\) : il faut au moins deux journées de portfolio d’au moins 50 mots/)).toBeTruthy()
    expect(within(missing).getByText(/Fonctions cognitives : aucun fichier de fonctions cognitives/)).toBeTruthy()
    expect(within(missing).getByText(/Ruptures et anomalies d’import : rien à signaler/)).toBeTruthy()
  })

  it('sans portfolio : le rythme se masque, les anomalies apparaissent', async () => {
    const page = await openDashboard(await store({ portfolio: null }))
    await waitFor(() => expect(cardNames(page)).toContain('Ruptures et anomalies d’import'))
    expect(cardNames(page)).not.toContain('Rythme')
    expect(cardNames(page)).not.toContain('Style (local)')
    expect(within(page).getByText(/Aucun portfolio importé : le surlignage des traces/)).toBeTruthy()
  })

  it('portfolio long + miroir HumanoTwin : style, rupture lexicale et fonctions cognitives apparaissent', async () => {
    const page = await openDashboard(await store({ portfolio: LONG_PORTFOLIO, mirror: true }))
    await waitFor(() => expect(cardNames(page)).toEqual(expect.arrayContaining(['Style (local)', 'Rupture lexicale', 'Fonctions cognitives'])))
    const style = within(page).getByRole('region', { name: 'Style (local)' })
    expect(within(style).getAllByRole('row')).toHaveLength(20) // en-tête + 19 mesures
    const cog = within(page).getByRole('region', { name: 'Fonctions cognitives' })
    expect(within(cog).getByRole('button', { name: 'Métacognition' }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(within(cog).getByRole('button', { name: 'Métacognition' }))
    expect(within(cog).getByRole('button', { name: 'Métacognition' }).getAttribute('aria-pressed')).toBe('false')
    expect(within(cog).getByText(/Qu’as-tu remarqué en toi \?/)).toBeTruthy()
  })
})

describe('P4 — cartes', () => {
  it('masquer une carte à la main, puis l’afficher de nouveau', async () => {
    const page = await openDashboard(await store())
    const profil = await within(page).findByRole('region', { name: 'Profil' })
    fireEvent.click(within(profil).getByRole('button', { name: 'Masquer la carte Profil' }))
    await waitFor(() => expect(cardNames(page)).not.toContain('Profil'))
    fireEvent.click(within(page).getByRole('button', { name: 'Afficher « Profil »' }))
    await waitFor(() => expect(cardNames(page)).toContain('Profil'))
  })

  it('moments remarquables : la sensibilité règle la liste ; un moment s’ouvre dans le portfolio', async () => {
    const page = await openDashboard(await store())
    const card = await within(page).findByRole('region', { name: 'Moments remarquables' })
    await waitFor(() => expect(within(card).getByText(/3 moments à cette sensibilité/)).toBeTruthy()) // preuves ≥ 0,6 : 1.01 (0,8), 2.01 (0,9), 3.02 (0,7)
    fireEvent.change(within(card).getByRole('slider'), { target: { value: '0' } })
    await waitFor(() => expect(within(card).getByText(/1 moment à cette sensibilité/)).toBeTruthy()) // 2.01 (0,9)
    fireEvent.click(within(card).getByRole('button', { name: 'Ouvrir dans le portfolio' }))
    const reader = await screen.findByRole('region', { name: 'mardi 23 décembre 2025' })
    await waitFor(() => expect(reader.querySelectorAll('.carto-reader-text mark').length).toBeGreaterThan(0))
  })

  it('phases et repères : ajouter un repère, le voir sur le rythme, le retirer en deux temps', async () => {
    const page = await openDashboard(await store())
    const card = await within(page).findByRole('region', { name: 'Phases et repères' })
    fireEvent.change(within(card).getByRole('textbox', { name: 'Nom' }), { target: { value: 'Premier pont' } })
    fireEvent.change(within(card).getByLabelText('Date'), { target: { value: '2025-12-23' } })
    fireEvent.click(within(card).getByRole('button', { name: 'Ajouter' }))
    await waitFor(() => expect(within(card).getAllByText('Premier pont').length).toBeGreaterThan(0))
    const rythme = within(page).getByRole('region', { name: 'Rythme' })
    await waitFor(() => expect([...rythme.querySelectorAll('.carto-chart-marker text')].map((t) => t.textContent)).toContain('Premier pont'))
    fireEvent.click(within(card).getByRole('button', { name: 'Retirer' }))
    fireEvent.click(within(card).getByRole('button', { name: 'Confirmer' }))
    await waitFor(() => expect(within(card).queryAllByText('Premier pont')).toHaveLength(0))
  })

  it('graphique au clavier : flèches pour parcourir, Entrée pour ouvrir la journée', async () => {
    const page = await openDashboard(await store())
    const rythme = await within(page).findByRole('region', { name: 'Rythme' })
    const chart = within(rythme).getByRole('listbox')
    chart.focus()
    fireEvent.keyDown(chart, { key: 'ArrowRight' })
    await waitFor(() => expect(chart.getAttribute('aria-activedescendant')).toMatch(/2025-12-22$/))
    expect(within(rythme).getAllByRole('option')[0].getAttribute('aria-label')).toMatch(/^22 décembre 2025 : \d+ mots$/)
    fireEvent.keyDown(chart, { key: 'ArrowRight' })
    fireEvent.keyDown(chart, { key: 'Enter' })
    await waitFor(() => expect(window.location.hash).toBe('#/cartographie/jour/2025-12-23'))
  })
})
