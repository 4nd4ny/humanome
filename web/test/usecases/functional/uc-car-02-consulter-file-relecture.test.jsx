// UC-CAR-02 — Consulter sa file de relecture : tests FONCTIONNELS (IHM).
// Fiche : docs/cas-utilisation/cartographe/UC-CAR-02-consulter-file-relecture.md
//
// L'application ENTIÈRE (<App/>) est ouverte sur #/cartographe puis sur
// #/cartographe/relecture/<id>, comme le ferait le cartographe. Le réseau est
// simulé (fetch global) avec les formes RÉELLES de l'API : file = liste nue de
// métadonnées, détail = objet plat (Links::findForCartographe + listes).
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import { resetApiClient } from '../../../src/api/client.js'
import {
  detailBody,
  jsonResponse,
  mergeDoc,
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

const APPRENTIS = [{ id: 1, displayName: 'Maya', linkedAt: '2026-07-01T09:00:00' }]

describe('UC-CAR-02 — la file de relecture', () => {
  it('UC-CAR-02-F08 — nominal : tableau de la file (type, date, état de garantie, lien Relire) + outils', async () => {
    stubNetwork({
      'GET api/cartographe/apprentis': jsonResponse(200, APPRENTIS),
      'GET api/cartographe/cartographies': jsonResponse(200, [
        queueEntry({ id: 14, titre: 'Mon parcours', type: 'merge', createdAt: '2026-07-04T08:00:00', garantie: { par: 'Camille', date: '2026-07-10T09:00:00' } }),
        queueEntry({ id: 12, titre: 'Journée du 5 janvier', createdAt: '2026-07-02T10:00:00' }),
      ]),
    })
    openCartographe()

    const table = await screen.findByTestId('cartographe-queue')
    const rows = within(table).getAllByRole('row').slice(1) // sans l'en-tête
    expect(rows).toHaveLength(2)

    expect(rows[0].textContent).toContain('Mon parcours')
    expect(rows[0].textContent).toContain('Parcours (merge)')
    expect(rows[0].textContent).toContain('04/07/2026')
    expect(rows[0].textContent).toContain('Garantie par Camille')
    expect(within(rows[0]).getByRole('link', { name: 'Relire' }).getAttribute('href')).toBe(
      '#/cartographe/relecture/14',
    )

    expect(rows[1].textContent).toContain('Maya')
    expect(rows[1].textContent).toContain('Journée')
    expect(rows[1].textContent).toContain('À relire')
    expect(within(rows[1]).getByRole('link', { name: 'Relire' }).getAttribute('href')).toBe(
      '#/cartographe/relecture/12',
    )

    // Deux cartographies ou plus : accès direct à la comparaison et à la consistance.
    expect(screen.getByRole('link', { name: /Comparer deux cartographies/ }).getAttribute('href')).toBe(
      '#/cartographe/comparer',
    )
    expect(screen.getByRole('link', { name: /Analyser la consistance/ })).toBeTruthy()
  })

  it('UC-CAR-02-F09 — A1 : file vide → message explicatif, pas de raccourcis outils', async () => {
    stubNetwork({
      'GET api/cartographe/apprentis': jsonResponse(200, APPRENTIS),
      'GET api/cartographe/cartographies': jsonResponse(200, []),
    })
    openCartographe()

    expect(await screen.findByText(/Aucune cartographie dans votre file/)).toBeTruthy()
    expect(screen.queryByTestId('cartographe-queue')).toBeNull()
    expect(screen.queryByRole('link', { name: /Comparer deux cartographies/ })).toBeNull()
  })
})

describe('UC-CAR-02 — ouvrir une relecture', () => {
  it('UC-CAR-02-F10 — nominal : en-tête, état non garanti, journée rendue en lecture seule', async () => {
    const net = stubNetwork({
      'GET api/cartographe/cartographies/12': jsonResponse(200, detailBody()),
    })
    openCartographe('relecture/12')

    expect(await screen.findByRole('heading', { name: 'Journée du 5 janvier' })).toBeTruthy()
    const meta = screen.getByTestId('relecture-meta')
    expect(meta.textContent).toContain('Apprenant : Maya')
    expect(meta.textContent).toContain('Type : Journée')
    expect(meta.textContent).toContain('Déposée le 02/07/2026')
    expect(screen.getByTestId('garantie-absente').textContent).toContain('Cartographie non garantie')
    expect((await screen.findByTestId('day-badge')).textContent).toBe('Journée du 05/01/2026')
    expect(screen.getByRole('link', { name: '← Retour à la file' }).getAttribute('href')).toBe('#/cartographe')
    // Lecture seule : la consultation ne déclenche aucune écriture.
    expect(net.calls.some((call) => !call.key.startsWith('GET'))).toBe(false)
  })

  it('UC-CAR-02-F11 — A2/A3 : parcours (merge) garanti sur une révision → mention figée + vue chronologique', async () => {
    stubNetwork({
      'GET api/cartographe/cartographies/14': jsonResponse(
        200,
        detailBody({
          id: 14,
          type: 'merge',
          titre: 'Mon parcours',
          document: mergeDoc(),
          revisions: [{ id: 4, note: 'Relu', author: { id: 9, displayName: 'Camille' }, createdAt: '2026-07-09T10:00:00' }],
          garantie: { par: 'Camille', date: '2026-07-10T09:00:00', revisionId: 4 },
        }),
      ),
    })
    const { container } = openCartographe('relecture/14')

    const badge = await screen.findByTestId('garantie-badge')
    expect(badge.textContent).toBe('Cartographie garantie par Camille le 10/07/2026 (révision 4 figée).')
    expect(screen.getByTestId('relecture-meta').textContent).toContain('Type : Parcours (merge)')
    await waitFor(() => expect(container.querySelector('.merge-view')).toBeTruthy())
    expect(screen.queryByTestId('day-badge')).toBeNull()
  })

  it('UC-CAR-02-F12 — E1/E2 : cartographie inaccessible (privée, non liée, inconnue) → message + retour à la file', async () => {
    stubNetwork({
      'GET api/cartographe/cartographies/77': jsonResponse(404, { error: 'Cartographie introuvable' }),
    })
    openCartographe('relecture/77')

    expect((await screen.findByRole('alert')).textContent).toBe('Cartographie introuvable')
    expect(screen.getByRole('link', { name: '← Retour à la file' })).toBeTruthy()
    expect(screen.queryByTestId('relecture-meta')).toBeNull()
  })
})

describe('UC-CAR-02 — erreurs d’accès à l’espace', () => {
  it('UC-CAR-02-F13 — E4 : copie statique (API injoignable) → explication, aucun chargement de file', async () => {
    const net = stubNetwork({}, { meThrows: true })
    openCartographe()

    expect((await screen.findByText(/Copie statique du site/)).textContent).toContain(
      'l’espace cartographe a besoin de l’API',
    )
    expect(net.calls.some((call) => call.key.includes('api/cartographe/'))).toBe(false)
  })

  it('UC-CAR-02-F14 — E5 : échec de la file → alerte ; les deux listes retombent à vide (état ACTUEL, cf. Limites)', async () => {
    stubNetwork({
      'GET api/cartographe/apprentis': jsonResponse(200, APPRENTIS),
      'GET api/cartographe/cartographies': jsonResponse(500, { error: 'Erreur interne' }),
    })
    openCartographe()

    expect((await screen.findByRole('alert')).textContent).toBe('Erreur interne')
    // Comportement actuel figé : Promise.all rejette -> « Mes apprentis » vide
    // alors que GET apprentis a réussi.
    expect(screen.getByText(/Aucun apprenant rattaché pour l’instant/)).toBeTruthy()
    expect(screen.getByText(/Aucune cartographie dans votre file/)).toBeTruthy()
  })

  it('UC-CAR-02-F15 — E6 : section inconnue → alerte et lien de retour', async () => {
    stubNetwork()
    openCartographe('inconnue')

    expect((await screen.findByRole('alert')).textContent).toContain(
      'Section inconnue de l’espace cartographe : « inconnue ».',
    )
    expect(screen.getByRole('link', { name: 'Retour à l’accueil de l’espace' }).getAttribute('href')).toBe(
      '#/cartographe',
    )
  })
})
