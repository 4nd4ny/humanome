// UC-EMP-01 — Consulter une cartographie partagée : tests FONCTIONNELS (IHM).
// Fiche : docs/cas-utilisation/employeur/UC-EMP-01-consulter-cartographie-partagee.md
//
// Le scénario est joué sur l'application ENTIÈRE (<App/>) comme le ferait
// l'employeur : il ouvre le lien #/partage/<jeton> dans un navigateur sans
// session, saisit le mot de passe reçu et lit la cartographie. Seul le réseau
// est simulé (fetch global) ; le module sunburst est remplacé par le faux
// module de test (contrat de web/src/lib/sunburst/).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import App from '../../../src/App.jsx'
import { resetApiClient } from '../../../src/api/client.js'
import * as fakeLib from '../../../src/test/fake-sunburst-lib.js'
import dayFixture from '../../../../schemas/fixtures/cartographie-jour-2026-01-05.json'
import mergeFixture from '../../../../schemas/fixtures/cartographie-merge-3-jours.json'

const TOKEN = '0123456789abcdef0123456789abcdef'

function jsonResponse(status, data) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => (name.toLowerCase() === 'content-type' ? 'application/json' : null) },
    json: async () => data,
  }
}

/** Réseau simulé : seule la route de partage répond, le reste est absent (repli local). */
function stubNetwork(shareAnswer) {
  const fetchMock = vi.fn(async (url) => {
    if (String(url) === `api/share/${TOKEN}`) return shareAnswer()
    return jsonResponse(404, { error: 'absent' })
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function openSharedLink() {
  window.location.hash = `#/partage/${TOKEN}`
  // Navigateur de l'employeur : aucune session.
  render(<App lib={fakeLib} fetchMeFn={async () => ({ user: null })} />)
}

async function submitPassword(value) {
  fireEvent.change(screen.getByLabelText('Mot de passe du lien'), { target: { value } })
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Consulter la cartographie' }))
  })
}

beforeEach(() => resetApiClient())

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  window.location.hash = ''
  resetApiClient()
})

describe('UC-EMP-01 — l’employeur consulte le lien reçu', () => {
  it('UC-EMP-01-F10 — nominal : bandeau, mot de passe, puis journée rendue en lecture seule', async () => {
    const fetchMock = stubNetwork(() =>
      jsonResponse(200, { titre: 'Journée du 5 janvier', type: 'jour', document: dayFixture, garantie: null }),
    )
    openSharedLink()

    // 1. Le lien ouvre l'écran de déverrouillage public, sans appel réseau.
    expect(screen.getByRole('heading', { name: 'Cartographie partagée' })).toBeDefined()
    expect(screen.getByRole('note').textContent).toContain('Cartographie partagée par son auteur')
    expect(fetchMock).not.toHaveBeenCalledWith(`api/share/${TOKEN}`, expect.anything())

    // 2-3. Saisie du mot de passe transmis par l'apprenant.
    await submitPassword('sesame-employeur')

    // 4. La cartographie s'affiche, sans formulaire ni mention de garantie.
    expect(await screen.findByRole('heading', { name: 'Journée du 5 janvier' })).toBeDefined()
    expect(await screen.findByText('Journée du 05/01/2026')).toBeDefined()
    expect(screen.queryByLabelText('Mot de passe du lien')).toBeNull()
    expect(screen.queryByTestId('share-garantie')).toBeNull()
    const [, init] = fetchMock.mock.calls.find(([url]) => url === `api/share/${TOKEN}`)
    expect(JSON.parse(init.body)).toEqual({ password: 'sesame-employeur' })
  })

  it('UC-EMP-01-F11 — A1 : cartographie fusionnée garantie → mention « garantie par » et vue chronologique', async () => {
    stubNetwork(() =>
      jsonResponse(200, {
        titre: 'Mon parcours',
        type: 'merge',
        document: mergeFixture,
        garantie: { par: 'Camille', date: '2026-07-10T09:00:00', revisionId: 4 },
      }),
    )
    openSharedLink()
    await submitPassword('sesame-employeur')

    expect(await screen.findByRole('heading', { name: 'Mon parcours' })).toBeDefined()
    const mention = await screen.findByTestId('share-garantie')
    expect(mention.textContent).toContain('garantie par Camille')
    expect(mention.textContent).toContain('2026-07-10')
  })

  it('UC-EMP-01-F12 — E0 : mot de passe trop court refusé localement, aucune requête', async () => {
    const fetchMock = stubNetwork(() => jsonResponse(200, {}))
    openSharedLink()
    await submitPassword('court')

    expect((await screen.findByRole('alert')).textContent).toContain('au moins 8 caractères')
    expect(fetchMock.mock.calls.some(([url]) => url === `api/share/${TOKEN}`)).toBe(false)
  })

  it('UC-EMP-01-F13 — E1 : mauvais mot de passe → message, le formulaire reste disponible pour réessayer', async () => {
    let calls = 0
    stubNetwork(() => {
      calls += 1
      return calls === 1
        ? jsonResponse(403, { error: 'Mot de passe incorrect' })
        : jsonResponse(200, { titre: 'Seconde chance', type: 'jour', document: dayFixture, garantie: null })
    })
    openSharedLink()

    await submitPassword('mauvais-mdp')
    expect((await screen.findByRole('alert')).textContent).toBe('Mot de passe incorrect.')
    expect(screen.getByLabelText('Mot de passe du lien')).toBeDefined()

    await submitPassword('sesame-employeur')
    expect(await screen.findByRole('heading', { name: 'Seconde chance' })).toBeDefined()
  })

  it('UC-EMP-01-F14 — E3 : lien inconnu, expiré ou révoqué → un seul message neutre', async () => {
    stubNetwork(() => jsonResponse(404, { error: 'Lien de partage introuvable ou expiré' }))
    openSharedLink()
    await submitPassword('sesame-employeur')

    expect((await screen.findByRole('alert')).textContent).toBe(
      'Ce lien de partage n’existe pas, a expiré ou a été révoqué par son auteur.',
    )
  })

  it('UC-EMP-01-F15 — E4 : trop de tentatives → invitation à patienter', async () => {
    stubNetwork(() => jsonResponse(429, { error: 'Trop de tentatives, réessayez plus tard' }))
    openSharedLink()
    await submitPassword('sesame-employeur')

    expect((await screen.findByRole('alert')).textContent).toContain('Patientez quelques minutes')
  })
})
