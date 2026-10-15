// Interface ultime — P4 : tableau de bord des métriques (spec §10). Critère
// d'acceptation (§14) : chaque carte se masque seule quand ses données manquent.
// D-61 : au départ, le profil et le rythme ; « Panneaux » (qui dit ce qui manque
// aux cartes sans données) et « Réinitialiser l'affichage » dans l'en-tête, comme
// pour la Cartographie ; disposition gardée dans ce navigateur.
import { useEffect, useState } from 'react'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import CartoApp from './CartoApp.jsx'
import { createCartoStore, createMemoryAdapter } from '../core/store.js'
import { importFiles } from '../core/import.js'
import { createDataset } from '../core/model.js'
import { parseHash, subscribe } from '../../router.js'
import { LOU_PORTFOLIO, indexDataset, kairosDoc, louDays, miniReferential } from '../test/fixtures.js'
import { showDashboardCards } from '../test/tiles.js'
import { DASHBOARD_TILES_KEY } from './tiles.js'

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
const head = () => document.querySelector('.carto-context')
const menu = () => head().querySelector('.carto-panels-menu')
const panel = (name) => within(menu()).getByRole('checkbox', { name })
const stored = () => JSON.parse(localStorage.getItem(DASHBOARD_TILES_KEY))

beforeEach(() => {
  try {
    localStorage.clear()
  } catch {
    /* rien */
  }
})
afterEach(cleanup)

describe('vue de départ (D-61)', () => {
  it('le profil et le rythme seulement ; « Panneaux » et « Réinitialiser l’affichage » dans l’en-tête, comme pour la cartographie', async () => {
    const page = await openDashboard(await store())
    await waitFor(() => expect(cardNames(page)).toEqual(['Profil', 'Rythme']))
    expect(within(head()).getByRole('button', { name: 'Réinitialiser l’affichage' })).toBeTruthy()
    await waitFor(() => expect(within(menu()).getByText('2/5')).toBeTruthy()) // cinq cartes ont des données
    for (const name of ['Profil', 'Rythme']) expect(panel(name).checked).toBe(true)
    for (const name of ['Phases et repères', 'Constance', 'Moments remarquables']) expect([panel(name).checked, panel(name).disabled]).toEqual([false, false])
    // Plus de « Masquer » dans les cartes, ni de liste des cartes masquées ou sans données sous la grille.
    expect(within(page).queryByRole('button', { name: /^Masquer la carte/ })).toBeNull()
    expect(within(page).queryByText(/Cartes masquées|cartes? sans données/)).toBeNull()
    // La source de chaque carte reste dite.
    expect(within(within(page).getByRole('region', { name: 'Rythme' })).getByText('Calcul local et déterministe, dans ce navigateur.')).toBeTruthy()
  })

  it('sans portfolio : le profil seul, sur toute la largeur ; la case du rythme dit ce qui lui manque ; le portfolio venu, le rythme paraît', async () => {
    const page = await openDashboard(await store({ portfolio: null }))
    await waitFor(() => expect(cardNames(page)).toEqual(['Profil']))
    const columns = Number(/\((\d+) colonnes?\)/.exec(page.querySelector('.v3-tile-grid').getAttribute('aria-label'))[1])
    expect(page.querySelector('[data-tile-id="profile"]').style.gridColumn).toBe(`span ${columns}`)
    expect([panel('Rythme').checked, panel('Rythme').disabled]).toEqual([false, true])
    expect(document.getElementById(panel('Rythme').getAttribute('aria-describedby')).textContent).toBe('Sans données : aucun portfolio importé.')
    // Le rythme reste de la vue de départ : il paraît dès que ses données sont là, à côté du profil.
    expect(stored().shown).toEqual(['profile', 'rhythm'])
    cleanup()
    const again = await openDashboard(await store())
    await waitFor(() => expect(cardNames(again)).toEqual(['Profil', 'Rythme']))
    expect(again.querySelector('[data-tile-id="profile"]').style.gridColumn).not.toBe(`span ${columns}`)
  })

  it('« Panneaux » au clavier : Échap le referme et rend le focus à son bouton', async () => {
    const page = await openDashboard(await store())
    await waitFor(() => expect(cardNames(page)).toEqual(['Profil', 'Rythme']))
    const summary = menu().querySelector('summary')
    fireEvent.click(summary)
    expect(menu().open).toBe(true)
    fireEvent.keyDown(panel('Constance'), { key: 'Escape' })
    expect(menu().open).toBe(false)
    expect(document.activeElement).toBe(summary)
    expect(cardNames(page)).toEqual(['Profil', 'Rythme']) // Échap ne fait rien d'autre
  })

  it('les commandes ne sont dans l’en-tête que dans les espaces en tuiles, chacune avec ses panneaux', async () => {
    const page = await openDashboard(await store())
    await waitFor(() => expect(cardNames(page)).toEqual(['Profil', 'Rythme']))
    expect(within(menu()).queryByRole('checkbox', { name: 'Soleil' })).toBeNull()
    window.location.hash = '#/cartographie'
    window.dispatchEvent(new HashChangeEvent('hashchange'))
    await waitFor(() => expect(within(menu()).getByRole('checkbox', { name: 'Soleil' })).toBeTruthy())
    expect(within(menu()).queryByRole('checkbox', { name: 'Profil' })).toBeNull()
    expect(head().querySelectorAll('.carto-panels-menu')).toHaveLength(1)
    window.location.hash = '#/cartographie/comparaison'
    window.dispatchEvent(new HashChangeEvent('hashchange'))
    await waitFor(() => expect(head().querySelector('.carto-panels-menu')).toBeNull())
    expect(within(head()).queryByRole('button', { name: 'Réinitialiser l’affichage' })).toBeNull()
  })
})

describe('P4 — chaque carte se masque seule quand ses données manquent (critère P4)', () => {
  it('portfolio court, sans fichier de métriques : style, fonctions et anomalies sans données ; « Panneaux » dit pourquoi', async () => {
    showDashboardCards()
    const page = await openDashboard(await store())
    await waitFor(() => expect(cardNames(page)).toEqual(['Profil', 'Rythme', 'Phases et repères', 'Constance', 'Moments remarquables']))
    for (const name of ['Style (local)', 'Fonctions cognitives', 'Ruptures et anomalies d’import']) expect([panel(name).checked, panel(name).disabled]).toEqual([false, true])
    expect(within(menu()).getByText('Sans données : il faut au moins deux journées de portfolio d’au moins 50 mots.')).toBeTruthy()
    expect(within(menu()).getByText(/^Sans données : aucun fichier de fonctions cognitives/)).toBeTruthy()
    expect(within(menu()).getByText('Rien à signaler.')).toBeTruthy() // rien à signaler n'est pas un manque de données
  })

  it('Constance : le trait suit les points cumulés de chaque compétence (il ne plafonne plus à 1 depuis que l’angle compte les points)', async () => {
    // 1.01 prouvée trois jours de suite : 1, puis 2, puis 3 points cumulés.
    const st = createCartoStore({ adapter: createMemoryAdapter() })
    await st.commit({
      dataset: indexDataset([
        { date: '2025-12-01', verdicts: [{ code: '1.01', confidence: 0.8, roles: ['preuve'] }, { code: '2.01', confidence: 0.6, roles: ['indice'] }] },
        { date: '2025-12-03', verdicts: [{ code: '1.01', confidence: 0.7, roles: ['preuve'] }] },
        { date: '2025-12-05', verdicts: [{ code: '1.01', confidence: 0.9, roles: ['preuve'] }, { code: '2.01', confidence: 0.5, roles: ['indice'] }] },
      ]),
    })
    showDashboardCards(['constancy'])
    const page = await openDashboard(st)
    const card = await within(page).findByRole('region', { name: 'Constance' })
    const lines = [...card.querySelectorAll('svg.carto-spark polyline')]
    expect(lines.length).toBeGreaterThan(0)
    for (const line of lines) {
      const ys = line.getAttribute('points').split(' ').map((p) => Number(p.split(',')[1]))
      expect(Math.min(...ys)).toBeCloseTo(3) // le dernier point (le cumul le plus haut) touche le haut
      // Chaque observation ajoute des points : le trait monte à chaque pas (plus haut = y plus petit).
      for (let i = 1; i < ys.length; i++) expect(ys[i]).toBeLessThan(ys[i - 1])
    }
    // Le trait prend la couleur de son pôle, dans le thème affiché (D-63).
    expect(lines[0].closest('td').classList.contains('carto-pole')).toBe(true)
  })

  it('sans portfolio : le rythme se masque, les anomalies apparaissent', async () => {
    showDashboardCards()
    const page = await openDashboard(await store({ portfolio: null }))
    await waitFor(() => expect(cardNames(page)).toContain('Ruptures et anomalies d’import'))
    expect(cardNames(page)).not.toContain('Rythme')
    expect(cardNames(page)).not.toContain('Style (local)')
    expect(within(page).getByText(/Aucun portfolio importé : le surlignage des traces/)).toBeTruthy()
  })

  it('portfolio long + miroir HumanoTwin : style, rupture lexicale et fonctions cognitives apparaissent', async () => {
    showDashboardCards()
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
  it('la croix masque une carte et donne le focus à « Panneaux » ; sa case la réaffiche, à la suite', async () => {
    const page = await openDashboard(await store())
    await waitFor(() => expect(cardNames(page)).toEqual(['Profil', 'Rythme']))
    fireEvent.click(screen.getByRole('button', { name: 'Masquer le panneau Profil' }))
    await waitFor(() => expect(cardNames(page)).toEqual(['Rythme']))
    await waitFor(() => expect(document.activeElement).toBe(menu().querySelector('summary')))
    expect(panel('Profil').checked).toBe(false)
    fireEvent.click(panel('Profil'))
    await waitFor(() => expect(cardNames(page)).toEqual(['Rythme', 'Profil']))
    fireEvent.click(panel('Constance'))
    await waitFor(() => expect(cardNames(page)).toEqual(['Rythme', 'Profil', 'Constance']))
    // Tout masquer : la page le dit.
    for (const name of ['Rythme', 'Profil', 'Constance']) fireEvent.click(panel(name))
    expect(await within(page).findByText(/Aucun panneau affiché : choisissez-en dans « Panneaux »/)).toBeTruthy()
  })

  it('moments remarquables : la sensibilité règle la liste ; un moment s’ouvre dans le portfolio', async () => {
    showDashboardCards(['moments'])
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
    showDashboardCards(['rhythm', 'phases'])
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

describe('disposition gardée dans ce navigateur (D-61)', () => {
  it('cartes affichées, ordre et tailles survivent à un rechargement ; rien n’en est écrit dans le jeu de données', async () => {
    const st = await store()
    const page = await openDashboard(st)
    await waitFor(() => expect(cardNames(page)).toEqual(['Profil', 'Rythme']))
    fireEvent.click(panel('Constance'))
    await waitFor(() => expect(cardNames(page)).toEqual(['Profil', 'Rythme', 'Constance']))
    fireEvent.click(screen.getByRole('button', { name: 'Reculer Profil' }))
    await waitFor(() => expect(cardNames(page)).toEqual(['Rythme', 'Profil', 'Constance']))
    fireEvent.change(screen.getByRole('combobox', { name: 'Taille de Constance' }), { target: { value: '2x2' } })
    await waitFor(() => expect(stored().sizes.constancy).toEqual({ w: 2, h: 2 }))
    expect(stored()).toMatchObject({ v: 1, shown: ['profile', 'rhythm', 'constancy'] })
    const prefs = (await st.loadDataset('ds-lou')).preferences
    expect('dashboardHidden' in prefs || 'dashboardLayout' in prefs).toBe(false)
    cleanup()
    const again = await openDashboard(st)
    await waitFor(() => expect(cardNames(again)).toEqual(['Rythme', 'Profil', 'Constance']))
    expect(again.querySelector('[data-tile-id="constancy"]').style.gridColumn).toBe('span 2')
  })
})

describe('« Réinitialiser l’affichage » du tableau de bord (D-61)', () => {
  it('en deux temps, revient au profil et au rythme ; les cartes repartent de zéro', async () => {
    showDashboardCards()
    const page = await openDashboard(await store())
    await waitFor(() => expect(cardNames(page)).toContain('Constance'))
    const profil = within(page).getByRole('region', { name: 'Profil' })
    fireEvent.click(within(profil).getByRole('button', { name: 'Afficher le tableau' }))
    expect(within(profil).getByRole('table')).toBeTruthy()
    fireEvent.click(within(head()).getByRole('button', { name: 'Réinitialiser l’affichage' }))
    expect(cardNames(page)).toContain('Constance') // pas encore : il faut confirmer
    fireEvent.click(within(head()).getByRole('button', { name: 'Revenir à la vue de départ' }))
    await waitFor(() => expect(cardNames(page)).toEqual(['Profil', 'Rythme']))
    expect(stored().shown).toEqual(['profile', 'rhythm'])
    expect(within(within(page).getByRole('region', { name: 'Profil' })).queryByRole('table')).toBeNull()
  })
})
