// UC-APP-07 — Inviter un cartographe : test FONCTIONNEL (IHM) figeant une
// anomalie.
// Fiche : docs/cas-utilisation/apprenant/UC-APP-07-inviter-cartographe.md
//
// Le cas est implémenté côté API uniquement (tests fonctionnels PHP). Ce test
// fige le comportement ACTUEL de l'IHM (fiche, « Anomalies constatées ») :
// alors que la formation et l'accueil cartographe annoncent que l'apprenant
// « génère un code d'invitation depuis son espace », aucune vue accessible à
// l'apprenant connecté ne propose de l'émettre ni de suivre ses codes.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import App from '../../../src/App.jsx'
import { resetApiClient } from '../../../src/api/client.js'
import * as fakeLib from '../../../src/test/fake-sunburst-lib.js'
import { APPS_USER, createFakeApi, jsonResponse, meRoute } from '../support/apps.js'

beforeEach(() => resetApiClient())

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  window.location.hash = ''
  resetApiClient()
})

describe('UC-APP-07 — pas d’interface apprenant pour émettre un code', () => {
  it.each([
    ['#/espace', 'Mes cartographies'],
    ['#/compte', 'Se déconnecter'],
  ])(
    'UC-APP-07-F08 — anomalie figée : %s ne propose ni émission ni suivi de code cartographe',
    async (hash, landmark) => {
      const api = createFakeApi([meRoute(APPS_USER), ['GET', 'keys', () => jsonResponse(200, [])]])
      vi.stubGlobal('fetch', api.fetch)
      window.location.hash = hash

      render(<App lib={fakeLib} fetchMeFn={async () => ({ user: APPS_USER })} />)
      // La vue de l'apprenant connecté est bien rendue…
      expect((await screen.findAllByText(landmark)).length).toBeGreaterThan(0)

      // … mais aucune commande (bouton ou lien) ne vise l'invitation d'un cartographe.
      const main = screen.getByRole('main')
      const controls = [
        ...within(main).queryAllByRole('button'),
        ...within(main).queryAllByRole('link'),
      ].map((el) => el.textContent)
      expect(controls.filter((label) => /invit|cartographe/i.test(label))).toEqual([])
      expect(api.requests.some((r) => r.path.startsWith('cartographe/invitations'))).toBe(false)
    },
  )
})
