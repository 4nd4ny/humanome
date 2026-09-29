// UC-APP-03 — Consulter ses cartographies : tests FONCTIONNELS (IHM).
// Fiche : docs/cas-utilisation/apprenant/UC-APP-03-consulter-ses-cartographies.md
//
// Le tableau de bord #/espace est joué dans l'application ENTIÈRE (<App/>),
// sans couture de test : le panneau « Mes cartographies » (chargé par son
// pont), le carto-store et le portfolio-store réels lisent un IndexedDB
// factice pré-rempli comme l'aurait fait un run (UC-APP-02). Le réseau est
// simulé (fetch global) : il ne sert qu'à la session, à la progression de
// formation et au référentiel publié — les documents consultés ne transitent
// jamais par lui.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import App from '../../../src/App.jsx'
import { resetApiClient } from '../../../src/api/client.js'
import { clearReferentielCache } from '../../../src/data/referentiel.js'
import { createCartoStore } from '../../../src/lib/carto-store.js'
import { createPortfolioStore } from '../../../src/lib/portfolio-store.js'
import { segmentText } from '@engine/portfolio/segment.js'
import * as fakeLib from '../../../src/test/fake-sunburst-lib.js'
import day05 from '../../../../schemas/fixtures/cartographie-jour-2026-01-05.json'
import day06 from '../../../../schemas/fixtures/cartographie-jour-2026-01-06.json'
import day07 from '../../../../schemas/fixtures/cartographie-jour-2026-01-07.json'
import merge3 from '../../../../schemas/fixtures/cartographie-merge-3-jours.json'
import referentielFixture from '../../../../schemas/fixtures/referentiel-respire-v7.json'
import { createFakeIndexedDb } from '../support/appl-fake-indexeddb.js'
import { jsonResponse, routedFetch } from '../support/appl-http.js'
import { portfolioText } from '../support/appl-llm.js'

const idb = createFakeIndexedDb()
const USER = { id: 7, email: 'maya@example.org', displayName: 'Maya', roles: ['apprenant'] }
const TRACE = {
  promptPackage: { id: 'aurora-v3-reconstruit', version: '1.0.0' },
  referentiel: { id: 'respire', version: '7.0.0' },
}

/** carto_evolutive Twin9 minimal (une attestation datée), cf. UC-APP-10. */
const TWIN9 = {
  journal_id: 'demo',
  date: '2026-03-10',
  periode: { debut: '2026-03-02', fin: '2026-03-02', n_journees: 1 },
  competences: {
    '1.01': {
      code: '1.01',
      nom: 'Pensée critique',
      pole: 1,
      attestations: [{ jour_index: 0, journee: 'J01', date: '2026-03-02', confiance: 0.8, score_preuves: 2, score_indices: 1 }],
      signaux: [],
    },
  },
  histoires: { '1.01': 'Une histoire attestée.' },
  rapports_poles: { 1: 'Rapport du pôle un.' },
  kairos_evolutif: 'Synthèse évolutive.',
}

/** Ce qu'un run (UC-APP-02) et une copie serveur (UC-APP-04) ont laissé. */
async function seedAfterRun({ extra = [] } = {}) {
  const texte = portfolioText()
  await createPortfolioStore().create({ titre: 'Journal de Maya', texte, segments: segmentText(texte, { today: '2026-07-12' }) })
  const stamps = ['2026-01-08T10:00:01.000Z', '2026-01-08T10:00:02.000Z', '2026-01-08T10:00:03.000Z', '2026-01-08T10:00:04.000Z']
  let i = 0
  const store = createCartoStore(undefined, { now: () => stamps[i++] ?? '2026-01-08T10:00:09.000Z' })
  for (const doc of [day05, day06, day07]) {
    await store.saveCartography({ type: 'jour', titre: `Journée ${doc.date} — Journal de Maya`, document: doc, ...TRACE })
  }
  await store.saveCartography({ type: 'merge', titre: 'Cartographie — Journal de Maya', document: merge3, serverId: 42, visibility: 'cartographe', ...TRACE })
  for (const entry of extra) await store.saveCartography(entry)
}

/** Référentiel PUBLIÉ servi en fichier statique (chemin nominal de l'étape 4). */
const PUBLISHED = { ...referentielFixture, version: '7.9.0' }

function stubNetwork({ me = USER, offline = false, published = false } = {}) {
  const fetchMock = offline
    ? vi.fn(async () => {
        throw new TypeError('Failed to fetch')
      })
    : routedFetch([
        ['api/auth/me', () => (me ? jsonResponse(200, { user: me, csrfToken: 'csrf' }) : jsonResponse(401, { error: 'Non connecté' }))],
        ...(published
          ? [
              ['data/referentiel/index.json', () => jsonResponse(200, [{ referentielId: 'respire', semver: '7.9.0', fichier: 'respire-7.9.0.json' }])],
              ['data/referentiel/respire-7.9.0.json', () => jsonResponse(200, PUBLISHED)],
            ]
          : []),
      ])
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function openDashboard() {
  window.location.hash = '#/espace'
  return render(<App lib={fakeLib} fetchMeFn={async () => ({ user: USER })} />)
}

const items = () => screen.getAllByTestId('carto-item')
const itemTitled = (titre) => items().find((li) => within(li).queryByText(titre))

beforeEach(() => {
  resetApiClient()
  // Cache de module du référentiel vidé : chaque scénario refait son chargement.
  clearReferentielCache()
  vi.stubGlobal('indexedDB', idb.factory)
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  idb.reset()
  window.location.hash = ''
  resetApiClient()
})

describe('UC-APP-03 — scénario nominal', () => {
  it('UC-APP-03-F01 — nominal : tableau de bord, liste locale (plus récente d’abord), « Voir » la fusion, retour', async () => {
    await seedAfterRun()
    const fetchMock = stubNetwork({ published: true })
    openDashboard()

    // 1-2. Session vérifiée, blocs du tableau de bord.
    expect((await screen.findByTestId('espace-connecte')).textContent).toBe('Connecté en tant que Maya.')
    expect((await screen.findByTestId('espace-portfolios')).textContent).toContain('Journal de Maya — 3 journée(s)')
    expect(screen.getByRole('region', { name: 'Ma formation' })).toBeDefined()

    // 3. Liste locale, métadonnées de consultation.
    await waitFor(() => expect(items()).toHaveLength(4))
    expect(items().map((li) => li.querySelector('strong').textContent)).toEqual([
      'Cartographie — Journal de Maya',
      'Journée 2026-01-07 — Journal de Maya',
      'Journée 2026-01-06 — Journal de Maya',
      'Journée 2026-01-05 — Journal de Maya',
    ])
    const fusion = itemTitled('Cartographie — Journal de Maya')
    expect(within(fusion).getByText('Parcours (merge)')).toBeDefined()
    expect(within(fusion).getByText('08/01/2026')).toBeDefined()
    expect(within(fusion).getByText('copie serveur')).toBeDefined()
    expect(within(fusion).getByRole('combobox').value).toBe('cartographe')
    expect(within(itemTitled('Journée 2026-01-05 — Journal de Maya')).queryByText('copie serveur')).toBeNull()

    // 4. « Voir » : visionneuse en lecture seule, vue chronologique.
    fireEvent.click(within(fusion).getByRole('button', { name: 'Voir' }))
    const viewer = await screen.findByTestId('carto-viewer')
    expect(within(viewer).getByRole('heading', { name: 'Cartographie — Journal de Maya' })).toBeDefined()
    expect(await within(viewer).findByRole('group', { name: 'Cartographie cumulée des compétences' })).toBeDefined()
    // Le rendu est celui de merge3 : ses feuilles datées au calendrier.
    for (const label of ['Journée du 05/01/2026', 'Journée du 06/01/2026', 'Journée du 07/01/2026']) {
      expect(within(viewer).getByRole('link', { name: label })).toBeDefined()
    }
    expect(viewer.querySelectorAll('[data-kind="competence"]').length).toBeGreaterThan(0)
    expect(screen.queryByRole('region', { name: 'Ma formation' })).toBeNull()
    // Référentiel PUBLIÉ chargé (fichier statique), pas la copie embarquée.
    expect(fetchMock.calls.map((c) => c.url)).toEqual(
      expect.arrayContaining(['data/referentiel/index.json', 'data/referentiel/respire-7.9.0.json']),
    )

    // 5. Retour au tableau de bord.
    fireEvent.click(screen.getByRole('button', { name: '← Retour au tableau de bord' }))
    await waitFor(() => expect(items()).toHaveLength(4))

    // Consultation 100 % locale : aucune requête vers les cartographies serveur.
    expect(fetchMock.calls.some((c) => c.url.includes('cartographies'))).toBe(false)
  })
})

describe('UC-APP-03 — scénarios alternatifs', () => {
  it('UC-APP-03-F02 — A1 : visiteur non connecté : bandeau d’invitation, consultation locale identique', async () => {
    await seedAfterRun()
    stubNetwork({ me: null })
    openDashboard()

    expect((await screen.findByTestId('espace-anonyme')).textContent).toContain('tout fonctionne en local dans ce navigateur')
    await waitFor(() => expect(items()).toHaveLength(4))
    expect(screen.getByText(/Progression locale à ce navigateur/)).toBeDefined()

    // Consultation identique : la visionneuse s'ouvre sans session.
    fireEvent.click(within(itemTitled('Journée 2026-01-07 — Journal de Maya')).getByRole('button', { name: 'Voir' }))
    expect(await screen.findByRole('group', { name: 'Cartographie de la journée du 07/01/2026' })).toBeDefined()
  })

  it('UC-APP-03-F03 — A1 : copie statique hors ligne : liste et visionneuse fonctionnent (référentiel embarqué)', async () => {
    await seedAfterRun()
    const fetchMock = stubNetwork({ offline: true })
    openDashboard()

    expect((await screen.findByTestId('espace-anonyme')).textContent).toContain('Copie statique du site')
    await waitFor(() => expect(items()).toHaveLength(4))
    fireEvent.click(within(itemTitled('Journée 2026-01-06 — Journal de Maya')).getByRole('button', { name: 'Voir' }))
    expect(await screen.findByRole('group', { name: 'Cartographie de la journée du 06/01/2026' })).toBeDefined()
    // Le référentiel publié a bien été tenté hors ligne (cache vidé), puis
    // la copie embarquée a pris le relais.
    expect(fetchMock.mock.calls.some(([url]) => String(url) === 'data/referentiel/index.json')).toBe(true)
  })

  it('UC-APP-03-F04 — A2 : « Voir » une journée : vue du jour en lecture seule', async () => {
    await seedAfterRun()
    stubNetwork()
    openDashboard()
    await waitFor(() => expect(items()).toHaveLength(4))

    fireEvent.click(within(itemTitled('Journée 2026-01-05 — Journal de Maya')).getByRole('button', { name: 'Voir' }))

    const viewer = await screen.findByTestId('carto-viewer')
    expect(await within(viewer).findByRole('group', { name: 'Cartographie de la journée du 05/01/2026' })).toBeDefined()
    expect(within(viewer).getByText('Journée du 05/01/2026')).toBeDefined()
    // [comportement ACTUEL, anomalie A-02] la vue du jour garde son lien vers
    // la vue merge GLOBALE (#/merge), qui sort de l'espace (démonstration).
    expect(within(viewer).getByRole('link', { name: '← Retour à la cartographie' }).getAttribute('href')).toBe('#/merge')
  })

  it('UC-APP-03-F05 — A3 : analyse Twin9 : libellé dédié, projetée sur la vue chronologique', async () => {
    await seedAfterRun({ extra: [{ type: 'twin9', titre: 'Analyse approfondie — mars', document: TWIN9 }] })
    stubNetwork()
    openDashboard()
    await waitFor(() => expect(items()).toHaveLength(5))

    const twin9 = itemTitled('Analyse approfondie — mars')
    expect(within(twin9).getByText('Analyse Twin9')).toBeDefined()
    fireEvent.click(within(twin9).getByRole('button', { name: 'Voir' }))
    const viewer = await screen.findByTestId('carto-viewer')
    expect(await within(viewer).findByRole('group', { name: 'Cartographie cumulée des compétences' })).toBeDefined()
    // Contenu qui n'existe qu'APRÈS projection par l'adaptateur du moteur :
    // la feuille datée tirée de l'attestation et la compétence attestée.
    expect(within(viewer).getByRole('link', { name: 'Journée du 02/03/2026' })).toBeDefined()
    const sectors = [...viewer.querySelectorAll('[data-kind="competence"]')]
    expect(sectors.length).toBeGreaterThan(0)
  })

  it('UC-APP-03-F06 — A4 : « Télécharger le JSON » : le document seul, nommé d’après son type et sa date', async () => {
    await seedAfterRun()
    stubNetwork()
    let blob = null
    let anchor = null
    URL.createObjectURL = vi.fn((b) => {
      blob = b
      return 'blob:carto'
    })
    URL.revokeObjectURL = vi.fn()
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function click() {
      anchor = this.download
    })
    openDashboard()
    await waitFor(() => expect(items()).toHaveLength(4))

    await act(async () => {
      fireEvent.click(within(itemTitled('Cartographie — Journal de Maya')).getByRole('button', { name: 'Télécharger le JSON' }))
    })

    expect(anchor).toBe('cartographie-merge-2026-01-07.json')
    expect(blob.type).toBe('application/json')
    const text = await new Promise((resolve) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result)
      reader.readAsText(blob)
    })
    expect(JSON.parse(text)).toEqual(merge3)
  })
})

describe('UC-APP-03 — scénarios d’erreur', () => {
  it('UC-APP-03-F07 — E1 : IndexedDB indisponible : portfolios et cartographies signalés illisibles', async () => {
    stubNetwork()
    vi.stubGlobal('indexedDB', undefined)
    openDashboard()

    await waitFor(() => expect(screen.getAllByRole('alert')).toHaveLength(2))
    const texts = screen.getAllByRole('alert').map((a) => a.textContent)
    expect(texts).toContainEqual(expect.stringContaining('les portfolios ne peuvent pas être conservés localement'))
    expect(texts).toContainEqual(
      expect.stringMatching(/^Stockage local indisponible \(.*cartographies.*\) : la liste des cartographies ne peut pas être lue\.$/),
    )
  })

  it('UC-APP-03-F08 — E2 : rien encore : invitations à créer un portfolio et à lancer une cartographie', async () => {
    stubNetwork()
    openDashboard()

    expect(await screen.findByText(/Aucune cartographie pour l’instant\./)).toBeDefined()
    const portfolios = screen.getByRole('region', { name: 'Mes portfolios' })
    expect(within(portfolios).getByText(/Aucun portfolio local pour l’instant\./)).toBeDefined()
    expect(within(portfolios).getByRole('link', { name: 'Créer un portfolio' }).getAttribute('href')).toBe('#/portfolio')
    expect(within(portfolios).getByRole('link', { name: 'Cartographier mes écrits' }).getAttribute('href')).toBe('#/espace/nouveau-run')
  })

  it('UC-APP-03-F09 — E3 : entrée sans document : « Voir » et « Télécharger le JSON » inactifs', async () => {
    await createCartoStore().saveCartography({ type: 'merge', titre: 'Entrée vide' })
    stubNetwork()
    openDashboard()

    const entry = await screen.findByTestId('carto-item')
    expect(within(entry).getByRole('button', { name: 'Voir' }).disabled).toBe(true)
    expect(within(entry).getByRole('button', { name: 'Télécharger le JSON' }).disabled).toBe(true)
  })

  it('UC-APP-03-F13 — [comportement ACTUEL, anomalie A-02] un clic sur un jour du calendrier de la visionneuse ouvre la journée de DÉMONSTRATION', async () => {
    await seedAfterRun()
    const fetchMock = stubNetwork()
    openDashboard()
    await waitFor(() => expect(items()).toHaveLength(4))
    fireEvent.click(within(itemTitled('Cartographie — Journal de Maya')).getByRole('button', { name: 'Voir' }))
    const viewer = await screen.findByTestId('carto-viewer')
    await within(viewer).findByRole('group', { name: 'Cartographie cumulée des compétences' })

    // Le calendrier est rendu sans onPickDay : le clic navigue vers #/jour/<iso>,
    // hors de l'espace ; App charge alors data/demo/jours/<iso>.json (le journal
    // de démonstration), au lieu de la journée de l'apprenant.
    fireEvent.click(within(viewer).getByRole('link', { name: 'Journée du 06/01/2026' }))
    await waitFor(() => expect(window.location.hash).toBe('#/jour/2026-01-06'))
    await waitFor(() => expect(fetchMock.calls.some((c) => c.url === 'data/demo/jours/2026-01-06.json')).toBe(true))
    expect(screen.queryByTestId('carto-viewer')).toBeNull()
  })

  it('UC-APP-03-F14 — A3 : analyse Twin9 sans journée datée : message explicatif, JSON toujours téléchargeable', async () => {
    const sansDate = {
      ...TWIN9,
      competences: { '1.01': { ...TWIN9.competences['1.01'], attestations: [] } },
    }
    await seedAfterRun({ extra: [{ type: 'twin9', titre: 'Twin9 sans date', document: sansDate }] })
    stubNetwork()
    openDashboard()
    await waitFor(() => expect(items()).toHaveLength(5))

    const entry = itemTitled('Twin9 sans date')
    expect(within(entry).getByRole('button', { name: 'Télécharger le JSON' }).disabled).toBe(false)
    fireEvent.click(within(entry).getByRole('button', { name: 'Voir' }))
    const viewer = await screen.findByTestId('carto-viewer')
    expect((await within(viewer).findByRole('alert')).textContent).toContain(
      'Cette analyse Twin9 ne porte aucune journée datée : rien à projeter sur le sunburst.',
    )
    expect(within(viewer).queryByRole('group', { name: 'Cartographie cumulée des compétences' })).toBeNull()
  })
})

describe('UC-APP-03 — section inconnue de l’espace (E5)', () => {
  it('UC-APP-03-F15 — E5 : #/espace/cohortes/3 → alerte citant le segment, lien de retour ; ni tableau de bord, ni IndexedDB, ni requête hors session ; même message pour un visiteur (pas de garde)', async () => {
    const fetchMock = stubNetwork()
    window.location.hash = '#/espace/cohortes/3' // la section « cohortes » n'admet pas de sous-segment
    render(<App lib={fakeLib} fetchMeFn={async () => ({ user: USER })} />)

    expect((await screen.findByRole('alert')).textContent).toBe('Section inconnue de l’espace apprenant : « cohortes/3 ».')
    expect((await screen.findByTestId('espace-connecte')).textContent).toBe('Connecté en tant que Maya.')
    expect(screen.getByRole('link', { name: 'Retour à l’accueil de l’espace' }).getAttribute('href')).toBe('#/espace')
    // Aucune section montée : ni les quatre blocs, ni l'assistant, ni « Mes cohortes ».
    expect(screen.queryByRole('region', { name: 'Mes portfolios' })).toBeNull()
    expect(screen.queryAllByRole('region', { name: 'Mes cartographies' })).toHaveLength(0)
    expect(screen.queryByRole('region', { name: 'Mes cohortes' })).toBeNull()
    await act(async () => {})
    // Seule la session est demandée (la vue la vérifie elle-même) ; aucun
    // stockage local ouvert, aucune progression ni cohorte demandée.
    expect(fetchMock.calls.map((c) => c.url)).toEqual(['api/auth/me'])
    expect(idb.openCount()).toBe(0)

    // Le lien de retour rouvre le tableau de bord, qui lit, lui, le stockage local.
    fireEvent.click(screen.getByRole('link', { name: 'Retour à l’accueil de l’espace' }))
    await waitFor(() => expect(window.location.hash).toBe('#/espace'))
    expect(await screen.findByRole('region', { name: 'Mes portfolios' })).toBeDefined()
    expect(screen.queryByText(/Section inconnue/)).toBeNull()
    await waitFor(() => expect(idb.openCount()).toBeGreaterThan(0))
    cleanup()

    // Visiteur sans session : l'espace n'a pas de garde de rôle, le même
    // repli s'affiche sous le bandeau « Vous n'êtes pas connecté ».
    const visitorFetch = stubNetwork({ me: null })
    window.location.hash = '#/espace/cohortes/3'
    render(<App lib={fakeLib} fetchMeFn={async () => ({ user: null })} />)
    expect((await screen.findByTestId('espace-anonyme')).textContent).toContain('Vous n’êtes pas connecté')
    expect(screen.getByRole('alert').textContent).toBe('Section inconnue de l’espace apprenant : « cohortes/3 ».')
    expect(visitorFetch.calls.map((c) => c.url)).toEqual(['api/auth/me'])
    cleanup()
    idb.reset()

    // Comportement ACTUEL (anomalie AN1 de UC-VIS-02, commune aux routes à
    // section) : un segment au pourcentage mal formé n'atteint pas ce repli.
    // App calcule sa route au premier rendu (useState(currentRoute)) : le
    // rendu lui-même lève une URIError — ni shell, ni session, ni IndexedDB.
    const brokenFetch = stubNetwork()
    const shellMe = vi.fn(async () => ({ user: USER }))
    window.location.hash = '#/espace/100%'
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      expect(() => render(<App lib={fakeLib} fetchMeFn={shellMe} />)).toThrow(URIError)
    } finally {
      consoleError.mockRestore()
    }
    expect(document.body.textContent).toBe('')
    expect(shellMe).not.toHaveBeenCalled()
    expect(brokenFetch.calls).toEqual([])
    expect(idb.openCount()).toBe(0)
  })
})
