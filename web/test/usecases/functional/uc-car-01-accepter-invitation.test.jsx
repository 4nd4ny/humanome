// UC-CAR-01 — Accepter l'invitation d'un apprenant : tests FONCTIONNELS (IHM).
// Fiche : docs/cas-utilisation/cartographe/UC-CAR-01-accepter-invitation.md
//
// Le scénario est joué sur l'application ENTIÈRE (<App/>) comme le ferait le
// cartographe : il ouvre #/cartographe, saisit le code reçu de l'apprenant et
// voit l'apprenant rejoindre « Mes apprentis » et sa file. Seul le réseau est
// simulé (fetch global, formes réelles de l'API).
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { resetApiClient } from '../../../src/api/client.js'
import {
  CSRF,
  jsonResponse,
  openCartographe,
  queueEntry,
  stubNetwork,
} from '../support/car.js'

beforeEach(() => resetApiClient())

afterEach(() => {
  cleanup()
  window.location.hash = ''
  resetApiClient()
})

async function submitCode(value) {
  fireEvent.change(await screen.findByLabelText('Code d’invitation'), { target: { value } })
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Accepter l’invitation' }))
  })
}

describe('UC-CAR-01 — le cartographe accepte le code reçu', () => {
  it('UC-CAR-01-F06 — nominal : code saisi en minuscules, mis en majuscules, accepté ; apprenti et file rechargés', async () => {
    let linked = false
    const net = stubNetwork({
      'GET api/cartographe/apprentis': () =>
        jsonResponse(200, linked ? [{ id: 1, displayName: 'Maya', linkedAt: '2026-07-01T09:00:00' }] : []),
      'GET api/cartographe/cartographies': () =>
        jsonResponse(200, linked ? [queueEntry({ titre: 'Journée du 5 janvier' })] : []),
      'POST api/cartographe/invitations/K7TQZ2M9RC/accept': () => {
        linked = true
        return jsonResponse(201, { apprenant: { id: 1, displayName: 'Maya' } })
      },
    })
    openCartographe()

    // 1. Espace ouvert (rôle cartographe), rien encore de rattaché.
    expect(await screen.findByTestId('cartographe-connecte')).toBeTruthy()
    expect(await screen.findByText(/Aucun apprenant rattaché pour l’instant/)).toBeTruthy()

    // 2-3. Code saisi en minuscules : l'IHM le passe en majuscules.
    await submitCode('k7tqz2m9rc')

    // 5-6. Confirmation, champ vidé, listes rechargées.
    expect((await screen.findByText(/Invitation acceptée/)).textContent).toContain(
      'l’apprenant est maintenant rattaché à vous',
    )
    expect(screen.getByLabelText('Code d’invitation').value).toBe('')
    const apprentis = await screen.findByTestId('apprentis-list')
    expect(apprentis.textContent).toContain('Maya')
    expect(apprentis.textContent).toContain('rattaché le 01/07/2026')
    const file = await screen.findByTestId('cartographe-queue')
    expect(within(file).getByText('Journée du 5 janvier')).toBeTruthy()

    // La requête : bonne URL, session + jeton CSRF de la session.
    const [accept] = net.called('POST api/cartographe/invitations/K7TQZ2M9RC/accept')
    expect(accept.headers['X-CSRF-Token']).toBe(CSRF)
    expect(net.called('GET api/cartographe/apprentis')).toHaveLength(2) // montage + rechargement
  })

  it('UC-CAR-01-F07 — E1 : code mal formé refusé localement, aucune requête', async () => {
    const net = stubNetwork({
      'GET api/cartographe/apprentis': jsonResponse(200, []),
      'GET api/cartographe/cartographies': jsonResponse(200, []),
    })
    openCartographe()

    for (const bad of ['ABC', 'K7TQZ2M9R0', 'K7TQZ2M9R1']) {
      await submitCode(bad)
      expect((await screen.findByRole('alert')).textContent).toBe(
        'Le code d’invitation comporte 10 caractères (lettres A-Z, chiffres 2-9).',
      )
    }
    expect(net.calls.some((call) => call.key.startsWith('POST'))).toBe(false)
  })

  it('UC-CAR-01-F08 — E2 : code inconnu, expiré ou déjà utilisé → message neutre du serveur, rien de rattaché', async () => {
    const net = stubNetwork({
      'GET api/cartographe/apprentis': jsonResponse(200, []),
      'GET api/cartographe/cartographies': jsonResponse(200, []),
      'POST api/cartographe/invitations/ZZZZZZZZZZ/accept': jsonResponse(404, {
        error: 'Invitation introuvable ou expirée',
      }),
    })
    openCartographe()

    await submitCode('ZZZZZZZZZZ')

    expect((await screen.findByRole('alert')).textContent).toBe('Invitation introuvable ou expirée')
    expect(screen.queryByText(/Invitation acceptée/)).toBeNull()
    expect(screen.getByLabelText('Code d’invitation').value).toBe('ZZZZZZZZZZ')
    expect(net.called('GET api/cartographe/apprentis')).toHaveLength(1) // pas de rechargement
  })

  it('UC-CAR-01-F09 — E3 : sans le rôle cartographe, l’espace est réservé et rien n’est chargé', async () => {
    const apprenant = { id: 3, email: 'zoe@example.org', displayName: 'Zoé', roles: ['apprenant'] }
    const net = stubNetwork({}, { user: apprenant })
    openCartographe('', apprenant)

    expect((await screen.findByTestId('cartographe-reserve')).textContent).toContain(
      'Cet espace de travail est réservé aux cartographes.',
    )
    expect(screen.queryByLabelText('Code d’invitation')).toBeNull()
    expect(screen.getByRole('link', { name: 'formation cartographe' }).getAttribute('href')).toBe(
      '#/cartographe/formation',
    )
    expect(net.calls.some((call) => call.key.includes('api/cartographe/'))).toBe(false)
  })

  it('UC-CAR-01-F10 — E3 : visiteur sans session → espace réservé + invitation à se connecter', async () => {
    stubNetwork({}, { user: null })
    openCartographe('', null)

    expect(await screen.findByTestId('cartographe-reserve')).toBeTruthy()
    await waitFor(() => expect(screen.getByText(/Vous n’êtes pas connecté/)).toBeTruthy())
    expect(screen.queryByTestId('cartographe-connecte')).toBeNull()
  })

  it('UC-CAR-01-F12 — E4 : jeton CSRF refusé → message serveur affiché tel quel, saisie conservée, rien de rechargé', async () => {
    const net = stubNetwork({
      'GET api/cartographe/apprentis': jsonResponse(200, []),
      'GET api/cartographe/cartographies': jsonResponse(200, []),
      'POST api/cartographe/invitations/K7TQZ2M9RC/accept': jsonResponse(403, {
        error: 'Jeton CSRF absent ou invalide',
      }),
    })
    openCartographe()

    await submitCode('K7TQZ2M9RC')

    expect((await screen.findByRole('alert')).textContent).toBe('Jeton CSRF absent ou invalide')
    expect(screen.queryByText(/Invitation acceptée/)).toBeNull()
    expect(screen.getByLabelText('Code d’invitation').value).toBe('K7TQZ2M9RC')
    expect(screen.getByRole('button', { name: 'Accepter l’invitation' }).disabled).toBe(false)
    expect(net.called('GET api/cartographe/apprentis')).toHaveLength(1)
  })

  it('UC-CAR-01-F13 — E5 : session perdue pendant l’acceptation (401) → message affiché, saisie conservée, rien de rechargé', async () => {
    const net = stubNetwork({
      'GET api/cartographe/apprentis': jsonResponse(200, []),
      'GET api/cartographe/cartographies': jsonResponse(200, []),
      'POST api/cartographe/invitations/K7TQZ2M9RC/accept': jsonResponse(401, {
        error: 'Authentification requise',
      }),
    })
    openCartographe()

    await submitCode('K7TQZ2M9RC')

    expect((await screen.findByRole('alert')).textContent).toBe('Authentification requise')
    expect(screen.getByLabelText('Code d’invitation').value).toBe('K7TQZ2M9RC')
    expect(net.called('GET api/cartographe/apprentis')).toHaveLength(1)
  })

  it('UC-CAR-01-F14 — étape 6 : acceptation réussie mais rechargement en échec → succès ET alerte de chargement', async () => {
    let accepted = false
    stubNetwork({
      'GET api/cartographe/apprentis': () =>
        accepted ? jsonResponse(500, { error: 'Erreur interne' }) : jsonResponse(200, []),
      'GET api/cartographe/cartographies': jsonResponse(200, []),
      'POST api/cartographe/invitations/K7TQZ2M9RC/accept': () => {
        accepted = true
        return jsonResponse(201, { apprenant: { id: 1, displayName: 'Maya' } })
      },
    })
    openCartographe()

    await submitCode('K7TQZ2M9RC')

    expect((await screen.findByText(/Invitation acceptée/)).textContent).toContain('rattaché à vous')
    const file = screen.getByRole('region', { name: 'Cartographies à relire' })
    expect((await within(file).findByRole('alert')).textContent).toBe('Erreur interne')
    expect(screen.getByLabelText('Code d’invitation').value).toBe('')
  })
})
