// Mes cohortes, côté apprenant (P11) : consentement RGPD explicite affiché
// AVANT le bouton, jointure par code ({consentement: true} dans le corps),
// dépôt du portfolio LOCAL dans la cohorte (opt-in de fait), départ documenté
// (le consentement est retiré, les cartographies produites restent).
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import CohorteSection, { CONSENT_TEXT } from './CohorteSection.jsx'
import { resetApiClient } from '../../api/client.js'
import { createMemoryAdapter, createPortfolioStore } from '../../lib/portfolio-store.js'

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

const connecte = { status: 'authenticated', user: { email: 'a@b.fr', displayName: 'Maya' } }
const anonyme = { status: 'anonymous', user: null }

const MES_COHORTES = {
  cohortes: [
    {
      id: 7,
      nom: 'BTS SIO 2026',
      etablissement: 'Lycée Astrolabe',
      joinedAt: '2026-07-02T10:00:00Z',
      portfolioDepose: false,
    },
  ],
}

async function seededStore() {
  const store = createPortfolioStore(createMemoryAdapter())
  const record = await store.create({
    titre: 'Journal Astrolabe',
    texte: 'Jour 1…\n\nJour 2…',
    segments: [
      { date: '2026-01-05', texte: 'Jour 1…', debut: 0, fin: 7 },
      { date: '2026-01-06', texte: 'Jour 2…', debut: 9, fin: 16 },
    ],
  })
  return { store, record }
}

describe('CohorteSection (apprenant) — accès', () => {
  it('anonyme : invite à se connecter, aucun formulaire de jointure', () => {
    render(<CohorteSection session={anonyme} />)
    expect(screen.getByTestId('cohortes-anonyme').textContent).toContain('connectez-vous')
    expect(screen.queryByLabelText('Code d’invitation')).toBeNull()
  })
})

describe('CohorteSection (apprenant) — rejoindre avec consentement explicite', () => {
  it('le texte RGPD exact est affiché AVANT le bouton de jointure', async () => {
    const fetchFn = routedFetch({ 'GET api/cohortes': jsonResponse(200, { cohortes: [] }) })
    render(<CohorteSection session={connecte} fetchFn={fetchFn} />)

    const consentBlock = await screen.findByTestId('cohorte-consent-texte')
    // Le texte du contrat M8 : « l'établissement verra les cartographies
    // produites dans ce cadre » — affiché tel quel.
    expect(consentBlock.textContent).toContain(
      'l’établissement verra les cartographies produites dans ce cadre',
    )
    expect(consentBlock.textContent).toContain(CONSENT_TEXT)

    // Le bloc de consentement PRÉCÈDE le bouton dans le DOM.
    const button = screen.getByRole('button', { name: 'Rejoindre la cohorte' })
    expect(
      consentBlock.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    // Sans case cochée, le bouton est inactif : pas de consentement implicite.
    expect(button.disabled).toBe(true)
  })

  it('jointure : POST /cohortes/{code}/rejoindre avec {consentement: true}', async () => {
    let joined = null
    const fetchFn = routedFetch({
      'GET api/cohortes': jsonResponse(200, MES_COHORTES),
      'POST api/cohortes/COHORTE7AZ/rejoindre': (init) => {
        joined = JSON.parse(init.body)
        return jsonResponse(200, { cohorte: { id: 7, nom: 'BTS SIO 2026' } })
      },
    })
    render(<CohorteSection session={connecte} fetchFn={fetchFn} />)

    fireEvent.change(await screen.findByLabelText('Code d’invitation'), {
      target: { value: 'cohorte7az' }, // normalisé en majuscules
    })
    fireEvent.click(screen.getByRole('checkbox', { name: /consentement explicite/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Rejoindre la cohorte' }))

    await waitFor(() => expect(joined).toEqual({ consentement: true }))
    const info = await screen.findByTestId('cohorte-info')
    expect(info.textContent).toContain('consentement est enregistré')
  })

  it('sans consentement coché : bouton désactivé, aucun POST possible', async () => {
    const fetchFn = routedFetch({ 'GET api/cohortes': jsonResponse(200, { cohortes: [] }) })
    render(<CohorteSection session={connecte} fetchFn={fetchFn} />)

    fireEvent.change(await screen.findByLabelText('Code d’invitation'), {
      target: { value: 'COHORTE7AZ' },
    })
    expect(screen.getByRole('button', { name: 'Rejoindre la cohorte' }).disabled).toBe(true)
    expect(fetchFn.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false)
  })
})

describe('CohorteSection (apprenant) — dépôt du portfolio local', () => {
  it('POST /cohortes/{id}/portfolio {titre, texte, segments} depuis le store local', async () => {
    const { store, record } = await seededStore()
    let deposited = null
    const fetchFn = routedFetch({
      'GET api/cohortes': jsonResponse(200, MES_COHORTES),
      'POST api/cohortes/7/portfolio': (init) => {
        deposited = JSON.parse(init.body)
        return jsonResponse(201, { ok: true })
      },
    })
    render(<CohorteSection session={connecte} portfolioStore={store} fetchFn={fetchFn} />)

    // L'avertissement d'opt-in est visible : le dépôt envoie le portfolio.
    await screen.findByTestId('cohorte-liste')
    expect(screen.getByText(/envoie ce portfolio au serveur/)).toBeTruthy()

    fireEvent.change(screen.getByLabelText('Portfolio à déposer'), {
      target: { value: record.id },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Déposer dans la cohorte' }))

    await waitFor(() => expect(deposited).not.toBeNull())
    expect(deposited).toEqual({
      titre: 'Journal Astrolabe',
      texte: 'Jour 1…\n\nJour 2…',
      segments: record.segments,
    })
    const info = await screen.findByTestId('cohorte-info')
    expect(info.textContent).toContain('déposé dans la cohorte')
  })

  it('aucun portfolio local : lien vers la création, pas de bouton de dépôt', async () => {
    const store = createPortfolioStore(createMemoryAdapter())
    const fetchFn = routedFetch({ 'GET api/cohortes': jsonResponse(200, MES_COHORTES) })
    render(<CohorteSection session={connecte} portfolioStore={store} fetchFn={fetchFn} />)

    await screen.findByTestId('cohorte-liste')
    expect(await screen.findByText(/créez d’abord un portfolio/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Déposer dans la cohorte' })).toBeNull()
  })
})

describe('CohorteSection (apprenant) — quitter la cohorte', () => {
  it('DELETE /cohortes/{id}/quitter en deux temps, avec le devenir des cartographies', async () => {
    let quit = false
    const fetchFn = routedFetch({
      'GET api/cohortes': jsonResponse(200, MES_COHORTES),
      'DELETE api/cohortes/7/quitter': () => {
        quit = true
        return jsonResponse(204, null)
      },
    })
    const { store } = await seededStore()
    render(<CohorteSection session={connecte} portfolioStore={store} fetchFn={fetchFn} />)

    // L'effet du départ est documenté à côté du bouton (en plus du texte de
    // consentement de la jointure).
    const liste = await screen.findByTestId('cohorte-liste')
    expect(liste.textContent).toContain('Quitter retire votre consentement pour la suite')
    expect(liste.textContent).toContain('les cartographies déjà produites restent à vous')

    // Deux temps : armer puis confirmer (pas de départ sur un clic isolé).
    fireEvent.click(screen.getByRole('button', { name: 'Quitter la cohorte' }))
    expect(quit).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: 'Confirmer le départ' }))

    await waitFor(() => expect(quit).toBe(true))
    const info = await screen.findByTestId('cohorte-info')
    expect(info.textContent).toContain('consentement est retiré')
    expect(info.textContent).toContain('restent à vous')
  })
})
