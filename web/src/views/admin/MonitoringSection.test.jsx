// Section « Monitoring » : tableau de bord admin — tuiles de synthèse,
// sélecteur de période, journal des connexions (pays + réseau tronqué),
// votes de gouvernance (retardataires à relancer), comptes par rôle.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import MonitoringSection from './MonitoringSection.jsx'
import { nb, usd } from './admin-api.js'
import { resetApiClient } from '../../api/client.js'

afterEach(() => {
  cleanup()
  resetApiClient()
})

function jsonResponse(status, data) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (n) => (n.toLowerCase() === 'content-type' ? 'application/json' : null) },
    json: async () => data,
  }
}

function routedFetch(routes) {
  return vi.fn(async (url, init = {}) => {
    const key = `${init.method ?? 'GET'} ${url}`
    const handler = routes[key]
    if (!handler) throw new Error(`route non mockée : ${key}`)
    return typeof handler === 'function' ? handler(init) : handler
  })
}

const today = new Date().toISOString().slice(0, 10)

const OVERVIEW = {
  periode: { jours: 30 },
  utilisateurs: {
    total: 42,
    nonActives: 3,
    actifsMaintenant: 5,
    sessionsAnonymes: 2,
    nouveauxPeriode: 7,
    parJour: [{ date: today, n: 2 }],
    parRole: [
      { role: 'apprenant', n: 30 },
      { role: 'admin', n: 1 },
    ],
  },
  cartographies: {
    total: 12,
    parType: { jour: 8, merge: 4 },
    avecDocument: 6,
    nouvellesPeriode: 3,
    parJour: [{ date: today, n: 1 }],
    partages: {
      actifs: 4,
      creesPeriode: 2,
      consultationsPeriode: 9,
      consultationsTotal: 21,
      consultationsParJour: [{ date: today, n: 9 }],
    },
  },
  finances: {
    soldes: { totalMicrousd: 6_500_000, comptesCredites: 2 },
    periode: { topup: { n: 1, microusd: 10_000_000 }, debit: { n: 3, microusd: -2_500_000 } },
    toutTemps: { topup: { n: 2, microusd: 20_000_000 }, debit: { n: 5, microusd: -3_500_000 } },
    parJour: [{ date: today, topup: 10_000_000, debit: -2_500_000, refund: 0, adjust: 0 }],
    paypal: {
      periode: { captures: 1, brutMicrousd: 10_000_000, rembourseMicrousd: 0 },
      toutTemps: { captures: 2, brutMicrousd: 20_000_000, rembourseMicrousd: 0 },
    },
  },
  tokens: {
    parJour: [
      {
        date: today,
        demo: { requetes: 12, entree: 30_000, sortie: 8_000, coutUsd: 0.42 },
        tuteur: null,
        twin9: { appels: 8, entree: 400_000, sortie: 200_000, depenseMicrousd: 2_500_000 },
      },
    ],
    periode: {
      demo: { requetes: 12, entree: 30_000, sortie: 8_000, coutUsd: 0.42 },
      tuteur: { requetes: 0, entree: 0, sortie: 0, coutUsd: 0 },
      twin9: { appels: 8, entree: 400_000, sortie: 200_000, depenseMicrousd: 2_500_000 },
    },
    toutTemps: {
      demo: { requetes: 17, entree: 40_000, sortie: 10_000, coutUsd: 0.52 },
      tuteur: { requetes: 0, entree: 0, sortie: 0, coutUsd: 0 },
      twin9: { appels: 12, entree: 500_000, sortie: 250_000, depenseMicrousd: 3_500_000 },
    },
    twin9ParModele: [
      { modele: 'claude-sonnet-5', appels: 8, entree: 400_000, sortie: 200_000, depenseMicrousd: 2_500_000 },
    ],
  },
  connexions: {
    periode: { reussies: 14, echouees: 3 },
    parJour: [{ date: today, reussies: 14, echouees: 3 }],
    parPays: [
      { pays: 'FR', n: 12 },
      { pays: null, n: 2 },
    ],
    dernieres: [
      {
        date: `${today}T10:00:00`,
        reussie: true,
        userId: 1,
        email: 'root@b.fr',
        displayName: 'Root',
        pays: 'FR',
        reseau: '203.0.113.0/24',
      },
      {
        date: `${today}T09:00:00`,
        reussie: false,
        userId: null,
        email: null,
        displayName: null,
        pays: 'DE',
        reseau: '198.51.100.0/24',
      },
    ],
  },
  votes: {
    electorat: [
      { id: 7, email: 'alice@b.fr', displayName: 'Alice' },
      { id: 8, email: 'bob@b.fr', displayName: 'Bob' },
      { id: 9, email: 'carol@b.fr', displayName: 'Carol' },
    ],
    competences: [
      {
        id: 3,
        label: 'R1 — Respiration consciente',
        semver: '7.1.1',
        soumiseLe: '2026-07-10T08:00:00',
        decompte: {
          electorateSize: 3,
          threshold: 2,
          pour: 2,
          contre: 0,
          abstention: 0,
          notVoted: 1,
          outcome: 'adopted',
          reached: true,
        },
        manquants: [{ id: 9, email: 'carol@b.fr', displayName: 'Carol' }],
      },
    ],
    referentiel: [],
  },
}

const ROLE_USERS = {
  users: [
    { id: 1, email: 'root@b.fr', displayName: 'Root Admin', createdAt: '2026-01-01T09:00:00', roles: ['admin'] },
  ],
  total: 1,
  page: 1,
  pageSize: 20,
}

const ROUTES = {
  'GET api/admin/monitoring?days=30': jsonResponse(200, OVERVIEW),
  'GET api/admin/users?role=admin': jsonResponse(200, ROLE_USERS),
}

describe('MonitoringSection', () => {
  it('affiche les tuiles de synthèse et les agrégats', async () => {
    render(<MonitoringSection fetchFn={routedFetch(ROUTES)} />)

    await screen.findByText('connectés maintenant')
    expect(screen.getByText('42')).toBeTruthy() // comptes
    expect(screen.getByText('crédits en circulation')).toBeTruthy()
    expect(screen.getByText('6,50 $')).toBeTruthy() // solde global
    // Dépense période = 0,42 (démo) + 2,50 (Twin9) = 2,92 $.
    expect(screen.getByText('2,92 $')).toBeTruthy()
    // Journal des connexions : pays et réseau tronqué, jamais d'IP complète.
    expect(screen.getByText('203.0.113.0/24')).toBeTruthy()
    expect(within(screen.getByText('root@b.fr').closest('tr')).getByText('OK')).toBeTruthy()
  })

  it('change de période : nouvel appel avec days=7', async () => {
    const fetchFn = routedFetch({
      ...ROUTES,
      'GET api/admin/monitoring?days=7': jsonResponse(200, OVERVIEW),
    })
    render(<MonitoringSection fetchFn={fetchFn} />)
    await screen.findByText('connectés maintenant')

    fireEvent.click(screen.getByRole('button', { name: '7 j' }))
    await screen.findByText('connectés maintenant')
    expect(fetchFn.mock.calls.some(([url]) => String(url).includes('days=7'))).toBe(true)
  })

  it('votes : verdict, décompte et retardataires à relancer par mail', async () => {
    render(<MonitoringSection fetchFn={routedFetch(ROUTES)} />)

    await screen.findByText('R1 — Respiration consciente')
    expect(screen.getByText('Majorité atteinte — entérinable')).toBeTruthy()
    expect(screen.getByText(/Pour 2 · Contre 0/)).toBeTruthy()
    const relance = screen.getByRole('link', { name: 'écrire aux retardataires' })
    expect(relance.getAttribute('href')).toContain('mailto:')
    expect(relance.getAttribute('href')).toContain(encodeURIComponent('carol@b.fr'))
  })

  it('comptes par rôle : liste le rôle choisi et permet d’en changer', async () => {
    const fetchFn = routedFetch({
      ...ROUTES,
      'GET api/admin/users?role=epistemiarque': jsonResponse(200, {
        users: [
          { id: 7, email: 'alice@b.fr', displayName: 'Alice', createdAt: '2026-03-01T09:00:00', roles: ['epistemiarque'] },
        ],
        total: 1,
        page: 1,
        pageSize: 20,
      }),
    })
    render(<MonitoringSection fetchFn={fetchFn} />)

    await screen.findByText('Root Admin') // rôle admin par défaut
    fireEvent.change(screen.getByLabelText('Rôle'), { target: { value: 'epistemiarque' } })
    await screen.findByText('Alice')
    expect(screen.queryByText('Root Admin')).toBeNull()
  })

  it('signale une erreur de chargement', async () => {
    const fetchFn = routedFetch({
      'GET api/admin/monitoring?days=30': jsonResponse(500, { error: 'boom' }),
      'GET api/admin/users?role=admin': jsonResponse(200, ROLE_USERS),
    })
    render(<MonitoringSection fetchFn={fetchFn} />)
    await screen.findByRole('alert')
  })
})

describe('formats fr-FR', () => {
  it('usd : micro-USD signés vers dollars', () => {
    expect(usd(6_500_000)).toBe('6,50 $')
    expect(usd(-2_500_000)).toBe('-2,50 $')
    expect(usd(0)).toBe('0,00 $')
  })

  it('nb : groupement fr et compactage au-delà du million', () => {
    expect(nb(1234)).toBe((1234).toLocaleString('fr-FR'))
    expect(nb(2_400_000)).toBe(`2,4 M`)
  })
})
