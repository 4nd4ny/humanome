// UC-ETA-01 — Créer et gérer une cohorte : tests UNITAIRES (front).
// Fiche : docs/cas-utilisation/etablissement/UC-ETA-01-gerer-cohorte.md
//
// Code sollicité appelé directement : le routeur par hash (#/etablissement et
// ses sections), les appels de etablissement-api.js (création, liste, détail
// normalisé, suppression — jeton CSRF sur les mutations), le formatage des
// dates, puis les composants rendus ISOLÉMENT (hors <App/>) avec leurs
// coutures : EtablissementView (garde de rôle, deps.fetchMeFn), AccueilSection
// et CohorteSection (fetchFn). Réseau simulé par la couture fetchFn.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { parseHash } from '../../../src/router.js'
import { ApiUnavailableError, apiFetch, resetApiClient } from '../../../src/api/client.js'
import EtablissementView from '../../../src/views/EtablissementView.jsx'
import AccueilSection from '../../../src/views/etablissement/AccueilSection.jsx'
import CohorteSection from '../../../src/views/etablissement/CohorteSection.jsx'
import {
  createCohorte,
  deleteCohorte,
  fetchCohorte,
  fetchCohortes,
  frDate,
} from '../../../src/views/etablissement/etablissement-api.js'
import {
  CSRF,
  cohorteDetail,
  cohorteListItem,
  configProjection,
  ETAB_USER,
  fakeFetch,
  jsonResponse,
  LEARNER_USER,
  membre,
  noContent,
  PUBLISHED_PACKAGES,
} from '../support/eta.js'

afterEach(() => {
  cleanup()
  resetApiClient()
})

/** Amorce le jeton CSRF en mémoire comme le fait GET api/auth/me. */
async function primeCsrf() {
  await apiFetch('auth/me', { fetchFn: async () => jsonResponse(200, { user: {}, csrfToken: CSRF }) })
}

describe('UC-ETA-01 — routeur de l’espace établissement', () => {
  it('UC-ETA-01-U07 — #/etablissement ouvre l’accueil, #/etablissement/cohorte/<id> la section cohorte', () => {
    expect(parseHash('#/etablissement')).toEqual({ name: 'etablissement', section: null })
    expect(parseHash('#/etablissement/cohorte/7')).toEqual({ name: 'etablissement', section: 'cohorte/7' })
  })
})

describe('UC-ETA-01 — client API des cohortes', () => {
  it('UC-ETA-01-U08 — fetchCohortes accepte la liste nue de l’API (et l’enveloppe {cohortes})', async () => {
    const bare = vi.fn().mockResolvedValue(jsonResponse(200, [cohorteListItem()]))
    expect(await fetchCohortes(bare)).toEqual([cohorteListItem()])
    expect(bare.mock.calls[0][0]).toBe('api/etablissement/cohortes')

    const wrapped = vi.fn().mockResolvedValue(jsonResponse(200, { cohortes: [cohorteListItem({ id: 8 })] }))
    expect((await fetchCohortes(wrapped)).map((c) => c.id)).toEqual([8])

    const garbage = vi.fn().mockResolvedValue(jsonResponse(200, { autre: true }))
    expect(await fetchCohortes(garbage)).toEqual([])
  })

  it('UC-ETA-01-U09 — createCohorte : POST {nom} en JSON avec le jeton CSRF de la session', async () => {
    await primeCsrf()
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(201, { id: 8, codeInvitation: 'NOUVCODE42' }))

    const created = await createCohorte('CAP Cuisine', fetchFn)

    expect(created).toEqual({ id: 8, codeInvitation: 'NOUVCODE42' })
    const [url, init] = fetchFn.mock.calls[0]
    expect(url).toBe('api/etablissement/cohortes')
    expect(init.method).toBe('POST')
    expect(init.headers['X-CSRF-Token']).toBe(CSRF)
    expect(JSON.parse(init.body)).toEqual({ nom: 'CAP Cuisine' })
  })

  it('UC-ETA-01-U10 — fetchCohorte normalise le détail À PLAT de l’API (membres, dépôt, avancement)', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      jsonResponse(
        200,
        cohorteDetail({
          membres: [
            membre({ avancement: { jobsTotal: 3, jobsDone: 1 } }),
            // Replis snake_case du contrat, valeurs textuelles converties.
            membre({ userId: 13, displayName: 'Noé', portfolio: null, avancement: { jobs_total: '2', jobs_done: '0' } }),
            // Avancement absent → null ; taille 0 → null.
            membre({ userId: 14, displayName: 'Lila', avancement: undefined, portfolio: { titre: 'T', journees: 1, taille: 0 } }),
          ],
        }),
      ),
    )

    const { cohorte, membres } = await fetchCohorte(7, fetchFn)

    expect(fetchFn.mock.calls[0][0]).toBe('api/etablissement/cohortes/7')
    expect(cohorte).toEqual({ id: 7, nom: 'BTS SIO 2026', codeInvitation: 'COHORTE7AZ' })
    expect(membres).toEqual([
      {
        userId: 12,
        displayName: 'Maya',
        email: null,
        consentAt: '2026-07-02T10:00:00',
        portfolio: { titre: 'Journal Astrolabe', journees: 3, taille: 9000, deposeLe: '2026-07-03T10:00:00' },
        avancement: { jobsTotal: 3, jobsDone: 1 },
      },
      {
        userId: 13,
        displayName: 'Noé',
        email: null,
        consentAt: '2026-07-02T10:00:00',
        portfolio: null,
        avancement: { jobsTotal: 2, jobsDone: 0 },
      },
      {
        userId: 14,
        displayName: 'Lila',
        email: null,
        consentAt: '2026-07-02T10:00:00',
        portfolio: { titre: 'T', journees: 1, taille: null, deposeLe: null },
        avancement: null,
      },
    ])
  })

  it('UC-ETA-01-U11 — deleteCohorte : DELETE avec CSRF, 204 → null ; 404 → erreur « Cohorte introuvable »', async () => {
    await primeCsrf()
    const ok = vi.fn().mockResolvedValue(noContent())
    expect(await deleteCohorte(7, ok)).toBeNull()
    expect(ok.mock.calls[0][0]).toBe('api/etablissement/cohortes/7')
    expect(ok.mock.calls[0][1].method).toBe('DELETE')
    expect(ok.mock.calls[0][1].headers['X-CSRF-Token']).toBe(CSRF)

    const missing = vi.fn().mockResolvedValue(jsonResponse(404, { error: 'Cohorte introuvable' }))
    await expect(deleteCohorte(7, missing)).rejects.toMatchObject({ status: 404, message: 'Cohorte introuvable' })
  })

  it('UC-ETA-01-U12 — frDate : date ISO → jj/mm/aaaa, vide → « — », illisible → rendue telle quelle', () => {
    expect(frDate('2026-07-01T10:00:00')).toBe('01/07/2026')
    expect(frDate('')).toBe('—')
    expect(frDate(null)).toBe('—')
    expect(frDate('pas une date')).toBe('pas une date')
  })
})

/** Routes de l'accueil servies à la couture fetchFn (liste mutable). */
function accueilFetch(initial = [cohorteListItem(), cohorteListItem({ id: 8, nom: 'CAP Cuisine', codeInvitation: 'NOUVCODE42' })]) {
  let cohortes = initial
  return fakeFetch({
    'GET api/etablissement/cohortes': () => jsonResponse(200, cohortes),
    'GET api/etablissement/config': jsonResponse(200, configProjection()),
    'POST api/etablissement/cohortes': (init) => {
      const { nom } = JSON.parse(init.body)
      cohortes = [...cohortes, cohorteListItem({ id: 9, nom, codeInvitation: 'CODE9ABCDE', membres: 0 })]
      return jsonResponse(201, { id: 9, codeInvitation: 'CODE9ABCDE' })
    },
  })
}

describe('UC-ETA-01 — composants de l’espace établissement rendus isolément', () => {
  it('UC-ETA-01-U13 — EtablissementView : garde de rôle (établissement, autre rôle, visiteur, API indisponible) et section inconnue', async () => {
    const view = (section, fetchMeFn, fetchFn) =>
      render(createElement(EtablissementView, { section, deps: { fetchMeFn, fetchFn } }))

    // Rôle établissement → accueil (cohortes + configuration).
    const net = accueilFetch()
    view(null, async () => ({ user: ETAB_USER }), net.fetchMock)
    expect(await screen.findByLabelText('Nom de la cohorte')).toBeDefined()
    expect(screen.getByTestId('etab-connecte').textContent).toContain('Lycée Astrolabe')
    expect(screen.queryByTestId('etab-reserve')).toBeNull()
    cleanup()

    // Autre rôle (apprenant connecté) → espace réservé, sans invitation à se connecter.
    const silent = fakeFetch()
    view(null, async () => ({ user: LEARNER_USER }), silent.fetchMock)
    expect((await screen.findByTestId('etab-reserve')).textContent).toContain('réservé aux établissements')
    expect(screen.queryByText(/Connectez-vous/)).toBeNull()
    cleanup()

    // Visiteur (user null) → espace réservé + invitation à se connecter.
    view(null, async () => ({ user: null }), silent.fetchMock)
    await screen.findByTestId('etab-reserve')
    expect(screen.getByText(/Connectez-vous/)).toBeDefined()
    cleanup()

    // Copie statique (API absente) → message dédié, pas d'espace réservé.
    view(null, async () => {
      throw new ApiUnavailableError()
    }, silent.fetchMock)
    expect((await screen.findByText(/Copie statique du site/)).textContent).toContain('a besoin de l’API')
    expect(screen.queryByTestId('etab-reserve')).toBeNull()
    cleanup()

    // Section inconnue → alerte et lien de retour.
    view('inconnue/3', async () => ({ user: ETAB_USER }), silent.fetchMock)
    expect((await screen.findByRole('alert')).textContent).toBe('Section inconnue de l’espace établissement : « inconnue/3 ».')
    expect(screen.getByRole('link', { name: 'Retour à l’accueil de l’espace' }).getAttribute('href')).toBe('#/etablissement')
    expect(silent.calls).toEqual([])
  })

  it('UC-ETA-01-U14 — AccueilSection : nom nettoyé, nom vide refusé sans appel, suppression armée par ligne', async () => {
    const net = accueilFetch()
    render(createElement(AccueilSection, { fetchFn: net.fetchMock }))
    await screen.findByTestId('etab-cohortes')

    // Nom vide (espaces) : refus local, aucune requête.
    fireEvent.change(screen.getByLabelText('Nom de la cohorte'), { target: { value: '   ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Créer la cohorte' }))
    expect((await screen.findByRole('alert')).textContent).toBe('Donnez un nom à la cohorte (ex. « BTS SIO 2026 »).')
    expect(net.callsTo('POST api/etablissement/cohortes')).toHaveLength(0)

    // Nom entouré d'espaces : envoyé nettoyé, champ vidé, code affiché.
    fireEvent.change(screen.getByLabelText('Nom de la cohorte'), { target: { value: '  Seconde 4  ' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Créer la cohorte' }))
    })
    expect(net.callsTo('POST api/etablissement/cohortes')[0].body).toEqual({ nom: 'Seconde 4' })
    expect((await screen.findByTestId('etab-cohorte-creee')).textContent).toContain('Cohorte « Seconde 4 » créée.')
    expect(screen.getByLabelText('Nom de la cohorte').value).toBe('')

    // Suppression : le premier clic ARME la ligne, sans DELETE ; armer une
    // autre ligne désarme la première.
    const rows = within(await screen.findByTestId('etab-cohortes')).getAllByRole('row').slice(1)
    fireEvent.click(within(rows[0]).getByRole('button', { name: 'Supprimer' }))
    expect(within(rows[0]).getByRole('button', { name: 'Confirmer la suppression' })).toBeDefined()
    fireEvent.click(within(rows[1]).getByRole('button', { name: 'Supprimer' }))
    expect(within(rows[0]).getByRole('button', { name: 'Supprimer' })).toBeDefined()
    expect(within(rows[1]).getByRole('button', { name: 'Confirmer la suppression' })).toBeDefined()
    expect(net.calls.filter((c) => c.method === 'DELETE')).toEqual([])
  })

  it('UC-ETA-01-U15 — CohorteSection : avancement « — » sans job, « x/y journées », « Non déposé », badge « Sans consentement », erreur de chargement', async () => {
    const net = fakeFetch({
      'GET api/etablissement/cohortes/7': jsonResponse(
        200,
        cohorteDetail({
          membres: [
            membre(), // avancement {0, 0}
            membre({ userId: 13, displayName: 'Noé', portfolio: null, avancement: { jobsTotal: 4, jobsDone: 3 } }),
            // Forme jamais produite par l'API (l'adhésion EST le consentement) :
            // le composant prévoit tout de même le badge.
            membre({ userId: 14, displayName: 'Lila', consentAt: null }),
          ],
        }),
      ),
      'GET api/etablissement/config': jsonResponse(200, configProjection()),
      'GET api/prompt-packages': jsonResponse(200, PUBLISHED_PACKAGES),
    })
    render(createElement(CohorteSection, { id: '7', fetchFn: net.fetchMock }))

    const rows = within(await screen.findByTestId('etab-membres')).getAllByRole('row').slice(1)
    const cells = (row) => within(row).getAllByRole('cell').map((cell) => cell.textContent)
    expect(cells(rows[0])[4]).toBe('—')
    expect(cells(rows[1])[3]).toBe('Non déposé')
    expect(cells(rows[1])[4]).toBe('3/4 journées')
    expect(cells(rows[2])[2]).toBe('Sans consentement')
    expect(screen.getByText('COHORTE7AZ')).toBeDefined()
    cleanup()

    // Erreur de chargement : message serveur affiché, aucun code rappelé.
    const missing = fakeFetch({
      'GET api/etablissement/cohortes/99': jsonResponse(404, { error: 'Cohorte introuvable' }),
      'GET api/etablissement/config': jsonResponse(200, configProjection()),
      'GET api/prompt-packages': jsonResponse(200, PUBLISHED_PACKAGES),
    })
    render(createElement(CohorteSection, { id: '99', fetchFn: missing.fetchMock }))
    expect((await screen.findByRole('alert')).textContent).toBe('Cohorte introuvable')
    expect(screen.queryByText(/Code d’invitation/)).toBeNull()
    expect(screen.queryByTestId('etab-membres')).toBeNull()
  })
})
