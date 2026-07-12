// Espace cartographe (P9) : garde de rôle, accueil (invitation, apprentis,
// file des cartographies à relire), formation parcours cartographe.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import CartographeView from './CartographeView.jsx'
import { resetApiClient } from '../api/client.js'
import { listChapters } from './espace/formation-content.js'

afterEach(() => {
  cleanup()
  resetApiClient()
})

function jsonResponse(status, data) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => (name.toLowerCase() === 'content-type' ? 'application/json' : null) },
    json: async () => data,
  }
}

/** Faux fetch routé par 'MÉTHODE url' — indépendant de l'ordre des requêtes. */
function routedFetch(routes) {
  return vi.fn(async (url, init = {}) => {
    const key = `${init.method ?? 'GET'} ${url}`
    const handler = routes[key]
    if (!handler) throw new Error(`route non mockée : ${key}`)
    return typeof handler === 'function' ? handler(init) : handler
  })
}

const anonyme = async () => ({ user: null })
const apprenant = async () => ({
  user: { email: 'a@b.fr', displayName: 'Maya', roles: ['apprenant'] },
})
const cartographe = async () => ({
  user: { email: 'c@b.fr', displayName: 'Carla', roles: ['apprenant', 'cartographe'] },
})

const QUEUE = {
  cartographies: [
    {
      id: 12,
      titre: 'Journée du 05/01/2026',
      type: 'jour',
      apprenant: { id: 1, displayName: 'Maya' },
      createdAt: '2026-07-02T10:00:00Z',
      garantie: null,
    },
    {
      id: 13,
      titre: 'Parcours janvier',
      type: 'merge',
      apprenant: { id: 1, displayName: 'Maya' },
      createdAt: '2026-07-03T10:00:00Z',
      garantie: { par: 'Carla', date: '2026-07-04T10:00:00Z', revisionId: null },
    },
  ],
}
const APPRENTIS = {
  apprentis: [{ id: 1, displayName: 'Maya', linkedAt: '2026-07-01T10:00:00Z' }],
}

function accueilRoutes(extra = {}) {
  return {
    'GET api/cartographe/apprentis': jsonResponse(200, APPRENTIS),
    'GET api/cartographe/cartographies': jsonResponse(200, QUEUE),
    ...extra,
  }
}

describe('CartographeView — garde de rôle', () => {
  it('visiteur anonyme : espace réservé + explication du rôle + invite à se connecter', async () => {
    render(<CartographeView section={null} deps={{ fetchMeFn: anonyme }} />)
    const reserve = await screen.findByTestId('cartographe-reserve')
    expect(reserve.textContent).toContain('réservé aux cartographes')
    expect(reserve.textContent).toContain('contrôle qualité')
    expect(screen.getByText(/Connectez-vous/)).toBeTruthy()
    // Pas d'espace de travail : ni file, ni saisie de code.
    expect(screen.queryByLabelText('Code d’invitation')).toBeNull()
  })

  it('connecté SANS le rôle cartographe : espace réservé, pas de file', async () => {
    render(<CartographeView section={null} deps={{ fetchMeFn: apprenant }} />)
    await screen.findByTestId('cartographe-reserve')
    expect(screen.queryByTestId('cartographe-queue')).toBeNull()
    expect(screen.queryByLabelText('Code d’invitation')).toBeNull()
  })

  it('rôle cartographe : accueil avec saisie de code, apprentis et file', async () => {
    const fetchFn = routedFetch(accueilRoutes())
    render(<CartographeView section={null} deps={{ fetchMeFn: cartographe, fetchFn }} />)

    // Saisie d'un code d'invitation (rôle présent).
    await screen.findByLabelText('Code d’invitation')

    // Mes apprentis.
    const apprentis = await screen.findByTestId('apprentis-list')
    expect(apprentis.textContent).toContain('Maya')

    // File des cartographies à relire, avec lien de relecture et badge garantie.
    const queue = await screen.findByTestId('cartographe-queue')
    const rows = within(queue).getAllByRole('row').slice(1) // sans l'en-tête
    expect(rows).toHaveLength(2)
    expect(rows[0].querySelector('a[href="#/cartographe/relecture/12"]')).toBeTruthy()
    expect(rows[0].textContent).toContain('À relire')
    expect(rows[1].textContent).toContain('Garantie par Carla')
  })
})

describe('CartographeView — accepter une invitation', () => {
  it('code valide : POST accept puis rechargement des listes', async () => {
    let accepted = false
    const fetchFn = routedFetch(
      accueilRoutes({
        'POST api/cartographe/invitations/K7TQZ2M9RC/accept': () => {
          accepted = true
          return jsonResponse(200, { apprenant: { displayName: 'Noé' } })
        },
      }),
    )
    render(<CartographeView section={null} deps={{ fetchMeFn: cartographe, fetchFn }} />)

    const input = await screen.findByLabelText('Code d’invitation')
    fireEvent.change(input, { target: { value: 'k7tqz2m9rc' } }) // normalisé en majuscules
    fireEvent.click(screen.getByRole('button', { name: 'Accepter l’invitation' }))

    await waitFor(() => expect(accepted).toBe(true))
    await screen.findByText(/Invitation acceptée/)
  })

  it('code au mauvais format : refus local, aucun appel réseau', async () => {
    const fetchFn = routedFetch(accueilRoutes())
    render(<CartographeView section={null} deps={{ fetchMeFn: cartographe, fetchFn }} />)

    const input = await screen.findByLabelText('Code d’invitation')
    fireEvent.change(input, { target: { value: 'ABC' } })
    fireEvent.click(screen.getByRole('button', { name: 'Accepter l’invitation' }))

    await screen.findByText(/10 caractères/)
    expect(
      fetchFn.mock.calls.some(([url]) => String(url).includes('invitations')),
    ).toBe(false)
  })
})

describe('CartographeView — formation cartographe', () => {
  it('liste les chapitres du parcours cartographe avec liens #/cartographe/formation/…', async () => {
    render(<CartographeView section="formation" deps={{ fetchMeFn: anonyme }} />)

    expect(await screen.findByText('Formation cartographe')).toBeTruthy()
    const chapters = listChapters('cartographe')
    expect(chapters.length).toBeGreaterThan(0)
    const first = chapters[0]
    const link = screen.getByRole('link', { name: first.titre })
    expect(link.getAttribute('href')).toBe(`#/cartographe/formation/${first.slug}`)
  })

  it('rend un chapitre du parcours cartographe (Markdown embarqué)', async () => {
    const chapters = listChapters('cartographe')
    render(
      <CartographeView
        section={`formation/${chapters[0].slug}`}
        deps={{ fetchMeFn: anonyme }}
      />,
    )
    const article = await screen.findByTestId('formation-chapitre')
    expect(article.textContent).toContain('cartographe')
    expect(screen.getByRole('link', { name: '← Tous les chapitres' }).getAttribute('href')).toBe(
      '#/cartographe/formation',
    )
  })
})

describe('CartographeView — sections', () => {
  it('section inconnue : alerte + retour à l’accueil', async () => {
    render(<CartographeView section="inconnue" deps={{ fetchMeFn: cartographe }} />)
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('inconnue')
  })
})
