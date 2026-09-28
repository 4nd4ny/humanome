// UC-VIS-01 — Explorer la cartographie de démonstration : tests FONCTIONNELS (IHM).
// Fiche : docs/cas-utilisation/visiteur/UC-VIS-01-explorer-cartographie-demonstration.md
//
// Chaque scénario est joué sur l'application ENTIÈRE (<App/>), dans un
// navigateur de visiteur (aucune session). Seul le réseau est simulé : les
// fichiers STATIQUES de la démonstration (index du référentiel absent → repli
// embarqué ; corpus data/demo/jours/ servi par trois journées de fixtures).
// Le module sunburst des vues historiques est le faux module de test.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import App from '../../../src/App.jsx'
import { resetApiClient } from '../../../src/api/client.js'
import { clearDayCache } from '../../../src/data/load.js'
import { clearReferentielCache } from '../../../src/data/referentiel.js'
import * as fakeLib from '../../../src/test/fake-sunburst-lib.js'
import * as realLib from '../../../src/lib/sunburst/index.js'
import mergeFixture from '../../../../schemas/fixtures/cartographie-merge-3-jours.json'
import { FIXTURE_DAYS, FIXTURE_FACTS, browserFile, calledUrls, demoNetwork } from '../support/vis.js'

function openApp(hash) {
  window.location.hash = hash
  return render(<App lib={fakeLib} fetchMeFn={async () => ({ user: null })} />)
}

function goTo(hash) {
  act(() => {
    window.location.hash = hash
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  })
}

const contextBar = () => screen.getByRole('toolbar', { name: 'Barre de contexte' })
const competencySectors = () => document.querySelectorAll('.v3-sector:not(.v3-sector-family)')

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

describe('UC-VIS-01 — le visiteur explore la démonstration (interface V3)', () => {
  it('UC-VIS-01-F01 — nominal : menu « Cartographie (démonstration) » → corpus chargé localement, soleil, heatmap, indicateurs', async () => {
    const network = demoNetwork()
    openApp('#/')

    // 1. Depuis le menu « Découvrir ».
    const nav = within(screen.getByRole('navigation', { name: 'Navigation principale' }))
    const link = nav.getByRole('link', { name: 'Cartographie (démonstration)' })
    expect(link.getAttribute('href')).toBe('#/cartographie')
    goTo('#/cartographie')

    // 2-4. Chargement du référentiel puis du corpus, import en mémoire.
    expect(screen.getByRole('status').textContent).toMatch(/Chargement du (référentiel|corpus)/)
    await screen.findByRole('toolbar', { name: 'Barre de contexte' })
    expect(document.querySelector('main').className).toContain('app-main--full')

    // 5. Barre de contexte : aucun filtre, état complet, espace privé.
    expect(contextBar().textContent).toContain('Cartographie ipsative')
    expect(contextBar().textContent).toContain('Toutes les compétences')
    expect(contextBar().textContent).toContain('audience apprenant (privé)')
    expect(contextBar().textContent).toContain('état complet')

    // Soleil : SEULES les compétences documentées occupent un secteur.
    expect(screen.getByRole('img', { name: /Diagramme radial/ })).toBeDefined()
    expect(competencySectors()).toHaveLength(FIXTURE_FACTS.documentedCodes.length)
    // Indicateurs synthétiques.
    const stats = within(screen.getByRole('region', { name: 'Indicateurs synthétiques' }))
    expect(stats.getByText('Compétences documentées').nextSibling.textContent).toBe('10')
    expect(stats.getByText('Journées documentées').nextSibling.textContent).toBe('3')
    expect(stats.getByText('Observations admissibles').nextSibling.textContent).toBe(String(FIXTURE_FACTS.admissible))
    expect(stats.getByText('En attente de révision').nextSibling.textContent).toBe(String(FIXTURE_FACTS.needsReview))
    // Heatmap : une case par journée de l'année, densité lisible au lecteur d'écran.
    expect(screen.getByRole('gridcell', { name: '2026-01-07 : 6 compétences documentées' })).toBeDefined()
    // Mode simplifié : ni éditeur JSON ni audit d'import.
    expect(screen.queryByLabelText('Éditeur JSON expert')).toBeNull()
    expect(screen.queryByLabelText('Rapport d’import')).toBeNull()
    // Tableau équivalent (accessibilité + impression).
    expect(document.querySelectorAll('.v3-sun-table tbody tr')).toHaveLength(10)

    // RGPD : uniquement des LECTURES de fichiers statiques relatifs, aucune API.
    const urls = calledUrls(network)
    expect(urls).toContain('data/demo/jours/index.json')
    expect(urls.every((u) => u.startsWith('data/'))).toBe(true)
    expect(network.mock.calls.every(([, init]) => !init || !init.method || init.method === 'GET')).toBe(true)
  })

  it('UC-VIS-01-F02 — nominal : filtrer par un secteur, « Pourquoi ce rayon ? » (touche w), retirer le filtre', async () => {
    demoNetwork()
    openApp('#/cartographie')
    await screen.findByRole('toolbar', { name: 'Barre de contexte' })

    const sector = screen.getByRole('button', { name: /^2\.01 Intelligence Émotionnelle/ })
    expect(sector.getAttribute('aria-label')).toContain('3 journées documentées')
    fireEvent.click(sector)
    expect(contextBar().textContent).toContain('Filtre : comp-2.01')

    fireEvent.keyDown(sector, { key: 'w' })
    const dialog = await screen.findByRole('dialog', { name: 'Pourquoi ce rayon ? 2.01' })
    expect(dialog.textContent).toContain('documented-days-v1')
    expect(dialog.textContent).toContain('3 journées documentées')
    for (const date of FIXTURE_FACTS.dates) expect(within(dialog).getByRole('button', { name: date })).toBeDefined()
    expect(dialog.textContent).toContain('jamais une force ni un niveau')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Fermer' }))
    expect(screen.queryByRole('dialog', { name: /Pourquoi ce rayon/ })).toBeNull()

    fireEvent.click(within(contextBar()).getByRole('button', { name: 'Toutes les compétences' }))
    expect(contextBar().textContent).toContain('Toutes les compétences ·')
    expect(contextBar().textContent).not.toContain('Filtre :')
  })

  it('UC-VIS-01-F03 — nominal : inspecter une journée (portfolio) ne déplace pas la tête de lecture ; « Voir l’état à cette date » la déplace', async () => {
    demoNetwork()
    openApp('#/cartographie')
    await screen.findByRole('toolbar', { name: 'Barre de contexte' })

    fireEvent.click(screen.getByRole('gridcell', { name: '2026-01-06 : 4 compétences documentées' }))
    // Le portfolio n'est pas affiché en simplifié : la barre propose de le rouvrir.
    fireEvent.click(within(contextBar()).getByRole('button', { name: 'Réouvrir le portfolio (2026-01-06)' }))
    const portfolio = await screen.findByRole('region', { name: 'Portfolio de la journée 2026-01-06' })
    expect(portfolio.querySelectorAll('article.v3-observation')).toHaveLength(4)
    expect(portfolio.querySelectorAll('blockquote.v3-passage').length).toBeGreaterThan(0)
    expect(portfolio.textContent).toContain('Provenance : démonstration')
    expect(contextBar().textContent).toContain('état complet') // tête de lecture intacte

    fireEvent.click(screen.getByRole('button', { name: 'Voir l’état à cette date' }))
    expect(contextBar().textContent).toContain('tête de lecture 2026-01-06')
    // Le soleil ne montre plus que ce qui est documenté jusqu'au 6 janvier ;
    // ce qui viendra ensuite est suggéré en « fantôme ».
    expect(competencySectors()).toHaveLength(7)
    expect(document.querySelectorAll('.v3-sector-future')).toHaveLength(3)
  })

  it('UC-VIS-01-F04 — A2 : lecteur temporel — début, pas à pas, lecture ×2 jusqu’à la dernière journée puis pause', async () => {
    demoNetwork()
    openApp('#/cartographie')
    await screen.findByRole('toolbar', { name: 'Barre de contexte' })
    const timeline = within(screen.getByRole('region', { name: 'Lecteur temporel' }))

    fireEvent.click(timeline.getByRole('button', { name: 'Aller au début' }))
    expect(contextBar().textContent).toContain('tête de lecture 2026-01-05')
    expect(competencySectors()).toHaveLength(4)
    fireEvent.click(timeline.getByRole('button', { name: 'Journée suivante' }))
    expect(timeline.getByRole('slider').getAttribute('aria-valuetext')).toBe('2026-01-06')
    fireEvent.click(timeline.getByRole('button', { name: 'Journée précédente' }))
    expect(contextBar().textContent).toContain('tête de lecture 2026-01-05')

    fireEvent.change(timeline.getByRole('combobox'), { target: { value: '2' } })
    fireEvent.click(timeline.getByRole('button', { name: 'Lecture' }))
    expect(timeline.getByRole('button', { name: 'Pause' })).toBeDefined()
    await waitFor(() => expect(contextBar().textContent).toContain('tête de lecture 2026-01-07'), { timeout: 3000 })
    // Arrivée au bout : la lecture s'arrête d'elle-même.
    await waitFor(() => expect(timeline.getByRole('button', { name: 'Lecture' })).toBeDefined(), { timeout: 3000 })
    expect(competencySectors()).toHaveLength(10)
  })

  it('UC-VIS-01-F05 — A1 : « Explorer la cartographie de démonstration » (#/merge sans document chargé) ouvre la même interface V3', async () => {
    demoNetwork()
    openApp('#/')
    expect(screen.getByRole('link', { name: 'Explorer la cartographie de démonstration' }).getAttribute('href')).toBe('#/merge')
    goTo('#/merge')
    await screen.findByRole('toolbar', { name: 'Barre de contexte' })
    expect(competencySectors()).toHaveLength(10)
    expect(screen.queryByText('Feuilles de portfolio')).toBeNull() // pas l'ancienne vue merge
  })

  it('UC-VIS-01-F06 — A5 : accessibilité — distinctions renforcées (motifs) et surface sombre, sans toucher aux données', async () => {
    demoNetwork()
    openApp('#/cartographie')
    await screen.findByRole('toolbar', { name: 'Barre de contexte' })
    const root = document.querySelector('.v3-root')

    fireEvent.click(screen.getByLabelText('Renforcer les distinctions (daltonisme)'))
    expect(root.getAttribute('data-vision')).toBe('reinforced')
    expect(document.querySelector('.v3-sector.v3-pattern-diagonal')).not.toBeNull()
    fireEvent.change(screen.getByLabelText(/Surface/), { target: { value: 'dark' } })
    expect(root.getAttribute('data-surface')).toBe('dark')
    expect(competencySectors()).toHaveLength(10)
  })

  it('UC-VIS-01-F07 — A6 : impression — « Aperçu avant impression » appelle l’impression, les <details> sont ouverts le temps d’imprimer', async () => {
    demoNetwork()
    const print = vi.spyOn(window, 'print').mockImplementation(() => {})
    openApp('#/cartographie')
    await screen.findByRole('toolbar', { name: 'Barre de contexte' })

    fireEvent.click(screen.getByRole('button', { name: 'Aperçu avant impression' }))
    expect(print).toHaveBeenCalledTimes(1)

    const panelsMenu = document.querySelector('.v3-panels-menu')
    expect(panelsMenu.open).toBe(false)
    act(() => window.dispatchEvent(new Event('beforeprint')))
    expect(panelsMenu.open).toBe(true)
    act(() => window.dispatchEvent(new Event('afterprint')))
    expect(panelsMenu.open).toBe(false)
  })

  it('UC-VIS-01-F08 — E1 : corpus injoignable → message « Chargement impossible », rien d’autre', async () => {
    demoNetwork({ failIndex: true })
    openApp('#/cartographie')
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('Chargement impossible : Failed to fetch'))
    expect(screen.queryByRole('toolbar', { name: 'Barre de contexte' })).toBeNull()
  })
})

describe('UC-VIS-01 — la vue journée (#/jour/<iso>)', () => {
  it('UC-VIS-01-F09 — A3 : lien direct vers une journée → badge, navigation précédent/suivant, retour à la cartographie, exclus', async () => {
    const network = demoNetwork()
    openApp('#/jour/2026-01-06')

    expect(await screen.findByText('Journée du 06/01/2026')).toBeDefined()
    expect(calledUrls(network)).toContain('data/demo/jours/2026-01-06.json')
    const dayNav = within(screen.getByRole('navigation', { name: 'Navigation entre les journées' }))
    expect(dayNav.getByRole('link', { name: '← Retour à la cartographie' }).getAttribute('href')).toBe('#/merge')
    // Journées voisines du corpus de démonstration (feuilles du merge de démo).
    expect(dayNav.getByRole('link', { name: '← 04/01/2026' }).getAttribute('href')).toBe('#/jour/2026-01-04')
    expect(dayNav.getByRole('link', { name: '07/01/2026 →' }).getAttribute('href')).toBe('#/jour/2026-01-07')
    await screen.findByRole('group', { name: 'Cartographie de la journée du 06/01/2026' })
    expect(screen.getByTestId('exclus').textContent).toContain('Hors diagramme ce jour')

    // Sélection d'une compétence : verdict, et onglet « Détails » sur mobile.
    fireEvent.click(screen.getByRole('button', { name: '2.01' }))
    expect(screen.getByRole('heading', { name: '2.01 — Intelligence Émotionnelle & Sollicitude Active' })).toBeDefined()
    expect(screen.getByTestId('verdict-block').textContent).toContain('présence établie')
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
  // ANOMALIE A1 de la fiche — ce test FIGE le comportement ACTUEL, pas le
  // comportement attendu : avec la VRAIE bibliothèque sunburst et une journée
  // conforme au schéma (poleNum en chaîne), cliquer un pôle ne montre pas son
  // rapport (findDayNode compare poleNum à un nombre). À inverser après correction.
  it('UC-VIS-01-F17 — [comportement actuel, anomalie A1] vue journée : la sélection d’un pôle n’affiche pas son rapport', async () => {
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

describe('UC-VIS-01 — cartographie chargée localement depuis l’accueil (vues historiques)', () => {
  function loadFromHome(content, name) {
    fireEvent.change(screen.getByLabelText('Charger ma cartographie (JSON)'), {
      target: { files: [browserFile(content, name)] },
    })
  }

  it('UC-VIS-01-F14 — A7 : document cartographie-merge → vue chronologique : badges, timeline, calendrier, narratif assaini', async () => {
    const network = demoNetwork()
    const doc = structuredClone(mergeFixture)
    doc.narratifs.kairosHtml =
      '<p>Synthèse. <a href="feuilles/2026-01-06/carto-day.html?focus=2.01">Voir le 6</a></p>' +
      '<img src="https://pisteur.example/x.gif"><script>window.pwned = true</script>'
    openApp('#/')
    loadFromHome(JSON.stringify(doc), 'ma-cartographie.json')

    await waitFor(() => expect(window.location.hash).toBe('#/merge'))
    expect(await screen.findByText('Feuilles de portfolio')).toBeDefined()
    const badges = document.querySelector('.stat-badges').textContent
    expect(badges).toContain('3Feuilles de portfolio')
    expect(badges).toContain('05/01/2026 → 07/01/2026')
    expect(badges).toContain('10 / 61Compétences établies')
    // Narratif : DOMPurify puis réécriture des liens de journée hérités.
    const narrative = screen.getByTestId('narrative-html')
    expect(narrative.querySelector('img, script')).toBeNull()
    expect(narrative.querySelector('a').getAttribute('href')).toBe('#/jour/2026-01-06?focus=2.01')
    expect(window.pwned).toBeUndefined()

    // Timeline de construction : dernière feuille par défaut, retour au début.
    const player = within(screen.getByRole('group', { name: 'Timeline de construction de la cartographie' }))
    expect(player.getByText('Feuille 3 / 3 — 07/01/2026')).toBeDefined()
    fireEvent.click(player.getByRole('button', { name: 'Première feuille' }))
    expect(player.getByText('Feuille 1 / 3 — 05/01/2026')).toBeDefined()
    expect(player.getByTestId('timeline-counter').textContent).toMatch(/^\d+ compétences? sur la carte/)

    // Calendrier synchronisé : à la première feuille, les journées suivantes
    // sont « à venir » (inertes) ; à la dernière, un clic ouvre la journée.
    expect(screen.queryByRole('link', { name: 'Journée du 06/01/2026' })).toBeNull()
    expect(document.querySelectorAll('rect[data-future="true"]')).toHaveLength(2)
    fireEvent.click(player.getByRole('button', { name: 'Dernière feuille' }))
    fireEvent.click(screen.getByRole('link', { name: 'Journée du 06/01/2026' }))
    await waitFor(() => expect(window.location.hash).toBe('#/jour/2026-01-06'))
    expect(await screen.findByText('Journée du 06/01/2026')).toBeDefined()
    // Le fichier lui-même n'a été envoyé nulle part.
    expect(network.mock.calls.every(([, init]) => !init?.body)).toBe(true)
  })

  it('UC-VIS-01-F15 — A7 : document cartographie-jour → vue journée rendue depuis la mémoire, sans téléchargement', async () => {
    const network = demoNetwork()
    openApp('#/')
    loadFromHome(JSON.stringify(FIXTURE_DAYS['2026-01-05']), 'journee.json')

    await waitFor(() => expect(window.location.hash).toBe('#/jour/2026-01-05'))
    expect(await screen.findByText('Journée du 05/01/2026')).toBeDefined()
    await screen.findByRole('group', { name: 'Cartographie de la journée du 05/01/2026' })
    expect(calledUrls(network)).not.toContain('data/demo/jours/2026-01-05.json')
    // La journée s'insère dans la navigation du corpus de démonstration.
    expect(screen.getByRole('link', { name: '06/01/2026 →' })).toBeDefined()
  })

  it('UC-VIS-01-F16 — E4 : fichier illisible ou non conforme → message d’erreur local, on reste sur l’accueil', async () => {
    demoNetwork()
    openApp('#/')
    loadFromHome('{ pas du json', 'casse.json')
    expect((await screen.findByRole('alert')).textContent).toContain('Ce fichier n’est pas un JSON valide.')

    loadFromHome(JSON.stringify({ ...mergeFixture, domains: 'x' }), 'invalide.json')
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Document non conforme au schéma'))
    expect(screen.getByRole('alert').querySelectorAll('li').length).toBeGreaterThan(0)
    expect(window.location.hash).toBe('#/')
  })
})
