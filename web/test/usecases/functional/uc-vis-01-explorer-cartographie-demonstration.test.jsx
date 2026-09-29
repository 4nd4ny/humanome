// UC-VIS-01 — Explorer la cartographie de démonstration : tests FONCTIONNELS (IHM).
// Fiche : docs/cas-utilisation/visiteur/UC-VIS-01-explorer-cartographie-demonstration.md
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
    // Shell RÉEL (sans session injectée) : il sonde GET api/auth/me, auquel le
    // réseau simulé répond 404 → navigation de visiteur.
    window.location.hash = '#/'
    render(<App lib={fakeLib} />)

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
    // Bloc replié « Préparer un partage » (UC-APP-12), rendu même en simplifié.
    expect(document.querySelector('details.v3-share-details').open).toBe(false)

    // RGPD : la démonstration ne lit que des fichiers statiques relatifs ; la
    // SEULE requête hors data/ est la sonde de session du shell (GET sans corps).
    const urls = calledUrls(network)
    expect(urls).toContain('data/demo/jours/index.json')
    expect([...new Set(urls.filter((u) => !u.startsWith('data/')))]).toEqual(['api/auth/me'])
    for (const [url, init] of network.mock.calls) {
      if (String(url) === 'api/auth/me') expect(init).toMatchObject({ method: 'GET', body: undefined })
    }
    expect(network.mock.calls.every(([, init]) => !init || !init.method || init.method === 'GET')).toBe(true)
    expect(network.mock.calls.every(([, init]) => !init?.body)).toBe(true)
  })

  it('UC-VIS-01-F02 — nominal : filtrer par un secteur, « Pourquoi ce rayon ? » (touche w), retirer le filtre', async () => {
    demoNetwork()
    openApp('#/cartographie')
    await screen.findByRole('toolbar', { name: 'Barre de contexte' })

    const sector = screen.getByRole('button', { name: /^2\.01 Intelligence Émotionnelle/ })
    expect(sector.getAttribute('aria-label')).toContain('3 journées documentées')
    fireEvent.click(sector)
    expect(contextBar().textContent).toContain('Filtre : comp-2.01')
    // Le filtre ATTÉNUE les autres secteurs du soleil, sans les retirer ; les
    // indicateurs (comme la heatmap, le portfolio et le tableau) l'ignorent
    // — comportement actuel.
    const byCode = (code) => [...competencySectors()].find((p) => sectorCode(p) === code)
    expect(competencySectors()).toHaveLength(10)
    expect(byCode('5.03').getAttribute('class')).toContain('v3-dimmed')
    expect(byCode('2.01').getAttribute('class')).not.toContain('v3-dimmed')
    const stats = within(screen.getByRole('region', { name: 'Indicateurs synthétiques' }))
    expect(stats.getByText('Compétences documentées').nextSibling.textContent).toBe('10')

    fireEvent.keyDown(sector, { key: 'w' })
    const dialog = await screen.findByRole('dialog', { name: 'Pourquoi ce rayon ? 2.01' })
    expect(dialog.textContent).toContain('documented-days-v1')
    expect(dialog.textContent).toContain('3 journées documentées')
    for (const date of FIXTURE_FACTS.dates) expect(within(dialog).getByRole('button', { name: date })).toBeDefined()
    expect(dialog.textContent).toContain('jamais une force ni un niveau')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Fermer' }))
    expect(screen.queryByRole('dialog', { name: /Pourquoi ce rayon/ })).toBeNull()

    // Trois façons de retirer le filtre (étape 9) : la barre, la puce, le centre du soleil.
    fireEvent.click(within(contextBar()).getByRole('button', { name: 'Toutes les compétences' }))
    expect(contextBar().textContent).toContain('Toutes les compétences ·')
    expect(contextBar().textContent).not.toContain('Filtre :')
    expect(byCode('5.03').getAttribute('class')).not.toContain('v3-dimmed')

    fireEvent.click(byCode('2.01'))
    fireEvent.click(screen.getByRole('button', { name: 'Retirer le filtre' }))
    expect(contextBar().textContent).not.toContain('Filtre :')

    fireEvent.click(byCode('2.01'))
    const sunPanel = screen.getByRole('region', { name: 'Soleil des compétences' })
    fireEvent.click(within(sunPanel).getByRole('button', { name: 'Toutes les compétences' }))
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
    // Le soleil ne montre plus que ce qui est documenté jusqu'au 6 janvier :
    // les compétences documentées PLUS TARD (3.07, 4.05, 6.07) ne sont pas
    // dessinées du tout…
    expect(competencySectors()).toHaveLength(7)
    for (const code of ['3.07', '4.05', '6.07']) {
      expect(screen.queryByRole('button', { name: (n) => n.startsWith(`${code} `) })).toBeNull()
    }
    // … et le « fantôme » (contour pointillé) prolonge seulement les secteurs
    // VISIBLES qui gagneront encore des journées (le 7 janvier).
    const ghosts = [...document.querySelectorAll('.v3-sector-future')].map((p) => sectorCode(p.nextElementSibling)).sort()
    expect(ghosts).toEqual(['2.01', '5.03', '7.01'])
  })

  it('UC-VIS-01-F04 — A2 : lecteur temporel — début, pas à pas, lecture ×2 jusqu’à la dernière journée puis pause ; lecture arrière ; l’inspection met en pause', async () => {
    demoNetwork()
    openApp('#/cartographie')
    await screen.findByRole('toolbar', { name: 'Barre de contexte' })
    const timeline = within(screen.getByRole('region', { name: 'Lecteur temporel' }))
    fireEvent.change(timeline.getByRole('combobox'), { target: { value: '2' } })

    // Depuis l'état complet, la tête est déjà sur la dernière journée : la
    // lecture avant s'arrête au premier pas, sans rien déplacer.
    fireEvent.click(timeline.getByRole('button', { name: 'Lecture' }))
    await waitFor(() => expect(timeline.getByRole('button', { name: 'Lecture' })).toBeDefined(), { timeout: 3000 })
    expect(contextBar().textContent).toContain('état complet')

    fireEvent.click(timeline.getByRole('button', { name: 'Aller au début' }))
    expect(contextBar().textContent).toContain('tête de lecture 2026-01-05')
    expect(competencySectors()).toHaveLength(4)
    fireEvent.click(timeline.getByRole('button', { name: 'Journée suivante' }))
    expect(timeline.getByRole('slider').getAttribute('aria-valuetext')).toBe('2026-01-06')
    fireEvent.click(timeline.getByRole('button', { name: 'Journée précédente' }))
    expect(contextBar().textContent).toContain('tête de lecture 2026-01-05')

    fireEvent.click(timeline.getByRole('button', { name: 'Lecture' }))
    expect(timeline.getByRole('button', { name: 'Pause' })).toBeDefined()
    await waitFor(() => expect(contextBar().textContent).toContain('tête de lecture 2026-01-07'), { timeout: 3000 })
    // Arrivée au bout : la lecture s'arrête d'elle-même.
    await waitFor(() => expect(timeline.getByRole('button', { name: 'Lecture' })).toBeDefined(), { timeout: 3000 })
    expect(competencySectors()).toHaveLength(10)

    // Lecture arrière depuis la fin : la tête recule jusqu'à la première journée.
    fireEvent.click(timeline.getByRole('button', { name: 'Aller à la fin' }))
    fireEvent.click(timeline.getByRole('button', { name: /^Lecture arrière/ }))
    await waitFor(() => expect(contextBar().textContent).toContain('tête de lecture 2026-01-05'), { timeout: 3000 })
    await waitFor(() => expect(timeline.getByRole('button', { name: 'Lecture' })).toBeDefined(), { timeout: 3000 })

    // Inspecter une journée pendant la lecture la met en pause.
    fireEvent.click(timeline.getByRole('button', { name: 'Lecture' }))
    expect(timeline.getByRole('button', { name: 'Pause' })).toBeDefined()
    fireEvent.click(screen.getByRole('gridcell', { name: /^2026-01-07 : 6 compétences documentées/ }))
    expect(timeline.getByRole('button', { name: 'Lecture' })).toBeDefined()
    expect(timeline.queryByRole('button', { name: 'Pause' })).toBeNull()
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

  it('UC-VIS-01-F18 — nominal (2) : référentiel PUBLIÉ lu depuis data/referentiel/ (index puis fichier indiqué) et utilisé par le soleil', async () => {
    const published = {
      ...referentielDoc,
      version: '7.1.0',
      label: 'RESPIRE v7.1',
      competences: referentielDoc.competences.map((c) => (c.code === '2.01' ? { ...c, nom: 'Sollicitude publiée' } : c)),
    }
    const network = demoNetwork({
      referentielIndex: [{ referentielId: 'respire', semver: '7.1.0', label: 'RESPIRE v7.1', publishedAt: '2026-07-15T09:00:00', fichier: 'respire-v7.1.json' }],
      referentielDoc: published,
    })
    openApp('#/cartographie')
    await screen.findByRole('toolbar', { name: 'Barre de contexte' })

    expect(calledUrls(network)).toContain('data/referentiel/respire-v7.1.json')
    expect(screen.getByRole('button', { name: /^2\.01 Sollicitude publiée :/ })).toBeDefined()
    expect(screen.queryByRole('button', { name: /^2\.01 Intelligence Émotionnelle/ })).toBeNull()
  })

  // ANOMALIE AN3 de la fiche — comportement ACTUEL figé : loadDemoCorpus ne
  // vérifie pas response.ok. Une journée servie en erreur HTTP avec un corps
  // JSON est importée comme un document inconnu (quarantaine) : la démo
  // s'affiche PARTIELLE avec un badge d'anomalie, au lieu de « Chargement
  // impossible ». À inverser quand le statut HTTP sera contrôlé.
  it('UC-VIS-01-F19 — [comportement actuel, anomalie AN3] une journée du corpus en HTTP 500 (corps JSON) → démonstration partielle, « 1 anomalie(s) à traiter »', async () => {
    demoNetwork({ extra: (u) => (u === 'data/demo/jours/2026-01-06.json' ? jsonResponse(500, { error: 'x' }) : undefined) })
    openApp('#/cartographie')
    await screen.findByRole('toolbar', { name: 'Barre de contexte' })

    expect(within(contextBar()).getByRole('status').textContent).toBe('1 anomalie(s) à traiter') // attendu : « Chargement impossible »
    // Le 6 janvier manque : 1.01, 2.06 et 5.01 (documentées ce jour-là seulement) disparaissent.
    expect([...competencySectors()].map(sectorCode).sort()).toEqual(['2.01', '3.04', '3.07', '4.05', '5.03', '6.07', '7.01'])
    const stats = within(screen.getByRole('region', { name: 'Indicateurs synthétiques' }))
    expect(stats.getByText('Journées documentées').nextSibling.textContent).toBe('2')
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
    // La journée s'insère dans la navigation (merge de démo embarqué ∪ journées locales).
    const { next } = demoNeighbours('2026-01-05', ['2026-01-05'])
    expect(screen.getByRole('link', { name: `${frenchDate(next)} →` }).getAttribute('href')).toBe(`#/jour/${next}`)
  })

  it('UC-VIS-01-F20 — A7 : un document glissé-déposé sur la zone de dépôt est lu localement, comme via le bouton', async () => {
    const network = demoNetwork()
    openApp('#/')
    fireEvent.drop(screen.getByTestId('dropzone'), {
      dataTransfer: { files: [browserFile(JSON.stringify(FIXTURE_DAYS['2026-01-07']), 'depose.json')] },
    })
    await waitFor(() => expect(window.location.hash).toBe('#/jour/2026-01-07'))
    expect(await screen.findByText('Journée du 07/01/2026')).toBeDefined()
    expect(calledUrls(network)).not.toContain('data/demo/jours/2026-01-07.json')
  })

  it('UC-VIS-01-F16 — E4 : fichier illisible ou non conforme → message d’erreur local, on reste sur l’accueil', async () => {
    demoNetwork()
    openApp('#/')
    loadFromHome('{ pas du json', 'casse.json')
    expect((await screen.findByRole('alert')).textContent).toContain('Ce fichier n’est pas un JSON valide.')

    loadFromHome(JSON.stringify({ ...mergeFixture, domains: 'x' }), 'invalide.json')
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Document non conforme au schéma'))
    expect(screen.getByRole('alert').querySelectorAll('li').length).toBeGreaterThan(0)

    // Ancien carto-data.js : message de conversion.
    loadFromHome('const domainsData = []', 'carto-data.js')
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('carto-data.js hérité'))
    // kind inconnu.
    loadFromHome(JSON.stringify({ kind: 'autre' }), 'autre.json')
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Document non reconnu'))
    // Plus de 8 erreurs de schéma : les 8 premières, puis « … et N autres erreurs. ».
    loadFromHome(JSON.stringify({ ...mergeFixture, domains: Array(10).fill(1) }), 'tres-invalide.json')
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('(11 erreurs)'))
    const items = [...screen.getByRole('alert').querySelectorAll('li')]
    expect(items).toHaveLength(9)
    expect(items.at(-1).textContent).toBe('… et 3 autres erreurs.')
    expect(window.location.hash).toBe('#/')
  })
})
