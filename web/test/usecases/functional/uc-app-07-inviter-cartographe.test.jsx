// UC-APP-07 — Inviter un cartographe : test FONCTIONNEL (IHM) figeant une
// anomalie.
// Fiche : docs/cas-utilisation/apprenant/UC-APP-07-inviter-cartographe.md
//
// Le cas est implémenté côté API uniquement (tests fonctionnels PHP). Ce test
// fige le comportement ACTUEL de l'IHM (fiche, « Anomalies constatées ») :
// alors que la formation et l'accueil cartographe annoncent que l'apprenant
// « génère un code d'invitation depuis son espace », aucune des vues de
// l'apprenant connecté inspectées ici — tableau de bord #/espace (panneau
// « Mes cartographies » compris, une fois chargé), « Mes cohortes »
// #/espace/cohortes et espace compte #/compte — ne propose d'émettre ni de
// suivre un code.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
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
    // [hash, repère de la vue, repère de fin de chargement, requête prouvant la session connectée]
    ['#/espace', 'Mes cartographies', 'Exporter toutes mes données', 'training/progress'],
    ['#/espace/cohortes', 'Rejoindre la cohorte', 'Vous n’avez rejoint aucune cohorte pour l’instant.', 'cohortes'],
    ['#/compte', 'Se déconnecter', 'Se déconnecter', 'keys'],
  ])(
    'UC-APP-07-F08 — anomalie figée : %s ne propose ni émission ni suivi de code cartographe',
    async (hash, landmark, loaded, connectedProbe) => {
      const api = createFakeApi([
        meRoute(APPS_USER),
        ['GET', 'keys', () => jsonResponse(200, [])],
        ['GET', 'cohortes', () => jsonResponse(200, [])],
        ['GET', 'training/progress', () => jsonResponse(200, { chapitres: [] })],
      ])
      vi.stubGlobal('fetch', api.fetch)
      window.location.hash = hash

      render(<App lib={fakeLib} fetchMeFn={async () => ({ user: APPS_USER })} />)
      // La vue de l'apprenant connecté est bien rendue…
      expect((await screen.findAllByText(landmark)).length).toBeGreaterThan(0)
      // … entièrement chargée (panneaux paresseux compris)…
      expect((await screen.findAllByText(loaded)).length).toBeGreaterThan(0)
      // … et pour une session CONNECTÉE (requête réservée au compte).
      await waitFor(() => expect(api.requests.some((r) => r.path === connectedProbe)).toBe(true))
      expect(screen.queryByText(/Chargement/)).toBeNull()

      // Aucune commande (bouton ou lien) ne vise l'invitation d'un cartographe.
      const main = screen.getByRole('main')
      const controls = [
        ...within(main).queryAllByRole('button'),
        ...within(main).queryAllByRole('link'),
      ].map((el) => el.textContent)
      expect(controls.length).toBeGreaterThan(0)
      expect(controls.filter((label) => /invit|cartographe/i.test(label))).toEqual([])
      expect(api.requests.some((r) => r.path.startsWith('cartographe/'))).toBe(false)
    },
  )
})
