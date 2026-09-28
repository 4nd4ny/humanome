// UC-ADM-06 — Consulter le monitoring : tests UNITAIRES (front).
// Fiche : docs/cas-utilisation/administration/UC-ADM-06-monitoring.md
//
// Code sollicité appelé directement : l'appel fetchMonitoring et les formats
// fr-FR (admin-api.js), la carte d'accueil de l'administration (AdminView) et
// le tableau de bord MonitoringSection rendu isolément (réseau injecté par
// fetchFn) : axe du temps continu sur N jours, tables de secours des
// graphiques, états vides, libellés des connexions sans pays ni compte.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { parseHash } from '../../../src/router.js'
import { resetApiClient } from '../../../src/api/client.js'
import { fetchMonitoring, nb, usd } from '../../../src/views/admin/admin-api.js'
import AdminView from '../../../src/views/AdminView.jsx'
import MonitoringSection from '../../../src/views/admin/MonitoringSection.jsx'
import { emptyOverview, isoDaysAgo, jsonResponse } from '../support/adm.js'

afterEach(() => {
  cleanup()
  resetApiClient()
})

const spaces = (s) => s.replace(/\s/g, ' ')

/** Réseau de MonitoringSection : le tableau de bord + la table des rôles. */
function monitoringFetch(overview) {
  return vi.fn(async (url) => {
    if (String(url).startsWith('api/admin/monitoring')) return jsonResponse(200, overview)
    if (String(url).startsWith('api/admin/users')) return jsonResponse(200, { users: [], total: 0, page: 1, pageSize: 20 })
    throw new Error(`route non mockée : ${url}`)
  })
}

/** Table « Voir les données » d'un graphique, par sa légende. */
function dataRowsOf(caption) {
  const figure = screen.getByText(caption, { selector: 'figcaption' }).closest('figure')
  return within(figure)
    .queryAllByRole('row', { hidden: true })
    .slice(1)
    .map((row) => [...row.children].map((cell) => cell.textContent))
}

describe('UC-ADM-06 — client et formats', () => {
  it('UC-ADM-06-U12 — fetchMonitoring : GET api/admin/monitoring?days=<N> (30 par défaut, valeur encodée)', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(200, emptyOverview()))

    await fetchMonitoring(undefined, fetchFn)
    await fetchMonitoring({ days: 7 }, fetchFn)
    await fetchMonitoring({ days: '7&x=1' }, fetchFn)

    expect(fetchFn.mock.calls.map(([url, init]) => [url, init.method])).toEqual([
      ['api/admin/monitoring?days=30', 'GET'],
      ['api/admin/monitoring?days=7', 'GET'],
      ['api/admin/monitoring?days=7%26x%3D1', 'GET'],
    ])
  })

  it('UC-ADM-06-U13 — usd / nb : micro-USD signés, valeurs non numériques → 0, compactage en millions', () => {
    expect(spaces(usd(12_500_000))).toBe('12,50 $')
    expect(spaces(usd(-2_500_000))).toBe('-2,50 $')
    expect(spaces(usd('n/a'))).toBe('0,00 $')
    expect(spaces(nb(1234))).toBe('1 234')
    expect(nb(undefined)).toBe('0')
    expect(nb(-1_500_000)).toBe('-1,5 M')
  })

  it('UC-ADM-06-U14 — accès : #/admin/monitoring routé, carte « Monitoring » en tête de l’accueil admin', async () => {
    expect(parseHash('#/admin/monitoring')).toEqual({ name: 'admin', section: 'monitoring' })

    const admin = async () => ({ user: { id: 1, email: 'root@b.fr', displayName: 'Root', roles: ['admin'] } })
    render(<AdminView section={null} deps={{ fetchMeFn: admin }} />)
    const home = await screen.findByRole('navigation', { name: 'Sections d’administration' })
    const first = within(home).getAllByRole('link')[0]
    expect(first.getAttribute('href')).toBe('#/admin/monitoring')
    expect(first.textContent).toContain('Activité, finances, connexions, votes')
  })
})

describe('UC-ADM-06 — tableau de bord (MonitoringSection isolé)', () => {
  it('UC-ADM-06-U15 — axe continu de N jours finissant aujourd’hui : hors fenêtre ignoré, jours à zéro omis de la table', async () => {
    const overview = emptyOverview(7)
    overview.connexions.parJour = [
      { date: isoDaysAgo(0), reussies: 3, echouees: 1 },
      { date: isoDaysAgo(2), reussies: 0, echouees: 0 },
      { date: isoDaysAgo(9), reussies: 50, echouees: 0 }, // hors de l'axe de 7 jours
    ]
    overview.connexions.periode = { reussies: 3, echouees: 1 }
    render(<MonitoringSection fetchFn={monitoringFetch(overview)} />)

    await screen.findByText('connectés maintenant')
    const rows = dataRowsOf('Connexions par jour')
    expect(rows).toHaveLength(1)
    expect(rows[0].slice(1)).toEqual(['3', '1'])
    expect(screen.getByRole('img', { name: 'Connexions par jour' })).toBeTruthy()
    expect(screen.getByText('max 4', { selector: 'text' })).toBeTruthy()
  })

  it('UC-ADM-06-U16 — états vides : « Aucune donnée / Aucun mouvement sur la période », journal vide, aucun vote', async () => {
    render(<MonitoringSection fetchFn={monitoringFetch(emptyOverview(30))} />)

    await screen.findByText('connectés maintenant')
    expect(screen.getAllByText('Aucune donnée sur la période.').length).toBe(4)
    expect(screen.getByText('Aucun mouvement sur la période.')).toBeTruthy()
    expect(screen.getByText('Aucune connexion journalisée.')).toBeTruthy()
    expect(screen.getByText(/Le journal démarre avec ce déploiement/)).toBeTruthy()
    expect(screen.getByText('Aucune proposition au vote actuellement.')).toBeTruthy()
  })

  it('UC-ADM-06-U17 — connexions : pays inconnu → « Inconnu » / « — », compte inconnu → « Compte inconnu », échec → « Échec »', async () => {
    const overview = emptyOverview(30)
    overview.connexions.parPays = [{ pays: null, n: 2 }]
    overview.connexions.dernieres = [
      { date: `${isoDaysAgo(0)}T10:00:00`, reussie: false, userId: null, email: null, displayName: null, pays: null, reseau: null },
    ]
    render(<MonitoringSection fetchFn={monitoringFetch(overview)} />)

    const row = (await screen.findByText('Compte inconnu')).closest('tr')
    expect([...row.children].map((c) => c.textContent).slice(1)).toEqual(['Compte inconnu', '—', '—', 'Échec'])
    expect(screen.getByRole('rowheader', { name: 'Inconnu' })).toBeTruthy()
  })

  it('UC-ADM-06-U18 — finances : barres divergentes, sorties = |débits + remboursements|, dépense période = démo + tuteur + Twin9', async () => {
    const overview = emptyOverview(30)
    overview.finances.parJour = [{ date: isoDaysAgo(0), topup: 10_000_000, debit: -2_000_000, refund: -1_000_000, adjust: 0 }]
    overview.tokens.periode.demo.coutUsd = 0.5
    overview.tokens.periode.tuteur.coutUsd = 0.25
    overview.tokens.periode.twin9.depenseMicrousd = 2_000_000
    render(<MonitoringSection fetchFn={monitoringFetch(overview)} />)

    await screen.findByText('connectés maintenant')
    const [row] = dataRowsOf('Mouvements par jour')
    expect(row.slice(1).map(spaces)).toEqual(['10,00 $', '3,00 $'])
    const tile = screen.getByText('dépense LLM période').closest('.mon-tile')
    expect(spaces(tile.textContent)).toContain('2,75 $')
  })
})
