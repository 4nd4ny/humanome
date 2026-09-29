// UC-ADM-06 — Consulter le monitoring : tests FONCTIONNELS (IHM).
// Fiche : docs/cas-utilisation/administration/UC-ADM-06-monitoring.md
//
// Le scénario est joué sur l'application ENTIÈRE (<App/>) : l'administrateur
// arrive sur l'accueil #/admin, ouvre la carte « Monitoring », lit les tuiles,
// change de période, consulte les connexions, les votes en attente et les
// comptes par rôle. Le réseau est simulé par le faux serveur d'administration
// (web/test/usecases/support/adm.js) ; la réponse du tableau de bord a la
// forme exacte de Monitoring::overview.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import App from '../../../src/App.jsx'
import { resetApiClient } from '../../../src/api/client.js'
import * as fakeLib from '../../../src/test/fake-sunburst-lib.js'
import { callsTo, createAdminBackend, emptyOverview, isoDaysAgo, jsonResponse } from '../support/adm.js'

const spaces = (s) => s.replace(/\s/g, ' ')

/** Tableau de bord peuplé ; `days` suit la période demandée. */
function overviewFor(days) {
  const o = emptyOverview(days)
  o.utilisateurs = {
    ...o.utilisateurs,
    total: 42,
    nonActives: 3,
    actifsMaintenant: 5,
    sessionsAnonymes: 2,
    nouveauxPeriode: days === 7 ? 1 : 7,
    parJour: [{ date: isoDaysAgo(0), n: 1 }],
  }
  o.tokens.parJour = [
    {
      date: isoDaysAgo(0),
      demo: { requetes: 12, entree: 30_000, sortie: 8_000, coutUsd: 0.42 },
      tuteur: null,
      twin9: { appels: 8, entree: 400_000, sortie: 200_000, depenseMicrousd: 2_500_000 },
    },
  ]
  o.finances.parJour = [{ date: isoDaysAgo(0), topup: 10_000_000, debit: -2_500_000, refund: 0, adjust: 0 }]
  o.cartographies.total = 12
  o.cartographies.parType = { jour: 8, merge: 4 }
  o.cartographies.partages = { ...o.cartographies.partages, actifs: 4, consultationsPeriode: 9, consultationsTotal: 21 }
  o.finances.soldes = { totalMicrousd: 7_000_000, comptesCredites: 2 }
  o.connexions = {
    periode: { reussies: 14, echouees: 3 },
    parJour: [{ date: isoDaysAgo(0), reussies: 14, echouees: 3 }],
    parPays: [
      { pays: 'FR', n: 12 },
      { pays: null, n: 2 },
    ],
    dernieres: [
      { date: `${isoDaysAgo(0)}T10:00:00`, reussie: true, userId: 1, email: 'root@example.org', displayName: 'Root Admin', pays: 'FR', reseau: '203.0.113.0/24' },
      { date: `${isoDaysAgo(0)}T09:00:00`, reussie: false, userId: null, email: null, displayName: null, pays: null, reseau: '198.51.100.0/24' },
    ],
  }
  o.votes = {
    electorat: [
      { id: 7, email: 'alice@example.org', displayName: 'Alice' },
      { id: 8, email: 'bob@example.org', displayName: 'Bob' },
      { id: 9, email: 'carol@example.org', displayName: 'Carol' },
    ],
    competences: [
      {
        id: 3,
        label: 'R1 — Respiration consciente',
        semver: '7.1.1',
        soumiseLe: '2026-09-20T08:00:00',
        decompte: { electorateSize: 3, threshold: 2, pour: 1, contre: 0, abstention: 0, notVoted: 2, outcome: 'pending', reached: false },
        manquants: [
          { id: 8, email: 'bob@example.org', displayName: 'Bob' },
          { id: 9, email: 'carol@example.org', displayName: 'Carol' },
        ],
      },
    ],
    referentiel: [],
  }
  return o
}

const USERS = [
  { id: 1, email: 'root@example.org', displayName: 'Root Admin', roles: ['admin'] },
  { id: 7, email: 'alice@example.org', displayName: 'Alice', roles: ['epistemiarque'] },
]

function monitoringRoutes() {
  const routes = {}
  for (const days of [7, 30, 90, 365]) {
    routes[`GET api/admin/monitoring?days=${days}`] = () => jsonResponse(200, overviewFor(days))
  }
  return routes
}

function openAdmin(backend, hash) {
  vi.stubGlobal('fetch', backend.fetchMock)
  window.location.hash = hash
  render(<App lib={fakeLib} />)
}

beforeEach(() => resetApiClient())

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  window.location.hash = ''
  resetApiClient()
})

describe('UC-ADM-06 — l’administrateur consulte le monitoring', () => {
  it('UC-ADM-06-F08 — nominal : depuis l’accueil admin, la carte « Monitoring » ouvre le tableau de bord (tuiles, graphiques, 30 j)', async () => {
    const backend = createAdminBackend({ users: USERS, routes: monitoringRoutes() })
    openAdmin(backend, '#/admin')

    const card = await screen.findByRole('link', { name: /Monitoring/ })
    await act(async () => {
      window.location.hash = card.getAttribute('href')
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })

    expect(await screen.findByRole('heading', { name: 'Monitoring' })).toBeTruthy()
    await screen.findByText('connectés maintenant')
    expect(callsTo(backend.calls, 'GET', 'api/admin/monitoring?days=30')).toHaveLength(1)
    expect(screen.getByRole('button', { name: '30 j' }).getAttribute('aria-pressed')).toBe('true')
    const tiles = [...document.querySelectorAll('.mon-tile')].map((t) => spaces(t.textContent))
    expect(tiles[0]).toBe('5connectés maintenant+ 2 visiteurs anonymes')
    expect(tiles[1]).toBe('42comptes+ 7 sur la période · 3 non activés')
    expect(tiles[2]).toBe('12cartographies8 journée · 4 merge')
    expect(tiles[3]).toBe('4partages actifs9 consultations sur la période')
    expect(tiles[4]).toBe('7,00 $crédits en circulation2 comptes crédités')
    expect(tiles[6]).toBe('14connexions période3 échecs')
    for (const chart of ['Connexions par jour', 'Tokens par jour (entrée + sortie, par source)', 'Mouvements par jour']) {
      expect(screen.getByRole('img', { name: chart })).toBeTruthy()
    }
    expect(screen.getByText(/jamais l’adresse IP complète/)).toBeTruthy()
  })

  it('UC-ADM-06-F09 — A1 : « 7 j » recharge le tableau de bord pour 7 jours', async () => {
    const backend = createAdminBackend({ users: USERS, routes: monitoringRoutes() })
    openAdmin(backend, '#/admin/monitoring')
    await screen.findByText('connectés maintenant')

    fireEvent.click(screen.getByRole('button', { name: '7 j' }))

    await waitFor(() => expect(callsTo(backend.calls, 'GET', 'api/admin/monitoring?days=7')).toHaveLength(1))
    await waitFor(() => expect(screen.getByRole('button', { name: '7 j' }).getAttribute('aria-pressed')).toBe('true'))
    expect(await screen.findByText('+ 1 sur la période · 3 non activés')).toBeTruthy()
  })

  it('UC-ADM-06-F10 — connexions : répartition par pays (« Inconnu » sans GeoIP), réseau tronqué, issue', async () => {
    const backend = createAdminBackend({ users: USERS, routes: monitoringRoutes() })
    openAdmin(backend, '#/admin/monitoring')
    await screen.findByText('connectés maintenant')

    expect(screen.getByRole('rowheader', { name: 'FR' })).toBeTruthy()
    expect(screen.getByRole('rowheader', { name: 'Inconnu' })).toBeTruthy()
    const failure = screen.getByText('198.51.100.0/24').closest('tr')
    expect(within(failure).getByText('Compte inconnu')).toBeTruthy()
    expect(within(failure).getByText('Échec')).toBeTruthy()
    expect(within(screen.getByText('203.0.113.0/24').closest('tr')).getByText('OK')).toBeTruthy()
  })

  it('UC-ADM-06-F11 — A3 : vote en attente, retardataires nommés et lien de relance (mailto en copie cachée)', async () => {
    const backend = createAdminBackend({ users: USERS, routes: monitoringRoutes() })
    openAdmin(backend, '#/admin/monitoring')

    const prop = (await screen.findByText('R1 — Respiration consciente')).closest('li')
    expect(within(prop).getByText('En attente de voix')).toBeTruthy()
    expect(within(prop).getByText(/Pour 1 · Contre 0 · Abstention 0 · Sans voix 2 — seuil 2 sur 3 membres/)).toBeTruthy()
    const relance = within(prop).getByRole('link', { name: 'écrire aux retardataires' })
    const href = relance.getAttribute('href')
    expect(href.startsWith('mailto:?bcc=')).toBe(true)
    expect(decodeURIComponent(href)).toContain('bob@example.org,carol@example.org')
    expect(decodeURIComponent(href)).toContain('[humanome] Vote en attente : R1 — Respiration consciente 7.1.1')
  })

  it('UC-ADM-06-F12 — A2 : « Comptes par rôle » — admin par défaut, puis épistémiarques', async () => {
    const backend = createAdminBackend({ users: USERS, routes: monitoringRoutes() })
    openAdmin(backend, '#/admin/monitoring')
    const block = (await screen.findByRole('heading', { name: 'Comptes par rôle' })).closest('section')
    await within(block).findByText('Root Admin')

    fireEvent.change(within(block).getByLabelText('Rôle'), { target: { value: 'epistemiarque' } })

    expect(await within(block).findByText('Alice')).toBeTruthy()
    expect(within(block).queryByText('Root Admin')).toBeNull()
    expect(callsTo(backend.calls, 'GET', 'api/admin/users?role=epistemiarque')).toHaveLength(1)
  })

  it('UC-ADM-06-F13 — E3 : erreur serveur → message en alerte, pas de tableau de bord', async () => {
    const backend = createAdminBackend({
      users: USERS,
      routes: { 'GET api/admin/monitoring?days=30': jsonResponse(500, { error: 'Erreur interne' }) },
    })
    openAdmin(backend, '#/admin/monitoring')

    expect((await screen.findByRole('alert')).textContent).toBe('Erreur interne')
    expect(screen.queryByText('connectés maintenant')).toBeNull()
    // Le bloc « Comptes par rôle » vit dans le tableau de bord : jamais monté ici.
    expect(screen.queryByRole('heading', { name: 'Comptes par rôle' })).toBeNull()
    expect(callsTo(backend.calls, 'GET', 'api/admin/users')).toHaveLength(0)
  })

  it('UC-ADM-06-F14 — E1/E2 : visiteur ou compte sans rôle admin → espace réservé, aucun agrégat demandé', async () => {
    // E1 : visiteur sans session (api/auth/me → 401).
    const visitor = createAdminBackend({ me: null, routes: monitoringRoutes() })
    openAdmin(visitor, '#/admin/monitoring')
    expect(await screen.findByTestId('admin-reserve')).toBeTruthy()
    expect(screen.getByText(/Vous n’êtes pas connecté/)).toBeTruthy()
    expect(callsTo(visitor.calls, 'GET', 'api/admin/monitoring')).toHaveLength(0)
    cleanup()
    vi.unstubAllGlobals()
    resetApiClient()

    // E2 : épistémiarque connecté, sans le rôle admin.
    const backend = createAdminBackend({
      me: { id: 7, email: 'alice@example.org', displayName: 'Alice', roles: ['epistemiarque'] },
      routes: monitoringRoutes(),
    })
    openAdmin(backend, '#/admin/monitoring')

    expect(await screen.findByTestId('admin-reserve')).toBeTruthy()
    expect(screen.queryByText(/Vous n’êtes pas connecté/)).toBeNull()
    expect(callsTo(backend.calls, 'GET', 'api/admin/monitoring')).toHaveLength(0)
  })

  it('UC-ADM-06-F16 — (anomalie AN-3, comportement actuel) échec du rechargement d’une période : alerte, mais l’ancien tableau de bord reste affiché sous le nouveau bouton pressé', async () => {
    const routes = monitoringRoutes()
    routes['GET api/admin/monitoring?days=7'] = jsonResponse(500, { error: 'Erreur interne' })
    const backend = createAdminBackend({ users: USERS, routes })
    openAdmin(backend, '#/admin/monitoring')
    await screen.findByText('+ 7 sur la période · 3 non activés')

    fireEvent.click(screen.getByRole('button', { name: '7 j' }))

    expect((await screen.findByRole('alert')).textContent).toBe('Erreur interne')
    expect(screen.getByRole('button', { name: '7 j' }).getAttribute('aria-pressed')).toBe('true')
    // Données de la période PRÉCÉDENTE (30 j) toujours affichées.
    expect(screen.getByText('+ 7 sur la période · 3 non activés')).toBeTruthy()
    expect(screen.getByText('connectés maintenant')).toBeTruthy()
  })

  it('UC-ADM-06-F17 — E3 : échec du bloc « Comptes par rôle » → « Chargement impossible. » dans le bloc, tableau de bord intact', async () => {
    const routes = monitoringRoutes()
    routes['GET api/admin/users?role=admin'] = jsonResponse(500, { error: 'Erreur interne' })
    const backend = createAdminBackend({ users: USERS, routes })
    openAdmin(backend, '#/admin/monitoring')

    const block = (await screen.findByRole('heading', { name: 'Comptes par rôle' })).closest('section')
    expect((await within(block).findByRole('alert')).textContent).toBe('Chargement impossible.')
    expect(within(block).queryByRole('table')).toBeNull()
    expect(screen.getByText('connectés maintenant')).toBeTruthy()
  })
})
