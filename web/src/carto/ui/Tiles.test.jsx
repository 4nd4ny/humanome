// Interface ultime — l'espace Cartographie en tuiles et son en-tête allégé
// (journal carto D-52, D-53) : vue de départ minimale (le soleil et, dessous,
// le détail), menu « Panneaux », tuiles masquables, déplaçables,
// redimensionnables, disposition gardée dans ce navigateur, « Réinitialiser
// l'affichage » ; plus de « mode expert » ni de boutons qui doublent les espaces.
import { useEffect, useState } from 'react'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import CartoApp from './CartoApp.jsx'
import { createCartoStore, createMemoryAdapter } from '../core/store.js'
import { importFiles } from '../core/import.js'
import { createDataset } from '../core/model.js'
import { parseHash, subscribe } from '../../router.js'
import { LOU_PORTFOLIO, kairosDoc, louDays, miniReferential } from '../test/fixtures.js'
import { TILES_KEY } from './tiles.js'
import { browserFile } from '../../../test/usecases/support/vis.js'

const NOW = '2026-10-13T12:00:00.000Z'

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

const tileIds = () => [...document.querySelectorAll('.carto-tiles [data-tile]')].map((el) => el.getAttribute('data-tile'))
const tile = (id) => document.querySelector(`.carto-tiles [data-tile="${id}"]`)
const head = () => document.querySelector('.carto-context')
const menu = () => document.querySelector('.carto-panels-menu')
const panel = (name) => within(menu()).getByRole('checkbox', { name })
const stored = () => JSON.parse(localStorage.getItem(TILES_KEY))

beforeEach(() => {
  window.location.hash = '#/cartographie'
  try {
    localStorage.clear()
  } catch {
    /* rien */
  }
})
afterEach(cleanup)

describe('vue de départ (D-53)', () => {
  it('le soleil et, dessous, le détail, en pleine largeur ; rien d’autre', async () => {
    render(<Harness store={await louStore()} />)
    await waitFor(() => expect(tileIds()).toEqual(['sun', 'detail']))
    // Toute la largeur : autant de colonnes que la grille en compte.
    const columns = Number(/\((\d+) colonnes?\)/.exec(document.querySelector('.v3-tile-grid').getAttribute('aria-label'))[1])
    expect(columns).toBeGreaterThan(1)
    for (const id of ['sun', 'detail']) expect(tile(id).closest('.v3-tile').style.gridColumn).toBe(`span ${columns}`)
    expect(screen.queryByRole('navigation', { name: 'Compétences observées' })).toBeNull()
    expect(screen.queryByRole('toolbar', { name: 'Tête de lecture' })).toBeNull()
    expect(within(menu()).getByText('2/12')).toBeTruthy()
  })

  it('en-tête allégé (D-52) : ni période, ni compteur, ni « Comparer A / B », « Exporter » ou « mode expert » ; « Panneaux » et « Réinitialiser l’affichage »', async () => {
    render(<Harness store={await louStore()} />)
    await waitFor(() => expect(tileIds()).toEqual(['sun', 'detail']))
    expect(head().textContent).not.toMatch(/Période|Ensemble actif|cochées|Comparer A \/ B|Exporter|mode expert|Date t/)
    expect(within(head()).getByRole('button', { name: 'Réinitialiser l’affichage' })).toBeTruthy()
    expect(screen.queryByRole('checkbox', { name: /mode expert/ })).toBeNull()
    expect(screen.queryAllByRole('slider')).toHaveLength(0) // réglages de l'encodage : une tuile masquée
    // La légende de l'encodage a sa tuile : le résumé du détail ne la répète plus.
    expect(within(tile('detail')).queryByText('Hachures')).toBeNull()
  })
})

describe('menu « Panneaux »', () => {
  it('affiche et masque les tuiles ; la tuile affichée se place à la suite ; la croix la masque', async () => {
    render(<Harness store={await louStore()} />)
    await waitFor(() => expect(tileIds()).toEqual(['sun', 'detail']))
    fireEvent.click(panel('Journées'))
    await waitFor(() => expect(tileIds()).toEqual(['sun', 'detail', 'days']))
    // La période et le compteur de journées cochées sont dans la tuile Journées.
    expect(within(tile('days')).getByText(/3 journées · 3 cochées/)).toBeTruthy()
    expect(within(tile('days')).getByText('Période : lun. 22 déc. 2025 → mer. 24 déc. 2025')).toBeTruthy()
    fireEvent.click(panel('Compétences'))
    await waitFor(() => expect(tileIds()).toEqual(['sun', 'detail', 'days', 'competencies']))
    expect(within(menu()).getByText('4/12')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Masquer le panneau Journées' }))
    await waitFor(() => expect(tileIds()).toEqual(['sun', 'detail', 'competencies']))
    expect(panel('Journées').checked).toBe(false)
    // Tout masquer : la page le dit.
    for (const name of ['Soleil', 'Détail', 'Compétences']) fireEvent.click(panel(name))
    expect(await screen.findByText(/Aucun panneau affiché/)).toBeTruthy()
  })

  it('les réglages de l’encodage (α, anneau des pôles, épaisseur minimale) et la légende, avec les distinctions renforcées, sont des tuiles', async () => {
    const store = await louStore()
    render(<Harness store={store} />)
    await waitFor(() => expect(tileIds()).toEqual(['sun', 'detail']))
    fireEvent.click(panel('Réglages de l’encodage'))
    await waitFor(() => expect(tile('settings')).toBeTruthy())
    const sliders = within(tile('settings')).getAllByRole('slider')
    // Dans l'ordre demandé (D-58) : α, puis l'anneau des pôles, puis l'épaisseur minimale.
    expect(sliders.map((el) => el.closest('label').textContent.split(':')[0].trim())).toEqual([
      'Poids d’un indice α',
      'Épaisseur de l’anneau des pôles',
      'Épaisseur minimale d’un secteur',
    ])
    expect(within(tile('settings')).queryByRole('button', { name: 'Valeurs par défaut' })).toBeNull()
    fireEvent.change(sliders[0], { target: { value: '0.75' } })
    await waitFor(async () => expect((await store.loadDataset('ds-lou')).preferences.params.alpha).toBe(0.75))
    // L'anneau des pôles : 30 par défaut ; à 0, il disparaît du soleil (plus d'arc de pôle à atteindre).
    expect(sliders[1].value).toBe('30')
    fireEvent.change(sliders[1], { target: { value: '0' } })
    await waitFor(() => expect(document.querySelectorAll('[data-tile="sun"] .carto-sun [role="button"][aria-label^="Pôle "]')).toHaveLength(0))
    expect(within(tile('settings')).getByText('0 px (masqué)')).toBeTruthy()
    // Un réglage écarté du défaut : « Valeurs par défaut » ramène les trois.
    fireEvent.click(within(tile('settings')).getByRole('button', { name: 'Valeurs par défaut' }))
    await waitFor(async () => expect((await store.loadDataset('ds-lou')).preferences.params).toMatchObject({ alpha: 0.5, poleRingPx: 30, minThicknessPx: 2 }))
    await waitFor(() => expect(document.querySelectorAll('[data-tile="sun"] .carto-sun [role="button"][aria-label^="Pôle "]').length).toBeGreaterThan(0))
    fireEvent.click(panel('Légende'))
    await waitFor(() => expect(tile('legend')).toBeTruthy())
    expect(within(tile('legend')).getByText('Hachures')).toBeTruthy()
    fireEvent.click(within(tile('legend')).getByRole('checkbox', { name: /distinctions renforcées/ }))
    await waitFor(async () => expect((await store.loadDataset('ds-lou')).preferences.reinforced).toBe(true))
  })
})

describe('la disposition est gardée dans ce navigateur', () => {
  it('tuiles affichées, ordre et tailles survivent à un rechargement', async () => {
    const store = await louStore()
    const first = render(<Harness store={store} />)
    await waitFor(() => expect(tileIds()).toEqual(['sun', 'detail']))
    fireEvent.click(panel('Compétences'))
    await waitFor(() => expect(tileIds()).toEqual(['sun', 'detail', 'competencies']))
    fireEvent.click(screen.getByRole('button', { name: 'Reculer Soleil' }))
    await waitFor(() => expect(tileIds()).toEqual(['detail', 'sun', 'competencies']))
    // Au clavier, le focus reste sur le bouton de la tuile déplacée.
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Reculer Soleil' })))
    fireEvent.change(screen.getByRole('combobox', { name: 'Taille de Compétences' }), { target: { value: '2x2' } })
    await waitFor(() => expect(stored().sizes.competencies).toEqual({ w: 2, h: 2 }))
    expect(stored()).toMatchObject({ v: 1, shown: ['sun', 'detail', 'competencies'] })
    first.unmount()
    render(<Harness store={store} />)
    await waitFor(() => expect(tileIds()).toEqual(['detail', 'sun', 'competencies']))
    expect(tile('competencies').closest('.v3-tile').style.gridColumn).toBe('span 2')
  })
})

describe('« Réinitialiser l’affichage » (D-52)', () => {
  it('en deux temps, revient à la vue de départ : tuiles, sélection, date t', async () => {
    render(<Harness store={await louStore()} />)
    await waitFor(() => expect(tileIds()).toEqual(['sun', 'detail']))
    fireEvent.click(panel('Journées'))
    await waitFor(() => expect(tile('days')).toBeTruthy())
    // Une date t (depuis la liste des journées) : elle s'affiche dans l'en-tête.
    fireEvent.click(within(tile('days')).getByRole('button', { name: 'lun. 22 déc. 2025' }))
    await waitFor(() => expect(head().textContent).toMatch(/Date t.*lun\. 22 déc\. 2025/))
    // Une sélection dans le soleil.
    fireEvent.click(document.querySelector('[data-tile="sun"] .carto-sun [role="button"][aria-label^="1.01"]'))
    await waitFor(() => expect(within(tile('detail')).getByRole('article', { name: /^Détail : 1\.01/ })).toBeTruthy())
    fireEvent.click(within(head()).getByRole('button', { name: 'Réinitialiser l’affichage' }))
    expect(tileIds()).toEqual(['sun', 'detail', 'days']) // pas encore : il faut confirmer
    fireEvent.click(within(head()).getByRole('button', { name: 'Revenir à la vue de départ' }))
    await waitFor(() => expect(tileIds()).toEqual(['sun', 'detail']))
    expect(head().textContent).not.toMatch(/Date t/)
    expect(within(tile('detail')).getByRole('article', { name: 'Résumé du profil' })).toBeTruthy()
    expect(stored().shown).toEqual(['sun', 'detail'])
  })
})

describe('la date t dans l’en-tête', () => {
  it('seulement quand elle est fixée ; « revenir à l’état complet » la retire', async () => {
    render(<Harness store={await louStore()} />)
    await waitFor(() => expect(tileIds()).toEqual(['sun', 'detail']))
    expect(head().textContent).not.toMatch(/Date t/)
    fireEvent.click(panel('Journées'))
    await waitFor(() => expect(tile('days')).toBeTruthy())
    fireEvent.click(within(tile('days')).getByRole('button', { name: 'mar. 23 déc. 2025' }))
    await waitFor(() => expect(head().textContent).toMatch(/Date t/))
    expect(document.querySelector('[data-tile="sun"] .carto-sun-caption').textContent).toMatch(/jusqu’au mar\. 23 déc\. 2025/)
    fireEvent.click(within(head()).getByRole('button', { name: 'revenir à l’état complet' }))
    await waitFor(() => expect(head().textContent).not.toMatch(/Date t/))
  })
})

describe('après la relecture indépendante', () => {
  it('l’équivalent textuel du soleil reste dans la page, une seule fois, que sa tuile soit affichée ou non', async () => {
    render(<Harness store={await louStore()} />)
    await waitFor(() => expect(tileIds()).toEqual(['sun', 'detail']))
    const captionText = /Part du soleil, confiance moyenne du jury et journées observées/
    // Tuile masquée : le tableau est dans la tuile du soleil, hors de la vue (lecteurs d'écran, impression).
    expect(tile('sun').querySelector('.carto-sr-table table')).toBeTruthy()
    expect(screen.getAllByText(captionText)).toHaveLength(1)
    fireEvent.click(panel('Tableau équivalent'))
    await waitFor(() => expect(tile('table')).toBeTruthy())
    expect(tile('sun').querySelector('.carto-sr-table')).toBeNull()
    expect(screen.getAllByText(captionText)).toHaveLength(1)
  })

  it('« revenir à l’état complet » retire aussi les contours du jour choisi dans le soleil', async () => {
    render(<Harness store={await louStore()} />)
    await waitFor(() => expect(tileIds()).toEqual(['sun', 'detail']))
    fireEvent.click(panel('Journées'))
    await waitFor(() => expect(tile('days')).toBeTruthy())
    fireEvent.click(within(tile('days')).getByRole('button', { name: 'mar. 23 déc. 2025' }))
    await waitFor(() => expect(tile('sun').querySelectorAll('.carto-sun-sector.is-lit').length).toBeGreaterThan(0))
    fireEvent.click(within(head()).getByRole('button', { name: 'revenir à l’état complet' }))
    await waitFor(() => expect(tile('sun').querySelectorAll('.carto-sun-sector.is-lit')).toHaveLength(0))
  })

  it('le focus ne se perd pas : masquer une tuile le donne à « Panneaux » ; « Réinitialiser » à « Annuler », puis au bouton', async () => {
    render(<Harness store={await louStore()} />)
    await waitFor(() => expect(tileIds()).toEqual(['sun', 'detail']))
    fireEvent.click(screen.getByRole('button', { name: 'Masquer le panneau Détail' }))
    await waitFor(() => expect(document.activeElement).toBe(menu().querySelector('summary')))
    fireEvent.click(within(head()).getByRole('button', { name: 'Réinitialiser l’affichage' }))
    await waitFor(() => expect(document.activeElement).toBe(within(head()).getByRole('button', { name: 'Annuler' })))
    fireEvent.click(within(head()).getByRole('button', { name: 'Annuler' }))
    await waitFor(() => expect(document.activeElement).toBe(within(head()).getByRole('button', { name: 'Réinitialiser l’affichage' })))
  })

  it('un rapport d’import fermé dans le Gestionnaire ne revient pas en bandeau dans la cartographie', async () => {
    window.location.hash = '#/cartographie/gestionnaire'
    render(<Harness store={await louStore()} />)
    const manager = await screen.findByRole('region', { name: 'Gestionnaire des journées' })
    const input = manager.querySelector('input[type="file"][accept]')
    fireEvent.change(input, { target: { files: [browserFile(JSON.stringify({ kind: 'autre' }), 'autre.json')] } })
    const report = await within(manager).findByRole('region', { name: 'Rapport du dernier import' })
    fireEvent.click(within(report).getByRole('button', { name: 'Fermer' }))
    await waitFor(() => expect(within(manager).queryByRole('region', { name: 'Rapport du dernier import' })).toBeNull())
    window.location.hash = '#/cartographie'
    window.dispatchEvent(new HashChangeEvent('hashchange'))
    await waitFor(() => expect(tileIds()).toEqual(['sun', 'detail']))
    expect(document.querySelector('.carto-report-banner')).toBeNull()
    expect(screen.queryByText(/format JSON non reconnu/)).toBeNull()
  })
})
