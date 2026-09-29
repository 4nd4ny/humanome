// UC-APP-08 — Rejoindre une cohorte, déposer son portfolio, quitter : tests
// UNITAIRES (front).
// Fiche : docs/cas-utilisation/apprenant/UC-APP-08-rejoindre-cohorte.md
//
// Code sollicité appelé directement : le texte de consentement affiché, et le
// composant CohorteSection rendu isolément (lecture de GET api/cohortes dans
// la forme RÉELLE de l'API, contrôles locaux avant jointure, garde du dépôt
// quand le portfolio local a disparu, départ en deux temps). La lecture des
// documents de masse pour l'export (archive.js, defaultGetMassDocuments) est
// testée unitairement par UC-APP-06-U09.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import CohorteSection, { CONSENT_TEXT } from '../../../src/views/espace/CohorteSection.jsx'
import { createMemoryAdapter, createPortfolioStore } from '../../../src/lib/portfolio-store.js'
import { resetApiClient } from '../../../src/api/client.js'
import { createFakeApi, jsonResponse, noContentResponse } from '../support/apps.js'

const connecte = { status: 'authenticated', user: { email: 'elise@example.org', displayName: 'Élise' } }

afterEach(() => {
  cleanup()
  resetApiClient()
})

describe('UC-APP-08 — texte de consentement', () => {
  it('UC-APP-08-U08 — le texte dit ce que voit l’établissement, ce qui reste local et l’effet du départ', () => {
    expect(CONSENT_TEXT).toContain('l’établissement verra les cartographies produites dans ce cadre')
    expect(CONSENT_TEXT).toContain('(et uniquement celles-là)')
    expect(CONSENT_TEXT).toContain(
      'Vos portfolios restent dans votre navigateur tant que vous ne les déposez pas explicitement',
    )
    expect(CONSENT_TEXT).toContain('cela retire votre consentement pour la suite')
    expect(CONSENT_TEXT).toContain('les cartographies déjà produites restent à vous')
  })
})

describe('UC-APP-08 — CohorteSection isolé', () => {
  it('UC-APP-08-U09 — lit la liste dans la forme réelle de GET api/cohortes (tableau) : établissement, date, état du dépôt', async () => {
    const api = createFakeApi([
      [
        'GET',
        'cohortes',
        () =>
          jsonResponse(200, [
            {
              id: 7,
              nom: 'BTS SIO 2026',
              etablissement: 'Lycée Astrolabe',
              joinedAt: '2026-07-02T10:00:00',
              portfolioDepose: false,
              portfolio: null,
            },
            {
              id: 9,
              nom: 'Terminale B',
              etablissement: 'Lycée Astrolabe',
              joinedAt: '2026-07-03T10:00:00',
              portfolioDepose: true,
              portfolio: { titre: 'Journal', journees: 2, deposeLe: '2026-07-04T10:00:00' },
            },
          ]),
      ],
    ])
    render(<CohorteSection session={connecte} portfolioStore={createPortfolioStore(createMemoryAdapter())} fetchFn={api.fetch} />)

    const items = within(await screen.findByTestId('cohorte-liste')).getAllByRole('listitem')
    expect(items[0].textContent).toContain('BTS SIO 2026 — Lycée Astrolabe (rejointe le 02/07/2026)')
    expect(items[0].textContent).toContain('Portfolio non déposé')
    expect(items[1].textContent).toContain('Portfolio déposé')
    // Un dépôt existant masque le formulaire de dépôt.
    expect(within(items[1]).queryByText(/créez d’abord un portfolio/)).toBeNull()
    expect(within(items[1]).queryByLabelText('Portfolio à déposer')).toBeNull()
  })

  it('UC-APP-08-U10 — submitJoin : code vide refusé localement ; code rogné et mis en majuscules dans l’URL', async () => {
    const api = createFakeApi([
      ['GET', 'cohortes', () => jsonResponse(200, [])],
      ['POST', 'cohortes/K7TQZ2M9RC/rejoindre', () => jsonResponse(201, { cohorteId: 7, nom: 'BTS', consentement: '…' })],
    ])
    render(<CohorteSection session={connecte} portfolioStore={createPortfolioStore(createMemoryAdapter())} fetchFn={api.fetch} />)
    await screen.findByText('Vous n’avez rejoint aucune cohorte pour l’instant.')

    fireEvent.click(screen.getByRole('checkbox', { name: /consentement explicite/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Rejoindre la cohorte' }))
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Saisissez le code d’invitation transmis par votre établissement.',
    )
    expect(api.requests.filter((r) => r.method === 'POST')).toEqual([])

    fireEvent.change(screen.getByLabelText('Code d’invitation'), { target: { value: '  k7tqz2m9rc ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Rejoindre la cohorte' }))
    expect((await screen.findByTestId('cohorte-info')).textContent).toContain('consentement est enregistré')
    const post = api.requests.find((r) => r.method === 'POST')
    expect(post).toMatchObject({ path: 'cohortes/K7TQZ2M9RC/rejoindre', body: { consentement: true } })
  })

  it('UC-APP-08-U11 — onDeposit : portfolio local disparu entre-temps → « Portfolio local introuvable. », aucun envoi', async () => {
    const record = { id: 'p1', titre: 'Journal', texte: 'x', segments: [{ date: '2026-01-05', texte: 'x' }] }
    const portfolioStore = { list: vi.fn(async () => [record]), get: vi.fn(async () => undefined) }
    const api = createFakeApi([
      [
        'GET',
        'cohortes',
        () => jsonResponse(200, [{ id: 7, nom: 'BTS SIO 2026', etablissement: 'Lycée', joinedAt: null, portfolioDepose: false }]),
      ],
    ])
    render(<CohorteSection session={connecte} portfolioStore={portfolioStore} fetchFn={api.fetch} />)

    fireEvent.change(await screen.findByLabelText('Portfolio à déposer'), { target: { value: 'p1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Déposer dans la cohorte' }))

    expect((await screen.findByRole('alert')).textContent).toBe('Portfolio local introuvable.')
    expect(portfolioStore.get).toHaveBeenCalledWith('p1')
    expect(api.requests.filter((r) => r.method === 'POST')).toEqual([])
  })

  it('UC-APP-08-U12 — onQuit : premier clic = armement sans requête ; l’armement suit la dernière cohorte cliquée ; la confirmation envoie DELETE', async () => {
    const cohortes = [
      { id: 7, nom: 'BTS SIO 2026', etablissement: 'Lycée Astrolabe', joinedAt: null, portfolioDepose: true },
      { id: 9, nom: 'Terminale B', etablissement: 'Lycée Astrolabe', joinedAt: null, portfolioDepose: true },
    ]
    const api = createFakeApi([
      ['GET', 'cohortes', () => jsonResponse(200, cohortes)],
      ['DELETE', 'cohortes/9/quitter', () => noContentResponse()],
    ])
    render(<CohorteSection session={connecte} portfolioStore={createPortfolioStore(createMemoryAdapter())} fetchFn={api.fetch} />)
    const [bts, terminale] = within(await screen.findByTestId('cohorte-liste')).getAllByRole('listitem')
    const deletes = () => api.requests.filter((r) => r.method === 'DELETE')

    fireEvent.click(within(bts).getByRole('button', { name: 'Quitter la cohorte' }))
    expect(within(bts).getByRole('button', { name: 'Confirmer le départ' })).toBeDefined()
    expect(deletes()).toEqual([])

    // Un clic sur l'autre cohorte déplace l'armement (une seule armée à la fois).
    fireEvent.click(within(terminale).getByRole('button', { name: 'Quitter la cohorte' }))
    expect(within(bts).getByRole('button', { name: 'Quitter la cohorte' })).toBeDefined()
    expect(within(terminale).getByRole('button', { name: 'Confirmer le départ' })).toBeDefined()
    expect(deletes()).toEqual([])

    fireEvent.click(within(terminale).getByRole('button', { name: 'Confirmer le départ' }))
    expect((await screen.findByTestId('cohorte-info')).textContent).toContain('Vous avez quitté la cohorte « Terminale B »')
    expect(deletes().map((r) => r.path)).toEqual(['cohortes/9/quitter'])
  })
})
