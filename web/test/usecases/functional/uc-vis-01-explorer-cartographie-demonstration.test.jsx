// UC-VIS-01 — Explorer la cartographie de démonstration : tests FONCTIONNELS (IHM).
// Fiche : docs/cas-utilisation/visiteur/UC-VIS-01-explorer-cartographie-demonstration.md
//
// Mise à jour du 2026-10-14 : l'interface V3 (#/cartographie-v3, #/merge) est
// retirée ; la démonstration et les fichiers ouverts depuis l'accueil passent
// par l'interface de cartographie (#/cartographie). Les scénarios de la V3
// (F02–F04, F06–F08, F18, F19) sont retirés avec elle ; ceux de la vue
// journée historique (#/jour/<iso>) restent.
//
// Chaque scénario est joué sur l'application ENTIÈRE (<App/>), dans un
// navigateur de visiteur (aucune session). Seul le réseau est simulé : les
// fichiers STATIQUES de la démonstration (index du référentiel absent → repli
// embarqué, sauf F18 ; corpus data/demo/jours/ servi par trois journées de
// fixtures). Le module sunburst des vues historiques est le faux module de
// test. Les journées voisines de la vue journée viennent du merge de
// démonstration EMBARQUÉ (getDemoMerge, données générées) : elles sont
// calculées depuis ce document, jamais codées en dur.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import App from '../../../src/App.jsx'
import { resetApiClient } from '../../../src/api/client.js'
import { clearDayCache, frenchDate, getDemoMerge } from '../../../src/data/load.js'
import { clearReferentielCache } from '../../../src/data/referentiel.js'
import * as fakeLib from '../../../src/test/fake-sunburst-lib.js'
import * as realLib from '../../../src/lib/sunburst/index.js'
import mergeFixture from '../../../../schemas/fixtures/cartographie-merge-3-jours.json'
import referentielDoc from '../../../../schemas/fixtures/referentiel-respire-v7.json'
import { FIXTURE_DAYS, FIXTURE_FACTS, browserFile, calledUrls, demoNetwork, jsonResponse } from '../support/vis.js'

function openApp(hash) {
  window.location.hash = hash
  return render(<App lib={fakeLib} fetchMeFn={async () => ({ user: null })} />)
}

/** Journées voisines d'une date dans la navigation de la vue journée (feuilles du merge de démo ∪ journées locales). */
function demoNeighbours(date, extra = []) {
  const days = [...new Set([...getDemoMerge().feuilles.map((f) => f.iso ?? f.date), ...extra])].sort()
  const i = days.indexOf(date)
  return { previous: i > 0 ? days[i - 1] : null, next: i !== -1 && i < days.length - 1 ? days[i + 1] : null }
}

const sectorCode = (path) => path.getAttribute('aria-label').split(' ')[0]

function goTo(hash) {
  act(() => {
    window.location.hash = hash
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  })
}

const cartoSectors = () => document.querySelectorAll('.carto-col-center .carto-sun [role="button"]')

beforeEach(() => {
  resetApiClient()
  clearDayCache()
  clearReferentielCache()
  try {
    localStorage.clear()
  } catch {
    /* stockage indisponible */
  }
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  window.location.hash = ''
})

describe('UC-VIS-01 — la démonstration s’ouvre dans l’interface de cartographie', () => {
  it('UC-VIS-01-F01 — nominal : « Explorer la cartographie de démonstration » → interface de cartographie → « Explorer la démonstration » charge le corpus localement', async () => {
    const network = demoNetwork()
    openApp('#/')
    expect(screen.getByRole('link', { name: 'Explorer la cartographie de démonstration' }).getAttribute('href')).toBe('#/cartographie')
    goTo('#/cartographie')
    fireEvent.click(await screen.findByRole('button', { name: 'Explorer la démonstration' }))
    await waitFor(() => expect(cartoSectors().length).toBeGreaterThan(0))
    // Les journées publiques de la démonstration, lues comme des fichiers statiques.
    expect(calledUrls(network)).toContain('data/demo/jours/index.json')
    for (const date of Object.keys(FIXTURE_DAYS)) expect(calledUrls(network)).toContain(`data/demo/jours/${date}.json`)
    expect(network.mock.calls.every(([, init]) => !init?.body)).toBe(true)
  })

  it('UC-VIS-01-F05 — A1 : les anciennes adresses de l’interface V3 (#/merge, #/cartographie-v3) renvoient vers #/cartographie', async () => {
    demoNetwork()
    openApp('#/merge')
    await waitFor(() => expect(window.location.hash).toBe('#/cartographie'))
    expect(document.querySelector('.carto-app')).not.toBeNull()
    expect(document.querySelector('.v3-root')).toBeNull()
    goTo('#/cartographie-v3')
    await waitFor(() => expect(window.location.hash).toBe('#/cartographie'))
    expect(document.querySelector('.v3-root')).toBeNull()
  })
})

describe('UC-VIS-01 — la vue journée (#/jour/<iso>)', () => {
  it('UC-VIS-01-F09 — A3 : lien direct vers une journée → badge, navigation précédent/suivant, retour à la cartographie, exclus', async () => {
    const network = demoNetwork()
    openApp('#/jour/2026-01-06')

    expect(await screen.findByText('Journée du 06/01/2026')).toBeDefined()
    expect(calledUrls(network)).toContain('data/demo/jours/2026-01-06.json')
    const dayNav = within(screen.getByRole('navigation', { name: 'Navigation entre les journées' }))
    expect(dayNav.getByRole('link', { name: '← Retour à la cartographie' }).getAttribute('href')).toBe('#/cartographie')
    // Journées voisines : feuilles du merge de démonstration EMBARQUÉ.
    const { previous, next } = demoNeighbours('2026-01-06')
    if (previous) expect(dayNav.getByRole('link', { name: `← ${frenchDate(previous)}` }).getAttribute('href')).toBe(`#/jour/${previous}`)
    if (next) expect(dayNav.getByRole('link', { name: `${frenchDate(next)} →` }).getAttribute('href')).toBe(`#/jour/${next}`)
    await screen.findByRole('group', { name: 'Cartographie de la journée du 06/01/2026' })
    expect(screen.getByTestId('exclus').textContent).toContain('Hors diagramme ce jour')

    // Sélection d'une compétence : verdict, examen du pédagogue, traces
    // retenues, et onglet « Détails » sur mobile.
    fireEvent.click(screen.getByRole('button', { name: '2.01' }))
    expect(screen.getByRole('heading', { name: '2.01 — Intelligence Émotionnelle & Sollicitude Active' })).toBeDefined()
    expect(screen.getByTestId('verdict-block').textContent).toContain('présence établie')
    expect(screen.getByTestId('pedagogue')).toBeDefined()
    expect(screen.getByTestId('traces')).toBeDefined()
    expect(screen.getByRole('button', { name: 'Détails' }).getAttribute('aria-pressed')).toBe('true')
    expect(document.querySelector('.view-layout').getAttribute('data-tab')).toBe('details')
    fireEvent.click(screen.getByRole('button', { name: 'Diagramme' }))
    expect(document.querySelector('.view-layout').getAttribute('data-tab')).toBe('diagramme')
  })

  it('UC-VIS-01-F10 — A4 : #/jour/<iso>?focus=<code> ouvre la journée avec la compétence déjà sélectionnée', async () => {
    demoNetwork()
    openApp('#/jour/2026-01-07?focus=5.03')

    expect(await screen.findByRole('heading', { name: '5.03 — Narration Réflexive' })).toBeDefined()
    expect(screen.getByTestId('verdict-block')).toBeDefined()
    expect(document.querySelector('.view-layout').getAttribute('data-tab')).toBe('details')
  })

  it('UC-VIS-01-F11 — A6 : « Imprimer » depuis la vue journée', async () => {
    demoNetwork()
    const print = vi.spyOn(window, 'print').mockImplementation(() => {})
    openApp('#/jour/2026-01-06')
    await screen.findByText('Journée du 06/01/2026')
    fireEvent.click(screen.getByRole('button', { name: 'Imprimer' }))
    expect(print).toHaveBeenCalledTimes(1)
  })

  it('UC-VIS-01-F12 — E2 : date impossible → page introuvable, retour à l’accueil', () => {
    demoNetwork()
    openApp('#/jour/2026-02-30')
    expect(screen.getByRole('alert').textContent).toContain('Page introuvable')
    expect(screen.getByRole('link', { name: 'Retour à l’accueil' }).getAttribute('href')).toBe('#/')
  })

  it('UC-VIS-01-F13 — E3 : journée absente du corpus → message explicite, pas de diagramme', async () => {
    demoNetwork()
    openApp('#/jour/2026-01-08')
    expect((await screen.findByRole('alert')).textContent).toBe('Aucune cartographie de journée pour le 08/01/2026.')
    expect(document.querySelector('.view-layout')).toBeNull()
  })
})

describe('UC-VIS-01 — anomalie constatée (comportement actuel figé)', () => {
  // ANOMALIE AN1 de la fiche — ce test FIGE le comportement ACTUEL, pas le
  // comportement attendu : avec la VRAIE bibliothèque sunburst et une journée
  // conforme au schéma (poleNum en chaîne), cliquer un pôle ne montre pas son
  // rapport (findDayNode compare poleNum à un nombre). À inverser après correction.
  it('UC-VIS-01-F17 — [comportement actuel, anomalie AN1] vue journée : la sélection d’un pôle n’affiche pas son rapport', async () => {
    demoNetwork()
    window.location.hash = '#/jour/2026-01-06'
    render(<App lib={realLib} fetchMeFn={async () => ({ user: null })} />)
    await screen.findByRole('group', { name: 'Cartographie de la journée du 06/01/2026' })

    fireEvent.click(screen.getByRole('button', { name: 'COEUR — Relier & Naviguer' }))
    // Attendu : titre du pôle, rapport et passages saillants. Constaté : le
    // panneau reste sur l'invitation à toucher un secteur.
    expect(screen.queryByRole('heading', { name: 'COEUR — Relier & Naviguer' })).toBeNull()
    expect(screen.queryByTestId('passages')).toBeNull()
    expect(screen.getByText(/Touchez un secteur du diagramme/)).toBeDefined()
    // Les compétences, elles, se résolvent normalement.
    fireEvent.click(screen.getByRole('button', { name: '2.01 — Intelligence Émotionnelle & Sollicitude Active' }))
    expect(screen.getByTestId('verdict-block')).toBeDefined()
  })
})

describe('UC-VIS-01 — fichiers ouverts depuis l’accueil (interface de cartographie)', () => {
  function loadFromHome(content, name) {
    fireEvent.change(screen.getByLabelText('Ouvrir mes fichiers de cartographie'), {
      target: { files: [browserFile(content, name)] },
    })
  }

  it('UC-VIS-01-F14 — A7 : document cartographie-merge → importé dans la cartographie (nouveau jeu), sans rien envoyer', async () => {
    const network = demoNetwork()
    openApp('#/')
    loadFromHome(JSON.stringify(mergeFixture), 'ma-cartographie.json')
    await waitFor(() => expect(window.location.hash).toBe('#/cartographie'))
    await waitFor(() => expect(cartoSectors().length).toBeGreaterThan(0))
    expect(network.mock.calls.every(([, init]) => !init?.body)).toBe(true)
  })

  it('UC-VIS-01-F15 — A7 : document cartographie-jour → importé dans la cartographie, sans téléchargement de la journée', async () => {
    const network = demoNetwork()
    openApp('#/')
    loadFromHome(JSON.stringify(FIXTURE_DAYS['2026-01-05']), 'journee.json')
    await waitFor(() => expect(window.location.hash).toBe('#/cartographie'))
    await waitFor(() => expect(cartoSectors().length).toBeGreaterThan(0))
    expect(calledUrls(network)).not.toContain('data/demo/jours/2026-01-05.json')
  })

  it('UC-VIS-01-F20 — A7 : un document glissé-déposé sur la zone de dépôt est lu localement, comme via le bouton', async () => {
    const network = demoNetwork()
    openApp('#/')
    fireEvent.drop(screen.getByTestId('dropzone'), {
      dataTransfer: { files: [browserFile(JSON.stringify(FIXTURE_DAYS['2026-01-07']), 'depose.json')] },
    })
    await waitFor(() => expect(window.location.hash).toBe('#/cartographie'))
    await waitFor(() => expect(cartoSectors().length).toBeGreaterThan(0))
    expect(calledUrls(network)).not.toContain('data/demo/jours/2026-01-07.json')
  })

  it('UC-VIS-01-F16 — E4 : fichier non reconnu → le rapport d’import de la cartographie le dit, rien n’est envoyé', async () => {
    const network = demoNetwork()
    openApp('#/')
    loadFromHome(JSON.stringify({ kind: 'autre' }), 'autre.json')
    await waitFor(() => expect(window.location.hash).toBe('#/cartographie'))
    fireEvent.click(await screen.findByRole('button', { name: 'Voir le rapport du dernier import' }))
    expect(await screen.findByText(/autre\.json : format JSON non reconnu — ignoré/)).toBeDefined()
    expect(network.mock.calls.every(([, init]) => !init?.body)).toBe(true)
  })
})
