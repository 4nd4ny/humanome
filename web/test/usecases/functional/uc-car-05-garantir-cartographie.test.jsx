// UC-CAR-05 — Garantir une cartographie ou retirer sa garantie : tests FONCTIONNELS (IHM).
// Fiche : docs/cas-utilisation/cartographe/UC-CAR-05-garantir-cartographie.md
//
// L'application ENTIÈRE (<App/>) est ouverte sur #/cartographe/relecture/12 ;
// le cartographe (Camille) valide et garantit, choisit implicitement la
// version figée, annule, retire sa signature. Réseau simulé (fetch global) aux
// formes réelles de l'API : la pose répond l'état figé PLAT {par, date,
// revisionId}. La mention côté employeur est couverte par UC-EMP-01 (F11).
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, cleanup, fireEvent, screen, within } from '@testing-library/react'
import { resetApiClient } from '../../../src/api/client.js'
import {
  CSRF,
  detailBody,
  jsonResponse,
  noContent,
  openCartographe,
  stubNetwork,
} from '../support/car.js'

beforeEach(() => resetApiClient())

afterEach(() => {
  cleanup()
  window.location.hash = ''
  resetApiClient()
})

// Ordre RÉEL de l'API : id décroissant (Revisions::listForCartography).
const REVISIONS = [
  { id: 7, note: 'Seconde relecture', author: { id: 9, displayName: 'Camille' }, createdAt: '2026-07-08T10:00:00' },
  { id: 6, note: 'Première relecture', author: { id: 9, displayName: 'Camille' }, createdAt: '2026-07-05T10:00:00' },
]

async function openConfirmation() {
  fireEvent.click(await screen.findByRole('button', { name: 'Valider et garantir' }))
  return screen.findByTestId('garantie-confirm')
}

async function click(button) {
  await act(async () => {
    fireEvent.click(button)
  })
}

describe('UC-CAR-05 — le cartographe garantit', () => {
  it('UC-CAR-05-F12 — nominal : confirmation à son nom, document d’origine figé, signature, mention', async () => {
    const net = stubNetwork({
      'GET api/cartographe/cartographies/12': jsonResponse(200, detailBody()),
      'POST api/cartographies/12/garantie': jsonResponse(201, { par: 'Camille', date: '2026-07-10T09:00:00', revisionId: null }),
    })
    openCartographe('relecture/12')
    expect(await screen.findByTestId('garantie-absente')).toBeTruthy()

    // 1. Encadré de confirmation : en votre nom, cible explicite.
    const confirm = await openConfirmation()
    expect(confirm.textContent).toContain('en votre nom (Camille), avec signature horodatée')
    expect(confirm.textContent).toContain('Le document d’origine sera présenté comme garanti via le lien de partage.')
    expect(net.calls.some((call) => call.key.startsWith('POST'))).toBe(false)

    // 2-3. Signature.
    await click(within(confirm).getByRole('button', { name: 'Confirmer et garantir' }))
    const [post] = net.called('POST api/cartographies/12/garantie')
    expect(post.body).toEqual({})
    expect(post.headers['X-CSRF-Token']).toBe(CSRF)

    // 4. Mention figée, bouton de retrait.
    expect((await screen.findByTestId('garantie-badge')).textContent).toBe(
      'Cartographie garantie par Camille le 10/07/2026.',
    )
    expect(screen.queryByTestId('garantie-confirm')).toBeNull()
    expect(screen.getByRole('button', { name: 'Retirer ma garantie' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Valider et garantir' })).toBeNull()
  })

  it('UC-CAR-05-F13 — A1 : avec des révisions, la plus récente est figée ; en consultant une révision, c’est elle', async () => {
    const net = stubNetwork({
      'GET api/cartographe/cartographies/12': jsonResponse(200, detailBody({ revisions: REVISIONS })),
      'GET api/revisions/6': jsonResponse(200, { id: 6, cartographieId: 12, document: detailBody().document }),
      'POST api/cartographies/12/garantie': ({ body }) =>
        jsonResponse(201, { par: 'Camille', date: '2026-07-10T09:00:00', revisionId: body.revisionId ?? null }),
    })
    openCartographe('relecture/12')

    // Document d'origine affiché : la révision la plus récente (7) sera figée.
    let confirm = await openConfirmation()
    expect(confirm.textContent).toContain("La révision 7 sera figée : c'est elle que verra l'employeur via le lien de partage.")
    fireEvent.click(within(confirm).getByRole('button', { name: 'Annuler' }))

    // Révision 6 affichée : c'est elle qui sera figée.
    const historique = screen.getByTestId('revisions-list')
    const ligne6 = within(historique).getAllByRole('listitem').find((li) => li.textContent.includes('Première relecture'))
    await click(within(ligne6).getByRole('button', { name: 'Voir' }))
    expect((await screen.findByTestId('viewing-revision')).textContent).toContain('révision 6')
    confirm = await openConfirmation()
    expect(confirm.textContent).toContain('La révision 6 sera figée')
    await click(within(confirm).getByRole('button', { name: 'Confirmer et garantir' }))

    expect(net.called('POST api/cartographies/12/garantie')[0].body).toEqual({ revisionId: 6 })
    expect((await screen.findByTestId('garantie-badge')).textContent).toContain('(révision 6 figée)')
  })

  it('UC-CAR-05-F14 — A3 : « Annuler » referme l’encadré sans rien envoyer', async () => {
    const net = stubNetwork({ 'GET api/cartographe/cartographies/12': jsonResponse(200, detailBody()) })
    openCartographe('relecture/12')

    const confirm = await openConfirmation()
    fireEvent.click(within(confirm).getByRole('button', { name: 'Annuler' }))

    expect(screen.queryByTestId('garantie-confirm')).toBeNull()
    expect(screen.getByRole('button', { name: 'Valider et garantir' })).toBeTruthy()
    expect(screen.getByTestId('garantie-absente')).toBeTruthy()
    expect(net.calls.some((call) => call.key.startsWith('POST'))).toBe(false)
  })

  it('UC-CAR-05-F15 — A4 : « Retirer ma garantie » → DELETE, retour à l’état non garanti', async () => {
    const net = stubNetwork({
      'GET api/cartographe/cartographies/12': jsonResponse(
        200,
        detailBody({ garantie: { par: 'Camille', date: '2026-07-10T09:00:00', revisionId: null } }),
      ),
      'DELETE api/cartographies/12/garantie': noContent(),
    })
    openCartographe('relecture/12')

    await click(await screen.findByRole('button', { name: 'Retirer ma garantie' }))

    expect(net.called('DELETE api/cartographies/12/garantie')[0].headers['X-CSRF-Token']).toBe(CSRF)
    expect(await screen.findByTestId('garantie-absente')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Valider et garantir' })).toBeTruthy()
  })
})

describe('UC-CAR-05 — refus', () => {
  it('UC-CAR-05-F16 — E3 : déjà garantie par un autre cartographe (409) → message, rien de signé', async () => {
    stubNetwork({
      'GET api/cartographe/cartographies/12': jsonResponse(200, detailBody()),
      'POST api/cartographies/12/garantie': jsonResponse(409, { error: 'Cartographie déjà garantie par un autre cartographe' }),
    })
    openCartographe('relecture/12')

    const confirm = await openConfirmation()
    await click(within(confirm).getByRole('button', { name: 'Confirmer et garantir' }))

    expect((await screen.findByRole('alert')).textContent).toBe('Cartographie déjà garantie par un autre cartographe')
    expect(screen.getByTestId('garantie-confirm')).toBeTruthy()
    expect(screen.queryByTestId('garantie-badge')).toBeNull()
  })

  it('UC-CAR-05-F17 — E2 : cartographie devenue inaccessible (404) → message', async () => {
    stubNetwork({
      'GET api/cartographe/cartographies/12': jsonResponse(200, detailBody()),
      'POST api/cartographies/12/garantie': jsonResponse(404, { error: 'Cartographie introuvable' }),
    })
    openCartographe('relecture/12')

    const confirm = await openConfirmation()
    await click(within(confirm).getByRole('button', { name: 'Confirmer et garantir' }))

    expect((await screen.findByRole('alert')).textContent).toBe('Cartographie introuvable')
  })

  it('UC-CAR-05-F18 — E5 / AN5 : garantie signée par un AUTRE → « Retirer ma garantie » proposé quand même, refusé (404)', async () => {
    stubNetwork({
      'GET api/cartographe/cartographies/12': jsonResponse(
        200,
        detailBody({ garantie: { par: 'Rita', date: '2026-07-09T09:00:00', revisionId: null } }),
      ),
      'DELETE api/cartographies/12/garantie': jsonResponse(404, { error: 'Garantie introuvable' }),
    })
    openCartographe('relecture/12')

    expect((await screen.findByTestId('garantie-badge')).textContent).toContain('garantie par Rita')
    // Comportement ACTUEL figé : la vue ne sait pas qui a signé ; pas de
    // « Valider et garantir » non plus (il aurait répondu 409).
    expect(screen.queryByRole('button', { name: 'Valider et garantir' })).toBeNull()
    await click(screen.getByRole('button', { name: 'Retirer ma garantie' }))

    expect((await screen.findByRole('alert')).textContent).toBe('Garantie introuvable')
    expect(screen.getByTestId('garantie-badge').textContent).toContain('garantie par Rita')
  })

  it('UC-CAR-05-F19 — A4 / AN15 : cartographie repassée en privée → relecture en 404, aucun moyen de retirer sa garantie depuis le site', async () => {
    stubNetwork({
      'GET api/cartographe/cartographies/12': jsonResponse(404, { error: 'Cartographie introuvable' }),
    })
    openCartographe('relecture/12')

    expect((await screen.findByRole('alert')).textContent).toBe('Cartographie introuvable')
    // Comportement ACTUEL figé : ni section « Garantie » ni bouton de retrait.
    expect(screen.queryByRole('button', { name: 'Retirer ma garantie' })).toBeNull()
    expect(screen.queryByRole('region', { name: 'Garantie' })).toBeNull()
  })
})
